/* Splits the rigged Niko (assets/niko.glb, from niko-rig.mjs) into wearable pieces.
   Each file keeps the same skeleton and joint indices, so the game can parent them
   to the body and share one set of bones. Animations stay on body.glb only.
   Run from .impeccable/tools: node niko-parts.mjs [niko.glb] [out dir] */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import fs from "node:fs";

const input = process.argv[2] || "../../assets/niko.glb";
const outDir = process.argv[3] || "../../assets/niko";
const SLOTS = ["body", "hair", "coat", "clothes", "shoes"];

/* Boots are the dark cluster below the gap at y=-0.32. Cream and lining are the coat, hem included. */
const onFoot = (x, y, z) => y < -0.32 && Math.abs(x) < 0.22 && z > -0.04;
export const slotOf = (material, x, y, z) => {
  if (material === "hair") return "hair";
  if (material === "cream" || material === "lining") return "coat";
  if (material === "gold" && z < -0.02 && y < 0.05) return "coat";
  if (material === "skin" || material === "face" || material === "eyeL" || material === "eyeR" || material === "glow") return "body";
  if ((material === "dark" && y < -0.32) || ((material === "leather" || material === "gold") && onFoot(x, y, z))) return "shoes";
  return "clothes";
};

const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const ATTRS = ["POSITION", "NORMAL", "TEXCOORD_0", "COLOR_0", "JOINTS_0", "WEIGHTS_0"];

const extract = (doc, buffer, prim, test) => {
  const idx = prim.getIndices().getArray();
  const pos = prim.getAttribute("POSITION").getArray();
  const tris = [];
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]];
    const c = [0, 1, 2].map((a) => (pos[v[0] * 3 + a] + pos[v[1] * 3 + a] + pos[v[2] * 3 + a]) / 3);
    if (test(c[0], c[1], c[2])) tris.push(v);
  }
  if (!tris.length) return null;
  const map = new Map();
  const order = [];
  const nid = (v) => {
    if (!map.has(v)) {
      map.set(v, order.length);
      order.push(v);
    }
    return map.get(v);
  };
  const raw = [];
  for (const v of tris) for (const i of v) raw.push(nid(i));
  const out = doc.createPrimitive().setMaterial(prim.getMaterial());
  const Index = order.length < 65536 ? Uint16Array : Uint32Array;
  out.setIndices(doc.createAccessor().setType("SCALAR").setArray(new Index(raw)).setBuffer(buffer));
  for (const name of ATTRS) {
    const attr = prim.getAttribute(name);
    if (!attr) continue;
    const src = attr.getArray();
    const size = SIZE[attr.getType()];
    const arr = new src.constructor(order.length * size);
    order.forEach((v, i) => arr.set(src.subarray(v * size, v * size + size), i * size));
    out.setAttribute(name, doc.createAccessor().setType(attr.getType()).setArray(arr).setNormalized(attr.getNormalized()).setBuffer(buffer));
  }
  return out;
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(outDir, { recursive: true });

for (const slot of SLOTS) {
  const doc = await io.read(input);
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];
  const mesh = root.listMeshes()[0];
  let tris = 0;
  for (const prim of [...mesh.listPrimitives()]) {
    const material = prim.getMaterial().getName();
    const piece = extract(doc, buffer, prim, (x, y, z) => slotOf(material, x, y, z) === slot);
    mesh.removePrimitive(prim);
    prim.dispose();
    if (!piece) continue;
    mesh.addPrimitive(piece);
    tris += piece.getIndices().getCount() / 3;
  }
  if (!tris) throw new Error(`${slot} came out empty`);
  const node = root.listNodes().find((n) => n.getMesh() === mesh);
  node.setName(slot);
  mesh.setName(slot);
  if (slot !== "body") for (const anim of [...root.listAnimations()]) anim.dispose();
  const used = new Set(mesh.listPrimitives().map((p) => p.getMaterial()));
  for (const material of [...root.listMaterials()]) if (!used.has(material)) material.dispose();
  await doc.transform(prune({ keepAttributes: true, keepLeaves: true }));
  const file = `${outDir}/${slot}.glb`;
  await io.write(file, doc);
  const joints = root.listSkins()[0].listJoints().length;
  console.log(slot, tris, "tris", joints, "joints", fs.statSync(file).size, "bytes", mesh.listPrimitives().map((p) => p.getMaterial().getName()).join("+"));
}
