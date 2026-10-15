/* Connected islands of the hair primitive (vertices joined by position) and their bounding boxes */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read("../review/glb/niko-split.glb");
const prims = Object.fromEntries(doc.getRoot().listMeshes()[0].listPrimitives().map((p) => [p.getMaterial().getName(), p]));
const pos = prims.hair.getAttribute("POSITION").getArray();
const idx = prims.hair.getIndices().getArray();
const key = (v) => `${pos[v * 3].toFixed(4)},${pos[v * 3 + 1].toFixed(4)},${pos[v * 3 + 2].toFixed(4)}`;
const parent = new Map();
const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
const join = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
for (let v = 0; v < pos.length / 3; v += 1) if (!parent.has(key(v))) parent.set(key(v), key(v));
for (let t = 0; t < idx.length; t += 3) { join(key(idx[t]), key(idx[t + 1])); join(key(idx[t]), key(idx[t + 2])); }
const comps = new Map();
for (let t = 0; t < idx.length; t += 3) {
  const r = find(key(idx[t]));
  const c = comps.get(r) || { n: 0, min: [9, 9, 9], max: [-9, -9, -9] };
  for (let k = 0; k < 3; k += 1) for (let a = 0; a < 3; a += 1) {
    c.min[a] = Math.min(c.min[a], pos[idx[t + k] * 3 + a]);
    c.max[a] = Math.max(c.max[a], pos[idx[t + k] * 3 + a]);
  }
  c.n += 1;
  comps.set(r, c);
}
const list = [...comps.values()].sort((a, b) => b.n - a.n);
console.log("islands", list.length);
for (const c of list.slice(0, 40)) console.log(String(c.n).padStart(5), "min", c.min.map((v) => v.toFixed(3)).join(","), "max", c.max.map((v) => v.toFixed(3)).join(","));
