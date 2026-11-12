/* Sprint wind tears — stylized anime speed lines around Niko.
   Thin hard-edged streaks (not smoke blobs). Randomly spawn on mesh AABB /
   Mixamo bones; may trail behind or lead ahead of the run. */

import * as THREE from "three";

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* Hard toon speed streak: tapered needle with slight jagged edge, crisp dissolve. */
const FRAG = /* glsl */ `
  uniform float uAlpha;
  uniform float uClip;
  uniform float uSeed;
  uniform float uTime;
  uniform vec3 uHi;
  uniform vec3 uLo;

  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv * 2.0 - 1.0;
    float s = uSeed;

    /* Lengthwise taper — sharp tips, thicker mid (anime speed needle). */
    float along = 1.0 - abs(p.x);
    float tip = smoothstep(0.0, 0.18, along) * smoothstep(0.0, 0.14, 1.0 - abs(p.x));

    /* Slight wave / jagged edge so it isn't a flat bar. */
    float jag = (noise(vec2(p.x * 6.0 + s, s * 2.1) + uTime * 0.2) - 0.5) * 0.55;
    float halfW = mix(0.08, 0.42, tip) + jag * tip;
    float core = 1.0 - smoothstep(halfW * 0.15, halfW, abs(p.y));
    if (core * tip < 0.08) discard;

    /* Hard stylized edge (step, not soft halo). */
    float mask = step(0.22, core * tip);
    if (mask < 0.5) discard;

    /* Erosion dissolve along the streak. */
    float erode = noise(vec2(p.x * 3.5 + s, p.y * 2.0 - s));
    if (erode < uClip) discard;

    float lit = clamp(0.55 + (1.0 - abs(p.y) / max(halfW, 0.01)) * 0.45, 0.0, 1.0);
    vec3 col = mix(uLo, uHi, lit);
    float a = uAlpha * tip * (0.55 + 0.45 * core);
    if (a < 0.02) discard;
    gl_FragColor = vec4(col, a);
  }
`;

const POOL = 32;
const BONE_NAMES = [
  "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
  "LeftShoulder", "RightShoulder", "LeftArm", "RightArm",
  "LeftForeArm", "RightForeArm", "LeftHand", "RightHand",
  "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg",
  "LeftFoot", "RightFoot",
];

const DAY_HI = new THREE.Color(1.0, 1.0, 1.0);
const DAY_LO = new THREE.Color(0.78, 0.82, 0.9);
const NIGHT_HI = new THREE.Color(0.9, 0.93, 1.0);
const NIGHT_LO = new THREE.Color(0.55, 0.62, 0.78);

/**
 * @param {{ scene: THREE.Scene, camera?: THREE.Camera }} opts
 */
export function createWindTear({ scene, camera = null } = {}) {
  const group = new THREE.Group();
  group.name = "NikoWindTearVFX";
  scene.add(group);

  const geo = new THREE.PlaneGeometry(1, 1);
  const lines = [];

  for (let i = 0; i < POOL; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uAlpha: { value: 0 },
        uClip: { value: 0 },
        uSeed: { value: Math.random() * 10 },
        uTime: { value: 0 },
        uHi: { value: DAY_HI.clone() },
        uLo: { value: DAY_LO.clone() },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 11;
    group.add(mesh);
    lines.push({
      mesh,
      mat,
      vel: new THREE.Vector3(),
      axis: new THREE.Vector3(0, 0, 1),
      age: 0,
      life: 0.28,
      len0: 0.35,
      len1: 0.9,
      thick: 0.08,
      alive: false,
    });
  }

  let clock = 0;
  let spawnAcc = 0;
  let strength = 0;
  let envLight = 1;
  let envNight = 0;
  let spawnCount = 0;

  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const bonePos = new THREE.Vector3();
  const spawnAt = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _back = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _camRight = new THREE.Vector3();
  const _camUp = new THREE.Vector3();
  const _hi = new THREE.Color();
  const _lo = new THREE.Color();

  const take = () => {
    for (const L of lines) if (!L.alive) return L;
    let oldest = lines[0];
    for (const L of lines) if (L.age > oldest.age) oldest = L;
    return oldest;
  };

  const applyTint = (mat) => {
    const light = THREE.MathUtils.clamp(envLight, 0, 1);
    const night = THREE.MathUtils.clamp(envNight, 0, 1);
    const gain = 0.8 + light * 0.2;
    _hi.copy(DAY_HI).lerp(NIGHT_HI, night * 0.7).multiplyScalar(gain);
    _lo.copy(DAY_LO).lerp(NIGHT_LO, night * 0.7).multiplyScalar(gain);
    mat.uniforms.uHi.value.copy(_hi);
    mat.uniforms.uLo.value.copy(_lo);
  };

  /** Align long axis with run direction in screen space. */
  const orient = (L, cam) => {
    if (!cam) return;
    L.mesh.quaternion.copy(cam.quaternion);
    _camRight.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _camUp.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const sx = L.axis.dot(_camRight);
    const sy = L.axis.dot(_camUp);
    if (sx * sx + sy * sy > 1e-6) L.mesh.rotateZ(Math.atan2(sy, sx));
  };

  const sampleBody = (root, bones) => {
    if (bones && Math.random() < 0.75) {
      const name = BONE_NAMES[(Math.random() * BONE_NAMES.length) | 0];
      const bone = bones[name];
      if (bone) {
        bone.updateWorldMatrix(true, false);
        bone.getWorldPosition(bonePos);
        if (root) {
          box.setFromObject(root);
          box.getCenter(center);
          spawnAt.copy(bonePos).sub(center);
          if (spawnAt.lengthSq() > 1e-6) {
            spawnAt.normalize().multiplyScalar(0.06 + Math.random() * 0.18);
            bonePos.add(spawnAt);
          }
        }
        bonePos.x += (Math.random() - 0.5) * 0.12;
        bonePos.y += (Math.random() - 0.5) * 0.1;
        bonePos.z += (Math.random() - 0.5) * 0.12;
        return bonePos;
      }
    }

    if (root) {
      box.setFromObject(root);
      if (!box.isEmpty()) {
        box.getSize(size);
        const face = (Math.random() * 6) | 0;
        const u = Math.random();
        const v = Math.random();
        if (face === 0) spawnAt.set(box.min.x, box.min.y + size.y * v, box.min.z + size.z * u);
        else if (face === 1) spawnAt.set(box.max.x, box.min.y + size.y * v, box.min.z + size.z * u);
        else if (face === 2) spawnAt.set(box.min.x + size.x * u, box.min.y, box.min.z + size.z * v);
        else if (face === 3) spawnAt.set(box.min.x + size.x * u, box.max.y, box.min.z + size.z * v);
        else if (face === 4) spawnAt.set(box.min.x + size.x * u, box.min.y + size.y * v, box.min.z);
        else spawnAt.set(box.min.x + size.x * u, box.min.y + size.y * v, box.max.z);
        spawnAt.y = Math.max(spawnAt.y, box.min.y + size.y * 0.1);
        return spawnAt;
      }
    }
    return null;
  };

  /**
   * @param {THREE.Vector3} pos
   * @param {THREE.Vector3} axis long-axis dir (usually ±moveDir)
   * @param {number} leadSign +1 lead ahead, -1 trail behind
   */
  const spawnOne = (pos, axis, leadSign) => {
    const L = take();
    spawnCount += 1;
    L.alive = true;
    L.age = 0;
    L.life = 0.18 + Math.random() * 0.16;
    L.len0 = 0.28 + Math.random() * 0.18;
    L.len1 = 0.7 + Math.random() * 0.55;
    L.thick = 0.05 + Math.random() * 0.05;
    L.axis.copy(axis).normalize();

    L.mat.uniforms.uSeed.value = Math.random() * 50;
    L.mat.uniforms.uClip.value = 0;
    L.mat.uniforms.uAlpha.value = 0;
    applyTint(L.mat);
    L.mesh.visible = true;
    L.mesh.position.copy(pos);
    L.mesh.scale.set(0.001, 0.001, 1);

    /* Drift slightly along the line axis (lead forward / trail back). */
    const drift = (1.2 + Math.random() * 1.8) * leadSign;
    L.vel
      .copy(axis)
      .multiplyScalar(drift)
      .addScaledVector(_right, (Math.random() - 0.5) * 0.5)
      .addScaledVector(_up, (Math.random() - 0.5) * 0.35);
  };

  /**
   * @param {number} dt
   * @param {{
   *   root?: THREE.Object3D,
   *   bones?: Record<string, THREE.Object3D>,
   *   position?: THREE.Vector3,
   *   moveDir?: { x: number, z: number },
   *   facing?: number,
   *   sprint?: number,
   *   speed?: number,
   *   camera?: THREE.Camera,
   *   light?: number,
   *   night?: number,
   * }} opts
   */
  const update = (dt, opts = {}) => {
    const {
      root = null,
      bones = null,
      position = null,
      moveDir,
      facing = 0,
      sprint = 0,
      speed = 0,
      camera: cam = camera,
      light = 1,
      night = 0,
    } = opts;

    clock += dt;
    envLight = light;
    envNight = night;

    const target = sprint > 0.45 && speed > 6.5 ? THREE.MathUtils.smoothstep(sprint, 0.45, 1) : 0;
    strength = THREE.MathUtils.damp(strength, target, target > strength ? 12 : 8, dt);

    _fwd.set(moveDir?.x || 0, 0, moveDir?.z || 0);
    if (_fwd.lengthSq() < 1e-6) _fwd.set(Math.sin(facing), 0, Math.cos(facing));
    else _fwd.normalize();
    _back.copy(_fwd).multiplyScalar(-1);
    _right.crossVectors(_up, _fwd).normalize();
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);

    if (strength > 0.08) {
      spawnAcc += dt * (6 + strength * 18);
      while (spawnAcc >= 1) {
        spawnAcc -= 1;
        const at = sampleBody(root, bones);
        /* ~40% lead ahead of the run, ~60% trail behind. */
        const lead = Math.random() < 0.4;
        const leadSign = lead ? 1 : -1;
        const along = _fwd.clone().multiplyScalar(leadSign);
        if (at) {
          at.addScaledVector(along, 0.05 + Math.random() * 0.18);
          spawnOne(at, _fwd, leadSign);
        } else if (position) {
          spawnAt.set(
            position.x + (Math.random() - 0.5) * 0.7,
            position.y + 0.25 + Math.random() * 1.9,
            position.z + (Math.random() - 0.5) * 0.7,
          );
          spawnAt.addScaledVector(along, 0.1 + Math.random() * 0.15);
          spawnOne(spawnAt, _fwd, leadSign);
        }
      }
    } else {
      spawnAcc = 0;
    }

    for (const L of lines) {
      if (!L.alive) continue;
      L.age += dt;
      const t = Math.min(1, L.age / L.life);
      if (t >= 1) {
        L.alive = false;
        L.mesh.visible = false;
        continue;
      }

      const spawnEnd = 0.1;
      const holdEnd = 0.45;
      let clip = 0;
      let alpha = 1;
      let grow = 1;

      if (t < spawnEnd) {
        const u = t / spawnEnd;
        grow = u * u * (3 - 2 * u);
        alpha = Math.min(1, u * 3);
        clip = 0;
      } else if (t < holdEnd) {
        const u = (t - spawnEnd) / (holdEnd - spawnEnd);
        grow = 1 + u * 0.55;
        alpha = 1;
        clip = u * 0.1;
      } else {
        const u = (t - holdEnd) / (1 - holdEnd);
        grow = 1.55 + u * 0.5;
        clip = 0.1 + u * u * 0.85;
        alpha = u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1;
      }

      alpha *= strength * (0.85 + envLight * 0.15);

      L.vel.multiplyScalar(Math.exp(-3.2 * dt));
      L.mesh.position.addScaledVector(L.vel, dt);

      const len = THREE.MathUtils.lerp(L.len0, L.len1, Math.min(1, Math.max(0, grow)));
      L.mesh.scale.set(len, L.thick * (0.9 + strength * 0.35), 1);

      L.mat.uniforms.uTime.value = clock;
      L.mat.uniforms.uClip.value = clip;
      L.mat.uniforms.uAlpha.value = alpha;
      applyTint(L.mat);
      orient(L, cam);
    }

    return strength;
  };

  const dispose = () => {
    scene.remove(group);
    geo.dispose();
    for (const L of lines) L.mat.dispose();
  };

  return {
    update,
    dispose,
    stats: () => ({
      strength: +strength.toFixed(2),
      alive: lines.filter((L) => L.alive).length,
      spawnCount,
    }),
    resetStats: () => {
      spawnCount = 0;
    },
  };
}
