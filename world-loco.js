import * as THREE from "three";
import cascadeurStopData from "./assets/niko/stop.json";
import cascadeurStopMirrorData from "./assets/niko/stop-mirror.json";
import turn180ClipData from "./assets/niko/turn-180.json";

const ONE_PUNCH_STEP_DIST = 1.05;
const ONE_PUNCH_STEP_CURVE = [
  0.0000, 0.0000, 0.0006, 0.0026, 0.0067, 0.0134,
  0.0236, 0.0374, 0.0552, 0.0769, 0.1030, 0.1420,
  0.2168, 0.3243, 0.4430, 0.5632, 0.6887, 0.8053,
  0.9050, 0.9847, 1.0000, 0.9669, 0.9131, 0.8477,
  0.7648, 0.6633, 0.5689, 0.5007, 0.4366, 0.3686,
  0.3142, 0.2487, 0.1727, 0.0806, 0.0442, 0.0000,
];

const wrapYaw = (yaw) => Math.atan2(Math.sin(yaw), Math.cos(yaw));

/** Locomotion state, stop/180 root motion, combat propulsion, lock-on blend, mixer weights & sprint IK. */
export function createLoco(ctx) {
  const {
    root,
    host,
    devParam,
    isDevMap,
    island,
    nikoHitboxes,
    nikoSmear,
    footDust,
    cameraApi,
    NIKO_SCALE,
    getBot,
    getRobot,
    getColliders,
    getDummy,
    getDummyFocus,
    getDummyRing,
    getWerewolfBoss,
    pickLockTarget,
    getInputVector,
    getPlayLog,
    getPlayLogInput,
    getArrive,
    getIntroLive,
    getStarted,
    getCalm,
    getClock,
  } = ctx;

  const {
    camOffset,
    inCamera,
    dampCamYaw,
    applyCamAxes,
    getCamYaw,
    getCamYawGoal,
    setCamYawGoal,
  } = cameraApi;

  const ROBOT_R = 0.45;
  const SPEED = 4.6;
  let SPRINT_SPEED = 10.5;
  let SPRINT_STOP_THRESHOLD = 5.5;
  let SPRINT_ANIM_SCALE = 0.72;
  const fpsParam = devParam.get("animefps") || devParam.get("fps");
  let SPRINT_ANIME_FPS = fpsParam != null ? parseInt(fpsParam, 10) : 0;
  let sprintAnimPhase = 0;
  let jogAnimPhase = 0;

  /* Legacy share used only when a 180 joins mid-stop (carry from the stop's live speed). */
  const STOP_SKID = 0.48;
  const STOP = {
    root: cascadeurStopData.root || [0, 0],
    rootMirror: cascadeurStopMirrorData.root || cascadeurStopData.root || [0, 0],
    lastFrame: cascadeurStopData.lastFrame ?? 39,
    plantFrame: cascadeurStopData.plantFrame ?? 10,
    animScale: 1.0,
    blendIn: 0.18,
    blendOut: 0.22,
    carryUntil: (cascadeurStopData.plantFrame ?? 10) / (cascadeurStopData.lastFrame ?? 39),
    authoredLead: cascadeurStopData.authoredLead || "L",
  };

  let TURN180_SPEED_MIN = 7.0;
  const TURN180 = {
    reverseDot: -0.45,
    sprintAnimMin: 0.55,
    reverseGrace: 0.16,
    joinMax: 12 / 40,
    joinCarryUntil: 15 / 40,
    animScale: 1.0,
    blendIn: 0.08,
    blendOut: 0.14,
    gaitBlend: 0.5,
    gaitExitSpeed: SPEED * 1.2,
    carryUntil: 0.3,
    yawCurve: turn180ClipData.yawCurve || [0, 1],
    root: turn180ClipData.root || [0, 0, 0, 0],
    apex: (turn180ClipData.apexFrame ?? 25) / (turn180ClipData.lastFrame || 40),
  };

  const state = {
    path: [],
    pending: null,
    keys: new Set(),
    walk: 0,
    yaw: Math.PI / 4,
    hop: 1,
    stuck: 0,
    near: null,
    phase: 0,
    blinkAt: 2,
    still: 0,
    faceUp: 0,
    pace: 1,
    sprint: 0,
    sprintMul: 1,
    speedMeter: 0,
    bank: 0,
    turnLead: 0,
    chestTwist: 0,
    pathOmega: 0,
    moveDir: new THREE.Vector3(0, 0, 1),
    wasSprinting: false,
    stopping: false,
    stopTimer: 0,
    stopWeight: 0,
    stopSpeed: 0,
    stopDir: new THREE.Vector3(),
    stopScale: 1,
    stopCarry: 0,
    stopDur: cascadeurStopData.duration || 0.65,
    stopMirror: false,
    turning180: false,
    turn180Timer: 0,
    turn180Dur: turn180ClipData.duration || (40 / 60),
    turn180Weight: 0,
    turn180StartYaw: 0,
    turn180YawDelta: 0,
    turn180StartSpeed: 0,
    turn180Scale: 1,
    turn180Carry: 0,
    turn180CarryFrom: 0,
    turn180CarryUntil: 0.3,
    turn180CarryPow: 2,
    sprintHold: false,
    /* Gait preference (hysteresis) + visual mix 0=jog ... 1=sprint, eased over TURN180.gaitBlend. */
    gaitSprint: false,
    gaitMix: 0,
    turn180StartDir: new THREE.Vector3(),
    turn180TargetDir: new THREE.Vector3(),
    turn180CommitT: 0,
    turn180CommitDir: new THREE.Vector3(0, 0, 1),
    _turn180SprintPhase: 0,
    wasMoving: false,
    punching: false,
    punchType: null,
    punchTimer: 0,
    punchOrigin: null,
    punchForward: null,
    punchHitboxActive: false,
  };

  const punchHitbox = {
    active: false,
    frame: -1,
    position: new THREE.Vector3(),
    box: new THREE.Box3(),
    sphere: new THREE.Sphere(),
    size: new THREE.Vector3(0.35, 0.35, 0.35),
    radius: 0.22,
  };

  let devHud = null;
  if (isDevMap) {
    root.classList.add("world-dev-mode");
    const badge = document.createElement("div");
    badge.className = "dev-gym-badge";
    badge.innerHTML = `
      <div class="dev-gym-header">
        <span class="dev-tag">DEV ARENA</span>
        <span class="dev-size">180m &times; 180m</span>
      </div>
      <div class="dev-speed" aria-label="Speed meter">
        <div class="dev-speed-top">
          <span class="dev-speed-label">SPEED</span>
          <span class="dev-speed-read">0.0 / ${SPRINT_SPEED.toFixed(1)} m/s</span>
        </div>
        <div class="dev-speed-track">
          <div class="dev-speed-fill"></div>
          <div class="dev-speed-mark" title="180 turn threshold"></div>
        </div>
        <div class="dev-speed-arm">180 at ${(7.0).toFixed(1)} m/s</div>
      </div>
      <div class="dev-gym-shortcuts">
        <span><b>[WASD]</b> Move (Hold <b>Shift</b> to Sprint)</span>
        <span><b>[G]</b> One-Punch</span>
        <span><b>[F]</b> Flying Knee</span>
        <span><b>[T / M-Click]</b> Lock-On Target</span>
        <span><b>[Right-Drag]</b> Orbit Camera</span>
      </div>
    `;
    host.appendChild(badge);
    devHud = {
      fill: badge.querySelector(".dev-speed-fill"),
      mark: badge.querySelector(".dev-speed-mark"),
      read: badge.querySelector(".dev-speed-read"),
      arm: badge.querySelector(".dev-speed-arm"),
    };
    devHud.mark.style.left = `${(7.0 / SPRINT_SPEED) * 100}%`;
  }

  let lockTarget = null;
  let lockLost = 0;
  let lockSpeed = 0;
  let lockPhase = 0;
  let lockAngle = 0;
  let lockMag = 0;
  let lockBackYaw = 0;
  const lockDir = { x: 0, y: 0 };
  const LOCK_REACH = 18;
  const LOCK_YAW_SKIP = THREE.MathUtils.degToRad(18);
  const playerChest = new THREE.Vector3();

  const tryLock = (clientX, clientY) => {
    lockTarget = pickLockTarget?.(clientX, clientY) || null;
    lockLost = 0;
    return Boolean(lockTarget);
  };

  /* Stops and props push Niko out softly; the walk grid keeps him off cliffs, out of the sea and off the stream */
  const resolveCollisions = (pos) => {
    const colliders = getColliders();
    colliders.forEach((c) => {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = c.r + ROBOT_R;
      const d2 = dx * dx + dz * dz;

      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.0001;
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    });
    return pos;
  };

  /* Keeps a move only if it lands on walkable ground; otherwise slides along whichever axis still does */
  const stepTo = (from, pos) => {
    if (island.nav.walkable(pos.x, pos.z) || !island.nav.walkable(from.x, from.z)) return pos;
    if (island.nav.walkable(pos.x, from.z)) return pos.set(pos.x, pos.y, from.z);
    if (island.nav.walkable(from.x, pos.z)) return pos.set(from.x, pos.y, pos.z);
    return pos.copy(from);
  };

  const poseInertia = {
    active: false,
    kind: null, // "in" | "out" | "stop-in" | "stop-out"
    t: 0,
    dur: 0.2,
    freezeSprint: false,
    quats: null, // source
    targets: null, // destination (generated bridge end keyframe)
    hipPos: null,
    hipTarget: null,
    _q: new THREE.Quaternion(),
    _leg: /UpLeg|Leg|Foot|Toe/,
    capture(bones) {
      if (!bones) return;
      this.quats = new Map();
      for (const name of Object.keys(bones)) {
        const bone = bones[name];
        if (!bone?.isBone) continue;
        this.quats.set(name, bone.quaternion.clone());
      }
      const hips = bones.Hips;
      this.hipPos = hips ? hips.position.clone() : null;
    },
    /** Source = an exact clip frame (the turn's last frame), not last frame's live bones. */
    captureClip(clip, time) {
      this.quats = this.sampleClip(clip, time);
      this.hipPos = this.sampleHipPos(clip, time);
    },
    /** Sample a clip into a quat map at time (the bridge's end keyframe). */
    sampleClip(clip, time) {
      const map = new Map();
      if (!clip) return map;
      for (const track of clip.tracks) {
        if (!track.name.endsWith(".quaternion")) continue;
        const boneName = track.name.slice(0, -".quaternion".length);
        const times = track.times;
        const values = track.values;
        const last = times.length - 1;
        if (last < 0) continue;
        let index = 0;
        while (index < last && times[index + 1] < time) index += 1;
        const next = Math.min(index + 1, last);
        let x;
        let y;
        let z;
        let w;
        if (next === index) {
          const o = index * 4;
          x = values[o]; y = values[o + 1]; z = values[o + 2]; w = values[o + 3];
        } else {
          const f = (time - times[index]) / Math.max(1e-6, times[next] - times[index]);
          const a = index * 4;
          const b = next * 4;
          const qa = new THREE.Quaternion(values[a], values[a + 1], values[a + 2], values[a + 3]);
          const qb = new THREE.Quaternion(values[b], values[b + 1], values[b + 2], values[b + 3]);
          if (qa.dot(qb) < 0) qb.set(-qb.x, -qb.y, -qb.z, -qb.w);
          qa.slerp(qb, f);
          x = qa.x; y = qa.y; z = qa.z; w = qa.w;
        }
        map.set(boneName, new THREE.Quaternion(x, y, z, w));
      }
      return map;
    },
    sampleHipPos(clip, time) {
      if (!clip) return null;
      const track = clip.tracks.find((tr) => tr.name === "Hips.position");
      if (!track) return null;
      const times = track.times;
      const values = track.values;
      const last = times.length - 1;
      if (last < 0) return null;
      let index = 0;
      while (index < last && times[index + 1] < time) index += 1;
      const next = Math.min(index + 1, last);
      const f = next === index ? 0 : (time - times[index]) / Math.max(1e-6, times[next] - times[index]);
      const a = index * 3;
      const b = next * 3;
      return new THREE.Vector3(
        values[a] + (values[b] - values[a]) * f,
        values[a + 1] + (values[b + 1] - values[a + 1]) * f,
        values[a + 2] + (values[b + 2] - values[a + 2]) * f,
      );
    },
    /**
     * Loop phase whose feet/legs best match a source pose map.
     * Used for exclusive gait switches (jog <-> sprint) and 180 -> sprint.
     */
    matchClipPhase(clip, sourceQuats, samples = 48) {
      if (!clip || !sourceQuats?.size) return 0;
      const dur = clip.duration || 0.001;
      const names = ["Hips", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase", "Spine", "LeftArm", "RightArm"];
      let bestPhase = 0;
      let bestScore = Infinity;
      for (let i = 0; i < samples; i += 1) {
        const phase = i / samples;
        const pose = this.sampleClip(clip, phase * dur);
        let score = 0;
        let n = 0;
        for (const name of names) {
          const a = sourceQuats.get(name);
          const b = pose.get(name);
          if (!a || !b) continue;
          const dist = 1 - Math.min(1, Math.abs(a.dot(b)));
          const w = this._leg.test(name) ? 2.4 : 1;
          score += dist * w;
          n += w;
        }
        if (n && score / n < bestScore) {
          bestScore = score / n;
          bestPhase = phase;
        }
      }
      return bestPhase;
    },
    matchSprintPhase(sprintClip, sourceQuats, samples = 48) {
      return this.matchClipPhase(sprintClip, sourceQuats, samples);
    },
    play(kind, dur, targetQuats = null, hipTarget = null, { freezeSprint = false } = {}) {
      if (!this.quats || this.quats.size < 8) {
        this.active = false;
        return;
      }
      this.kind = kind;
      this.t = 0;
      this.dur = Math.max(0.05, dur || 0.2);
      this.targets = targetQuats;
      this.hipTarget = hipTarget;
      this.freezeSprint = freezeSprint;
      this.active = true;
    },
    /** After mixer.update - write the synthetic in-between keyframe onto the skeleton. */
    apply(bones, dt) {
      if (!this.active || !this.quats || !bones) return;
      this.t += dt;
      const u = Math.min(1, this.t / this.dur);
      /* Smoothstep^2 - more time in the middle of the bridge (the missing frames). */
      const s = u * u * (3 - 2 * u);
      const wBody = s * s * (3 - 2 * s);
      const wLeg = Math.pow(s, 1.55); // feet stay on source longer, then catch up
      for (const [name, snap] of this.quats) {
        const bone = bones[name];
        if (!bone?.isBone) continue;
        const dest = this.targets?.get(name);
        if (dest) {
          this._q.copy(dest);
        } else {
          this._q.copy(bone.quaternion);
        }
        if (snap.dot(this._q) < 0) this._q.set(-this._q.x, -this._q.y, -this._q.z, -this._q.w);
        const w = this._leg.test(name) ? wLeg : wBody;
        bone.quaternion.slerpQuaternions(snap, this._q, w);
      }
      if (this.hipPos && bones.Hips) {
        const hipDest = this.hipTarget || bones.Hips.position;
        bones.Hips.position.lerpVectors(this.hipPos, hipDest, wBody);
      }
      if (u >= 1) {
        this.active = false;
        this.kind = null;
        this.quats = null;
        this.targets = null;
        this.hipPos = null;
        this.hipTarget = null;
        this.freezeSprint = false;
      }
    },
  };

  const StopLoco = {
    _rootA: new THREE.Vector2(),
    _rootB: new THREE.Vector2(),
    _scale: new THREE.Vector3(),
    _footL: new THREE.Vector3(),
    _footR: new THREE.Vector3(),

    /** Which foot is further along travel right now (sprint pose). */
    liveLeadFoot() {
      const bot = getBot();
      const robot = getRobot();
      const bones = bot.bones;
      if (!bones?.LeftFoot || !bones?.RightFoot) return STOP.authoredLead;
      bones.LeftFoot.getWorldPosition(this._footL);
      bones.RightFoot.getWorldPosition(this._footR);
      let fx = state.moveDir.x;
      let fz = state.moveDir.z;
      if (fx * fx + fz * fz < 1e-6) {
        fx = Math.sin(state.yaw);
        fz = Math.cos(state.yaw);
      }
      const ox = robot.position.x;
      const oz = robot.position.z;
      const lAlong = (this._footL.x - ox) * fx + (this._footL.z - oz) * fz;
      const rAlong = (this._footR.x - ox) * fx + (this._footR.z - oz) * fz;
      return lAlong >= rAlong ? "L" : "R";
    },

    activeAction() {
      const bot = getBot();
      return state.stopMirror ? bot.actions?.stopMirror : bot.actions?.stop;
    },

    sampleRoot(norm, out) {
      const track = state.stopMirror ? STOP.rootMirror : STOP.root;
      const last = track.length / 2 - 1;
      const x = Math.min(last, Math.max(0, norm * last));
      const i0 = Math.floor(x);
      const i1 = Math.min(last, i0 + 1);
      const f = x - i0;
      return out.set(
        track[i0 * 2] * (1 - f) + track[i1 * 2] * f,
        track[i0 * 2 + 1] * (1 - f) + track[i1 * 2 + 1] * f,
      );
    },

    authoredSpeed(frameA, frameB) {
      const track = state.stopMirror ? STOP.rootMirror : STOP.root;
      const last = track.length / 2 - 1;
      const span = ((frameB - frameA) / last) * (state.stopDur || 0.65);
      const dist = Math.hypot(track[frameB * 2] - track[frameA * 2], track[frameB * 2 + 1] - track[frameA * 2 + 1]);
      return span > 1e-5 ? (dist * state.stopScale) / span : 0;
    },

    /** Entry surplus distance by clip fraction; gone by carryUntil (RF plant). */
    carryDist(norm) {
      const span = Math.max(1e-4, STOP.carryUntil);
      const u = 1 - THREE.MathUtils.clamp(norm / span, 0, 1);
      return state.stopCarry * (state.stopDur || 0.65) * (span / 3) * (1 - u * u * u);
    },

    start() {
      const bot = getBot();
      /* Pick the stop that matches the live sprint lead foot (authored clip is left-lead). */
      state.stopMirror = this.liveLeadFoot() !== STOP.authoredLead;
      const clipDur = this.activeAction()?.getClip()?.duration ?? cascadeurStopData.duration ?? 0.65;
      state.stopping = true;
      state.stopTimer = 0;
      state.stopDur = clipDur / Math.max(0.25, STOP.animScale);
      state.stopSpeed = state.speedMeter;
      state.stopDir.set(Math.sin(state.yaw), 0, Math.cos(state.yaw)).normalize();
      if (state.stopDir.lengthSq() < 0.001) state.stopDir.copy(state.moveDir).normalize();
      /* Clip travel is model units; armature world scale -> world units (same as TurnLoco). */
      const armature = bot.bones?.Hips?.parent;
      state.stopScale = armature ? armature.getWorldScale(this._scale).y : NIKO_SCALE;
      const authoredIn = this.authoredSpeed(0, 1);
      state.stopCarry = THREE.MathUtils.clamp(state.stopSpeed - authoredIn, -4, 10);
      state.stopWeight = 1;
      state.gaitMix = 0;
      state.gaitSprint = false;
      if (bot.actions?.stop) bot.actions.stop.setEffectiveWeight(0);
      if (bot.actions?.stopMirror) bot.actions.stopMirror.setEffectiveWeight(0);
      const primary = this.activeAction();
      if (primary) {
        primary.reset();
        primary.play();
      }
      /* Snapshot the live sprint pose, then exclusive stop underneath - poseInertia is the blend.
         Kind is stop-in (not turn "in") so the 180 facing/gait locks stay off. */
      poseInertia.capture(bot.bones);
      poseInertia.play("stop-in", STOP.blendIn);
    },

    /** Abort into locomotion (WASD mid-stop) without dropping into bind/jog snap. */
    cancelToMove() {
      if (!state.stopping) return;
      const bot = getBot();
      poseInertia.capture(bot.bones);
      if (bot.actions?.run) {
        jogAnimPhase = poseInertia.matchClipPhase(bot.actions.run.getClip(), poseInertia.quats, 48);
      }
      const shiftHeld = state.keys.has("shift") || state.keys.has("shiftleft") || state.keys.has("shiftright");
      if (bot.actions?.sprint && (shiftHeld || state.sprintHold)) {
        sprintAnimPhase = poseInertia.matchClipPhase(bot.actions.sprint.getClip(), poseInertia.quats, 48);
      }
      state.stopping = false;
      state.stopTimer = 0;
      state.stopWeight = 0;
      state.stopCarry = 0;
      state.stopMirror = false;
      if (bot.actions?.stop) bot.actions.stop.setEffectiveWeight(0);
      if (bot.actions?.stopMirror) bot.actions.stopMirror.setEffectiveWeight(0);
      poseInertia.play("stop-out", STOP.blendOut);
    },

    step(dt) {
      if (!state.stopping) return;
      const bot = getBot();
      const robot = getRobot();
      const before = robot.position.clone();
      const prev = Math.min(1, state.stopTimer / Math.max(1e-4, state.stopDur));
      state.stopTimer += dt;
      const norm = Math.min(1, state.stopTimer / Math.max(1e-4, state.stopDur));
      this.sampleRoot(prev, this._rootA);
      this.sampleRoot(norm, this._rootB);
      const df = (this._rootB.x - this._rootA.x) * state.stopScale;
      const dl = (this._rootB.y - this._rootA.y) * state.stopScale;
      const carry = this.carryDist(norm) - this.carryDist(prev);
      const fx = state.stopDir.x;
      const fz = state.stopDir.z;
      const lx = fz;
      const lz = -fx;
      robot.position.x += fx * (df + carry) + lx * dl;
      robot.position.z += fz * (df + carry) + lz * dl;
      resolveCollisions(robot.position);
      stepTo(before, robot.position);
      const moved = Math.hypot(robot.position.x - before.x, robot.position.z - before.z);
      state.speedMeter = dt > 1e-5 ? moved / dt : 0;
      state.sprint = THREE.MathUtils.clamp((state.speedMeter - SPEED) / Math.max(0.001, SPRINT_SPEED - SPEED), 0, 1);
      state.sprintMul = Math.max(1, state.speedMeter / SPEED);
      if (norm >= 1) {
        /* Hold the last authored frame as the bridge source; idle runs underneath. */
        const stopClip = this.activeAction()?.getClip?.();
        state.stopping = false;
        state.stopTimer = state.stopDur;
        state.stopWeight = 0;
        state.speedMeter = 0;
        state.sprint = 0;
        state.sprintMul = 1;
        state.stopCarry = 0;
        if (stopClip) {
          poseInertia.captureClip(stopClip, stopClip.duration);
          const idleAct = bot.actions?.idle;
          if (idleAct) {
            const idleClip = idleAct.getClip();
            const phase = poseInertia.matchClipPhase(idleClip, poseInertia.quats, 48);
            idleAct.time = phase * idleClip.duration;
          }
          poseInertia.play("stop-out", STOP.blendOut);
        }
        state.stopMirror = false;
      }
    },
  };

  /* ——— Sprint 180 turn ———
     Clip = Cascadeur->Niko retarget (same pipeline as sprint.json). The export takes the body's
     true heading and the hip travel out of the clip (`yawCurve`, `root`); TurnLoco plays them
     back on the root, so the turn is the authored motion and ends facing exactly the other way
     with only a sprint-sized hip twist left for the blend. */
  const TurnLoco = {
    sampleYaw(norm) {
      const curve = TURN180.yawCurve;
      const last = curve.length - 1;
      const x = Math.min(last, Math.max(0, norm * last));
      const i0 = Math.floor(x);
      const i1 = Math.min(last, i0 + 1);
      const f = x - i0;
      return curve[i0] * (1 - f) + curve[i1] * f;
    },

    _rootA: new THREE.Vector2(),
    _rootB: new THREE.Vector2(),
    _scale: new THREE.Vector3(),

    /** Authored hip travel at a clip fraction: x = forward, y = left (model units). */
    sampleRoot(norm, out) {
      const track = TURN180.root;
      const last = track.length / 2 - 1;
      const x = Math.min(last, Math.max(0, norm * last));
      const i0 = Math.floor(x);
      const i1 = Math.min(last, i0 + 1);
      const f = x - i0;
      return out.set(
        track[i0 * 2] * (1 - f) + track[i1 * 2] * f,
        track[i0 * 2 + 1] * (1 - f) + track[i1 * 2 + 1] * f,
      );
    },

    /** Authored travel speed between two clip frames, in world units per second. */
    authoredSpeed(frameA, frameB) {
      const track = TURN180.root;
      const last = track.length / 2 - 1;
      const span = ((frameB - frameA) / last) * (state.turn180Dur || 0.667);
      const dist = Math.hypot(track[frameB * 2] - track[frameA * 2], track[frameB * 2 + 1] - track[frameA * 2 + 1]);
      return span > 1e-5 ? (dist * state.turn180Scale) / span : 0;
    },

    /** Distance the entry-speed difference adds by a clip fraction. The difference fades as u^pow and is
        gone at turn180CarryUntil: u^2 from frame 0, straight (pow 1) after a release, where the root comes
        in slow and a faster fade overshot the speed the plant starts at. */
    carryDist(norm) {
      const from = state.turn180CarryFrom;
      const span = Math.max(1e-4, state.turn180CarryUntil - from);
      const u = 1 - THREE.MathUtils.clamp((norm - from) / span, 0, 1);
      const pow = state.turn180CarryPow + 1;
      return state.turn180Carry * (state.turn180Dur || 0.667) * (span / pow) * (1 - Math.pow(u, pow));
    },

    /** A sprint key was let go inside the grace window and he is still in that skid. */
    releasedFromSprint() {
      return state.turn180CommitT > 0 && state.stopping && state.stopSpeed >= TURN180_SPEED_MIN;
    },

    /** Facing for reverse checks - commitDir covers release->opposite (S up then W). */
    facingDir() {
      return state.turn180CommitT > 0 ? state.turn180CommitDir : state.moveDir;
    },

    travelDot(dir) {
      const face = this.facingDir();
      return face.x * dir.x + face.z * dir.z;
    },

    /** Sprint gait is visibly on - 180 only staggers from this, not from jog. */
    sprintAnimActive() {
      return state.sprint >= TURN180.sprintAnimMin && state.walk > 0.45;
    },

    armCommit() {
      if (state.moveDir.lengthSq() < 0.001) return;
      state.turn180CommitDir.copy(state.moveDir).normalize();
      state.turn180CommitT = TURN180.reverseGrace;
    },

    /** @returns {string|null} reject reason, or null if the turn may start */
    blockedReason(input) {
      if (state.turning180) return "busy";
      if (state.punching || lockTarget) return "blocked";
      const commitLive = state.turn180CommitT > 0;
      if (state.stopping && !commitLive) return "blocked";
      if (!state.wasMoving && !commitLive) return "not-moving";
      /* A release is judged on the sprint he let go of. The skid's falling speed used to reject
         the key, he ran the new way until the speed was back, and only then the turn fired from
         the old facing (a late turn with a facing snap). */
      if (!this.releasedFromSprint()) {
        if (state.speedMeter < TURN180_SPEED_MIN) return "slow";
        if (!this.sprintAnimActive() && !(commitLive && state.sprint >= TURN180.sprintAnimMin * 0.7)) {
          return "not-sprint-anim";
        }
      }
      if (this.travelDot(input) >= TURN180.reverseDot) return "not-reverse";
      return null;
    },

    /**
     * Clip is authored CW. Root always turns exactly authoredSign*pi from the travel facing -
     * never from lagged robot.rotation.y, and never the long +-2pi way
     * (log: deltaYaw -263/-288 when stick wasn't exactly opposite).
     */
    authoredYawDelta() {
      return (Math.sign(turn180ClipData.yawDeltaDeg || -1) || -1) * Math.PI;
    },

    start(input) {
      const bot = getBot();
      const robot = getRobot();
      const playLog = getPlayLog();
      const travelDot = this.travelDot(input);
      const clipDur = bot.actions?.turn180?.getClip()?.duration ?? turn180ClipData.duration ?? (40 / 60);
      const face = this.facingDir();
      state.turn180StartDir.copy(face).normalize();
      if (state.turn180StartDir.lengthSq() < 0.001) {
        state.turn180StartDir.set(Math.sin(state.yaw), 0, Math.cos(state.yaw)).normalize();
      }
      /* Exact reverse of travel - stick only arms the turn; animation owns the 180 arc. */
      state.turn180TargetDir.copy(state.turn180StartDir).multiplyScalar(-1);
      state.turn180StartYaw = Math.atan2(state.turn180StartDir.x, state.turn180StartDir.z);
      state.turn180YawDelta = this.authoredYawDelta();
      /* Sync plant lag so root and clip start from the same facing. */
      robot.rotation.y = state.turn180StartYaw;
      state.yaw = state.turn180StartYaw;
      state.chestTwist = 0;
      state.pathOmega = 0;

      /* Out of a release the clip is joined as many frames in as the key was up; an overlap starts at frame 0. */
      const turnDur = clipDur / TURN180.animScale;
      const sinceRelease = this.releasedFromSprint() ? TURN180.reverseGrace - state.turn180CommitT : 0;
      const joinNorm = THREE.MathUtils.clamp(sinceRelease / turnDur, 0, TURN180.joinMax);
      /* What the root is really doing right now: the skid travels at a share of the meter. */
      const entrySpeed = state.stopping ? state.speedMeter * STOP_SKID : state.speedMeter;

      state.turning180 = true;
      state.turn180Timer = joinNorm * turnDur;
      state.turn180Dur = turnDur;
      state.turn180StartSpeed = state.speedMeter;
      state.turn180CommitT = 0;
      state.sprintHold = false;
      /* Clip travel is in model units; the armature's world scale turns it into world units. */
      const armature = bot.bones?.Hips?.parent;
      state.turn180Scale = armature ? armature.getWorldScale(this._scale).y : NIKO_SCALE;
      /* The clip runs in at its own speed; the difference to the root's entry speed is added
         on top and bleeds off before the first foot plants, so there is no speed step at entry. */
      const lastFrame = TURN180.root.length / 2 - 1;
      const joinFrame = Math.min(lastFrame - 1, Math.floor(joinNorm * lastFrame));
      const authored = this.authoredSpeed(joinFrame, joinFrame + 1);
      state.turn180Carry = THREE.MathUtils.clamp(entrySpeed - authored, -authored, 4);
      state.turn180CarryFrom = joinNorm;
      state.turn180CarryUntil = joinNorm > 0 ? TURN180.joinCarryUntil : TURN180.carryUntil;
      state.turn180CarryPow = joinNorm > 0 ? 1 : 2;

      if (state.stopping) {
        state.stopping = false;
        state.stopTimer = 0;
        state.stopWeight = 0;
        state.stopMirror = false;
        if (bot.actions?.stop) bot.actions.stop.setEffectiveWeight(0);
        if (bot.actions?.stopMirror) bot.actions.stopMirror.setEffectiveWeight(0);
      }
      /* Exclusive turn under the mixer; poseInertia carries the sprint pose onto the running clip. */
      state.turn180Weight = 1;
      state._turn180SprintPhase = sprintAnimPhase;
      poseInertia.capture(bot.bones);
      poseInertia.play("in", TURN180.blendIn);

      const endYaw = wrapYaw(state.turn180StartYaw + state.turn180YawDelta);
      if (bot.actions?.turn180) {
        bot.actions.turn180.reset();
        bot.actions.turn180.play();
      }
      playLog.decision("TURN180_START", {
        speed: +state.speedMeter.toFixed(2),
        speedMin: TURN180_SPEED_MIN,
        sprint: +state.sprint.toFixed(2),
        sprintAnimMin: TURN180.sprintAnimMin,
        travelDot: +travelDot.toFixed(2),
        yaw: +((state.turn180StartYaw * 180) / Math.PI).toFixed(1),
        targetYaw: +((endYaw * 180) / Math.PI).toFixed(1),
        deltaYaw: +((state.turn180YawDelta * 180) / Math.PI).toFixed(1),
        stagger: 1,
        gapMs: Math.round(sinceRelease * 1000),
        joinFrame: +(joinNorm * lastFrame).toFixed(1),
        entry: +entrySpeed.toFixed(2),
        keys: [...state.keys].sort().join("+") || "-",
      });
    },

    /** Advances an active 180. Returns true while still turning. */
    step(dt, isSprint) {
      const bot = getBot();
      const robot = getRobot();
      const playLog = getPlayLog();
      state.path = [];
      state.pending = null;
      const turnDur = state.turn180Dur || 0.667;
      const prevNorm = Math.min(1, state.turn180Timer / turnDur);
      state.turn180Timer += dt;
      const turnNorm = Math.min(1, state.turn180Timer / turnDur);
      state.pathOmega = 0;

      /* Root travel = the clip's own hip path laid along the inbound direction: brake to the
         apex, hold on the planted feet, push off backwards. Nothing here is a tuned curve. */
      const from = this.sampleRoot(prevNorm, this._rootA);
      const to = this.sampleRoot(turnNorm, this._rootB);
      const dir = state.turn180StartDir;
      const forward = (to.x - from.x) * state.turn180Scale + this.carryDist(turnNorm) - this.carryDist(prevNorm);
      const left = (to.y - from.y) * state.turn180Scale;
      /* A body facing +Z has its left at +X, so left of (x, z) is (z, -x). */
      robot.position.x += dir.x * forward + dir.z * left;
      robot.position.z += dir.z * forward - dir.x * left;
      const span = (turnNorm - prevNorm) * turnDur;
      if (span > 1e-5) state.speedMeter = Math.hypot(forward, left) / span;
      state.moveDir.copy(turnNorm < TURN180.apex ? dir : state.turn180TargetDir);

      /* Root facing = the clip's own body heading. It turns with the body all the way and
         lands on exactly half a turn at the last frame, so the sprint blend has no yaw to fix. */
      const yaw = wrapYaw(state.turn180StartYaw + state.turn180YawDelta * this.sampleYaw(turnNorm));
      robot.rotation.y = yaw;
      state.yaw = yaw;

      state.sprint = THREE.MathUtils.clamp((state.speedMeter - SPEED) / Math.max(0.001, SPRINT_SPEED - SPEED), 0, 1);
      state.sprintMul = Math.max(1, state.speedMeter / SPEED);
      state.wasSprinting = state.speedMeter >= SPRINT_STOP_THRESHOLD;
      state.pace = THREE.MathUtils.damp(state.pace, 1, 12, dt);

      if (state.turn180Timer < turnDur) return true;

      /* Clip is over: hand the last frame to the sprint. */
      const endYaw = wrapYaw(state.turn180StartYaw + state.turn180YawDelta);
      state.turning180 = false;
      state.moveDir.copy(state.turn180TargetDir);
      state.yaw = endYaw;
      robot.rotation.y = endYaw;
      state.pathOmega = 0;
      state.chestTwist = 0;
      state.turn180Weight = 0;
      /* Leave at the push-off speed the clip ends on; the normal sprint ramp takes it from there.
         The gait stays on the sprint clip meanwhile (a jog cycle would flash in at this speed). */
      const lastFrame = TURN180.root.length / 2 - 1;
      state.speedMeter = this.authoredSpeed(lastFrame - 1, lastFrame);
      state.sprintMul = Math.max(1, state.speedMeter / SPEED);
      state.sprintHold = isSprint;
      if (isSprint) {
        state.sprint = 1;
        state.gaitSprint = true;
        state.gaitMix = 1;
      } else {
        state.gaitSprint = false;
        state.gaitMix = 0;
      }

      /* Exit bridge: source = the clip's exact last frame, destination = the sprint clip running
         from the phase whose legs and hips are closest to it. */
      const turnClip = bot.actions?.turn180?.getClip?.();
      const sprintClip = bot.actions?.sprint?.getClip?.();
      if (turnClip) {
        poseInertia.captureClip(turnClip, turnClip.duration);
        if (sprintClip) {
          const phase = poseInertia.matchSprintPhase(sprintClip, poseInertia.quats, 64);
          sprintAnimPhase = phase;
          state._turn180SprintPhase = phase;
        }
        poseInertia.play("out", TURN180.blendOut);
      }
      playLog.decision("TURN180_END", {
        speed: +state.speedMeter.toFixed(2),
        yaw: +((state.yaw * 180) / Math.PI).toFixed(1),
        dur: +state.turn180Timer.toFixed(3),
        sprintPhase: +sprintAnimPhase.toFixed(2),
      });
      return false;
    },

    logReject(input, reason) {
      const playLog = getPlayLog();
      if (!playLog.enabled) return;
      const travelDot = this.travelDot(input);
      if (travelDot >= -0.15 || state.speedMeter < TURN180_SPEED_MIN * 0.5) return;
      const sig = `${reason}|${travelDot.toFixed(1)}|${state.speedMeter.toFixed(0)}`;
      if (sig === state._turn180RejectSig && getClock() - (state._turn180RejectAt || 0) < 0.25) return;
      state._turn180RejectSig = sig;
      state._turn180RejectAt = getClock();
      playLog.decision("TURN180_REJECT", {
        reason,
        travelDot: +travelDot.toFixed(2),
        speed: +state.speedMeter.toFixed(2),
        speedMin: TURN180_SPEED_MIN,
        sprint: +state.sprint.toFixed(2),
        keys: [...state.keys].sort().join("+") || "-",
      });
    },
  };

  const footLeave = {
    L: { prevY: 0, prevNear: false, cool: 0, primed: false },
    R: { prevY: 0, prevNear: false, cool: 0, primed: false },
  };
  const footTmp = new THREE.Vector3();
  const footSpawn = new THREE.Vector3();
  const footDir = new THREE.Vector3();
  /* Foot bone sits ~ankle (~0.19-0.28 above soles when planted), not sole contact. */
  const LIFT_VEL = 0.85;
  const FOOT_NEAR = 0.30;
  const FOOT_HOLD = 0.42;
  const FOOT_COOL = 0.08;
  const sampleFootLeave = (side, bone, groundY, sprinting, dt) => {
    const robot = getRobot();
    const track = footLeave[side];
    track.cool = Math.max(0, track.cool - dt);
    if (!bone || !(dt > 1e-5)) return;
    bone.updateWorldMatrix(true, false);
    bone.getWorldPosition(footTmp);
    const y = footTmp.y;
    const dy = (y - track.prevY) / dt;
    const nearGround = y <= groundY + FOOT_NEAR;
    const leaving = track.prevNear && dy > LIFT_VEL;
    if (sprinting && leaving && track.cool <= 0 && track.primed) {
      footSpawn.set(footTmp.x, groundY + 0.05, footTmp.z);
      footDir.set(state.moveDir.x, 0, state.moveDir.z);
      if (footDir.lengthSq() < 1e-6) {
        footDir.set(-Math.sin(robot.rotation.y), 0, -Math.cos(robot.rotation.y));
      } else {
        footDir.normalize();
      }
      footDust.spawn(footSpawn, footDir, side);
      track.cool = FOOT_COOL;
    }
    track.prevY = y;
    track.prevNear = nearGround || (dy <= 0 && y <= groundY + FOOT_HOLD);
    if (!track.primed) track.primed = true;
  };

  const debugFootDust = (force) => {
    if (force === "reset") {
      footDust.resetStats();
      return footDust.stats();
    }
    if (force === "L" || force === "R") {
      const robot = getRobot();
      const groundY = island.groundAt(robot.position.x, robot.position.z);
      footSpawn.set(robot.position.x + (force === "L" ? -0.15 : 0.15), groundY + 0.05, robot.position.z);
      footDir.set(state.moveDir.x, 0, state.moveDir.z);
      if (footDir.lengthSq() < 1e-6) {
        footDir.set(-Math.sin(robot.rotation.y), 0, -Math.cos(robot.rotation.y));
      } else {
        footDir.normalize();
      }
      footDust.spawn(footSpawn, footDir, force);
    }
    return footDust.stats();
  };

  const triggerPunch = () => {
    const bot = getBot();
    if (!bot.actions?.punch) return;
    if (state.punching) return;
    state.punching = true;
    state.punchType = "flyingKnee";
    state.punchTimer = 0;
    state.turning180 = false;
    state.turn180Timer = 0;
    state.turn180Weight = 0;
    if (bot.actions?.turn180) bot.actions.turn180.setEffectiveWeight(0);
    state.punchHitboxActive = false;
    punchHitbox.active = false;
    punchHitbox.frame = -1;
    state.path = [];
    state.pending = null;
    bot.actions.punch.reset();
    bot.actions.punch.setLoop(THREE.LoopOnce, 1);
    bot.actions.punch.clampWhenFinished = false;
    bot.actions.punch.setEffectiveTimeScale(1.5);
    bot.actions.punch.play();
  };

  const triggerOnePunch = () => {
    const bot = getBot();
    const robot = getRobot();
    if (!bot.actions?.onePunch) return;
    if (state.punching) return;
    state.punching = true;
    state.punchType = "onePunch";
    state.punchTimer = 0;
    state.turning180 = false;
    state.turn180Timer = 0;
    state.turn180Weight = 0;
    if (bot.actions?.turn180) bot.actions.turn180.setEffectiveWeight(0);
    state.punchOrigin = robot.position.clone();
    state.punchForward = new THREE.Vector3(Math.sin(robot.rotation.y), 0, Math.cos(robot.rotation.y)).normalize();
    state.punchHitboxActive = false;
    punchHitbox.active = false;
    punchHitbox.frame = -1;
    state.path = [];
    state.pending = null;
    bot.actions.onePunch.reset();
    bot.actions.onePunch.setLoop(THREE.LoopOnce, 1);
    bot.actions.onePunch.clampWhenFinished = false;
    bot.actions.onePunch.setEffectiveTimeScale(1.0);
    bot.actions.onePunch.play();
  };

  const faceRight = new THREE.Vector3();
  const faceForward = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const posedQ = new THREE.Quaternion();
  const keyA = new THREE.Quaternion();
  const keyB = new THREE.Quaternion();
  const sampleTrack = (track, time, out) => {
    const times = track.times;
    const values = track.values;
    const last = times.length - 1;
    const span = times[last] || 1;
    let t = time % span;
    if (t < 0) t += span;
    let index = 0;
    while (index < last && times[index + 1] <= t) index += 1;
    if (index >= last) {
      const offset = last * 4;
      out.set(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
      return;
    }
    const gap = times[index + 1] - times[index];
    const u = gap > 1e-8 ? (t - times[index]) / gap : 0;
    const a = index * 4;
    const b = a + 4;
    keyA.set(values[a], values[a + 1], values[a + 2], values[a + 3]);
    keyB.set(values[b], values[b + 1], values[b + 2], values[b + 3]);
    out.copy(keyA).slerp(keyB, u);
  };

  const footRay = new THREE.Raycaster();
  const footOrigin = new THREE.Vector3();
  const footDown = new THREE.Vector3(0, -1, 0);
  const travelled = new THREE.Vector3();
  const still = new THREE.Vector3();

  const evalClipTime = (phase, dur, scale, fps) => {
    if (fps > 0) {
      const cycle = dur / scale;
      const steps = Math.max(4, Math.round((cycle * fps) / 2) * 2);
      return (Math.floor(phase * steps) / steps) * dur;
    }
    return phase * dur;
  };

  const update = (dt) => {
    const bot = getBot();
    const robot = getRobot();
    const dummy = getDummy();
    const dummyFocus = getDummyFocus();
    const dummyRing = getDummyRing();
    const werewolfBoss = getWerewolfBoss();
    const introLive = getIntroLive();
    const calm = getCalm();
    const playLog = getPlayLog();
    const playLogInput = getPlayLogInput();
    const arrive = getArrive();

    const isBossLocked = lockTarget && lockTarget === werewolfBoss?.group;
    const targetFocus = isBossLocked ? werewolfBoss.getFocus() : dummyFocus;
    werewolfBoss?.setTargeted?.(isBossLocked);
    if (lockTarget) {
      const dx = targetFocus.x - robot.position.x;
      const dz = targetFocus.z - robot.position.z;
      const reach = dx * dx + dz * dz;
      const far = reach > LOCK_REACH * LOCK_REACH;
      if (reach > 0.0001) setCamYawGoal(Math.atan2(dx, dz) + Math.PI);
      /* While the yaw is still catching up, an off-screen dummy is not out of bounds yet. */
      const yawGap = Math.abs(Math.atan2(Math.sin(getCamYawGoal() - getCamYaw()), Math.cos(getCamYawGoal() - getCamYaw())));
      playerChest.set(robot.position.x, robot.position.y + 1.2, robot.position.z);
      const outside = !far && yawGap <= LOCK_YAW_SKIP && (!inCamera(playerChest) || !inCamera(targetFocus));
      if (far || outside) {
        lockLost += dt;
        if (lockLost >= 0.2) lockTarget = null;
      } else {
        lockLost = 0;
      }
    }
    if (dummyRing) dummyRing.visible = Boolean(lockTarget && lockTarget === dummy);
    dampCamYaw(dt, Boolean(lockTarget));
    applyCamAxes();

    const input = (introLive || state.punching) ? still : getInputVector();
    playLogInput.x = input.x;
    playLogInput.z = input.z;
    const before = robot.position.clone();
    let moving = false;

    const isSprint = (state.keys.has("shift") || state.keys.has("shiftleft") || state.keys.has("shiftright")) && input.lengthSq() > 0.0001;

    /* Try to arm a 180 before movement so the same frame already plants. No cooldown - reverse always staggers when sprint is live. */
    if (!state.turning180 && input.lengthSq() > 0.0001) {
      const blocked = TurnLoco.blockedReason(input);
      if (!blocked) TurnLoco.start(input);
      else if (blocked === "slow" || blocked === "not-sprint-anim" || blocked === "not-reverse" || blocked === "blocked") {
        TurnLoco.logReject(input, blocked);
      }
    }

    if (state.turning180) {
      TurnLoco.step(dt, isSprint);
      resolveCollisions(robot.position);
      stepTo(before, robot.position);
      moving = true;
      state.turn180CommitT = 0;
    } else if (input.lengthSq() > 0.0001) {
      state.path = [];
      state.pending = null;

      /* Setting off again after a stop: the facing he let go of no longer counts as a reverse. */
      if (!state.wasMoving) state.turn180CommitT = 0;

      if (!state.wasMoving && state.speedMeter < SPEED) {
        state.speedMeter = SPEED;
      }

      if (isSprint) {
        state.speedMeter = THREE.MathUtils.damp(state.speedMeter, SPRINT_SPEED, 9.0, dt);
      } else if (state.speedMeter > SPEED) {
        state.speedMeter = THREE.MathUtils.damp(state.speedMeter, SPEED, 4.2, dt);
      } else {
        state.speedMeter = THREE.MathUtils.damp(state.speedMeter, SPEED, 12.0, dt);
      }

      const sprintProgress = THREE.MathUtils.clamp((state.speedMeter - SPEED) / Math.max(0.001, SPRINT_SPEED - SPEED), 0, 1);
      state.sprint = sprintProgress;
      /* Out of a 180 the speed starts at the clip's push-off and ramps up; keep the sprint gait
         (not a jog cycle) on screen until the speed has caught up. */
      if (state.sprintHold) {
        if (isSprint && sprintProgress < 0.95) state.sprint = 1;
        else state.sprintHold = false;
      }
      state.sprintMul = Math.max(1.0, state.speedMeter / SPEED);
      state.wasSprinting = state.speedMeter >= SPRINT_STOP_THRESHOLD;

      /* Curvature-limited steering: jog turns tight; sprint holds a motorcycle turning radius.
         Hold steering still while turn residual weight is high - pathOmega after END was a snap. */
      const desiredYaw = Math.atan2(input.x, input.z);
      let travelYaw = Math.atan2(state.moveDir.x, state.moveDir.z);
      if (state.turning180 || state.turn180Weight > 0.22 || (poseInertia.active && poseInertia.kind === "out")) {
        state.pathOmega = 0;
      } else if (!state.wasMoving || state.moveDir.lengthSq() < 0.001) {
        /* Always snap travel on the first moving frame - the old speed<2 gate left moveDir at (0,0,1)
           after the idle->SPEED boost, which false-triggered 180s against camera-forward W. */
        state.moveDir.copy(input);
        travelYaw = desiredYaw;
        state.pathOmega = 0;
      } else {
        const yawErr = Math.atan2(Math.sin(desiredYaw - travelYaw), Math.cos(desiredYaw - travelYaw));
        /* Drop camera-follow micro-corrections so holding W alone does not bank forever. */
        if (Math.abs(yawErr) < 0.07) {
          travelYaw = desiredYaw;
          state.moveDir.set(Math.sin(travelYaw), 0, Math.cos(travelYaw));
          state.pathOmega = 0;
        } else {
          const turnRadius = THREE.MathUtils.lerp(0.55, 1.9, state.sprint);
          const maxOmega = Math.max(2.8, state.speedMeter / Math.max(0.35, turnRadius));
          /* Ease steering back in as residual turn weight drops. */
          const steerMul = THREE.MathUtils.smoothstep(1 - state.turn180Weight, 0.22, 0.55);
          const step = THREE.MathUtils.clamp(yawErr, -maxOmega * dt, maxOmega * dt) * steerMul;
          travelYaw += step;
          state.moveDir.set(Math.sin(travelYaw), 0, Math.cos(travelYaw));
          state.pathOmega = dt > 1e-4 ? step / dt : 0;
        }
      }

      robot.position.addScaledVector(state.moveDir, state.speedMeter * dt);
      resolveCollisions(robot.position);
      stepTo(before, robot.position);
      state.yaw = travelYaw;
      state.pace = THREE.MathUtils.damp(state.pace, input.length(), 10, dt);
      moving = true;

      if (state.stopping) StopLoco.cancelToMove();
    } else if (state.path.length) {
      state.pace = THREE.MathUtils.damp(state.pace, 1, 10, dt);
      state.speedMeter = THREE.MathUtils.damp(state.speedMeter, SPEED, 10.0, dt);
      const sprintProgress = THREE.MathUtils.clamp((state.speedMeter - SPEED) / Math.max(0.001, SPRINT_SPEED - SPEED), 0, 1);
      state.sprint = sprintProgress;
      state.sprintMul = Math.max(1.0, state.speedMeter / SPEED);
      state.wasSprinting = false;
      state.pathOmega = 0;

      const target = state.path[0];
      const dx = target.x - robot.position.x;
      const dz = target.z - robot.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 0.06) {
        state.path.shift();
        if (!state.path.length) {
          arrive();
        }
      } else {
        const step = Math.min(dist, state.speedMeter * dt);
        robot.position.x += (dx / dist) * step;
        robot.position.z += (dz / dist) * step;
        state.yaw = Math.atan2(dx, dz);
        moving = true;
      }
    } else {
      // Authored sprint stop when releasing keys at sprint speed (root-motion decelerate).
      if (state.wasMoving && state.speedMeter >= SPRINT_STOP_THRESHOLD && !state.stopping && !state.punching && !lockTarget) {
        StopLoco.start();
      }
      state.wasSprinting = false;
      state.pathOmega = 0;
      state.pace = THREE.MathUtils.damp(state.pace, 0, 10, dt);
      if (!state.stopping) {
        state.speedMeter = THREE.MathUtils.damp(state.speedMeter, 0, 14.0, dt);
        if (state.speedMeter < 0.01) state.speedMeter = 0;
        state.sprint = THREE.MathUtils.clamp((state.speedMeter - SPEED) / Math.max(0.001, SPRINT_SPEED - SPEED), 0, 1);
        state.sprintMul = 1.0;
      }
    }

    /* Refresh reverse-commit while sprint-ready; decay after release so S up...W still reads as a 180. */
    if (moving && !state.turning180 && state.speedMeter >= TURN180_SPEED_MIN && TurnLoco.sprintAnimActive()) {
      TurnLoco.armCommit();
    } else if (!state.turning180 && state.turn180CommitT > 0) {
      state.turn180CommitT = Math.max(0, state.turn180CommitT - dt);
    }

    if (!moving) state.sprintHold = false;
    state.wasMoving = moving;
    playLog.frame(dt);

    if (devHud) {
      const maxSpeed = Math.max(0.001, SPRINT_SPEED);
      const pct = THREE.MathUtils.clamp(state.speedMeter / maxSpeed, 0, 1) * 100;
      const speedReady = state.speedMeter >= TURN180_SPEED_MIN;
      const animReady = TurnLoco.sprintAnimActive();
      const ready = speedReady && animReady;
      devHud.fill.style.width = `${pct.toFixed(1)}%`;
      devHud.fill.classList.toggle("is-ready", ready);
      devHud.mark.style.left = `${((TURN180_SPEED_MIN / maxSpeed) * 100).toFixed(1)}%`;
      devHud.read.textContent = `${state.speedMeter.toFixed(1)} / ${SPRINT_SPEED.toFixed(1)} m/s`;
      if (state.turning180) {
        devHud.arm.textContent = "180 STAGGER";
        devHud.arm.className = "dev-speed-arm is-turning";
      } else if (ready) {
        devHud.arm.textContent = `180 READY (sprint anim)`;
        devHud.arm.className = "dev-speed-arm is-ready";
      } else if (speedReady && !animReady) {
        devHud.arm.textContent = `build sprint anim (${state.sprint.toFixed(2)}/${TURN180.sprintAnimMin})`;
        devHud.arm.className = "dev-speed-arm";
      } else {
        devHud.arm.textContent = `180 at ${TURN180_SPEED_MIN.toFixed(1)} m/s + sprint`;
        devHud.arm.className = "dev-speed-arm";
      }
    }

    if (state.stopping) StopLoco.step(dt);

    /* Feet stay on the drawn ground, not the height grid: the mesh sags between samples, and standing on the
       grid leaves a lit gap under the soles. Decks stay on the grid height when the terrain is far below. */
    const started = getStarted();
    const guess = island.groundAt(robot.position.x, robot.position.z);
    footOrigin.set(robot.position.x, guess + 3, robot.position.z);
    footRay.set(footOrigin, footDown);
    footRay.far = 8;
    const footHit = footRay.intersectObject(island.terrain, false);
    const footY = footHit.length ? footHit[0].point.y : guess;
    const floor = Math.abs(footY - guess) < 0.8 ? footY : guess;
    robot.position.y = !moving || calm || !started ? floor : THREE.MathUtils.damp(robot.position.y, floor, 18, dt);
    travelled.subVectors(robot.position, before).setY(0);

    if (state.path.length && travelled.length() < SPEED * dt * 0.2) {
      state.stuck += dt;
      if (state.stuck > 0.45) {
        const pending = state.pending;
        state.path = [];
        if (pending && robot.position.distanceTo(pending.spot) < 2) {
          arrive();
        } else {
          state.pending = null;
        }
      }
    } else {
      state.stuck = 0;
    }

    if (moving && !root.classList.contains("world-moved")) {
      root.classList.add("world-moved");
    }

    /* Robot animation */

    state.walk = THREE.MathUtils.damp(state.walk, moving ? 1 : 0, 10, dt);
    state.phase += dt * 10 * state.walk * state.pace * (1.0 + state.sprint * 0.35);
    const step = Math.sin(state.phase);
    const swing = step * 0.7 * state.walk;

    /* Standing still, he turns three-quarters toward the camera and looks up, so his face reads from above */
    state.still = (moving || state.punching) ? 0 : state.still + dt;
    const faceCam = !lockTarget && !state.punching && bot.mixer && robot.visible && state.still > 0.9 && !state.path.length && !root.classList.contains("world-intro");
    if (lockTarget && !introLive && !state.punching) {
      /* Same turn as Pixel Pass: a yaw quaternion toward the dummy, then rotate towards it at 720 deg/s.
         This three build has slerp but not Quaternion.rotateTowards, so the step is applied here. */
      const dx = targetFocus.x - robot.position.x;
      const dz = targetFocus.z - robot.position.z;
      if (dx * dx + dz * dz > 0.0001) {
        /* Yaw-only quaternion step. A raw slerp is unstable when the turn is exactly 180 deg, which is the spawn facing. */
        const targetYaw = Math.atan2(dx, dz);
        let delta = Math.atan2(Math.sin(targetYaw - robot.rotation.y), Math.cos(targetYaw - robot.rotation.y));
        if (Math.abs(delta) > Math.PI - 0.001) delta = (delta < 0 ? -1 : 1) * (Math.PI - 0.001);
        const turnStep = THREE.MathUtils.degToRad(720) * dt;
        const yaw = Math.abs(delta) <= turnStep ? targetYaw : robot.rotation.y + Math.sign(delta) * turnStep;
        /* The euler holds the yaw. Writing the quaternion gets folded back past +-90 deg by three's XYZ sync. */
        robot.rotation.y = yaw;
      }
      state.yaw = robot.rotation.y;
    } else if (state.holdYaw != null) state.yaw = Math.atan2(camOffset.x, camOffset.z) + state.holdYaw;
    else if (faceCam) {
      const camYaw = Math.atan2(camOffset.x, camOffset.z);
      let rel = state.yaw - camYaw;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      state.yaw = camYaw + THREE.MathUtils.clamp(rel, -0.4, 0.4);
    }
    state.faceUp = THREE.MathUtils.damp(state.faceUp, faceCam ? 1 : 0, 3, dt);

    /* Stick-intent chest twist: near-instant torso aim. Root keeps a mild plant lag (not a skate). */
    {
      let twistGoal = 0;
      if (moving && !lockTarget && !state.turning180 && !state.punching && input.lengthSq() > 0.0001) {
        const intentYaw = Math.atan2(input.x, input.z);
        const plantYaw = robot.rotation.y;
        const err = Math.atan2(Math.sin(intentYaw - plantYaw), Math.cos(intentYaw - plantYaw));
        const sprintAmt = THREE.MathUtils.clamp(state.sprint, 0, 1);
        twistGoal = THREE.MathUtils.clamp(err * THREE.MathUtils.lerp(0.4, 0.85, sprintAmt), -0.7, 0.7);
      }
      state.chestTwist = THREE.MathUtils.damp(state.chestTwist || 0, twistGoal, moving ? 26.0 : 18.0, dt);
    }

    if (!(lockTarget && !introLive)) {
      const exitFacingLock = state.turning180 || (poseInertia.active && poseInertia.kind === "out");
      if (exitFacingLock) {
        /* TurnLoco owns facing; don't plant-lag or resync yaw over the 180->sprint bridge. */
        robot.rotation.y = wrapYaw(state.yaw);
      } else {
        let turn = state.yaw - robot.rotation.y;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        /* Mild plant lag on curvature only - earlier hard lag made travel skate out from under the body. */
        let faceRate = faceCam ? 4 : (moving ? (16.5 - state.sprint * 3.5) : 8);
        if (moving && !faceCam && state.sprint > 0.2) {
          const hard = THREE.MathUtils.clamp(Math.abs(state.pathOmega || 0) / 5.0, 0, 1);
          const straight = THREE.MathUtils.lerp(15.0, 12.0, state.sprint);
          const plant = THREE.MathUtils.lerp(11.0, 7.5, state.sprint);
          faceRate = THREE.MathUtils.lerp(straight, plant, hard);
        }
        robot.rotation.y += turn * Math.min(1, dt * faceRate);
        robot.rotation.y = wrapYaw(robot.rotation.y);
      }
    }

    /* Bank / lead from path curvature (moveDir omega), not facing-error rate. */
    const speedRatio = THREE.MathUtils.clamp((state.speedMeter - SPEED * 0.5) / Math.max(0.1, SPRINT_SPEED - SPEED * 0.5), 0, 1);
    const omega = state.pathOmega || 0;
    const targetBank = (moving && !lockTarget && !state.turning180)
      ? THREE.MathUtils.clamp(-omega * (0.085 + 0.11 * speedRatio), -0.36, 0.36)
      : 0;
    const targetLead = (moving && !lockTarget && !state.turning180)
      ? THREE.MathUtils.clamp(omega * (0.10 + 0.08 * state.sprint), -0.32, 0.32)
      : 0;
    state.bank = THREE.MathUtils.damp(state.bank, targetBank, moving ? 12.0 : 16.0, dt);
    state.turnLead = THREE.MathUtils.damp(state.turnLead || 0, targetLead, moving ? 12.0 : 16.0, dt);

    if (bot.mixer) {
      /* Free roam is idle against run. Lock-on plays the run directions in Niko's facing frame. */
      const { actions } = bot;
      let punchWeight = 0;
      if (state.punching) {
        if (state.punchType === "onePunch" && actions.onePunch) {
          state.punchTimer += dt * 1.0;
          const dur = actions.onePunch.getClip().duration;
          const punchFrame = Math.floor(state.punchTimer * 30);

          // Forward step from frame 1 to 22, hold at apex (22-24), return to original position from frame 24 to 35:
          if (state.punchOrigin && state.punchForward) {
            const frameFloat = THREE.MathUtils.clamp((state.punchTimer / dur) * 35, 0, 35);
            const f0 = Math.floor(frameFloat);
            const f1 = Math.min(35, f0 + 1);
            const frac = frameFloat - f0;
            const curveVal = ONE_PUNCH_STEP_CURVE[f0] * (1 - frac) + ONE_PUNCH_STEP_CURVE[f1] * frac;
            const disp = ONE_PUNCH_STEP_DIST * curveVal;

            const leapBefore = robot.position.clone();
            const targetPos = state.punchOrigin.clone().addScaledVector(state.punchForward, disp);
            targetPos.y = island.groundAt(targetPos.x, targetPos.z);
            resolveCollisions(targetPos);
            stepTo(leapBefore, targetPos);
            robot.position.copy(targetPos);
          }

          // RightHand hitbox active during impact window: frames 16-22
          const hitboxActive = punchFrame >= 16 && punchFrame <= 22;
          punchHitbox.active = hitboxActive;
          punchHitbox.frame = punchFrame;
          state.punchHitboxActive = hitboxActive;
          if (hitboxActive && bot.bones?.RightHand) {
            bot.bones.RightHand.getWorldPosition(punchHitbox.position);
            punchHitbox.sphere.center.copy(punchHitbox.position);
            const handScaleY = bot.bones.RightHand.scale.y;
            const radiusMult = Math.max(1.0, handScaleY * 0.75);
            punchHitbox.sphere.radius = punchHitbox.radius * radiusMult;
            punchHitbox.box.setFromCenterAndSize(punchHitbox.position, punchHitbox.size.clone().multiplyScalar(radiusMult));
          }

          // Right arm mesh-smearing effect during punch extension (frames 14-22):
          const smearActive = punchFrame >= 14 && punchFrame <= 22;
          if (smearActive) {
            let smearScale = 1.0;
            if (punchFrame < 17) {
              smearScale = THREE.MathUtils.clamp((punchFrame - 14) / 3.0, 0.4, 1.0);
            } else if (punchFrame > 19) {
              smearScale = THREE.MathUtils.clamp((22 - punchFrame) / 3.0, 0.3, 1.0);
            }
            nikoSmear.stepLag(dt, 7.5, smearScale, 1.0); // 1.0 = Right arm
          } else {
            nikoSmear.reset();
          }

          if (state.punchTimer >= dur) {
            if (state.punchOrigin) {
              robot.position.copy(state.punchOrigin);
              robot.position.y = island.groundAt(robot.position.x, robot.position.z);
            }
            state.punching = false;
            state.punchType = null;
            state.punchTimer = 0;
            state.punchOrigin = null;
            state.punchForward = null;
            state.punchHitboxActive = false;
            punchHitbox.active = false;
            punchHitbox.frame = -1;
            nikoSmear.reset();
            actions.onePunch.setEffectiveWeight(0);
            actions.onePunch.stop();
            if (bot.bones?.RightHand) bot.bones.RightHand.scale.set(1, 1, 1);
            if (bot.bones?.LeftFoot) bot.bones.LeftFoot.scale.set(1, 1, 1);
            punchWeight = 0;
          } else {
            const timeLeft = dur - state.punchTimer;
            punchWeight = timeLeft < 0.12 ? Math.max(0, timeLeft / 0.12) : 1.0;
            actions.onePunch.setEffectiveWeight(punchWeight);
          }
        } else if (actions.punch) {
          state.punchTimer += dt * 1.5;
          const dur = actions.punch.getClip().duration;

          // Forward movement propulsion (scaled for 1.5x speed):
          let leapSpeed = 0;
          if (state.punchTimer <= 0.467) {
            leapSpeed = 4.2;
          } else if (state.punchTimer <= 1.20) {
            leapSpeed = 3.6;
          } else if (state.punchTimer >= 1.50 && state.punchTimer <= 1.85) {
            leapSpeed = 2.8;
          }

          if (leapSpeed > 0) {
            const forward = new THREE.Vector3(Math.sin(robot.rotation.y), 0, Math.cos(robot.rotation.y));
            const leapBefore = robot.position.clone();
            robot.position.addScaledVector(forward, leapSpeed * dt);
            resolveCollisions(robot.position);
            stepTo(leapBefore, robot.position);
          }

          // Left hand hitbox: active only during keyframes 37-40 of the animation
          const punchFrame = Math.floor(state.punchTimer * 30);
          const hitboxActive = punchFrame >= 37 && punchFrame <= 40;
          punchHitbox.active = hitboxActive;
          punchHitbox.frame = punchFrame;
          state.punchHitboxActive = hitboxActive;
          if (hitboxActive && bot.bones?.LeftHand) {
            bot.bones.LeftHand.getWorldPosition(punchHitbox.position);
            punchHitbox.sphere.center.copy(punchHitbox.position);
            punchHitbox.sphere.radius = punchHitbox.radius;
            punchHitbox.box.setFromCenterAndSize(punchHitbox.position, punchHitbox.size);
          }

          // Full arm smear effect on Niko's left arm when swinging at frames 33-42:
          const smearActive = punchFrame >= 33 && punchFrame <= 42;
          if (smearActive) {
            let smearScale = 1.0;
            if (punchFrame < 36) {
              smearScale = THREE.MathUtils.clamp((punchFrame - 33) / 3.0, 0.4, 1.0);
            } else if (punchFrame > 40) {
              smearScale = THREE.MathUtils.clamp((42 - punchFrame) / 2.0, 0.3, 1.0);
            }
            nikoSmear.stepLag(dt, 7.5, smearScale, -1.0);
          } else {
            nikoSmear.reset();
          }

          if (state.punchTimer >= dur) {
            state.punching = false;
            state.punchType = null;
            state.punchTimer = 0;
            state.punchHitboxActive = false;
            punchHitbox.active = false;
            punchHitbox.frame = -1;
            nikoSmear.reset();
            actions.punch.setEffectiveWeight(0);
            actions.punch.stop();
            punchWeight = 0;
          } else {
            const timeLeft = dur - state.punchTimer;
            punchWeight = timeLeft < 0.12 ? Math.max(0, timeLeft / 0.12) : 1.0;
            actions.punch.setEffectiveWeight(punchWeight);
          }
        }
      } else {
        if (actions.punch) actions.punch.setEffectiveWeight(0);
        if (actions.onePunch) {
          actions.onePunch.setEffectiveWeight(0);
          if (bot.bones?.RightHand) bot.bones.RightHand.scale.set(1, 1, 1);
          if (bot.bones?.LeftFoot) bot.bones.LeftFoot.scale.set(1, 1, 1);
        }
        if (actions.sprint && !state.walk) {
          actions.sprint.setEffectiveWeight(0);
        }
        if (state.punchOrigin) {
          robot.position.copy(state.punchOrigin);
          robot.position.y = island.groundAt(robot.position.x, robot.position.z);
          state.punchOrigin = null;
          state.punchForward = null;
        }
        state.punchHitboxActive = false;
        punchHitbox.active = false;
        punchHitbox.frame = -1;
        nikoSmear.reset();
      }
      const locked = lockTarget && bot.lockMoves;
      if (locked) {
        const face = robot.rotation.y;
        /* Same lateral sign as the movement. Negating it played the strafe that steps the other way. */
        const localX = input.x * Math.cos(face) + input.z * -Math.sin(face);
        const localZ = input.x * Math.sin(face) + input.z * Math.cos(face);
        const lockMoving = localX * localX + localZ * localZ > 0.001;
        let aimX = 0;
        let aimY = 1;
        let aim = lockAngle;
        if (lockMoving) aim = Math.atan2(localX, localZ);
        aimX = Math.sin(aim);
        aimY = Math.cos(aim);
        const turn = Math.atan2(Math.sin(aim - lockAngle), Math.cos(aim - lockAngle));
        /* Magnitude stays up while a direction is held, so a clip is always playing. Idle takes whatever is left. */
        lockMag = THREE.MathUtils.damp(lockMag, lockMoving ? 1 : 0, lockMoving ? 10 : 6, dt);
        /* A left-right flip is 180 deg. Sweeping the circle plays every clip in between. Jump the aim and let the clip weights crossfade. */
        if (lockMoving && Math.abs(turn) > 1.8) lockAngle = aim;
        else if (lockMoving) lockAngle += turn * (1 - Math.exp(-14 * dt));
        const sx = Math.sin(lockAngle);
        const sy = Math.cos(lockAngle);
        lockDir.x = sx * lockMag;
        lockDir.y = sy * lockMag;
        /* Lock-on plays the run set. The walk clips stay at weight 0. */
        const starting = lockMoving && lockMag < 0.05;
        const targetSpeed = lockMoving ? 0.5 : 0;
        if (starting) {
          let lead = null;
          let leadDot = -1;
          for (const move of bot.lockMoves) {
            if (move.gait !== "run") continue;
            const align = move.x * aimX + move.y * aimY;
            if (align > leadDot) {
              leadDot = align;
              lead = move;
            }
          }
          if (lead) {
            const clip = lead.action.getClip();
            const names = ["LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand"];
            let bestU = 0;
            let best = -1;
            for (let s = 0; s < 12; s += 1) {
              const u = s / 12;
              let total = 0;
              let count = 0;
              for (const name of names) {
                const track = clip.tracks.find((item) => item.name === `${name}.quaternion`);
                const bone = bot.bones[name];
                if (!track || !bone) continue;
                const times = track.times;
                const values = track.values;
                const last = times.length - 1;
                const sampleTime = u * times[last];
                let index = 0;
                while (index < last && times[index + 1] < sampleTime) index += 1;
                const next = Math.min(index + 1, last);
                const pick = next !== index && sampleTime - times[index] > times[next] - sampleTime ? next : index;
                const offset = pick * 4;
                let dot = values[offset] * bone.quaternion.x + values[offset + 1] * bone.quaternion.y + values[offset + 2] * bone.quaternion.z + values[offset + 3] * bone.quaternion.w;
                if (dot < 0) dot = -dot;
                total += dot;
                count += 1;
              }
              const score = count ? total / count : 0;
              if (score > best) {
                best = score;
                bestU = u;
              }
            }
            lockPhase = bestU;
          }
        }
        lockSpeed = THREE.MathUtils.damp(lockSpeed, targetSpeed, 5, dt);
        const runT = lockMag;
        actions.run.setEffectiveWeight(0);
        if (actions.sprint) actions.sprint.setEffectiveWeight(0);
        /* 0.7s run cycle at its authored speed. */
        if (!starting && lockSpeed > 0.04) lockPhase = (lockPhase + dt * 1.45 * state.sprintMul) % 1;
        /* Only the two clips on either side of the stick. A dot-product blend also mixed in the
           opposite diagonal, so forward played the walk plus both jog diagonals at once. */
        const sectorWeights = (group) => {
          const weights = group.map(() => 0);
          if (Math.hypot(lockDir.x, lockDir.y) < 0.02 || group.length === 0) return weights;
          const angle = Math.atan2(lockDir.x, lockDir.y);
          const samples = group.map((move, index) => ({ index, angle: Math.atan2(move.x, move.y) })).sort((a, b) => a.angle - b.angle);
          const count = samples.length;
          if (count === 1) {
            weights[samples[0].index] = 1;
            return weights;
          }
          for (let i = 0; i < count; i += 1) {
            const a0 = samples[i].angle;
            let span = samples[(i + 1) % count].angle - a0;
            if (span <= 0) span += Math.PI * 2;
            let rel = Math.atan2(Math.sin(angle - a0), Math.cos(angle - a0));
            if (rel < 0) rel += Math.PI * 2;
            if (rel <= span + 1e-4) {
              const t = span < 1e-4 ? 0 : Math.min(1, rel / span);
              weights[samples[i].index] = 1 - t;
              weights[samples[(i + 1) % count].index] += t;
              break;
            }
          }
          return weights;
        };
        let posed = 0;
        let backGoal = 0;
        for (const gait of ["walk", "run"]) {
          const group = bot.lockMoves.filter((move) => move.gait === gait);
          const weights = gait === "run" ? sectorWeights(group) : group.map(() => 0);
          if (gait === "run" && Math.hypot(lockDir.x, lockDir.y) > 0.05) {
            const aimRad = Math.atan2(lockDir.x, lockDir.y);
            const fromBack = Math.atan2(Math.sin(aimRad - Math.PI), Math.cos(aimRad - Math.PI));
            const absBack = Math.abs(fromBack);
            const outer = Math.PI / 3;
            /* Diagonal backward movement uses the backward clip, with the hips turned into the strafe. */
            if (absBack < outer) {
              const back = group.findIndex((move) => move.name === "runB");
              const edge = 0.12;
              const u = absBack <= outer - edge ? 1 : (outer - absBack) / edge;
              const smooth = u * u * (3 - 2 * u);
              if (back >= 0 && smooth > 0) {
                for (let i = 0; i < weights.length; i += 1) weights[i] *= 1 - smooth;
                weights[back] += smooth;
                backGoal = fromBack * smooth;
              }
            }
          }
          const gaitWeight = gait === "run" ? runT : 0;
          const lockCycleSec = 0.7 / (state.sprintMul || 1);
          const lockSteps = SPRINT_ANIME_FPS > 0
            ? Math.max(4, Math.round((lockCycleSec * SPRINT_ANIME_FPS) / 2) * 2)
            : 0;
          const steppedLockPhase = lockSteps > 0
            ? Math.floor(lockPhase * lockSteps) / lockSteps
            : lockPhase;
          group.forEach((move, index) => {
            const weight = THREE.MathUtils.damp(move.action.getEffectiveWeight(), weights[index] * gaitWeight, 8, dt);
            move.action.setEffectiveWeight(weight * (1 - punchWeight));
            move.action.setEffectiveTimeScale(0);
            move.action.time = steppedLockPhase * move.action.getClip().duration;
            posed += weight;
          });
        }
        lockBackYaw = THREE.MathUtils.damp(lockBackYaw, backGoal, 8, dt);
        /* Whatever the run clips don't cover stays on idle. A gap here is the bind pose. */
        actions.idle.setEffectiveWeight(Math.max(0, 1 - posed) * (1 - punchWeight));
      } else {
        const stopDur = actions.stop ? actions.stop.getClip().duration : (state.stopDur || 0.65);
        /* Exclusive stop while the root-motion clip runs; poseInertia covers the edges. */
        if (state.stopping) state.stopWeight = 1;
        else if (state.stopWeight > 0) state.stopWeight = THREE.MathUtils.damp(state.stopWeight, 0, 24, dt);
        if (!state.stopping && state.stopWeight < 0.005) state.stopWeight = 0;

        const turn180ClipDur = actions.turn180 ? actions.turn180.getClip().duration : (turn180ClipData.duration || (40 / 60));
        /* The clip plays to its last frame; the sprint blend starts when TurnLoco ends the turn. */
        const inTurnBody = state.turning180;
        const exitBlend = poseInertia.active && poseInertia.kind === "out";
        const turnBridge = poseInertia.active && (poseInertia.kind === "in" || poseInertia.kind === "out");

        /* Mixer stays exclusive: turn OR gait. poseInertia is the visual blend (Unity-style). */
        if (inTurnBody) {
          state.turn180Weight = 1;
        } else if (exitBlend) {
          state.turn180Weight = 0;
        } else {
          state.turn180Weight = 0;
          state.turn180Timer = 0;
        }

        /* Soft jog <-> sprint: gaitMix eases the whole body (lean + legs stay one chain).
           Preference uses Shift + speed hysteresis so spam does not thrash the mix.
           Phase-match the destination when a blend starts - never stamp sprint legs onto jog hips. */
        const sprintKeyed = Boolean(isSprint || state.sprintHold);
        let wantSprint = false;
        if (moving && !state.stopping && !inTurnBody) {
          if (state.gaitSprint) wantSprint = sprintKeyed || state.speedMeter > TURN180.gaitExitSpeed;
          else wantSprint = sprintKeyed;
        }
        if (!moving && !state.stopping) wantSprint = false;
        state.gaitSprint = wantSprint;
        const gaitTarget = wantSprint && !turnBridge ? 1 : 0;
        const prevMix = state.gaitMix;
        if (gaitTarget > state.gaitMix) {
          state.gaitMix = Math.min(1, state.gaitMix + dt / Math.max(0.05, TURN180.gaitBlend));
        } else if (gaitTarget < state.gaitMix) {
          state.gaitMix = Math.max(0, state.gaitMix - dt / Math.max(0.05, TURN180.gaitBlend));
        }
        if (!turnBridge && !inTurnBody && bot.bones) {
          if (prevMix <= 0.001 && state.gaitMix > 0.001 && actions.sprint) {
            poseInertia.capture(bot.bones);
            sprintAnimPhase = poseInertia.matchClipPhase(actions.sprint.getClip(), poseInertia.quats, 48);
          } else if (prevMix >= 0.999 && state.gaitMix < 0.999 && actions.run) {
            poseInertia.capture(bot.bones);
            jogAnimPhase = poseInertia.matchClipPhase(actions.run.getClip(), poseInertia.quats, 48);
          }
        }
        const uGait = state.gaitMix;
        const gaitSprintW = uGait * uGait * (3 - 2 * uGait);

        const effectiveStopWeight = moving ? 0 : state.stopWeight * (1 - punchWeight);
        const effectiveTurn180Weight = state.turn180Weight * (1 - punchWeight);
        const motionSuppress = Math.max(effectiveStopWeight, effectiveTurn180Weight);
        const gaitWeight = state.walk * (1 - punchWeight) * (1 - motionSuppress);
        const effectiveSprintWeight = (!state.stopping ? gaitWeight * gaitSprintW : 0);
        const effectiveJogWeight = (!state.stopping ? gaitWeight * (1 - gaitSprintW) : 0);

        const idleWeight = Math.max(0, (1 - Math.max(state.walk, motionSuppress)) * (1 - punchWeight));

        actions.idle.setEffectiveWeight(idleWeight);
        actions.run.setEffectiveWeight(effectiveJogWeight);

        if (moving && state.pace > 0.001) {
          if (actions.sprint) {
            const sprintDur = actions.sprint.getClip().duration;
            const sprintPaceMul = Math.max(0.85, state.speedMeter / SPRINT_SPEED);
            if (inTurnBody) {
              sprintAnimPhase = state._turn180SprintPhase ?? sprintAnimPhase;
            } else if (poseInertia.active && poseInertia.freezeSprint) {
              /* Hold the foot-matched sprint frame while the bridge keyframes play. */
              sprintAnimPhase = state._turn180SprintPhase ?? sprintAnimPhase;
            } else {
              sprintAnimPhase = (sprintAnimPhase + dt * (SPRINT_ANIM_SCALE / sprintDur) * state.pace * sprintPaceMul) % 1.0;
              if (state.turning180) state._turn180SprintPhase = sprintAnimPhase;
            }
          }
          const jogDur = actions.run.getClip().duration;
          jogAnimPhase = (jogAnimPhase + dt * (1.15 / jogDur) * state.pace) % 1.0;
        }

        {
          const stopPhase = Math.min(1.0, state.stopTimer / Math.max(1e-4, state.stopDur || stopDur));
          const stopTime = stopPhase * stopDur;
          if (actions.stop) {
            const w = state.stopMirror ? 0 : effectiveStopWeight;
            actions.stop.setEffectiveWeight(w);
            actions.stop.time = stopTime;
            actions.stop.setEffectiveTimeScale(0);
          }
          if (actions.stopMirror) {
            const w = state.stopMirror ? effectiveStopWeight : 0;
            actions.stopMirror.setEffectiveWeight(w);
            actions.stopMirror.time = stopTime;
            actions.stopMirror.setEffectiveTimeScale(0);
          }
        }

        if (actions.turn180) {
          actions.turn180.setEffectiveWeight(effectiveTurn180Weight);
          /* Continuous scrub only - never freeze/jump clip time (that was the big snap).
             Same clock as TurnLoco's root yaw and travel, so root * clip stays the authored motion. */
          actions.turn180.time = Math.min(turn180ClipDur, Math.max(0, (state.turn180Timer / (state.turn180Dur || turn180ClipDur)) * turn180ClipDur));
          actions.turn180.setEffectiveTimeScale(0);
        }

        if (actions.sprint) {
          const sprintDur = actions.sprint.getClip().duration;
          actions.sprint.time = evalClipTime(sprintAnimPhase, sprintDur, SPRINT_ANIM_SCALE, SPRINT_ANIME_FPS);
          actions.sprint.setEffectiveTimeScale(0);
          actions.sprint.setEffectiveWeight(effectiveSprintWeight);
        }

        const jogDur = actions.run.getClip().duration;
        actions.run.time = evalClipTime(jogAnimPhase, jogDur, 1.15, SPRINT_ANIME_FPS);
        actions.run.setEffectiveTimeScale(0);
        bot.lockMoves?.forEach((move) => move.action.setEffectiveWeight(0));
        lockSpeed = 0;
        lockMag = 0;
        lockBackYaw = 0;
      }
      bot.mixer.update(calm ? 0 : dt);
      /* Procedural bridge pose - slerp snapshot -> destination after the mixer writes the target. */
      if (!calm) poseInertia.apply(bot.bones, dt);
      /* The mixer averages quaternion components. Shoulders are converted above so the wrists stay on their own sides; this still takes the short arc for the arms on the way back to idle. */
      if (!state.punching && lockTarget && bot.idleQuats) {
        const idleWeight = actions.idle.getEffectiveWeight();
        let sources = idleWeight > 0.02 ? 1 : 0;
        for (const move of bot.lockMoves) {
          if (move.gait === "run" && move.action.getEffectiveWeight() > 0.02) sources += 1;
        }
        const armNames = sources > 1
          ? Object.keys(bot.idleQuats).filter((name) => /Hand|Arm|Shoulder/.test(name) && bot.bones[name])
          : [];
        for (const name of armNames) {
          let sx = 0;
          let sy = 0;
          let sz = 0;
          let sw = 0;
          let fx = 0;
          let fy = 0;
          let fz = 0;
          let fw = 1;
          let has = false;
          const add = (q, weight) => {
            if (!(weight > 0.0001)) return;
            let x = q.x;
            let y = q.y;
            let z = q.z;
            let w = q.w;
            if (!has) {
              fx = x;
              fy = y;
              fz = z;
              fw = w;
              has = true;
            } else if (x * fx + y * fy + z * fz + w * fw < 0) {
              x = -x;
              y = -y;
              z = -z;
              w = -w;
            }
            sx += x * weight;
            sy += y * weight;
            sz += z * weight;
            sw += w * weight;
          };
          sampleTrack(bot.idleQuats[name], actions.idle.time, posedQ);
          add(posedQ, idleWeight);
          for (const move of bot.lockMoves) {
            if (move.gait !== "run") continue;
            const weight = move.action.getEffectiveWeight();
            const track = move.quats?.[name];
            if (!track || !(weight > 0.0001)) continue;
            sampleTrack(track, move.action.time, posedQ);
            add(posedQ, weight);
          }
          const len = Math.hypot(sx, sy, sz, sw);
          if (len > 0.25) bot.bones[name].quaternion.set(sx / len, sy / len, sz / len, sw / len);
        }
      }
      /* Diagonal backward: turn the hips into the backward run while keeping the chest on the target. */
      if (!state.punching && lockTarget && Math.abs(lockBackYaw) > 0.02 && bot.bones?.Hips && bot.bones?.Spine2) {
        const yawWorld = (bone, radians) => {
          const parent = bone.parent;
          if (!parent) return;
          bone.updateWorldMatrix(true, false);
          const world = bone.getWorldQuaternion(posedQ);
          keyA.setFromAxisAngle(worldUp, radians);
          world.premultiply(keyA);
          parent.getWorldQuaternion(keyB);
          bone.quaternion.copy(keyB.invert()).multiply(world);
        };
        yawWorld(bot.bones.Hips, lockBackYaw);
        yawWorld(bot.bones.Spine2, -lockBackYaw);
      }
      /* Standing still, pitch the chest and head up toward the camera. Mixamo's local axes are not the old rig's, so this is a world-axis pitch around his right. */
      if (!state.punching && state.faceUp > 0.01 && bot.bones.Head && bot.model) {
        bot.model.updateWorldMatrix(true, false);
        const e = bot.model.matrixWorld.elements;
        faceRight.set(e[8], e[9], e[10]).normalize();
        const pitchWorld = (bone, radians) => {
          const parent = bone.parent;
          if (!parent) return;
          bone.updateWorldMatrix(true, false);
          const world = bone.getWorldQuaternion(posedQ);
          keyA.setFromAxisAngle(faceRight, radians);
          world.premultiply(keyA);
          parent.getWorldQuaternion(keyB);
          bone.quaternion.copy(keyB.invert()).multiply(world);
        };
        const lift = state.faceUp;
        if (bot.bones.Spine2) pitchWorld(bot.bones.Spine2, lift * 0.1);
        if (bot.bones.Neck) pitchWorld(bot.bones.Neck, lift * 0.16);
        pitchWorld(bot.bones.Head, lift * 0.34);
      }

      /* Procedural sprint arc IK: stick-intent chest twist + pathOmega bank.
         Upper body leads hard; hips/legs keep a light counter so the sprint clip stays organic. */
      const twist = state.chestTwist || 0;
      if (!state.punching && !lockTarget && !state.turning180
        && (Math.abs(state.bank) > 0.002 || Math.abs(twist) > 0.01 || state.sprint > 0.05)) {
        faceForward.set(Math.sin(robot.rotation.y), 0, Math.cos(robot.rotation.y));
        faceRight.set(Math.cos(robot.rotation.y), 0, -Math.sin(robot.rotation.y));

        const rollBone = (bone, radians) => {
          const parent = bone?.parent;
          if (!parent || !(Math.abs(radians) > 1e-5)) return;
          bone.updateWorldMatrix(true, false);
          const world = bone.getWorldQuaternion(posedQ);
          keyA.setFromAxisAngle(faceForward, radians);
          world.premultiply(keyA);
          parent.getWorldQuaternion(keyB);
          bone.quaternion.copy(keyB.invert()).multiply(world);
        };
        const pitchBone = (bone, radians) => {
          const parent = bone?.parent;
          if (!parent || !(Math.abs(radians) > 1e-5)) return;
          bone.updateWorldMatrix(true, false);
          const world = bone.getWorldQuaternion(posedQ);
          keyA.setFromAxisAngle(faceRight, radians);
          world.premultiply(keyA);
          parent.getWorldQuaternion(keyB);
          bone.quaternion.copy(keyB.invert()).multiply(world);
        };
        const yawBone = (bone, radians) => {
          const parent = bone?.parent;
          if (!parent || !(Math.abs(radians) > 1e-5)) return;
          bone.updateWorldMatrix(true, false);
          const world = bone.getWorldQuaternion(posedQ);
          keyA.setFromAxisAngle(worldUp, radians);
          world.premultiply(keyA);
          parent.getWorldQuaternion(keyB);
          bone.quaternion.copy(keyB.invert()).multiply(world);
        };

        const bank = state.bank;
        const turnLead = state.turnLead || 0;
        const sprintAmt = THREE.MathUtils.clamp(state.sprint, 0, 1);
        const twistAmt = twist * (0.7 + 0.3 * sprintAmt);
        const inside = bank >= 0 ? 1 : -1;
        const shoulderSide = Math.sign(bank || twist) || 1;

        /* Lower body - light bank + small counter so feet don't skate with the chest. */
        if (bot.bones?.Hips) {
          rollBone(bot.bones.Hips, bank * 0.16);
          yawBone(bot.bones.Hips, -twistAmt * 0.18);
        }
        if (bot.bones?.LeftUpLeg) rollBone(bot.bones.LeftUpLeg, bank * 0.08);
        if (bot.bones?.RightUpLeg) rollBone(bot.bones.RightUpLeg, bank * 0.08);

        /* Upper body - lead toward stick intent + motorcycle lean. */
        if (bot.bones?.Spine) {
          yawBone(bot.bones.Spine, twistAmt * 0.28 + turnLead * 0.10);
          rollBone(bot.bones.Spine, bank * 0.28);
        }
        if (bot.bones?.Spine2) {
          yawBone(bot.bones.Spine2, twistAmt * 0.42 + turnLead * 0.16);
          rollBone(bot.bones.Spine2, bank * 0.20);
        }
        if (bot.bones?.Neck) yawBone(bot.bones.Neck, twistAmt * 0.18);
        if (bot.bones?.Head) {
          yawBone(bot.bones.Head, twistAmt * 0.30 + turnLead * 0.18);
          rollBone(bot.bones.Head, -bank * 0.38);
        }

        const forwardPitch = sprintAmt * 0.12 + Math.abs(twistAmt) * 0.04;
        if (bot.bones?.Spine) pitchBone(bot.bones.Spine, forwardPitch * 0.55);
        if (bot.bones?.Spine2) pitchBone(bot.bones.Spine2, forwardPitch * 0.45);

        const shoulderRoll = (Math.abs(bank) * 0.32 + Math.abs(twistAmt) * 0.22) * shoulderSide;
        if (bot.bones?.LeftShoulder) rollBone(bot.bones.LeftShoulder, -shoulderRoll * 0.85);
        if (bot.bones?.RightShoulder) rollBone(bot.bones.RightShoulder, shoulderRoll * 0.85);
        if (bot.bones?.LeftArm) yawBone(bot.bones.LeftArm, twistAmt * 0.18);
        if (bot.bones?.RightArm) yawBone(bot.bones.RightArm, twistAmt * 0.18);

        /* Soft foot steer - light plant counter, not the heavy double that pretzeled with unwrapped yaw. */
        const footAmt = THREE.MathUtils.clamp(sprintAmt * 1.1, 0, 1);
        const plantFoot = THREE.MathUtils.clamp(-twistAmt * 0.22 * footAmt, -0.18, 0.18);
        const bankFoot = inside * Math.abs(bank) * 0.05 * footAmt;
        if (bot.bones?.LeftFoot) {
          yawBone(bot.bones.LeftFoot, plantFoot + bankFoot);
          rollBone(bot.bones.LeftFoot, -bank * 0.22);
        }
        if (bot.bones?.RightFoot) {
          yawBone(bot.bones.RightFoot, plantFoot - bankFoot);
          rollBone(bot.bones.RightFoot, -bank * 0.22);
        }
        if (bot.bones?.LeftLeg) yawBone(bot.bones.LeftLeg, plantFoot * 0.25);
        if (bot.bones?.RightLeg) yawBone(bot.bones.RightLeg, plantFoot * 0.25);
      }

      /* Sprint foot-leave dust: edge when a planted foot starts rising. */
      if (!calm && bot.bones) {
        const groundY = island.groundAt(robot.position.x, robot.position.z);
        const sprintW = bot.actions?.sprint?.getEffectiveWeight?.() ?? state.sprint;
        const sprinting = sprintW > 0.55 && state.speedMeter >= TURN180_SPEED_MIN && !state.turning180 && !state.punching;
        sampleFootLeave("L", bot.bones.LeftFoot, groundY, sprinting, dt);
        sampleFootLeave("R", bot.bones.RightFoot, groundY, sprinting, dt);
      }
    } else {
      bot.head.rotation.x = state.faceUp * 0.2;
    }

    return { step, swing, targetFocus, isBossLocked };
  };

  const getTurn180SpeedMin = () => TURN180_SPEED_MIN;
  const setTurn180SpeedMin = (value) => {
    TURN180_SPEED_MIN = value;
    return TURN180_SPEED_MIN;
  };

  const sprint = (opts) => {
    if (opts) {
      if (opts.speed != null) SPRINT_SPEED = opts.speed;
      if (opts.animSpeed != null) SPRINT_ANIM_SCALE = opts.animSpeed;
      if (opts.animeFps !== undefined) SPRINT_ANIME_FPS = opts.animeFps;
      if (opts.stopThreshold != null) SPRINT_STOP_THRESHOLD = opts.stopThreshold;
      if (opts.turn180Speed != null) setTurn180SpeedMin(opts.turn180Speed);
      /* 180 playback rate: 1 = the Cascadeur timing (0.667 s). Takes effect on the next turn. */
      if (opts.turn180Anim != null) TURN180.animScale = THREE.MathUtils.clamp(+opts.turn180Anim || 1, 0.25, 3);
      if (opts.stopAnim != null) STOP.animScale = THREE.MathUtils.clamp(+opts.stopAnim || 1, 0.5, 2.5);
      if (opts.gaitBlend != null) TURN180.gaitBlend = THREE.MathUtils.clamp(+opts.gaitBlend || 0.5, 0.12, 1.2);
    }
    return {
      speed: SPRINT_SPEED,
      animSpeed: SPRINT_ANIM_SCALE,
      animeFps: SPRINT_ANIME_FPS,
      stopThreshold: SPRINT_STOP_THRESHOLD,
      turn180Speed: getTurn180SpeedMin(),
      turn180Anim: TURN180.animScale,
      stopAnim: STOP.animScale,
      gaitBlend: TURN180.gaitBlend,
    };
  };

  const animeFps = (fps) => {
    if (fps !== undefined) SPRINT_ANIME_FPS = fps;
    return SPRINT_ANIME_FPS;
  };

  return {
    ROBOT_R,
    SPEED,
    state,
    punchHitbox,
    poseInertia,
    StopLoco,
    TurnLoco,
    STOP,
    TURN180,
    wrapYaw,
    travelled,
    triggerPunch,
    triggerOnePunch,
    tryLock,
    resolveCollisions,
    stepTo,
    update,
    sprint,
    animeFps,
    debugFootDust,
    getSprintSpeed: () => SPRINT_SPEED,
    getStopThreshold: () => SPRINT_STOP_THRESHOLD,
    getTurn180SpeedMin,
    setTurn180SpeedMin,
    getLockTarget: () => lockTarget,
    setLockTarget: (target) => {
      lockTarget = target;
    },
  };
}
