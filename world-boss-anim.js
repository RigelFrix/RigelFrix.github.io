/* Boss Animation Pose & Joint Articulation Handler (world-boss-anim.js)
   Computes procedural Soulslike / Sekiro Stone Golem poses for the volcanic colossus (`assets/models/boss.glb`):
   1. "idle"  — monolithic, heavy stone-golem guard with planted lower body, slow tectonic heave & head scan
   2. "run"   — earth-shaking, lumbering juggernaut charge with heavy side-to-side weight shift & stomping stride
   3. "punch" — planted-stance 2-hit combo:
                Hit 1 (Right Claw sweep, u = 0.00..1.15) ->
                Hit 2 (Left Claw back-sweep / follow-up, u = 1.15..2.45)
                Each hand scales uniformly only during its high-velocity swing arc and resets seamlessly. */

import * as THREE from "three";

export const BOSS_PUNCH_DURATION = 2.45;

const tmpEuler = new THREE.Euler();
const tmpDeltaQuat = new THREE.Quaternion();
const tmpTargetQuat = new THREE.Quaternion();

/* Planted lower-body stance shared by "idle" and "punch" so the pelvis, legs, and feet
   never drift or slide during hand swings. */
const PLANTED_LOWER_BODY = {
  hipsPos: [0, -0.026, 0],
  Hips: [0.06, -0.10, 0],
  LeftUpLeg: [-0.22, 0.05, 0],
  LeftLeg: [0.36, 0, 0],
  LeftFoot: [-0.14, 0, 0],
  RightUpLeg: [0.16, -0.05, 0],
  RightLeg: [0.26, 0, 0],
  RightFoot: [-0.30, 0, 0],
};

export function computeBossPose(state, time, runPhase, punchTime, comboHit2 = true) {
  const ss = THREE.MathUtils.smoothstep;
  const L = THREE.MathUtils.lerp;

  const pose = {
    hipsPos: [...PLANTED_LOWER_BODY.hipsPos],
    Hips: [...PLANTED_LOWER_BODY.Hips],
    Spine: [0, 0, 0],
    Spine1: [0, 0, 0],
    Spine2: [0, 0, 0],
    Neck: [0, 0, 0],
    Head: [0, 0, 0],
    LeftShoulder: [0, 0, 0],
    LeftArm: [0, 0, 0],
    LeftForeArm: [0, 0, 0],
    LeftHand: [0, 0, 0],
    RightShoulder: [0, 0, 0],
    RightArm: [0, 0, 0],
    RightForeArm: [0, 0, 0],
    RightHand: [0, 0, 0],
    LeftUpLeg: [...PLANTED_LOWER_BODY.LeftUpLeg],
    LeftLeg: [...PLANTED_LOWER_BODY.LeftLeg],
    LeftFoot: [...PLANTED_LOWER_BODY.LeftFoot],
    RightUpLeg: [...PLANTED_LOWER_BODY.RightUpLeg],
    RightLeg: [...PLANTED_LOWER_BODY.RightLeg],
    RightFoot: [...PLANTED_LOWER_BODY.RightFoot],
    handScale: 0,     /* Right hand scale factor (0..1) */
    leftHandScale: 0, /* Left hand scale factor (0..1) */
  };

  if (state === "run") {
    /* Lumbering, heavy stone-golem charge: wide side-to-side weight transfer & heavy footfalls */
    const p = runPhase;
    const s1 = Math.sin(p);
    const c1 = Math.cos(p);
    const stomp = Math.pow(Math.abs(s1), 1.55);
    pose.hipsPos = [c1 * 0.024, -0.034 + (stomp - 0.5) * 0.042, 0];
    pose.Hips = [0.16, -s1 * 0.14, c1 * 0.07];
    pose.Spine = [0.14 + stomp * 0.05, s1 * 0.11, c1 * 0.05];
    pose.Spine1 = [0.11, s1 * 0.12, 0];
    pose.Spine2 = [0.10, s1 * 0.14, 0];
    pose.Neck = [-0.16, -s1 * 0.09, 0];
    pose.Head = [-0.16, -s1 * 0.10, -c1 * 0.04];
    /* Heavy stone arms swinging wide and low like a colossus juggernaut */
    pose.LeftShoulder = [0, -s1 * 0.08, 0.06];
    pose.LeftArm = [-0.16 + s1 * 0.46, -0.14, 0.24];
    pose.LeftForeArm = [-0.42 - Math.max(0, -s1) * 0.20, 0, 0.14];
    pose.RightShoulder = [0, -s1 * 0.08, -0.06];
    pose.RightArm = [-0.16 - s1 * 0.46, 0.14, -0.24];
    pose.RightForeArm = [-0.42 - Math.max(0, s1) * 0.20, 0, -0.14];
    /* Heavy stomping stride: rx < 0 lifts thigh forward (+Z), rx > 0 bends shin backward (-Z) */
    pose.LeftUpLeg = [-s1 * 0.52 - 0.10, 0.05, 0];
    pose.LeftLeg = [0.22 + Math.max(0, -c1) * 0.58, 0, 0];
    pose.LeftFoot = [-0.10 + s1 * 0.16, 0, 0];
    pose.RightUpLeg = [s1 * 0.52 - 0.10, -0.05, 0];
    pose.RightLeg = [0.22 + Math.max(0, c1) * 0.58, 0, 0];
    pose.RightFoot = [-0.10 - s1 * 0.16, 0, 0];
    return pose;
  }

  if (state === "punch") {
    const u = THREE.MathUtils.clamp(punchTime, 0, BOSS_PUNCH_DURATION);
    const idle = computeBossPose("idle", time, runPhase, 0);

    /* =========================================================================
       HIT 1: RIGHT CLAW SWING (0.00 .. 1.05s)
       - 0.00 .. 0.40s: Right claw telegraph & wind-up (torso coils right, claw elevates)
       - 0.40 .. 0.62s: Right claw forward arc swing (explosive chest-height sweep right-to-left)
       - 0.62 .. 1.05s: Hit 1 follow-through hold & seamless transition into Left claw coil
       ========================================================================= */
    if (u < 0.40) {
      /* Hit 1 Telegraph Wind-up */
      const w = ss(u, 0.0, 0.38);
      const tremor = u > 0.26 ? Math.sin(u * 55.0) * 0.018 * ss(u, 0.26, 0.40) : 0;
      const blend = (a, b) => [L(a[0], b[0], w), L(a[1], b[1], w), L(a[2], b[2], w)];
      pose.Spine = blend(idle.Spine, [-0.05, -0.24, -0.04]);
      pose.Spine1 = blend(idle.Spine1, [-0.04, -0.26, -0.03]);
      pose.Spine2 = blend(idle.Spine2, [0.02, -0.28 + tremor, 0]);
      pose.Neck = blend(idle.Neck, [0.03, 0.28, 0]);
      pose.Head = blend(idle.Head, [0.03, 0.32, 0]);

      /* Left claw braces low-mid; Right claw coils high for horizontal upper-body sweep */
      pose.LeftShoulder = blend(idle.LeftShoulder, [0, 0, 0.06]);
      pose.LeftArm = blend(idle.LeftArm, [-0.28, -0.20, 0.24]);
      pose.LeftForeArm = blend(idle.LeftForeArm, [-0.48, 0, 0.14]);
      pose.RightShoulder = blend(idle.RightShoulder, [0, -0.24, -0.10]);
      pose.RightArm = blend(idle.RightArm, [0.08, -0.86 + tremor, -1.18]);
      pose.RightForeArm = blend(idle.RightForeArm, [-0.06, 0, -0.04]);
      pose.RightHand = blend(idle.RightHand, [0, 0, -0.06]);
      pose.handScale = 0;
      pose.leftHandScale = 0;
      return pose;
    }

    if (u < 1.05) {
      /* Right Claw explosive arc swing (0.40..0.62) & follow-through transition (0.62..1.05) */
      const rawS = THREE.MathUtils.clamp((u - 0.40) / 0.22, 0, 1);
      const whip = 1 - Math.pow(1 - rawS, 2.5);
      const shudder = u > 0.60 && u < 0.76 ? Math.sin((u - 0.60) * 48.0) * 0.025 * (1 - (u - 0.60) / 0.16) : 0;

      pose.Spine = [L(-0.05, 0.14, whip), L(-0.24, 0.23, whip), L(-0.04, 0.05, whip)];
      pose.Spine1 = [L(-0.04, 0.13, whip), L(-0.26, 0.25, whip), L(-0.03, 0.03, whip)];
      pose.Spine2 = [L(0.02, 0.15, whip), L(-0.28, 0.29 + shudder, whip), 0];
      pose.Neck = [L(0.03, -0.10, whip), L(0.28, -0.26, whip), 0];
      pose.Head = [L(0.03, -0.10, whip), L(0.32, -0.30, whip), 0];

      /* Right arm strikes horizontally at chest level */
      pose.RightShoulder = [0, L(-0.24, 0.34, whip), L(-0.06, 0.02, whip)];
      pose.RightArm = [
        L(0.08, 0.04, whip),
        L(-0.86, 1.48 + shudder, whip),
        L(-1.18, -1.12, whip),
      ];
      pose.RightForeArm = [L(-0.06, 0.02, whip), 0, L(-0.04, 0.0, whip)];
      pose.RightHand = [0, 0, L(-0.06, -0.04, whip)];

      /* Left arm begins smooth mirror coil to prepare Hit 2 */
      const leftPrep = comboHit2 ? ss(u, 0.62, 1.05) : 0;
      const leftTremor = (comboHit2 && u > 0.88) ? Math.sin(u * 55.0) * 0.016 * ss(u, 0.88, 1.05) : 0;
      pose.LeftShoulder = [0, L(0, 0.24, leftPrep), L(0.06, 0.10, leftPrep)];
      pose.LeftArm = [
        L(-0.28, 0.08, leftPrep),
        L(-0.20, 0.86 + leftTremor, leftPrep),
        L(0.24, 1.18, leftPrep),
      ];
      pose.LeftForeArm = [L(-0.48, -0.06, leftPrep), 0, L(0.14, 0.04, leftPrep)];
      pose.LeftHand = [0, 0, L(0, 0.06, leftPrep)];

      /* Uniform hand scale active strictly during high-speed swing arc (0.40..0.58) */
      const grow = ss(u, 0.40, 0.46);
      const shrink = 1.0 - ss(u, 0.50, 0.58);
      pose.handScale = grow * shrink;
      pose.leftHandScale = 0;
      return pose;
    }

    /* =========================================================================
       HIT 2: LEFT CLAW SWING (1.05 .. 1.95s)
       - Perfect mirror geometry of Hit 1: explosive chest-height sweep left-to-right
       - 1.05 .. 1.27s: Left claw forward arc swing
       - 1.27 .. 1.95s: Follow-through hold & settle
       ========================================================================= */
    if (comboHit2 && u < 1.95) {
      const rawS2 = THREE.MathUtils.clamp((u - 1.05) / 0.22, 0, 1);
      const whip2 = 1 - Math.pow(1 - rawS2, 2.5);
      const shudder2 = u > 1.25 && u < 1.41 ? Math.sin((u - 1.25) * 48.0) * 0.025 * (1 - (u - 1.25) / 0.16) : 0;

      /* Torso whips with equal power in reverse (right-leaning into left-leaning) */
      pose.Spine = [L(-0.05, 0.14, whip2), L(0.24, -0.23, whip2), L(0.04, -0.05, whip2)];
      pose.Spine1 = [L(-0.04, 0.13, whip2), L(0.26, -0.25, whip2), L(0.03, -0.03, whip2)];
      pose.Spine2 = [L(0.02, 0.15, whip2), L(0.28, -0.29 - shudder2, whip2), 0];
      pose.Neck = [L(0.03, -0.10, whip2), L(-0.28, 0.26, whip2), 0];
      pose.Head = [L(0.03, -0.10, whip2), L(-0.32, 0.30, whip2), 0];

      /* Left Claw strikes horizontally with exact symmetrical angles to Right Claw */
      pose.LeftShoulder = [0, L(0.24, -0.34, whip2), L(0.06, -0.02, whip2)];
      pose.LeftArm = [
        L(0.08, 0.04, whip2),
        L(0.86, -1.48 - shudder2, whip2),
        L(1.18, 1.12, whip2),
      ];
      pose.LeftForeArm = [L(-0.06, 0.02, whip2), 0, L(0.04, 0.0, whip2)];
      pose.LeftHand = [0, 0, L(0.06, 0.04, whip2)];

      /* Right arm smoothly recoils to guard */
      pose.RightShoulder = [0, L(0.34, -0.16, whip2), L(0.02, -0.04, whip2)];
      pose.RightArm = [L(0.04, -0.26, whip2), L(1.48, 0.18, whip2), L(-1.12, -0.28, whip2)];
      pose.RightForeArm = [L(0.02, -0.46, whip2), 0, -0.14];
      pose.RightHand = [0, 0, 0];

      /* Left hand uniform scaling during Hit 2 fast swing arc (1.05..1.23) */
      const grow2 = ss(u, 1.05, 1.11);
      const shrink2 = 1.0 - ss(u, 1.15, 1.23);
      pose.handScale = 0;
      pose.leftHandScale = grow2 * shrink2;
      return pose;
    }

    /* =========================================================================
       FINAL RECOVERY: Heavy stone-golem return to idle stance (1.95 .. 2.45s)
       ========================================================================= */
    const recStart = comboHit2 ? 1.95 : 1.05;
    const rec = ss(u, recStart, BOSS_PUNCH_DURATION);
    const follow = computeBossPose("punch", time, runPhase, recStart - 0.01, comboHit2);
    const blend = (a, b) => [L(a[0], b[0], rec), L(a[1], b[1], rec), L(a[2], b[2], rec)];
    pose.Spine = blend(follow.Spine, idle.Spine);
    pose.Spine1 = blend(follow.Spine1, idle.Spine1);
    pose.Spine2 = blend(follow.Spine2, idle.Spine2);
    pose.Neck = blend(follow.Neck, idle.Neck);
    pose.Head = blend(follow.Head, idle.Head);
    pose.LeftShoulder = blend(follow.LeftShoulder, idle.LeftShoulder);
    pose.LeftArm = blend(follow.LeftArm, idle.LeftArm);
    pose.LeftForeArm = blend(follow.LeftForeArm, idle.LeftForeArm);
    pose.LeftHand = blend(follow.LeftHand, idle.LeftHand);
    pose.RightShoulder = blend(follow.RightShoulder, idle.RightShoulder);
    pose.RightArm = blend(follow.RightArm, idle.RightArm);
    pose.RightForeArm = blend(follow.RightForeArm, idle.RightForeArm);
    pose.RightHand = blend(follow.RightHand, idle.RightHand);
    pose.handScale = 0;
    pose.leftHandScale = 0;
    return pose;
  }

  /* Default: Monolithic stone boss golem Idle ("idle") — slow tectonic heave & ominous head scan */
  const heave = Math.sin(time * 1.25);
  const scan = Math.sin(time * 0.65);
  pose.Spine = [0.08 + heave * 0.022, 0.04 + scan * 0.04, 0];
  pose.Spine1 = [0.07 + heave * 0.020, 0.04 + scan * 0.03, 0];
  pose.Spine2 = [0.06 + heave * 0.025, 0.04 + scan * 0.03, 0];
  pose.Neck = [-0.08 - heave * 0.018, -0.04 - scan * 0.06, 0];
  pose.Head = [-0.08 - heave * 0.018, -0.04 - scan * 0.08, 0];
  /* Heavy golem claw guard: broad shoulders, massive arms held wide and heavy at the sides */
  pose.LeftShoulder = [0, 0, 0.04 + heave * 0.015];
  pose.LeftArm = [-0.24 - heave * 0.025, -0.16, 0.22 + heave * 0.02];
  pose.LeftForeArm = [-0.42 - heave * 0.03, 0, 0.14];
  pose.RightShoulder = [0, 0, -0.04 - heave * 0.015];
  pose.RightArm = [-0.20 - heave * 0.025, 0.14, -0.22 - heave * 0.02];
  pose.RightForeArm = [-0.46 - heave * 0.03, 0, -0.14];
  return pose;
}

const POSE_BONE_KEYS = [
  "Hips",
  "Spine",
  "Spine1",
  "Spine2",
  "Neck",
  "Head",
  "LeftShoulder",
  "LeftArm",
  "LeftForeArm",
  "LeftHand",
  "RightShoulder",
  "RightArm",
  "RightForeArm",
  "RightHand",
  "LeftUpLeg",
  "LeftLeg",
  "LeftFoot",
  "RightUpLeg",
  "RightLeg",
  "RightFoot",
];

const ARM_EXTEND_SCALES = [
  ["RightArm", 0.18],
  ["RightForeArm", 0.32],
  ["RightHand", 0.36],
  ["LeftArm", 0.18],
  ["LeftForeArm", 0.32],
  ["LeftHand", 0.36],
];

export function applyBossPoseDirect(bossNodes, pose, dampRate, dt, headLookOffset = null) {
  if (!bossNodes.Hips) return;
  const alpha = dampRate <= 0 ? 1 : 1 - Math.exp(-dampRate * Math.max(dt, 0.0001));

  const hRest = bossNodes.Hips.userData.restPos;
  if (hRest) {
    bossNodes.Hips.position.x = THREE.MathUtils.lerp(bossNodes.Hips.position.x, hRest.x + pose.hipsPos[0], alpha);
    bossNodes.Hips.position.y = THREE.MathUtils.lerp(bossNodes.Hips.position.y, hRest.y + pose.hipsPos[1], alpha);
    bossNodes.Hips.position.z = THREE.MathUtils.lerp(bossNodes.Hips.position.z, hRest.z + pose.hipsPos[2], alpha);
  }

  /* Equal (uniform X/Y/Z) right-hand growth + reach extension during the swing */
  const extR = pose.handScale ?? 0;
  const extL = pose.leftHandScale ?? 0;
  for (const [bName, mult] of ARM_EXTEND_SCALES) {
    const b = bossNodes[bName];
    const rPos = b?.userData?.restPos;
    if (!b || !rPos) continue;
    const isLeft = bName.startsWith("Left");
    const ext = isLeft ? extL : extR;
    const s = 1 + ext * mult;
    b.position.x = THREE.MathUtils.lerp(b.position.x, rPos.x * s, alpha);
    b.position.y = THREE.MathUtils.lerp(b.position.y, rPos.y * s, alpha);
    b.position.z = THREE.MathUtils.lerp(b.position.z, rPos.z * s, alpha);
  }

  const scaleAlpha = dampRate <= 0 ? 1 : 1 - Math.exp(-Math.max(dampRate, 36) * Math.max(dt, 0.0001));
  if (bossNodes.RightHand) {
    const targetUniformScaleR = 1 + extR * 0.58;
    const nextScaleR = THREE.MathUtils.lerp(bossNodes.RightHand.scale.x, targetUniformScaleR, scaleAlpha);
    bossNodes.RightHand.scale.setScalar(nextScaleR);
  }
  if (bossNodes.LeftHand) {
    const targetUniformScaleL = 1 + extL * 0.58;
    const nextScaleL = THREE.MathUtils.lerp(bossNodes.LeftHand.scale.x, targetUniformScaleL, scaleAlpha);
    bossNodes.LeftHand.scale.setScalar(nextScaleL);
  }

  for (const key of POSE_BONE_KEYS) {
    const bone = bossNodes[key];
    const rot = pose[key];
    if (!bone || !rot || !bone.userData.restQuat) continue;
    const isArm = key === "LeftArm" || key === "RightArm" || key === "LeftForeArm" || key === "RightForeArm";
    const order = isArm ? "YXZ" : "XYZ";
    let rx = rot[0];
    let ry = rot[1];
    let rz = rot[2];
    if (headLookOffset) {
      if (key === "Neck") {
        rx += headLookOffset.pitch * 0.35;
        ry += headLookOffset.yaw * 0.35;
      } else if (key === "Head") {
        rx += headLookOffset.pitch * 0.65;
        ry += headLookOffset.yaw * 0.65;
      }
    }
    tmpEuler.set(rx, ry, rz, order);
    tmpDeltaQuat.setFromEuler(tmpEuler);
    tmpTargetQuat.copy(bone.userData.restQuat).multiply(tmpDeltaQuat);
    if (alpha >= 0.999) {
      bone.quaternion.copy(tmpTargetQuat);
    } else {
      bone.quaternion.slerp(tmpTargetQuat, alpha);
    }
  }
}
