/* Extract sprinting-stop-v3-3.fbx -> assets/niko/stop.json + stop-mirror.json
   Cascadeur->Niko retarget (bind + arm-across align). Frames 0–39 @ 60 fps (0.650 s).
   Authored take is left-lead. stop-mirror.json mirrors in SOURCE space (Cascadeur +Z /
   left +X, M=diag(-1,1,1)), remaps L↔R, then retargets — mirroring after retarget in Niko
   space collapsed lateral foot spread. Do not runtime-mirror local tracks.

   Run from repo root:
     node .impeccable/tools/run-tool.mjs .impeccable/tools/export-stop.mjs
*/
import fs from "fs";
import * as THREE from "../../vendor/three/three.module.min.js";
import { FBXLoader } from "../fbx/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "../../vendor/three/addons/loaders/GLTFLoader.js";

globalThis.self = globalThis;
global.window = globalThis;
global.document = {
  createElementNS: () => {
    const el = {
      style: {},
      addEventListener: (t, fn) => { if (t === "load") setTimeout(fn, 1); },
      removeEventListener: () => {},
    };
    setTimeout(() => { if (el.onload) el.onload(); }, 1);
    return el;
  },
  createElement: () => {
    const el = {
      style: {},
      getContext: () => null,
      addEventListener: (t, fn) => { if (t === "load") setTimeout(fn, 1); },
      removeEventListener: () => {},
      set src(v) {
        setTimeout(() => { if (this.onload) this.onload(); }, 1);
      },
    };
    return el;
  },
};
global.HTMLImageElement = function () {};

const animFbxPath = "assets/niko/sprinting-stop-v3-3.fbx";
const bindCandidates = [
  "assets/niko/niko-cascadeur-clean.fbx",
  "c:/Users/Rigel/Desktop/Cascadeur/niko-cascadeur-clean.fbx",
];
const outJsonPath = "assets/niko/stop.json";
const outMirrorPath = "assets/niko/stop-mirror.json";
const PLAY_FPS = 60;
const LAST_FRAME = 39; // 40 keys (0..39); file already at 60 fps
const PLANT_FRAME = 10; // RF along flattens ~f9–20 in the probe

const bindFbxPath = bindCandidates.find((p) => fs.existsSync(p));
if (!fs.existsSync(animFbxPath)) {
  console.error(`Missing ${animFbxPath}`);
  process.exit(1);
}
if (!bindFbxPath) {
  console.error(`Missing Cascadeur bind FBX (tried: ${bindCandidates.join(", ")})`);
  process.exit(1);
}

const stripMixamo = (name) => name.replace(/^mixamorig\d*:?/, "");
const round = (n) => Math.round(n * 10000) / 10000;
const sideOf = (name) => {
  if (name.startsWith("Left")) return `Right${name.slice(4)}`;
  if (name.startsWith("Right")) return `Left${name.slice(5)}`;
  return name;
};

const nikoBuf = fs.readFileSync("assets/niko/niko.glb");
const gltf = await new GLTFLoader().parseAsync(
  nikoBuf.buffer.slice(nikoBuf.byteOffset, nikoBuf.byteOffset + nikoBuf.byteLength),
  "",
);
const model = gltf.scene;
model.traverse((node) => {
  if (node.isBone) node.name = stripMixamo(node.name);
});
const bones = {};
model.traverse((node) => {
  if (node.isBone) bones[node.name] = node;
});

const fbxLoader = new FBXLoader();
const bindBuf = fs.readFileSync(bindFbxPath);
const bindGroup = fbxLoader.parse(bindBuf.buffer.slice(bindBuf.byteOffset, bindBuf.byteOffset + bindBuf.byteLength), "");
const bindBones = {};
bindGroup.traverse((node) => {
  if (!node.isBone) return;
  const clean = stripMixamo(node.name);
  if (!bindBones[clean] || (node.parent && stripMixamo(node.parent.name) !== clean)) {
    bindBones[clean] = node;
  }
});

const animBuf = fs.readFileSync(animFbxPath);
const animGroup = fbxLoader.parse(animBuf.buffer.slice(animBuf.byteOffset, animBuf.byteOffset + animBuf.byteLength), "");
const srcClip = animGroup.animations[0];
const animBones = {};
animGroup.traverse((node) => {
  if (!node.isBone) return;
  const clean = stripMixamo(node.name);
  if (!animBones[clean] || (node.parent && stripMixamo(node.parent.name) !== clean)) {
    animBones[clean] = node;
  }
});

const names = Object.keys(bones).filter((name) => bindBones[name] && animBones[name]);
console.log(`FBX "${srcClip.name}" duration=${srcClip.duration}s matched=${names.length}/${Object.keys(bones).length}`);
console.log(`Bind: ${bindFbxPath}`);
if (names.length < 20) {
  console.error("Too few matched bones — aborting.");
  process.exit(1);
}

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

const cutDur = LAST_FRAME / PLAY_FPS;
const frames = LAST_FRAME + 1;
const times = new Float32Array(frames);
const quats = Object.fromEntries(names.map((name) => [name, new Float32Array(frames * 4)]));
const quatsM = Object.fromEntries(names.map((name) => [name, new Float32Array(frames * 4)]));
const hips = new Float32Array(frames * 3);
const hipsM = new Float32Array(frames * 3);
const scales = Object.fromEntries(names.map((name) => [name, new Float32Array(frames * 3)]));
const scalesM = Object.fromEntries(names.map((name) => [name, new Float32Array(frames * 3)]));
const currSrcHip = new THREE.Vector3();

const UP = new THREE.Vector3(0, 1, 0);
model.rotation.y = 0;
model.updateMatrixWorld(true);
const leftAxis = bones.LeftUpLeg.getWorldPosition(new THREE.Vector3())
  .sub(bones.RightUpLeg.getWorldPosition(new THREE.Vector3()))
  .setY(0)
  .normalize();
model.rotation.y = savedYaw;
const fwdAxis = leftAxis.clone().cross(UP).normalize();

/*
 * Mirror in Cascadeur/Mixamo SOURCE space (facing +Z, left = +X): M = diag(-1,1,1).
 * Reflect source world rotations, remap L↔R, THEN retarget onto Niko. Mirroring after
 * retarget in Niko space (Z-flip) collapsed lateral foot spread — wrong for this chain.
 */
const _mScale = new THREE.Matrix4().makeScale(-1, 1, 1);
const _rMat = new THREE.Matrix4();
const _mirMat = new THREE.Matrix4();
const mirrorSrcQuat = (q, out = new THREE.Quaternion()) => {
  _rMat.makeRotationFromQuaternion(q);
  _mirMat.copy(_mScale).multiply(_rMat).multiply(_mScale);
  return out.setFromRotationMatrix(_mirMat).normalize();
};

const travel = [];
const travelM = [];
const srcMixer = new THREE.AnimationMixer(animGroup);
srcMixer.clipAction(srcClip).play();
const _local = new THREE.Quaternion();
const _srcWorld = new THREE.Quaternion();
const _srcMir = new THREE.Quaternion();
const _hipMir = new THREE.Vector3();

const writeLocals = (posedMap, quatOut, frame) => {
  for (const name of names) {
    const parent = bones[name].parent;
    const parentPose = parent && posedMap[parent.name];
    if (parentPose) {
      _local.copy(parentPose).invert().multiply(posedMap[name]);
    } else {
      _local.copy(posedMap[name]);
    }
    if (frame > 0) {
      const prev = (frame - 1) * 4;
      const values = quatOut[name];
      const dot = values[prev] * _local.x + values[prev + 1] * _local.y
        + values[prev + 2] * _local.z + values[prev + 3] * _local.w;
      if (dot < 0) _local.set(-_local.x, -_local.y, -_local.z, -_local.w);
    }
    quatOut[name].set([_local.x, _local.y, _local.z, _local.w], frame * 4);
  }
};

const retargetFromSrcWorld = (srcWorldOf) => {
  const posed = {};
  for (const name of names) {
    const delta = srcWorldOf(name).multiply(srcRest[name].clone().invert());
    posed[name] = align.clone().multiply(delta).multiply(alignInv).multiply(tgtRest[name].clone()).normalize();
  }
  return posed;
};

for (let frame = 0; frame < frames; frame += 1) {
  const u = frame / (frames - 1);
  const srcTime = u * srcClip.duration;
  times[frame] = u * cutDur;
  srcMixer.setTime(Math.min(srcTime, srcClip.duration - 1e-4));
  animGroup.updateMatrixWorld(true);

  /* Authored (left-lead) retarget. */
  const posed = retargetFromSrcWorld((name) => worldOf(animBones[name]));
  writeLocals(posed, quats, frame);

  /* Mirror: source world → flip X → L↔R bone remap → retarget. */
  const srcMirWorld = {};
  for (const name of names) {
    srcMirWorld[sideOf(name)] = mirrorSrcQuat(worldOf(animBones[name]), new THREE.Quaternion());
  }
  /* Rest must be mirrored the same way so delta is a pure motion mirror. */
  const srcRestMir = {};
  for (const name of names) {
    srcRestMir[sideOf(name)] = mirrorSrcQuat(srcRest[name], new THREE.Quaternion());
  }
  const posedM = {};
  for (const name of names) {
    const delta = srcMirWorld[name].clone().multiply(srcRestMir[name].clone().invert());
    posedM[name] = align.clone().multiply(delta).multiply(alignInv).multiply(tgtRest[name].clone()).normalize();
  }
  writeLocals(posedM, quatsM, frame);

  for (const name of names) {
    const s = animBones[name].scale;
    scales[name][frame * 3] = s.x;
    scales[name][frame * 3 + 1] = s.y;
    scales[name][frame * 3 + 2] = s.z;
    const dest = sideOf(name);
    scalesM[dest][frame * 3] = s.x;
    scalesM[dest][frame * 3 + 1] = s.y;
    scalesM[dest][frame * 3 + 2] = s.z;
  }

  animBones.Hips.getWorldPosition(currSrcHip);
  /* Root carries planar travel; clip keeps vertical bob only. */
  hips[frame * 3] = tgtHipRest.x;
  hips[frame * 3 + 1] = tgtHipRest.y + (currSrcHip.y - srcHipRest.y) * hipScale;
  hips[frame * 3 + 2] = tgtHipRest.z;
  hipsM[frame * 3] = tgtHipRest.x;
  hipsM[frame * 3 + 1] = hips[frame * 3 + 1];
  hipsM[frame * 3 + 2] = tgtHipRest.z;
  travel.push(currSrcHip.clone());
  /* Source hip mirrored in X (Cascadeur left). */
  _hipMir.set(-currSrcHip.x, currSrcHip.y, currSrcHip.z);
  travelM.push(_hipMir.clone());
}

const root = [];
const rootM = [];
const rel = new THREE.Vector3();
let apexFrame = 0;
let apexFwd = 0;
for (let frame = 0; frame < frames; frame += 1) {
  rel.copy(travel[frame]).sub(travel[0]).setY(0).applyQuaternion(align);
  const f = rel.dot(fwdAxis) * hipScale;
  const l = rel.dot(leftAxis) * hipScale;
  root.push(round(f), round(l));
  if (f > apexFwd) {
    apexFwd = f;
    apexFrame = frame;
  }
}
for (let frame = 0; frame < frames; frame += 1) {
  rel.copy(travelM[frame]).sub(travelM[0]).setY(0).applyQuaternion(align);
  rootM.push(round(rel.dot(fwdAxis) * hipScale), round(rel.dot(leftAxis) * hipScale));
}

const buildEntries = (quatMap, hipArr, scaleMap) => names.map((name) => {
  const entry = {
    name,
    times: Array.from(times).map(round),
    q: Array.from(quatMap[name]).map(round),
  };
  if (name === "Hips") {
    entry.posTimes = Array.from(times).map(round);
    entry.pos = Array.from(hipArr).map(round);
  }
  const arr = scaleMap[name];
  let hasScale = false;
  for (let i = 0; i < arr.length; i += 1) {
    if (Math.abs(arr[i] - 1) > 0.005) {
      hasScale = true;
      break;
    }
  }
  if (hasScale) {
    entry.scaleTimes = Array.from(times).map(round);
    entry.scale = Array.from(arr).map(round);
  }
  return entry;
});

const writeClip = (path, clipName, rootTrack, boneEntries, lead) => {
  const result = {
    name: clipName,
    duration: round(cutDur),
    source: "sprinting-stop-v3-3.fbx",
    mirror: lead === "R",
    authoredLead: lead,
    fps: PLAY_FPS,
    plantFrame: PLANT_FRAME,
    apexFrame,
    lastFrame: LAST_FRAME,
    root: rootTrack,
    bones: boneEntries,
  };
  fs.writeFileSync(path, JSON.stringify(result));
  console.log(`Saved ${path} (${fs.statSync(path).size} bytes) lead=${lead}`);
  return result;
};

const boneEntries = buildEntries(quats, hips, scales);
const boneEntriesM = buildEntries(quatsM, hipsM, scalesM);
const result = writeClip(outJsonPath, "stop", root, boneEntries, "L");
writeClip(outMirrorPath, "stopMirror", rootM, boneEntriesM, "R");

const perSec = (a, b) => Math.hypot(root[b * 2] - root[a * 2], root[b * 2 + 1] - root[a * 2 + 1]) * PLAY_FPS / (b - a);
const ys = [];
for (let i = 1; i < hips.length; i += 3) ys.push(hips[i]);
console.log(`  duration=${result.duration}s bones=${boneEntries.length}`);
console.log(`  axes: forward=(${fwdAxis.x.toFixed(2)}, ${fwdAxis.z.toFixed(2)}) left=(${leftAxis.x.toFixed(2)}, ${leftAxis.z.toFixed(2)})`);
console.log(`  root forward: ${root.filter((_, i) => i % 2 === 0).map((v) => v.toFixed(2)).join(" ")}`);
console.log(`  root left:    ${root.filter((_, i) => i % 2 === 1).map((v) => v.toFixed(2)).join(" ")}`);
console.log(`  rootM left:   ${rootM.filter((_, i) => i % 2 === 1).map((v) => v.toFixed(2)).join(" ")}`);
console.log(`  apex frame ${apexFrame} (${apexFwd.toFixed(3)} model); speed in ${perSec(0, 1).toFixed(2)} out ${perSec(LAST_FRAME - 1, LAST_FRAME).toFixed(2)} model units/s`);
console.log(`  plant frame ${PLANT_FRAME}; hipY ${Math.min(...ys).toFixed(3)}..${Math.max(...ys).toFixed(3)}`);
