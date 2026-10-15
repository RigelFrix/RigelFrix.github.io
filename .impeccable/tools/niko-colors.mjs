import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read("../review/glb/niko-clean.glb");
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute("POSITION").getArray();
const uv = prim.getAttribute("TEXCOORD_0").getArray();
const idx = prim.getIndices().getArray();
const src = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read("../../Low-Poly Starry Mage Explorer.glb");
const { data, info } = await sharp(src.getRoot().listTextures()[0].getImage()).raw().toBuffer({ resolveWithObject: true });
const px = (u, v) => {
  const x = Math.min(info.width - 1, Math.max(0, Math.floor(u * info.width)));
  const y = Math.min(info.height - 1, Math.max(0, Math.floor(v * info.height)));
  const o = (y * info.width + x) * info.channels;
  return [data[o], data[o + 1], data[o + 2]];
};
const T = idx.length / 3;
const cols = new Float32Array(T * 3);
const cen = new Float32Array(T * 3);
for (let t = 0; t < T; t += 1) {
  const [a, b, c] = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]];
  const samples = [];
  for (const [wa, wb, wc] of [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]]) {
    samples.push(px(uv[a * 2] * wa + uv[b * 2] * wb + uv[c * 2] * wc, uv[a * 2 + 1] * wa + uv[b * 2 + 1] * wb + uv[c * 2 + 1] * wc));
  }
  for (let k = 0; k < 3; k += 1) {
    const s = samples.map((p) => p[k]).sort((x, y) => x - y);
    cols[t * 3 + k] = (s[1] + s[2]) / 2;
    cen[t * 3 + k] = (pos[a * 3 + k] + pos[b * 3 + k] + pos[c * 3 + k]) / 3;
  }
}
const K = Number(process.argv[2] || 14);
let centers = Array.from({ length: K }, (_, i) => [...cols.slice(Math.floor((i + 0.5) * T / K) * 3, Math.floor((i + 0.5) * T / K) * 3 + 3)]);
const label = new Int32Array(T);
for (let it = 0; it < 30; it += 1) {
  const sum = Array.from({ length: K }, () => [0, 0, 0, 0]);
  for (let t = 0; t < T; t += 1) {
    let best = 0, bd = 1e9;
    for (let k = 0; k < K; k += 1) {
      const d = (cols[t * 3] - centers[k][0]) ** 2 + (cols[t * 3 + 1] - centers[k][1]) ** 2 + (cols[t * 3 + 2] - centers[k][2]) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    label[t] = best;
    sum[best][0] += cols[t * 3]; sum[best][1] += cols[t * 3 + 1]; sum[best][2] += cols[t * 3 + 2]; sum[best][3] += 1;
  }
  centers = sum.map((s, k) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centers[k]));
}
const stats = centers.map((c, k) => ({ k, c, n: 0, min: [9, 9, 9], max: [-9, -9, -9], mean: [0, 0, 0] }));
for (let t = 0; t < T; t += 1) {
  const s = stats[label[t]];
  s.n += 1;
  for (let a = 0; a < 3; a += 1) { s.min[a] = Math.min(s.min[a], cen[t * 3 + a]); s.max[a] = Math.max(s.max[a], cen[t * 3 + a]); s.mean[a] += cen[t * 3 + a]; }
}
const hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
for (const s of stats.sort((a, b) => b.n - a.n)) {
  const f = (v) => v.map((x) => x.toFixed(2)).join(",");
  console.log(s.k, hex(s.c), s.n, "mean", f(s.mean.map((m) => m / s.n)), "min", f(s.min), "max", f(s.max));
}
