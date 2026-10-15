/* Extent of the skin triangles past the cuff, per x slice (hands in T-pose along +-x) */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2] || "../review/glb/niko-split.glb");
const prims = Object.fromEntries(doc.getRoot().listMeshes()[0].listPrimitives().map((p) => [p.getMaterial().getName(), p]));
for (const name of ["skin", "gold", "dark", "cream"]) {
  const pos = prims[name].getAttribute("POSITION").getArray();
  for (const side of [1, -1]) {
    const rows = {};
    for (let i = 0; i < pos.length; i += 3) {
      const ax = pos[i] * side;
      if (ax < 0.33 || pos[i + 1] < 0.05) continue;
      const k = (Math.floor(ax / 0.01) * 0.01).toFixed(2);
      const r = (rows[k] ||= { n: 0, y: [9, -9], z: [9, -9] });
      r.n += 1;
      r.y = [Math.min(r.y[0], pos[i + 1]), Math.max(r.y[1], pos[i + 1])];
      r.z = [Math.min(r.z[0], pos[i + 2]), Math.max(r.z[1], pos[i + 2])];
    }
    const keys = Object.keys(rows).sort();
    if (!keys.length) continue;
    console.log(name, side > 0 ? "L" : "R");
    for (const k of keys) {
      const r = rows[k];
      console.log(" ", k, String(r.n).padStart(4), "y", r.y.map((v) => v.toFixed(3)).join("..") , "z", r.z.map((v) => v.toFixed(3)).join(".."));
    }
  }
}
