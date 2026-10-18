import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import * as THREE from "../../vendor/three/three.module.min.js";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const boneWorld = (doc) => {
  const skin = doc.getRoot().listSkins()[0];
  const joints = skin.listJoints();
  const byName = Object.fromEntries(joints.map((n) => [n.getName(), n]));
  const parentOf = {};
  for (const node of joints) {
    const parent = node.getParentNode();
    if (parent && byName[parent.getName()]) parentOf[node.getName()] = parent.getName();
  }
  const world = {};
  const visit = (name) => {
    if (world[name]) return world[name];
    const node = byName[name];
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(node.getTranslation()),
      new THREE.Quaternion().fromArray(node.getRotation()),
      new THREE.Vector3().fromArray(node.getScale())
    );
    const parent = parentOf[name] ? visit(parentOf[name]) : new THREE.Matrix4();
    world[name] = new THREE.Matrix4().multiplyMatrices(parent, local);
    return world[name];
  };
  Object.keys(byName).forEach(visit);
  return world;
};

const origin = (m) => new THREE.Vector3().setFromMatrixPosition(m).toArray().map((n) => +n.toFixed(3));

for (const file of process.argv.slice(2)) {
  const doc = await io.read(file);
  const world = boneWorld(doc);
  console.log("\n==", file);
  for (const name of ["Hips", "Spine2", "Neck", "Head", "Hair", "Ahoge"]) {
    if (world[name]) console.log(name, origin(world[name]));
  }
  const names = doc.getRoot().listSkins()[0].listJoints().map((j) => j.getName());
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const jointsAttr = prim.getAttribute("JOINTS_0");
      const weights = prim.getAttribute("WEIGHTS_0");
      if (!jointsAttr) continue;
      const ja = jointsAttr.getArray();
      const wa = weights.getArray();
      const tally = new Map();
      for (let i = 0; i < ja.length; i += 4) {
        for (let k = 0; k < 4; k++) {
          const w = wa[i + k];
          if (w < 0.05) continue;
          tally.set(names[ja[i + k]], (tally.get(names[ja[i + k]]) || 0) + w);
        }
      }
      const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      console.log(prim.getMaterial()?.getName(), "influences", ranked.map(([n, w]) => `${n}:${w.toFixed(0)}`).join(" "));
    }
  }
}
