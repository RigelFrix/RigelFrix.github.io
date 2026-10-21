/* The main island, built in code from the layout in world-map.js: terraced terrain with rock-column cliffs, a shaded
   sea with shore foam, a stream with two waterfalls, stairs and ruins up to the Star Shrine, a plateau camp, the
   beach dock and boat, trees, rocks and grass. Static pieces are baked into a few vertex-coloured meshes. Also owns
   the walk grid Niko paths on. */

import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import * as MAP from "./world-map.js";
import { places as groundPlaces } from "./world-ground.js";

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

/* One wind for the whole island: broad gust bands, stretched across the wind and broken up by a second noise, roll
   along WIND_DIR (world xz). Grass and tree crowns both lean with windGust, so a gust visibly crosses the meadow and
   then the trees beyond it. windTime is the wind phase from world-climate.js, integrated from the wind strength, so
   the sway speeds up and calms down smoothly as the weather changes instead of jumping. */
export const windTime = { value: 0 };
export const windMul = { value: 1 };
/* Rain intensity 0–1: tip/leaf patter when drops are landing (set from climate). */
export const rainAmt = { value: 0 };
/* Weather on every lit surface: wet ground darkens and cools, fog pulls colour toward the sky */
export const weatherWet = { value: 0 };
export const weatherFog = { value: 0 };
export const weatherFogColor = { value: new THREE.Color(0.62, 0.7, 0.8) };
const WIND_GLSL = [
  "float windHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
  "float windNoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);",
  "  return mix(mix(windHash(i), windHash(i + vec2(1.0, 0.0)), f.x), mix(windHash(i + vec2(0.0, 1.0)), windHash(i + vec2(1.0, 1.0)), f.x), f.y); }",
  "const vec2 WIND_DIR = vec2(0.8211, -0.5708);",
  "float windGust(vec2 p, float t){",
  "  float along = dot(p, WIND_DIR);",
  "  float across = dot(p, vec2(-WIND_DIR.y, WIND_DIR.x));",
  "  float band = windNoise(vec2(along * 0.14 - t * 0.5, across * 0.05));",
  "  float breakup = windNoise(p * 0.09 + WIND_DIR * t * 0.2 + 31.0);",
  "  return smoothstep(0.42, 0.85, band * (0.55 + breakup * 0.9));",
  "}",
].join("\n");

/* Tree and bush crowns bend downwind: aSway = (weight, base x, base z), baked per vertex by makeBake.put, so the
   whole crown follows the gust at its trunk and its top moves most. On top of the lean a wave rolls downwind through
   the crown, so it breathes instead of moving as one block, and with `leaves` every leaf card stirs a little on its
   own (aLeaf from cardShell). Everything stays slow and small: fast or large motion read as someone hitting the tree,
   and big bends pulled the low poly shapes apart. Storms lean harder; floors keep crowns out of the trunk and ground. */
const windSway = (material, leaves = false) => {
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey?.() || "";
  if (leaves) material.defines = { ...material.defines, LEAF_FLUTTER: "" };
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    shader.uniforms.windTime = windTime;
    shader.uniforms.windMul = windMul;
    shader.uniforms.rainAmt = rainAmt;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nuniform float windTime;\nuniform float windMul;\nuniform float rainAmt;\nattribute vec3 aSway;\nattribute vec2 aLeaf;\n${WIND_GLSL}`)
      .replace(
        "#include <begin_vertex>",
        [
          "#include <begin_vertex>",
          "if (aSway.x > 0.0) {",
          "  float w = 1.0 + (min(windMul, 3.5) - 1.0) * 0.72;",
          "  float gust = windGust(aSway.yz, windTime * 0.58) * w;",
          "  float breathe = sin(windTime * 0.88 + aSway.y * 0.37 + aSway.z * 0.23) * 0.12 * w;",
          "  float lean = (0.2 * w + gust * 0.52 + breathe) * aSway.x;",
          "  lean = min(lean, aSway.x * 1.05);",
          "  float wave = windTime - dot(transformed.xz, WIND_DIR) * 0.55 - transformed.y * 0.35;",
          "  vec3 roll = vec3(sin(wave), sin(wave * 1.21 + 1.3) * 0.4, cos(wave * 0.87 + 0.4)) * aSway.x * (0.07 + w * 0.04);",
          "  float baseY = transformed.y;",
          "  transformed.xz += WIND_DIR * lean;",
          "  transformed.y -= lean * lean * 0.12;",
          "  transformed += roll;",
          "  transformed.y = max(transformed.y, baseY - aSway.x * 0.28);",
          "  #ifdef LEAF_FLUTTER",
          "  float flap = sin(windTime * (2.4 + aLeaf.y * 1.3) + aLeaf.y * 40.0) * (0.045 + gust * 0.09) * w;",
          "  flap += sin(windTime * 15.0 + aLeaf.y * 55.0) * rainAmt * 0.035 * aLeaf.x;",
          "  flap = clamp(flap, -0.24, 0.24);",
          "  transformed += objectNormal * flap * aLeaf.x;",
          "  #endif",
          "}",
        ].join("\n")
      );
  };
  material.customProgramCacheKey = () => `${key}-sway${leaves ? "-leaf" : ""}v6`;
  return material;
};

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
const makeBake = ({ dry = false, split = false } = {}) => {
  const list = [];
  /* split keeps every piece as its own object (the editor export), with the matrix as the object's transform */
  const nodes = [];
  let label = "piece";
  let count = 0;
  let bucket = null;
  const adopt = (g, matrix, leaf = false) => {
    const mesh = new THREE.Mesh(g);
    mesh.userData.leaf = leaf;
    matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.name = `${label}-${count++}`;
    (bucket || nodes).push(mesh);
    return mesh;
  };
  return {
    split,
    setLabel(name) {
      label = name;
      count = 0;
    },
    begin() {
      bucket = [];
    },
    /* `recenter` puts the group's pivot on the pieces, so the whole thing moves from where it stands */
    end(recenter = false) {
      const group = new THREE.Group();
      group.name = `${label}-${count++}`;
      if (recenter && bucket.length) {
        const box = new THREE.Box3();
        bucket.forEach((mesh) => box.expandByPoint(mesh.position));
        const centre = box.getCenter(new THREE.Vector3());
        bucket.forEach((mesh) => mesh.position.sub(centre));
        group.position.copy(centre);
      }
      bucket.forEach((mesh) => group.add(mesh));
      nodes.push(group);
      bucket = null;
      return group;
    },
    discard() {
      nodes.pop();
    },
    add(geometry, color, matrix, shade = 0, grade = null) {
      if (geometry.userData.sized) [geometry, matrix] = sizedPiece(geometry, matrix);
      const g = paint(geometry, color, shade);
      if (grade) gradeY(g, ...grade);
      g.applyMatrix4(matrix);
      if (WEATHER[color]) weather(g, WEATHER[color], list.length + nodes.length, dry);
      if (split) {
        g.applyMatrix4(new THREE.Matrix4().copy(matrix).invert());
        adopt(g, matrix);
      } else list.push(g);
    },
    /* A pre-coloured model; `vary` nudges its whole colour so copies are not identical; `sway` lets its upper part
       bend in the wind (world units of lean at the very top in a full gust, before the per-copy scale) */
    put(geometry, matrix, vary = 0, seed = list.length, sway = 0, leaf = false) {
      const g = geometry.clone();
      if (split) {
        if (vary) {
          const c = g.attributes.color;
          const k = 1 + (MAP.rand(seed, 3.3) - 0.5) * vary;
          const warmth = (MAP.rand(seed, 8.1) - 0.5) * vary * 0.8;
          for (let i = 0; i < c.count; i += 1) c.setXYZ(i, c.getX(i) * k * (1 + warmth), c.getY(i) * k, c.getZ(i) * k * (1 - warmth));
        }
        adopt(g, matrix, leaf || geometry.userData.leaf);
        return;
      }
      if (sway) {
        if (!geometry.userData.swayBox) g.computeBoundingBox();
        const { min: lo, max: hi } = geometry.userData.swayBox || g.boundingBox;
        const tall = hi.y - lo.y;
        const scale = new THREE.Vector3().setFromMatrixScale(matrix).y;
        const base = new THREE.Vector3().setFromMatrixPosition(matrix);
        const p = g.attributes.position;
        const weights = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i += 1) {
          const t = THREE.MathUtils.clamp((p.getY(i) - lo.y - tall * 0.3) / (tall * 0.7), 0, 1);
          weights.set([sway * scale * t * t, base.x, base.z], i * 3);
        }
        g.setAttribute("aSway", new THREE.BufferAttribute(weights, 3));
      }
      g.applyMatrix4(matrix);
      if (vary) {
        const c = g.attributes.color;
        const k = 1 + (MAP.rand(seed, 3.3) - 0.5) * vary;
        const warmth = (MAP.rand(seed, 8.1) - 0.5) * vary * 0.8;
        for (let i = 0; i < c.count; i += 1) c.setXYZ(i, c.getX(i) * k * (1 + warmth), c.getY(i) * k, c.getZ(i) * k * (1 - warmth));
      }
      list.push(g);
    },
    /* `cell` (world units) merges by area instead of into one mesh: each square of the island becomes its own mesh,
       so the camera and the shadow camera skip the squares they can't see, and nearer squares draw first and hide
       what is behind them. `reach` grows each square's bounds by how far wind sway can move its vertices. */
    build(material, { cell = 0, reach = 0 } = {}) {
      if (split) {
        const group = new THREE.Group();
        group.name = "props";
        nodes.forEach((node) => group.add(node));
        nodes.length = 0;
        return group;
      }
      if (!list.length) return null;
      [["aSway", 3], ["aLeaf", 2]].forEach(([name, n]) => {
        if (list.some((g) => g.attributes[name])) list.forEach((g) => g.attributes[name] || g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * n), n)));
      });
      const merge = (pieces) => {
        const merged = mergeGeometries(pieces);
        merged.computeBoundingSphere();
        merged.boundingSphere.radius += reach;
        return new THREE.Mesh(merged, material);
      };
      let result;
      if (!cell) result = merge(list);
      else {
        const cells = new Map();
        const centre = new THREE.Vector3();
        for (const g of list) {
          if (!g.boundingBox) g.computeBoundingBox();
          g.boundingBox.getCenter(centre);
          const key = `${Math.floor(centre.x / cell)},${Math.floor(centre.z / cell)}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(g);
        }
        result = new THREE.Group();
        for (const [key, pieces] of cells) {
          const mesh = merge(pieces);
          mesh.name = `cell ${key}`;
          result.add(mesh);
        }
      }
      list.forEach((g) => g.dispose());
      list.length = 0;
      return result;
    },
  };
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
/* Keeps a built-in geometry's own smooth normals, in the same attribute layout as everything else in the bakes */
const plain = (geometry, warp) => {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  Object.keys(g.attributes).forEach((name) => name !== "position" && name !== "normal" && g.deleteAttribute(name));
  if (warp) {
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 1) {
      warp(v.fromBufferAttribute(p, i));
      p.setXYZ(i, v.x, v.y, v.z);
    }
  }
  return g;
};
/* A weathered boulder: a smooth sphere pressed into a few broad lumps, flatter underneath */
const boulder = (seed, lumps = 0.3) =>
  smoothGeo(new THREE.IcosahedronGeometry(1, 1), (v) => {
    const n = v.clone().normalize();
    const wave = Math.sin(n.x * 2.3 + seed) * Math.sin(n.y * 1.9 + seed * 1.3) * Math.sin(n.z * 2.1 + seed * 0.7);
    v.multiplyScalar(1 + wave * lumps + (hash3(n.x, n.y, n.z + seed) - 0.5) * lumps * 0.5);
    if (v.y < 0) v.y *= 0.7;
  });
const combine = (parts) => {
  const merged = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return merged;
};
/* Soft minimum of plane distances: flat cut faces where one plane is nearest, rounded bevels where two meet */
const softMin = (values, bevel) => {
  const low = Math.min(...values);
  let sum = 0;
  values.forEach((d) => (sum += Math.exp(-(d - low) / bevel)));
  return low - bevel * Math.log(sum);
};
/* Chiselled stone after sampleModels/stylized_low-poly_stone.glb: a fine sphere pulled in onto a few random cut
   planes, so it reads as big flat faces joined by soft bevels instead of triangles. Flatter underneath. */
const chisel = (seed, faces = 9, detail = 3, bevel = 0.05) => {
  const planes = [];
  for (let k = 0; k < faces; k += 1) {
    const y = 1 - (2 * (k + 0.5)) / faces;
    const r = Math.sqrt(1 - y * y);
    const a = k * 2.39996 + seed * 1.7;
    const n = new THREE.Vector3(
      Math.cos(a) * r + (hash3(k, seed, 1) - 0.5) * 0.45,
      y * 1.1 + (hash3(k, seed, 2) - 0.5) * 0.35,
      Math.sin(a) * r + (hash3(k, seed, 3) - 0.5) * 0.45
    ).normalize();
    planes.push([n, 0.84 + hash3(seed, k, 4) * 0.24]);
  }
  planes.push([new THREE.Vector3(0, -1, 0), 0.62]);
  return smoothGeo(new THREE.IcosahedronGeometry(1, detail), (v) => {
    const d = v.clone().normalize();
    const hits = planes.map(([n, dist]) => {
      const c = d.dot(n);
      return c > 0.03 ? dist / c : 40;
    });
    v.copy(d).multiplyScalar(Math.min(1.5, softMin(hits, bevel)));
  });
};
/* A stone cluster like the reference: one tall block leaning on a smaller one */
const stoneCluster = (seed) => {
  const big = chisel(seed, 9).applyMatrix4(at(0, 0, 0, { sx: 0.8, sy: 1, sz: 0.7 }));
  const small = chisel(seed + 7, 8).applyMatrix4(at(0.72, -0.35, 0.18, { ry: seed, s: 0.5 }));
  return combine([big, small]);
};
/* Pieces built at their real size, so bevels stay even instead of stretching with the piece's scale. `sized(x, y, z)`
   builds one; sizedPiece swaps a scaled unit piece for the real-size one with the scale taken out of its matrix. */
const sizedCache = new Map();
const _mp = new THREE.Vector3();
const _mq = new THREE.Quaternion();
const _ms = new THREE.Vector3();
const sizedPiece = (geometry, matrix) => {
  matrix.decompose(_mp, _mq, _ms);
  const [x, y, z] = [_ms.x, _ms.y, _ms.z].map((v) => Math.max(0.01, Math.round(Math.abs(v) * 50) / 50));
  const key = `${geometry.uuid}:${x},${y},${z}`;
  if (!sizedCache.has(key)) sizedCache.set(key, geometry.userData.sized(x, y, z));
  return [sizedCache.get(key), new THREE.Matrix4().compose(_mp, _mq, _ms.set(1, 1, 1))];
};
const sized = (geometry, build) => {
  geometry.userData.sized = build;
  return geometry;
};
/* Basalt column: a few flat sides with soft corners and a rounded top rim, sized to the real column */
const basalt = (seed) => {
  const sides = [];
  const count = 5 + (seed % 2);
  for (let k = 0; k < count; k += 1) sides.push([((k + (hash3(k, seed, 5) - 0.5) * 0.45) / count) * Math.PI * 2, 0.9 + hash3(seed, k, 6) * 0.14]);
  const tilt = [(hash3(seed, 1, 7) - 0.5) * 0.2, (hash3(seed, 2, 7) - 0.5) * 0.2];
  return sized(new THREE.BoxGeometry(), (rx, h, rz) => {
    const b = Math.min(0.22, rx * 0.22, h * 0.2);
    const top = h / 2;
    const profile = [
      [0, -top],
      [1, -top],
      [1, top - b * 1.6],
      [1 - (b * 0.35) / rx, top - b * 0.55],
      [1 - b / rx, top],
      [0, top],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    return smoothGeo(new THREE.LatheGeometry(profile, 24), (v) => {
      const ang = Math.atan2(v.z, v.x);
      const m = softMin(
        sides.map(([a, d]) => {
          const c = Math.cos(ang - a);
          return c > 0.03 ? d / c : 40;
        }),
        0.045
      );
      v.x *= m * rx;
      v.z *= m * rz;
      if (v.y > top - b * 2) v.y += (v.x * tilt[0] + v.z * tilt[1]) * Math.min(1, rx);
    });
  });
};
/* Soft-edged shapes everywhere, so stone, wood and ruins read as rounded painted forms instead of hard boxes */
const G = {
  box: sized(new THREE.BoxGeometry(), (x, y, z) => plain(new RoundedBoxGeometry(x, y, z, 1, Math.min(0.06, Math.min(x, y, z) * 0.22)))),
  hex: plain(new THREE.CylinderGeometry(1, 1, 1, 9)),
  oct: plain(new THREE.CylinderGeometry(1, 1, 1, 14)),
  cone: facet(new THREE.ConeGeometry(1, 1, 7)),
  ico: facet(new THREE.IcosahedronGeometry(1, 0), 0.3),
  blob: [0, 1, 2].map((seed) => boulder(seed * 3.1, 0.14)),
  rock: [0, 1, 2].map((seed) => chisel(seed * 3 + 1)),
  stones: [0, 1].map((seed) => stoneCluster(seed * 5 + 2)),
  column: [0, 1, 2, 3].map((seed) => basalt(seed)),
  slab: [0, 1, 2].map((seed) =>
    sized(new THREE.BoxGeometry(), (x, y, z) => {
      const jitter = Math.min(x, y, z) * 0.06;
      return plain(new RoundedBoxGeometry(x, y, z, 2, Math.min(0.12, Math.min(x, y, z) * 0.2)), (v) => {
        v.x += (hash3(Math.round(v.y * 4), seed, 1) - 0.5) * jitter;
        v.z += (hash3(Math.round(v.y * 4), seed, 2) - 0.5) * jitter;
      });
    })
  ),
  /* Square frustums (top radius / bottom radius), edges along the local axes */
  taper: facet(new THREE.CylinderGeometry(0.72, 1, 1, 4, 1).rotateY(Math.PI / 4)),
  flare: facet(new THREE.CylinderGeometry(1, 0.62, 1, 4, 1).rotateY(Math.PI / 4)),
  peak: facet(new THREE.CylinderGeometry(0.05, 1, 1, 4, 1).rotateY(Math.PI / 4)),
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
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* Foliage, after sampleModels/stylized_bush.glb: every bush and tree is a dark core shape wrapped in a shell of
   leaf cards. One atlas, three tiles: a sprig of small rounded leaves (bushes), a needle spray (pines) and three
   twigs of tiny leaves (round trees, whose copies are scaled up more, so their leaves are drawn smaller). Cards take
   the core's normal, so each mass shades as one soft ball; leaves are sized from Niko (2.5 units tall): a leaf on a
   bush or a tree is about a thirtieth of his height. */
const LEAF_TILE = 0;
const NEEDLE_TILE = 1;
const TWIG_TILE = 2;
const TILES = 3;
const foliageTexture = () => {
  const W = 128;
  const data = new Uint8Array(W * TILES * W * 4);
  /* Leaves alternate up a stem and close in toward its tip: [base x, base y, angle from vertical, length, half width];
     stems are [base x, base y, angle, length] */
  const sprig = (bx, by, angle, stem, count, len, half, seed, leaves, stems) => {
    stems.push([bx, by, angle, stem]);
    for (let k = 0; k < count; k += 1) {
      const t = (k + 0.5) / count;
      const side = k % 2 ? 1 : -1;
      const x = bx + Math.sin(angle) * stem * t * 0.92;
      const y = by + Math.cos(angle) * stem * t * 0.92;
      leaves.push([x, y, angle + side * (1.15 - t * 0.95) + (hash3(k, seed, 2) - 0.5) * 0.25, len * (1 - t * 0.18), half]);
    }
  };
  const bushLeaves = [];
  const bushStems = [];
  sprig(0.5, 0.04, 0, 0.62, 13, 0.34, 0.09, 1, bushLeaves, bushStems);
  const twigLeaves = [];
  const twigStems = [];
  [[-0.55, 0.6], [0.55, 0.6], [0, 0.82]].forEach(([angle, stem], j) => sprig(0.5, 0.04, angle, stem, 9, 0.17, 0.052, j + 3, twigLeaves, twigStems));
  const needles = [];
  for (let k = 0; k < 22; k += 1) {
    const s = 0.06 + (k / 21) * 0.84;
    needles.push([s, k % 2 ? 1 : -1, 0.42 * (1 - s * 0.6)]);
  }
  /* Which leaf covers (fx, fy) on top, and where on it: returns a shade or null */
  const leafAt = (leaves, stems) => (fx, fy) => {
    for (let i = leaves.length - 1; i >= 0; i -= 1) {
      const [bx, by, a, len, half] = leaves[i];
      const dx = fx - bx;
      const dy = fy - by;
      const s = (dx * Math.sin(a) + dy * Math.cos(a)) / len;
      const w = (dx * Math.cos(a) - dy * Math.sin(a)) / half;
      if (s <= 0 || s >= 1) continue;
      const edge = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.85)), 0.55);
      if (Math.abs(w) >= edge) continue;
      const rim = Math.abs(w) / edge > 0.82 ? 0.84 : 1;
      const rib = Math.abs(w) < 0.08 && s < 0.8 ? 0.9 : 1;
      return (0.74 + s * 0.26 + (i % 3) * 0.03) * rim * rib;
    }
    for (const [bx, by, a, len] of stems) {
      const dx = fx - bx;
      const dy = fy - by;
      const s = dx * Math.sin(a) + dy * Math.cos(a);
      if (s > 0 && s < len && Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) < 0.012) return 0.6;
    }
    return null;
  };
  const tiles = [leafAt(bushLeaves, bushStems), null, leafAt(twigLeaves, twigStems)];
  const needleAt = (fx, fy) => {
    const dx = fx - 0.5;
    if (Math.abs(dx) < 0.03 && fy < 0.95) return 0.72;
    for (const [s, side, len] of needles) {
      const t = (dx * side) / len;
      if (t <= -0.02 || t >= 1) continue;
      const along = fy - (s + t * len * 0.6);
      if (Math.abs(along) < 0.05 * (1 - t * 0.55)) return 0.8 + t * 0.2;
    }
    return null;
  };
  tiles[NEEDLE_TILE] = needleAt;
  for (let py = 0; py < W; py += 1) {
    for (let px = 0; px < W * TILES; px += 1) {
      const at = tiles[Math.floor(px / W)];
      let cover = 0;
      for (let s = 0; s < 4; s += 1) if (at(((px % W) + (s % 2) * 0.5 + 0.25) / W, (py + (s >> 1) * 0.5 + 0.25) / W) != null) cover += 0.25;
      const shade = at(((px % W) + 0.5) / W, (py + 0.5) / W) ?? 0.8;
      data.set([255 * shade, 255 * shade, 255 * shade, cover * 255], (py * W * TILES + px) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, W * TILES, W, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
};

/* Collects leaf cards into one geometry: position, the core's normal, colour, atlas uv, and aLeaf = (how far up the
   card, in world units, so the tip flutters and the base stays; a random phase) */
const cardShell = () => {
  const pos = [];
  const nrm = [];
  const col = [];
  const uv = [];
  const flap = [];
  const out = new THREE.Color();
  const side = new THREE.Vector3();
  return {
    /* A card standing on `centre`, its leaves pointing along `tip`, facing `normal` */
    card(centre, normal, tip, size, colour, tile) {
      side.crossVectors(tip, normal).normalize().multiplyScalar(size / 2);
      const base = centre.clone().addScaledVector(tip, -size * 0.3);
      const end = base.clone().addScaledVector(tip, size);
      const corners = [base.clone().sub(side), base.clone().add(side), end.clone().add(side), end.clone().sub(side)];
      const u0 = tile / TILES;
      const u1 = (tile + 1) / TILES;
      const uvs = [[u0, 0], [u1, 0], [u1, 1], [u0, 1]];
      out.copy(colour);
      const phase = hash3(centre.x, centre.y, centre.z);
      [0, 1, 2, 0, 2, 3].forEach((i) => {
        pos.push(corners[i].x, corners[i].y, corners[i].z);
        nrm.push(normal.x, normal.y, normal.z);
        col.push(out.r, out.g, out.b);
        uv.push(...uvs[i]);
        flap.push(i > 1 ? size : 0, phase);
      });
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute("aLeaf", new THREE.Float32BufferAttribute(flap, 2));
      return g;
    },
  };
};
const pickColour = (stops, t, out = new THREE.Color()) => {
  const k = THREE.MathUtils.clamp(t, 0, 0.9999) * (stops.length - 1);
  return out.set(stops[Math.floor(k)]).lerp(new THREE.Color(stops[Math.floor(k) + 1]), k - Math.floor(k));
};
const UP = V(0, 1, 0);
/* Leaves pointing down the surface and a little out, like shingles; a random roll breaks the pattern */
const shingle = (normal, roll) => {
  const down = UP.clone().addScaledVector(normal, -normal.y);
  if (down.lengthSq() < 0.02) down.set(Math.cos(roll), 0, Math.sin(roll));
  down.normalize().negate();
  down.applyAxisAngle(normal, (roll % 1) - 0.5);
  return down.multiplyScalar(0.85).addScaledVector(normal, 0.35).normalize();
};
/* Cover an ellipsoid (centre c, radii r) with leaf cards, `size` across, lighter toward its top */
const leafBall = (shell, c, r, size, stops, seed, tile = LEAF_TILE, from = -0.55) => {
  const area = 4 * Math.PI * Math.pow((r.x * r.y + r.y * r.z + r.x * r.z) / 3, 1) * (1 - from) * 0.5;
  const count = Math.max(8, Math.round((area * 1.1) / (size * size * 0.5)));
  const colour = new THREE.Color();
  for (let k = 0; k < count; k += 1) {
    const y = 1 - (k + 0.5) / count * (1 - from);
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const a = k * 2.39996 + seed * 1.7;
    const d = V(Math.cos(a) * ring, y, Math.sin(a) * ring);
    const centre = V(c.x + d.x * r.x, c.y + d.y * r.y, c.z + d.z * r.z);
    const normal = V(d.x / r.x, d.y / r.y, d.z / r.z).normalize();
    const jitter = hash3(k, seed, 3);
    const lift = Math.pow(THREE.MathUtils.clamp((y - from) / (1 - from), 0, 1), 0.9);
    pickColour(stops, 0.1 + lift * 0.82 + (jitter - 0.5) * 0.16, colour);
    shell.card(centre, normal, shingle(normal, jitter * 6.283 + seed), size * (0.85 + hash3(seed, k, 5) * 0.3), colour, tile);
  }
};
/* A dark core under the leaves, so gaps between cards read as depth instead of holes */
const coreBall = (c, r, stops, seed) =>
  rampPaint(
    smoothGeo(new THREE.IcosahedronGeometry(1, 1), (v) => {
      const bump = 1 + (hash3(v.x, v.y, v.z + seed) - 0.5) * 0.12;
      v.set(c.x + v.x * r.x * 0.9 * bump, c.y + Math.max(v.y, -0.6) * r.y * 0.9 * bump, c.z + v.z * r.z * 0.9 * bump);
    }),
    stops,
    (v) => (v.y - c.y + r.y) / (r.y * 2)
  );
/* Shared bounding box for a model's core and leaves, so both sway together in the wind */
const swayPair = (core, leaves) => {
  core.computeBoundingBox();
  leaves.userData.swayBox = core.userData.swayBox = core.boundingBox.clone().union((leaves.computeBoundingBox(), leaves.boundingBox));
  return { core, leaves };
};

const LEAF = ["#2b5a30", "#3f7b38", "#5f9f40", "#86c34b", "#b4df68"];
const LEAF_CORE = ["#163a22", "#1f4a2a", "#2b5c31"];
const NEEDLE = ["#285c3c", "#367849", "#4f9551", "#76b65e", "#a2d277"];
const NEEDLE_CORE = ["#1a4430", "#225236", "#2d6340"];
const BARK = ["#5a3b2a", "#7d5236", "#a07250"];
const BUSH_LEAF = ["#2b5c2f", "#40803a", "#66a843", "#90cc4e", "#b9e36c"];

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

/* Round tree after sampleModels/low_poly_tree.glb: a flared forked trunk under a crown of leafy balls */
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
  const shell = cardShell();
  crown.forEach(([x, y, z, r], k) => leafBall(shell, V(x, y, z), V(r, r * 0.86, r), 0.3, LEAF, seed * 7 + k, TWIG_TILE));
  const core = gradeY(
    combine([
      limb(V(0, -0.1, 0), fork, 0.2, 0.13, 0.9),
      ...tips.map((t) => limb(fork, t, 0.11, 0.05)),
      ...crown.map(([x, y, z, r], k) => coreBall(V(x, y, z), V(r, r * 0.86, r), LEAF_CORE, seed * 7 + k)),
    ]),
    0.6,
    1.08
  );
  const pair = swayPair(core, shell.build());
  pair.core.userData.kit = "tree-round";
  return pair;
};

/* A pine: a bare trunk and four drooping tiers of needle sprays over dark cones */
const pineGeo = (seed) => {
  const tiers = [
    [0.95, 1.05, 1.0],
    [1.65, 0.84, 0.92],
    [2.25, 0.62, 0.82],
    [2.82, 0.4, 0.78],
  ];
  const shell = cardShell();
  const colour = new THREE.Color();
  tiers.forEach(([y, r, h], k) => {
    const rows = 3;
    for (let row = 0; row < rows; row += 1) {
      const t = 0.4 + (row / (rows - 1)) * 0.62;
      const around = Math.max(6, Math.round(t * r * 17));
      for (let i = 0; i < around; i += 1) {
        const ang = ((i + row * 0.5) / around) * Math.PI * 2 + seed + k;
        const centre = V(Math.cos(ang) * r * t, y + h / 2 - h * t, Math.sin(ang) * r * t);
        const normal = V(Math.cos(ang) * h, r, Math.sin(ang) * h).normalize();
        const slope = V(Math.cos(ang) * r, -h, Math.sin(ang) * r).normalize();
        const tip = slope.multiplyScalar(0.85).addScaledVector(normal, 0.3).normalize();
        pickColour(NEEDLE, 0.12 + (1 - t) * 0.5 + k * 0.1 + (hash3(i, k, seed) - 0.5) * 0.14, colour);
        shell.card(centre, normal, tip, 0.6 * (0.85 + hash3(seed, i, row) * 0.3), colour, NEEDLE_TILE);
      }
    }
  });
  const core = gradeY(
    combine([
      limb(V(0, -0.1, 0), V(0, 1.2, 0), 0.15, 0.09, 0.5),
      ...tiers.map(([y, r, h]) =>
        rampPaint(
          smoothGeo(new THREE.ConeGeometry(1, 1, 10, 2), (v) => {
            v.x *= r * 0.92;
            v.z *= r * 0.92;
            v.y = y + v.y * h;
          }),
          NEEDLE_CORE,
          (v) => (v.y - y + h * 0.5) / h
        )
      ),
    ]),
    0.62,
    1.08
  );
  const pair = swayPair(core, shell.build());
  pair.core.userData.kit = "tree-pine";
  return pair;
};

/* Pieces for the three.js editor kit (assets/kit): the same shapes the island uses, each standing on y = 0 in its own file */
export function propKit() {
  const tex = foliageTexture();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const baked = (fill) => {
    const bake = makeBake({ dry: true });
    fill(bake, (x, y, z, o) => at(x, y, z, o));
    return bake.build(mat);
  };
  const piece = (name, fill) => {
    const mesh = baked(fill);
    if (!mesh) return null;
    mesh.name = name;
    return mesh;
  };
  const tree = (name, model, s) => {
    const g = new THREE.Group();
    g.name = name;
    const M = at(0, 0, 0, { s });
    const core = new THREE.Mesh(model.core.clone().applyMatrix4(M), mat);
    core.name = "trunk";
    const leaves = new THREE.Mesh(model.leaves.clone().applyMatrix4(M), mat);
    leaves.name = "leaves";
    leaves.userData.leaf = true;
    g.add(core, leaves);
    return g;
  };
  const marker = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.7, 4, 8).translate(0, 1.17, 0), new THREE.MeshBasicMaterial({ color: "#6f8cff" }));
  marker.name = "niko-height";
  const pieces = [
    marker,
    piece("ground-sand", (b, L) => b.add(G.box, ISLE.sand, L(0, -0.3, 0, { sx: 8, sy: 0.6, sz: 8 }))),
    piece("ground-grass", (b, L) => b.add(G.box, ISLE.grass, L(0, -0.3, 0, { sx: 8, sy: 0.6, sz: 8 }))),
    piece("ground-grass-wide", (b, L) => b.add(G.box, ISLE.grassTop, L(0, -0.3, 0, { sx: 16, sy: 0.6, sz: 16 }))),
    piece("path", (b, L) => b.add(G.box, ISLE.dirt, L(0, -0.08, 0, { sx: 1.6, sy: 0.16, sz: 6 }))),
    piece("cliff", (b, L) => {
      for (let i = 0; i < 4; i += 1) b.add(G.column[i % 4], i % 2 ? ISLE.rock : ISLE.rockDeep, L((i - 1.5) * 1.15, 1.3, 0, { ry: i, sx: 1.05, sy: 2.6, sz: 0.95 }));
    }),
    piece("stair", (b, L) => {
      for (let k = 0; k < 8; k += 1) b.add(G.slab[k % 3], k % 2 ? ISLE.ruin : ISLE.ruinDeep, L(0, 0.16 + k * 0.325, -1.7 + k * 0.5, { sx: 2.4, sy: 0.32, sz: 0.62 }));
    }),
    piece("rock", (b, L) => b.add(G.rock[0], ISLE.rock, L(0, 0.55, 0, { s: 1.3 }))),
    piece("rock-large", (b, L) => b.add(G.stones[0], ISLE.rockLight, L(0, 1.1, 0, { s: 2.2 }))),
    piece("rock-small", (b, L) => b.add(G.rock[1], ISLE.rockDeep, L(0, 0.28, 0, { s: 0.7 }))),
    tree("tree-round", roundTreeGeo(1), 1.6),
    tree("tree-pine", pineGeo(0), 1.5),
    tree("bush", bushParts(1), 1.15),
    piece("lamp", (b, L) => {
      b.add(G.taper, ISLE.rockDeep, L(0, 0.2, 0, { sx: 0.24, sy: 0.42, sz: 0.24 }));
      b.add(G.taper, ISLE.wood, L(0, 1.27, 0, { sx: 0.09, sy: 1.7, sz: 0.09 }));
      b.add(G.peak, ISLE.woodDeep, L(0, 2.16, 0, { sx: 0.066, sy: 0.08, sz: 0.066 }));
      b.add(G.box, ISLE.iron, L(0, 1.92, 0, { sx: 0.12, sy: 0.06, sz: 0.12 }));
      b.add(G.box, ISLE.wood, L(0, 1.855, 0.29, { rx: -0.26, sx: 0.08, sy: 0.08, sz: 1.05 }));
      b.add(G.box, ISLE.wood, L(0, 1.6, 0.23, { rx: -0.98, sx: 0.055, sy: 0.055, sz: 0.68 }));
      b.add(G.box, ISLE.iron, L(0, 1.86, 0.7, { sx: 0.022, sy: 0.14, sz: 0.022 }));
      b.add(G.peak, ISLE.iron, L(0, 1.75, 0.7, { sx: 0.13, sy: 0.12, sz: 0.13 }));
      b.add(G.box, ISLE.iron, L(0, 1.685, 0.7, { sx: 0.15, sy: 0.025, sz: 0.15 }));
      b.add(G.flare, "#ffd98a", L(0, 1.57, 0.7, { sx: 0.085, sy: 0.2, sz: 0.085 }));
      b.add(G.box, ISLE.iron, L(0, 1.46, 0.7, { sx: 0.075, sy: 0.03, sz: 0.075 }));
      b.add(G.peak, ISLE.iron, L(0, 1.42, 0.7, { rx: Math.PI, sx: 0.03, sy: 0.06, sz: 0.03 }));
    }),
    piece("barrel", (b, L) => {
      const s = 1.5;
      b.add(G.oct, ISLE.wood, L(0, 0.45 * s, 0, { sx: 0.36 * s, sz: 0.36 * s, sy: 0.9 * s }));
      [0.18, 0.72].forEach((y) => b.add(G.oct, ISLE.woodDeep, L(0, y * s, 0, { sx: 0.385 * s, sz: 0.385 * s, sy: 0.08 * s })));
    }),
    piece("crate", (b, L) => {
      const s = 1.4;
      b.add(G.box, ISLE.wood, L(0, 0.4 * s, 0, { s: 0.8 * s }));
      [-0.3, 0.3].forEach((y) => b.add(G.box, ISLE.woodDeep, L(0, (0.4 + y) * s, 0, { sx: 0.84 * s, sy: 0.09 * s, sz: 0.84 * s })));
    }),
    piece("fence", (b, L) => {
      [-1, 1].forEach((x) => b.add(G.box, ISLE.woodDeep, L(x, 0.65, 0, { sx: 0.17, sy: 1.3, sz: 0.17 })));
      [0.5, 1.02].forEach((y) => b.add(G.box, ISLE.wood, L(0, y, 0, { sx: 2.1, sy: 0.12, sz: 0.09 })));
    }),
    piece("shack", (b, L) => {
      const S = 1.65;
      const P = (x, y, z, o) => L(x * S, y * S, z * S, { ...o, sx: (o.sx ?? o.s ?? 1) * S, sy: (o.sy ?? o.s ?? 1) * S, sz: (o.sz ?? o.s ?? 1) * S });
      const gableShape = new THREE.Shape();
      gableShape.moveTo(-1.08, 0);
      gableShape.lineTo(1.08, 0);
      gableShape.lineTo(1.08, 1.6);
      gableShape.lineTo(0, 2.28);
      gableShape.lineTo(-1.08, 1.6);
      gableShape.closePath();
      const gable = facet(new THREE.ExtrudeGeometry(gableShape, { depth: 0.12, bevelEnabled: false }).translate(0, 0, -0.06));
      b.add(G.box, ISLE.plank, P(0, 0.1, 0, { sx: 2.7, sy: 0.2, sz: 2.4 }));
      b.add(G.box, ISLE.wood, P(0, 0.95, -1.02, { sx: 2.4, sy: 1.6, sz: 0.12 }));
      [-1, 1].forEach((side) => b.add(gable, ISLE.plank, P(side * 1.2, 0.15, 0, { ry: Math.PI / 2, sx: 1, sy: 1, sz: 1 })));
      b.add(G.box, ISLE.wood, P(-0.72, 0.95, 1.02, { sx: 0.96, sy: 1.6, sz: 0.12 }));
      b.add(G.box, ISLE.wood, P(0.86, 0.95, 1.02, { sx: 0.68, sy: 1.6, sz: 0.12 }));
      b.add(G.box, ISLE.wood, P(0.1, 1.6, 1.02, { sx: 0.7, sy: 0.3, sz: 0.12 }));
      b.add(G.box, ISLE.woodDeep, P(0.1, 0.78, 1.05, { sx: 0.62, sy: 1.18, sz: 0.05 }));
      [-1, 1].forEach((side) => b.add(G.box, ISLE.roof, P(0, 2.08, side * 0.6, { rx: side * 0.56, sx: 2.85, sy: 0.12, sz: 1.5 })));
      b.add(G.box, ISLE.woodDeep, P(0, 2.42, 0, { sx: 2.95, sy: 0.12, sz: 0.16 }));
    }),
    piece("stall", (b, L) => {
      const S = 1.5;
      const P = (x, y, z, o) => L(x * S, y * S, z * S, { ...o, sx: (o.sx ?? 1) * S, sy: (o.sy ?? 1) * S, sz: (o.sz ?? 1) * S });
      [[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.6], [0.9, 0.6]].forEach(([a, c]) => {
        const tall = 1.8 + (c < 0 ? 0.3 : 0);
        P && b.add(G.box, ISLE.woodDeep, P(a, tall / 2, c, { sx: 0.1, sy: tall, sz: 0.1 }));
      });
      for (let k = 0; k < 5; k += 1) b.add(G.box, k % 2 ? ISLE.cloth : ISLE.clothRed, P(-0.8 + k * 0.4, 1.95, 0, { rx: -0.25, sx: 0.4, sy: 0.06, sz: 1.5 }));
      b.add(G.box, ISLE.plank, P(0, 0.75, 0, { sx: 1.9, sy: 0.12, sz: 0.8 }));
      b.add(G.box, ISLE.wood, P(0, 0.4, 0, { sx: 1.8, sy: 0.7, sz: 0.7 }));
    }),
    piece("boat", (b, L) => {
      const hullShape = new THREE.Shape();
      hullShape.moveTo(0, -1.9);
      hullShape.quadraticCurveTo(0.85, -1.1, 0.8, 0.6);
      hullShape.quadraticCurveTo(0.7, 1.5, 0, 1.7);
      hullShape.quadraticCurveTo(-0.7, 1.5, -0.8, 0.6);
      hullShape.quadraticCurveTo(-0.85, -1.1, 0, -1.9);
      const hull = facet(new THREE.ExtrudeGeometry(hullShape, { depth: 0.7, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1, curveSegments: 4 }).rotateX(Math.PI / 2));
      b.add(hull, ISLE.wood, L(0, 0.35, 0, { s: 1.3 }));
    }),
    piece("campfire", (b, L) => {
      for (let k = 0; k < 7; k += 1) {
        const a = (k / 7) * Math.PI * 2;
        b.add(G.rock[k % 3], ISLE.rockDeep, L(Math.cos(a) * 0.82, 0.1, Math.sin(a) * 0.82, { s: 0.27 }));
      }
      [0, 1.1, 2.2].forEach((a) => b.add(G.hex, ISLE.woodDeep, L(0, 0.17, 0, { ry: a, rz: Math.PI / 2, sx: 0.11, sy: 1.2, sz: 0.11 })));
      b.add(G.cone, "#ff8a3c", L(0, 0.7, 0, { sx: 0.42, sy: 1.05, sz: 0.42 }));
    }),
    piece("pillar", (b, L) => {
      b.add(G.oct, ISLE.ruinDeep, L(0, 0.12, 0, { sx: 0.6, sz: 0.6, sy: 0.24 }));
      for (let k = 0; k < 3; k += 1) b.add(G.oct, k % 2 ? ISLE.ruin : ISLE.ruinDeep, L(0, 0.4 + k * 0.78, 0, { ry: k * 0.4, sx: 0.42, sz: 0.42, sy: 0.74 }));
    }),
    piece("dock", (b, L) => {
      for (let k = 0; k < 8; k += 1) b.add(G.box, k % 2 ? ISLE.plank : ISLE.wood, L(0, 0.08, -1.4 + k * 0.4, { sx: 1.6, sy: 0.12, sz: 0.32 }));
      [-0.7, 0.7].forEach((x) => b.add(G.box, ISLE.woodDeep, L(x, -0.15, 0, { sx: 0.14, sy: 0.3, sz: 3.3 })));
    }),
  ].filter(Boolean);
  return { pieces, leaf: { width: tex.image.width, height: tex.image.height, data: tex.image.data } };
}

/* Bush: a dark dome under small rounded leaves, knee to hip high on Niko */
const bushParts = (seed) => {
  const c = V(0, 0.26, 0);
  const r = V(0.62, 0.48, 0.62);
  const shell = cardShell();
  leafBall(shell, c, r, 0.26, BUSH_LEAF, seed * 5 + 1, LEAF_TILE, -0.35);
  const pair = swayPair(coreBall(c, r, LEAF_CORE, seed), shell.build());
  pair.core.userData.kit = "bush";
  return pair;
};

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

/* Crisp toon light for the scenery and Niko: flat shadow / half-lit / lit bands with only a thin blend at each edge
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

/* Lamp light: each lantern (and the campfire) lights a warm pool around it, a sphere (x, y, z, radius) with a soft
   squared falloff. buildIsland fills the list and flickers the radii. */
const LAMPS = 24;
export const lampLights = { value: Array.from({ length: LAMPS }, () => new THREE.Vector4(0, -999, 0, 1)) };
/* How many of lampLights are in use this frame (the ones that light the view are packed first) */
export const lampCount = { value: LAMPS };
/* Lamp pools read stronger as the day light fades (set from climate) */
export const lampGain = { value: 1 };
/* Unlit water (sea, stream, waterfall, splashes) is multiplied by this so it follows the day and night light */
export const waterLight = { value: new THREE.Color(1, 1, 1) };
const LAMP_GLSL = [
  `uniform vec4 lampLights[${LAMPS}];`,
  "uniform float lampGain;",
  "uniform int lampCount;",
  "float lampAt(vec3 p){",
  "  float k = 0.0;",
  `  for (int i = 0; i < ${LAMPS}; i++) {`,
  "    if (i >= lampCount) break;",
  "    vec3 d = p - lampLights[i].xyz;",
  "    float f = max(0.0, 1.0 - dot(d, d) / (lampLights[i].w * lampLights[i].w));",
  "    k += f * f;",
  "  }",
  "  return k;",
  "}",
  "const vec3 LAMP_COLOUR = vec3(1.0, 0.62, 0.28);",
].join("\n");
const LAMP_LIGHT = "outgoingLight += (diffuseColor.rgb * 0.75 + 0.025) * LAMP_COLOUR * lampAt(LAMP_POS) * lampGain;";

/* Lamp light for materials that skip atmos (Niko) */
export const lamped = (material) => {
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey?.() || "";
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    shader.uniforms.lampLights = lampLights;
    shader.uniforms.lampCount = lampCount;
    shader.uniforms.lampGain = lampGain;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLampPos;")
      .replace("#include <fog_vertex>", "vLampPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <fog_vertex>");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vLampPos;\n${LAMP_GLSL}`)
      .replace("#include <opaque_fragment>", `${LAMP_LIGHT.replace("LAMP_POS", "vLampPos")}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${key}-lamp`;
  return material;
};

/* Atmosphere on every lit surface: soft-edged cloud shadows drift over the island, ground right at the sea takes
   a light cool haze, so the levels read as height, and the lamps light their surroundings. */
export const atmosTime = { value: 0 };
/* Cloud shadows, shared by the ground, props, Niko and the god rays: cloudTime is the climate's drift phase (faster in
   wind), cloudCover the noise threshold (lower = more sky covered), cloudShade how dark a shadow gets. */
export const cloudTime = { value: 0 };
export const cloudCover = { value: 0.6 };
export const cloudShade = { value: 0.7 };
/* Sun direction xz / y: the cloud layer sits at CLOUD_HEIGHT and its shadow falls along the sun, so cloud patches on
   the ground and the beams through the air (world-rays.js) line up, and both slide as the sun crosses the sky */
export const cloudSun = { value: new THREE.Vector2() };
/* Patches a few Nikos across, not one big blob: three octaves for frayed edges, and a slow warp that evolves on its
   own so the shapes break up and re-form as they drift instead of sliding past as rigid silhouettes. */
export const CLOUD_NOISE_GLSL = [
  "float cloudHash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }",
  "float cloudNoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);",
  "  return mix(mix(cloudHash(i), cloudHash(i + vec2(1.0, 0.0)), f.x), mix(cloudHash(i + vec2(0.0, 1.0)), cloudHash(i + vec2(1.0, 1.0)), f.x), f.y); }",
  "float cloudNoiseAt(vec2 xz){",
  "  vec2 p = xz * 0.14 + vec2(cloudTime * 0.045, cloudTime * 0.028);",
  "  vec2 w = vec2(cloudNoise(p * 0.45 + vec2(3.1, cloudTime * 0.011)), cloudNoise(p * 0.45 + vec2(cloudTime * 0.009, 8.7))) - 0.5;",
  "  p += w * 1.6;",
  "  return cloudNoise(p) * 0.5 + cloudNoise(p * 2.03 + 5.2) * 0.3 + cloudNoise(p * 4.1 + 9.4) * 0.2;",
  "}",
].join("\n");
/* The noise is drawn once per frame into cloudMapTex (makeCloudMap) over the area around the view; lit pixels read it
   with one tap instead of five noise layers each. Two 8-bit channels carry it (r + g / 255), which stays exact under
   linear filtering. cloudMapArea = (x0, z0, 1 / width, 1 / depth) of that area on the cloud plane. */
export const cloudMapTex = { value: null };
export const cloudMapArea = { value: new THREE.Vector4(-100, -100, 1 / 200, 1 / 200) };
export const CLOUD_GLSL = [
  "uniform float cloudTime; uniform float cloudCover; uniform float cloudShade; uniform vec2 cloudSun;",
  "uniform sampler2D cloudMap; uniform vec4 cloudMapArea;",
  "float cloudNoiseMap(vec2 xz){ vec4 t = texture2D(cloudMap, (xz - cloudMapArea.xy) * cloudMapArea.zw); return t.r + t.g / 255.0; }",
  /* 0 in sun, 1 under a cloud. Thick cores sit a little darker than the thin fringe. */
  "float cloudAt(vec2 xz){",
  "  float c = cloudNoiseMap(xz);",
  "  float edge = smoothstep(cloudCover - 0.02, cloudCover + 0.08, c);",
  "  return edge * (0.72 + 0.28 * smoothstep(cloudCover + 0.08, cloudCover + 0.24, c));",
  "}",
  "float cloudAt3(vec3 p){ return cloudAt(p.xz + cloudSun * (18.0 - p.y)); }",
  "const vec3 CLOUD_TINT = vec3(0.74, 0.8, 0.95);",
].join("\n");
/* Draws the cloud noise into cloudMapTex. update(x, z, half) centres the map on (x, z) of the cloud plane (the view
   centre shifted along the sun) and makes it 2 * half units across. */
export const makeCloudMap = (renderer, size = 512) => {
  const target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false, stencilBuffer: false });
  Object.assign(target.texture, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
  cloudMapTex.value = target.texture;
  const material = new THREE.ShaderMaterial({
    uniforms: { cloudTime, cloudMapArea },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: [
      "uniform float cloudTime; uniform vec4 cloudMapArea; varying vec2 vUv;",
      CLOUD_NOISE_GLSL,
      "void main(){",
      "  float c = clamp(cloudNoiseAt(cloudMapArea.xy + vUv / cloudMapArea.zw), 0.0, 1.0) * 255.0;",
      "  gl_FragColor = vec4(floor(c) / 255.0, fract(c), 0.0, 1.0);",
      "}",
    ].join("\n"),
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.Camera();
  const map = {
    update(x, z, half) {
      cloudMapArea.value.set(x - half, z - half, 1 / (2 * half), 1 / (2 * half));
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(previous);
    },
  };
  map.update(0, 0, 100);
  return map;
};
/* A cloud blocks the sun, not the sky: take most of the direct light away and cool what is left. Multiplying the
   final colour did nothing on sunlit sand, which is already brighter than white before the screen clips it. */
export const CLOUD_SHADE = (pos, amount = "1.0") =>
  [
    `{ float cloudK = cloudAt3(${pos}) * cloudShade * ${amount};`,
    "  outgoingLight -= reflectedLight.directDiffuse * cloudK * 0.78;",
    "  outgoingLight *= mix(vec3(1.0), CLOUD_TINT, cloudK * 0.35); }",
  ].join("\n");
export const cloudUniforms = (shader) => Object.assign(shader.uniforms, { cloudTime, cloudCover, cloudShade, cloudSun, cloudMap: cloudMapTex, cloudMapArea });
export const atmos = (material) => {
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey?.() || "";
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    shader.uniforms.atmosTime = atmosTime;
    cloudUniforms(shader);
    shader.uniforms.lampLights = lampLights;
    shader.uniforms.lampCount = lampCount;
    shader.uniforms.lampGain = lampGain;
    shader.uniforms.weatherWet = weatherWet;
    shader.uniforms.weatherFog = weatherFog;
    shader.uniforms.weatherFogColor = weatherFogColor;
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
          "uniform float weatherWet;",
          "uniform float weatherFog;",
          "uniform vec3 weatherFogColor;",
          "varying vec3 vAtmos;",
          CLOUD_GLSL,
          LAMP_GLSL,
        ].join("\n")
      )
      .replace(
        "#include <opaque_fragment>",
        [
          "{",
          CLOUD_SHADE("vAtmos"),
          `  ${LAMP_LIGHT.replace("LAMP_POS", "vAtmos")}`,
          "  float low = 1.0 - smoothstep(-1.2, 1.6, vAtmos.y);",
          "  outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.72, 0.84, 0.98) + vec3(0.01, 0.04, 0.07), low * 0.45);",
          "  outgoingLight *= mix(vec3(1.0), vec3(0.76, 0.8, 0.88), weatherWet * 0.75);",
          "  float mist = weatherFog * (0.32 + (1.0 - smoothstep(0.0, 9.0, vAtmos.y)) * 0.28);",
          "  outgoingLight = mix(outgoingLight, weatherFogColor, clamp(mist, 0.0, 0.6));",
          "}",
          "#include <opaque_fragment>",
        ].join("\n")
      );
  };
  material.customProgramCacheKey = () => `${key}-atmos3`;
  return material;
};

/* Size (world units) of the squares the props, leaves and grass are split into for frustum culling. The default
   view spans a few squares; smaller squares cull tighter but cost a draw call each. */
const CULL_CELL = 12;

export function buildIsland({ scene, withRim, coarse = false, clear = [], kit = false }) {
  const root = new THREE.Group();
  root.name = "island";
  scene.add(root);

  /* Two soft tones: a clear sunlit side and a shade side the cool sky light fills */
  const ramp = makeRamp();
  const painted = atmos(withRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp }), 0.06));
  const paintedProps = atmos(occlude(withRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp }), 0.06)));
  /* Lantern glass, lit windows, shrine stars: brighter than white, so the bloom spreads them */
  const glowing = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  glowing.color.setScalar(2.4);

  const bake = makeBake({ split: kit });
  const glowBake = makeBake({ split: kit });
  const leafBake = makeBake({ split: kit });
  const leafTex = foliageTexture();
  const leafMaterial = atmos(occlude(windSway(new THREE.MeshToonMaterial({ vertexColors: true, map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, gradientMap: ramp }), true)));
  const leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide });
  /* A tree or bush: its core into the props, its leaf cards into the leaf mesh, swaying together */
  let plantCount = 0;
  const plant = (model, matrix, vary, seed, sway) => {
    if (bake.split) {
      bake.setLabel(model.core.userData.kit || "plant");
      bake.begin();
      bake.put(model.core, new THREE.Matrix4(), vary, seed, 0);
      bake.put(model.leaves, new THREE.Matrix4(), vary, seed, 0, true);
      const group = bake.end();
      group.name = `${model.core.userData.kit || "plant"}-${plantCount++}`;
      matrix.decompose(group.position, group.quaternion, group.scale);
      return;
    }
    bake.put(model.core, matrix, vary, seed, sway);
    leafBake.put(model.leaves, matrix, vary, seed, sway);
  };
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
    } else if (t.region?.beach || (!t.region && y < 1.1)) {
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
      if (t.region?.name === "ground") {
        const court = Math.hypot(u - MAP.spots.landing[0], v - MAP.spots.landing[1]) / MAP.K - (grain - 0.5) * 0.35;
        colour.lerp(tint.set(ISLE.dirt), (1 - cut(court, 3.6)) * 0.7);
        grassHere *= cut(court, 3.8);
      }
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
  const TEX = coarse ? 448 : 640;
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
    terrain.name = "ground";
    if (kit) terrain.userData.image = { width: TEX, height: TEX, data: groundPixels };
    terrain.receiveShadow = true;
    terrain.castShadow = true;
    root.add(terrain);
  }

  /* Cliffs: chunky rock columns stood along every drop, from below the lower ground to just under the grass lip */
  {
    if (kit) bake.setLabel("cliff");
    const placed = [];
    const rocks = [ISLE.rock, ISLE.rockDeep, ISLE.rockLight, ISLE.rock];
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        const h = hgrid[j * size + i];
        if (h < 0.35) continue;
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
        if (h < 0.6 && low > -1) continue;
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
        let bottom = Math.min(low, far) - (Math.min(low, far) < 0.2 ? 1.6 : 0.7);
        if (low < -1) bottom = Math.max(bottom, h - 3.4);
        const r = 0.58 + rand(cx * 2, cz) * 0.45;
        const top = h - 0.1 - rand(cz, cx * 2) * 0.45 + (rand(cx, cz * 3) > 0.96 ? 0.3 : 0);
        const k = Math.floor(rand(cx * 5, cz * 5) * 4);
        bake.add(G.column[k], rocks[k], at(cx, (top + bottom) / 2, cz, { ry: rand(cx, cz) * 6, sx: r, sz: r * (0.85 + rand(cz, 1) * 0.3), sy: top - bottom }), (rand(cx * 9, cz) - 0.5) * 0.06, [Math.max(0.5, 1.02 - (top - bottom) * 0.07), 1.1]);
      }
    }
  }

  /* Stairs: thick stone treads on the ramps, each flanked by a cheek block that steps up with it (one stepped stone
     wall per side, no long sloping beams), and arches over two of them */
  const worldDir = (dir) => [(dir[0] + dir[1]) * S, (dir[1] - dir[0]) * S];
  MAP.stairs.forEach((s, index) => {
    const n = Math.max(4, Math.round((s.to - s.from) / 0.3));
    const [dx, dz] = worldDir(s.dir);
    const ry = Math.atan2(dx, dz);
    const run = s.len / n;
    const rise = (s.to - s.from) / n;
    const along = (t, off = 0) => uvToXZ(s.a[0] + s.dir[0] * s.len * t + s.dir[1] * off, s.a[1] + s.dir[1] * s.len * t - s.dir[0] * off);
    for (let k = 0; k < n; k += 1) {
      const t = (k + 0.5) / n;
      const top = s.from + rise * (k + 0.5);
      const deep = rise + 0.75;
      const [x, z] = along(t);
      bake.add(G.slab[k % 3], k % 2 ? ISLE.ruin : ISLE.ruinDeep, at(x, top - deep / 2, z, { ry: ry + (rand(k, index) - 0.5) * 0.03, sx: s.w * 2 - 0.1, sy: deep, sz: run * 1.08 }), (rand(index, k) - 0.5) * 0.05);
      [-1, 1].forEach((side) => {
        const [cx, cz] = along(t, (s.w + 0.14) * side);
        const tall = deep + 0.32 + rand(k, side + index) * 0.06;
        bake.add(G.slab[(k + 1) % 3], ISLE.ruinDeep, at(cx, top + 0.32 - tall / 2, cz, { ry, sx: 0.36, sy: tall, sz: run * 1.02 }));
      });
    }
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
    if (kit) {
      bake.setLabel("lamp");
      bake.begin();
      glowBake.setLabel("lamp");
      glowBake.begin();
    }
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
    if (kit) {
      const lamp = bake.end(true);
      const glow = glowBake.end(false);
      glow.children.forEach((child) => {
        child.position.sub(lamp.position);
        lamp.add(child);
      });
      glowBake.discard();
    }
  };
  const deckAt = (p, t, side) => {
    const off = (p.w - 0.06) * side;
    return uvToXZ(p.a[0] + p.dir[0] * p.len * t + p.dir[1] * off, p.a[1] + p.dir[1] * p.len * t - p.dir[0] * off);
  };
  if (kit) bake.setLabel("deck");
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
      /* MSAA can sample the varyings just past the top edge; pow of a negative is NaN on D3D, and bloom spreads it */
      "  float rise = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.5);",
      "  float shimmer = 0.85 + 0.15 * sin(vUv.y * 40.0 + time * 3.0);",
      "  float a = pow(clamp(vFace, 0.0, 1.0), 2.5) * rise * shimmer * strength;",
      "  gl_FragColor = vec4(vec3(0.78, 0.9, 1.0), a);",
      "}",
    ].join("\n"),
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.1, 26, 16, 1, true), beamMat);
  beam.position.set(sx, MAP.dais.h + 13, sz);
  beam.renderOrder = 2;
  beam.frustumCulled = false;
  if (!kit) root.add(beam);

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
    if (kit) {
      bake.setLabel("campfire");
      bake.begin();
    }
    for (let k = 0; k < 7; k += 1) {
      const a = (k / 7) * Math.PI * 2;
      bake.add(G.rock[k % 3], ISLE.rockDeep, at(fire.x + Math.cos(a) * 0.82, fire.h + 0.1, fire.z + Math.sin(a) * 0.82, { s: 0.27 }));
    }
    [0, 1.1, 2.2].forEach((a) => bake.add(G.hex, ISLE.woodDeep, at(fire.x, fire.h + 0.17, fire.z, { ry: a, rz: Math.PI / 2, sx: 0.11, sy: 1.2, sz: 0.11 })));
    const flame = new THREE.Group();
    flame.position.set(fire.x, fire.h + 0.24, fire.z);
    [["#ff8a3c", 0.42, 1.05], ["#ffd36a", 0.26, 0.72]].forEach(([c, r, hgt]) => {
      const m = new THREE.Mesh(G.cone, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2), toneMapped: false }));
      m.scale.set(r, hgt, r);
      m.position.y = hgt / 2;
      flame.add(m);
    });
    if (kit) {
      const group = bake.end(true);
      flame.position.sub(group.position);
      flame.name = "flame";
      group.add(flame);
    } else root.add(flame);
    fires.push(flame);
    block(fire.x, fire.z, 1);
  }

  const fence = (authored, level) => {
    if (kit) {
      bake.setLabel("fence");
      bake.begin();
    }
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
    if (kit) bake.end(true);
  };
  fence([[-17.2, -5.4], [-16.2, -2.6], [-13.8, -1.4], [-11.2, -1.2]], MAP.LEVEL.mid);
  /* Props are sized against Niko (2.5 units, about 1.5 m): a barrel comes to his waist, a crate to his hip */
  const crate = (u, v, s = 1, turn = 0) => {
    if (kit) {
      bake.setLabel("crate");
      bake.begin();
    }
    s *= 1.4;
    const p = groundUV(...MAP.lay(u, v));
    bake.add(G.box, ISLE.wood, at(p.x, p.h + 0.4 * s, p.z, { ry: turn, s: 0.8 * s }));
    [-0.3, 0.3].forEach((y) => bake.add(G.box, ISLE.woodDeep, at(p.x, p.h + (0.4 + y) * s, p.z, { ry: turn, sx: 0.84 * s, sy: 0.09 * s, sz: 0.84 * s })));
    block(p.x, p.z, 0.6 * s);
    if (kit) bake.end(true);
  };
  const barrel = (u, v, s = 1) => {
    if (kit) {
      bake.setLabel("barrel");
      bake.begin();
    }
    s *= 1.5;
    const p = groundUV(...MAP.lay(u, v));
    bake.add(G.oct, ISLE.wood, at(p.x, p.h + 0.45 * s, p.z, { sx: 0.36 * s, sz: 0.36 * s, sy: 0.9 * s }));
    [0.18, 0.72].forEach((y) => bake.add(G.oct, ISLE.woodDeep, at(p.x, p.h + y * s, p.z, { sx: 0.385 * s, sz: 0.385 * s, sy: 0.08 * s })));
    block(p.x, p.z, 0.45 * s);
    if (kit) bake.end(true);
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

  const placer = (u, v, ry, s = 1) => {
    const p = groundUV(u, v);
    const frame = at(p.x, p.h, p.z, { ry, s });
    return (lx, ly, lz, o = {}) => frame.clone().multiply(at(lx, ly, lz, o));
  };
  groundPlaces.forEach((item, k) => {
    const spot = groundUV(...MAP.lay(item.u, item.v));
    if (spot.h < 0.2) return;
    const ry = item.ry || 0;
    if (kit && item.kind !== "lamp") {
      bake.setLabel(item.kind);
      bake.begin();
    }
    if (item.kind === "pillar") {
      const n = item.blocks || 3;
      bake.add(G.oct, ISLE.ruinDeep, at(spot.x, spot.h + 0.12, spot.z, { ry, sx: 0.72, sz: 0.72, sy: 0.24 }));
      for (let b = 0; b < n; b += 1) {
        const broken = b === n - 1 && n > 2;
        bake.add(G.oct, b % 2 ? ISLE.ruin : ISLE.ruinDeep, at(spot.x, spot.h + 0.38 + b * 0.74, spot.z, { ry: ry + b * 0.18, sx: 0.48 - b * 0.04, sz: 0.48 - b * 0.04, sy: broken ? 0.46 : 0.7 }));
      }
      block(spot.x, spot.z, 0.55);
    } else if (item.kind === "ruin") {
      const n = item.blocks || 3;
      const frame = at(spot.x, spot.h, spot.z, { ry });
      const L = (lx, ly, lz, o = {}) => frame.clone().multiply(at(lx, ly, lz, o));
      for (let b = 0; b < n; b += 1) {
        const tall = b === n - 1 ? 0.72 : 1.2;
        bake.add(G.slab[b % 3], b % 2 ? ISLE.ruin : ISLE.ruinDeep, L((b - (n - 1) / 2) * 0.72, tall / 2, 0, { sx: 0.64, sy: tall, sz: 0.4 }));
      }
      bake.add(G.slab[1], ISLE.ruinDeep, L(n * 0.32, 0.18, 0.55, { rz: Math.PI / 2, rx: 0.15, sx: 0.78, sy: 0.16, sz: 0.42 }));
      block(spot.x, spot.z, 0.8);
    } else if (item.kind === "stones") {
      const s = item.s || 0.8;
      bake.add(G.stones[k % 2], k % 2 ? ISLE.rock : ISLE.rockLight, at(spot.x, spot.h + s * 0.4, spot.z, { ry, s }), 0, [0.7, 1.05]);
      block(spot.x, spot.z, s * 0.7);
    } else if (item.kind === "lamp") {
      lampPost(spot.x, spot.z, spot.h, faceAngle(MAP.lay(item.u, item.v), MAP.lay(item.faceU, item.faceV)), 1.55);
    }
    if (kit && item.kind !== "lamp") bake.end(true);
  });

  /* Meadow stall by the lookout path: posts and a striped awning */
  {
    /* Counter at Niko's waist, awning above his head */
    const S = 1.5;
    const at2 = MAP.lay(-0.8, 7.8);
    const p = groundUV(...at2);
    const L = placer(...at2, towardPath(...at2), S);
    if (kit) {
      bake.setLabel("stall");
      bake.begin();
    }
    [[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.6], [0.9, 0.6]].forEach(([a, b]) => {
      const tall = 1.8 + (b < 0 ? 0.3 : 0);
      bake.add(G.box, ISLE.woodDeep, L(a, tall / 2, b, { sx: 0.1, sy: tall, sz: 0.1 }));
    });
    for (let k = 0; k < 5; k += 1) bake.add(G.box, k % 2 ? ISLE.cloth : ISLE.clothRed, L(-0.8 + k * 0.4, 1.95, 0, { rx: -0.25, sx: 0.4, sy: 0.06, sz: 1.5 }));
    bake.add(G.box, ISLE.plank, L(0, 0.75, 0, { sx: 1.9, sy: 0.12, sz: 0.8 }));
    bake.add(G.box, ISLE.wood, L(0, 0.4, 0, { sx: 1.8, sy: 0.7, sz: 0.7 }));
    block(p.x, p.z, 1.15 * S);
    if (kit) bake.end(true);
  }

  if (kit) bake.setLabel("ruin");
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
  const bushes = [bushParts(0), bushParts(1), bushParts(2)];
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
      plant(round ? rounds[k % 3] : pines[k % 2], at(x, h - 0.05, z, { ry: rand(k, 3) * 6, s }), 0.18, k, 0.22);
      trees.push([x, z]);
      block(x, z, 0.75);
    }
  );
  function t2(u, v) {
    return MAP.fbm(u * 0.3 - 7, v * 0.3 + 2) > 0.55 && v > -10;
  }
  scatter(
    1200,
    1.6,
    (t, u, v) =>
      t.region &&
      !t.region.stack &&
      t.h > 0.3 &&
      MAP.pathDist(u, v) > 1.1 &&
      t.region.name !== "ground" &&
      (t.region.name !== "meadow" || MAP.fbm(u * 0.16 + 3, v * 0.16) > 0.52) &&
      (!t.region.beach || MAP.fbm(u * 0.2 - 9, v * 0.2 + 4) > 0.66),
    (x, h, z, k) => {
      if (k % 3 === 0) {
        const s = 0.35 + rand(k, 1) * 0.4;
        if (s > 0.6) bake.add(G.stones[k % 2], k % 2 ? ISLE.rock : ISLE.rockLight, at(x, h + s * 0.45, z, { ry: k, s: s * 0.9 }));
        else {
          if (kit) bake.setLabel("rock");
          bake.add(G.rock[k % 3], k % 2 ? ISLE.rock : ISLE.rockLight, at(x, h + s * 0.2, z, { ry: k, sx: s * 1.3, sy: s * 0.75, sz: s }));
        }
        block(x, z, s * 0.9);
      } else if (h > 2) {
        const bush = bushes[k % 3];
        const where = at(x, h, z, { ry: k, s: 0.95 + rand(k, 4) * 0.4 });
        plant(bush, where, 0.2, k, 0.08);
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
     Niko tramples them (trail below). Sized from Niko (2.5 units tall): a tuft is about a fifth of his height. */
  const player = new THREE.Vector3(999, 0, 999);
  const swayUniforms = { time: windTime, player: { value: player } };

  /* Trampled grass: Niko's feet stamp a trail map (rg = lean direction × amount, b = amount). Standing crushes
     flat (no radial part); walking lays tips along the step. Soft foot pad, ~3 s spring-back. One RT pass/frame. */
  const trail = (() => {
    const res = coarse ? 192 : 256;
    const span = size * cell;
    const make = () => {
      const t = new THREE.WebGLRenderTarget(res, res, { type: THREE.HalfFloatType, depthBuffer: false });
      t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter;
      t.texture.generateMipmaps = false;
      return t;
    };
    let read = make();
    let write = make();
    const uniforms = {
      prev: { value: null },
      foot: { value: new THREE.Vector2(9999, 9999) },
      move: { value: new THREE.Vector2() },
      radius: { value: 0.58 },
      decay: { value: 1 },
      lo: { value: min },
      span: { value: span },
      /* Up to 4 rain-hit stamps (xz + strength); keeps grass twitching where drops land. */
      rain0: { value: new THREE.Vector3(9999, 9999, 0) },
      rain1: { value: new THREE.Vector3(9999, 9999, 0) },
      rain2: { value: new THREE.Vector3(9999, 9999, 0) },
      rain3: { value: new THREE.Vector3(9999, 9999, 0) },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: [
        "uniform sampler2D prev; uniform vec2 foot; uniform vec2 move; uniform float radius; uniform float decay;",
        "uniform float lo; uniform float span; varying vec2 vUv;",
        "uniform vec3 rain0; uniform vec3 rain1; uniform vec3 rain2; uniform vec3 rain3;",
        "void stampRain(inout vec4 p, vec3 r, vec2 world){",
        "  if (r.z < 0.01) return;",
        "  float hit = smoothstep(0.32, 0.02, length(world - r.xy)) * r.z;",
        "  hit = hit * hit * (3.0 - 2.0 * hit);",
        "  if (hit > p.b * 0.55) {",
        /* Soft flatten only — rain shouldn't carve walk-trail lean into the meadow. */
        "    p = vec4(0.0, 0.0, max(p.b, hit * 0.55), 1.0);",
        "  }",
        "}",
        "void main(){",
        "  vec4 p = texture2D(prev, vUv) * decay;",
        "  vec2 world = lo + vUv * span;",
        "  vec2 d = world - foot;",
        /* Soft foot pad: crush under the sole, wide soft rim (no hard crater ring) */
        "  float hit = smoothstep(radius, radius * 0.08, length(d));",
        "  hit = hit * hit * (3.0 - 2.0 * hit);",
        "  if (hit > p.b) {",
        /* Standing = flatten only (zero dir). Walking = lean along the step, slight radial fill */
        "    float moving = step(0.06, length(move));",
        "    vec2 radial = normalize(d + vec2(1e-4, 0.0));",
        "    vec2 dir = moving > 0.5 ? normalize(radial * 0.3 + move) : vec2(0.0);",
        "    p = vec4(dir * hit, hit, 1.0);",
        "  }",
        "  stampRain(p, rain0, world);",
        "  stampRain(p, rain1, world);",
        "  stampRain(p, rain2, world);",
        "  stampRain(p, rain3, world);",
        "  gl_FragColor = p;",
        "}",
      ].join("\n"),
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    const stage = new THREE.Scene();
    stage.add(quad);
    const eye = new THREE.Camera();
    const last = new THREE.Vector3();
    let idle = 99;
    const map = { value: read.texture };
    const rainU = [uniforms.rain0, uniforms.rain1, uniforms.rain2, uniforms.rain3];
    return {
      map,
      lo: { value: min },
      span: { value: span },
      step(renderer, dt, foot, rainHits) {
        const on = Boolean(foot) && Math.abs(foot.y - MAP.groundAt(foot.x, foot.z)) < 0.35;
        const raining = Array.isArray(rainHits) && rainHits.length >= 2;
        idle = on || raining ? 0 : idle + dt;
        if (!renderer || idle > 8) return;
        uniforms.decay.value = Math.exp(-dt * (raining ? 0.85 : 0.7));
        if (on) {
          const mx = foot.x - last.x;
          const mz = foot.z - last.z;
          const speed = Math.hypot(mx, mz) / Math.max(dt, 1e-3);
          const along = speed > 0.3 && speed < 40 ? Math.min(1, speed / 4) / Math.hypot(mx, mz) : 0;
          uniforms.foot.value.set(foot.x, foot.z);
          uniforms.move.value.set(mx * along, mz * along);
          last.copy(foot);
        } else uniforms.foot.value.set(9999, 9999);
        for (let i = 0; i < 4; i += 1) {
          const k = i * 2;
          if (raining && k + 1 < rainHits.length) rainU[i].value.set(rainHits[k], rainHits[k + 1], 0.65 + Math.random() * 0.25);
          else rainU[i].value.set(9999, 9999, 0);
        }
        uniforms.prev.value = read.texture;
        const before = renderer.getRenderTarget();
        renderer.setRenderTarget(write);
        renderer.render(stage, eye);
        renderer.setRenderTarget(before);
        [read, write] = [write, read];
        map.value = read.texture;
      },
    };
  })();
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

    /* Leaf masks drawn as curving blades with soft rounded tips, the same leaf shape as the bushes and trees */
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
              return Math.abs(fx - cx) < w * Math.sqrt(Math.max(0, 1 - Math.pow(t, 4))) * (1 - t * 0.3);
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

    const card = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);

    const material = new THREE.MeshToonMaterial({ gradientMap: ramp, side: THREE.DoubleSide });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.time = swayUniforms.time;
      shader.uniforms.player = swayUniforms.player;
      shader.uniforms.windMul = windMul;
      shader.uniforms.rainAmt = rainAmt;
      shader.uniforms.trailMap = trail.map;
      shader.uniforms.trailLo = trail.lo;
      shader.uniforms.trailSpan = trail.span;
      shader.uniforms.leafTex = { value: leafTex };
      shader.uniforms.accentTex = { value: accentTex };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          [
            "#include <common>",
            "uniform float time;",
            "uniform float windMul;",
            "uniform float rainAmt;",
            "uniform vec3 player;",
            "uniform sampler2D trailMap;",
            "uniform float trailLo;",
            "uniform float trailSpan;",
            "attribute vec2 aGrass;",
            "varying vec4 vGrass;",
            "varying float vGust;",
            "varying float vPress;",
            "vec2 grassRotate(vec2 p, float a){ float c = cos(a); float s = sin(a); return vec2(p.x * c - p.y * s, p.x * s + p.y * c); }",
            WIND_GLSL,
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
            /* Trampled: height flattens; tips lean along the walk, or toward the camera when standing
               (so crush reads as laid-down blades, not a dark stub patch / radial crater). */
            "vec4 trail = texture2D(trailMap, (origin.xz - trailLo) / trailSpan);",
            "float press = clamp(trail.b, 0.0, 1.0);",
            "vec2 dirG = press > 0.01 ? trail.rg / max(trail.b, 1e-3) : vec2(0.0);",
            "float dirLen = length(dirG);",
            "float hasDir = step(0.08, dirLen);",
            "vec2 scatter = vec2(sin(aGrass.x * 6.283), cos(aGrass.x * 4.1));",
            "dirG = hasDir > 0.5 ? dirG / dirLen : normalize(-fwd + scatter * 0.55);",
            "float pushX = clamp(dot(perp, dirG), -1.0, 1.0) * mix(0.35, 1.0, hasDir);",
            "float quiver = sin(time * 7.0 + aGrass.x * 6.283) * press * (1.0 - press) * 0.18;",
            "card = grassRotate(card, (pushX * press * 0.4 + quiver) * radians(30.0));",
            "card.y *= 1.0 - press * 0.55;",
            "float tipLean = max(card.y, 0.0) * press * mix(0.55, 0.9, hasDir);",
            "vec3 tipPush = vec3(dirG.x, -press * 0.02, dirG.y) * tipLean;",
            "vPress = press;",
            /* Wind blows one way across the island: broad gust bands roll downwind over the meadow (the same windGust
               as the tree crowns), with a small per-blade flutter on top. Every card leans downwind a little; a
               passing gust pushes it further and lightens its tip. time is the climate's wind phase. */
            "vec2 wind = WIND_DIR;",
            "float grassWind = 1.0 + (min(windMul, 3.5) - 1.0) * 0.62;",
            "float gust = windGust(origin.xz, time * 1.04) * grassWind;",
            "float flutter = windNoise(origin.xz * 0.7 + wind * time * 1.6) - 0.5;",
            "float sway = 0.12 + gust * 0.62 + flutter * (0.12 + gust * 0.16) + sin(time * 2.3 + aGrass.x * 6.283) * (0.03 + grassWind * 0.02);",
            "sway = min(sway, 1.05);",
            "sway *= 1.0 - press * 0.92;",
            "float patter = clamp(sin(time * 16.0 + aGrass.x * 48.0) * rainAmt * 0.07, -0.1, 0.1);",
            "vec3 wind3 = vec3(wind.x, 0.0, wind.y);",
            "float onScreen = dot(wind3, camRight);",
            "float intoScreen = dot(wind, fwd);",
            "float bend = min(sway * radians(22.0 + grassWind * 6.0), radians(38.0));",
            "card = grassRotate(card, -bend * onScreen + patter);",
            "card.y *= 1.0 - (1.0 - cos(bend)) * abs(intoScreen) * 0.75;",
            "card.y = max(card.y, 0.1 * size);",
            "vec3 worldPos = origin + camRight * card.x + camUp * card.y + tipPush;",
            "worldPos.y = max(worldPos.y, origin.y + 0.035);",
            "vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);",
            "gl_Position = projectionMatrix * mvPosition;",
            "vGrass = vec4(position.x + 0.5, position.y, sway * 0.25 * intoScreen, aGrass.y);",
            "vGust = gust;",
            /* Light, shadow and cloud are all taken at the base, so the tuft matches the ground it grows from */
            "transformed = vec3(0.0);",
          ].join("\n")
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D leafTex;\nuniform sampler2D accentTex;\nvarying vec4 vGrass;\nvarying float vGust;\nvarying float vPress;")
        .replace(
          "#include <alphatest_fragment>",
          [
            "{",
            "  vec2 leafUv = vGrass.xy;",
            "  leafUv.x = clamp((leafUv.x - 0.5) * (leafUv.y * vGrass.z + 1.0) + 0.5, 0.0, 1.0);",
            "  float leaf = vGrass.w > 0.5 ? texture2D(accentTex, leafUv).a : texture2D(leafTex, leafUv).a;",
            "  if (leaf < 0.5) discard;",
            "  float tip = smoothstep(0.15, 0.95, vGrass.y);",
            "  diffuseColor.rgb *= (mix(0.8, 1.14, tip) + vGust * tip * 0.12) * (1.0 - vPress * 0.06);",
            "}",
          ].join("\n")
        )
        /* Alpha 0.99 marks grass for the edge pass (world.js post), which skips crease highlights on blades */
        .replace("#include <dithering_fragment>", "#include <dithering_fragment>\ngl_FragColor.a = 0.99;");
    };
    material.customProgramCacheKey = () => "grass-cards-phase";
    atmos(material);

    /* One instanced mesh per square of the island. Cards face the camera and bend in the shader, so the bounds are
       the card roots plus the tallest card's reach rather than the instanced plane. */
    const tufts = new THREE.Group();
    const squares = new Map();
    for (const c of cards) {
      const key = `${Math.floor(c.x / CULL_CELL)},${Math.floor(c.z / CULL_CELL)}`;
      if (!squares.has(key)) squares.set(key, []);
      squares.get(key).push(c);
    }
    for (const [key, group] of squares) {
      const geometry = new THREE.BufferGeometry();
      geometry.setIndex(card.index);
      ["position", "normal", "uv"].forEach((name) => geometry.setAttribute(name, card.attributes[name]));
      const seeds = new Float32Array(group.length * 2);
      group.forEach((c, k) => seeds.set([rand(c.x * 1.3, c.z * 4.1), c.kind], k * 2));
      geometry.setAttribute("aGrass", new THREE.InstancedBufferAttribute(seeds, 2));
      const mesh = new THREE.InstancedMesh(geometry, material, group.length);
      const box = new THREE.Box3();
      group.forEach((c, k) => {
        const s = (c.kind ? 0.58 : 0.5) * (0.88 + rand(c.x * 9.7, c.z * 0.3) * 0.24);
        mesh.setMatrixAt(k, at(c.x, c.y - 0.03, c.z, { s }));
        mesh.setColorAt(k, c.colour);
        box.expandByPoint(new THREE.Vector3(c.x, c.y, c.z));
      });
      mesh.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      mesh.boundingSphere.radius += 1.2;
      mesh.receiveShadow = true;
      mesh.name = `grass ${key}`;
      tufts.add(mesh);
    }
    tufts.name = "grass";
    if (!kit) root.add(tufts);
  }

  /* Floating rocks drift around the island, the way the concept board has them */
  const floaters = [[-21, -12, 9, 1.3], [16, -17, 12, 1], [23, 6, 7, 0.8], [-29, 1, 9, 0.9], [7, -22, 14, 1.1]].map(([u, v, y, s], k) => {
    const [x, z] = uvToXZ(...MAP.lay(u, v));
    const piece = makeBake({ dry: true });
    piece.add(G.rock[k % 3], ISLE.rock, at(0, -0.6, 0, { sx: 1.2, sy: 1.4, sz: 1.1 }));
    piece.add(G.cone, ISLE.rockDeep, at(0, -1.6, 0, { rx: Math.PI, sx: 0.9, sy: 1.6, sz: 0.85 }));
    piece.add(G.oct, ISLE.grass, at(0, 0.05, 0, { sx: 1.05, sy: 0.3, sz: 0.95 }));
    const leafPiece = makeBake({ dry: true });
    if (k % 2 === 0) {
      piece.put(pines[k % 2].core, at(0.1, 0.15, 0, { s: 0.5 }));
      leafPiece.put(pines[k % 2].leaves, at(0.1, 0.15, 0, { s: 0.5 }));
    }
    const mesh = piece.build(painted);
    const leaves = leafPiece.build(leafMaterial);
    if (leaves) mesh.add(leaves);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(s);
    mesh.rotation.y = k;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    root.add(mesh);
    return { mesh, base: y, phase: k * 1.3 };
  });

  const glslNoise = [
    "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }",
  ].join("\n");
  /* The stream: flat runs of flowing water on each level, and a falling sheet wherever the ground drops */
  const flowUniforms = { time: { value: 0 }, waterLight };
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
          "uniform float time; uniform vec3 waterLight; varying vec2 vUv; varying float vFall;",
          glslNoise,
          "void main(){",
          "  float speed = mix(1.1, 3.2, vFall);",
          "  float n = noise(vec2(vUv.x * mix(4.0, 9.0, vFall), vUv.y * mix(1.2, 0.7, vFall) - time * speed));",
          "  float streak = smoothstep(0.52, 0.78, n);",
          "  float edge = smoothstep(0.62, 1.0, abs(vUv.x * 2.0 - 1.0));",
          "  vec3 base = mix(vec3(0.36, 0.7, 0.92), vec3(0.62, 0.86, 0.98), vFall);",
          "  vec3 col = mix(base, vec3(1.0), clamp(streak * mix(0.5, 0.9, vFall) + edge * 0.7, 0.0, 1.0));",
          "  float alpha = mix(0.9, 0.86, vFall) * (1.0 - smoothstep(0.9, 1.0, abs(vUv.x * 2.0 - 1.0)) * 0.6);",
          "  gl_FragColor = vec4(col * waterLight, alpha);",
          "}",
        ].join("\n"),
      })
    );
    stream.renderOrder = 2;
    stream.name = "stream";
    if (!kit) root.add(stream);
  }

  /* White water where each fall lands */
  const splashMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, toneMapped: false });
  const puffs = [];
  splashes.forEach((p, s) => {
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * Math.PI * 2 + s;
      const mesh = new THREE.Mesh(G.ico, splashMat);
      mesh.position.set(p.x + Math.cos(a) * 0.55, p.y + 0.1, p.z + Math.sin(a) * 0.55);
      if (!kit) root.add(mesh);
      puffs.push({ mesh, phase: k * 1.1 + s, size: 0.22 + rand(k, s) * 0.16 });
    }
  });

  /* Bake it all */
  const meshesOf = (object, fn) => object.traverse((o) => o.isMesh && fn(o));
  const props = bake.build(windSway(paintedProps), { cell: kit ? 0 : CULL_CELL, reach: 1.2 });
  meshesOf(props, (mesh) => Object.assign(mesh, { castShadow: true, receiveShadow: true }));
  props.name = "props";
  root.add(props);
  const glows = glowBake.build(glowing);
  if (glows) {
    glows.name = "glows";
    root.add(glows);
  }
  {
    const leaves = leafBake.build(leafMaterial, { cell: CULL_CELL, reach: 1.6 });
    if (leaves && !kit) {
      meshesOf(leaves, (mesh) => Object.assign(mesh, { castShadow: true, receiveShadow: true, customDepthMaterial: leafDepth }));
      leaves.name = "leaves";
      root.add(leaves);
    }
  }

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

  /* Light pools: lanterns low enough that the ground under them is lit, the campfire wider */
  const lampSpots = [
    ...lanterns.map((p) => [p.x, p.y - 1.4, p.z, 3.4]),
    ...fires.map((f) => [f.position.x, f.position.y + 0.9, f.position.z, 3.6]),
  ].slice(0, LAMPS);
  lampSpots.forEach(([x, y, z, r], k) => lampLights.value[k].set(x, y, z, r));
  lampCount.value = lampSpots.length;
  const lampView = new THREE.Frustum();
  const lampMatrix = new THREE.Matrix4();
  const lampSphere = new THREE.Sphere();

  /* Halos: phones draw straight to the screen without bloom, so soft additive sprites stand in for the glow around
     lanterns, the campfire and the shrine inlay. Hidden while bloom is on. */
  const halos = new THREE.Group();
  halos.name = "halos";
  halos.visible = false;
  if (!kit) root.add(halos);
  let fireHalos = [];
  if (!kit) {
  const haloTexture = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.45)");
    g.addColorStop(0.6, "rgba(255,255,255,0.12)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();
  const haloMaterial = (color, opacity) =>
    new THREE.SpriteMaterial({ map: haloTexture, color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const lanternHalo = haloMaterial("#ffb45c", 0.6);
  lanterns.forEach((p) => {
    const s = new THREE.Sprite(lanternHalo);
    s.position.copy(p);
    s.scale.setScalar(1.5);
    halos.add(s);
  });
  fireHalos = fires.map((f) => {
    const s = new THREE.Sprite(haloMaterial("#ff8a30", 0.7));
    s.position.copy(f.position).y += 0.55;
    s.scale.setScalar(3);
    halos.add(s);
    return s;
  });
  {
    const inlay = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 6.4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: haloTexture, color: "#ffd873", opacity: 0.4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    );
    inlay.position.copy(shrine).y += 0.06;
    halos.add(inlay);
  }
  }

  /* Everything that moves on its own. rainHits = flat [x,z,x,z,…] from world-rain. Wind sway is not driven here:
     world.js copies the climate's wind phase into windTime. `pinned` freezes clouds and water for review shots. */
  const motion = { pinned: null };
  const update = (dt, clock, robot, renderer, rainHits, camera) => {
    const time = motion.pinned ?? clock;
    if (halos.visible) fireHalos.forEach((s, k) => s.scale.setScalar(3 * (1 + Math.sin(time * 11 + k) * 0.06 + Math.sin(time * 6.3) * 0.05)));
    trail.step(renderer, dt, robot, rainHits);
    /* Only lamps whose light reaches the view go to the shaders, packed first, so the per-pixel loop stops after them */
    if (camera) lampView.setFromProjectionMatrix(lampMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let shown = 0;
    lampSpots.forEach(([x, y, z, r], k) => {
      const fire = k >= lanterns.length ? Math.sin(time * 17 + k) * 0.035 + Math.sin(time * 9.3) * 0.03 : 0;
      const reach = r * (1 + Math.sin(time * 7.1 + k * 1.7) * 0.02 + Math.sin(time * 12.3 + k) * 0.012 + fire);
      lampSphere.center.set(x, y, z);
      lampSphere.radius = reach;
      if (camera && !lampView.intersectsSphere(lampSphere)) return;
      lampLights.value[shown].set(x, y, z, reach);
      shown += 1;
    });
    lampCount.value = shown;
    flowUniforms.time.value = time;
    splashMat.color.copy(waterLight.value);
    beamMat.uniforms.time.value = time;
    atmosTime.value = time;
    if (robot) player.copy(robot);
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
    beam,
    beamMat,
    shrine,
    lanterns,
    halos,
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
    motion,
  };
}
