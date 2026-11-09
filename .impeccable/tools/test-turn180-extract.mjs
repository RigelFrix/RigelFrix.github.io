import fs from "fs";
import * as THREE from "../../vendor/three/three.module.min.js";
import { FBXLoader } from "../fbx/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "../../vendor/three/addons/loaders/GLTFLoader.js";

// Polyfill minimal browser DOM
globalThis.self = globalThis;
global.window = globalThis;
global.document = {
  createElementNS: () => ({ style: {}, addEventListener: () => {}, removeEventListener: () => {} }),
  createElement: () => ({ style: {}, getContext: () => null, addEventListener: () => {}, removeEventListener: () => {} })
};
global.HTMLImageElement = function() {};

const nikoBuf = fs.readFileSync("assets/niko/niko.glb");
const gltfLoader = new GLTFLoader();
const gltf = await gltfLoader.parseAsync(nikoBuf.buffer.slice(nikoBuf.byteOffset, nikoBuf.byteOffset + nikoBuf.byteLength), "");
const model = gltf.scene;

const stripMixamo = (name) => name.replace(/^mixamorig\d*:?/, "");
model.traverse((node) => {
  if (node.isBone) node.name = stripMixamo(node.name);
});
const nikoBones = {};
model.traverse((node) => {
  if (node.isBone) nikoBones[node.name] = node;
});

const fbxBuf = fs.readFileSync("assets/niko/Running Turn 180.fbx");
const fbxLoader = new FBXLoader();
const animGroup = fbxLoader.parse(fbxBuf.buffer.slice(fbxBuf.byteOffset, fbxBuf.byteOffset + fbxBuf.byteLength), "");
const srcClip = animGroup.animations[0];

console.log("srcClip duration:", srcClip.duration);
console.log("srcClip tracks:", srcClip.tracks.length);

const animBones = {};
animGroup.traverse((node) => {
  if (node.isBone) {
    const clean = stripMixamo(node.name);
    animBones[clean] = node;
  }
});

const matched = Object.keys(nikoBones).filter(name => animBones[name]);
console.log(`Matched bones between Niko GLB and Turn 180 FBX: ${matched.length} of ${Object.keys(nikoBones).length}`);
