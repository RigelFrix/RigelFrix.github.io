/* Niko hitboxes — one system for move collider, body segments, and punch volume.

   Move: horizontal disc (radius), drawn as a soles→crown cylinder for debug only.
   Segments: Dark Souls-style oriented boxes locked to Mixamo bones (full body).
   Punch: live sphere/box while an attack window is active.

   Debug: setDebug(true) or ?hitbox=1. VFX: sample() / sample('thighL'). */

import * as THREE from "three";

const Y_UP = new THREE.Vector3(0, 1, 0);
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_SPHERE = new THREE.SphereGeometry(1, 14, 10);
const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);

const MAT = (color, opacity = 0.88) =>
  new THREE.MeshBasicMaterial({
    color,
    wireframe: true,
    transparent: true,
    opacity,
    depthTest: false,
  });

/* Shared materials by family — one draw style, few GPU programs. */
const MATS = {
  move: MAT(0x44ccff, 0.75),
  head: MAT(0xff8866),
  torso: MAT(0x66aaff),
  arm: MAT(0xff5555),
  leg: MAT(0xffcc44),
  punch: MAT(0xff44aa, 0.95),
  punchBox: MAT(0xffee44, 0.9),
};

/**
 * Segment table. `bone` = bone-local box. `from`/`to` = oriented span along limb.
 * Thickness is world units; limb length is measured live.
 */
const SEGMENTS = [
  { name: "head", kind: "bone", bone: "Head", size: [0.30, 0.34, 0.32], offset: [0, 0.14, 0.02], mat: "head" },
  { name: "chest", kind: "span", from: "Spine1", to: "Neck", thick: [0.36, 0.26], pad: 0.08, mat: "torso" },
  { name: "hips", kind: "bone", bone: "Hips", size: [0.38, 0.22, 0.28], offset: [0, 0.02, 0], mat: "torso" },
  { name: "upperArmL", kind: "span", from: "LeftArm", to: "LeftForeArm", thick: [0.12, 0.12], pad: 0.03, mat: "arm" },
  { name: "lowerArmL", kind: "span", from: "LeftForeArm", to: "LeftHand", thick: [0.11, 0.11], pad: 0.03, mat: "arm" },
  { name: "handL", kind: "bone", bone: "LeftHand", size: [0.12, 0.08, 0.16], offset: [0.06, 0, 0], mat: "arm" },
  { name: "upperArmR", kind: "span", from: "RightArm", to: "RightForeArm", thick: [0.12, 0.12], pad: 0.03, mat: "arm" },
  { name: "lowerArmR", kind: "span", from: "RightForeArm", to: "RightHand", thick: [0.11, 0.11], pad: 0.03, mat: "arm" },
  { name: "handR", kind: "bone", bone: "RightHand", size: [0.12, 0.08, 0.16], offset: [0.06, 0, 0], mat: "arm" },
  { name: "thighL", kind: "span", from: "LeftUpLeg", to: "LeftLeg", thick: [0.16, 0.16], pad: 0.04, mat: "leg" },
  { name: "calfL", kind: "span", from: "LeftLeg", to: "LeftFoot", thick: [0.13, 0.13], pad: 0.03, mat: "leg" },
  { name: "footL", kind: "span", from: "LeftFoot", to: "LeftToeBase", thick: [0.14, 0.10], pad: 0.04, mat: "leg" },
  { name: "thighR", kind: "span", from: "RightUpLeg", to: "RightLeg", thick: [0.16, 0.16], pad: 0.04, mat: "leg" },
  { name: "calfR", kind: "span", from: "RightLeg", to: "RightFoot", thick: [0.13, 0.13], pad: 0.03, mat: "leg" },
  { name: "footR", kind: "span", from: "RightFoot", to: "RightToeBase", thick: [0.14, 0.10], pad: 0.04, mat: "leg" },
];

const NAMES = SEGMENTS.map((s) => s.name);
const CROWN_ABOVE_HEAD = 0.47;
const FALLBACK_HEIGHT = 2.17;
const FOOT_BONES = ["LeftToeBase", "RightToeBase", "LeftFoot", "RightFoot"];

/**
 * @param {{
 *   scene: THREE.Scene,
 *   radius?: number,
 * }} opts
 */
export function createNikoHitboxes({ scene, radius = 0.45 } = {}) {
  const group = new THREE.Group();
  group.name = "NikoHitboxes";
  scene.add(group);

  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _mid = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  const _off = new THREE.Vector3();
  const _local = new THREE.Vector3();
  const _size = new THREE.Vector3();
  const _center = new THREE.Vector3();

  const wire = (geo, mat, name) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.visible = false;
    mesh.renderOrder = 998;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };

  const move = wire(UNIT_CYL, MATS.move, "NikoMoveHitbox");
  const punchSphere = wire(UNIT_SPHERE, MATS.punch, "NikoPunchSphere");
  const punchBox = wire(UNIT_BOX, MATS.punchBox, "NikoPunchBox");

  const segments = SEGMENTS.map((def) => ({
    def,
    mesh: wire(UNIT_BOX, MATS[def.mat], `NikoSeg_${def.name}`),
    center: new THREE.Vector3(),
    size: new THREE.Vector3(0.2, 0.2, 0.2),
    quaternion: new THREE.Quaternion(),
    ready: false,
  }));
  const byName = Object.fromEntries(segments.map((s) => [s.def.name, s]));

  let debug = false;
  let moveRadius = radius;

  const placeBone = (seg, bones) => {
    const { bone, size, offset } = seg.def;
    const b = bones[bone];
    if (!b) {
      seg.ready = false;
      return;
    }
    b.updateWorldMatrix(true, false);
    b.getWorldPosition(_a);
    b.getWorldQuaternion(_quat);
    _off.fromArray(offset).applyQuaternion(_quat);
    _mid.copy(_a).add(_off);
    seg.center.copy(_mid);
    seg.size.fromArray(size);
    seg.quaternion.copy(_quat);
    seg.ready = true;
    seg.mesh.position.copy(_mid);
    seg.mesh.quaternion.copy(_quat);
    seg.mesh.scale.copy(seg.size);
  };

  const placeSpan = (seg, bones) => {
    const { from, to, thick, pad } = seg.def;
    const a = bones[from];
    const b = bones[to];
    if (!a || !b) {
      seg.ready = false;
      return;
    }
    a.getWorldPosition(_a);
    b.getWorldPosition(_b);
    _dir.subVectors(_b, _a);
    let len = _dir.length();
    if (len < 1e-4) {
      seg.ready = false;
      return;
    }
    _dir.multiplyScalar(1 / len);
    len += pad * 2;
    _mid.copy(_a).addScaledVector(_dir, len * 0.5 - pad);
    _quat.setFromUnitVectors(Y_UP, _dir);
    seg.center.copy(_mid);
    seg.size.set(thick[0], len, thick[1]);
    seg.quaternion.copy(_quat);
    seg.ready = true;
    seg.mesh.position.copy(_mid);
    seg.mesh.quaternion.copy(_quat);
    seg.mesh.scale.copy(seg.size);
  };

  const measureMove = (bones, robot) => {
    let minY = robot.position.y;
    let maxY = robot.position.y + FALLBACK_HEIGHT;
    let gotFoot = false;
    if (bones) {
      for (const name of FOOT_BONES) {
        const bone = bones[name];
        if (!bone) continue;
        bone.getWorldPosition(_a);
        minY = gotFoot ? Math.min(minY, _a.y) : _a.y;
        gotFoot = true;
      }
      if (bones.Head) {
        bones.Head.getWorldPosition(_b);
        maxY = _b.y + CROWN_ABOVE_HEAD;
      }
    }
    maxY = Math.max(minY + 0.5, maxY);
    return { midY: (minY + maxY) * 0.5, height: maxY - minY };
  };

  /**
   * @param {{
   *   bones?: Record<string, THREE.Object3D>|null,
   *   robot?: THREE.Object3D|null,
   *   punch?: { active?: boolean, sphere?: THREE.Sphere, box?: THREE.Box3 }|null,
   * }} opts
   */
  const update = ({ bones = null, robot = null, punch = null } = {}) => {
    if (bones) {
      for (const seg of segments) {
        if (seg.def.kind === "bone") placeBone(seg, bones);
        else placeSpan(seg, bones);
        seg.mesh.visible = debug && seg.ready;
      }
    } else {
      for (const seg of segments) {
        seg.ready = false;
        seg.mesh.visible = false;
      }
    }

    if (debug && robot) {
      const span = measureMove(bones, robot);
      move.position.set(robot.position.x, span.midY, robot.position.z);
      move.scale.set(moveRadius, span.height, moveRadius);
      move.visible = true;
    } else {
      move.visible = false;
    }

    const live = Boolean(punch?.active && punch.sphere);
    punchSphere.visible = debug && live;
    punchBox.visible = debug && live;
    if (live) {
      punchSphere.position.copy(punch.sphere.center);
      punchSphere.scale.setScalar(Math.max(0.05, punch.sphere.radius));
      if (punch.box) {
        punch.box.getSize(_size);
        punch.box.getCenter(_center);
        punchBox.position.copy(_center);
        punchBox.scale.set(Math.max(0.05, _size.x), Math.max(0.05, _size.y), Math.max(0.05, _size.z));
      }
    }
  };

  const setDebug = (on) => {
    debug = Boolean(on);
    if (!debug) {
      move.visible = false;
      punchSphere.visible = false;
      punchBox.visible = false;
      for (const seg of segments) seg.mesh.visible = false;
    }
    return debug;
  };

  /** Random point inside a ready segment (or named one). */
  const sample = (name = null, out = new THREE.Vector3()) => {
    let seg = name ? byName[name] : null;
    if (!seg?.ready) {
      const ready = segments.filter((s) => s.ready);
      if (!ready.length) return null;
      seg = ready[(Math.random() * ready.length) | 0];
    }
    _local.set(
      (Math.random() - 0.5) * seg.size.x,
      (Math.random() - 0.5) * seg.size.y,
      (Math.random() - 0.5) * seg.size.z,
    );
    _local.applyQuaternion(seg.quaternion);
    return out.copy(seg.center).add(_local);
  };

  const centerOf = (name, out = new THREE.Vector3()) => {
    const seg = byName[name];
    if (!seg?.ready) return null;
    return out.copy(seg.center);
  };

  const snapshot = () =>
    segments.map((s) => ({
      name: s.def.name,
      ready: s.ready,
      center: s.center.toArray().map((n) => +n.toFixed(3)),
      size: s.size.toArray().map((n) => +n.toFixed(3)),
    }));

  return {
    names: NAMES,
    update,
    setDebug,
    sample,
    centerOf,
    snapshot,
    debug: () => debug,
    setRadius: (r) => {
      moveRadius = r;
    },
  };
}
