import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, simplify, prune, dedup, textureCompress } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import fs from "node:fs";

const src = process.argv[2] || "../../Low-Poly Starry Mage Explorer.glb";
const out = process.argv[3] || "../review/glb/niko-clean.glb";
const ratio = Number(process.argv[4] || 0.12);
const error = Number(process.argv[5] || 0.002);
const tex = process.argv[6];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot();

for (const material of root.listMaterials()) {
  const mr = material.getMetallicRoughnessTexture();
  material.setMetallicRoughnessTexture(null);
  if (mr) mr.dispose();
  material.setMetallicFactor(0).setRoughnessFactor(1);
  if (tex) {
    const base = material.getBaseColorTexture();
    base.setImage(fs.readFileSync(tex)).setMimeType("image/png");
  }
}

await MeshoptSimplifier.ready;
await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error }),
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 90 }),
);

for (const mesh of root.listMeshes())
  for (const prim of mesh.listPrimitives())
    console.log("verts", prim.getAttribute("POSITION").getCount(), "tris", prim.getIndices().getCount() / 3);
await io.write(out, doc);
console.log("bytes", fs.statSync(out).size);
