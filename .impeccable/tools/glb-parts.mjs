import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const src = process.argv[2] || "../review/glb/niko-clean.glb";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute("POSITION").getArray();
const uv = prim.getAttribute("TEXCOORD_0").getArray();
const idx = prim.getIndices().getArray();
const n = pos.length / 3;

const key = (i) => `${pos[i * 3].toFixed(5)},${pos[i * 3 + 1].toFixed(5)},${pos[i * 3 + 2].toFixed(5)}`;
const canon = new Map();
const parent = new Int32Array(n).map((_, i) => i);
const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
for (let i = 0; i < n; i += 1) { const k = key(i); if (canon.has(k)) join(i, canon.get(k)); else canon.set(k, i); }
for (let t = 0; t < idx.length; t += 3) { join(idx[t], idx[t + 1]); join(idx[t], idx[t + 2]); }

const tex = doc.getRoot().listTextures()[0];
const { data, info } = await sharp(tex.getImage()).raw().toBuffer({ resolveWithObject: true });
const sample = (u, v) => {
  const x = Math.min(info.width - 1, Math.max(0, Math.floor(u * info.width)));
  const y = Math.min(info.height - 1, Math.max(0, Math.floor(v * info.height)));
  const o = (y * info.width + x) * info.channels;
  return [data[o], data[o + 1], data[o + 2]];
};

const parts = new Map();
for (let t = 0; t < idx.length; t += 3) {
  const r = find(idx[t]);
  let p = parts.get(r);
  if (!p) { p = { tris: 0, min: [9, 9, 9], max: [-9, -9, -9], col: [0, 0, 0] }; parts.set(r, p); }
  p.tris += 1;
  for (const v of [idx[t], idx[t + 1], idx[t + 2]]) for (let a = 0; a < 3; a += 1) {
    p.min[a] = Math.min(p.min[a], pos[v * 3 + a]); p.max[a] = Math.max(p.max[a], pos[v * 3 + a]);
  }
  const c = sample(uv[idx[t] * 2], uv[idx[t] * 2 + 1]);
  for (let a = 0; a < 3; a += 1) p.col[a] += c[a];
}
const list = [...parts.values()].sort((a, b) => b.tris - a.tris);
console.log("parts", list.length);
for (const p of list.slice(0, 40)) {
  const f = (v) => v.map((x) => x.toFixed(3)).join(",");
  console.log(p.tris, "min", f(p.min), "max", f(p.max), "rgb", p.col.map((c) => Math.round(c / p.tris)).join(","));
}
