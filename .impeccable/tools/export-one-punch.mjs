import fs from "fs";
import path from "path";
import * as THREE from "../../vendor/three/three.module.min.js";
import { FBXLoader } from "../fbx/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "../../vendor/three/addons/loaders/GLTFLoader.js";

// Polyfill minimal browser DOM for FBXLoader / GLTFLoader
globalThis.self = globalThis;
global.window = globalThis;
global.document = {
  createElementNS: () => {
    const el = {
      style: {},
      addEventListener: (t, fn) => { if (t === 'load') setTimeout(fn, 1); },
      removeEventListener: () => {},
    };
    setTimeout(() => { if (el.onload) el.onload(); }, 1);
    return el;
  },
  createElement: () => {
    const el = {
      style: {},
      getContext: () => null,
      addEventListener: (t, fn) => { if (t === 'load') setTimeout(fn, 1); },
      removeEventListener: () => {},
      set src(v) {
        setTimeout(() => { if (this.onload) this.onload(); }, 1);
      }
    };
    return el;
  }
};
global.HTMLImageElement = function() {};

const animFbxPath = "c:/Users/Rigel/Desktop/Cascadeur/niko-punch-squash-stretch-anim-only.fbx";
const bindFbxPath = "c:/Users/Rigel/Desktop/Cascadeur/niko-cascadeur-clean.fbx";

if (!fs.existsSync(animFbxPath)) {
  console.error(`Animation FBX not found at ${animFbxPath}`);
  process.exit(1);
}
if (!fs.existsSync(bindFbxPath)) {
  console.error(`Bind FBX not found at ${bindFbxPath}`);
  process.exit(1);
}

// 1. Load Niko's in-game model
const nikoBuf = fs.readFileSync("assets/niko/niko.glb");
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

// 2. Load the bind pose reference from niko-cascadeur-clean.fbx
const fbxLoader = new FBXLoader();
const bindBuf = fs.readFileSync(bindFbxPath);
const bindGroup = fbxLoader.parse(bindBuf.buffer.slice(bindBuf.byteOffset, bindBuf.byteOffset + bindBuf.byteLength), "");
const bindBones = {};
bindGroup.traverse((node) => {
  if (node.isBone) {
    const clean = stripMixamo(node.name);
    if (!bindBones[clean] || (node.parent && node.parent.name !== node.name)) {
      bindBones[clean] = node;
    }
  }
});

// 3. Load the new punch animation from niko-punch-squash-stretch-anim-only.fbx
const animBuf = fs.readFileSync(animFbxPath);
const animGroup = fbxLoader.parse(animBuf.buffer.slice(animBuf.byteOffset, animBuf.byteOffset + animBuf.byteLength), "");
const srcClip = animGroup.animations[0];
const animBones = {};
animGroup.traverse((node) => {
  if (node.isBone) {
    const clean = stripMixamo(node.name);
    if (!animBones[clean] || (node.parent && node.parent.name !== node.name)) {
      animBones[clean] = node;
    }
  }
});

const names = Object.keys(bones).filter((name) => bindBones[name] && animBones[name]);
console.log(`Matched deform bones: ${names.length} of ${Object.keys(bones).length}`);

const armAcross = (map) => {
  const left = new THREE.Vector3();
  const right = new THREE.Vector3();
  map.LeftArm.getWorldPosition(left);
  map.RightArm.getWorldPosition(right);
  return left.sub(right).setY(0).normalize();
};

const savedYaw = model.rotation.y;
model.rotation.y = 0;
model.updateMatrixWorld(true);
bindGroup.updateMatrixWorld(true);

const align = new THREE.Quaternion().setFromUnitVectors(armAcross(bindBones), armAcross(bones));
const alignInv = align.clone().invert();
const worldOf = (bone) => bone.getWorldQuaternion(new THREE.Quaternion());

const srcRest = {};
const tgtRest = {};
for (const name of names) {
  srcRest[name] = worldOf(bindBones[name]);
  tgtRest[name] = worldOf(bones[name]);
}

const srcHipRest = new THREE.Vector3();
bindBones.Hips.getWorldPosition(srcHipRest);
const tgtHipRest = bones.Hips.position.clone();
const hipScale = tgtHipRest.y / (Math.abs(srcHipRest.y) > 1e-4 ? srcHipRest.y : 1);
model.rotation.y = savedYaw;

const srcMixer = new THREE.AnimationMixer(animGroup);
srcMixer.clipAction(srcClip).play();

const frames = Math.max(2, Math.round(srcClip.duration * 30));
const times = new Float32Array(frames);
const quats = Object.fromEntries(names.map((name) => [name, new Float32Array(frames * 4)]));
const hips = new Float32Array(frames * 3);
const scales = Object.fromEntries(names.map((name) => [name, new Float32Array(frames * 3)]));
const currSrcHip = new THREE.Vector3();

for (let frame = 0; frame < frames; frame += 1) {
  const time = (srcClip.duration * frame) / (frames - 1);
  times[frame] = time;
  srcMixer.setTime(time);
  animGroup.updateMatrixWorld(true);

  const posed = {};
  for (const name of names) {
    const delta = worldOf(animBones[name]).multiply(srcRest[name].clone().invert());
    posed[name] = align.clone().multiply(delta).multiply(alignInv).multiply(tgtRest[name].clone()).normalize();
  }

  for (const name of names) {
    const parent = bones[name].parent;
    const local = parent && posed[parent.name]
      ? posed[parent.name].clone().invert().multiply(posed[name])
      : posed[name].clone();
    if (frame > 0) {
      const prev = (frame - 1) * 4;
      const values = quats[name];
      const dot = values[prev] * local.x + values[prev + 1] * local.y + values[prev + 2] * local.z + values[prev + 3] * local.w;
      if (dot < 0) local.set(-local.x, -local.y, -local.z, -local.w);
    }
    quats[name].set([local.x, local.y, local.z, local.w], frame * 4);

    const s = animBones[name].scale;
    scales[name][frame * 3] = s.x;
    scales[name][frame * 3 + 1] = s.y;
    scales[name][frame * 3 + 2] = s.z;
  }

  animBones.Hips.getWorldPosition(currSrcHip);
  hips[frame * 3] = tgtHipRest.x;
  hips[frame * 3 + 1] = tgtHipRest.y + (currSrcHip.y - srcHipRest.y) * hipScale;
  hips[frame * 3 + 2] = tgtHipRest.z;
}

const tracks = names.map((name) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, quats[name]));
tracks.push(new THREE.VectorKeyframeTrack("Hips.position", times, hips));

const scaleBones = [];
for (const name of names) {
  const arr = scales[name];
  let hasScale = false;
  for (let i = 0; i < arr.length; i++) {
    if (Math.abs(arr[i] - 1.0) > 0.005) {
      hasScale = true;
      break;
    }
  }
  if (hasScale) {
    tracks.push(new THREE.VectorKeyframeTrack(`${name}.scale`, times, arr));
    scaleBones.push(name);
  }
}
console.log(`Animated squash/stretch scale tracks added for: ${scaleBones.join(", ") || "none"}`);

const retargetedClip = new THREE.AnimationClip("onePunch", srcClip.duration, tracks);

const boneEntries = [];
for (const track of retargetedClip.tracks) {
  const [boneName, prop] = track.name.split(".");
  let b = boneEntries.find((item) => item.name === boneName);
  if (!b) {
    b = { name: boneName };
    boneEntries.push(b);
  }
  if (prop === "quaternion") {
    b.times = Array.from(track.times).map((t) => Math.round(t * 10000) / 10000);
    b.q = Array.from(track.values).map((v) => Math.round(v * 10000) / 10000);
  } else if (prop === "position") {
    b.posTimes = Array.from(track.times).map((t) => Math.round(t * 10000) / 10000);
    b.pos = Array.from(track.values).map((v) => Math.round(v * 10000) / 10000);
  } else if (prop === "scale") {
    b.scaleTimes = Array.from(track.times).map((t) => Math.round(t * 10000) / 10000);
    b.scale = Array.from(track.values).map((v) => Math.round(v * 10000) / 10000);
  }
}

const onePunchExport = {
  name: "onePunch",
  duration: Math.round(retargetedClip.duration * 10000) / 10000,
  bones: boneEntries,
};

const outPath = "assets/niko/one-punch.json";
fs.writeFileSync(outPath, JSON.stringify(onePunchExport));
console.log(`Saved ${outPath}: duration=${onePunchExport.duration}s, bones=${onePunchExport.bones.length}, size=${fs.statSync(outPath).size} bytes`);
