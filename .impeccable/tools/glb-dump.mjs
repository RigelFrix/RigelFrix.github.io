import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";
import fs from "node:fs";

const src = process.argv[2] || "../../Low-Poly Starry Mage Explorer.glb";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot();
fs.mkdirSync("../review/glb", { recursive: true });
for (const [i, tex] of root.listTextures().entries()) {
  const img = tex.getImage();
  const meta = await sharp(img).metadata();
  console.log(i, tex.getMimeType(), meta.width, meta.height, img.byteLength);
  await sharp(img).png().toFile(`../review/glb/tex${i}.png`);
}
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices();
    console.log("prim", prim.getAttribute("POSITION").getCount(), idx ? idx.getCount() / 3 : "noindex");
  }
}
