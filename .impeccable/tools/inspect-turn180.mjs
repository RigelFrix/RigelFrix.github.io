import fs from "fs";
import * as THREE from "../../vendor/three/three.module.min.js";
import { FBXLoader } from "../fbx/addons/loaders/FBXLoader.js";

// Polyfill minimal browser DOM
globalThis.self = globalThis;
global.window = globalThis;
global.document = {
  createElementNS: () => ({ style: {}, addEventListener: () => {}, removeEventListener: () => {} }),
  createElement: () => ({ style: {}, getContext: () => null, addEventListener: () => {}, removeEventListener: () => {} })
};
global.HTMLImageElement = function() {};

const fbxPath = "assets/niko/Running Turn 180.fbx";
const buf = fs.readFileSync(fbxPath);
const loader = new FBXLoader();
const group = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");

console.log("Animations count:", group.animations.length);
if (group.animations.length > 0) {
  const clip = group.animations[0];
  console.log("Clip name:", clip.name);
  console.log("Duration:", clip.duration);
  console.log("Tracks count:", clip.tracks.length);
  const trackBones = clip.tracks.map(t => t.name.split('.')[0]).filter((v, i, a) => a.indexOf(v) === i);
  console.log("Bones in clip:", trackBones.slice(0, 15), `... (total ${trackBones.length})`);
}

const bones = [];
group.traverse(n => { if (n.isBone) bones.push(n.name); });
console.log("Bones in FBX rig:", bones.length);
