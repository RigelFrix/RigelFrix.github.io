/* Extract sprinting-stop-v3.fbx -> assets/niko/turn-180.json
   Same Cascadeur->Niko retarget as sprint/idle/stop/one-punch (bind + arm-across align).
   Frames 0-40, played on the Cascadeur scene rate (60 fps = 0.667 s, like sprint/stop/idle;
   at that rate the first frames travel at sprint speed). A 30 fps re-bake holds the same
   41 poses, so either file exports the same clip.
     0-25  brake while still travelling forward
     25-30 feet planted, action pose
     31-40 push off the other way -> sprint
   Root motion is taken OUT of the clip and stored beside it:
     yawCurve  true hip heading (0..1 of a full 180); the Hips track keeps only the twist
     root      authored hip travel per frame [forward, left] in model units
   The game plays both back on the root, so root x clip = the authored motion.

   Run from repo root:
     node .impeccable/tools/run-tool.mjs .impeccable/tools/export-turn-180.mjs
   Method and reasons: .agents/skills/niko-animation/SKILL.md
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

const animFbxPath = "assets/niko/sprinting-stop-v3.fbx";
const bindCandidates = [
  "assets/niko/niko-cascadeur-clean.fbx",
  "c:/Users/Rigel/Desktop/Cascadeur/niko-cascadeur-clean.fbx",
];
const outJsonPath = "assets/niko/turn-180.json";
/* Full Cascadeur take — authored frame split below. */
const CUT_START = 0;
let CUT_END = null; // set from FBX duration after load
const PLAY_FPS = 60; // Cascadeur scene rate
const PLANT_END_FRAME = 30; // last forward-skid / action-pose frame
const LAST_FRAME = 40; // reverse accel ends here → blend to sprint

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
const unwrapYaw = (samples) => {
  const out = [samples[0]];
  for (let i = 1; i < samples.length; i += 1) {
    let y = samples[i];
    while (y - out[i - 1] > Math.PI) y -= Math.PI * 2;
    while (y - out[i - 1] < -Math.PI) y += Math.PI * 2;
    out.push(y);
  }
  return out;
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
CUT_END = srcClip.duration;
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
console.log(`FBX span ${CUT_START}..${CUT_END.toFixed(3)}s → playback ${(LAST_FRAME / PLAY_FPS).toFixed(4)}s (frames 0–${LAST_FRAME} @ ${PLAY_FPS}fps)`);
if (names.length < 20) {
  console.error("Too few matched bones — aborting.");
  console.error("bind sample:", Object.keys(bindBones).slice(0, 12).join(", "));
  console.error("anim sample:", Object.keys(animBones).slice(0, 12).join(", "));
  console.error("niko sample:", Object.keys(bones).slice(0, 12).join(", "));
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

const srcDur = CUT_END - CUT_START;
const cutDur = LAST_FRAME / PLAY_FPS;
const frames = LAST_FRAME + 1; // frames 0..40 inclusive
const times = new Float32Array(frames);
const quats = Object.fromEntries(names.map((name) => [name, new Float32Array(frames * 4)]));
const hips = new Float32Array(frames * 3);
const scales = Object.fromEntries(names.map((name) => [name, new Float32Array(frames * 3)]));
const currSrcHip = new THREE.Vector3();

/* Niko's own axes in model space (model yaw 0): left = left hip minus right hip, forward = left x up. */
const UP = new THREE.Vector3(0, 1, 0);
const savedYaw2 = model.rotation.y;
model.rotation.y = 0;
model.updateMatrixWorld(true);
const leftAxis = bones.LeftUpLeg.getWorldPosition(new THREE.Vector3())
  .sub(bones.RightUpLeg.getWorldPosition(new THREE.Vector3()))
  .setY(0)
  .normalize();
model.rotation.y = savedYaw2;
const fwdAxis = leftAxis.clone().cross(UP).normalize();
const yawOf = (v) => Math.atan2(v.x, v.z); // Ry(a) adds a to this
const hipRestInv = tgtRest.Hips.clone().invert();

const headingRaw = []; // hip heading in model space
const hipWorld = []; // Hips model-space rotation per frame
const travel = []; // authored hip position (source units, source world)

const srcMixer = new THREE.AnimationMixer(animGroup);
srcMixer.clipAction(srcClip).play();

for (let frame = 0; frame < frames; frame += 1) {
  const u = frame / (frames - 1);
  const srcTime = CUT_START + u * srcDur;
  times[frame] = u * cutDur;
  srcMixer.setTime(Math.min(srcTime, srcClip.duration - 1e-4));
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

  /* The root carries planar travel; the clip keeps only the vertical bob. */
  animBones.Hips.getWorldPosition(currSrcHip);
  hips[frame * 3] = tgtHipRest.x;
  hips[frame * 3 + 1] = tgtHipRest.y + (currSrcHip.y - srcHipRest.y) * hipScale;
  hips[frame * 3 + 2] = tgtHipRest.z;
  travel.push(currSrcHip.clone());

  hipWorld.push(posed.Hips.clone());
  const across = leftAxis.clone().applyQuaternion(posed.Hips.clone().multiply(hipRestInv)).setY(0);
  headingRaw.push(yawOf(across));
}

/* ——— Root yaw ———
   True heading of the hip line, unwrapped. The root takes the part that only ever grows
   (running maximum), scaled so the last frame is exactly half a turn; whatever is left
   (sprint-sized hip twist) stays in the Hips track. Root x Hips is the authored rotation
   on every frame, so there is nothing for a blend to unwind at the end. */
const heading = unwrapYaw(headingRaw);
const restHeading = yawOf(leftAxis);
const turned = heading.at(-1) - heading[0];
const authoredSign = Math.sign(turned) || -1;
const progress = [];
let peak = 0;
for (let i = 0; i < frames; i += 1) {
  peak = Math.max(peak, authoredSign * (heading[i] - heading[0]));
  progress.push(peak);
}
const yawCurve = progress.map((v) => round(v / progress.at(-1)));
yawCurve[0] = 0;
yawCurve[yawCurve.length - 1] = 1;
const yawSpan = authoredSign * Math.PI;

const rootInv = new THREE.Quaternion();
const twisted = new THREE.Quaternion();
const twistDeg = [];
for (let frame = 0; frame < frames; frame += 1) {
  const o = frame * 4;
  rootInv.setFromAxisAngle(UP, -yawSpan * yawCurve[frame]);
  twisted.copy(rootInv).multiply(hipWorld[frame]).normalize();
  if (frame > 0) {
    const prev = o - 4;
    const dot = quats.Hips[prev] * twisted.x + quats.Hips[prev + 1] * twisted.y + quats.Hips[prev + 2] * twisted.z + quats.Hips[prev + 3] * twisted.w;
    if (dot < 0) twisted.set(-twisted.x, -twisted.y, -twisted.z, -twisted.w);
  }
  quats.Hips.set([twisted.x, twisted.y, twisted.z, twisted.w], o);
  const left = leftAxis.clone().applyQuaternion(twisted.clone().multiply(hipRestInv)).setY(0);
  let twist = yawOf(left) - restHeading;
  twist = Math.atan2(Math.sin(twist), Math.cos(twist));
  twistDeg.push((twist * 180) / Math.PI);
}

/* ——— Root travel ———
   Authored hip path from frame 0, turned into Niko's model space the same way the
   rotations are, split into [forward, left] and scaled by the leg-length ratio. */
const root = [];
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

const boneEntries = names.map((name) => {
  const entry = {
    name,
    times: Array.from(times).map(round),
    q: Array.from(quats[name]).map(round),
  };
  if (name === "Hips") {
    entry.posTimes = Array.from(times).map(round);
    entry.pos = Array.from(hips).map(round);
  }
  const arr = scales[name];
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

const result = {
  name: "turn180",
  duration: round(cutDur),
  source: "sprinting-stop-v3.fbx",
  cut: [CUT_START, CUT_END],
  srcDuration: round(srcDur),
  fps: PLAY_FPS,
  plantEndFrame: PLANT_END_FRAME,
  apexFrame,
  lastFrame: LAST_FRAME,
  yawDeltaDeg: round((yawSpan * 180) / Math.PI),
  yawCurve,
  root,
  bones: boneEntries,
};
fs.writeFileSync(outJsonPath, JSON.stringify(result));

const deg = (r) => (r * 180) / Math.PI;
const ys = [];
for (let i = 1; i < hips.length; i += 3) ys.push(hips[i]);
const perSec = (a, b) => Math.hypot(root[b * 2] - root[a * 2], root[b * 2 + 1] - root[a * 2 + 1]) * PLAY_FPS / (b - a);
console.log(`Saved ${outJsonPath} (${fs.statSync(outJsonPath).size} bytes)`);
console.log(`  duration=${result.duration}s bones=${boneEntries.length} hipRest=(${tgtHipRest.x.toFixed(4)}, ${tgtHipRest.y.toFixed(4)}, ${tgtHipRest.z.toFixed(4)})`);
console.log(`  axes: forward=(${fwdAxis.x.toFixed(2)}, ${fwdAxis.z.toFixed(2)}) left=(${leftAxis.x.toFixed(2)}, ${leftAxis.z.toFixed(2)})`);
console.log(`  authored hip heading turned ${deg(turned).toFixed(1)}°; root yawDelta=${result.yawDeltaDeg}°`);
console.log(`  root yaw per frame: ${yawCurve.map((v) => (v * result.yawDeltaDeg).toFixed(0)).join(" ")}`);
console.log(`  hip twist left in clip: ${twistDeg.map((v) => v.toFixed(0)).join(" ")}`);
console.log(`  root forward (model units): ${root.filter((_, i) => i % 2 === 0).map((v) => v.toFixed(2)).join(" ")}`);
console.log(`  root left    (model units): ${root.filter((_, i) => i % 2 === 1).map((v) => v.toFixed(2)).join(" ")}`);
console.log(`  apex frame ${apexFrame} (${apexFwd.toFixed(3)} model units); speed in ${perSec(0, 1).toFixed(2)} out ${perSec(LAST_FRAME - 1, LAST_FRAME).toFixed(2)} model units/s`);
console.log(`  hipY ${Math.min(...ys).toFixed(3)}..${Math.max(...ys).toFixed(3)}`);
