/* Volumetric sun light, after t3ssel8r (as David Holland explains it in "3D Pixel Art Rendering"): a stack of
   horizontal slices of air across the view, each pixel of each slice asking the sun's shadow map (and the cloud
   layer, projected along the sun) whether that bit of air is lit. Lit air adds a little warm light, air in the
   shadow of a tree, a cliff or a cloud adds none, so shafts appear on their own wherever something blocks the sun
   and cloud gaps throw broad beams. Nothing is placed by hand.

   - Slices are depth tested, so whatever stands in front hides the air behind it.
   - Each pixel samples at a jittered point along its view ray (orthographic camera: the pixel stays the same), which
     turns the step between slices into fine grain instead of stacked copies of every shadow.
   - Air only counts in a fixed band above the ground (a baked height map), so every spot has the same depth of air;
     low ground gets only a slight extra haze for depth.
   - Blended like a screen layer, so it lifts shade but never pushes sunlit ground past white. */

import * as THREE from "three";
import { CLOUD_GLSL, cloudUniforms } from "./world-island.js";

export function makeRays({ scene, groundAt, sun, shadowSize = 4096, lite = false, span = 52 } = {}) {
  const LAYERS = lite ? 9 : 16;
  const BOTTOM = -0.4;
  const TOP = 15;
  const HEIGHT_MAX = 16;
  /* How deep the glowing air is above any ground */
  const DEPTH = 7;

  /* Ground height under every point of air, so slices fade in above the terrain instead of cutting a line on it */
  const RES = 208;
  const heights = new Uint8Array(RES * RES);
  for (let j = 0; j < RES; j += 1) {
    for (let i = 0; i < RES; i += 1) {
      const x = -span + ((i + 0.5) / RES) * span * 2;
      const z = -span + ((j + 0.5) / RES) * span * 2;
      heights[j * RES + i] = Math.round((THREE.MathUtils.clamp(groundAt(x, z), 0, HEIGHT_MAX) / HEIGHT_MAX) * 255);
    }
  }
  const heightMap = new THREE.DataTexture(heights, RES, RES, THREE.RedFormat, THREE.UnsignedByteType);
  heightMap.minFilter = heightMap.magFilter = THREE.LinearFilter;
  heightMap.wrapS = heightMap.wrapT = THREE.ClampToEdgeWrapping;
  heightMap.needsUpdate = true;

  /* One mesh: LAYERS unit quads on the xz plane, each tagged with its height (0 bottom … 1 top) */
  const positions = new Float32Array(LAYERS * 4 * 3);
  const layer = new Float32Array(LAYERS * 4);
  const index = [];
  for (let k = 0; k < LAYERS; k += 1) {
    const t = k / (LAYERS - 1);
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, z], c) => {
      positions.set([x, 0, z], (k * 4 + c) * 3);
      layer[k * 4 + c] = t;
    });
    const o = k * 4;
    index.push(o, o + 2, o + 1, o, o + 3, o + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aLayer", new THREE.BufferAttribute(layer, 1));
  geometry.setIndex(index);

  const uniforms = {
    center: { value: new THREE.Vector3() },
    extent: { value: 40 },
    viewDir: { value: new THREE.Vector3(-1, -1.45, -1).normalize() },
    spacing: { value: (TOP - BOTTOM) / (LAYERS - 1) },
    heightMap: { value: heightMap },
    span: { value: span },
    shadowMap: { value: null },
    shadowMatrix: { value: new THREE.Matrix4() },
    shadowTexel: { value: 1 / shadowSize },
    strength: { value: 0 },
    rays: { value: 0 },
    time: { value: 0 },
    lightRight: { value: new THREE.Vector3(1, 0, 0) },
    lightUp: { value: new THREE.Vector3(0, 0, 1) },
    tint: { value: new THREE.Color(1, 0.9, 0.74) },
  };
  cloudUniforms({ uniforms });
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
    /* Screen-style: result = light + scene × (1 − light). Dark shade lifts, sunlit ground (already at or past white)
       barely moves, so the volume can never wash the image out or feed bloom. The factor comes from the light, not
       the scene, so it stays safe on HDR pixels. Alpha is left alone (the sky is CSS behind a transparent canvas). */
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcColorFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    defines: { DEPTH: DEPTH.toFixed(1), BOTTOM: BOTTOM.toFixed(2), TOP: TOP.toFixed(2), HEIGHT_MAX: HEIGHT_MAX.toFixed(1) },
    vertexShader: [
      "uniform vec3 center; uniform float extent;",
      "attribute float aLayer;",
      "varying vec3 vWorld; varying float vLayer;",
      "void main(){",
      "  vec3 p = vec3(center.x + position.x * extent, mix(BOTTOM, TOP, aLayer), center.z + position.z * extent);",
      "  vWorld = p; vLayer = aLayer;",
      "  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform sampler2DShadow shadowMap; uniform mat4 shadowMatrix; uniform float shadowTexel;",
      "uniform sampler2D heightMap; uniform float span; uniform vec3 viewDir; uniform float spacing;",
      "uniform float strength; uniform float rays; uniform float time; uniform vec3 lightRight; uniform vec3 lightUp; uniform vec3 tint;",
      CLOUD_GLSL,
      "varying vec3 vWorld; varying float vLayer;",
      /* Shafts: gaps in a high canopy, a pattern laid out across the sun direction. Every point on one sun line reads
         the same value, so each gap becomes a beam running down along the sun to the ground. Drifts slowly. */
      "float beamAt(vec3 p){",
      "  vec2 q = vec2(dot(p, lightRight), dot(p, lightUp));",
      "  float n = cloudNoise(q * 0.42 + vec2(time * 0.05, time * 0.02)) * 0.75 + cloudNoise(q * 1.1 + vec2(3.7, -time * 0.04)) * 0.25;",
      "  return smoothstep(0.56, 0.74, n);",
      "}",
      /* Four spread taps: shafts get the soft edge of light through air, not the crisp one of a cast shadow */
      "float sunLit(vec3 p){",
      "  vec4 c = shadowMatrix * vec4(p, 1.0);",
      "  vec3 s = c.xyz / c.w;",
      "  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) return 1.0;",
      "  float r = shadowTexel * 3.0;",
      "  return 0.25 * (texture(shadowMap, vec3(s.xy + vec2(-r, -0.4 * r), s.z)) + texture(shadowMap, vec3(s.xy + vec2(r, 0.4 * r), s.z))",
      "    + texture(shadowMap, vec3(s.xy + vec2(-0.4 * r, r), s.z)) + texture(shadowMap, vec3(s.xy + vec2(0.4 * r, -r), s.z)));",
      "}",
      "void main(){",
      "  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + vLayer * 7.31);",
      "  vec3 p = vWorld + viewDir * ((ign - 0.5) * spacing / max(abs(viewDir.y), 0.2));",
      "  float ground = texture2D(heightMap, (p.xz + span) / (2.0 * span)).r * HEIGHT_MAX;",
      "  float above = p.y - ground;",
      "  if (above <= 0.0) discard;",
      /* The same depth of air over every spot (a band DEPTH above the ground), so the glow measures how much of that
         air is lit, not how far the ground sits below the top slice; low ground only gets a slight extra haze */
      "  float air = smoothstep(0.0, 1.5, above) * (1.0 - smoothstep(DEPTH * 0.6, DEPTH, above)) * (1.0 - smoothstep(TOP - 2.0, TOP, p.y));",
      "  air *= 1.0 + 0.15 * (1.0 - smoothstep(0.5, 8.0, ground));",
      "  float lit = sunLit(p) * (1.0 - cloudAt3(p) * cloudShade);",
      /* Beams fill the whole column (long streaks), fading toward the top so they taper out of the light */
      "  float beamAir = smoothstep(0.0, 1.5, above) * (1.0 - smoothstep(TOP - 5.0, TOP, p.y));",
      "  float beam = rays > 0.001 ? beamAt(p) * beamAir * rays : 0.0;",
      "  float a = (air * strength / (DEPTH * 0.8) + beam / 7.5) * lit * spacing;",
      "  if (a < 0.0002) discard;",
      "  gl_FragColor = vec4(tint * a, 1.0);",
      "}",
    ].join("\n"),
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  mesh.name = "sun-volume";
  /* The shadow pass runs before any object draws, so the map always exists here, also in the prewarm render that
     shows every hidden mesh once (an unset sampler2DShadow there is a GL error) */
  mesh.onBeforeRender = () => {
    uniforms.shadowMap.value = sun?.shadow?.map?.depthTexture ?? null;
    uniforms.shadowMatrix.value.copy(sun.shadow.matrix);
  };
  scene.add(mesh);

  return {
    mesh,
    /* extent: half-size of the area the slices must cover (the shadow fit's reach). strength = even glow of sunlit air,
       rays = the beams on top of it. */
    update(dt, { camera, center, extent = 40, strength = 0, rays = 0, sunDir, tint }) {
      const map = sun?.shadow?.map?.depthTexture;
      uniforms.strength.value = strength;
      uniforms.rays.value = rays;
      mesh.visible = strength + rays > 0.005 && Boolean(map);
      if (!mesh.visible) return;
      uniforms.time.value += dt;
      if (sunDir) {
        const d = new THREE.Vector3(sunDir[0], sunDir[1], sunDir[2]).normalize();
        uniforms.lightRight.value.crossVectors(THREE.Object3D.DEFAULT_UP, d).normalize();
        uniforms.lightUp.value.crossVectors(d, uniforms.lightRight.value);
      }
      uniforms.center.value.set(center.x, 0, center.z);
      uniforms.extent.value = extent;
      camera.getWorldDirection(uniforms.viewDir.value);
      if (tint) uniforms.tint.value.copy(tint);
    },
  };
}
