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

console.log("Clip duration:", clip.duration);

const hipPosTrack = clip.tracks.find(t => t.name.includes("Hips.position"));
if (hipPosTrack) {
  console.log("Hips.position keyframes:", hipPosTrack.times.length);
  console.log("Start pos:", [hipPosTrack.values[0], hipPosTrack.values[1], hipPosTrack.values[2]]);
  const mid = Math.floor(hipPosTrack.times.length / 2) * 3;
  console.log("Mid pos:", [hipPosTrack.values[mid], hipPosTrack.values[mid + 1], hipPosTrack.values[mid + 2]]);
  const last = (hipPosTrack.times.length - 1) * 3;
  console.log("End pos:", [hipPosTrack.values[last], hipPosTrack.values[last + 1], hipPosTrack.values[last + 2]]);
}

const hipQuatTrack = clip.tracks.find(t => t.name.includes("Hips.quaternion"));
if (hipQuatTrack) {
  const eulerStart = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(hipQuatTrack.values[0], hipQuatTrack.values[1], hipQuatTrack.values[2], hipQuatTrack.values[3]));
  const last = (hipQuatTrack.times.length - 1) * 4;
  const eulerEnd = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(hipQuatTrack.values[last], hipQuatTrack.values[last + 1], hipQuatTrack.values[last + 2], hipQuatTrack.values[last + 3]));
  console.log("Hips Yaw start (deg):", (eulerStart.y * 180 / Math.PI).toFixed(1));
  console.log("Hips Yaw end (deg):", (eulerEnd.y * 180 / Math.PI).toFixed(1));
}
