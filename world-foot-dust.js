/* Sprint foot-leave dust — small upright smoke kicked opposite the run.
   Arc/wisp local +X is locked to the trail dir (works in every sprint facing).
   Colors follow climate day/night like rain ribbons. */

import * as THREE from "three";

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* uStyle: 0 puff, 1 arc, 2 thin wisp. Hard toon edge + erosion despawn. */
const FRAG = /* glsl */ `
  uniform float uAlpha;
  uniform float uClip;
  uniform float uSeed;
  uniform float uTime;
  uniform float uStyle;
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

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * noise(p);
      p = p * 2.05 + 11.0;
      a *= 0.5;
    }
    return v;
  }

  float lobe(vec2 p, vec2 c, vec2 r) {
    vec2 q = (p - c) / r;
    return exp(-dot(q, q) * 2.4);
  }

  void main() {
    vec2 uv = vUv;
    float s = uSeed;
    float n = fbm(uv * 3.0 + vec2(s, s * 1.4) + uTime * 0.12);
    float field = 0.0;
    float thresh = 0.38;
    vec2 p;

    if (uStyle < 0.5) {
      p = (uv - vec2(0.5, 0.42)) * vec2(2.4, 2.5);
      field += lobe(p, vec2(0.0, 0.0), vec2(0.42, 0.38));
      field += lobe(p, vec2(-0.22, 0.16), vec2(0.28, 0.26)) * 0.9;
      field += lobe(p, vec2(0.20, 0.12), vec2(0.26, 0.24)) * 0.9;
      field += lobe(p, vec2(0.02, 0.34), vec2(0.22, 0.20)) * 0.75;
      field *= 0.82 + 0.28 * n;
      thresh = 0.40;
    } else if (uStyle < 1.5) {
      /* Arc opens along local +X = trail (behind the runner). */
      p = (uv - vec2(0.5, 0.45)) * vec2(2.2, 2.4);
      float ang = atan(p.y, p.x);
      float rad = length(p);
      float band = abs(rad - 0.55 - n * 0.06);
      float arcMask = smoothstep(1.15, 0.35, abs(ang));
      float thick = 0.16 + n * 0.04;
      field = (1.0 - smoothstep(0.0, thick, band)) * arcMask;
      field += lobe(p, vec2(0.42, 0.28), vec2(0.18, 0.16)) * 0.7 * arcMask;
      field += lobe(p, vec2(0.42, -0.22), vec2(0.16, 0.14)) * 0.65 * arcMask;
      field *= step(0.22 + uClip * 0.35, rad);
      thresh = 0.28;
    } else {
      /* Thin swoosh stretched along local +X = trail. */
      p = (uv - vec2(0.5, 0.5)) * vec2(2.3, 2.6);
      float curve = p.y - sin(p.x * 1.8 + s) * 0.28 - p.x * p.x * 0.12;
      float along = smoothstep(-1.05, -0.15, p.x) * smoothstep(1.1, 0.2, p.x);
      float ribbon = exp(-curve * curve * (38.0 + n * 10.0));
      float taper = mix(0.35, 1.0, smoothstep(-0.9, 0.4, p.x));
      field = ribbon * along * taper * (0.7 + 0.3 * n);
      field += lobe(p, vec2(-0.55, 0.18), vec2(0.10, 0.08)) * 0.45;
      field += lobe(p, vec2(0.35, -0.12), vec2(0.08, 0.07)) * 0.35;
      thresh = 0.22;
    }

    if (field < thresh) discard;

    float erode = fbm(p * 1.35 + vec2(s * 2.0, -s) + uTime * 0.1);
    erode = smoothstep(0.2, 0.8, erode);
    if (erode < uClip) discard;

    float lit = clamp(0.58 + p.y * 0.3 + n * 0.18, 0.0, 1.0);
    vec3 col = mix(uLo, uHi, lit);
    float a = uAlpha;
    if (uStyle > 1.5) a *= 0.72 + 0.22 * field;
    gl_FragColor = vec4(col, a);
  }
`;

const POOL = 20;
const PIECES_PER_BURST = 2;

const DAY_HI = new THREE.Color(1.0, 1.0, 1.0);
const DAY_LO = new THREE.Color(0.68, 0.70, 0.74);
/* Mild cool shift at night — stay readable, not muddy. */
const NIGHT_HI = new THREE.Color(0.88, 0.92, 1.0);
const NIGHT_LO = new THREE.Color(0.52, 0.58, 0.72);

/**
 * @param {{ scene: THREE.Scene, camera?: THREE.Camera }} opts
 */
export function createFootDust({ scene, camera = null } = {}) {
  const group = new THREE.Group();
  group.name = "NikoFootDustVFX";
  scene.add(group);

  const geo = new THREE.PlaneGeometry(1, 1);
  const puffs = [];

  for (let i = 0; i < POOL; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uAlpha: { value: 0 },
        uClip: { value: 0 },
        uSeed: { value: Math.random() * 10 },
        uTime: { value: 0 },
        uStyle: { value: 0 },
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
    mesh.renderOrder = 12;
    group.add(mesh);
    puffs.push({
      mesh,
      mat,
      vel: new THREE.Vector3(),
      trail: new THREE.Vector3(0, 0, 1),
      age: 0,
      life: 0.4,
      size0: 0.12,
      size1: 0.35,
      sx: 1,
      sy: 1,
      delay: 0,
      style: 0,
      alive: false,
    });
  }

  let clock = 0;
  let spawnCount = 0;
  let lastSide = "-";
  let envLight = 1;
  let envNight = 0;
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _back = new THREE.Vector3();
  const _camRight = new THREE.Vector3();
  const _camUp = new THREE.Vector3();
  const _hi = new THREE.Color();
  const _lo = new THREE.Color();

  const takePuff = () => {
    for (const p of puffs) {
      if (!p.alive) return p;
    }
    let oldest = puffs[0];
    for (const p of puffs) {
      if (p.age > oldest.age) oldest = p;
    }
    return oldest;
  };

  const applyTint = (mat) => {
    const light = THREE.MathUtils.clamp(envLight, 0, 1);
    const night = THREE.MathUtils.clamp(envNight, 0, 1);
    /* Soft response only — floor keeps smoke visible at night. */
    const gain = 0.78 + light * 0.22;
    _hi.copy(DAY_HI).lerp(NIGHT_HI, night * 0.85).multiplyScalar(gain);
    _lo.copy(DAY_LO).lerp(NIGHT_LO, night * 0.85).multiplyScalar(gain);
    mat.uniforms.uHi.value.copy(_hi);
    mat.uniforms.uLo.value.copy(_lo);
  };

  /**
   * Face the camera, then spin in screen space so local +X follows the trail.
   * Upright yaw-only cards always stretch screen-horizontal — that made the dashes.
   */
  const orient = (p, cam) => {
    if (!cam) return;
    const mesh = p.mesh;
    mesh.quaternion.copy(cam.quaternion);
    _camRight.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _camUp.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const sx = p.trail.dot(_camRight);
    const sy = p.trail.dot(_camUp);
    if (sx * sx + sy * sy > 1e-6) {
      mesh.rotateZ(Math.atan2(sy, sx));
    }
  };

  /**
   * @param {THREE.Vector3} pos world position at ground
   * @param {THREE.Vector3} moveDir travel direction (unit xz)
   * @param {"L"|"R"} [side]
   */
  const spawn = (pos, moveDir, side = "-") => {
    spawnCount += 1;
    lastSide = side;
    _back.copy(moveDir);
    _back.y = 0;
    if (_back.lengthSq() < 1e-6) _back.set(0, 0, 1);
    else _back.normalize().multiplyScalar(-1);
    _right.crossVectors(_up, _back).normalize();
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);

    const styles = [0, Math.random() < 0.55 ? 1 : 2];

    for (let i = 0; i < PIECES_PER_BURST; i++) {
      const p = takePuff();
      const style = styles[i];
      p.alive = true;
      p.age = 0;
      p.delay = i * 0.02;
      p.style = style;
      p.trail.copy(_back);
      p.life = style === 2 ? 0.28 + Math.random() * 0.1 : 0.34 + Math.random() * 0.12;

      if (style === 0) {
        p.size0 = 0.28 + Math.random() * 0.08;
        p.size1 = 0.55 + Math.random() * 0.18;
        p.sx = 1;
        p.sy = 1.1;
      } else if (style === 1) {
        p.size0 = 0.34 + Math.random() * 0.1;
        p.size1 = 0.72 + Math.random() * 0.2;
        p.sx = 1.45;
        p.sy = 0.9;
      } else {
        p.size0 = 0.38 + Math.random() * 0.1;
        p.size1 = 0.85 + Math.random() * 0.22;
        p.sx = 1.85;
        p.sy = 0.6;
      }

      p.mat.uniforms.uSeed.value = Math.random() * 50;
      p.mat.uniforms.uStyle.value = style;
      p.mat.uniforms.uClip.value = 0;
      p.mat.uniforms.uAlpha.value = 0;
      applyTint(p.mat);
      p.mesh.visible = true;

      const backOff = 0.12 + Math.random() * 0.1 + i * 0.06;
      const sideOff = (Math.random() - 0.5) * 0.08;
      p.mesh.position.set(
        pos.x + _back.x * backOff + _right.x * sideOff,
        pos.y + 0.12 + Math.random() * 0.06,
        pos.z + _back.z * backOff + _right.z * sideOff,
      );
      p.mesh.scale.set(0.001, 0.001, 0.001);

      const kick = style === 0 ? 2.4 + Math.random() * 1.1 : 3.2 + Math.random() * 1.4;
      const lift = style === 2 ? 0.25 + Math.random() * 0.25 : 0.45 + Math.random() * 0.4;
      p.vel
        .copy(_back)
        .multiplyScalar(kick)
        .addScaledVector(_right, (Math.random() - 0.5) * (style === 0 ? 0.35 : 0.55))
        .addScaledVector(_up, lift);
    }
  };

  /**
   * @param {number} dt
   * @param {THREE.Camera} [cam]
   * @param {{ light?: number, night?: number }} [env]
   */
  const update = (dt, cam = camera, env = null) => {
    if (env) {
      if (env.light != null) envLight = env.light;
      if (env.night != null) envNight = env.night;
    }
    clock += dt;
    let alive = 0;
    for (const p of puffs) {
      if (!p.alive) continue;
      alive += 1;
      p.age += dt;
      const local = p.age - p.delay;
      if (local < 0) {
        p.mesh.visible = false;
        continue;
      }
      p.mesh.visible = true;
      const t = Math.min(1, local / p.life);
      if (t >= 1) {
        p.alive = false;
        p.mesh.visible = false;
        continue;
      }

      const spawnEnd = 0.12;
      const holdEnd = 0.42;
      let clip = 0;
      let alpha = 1;
      let grow = 1;

      if (t < spawnEnd) {
        const u = t / spawnEnd;
        const ease = u * u * (3 - 2 * u);
        grow = ease * 1.05;
        alpha = Math.min(1, u * 2.5);
        if (p.style === 2) alpha *= 0.7;
        clip = 0;
      } else if (t < holdEnd) {
        const u = (t - spawnEnd) / (holdEnd - spawnEnd);
        grow = 1.05 + u * 0.35;
        alpha = p.style === 2 ? 0.7 : 1;
        clip = u * 0.06;
      } else {
        const u = (t - holdEnd) / (1 - holdEnd);
        grow = 1.4 + u * 0.4;
        clip = 0.06 + u * u * 0.88;
        alpha = (p.style === 2 ? 0.65 : 1) * (u > 0.88 ? 1 - (u - 0.88) / 0.12 : 1);
      }

      /* Mild alpha softens in storm/night without vanishing. */
      alpha *= 0.82 + envLight * 0.18;

      p.vel.multiplyScalar(Math.exp(-2.6 * dt));
      p.vel.y += 0.25 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);

      const size = THREE.MathUtils.lerp(p.size0, p.size1, Math.min(1, Math.max(0, grow)));
      p.mesh.scale.set(size * p.sx, size * p.sy, size);

      p.mat.uniforms.uTime.value = clock;
      p.mat.uniforms.uClip.value = clip;
      p.mat.uniforms.uAlpha.value = alpha;
      applyTint(p.mat);

      orient(p, cam);
    }
    return alive;
  };

  const dispose = () => {
    scene.remove(group);
    geo.dispose();
    for (const p of puffs) p.mat.dispose();
  };

  return {
    spawn,
    update,
    dispose,
    stats: () => ({
      alive: puffs.filter((p) => p.alive).length,
      spawnCount,
      lastSide,
      light: +envLight.toFixed(2),
      night: +envNight.toFixed(2),
    }),
    resetStats: () => {
      spawnCount = 0;
      lastSide = "-";
    },
  };
}
