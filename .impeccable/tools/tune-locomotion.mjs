import fs from "fs";
import * as THREE from "../../vendor/three/three.module.min.js";
import { GLTFLoader } from "../../vendor/three/addons/loaders/GLTFLoader.js";

// Polyfill minimal browser DOM
globalThis.self = globalThis;
global.window = globalThis;
global.document = { createElementNS: () => ({ style: {} }), createElement: () => ({ style: {} }) };
global.HTMLImageElement = function() {};

const nikoBuf = fs.readFileSync("assets/niko/niko-final-clean.glb");
const gltfLoader = new GLTFLoader();
const gltf = await gltfLoader.parseAsync(nikoBuf.buffer.slice(nikoBuf.byteOffset, nikoBuf.byteOffset + nikoBuf.byteLength), "");
const model = gltf.scene;

const stripMixamo = (name) => name.replace(/^mixamorig\d*:?/, "");
model.traverse((node) => {
  if (node.isBone) node.name = stripMixamo(node.name);
});
const bones = {};
model.traverse((node) => {
  if (node.isBone) bones[node.name] = node;
});

const runData = JSON.parse(fs.readFileSync("assets/niko/cascadeur-run.json"));

const directClip = (entry) => {
  const tracks = [];
  for (const bone of entry.bones) {
    if (!bones[bone.name]) continue;
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, new Float32Array(bone.times), new Float32Array(bone.q)));
    if (bone.pos) tracks.push(new THREE.VectorKeyframeTrack(`${bone.name}.position`, new Float32Array(bone.posTimes), new Float32Array(bone.pos)));
  }
  return new THREE.AnimationClip(entry.name, entry.duration, tracks);
};

const clip = directClip(runData);
const mixer = new THREE.AnimationMixer(model);
const action = mixer.clipAction(clip);
action.play();

// Measure foot separation during the cycle
// In game, Niko model is scaled by NIKO_SCALE = 2.5 on robot
const NIKO_SCALE = 2.5;

let maxFootSeparationZ = 0;
const leftPos = new THREE.Vector3();
const rightPos = new THREE.Vector3();

const steps = 60;
for (let i = 0; i < steps; i++) {
  const t = (i / steps) * clip.duration;
  mixer.setTime(t);
  model.updateMatrixWorld(true);

  bones.LeftFoot.getWorldPosition(leftPos);
  bones.RightFoot.getWorldPosition(rightPos);

  const sepZ = Math.abs(leftPos.z - rightPos.z) * NIKO_SCALE;
  if (sepZ > maxFootSeparationZ) maxFootSeparationZ = sepZ;
}

console.log(`Clip authored duration: ${clip.duration.toFixed(4)}s`);
console.log(`Max foot stride separation (scaled to world): ${maxFootSeparationZ.toFixed(3)}m`);
const doubleStrideDist = maxFootSeparationZ * 2;
console.log(`Estimated double-stride cycle distance: ${doubleStrideDist.toFixed(3)}m`);

console.log("\nStride speed at various timeScales:");
[0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2].forEach(ts => {
  const effectiveDur = clip.duration / ts;
  const stridesPerSec = 1 / effectiveDur;
  const naturalSpeed = doubleStrideDist / effectiveDur;
  console.log(`  timeScale = ${ts.toFixed(2)}x -> cycle = ${effectiveDur.toFixed(3)}s (${stridesPerSec.toFixed(1)} cyc/s) -> natural speed = ${naturalSpeed.toFixed(2)} m/s`);
});
