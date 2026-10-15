import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, prune, dedup, simplify } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import fs from "node:fs";

const input = process.argv[2] || "../review/glb/niko-clean.glb";
const output = process.argv[3] || "../review/glb/niko-split.glb";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();
const prim = root.listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute("POSITION").getArray();
const uv = prim.getAttribute("TEXCOORD_0").getArray();
const idx = prim.getIndices().getArray();
const T = idx.length / 3;

const src = await io.read("../../Low-Poly Starry Mage Explorer.glb");
const { data, info } = await sharp(src.getRoot().listTextures()[0].getImage()).raw().toBuffer({ resolveWithObject: true });
const px = (u, v) => {
  const x = Math.min(info.width - 1, Math.max(0, Math.floor(u * info.width)));
  const y = Math.min(info.height - 1, Math.max(0, Math.floor(v * info.height)));
  const o = (y * info.width + x) * info.channels;
  return [data[o], data[o + 1], data[o + 2]];
};

// clean palette, one material per class
export const CLASSES = {
  skin: { color: "#f6cfb0", protos: ["#fbd0b1", "#f6c5a1", "#e7c0a2", "#f4c8a6", "#e9b896"] },
  hair: { color: "#eeebe8", protos: ["#e1d4c2", "#ecdfcd", "#f2e3cf", "#d8d2cc", "#c9c2bd"] },
  cream: { color: "#f3ead8", protos: ["#d9cfb5", "#ecdfcd", "#dfc5ad", "#bba99a", "#c9bca5"] },
  navy: { color: "#36428a", protos: ["#434e6a", "#343758", "#4e4e6b", "#2c3150"] },
  lining: { color: "#ffffff", gradient: ["#36428a", "#958bd2"], protos: ["#817494", "#7d6a87", "#7d6773", "#686375", "#998981", "#bda2a2", "#9c8aa8", "#434e6a", "#343758", "#4e4e6b", "#2c3150"] },
  dark: { color: "#3b2c24", protos: ["#30291e", "#312a1f", "#30271e", "#43382c", "#463e28", "#493724"] },
  leather: { color: "#7a5634", protos: ["#634b26", "#5b4c39", "#6e5536", "#7a6040"] },
  gold: { color: "#e0b54a", protos: ["#c4b181", "#bfaa73", "#a79058", "#c9b368", "#b89f77"] },
};
const names = Object.keys(CLASSES);
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const feat = ([r, g, b]) => {
  const y = 0.3 * r + 0.59 * g + 0.11 * b;
  return [y, (r - g) * 1.6, (g - b) * 1.2, (r - b) * 1.0];
};
const protos = names.flatMap((name, k) => CLASSES[name].protos.map((h) => ({ k, f: feat(rgb(h)) })));

const cen = new Float32Array(T * 3);
const col = new Float32Array(T * 3);
for (let t = 0; t < T; t += 1) {
  const v = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]];
  const samples = [];
  for (const w of [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]]) {
    samples.push(px(
      uv[v[0] * 2] * w[0] + uv[v[1] * 2] * w[1] + uv[v[2] * 2] * w[2],
      uv[v[0] * 2 + 1] * w[0] + uv[v[1] * 2 + 1] * w[1] + uv[v[2] * 2 + 1] * w[2],
    ));
  }
  for (let a = 0; a < 3; a += 1) {
    const s = samples.map((p) => p[a]).sort((x, y) => x - y);
    col[t * 3 + a] = (s[1] + s[2]) / 2;
    cen[t * 3 + a] = (pos[v[0] * 3 + a] + pos[v[1] * 3 + a] + pos[v[2] * 3 + a]) / 3;
  }
}

const K = (n) => names.indexOf(n);
const SCARF = { y0: 0.13, y1: 0.28, z: 0.09, rx: 0.165, rz: 0.16 };
const inScarf = (x, y, z) => y > SCARF.y0 && y < SCARF.y1 && (x / SCARF.rx) ** 4 + ((z - SCARF.z) / SCARF.rz) ** 4 < 1;
const inFace = (x, y, z) => y > 0.225 && y < 0.37 && z > 0.1 && Math.abs(x) < 0.14;
const allowed = (x, y, z) => {
  const ax = Math.abs(x);
  const head = y > 0.25 && ax < 0.22;
  const set = new Set(names);
  if (!head) set.delete("hair");
  if (head && y > 0.3) { set.delete("cream"); set.delete("navy"); set.delete("lining"); set.delete("leather"); }
  if (inFace(x, y, z)) return new Set(y > 0.27 ? ["skin", "hair"] : ["skin", "navy"]);
  if (ax > 0.16 && y > 0.08) return new Set(["cream", "dark", "gold", "skin"]);
  if (inScarf(x, y, z)) { set.delete("hair"); if (y > 0.17) set.delete("cream"); }
  else set.delete("navy");
  if (y < -0.33) { set.delete("lining"); set.delete("navy"); }
  return set;
};
const label = new Int32Array(T);
const cost = (t, k) => {
  const f = feat([col[t * 3], col[t * 3 + 1], col[t * 3 + 2]]);
  let best = 1e9;
  for (const p of protos) if (p.k === k) {
    const d = f.reduce((s, v, i) => s + (v - p.f[i]) ** 2, 0);
    if (d < best) best = d;
  }
  return best;
};
const costs = new Float32Array(T * names.length);
for (let t = 0; t < T; t += 1) {
  const ok = allowed(cen[t * 3], cen[t * 3 + 1], cen[t * 3 + 2]);
  let best = 0, bd = 1e12;
  for (let k = 0; k < names.length; k += 1) {
    const c = ok.has(names[k]) ? cost(t, k) : 1e9;
    costs[t * names.length + k] = c;
    if (c < bd) { bd = c; best = k; }
  }
  label[t] = best;
}

// adjacency through shared (welded) positions
const vkey = new Map();
const vid = new Int32Array(pos.length / 3);
for (let i = 0; i < vid.length; i += 1) {
  const k = `${pos[i * 3].toFixed(5)},${pos[i * 3 + 1].toFixed(5)},${pos[i * 3 + 2].toFixed(5)}`;
  if (!vkey.has(k)) vkey.set(k, vkey.size);
  vid[i] = vkey.get(k);
}
const vtris = Array.from({ length: vkey.size }, () => []);
for (let t = 0; t < T; t += 1) for (let j = 0; j < 3; j += 1) vtris[vid[idx[t * 3 + j]]].push(t);
const nbr = Array.from({ length: T }, (_, t) => {
  const s = new Set();
  for (let j = 0; j < 3; j += 1) for (const o of vtris[vid[idx[t * 3 + j]]]) if (o !== t) s.add(o);
  return [...s];
});

// connected shells: small ones take one label
const shell = new Int32Array(T).fill(-1);
let shells = 0;
for (let t = 0; t < T; t += 1) {
  if (shell[t] >= 0) continue;
  const stack = [t];
  shell[t] = shells;
  while (stack.length) {
    const c = stack.pop();
    for (const o of nbr[c]) if (shell[o] < 0) { shell[o] = shells; stack.push(o); }
  }
  shells += 1;
}
const members = Array.from({ length: shells }, () => []);
for (let t = 0; t < T; t += 1) members[shell[t]].push(t);
for (const m of members) {
  if (m.length > 1500) continue;
  const sum = new Float64Array(names.length);
  for (const t of m) for (let k = 0; k < names.length; k += 1) sum[k] += Math.min(costs[t * names.length + k], 1e6);
  let best = 0;
  for (let k = 1; k < names.length; k += 1) if (sum[k] < sum[best]) best = k;
  for (const t of m) label[t] = best;
}

// smoothing: label cost + neighbour disagreement
const smoothPasses = Number(process.argv[4] || 6);
const lambda = Number(process.argv[5] || 900);
for (let it = 0; it < smoothPasses; it += 1) {
  const next = label.slice();
  for (let t = 0; t < T; t += 1) {
    const counts = new Float32Array(names.length);
    for (const o of nbr[t]) counts[label[o]] += 1;
    let best = label[t], bd = 1e12;
    for (let k = 0; k < names.length; k += 1) {
      const c = costs[t * names.length + k];
      if (c >= 1e9) continue;
      const e = Math.sqrt(c) * 10 + lambda * (nbr[t].length - counts[k]) / Math.max(1, nbr[t].length);
      if (e < bd) { bd = e; best = k; }
    }
    next[t] = best;
  }
  label.set(next);
}

const counts = names.map((n, k) => [n, label.reduce((s, l) => s + (l === k ? 1 : 0), 0)]);
console.log(counts.map(([n, c]) => `${n}:${c}`).join(" "));

// build one primitive per class, positions + normals only
const buffer = root.listBuffers()[0];
const mesh = doc.createMesh("niko");
const nrm = prim.getAttribute("NORMAL").getArray();
for (let k = 0; k < names.length; k += 1) {
  const tris = [];
  for (let t = 0; t < T; t += 1) if (label[t] === k) tris.push(t);
  if (!tris.length) continue;
  const p = new Float32Array(tris.length * 9);
  const n = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => {
    for (let j = 0; j < 3; j += 1) {
      const v = idx[t * 3 + j];
      for (let a = 0; a < 3; a += 1) { p[i * 9 + j * 3 + a] = pos[v * 3 + a]; n[i * 9 + j * 3 + a] = nrm[v * 3 + a]; }
    }
  });
  const material = doc.createMaterial(names[k])
    .setBaseColorFactor([...rgb(CLASSES[names[k]].color).map((c) => (c / 255) ** 2.2), 1])
    .setMetallicFactor(0).setRoughnessFactor(1);
  const part = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(p).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(n).setBuffer(buffer))
    .setMaterial(material);
  const gradient = CLASSES[names[k]].gradient;
  if (gradient) {
    const [top, bottom] = gradient.map((h) => rgb(h).map((c) => (c / 255) ** 2.2));
    const c = new Float32Array((p.length / 3) * 4);
    for (let i = 0; i < p.length / 3; i += 1) {
      const s = Math.min(1, Math.max(0, (0.22 - p[i * 3 + 1]) / 0.46));
      const e = s * s * (3 - 2 * s);
      for (let a = 0; a < 3; a += 1) c[i * 4 + a] = top[a] + (bottom[a] - top[a]) * e;
      c[i * 4 + 3] = 1;
    }
    part.setAttribute("COLOR_0", doc.createAccessor().setType("VEC4").setArray(c).setBuffer(buffer));
  }
  mesh.addPrimitive(part);
}
const node = root.listNodes().find((n) => n.getMesh());
const old = node.getMesh();
node.setMesh(mesh);
old.dispose();
for (const m of root.listMaterials()) if (!names.includes(m.getName())) m.dispose();
for (const t of root.listTextures()) t.dispose();
await MeshoptSimplifier.ready;
await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: Number(process.env.RATIO || 0.55), error: Number(process.env.ERR || 0.0015), lockBorder: true }),
  dedup(),
  prune(),
);
for (const p of mesh.listPrimitives()) console.log(p.getMaterial().getName(), p.getIndices().getCount() / 3);
await io.write(output, doc);
console.log("bytes", fs.statSync(output).size);
