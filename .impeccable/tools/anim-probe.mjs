/* Measure a source animation before exporting it. Pure geometry in the FBX's own world space,
   so nothing here depends on the retarget being right.

   Run from the repo root:
     node .impeccable/tools/run-tool.mjs .impeccable/tools/anim-probe.mjs <anim.fbx> [options]

   Options
     --frames N            frame count minus one (default: key count - 1)
     --plant rf:16-38,lf:23-31   report how far a foot moves inside a frame window
     --clips sprint,stop   also print the hip heading of assets/niko/<name>.json (what a blend hands off to)
     --scale 2.176         world units per model unit (state.turn180Scale in game)
     --quiet               summary only, no per-frame table

   What to read from it
     key dt / fps          the timing the file was baked at (not necessarily the authored timing)
     along, step           root travel along the run-in direction; step x fps = speed
     hipYaw, chestYaw      true heading of the hip line and the shoulder line, relative to frame 0
     LF/RF along, y        feet; a foot is planted while along stays flat and y stays low
*/
import fs from "fs";
import * as THREE from "../../vendor/three/three.module.min.js";
import { FBXLoader } from "../fbx/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "../../vendor/three/addons/loaders/GLTFLoader.js";

globalThis.self = globalThis;
global.window = globalThis;
const stubEl = () => {
  const el = {
    style: {},
    getContext: () => null,
    addEventListener: (t, fn) => { if (t === "load") setTimeout(fn, 1); },
    removeEventListener: () => {},
    set src(v) { setTimeout(() => { if (this.onload) this.onload(); }, 1); },
  };
  setTimeout(() => { if (el.onload) el.onload(); }, 1);
  return el;
};
global.document = { createElementNS: stubEl, createElement: stubEl };
global.HTMLImageElement = function () {};

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const flagNames = ["frames", "plant", "clips", "scale"];
const file = args.find((a, i) => !a.startsWith("--") && !flagNames.includes((args[i - 1] || "").slice(2)));
if (!file || !fs.existsSync(file)) {
  console.error("Usage: node .impeccable/tools/run-tool.mjs .impeccable/tools/anim-probe.mjs <anim.fbx> [--frames N] [--plant rf:16-38,lf:23-31] [--clips sprint,stop] [--scale 2.176] [--quiet]");
  process.exit(1);
}
const QUIET = args.includes("--quiet");
const WORLD_PER_MODEL = Number(flag("scale", 2.176));
const bindPath = ["assets/niko/niko-cascadeur-clean.fbx", "c:/Users/Rigel/Desktop/Cascadeur/niko-cascadeur-clean.fbx"].find((p) => fs.existsSync(p));

const strip = (n) => n.replace(/^mixamorig\d*:?/, "");
const deg = (r) => (r * 180) / Math.PI;
const pad = (v, n = 8, d = 1) => (typeof v === "number" ? v.toFixed(d) : String(v)).padStart(n);
const loadFbx = (path) => {
  const buf = fs.readFileSync(path);
  return new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
};
const boneMap = (group) => {
  const map = {};
  group.traverse((n) => {
    if (!n.isBone) return;
    const c = strip(n.name);
    if (!map[c] || (n.parent && strip(n.parent.name) !== c)) map[c] = n;
  });
  return map;
};
const wp = (bone) => bone.getWorldPosition(new THREE.Vector3());
/* Heading of a left/right joint pair seen from above. Turning the body by Ry(a) adds a. */
const headingOf = (left, right) => {
  const a = wp(left).sub(wp(right)).setY(0);
  return Math.atan2(a.x, a.z);
};
const unwrap = (list) => {
  const out = [list[0]];
  for (let i = 1; i < list.length; i += 1) {
    let y = list[i];
    while (y - out[i - 1] > Math.PI) y -= Math.PI * 2;
    while (y - out[i - 1] < -Math.PI) y += Math.PI * 2;
    out.push(y);
  }
  return out;
};

/* ——— Source clip ——— */
const group = loadFbx(file);
const clip = group.animations[0];
const bones = boneMap(group);
const hipTrack = clip.tracks.find((t) => /Hips\.quaternion$/.test(t.name));
const keyDt = hipTrack.times.length > 1 ? hipTrack.times[1] - hipTrack.times[0] : 0;
const frames = Number(flag("frames", hipTrack.times.length - 1));
console.log(`\n=== ${file}`);
console.log(`clip "${clip.name}"  duration ${clip.duration.toFixed(4)} s  hip keys ${hipTrack.times.length}  key dt ${keyDt.toFixed(4)} s (${(1 / keyDt).toFixed(1)} fps in the file)`);

const mixer = new THREE.AnimationMixer(group);
mixer.clipAction(clip).play();
const rows = [];
for (let f = 0; f <= frames; f += 1) {
  mixer.setTime(Math.min((f / frames) * clip.duration, clip.duration - 1e-5));
  group.updateMatrixWorld(true);
  rows.push({
    hip: wp(bones.Hips),
    hipYaw: headingOf(bones.LeftUpLeg, bones.RightUpLeg),
    chestYaw: headingOf(bones.LeftArm, bones.RightArm),
    lf: wp(bones.LeftFoot),
    rf: wp(bones.RightFoot),
  });
}
const hipU = unwrap(rows.map((r) => r.hipYaw));
const chestU = unwrap(rows.map((r) => r.chestYaw));

/* Run-in direction = hip travel over the first frames; an in-place clip falls back to the hip line's forward. */
const lead = Math.min(4, frames);
const travel = rows[lead].hip.clone().sub(rows[0].hip).setY(0);
const inPlace = travel.length() < 1e-3 * Math.max(1, rows[0].hip.y);
const dir = inPlace
  ? new THREE.Vector3(Math.sin(rows[0].hipYaw - Math.PI / 2), 0, Math.cos(rows[0].hipYaw - Math.PI / 2))
  : travel.clone().normalize();
const side = new THREE.Vector3(dir.z, 0, -dir.x); // left of the run-in direction
console.log(inPlace
  ? "in-place clip: no root travel, axes taken from the hip line"
  : `run-in direction (${dir.x.toFixed(3)}, ${dir.z.toFixed(3)}), ${travel.length().toFixed(2)} source units over the first ${lead} frames`);

const along = rows.map((r) => r.hip.clone().sub(rows[0].hip).dot(dir));
const sideways = rows.map((r) => r.hip.clone().sub(rows[0].hip).dot(side));
if (!QUIET) {
  console.log("  f    along    side    hipY    step  hipYaw chestYaw   LF along/side/y           RF along/side/y");
  rows.forEach((r, i) => {
    const lf = r.lf.clone().sub(rows[0].hip);
    const rf = r.rf.clone().sub(rows[0].hip);
    console.log(
      pad(i, 3, 0), pad(along[i]), pad(sideways[i]), pad(r.hip.y), pad(i ? along[i] - along[i - 1] : 0, 7, 2),
      pad(deg(hipU[i] - hipU[0]), 7), pad(deg(chestU[i] - chestU[0]), 8),
      " ", pad(lf.dot(dir), 7), pad(lf.dot(side), 7), pad(r.lf.y, 6),
      " ", pad(rf.dot(dir), 7), pad(rf.dot(side), 7), pad(r.rf.y, 6),
    );
  });
}

/* ——— Scale: source units -> Niko model units -> world units ——— */
let srcToWorld = null;
let nikoBones = null;
let nikoScene = null;
if (bindPath) {
  const bind = loadFbx(bindPath);
  bind.updateMatrixWorld(true);
  const bb = boneMap(bind);
  const nikoBuf = fs.readFileSync("assets/niko/niko.glb");
  const gltf = await new GLTFLoader().parseAsync(nikoBuf.buffer.slice(nikoBuf.byteOffset, nikoBuf.byteOffset + nikoBuf.byteLength), "");
  nikoScene = gltf.scene;
  nikoScene.updateMatrixWorld(true);
  nikoBones = boneMap(nikoScene);
  const hipScale = nikoBones.Hips.position.y / wp(bb.Hips).y;
  srcToWorld = hipScale * WORLD_PER_MODEL;
  console.log(`\nbind ${bindPath}`);
  console.log(`  bind hips y ${wp(bb.Hips).y.toFixed(2)}, Niko hips y ${nikoBones.Hips.position.y.toFixed(4)}  ->  hipScale ${hipScale.toFixed(5)}; x ${WORLD_PER_MODEL} = ${srcToWorld.toFixed(5)} world units per source unit`);
} else {
  console.log("\n(no bind FBX found: speeds and drift stay in source units)");
}
const unit = srcToWorld ? "world units" : "source units";
const k = srcToWorld || 1;

/* ——— Summary ——— */
let apex = 0;
along.forEach((v, i) => { if (v > along[apex]) apex = i; });
const stepAt = (a, b) => Math.hypot(along[b] - along[a], sideways[b] - sideways[a]) / (b - a);
console.log("\nSummary");
console.log(`  hip heading turned ${deg(hipU.at(-1) - hipU[0]).toFixed(1)}°, chest ${deg(chestU.at(-1) - chestU[0]).toFixed(1)}° (a "180" that stops short leaves the rest to the exit blend)`);
if (!inPlace) {
  console.log(`  travel apex at frame ${apex}: ${(along[apex] * k).toFixed(3)} ${unit}; ends at ${(along.at(-1) * k).toFixed(3)}`);
  for (const fps of [30, 60]) {
    console.log(`  at ${fps} fps: ${(frames / fps).toFixed(3)} s, enters at ${(stepAt(0, 1) * k * fps).toFixed(2)} and leaves at ${(stepAt(frames - 1, frames) * k * fps).toFixed(2)} ${unit}/s`);
  }
  if (srcToWorld) console.log("  game speeds: jog 4.6, sprint 10.5. The timing whose entry speed matches the state the clip starts from is the authored one.");
}

/* ——— Planted feet ——— */
const plant = flag("plant");
if (plant) {
  console.log("\nPlanted foot drift (largest distance from where the foot is at the start of the window)");
  for (const item of plant.split(",")) {
    const [key, range] = item.split(":");
    const [f0, f1] = range.split("-").map(Number);
    const foot = key.trim().toLowerCase() === "lf" ? "lf" : "rf";
    let worst = 0;
    for (let f = f0; f <= Math.min(f1, frames); f += 1) {
      const d = rows[f][foot].clone().sub(rows[f0][foot]).setY(0).length();
      worst = Math.max(worst, d);
    }
    console.log(`  ${foot} f${f0}–${f1}: ${(worst * k).toFixed(3)} ${unit}`);
  }
}

/* ——— Niko rest + exported clips ——— */
if (nikoBones) {
  const chain = [];
  for (let n = nikoBones.Hips.parent; n; n = n.parent) {
    const e = new THREE.Euler().setFromQuaternion(n.quaternion, "YXZ");
    chain.push(`${n.name || n.type}[rot y/x/z ${deg(e.y).toFixed(1)}/${deg(e.x).toFixed(1)}/${deg(e.z).toFixed(1)}, scale ${n.scale.x.toFixed(3)}]`);
  }
  console.log(`\nNiko Hips parents: ${chain.join(" <- ")}`);
  console.log("  (all identity = the Hips track is a model-space rotation, so a root yaw can be taken out with Ry(-yaw) x hips)");

  const clips = flag("clips");
  if (clips) {
    const restQ = nikoBones.Hips.getWorldQuaternion(new THREE.Quaternion());
    const leftRest = wp(nikoBones.LeftUpLeg).sub(wp(nikoBones.RightUpLeg)).setY(0).normalize();
    const restYaw = Math.atan2(leftRest.x, leftRest.z);
    console.log("\nHip heading left in exported clips, relative to Niko's rest (what the next clip must match)");
    for (const name of clips.split(",")) {
      const path = `assets/niko/${name.trim()}.json`;
      if (!fs.existsSync(path)) {
        console.log(`  ${path}: missing`);
        continue;
      }
      const data = JSON.parse(fs.readFileSync(path, "utf8"));
      const hips = data.bones.find((b) => b.name === "Hips");
      const yaw = [];
      for (let i = 0; i < hips.times.length; i += 1) {
        const q = new THREE.Quaternion(hips.q[i * 4], hips.q[i * 4 + 1], hips.q[i * 4 + 2], hips.q[i * 4 + 3]);
        const a = leftRest.clone().applyQuaternion(q.multiply(restQ.clone().invert())).setY(0);
        yaw.push(Math.atan2(a.x, a.z) - restYaw);
      }
      const d = unwrap(yaw).map(deg);
      const dt = hips.times.length > 1 ? hips.times[1] - hips.times[0] : 0;
      console.log(`  ${name.trim()}.json  ${data.duration}s, ${d.length} keys (${dt > 0 ? (1 / dt).toFixed(0) : "?"} fps)  min ${Math.min(...d).toFixed(1)}° max ${Math.max(...d).toFixed(1)}° first ${d[0].toFixed(1)}° last ${d.at(-1).toFixed(1)}°`);
      if (!QUIET) console.log(`    ${d.map((v) => v.toFixed(0)).join(" ")}`);
    }
  }
}
