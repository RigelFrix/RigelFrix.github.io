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
const outJsonPath = "assets/niko/turn-180.json";

const fbxBuf = fs.readFileSync(fbxPath);
const fbxLoader = new FBXLoader();
const sourceGroup = fbxLoader.parse(fbxBuf.buffer.slice(fbxBuf.byteOffset, fbxBuf.byteOffset + fbxBuf.byteLength), "");
const srcClip = sourceGroup.animations[0];

console.log(`Loaded ${fbxPath}: duration=${srcClip.duration}s, tracks=${srcClip.tracks.length}`);

const stripMixamo = (name) => name.replace(/^mixamorig\d*:?/, "");

const boneMap = new Map();

for (const track of srcClip.tracks) {
  const parts = track.name.split(".");
  const rawBoneName = parts[0];
  const prop = parts[1];
  const cleanName = stripMixamo(rawBoneName);

  if (!boneMap.has(cleanName)) {
    boneMap.set(cleanName, { name: cleanName });
  }

  const boneData = boneMap.get(cleanName);

  if (prop === "quaternion") {
    boneData.times = Array.from(track.times).map((t) => Math.round(t * 10000) / 10000);
    boneData.q = Array.from(track.values).map((v) => Math.round(v * 10000) / 10000);
  } else if (prop === "position") {
    boneData.posTimes = Array.from(track.times).map((t) => Math.round(t * 10000) / 10000);
    // FBX position is in centimeters, curvesClip expects meters
    boneData.pos = Array.from(track.values).map((v) => Math.round((v / 100) * 10000) / 10000);
  }
}

const bones = Array.from(boneMap.values()).filter((b) => b.times && b.q);

const turnData = {
  name: "turn180",
  duration: Math.round(srcClip.duration * 10000) / 10000,
  bones,
};

fs.writeFileSync(outJsonPath, JSON.stringify(turnData));
console.log(`Saved ${outJsonPath}: duration=${turnData.duration}s, bones=${bones.length}, size=${fs.statSync(outJsonPath).size} bytes`);
