/* Hair triangles in front of the face: where they sit relative to the skin surface */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2] || "../review/glb/niko-split.glb");
const prims = Object.fromEntries(doc.getRoot().listMeshes()[0].listPrimitives().map((p) => [p.getMaterial().getName(), p]));
const tris = (prim) => {
  const pos = prim.getAttribute("POSITION").getArray();
  const nrm = prim.getAttribute("NORMAL").getArray();
  const idx = prim.getIndices().getArray();
  const out = [];
  for (let t = 0; t < idx.length; t += 3) {
    const c = [0, 1, 2].map((a) => (pos[idx[t] * 3 + a] + pos[idx[t + 1] * 3 + a] + pos[idx[t + 2] * 3 + a]) / 3);
    const n = [0, 1, 2].map((a) => (nrm[idx[t] * 3 + a] + nrm[idx[t + 1] * 3 + a] + nrm[idx[t + 2] * 3 + a]) / 3);
    out.push({ c, n });
  }
  return out;
};
const skin = tris(prims.skin).filter(({ c }) => c[2] > 0.08 && c[1] > 0.2 && c[1] < 0.4 && Math.abs(c[0]) < 0.16);
const hair = tris(prims.hair).filter(({ c }) => c[2] > 0.08 && c[1] > 0.2 && c[1] < 0.4 && Math.abs(c[0]) < 0.16);
const skinZ = (x, y) => {
  let best = -1, bz = null;
  for (const { c } of skin) {
    const d = Math.hypot(c[0] - x, c[1] - y);
    if (d < 0.025 && (bz === null || c[2] > bz)) bz = c[2];
  }
  return bz;
};
const grid = {};
for (const { c, n } of hair) {
  const sz = skinZ(c[0], c[1]);
  const key = `${(Math.round(c[1] / 0.02) * 0.02).toFixed(2)}`;
  (grid[key] ||= []).push({ x: c[0], z: c[2], dz: sz === null ? null : c[2] - sz, nz: n[2] });
}
for (const y of Object.keys(grid).sort()) {
  const row = grid[y].sort((a, b) => a.x - b.x);
  console.log(y, row.length, row.filter((r) => Math.abs(r.x) < 0.13).map((r) => `${r.x.toFixed(2)}:${r.dz === null ? "--" : r.dz.toFixed(3)}`).join(" "));
}
const sk = skin.map(({ c }) => c[1]);
console.log("skin y range", Math.min(...sk).toFixed(3), Math.max(...sk).toFixed(3), "count", skin.length);
