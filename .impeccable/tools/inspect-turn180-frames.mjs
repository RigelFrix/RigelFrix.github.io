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
const clip = group.animations[0];

const hipQuatTrack = clip.tracks.find(t => t.name.includes("Hips.quaternion"));
console.log("Frames of Hips.quaternion:");
for (let i = 0; i < hipQuatTrack.times.length; i++) {
  const q = new THREE.Quaternion(
    hipQuatTrack.values[i * 4],
    hipQuatTrack.values[i * 4 + 1],
    hipQuatTrack.values[i * 4 + 2],
    hipQuatTrack.values[i * 4 + 3]
  );
  const euler = new THREE.Euler().setFromQuaternion(q, "YXZ");
  console.log(`t=${hipQuatTrack.times[i].toFixed(3)}s : Yaw=${(euler.y * 180 / Math.PI).toFixed(1)}°, Pitch=${(euler.x * 180 / Math.PI).toFixed(1)}°, Roll=${(euler.z * 180 / Math.PI).toFixed(1)}°`);
}
