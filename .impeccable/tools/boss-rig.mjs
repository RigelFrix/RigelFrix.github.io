/* Retopology cleanup, texture optimization, and anatomical Mixamo-compatible auto-rigger
   for the Tripo Boss model (`c:/Users/Rigel/Downloads/boss.glb` -> `assets/models/boss.glb`).
   Run from the repository root:
     node .impeccable/tools/boss-rig.mjs [input.glb] [output.glb] */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const inputPath = process.argv[2] || "c:/Users/Rigel/Downloads/boss.glb";
const outputPath = process.argv[3] || "assets/models/boss.glb";

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const srcDoc = await io.read(inputPath);
const srcRoot = srcDoc.getRoot();
const srcPrim = srcRoot.listMeshes()[0].listPrimitives()[0];

const rawPos = new Float32Array(srcPrim.getAttribute("POSITION").getArray());
const rawUv = new Float32Array(srcPrim.getAttribute("TEXCOORD_0").getArray());
const rawTris = Array.from(srcPrim.getIndices().getArray());
const count = rawPos.length / 3;

/* 1. Weld split vertices by 3D position for topological neighborhood & seam-free normals */
const weldKey = new Map();
const weld = new Int32Array(count);
const sameSpot = new Map();
for (let i = 0; i < count; i += 1) {
  const key = `${Math.round(rawPos[i * 3] * 1e5)},${Math.round(rawPos[i * 3 + 1] * 1e5)},${Math.round(rawPos[i * 3 + 2] * 1e5)}`;
  if (!weldKey.has(key)) weldKey.set(key, weldKey.size);
  const w = weldKey.get(key);
  weld[i] = w;
  if (!sameSpot.has(w)) sameSpot.set(w, []);
  sameSpot.get(w).push(i);
}

/* Drop degenerate triangles */
const tris = [];
for (let t = 0; t < rawTris.length; t += 3) {
  const a = rawTris[t], b = rawTris[t + 1], c = rawTris[t + 2];
  if (weld[a] === weld[b] || weld[b] === weld[c] || weld[c] === weld[a]) continue;
  tris.push(a, b, c);
}

/* Build welded vertex adjacency for gentle Taubin-like surface fairing (retopology smoothing) */
const numWelded = weldKey.size;
const wPos = new Float64Array(numWelded * 3);
for (const [w, indices] of sameSpot.entries()) {
  const i0 = indices[0];
  wPos[w * 3] = rawPos[i0 * 3];
  wPos[w * 3 + 1] = rawPos[i0 * 3 + 1];
  wPos[w * 3 + 2] = rawPos[i0 * 3 + 2];
}
const adj = Array.from({ length: numWelded }, () => new Set());
for (let t = 0; t < tris.length; t += 3) {
  const wa = weld[tris[t]], wb = weld[tris[t + 1]], wc = weld[tris[t + 2]];
  adj[wa].add(wb); adj[wa].add(wc);
  adj[wb].add(wa); adj[wb].add(wc);
  adj[wc].add(wa); adj[wc].add(wb);
}

/* One Taubin fairing pass (lambda = +0.28, mu = -0.29) to regularize jagged Tripo micro-facets
   while preserving silhouette volume and UV alignment */
const taubinStep = (factor) => {
  const next = new Float64Array(wPos);
  for (let w = 0; w < numWelded; w += 1) {
    const nbrs = adj[w];
    if (nbrs.size < 3) continue;
    let sx = 0, sy = 0, sz = 0;
    for (const nb of nbrs) {
      sx += wPos[nb * 3];
      sy += wPos[nb * 3 + 1];
      sz += wPos[nb * 3 + 2];
    }
    const inv = 1 / nbrs.size;
    next[w * 3] += factor * (sx * inv - wPos[w * 3]);
    next[w * 3 + 1] += factor * (sy * inv - wPos[w * 3 + 1]);
    next[w * 3 + 2] += factor * (sz * inv - wPos[w * 3 + 2]);
  }
  wPos.set(next);
};
taubinStep(0.28);
taubinStep(-0.29);

/* Write regularized positions back to split vertices & compute seam-welded smooth normals */
for (let i = 0; i < count; i += 1) {
  const w = weld[i];
  rawPos[i * 3] = wPos[w * 3];
  rawPos[i * 3 + 1] = wPos[w * 3 + 1];
  rawPos[i * 3 + 2] = wPos[w * 3 + 2];
}

const wNrm = new Float64Array(numWelded * 3);
for (let t = 0; t < tris.length; t += 3) {
  const ia = tris[t], ib = tris[t + 1], ic = tris[t + 2];
  const ux = rawPos[ib * 3] - rawPos[ia * 3];
  const uy = rawPos[ib * 3 + 1] - rawPos[ia * 3 + 1];
  const uz = rawPos[ib * 3 + 2] - rawPos[ia * 3 + 2];
  const vx = rawPos[ic * 3] - rawPos[ia * 3];
  const vy = rawPos[ic * 3 + 1] - rawPos[ia * 3 + 1];
  const vz = rawPos[ic * 3 + 2] - rawPos[ia * 3 + 2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  for (const idx of [ia, ib, ic]) {
    const w = weld[idx];
    wNrm[w * 3] += nx;
    wNrm[w * 3 + 1] += ny;
    wNrm[w * 3 + 2] += nz;
  }
}

const smoothNrm = new Float32Array(count * 3);
for (let i = 0; i < count; i += 1) {
  const w = weld[i];
  const nx = wNrm[w * 3], ny = wNrm[w * 3 + 1], nz = wNrm[w * 3 + 2];
  const len = Math.hypot(nx, ny, nz) || 1;
  smoothNrm[i * 3] = nx / len;
  smoothNrm[i * 3 + 1] = ny / len;
  smoothNrm[i * 3 + 2] = nz / len;
}

/* 2. Anatomical Mixamo-named skeleton with identity rest rotations (like niko-rig.mjs):
      Index order is fixed so RightShoulder=10, RightArm=11, RightForeArm=12, RightHand=13. */
const BONES = [
  /* 0 */ ["Hips", null, [0, 0.48, 0.015]],
  /* 1 */ ["Spine", "Hips", [0, 0.56, -0.005]],
  /* 2 */ ["Spine1", "Spine", [0, 0.64, -0.005]],
  /* 3 */ ["Spine2", "Spine1", [0, 0.72, -0.005]],
  /* 4 */ ["Neck", "Spine2", [0, 0.78, -0.01]],
  /* 5 */ ["Head", "Neck", [0, 0.84, -0.015]],
  /* 6 */ ["LeftShoulder", "Spine2", [0.14, 0.72, -0.01]],
  /* 7 */ ["LeftArm", "LeftShoulder", [0.24, 0.72, -0.015]],
  /* 8 */ ["LeftForeArm", "LeftArm", [0.345, 0.54, -0.04]],
  /* 9 */ ["LeftHand", "LeftForeArm", [0.375, 0.38, 0.065]],
  /* 10 */ ["RightShoulder", "Spine2", [-0.14, 0.72, -0.01]],
  /* 11 */ ["RightArm", "RightShoulder", [-0.24, 0.72, -0.015]],
  /* 12 */ ["RightForeArm", "RightArm", [-0.345, 0.54, -0.04]],
  /* 13 */ ["RightHand", "RightForeArm", [-0.375, 0.38, 0.065]],
  /* 14 */ ["LeftUpLeg", "Hips", [0.115, 0.42, 0.01]],
  /* 15 */ ["LeftLeg", "LeftUpLeg", [0.168, 0.24, -0.025]],
  /* 16 */ ["LeftFoot", "LeftLeg", [0.193, 0.068, -0.025]],
  /* 17 */ ["LeftToeBase", "LeftFoot", [0.21, 0.018, 0.025]],
  /* 18 */ ["RightUpLeg", "Hips", [-0.115, 0.42, 0.01]],
  /* 19 */ ["RightLeg", "RightUpLeg", [-0.168, 0.24, -0.025]],
  /* 20 */ ["RightFoot", "RightLeg", [-0.193, 0.068, -0.025]],
  /* 21 */ ["RightToeBase", "RightFoot", [-0.21, 0.018, 0.025]],
];

const boneIndex = Object.fromEntries(BONES.map(([name], i) => [name, i]));

/* Topologically flood-fill the hanging arms & giant claws below the armpit (y < 0.58)
   so zero hand/thumb/forearm vertices ever bleed onto the thighs or hips, and vice versa. */
const isArmW = new Uint8Array(numWelded);
const armQueue = [];
for (let w = 0; w < numWelded; w += 1) {
  const wx = wPos[w * 3], wy = wPos[w * 3 + 1];
  if (Math.abs(wx) > 0.35 && wy > 0.15 && wy < 0.50) {
    isArmW[w] = 1;
    armQueue.push(w);
  }
}
while (armQueue.length > 0) {
  const u = armQueue.shift();
  for (const v of adj[u]) {
    if (!isArmW[v] && wPos[v * 3 + 1] < 0.58) {
      isArmW[v] = 1;
      armQueue.push(v);
    }
  }
}

/* Compute smooth 4-bone weights for every vertex */
const weightsFor = (i, x, y, z) => {
  const w = {};
  const add = (b, v) => {
    if (v > 1e-4) w[b] = (w[b] || 0) + v;
  };
  const ax = Math.abs(x);
  const side = x >= 0 ? "Left" : "Right";

  const addTorso = (k = 1) => {
    if (k <= 1e-4) return;
    const headW = smooth(0.77, 0.83, y) * (1 - smooth(0.14, 0.21, ax));
    const neckW = smooth(0.73, 0.78, y) * (1 - smooth(0.16, 0.22, ax)) * (1 - headW);
    const rem = 1 - headW - neckW;
    const s2 = smooth(0.65, 0.72, y) * rem;
    const s1 = smooth(0.57, 0.65, y) * (rem - s2);
    const sp = smooth(0.49, 0.57, y) * (rem - s2 - s1);
    const hp = Math.max(0, rem - s2 - s1 - sp);
    add("Head", headW * k);
    add("Neck", neckW * k);
    add("Spine2", s2 * k);
    add("Spine1", s1 * k);
    add("Spine", sp * k);
    add("Hips", hp * k);
  };

  /* Below the armpit (y < 0.56), use exact topological component membership; above y = 0.56, blend across shoulder */
  const inArmComp = isArmW[weld[i]] === 1;
  const shoulderBlend = smooth(0.175, 0.225, ax);
  const armBlend = y < 0.56 ? (inArmComp ? 1 : 0) : inArmComp ? 1 : shoulderBlend;

  if (armBlend > 0) {
    /* Along the hanging A-pose arm: shoulder (y=0.72..0.84) -> elbow (y=0.54) -> wrist (y=0.38) -> claw (y=0.14..0.38) */
    const sh = smooth(0.66, 0.78, y) * (1 - smooth(0.24, 0.31, ax));
    const upper = (1 - sh) * smooth(0.52, 0.60, y);
    const fore = (1 - sh - upper) * smooth(0.36, 0.44, y);
    const hand = Math.max(0, 1 - sh - upper - fore);
    add(`${side}Shoulder`, sh * armBlend);
    add(`${side}Arm`, upper * armBlend);
    add(`${side}ForeArm`, fore * armBlend);
    add(`${side}Hand`, hand * armBlend);
  }

  const bodyBlend = 1 - armBlend;
  if (bodyBlend > 0) {
    if (y < 0.47) {
      const legBlend = smooth(0.47, 0.40, y) * smooth(0.02, 0.07, ax);
      const shin = smooth(0.27, 0.21, y);
      const foot = smooth(0.09, 0.05, y);
      const toe = foot * smooth(0.01, 0.06, z);
      add(`${side}UpLeg`, legBlend * (1 - shin) * bodyBlend);
      add(`${side}Leg`, legBlend * shin * (1 - foot) * bodyBlend);
      add(`${side}Foot`, legBlend * shin * (foot - toe) * bodyBlend);
      add(`${side}ToeBase`, legBlend * shin * toe * bodyBlend);
      addTorso((1 - legBlend) * bodyBlend);
    } else {
      addTorso(bodyBlend);
    }
  }
  return w;
};

const jointsArr = new Uint8Array(count * 4);
const weightsArr = new Float32Array(count * 4);
for (let i = 0; i < count; i += 1) {
  const x = rawPos[i * 3], y = rawPos[i * 3 + 1], z = rawPos[i * 3 + 2];
  const entries = Object.entries(weightsFor(i, x, y, z))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const sum = entries.reduce((acc, [, v]) => acc + v, 0) || 1;
  entries.forEach(([bName, val], k) => {
    jointsArr[i * 4 + k] = boneIndex[bName];
    weightsArr[i * 4 + k] = val / sum;
  });
}

/* 3. Downscale baseColor texture to 1024x1024 JPEG (quality 86) for fast loading */
const srcMat = srcRoot.listMaterials()[0];
const srcTex = srcMat.getBaseColorTexture();
const optTexBytes = await sharp(Buffer.from(srcTex.getImage()))
  .resize(1024, 1024, { fit: "fill" })
  .jpeg({ quality: 86 })
  .toBuffer();

/* 4. Assemble clean, compact rigged GLB document */
const outDoc = new Document();
const outBuf = outDoc.createBuffer();
const outScene = outDoc.createScene("Scene");

const outTex = outDoc.createTexture("BossBaseColor")
  .setImage(new Uint8Array(optTexBytes))
  .setMimeType("image/jpeg");

const outMat = outDoc.createMaterial("BossMat")
  .setBaseColorFactor([1, 1, 1, 1])
  .setBaseColorTexture(outTex)
  .setMetallicFactor(0)
  .setRoughnessFactor(1);

const outPrim = outDoc.createPrimitive()
  .setMaterial(outMat)
  .setAttribute("POSITION", outDoc.createAccessor().setType("VEC3").setArray(rawPos).setBuffer(outBuf))
  .setAttribute("NORMAL", outDoc.createAccessor().setType("VEC3").setArray(smoothNrm).setBuffer(outBuf))
  .setAttribute("TEXCOORD_0", outDoc.createAccessor().setType("VEC2").setArray(rawUv).setBuffer(outBuf))
  .setAttribute("JOINTS_0", outDoc.createAccessor().setType("VEC4").setArray(jointsArr).setBuffer(outBuf))
  .setAttribute("WEIGHTS_0", outDoc.createAccessor().setType("VEC4").setArray(weightsArr).setBuffer(outBuf))
  .setIndices(outDoc.createAccessor().setType("SCALAR").setArray(new Uint32Array(tris)).setBuffer(outBuf));

const outMesh = outDoc.createMesh("BossMesh").addPrimitive(outPrim);
const outMeshNode = outDoc.createNode("Boss").setMesh(outMesh);

const boneNodes = {};
for (const [name, parent, p] of BONES) {
  const pp = parent ? BONES[boneIndex[parent]][2] : [0, 0, 0];
  boneNodes[name] = outDoc.createNode(name).setTranslation([
    +(p[0] - pp[0]).toFixed(5),
    +(p[1] - pp[1]).toFixed(5),
    +(p[2] - pp[2]).toFixed(5),
  ]);
  if (parent) boneNodes[parent].addChild(boneNodes[name]);
}
outScene.addChild(boneNodes.Hips);
outScene.addChild(outMeshNode);

const ibm = new Float32Array(BONES.length * 16);
BONES.forEach(([, , p], i) => {
  ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -p[0], -p[1], -p[2], 1], i * 16);
});

const outSkin = outDoc.createSkin("BossSkin")
  .setSkeleton(boneNodes.Hips)
  .setInverseBindMatrices(outDoc.createAccessor().setType("MAT4").setArray(ibm).setBuffer(outBuf));
for (const [name] of BONES) {
  outSkin.addJoint(boneNodes[name]);
}
outMeshNode.setSkin(outSkin);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
await new NodeIO().write(outputPath, outDoc);
const outStat = fs.statSync(outputPath);
console.log(`Wrote rigged ${outputPath}: ${(outStat.size / 1024).toFixed(1)} KB, ${count} verts, ${tris.length / 3} tris, ${BONES.length} bones`);
