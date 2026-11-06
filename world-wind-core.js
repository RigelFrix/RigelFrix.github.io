/* Linear Wind Core (Speed Line along the Forearm) - world-wind-core.js
   Replicates the stylized anime punch speed streak from Bertram Jensen's "Punch & Hit":
   https://mrb_jensen.artstation.com/projects/xzQLeE

   Key Characteristics:
   - Anchored in WORLD SPACE: Spawns at the punch location and remains stationary
     in the world as an air displacement / cavitation effect. Does NOT follow or drag
     with the hand as it recoils or moves.
   - Pointed strictly in the direction the character is facing (robot.rotation.y).
   - High visual clarity: pronounced core thickness, solid pure white spine,
     electric cyan aura, and deep blue contrast contour so it pops vividly against
     bright grass, rocks, and stone terrain.
   - 4 cross-blades (0, 45, 90, 135 deg) + 6 satellite cavitation micro-streaks forming
     a full 3D supersonic air tunnel around the punching fist.
*/

import * as THREE from "three";

function buildWindCoreGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];

  function addStreak(numBlades, segments, baseWidth, zMin, zMax, offsetX, offsetY) {
    const getWidth = (t) => {
      // Taper at tail (t=0) and tip (t=1), max width around forearm (t=0.20 to 0.65)
      if (t < 0.18) return (t / 0.18) * baseWidth;
      if (t < 0.65) return baseWidth;
      return Math.max(0, (1.0 - (t - 0.65) / 0.35) * baseWidth);
    };

    for (let b = 0; b < numBlades; b++) {
      const angle = (b * Math.PI) / numBlades;
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const startVert = positions.length / 3;

      for (let s = 0; s <= segments; s++) {
        const t = s / segments;
        const w = getWidth(t) * 0.5;
        const z = zMin + t * (zMax - zMin);

        // Left edge vertex
        positions.push(offsetX - w * nx, offsetY - w * ny, z);
        uvs.push(t, 0.0);

        // Right edge vertex
        positions.push(offsetX + w * nx, offsetY + w * ny, z);
        uvs.push(t, 1.0);

        if (s < segments) {
          const idx = startVert + s * 2;
          indices.push(idx, idx + 1, idx + 2);
          indices.push(idx + 1, idx + 3, idx + 2);
        }
      }
    }
  }

  // 1. Primary Central Wind Spear: 4 cross-blades (0, 45, 90, 135 deg), bold pronounced width (0.25m)
  addStreak(4, 24, 0.25, 0.0, 1.0, 0.0, 0.0);

  // 2. Satellite micro-streaks forming a rich 3D supersonic air cavitation tunnel:
  // Top flank
  addStreak(2, 14, 0.08, 0.06, 0.94, 0.0, 0.12);

  // Bottom flank
  addStreak(2, 14, 0.075, 0.08, 0.90, 0.0, -0.12);

  // Right outer flank
  addStreak(2, 14, 0.075, 0.10, 0.92, 0.13, 0.02);

  // Left inner flank
  addStreak(2, 14, 0.075, 0.05, 0.86, -0.13, -0.02);

  // Diagonal upper-right flank
  addStreak(2, 12, 0.06, 0.12, 0.88, 0.09, 0.09);

  // Diagonal lower-left flank
  addStreak(2, 12, 0.06, 0.12, 0.88, -0.09, -0.09);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

const WIND_CORE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const WIND_CORE_FRAGMENT_SHADER = /* glsl */ `
  uniform float uAlpha;
  uniform float uProgress;
  uniform float uTime;
  uniform vec3 uColorWhite;
  uniform vec3 uColorCyan;
  uniform vec3 uColorRim;

  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    // Distance across blade width: 0 at center spine, 1 at outer edge
    float d = abs(vUv.y - 0.5) * 2.0;

    // 1. Solid pure white central spine (high visual punch and crisp clarity)
    float spine = smoothstep(0.55, 0.08, d);

    // 2. Saturated electric cyan wind aura
    float aura = smoothstep(0.90, 0.15, d);

    // 3. Deep cel-shaded dark contrast rim so it pops vividly against light grass / stones
    float contour = smoothstep(1.0, 0.65, d);

    // 4. Longitudinal anime speed striations & moving dashes
    float striation = sin(vUv.y * 36.0 + uTime * 28.0) * 0.12 + 0.88;
    float dash = step(0.06, fract(vUv.x * 5.0 - uTime * 24.0 + sin(vUv.y * 24.0) * 0.45));
    float speedPattern = mix(0.80, 1.0, dash * striation);

    // 5. Length-wise needle tapers at head and tail
    float headFade = smoothstep(1.0, 0.84, vUv.x);
    float tailFade = smoothstep(0.0, 0.04, vUv.x);
    float lengthMask = headFade * tailFade;

    // Layer colors: outer blue rim -> electric cyan -> pure brilliant white spine
    vec3 col = mix(uColorRim, uColorCyan, aura);
    col = mix(col, uColorWhite, spine);

    // Bold, pronounced alpha: spine is fully opaque (1.0), aura is vibrant
    float a = (spine * 1.0 + aura * 0.75 + contour * 0.40) * speedPattern * lengthMask * uAlpha;
    if (a < 0.01) discard;

    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export function createWindCore({ scene, robot = null } = {}) {
  const geo = buildWindCoreGeometry();
  const uniforms = {
    uAlpha: { value: 0.0 },
    uProgress: { value: 0.0 },
    uTime: { value: 0.0 },
    uColorWhite: { value: new THREE.Color(1.0, 1.0, 1.0) },
    uColorCyan: { value: new THREE.Color(0.35, 0.90, 1.0) },
    uColorRim: { value: new THREE.Color(0.08, 0.22, 0.60) },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WIND_CORE_VERTEX_SHADER,
    fragmentShader: WIND_CORE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "NikoPunchLinearWindCore";
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  scene.add(mesh);

  const zAxis = new THREE.Vector3(0, 0, 1);

  // Direction and World-Position locking:
  // Once the punch initiates, the air cavitation tunnel is anchored at a fixed
  // world-space position and orientation. It does NOT follow or drag with the hand!
  let locked = false;
  const lockedFacingDir = new THREE.Vector3();
  const lockedQuat = new THREE.Quaternion();
  const lockedSpawnPos = new THREE.Vector3();
  const lockedTailPos = new THREE.Vector3();
  const backOffset = 0.85; // Tail anchors 85cm behind fist to cover forearm in world space

  let active = false;

  const update = (punchFrame, foreArmBone, handBone, dt = 0.016, activeRobot = robot) => {
    if (!handBone) {
      hide();
      return;
    }

    // Active during punch thrust, apex impact, and lingering dissipation (frames 37 to 42)
    if (punchFrame < 37 || punchFrame > 42) {
      hide();
      return;
    }

    const currentRobot = activeRobot || robot;

    // Anchor strictly to WORLD POSITION and character facing on the first active frame:
    // Once locked, the speed line remains stationary in world coordinates (air displacement effect)
    // and does NOT move or follow the character's hand.
    if (!locked) {
      if (currentRobot) {
        const yaw = currentRobot.rotation.y;
        // Direction the character is facing in the world:
        lockedFacingDir.set(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
      } else {
        lockedFacingDir.set(0, 0, 1);
      }

      if (lockedFacingDir.z < -0.9999) {
        lockedQuat.set(0, 1, 0, 0);
      } else {
        lockedQuat.setFromUnitVectors(zAxis, lockedFacingDir);
      }

      // Sample fist world position at the moment the punch thrust fires
      handBone.getWorldPosition(lockedSpawnPos);

      // Tail begins behind the fist along the opposite facing direction in WORLD SPACE
      lockedTailPos.copy(lockedSpawnPos).addScaledVector(lockedFacingDir, -backOffset);

      // Lock position and orientation in world space:
      mesh.position.copy(lockedTailPos);
      mesh.quaternion.copy(lockedQuat);
      locked = true;
    }

    // Frame-by-frame progression (spearing forward in world space):
    // Position and orientation remain strictly stationary at lockedTailPos and lockedQuat.
    let reach = 2.65;
    let alpha = 1.0;
    let thickness = 1.25;
    let progress = 1.0;

    if (punchFrame === 37) {
      reach = 2.40;
      alpha = 0.90;
      thickness = 1.18;
      progress = 0.70;
    } else if (punchFrame >= 38 && punchFrame <= 40) {
      // APEX IMPACT: maximum forward reach and brilliant visual clarity
      reach = 2.85;
      alpha = 1.0;
      thickness = 1.28;
      progress = 1.0;
    } else if (punchFrame === 41) {
      // Follow-through: fist recoils, air cavitation holds stationary in world space
      reach = 2.95;
      alpha = 0.55;
      thickness = 1.05;
      progress = 1.25;
    } else if (punchFrame === 42) {
      // Final dissipation in world space
      reach = 3.00;
      alpha = 0.25;
      thickness = 0.85;
      progress = 1.45;
    }

    const totalLen = backOffset + reach;
    mesh.scale.set(thickness, thickness, totalLen);

    uniforms.uAlpha.value = alpha;
    uniforms.uProgress.value = progress;
    uniforms.uTime.value += dt;

    mesh.visible = true;
    active = true;
  };

  const hide = () => {
    if (mesh.visible) {
      mesh.visible = false;
      uniforms.uAlpha.value = 0.0;
    }
    locked = false;
    active = false;
  };

  const dispose = () => {
    scene.remove(mesh);
    geo.dispose();
    mat.dispose();
  };

  return {
    mesh,
    update,
    hide,
    dispose,
    isActive: () => active,
    isLocked: () => locked,
    getFacingDir: () => lockedFacingDir.toArray(),
    getTailPos: () => lockedTailPos.toArray(),
  };
}
