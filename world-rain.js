/* World-space rain.
   Drops: one InstancedMesh of soft streaks. Each is a quad stretched along the fall direction and turned to face the
   camera around that axis, with a bright rounded head and a tail that fades out, so it reads as a falling drop rather
   than a 1 px scratch on the screen. Width is set in screen pixels from the ortho camera, so zoom doesn't fatten it.
   The fall leans a little with the wind but stays mostly vertical: long tilted lines read as HUD under this camera.
   Splashes: flat quads on the ground drawing a ring that opens and fades, plus a small crown of droplets thrown out.
   Hits are also returned so the island can flatten grass where drops land. */

import * as THREE from "three";

export function makeRain({ scene, lite = false } = {}) {
  const MAX = lite ? 1400 : 3400;
  const HALF = lite ? 11 : 15;
  const CEIL = lite ? 9 : 12;
  const SPLASH = lite ? 40 : 96;

  const drops = new Float32Array(MAX * 4);
  const spd = new Float32Array(MAX);

  const streak = new THREE.PlaneGeometry(1, 1);
  streak.translate(0, 0.5, 0);
  const dropGeo = new THREE.InstancedBufferGeometry();
  dropGeo.index = streak.index;
  dropGeo.setAttribute("position", streak.getAttribute("position"));
  const dropAttr = new THREE.InstancedBufferAttribute(drops, 4);
  dropAttr.setUsage(THREE.DynamicDrawUsage);
  dropGeo.setAttribute("aDrop", dropAttr);
  dropGeo.instanceCount = 0;

  const uniforms = {
    fall: { value: new THREE.Vector3(0, -1, 0) },
    len: { value: 0.6 },
    width: { value: 0.05 },
    opacity: { value: 0.5 },
    color: { value: new THREE.Color(0.86, 0.92, 1) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    vertexShader: [
      "uniform vec3 fall; uniform float len; uniform float width;",
      "attribute vec4 aDrop;",
      "varying vec2 vUv; varying float vSeed;",
      "void main(){",
      "  vec3 axis = -fall;",
      "  vec3 back = normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));",
      "  vec3 side = normalize(cross(axis, back));",
      "  float l = len * (0.65 + aDrop.w * 0.7);",
      "  float w = width * (0.75 + aDrop.w * 0.5);",
      "  vec3 p = aDrop.xyz + axis * position.y * l + side * position.x * w;",
      "  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);",
      "  vUv = vec2(position.x * 2.0, position.y);",
      "  vSeed = aDrop.w;",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform float opacity; uniform vec3 color;",
      "varying vec2 vUv; varying float vSeed;",
      "void main(){",
      /* Head is the bottom of the quad: a soft round cap, then a tail that thins and fades toward the top */
      "  float y = clamp(vUv.y, 0.0, 1.0);",
      "  float thin = mix(1.0, 0.35, y);",
      "  float across = 1.0 - smoothstep(thin * 0.35, thin, abs(vUv.x));",
      "  float head = smoothstep(0.0, 0.08, y);",
      "  float tail = pow(clamp(1.0 - y, 0.0, 1.0), 1.6);",
      "  float a = across * head * tail * opacity * (0.55 + vSeed * 0.45);",
      "  if (a < 0.004) discard;",
      "  gl_FragColor = vec4(color * (0.9 + (1.0 - y) * 0.25), a);",
      "}",
    ].join("\n"),
  });

  const streaks = new THREE.Mesh(dropGeo, material);
  streaks.frustumCulled = false;
  streaks.visible = false;
  streaks.name = "rain";
  scene.add(streaks);

  const splashData = new Float32Array(SPLASH * 4);
  const ringQuad = new THREE.PlaneGeometry(1, 1);
  ringQuad.rotateX(-Math.PI / 2);
  const ringGeo = new THREE.InstancedBufferGeometry();
  ringGeo.index = ringQuad.index;
  ringGeo.setAttribute("position", ringQuad.getAttribute("position"));
  ringGeo.setAttribute("uv", ringQuad.getAttribute("uv"));
  const splashAttr = new THREE.InstancedBufferAttribute(splashData, 4);
  splashAttr.setUsage(THREE.DynamicDrawUsage);
  ringGeo.setAttribute("aSplash", splashAttr);
  ringGeo.instanceCount = 0;

  const splashUniforms = {
    size: { value: 0.62 },
    opacity: { value: 0.6 },
    color: uniforms.color,
  };
  const splashMat = new THREE.ShaderMaterial({
    uniforms: splashUniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    vertexShader: [
      "uniform float size;",
      "attribute vec4 aSplash;",
      "varying vec2 vUv; varying float vAge; varying float vSeed;",
      "void main(){",
      "  float age = fract(aSplash.w);",
      "  vec3 p = aSplash.xyz + position * size * (0.55 + age * 0.45);",
      "  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);",
      "  vUv = uv * 2.0 - 1.0;",
      "  vAge = age;",
      "  vSeed = floor(aSplash.w) * 0.001;",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform float opacity; uniform vec3 color;",
      "varying vec2 vUv; varying float vAge; varying float vSeed;",
      "void main(){",
      "  float d = length(vUv);",
      "  float r = mix(0.12, 0.92, sqrt(vAge));",
      "  float band = mix(0.16, 0.05, vAge);",
      "  float ring = 1.0 - smoothstep(0.0, band, abs(d - r));",
      /* Crown: a few droplets thrown outward just ahead of the ring, gone by mid-life */
      "  float ang = atan(vUv.y, vUv.x) + vSeed * 6.283;",
      "  float spoke = pow(clamp(0.5 + 0.5 * cos(ang * 5.0), 0.0, 1.0), 24.0);",
      "  float dropR = mix(0.15, 1.05, vAge);",
      "  float crown = spoke * (1.0 - smoothstep(0.0, 0.1, abs(d - dropR))) * (1.0 - smoothstep(0.2, 0.55, vAge));",
      "  float fade = pow(clamp(1.0 - vAge, 0.0, 1.0), 1.5);",
      "  float a = max(ring * 0.75, crown) * fade * opacity;",
      "  if (a < 0.004) discard;",
      "  gl_FragColor = vec4(color, a);",
      "}",
    ].join("\n"),
  });
  const rings = new THREE.Mesh(ringGeo, splashMat);
  rings.frustumCulled = false;
  rings.renderOrder = 2;
  rings.visible = false;
  scene.add(rings);

  const life = new Float32Array(SPLASH);
  const sx = new Float32Array(SPLASH);
  const sy = new Float32Array(SPLASH);
  const sz = new Float32Array(SPLASH);
  const sSeed = new Float32Array(SPLASH);
  let splashI = 0;
  /* Recent ground hits this frame — island can twitch nearby grass. */
  const hits = [];

  const hit = (x, y, z) => {
    const i = splashI % SPLASH;
    splashI += 1;
    life[i] = 0.001;
    sx[i] = x;
    sy[i] = y + 0.04;
    sz[i] = z;
    sSeed[i] = Math.floor(Math.random() * 999);
    if (hits.length < 24) hits.push(x, z);
  };

  /* Drops start under a random point of the whole screen (a little past every edge, more above since they fall
     down the screen), at a random height around the ground the camera looks at, so rain covers the full view at any
     zoom instead of a box around the centre. Without a camera yet, a box around the centre. */
  const nearPoint = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const view = { camera: null, level: 0 };
  const seed = (i, cx, cz, baseY, top = false) => {
    const i4 = i * 4;
    const y = baseY + (top ? CEIL * (0.45 + Math.random() * 0.55) : -2 + Math.random() * (CEIL + 2));
    if (view.camera) {
      nearPoint.set(Math.random() * 2.2 - 1.1, Math.random() * 2.5 - 1.1, -1).unproject(view.camera);
      forward.set(0, 0, -1).transformDirection(view.camera.matrixWorld);
      const t = (y - nearPoint.y) / forward.y;
      drops[i4] = nearPoint.x + forward.x * t;
      drops[i4 + 2] = nearPoint.z + forward.z * t;
    } else {
      drops[i4] = cx + (Math.random() * 2 - 1) * HALF;
      drops[i4 + 2] = cz + (Math.random() * 2 - 1) * HALF;
    }
    drops[i4 + 1] = y;
    drops[i4 + 3] = Math.random();
    spd[i] = 16 + Math.random() * 10;
  };

  for (let i = 0; i < MAX; i += 1) seed(i, 0, 0, 0);

  const fall = new THREE.Vector3();

  return {
    mesh: streaks,
    hits,
    update(dt, { center, camera, groundAt: ground, intensity = 0, storm = 0, windMul = 1, light = 1 } = {}) {
      hits.length = 0;
      if (intensity < 0.03) {
        streaks.visible = false;
        rings.visible = false;
        dropGeo.instanceCount = 0;
        ringGeo.instanceCount = 0;
        life.fill(0);
        return;
      }

      streaks.visible = true;
      const want = Math.floor(MAX * (0.25 + intensity * 0.75));
      dropGeo.instanceCount = want;

      /* Pixel-sized width: world units per CSS pixel of the ortho camera */
      if (camera?.isOrthographicCamera) {
        const perPx = (camera.top - camera.bottom) / camera.zoom / Math.max(1, window.innerHeight);
        uniforms.width.value = perPx * (2.2 + storm * 0.6);
        splashUniforms.size.value = Math.max(0.5, perPx * 34);
      }
      uniforms.len.value = 0.42 + intensity * 0.28 + storm * 0.18;
      uniforms.opacity.value = (0.34 + intensity * 0.26 + storm * 0.08) * (0.55 + light * 0.45);
      splashUniforms.opacity.value = (0.38 + intensity * 0.3) * (0.55 + light * 0.45);
      uniforms.color.value.setRGB(0.8 + light * 0.1, 0.86 + light * 0.08, 0.95 + light * 0.05);

      const cx = center?.x ?? 0;
      const cz = center?.z ?? 0;
      const g0 = typeof ground === "function" ? ground(cx, cz) : 0;
      if (camera && !view.camera) {
        view.camera = camera;
        for (let i = 0; i < MAX; i += 1) seed(i, cx, cz, g0);
      }
      view.camera = camera || null;
      const driftX = (0.4 + windMul * 0.9) * (0.5 + intensity * 0.5);
      const driftZ = -(0.25 + windMul * 0.6) * (0.5 + intensity * 0.5);
      fall.set(driftX, -21, driftZ).normalize();
      uniforms.fall.value.copy(fall);
      const step = Math.min(Math.max(dt, 0), 0.05);
      let hitsLeft = Math.floor(4 + intensity * 12 + storm * 8);

      for (let i = 0; i < want; i += 1) {
        const i4 = i * 4;
        const speed = spd[i] * (0.9 + intensity * 0.35);
        drops[i4] += fall.x * speed * step;
        drops[i4 + 1] += fall.y * speed * step;
        drops[i4 + 2] += fall.z * speed * step;

        /* The sea surface (y 0) catches drops over water */
        const gy = Math.max(0, typeof ground === "function" ? ground(drops[i4], drops[i4 + 2]) : g0);
        if (drops[i4 + 1] < gy + 0.02) {
          if (hitsLeft > 0 && gy > 0.05 && Math.random() < 0.5 + intensity * 0.35) {
            hit(drops[i4], gy, drops[i4 + 2]);
            hitsLeft -= 1;
          }
          seed(i, cx, cz, g0, true);
        } else if (!camera && (Math.abs(drops[i4] - cx) > HALF * 1.2 || Math.abs(drops[i4 + 2] - cz) > HALF * 1.2)) {
          seed(i, cx, cz, g0);
        }
      }
      dropAttr.needsUpdate = true;

      let alive = 0;
      const fade = 0.42 + storm * 0.08;
      for (let i = 0; i < SPLASH; i += 1) {
        if (life[i] <= 0) continue;
        life[i] += step;
        const t = life[i] / fade;
        if (t >= 1) {
          life[i] = 0;
          continue;
        }
        const a4 = alive * 4;
        splashData[a4] = sx[i];
        splashData[a4 + 1] = sy[i];
        splashData[a4 + 2] = sz[i];
        splashData[a4 + 3] = sSeed[i] + Math.min(t, 0.999);
        alive += 1;
      }
      ringGeo.instanceCount = alive;
      splashAttr.needsUpdate = true;
      rings.visible = alive > 0;
    },
    dispose() {
      scene.remove(streaks);
      scene.remove(rings);
      streak.dispose();
      dropGeo.dispose();
      material.dispose();
      ringQuad.dispose();
      ringGeo.dispose();
      splashMat.dispose();
    },
  };
}
