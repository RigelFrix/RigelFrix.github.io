import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read("../../assets/niko/niko-t-pose-rigged.glb");
const pos = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute("POSITION").getArray();
let best = null;
const band = [];
for (let i = 0; i < pos.length; i += 3) {
  const x = pos[i], y = pos[i + 1], z = pos[i + 2];
  if (y < 1.32 || y > 1.44 || Math.abs(x) > 0.12) continue;
  band.push(z);
  if (!best || z > best.z) best = { x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3) };
}
band.sort((a, b) => a - b);
const pct = (q) => band[Math.min(band.length - 1, Math.floor(q * (band.length - 1)))];
console.log("front", best, "n", band.length, "z p50", pct(0.5).toFixed(3), "p90", pct(0.9).toFixed(3), "max", band[band.length - 1].toFixed(3));

const hair = await io.read("../../assets/niko/hair.glb");
const mat = hair.getRoot().listMaterials()[0];
console.log("hair mat", mat.getName(), mat.getBaseColorFactor());
const body = await io.read("../../assets/niko/body.glb");
for (const m of body.getRoot().listMaterials()) console.log("body mat", m.getName(), m.getBaseColorFactor());
