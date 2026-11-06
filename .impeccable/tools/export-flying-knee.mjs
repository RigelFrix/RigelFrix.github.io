import fs from "fs";
import * as THREE from "../../vendor/three/three.module.min.js";
import { FBXLoader } from "../fbx/addons/loaders/FBXLoader.js";

const fbxBuf = fs.readFileSync("Flying Knee Punch Combo.fbx");
const fbxLoader = new FBXLoader();
const sourceGroup = fbxLoader.parse(fbxBuf.buffer.slice(fbxBuf.byteOffset, fbxBuf.byteOffset + fbxBuf.byteLength), "");
const srcClip = sourceGroup.animations[0];

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
    // FBX position is in centimeters, curvesClip expects meters (and multiplies by 100)
    boneData.pos = Array.from(track.values).map((v) => Math.round((v / 100) * 10000) / 10000);
  }
}

const bones = Array.from(boneMap.values()).filter((b) => b.times && b.q);

const punchData = {
  name: "punch",
  duration: Math.round(srcClip.duration * 10000) / 10000,
  bones,
};

fs.writeFileSync("assets/niko/punch.json", JSON.stringify(punchData));
console.log(`Saved assets/niko/punch.json: duration=${punchData.duration}s, bones=${bones.length}, size=${fs.statSync("assets/niko/punch.json").size} bytes`);

