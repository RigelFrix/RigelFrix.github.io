import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const src = process.env.GLB || "../../Low-Poly Starry Mage Explorer.glb";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute("POSITION").getArray();
const n = pos.length / 3;
const mode = process.argv[2] || "x";
const lo = Number(process.argv[3]);
const hi = Number(process.argv[4]);
// plot the two remaining axes as an ascii grid (cell .01)
const [a, b, c] = mode === "x" ? [0, 2, 1] : mode === "y" ? [1, 0, 2] : [2, 0, 1];
const grid = new Map();
let min = [9, 9], max = [-9, -9];
for (let i = 0; i < n; i += 1) {
  const s = pos[i * 3 + a];
  if (s < lo || s > hi) continue;
  const u = Math.round(pos[i * 3 + b] * 100), v = Math.round(pos[i * 3 + c] * 100);
  grid.set(`${u},${v}`, (grid.get(`${u},${v}`) || 0) + 1);
  min = [Math.min(min[0], u), Math.min(min[1], v)];
  max = [Math.max(max[0], u), Math.max(max[1], v)];
}
console.log(`slice ${mode} in [${lo},${hi}]  horiz ${"xyz"[b]} ${min[0]}..${max[0]}  vert ${"xyz"[c]} ${min[1]}..${max[1]} (x100)`);
for (let v = max[1]; v >= min[1]; v -= 1) {
  let row = "";
  for (let u = min[0]; u <= max[0]; u += 1) row += grid.has(`${u},${v}`) ? "#" : ".";
  console.log(String(v).padStart(4), row);
}
