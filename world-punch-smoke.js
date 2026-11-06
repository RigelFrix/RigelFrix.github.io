/* Stylized Anime Punch Smoke VFX - world-punch-smoke.js
   Natural, billowy anime smoke and vapor that erupts from Niko's punch hitbox
   on impact (keyframes 37-40) and dissolves gracefully into the atmosphere.

   Design Principles for Natural Smoke (No Hair Lines):
   1. Volumetric Billowing Cloud Puffs (Cumulus / Cauliflower Smoke):
      - Overlapping soft cloud spheres with organic multi-frequency perimeter wobbles.
      - Cel-shaded density profile: radiant pure-white core transitioning into airy sky-mist.
      - Erupts with high initial momentum, decelerates under atmospheric air drag,
        balloons outward as it expands, and rises with gentle buoyant updraft.
   2. Broad Flowing Steam Banners:
      - Trailing vapor curtains that snake backward along the forearm.
      - Wide, soft, cloud-like width with smooth Gaussian edges.
      - ZERO fine spiky hair filaments or combed striations: reads purely as smooth, silky steam.
   3. World-Space Decoupling:
      - Anchored at the punch hitbox in world coordinates.
      - Lingers and dissipates naturally over ~0.85s even as Niko recoils.
*/

import * as THREE from "three";

// ============================================================================
// 1. BILLOWING SMOKE PUFF SHADER (Camera-facing procedural anime cloud)
// ============================================================================

const SMOKE_PUFF_VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  attribute float aOpacity;
  attribute vec3 aColor;

  varying vec2 vUv;
  varying float vSeed;
  varying float vOpacity;
  varying vec3 vColor;

  void main() {
    vUv = uv;
    vSeed = aSeed;
    vOpacity = aOpacity;
    vColor = aColor;

    // Camera-facing billboard quad
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const SMOKE_PUFF_FRAGMENT_SHADER = /* glsl */ `
  uniform float uGlobalAlpha;
  uniform float uTime;
  uniform vec3 uColorCore;
  uniform vec3 uColorMist;

  varying vec2 vUv;
  varying float vSeed;
  varying float vOpacity;
  varying vec3 vColor;

  void main() {
    // Center-origin coordinates [-1.0, 1.0]
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.05) discard;

    // Organic multi-harmonic perimeter wobble gives iconic anime cumulus cloud shape
    float angle = atan(p.y, p.x);
    float wobble = sin(angle * 3.0 + vSeed * 6.28 + uTime * 1.5) * 0.08
                 + sin(angle * 5.0 - vSeed * 3.14 - uTime * 2.0) * 0.05
                 + sin(angle * 7.0 + vSeed * 1.57) * 0.03;
    float dist = r + wobble;

    // Soft cloud density falloff: solid opaque core with fluffy dissolving edge
    float cloud = 1.0 - smoothstep(0.20, 0.95, dist);
    if (cloud <= 0.005) discard;

    // Internal smoke volume shading
    float internalShade = pow(cloud, 0.85);
    float coreGlow = smoothstep(0.45, 0.85, cloud);

    // Color gradient: brilliant pure white core transitioning to pale sky mist
    vec3 col = mix(uColorMist * vColor, uColorCore, coreGlow);

    float alpha = internalShade * vOpacity * uGlobalAlpha;
    if (alpha <= 0.008) discard;

    gl_FragColor = vec4(col, clamp(alpha * 0.92, 0.0, 1.0));
  }
`;

// ============================================================================
// 2. BROAD FLOWING STEAM BANNER SHADER (Smooth silky vapor, NO hair lines)
// ============================================================================

const STEAM_BANNER_VERTEX_SHADER = /* glsl */ `
  attribute vec3 tangent;
  attribute float side;
  attribute float width;

  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);

    // World-space tangent
    vec3 worldTangent = normalize(mat3(modelMatrix) * tangent);
    vec3 toCam = normalize(cameraPosition - wp.xyz);

    // Ribbon normal perpendicular to tangent and camera
    vec3 ribbonNorm = cross(worldTangent, toCam);
    float normLen = length(ribbonNorm);
    if (normLen > 0.0001) {
      ribbonNorm /= normLen;
    } else {
      ribbonNorm = vec3(0.0, 1.0, 0.0);
    }

    // Extrude vertex along ribbon normal according to side (-1 or +1) and width
    vec3 extrudedPos = wp.xyz + ribbonNorm * (side * width * 0.5);
    vWorldPos = extrudedPos;

    gl_Position = projectionMatrix * viewMatrix * vec4(extrudedPos, 1.0);
  }
`;

const STEAM_BANNER_FRAGMENT_SHADER = /* glsl */ `
  uniform float uGlobalAlpha;
  uniform float uProgress;
  uniform float uTime;
  uniform vec3 uColorCore;
  uniform vec3 uColorMist;

  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    // 1. Soft parabolic edge falloff across ribbon width (0 at edges, 1 in center)
    // ZERO hair filaments! Pure, soft, billowy steam gradient.
    float across = sin(vUv.y * 3.14159265);
    float softEdge = pow(across, 0.90);

    // 2. Low-frequency rolling vapor billow (broad billowing cloud waves, not thin hair lines!)
    float vaporWave1 = sin(vUv.x * 7.0 - uTime * 3.5) * 0.12 + 0.88;
    float vaporWave2 = sin(vUv.x * 12.0 + uTime * 4.5 + vUv.y * 3.0) * 0.08 + 0.92;
    float vaporDensity = softEdge * vaporWave1 * vaporWave2;

    // 3. Smooth taper at head and tail
    float headFade = smoothstep(0.0, 0.14, vUv.x);
    float tailCutoff = clamp(1.0 - uProgress * 0.35, 0.25, 1.0);
    float tailFade = 1.0 - smoothstep(tailCutoff - 0.20, tailCutoff, vUv.x);
    float lengthMask = headFade * tailFade;

    // 4. Color: pure white spine blending to soft ethereal sky mist at fringes
    vec3 col = mix(uColorMist, uColorCore, pow(softEdge, 1.1));

    float alpha = vaporDensity * lengthMask * uGlobalAlpha;
    if (alpha < 0.008) discard;

    gl_FragColor = vec4(col, clamp(alpha * 0.85, 0.0, 1.0));
  }
`;

/**
 * Builds a camera-facing curling steam banner geometry with S-curve waves and wide width.
 */
function buildSteamBannerGeometry({
  length = 2.0,
  maxWidth = 0.55,
  segments = 32,
  curlFreq = 2.2,
  curlAmp = 0.32,
  dir = new THREE.Vector3(0, 0, -1),
  curlAxis = new THREE.Vector3(0, 1, 0),
  curveBias = 0.82,
} = {}) {
  const positions = [];
  const tangents = [];
  const sides = [];
  const widths = [];
  const uvs = [];
  const indices = [];

  const forward = dir.clone().normalize();
  const up = curlAxis.clone().normalize();
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();

  const curvePoints = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const dist = t * length;

    const wave1 = Math.sin(t * Math.PI * curlFreq) * curlAmp * (0.25 + t * 0.75);
    const wave2 = Math.cos(t * Math.PI * (curlFreq * 0.75)) * curlAmp * 0.60 * (0.25 + t * 0.75);

    const pt = new THREE.Vector3()
      .addScaledVector(forward, dist * curveBias)
      .addScaledVector(right, wave1)
      .addScaledVector(up, wave2);

    curvePoints.push(pt);
  }

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const pt = curvePoints[i];

    let tangent;
    if (i === 0) tangent = curvePoints[1].clone().sub(curvePoints[0]).normalize();
    else if (i === segments) tangent = curvePoints[segments].clone().sub(curvePoints[segments - 1]).normalize();
    else tangent = curvePoints[i + 1].clone().sub(curvePoints[i - 1]).normalize();

    // Width taper: smooth rounded head, wide billowing belly, wispy tail
    let w = 0;
    if (t < 0.16) w = Math.sin((t / 0.16) * (Math.PI / 2)) * maxWidth;
    else if (t < 0.65) w = maxWidth;
    else w = Math.max(0, (1.0 - (t - 0.65) / 0.35) * maxWidth);

    // Left vertex
    positions.push(pt.x, pt.y, pt.z);
    tangents.push(tangent.x, tangent.y, tangent.z);
    sides.push(-1.0);
    widths.push(w);
    uvs.push(t, 0.0);

    // Right vertex
    positions.push(pt.x, pt.y, pt.z);
    tangents.push(tangent.x, tangent.y, tangent.z);
    sides.push(1.0);
    widths.push(w);
    uvs.push(t, 1.0);

    if (i < segments) {
      const idx = i * 2;
      indices.push(idx, idx + 1, idx + 2);
      indices.push(idx + 1, idx + 3, idx + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("tangent", new THREE.Float32BufferAttribute(tangents, 3));
  geo.setAttribute("side", new THREE.Float32BufferAttribute(sides, 1));
  geo.setAttribute("width", new THREE.Float32BufferAttribute(widths, 1));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

// ============================================================================
// MAIN SMOKE VFX CREATOR
// ============================================================================

export function createPunchSmoke({ scene, robot = null } = {}) {
  const group = new THREE.Group();
  group.name = "NikoPunchNaturalSmokeVFX";
  scene.add(group);

  const sharedUniforms = {
    uGlobalAlpha: { value: 0.0 },
    uProgress: { value: 0.0 },
    uTime: { value: 0.0 },
    uColorCore: { value: new THREE.Color(1.0, 1.0, 1.0) },
    uColorMist: { value: new THREE.Color(0.88, 0.94, 1.0) }, // Pale ethereal sky mist
  };

  // --------------------------------------------------------------------------
  // A. Billowing Smoke Puff Particles (24 Puffs)
  // --------------------------------------------------------------------------
  const NUM_PUFFS = 24;
  const puffMeshGroup = new THREE.Group();
  group.add(puffMeshGroup);

  const puffQuadGeo = new THREE.PlaneGeometry(1.0, 1.0);

  const puffMaterial = new THREE.ShaderMaterial({
    uniforms: sharedUniforms,
    vertexShader: SMOKE_PUFF_VERTEX_SHADER,
    fragmentShader: SMOKE_PUFF_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });

  const puffs = [];

  for (let i = 0; i < NUM_PUFFS; i++) {
    // Clone geometry so each puff can pass per-instance custom seed & opacity attributes
    const geo = puffQuadGeo.clone();
    const seed = Math.random();
    const seeds = new Float32Array(4).fill(seed);
    const opacities = new Float32Array(4).fill(1.0);
    const colors = new Float32Array([
      0.95 + Math.random() * 0.05, 0.96 + Math.random() * 0.04, 1.0,
      0.95 + Math.random() * 0.05, 0.96 + Math.random() * 0.04, 1.0,
      0.95 + Math.random() * 0.05, 0.96 + Math.random() * 0.04, 1.0,
      0.95 + Math.random() * 0.05, 0.96 + Math.random() * 0.04, 1.0,
    ]);

    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute("aOpacity", new THREE.BufferAttribute(opacities, 1));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));

    const mesh = new THREE.Mesh(geo, puffMaterial);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 13;
    puffMeshGroup.add(mesh);

    puffs.push({
      mesh,
      geo,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      rotSpeed: (Math.random() - 0.5) * 1.8,
      baseRadius: 0.62,
      maxScale: 1.25,
      lifespan: 0.85,
      age: 0,
      alive: false,
      role: i < 8 ? "core" : i < 16 ? "collar" : "plume",
    });
  }

  // --------------------------------------------------------------------------
  // B. Broad Flowing Steam Banners (4 Silk Tendrils - NO HAIR LINES)
  // --------------------------------------------------------------------------
  const bannerMeshGroup = new THREE.Group();
  group.add(bannerMeshGroup);

  const bannerDefs = [
    // 1-2. Trailing Steam: snaking backward over the forearm (Saitama reference)
    { dir: new THREE.Vector3(0.18, 0.35, -0.92),  curlAxis: new THREE.Vector3(1.0, 0.4, 0.2),   length: 2.10, maxWidth: 0.55, curlFreq: 2.2, curlAmp: 0.36 },
    { dir: new THREE.Vector3(-0.20, 0.40, -0.90), curlAxis: new THREE.Vector3(-0.8, 0.5, -0.2), length: 1.95, maxWidth: 0.48, curlFreq: 2.5, curlAmp: 0.32 },

    // 3-4. Forward Impact Steam: curling forward and upward ahead of the fist
    { dir: new THREE.Vector3(0.15, 0.50, 0.85),   curlAxis: new THREE.Vector3(0.3, 1.0, -0.2),  length: 1.60, maxWidth: 0.46, curlFreq: 2.6, curlAmp: 0.30 },
    { dir: new THREE.Vector3(-0.16, 0.55, 0.80),  curlAxis: new THREE.Vector3(-0.4, 1.0, 0.3),  length: 1.50, maxWidth: 0.42, curlFreq: 2.8, curlAmp: 0.28 },
  ];

  const bannerMeshes = [];
  const bannerGeos = [];

  const bannerMaterial = new THREE.ShaderMaterial({
    uniforms: sharedUniforms,
    vertexShader: STEAM_BANNER_VERTEX_SHADER,
    fragmentShader: STEAM_BANNER_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });

  bannerDefs.forEach((def) => {
    const geo = buildSteamBannerGeometry(def);
    bannerGeos.push(geo);
    const mesh = new THREE.Mesh(geo, bannerMaterial);
    mesh.frustumCulled = false;
    mesh.renderOrder = 14;
    bannerMeshGroup.add(mesh);
    bannerMeshes.push(mesh);
  });

  group.visible = false;

  let active = false;
  let hasSpawned = false;
  let age = 0;
  const totalLifespan = 0.85;

  const spawnPos = new THREE.Vector3();
  const facingDir = new THREE.Vector3();
  const rightDir = new THREE.Vector3();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const lockedQuat = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);

  /**
   * Spawns the natural anime smoke burst at the fist hitbox in world coordinates.
   */
  const spawnBurst = (hitboxPos, forward) => {
    active = true;
    age = 0;
    group.position.copy(hitboxPos);

    // Orient banner group so local +Z is forward along the character's punch direction
    if (forward.z < -0.9999) {
      lockedQuat.set(0, 1, 0, 0);
    } else {
      lockedQuat.setFromUnitVectors(zAxis, forward);
    }
    bannerMeshGroup.quaternion.copy(lockedQuat);

    rightDir.crossVectors(upAxis, forward).normalize();

    // Initialize all 18 billowing smoke puffs in world coordinates relative to group
    puffs.forEach((p, idx) => {
      p.alive = true;
      p.age = 0;
      p.mesh.visible = true;

      // Small spatial jitter at knuckle contact point
      const jitterX = (Math.random() - 0.5) * 0.18;
      const jitterY = (Math.random() - 0.5) * 0.18;
      const jitterZ = (Math.random() - 0.5) * 0.18;
      p.pos.set(jitterX, jitterY, jitterZ);
      p.mesh.position.copy(p.pos);

      p.vel.set(0, 0, 0);

      if (p.role === "core") {
        // 1. Clenched Knuckle Core: dense cloud enveloping fist, floats upward
        const spreadX = (Math.random() - 0.5) * 0.45;
        const spreadY = (Math.random() - 0.5) * 0.45;
        p.vel.addScaledVector(rightDir, spreadX)
             .addScaledVector(upAxis, 0.45 + Math.random() * 0.45)
             .addScaledVector(forward, -0.3 - Math.random() * 0.6); // Trails back along arm
        p.baseRadius = 0.65 + Math.random() * 0.20;
        p.maxScale = 1.40;
        p.lifespan = 0.85;
      } else if (p.role === "collar") {
        // 2. Radial Air Displacement Collar: bursting outward around impact
        const ringAngle = ((idx - 8) / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
        const radialDir = new THREE.Vector3()
          .addScaledVector(rightDir, Math.cos(ringAngle))
          .addScaledVector(upAxis, Math.sin(ringAngle));
        const radialSpeed = 2.4 + Math.random() * 0.9;
        p.vel.addScaledVector(radialDir, radialSpeed).addScaledVector(forward, 0.6);
        p.baseRadius = 0.52 + Math.random() * 0.16;
        p.maxScale = 1.30;
        p.lifespan = 0.70;
      } else {
        // 3. Forward Air Jet Plume: shoots forward into target and billows out
        const fwdSpeed = 3.2 + Math.random() * 1.4;
        const spreadX = (Math.random() - 0.5) * 0.7;
        const spreadY = (Math.random() - 0.5) * 0.7;
        p.vel.addScaledVector(forward, fwdSpeed)
             .addScaledVector(rightDir, spreadX)
             .addScaledVector(upAxis, spreadY + 0.45);
        p.baseRadius = 0.58 + Math.random() * 0.18;
        p.maxScale = 1.45;
        p.lifespan = 0.75;
      }

      p.mesh.scale.setScalar(p.baseRadius * 0.35);
    });

    sharedUniforms.uGlobalAlpha.value = 0.0;
    sharedUniforms.uProgress.value = 0.0;
    group.visible = true;
  };

  /**
   * Advances smoke physics in world coordinates.
   */
  const update = (punchFrame, handBone, punchHitbox = null, dt = 0.016, activeRobot = robot) => {
    const currentRobot = activeRobot || robot;

    // Trigger burst right when fist hitbox connects on impact (frames 37-40)
    if (punchFrame >= 37 && punchFrame <= 40 && !hasSpawned) {
      if (currentRobot) {
        const yaw = currentRobot.rotation.y;
        facingDir.set(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
      } else {
        facingDir.set(0, 0, 1);
      }

      if (punchHitbox && punchHitbox.active && punchHitbox.position && punchHitbox.position.lengthSq() > 0.01) {
        spawnPos.copy(punchHitbox.position);
      } else if (handBone) {
        handBone.getWorldPosition(spawnPos);
      } else {
        spawnPos.set(0, 0, 0);
      }

      spawnBurst(spawnPos, facingDir);
      hasSpawned = true;
    }

    // Reset spawn trigger once punch animation resets or leaves impact window
    if (punchFrame < 36 || punchFrame > 41) {
      hasSpawned = false;
    }

    // If active in world space, advance age, billowing physics, and graceful dissolution
    if (active) {
      age += dt;
      const t = age / totalLifespan;

      if (t >= 1.0 && !puffs.some((p) => p.alive)) {
        active = false;
        group.visible = false;
        sharedUniforms.uGlobalAlpha.value = 0.0;
        return;
      }

      sharedUniforms.uTime.value += dt;
      sharedUniforms.uProgress.value = Math.min(1.0, t);

      // Dissolve curve for the entire effect
      let globalAlpha = 1.0;
      if (t < 0.08) {
        globalAlpha = t / 0.08; // Snappy ease-in on impact
      } else if (t < 0.38) {
        globalAlpha = 1.0; // High punch presence
      } else {
        // Slowly and smoothly dissolves away like natural smoke
        globalAlpha = Math.max(0.0, 1.0 - (t - 0.38) / 0.62);
      }
      sharedUniforms.uGlobalAlpha.value = globalAlpha;

      // 1. Advance Billowing Smoke Puffs
      const airDrag = 4.2; // Atmospheric air resistance decelerates the blast
      puffs.forEach((p) => {
        if (!p.alive) return;

        p.age += dt;
        const pt = p.age / p.lifespan;

        if (pt >= 1.0) {
          p.alive = false;
          p.mesh.visible = false;
          return;
        }

        // Physics: velocity + atmospheric air drag
        p.pos.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(Math.max(0, 1.0 - airDrag * dt));
        // Buoyant updraft: warm air rises
        p.vel.y += 0.45 * dt;

        p.mesh.position.copy(p.pos);

        // Billowing expansion curve: rapid bloom, then gradual diffusion
        let growth = 1.0;
        if (pt < 0.22) {
          growth = 0.35 + Math.sin((pt / 0.22) * (Math.PI / 2)) * 0.65; // 0.35 to 1.0
        } else {
          growth = 1.0 + (pt - 0.22) * 0.55; // Gently expands outward into surrounding air
        }
        p.mesh.scale.setScalar(p.baseRadius * growth * p.maxScale);

        // Slow organic rotation
        p.mesh.rotation.z += p.rotSpeed * dt;

        // Individual puff opacity fade
        const opArray = p.geo.attributes.aOpacity.array;
        let puffAlpha = 1.0;
        if (pt > 0.40) {
          puffAlpha = Math.max(0.0, 1.0 - (pt - 0.40) / 0.60);
        }
        for (let k = 0; k < 4; k++) opArray[k] = puffAlpha;
        p.geo.attributes.aOpacity.needsUpdate = true;
      });

      // 2. Advance Steam Banners (slight buoyant rise)
      bannerMeshGroup.position.y += 0.30 * dt;
      const bannerScale = 0.85 + Math.min(t, 0.35) * 0.45;
      bannerMeshGroup.scale.setScalar(bannerScale);
    }
  };

  const hide = () => {
    hasSpawned = false;
  };

  const clearImmediate = () => {
    hasSpawned = false;
    active = false;
    group.visible = false;
    sharedUniforms.uGlobalAlpha.value = 0.0;
    puffs.forEach((p) => {
      p.alive = false;
      p.mesh.visible = false;
    });
  };

  const dispose = () => {
    scene.remove(group);
    puffs.forEach((p) => {
      p.geo.dispose();
    });
    puffQuadGeo.dispose();
    puffMaterial.dispose();
    bannerGeos.forEach((g) => g.dispose());
    bannerMaterial.dispose();
  };

  return {
    group,
    update,
    hide,
    clearImmediate,
    dispose,
    isActive: () => active,
    getPuffCount: () => (active ? puffs.filter((p) => p.alive).length : 0),
    spawnBurst,
    getAge: () => age,
  };
}
