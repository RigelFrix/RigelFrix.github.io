import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read("../review/glb/niko-split.glb");
const prim = doc.getRoot().listMeshes()[0].listPrimitives().find((p) => p.getMaterial().getName() === "lining");
const pos = prim.getAttribute("POSITION").getArray();
const ZC = 0.06;
const rows = new Map();
for (let i = 0; i < pos.length; i += 3) {
  const [x, y, z] = [pos[i], pos[i + 1], pos[i + 2]];
  const phi = Math.round((Math.atan2(x, -(z - ZC)) * 180) / Math.PI / 15) * 15;
  const yb = Math.round(y * 20) / 20;
  const key = `${yb}`;
  if (!rows.has(key)) rows.set(key, new Map());
  const r = rows.get(key);
  const e = r.get(phi) || { n: 0, rad: 0 };
  e.n += 1;
  e.rad += Math.hypot(x, z - ZC);
  r.set(phi, e);
}
const phis = [];
for (let p = -180; p <= 180; p += 15) phis.push(p);
console.log("y\\phi " + phis.map((p) => String(p).padStart(5)).join(""));
for (const key of [...rows.keys()].sort((a, b) => b - a)) {
  const r = rows.get(key);
  console.log(String(key).padStart(6) + " " + phis.map((p) => (r.get(p) ? (r.get(p).rad / r.get(p).n).toFixed(2).padStart(5) : "    .")).join(""));
}
