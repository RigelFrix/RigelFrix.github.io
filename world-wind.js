/* Wind lines, after bruno-simon.com: thin white streaks that draw themselves along the wind, sometimes curl into a
   loop, drift downwind and wipe away from the tail. Each line is a fixed curve in the world (it follows the ground a
   couple of units up); the shader shows only the stretch between `tail` and `head` and keeps it a few pixels wide
   on screen whatever the zoom. */

import * as THREE from "three";

const POINTS = 80;
const WIND = new THREE.Vector3(0.8211, 0, -0.5708);
const ACROSS = new THREE.Vector3(0.5708, 0, 0.8211);

const material = (res) =>
  new THREE.ShaderMaterial({
    uniforms: {
      head: { value: 0 },
      tail: { value: 0 },
      width: { value: 3 },
      res,
      drift: { value: new THREE.Vector3() },
      opacity: { value: 0.85 },
    },
    vertexShader: [
      "attribute vec3 aNext; attribute float aS; attribute float aSide;",
      "uniform float head; uniform float tail; uniform float width; uniform vec2 res; uniform vec3 drift;",
      "varying float vShow;",
      "void main(){",
      "  vec4 a = projectionMatrix * modelViewMatrix * vec4(position + drift, 1.0);",
      "  vec4 b = projectionMatrix * modelViewMatrix * vec4(aNext + drift, 1.0);",
      "  vec2 dir = (b.xy / b.w - a.xy / a.w) * res;",
      "  dir = length(dir) > 1e-4 ? normalize(dir) : vec2(1.0, 0.0);",
      "  float along = clamp((aS - tail) / max(head - tail, 1e-3), 0.0, 1.0);",
      "  float inside = step(tail, aS) * step(aS, head);",
      "  float taper = inside * pow(sin(3.14159 * along), 0.45);",
      "  a.xy += vec2(-dir.y, dir.x) * aSide * width * taper / res * a.w;",
      "  vShow = inside;",
      "  gl_Position = a;",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform float opacity; varying float vShow;",
      "void main(){",
      "  if (vShow < 0.5) discard;",
      "  gl_FragColor = vec4(1.0, 1.0, 1.0, opacity);",
      "}",
    ].join("\n"),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

const strip = () => {
  const g = new THREE.BufferGeometry();
  const count = (POINTS + 1) * 2;
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute("aNext", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const s = new Float32Array(count);
  const side = new Float32Array(count);
  const index = [];
  for (let i = 0; i <= POINTS; i += 1) {
    s.set([i / POINTS, i / POINTS], i * 2);
    side.set([-1, 1], i * 2);
    if (i < POINTS) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  g.setAttribute("aS", new THREE.BufferAttribute(s, 1));
  g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
  g.setIndex(index);
  return g;
};

export function windLines({ scene, groundAt, count = 6 }) {
  const res = { value: new THREE.Vector2(1, 1) };
  const lines = Array.from({ length: count }, () => {
    const mesh = new THREE.Mesh(strip(), material(res));
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = 3;
    scene.add(mesh);
    return { mesh, age: 0, life: 1, live: false };
  });
  const points = Array.from({ length: POINTS + 1 }, () => new THREE.Vector3());
  /* Height of the loop and a slow bob, added after the curve is fitted over the terrain */
  const lift = new Float32Array(POINTS + 1);
  let wait = 0.6;

  const ray = new THREE.Vector3();
  const forward = new THREE.Vector3();
  /* A new curve centred on a random point of the screen (on the ground plane at `level`): a gentle side-to-side
     wave, maybe one loop part way along */
  const spawn = (line, camera, level) => {
    const R = Math.random;
    const len = 6 + R() * 5;
    const loop = R() < 0.55;
    const r = 0.32 + R() * 0.22;
    const loopAt = len * (0.3 + R() * 0.35);
    const total = len + (loop ? Math.PI * 2 * r : 0);
    const amp = 0.2 + R() * 0.35;
    const freq = 0.55 + R() * 0.5;
    const phase = R() * 6.283;
    const height = 1.5 + R() * 1.3;
    ray.set((R() - 0.5) * 1.5, (R() - 0.5) * 1.2 + 0.1, -1).unproject(camera);
    forward.set(0, 0, -1).transformDirection(camera.matrixWorld);
    const origin = ray.clone().addScaledVector(forward, (level - ray.y) / forward.y).setY(0).addScaledVector(WIND, -len / 2);
    for (let i = 0; i <= POINTS; i += 1) {
      const q = (i / POINTS) * total;
      let d = q;
      let up = 0;
      if (loop && q > loopAt) {
        if (q > loopAt + Math.PI * 2 * r) d = q - Math.PI * 2 * r;
        else {
          const a = (q - loopAt) / r;
          d = loopAt + r * Math.sin(a);
          up = r * (1 - Math.cos(a));
        }
      }
      const p = points[i].copy(origin).addScaledVector(WIND, d).addScaledVector(ACROSS, amp * Math.sin(d * freq + phase) + up * 0.3);
      p.y = Math.max(0, groundAt(p.x, p.z)) + height;
      lift[i] = up + Math.sin(d * 0.9 + phase) * 0.12;
    }
    /* Glide over the terrain: never steeper than ~0.4 per unit, never below the ground under it */
    const stepLen = total / POINTS;
    for (let i = 1; i <= POINTS; i += 1) points[i].y = Math.max(points[i].y, points[i - 1].y - stepLen * 0.4);
    for (let i = POINTS - 1; i >= 0; i -= 1) points[i].y = Math.max(points[i].y, points[i + 1].y - stepLen * 0.4);
    points.forEach((p, i) => (p.y += lift[i]));
    const g = line.mesh.geometry;
    const pos = g.attributes.position;
    const next = g.attributes.aNext;
    const n = new THREE.Vector3();
    for (let i = 0; i <= POINTS; i += 1) {
      const p = points[i];
      if (i < POINTS) n.copy(points[i + 1]);
      else n.copy(p).multiplyScalar(2).sub(points[i - 1]);
      pos.setXYZ(i * 2, p.x, p.y, p.z);
      pos.setXYZ(i * 2 + 1, p.x, p.y, p.z);
      next.setXYZ(i * 2, n.x, n.y, n.z);
      next.setXYZ(i * 2 + 1, n.x, n.y, n.z);
    }
    pos.needsUpdate = true;
    next.needsUpdate = true;
    Object.assign(line, { age: 0, life: 2.4 + R() * 1.3, live: true });
    line.mesh.visible = true;
  };

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t * t;

  return {
    peek: () =>
      lines.map((line) => ({
        live: line.live,
        age: +line.age.toFixed(2),
        head: +line.mesh.material.uniforms.head.value.toFixed(2),
        at: Array.from(line.mesh.geometry.attributes.position.array.slice(0, 3), (n) => +n.toFixed(2)),
      })),
    /* level: ground height around what the camera looks at; pixels: drawing buffer size */
    update(dt, { camera, level, pixels, ratio, on = true }) {
      res.value.copy(pixels);
      wait = Math.min(wait - dt, 1.5);
      if (on && wait <= 0) {
        const free = lines.find((line) => !line.live);
        if (free) spawn(free, camera, level);
        wait = 0.5 + Math.random() * 0.8;
      }
      lines.forEach((line) => {
        if (!line.live) return;
        line.age += dt;
        const t = line.age / line.life;
        const u = line.mesh.material.uniforms;
        u.head.value = easeOut(Math.min(1, t / 0.62));
        u.tail.value = easeIn(THREE.MathUtils.clamp((t - 0.38) / 0.62, 0, 1));
        u.drift.value.copy(WIND).multiplyScalar(line.age * 0.9);
        u.width.value = 3.4 * ratio;
        if (t >= 1) {
          line.live = false;
          line.mesh.visible = false;
        }
      });
    },
  };
}
