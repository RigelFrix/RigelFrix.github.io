/* Takes the part-split Niko (niko-split.mjs) and adds:
   - a "face" primitive (skin triangles on the face front, planar UVs for the painted face: blush, mouth)
   - "eyeL"/"eyeR" decal primitives (own 0..1 UVs, textures painted at runtime in world.js)
   - a "glow" primitive (the star on the lantern pouch)
   - hands with five 3-joint fingers
   - a standard Mixamo skeleton (unprefixed names, fingers and toes) + Hair/Ahoge/Lantern/Cape spring bones,
     and socket nodes (LeftHandSocket, RightHandSocket, HeadSocket, BackSocket) for attaching props
   - every clip in ../anim/clips.json (dumped by niko-anim.mjs), retargeted by bone name
   Model space: 1 unit tall, feet at y -0.5, facing +z, T-pose with identity rest rotations. Output: assets/niko.glb.
   Then node niko-parts.mjs writes the wearable pieces assets/niko/{body,hair,coat,clothes,shoes}.glb. */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, prune } from "@gltf-transform/functions";
import { KHRMeshQuantization } from "@gltf-transform/extensions";
import fs from "node:fs";
import * as THREE from "../../vendor/three/three.module.min.js";

const input = process.argv[2] || "../review/glb/niko-split.glb";
const output = process.argv[3] || "../../assets/niko.glb";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const mesh = root.listMeshes()[0];
const meshNode = root.listNodes().find((n) => n.getMesh() === mesh);
meshNode.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
const prims = () => Object.fromEntries(mesh.listPrimitives().map((p) => [p.getMaterial().getName(), p]));

export const FACE = { cx: 0, cy: 0.3, size: 0.26 };
const inFace = (x, y, z, nz) => y > 0.215 && y < 0.38 && z > 0.1 && Math.abs(x) < 0.15 && nz > 0.15;
const inGlow = (x, y, z) => x > 0.02 && x < 0.135 && y > -0.18 && y < -0.04 && z > 0.17;

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* Move the triangles that pass `test` out of the source primitives into a new primitive with `material` */
const carve = (sources, material, test, extra) => {
  const p = [];
  const n = [];
  for (const prim of [sources].flat()) {
    const pos = prim.getAttribute("POSITION").getArray();
    const nrm = prim.getAttribute("NORMAL").getArray();
    const idx = prim.getIndices().getArray();
    const keep = [];
    for (let t = 0; t < idx.length; t += 3) {
      const c = [0, 1, 2].map((a) => (pos[idx[t] * 3 + a] + pos[idx[t + 1] * 3 + a] + pos[idx[t + 2] * 3 + a]) / 3);
      const cn = [0, 1, 2].map((a) => (nrm[idx[t] * 3 + a] + nrm[idx[t + 1] * 3 + a] + nrm[idx[t + 2] * 3 + a]) / 3);
      if (!test(c[0], c[1], c[2], cn[2], prim)) {
        keep.push(idx[t], idx[t + 1], idx[t + 2]);
        continue;
      }
      for (let k = 0; k < 3; k += 1) {
        for (let a = 0; a < 3; a += 1) { p.push(pos[idx[t + k] * 3 + a]); n.push(nrm[idx[t + k] * 3 + a]); }
      }
    }
    prim.getIndices().setArray(new Uint32Array(keep));
  }
  const P = new Float32Array(p);
  const N = new Float32Array(n);
  const out = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(P).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(N).setBuffer(buffer))
    .setMaterial(material);
  if (extra) extra(out, P, N);
  mesh.addPrimitive(out);
  console.log("carved", material.getName(), P.length / 9, "tris");
  return out;
};

const part = prims();

/* Tripo's eye sockets came out hair-colored and sit well behind the skin around them; they join the face */
/* Least-squares fit of the face front, z = a + b x^2 + c y + d y^2 + e x^2 y, to the skin there */
const faceZ = (() => {
  const pos = part.skin.getAttribute("POSITION").getArray();
  const nrm = part.skin.getAttribute("NORMAL").getArray();
  const terms = (x, y) => [1, x * x, y, y * y, x * x * y];
  const A = Array.from({ length: 5 }, () => new Array(5).fill(0));
  const B = new Array(5).fill(0);
  for (let i = 0; i < pos.length; i += 3) {
    const [x, y, z] = [pos[i], pos[i + 1], pos[i + 2]];
    if (!(z > 0.1 && y > 0.215 && y < 0.37 && Math.abs(x) < 0.13 && nrm[i + 2] > 0.4)) continue;
    const t = terms(x, y);
    for (let r = 0; r < 5; r += 1) { B[r] += t[r] * z; for (let c = 0; c < 5; c += 1) A[r][c] += t[r] * t[c]; }
  }
  for (let r = 0; r < 5; r += 1) A[r][r] += 1e-9;
  for (let r = 0; r < 5; r += 1) {
    for (let k = r + 1; k < 5; k += 1) {
      const f = A[k][r] / A[r][r];
      for (let c = r; c < 5; c += 1) A[k][c] -= f * A[r][c];
      B[k] -= f * B[r];
    }
  }
  const coef = new Array(5).fill(0);
  for (let r = 4; r >= 0; r -= 1) {
    let s = B[r];
    for (let c = r + 1; c < 5; c += 1) s -= A[r][c] * coef[c];
    coef[r] = s / A[r][r];
  }
  return (x, y) => terms(x, y).reduce((s, t, k) => s + t * coef[k], 0);
})();
const inEye = (x, y, z, nz) => y > 0.255 && y < 0.34 && Math.abs(x) < 0.12 && z > 0.08 && nz > 0.1 && z < faceZ(x, y) + 0.01;

const faceMat = doc.createMaterial("face").setBaseColorFactor(part.skin.getMaterial().getBaseColorFactor()).setMetallicFactor(0).setRoughnessFactor(1);
carve([part.skin, part.hair], faceMat, (x, y, z, nz, prim) => (prim === part.skin ? inFace(x, y, z, nz) : inEye(x, y, z, nz)), (prim, p, n) => {
  const uv = new Float32Array((p.length / 3) * 2);
  for (let i = 0; i < p.length / 3; i += 1) {
    p[i * 3] += n[i * 3] * 0.0015;
    p[i * 3 + 1] += n[i * 3 + 1] * 0.0015;
    p[i * 3 + 2] += n[i * 3 + 2] * 0.0015;
    uv[i * 2] = 0.5 + (p[i * 3] - FACE.cx) / FACE.size;
    uv[i * 2 + 1] = 0.5 - (p[i * 3 + 1] - FACE.cy) / FACE.size;
  }
  prim.setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(uv).setBuffer(buffer));
});
/* The bang shell hangs down over the eyes (Tripo painted the eyes onto it); cut it back inside two eye-shaped
   windows so the face behind shows, keeping strands above and between the eyes */
const EYE = { x: 0.058, y: 0.31, rx: 0.04, ry: 0.03 };
let surfaceZ;
{
  let cut = 0;
  for (const prim of [part.hair, part.navy, part.lining, part.cream, part.dark, part.gold, part.leather]) {
    const pos = prim.getAttribute("POSITION").getArray();
    const nrm = prim.getAttribute("NORMAL").getArray();
    const idx = prim.getIndices().getArray();
    const keep = [];
    for (let t = 0; t < idx.length; t += 3) {
      const c = [0, 1, 2].map((a) => (pos[idx[t] * 3 + a] + pos[idx[t + 1] * 3 + a] + pos[idx[t + 2] * 3 + a]) / 3);
      const nz = (nrm[idx[t] * 3 + 2] + nrm[idx[t + 1] * 3 + 2] + nrm[idx[t + 2] * 3 + 2]) / 3;
      const e = ((Math.abs(c[0]) - EYE.x) / EYE.rx) ** 2 + ((c[1] - EYE.y) / EYE.ry) ** 2;
      const dz = c[2] - faceZ(c[0], c[1]);
      if (e < 1 && nz > -0.2 && dz > -0.05 && dz < 0.13) { cut += 1; continue; }
      keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    prim.getIndices().setArray(new Uint32Array(keep));
  }
  console.log("bang window cut", cut, "tris");

  /* Eye plates on the fitted face surface, a hair behind the skin, so the windows have no gaps */
  const P = [];
  const N = [];
  const UV = [];
  const I = [];
  const cols = 14;
  const rows = 9;
  const near = [];
  for (const prim of mesh.listPrimitives()) {
    if (prim.getMaterial() !== faceMat && prim !== part.skin) continue;
    const pp = prim.getAttribute("POSITION").getArray();
    for (let i = 0; i < pp.length; i += 3) if (pp[i + 2] > 0.06 && pp[i + 1] > 0.24 && pp[i + 1] < 0.37) near.push([pp[i], pp[i + 1], pp[i + 2]]);
  }
  surfaceZ = (x, y) => {
    let best = -Infinity;
    for (const [px, py, pz] of near) if (Math.hypot(px - x, py - y) < 0.014 && pz > best) best = pz;
    return Math.min(best, faceZ(x, y));
  };
  for (const s of [1, -1]) {
    const base = P.length / 3;
    for (let j = 0; j <= rows; j += 1) {
      for (let i = 0; i <= cols; i += 1) {
        const x = s * (EYE.x + (i / cols - 0.5) * 2.2 * EYE.rx);
        const y = EYE.y + (j / rows - 0.5) * 3 * EYE.ry;
        const sz = surfaceZ(x, y);
        const z = Number.isFinite(sz) ? sz - 0.003 : Math.abs(x) < 0.07 ? faceZ(x, y) - 0.006 : NaN;
        const dx = (faceZ(x + 0.001, y) - faceZ(x - 0.001, y)) / 0.002;
        const dy = (faceZ(x, y + 0.001) - faceZ(x, y - 0.001)) / 0.002;
        const len = Math.hypot(dx, dy, 1);
        P.push(x, y, z);
        N.push(-dx / len, -dy / len, 1 / len);
        UV.push(0.5 + (x - FACE.cx) / FACE.size, 0.5 - (y - FACE.cy) / FACE.size);
      }
    }
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const u = ((i + 0.5) / cols - 0.5) * 2;
        const v = ((j + 0.5) / rows - 0.5) * 2;
        if (u * u + v * v > 1.6) continue;
        const a = base + j * (cols + 1) + i;
        if ([a, a + 1, a + cols + 1, a + cols + 2].some((k) => !Number.isFinite(P[k * 3 + 2]))) continue;
        const b = a + 1;
        const c = a + cols + 2;
        const d = a + cols + 1;
        if (s > 0) I.push(a, b, c, a, c, d);
        else I.push(a, c, b, a, d, c);
      }
    }
  }
  for (let k = 0; k < P.length; k += 3) if (!Number.isFinite(P[k + 2])) P[k + 2] = faceZ(P[k], P[k + 1]) - 0.02;
  mesh.addPrimitive(doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(P)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(N)).setBuffer(buffer))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(UV)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(I)).setBuffer(buffer))
    .setMaterial(faceMat));
}

const glowMat = doc.createMaterial("glow").setBaseColorFactor([1, 0.86, 0.45, 1]).setEmissiveFactor([1, 0.8, 0.35]).setMetallicFactor(0);
carve(part.gold, glowMat, (x, y, z) => inGlow(x, y, z));

/* Face normals lean toward one forward direction so the painted face lights as a single plane (no dark sockets) */
const f = new THREE.Vector3(0, 0.25, 1).normalize();
for (const prim of mesh.listPrimitives()) {
  if (prim.getMaterial() !== faceMat) continue;
  const n = prim.getAttribute("NORMAL").getArray();
  const v = new THREE.Vector3();
  for (let i = 0; i < n.length; i += 3) {
    v.set(n[i], n[i + 1], n[i + 2]).lerp(f, 0.85).normalize();
    n[i] = v.x; n[i + 1] = v.y; n[i + 2] = v.z;
  }
}

await doc.transform(weld());

/* Primitives built below carry their own skin weights: per vertex, { boneName: weight } */
const customWeights = new Map();
const v3 = (a) => new THREE.Vector3(...a);
const addTris = (tris, material) => {
  const P = new Float32Array(tris.length * 9);
  const N = new Float32Array(tris.length * 9);
  const W = [];
  tris.forEach(({ pts, ws }, i) => {
    const n = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[2], pts[0])).normalize();
    pts.forEach((p, k) => { P.set([p.x, p.y, p.z], i * 9 + k * 3); N.set([n.x, n.y, n.z], i * 9 + k * 3); });
    W.push(...ws);
  });
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(P).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(N).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(tris.length * 3).map((_, i) => i)).setBuffer(buffer))
    .setMaterial(material);
  mesh.addPrimitive(prim);
  customWeights.set(prim, W);
  return prim;
};
/* Flat-shaded tube through stations [center, halfWidth, halfThickness, weights], capped at both ends. Thickness runs
   along `up`; every triangle is wound to face away from the tube's axis, so mirrored copies stay correct. */
const tube = (out, stations, up, sides) => {
  const rings = stations.map(([c, w, h], i) => {
    const a = v3(stations[Math.max(0, i - 1)][0]);
    const b = v3(stations[Math.min(stations.length - 1, i + 1)][0]);
    const d = b.sub(a).normalize();
    const across = new THREE.Vector3().crossVectors(d, v3(up)).normalize();
    const lift = new THREE.Vector3().crossVectors(across, d).normalize();
    return Array.from({ length: sides }, (_, k) => {
      const ang = (k / sides) * Math.PI * 2 + Math.PI / sides;
      return v3(c).addScaledVector(across, w * Math.cos(ang)).addScaledVector(lift, h * Math.sin(ang));
    });
  });
  const tri = (pts, ws, inside) => {
    const n = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[2], pts[0]));
    const mid = pts[0].clone().add(pts[1]).add(pts[2]).divideScalar(3);
    if (n.dot(mid.sub(inside)) < 0) { pts = [pts[0], pts[2], pts[1]]; ws = [ws[0], ws[2], ws[1]]; }
    out.push({ pts, ws });
  };
  const last = stations.length - 1;
  for (let i = 0; i < last; i += 1) {
    const inside = v3(stations[i][0]).add(v3(stations[i + 1][0])).multiplyScalar(0.5);
    const [wa, wb] = [stations[i][3], stations[i + 1][3]];
    for (let k = 0; k < sides; k += 1) {
      const k1 = (k + 1) % sides;
      tri([rings[i][k], rings[i][k1], rings[i + 1][k1]], [wa, wa, wb], inside);
      tri([rings[i][k], rings[i + 1][k1], rings[i + 1][k]], [wa, wb, wb], inside);
    }
  }
  const start = v3(stations[0][0]);
  const end = v3(stations[last][0]);
  const tip = end.clone().addScaledVector(end.clone().sub(v3(stations[last - 1][0])).normalize(), stations[last][2] * 0.8);
  const back = start.clone().addScaledVector(v3(stations[1][0]).sub(start).normalize(), -stations[0][2] * 0.4);
  for (let k = 0; k < sides; k += 1) {
    const k1 = (k + 1) % sides;
    tri([back, rings[0][k1], rings[0][k]], Array(3).fill(stations[0][3]), v3(stations[1][0]));
    tri([tip, rings[last][k], rings[last][k1]], Array(3).fill(stations[last][3]), v3(stations[last - 1][0]));
  }
};

/* Hands: Tripo's came out as thin paddles. Past the cuff they become a palm plus five fingers of three segments
   (Mixamo layout, palm down in the T-pose), each segment weighted to its own bone so finger curls fold them.
   Rest directions follow Mixamo's (fingers along +x, thumb out and down), or curls land at the wrong angle.
   Left-hand coordinates; the right hand mirrors x. */
const HAND = {
  wrist: [0.364, 0.165, 0.101],
  fingers: {
    Thumb: { knuckle: [0.382, 0.159, 0.114], dir: [0.77, -0.45, 0.45], lengths: [0.014, 0.012, 0.01], r: 0.0064 },
    Index: { knuckle: [0.407, 0.165, 0.117], dir: [1, -0.01, 0.02], lengths: [0.016, 0.011, 0.009], r: 0.0053 },
    Middle: { knuckle: [0.409, 0.165, 0.106], dir: [1, -0.01, 0], lengths: [0.018, 0.012, 0.01], r: 0.0054 },
    Ring: { knuckle: [0.407, 0.165, 0.095], dir: [1, -0.01, -0.01], lengths: [0.017, 0.011, 0.009], r: 0.0052 },
    Pinky: { knuckle: [0.403, 0.164, 0.085], dir: [1, -0.01, -0.03], lengths: [0.013, 0.009, 0.008], r: 0.0047 },
  },
};
const fingerJoints = (f) => {
  const d = v3(f.dir).normalize();
  const j = [v3(f.knuckle)];
  for (const l of f.lengths) j.push(j[j.length - 1].clone().addScaledVector(d, l));
  return j;
};
const SIDES = [["Left", 1], ["Right", -1]];
{
  const skinPrim = prims().skin;
  const pos = skinPrim.getAttribute("POSITION").getArray();
  const idx = skinPrim.getIndices().getArray();
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const cx = (pos[idx[t] * 3] + pos[idx[t + 1] * 3] + pos[idx[t + 2] * 3]) / 3;
    const cy = (pos[idx[t] * 3 + 1] + pos[idx[t + 1] * 3 + 1] + pos[idx[t + 2] * 3 + 1]) / 3;
    if (Math.abs(cx) > 0.356 && cy > 0.1) continue;
    keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  skinPrim.getIndices().setArray(new Uint32Array(keep));

  const tris = [];
  for (const [side, sx] of SIDES) {
    const m = (p) => [p[0] * sx, p[1], p[2]];
    const H = `${side}Hand`;
    tube(tris, [
      [m(HAND.wrist), 0.017, 0.011, { [`${side}ForeArm`]: 0.5, [H]: 0.5 }],
      [m([0.375, 0.165, 0.101]), 0.02, 0.012, { [H]: 1 }],
      [m([0.392, 0.165, 0.101]), 0.022, 0.0125, { [H]: 1 }],
      [m([0.409, 0.164, 0.101]), 0.021, 0.011, { [H]: 1 }],
    ], [0, 1, 0], 8);
    for (const [name, f] of Object.entries(HAND.fingers)) {
      const j = fingerJoints(f);
      const d = v3(f.dir).normalize();
      const b = (k) => `${H}${name}${k}`;
      const st = (p, scale, w) => [m(p.toArray()), f.r * scale, f.r * 0.95 * scale, w];
      const along = (k, t) => j[k].clone().lerp(j[k + 1], t);
      tube(tris, [
        st(j[0].clone().addScaledVector(d, -0.007), 1, { [H]: 1 }),
        st(j[0], 1, { [H]: 0.5, [b(1)]: 0.5 }),
        st(along(0, 0.5), 1, { [b(1)]: 1 }),
        st(j[1], 0.95, { [b(1)]: 0.5, [b(2)]: 0.5 }),
        st(along(1, 0.5), 0.92, { [b(2)]: 1 }),
        st(j[2], 0.88, { [b(2)]: 0.5, [b(3)]: 0.5 }),
        st(along(2, 0.6), 0.84, { [b(3)]: 1 }),
        st(j[3], 0.78, { [b(3)]: 1 }),
      ], [0, 1, 0], 6);
    }
  }
  addTris(tris, skinPrim.getMaterial());
  console.log("hands", tris.length, "tris");
}

/* Eyes: one small curved decal per eye on the face surface, in front of the skin, with its own 0..1 UVs (v down) and the
   skin's own normals (so they turn away with the cheek). The numbers come from niko-eyes.py, which cuts the eye layers
   out of the reference so a tile maps 1:1 onto these UVs. */
const EYE_DECAL = { x: 0.0408, y: 0.3162, hw: 0.0347, hh: 0.0347, cells: 14, lift: 0.003 };
/* Front-most face/skin surface at (x, y), cast along -z through the actual triangles, so the decal sits just in front
   of Tripo's skin bumps instead of inside them */
const skinTris = [];
for (const prim of mesh.listPrimitives()) {
  if (!["face", "skin"].includes(prim.getMaterial().getName())) continue;
  const pp = prim.getAttribute("POSITION").getArray();
  const ii = prim.getIndices().getArray();
  for (let t = 0; t < ii.length; t += 3) {
    const v = [0, 1, 2].map((k) => [pp[ii[t + k] * 3], pp[ii[t + k] * 3 + 1], pp[ii[t + k] * 3 + 2]]);
    if (v.every((p) => p[2] < 0.05 || p[1] < 0.22 || p[1] > 0.38)) continue;
    skinTris.push(v);
  }
}
const frontZ = (x, y) => {
  let best = faceZ(x, y);
  for (const [a, b, c] of skinTris) {
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
    const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < 0 || l2 < 0 || l3 < 0) continue;
    const z = l1 * a[2] + l2 * b[2] + l3 * c[2];
    if (z > best && z < faceZ(x, y) + 0.03) best = z;
  }
  return best;
};
for (const [side, sx] of [["eyeL", 1], ["eyeR", -1]]) {
  const material = doc.createMaterial(side).setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1).setAlphaMode("BLEND");
  const { cells: n, hw, hh } = EYE_DECAL;
  const P = [];
  const N = [];
  const UV = [];
  const I = [];
  for (let j = 0; j <= n; j += 1) {
    for (let i = 0; i <= n; i += 1) {
      const x = sx * EYE_DECAL.x + (i / n - 0.5) * 2 * hw;
      const y = EYE_DECAL.y + (0.5 - j / n) * 2 * hh;
      P.push(x, y, frontZ(x, y) + EYE_DECAL.lift);
      const e = 0.018;
      const nrm = new THREE.Vector3(frontZ(x - e, y) - frontZ(x + e, y), frontZ(x, y - e) - frontZ(x, y + e), 2 * e).normalize();
      N.push(nrm.x, nrm.y, nrm.z);
      UV.push(i / n, j / n);
    }
  }
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const a = j * (n + 1) + i;
      I.push(a, a + n + 1, a + n + 2, a, a + n + 2, a + 1);
    }
  }
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(P)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(N)).setBuffer(buffer))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(UV)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(I)).setBuffer(buffer))
    .setMaterial(material);
  mesh.addPrimitive(prim);
  customWeights.set(prim, Array(P.length / 3).fill({ Head: 1 }));
}

/* Skeleton: name, parent, world position. Standard Mixamo names and hierarchy (without the "mixamorig" prefix), so any
   Mixamo clip retargets by name, finger curls included. Hair, Ahoge, Lantern and the Cape chains are extra spring
   bones driven at runtime. */
const BONES = [
  ["Hips", null, [0, -0.07, 0.09]],
  ["Spine", "Hips", [0, 0.01, 0.09]],
  ["Spine1", "Spine", [0, 0.05, 0.09]],
  ["Spine2", "Spine1", [0, 0.09, 0.09]],
  ["Neck", "Spine2", [0, 0.2, 0.09]],
  ["Head", "Neck", [0, 0.245, 0.09]],
  ["Hair", "Head", [0, 0.36, 0.08]],
  ["Ahoge", "Hair", [0, 0.455, 0.08]],
];
for (const [side, sx] of SIDES) {
  const m = (p) => [p[0] * sx, p[1], p[2]];
  BONES.push(
    [`${side}Shoulder`, "Spine2", m([0.05, 0.172, 0.095])],
    [`${side}Arm`, `${side}Shoulder`, m([0.14, 0.175, 0.1])],
    [`${side}ForeArm`, `${side}Arm`, m([0.27, 0.17, 0.1])],
    [`${side}Hand`, `${side}ForeArm`, m([0.37, 0.165, 0.101])],
  );
  for (const [name, f] of Object.entries(HAND.fingers)) {
    fingerJoints(f).slice(0, 3).forEach((p, k) => {
      BONES.push([`${side}Hand${name}${k + 1}`, k ? `${side}Hand${name}${k}` : `${side}Hand`, m(p.toArray())]);
    });
  }
  BONES.push(
    [`${side}UpLeg`, "Hips", m([0.085, -0.11, 0.09])],
    [`${side}Leg`, `${side}UpLeg`, m([0.09, -0.31, 0.09])],
    [`${side}Foot`, `${side}Leg`, m([0.09, -0.45, 0.08])],
    [`${side}ToeBase`, `${side}Foot`, m([0.09, -0.48, 0.125])],
  );
}
BONES.push(["Lantern", "Hips", [0.075, -0.02, 0.19]]);

/* Attachment points (plain nodes under a bone): props parented here follow the animation */
const SOCKETS = [
  ["LeftHandSocket", "LeftHand", [0.398, 0.148, 0.101]],
  ["RightHandSocket", "RightHand", [-0.398, 0.148, 0.101]],
  ["HeadSocket", "Head", [0, 0.44, 0.06]],
  ["BackSocket", "Spine2", [0, 0.08, -0.04]],
];
/* Cloak spring chains: columns around the back (phi 0 = straight back, + toward +x), joints from the shoulder
   blades to the hem, placed on the cloak surface. Bone Cape{c}_{k} spans joint k to joint k+1. */
const CAPE = { zc: 0.06, phis: [-75, -50, -25, 0, 25, 50, 75], levels: [0.1, 0.02, -0.06, -0.14, -0.22] };
const capeAngle = (x, z) => (Math.atan2(x, -(z - CAPE.zc)) * 180) / Math.PI;
{
  const lining = mesh.listPrimitives().find((p) => p.getMaterial().getName() === "lining").getAttribute("POSITION").getArray();
  CAPE.phis.forEach((phi, c) => {
    let prev = null;
    CAPE.levels.forEach((level, k) => {
      let sum = [0, 0, 0];
      let n = 0;
      for (let i = 0; i < lining.length; i += 3) {
        const [x, y, z] = [lining[i], lining[i + 1], lining[i + 2]];
        if (Math.abs(y - level) > 0.03 || Math.abs(capeAngle(x, z) - phi) > 12) continue;
        sum = [sum[0] + x, sum[1] + y, sum[2] + z];
        n += 1;
      }
      let p;
      if (n > 2) p = [sum[0] / n, level, sum[2] / n];
      else if (prev) p = [prev[0] * 1.08, level, CAPE.zc + (prev[2] - CAPE.zc) * 1.08];
      else throw new Error(`cape column ${phi} has no top`);
      const name = `Cape${c}_${k}`;
      BONES.push([name, k ? `Cape${c}_${k - 1}` : "Spine2", p]);
      prev = p;
    });
  });
}
const index = Object.fromEntries(BONES.map(([name], i) => [name, i]));
const nodes = {};
for (const [name, parent, p] of BONES) {
  const pp = parent ? BONES[index[parent]][2] : [0, 0, 0];
  nodes[name] = doc.createNode(name).setTranslation([p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]]);
  if (parent) nodes[parent].addChild(nodes[name]);
}
const scene = root.listScenes()[0];
scene.addChild(nodes.Hips);
for (const [name, parent, p] of SOCKETS) {
  const pp = BONES[index[parent]][2];
  nodes[parent].addChild(doc.createNode(name).setTranslation([p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]]));
}

const weightsFor = (cls, x, y, z) => {
  const w = {};
  const add = (b, v) => { if (v > 1e-4) w[b] = (w[b] || 0) + v; };
  const ax = Math.abs(x);
  const s = x >= 0 ? "Left" : "Right";
  const torso = (k = 1) => {
    const c = smooth(0.07, 0.13, y);
    const m = smooth(0.01, 0.07, y) * (1 - c);
    const sp = smooth(-0.07, 0.02, y) * (1 - c - m);
    add("Spine2", c * k); add("Spine1", m * k); add("Spine", sp * k); add("Hips", (1 - c - m - sp) * k);
  };
  const cloak = (k = 1) => {
    const phi = Math.min(75, Math.max(-75, capeAngle(x, z)));
    const f = (phi + 75) / 25;
    const c0 = Math.min(5, Math.floor(f));
    const t = f - c0;
    const L = CAPE.levels;
    let seg = 0;
    while (seg < L.length - 2 && y < L[seg + 1]) seg += 1;
    const top = smooth(0.13, 0.07, y);
    add(`Cape${c0}_${seg}`, (1 - t) * top * k); add(`Cape${c0 + 1}_${seg}`, t * top * k); torso((1 - top) * k);
  };

  if (cls === "hair") {
    const a = z > 0.05 && ax < 0.06 ? smooth(0.445, 0.47, y) : 0;
    add("Ahoge", a); add("Hair", 1 - a);
    return w;
  }
  if ((cls === "skin" || cls === "face") && y > 0.2 && ax < 0.16) {
    const h = smooth(0.2, 0.24, y); add("Head", h); add("Neck", 1 - h);
    return w;
  }
  if (cls === "navy") {
    const n = smooth(0.16, 0.23, y) * (1 - smooth(0.14, 0.2, ax)); add("Neck", n); torso(1 - n);
    return w;
  }
  const lanternZone = x > -0.005 && x < 0.175 && y < 0 && y > -0.42 && z > 0.155;
  const charmZone = x > 0.12 && x < 0.18 && y < -0.1 && y > -0.34 && z > 0.05 && (cls === "gold" || cls === "lining");
  if (cls === "glow" || (["dark", "gold", "leather", "lining"].includes(cls) && lanternZone) || charmZone) {
    const l = smooth(0.0, -0.05, y); add("Lantern", l); torso(1 - l);
    return w;
  }
  if (["cream", "dark", "skin", "gold"].includes(cls) && y > 0.04 && ax > 0.1) {
    const a = smooth(0.1, 0.21, ax);
    const f = smooth(0.25, 0.3, ax);
    const h = smooth(0.36, 0.39, ax);
    const sh = (1 - a) * smooth(0.1, 0.14, ax) * 0.5;
    add(`${s}Arm`, a * (1 - f)); add(`${s}ForeArm`, a * f * (1 - h)); add(`${s}Hand`, a * f * h);
    add(`${s}Shoulder`, sh); torso(1 - a - sh);
    return w;
  }
  const cloakBit = (cls === "gold" && ((ax > 0.24 && y < 0.03) || (z < -0.03 && y < 0.1))) || (cls === "cream" && z < -0.03 && y < 0.1);
  if (cls === "lining" || cloakBit) {
    if (Math.abs(capeAngle(x, z)) > 95 && y < 0.08) torso();
    else cloak();
    return w;
  }
  const shirtFront = cls === "cream" && z > 0.17 && y > -0.16;
  if ((["dark", "skin", "cream", "gold"].includes(cls) || (cls === "leather" && y < -0.3)) && y < -0.04 && !shirtFront) {
    const d = Math.hypot(x - (x >= 0 ? 0.085 : -0.085), z - 0.09);
    const r = y < -0.24 ? 1 - smooth(0.15, 0.2, d) : 1 - smooth(0.09, 0.14, d);
    const leg = smooth(-0.06, -0.16, y) * r;
    const sh = smooth(-0.28, -0.34, y);
    const ft = smooth(-0.41, -0.45, y);
    const toe = ft * smooth(0.11, 0.14, z);
    add(`${s}UpLeg`, leg * (1 - sh)); add(`${s}Leg`, leg * sh * (1 - ft));
    add(`${s}Foot`, leg * sh * (ft - toe)); add(`${s}ToeBase`, leg * sh * toe); torso(1 - leg);
    return w;
  }
  torso();
  return w;
};

for (const prim of mesh.listPrimitives()) {
  const cls = prim.getMaterial().getName();
  const custom = customWeights.get(prim);
  const pos = prim.getAttribute("POSITION").getArray();
  const count = pos.length / 3;
  const joints = new Uint8Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const w = Object.entries(custom ? custom[i] : weightsFor(cls, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = w.reduce((s, [, v]) => s + v, 0);
    w.forEach(([b, v], k) => {
      if (!(b in index)) throw new Error(`no bone ${b}`);
      joints[i * 4 + k] = index[b]; weights[i * 4 + k] = v / total;
    });
  }
  prim.setAttribute("JOINTS_0", doc.createAccessor().setType("VEC4").setArray(joints).setBuffer(buffer));
  prim.setAttribute("WEIGHTS_0", doc.createAccessor().setType("VEC4").setArray(weights).setBuffer(buffer));
}

const ibm = new Float32Array(BONES.length * 16);
BONES.forEach(([, , p], i) => {
  ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -p[0], -p[1], -p[2], 1], i * 16);
});
const skin = doc.createSkin("niko").setSkeleton(nodes.Hips)
  .setInverseBindMatrices(doc.createAccessor().setType("MAT4").setArray(ibm).setBuffer(buffer));
for (const [name] of BONES) skin.addJoint(nodes[name]);
meshNode.setSkin(skin).setName("niko");

/* Clips: every entry of ../anim/clips.json, dumped by niko-anim.mjs as per-bone world rotations relative to the
   source's T-pose. Niko rests in the same T-pose with identity rotations, so a source bone's delta is Niko's world
   rotation for the bone of the same name; bones the clip doesn't have just follow their parent. Hips motion is
   scaled to Niko's leg length and made in-place so the loop closes. */
{
  const manifest = JSON.parse(fs.readFileSync("../anim/clips.json", "utf8"));
  const hipsRest = nodes.Hips.getTranslation();
  const emit = (clipName, times, outRot, outHips) => {
    const frames = times.length;
    for (const axis of [0, 2]) {
      const first = outHips[axis];
      const last = outHips[(frames - 1) * 3 + axis];
      const mean = outHips.reduce((s, v, i) => (i % 3 === axis ? s + v : s), 0) / frames;
      for (let f = 0; f < frames; f += 1) {
        const drift = (last - first) * (f / (frames - 1) - 0.5);
        outHips[f * 3 + axis] -= drift + (mean - hipsRest[axis]);
      }
    }
    const animation = doc.createAnimation(clipName);
    const input = doc.createAccessor().setType("SCALAR").setArray(times).setBuffer(buffer);
    for (const [b, rot] of Object.entries(outRot)) {
      const sampler = doc.createAnimationSampler().setInput(input).setInterpolation("LINEAR")
        .setOutput(doc.createAccessor().setType("VEC4").setArray(rot).setBuffer(buffer));
      animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(nodes[b]).setTargetPath("rotation").setSampler(sampler));
    }
    const hs = doc.createAnimationSampler().setInput(input).setInterpolation("LINEAR")
      .setOutput(doc.createAccessor().setType("VEC3").setArray(outHips).setBuffer(buffer));
    animation.addSampler(hs).addChannel(doc.createAnimationChannel().setTargetNode(nodes.Hips).setTargetPath("translation").setSampler(hs));
    console.log("clip", clipName, times[frames - 1].toFixed(2), "s", frames, "frames", Object.keys(outRot).length, "bones");
  };
  for (const clipName of Object.keys(manifest)) {
    const path = `../anim/${clipName}.json`;
    if (!fs.existsSync(path)) { console.warn("missing", path, "- run niko-anim.mjs"); continue; }
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    const frames = data.frames;
    const times = new Float32Array(frames).map((_, f) => Math.min(data.duration, f / data.fps));
    const outRot = Object.fromEntries(BONES.filter(([b]) => data.bones[b]).map(([b]) => [b, new Float32Array(frames * 4)]));
    const outHips = new Float32Array(frames * 3);
    const scale = (hipsRest[1] + 0.5) / data.hipsRest[1];
    for (let f = 0; f < frames; f += 1) {
      const world = {};
      for (const [b, parent] of BONES) {
        const pw = parent ? world[parent] : new THREE.Quaternion();
        world[b] = data.bones[b] ? new THREE.Quaternion().fromArray(data.bones[b], f * 4) : pw.clone();
        if (!outRot[b]) continue;
        const local = pw.clone().invert().multiply(world[b]);
        outRot[b].set([local.x, local.y, local.z, local.w], f * 4);
      }
      for (let a = 0; a < 3; a += 1) outHips[f * 3 + a] = hipsRest[a] + (data.hips[f * 3 + a] - data.hipsRest[a]) * scale;
    }
    emit(clipName, times, outRot, outHips);
  }
}

for (const prim of mesh.listPrimitives()) {
  const indices = prim.getIndices();
  if (prim.getAttribute("POSITION").getCount() < 65535) indices.setArray(new Uint16Array(indices.getArray()));
}
doc.createExtension(KHRMeshQuantization).setRequired(true);
const pack = (accessor, Type, scale, round) => {
  const src = accessor.getArray();
  const out = new Type(src.length);
  for (let i = 0; i < src.length; i += 1) out[i] = round(src[i] * scale);
  accessor.setArray(out).setNormalized(true);
};
for (const prim of mesh.listPrimitives()) {
  pack(prim.getAttribute("NORMAL"), Int8Array, 127, Math.round);
  const color = prim.getAttribute("COLOR_0");
  if (color) pack(color, Uint8Array, 255, Math.round);
  const weights = prim.getAttribute("WEIGHTS_0");
  const w = weights.getArray();
  const out = new Uint8Array(w.length);
  for (let i = 0; i < w.length; i += 4) {
    const q = [0, 1, 2, 3].map((k) => Math.round(w[i + k] * 255));
    q[0] += 255 - q.reduce((s, v) => s + v, 0);
    out.set(q, i);
  }
  weights.setArray(out).setNormalized(true);
}
await doc.transform(prune({ keepAttributes: true, keepLeaves: true }));
if (!root.listTextures().length) for (const ext of root.listExtensionsUsed()) if (ext.extensionName === "EXT_texture_webp") ext.dispose();
fs.mkdirSync("../../assets", { recursive: true });
await io.write(output, doc);
for (const p of mesh.listPrimitives()) console.log(p.getMaterial().getName(), p.getIndices().getCount() / 3);
console.log("bytes", fs.statSync(output).size);
