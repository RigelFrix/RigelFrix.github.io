import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read("../review/glb/niko-clean.glb");
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute("POSITION").getArray();
const uv = prim.getAttribute("TEXCOORD_0").getArray();
const idx = prim.getIndices().getArray();
const src = await io.read("../../Low-Poly Starry Mage Explorer.glb");
const { data, info } = await sharp(src.getRoot().listTextures()[0].getImage()).raw().toBuffer({ resolveWithObject: true });
const px = (u, v) => {
  const o = (Math.floor(v * info.height) * info.width + Math.floor(u * info.width)) * info.channels;
  return [data[o], data[o + 1], data[o + 2]];
};
const T = idx.length / 3;
const hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
// cast along axis: dir "+z" means viewed from front (take max z)
const probe = (name, a, b, dir) => {
  const ax = { x: 0, y: 1, z: 2 }[dir[1]];
  const [ia, ib] = [0, 1, 2].filter((k) => k !== ax);
  let best = -1, bv = -1e9;
  for (let t = 0; t < T; t += 1) {
    const v = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]];
    const c = [0, 1, 2].map((k) => (pos[v[0] * 3 + k] + pos[v[1] * 3 + k] + pos[v[2] * 3 + k]) / 3);
    if (Math.abs(c[ia] - a) > 0.008 || Math.abs(c[ib] - b) > 0.008) continue;
    const s = dir[0] === "+" ? c[ax] : -c[ax];
    if (s > bv) { bv = s; best = t; }
  }
  if (best < 0) return console.log(name, "miss");
  const v = idx[best * 3];
  console.log(name.padEnd(14), hex(px(uv[v * 2], uv[v * 2 + 1])), "depth", bv.toFixed(3));
};
const pts = [
  ["forehead", 0, 0.33, "+z"], ["cheek", 0.06, 0.27, "+z"], ["chin", 0, 0.25, "+z"],
  ["hairtop", 0, 0.47, "+y"], ["hairback", 0, 0.35, "-z"], ["hairside", 0.35, 0.0, "+x"],
  ["scarf", 0, 0.2, "+z"], ["scarfback", 0, 0.22, "-z"], ["shirt", -0.03, 0.08, "+z"], ["shirtlow", -0.05, -0.06, "+z"],
  ["belt", -0.05, 0.01, "+z"], ["satchel", -0.13, -0.04, "+z"], ["pouch", 0.07, -0.15, "+z"],
  ["sleeve", 0.24, 0.15, "+z"], ["sleeveTop", 0.24, 0.0, "+y"], ["undersleeve", 0.32, 0.16, "+z"], ["cuff", 0.37, 0.16, "+z"],
  ["hand", 0.44, 0.15, "+z"], ["cloakback", 0, 0.0, "-z"], ["cloakback2", 0.1, -0.15, "-z"], ["cloakside", 0.25, -0.1, "+z"],
  ["cloakside-b", 0.25, -0.1, "-z"], ["shorts", 0.06, -0.17, "+z"], ["shortsL", -0.07, -0.17, "+z"], ["thigh", 0.07, -0.3, "+z"],
  ["bootfluff", 0.1, -0.38, "+z"], ["boot", 0.1, -0.47, "+z"], ["brooch", 0.085, 0.2, "+z"], ["mantle", 0.15, 0.2, "+z"],
];
for (const [n, a, b, d] of pts) {
  const ax = d[1];
  // pass the two non-cast coordinates in xyz order
  if (ax === "z") probe(n, a, b, d);
  else if (ax === "y") probe(n, a, b, d);
  else probe(n, b, a, d);
}
