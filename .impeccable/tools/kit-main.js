/* Builds assets/kit/*.glb from the island's own shapes. Run: node .impeccable/tools/export-kit.mjs */
import * as THREE from "three";
import fs from "node:fs";
import path from "node:path";
import { buildIsland, propKit } from "../../world-island.js";
import { toGlb } from "./write-glb.mjs";

const { pieces, leaf } = propKit();
const dir = path.resolve("assets/kit");
fs.mkdirSync(dir, { recursive: true });
const kit = new THREE.Group();
kit.name = "island-kit";
let cursor = 0;
for (const part of pieces) {
  fs.writeFileSync(path.join(dir, `${part.name}.glb`), toGlb(part, leaf));
  const box = new THREE.Box3().setFromObject(part);
  part.position.x = cursor - box.min.x;
  cursor += box.max.x - box.min.x + 4;
  kit.add(part);
}
fs.writeFileSync(path.join(dir, "island-kit.glb"), toGlb(kit, leaf));

/* The island as it is now: ground, sea and every prop already placed, each one its own object */
const world = new THREE.Scene();
buildIsland({ scene: world, withRim: (material) => material, coarse: true, kit: true });
const island = world.children[0];
const placed = new THREE.Group();
placed.name = "island-kit";
island.children.slice().forEach((child) => {
  if (child.name === "props" || child.name === "glows" || child.name === "leaves") child.children.slice().forEach((part) => placed.add(part));
  else placed.add(child);
});
fs.writeFileSync(path.join(dir, "island.glb"), toGlb(placed, leaf));
console.log(`island: ${placed.children.length} objects`);
const names = pieces.map((part) => part.name).join(", ");
fs.writeFileSync(
  path.join(dir, "HOW.txt"),
  [
    "Drag island.glb onto https://threejs.org/editor/ to edit the island as it is now.",
    "island-kit.glb is the same pieces lined up, for adding new ones. Or drag a single file.",
    "Each object is already the size it is in the game. The blue capsule (niko-height) is Niko: 2.5 units, about 1.5 m.",
    "Ground pieces (ground-sand, ground-grass, ground-grass-wide, path, dock) have their TOP at y = 0.",
    "Terrace heights, if you want the current island's levels: beach 0.5, low 3, mid 5.6, top 8.2.",
    "cliff is one step (2.6 tall). stair climbs 2.6. Duplicate with Ctrl+D and move.",
    "Keep the object names. When the draft is ready: File > Export > GLB, and send me that file.",
    `Pieces: ${names}`,
    "",
  ].join("\n")
);
console.log(`kit: ${pieces.length} pieces -> ${dir}`);
