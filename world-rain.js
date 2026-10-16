/* World-space rain after Infinity Town + Rainy Worlds.
   Infinity Town: THREE.LineSegments, short streaks, recycle at the ground.
   Rainy Worlds: rain ≠ wind on the streak; short mostly-vertical dashes.
   Hits: when a drop meets groundAt, spawn a short-lived splash ring + flick
   so rain reads as landing on the island (ground, grass bases, paths). */

import * as THREE from "three";

export function makeRain({ scene, lite = false } = {}) {
  const MAX = lite ? 1100 : 2800;
  const HALF = lite ? 11 : 15;
  const CEIL = lite ? 9 : 12;
  const SPLASH = lite ? 28 : 56;

  const positions = new Float32Array(MAX * 6);
  const colors = new Float32Array(MAX * 6);
  const spd = new Float32Array(MAX);
  const len = new Float32Array(MAX);

  for (let i = 0; i < MAX; i += 1) {
    const i6 = i * 6;
    const shade = 0.42 + Math.random() * 0.28;
    colors[i6] = colors[i6 + 3] = shade * 0.92;
    colors[i6 + 1] = colors[i6 + 4] = shade;
    colors[i6 + 2] = colors[i6 + 5] = shade * 1.08;
    spd[i] = 14 + Math.random() * 16;
    len[i] = 0.28 + Math.random() * 0.22;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setDrawRange(0, 0);

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 0;
  lines.visible = false;
  lines.name = "rain";
  scene.add(lines);

  /* Splash = bright ground disc + cross of short lines (readable under ortho). */
  const discGeo = new THREE.CircleGeometry(0.26, 12);
  discGeo.rotateX(-Math.PI / 2);
  const splashMat = new THREE.MeshBasicMaterial({
    color: 0xc8d8e8,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const rings = new THREE.InstancedMesh(discGeo, splashMat, SPLASH);
  rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rings.frustumCulled = false;
  rings.renderOrder = 3;
  rings.visible = false;
  rings.count = 0;
  scene.add(rings);

  const tickMat = new THREE.LineBasicMaterial({
    color: 0xd0deec,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  /* 2 segments per splash: short up flick + one ground dash (not a full X marker). */
  const tickPos = new Float32Array(SPLASH * 12);
  const tickLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(tickPos, 3)),
    tickMat
  );
  tickLines.geometry.setDrawRange(0, 0);
  tickLines.frustumCulled = false;
  tickLines.renderOrder = 3;
  tickLines.visible = false;
  scene.add(tickLines);

  const life = new Float32Array(SPLASH);
  const sx = new Float32Array(SPLASH);
  const sy = new Float32Array(SPLASH);
  const sz = new Float32Array(SPLASH);
  let splashI = 0;
  const dummy = new THREE.Object3D();
  /* Recent ground hits this frame — island can twitch nearby grass. */
  const hits = [];

  const hit = (x, y, z) => {
    const i = splashI % SPLASH;
    splashI += 1;
    life[i] = 0.001;
    sx[i] = x;
    sy[i] = y + 0.05;
    sz[i] = z;
    if (hits.length < 24) hits.push(x, z);
  };

  const seed = (i, cx, cz, baseY) => {
    const i6 = i * 6;
    const x = cx + (Math.random() * 2 - 1) * HALF;
    const z = cz + (Math.random() * 2 - 1) * HALF;
    const y = baseY + 1.2 + Math.random() * CEIL;
    const L = len[i];
    positions[i6] = x;
    positions[i6 + 1] = y;
    positions[i6 + 2] = z;
    positions[i6 + 3] = x;
    positions[i6 + 4] = y - L;
    positions[i6 + 5] = z;
    spd[i] = 14 + Math.random() * 16;
  };

  for (let i = 0; i < MAX; i += 1) seed(i, 0, 0, 0);

  return {
    mesh: lines,
    hits,
    update(dt, { center, groundAt: ground, intensity = 0, storm = 0, windMul = 1 } = {}) {
      hits.length = 0;
      if (intensity < 0.03) {
        lines.visible = false;
        rings.visible = false;
        tickLines.visible = false;
        geometry.setDrawRange(0, 0);
        tickLines.geometry.setDrawRange(0, 0);
        rings.count = 0;
        return;
      }

      lines.visible = true;
      const want = Math.floor(MAX * (0.35 + intensity * 0.65));
      geometry.setDrawRange(0, want * 2);
      material.opacity = 0.38 + intensity * 0.22 + storm * 0.1;

      const cx = center?.x ?? 0;
      const cz = center?.z ?? 0;
      const g0 = typeof ground === "function" ? ground(cx, cz) : 0;
      const driftX = (0.35 + windMul * 0.45 + storm * 0.7) * intensity;
      const driftZ = (-0.2 - windMul * 0.3 - storm * 0.45) * intensity;
      const step = Math.min(Math.max(dt, 0), 0.05);
      const attr = geometry.attributes.position;
      let hitsLeft = Math.floor(3 + intensity * 10 + storm * 8);

      for (let i = 0; i < want; i += 1) {
        const i6 = i * 6;
        const speed = spd[i] * (0.95 + intensity * 0.5);
        const L = len[i];
        positions[i6] += driftX * step;
        positions[i6 + 2] += driftZ * step;
        positions[i6 + 1] -= speed * step;
        positions[i6 + 3] = positions[i6];
        positions[i6 + 4] = positions[i6 + 1] - L;
        positions[i6 + 5] = positions[i6 + 2];

        const gy = typeof ground === "function" ? ground(positions[i6], positions[i6 + 2]) : g0;
        if (positions[i6 + 4] < gy + 0.04) {
          if (hitsLeft > 0 && Math.random() < 0.5 + intensity * 0.35) {
            hit(positions[i6], gy, positions[i6 + 2]);
            hitsLeft -= 1;
          }
          seed(i, cx, cz, g0);
          positions[i6 + 1] = g0 + CEIL * (0.5 + Math.random() * 0.5);
          positions[i6 + 4] = positions[i6 + 1] - len[i];
        } else if (Math.abs(positions[i6] - cx) > HALF * 1.2 || Math.abs(positions[i6 + 2] - cz) > HALF * 1.2) {
          seed(i, cx, cz, g0);
        }
      }
      attr.needsUpdate = true;

      let alive = 0;
      let tickN = 0;
      const fade = 0.32 + storm * 0.06;
      let meanT = 0;
      for (let i = 0; i < SPLASH; i += 1) {
        if (life[i] <= 0) continue;
        life[i] += step;
        const t = life[i] / fade;
        if (t >= 1) {
          life[i] = 0;
          continue;
        }
        const fadeOut = 1 - t;
        meanT += fadeOut;
        const grow = 0.45 + t * 1.35;
        const rise = fadeOut * (0.22 + storm * 0.1);
        const arm = (0.08 + t * 0.14) * fadeOut;
        dummy.position.set(sx[i], sy[i], sz[i]);
        dummy.scale.set(grow, 1, grow);
        dummy.updateMatrix();
        rings.setMatrixAt(alive, dummy.matrix);
        alive += 1;

        const i12 = tickN * 12;
        tickPos[i12] = sx[i];
        tickPos[i12 + 1] = sy[i];
        tickPos[i12 + 2] = sz[i];
        tickPos[i12 + 3] = sx[i];
        tickPos[i12 + 4] = sy[i] + rise;
        tickPos[i12 + 5] = sz[i];
        tickPos[i12 + 6] = sx[i] - arm;
        tickPos[i12 + 7] = sy[i];
        tickPos[i12 + 8] = sz[i];
        tickPos[i12 + 9] = sx[i] + arm;
        tickPos[i12 + 10] = sy[i];
        tickPos[i12 + 11] = sz[i];
        tickN += 1;
      }
      rings.count = alive;
      rings.instanceMatrix.needsUpdate = true;
      rings.visible = alive > 0;
      splashMat.opacity = alive ? (0.28 + intensity * 0.32) * (meanT / alive) : 0;

      tickLines.geometry.setDrawRange(0, tickN * 4);
      tickLines.geometry.attributes.position.needsUpdate = true;
      tickLines.visible = tickN > 0;
      tickMat.opacity = alive ? (0.4 + intensity * 0.3) * (meanT / Math.max(alive, 1)) : 0;
    },
    dispose() {
      scene.remove(lines);
      scene.remove(rings);
      scene.remove(tickLines);
      geometry.dispose();
      material.dispose();
      discGeo.dispose();
      tickLines.geometry.dispose();
      splashMat.dispose();
      tickMat.dispose();
    },
  };
}
