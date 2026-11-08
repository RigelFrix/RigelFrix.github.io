import fs from "fs";
import path from "path";
import * as THREE from "../../vendor/three/three.module.min.js";
import { FBXLoader } from "../fbx/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "../../vendor/three/addons/loaders/GLTFLoader.js";

// Polyfill minimal browser DOM
globalThis.self = globalThis;
global.window = globalThis;
global.document = {
  createElementNS: () => ({ style: {}, addEventListener: (t, fn) => { if (t === 'load') setTimeout(fn, 1); }, removeEventListener: () => {} }),
  createElement: () => ({ style: {}, getContext: () => null, addEventListener: (t, fn) => { if (t === 'load') setTimeout(fn, 1); }, removeEventListener: () => {} })
};
global.HTMLImageElement = function() {};

const bindFbxPath = "assets/niko/niko-cascadeur-clean.fbx";
const idleFbxPath = "assets/niko/idle-animation.fbx";
const runFbxPath = "assets/niko/in place running.fbx";
const stopFbxPath = "assets/niko/running+stopping.fbx";

// 1. Load Niko's in-game model
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

// 2. Load the bind pose reference
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

const names = Object.keys(bones).filter((name) => bindBones[name]);
console.log(`Matched deform bones with bind: ${names.length} of ${Object.keys(bones).length}`);

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

function retargetAndExport(animFbxPath, clipName, outJsonPath, isLoop = false) {
  console.log(`\n--- Retargeting ${animFbxPath} -> ${clipName} ---`);
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

  const srcMixer = new THREE.AnimationMixer(animGroup);
  srcMixer.clipAction(srcClip).play();

  // Use authored frame count or standard 60 fps
  const frames = Math.max(2, Math.round(srcClip.duration * 60));
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
    hips[frame * 3] = tgtHipRest.x + (currSrcHip.x - srcHipRest.x) * hipScale;
    hips[frame * 3 + 1] = tgtHipRest.y + (currSrcHip.y - srcHipRest.y) * hipScale;
    hips[frame * 3 + 2] = tgtHipRest.z; // In-place along Z
  }

  // Check seamless loop for idle
  if (isLoop) {
    const last = (frames - 1) * 4;
    for (const name of names) {
      const qStart = quats[name].slice(0, 4);
      const qEnd = quats[name].slice(last, last + 4);
      const dot = qStart[0] * qEnd[0] + qStart[1] * qEnd[1] + qStart[2] * qEnd[2] + qStart[3] * qEnd[3];
      if (dot < 0.95) {
        console.log(`Loop warning: ${name} dot = ${dot.toFixed(4)}`);
      }
    }
  }

  const tracks = names.map((name) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, quats[name]));
  tracks.push(new THREE.VectorKeyframeTrack("Hips.position", times, hips));

  const retargetedClip = new THREE.AnimationClip(clipName, srcClip.duration, tracks);
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
    }
  }

  const result = {
    name: clipName,
    duration: Math.round(retargetedClip.duration * 10000) / 10000,
    bones: boneEntries,
  };
  fs.writeFileSync(outJsonPath, JSON.stringify(result));
  console.log(`Saved ${outJsonPath}: duration=${result.duration}s, bones=${result.bones.length}, size=${fs.statSync(outJsonPath).size} bytes`);
  return result;
}

retargetAndExport(idleFbxPath, "idle", "assets/niko/cascadeur-idle.json", true);
retargetAndExport(runFbxPath, "run", "assets/niko/cascadeur-run.json", true);
retargetAndExport(stopFbxPath, "stop", "assets/niko/cascadeur-stop.json", false);
