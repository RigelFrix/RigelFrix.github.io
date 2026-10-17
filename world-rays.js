/* Volumetric sun light, after t3ssel8r (as David Holland explains it in "3D Pixel Art Rendering"): a stack of
   horizontal slices of air across the view, each pixel of each slice asking the sun's shadow map (and the cloud
   layer, projected along the sun) whether that bit of air is lit. Lit air adds a little warm light, air in the
   shadow of a tree, a cliff or a cloud adds none, so shafts appear on their own wherever something blocks the sun
   and cloud gaps throw broad beams. Nothing is placed by hand.

   - Slices are depth tested, so whatever stands in front hides the air behind it.
   - Each pixel samples at a jittered point along its view ray (orthographic camera: the pixel stays the same), which
     turns the step between slices into fine grain instead of stacked copies of every shadow.
   - Air only counts above the ground (a baked height map) and thins with altitude, so low ground (beach, sea) sits
     behind more glow than the plateau: aerial depth for free.
   - Light is HDR and added on top, so the brightest shafts tip into bloom. */

import * as THREE from "three";
import { CLOUD_GLSL, cloudUniforms } from "./world-island.js";

export function makeRays({ scene, groundAt, sun, shadowSize = 4096, lite = false, span = 52 } = {}) {
  const LAYERS = lite ? 9 : 16;
  const BOTTOM = -0.4;
  const TOP = 15;
  const HEIGHT_MAX = 16;

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
    /* Add light, leave alpha alone (the sky is CSS behind a transparent canvas) */
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    defines: { LAYERS_F: LAYERS.toFixed(1), BOTTOM: BOTTOM.toFixed(2), TOP: TOP.toFixed(2), HEIGHT_MAX: HEIGHT_MAX.toFixed(1) },
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
      "uniform float strength; uniform vec3 tint;",
      CLOUD_GLSL,
      "varying vec3 vWorld; varying float vLayer;",
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
      "  float air = smoothstep(0.0, 1.8, above) * (1.0 - smoothstep(TOP - 4.0, TOP, p.y)) * exp(-max(p.y, 0.0) * 0.075);",
      "  float lit = sunLit(p) * (1.0 - cloudAt3(p) * cloudShade);",
      "  float a = air * lit * strength / LAYERS_F;",
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
  scene.add(mesh);

  return {
    mesh,
    /* extent: half-size of the area the slices must cover (the shadow fit's reach) */
    update(dt, { camera, center, extent = 40, strength = 0, tint }) {
      const map = sun?.shadow?.map?.depthTexture;
      uniforms.strength.value = strength;
      mesh.visible = strength > 0.005 && Boolean(map);
      if (!mesh.visible) return;
      uniforms.shadowMap.value = map;
      uniforms.shadowMatrix.value.copy(sun.shadow.matrix);
      uniforms.center.value.set(center.x, 0, center.z);
      uniforms.extent.value = extent;
      camera.getWorldDirection(uniforms.viewDir.value);
      if (tint) uniforms.tint.value.copy(tint);
    },
  };
}
