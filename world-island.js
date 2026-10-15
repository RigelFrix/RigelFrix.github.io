/* The main island, built in code from the layout in world-map.js: terraced terrain with rock-column cliffs, a shaded
   sea with shore foam, a stream with two waterfalls, stairs and ruins up to the Star Shrine, a plateau camp, the
   beach dock and boat, trees, rocks and grass. Static pieces are baked into a few vertex-coloured meshes. Also owns
   the walk grid Niko paths on. */

import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import * as MAP from "./world-map.js";

/* Palette from the concept board: sky and water blues, nature greens, sand, rock greys, ruin tan, star gold */
export const ISLE = {
  sky: "#9fd3f5",
  water: "#3db0d6",
  waterDeep: "#2a7cc0",
  shallow: "#9cefe2",
  grass: "#7cb236",
  grassDeep: "#5a952e",
  grassTop: "#93c33f",
  grassSun: "#a9cc3e",
  grassShade: "#3f7d38",
  moss: "#5a8a3a",
  sand: "#ecd49c",
  sandLight: "#f6e3b4",
  sandDark: "#d9bd86",
  sandWet: "#d6b27a",
  seabed: "#4d9db8",
  dirt: "#c8a56e",
  rock: "#9a9590",
  rockDeep: "#77737f",
  rockLight: "#b4ada3",
  rockWarm: "#b3a28c",
  rockCool: "#8a8ca3",
  mossTop: "#7f9e48",
  algae: "#4b6a57",
  ruin: "#cdbfa3",
  ruinDeep: "#a99b82",
  wood: "#9a6842",
  woodDeep: "#6b472c",
  plank: "#bb8a5a",
  driftwood: "#c9b59b",
  iron: "#3b3d4a",
  roof: "#a85c46",
  net: "#5c8079",
  starfish: "#ee7d55",
  shell: "#f7e8d4",
  pine: "#3f7a48",
  pineLight: "#58985a",
  leaf: "#5d9b45",
  leafLight: "#7fb554",
  cloth: "#f3e7c8",
  clothRed: "#e2574a",
  star: "#ffd36a",
  rigel: "#bfe0ff",
};

const S = Math.SQRT1_2;
const hash3 = (x, y, z) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

/* Low poly: no shared vertices, a hashed wobble so seam duplicates move together, and one normal per original face
   (triangles that started on the same plane keep sharing a normal after the wobble, so a face never shows its
   diagonal) */
const facet = (geometry, jitter = 0, seed = 0, upright = 1) => {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  Object.keys(g.attributes).forEach((name) => name !== "position" && g.deleteAttribute(name));
  const p0 = g.attributes.position;
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const planeOf = (i) => {
    va.fromBufferAttribute(p0, i);
    vb.fromBufferAttribute(p0, i + 1).sub(va);
    vc.fromBufferAttribute(p0, i + 2).sub(va);
    return vc.cross(vb);
  };
  const faces = [];
  const faceKey = new Map();
  for (let i = 0; i < p0.count; i += 3) {
    const n = planeOf(i).normalize();
    const key = [n.x, n.y, n.z, n.dot(va)].map((v) => Math.round(v * 200)).join();
    if (!faceKey.has(key)) faceKey.set(key, faces.push([]) - 1);
    faces[faceKey.get(key)].push(i);
  }
  if (jitter) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const x = Math.round(p.getX(i) * 1000) / 1000;
      const y = Math.round(p.getY(i) * 1000) / 1000;
      const z = Math.round(p.getZ(i) * 1000) / 1000;
      p.setXYZ(
        i,
        x + (hash3(x, y, z + seed) - 0.5) * jitter,
        y + (hash3(y + seed, z, x) - 0.5) * jitter * upright,
        z + (hash3(z, x + seed, y) - 0.5) * jitter
      );
    }
  }
  const normals = new Float32Array(p0.count * 3);
  const sum = new THREE.Vector3();
  faces.forEach((tris) => {
    sum.set(0, 0, 0);
    tris.forEach((i) => sum.sub(planeOf(i)));
    sum.normalize();
    tris.forEach((i) => {
      for (let k = 0; k < 3; k += 1) sum.toArray(normals, (i + k) * 3);
    });
  });
  g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  return g;
};

const tint = new THREE.Color();
const paint = (geometry, color, shade = 0) => {
  const g = geometry.clone();
  tint.set(color);
  if (shade) tint.offsetHSL(0, 0, shade);
  const c = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < c.length; i += 3) c.set([tint.r, tint.g, tint.b], i);
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return g;
};

/* Baked occlusion: colours fade from `lo` at the bottom of a piece to `hi` at its top */
const gradeY = (g, lo, hi) => {
  g.computeBoundingBox();
  const { min: a, max: b } = g.boundingBox;
  const p = g.attributes.position;
  const c = g.attributes.color;
  for (let i = 0; i < p.count; i += 1) {
    const t = (p.getY(i) - a.y) / Math.max(b.y - a.y, 1e-4);
    const k = lo + (hi - lo) * t;
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * (k + (1 - k) * 0.35));
  }
  return g;
};

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const at = (x, y, z, { ry = 0, rx = 0, rz = 0, s = 1, sx = s, sy = s, sz = s } = {}) =>
  new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, "YXZ")), _s.set(sx, sy, sz));

/* Weathering in world space, the way the concept art paints its stone and wood: each rock drifts warm or cool,
   every face sits a little lighter or darker, upward faces catch light and moss, sides pick up vertical streaks,
   and anything near the sea gets a dark wet band with algae. Colours are set per vertex (smooth across a face) and
   the per-face key comes from the shared face normal, so no face splits along its diagonal. */
const WEATHER = {
  [ISLE.rock]: "stone",
  [ISLE.rockDeep]: "stone",
  [ISLE.rockLight]: "stone",
  [ISLE.ruin]: "ruin",
  [ISLE.ruinDeep]: "ruin",
  [ISLE.wood]: "wood",
  [ISLE.woodDeep]: "wood",
  [ISLE.plank]: "wood",
  [ISLE.driftwood]: "wood",
  [ISLE.roof]: "wood",
};
const SUN_DIR = new THREE.Vector3(-25, 30, 11).normalize();
const weather = (g, kind, seed, dry = false) => {
  const p = g.attributes.position;
  const c = g.attributes.color;
  const a = new THREE.Vector3();
  const n = new THREE.Vector3();
  const col = new THREE.Color();
  const warm = new THREE.Color(ISLE.rockWarm);
  const cool = new THREE.Color(ISLE.rockCool);
  const moss = new THREE.Color(ISLE.mossTop);
  const algae = new THREE.Color(ISLE.algae);
  const grey = new THREE.Color("#a49c92");
  const sunlit = new THREE.Color("#c9b79c");
  const slate = new THREE.Color("#5f6a8c");
  const stone = kind !== "wood";
  if (!g.attributes.normal) g.computeVertexNormals();
  const nrm = g.attributes.normal;
  for (let i = 0; i < p.count; i += 1) {
    a.fromBufferAttribute(p, i);
    n.fromBufferAttribute(nrm, i).normalize();
    const [cx, cy, cz] = [a.x, a.y, a.z];
    const key = MAP.rand(seed * 1.31 + Math.round(n.x * 6) * 3.7, Math.round(n.y * 6) * 5.3 + Math.round(n.z * 6) * 2.9);
    col.setRGB(c.getX(i), c.getY(i), c.getZ(i));
    if (stone) {
      const tone = MAP.fbm(cx * 0.16 + seed * 0.01, cz * 0.16 + cy * 0.08);
      col.lerp(tone > 0.5 ? warm : cool, Math.abs(tone - 0.5) * (kind === "ruin" ? 0.6 : 1.1));
      col.multiplyScalar(0.95 + key * 0.1);
      const lit = n.dot(SUN_DIR);
      col.lerp(lit > 0 ? sunlit : slate, Math.min(1, Math.abs(lit) * 1.3) * (kind === "ruin" ? 0.18 : 0.3));
      if (n.y > 0.45) {
        col.multiplyScalar(1 + (n.y - 0.45) * 0.22);
        const patch = MAP.fbm(cx * 0.55 + 31, cz * 0.55 - 7);
        col.lerp(moss, THREE.MathUtils.smoothstep(n.y, 0.5, 0.9) * THREE.MathUtils.smoothstep(patch, 0.42, 0.62) * (kind === "ruin" ? 0.55 : 0.7));
      } else if (Math.abs(n.y) < 0.45) {
        const streak = MAP.fbm((cx + cz) * 1.6, cy * 0.22 + seed * 0.03);
        col.multiplyScalar(1 - THREE.MathUtils.smoothstep(streak, 0.55, 0.75) * 0.2);
      } else {
        col.multiplyScalar(0.82);
      }
    } else {
      const board = MAP.rand(seed * 1.31, 0.7);
      col.multiplyScalar(0.9 + board * 0.2 + (key - 0.5) * 0.05);
      if (board > 0.82) col.lerp(grey, 0.32);
    }
    const wet = dry ? 0 : THREE.MathUtils.smoothstep(-cy, -0.45, 0.35);
    if (wet > 0) col.lerp(algae, wet * 0.55).multiplyScalar(1 - wet * 0.18);
    c.setXYZ(i, col.r, col.g, col.b);
  }
};

/* Collects coloured pieces and merges them into one mesh. Stone, ruin and wood colours weather on the way in;
   `dry` skips the sea-level wet band for pieces built in their own local space (boats, floating rocks). */
const makeBake = ({ dry = false } = {}) => {
  const list = [];
  return {
    add(geometry, color, matrix, shade = 0, grade = null) {
      const g = paint(geometry, color, shade);
      if (grade) gradeY(g, ...grade);
      g.applyMatrix4(matrix);
      if (WEATHER[color]) weather(g, WEATHER[color], list.length, dry);
      list.push(g);
    },
    /* A pre-coloured model; `vary` nudges its whole colour so copies are not identical */
    put(geometry, matrix, vary = 0, seed = list.length) {
      const g = geometry.clone();
      g.applyMatrix4(matrix);
      if (vary) {
        const c = g.attributes.color;
        const k = 1 + (MAP.rand(seed, 3.3) - 0.5) * vary;
        const warmth = (MAP.rand(seed, 8.1) - 0.5) * vary * 0.8;
        for (let i = 0; i < c.count; i += 1) c.setXYZ(i, c.getX(i) * k * (1 + warmth), c.getY(i) * k, c.getZ(i) * k * (1 - warmth));
      }
      list.push(g);
    },
    build(material) {
      if (!list.length) return null;
      const merged = mergeGeometries(list);
      list.forEach((g) => g.dispose());
      list.length = 0;
      return new THREE.Mesh(merged, material);
    },
  };
};

const G = {
  box: facet(new THREE.BoxGeometry(1, 1, 1)),
  hex: facet(new THREE.CylinderGeometry(1, 1, 1, 6)),
  oct: facet(new THREE.CylinderGeometry(1, 1, 1, 8)),
  cone: facet(new THREE.ConeGeometry(1, 1, 7)),
  ico: facet(new THREE.IcosahedronGeometry(1, 0), 0.3),
  blob: [0, 1, 2].map((seed) => facet(new THREE.IcosahedronGeometry(1, 1), 0.22, seed)),
  rock: [0, 1, 2].map((seed) => facet(new THREE.DodecahedronGeometry(1, 0), 0.5, seed)),
  column: [0, 1, 2, 3].map((seed) => facet(new THREE.CylinderGeometry(1, 1.12, 1, 6, 3), 0.34, seed, 0.06)),
  slab: [0, 1, 2].map((seed) => facet(new THREE.BoxGeometry(1, 1, 1, 1, 3, 1), 0.16, seed)),
  /* Square frustums (top radius / bottom radius), edges along the local axes */
  taper: facet(new THREE.CylinderGeometry(0.72, 1, 1, 4, 1).rotateY(Math.PI / 4)),
  flare: facet(new THREE.CylinderGeometry(1, 0.62, 1, 4, 1).rotateY(Math.PI / 4)),
  peak: facet(new THREE.CylinderGeometry(0.05, 1, 1, 4, 1).rotateY(Math.PI / 4)),
};

const combine = (parts) => {
  const merged = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return merged;
};

/* Tree and plant models, each one coloured geometry. Foliage and bark are smooth shaded (shared vertices) so the
   low poly shapes read as soft painted masses instead of a mesh of triangles. */
const smoothGeo = (geometry, warp) => {
  Object.keys(geometry.attributes).forEach((name) => name !== "position" && geometry.deleteAttribute(name));
  const g = mergeVertices(geometry, 1e-3);
  if (warp) {
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 1) {
      warp(v.fromBufferAttribute(p, i));
      p.setXYZ(i, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g.toNonIndexed();
};
/* Vertex colours from a ramp of stops, picked per vertex by `pick(position, normal)` in 0..1 */
const rampPaint = (g, stops, pick) => {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const c = new Float32Array(p.count * 3);
  const cols = stops.map((s) => new THREE.Color(s));
  const out = new THREE.Color();
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 1) {
    const t = THREE.MathUtils.clamp(pick(v.fromBufferAttribute(p, i), w.fromBufferAttribute(n, i)), 0, 0.9999) * (cols.length - 1);
    const k = Math.floor(t);
    out.copy(cols[k]).lerp(cols[k + 1], THREE.MathUtils.smoothstep(t - k, 0, 1));
    out.toArray(c, i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return g;
};
const LEAF = ["#2c5e36", "#477f3c", "#6a9f45", "#93c25a", "#c2db74"];
const NEEDLE = ["#24553a", "#357544", "#539552", "#80b863"];
const BARK = ["#5a3b2a", "#7d5236", "#a07250"];
/* One lumpy leaf clump: a smooth sphere pushed in and out by a few waves, lit from above in its colours */
const clump = (r, seed, detail = 2) =>
  rampPaint(
    smoothGeo(new THREE.IcosahedronGeometry(1, detail), (v) => {
      const bump = Math.sin(v.x * 3.1 + seed) * Math.sin(v.y * 2.7 + seed * 1.7) * Math.sin(v.z * 3.3 + seed * 0.6);
      v.multiplyScalar(r * (1 + bump * 0.16 + (hash3(v.x, v.y, v.z + seed) - 0.5) * 0.08));
      v.y *= 0.86;
    }),
    LEAF,
    (v, n) => 0.42 + n.y * 0.42 + v.y / r * 0.12 + (hash3(Math.round(v.x * 3), Math.round(v.y * 3), Math.round(v.z * 3) + seed) - 0.5) * 0.14
  );
/* A tapered limb from a to b, smooth shaded, darker toward the ground */
const limb = (a, b, r0, r1, flare = 0) => {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = smoothGeo(new THREE.CylinderGeometry(r1, r0, len, 7, 4, true).translate(0, len / 2, 0), (v) => {
    const t = v.y / len;
    const root = flare * Math.pow(Math.max(0, 1 - t * 4), 2);
    const ang = Math.atan2(v.z, v.x);
    v.x *= 1 + root * (1 + Math.cos(ang * 5) * 0.6);
    v.z *= 1 + root * (1 + Math.cos(ang * 5) * 0.6);
  });
  g.applyMatrix4(new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()), new THREE.Vector3(1, 1, 1)));
  return rampPaint(g, BARK, (v) => 0.15 + v.y * 0.35);
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const roundTreeGeo = (seed) => {
  const a = seed * 2.4;
  const fork = V(Math.cos(a) * 0.08, 1.15, Math.sin(a) * 0.08);
  const tips = [0, 1, 2].map((k) => {
    const b = a + k * 2.2 + 0.4;
    return V(Math.cos(b) * (0.55 + k * 0.1), 1.75 + k * 0.12, Math.sin(b) * (0.55 + k * 0.1));
  });
  const crown = [
    [0, 2.15, 0, 0.98],
    ...tips.map((t, k) => [t.x * 1.15, t.y + 0.22, t.z * 1.15, 0.66 - k * 0.04]),
    [Math.cos(a + 1.2) * 0.3, 2.75, Math.sin(a + 1.2) * 0.3, 0.6],
    [Math.cos(a + 3.6) * 0.75, 1.72, Math.sin(a + 3.6) * 0.75, 0.5],
  ];
  return gradeY(
    combine([
      limb(V(0, -0.1, 0), fork, 0.2, 0.13, 0.9),
      ...tips.map((t) => limb(fork, t, 0.11, 0.05)),
      ...crown.map(([x, y, z, r], k) => clump(r, seed * 7 + k).applyMatrix4(at(x, y, z, { ry: k + seed }))),
    ]),
    0.6,
    1.08
  );
};
/* A pine: a bare trunk and four smooth tiers whose rims droop into ragged branch tips */
const pineGeo = (seed) => {
  const tiers = [
    [0.95, 1.05, 1.0],
    [1.65, 0.84, 0.92],
    [2.25, 0.62, 0.82],
    [2.82, 0.4, 0.78],
  ];
  return gradeY(
    combine([
      limb(V(0, -0.1, 0), V(0, 1.2, 0), 0.15, 0.09, 0.5),
      ...tiers.map(([y, r, h], k) =>
        rampPaint(
          smoothGeo(new THREE.ConeGeometry(1, 1, 10, 2), (v) => {
            const ang = Math.atan2(v.z, v.x);
            const rim = THREE.MathUtils.smoothstep(-v.y, 0, 0.5);
            const tooth = Math.cos(ang * 5 + seed + k) * 0.5 + 0.5;
            v.x *= r * (1 + tooth * rim * 0.2);
            v.z *= r * (1 + tooth * rim * 0.2);
            v.y = y + v.y * h - tooth * rim * 0.2 * h;
          }),
          NEEDLE,
          (v, n) => 0.25 + (v.y - y + h * 0.5) / h * 0.45 + n.y * 0.2 + k * 0.04
        )
      ),
    ]),
    0.62,
    1.08
  );
};
const bushGeo = (seed) =>
  gradeY(
    combine([
      clump(0.55, seed * 3, 2).applyMatrix4(at(0, 0.4, 0)),
      clump(0.4, seed * 3 + 1).applyMatrix4(at(0.42, 0.3, 0.14)),
      clump(0.38, seed * 3 + 2).applyMatrix4(at(-0.36, 0.28, 0.2)),
    ]),
    0.7,
    1.06
  );

/* See-through: scenery between the camera and Niko is dithered away in a small circle around him, so trees, stones
   and cliffs never hide him. playerView is Niko's chest in view space, set every frame. */
export const seeThrough = { playerView: { value: new THREE.Vector3(0, 0, -9999) }, radius: { value: 1.35 } };
export const occlude = (material) => {
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey?.() || "";
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    shader.uniforms.playerView = seeThrough.playerView;
    shader.uniforms.seeRadius = seeThrough.radius;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 playerView;\nuniform float seeRadius;")
      .replace(
        "#include <clipping_planes_fragment>",
        [
          "#include <clipping_planes_fragment>",
          "{",
          "  vec3 here = -vViewPosition;",
          "  float off = length(here.xy - playerView.xy);",
          "  if (here.z > playerView.z + 0.9 && off < seeRadius) {",
          "    vec2 cell = floor(gl_FragCoord.xy);",
          "    float checker = mod(cell.x + cell.y, 2.0);",
          "    float fade = smoothstep(seeRadius, seeRadius * 0.55, off);",
          "    if (fade > 0.85 || (fade > 0.3 && checker > 0.5)) discard;",
          "  }",
          "}",
        ].join("\n")
      );
  };
  material.customProgramCacheKey = () => `${key}-see`;
  return material;
};

/* Crisp toon light for the scenery: flat shadow / half-lit / lit bands with only a thin blend at each edge
   (u = N·L * 0.5 + 0.5, so the first edge sits on the terminator) */
export const makeRamp = (levels = [100, 176, 255], edges = [0.5, 0.63], blend = 0.02) => {
  const size = 64;
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    const u = (i + 0.5) / size;
    let v = levels[0];
    edges.forEach((e, k) => (v += (levels[k + 1] - levels[k]) * THREE.MathUtils.smoothstep(u, e - blend, e + blend)));
    data[i] = Math.round(v);
  }
  const ramp = new THREE.DataTexture(data, size, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.LinearFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
};

/* Atmosphere on every lit surface: crisp-edged cloud shadows drift over the island, and ground right at the sea
   takes a light cool haze, so the levels read as height. */
export const atmosTime = { value: 0 };
export const atmos = (material) => {
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey?.() || "";
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    shader.uniforms.atmosTime = atmosTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vAtmos;")
      .replace(
        "#include <fog_vertex>",
        ["{", "  vec4 w = vec4(transformed, 1.0);", "  #ifdef USE_INSTANCING", "  w = instanceMatrix * w;", "  #endif", "  vAtmos = (modelMatrix * w).xyz;", "}", "#include <fog_vertex>"].join("\n")
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "uniform float atmosTime;",
          "varying vec3 vAtmos;",
          "float atmosHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
          "float atmosNoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);",
          "  return mix(mix(atmosHash(i), atmosHash(i + vec2(1.0, 0.0)), f.x), mix(atmosHash(i + vec2(0.0, 1.0)), atmosHash(i + vec2(1.0, 1.0)), f.x), f.y); }",
        ].join("\n")
      )
      .replace(
        "#include <opaque_fragment>",
        [
          "{",
          "  vec2 cp = vAtmos.xz * 0.05 + vec2(atmosTime * 0.016, atmosTime * 0.01);",
          "  float cloud = atmosNoise(cp) * 0.65 + atmosNoise(cp * 2.3 + 7.3) * 0.35;",
          "  float shade = smoothstep(0.6, 0.63, cloud);",
          "  outgoingLight *= mix(vec3(1.0), vec3(0.74, 0.8, 0.95), shade * 0.7);",
          "  float low = 1.0 - smoothstep(-1.2, 1.6, vAtmos.y);",
          "  outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.72, 0.84, 0.98) + vec3(0.01, 0.04, 0.07), low * 0.45);",
          "}",
          "#include <opaque_fragment>",
        ].join("\n")
      );
  };
  material.customProgramCacheKey = () => `${key}-atmos`;
  return material;
};

export function buildIsland({ scene, withRim, coarse = false, clear = [] }) {
  const root = new THREE.Group();
  root.name = "island";
  scene.add(root);

  /* Two soft tones: a clear sunlit side and a shade side the cool sky light fills */
  const ramp = makeRamp();
  const painted = atmos(withRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp }), 0.06));
  const paintedProps = atmos(occlude(withRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp }), 0.06)));
  const glowing = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

  const bake = makeBake();
  const glowBake = makeBake();
  const blockers = [];
  const block = (x, z, r) => blockers.push({ x, z, r });
  const uvToXZ = (u, v) => MAP.toXZ(u, v);
  const lerp = THREE.MathUtils.lerp;
  const rand = MAP.rand;

  /* Terrain heights at the walk-grid cell centres, shared by the cliffs, scatter, water and nav */
  const { min, size, cell } = MAP.GRID;
  const span = size * cell;
  const hgrid = new Float32Array(size * size);
  const sgrid = new Uint8Array(size * size);
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const x = min + (i + 0.5) * cell;
      const z = min + (j + 0.5) * cell;
      const t = MAP.terrainAtUV(...MAP.toUV(x, z));
      hgrid[j * size + i] = t.h;
      sgrid[j * size + i] = t.stair ? 1 : 0;
    }
  }
  const hAt = (i, j) => (i < 0 || j < 0 || i >= size || j >= size ? -3 : hgrid[j * size + i]);
  const cellOf = (x, z) => [Math.floor((x - min) / cell), Math.floor((z - min) / cell)];

  /* Ground colour by slope, height and what the layout says is there */
  const colour = new THREE.Color();
  const mixC = (a, b, t) => colour.set(a).lerp(tint.set(b), THREE.MathUtils.clamp(t, 0, 1));
  const shrineAt = MAP.spots.shrine;
  const plazaAt = MAP.spots.games;
  const campAt = MAP.spots.camp;
  const smooth = THREE.MathUtils.smoothstep;
  /* How far the ground around a point rises above it (cliff feet) and drops below it (cliff lips), from the grid */
  const relief = (x, z, y) => {
    const [i, j] = cellOf(x, z);
    let up = 0;
    let down = 0;
    for (let q = -3; q <= 3; q += 1) {
      for (let p = -3; p <= 3; p += 1) {
        if (!q && !p) continue;
        const h = hAt(i + p, j + q);
        const fall = 1 / (1 + Math.hypot(p, q) * 0.35);
        up = Math.max(up, (h - y) * fall);
        down = Math.max(down, (y - h) * fall);
      }
    }
    return { up, down };
  };
  /* Hard-edged threshold with a sliver of blend, like the Pixel_Pass floor's albedo patches */
  const cut = (value, edge) => smooth(value, edge - 0.01, edge + 0.01);
  /* How much grass grows here (0..1), set by groundColour for the grass scatter */
  let grassHere = 0;
  const groundColour = (x, y, z, ny) => {
    const [u, v] = MAP.toUV(x, z);
    const t = MAP.terrainAtUV(u, v);
    const grain = MAP.fbm(u * 0.35 + 11, v * 0.35 - 4);
    const { up, down } = relief(x, z, y);
    grassHere = 0;
    if (ny < 0.62) {
      mixC(ISLE.rock, ISLE.rockDeep, grain * 1.2 - 0.1 + (y < 1 ? 0.35 : 0));
      const tone = MAP.fbm(u * 0.16, v * 0.16 + y * 0.08);
      colour.lerp(tint.set(tone > 0.5 ? ISLE.rockWarm : ISLE.rockCool), Math.abs(tone - 0.5) * 1.1);
    } else if (t.stair) {
      mixC(ISLE.ruin, ISLE.ruinDeep, grain);
    } else if (y < 1.1 && (t.region?.beach || y < 0.7 || !t.region)) {
      if (y < -0.08) mixC(ISLE.sandWet, ISLE.seabed, -y / 2.2);
      else {
        /* Sand: crisp drifts of pale and darker grains, thin ripple lines, a hard damp tide line, trodden paths */
        colour.set(ISLE.sand);
        const drift = MAP.fbm(u * 0.22 - 17, v * 0.22 + 5);
        colour.lerp(tint.set(ISLE.sandLight), cut(drift, 0.56) * 0.7);
        colour.lerp(tint.set(ISLE.sandDark), (1 - cut(drift, 0.4)) * 0.6);
        const ripple = Math.sin((u * 0.8 + v * 1.9) * 2.2 + MAP.fbm(u * 0.5, v * 0.5) * 6);
        if (y > 0.2) colour.lerp(tint.set(ISLE.sandDark), cut(ripple, 0.9) * 0.35);
        const tide = 0.2 + (MAP.fbm(u * 0.6, v * 0.6) - 0.5) * 0.12;
        colour.lerp(tint.set(ISLE.sandWet), (1 - cut(y, tide)) * 0.8);
        const trodden = MAP.pathDist(u, v) - (grain - 0.5) * 0.6;
        colour.lerp(tint.set(ISLE.sandDark), (1 - cut(trodden, 0.7)) * 0.5);
      }
    } else {
      /* Grass: one base green and two hard-edged patch colours from their own noise, like the Pixel_Pass floor */
      const top = t.region?.h >= MAP.LEVEL.top ? 1 : 0;
      colour.set(ISLE.grass);
      if (top) colour.lerp(tint.set(ISLE.grassTop), 0.35);
      const p2 = MAP.fbm(u * 0.11 + 40, v * 0.11 - 13);
      const p3 = MAP.fbm(u * 0.1 - 23, v * 0.1 + 31);
      colour.lerp(tint.set(ISLE.grassSun), cut(p2, 0.56) * 0.75);
      colour.lerp(tint.set(ISLE.grassShade), cut(p3, 0.6) * 0.6);
      colour.lerp(tint.set(ISLE.grassDeep), cut(grain, 0.64) * 0.45);
      grassHere = 1;
      if (ny < 0.85) {
        colour.lerp(tint.set(ISLE.moss), 0.6);
        grassHere = 0;
      }
      const path = MAP.pathDist(u, v) - (grain - 0.5) * 0.5;
      const dirt = 1 - cut(path, 0.55);
      colour.lerp(tint.set(ISLE.dirt), dirt * 0.9 + (1 - cut(path, 0.68)) * (1 - dirt) * 0.4);
      grassHere *= cut(path, 0.75);
      if (top && Math.hypot(u - shrineAt[0], v - shrineAt[1]) < 5.2 * MAP.K) {
        colour.lerp(tint.set(ISLE.ruin), 0.6);
        grassHere *= 0.25;
      }
      const plaza = Math.hypot(u - plazaAt[0], v - plazaAt[1]) / MAP.K - (grain - 0.5) * 0.8;
      if (plaza < 3.1) {
        colour.lerp(tint.set(ISLE.dirt), 0.85 * cut(-plaza, -2.9));
        grassHere *= cut(plaza, 2.9);
      }
      const camp = Math.hypot(u - campAt[0], v - campAt[1]) / MAP.K - (grain - 0.5) * 1.2;
      colour.lerp(tint.set(ISLE.dirt), (1 - cut(camp, 1.8)) * 0.75 + (1 - cut(camp, 2.6)) * cut(camp, 1.8) * 0.35);
      grassHere *= cut(camp, 2.4);
      if (MAP.riverDist(u, v) < MAP.river.w + 0.2) {
        colour.set(ISLE.seabed);
        grassHere = 0;
      }
      /* Sunlit lips on every drop */
      if (down > 0.9) colour.lerp(tint.set(ISLE.grassTop), 0.35);
    }
    /* Cool occlusion where a cliff rises over the ground, in two flat steps */
    const ao = cut(up, 0.9) * 0.5 + cut(up, 2) * 0.5;
    if (ao > 0) colour.multiply(tint.setRGB(1 - ao * 0.32, 1 - ao * 0.26, 1 - ao * 0.12));
    return colour;
  };

  /* Ground paint: groundColour baked into a texture (about 5 texels a unit) so patches, paths and tide lines keep
     crisp edges instead of blending across the mesh; the same pass records where grass grows */
  const TEX = coarse ? 384 : 480;
  const texel = span / TEX;
  const hBil = (x, z) => {
    const fx = (x - min) / cell - 0.5;
    const fz = (z - min) / cell - 0.5;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const a = fx - i;
    const b = fz - j;
    return (hAt(i, j) * (1 - a) + hAt(i + 1, j) * a) * (1 - b) + (hAt(i, j + 1) * (1 - a) + hAt(i + 1, j + 1) * a) * b;
  };
  const grassMask = new Float32Array(TEX * TEX);
  const groundPixels = new Uint8Array(TEX * TEX * 4);
  {
    const seabed = new THREE.Color(ISLE.seabed).convertLinearToSRGB();
    for (let j = 0; j < TEX; j += 1) {
      for (let i = 0; i < TEX; i += 1) {
        const x = min + (i + 0.5) * texel;
        const z = min + (j + 0.5) * texel;
        const y = hBil(x, z);
        let c = seabed;
        if (y > -2.6) {
          const gx = (hBil(x + 0.25, z) - hBil(x - 0.25, z)) / 0.5;
          const gz = (hBil(x, z + 0.25) - hBil(x, z - 0.25)) / 0.5;
          c = groundColour(x, y, z, 1 / Math.sqrt(1 + gx * gx + gz * gz)).convertLinearToSRGB();
          grassMask[j * TEX + i] = grassHere;
        }
        groundPixels.set([c.r * 255, c.g * 255, c.b * 255, 255], (j * TEX + i) * 4);
      }
    }
  }
  const groundTexture = new THREE.DataTexture(groundPixels, TEX, TEX, THREE.RGBAFormat);
  groundTexture.colorSpace = THREE.SRGBColorSpace;
  groundTexture.magFilter = THREE.LinearFilter;
  groundTexture.minFilter = THREE.LinearMipmapLinearFilter;
  groundTexture.generateMipmaps = true;
  groundTexture.anisotropy = 4;
  groundTexture.needsUpdate = true;
  const groundMaterial = atmos(withRim(new THREE.MeshToonMaterial({ map: groundTexture, gradientMap: ramp }), 0.03));
  const groundAt = (x, z) => {
    const i = THREE.MathUtils.clamp(Math.floor((x - min) / texel), 0, TEX - 1);
    const j = THREE.MathUtils.clamp(Math.floor((z - min) / texel), 0, TEX - 1);
    const k = j * TEX + i;
    return { grass: grassMask[k], colour: tint.setRGB(groundPixels[k * 4] / 255, groundPixels[k * 4 + 1] / 255, groundPixels[k * 4 + 2] / 255, THREE.SRGBColorSpace) };
  };

  /* Terrain: one jittered grid, two triangles per cell, diagonal picked to follow the cliffs */
  let terrain;
  {
    const n = size + 1;
    const px = new Float32Array(n * n);
    const py = new Float32Array(n * n);
    const pz = new Float32Array(n * n);
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const k = j * n + i;
        const edge = i === 0 || j === 0 || i === size || j === size;
        px[k] = min + i * cell + (edge ? 0 : (rand(i * 1.7, j * 3.1) - 0.5) * 0.22);
        pz[k] = min + j * cell + (edge ? 0 : (rand(i * 2.9 + 7, j * 1.3) - 0.5) * 0.22);
        py[k] = MAP.heightAt(px[k], pz[k]);
      }
    }
    /* Shared vertices: smooth normals and colours blended across the ground, so the grid triangles never show */
    const pos = new Float32Array(n * n * 3);
    for (let k = 0; k < n * n; k += 1) pos.set([px[k], py[k], pz[k]], k * 3);
    const index = [];
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        const k00 = j * n + i;
        const k10 = k00 + 1;
        const k01 = k00 + n;
        const k11 = k01 + 1;
        if (Math.max(py[k00], py[k10], py[k01], py[k11]) < -2.9) continue;
        if (Math.abs(py[k00] - py[k11]) <= Math.abs(py[k10] - py[k01])) index.push(k00, k01, k11, k00, k11, k10);
        else index.push(k00, k01, k10, k10, k01, k11);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    const uvs = new Float32Array(n * n * 2);
    for (let k = 0; k < n * n; k += 1) uvs.set([(px[k] - min) / span, (pz[k] - min) / span], k * 2);
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    terrain = new THREE.Mesh(geometry, groundMaterial);
    terrain.name = "terrain";
    terrain.receiveShadow = true;
    terrain.castShadow = true;
    root.add(terrain);
  }

  /* Cliffs: chunky rock columns stood along every drop, from below the lower ground to just under the grass lip */
  {
    const placed = [];
    const rocks = [ISLE.rock, ISLE.rockDeep, ISLE.rockLight, ISLE.rock];
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        const h = hgrid[j * size + i];
        if (h < 0.6) continue;
        let low = h;
        let di = 0;
        let dj = 0;
        for (let y = -1; y <= 1; y += 1) {
          for (let x = -1; x <= 1; x += 1) {
            const nh = hAt(i + x, j + y);
            if (nh < low) {
              low = nh;
              di = x;
              dj = y;
            }
          }
        }
        if (h - low < 0.9) continue;
        if (sgrid[(j + dj) * size + (i + di)]) continue;
        const x = min + (i + 0.5) * cell;
        const z = min + (j + 0.5) * cell;
        const [u, v] = MAP.toUV(x, z);
        if (MAP.riverDist(u, v) < MAP.river.w + 1.1) continue;
        const len = Math.hypot(di, dj);
        const cx = x + (di / len) * 0.3 + (rand(x, z) - 0.5) * 0.3;
        const cz = z + (dj / len) * 0.3 + (rand(z, x) - 0.5) * 0.3;
        if (placed.some((p) => Math.hypot(p[0] - cx, p[1] - cz) < 1.0)) continue;
        placed.push([cx, cz]);
        const far = hAt(i + di * 3, j + dj * 3);
        const bottom = Math.min(low, far) - (Math.min(low, far) < 0.2 ? 1.6 : 0.7);
        const r = 0.58 + rand(cx * 2, cz) * 0.45;
        const top = h - 0.1 - rand(cz, cx * 2) * 0.45 + (rand(cx, cz * 3) > 0.96 ? 0.3 : 0);
        const k = Math.floor(rand(cx * 5, cz * 5) * 4);
        bake.add(G.column[k], rocks[k], at(cx, (top + bottom) / 2, cz, { ry: rand(cx, cz) * 6, sx: r, sz: r * (0.85 + rand(cz, 1) * 0.3), sy: top - bottom }), (rand(cx * 9, cz) - 0.5) * 0.06, [Math.max(0.5, 1.02 - (top - bottom) * 0.07), 1.1]);
      }
    }
  }

  /* Boulders around the shore and in the shallows, kept off the decks and the boat's mooring */
  const nearDeck = (u, v, margin) =>
    MAP.platforms.some((p) => {
      const pu = u - p.a[0];
      const pv = v - p.a[1];
      const t = (pu * p.dir[0] + pv * p.dir[1]) / p.len;
      return t > -margin / p.len && t < 1 + margin / p.len && Math.abs(pu * p.dir[1] - pv * p.dir[0]) < p.w + margin;
    }) || Math.hypot(u - MAP.spots.boat[0], v - MAP.spots.boat[1]) < 3;
  const wetRocks = [];
  const atWaterline = (x, z, cy, ry, rx) => {
    if (Math.abs(cy) < ry * 0.9) wetRocks.push([x, z, rx * Math.sqrt(1 - (cy / ry) ** 2)]);
  };
  for (let k = 0; k < 220; k += 1) {
    const x = min + rand(k * 3.3, 1.7) * span;
    const z = min + rand(k * 1.9, 8.1) * span;
    const [i, j] = cellOf(x, z);
    const h = hAt(i, j);
    if (h > 0.25 || h < -1.8) continue;
    const [u, v] = MAP.toUV(x, z);
    if (nearDeck(u, v, 1.4) || MAP.pathDist(u, v) < 1.2) continue;
    const s = 0.3 + rand(k, 4.4) * 0.75;
    atWaterline(x, z, h + s * 0.25, s * 0.8, s * 1.1);
    bake.add(G.rock[k % 3], [ISLE.rock, ISLE.rockLight, ISLE.rock, ISLE.rockDeep][k % 4], at(x, h + s * 0.25, z, { ry: k, sx: s * 1.2, sy: s * 0.8, sz: s }), 0, [0.7, 1.08]);
    if (k % 3 === 0) bake.add(G.rock[(k + 1) % 3], ISLE.rockDeep, at(x + s * 0.9, h + s * 0.1, z - s * 0.4, { ry: k * 2, s: s * 0.45 }), 0, [0.7, 1.08]);
  }
  /* Big sea rocks standing out in the water, like the ones ringing the island on the board */
  [[-24.5, 12.5, 1.5], [-26, 6.5, 1.1], [-14, 23.5, 1.2], [-6.5, 20, 0.9], [3.5, 19.5, 1.3], [13.5, 17, 1], [-22.5, -9.5, 1.2]].forEach(([u, v, s], k) => {
    const [x, z] = uvToXZ(...MAP.lay(u, v));
    const floor = MAP.heightAt(x, z);
    atWaterline(x, z, floor + s * 0.9, s * 1.6, s * 1.2);
    bake.add(G.rock[k % 3], k % 2 ? ISLE.rock : ISLE.rockLight, at(x, floor + s * 0.9, z, { ry: k * 1.7, sx: s * 1.3, sy: s * 1.6, sz: s * 1.1 }), 0, [0.6, 1.1]);
    bake.add(G.rock[(k + 2) % 3], ISLE.rockDeep, at(x + s * 0.9, floor + s * 0.4, z + s * 0.5, { ry: k, s: s * 0.6 }), 0, [0.6, 1.1]);
  });

  /* Stairs: stone steps on the ramps, curbs along both sides, and arches over two of them */
  const worldDir = (dir) => [(dir[0] + dir[1]) * S, (dir[1] - dir[0]) * S];
  MAP.stairs.forEach((s, index) => {
    const n = Math.max(4, Math.round((s.to - s.from) / 0.3));
    const [dx, dz] = worldDir(s.dir);
    const ry = Math.atan2(dx, dz);
    const run = s.len / n;
    for (let k = 0; k < n; k += 1) {
      const t = (k + 0.5) / n;
      const [x, z] = uvToXZ(s.a[0] + s.dir[0] * s.len * t, s.a[1] + s.dir[1] * s.len * t);
      const top = s.from + (s.to - s.from) * t;
      const bottom = s.from - 0.5;
      bake.add(G.box, k % 2 ? ISLE.ruin : ISLE.ruinDeep, at(x, (top + bottom) / 2, z, { ry: ry + (rand(k, index) - 0.5) * 0.04, sx: s.w * 2 - 0.15, sy: top - bottom, sz: run * 1.04 }), (rand(index, k) - 0.5) * 0.05);
    }
    const slope = Math.atan2(s.to - s.from, s.len);
    const hyp = Math.hypot(s.to - s.from, s.len);
    [-1, 1].forEach((side) => {
      const off = s.w + 0.05;
      const [x, z] = uvToXZ(s.a[0] + s.dir[0] * s.len * 0.5 + s.dir[1] * off * side, s.a[1] + s.dir[1] * s.len * 0.5 - s.dir[0] * off * side);
      bake.add(G.box, ISLE.ruinDeep, at(x, (s.from + s.to) / 2 + 0.2, z, { ry, rx: -slope, sx: 0.34, sy: 0.55, sz: hyp + 0.3 }));
    });
    if (s.arch) {
      const base = s.from;
      const broken = index === 2;
      [-1, 1].forEach((side) => {
        const off = s.w + 0.45;
        const [x, z] = uvToXZ(s.a[0] + s.dir[0] * 0.5 + s.dir[1] * off * side, s.a[1] + s.dir[1] * 0.5 - s.dir[0] * off * side);
        const blocks = broken && side > 0 ? 2 : 4;
        for (let k = 0; k < blocks; k += 1) {
          bake.add(G.slab[k % 3], k % 2 ? ISLE.ruin : ISLE.ruinDeep, at(x + (rand(k, side) - 0.5) * 0.1, base + 0.45 + k * 0.85, z, { ry: ry + (rand(side, k) - 0.5) * 0.2, sx: 0.78, sy: 0.84, sz: 0.78 }));
        }
        block(x, z, 0.55);
      });
      if (!broken) {
        const [x, z] = uvToXZ(s.a[0] + s.dir[0] * 0.5, s.a[1] + s.dir[1] * 0.5);
        bake.add(G.slab[1], ISLE.ruin, at(x, base + 3.65, z, { ry, sx: s.w * 2 + 1.9, sy: 0.55, sz: 0.95 }));
        bake.add(G.box, ISLE.ruinDeep, at(x, base + 3.25, z, { ry, sx: s.w * 2 + 1.5, sy: 0.25, sz: 0.8 }));
      }
    }
  });

  /* Decks: the dock and its T-head and the jetty on posts with beams and lamps, the bridge with its rails */
  const lanterns = [];
  const ring = facet(new THREE.TorusGeometry(0.2, 0.07, 4, 9));
  ring.rotateX(Math.PI / 2);
  /* Lamp post: stone plinth, tapered post with an iron band, a braced arm reaching toward `ry`, and an iron lantern
     hanging from a short chain */
  const lampPost = (x, z, base, ry, s = 1.85) => {
    const frame = at(x, base, z, { ry, s });
    const L = (lx, ly, lz, o = {}) => frame.clone().multiply(at(lx, ly, lz, o));
    bake.add(G.taper, ISLE.rockDeep, L(0, 0.2, 0, { sx: 0.24, sy: 0.42, sz: 0.24 }));
    bake.add(G.taper, ISLE.wood, L(0, 1.27, 0, { sx: 0.09, sy: 1.7, sz: 0.09 }));
    bake.add(G.peak, ISLE.woodDeep, L(0, 2.16, 0, { sx: 0.066, sy: 0.08, sz: 0.066 }));
    bake.add(G.box, ISLE.iron, L(0, 1.92, 0, { sx: 0.12, sy: 0.06, sz: 0.12 }));
    bake.add(G.box, ISLE.wood, L(0, 1.855, 0.29, { rx: -0.26, sx: 0.08, sy: 0.08, sz: 1.05 }));
    bake.add(G.box, ISLE.wood, L(0, 1.6, 0.23, { rx: -0.98, sx: 0.055, sy: 0.055, sz: 0.68 }));
    bake.add(G.box, ISLE.iron, L(0, 1.86, 0.7, { sx: 0.022, sy: 0.14, sz: 0.022 }));
    bake.add(G.peak, ISLE.iron, L(0, 1.75, 0.7, { sx: 0.13, sy: 0.12, sz: 0.13 }));
    bake.add(G.box, ISLE.iron, L(0, 1.685, 0.7, { sx: 0.15, sy: 0.025, sz: 0.15 }));
    glowBake.add(G.flare, "#ffd98a", L(0, 1.57, 0.7, { sx: 0.085, sy: 0.2, sz: 0.085 }));
    bake.add(G.box, ISLE.iron, L(0, 1.46, 0.7, { sx: 0.075, sy: 0.03, sz: 0.075 }));
    bake.add(G.peak, ISLE.iron, L(0, 1.42, 0.7, { rx: Math.PI, sx: 0.03, sy: 0.06, sz: 0.03 }));
    lanterns.push(new THREE.Vector3(0, 1.57, 0.7).applyMatrix4(frame));
  };
  const deckAt = (p, t, side) => {
    const off = (p.w - 0.06) * side;
    return uvToXZ(p.a[0] + p.dir[0] * p.len * t + p.dir[1] * off, p.a[1] + p.dir[1] * p.len * t - p.dir[0] * off);
  };
  MAP.platforms.forEach((p) => {
    const [dx, dz] = worldDir(p.dir);
    const ry = Math.atan2(dx, dz);
    const boards = Math.round(p.len / 0.32);
    for (let k = 0; k < boards; k += 1) {
      const t = (k + 0.5) / boards;
      const [x, z] = uvToXZ(p.a[0] + p.dir[0] * p.len * t, p.a[1] + p.dir[1] * p.len * t);
      const wide = p.w * 2 + (rand(k, 7) - 0.5) * 0.12;
      bake.add(G.box, k % 3 ? ISLE.plank : ISLE.wood, at(x + (rand(k, 1) - 0.5) * 0.05, p.h - 0.06 + (rand(k, p.len) - 0.5) * 0.04, z, { ry: ry + (rand(p.len, k) - 0.5) * 0.07, sx: wide, sy: 0.11, sz: 0.28 }), (rand(k, 2) - 0.5) * 0.08);
    }
    const bridge = p.name === "bridge";
    if (!bridge) {
      [-1, 1].forEach((side) => {
        const [x, z] = deckAt(p, 0.5, side * 0.92);
        bake.add(G.box, ISLE.woodDeep, at(x, p.h - 0.2, z, { ry, sx: 0.14, sy: 0.18, sz: p.len }));
      });
    }
    const posts = Math.max(2, Math.round(p.len / 1.5) + 1);
    for (let k = 0; k < posts; k += 1) {
      const t = k / (posts - 1);
      [-1, 1].forEach((side) => {
        const [x, z] = deckAt(p, t, side);
        const bottom = bridge ? p.h - 1.2 : -1.8;
        const top = bridge ? p.h + 0.75 : p.h + (k % 2 ? 0.08 : 0.32);
        bake.add(G.hex, ISLE.woodDeep, at(x, (top + bottom) / 2, z, { ry: k, sx: 0.14, sz: 0.14, sy: top - bottom }));
      });
      if (!bridge) {
        const [x, z] = uvToXZ(p.a[0] + p.dir[0] * p.len * t, p.a[1] + p.dir[1] * p.len * t);
        bake.add(G.box, ISLE.woodDeep, at(x, p.h - 0.24, z, { ry, sx: p.w * 2 + 0.1, sy: 0.12, sz: 0.14 }));
      }
    }
    if (p.name === "pier" || p.name === "jetty") {
      [0, 1].forEach((t) => {
        [-1, 1].forEach((side) => {
          const [x, z] = deckAt(p, t * 0.96 + 0.02, side * 0.8);
          bake.add(G.oct, ISLE.woodDeep, at(x, p.h + 0.22, z, { sx: 0.17, sz: 0.17, sy: 0.44 }));
          if ((t + (side > 0 ? 1 : 0)) % 2 === 0) bake.add(ring, "#d8c69a", at(x, p.h + 0.05, z, { s: 1.2 }));
        });
      });
    }
    if (bridge) {
      [-1, 1].forEach((side) => {
        const off = p.w - 0.05;
        const [x, z] = uvToXZ(p.a[0] + p.dir[0] * p.len * 0.5 + p.dir[1] * off * side, p.a[1] + p.dir[1] * p.len * 0.5 - p.dir[0] * off * side);
        bake.add(G.box, ISLE.wood, at(x, p.h + 0.66, z, { ry, sx: 0.1, sy: 0.1, sz: p.len }));
      });
    }
  });

  /* The Star Shrine: a round dais with a glowing inlay, standing stones in a broken ring, and a beam of light */
  const [sx, sz] = uvToXZ(...MAP.dais.c);
  const shrine = new THREE.Vector3(sx, MAP.dais.h, sz);
  {
    const d = MAP.dais;
    bake.add(G.oct, ISLE.ruinDeep, at(sx, d.h - 0.55, sz, { ry: 0.2, sx: d.r + 0.25, sz: d.r + 0.25, sy: 1.1 }));
    bake.add(G.oct, ISLE.ruin, at(sx, d.h - 0.06, sz, { ry: 0.2, sx: d.r, sz: d.r, sy: 0.14 }));
    bake.add(G.oct, ISLE.ruinDeep, at(sx, d.h + 0.0, sz, { ry: 0.2, sx: 1.7, sz: 1.7, sy: 0.04 }));
    const ring = new THREE.RingGeometry(2.25, 2.45, 8, 1);
    ring.rotateX(-Math.PI / 2);
    glowBake.add(facet(ring), ISLE.star, at(sx, d.h + 0.015, sz, { ry: 0.2 }));
    const star = new THREE.Shape();
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2;
      const r = k % 2 ? 0.42 : 1.35;
      star[k ? "lineTo" : "moveTo"](Math.sin(a) * r, Math.cos(a) * r);
    }
    const starGeo = new THREE.ShapeGeometry(star);
    starGeo.rotateX(-Math.PI / 2);
    glowBake.add(facet(starGeo), ISLE.star, at(sx, d.h + 0.03, sz, { ry: Math.PI / 4 }));

    [-168, -142, -116, -92, -66, -40, -14, 12, 196, 168].forEach((deg, k) => {
      const a = THREE.MathUtils.degToRad(deg);
      const r = (5.3 + rand(k, 2) * 0.5) * MAP.K;
      const u = d.c[0] + Math.cos(a) * r * 1.2;
      const v = d.c[1] + Math.sin(a) * r * 0.82;
      const [x, z] = uvToXZ(u, v);
      const [i, j] = cellOf(x, z);
      const ground = hAt(i, j);
      if (Math.abs(ground - MAP.LEVEL.top) > 0.3) return;
      const back = Math.sin(a) < -0.3;
      const tall = back ? 2.8 + rand(k, 5) * 1.8 : 1.4 + rand(k, 5) * 1.2;
      const face = Math.atan2(sx - x, sz - z);
      bake.add(G.slab[k % 3], k % 3 === 1 ? ISLE.rockLight : ISLE.rock, at(x, ground + tall / 2 - 0.2, z, { ry: face, rz: (rand(k, 8) - 0.5) * 0.12, sx: 0.95, sy: tall, sz: 0.62 }));
      if (back && k % 3 === 0) bake.add(G.box, ISLE.star, at(x, ground + tall * 0.62, z, { ry: face, sx: 0.36, sy: 0.36, sz: 0.66, rz: Math.PI / 4 }));
      block(x, z, 0.6);
    });
  }

  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, strength: { value: 0 } },
    vertexShader: "varying vec2 vUv; varying float vFace; void main(){ vUv = uv; vFace = abs(normalize(normalMatrix * normal).z); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: [
      "uniform float time; uniform float strength; varying vec2 vUv; varying float vFace;",
      "void main(){",
      "  float rise = pow(1.0 - vUv.y, 1.5);",
      "  float shimmer = 0.85 + 0.15 * sin(vUv.y * 40.0 + time * 3.0);",
      "  float a = pow(vFace, 2.5) * rise * shimmer * strength;",
      "  gl_FragColor = vec4(vec3(0.78, 0.9, 1.0), a);",
      "}",
    ].join("\n"),
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.1, 26, 16, 1, true), beamMat);
  beam.position.set(sx, MAP.dais.h + 13, sz);
  beam.renderOrder = 2;
  beam.frustumCulled = false;
  root.add(beam);

  /* Placement helpers for props and scatter */
  const flatAt = (x, z, r = 0.8) => {
    const [i, j] = cellOf(x, z);
    const h = hAt(i, j);
    const reach = Math.ceil(r / cell);
    for (let y = -reach; y <= reach; y += 1) for (let k = -reach; k <= reach; k += 1) if (Math.abs(hAt(i + k, j + y) - h) > 0.3) return null;
    return h;
  };
  const groundUV = (u, v) => {
    const [x, z] = uvToXZ(u, v);
    const [i, j] = cellOf(x, z);
    return { x, z, h: hAt(i, j) };
  };
  /* World yaw that turns a prop's local +z from (u, v) toward the nearest path */
  const faceAngle = (from, to) => {
    const [ax, az] = uvToXZ(...from);
    const [bx, bz] = uvToXZ(...to);
    return Math.atan2(bx - ax, bz - az);
  };
  const towardPath = (u, v) => {
    const e = 0.25;
    const du = MAP.pathDist(u + e, v) - MAP.pathDist(u - e, v);
    const dv = MAP.pathDist(u, v + e) - MAP.pathDist(u, v - e);
    return faceAngle([u, v], [u - du, v - dv]);
  };

  /* Plateau camp: campfire, fence along the drop, crates, barrels and lantern posts */
  const fires = [];
  {
    const fire = groundUV(...MAP.lay(-9.9, -7.1));
    for (let k = 0; k < 7; k += 1) {
      const a = (k / 7) * Math.PI * 2;
      bake.add(G.rock[k % 3], ISLE.rockDeep, at(fire.x + Math.cos(a) * 0.82, fire.h + 0.1, fire.z + Math.sin(a) * 0.82, { s: 0.27 }));
    }
    [0, 1.1, 2.2].forEach((a) => bake.add(G.hex, ISLE.woodDeep, at(fire.x, fire.h + 0.17, fire.z, { ry: a, rz: Math.PI / 2, sx: 0.11, sy: 1.2, sz: 0.11 })));
    const flame = new THREE.Group();
    flame.position.set(fire.x, fire.h + 0.24, fire.z);
    [["#ff8a3c", 0.42, 1.05], ["#ffd36a", 0.26, 0.72]].forEach(([c, r, hgt]) => {
      const m = new THREE.Mesh(G.cone, new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
      m.scale.set(r, hgt, r);
      m.position.y = hgt / 2;
      flame.add(m);
    });
    root.add(flame);
    fires.push(flame);
    block(fire.x, fire.z, 1);
  }

  const fence = (authored, level) => {
    const points = authored.map(([u, v]) => MAP.lay(u, v));
    for (let k = 1; k < points.length; k += 1) {
      const [u0, v0] = points[k - 1];
      const [u1, v1] = points[k];
      const steps = Math.max(1, Math.round(Math.hypot(u1 - u0, v1 - v0) / 1.6));
      const along = faceAngle([u0, v0], [u1, v1]);
      for (let s = 0; s <= steps; s += 1) {
        const p = groundUV(lerp(u0, u1, s / steps), lerp(v0, v1, s / steps));
        if (Math.abs(p.h - level) > 0.35) continue;
        bake.add(G.box, ISLE.woodDeep, at(p.x, p.h + 0.65, p.z, { ry: along + (rand(s, k) - 0.5) * 0.3, rz: (rand(k, s) - 0.5) * 0.1, sx: 0.17, sy: 1.3, sz: 0.17 }));
        block(p.x, p.z, 0.25);
        if (s === steps) continue;
        const q = groundUV(lerp(u0, u1, (s + 1) / steps), lerp(v0, v1, (s + 1) / steps));
        if (Math.abs(q.h - level) > 0.35) continue;
        const ry = Math.atan2(q.x - p.x, q.z - p.z);
        const len = Math.hypot(q.x - p.x, q.z - p.z);
        [0.5, 1.02].forEach((y) => bake.add(G.box, ISLE.wood, at((p.x + q.x) / 2, p.h + y, (p.z + q.z) / 2, { ry, sx: 0.09, sy: 0.12, sz: len })));
        for (let f = 0.25; f < 1; f += 0.25) {
          block(lerp(p.x, q.x, f), lerp(p.z, q.z, f), 0.25);
        }
      }
    }
  };
  fence([[-17.2, -5.4], [-16.2, -2.6], [-13.8, -1.4], [-11.2, -1.2]], MAP.LEVEL.mid);
  /* Props are sized against Niko (2.5 units, about 1.5 m): a barrel comes to his waist, a crate to his hip */
  const crate = (u, v, s = 1, turn = 0) => {
    s *= 1.4;
    const p = groundUV(...MAP.lay(u, v));
    bake.add(G.box, ISLE.wood, at(p.x, p.h + 0.4 * s, p.z, { ry: turn, s: 0.8 * s }));
    [-0.3, 0.3].forEach((y) => bake.add(G.box, ISLE.woodDeep, at(p.x, p.h + (0.4 + y) * s, p.z, { ry: turn, sx: 0.84 * s, sy: 0.09 * s, sz: 0.84 * s })));
    block(p.x, p.z, 0.6 * s);
  };
  const barrel = (u, v, s = 1) => {
    s *= 1.5;
    const p = groundUV(...MAP.lay(u, v));
    bake.add(G.oct, ISLE.wood, at(p.x, p.h + 0.45 * s, p.z, { sx: 0.36 * s, sz: 0.36 * s, sy: 0.9 * s }));
    [0.18, 0.72].forEach((y) => bake.add(G.oct, ISLE.woodDeep, at(p.x, p.h + y * s, p.z, { sx: 0.385 * s, sz: 0.385 * s, sy: 0.08 * s })));
    block(p.x, p.z, 0.45 * s);
  };
  /* A lamp post `along` units down path `index`, standing just off its `side` edge with the lantern over the path */
  const lantern = (index, along, side) => {
    const pts = MAP.paths[index];
    let left = along;
    for (let k = 1; k < pts.length; k += 1) {
      const [u0, v0] = pts[k - 1];
      const [u1, v1] = pts[k];
      const len = Math.hypot(u1 - u0, v1 - v0);
      if (left > len && k < pts.length - 1) {
        left -= len;
        continue;
      }
      const t = Math.min(1, left / len);
      const [du, dv] = [(u1 - u0) / len, (v1 - v0) / len];
      const [u, v] = [u0 + (u1 - u0) * t + dv * side * 1.55, v0 + (v1 - v0) * t - du * side * 1.55];
      const ground = MAP.terrainAtUV(u, v);
      if (ground.stair || MAP.platformAt(u, v) || MAP.pathDist(u, v) < 1.3) return;
      const p = groundUV(u, v);
      if (flatAt(p.x, p.z, 0.5) == null) return;
      lampPost(p.x, p.z, p.h, towardPath(u, v));
      block(p.x, p.z, 0.45);
      return;
    }
  };

  crate(-15.6, -8.4, 1, 0.3);
  crate(-15.9, -7.3, 0.7, 0.9);
  barrel(-14.9, -9.4);
  barrel(-14.2, -9.8, 0.85);
  [
    [3, 1.4, 1],
    [4, 5, -1],
    [5, 7, 1],
    [4, 8.6, 1],
    [6, 1.5, -1],
    [9, 1.6, 1],
    [10, 1.1, -1],
  ].forEach(([index, along, side]) => lantern(index, along, side));

  /* Beach and dock: cargo at the foot of the dock, a fisher's shack with a net rack,
     driftwood, an upturned rowboat in the cove, and starfish and shells along the tide line */
  crate(-12.2, 14.6, 0.9, 0.2);
  crate(-11.5, 15.3, 0.65, 1.1);
  crate(-12.1, 14.7, 0.55, 0.6);
  barrel(-14.7, 12.1);
  barrel(-15.3, 12.7, 0.8);
  barrel(-11.1, 14.2, 0.75);
  const placer = (u, v, ry, s = 1) => {
    const p = groundUV(u, v);
    const frame = at(p.x, p.h, p.z, { ry, s });
    return (lx, ly, lz, o = {}) => frame.clone().multiply(at(lx, ly, lz, o));
  };
  {
    /* Scaled so the door clears Niko's head */
    const S = 1.65;
    const ry = faceAngle(MAP.spots.shack, MAP.lay(-11.6, 11.6));
    const L = placer(...MAP.spots.shack, ry, S);
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-1.08, 0);
    gableShape.lineTo(1.08, 0);
    gableShape.lineTo(1.08, 1.6);
    gableShape.lineTo(0, 2.28);
    gableShape.lineTo(-1.08, 1.6);
    gableShape.closePath();
    const gable = facet(new THREE.ExtrudeGeometry(gableShape, { depth: 0.12, bevelEnabled: false }).translate(0, 0, -0.06));
    bake.add(G.box, ISLE.plank, L(0, 0.1, 0, { sx: 2.7, sy: 0.2, sz: 2.4 }));
    bake.add(G.box, ISLE.wood, L(0, 0.95, -1.02, { sx: 2.4, sy: 1.6, sz: 0.12 }));
    [-1, 1].forEach((side) => bake.add(gable, ISLE.plank, L(side * 1.2, 0.15, 0, { ry: Math.PI / 2 })));
    bake.add(G.box, ISLE.wood, L(-0.72, 0.95, 1.02, { sx: 0.96, sy: 1.6, sz: 0.12 }));
    bake.add(G.box, ISLE.wood, L(0.86, 0.95, 1.02, { sx: 0.68, sy: 1.6, sz: 0.12 }));
    bake.add(G.box, ISLE.wood, L(0.1, 1.6, 1.02, { sx: 0.7, sy: 0.3, sz: 0.12 }));
    bake.add(G.box, ISLE.woodDeep, L(0.1, 0.78, 1.05, { sx: 0.62, sy: 1.18, sz: 0.05 }));
    [-1, 1].forEach((side) => bake.add(G.box, ISLE.roof, L(0, 2.08, side * 0.6, { rx: side * 0.56, sx: 2.85, sy: 0.12, sz: 1.5 })));
    bake.add(G.box, ISLE.woodDeep, L(0, 2.42, 0, { sx: 2.95, sy: 0.12, sz: 0.16 }));
    glowBake.add(G.box, "#ffd98a", L(1.27, 1.05, 0.2, { sx: 0.04, sy: 0.42, sz: 0.52 }));
    glowBake.add(G.box, "#ffd98a", L(-0.72, 1.1, 1.09, { sx: 0.42, sy: 0.36, sz: 0.04 }));
    bake.add(G.box, ISLE.plank, L(-0.7, 0.42, 1.55, { sx: 1.1, sy: 0.1, sz: 0.36 }));
    [-1.1, -0.3].forEach((lx) => bake.add(G.box, ISLE.woodDeep, L(lx, 0.2, 1.55, { sx: 0.1, sy: 0.4, sz: 0.3 })));
    /* Net rack beside the shack */
    [-0.75, 0.75].forEach((lx) => bake.add(G.box, ISLE.woodDeep, L(2.4 + lx, 0.8, 0.6, { sx: 0.1, sy: 1.6, sz: 0.1 })));
    bake.add(G.box, ISLE.woodDeep, L(2.4, 1.55, 0.6, { sx: 1.7, sy: 0.08, sz: 0.08 }));
    bake.add(G.box, ISLE.net, L(2.4, 1.05, 0.62, { rx: 0.08, sx: 1.4, sy: 0.95, sz: 0.03 }));
    bake.add(ring, "#d8c69a", L(1.6, 0.05, -0.4, { s: 1.6 }));
    const [sx2, sz2] = uvToXZ(...MAP.spots.shack);
    block(sx2, sz2, 1.75 * S);
    const [nx, nz] = [sx2 + (Math.cos(ry) * 2.4 + Math.sin(ry) * 0.6) * S, sz2 + (-Math.sin(ry) * 2.4 + Math.cos(ry) * 0.6) * S];
    block(nx, nz, 0.9 * S);
  }
  barrel(-17.6, 9.2, 0.9);
  crate(-17.1, 10.4, 0.7, 0.5);
  /* Driftwood */
  [[-8.4, 14.8, 0.6], [-0.6, 13.6, 2.2], [-19.2, 6.6, 1.1], [3.2, 12.2, 2.8]].forEach(([lu, lv, turn], k) => {
    const [u, v] = MAP.lay(lu, lv);
    const p = groundUV(u, v);
    if (p.h < -0.1) return;
    bake.add(G.hex, ISLE.driftwood, at(p.x, p.h + 0.12, p.z, { ry: turn, rz: Math.PI / 2, sx: 0.14, sy: 1.8 + k * 0.3, sz: 0.14 }));
    bake.add(G.hex, ISLE.driftwood, at(p.x + 0.4, p.h + 0.1, p.z + 0.2, { ry: turn + 0.9, rz: Math.PI / 2, sx: 0.07, sy: 0.7, sz: 0.07 }));
  });

  /* Boats: hull shared by the moored sailboat, the rowboat at the jetty and the upturned one in the cove */
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, -1.9);
  hullShape.quadraticCurveTo(0.85, -1.1, 0.8, 0.6);
  hullShape.quadraticCurveTo(0.7, 1.5, 0, 1.7);
  hullShape.quadraticCurveTo(-0.7, 1.5, -0.8, 0.6);
  hullShape.quadraticCurveTo(-0.85, -1.1, 0, -1.9);
  const hullGeo = facet(new THREE.ExtrudeGeometry(hullShape, { depth: 0.7, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1, curveSegments: 4 }).rotateX(Math.PI / 2));
  const boats = [];
  const makeBoat = (spot, ry, s, sail) => {
    const p = groundUV(...spot);
    const hull = makeBake({ dry: true });
    hull.add(hullGeo, ISLE.wood, at(0, 0.35, 0));
    hull.add(G.box, ISLE.plank, at(0, 0.38, 0.2, { sx: 1.3, sy: 0.06, sz: 2.4 }));
    hull.add(G.box, ISLE.plank, at(0, 0.42, -0.5, { sx: 1.4, sy: 0.08, sz: 0.3 }));
    if (sail) {
      hull.add(G.box, ISLE.clothRed, at(0, 0.5, -0.9, { sx: 1.1, sy: 0.22, sz: 0.4 }));
      hull.add(G.hex, ISLE.woodDeep, at(0, 2.2, 0.3, { sx: 0.07, sz: 0.07, sy: 3.8 }));
      hull.add(G.box, ISLE.woodDeep, at(0, 1.3, 0.1, { sx: 0.06, sy: 0.06, sz: 1.8 }));
      hull.add(G.box, ISLE.cloth, at(0, 2.2, -0.35, { rx: 0.12, sx: 0.04, sy: 1.8, sz: 1.1 }));
      hull.add(G.box, ISLE.star, at(0, 4.15, 0.3, { sx: 0.06, sy: 0.25, sz: 0.4 }));
    } else {
      [-1, 1].forEach((side) => hull.add(G.box, ISLE.woodDeep, at(side * 0.75, 0.62, 0.1, { rz: side * 0.5, sx: 0.06, sy: 0.06, sz: 1.2 })));
    }
    const mesh = hull.build(painted);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.add(mesh);
    group.position.set(p.x, 0, p.z);
    group.rotation.y = ry;
    group.scale.setScalar(s);
    root.add(group);
    boats.push({ group, phase: boats.length * 1.7, ry });
  };
  const pierDir = MAP.platforms.find((p) => p.name === "pier").dir;
  const jetty = MAP.platforms.find((p) => p.name === "jetty");
  makeBoat(MAP.spots.boat, Math.atan2(...worldDir(pierDir)), 1.3, true);
  makeBoat([jetty.b[0] + jetty.dir[1] * 2.1, jetty.b[1] - jetty.dir[0] * 2.1], Math.atan2(...worldDir(jetty.dir)) + 0.25, 0.85, false);
  {
    const p = groundUV(...MAP.lay(-16.2, 4.8));
    bake.add(hullGeo, ISLE.wood, at(p.x, p.h + 0.05, p.z, { ry: 1.1, rz: Math.PI, s: 0.85 }));
    bake.add(G.hex, ISLE.woodDeep, at(p.x + 1.3, p.h + 0.08, p.z + 0.6, { ry: 0.3, rz: Math.PI / 2, sx: 0.07, sy: 2.2, sz: 0.07 }));
    block(p.x, p.z, 1.5);
  }
  /* Starfish and shells on the damp sand */
  {
    const star = new THREE.Shape();
    for (let k = 0; k < 10; k += 1) {
      const a = (k / 10) * Math.PI * 2;
      const r = k % 2 ? 0.07 : 0.17;
      star[k ? "lineTo" : "moveTo"](Math.sin(a) * r, Math.cos(a) * r);
    }
    const starGeo = facet(new THREE.ExtrudeGeometry(star, { depth: 0.03, bevelEnabled: false }).rotateX(-Math.PI / 2));
    let placed = 0;
    for (let k = 0; k < 900 && placed < 46; k += 1) {
      const u = (-22 + rand(k, 61) * 32) * MAP.K;
      const v = (-2 + rand(k, 67) * 24) * MAP.K;
      const [x, z] = uvToXZ(u, v);
      const t = MAP.terrainAtUV(u, v);
      if (!t.region?.beach || t.h < 0.05 || t.h > 0.42 || nearDeck(u, v, 0.6)) continue;
      placed += 1;
      if (k % 3 === 0) bake.add(starGeo, k % 2 ? ISLE.starfish : "#e8a04f", at(x, t.h + 0.01, z, { ry: k }));
      else bake.add(G.ico, ISLE.shell, at(x, t.h + 0.02, z, { ry: k, sx: 0.09, sy: 0.05, sz: 0.11 }));
    }
  }

  /* Meadow stall by the lookout path: posts and a striped awning */
  {
    /* Counter at Niko's waist, awning above his head */
    const S = 1.5;
    const at2 = MAP.lay(-0.8, 7.8);
    const p = groundUV(...at2);
    const L = placer(...at2, towardPath(...at2), S);
    [[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.6], [0.9, 0.6]].forEach(([a, b]) => {
      const tall = 1.8 + (b < 0 ? 0.3 : 0);
      bake.add(G.box, ISLE.woodDeep, L(a, tall / 2, b, { sx: 0.1, sy: tall, sz: 0.1 }));
    });
    for (let k = 0; k < 5; k += 1) bake.add(G.box, k % 2 ? ISLE.cloth : ISLE.clothRed, L(-0.8 + k * 0.4, 1.95, 0, { rx: -0.25, sx: 0.4, sy: 0.06, sz: 1.5 }));
    bake.add(G.box, ISLE.plank, L(0, 0.75, 0, { sx: 1.9, sy: 0.12, sz: 0.8 }));
    bake.add(G.box, ISLE.wood, L(0, 0.4, 0, { sx: 1.8, sy: 0.7, sz: 0.7 }));
    block(p.x, p.z, 1.15 * S);
  }

  /* Ruins: broken pillars and a fallen column along the path to the shrine */
  [[-4.4, -7.6, 3], [-5.6, -9.4, 2], [4.4, -9.8, 3], [2.4, -10.2, 1], [-3, -3.2, 2], [6.4, -12.4, 2], [-6.6, -13.2, 3]].forEach(([lu, lv, blocks], k) => {
    const [u, v] = MAP.lay(lu, lv);
    const p = groundUV(u, v);
    if (p.h < 2) return;
    for (let b = 0; b < blocks; b += 1) bake.add(G.oct, b % 2 ? ISLE.ruin : ISLE.ruinDeep, at(p.x, p.h + 0.4 + b * 0.78, p.z, { ry: b * 0.4, sx: 0.42, sz: 0.42, sy: 0.74 }));
    bake.add(G.oct, ISLE.ruinDeep, at(p.x, p.h + 0.1, p.z, { sx: 0.6, sz: 0.6, sy: 0.24 }));
    block(p.x, p.z, 0.65);
    if (k % 3 === 0) bake.add(G.oct, ISLE.ruin, at(p.x + 0.9, p.h + 0.3, p.z + 0.5, { rz: Math.PI / 2, ry: k, sx: 0.36, sz: 0.36, sy: 1.5 }));
  });

  /* Trees, bushes, rocks and flowers, scattered with clear space for paths, stairs, decks, the stream and stops */
  const keepClear = [
    ...Object.values(MAP.spots).map(([u, v]) => ({ u, v, r: 3.4 })),
    { u: shrineAt[0], v: shrineAt[1], r: 7 * MAP.K },
    { u: plazaAt[0], v: plazaAt[1] + 1.2 * MAP.K, r: 5 * MAP.K },
    ...clear.map(({ x, z, r }) => {
      const [u, v] = MAP.toUV(x, z);
      return { u, v, r };
    }),
  ];
  const pines = [pineGeo(0), pineGeo(1)];
  const rounds = [roundTreeGeo(0), roundTreeGeo(1), roundTreeGeo(2)];
  const bushes = [bushGeo(0), bushGeo(1)];
  const trees = [];
  const scatter = (count, spacing, accept, place, avoid = true) => {
    const taken = [];
    for (let k = 0; k < count; k += 1) {
      const x = min + rand(k * 1.37 + spacing, 2.1) * span;
      const z = min + rand(k * 2.11, 5.3 + spacing) * span;
      const [u, v] = MAP.toUV(x, z);
      if (keepClear.some((c) => Math.hypot(u - c.u, v - c.v) < c.r)) continue;
      if (avoid && blockers.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + 0.7)) continue;
      if (MAP.platformAt(u, v) || MAP.riverDist(u, v) < MAP.river.w + 1.2) continue;
      const t = MAP.terrainAtUV(u, v);
      if (t.stair || !accept(t, u, v)) continue;
      if (taken.some(([a, b]) => Math.hypot(a - x, b - z) < spacing)) continue;
      const h = flatAt(x, z, 0.9);
      if (h == null) continue;
      taken.push([x, z]);
      place(x, h, z, k, u, v);
    }
  };
  /* Trees stand two to three times Niko's height */
  scatter(
    2200,
    2.9,
    /* The meadow keeps to a few groves so it stays open grassland to roam */
    (t, u, v) => {
      if (!t.region || t.region.beach || t.region.stack || t.h <= 2) return false;
      const open = t.region.name === "meadow";
      return MAP.pathDist(u, v) > (open ? 3 : 2.1) && MAP.fbm(u * 0.16 + 3, v * 0.16) > (open ? 0.6 : 0.43);
    },
    (x, h, z, k, u, v) => {
      const s = 1.3 + rand(k, 9) * 0.6;
      const round = t2(u, v);
      bake.put(round ? rounds[k % 3] : pines[k % 2], at(x, h - 0.05, z, { ry: rand(k, 3) * 6, s }), 0.18, k);
      trees.push([x, z]);
      block(x, z, 0.75);
    }
  );
  function t2(u, v) {
    return MAP.fbm(u * 0.3 - 7, v * 0.3 + 2) > 0.55 && v > -10;
  }
  /* Trees at the back of the beach, sheltering under the cliffs */
  scatter(
    950,
    3.2,
    (t, u, v) => t.region?.beach && t.h > 0.44 && MAP.pathDist(u, v) > 2.4 && !nearDeck(u, v, 2.4),
    (x, h, z, k) => {
      const [i, j] = cellOf(x, z);
      let up = 0;
      for (let q = -4; q <= 4; q += 1) for (let p = -4; p <= 4; p += 1) up = Math.max(up, hAt(i + p, j + q) - h);
      if (up < 1.8 || rand(k, 13) > 0.6) return;
      bake.put(k % 3 ? pines[k % 2] : rounds[k % 3], at(x, h - 0.05, z, { ry: rand(k, 3) * 6, s: 1.2 + rand(k, 9) * 0.5 }), 0.18, k);
      block(x, z, 0.75);
    }
  );
  /* A pine on each sea stack, and a round tree on the islet */
  [[15.5, 9.5], [20, -2.5], [-24.4, -4.2], [10.4, 20.6]].forEach(([u, v], k) => {
    const p = groundUV(...MAP.lay(u, v));
    bake.put(k === 3 ? rounds[0] : pines[k % 2], at(p.x, p.h - 0.05, p.z, { ry: k, s: k === 3 ? 1.35 : 1.15 }), 0.2, k + 50);
  });
  scatter(
    1200,
    1.6,
    (t, u, v) =>
      t.region &&
      !t.region.stack &&
      t.h > 0.3 &&
      MAP.pathDist(u, v) > 1.1 &&
      (t.region.name !== "meadow" || MAP.fbm(u * 0.16 + 3, v * 0.16) > 0.52) &&
      (!t.region.beach || MAP.fbm(u * 0.2 - 9, v * 0.2 + 4) > 0.66),
    (x, h, z, k) => {
      if (k % 3 === 0) {
        const s = 0.35 + rand(k, 1) * 0.4;
        bake.add(G.rock[k % 3], k % 2 ? ISLE.rock : ISLE.rockLight, at(x, h + s * 0.2, z, { ry: k, sx: s * 1.3, sy: s * 0.75, sz: s }));
        block(x, z, s * 0.9);
      } else if (h > 2) {
        bake.put(bushes[k % 2], at(x, h, z, { ry: k, s: 1 + rand(k, 4) * 0.6 }), 0.24, k);
        block(x, z, 0.65);
      }
    }
  );
  scatter(
    1600,
    0.9,
    (t, u, v) => t.region && !t.region.beach && t.h > 2 && MAP.pathDist(u, v) > 0.8 && MAP.fbm(u * 0.4, v * 0.4 + 9) > 0.5,
    (x, h, z, k) => {
      const colours = ["#fff3d6", "#ffd36a", "#f39ab0", "#c9b8ff"];
      for (let f = 0; f < 4; f += 1) {
        const a = f * 1.9 + k;
        glowBake.add(G.ico, colours[k % 4], at(x + Math.cos(a) * 0.35, h + 0.16, z + Math.sin(a) * 0.35, { s: 0.07 }));
      }
    },
    false
  );

  /* Grass, after the Pixel_Pass field: leaf cards that always face the camera, rooted on the ground and painted the
     ground's own colour, lit as if they were the ground at their base (up normal, the base's shadow and cloud), so the
     meadow reads as one surface that ruffles at its edges. Wind rolls each card in its plane from two scrolling noises;
     Niko tips the cards away from him. Sized from Niko (2.5 units tall): a tuft is about a fifth of his height. */
  const player = new THREE.Vector3(999, 0, 999);
  const swayUniforms = { time: { value: 0 }, player: { value: player } };
  {
    const blocked = new Uint8Array(size * size);
    blockers.forEach(({ x, z, r }) => {
      const reach = Math.ceil(r / cell);
      const [ci, cj] = cellOf(x, z);
      for (let j = cj - reach; j <= cj + reach; j += 1) {
        for (let i = ci - reach; i <= ci + reach; i += 1) {
          if (i < 0 || j < 0 || i >= size || j >= size) continue;
          if (Math.hypot(min + (i + 0.5) * cell - x, min + (j + 0.5) * cell - z) < r * 0.85) blocked[j * size + i] = 1;
        }
      }
    });
    const stops = clear.map(({ x, z, r }) => ({ x, z, r: r * 0.7 }));
    const spacing = coarse ? 0.3 : 0.21;
    const cards = [];
    const accentTint = new THREE.Color("#b5cc2c");
    for (let gz = min; gz < min + span; gz += spacing) {
      for (let gx = min; gx < min + span; gx += spacing) {
        const x = gx + (rand(gx * 7.1, gz * 3.3) - 0.5) * spacing * 0.9;
        const z = gz + (rand(gx * 2.3 + 5, gz * 8.9) - 0.5) * spacing * 0.9;
        const [i, j] = cellOf(x, z);
        if (i < 1 || j < 1 || i >= size - 1 || j >= size - 1) continue;
        const h = hAt(i, j);
        if (h < 0.35 || sgrid[j * size + i] || blocked[j * size + i]) continue;
        const ground = groundAt(x, z);
        if (ground.grass < 0.5) continue;
        const [u, v] = MAP.toUV(x, z);
        if (Math.max(Math.abs(hAt(i + 1, j) - h), Math.abs(hAt(i - 1, j) - h), Math.abs(hAt(i, j + 1) - h), Math.abs(hAt(i, j - 1) - h)) > 0.25) continue;
        if (stops.some((c) => Math.hypot(c.x - x, c.z - z) < c.r) || MAP.platformAt(u, v)) continue;
        const accent = rand(x * 3.7, z * 9.1) < 0.012;
        cards.push({ x, y: hBil(x, z), z, colour: accent ? accentTint.clone() : ground.colour.clone(), kind: accent ? 1 : 0 });
      }
    }

    /* Leaf masks drawn as tapered, curving blades (white on clear, like grassleaf.png / accentleaf.png) */
    const leafMask = (blades) => {
      const W = 64;
      const data = new Uint8Array(W * W * 4);
      for (let py = 0; py < W; py += 1) {
        for (let px = 0; px < W; px += 1) {
          let cover = 0;
          for (let s = 0; s < 4; s += 1) {
            const fx = (px + (s % 2) * 0.5 + 0.25) / W;
            const fy = (py + (s >> 1) * 0.5 + 0.25) / W;
            const hit = blades.some(([x0, x1, top, w]) => {
              const t = fy / top;
              if (t > 1) return false;
              const cx = x0 + (x1 - x0) * Math.pow(t, 1.7);
              return Math.abs(fx - cx) < w * Math.pow(1 - t, 0.75);
            });
            if (hit) cover += 0.25;
          }
          data.set([255, 255, 255, cover * 255], (py * W + px) * 4);
        }
      }
      const texture = new THREE.DataTexture(data, W, W, THREE.RGBAFormat);
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      return texture;
    };
    const leafTex = leafMask([
      [0.5, 0.56, 0.98, 0.09],
      [0.42, 0.14, 0.74, 0.08],
      [0.58, 0.88, 0.8, 0.08],
      [0.36, 0.3, 0.46, 0.07],
      [0.64, 0.72, 0.52, 0.07],
    ]);
    const accentTex = leafMask([
      [0.5, 0.46, 1, 0.07],
      [0.44, 0.16, 0.86, 0.065],
      [0.56, 0.84, 0.9, 0.065],
      [0.4, 0.3, 0.62, 0.06],
      [0.6, 0.66, 0.7, 0.06],
    ]);

    const geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const seeds = new Float32Array(cards.length * 2);
    cards.forEach((c, k) => seeds.set([rand(c.x * 1.3, c.z * 4.1), c.kind], k * 2));
    geometry.setAttribute("aGrass", new THREE.InstancedBufferAttribute(seeds, 2));

    const material = new THREE.MeshToonMaterial({ gradientMap: ramp, side: THREE.DoubleSide });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.time = swayUniforms.time;
      shader.uniforms.player = swayUniforms.player;
      shader.uniforms.leafTex = { value: leafTex };
      shader.uniforms.accentTex = { value: accentTex };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          [
            "#include <common>",
            "uniform float time;",
            "uniform vec3 player;",
            "attribute vec2 aGrass;",
            "varying vec4 vGrass;",
            "varying float vGust;",
            "float grassHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
            "float grassNoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);",
            "  return mix(mix(grassHash(i), grassHash(i + vec2(1.0, 0.0)), f.x), mix(grassHash(i + vec2(0.0, 1.0)), grassHash(i + vec2(1.0, 1.0)), f.x), f.y); }",
            "vec2 grassRotate(vec2 p, float a){ float c = cos(a); float s = sin(a); return vec2(p.x * c - p.y * s, p.x * s + p.y * c); }",
          ].join("\n")
        )
        .replace("#include <beginnormal_vertex>", "vec3 objectNormal = vec3(0.0, 1.0, 0.0);")
        .replace(
          "#include <project_vertex>",
          [
            "vec3 origin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;",
            "float size = length(instanceMatrix[0].xyz);",
            "vec2 card = transformed.xy * vec2(0.62, 1.0) * size;",
            "if (aGrass.y > 0.5) card *= vec2(1.0, 1.3);",
            "vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);",
            "vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);",
            "vec3 camFwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);",
            "vec2 fwd = normalize(camFwd.xz + 1e-5);",
            "vec2 perp = vec2(fwd.y, -fwd.x);",
            /* Niko pushes the cards over (roll) and flattens the ones in front of or behind him */
            "vec2 toGrass = origin.xz - player.xz;",
            "float strength = pow(clamp(1.0 - length(toGrass) / 1.5, 0.0, 1.0), 0.9) * step(abs(origin.y - player.y), 1.2);",
            "vec2 dirG = normalize(toGrass + 1e-5);",
            "float pushX = clamp(strength * dot(perp, dirG), -1.0, 1.0);",
            "float pushY = clamp(strength * dot(fwd, dirG), -1.0, 1.0);",
            "card = grassRotate(card, pushX * radians(60.0));",
            "card.y *= cos(pushY * radians(62.7));",
            /* Wind blows one way across the island: broad gust bands, stretched across the wind and broken up by a
               second noise, roll downwind over the meadow, with a small per-blade flutter on top. Every card leans
               downwind a little; a passing gust pushes it over and lightens its tip. */
            "vec2 wind = normalize(vec2(0.82, -0.57));",
            "float along = dot(origin.xz, wind);",
            "float across = dot(origin.xz, vec2(-wind.y, wind.x));",
            "float band = grassNoise(vec2(along * 0.14 - time * 0.5, across * 0.05));",
            "float breakup = grassNoise(origin.xz * 0.09 + wind * time * 0.2 + 31.0);",
            "float gust = smoothstep(0.42, 0.85, band * (0.55 + breakup * 0.9));",
            "float flutter = grassNoise(origin.xz * 0.7 + wind * time * 1.6) - 0.5;",
            "float sway = 0.16 + gust * 0.85 + flutter * (0.18 + gust * 0.2) + sin(time * 2.4 + aGrass.x * 6.283) * 0.04;",
            "vec3 wind3 = vec3(wind.x, 0.0, wind.y);",
            "float onScreen = dot(wind3, camRight);",
            "float intoScreen = dot(wind, fwd);",
            "float bend = sway * radians(40.0);",
            "card = grassRotate(card, -bend * onScreen);",
            "card.y *= 1.0 - (1.0 - cos(bend)) * abs(intoScreen);",
            "vec3 worldPos = origin + camRight * card.x + camUp * card.y;",
            "vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);",
            "gl_Position = projectionMatrix * mvPosition;",
            "vGrass = vec4(position.x + 0.5, position.y, sway * 0.3 * intoScreen, aGrass.y);",
            "vGust = gust;",
            /* Light, shadow and cloud are all taken at the base, so the tuft matches the ground it grows from */
            "transformed = vec3(0.0);",
          ].join("\n")
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D leafTex;\nuniform sampler2D accentTex;\nvarying vec4 vGrass;\nvarying float vGust;")
        .replace(
          "#include <alphatest_fragment>",
          [
            "{",
            "  vec2 leafUv = vGrass.xy;",
            "  leafUv.x = clamp((leafUv.x - 0.5) * (leafUv.y * vGrass.z + 1.0) + 0.5, 0.0, 1.0);",
            "  float leaf = vGrass.w > 0.5 ? texture2D(accentTex, leafUv).a : texture2D(leafTex, leafUv).a;",
            "  if (leaf < 0.5) discard;",
            "  float tip = smoothstep(0.15, 0.95, vGrass.y);",
            "  diffuseColor.rgb *= mix(0.94, 1.1, tip) + vGust * tip * 0.12;",
            "}",
          ].join("\n")
        );
    };
    material.customProgramCacheKey = () => "grass-cards";
    atmos(material);

    const tufts = new THREE.InstancedMesh(geometry, material, cards.length);
    cards.forEach((c, k) => {
      const s = (c.kind ? 0.58 : 0.5) * (0.88 + rand(c.x * 9.7, c.z * 0.3) * 0.24);
      tufts.setMatrixAt(k, at(c.x, c.y - 0.03, c.z, { s }));
      tufts.setColorAt(k, c.colour);
    });
    tufts.receiveShadow = true;
    tufts.frustumCulled = false;
    tufts.name = "grass";
    root.add(tufts);
  }

  /* Floating rocks drift around the island, the way the concept board has them */
  const floaters = [[-21, -12, 9, 1.3], [16, -17, 12, 1], [23, 6, 7, 0.8], [-29, 1, 9, 0.9], [7, -22, 14, 1.1]].map(([u, v, y, s], k) => {
    const [x, z] = uvToXZ(...MAP.lay(u, v));
    const piece = makeBake({ dry: true });
    piece.add(G.rock[k % 3], ISLE.rock, at(0, -0.6, 0, { sx: 1.2, sy: 1.4, sz: 1.1 }));
    piece.add(G.cone, ISLE.rockDeep, at(0, -1.6, 0, { rx: Math.PI, sx: 0.9, sy: 1.6, sz: 0.85 }));
    piece.add(G.oct, ISLE.grass, at(0, 0.05, 0, { sx: 1.05, sy: 0.3, sz: 0.95 }));
    if (k % 2 === 0) piece.put(pines[k % 2], at(0.1, 0.15, 0, { s: 0.5 }));
    const mesh = piece.build(painted);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(s);
    mesh.rotation.y = k;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    root.add(mesh);
    return { mesh, base: y, phase: k * 1.3 };
  });

  /* Water: one big plane. Depth comes from a texture of the terrain under it, giving shallows, deep blue and
     moving foam lines along every shore; the far edge fades out into the sky. */
  const depthData = new Uint8Array(size * size);
  const depthAt = hgrid.map((h) => -h);
  /* Rocks standing in the water get their own shallow halo and foam ring */
  wetRocks.forEach(([x, z, r]) => {
    const [ci, cj] = cellOf(x, z);
    const reach = Math.ceil((r + 2.5) / cell);
    for (let j = Math.max(0, cj - reach); j <= Math.min(size - 1, cj + reach); j += 1)
      for (let i = Math.max(0, ci - reach); i <= Math.min(size - 1, ci + reach); i += 1) {
        const d = Math.hypot(min + (i + 0.5) * cell - x, min + (j + 0.5) * cell - z) - r * 0.8;
        depthAt[j * size + i] = Math.min(depthAt[j * size + i], 0.05 + Math.max(0, d) * 0.8);
      }
  });
  for (let k = 0; k < size * size; k += 1) depthData[k] = Math.round(THREE.MathUtils.clamp(depthAt[k], 0, 4) * 63.75);
  const depthMap = new THREE.DataTexture(depthData, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  depthMap.minFilter = depthMap.magFilter = THREE.LinearFilter;
  depthMap.needsUpdate = true;
  const glslNoise = [
    "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }",
  ].join("\n");
  const waterUniforms = {
    time: { value: 0 },
    depthMap: { value: depthMap },
    mapMin: { value: min },
    mapSpan: { value: span },
    shallow: { value: new THREE.Color(ISLE.shallow) },
    mid: { value: new THREE.Color(ISLE.water) },
    deep: { value: new THREE.Color(ISLE.waterDeep) },
  };
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(170, 170).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: waterUniforms,
      vertexShader: "varying vec3 wp; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); wp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: [
        "uniform float time; uniform sampler2D depthMap; uniform float mapMin; uniform float mapSpan;",
        "uniform vec3 shallow; uniform vec3 mid; uniform vec3 deep; varying vec3 wp;",
        glslNoise,
        "void main(){",
        "  vec2 uv = (wp.xz - mapMin) / mapSpan;",
        "  float inside = smoothstep(0.0, 0.08, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));",
        "  float depth = mix(4.0, texture2D(depthMap, clamp(uv, 0.0, 1.0)).r * 4.0, inside);",
        "  float n = noise(wp.xz * 0.45 + vec2(time * 0.12, time * 0.08));",
        "  float m = noise(wp.xz * 1.3 - vec2(time * 0.2, -time * 0.15));",
        "  vec3 col = mix(shallow, mid, smoothstep(0.05, 1.3, depth + (n - 0.5) * 0.3));",
        "  col = mix(col, deep, smoothstep(1.4, 3.8, depth));",
        "  col += (m - 0.5) * 0.06;",
        "  float shore = 1.0 - smoothstep(0.08, 0.28 + n * 0.22, depth);",
        "  float wave = sin(depth * 7.0 - time * 1.4 + n * 4.0);",
        "  float lines = smoothstep(0.82, 0.93, wave) * (1.0 - smoothstep(0.35, 1.25, depth)) * smoothstep(0.3, 0.6, m + 0.2);",
        "  float glint = smoothstep(0.9, 0.96, noise(wp.xz * 1.6 + vec2(time * 0.5, -time * 0.4))) * smoothstep(0.6, 1.6, depth) * 0.22;",
        "  float foam = max(shore, lines * 0.85);",
        "  col = mix(col, vec3(1.0), clamp(foam + glint, 0.0, 1.0));",
        "  float alpha = mix(0.62, 0.94, smoothstep(0.0, 1.4, depth));",
        "  alpha = max(alpha, foam);",
        "  alpha *= 1.0 - smoothstep(34.0, 52.0, length(wp.xz));",
        "  gl_FragColor = vec4(col, alpha);",
        "}",
      ].join("\n"),
    })
  );
  water.renderOrder = 1;
  water.name = "water";
  root.add(water);

  /* The stream: flat runs of flowing water on each level, and a falling sheet wherever the ground drops */
  const flowUniforms = { time: { value: 0 } };
  const splashes = [];
  {
    const pts = MAP.river.points;
    const samples = [];
    for (let k = 1; k < pts.length; k += 1) {
      const [u0, v0] = pts[k - 1];
      const [u1, v1] = pts[k];
      const len = Math.hypot(u1 - u0, v1 - v0);
      const steps = Math.ceil(len / 0.2);
      for (let s = k === 1 ? 0 : 1; s <= steps; s += 1) {
        const u = lerp(u0, u1, s / steps);
        const v = lerp(v0, v1, s / steps);
        const [x, z] = uvToXZ(u, v);
        const [du, dv] = [(u1 - u0) / len, (v1 - v0) / len];
        samples.push({ x, z, h: MAP.heightAt(x, z), dir: worldDir([du, dv]) });
      }
    }
    const pos = [];
    const uvs = [];
    const fall = [];
    const index = [];
    let run = [];
    let travelled = 0;
    const w = MAP.river.w;
    const quadStrip = (rows, isFall) => {
      const base = pos.length / 3;
      rows.forEach(([l, r, along]) => {
        pos.push(...l, ...r);
        uvs.push(0, along, 1, along);
        fall.push(isFall, isFall);
      });
      for (let k = 0; k < rows.length - 1; k += 1) {
        const a = base + k * 2;
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    };
    const flushRun = () => {
      if (run.length < 2) return;
      const level = Math.max(...run.map((s) => s.h)) + 0.06;
      const rows = run.map((s, k) => {
        const wide = w * (0.9 + MAP.fbm(s.x * 0.5, s.z * 0.5) * 0.3);
        const [px, pz] = [-s.dir[1], s.dir[0]];
        if (k) travelled += Math.hypot(s.x - run[k - 1].x, s.z - run[k - 1].z);
        return [[s.x + px * wide, level, s.z + pz * wide], [s.x - px * wide, level, s.z - pz * wide], travelled];
      });
      quadStrip(rows, 0);
      return level;
    };
    let level = samples[0].h;
    let lastLevel = null;
    for (let k = 0; k < samples.length; k += 1) {
      const s = samples[k];
      if (s.h > level - 0.5) {
        run.push(s);
        continue;
      }
      /* A drop: finish this run, then hang a sheet from its lip down to where the ground settles */
      lastLevel = flushRun() ?? level + 0.06;
      const top = run[run.length - 1] || s;
      let e = k;
      while (e + 1 < samples.length && samples[e + 1].h < samples[e].h - 0.12) e += 1;
      const bottomSample = samples[Math.min(e + 1, samples.length - 1)];
      const floor = Math.max(bottomSample.h, 0) + 0.06;
      const [px, pz] = [-top.dir[1], top.dir[0]];
      const fx = bottomSample.x;
      const fz = bottomSample.z;
      const rows = [];
      const steps = 8;
      const wide = w * 1.05;
      rows.push([[top.x + px * wide, lastLevel, top.z + pz * wide], [top.x - px * wide, lastLevel, top.z - pz * wide], travelled]);
      for (let r = 0; r <= steps; r += 1) {
        const f = r / steps;
        const y = lerp(lastLevel - 0.05, floor, f * f * 0.3 + f * 0.7);
        const out = Math.sin(f * Math.PI) * 0.25;
        const ox = fx + top.dir[0] * out;
        const oz = fz + top.dir[1] * out;
        const spread = wide * (1 + f * 0.25);
        rows.push([[ox + px * spread, y, oz + pz * spread], [ox - px * spread, y, oz - pz * spread], travelled + 0.4 + (lastLevel - y)]);
      }
      quadStrip(rows, 1);
      travelled += 0.4 + (lastLevel - floor);
      splashes.push(new THREE.Vector3(fx + top.dir[0] * 0.3, floor, fz + top.dir[1] * 0.3));
      run = [];
      k = e;
      level = bottomSample.h;
      if (bottomSample.h < 0.05) break;
    }
    flushRun();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("fall", new THREE.Float32BufferAttribute(fall, 1));
    geometry.setIndex(index);
    const stream = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        uniforms: flowUniforms,
        vertexShader: "attribute float fall; varying vec2 vUv; varying float vFall; void main(){ vUv = uv; vFall = fall; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: [
          "uniform float time; varying vec2 vUv; varying float vFall;",
          glslNoise,
          "void main(){",
          "  float speed = mix(1.1, 3.2, vFall);",
          "  float n = noise(vec2(vUv.x * mix(4.0, 9.0, vFall), vUv.y * mix(1.2, 0.7, vFall) - time * speed));",
          "  float streak = smoothstep(0.52, 0.78, n);",
          "  float edge = smoothstep(0.62, 1.0, abs(vUv.x * 2.0 - 1.0));",
          "  vec3 base = mix(vec3(0.36, 0.7, 0.92), vec3(0.62, 0.86, 0.98), vFall);",
          "  vec3 col = mix(base, vec3(1.0), clamp(streak * mix(0.5, 0.9, vFall) + edge * 0.7, 0.0, 1.0));",
          "  float alpha = mix(0.9, 0.86, vFall) * (1.0 - smoothstep(0.9, 1.0, abs(vUv.x * 2.0 - 1.0)) * 0.6);",
          "  gl_FragColor = vec4(col, alpha);",
          "}",
        ].join("\n"),
      })
    );
    stream.renderOrder = 2;
    stream.name = "stream";
    root.add(stream);
  }

  /* White water where each fall lands */
  const splashMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, toneMapped: false });
  const puffs = [];
  splashes.forEach((p, s) => {
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * Math.PI * 2 + s;
      const mesh = new THREE.Mesh(G.ico, splashMat);
      mesh.position.set(p.x + Math.cos(a) * 0.55, p.y + 0.1, p.z + Math.sin(a) * 0.55);
      root.add(mesh);
      puffs.push({ mesh, phase: k * 1.1 + s, size: 0.22 + rand(k, s) * 0.16 });
    }
  });

  /* Bake it all */
  const props = bake.build(paintedProps);
  props.castShadow = true;
  props.receiveShadow = true;
  props.name = "props";
  root.add(props);
  const glows = glowBake.build(glowing);
  if (glows) root.add(glows);

  /* Walk grid: a cell is walkable when it is dry (or decked), not the stream, not next to a drop or a cliff foot
     (stairs cut between cliffs, so they skip that test), and not under a blocker. Paths are A* over it, then pulled straight where the line of sight is clear. */
  const ground = new Float32Array(size * size);
  const walk = new Uint8Array(size * size);
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) ground[j * size + i] = MAP.groundAt(min + (i + 0.5) * cell, min + (j + 0.5) * cell);
  }
  const gAt = (i, j) => (i < 0 || j < 0 || i >= size || j >= size ? -9 : ground[j * size + i]);

  const nav = {
    build(extra = []) {
      for (let j = 0; j < size; j += 1) {
        for (let i = 0; i < size; i += 1) {
          const k = j * size + i;
          const g = ground[k];
          const x = min + (i + 0.5) * cell;
          const z = min + (j + 0.5) * cell;
          const [u, v] = MAP.toUV(x, z);
          let ok = g > -0.12;
          const deck = MAP.platformAt(u, v);
          if (ok && !deck && MAP.riverDist(u, v) < MAP.river.w + 0.3) ok = false;
          const step = sgrid[k] ? 0.65 : 0.5;
          for (let y = -1; ok && y <= 1; y += 1) for (let q = -1; ok && q <= 1; q += 1) if (Math.abs(gAt(i + q, j + y) - g) > step) ok = false;
          if (!sgrid[k]) for (let y = -2; ok && y <= 2; y += 1) for (let q = -2; ok && q <= 2; q += 1) if (gAt(i + q, j + y) - g > 1.0) ok = false;
          walk[k] = ok ? 1 : 0;
        }
      }
      [...blockers, ...extra].forEach(({ x, z, r }) => {
        const [ci, cj] = cellOf(x, z);
        const reach = Math.ceil(r / cell) + 1;
        for (let y = -reach; y <= reach; y += 1) {
          for (let q = -reach; q <= reach; q += 1) {
            const i = ci + q;
            const j = cj + y;
            if (i < 0 || j < 0 || i >= size || j >= size) continue;
            if (Math.hypot(min + (i + 0.5) * cell - x, min + (j + 0.5) * cell - z) < r + 0.2) walk[j * size + i] = 0;
          }
        }
      });
    },
    walkable(x, z) {
      const [i, j] = cellOf(x, z);
      return i >= 0 && j >= 0 && i < size && j < size && walk[j * size + i] === 1;
    },
    nearest(x, z, reach = 14) {
      const [ci, cj] = cellOf(x, z);
      let best = null;
      let bestD = Infinity;
      for (let y = -reach; y <= reach; y += 1) {
        for (let q = -reach; q <= reach; q += 1) {
          const i = ci + q;
          const j = cj + y;
          if (i < 0 || j < 0 || i >= size || j >= size || !walk[j * size + i]) continue;
          const d = q * q + y * y;
          if (d < bestD) {
            bestD = d;
            best = [i, j];
          }
        }
      }
      return best && new THREE.Vector3(min + (best[0] + 0.5) * cell, ground[best[1] * size + best[0]], min + (best[1] + 0.5) * cell);
    },
    clear(ax, az, bx, bz) {
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.2);
      for (let s = 1; s <= steps; s += 1) if (!nav.walkable(lerp(ax, bx, s / steps), lerp(az, bz, s / steps))) return false;
      return true;
    },
    path(from, to) {
      const start = nav.walkable(from.x, from.z) ? from : nav.nearest(from.x, from.z);
      const goal = nav.walkable(to.x, to.z) ? to : nav.nearest(to.x, to.z);
      if (!start || !goal) return null;
      const [si, sj] = cellOf(start.x, start.z);
      const [gi, gj] = cellOf(goal.x, goal.z);
      const s = sj * size + si;
      const g = gj * size + gi;
      const cost = new Float32Array(size * size).fill(Infinity);
      const came = new Int32Array(size * size).fill(-1);
      const closed = new Uint8Array(size * size);
      const heap = [];
      const push = (k, f) => {
        heap.push([f, k]);
        let n = heap.length - 1;
        while (n > 0) {
          const p = (n - 1) >> 1;
          if (heap[p][0] <= heap[n][0]) break;
          [heap[p], heap[n]] = [heap[n], heap[p]];
          n = p;
        }
      };
      const pop = () => {
        const top = heap[0];
        const last = heap.pop();
        if (heap.length) {
          heap[0] = last;
          let n = 0;
          for (;;) {
            const l = n * 2 + 1;
            const r = l + 1;
            let m = n;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === n) break;
            [heap[m], heap[n]] = [heap[n], heap[m]];
            n = m;
          }
        }
        return top[1];
      };
      const guess = (i, j) => {
        const dx = Math.abs(i - gi);
        const dy = Math.abs(j - gj);
        return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
      };
      cost[s] = 0;
      push(s, guess(si, sj));
      let found = s === g;
      while (heap.length && !found) {
        const k = pop();
        if (closed[k]) continue;
        closed[k] = 1;
        if (k === g) {
          found = true;
          break;
        }
        const i = k % size;
        const j = (k / size) | 0;
        for (let y = -1; y <= 1; y += 1) {
          for (let q = -1; q <= 1; q += 1) {
            if (!q && !y) continue;
            const ni = i + q;
            const nj = j + y;
            if (ni < 0 || nj < 0 || ni >= size || nj >= size) continue;
            const nk = nj * size + ni;
            if (!walk[nk] || closed[nk]) continue;
            if (q && y && (!walk[j * size + ni] || !walk[nj * size + i])) continue;
            const c = cost[k] + (q && y ? 1.414 : 1);
            if (c < cost[nk]) {
              cost[nk] = c;
              came[nk] = k;
              push(nk, c + guess(ni, nj));
            }
          }
        }
      }
      if (!found) return null;
      const cells = [];
      for (let k = g; k !== -1 && k !== s; k = came[k]) cells.push(k);
      cells.reverse();
      const points = cells.map((k) => new THREE.Vector3(min + ((k % size) + 0.5) * cell, 0, min + (((k / size) | 0) + 0.5) * cell));
      if (points.length) points[points.length - 1].set(goal.x, 0, goal.z);
      else points.push(new THREE.Vector3(goal.x, 0, goal.z));
      const out = [];
      let anchor = new THREE.Vector3(from.x, 0, from.z);
      for (let k = 0; k < points.length; k += 1) {
        const next = points[k + 1];
        if (next && nav.clear(anchor.x, anchor.z, next.x, next.z)) continue;
        out.push(points[k]);
        anchor = points[k];
      }
      out.forEach((p) => (p.y = MAP.groundAt(p.x, p.z)));
      return out;
    },
  };

  /* Everything that moves on its own */
  const update = (dt, time, robot) => {
    waterUniforms.time.value = time;
    flowUniforms.time.value = time;
    swayUniforms.time.value = time;
    beamMat.uniforms.time.value = time;
    atmosTime.value = time;
    if (robot) player.copy(robot);
    boats.forEach((b) => {
      b.group.position.y = Math.sin(time * 1.1 + b.phase) * 0.06 - 0.05;
      b.group.rotation.set(Math.sin(time * 0.7 + 1 + b.phase) * 0.02, b.ry + Math.sin(time * 0.3 + b.phase) * 0.03, Math.sin(time * 0.9 + b.phase) * 0.035, "YXZ");
    });
    floaters.forEach((f) => (f.mesh.position.y = f.base + Math.sin(time * 0.6 + f.phase) * 0.35));
    puffs.forEach((p) => p.mesh.scale.setScalar(p.size * (0.75 + 0.35 * Math.sin(time * 6 + p.phase))));
    fires.forEach((flame) => {
      flame.scale.set(1 + Math.sin(time * 13) * 0.08, 1 + Math.sin(time * 9.7) * 0.14, 1 + Math.cos(time * 11) * 0.08);
      flame.rotation.y = time * 2;
    });
  };

  return {
    root,
    terrain,
    pick: [terrain, props],
    water,
    beam,
    beamMat,
    shrine,
    lanterns,
    groundAt: MAP.groundAt,
    nav,
    blockers,
    spot: (name) => {
      const [x, z] = uvToXZ(...MAP.spots[name]);
      return new THREE.Vector3(x, MAP.groundAt(x, z), z);
    },
    fromUV: (u, v) => {
      const [x, z] = uvToXZ(u, v);
      return new THREE.Vector3(x, MAP.groundAt(x, z), z);
    },
    update,
  };
}
