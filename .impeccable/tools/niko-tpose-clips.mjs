/* Bake Mixamo idle/walk/run onto the Y Bot rig in assets/niko/niko-t-pose-rigged.glb.
   Clip dumps (../anim/<name>.json) are world rotations relative to a Mixamo T-pose.
   This skeleton's rest rotations are not identity, so each track is restLocal * delta. */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import fs from "node:fs";
import * as THREE from "../../vendor/three/three.module.min.js";

const file = "../../assets/niko/niko-t-pose-rigged.glb";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const skin = root.listSkins()[0];
const joints = skin.listJoints();
const byName = Object.fromEntries(joints.map((node) => [node.getName(), node]));
const parentOf = {};
for (const node of joints) {
  const parent = node.getParentNode();
  if (parent && byName[parent.getName()]) parentOf[node.getName()] = parent.getName();
}
const restRot = {};
const restPos = {};
for (const node of joints) {
  restRot[node.getName()] = new THREE.Quaternion().fromArray(node.getRotation());
  restPos[node.getName()] = new THREE.Vector3().fromArray(node.getTranslation());
}
const ordered = [];
const seen = new Set();
const visit = (name) => {
  if (seen.has(name)) return;
  if (parentOf[name]) visit(parentOf[name]);
  seen.add(name);
  ordered.push([name, parentOf[name] || null]);
};
Object.keys(byName).forEach(visit);
const restWorld = {};
for (const [name, parent] of ordered) {
  const parentWorld = parent ? restWorld[parent] : new THREE.Quaternion();
  restWorld[name] = parentWorld.clone().multiply(restRot[name]);
}

for (const clip of root.listAnimations()) clip.dispose();

const manifest = JSON.parse(fs.readFileSync(new URL("../anim/clips.json", import.meta.url), "utf8"));
const hipsRest = restPos.Hips;

for (const clipName of Object.keys(manifest)) {
  const data = JSON.parse(fs.readFileSync(new URL(`../anim/${clipName}.json`, import.meta.url), "utf8"));
  const frames = data.frames;
  const times = new Float32Array(frames).map((_, frame) => Math.min(data.duration, frame / data.fps));
  const outRot = Object.fromEntries(ordered.filter(([name]) => data.bones[name]).map(([name]) => [name, new Float32Array(frames * 4)]));
  const outHips = new Float32Array(frames * 3);
  const scale = hipsRest.y / data.hipsRest[1];
  for (let frame = 0; frame < frames; frame += 1) {
    const world = {};
    for (const [name, parent] of ordered) {
      const delta = data.bones[name]
        ? new THREE.Quaternion().fromArray(data.bones[name], frame * 4)
        : new THREE.Quaternion();
      world[name] = delta.multiply(restWorld[name]);
      if (!outRot[name]) continue;
      const parentWorld = parent ? world[parent] : new THREE.Quaternion();
      const local = parentWorld.clone().invert().multiply(world[name]).normalize();
      outRot[name].set([local.x, local.y, local.z, local.w], frame * 4);
    }
    for (let axis = 0; axis < 3; axis += 1) {
      outHips[frame * 3 + axis] = hipsRest.getComponent(axis) + (data.hips[frame * 3 + axis] - data.hipsRest[axis]) * scale;
    }
  }
  for (const axis of [0, 2]) {
    const first = outHips[axis];
    const last = outHips[(frames - 1) * 3 + axis];
    let mean = 0;
    for (let frame = 0; frame < frames; frame += 1) mean += outHips[frame * 3 + axis];
    mean /= frames;
    for (let frame = 0; frame < frames; frame += 1) {
      const drift = (last - first) * (frame / (frames - 1) - 0.5);
      outHips[frame * 3 + axis] -= drift + (mean - hipsRest.getComponent(axis));
    }
  }
  const animation = doc.createAnimation(clipName);
  const input = doc.createAccessor().setType("SCALAR").setArray(times).setBuffer(buffer);
  for (const [name, rot] of Object.entries(outRot)) {
    const sampler = doc.createAnimationSampler().setInput(input).setInterpolation("LINEAR")
      .setOutput(doc.createAccessor().setType("VEC4").setArray(rot).setBuffer(buffer));
    animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(byName[name]).setTargetPath("rotation").setSampler(sampler));
  }
  const hipsSampler = doc.createAnimationSampler().setInput(input).setInterpolation("LINEAR")
    .setOutput(doc.createAccessor().setType("VEC3").setArray(outHips).setBuffer(buffer));
  animation.addSampler(hipsSampler).addChannel(doc.createAnimationChannel().setTargetNode(byName.Hips).setTargetPath("translation").setSampler(hipsSampler));
  console.log("clip", clipName, times[frames - 1].toFixed(2), "s", frames, "frames", Object.keys(outRot).length, "bones", "hip scale", scale.toFixed(3));
}

await io.write(file, doc);
console.log("wrote", file.pathname);
