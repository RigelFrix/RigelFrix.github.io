import fs from "fs";
import * as THREE from "../../vendor/three/three.module.min.js";
import { FBXLoader } from "../fbx/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "../../vendor/three/addons/loaders/GLTFLoader.js";

globalThis.self = globalThis;
const nikoBuf = fs.readFileSync("assets/niko/niko.glb");
const gltfLoader = new GLTFLoader();
const gltf = await gltfLoader.parseAsync(nikoBuf.buffer.slice(nikoBuf.byteOffset, nikoBuf.byteOffset + nikoBuf.byteLength), "");
const model = gltf.scene;

const bones = {};
model.traverse((node) => {
  if (node.isBone) bones[node.name] = node;
});

const fbxBuf = fs.readFileSync("Flying Knee Punch Combo.fbx");
const fbxLoader = new FBXLoader();
const sourceGroup = fbxLoader.parse(fbxBuf.buffer.slice(fbxBuf.byteOffset, fbxBuf.byteOffset + fbxBuf.byteLength), "");
const srcClip = sourceGroup.animations[0];

const stripMixamo = (name) => name.replace(/^mixamorig\d*:?/, "");
const srcBones = {};
sourceGroup.traverse((node) => {
  if (node.isBone) srcBones[stripMixamo(node.name)] = node;
});

const names = Object.keys(bones).filter((name) => srcBones[name]);

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
sourceGroup.updateMatrixWorld(true);
const align = new THREE.Quaternion().setFromUnitVectors(armAcross(srcBones), armAcross(bones));
const alignInv = align.clone().invert();
const worldOf = (bone) => bone.getWorldQuaternion(new THREE.Quaternion());
const srcRest = {};
const tgtRest = {};
for (const name of names) {
  srcRest[name] = worldOf(srcBones[name]);
  tgtRest[name] = worldOf(bones[name]);
}
const srcHipRest = srcBones.Hips.position.clone();
const tgtHipRest = bones.Hips.position.clone();
const hipScale = tgtHipRest.y / (Math.abs(srcHipRest.y) > 1e-4 ? srcHipRest.y : 1);
model.rotation.y = savedYaw;

const srcMixer = new THREE.AnimationMixer(sourceGroup);
srcMixer.clipAction(srcClip).play();
const frames = Math.max(2, Math.round(srcClip.duration * 30));
const times = new Float32Array(frames);
const quats = Object.fromEntries(names.map((name) => [name, new Float32Array(frames * 4)]));
const hips = new Float32Array(frames * 3);

// In Flying Knee Punch Combo:
// Let's check hips motion:
for (let frame = 0; frame < frames; frame += 1) {
  const time = (srcClip.duration * frame) / (frames - 1);
  times[frame] = time;
  srcMixer.setTime(time);
  sourceGroup.updateMatrixWorld(true);
  const posed = {};
  for (const name of names) {
    const delta = worldOf(srcBones[name]).multiply(srcRest[name].clone().invert());
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
  }
  hips[frame * 3] = tgtHipRest.x;
  hips[frame * 3 + 1] = tgtHipRest.y + (srcBones.Hips.position.y - srcHipRest.y) * hipScale;
  hips[frame * 3 + 2] = tgtHipRest.z;
}

const outTracks = names.map((name) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, quats[name]));
outTracks.push(new THREE.VectorKeyframeTrack("Hips.position", times, hips));
const retargetedClip = new THREE.AnimationClip("punch", srcClip.duration, outTracks);

console.log("Retargeted clip successfully created!");
console.log("Duration:", retargetedClip.duration, "tracks:", retargetedClip.tracks.length);

const testMixer = new THREE.AnimationMixer(model);
const action = testMixer.clipAction(retargetedClip);
action.play();

console.log("Evaluating Niko's retargeted limbs over time:");
for (let t = 0; t <= retargetedClip.duration; t += 0.25) {
  testMixer.setTime(t);
  model.updateMatrixWorld(true);
  const pHips = new THREE.Vector3();
  const pRHand = new THREE.Vector3();
  const pRKnee = new THREE.Vector3();
  bones.Hips.getWorldPosition(pHips);
  bones.RightHand.getWorldPosition(pRHand);
  bones.RightLeg.getWorldPosition(pRKnee);
  console.log(`t=${t.toFixed(2)}s: Hips y=${pHips.y.toFixed(3)} | Knee y=${pRKnee.y.toFixed(3)}, z=${pRKnee.z.toFixed(3)} | Fist y=${pRHand.y.toFixed(3)}, z=${pRHand.z.toFixed(3)}`);
}

