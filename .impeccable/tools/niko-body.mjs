/* Rebuilds the wearable body into a closed T-pose on the existing skeleton.
   The split body is only the scanned scraps (torn head, eye plates, floating hands, open thighs).
   This keeps the head, the painted face and the hands, throws away the eye plates and the shreds,
   and builds a Y-Bot-style torso, arms, legs and feet plus one clean eye surface per side.
   Run from .impeccable/tools after niko-parts.mjs:
     node niko-body.mjs [body-source.glb] [body.glb] */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import fs from "node:fs";

const input = process.argv[2] || "../../assets/niko/body-source.glb";
const output = process.argv[3] || "../../assets/niko/body.glb";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const mesh = root.listMeshes()[0];
const skin = root.listSkins()[0];
const jointNames = skin.listJoints().map((j) => j.getName());
const jointOf = Object.fromEntries(jointNames.map((name, i) => [name, i]));

const bounds = (prim) => {
  const pos = prim.getAttribute("POSITION").getArray();
  const min = [1e9, 1e9, 1e9];
  const max = [-1e9, -1e9, -1e9];
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a += 1) {
    min[a] = Math.min(min[a], pos[i + a]);
    max[a] = Math.max(max[a], pos[i + a]);
  }
  return { min, max };
};

const filterTris = (prim, test) => {
  const pos = prim.getAttribute("POSITION").getArray();
  const idx = prim.getIndices().getArray();
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const c = [0, 1, 2].map((a) => (pos[idx[t] * 3 + a] + pos[idx[t + 1] * 3 + a] + pos[idx[t + 2] * 3 + a]) / 3);
    if (test(c[0], c[1], c[2])) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  prim.getIndices().setArray(new Uint32Array(keep));
  return keep.length / 3;
};

let skinMat = null;
let faceZ = 0.16;
for (const prim of [...mesh.listPrimitives()]) {
  const name = prim.getMaterial().getName();
  const box = bounds(prim);
  if (name === "skin") {
    skinMat = prim.getMaterial();
    const hands = box.max[0] > 0.3;
    if (!hands) {
      const left = filterTris(prim, (x, y, z) => y > 0.25 && Math.abs(x) < 0.16 && z > 0.02);
      console.log("head skin", left, "tris");
    } else console.log("hands kept", prim.getIndices().getCount() / 3, "tris");
  } else if (name === "face") {
    const span = box.max[1] - box.min[1];
    if (span < 0.14) {
      mesh.removePrimitive(prim);
      prim.dispose();
      console.log("removed eye plates");
    } else {
      const pos = prim.getAttribute("POSITION").getArray();
      for (let i = 0; i < pos.length; i += 3) if (pos[i + 1] > 0.28 && pos[i + 1] < 0.35 && Math.abs(pos[i]) < 0.08) faceZ = Math.max(faceZ, pos[i + 2]);
      console.log("face kept", prim.getIndices().getCount() / 3, "tris", "front", faceZ.toFixed(3));
    }
  } else if (name === "eyeL" || name === "eyeR") {
    mesh.removePrimitive(prim);
    prim.dispose();
  }
}

const P = [];
const N = [];
const J = [];
const W = [];
const I = [];
const pack = (weights) => {
  const list = Object.entries(weights).filter(([, v]) => v > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const total = list.reduce((s, [, v]) => s + v, 0) || 1;
  const j = [0, 0, 0, 0];
  const w = [0, 0, 0, 0];
  list.forEach(([name, v], k) => {
    if (!(name in jointOf)) throw new Error(`no bone ${name}`);
    j[k] = jointOf[name];
    w[k] = v / total;
  });
  return [j, w];
};
const vert = (x, y, z, nx, ny, nz, weights) => {
  const [j, w] = pack(weights);
  P.push(x, y, z);
  const l = Math.hypot(nx, ny, nz) || 1;
  N.push(nx / l, ny / l, nz / l);
  J.push(...j);
  W.push(...w);
  return P.length / 3 - 1;
};

/* Closed tube. `rx` is the half-width across the body, `ry` the half-depth. */
const tube = (stations, sides = 10) => {
  const rings = stations.map((st, si) => {
    const prev = stations[Math.max(0, si - 1)].p;
    const next = stations[Math.min(stations.length - 1, si + 1)].p;
    let ax = next[0] - prev[0];
    let ay = next[1] - prev[1];
    let az = next[2] - prev[2];
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    /* rx runs across the body (X, or Y when the limb points along X). ry is the remaining depth. */
    let wx = Math.abs(ax) > 0.7 ? 0 : 1;
    let wy = Math.abs(ax) > 0.7 ? 1 : 0;
    let wz = 0;
    const wd = wx * ax + wy * ay + wz * az;
    wx -= ax * wd; wy -= ay * wd; wz -= az * wd;
    const wl = Math.hypot(wx, wy, wz) || 1;
    wx /= wl; wy /= wl; wz /= wl;
    const sx = wy * az - wz * ay;
    const sy = wz * ax - wx * az;
    const sz = wx * ay - wy * ax;
    const ring = [];
    for (let k = 0; k < sides; k += 1) {
      const a = (k / sides) * Math.PI * 2;
      const ox = Math.cos(a) * st.rx * wx + Math.sin(a) * st.ry * sx;
      const oy = Math.cos(a) * st.rx * wy + Math.sin(a) * st.ry * sy;
      const oz = Math.cos(a) * st.rx * wz + Math.sin(a) * st.ry * sz;
      ring.push(vert(st.p[0] + ox, st.p[1] + oy, st.p[2] + oz, ox, oy, oz, st.w));
    }
    return ring;
  });
  for (let s = 0; s < rings.length - 1; s += 1) {
    for (let k = 0; k < sides; k += 1) {
      const k1 = (k + 1) % sides;
      const a = rings[s][k];
      const b = rings[s][k1];
      const c = rings[s + 1][k1];
      const d = rings[s + 1][k];
      I.push(a, d, b, b, d, c);
    }
  }
  const cap = (ring, st, flip) => {
    const c = vert(...st.p, 0, flip ? -1 : 1, 0, st.w);
    for (let k = 0; k < sides; k += 1) {
      const a = ring[k];
      const b = ring[(k + 1) % sides];
      if (flip) I.push(c, b, a);
      else I.push(c, a, b);
    }
  };
  cap(rings[0], stations[0], true);
  cap(rings[rings.length - 1], stations[stations.length - 1], false);
};

const mirror = (stations) => stations.map((st) => ({
  ...st,
  p: [-st.p[0], st.p[1], st.p[2]],
  w: Object.fromEntries(Object.entries(st.w).map(([name, v]) => [name.replace("Left", "Right"), v])),
}));

tube([
  { p: [0, 0.235, 0.09], rx: 0.034, ry: 0.03, w: { Head: 0.25, Neck: 0.75 } },
  { p: [0, 0.19, 0.09], rx: 0.05, ry: 0.04, w: { Neck: 0.55, Spine2: 0.45 } },
  { p: [0, 0.162, 0.1], rx: 0.12, ry: 0.05, w: { Spine2: 1 } },
  { p: [0, 0.12, 0.098], rx: 0.086, ry: 0.05, w: { Spine2: 1 } },
  { p: [0, 0.05, 0.092], rx: 0.07, ry: 0.046, w: { Spine2: 0.25, Spine1: 0.75 } },
  { p: [0, -0.02, 0.09], rx: 0.064, ry: 0.044, w: { Spine: 1 } },
  { p: [0, -0.1, 0.09], rx: 0.09, ry: 0.055, w: { Hips: 1 } },
]);
const arm = [
  { p: [0.02, 0.168, 0.1], rx: 0.042, ry: 0.034, w: { LeftShoulder: 0.35, Spine2: 0.65 } },
  { p: [0.1, 0.174, 0.1], rx: 0.034, ry: 0.028, w: { LeftShoulder: 0.45, LeftArm: 0.55 } },
  { p: [0.16, 0.174, 0.1], rx: 0.028, ry: 0.024, w: { LeftArm: 1 } },
  { p: [0.25, 0.169, 0.1], rx: 0.024, ry: 0.02, w: { LeftArm: 0.3, LeftForeArm: 0.7 } },
  { p: [0.355, 0.165, 0.101], rx: 0.02, ry: 0.016, w: { LeftForeArm: 0.35, LeftHand: 0.65 } },
];
tube(arm);
tube(mirror(arm));
const leg = [
  { p: [0.055, -0.02, 0.09], rx: 0.05, ry: 0.046, w: { Hips: 0.7, LeftUpLeg: 0.3 } },
  { p: [0.075, -0.08, 0.09], rx: 0.046, ry: 0.044, w: { Hips: 0.25, LeftUpLeg: 0.75 } },
  { p: [0.086, -0.2, 0.09], rx: 0.04, ry: 0.04, w: { LeftUpLeg: 1 } },
  { p: [0.09, -0.32, 0.086], rx: 0.03, ry: 0.03, w: { LeftUpLeg: 0.2, LeftLeg: 0.8 } },
  { p: [0.09, -0.44, 0.078], rx: 0.022, ry: 0.02, w: { LeftLeg: 0.25, LeftFoot: 0.75 } },
  { p: [0.09, -0.488, 0.09], rx: 0.03, ry: 0.016, w: { LeftFoot: 0.7, LeftToeBase: 0.3 } },
  { p: [0.09, -0.492, 0.155], rx: 0.026, ry: 0.012, w: { LeftToeBase: 1 } },
];
tube(leg, 8);
tube(mirror(leg), 8);

const skinPrim = doc.createPrimitive().setMaterial(skinMat);
skinPrim.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(P)).setBuffer(buffer));
skinPrim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(N)).setBuffer(buffer));
skinPrim.setAttribute("JOINTS_0", doc.createAccessor().setType("VEC4").setArray(new Uint16Array(J)).setBuffer(buffer));
skinPrim.setAttribute("WEIGHTS_0", doc.createAccessor().setType("VEC4").setArray(new Float32Array(W)).setBuffer(buffer));
skinPrim.setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(I)).setBuffer(buffer));
mesh.addPrimitive(skinPrim);
console.log("mannequin", I.length / 3, "tris");

/* One curved eye per side. u = 0 is the nose side, v = 0 is the top, matching the eye atlas. */
const eyeGrid = (materialName, sx) => {
  const cols = 10;
  const rows = 8;
  const rx = 0.0347;
  const ry = 0.0347;
  const cx = sx * 0.0408;
  const cy = 0.3162;
  const p = [];
  const n = [];
  const uv = [];
  const idx = [];
  const at = (u, v) => {
    const x = cx + sx * (u - 0.5) * 2 * rx;
    const y = cy + (0.5 - v) * 2 * ry;
    const e = 1 - ((u - 0.5) / 0.5) ** 2 * 0.15 - ((v - 0.5) / 0.5) ** 2 * 0.15;
    const z = faceZ + 0.006 + Math.max(0, e) * 0.01;
    return [x, y, z];
  };
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= cols; i += 1) {
      const u = i / cols;
      const v = j / rows;
      const [x, y, z] = at(u, v);
      p.push(x, y, z);
      n.push(0, 0, 1);
      uv.push(u, v);
    }
  }
  for (let k = 0; k < p.length; k += 3) {
    const u = uv[(k / 3) * 2];
    const v = uv[(k / 3) * 2 + 1];
    const [x1, y1, z1] = at(Math.min(1, u + 0.05), v);
    const [x0, y0, z0] = at(Math.max(0, u - 0.05), v);
    const [x3, y3, z3] = at(u, Math.min(1, v + 0.05));
    const [x2, y2, z2] = at(u, Math.max(0, v - 0.05));
    const nx = (y0 - y3) * (z1 - z2) - (z0 - z3) * (y1 - y2);
    const ny = (z0 - z3) * (x1 - x2) - (x0 - x3) * (z1 - z2);
    const nz = (x0 - x3) * (y1 - y2) - (y0 - y3) * (x1 - x2);
    const l = Math.hypot(nx, ny, nz) || 1;
    const flip = nz < 0 ? -1 : 1;
    n[k] = nx / l * flip; n[k + 1] = ny / l * flip; n[k + 2] = nz / l * flip;
  }
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const u = (i + 0.5) / cols - 0.5;
      const v = (j + 0.5) / rows - 0.5;
      if ((u / 0.5) ** 2 + (v / 0.5) ** 2 > 1) continue;
      const a = j * (cols + 1) + i;
      idx.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1);
    }
  }
  const material = doc.createMaterial(materialName).setBaseColorFactor([0.95, 0.95, 0.95, 1]).setMetallicFactor(0).setRoughnessFactor(1).setDoubleSided(true);
  const prim = doc.createPrimitive().setMaterial(material);
  const count = p.length / 3;
  const joints = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    joints[i * 4] = jointOf.Head;
    weights[i * 4] = 1;
  }
  prim.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(p)).setBuffer(buffer));
  prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(n)).setBuffer(buffer));
  prim.setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(uv)).setBuffer(buffer));
  prim.setAttribute("JOINTS_0", doc.createAccessor().setType("VEC4").setArray(joints).setBuffer(buffer));
  prim.setAttribute("WEIGHTS_0", doc.createAccessor().setType("VEC4").setArray(weights).setBuffer(buffer));
  prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(idx)).setBuffer(buffer));
  mesh.addPrimitive(prim);
  console.log(materialName, idx.length / 3, "tris");
};
eyeGrid("eyeL", 1);
eyeGrid("eyeR", -1);

const used = new Set(mesh.listPrimitives().map((p) => p.getMaterial()));
for (const material of [...root.listMaterials()]) if (!used.has(material)) material.dispose();
await doc.transform(prune({ keepAttributes: true, keepLeaves: true }));
await io.write(output, doc);
console.log("wrote", output, fs.statSync(output).size, "bytes", "anims", root.listAnimations().map((a) => a.getName()).join(","));
