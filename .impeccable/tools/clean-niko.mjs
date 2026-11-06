import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, joinPrimitives } from "@gltf-transform/functions";
import * as THREE from "../../vendor/three/three.module.min.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const inputPath = path.join(root, "assets/niko/niko-final.glb");
const outputPath = path.join(root, "assets/niko/niko-final-clean.glb");

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inputPath);
const gltfRoot = doc.getRoot();

// 1. Remove backup mesh node and cs_grp
for (const node of gltfRoot.listNodes()) {
  const name = node.getName();
  if (name === "Niko_PreSingleCenter_Backup" || name === "cs_grp" || name.startsWith("cs_")) {
    node.dispose();
  }
}
for (const mesh of gltfRoot.listMeshes()) {
  if (mesh.getName() === "Niko_Symmetrical_Mesh") {
    mesh.dispose();
  }
}

// 2. In Niko_SingleCenter_Mesh, assign Niko_V5_BaseColor_Material to all primitives
const mainMesh = gltfRoot.listMeshes().find((m) => m.getName() === "Niko_SingleCenter_Mesh");
if (!mainMesh) throw new Error("Could not find Niko_SingleCenter_Mesh");

const mainMat = gltfRoot.listMaterials().find((m) => m.getName() === "Niko_V5_BaseColor_Material");
if (!mainMat) throw new Error("Could not find Niko_V5_BaseColor_Material");

for (const prim of mainMesh.listPrimitives()) {
  prim.setMaterial(mainMat);
}

// Join the two primitives (body and hands) into one primitive
const prims = mainMesh.listPrimitives();
const joinedPrim = joinPrimitives(prims);
prims.forEach((p) => {
  mainMesh.removePrimitive(p);
  p.dispose();
});
mainMesh.addPrimitive(joinedPrim);

// 3. Clean up the skin and bones
const skin = gltfRoot.listSkins()[0];
if (!skin) throw new Error("Could not find skin");

const allJoints = skin.listJoints();
// Identify deform Mixamo bones: those starting with mixamorig:
const mixamoJoints = allJoints.filter((j) => j.getName().startsWith("mixamorig:"));
console.log(`Found ${mixamoJoints.length} deform mixamorig joints out of ${allJoints.length} total joints`);

// Map old joint index -> new joint index (0..64)
const oldToNew = new Map();
allJoints.forEach((oldJoint, oldIdx) => {
  const newIdx = mixamoJoints.indexOf(oldJoint);
  if (newIdx >= 0) {
    oldToNew.set(oldIdx, newIdx);
  } else {
    oldToNew.set(oldIdx, 0);
  }
});

// Re-index JOINTS_0 on all primitives of mainMesh
for (const prim of mainMesh.listPrimitives()) {
  const jointsAttr = prim.getAttribute("JOINTS_0");
  if (jointsAttr) {
    const count = jointsAttr.getCount();
    for (let i = 0; i < count; i += 1) {
      const el = jointsAttr.getElement(i, []);
      const remapped = el.map((jIdx) => oldToNew.get(jIdx) ?? 0);
      jointsAttr.setElement(i, remapped);
    }
  }
}

// 4. Rotate +90 deg around Y so the model faces +X and arms are along Z (matching v6-clean and world.js)
const m90 = new THREE.Matrix4().makeRotationY(Math.PI / 2);
const mMinus90 = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
const q90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);

for (const prim of mainMesh.listPrimitives()) {
  const posAttr = prim.getAttribute("POSITION");
  const normAttr = prim.getAttribute("NORMAL");
  const v = new THREE.Vector3();
  for (let i = 0; i < posAttr.getCount(); i += 1) {
    v.fromArray(posAttr.getElement(i, []));
    v.applyMatrix4(m90);
    posAttr.setElement(i, [v.x, v.y, v.z]);
  }
  if (normAttr) {
    for (let i = 0; i < normAttr.getCount(); i += 1) {
      v.fromArray(normAttr.getElement(i, []));
      v.applyMatrix4(m90).normalize();
      normAttr.setElement(i, [v.x, v.y, v.z]);
    }
  }
}

// Rotate Hips (the root of the deform skeleton)
const hipsNode = mixamoJoints.find((j) => j.getName() === "mixamorig:Hips");
if (hipsNode) {
  const t = hipsNode.getTranslation();
  const v = new THREE.Vector3(t[0], t[1], t[2]).applyMatrix4(m90);
  hipsNode.setTranslation([v.x, v.y, v.z]);

  const r = hipsNode.getRotation();
  const q = new THREE.Quaternion(r[0], r[1], r[2], r[3]).premultiply(q90);
  hipsNode.setRotation([q.x, q.y, q.z, q.w]);
}

// Filter and rotate inverseBindMatrices
const oldIBM = skin.getInverseBindMatrices();
if (oldIBM) {
  const newIBMArray = new Float32Array(mixamoJoints.length * 16);
  const mat = new THREE.Matrix4();
  mixamoJoints.forEach((j, newIdx) => {
    const oldIdx = allJoints.indexOf(j);
    const m = oldIBM.getElement(oldIdx, []);
    mat.fromArray(m);
    // B'^-1 = B^-1 * M_-90
    mat.multiply(mMinus90);
    mat.toArray(newIBMArray, newIdx * 16);
  });
  const newIBMAccessor = doc.createAccessor("IBM").setType("MAT4").setArray(newIBMArray);
  skin.setInverseBindMatrices(newIBMAccessor);
}

// Strip mixamorig: prefix on deform joints
for (const j of mixamoJoints) {
  j.setName(j.getName().replace(/^mixamorig\d*:?/, ""));
}

// Set skin joints to only the 65 deform joints
skin.listJoints().forEach((j) => skin.removeJoint(j));
mixamoJoints.forEach((j) => skin.addJoint(j));

// Remove non-deform joints from scene (Ctrl_..., neutral_bone, etc.)
for (const node of gltfRoot.listNodes()) {
  const name = node.getName();
  if (name.startsWith("Ctrl_") || name.includes("_IK_") || name.startsWith("Toe") || name.startsWith("Foot_") || name.startsWith("FootHeel") || name === "Hips_Free_Helper" || name === "neutral_bone") {
    node.dispose();
  }
}

// Clean unreferenced elements
await doc.transform(prune(), dedup());

await io.write(outputPath, doc);
console.log(`Cleaned GLB written to ${outputPath}`);
