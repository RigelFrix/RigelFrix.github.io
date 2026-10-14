/* The main island, built in code from the layout in world-map.js: terraced terrain with rock-column cliffs, a shaded
   sea with shore foam, a stream with two waterfalls, stairs and ruins up to the Star Shrine, a plateau camp, the
   beach dock and boat, trees, rocks and grass. Static pieces are baked into a few vertex-coloured meshes. Also owns
   the walk grid Niko paths on. */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as MAP from "./world-map.js";

/* Palette from the concept board: sky and water blues, nature greens, sand, rock greys, ruin tan, star gold */
export const ISLE = {
  sky: "#9fd3f5",
  water: "#3db0d6",
  waterDeep: "#2a7cc0",
  shallow: "#9cefe2",
  grass: "#8cbd57",
  grassDeep: "#649a40",
  grassTop: "#a2c962",
  grassSun: "#bcd566",
  grassShade: "#4d8a4c",
  moss: "#5a8a3a",
  sand: "#ecd49c",
  sandWet: "#d6b27a",
  seabed: "#4d9db8",
  dirt: "#c8a56e",
  rock: "#8e8c9a",
  rockDeep: "#6f6d7d",
  rockLight: "#a7a5b1",
  ruin: "#cdbfa3",
  ruinDeep: "#a99b82",
  wood: "#9a6842",
  woodDeep: "#6b472c",
  plank: "#bb8a5a",
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

/* Low poly: no shared vertices, flat normals, and a hashed wobble so seam duplicates move together */
const facet = (geometry, jitter = 0, seed = 0, upright = 1) => {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  Object.keys(g.attributes).forEach((name) => name !== "position" && g.deleteAttribute(name));
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
  g.computeVertexNormals();
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

/* Collects coloured pieces and merges them into one mesh */
const makeBake = () => {
  const list = [];
  return {
    add(geometry, color, matrix, shade = 0, grade = null) {
      const g = paint(geometry, color, shade);
      if (grade) gradeY(g, ...grade);
      g.applyMatrix4(matrix);
      list.push(g);
    },
    put(geometry, matrix) {
      const g = geometry.clone();
      g.applyMatrix4(matrix);
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
};

const combine = (parts) => {
  const merged = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return merged;
};

/* Tree and plant models, each one coloured geometry */
const pineGeo = (dark, light) =>
  gradeY(
    combine([
      paint(G.hex, ISLE.woodDeep).applyMatrix4(at(0, 0.45, 0, { sx: 0.13, sy: 0.9, sz: 0.13 })),
      paint(G.cone, dark).applyMatrix4(at(0, 1.25, 0, { sx: 1.05, sy: 1.35, sz: 1.05 })),
      paint(G.cone, light).applyMatrix4(at(0, 1.95, 0, { sx: 0.82, sy: 1.15, sz: 0.82, ry: 0.4 })),
      paint(G.cone, dark).applyMatrix4(at(0, 2.6, 0, { sx: 0.56, sy: 0.95, sz: 0.56, ry: 0.9 })),
    ]),
    0.62,
    1.12
  );
const roundTreeGeo = (seed) =>
  gradeY(
    combine([
      paint(G.hex, ISLE.wood).applyMatrix4(at(0, 0.6, 0, { sx: 0.14, sy: 1.2, sz: 0.14 })),
      paint(G.blob[seed % 3], ISLE.leaf).applyMatrix4(at(0, 1.75, 0, { s: 0.95 })),
      paint(G.blob[(seed + 1) % 3], ISLE.leafLight).applyMatrix4(at(0.42, 2.15, 0.2, { s: 0.62 })),
      paint(G.blob[(seed + 2) % 3], ISLE.leaf, -0.04).applyMatrix4(at(-0.4, 1.55, 0.28, { s: 0.58 })),
    ]),
    0.62,
    1.12
  );
const bushGeo = (seed) =>
  gradeY(
    combine([
      paint(G.blob[seed % 3], ISLE.leaf, -0.03).applyMatrix4(at(0, 0.38, 0, { s: 0.55 })),
      paint(G.blob[(seed + 1) % 3], ISLE.leafLight).applyMatrix4(at(0.38, 0.3, 0.12, { s: 0.4 })),
      paint(G.blob[(seed + 2) % 3], ISLE.leaf).applyMatrix4(at(-0.34, 0.28, 0.16, { s: 0.38 })),
    ]),
    0.7,
    1.1
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

/* Atmosphere on every lit surface: big soft cloud shadows drift over the island, and ground near the sea sinks
   into a cool blue haze, so the levels read as height. */
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
          "  float shade = smoothstep(0.55, 0.7, cloud);",
          "  outgoingLight *= mix(vec3(1.0), vec3(0.72, 0.79, 0.94), shade * 0.8);",
          "  float low = 1.0 - smoothstep(-1.2, 3.4, vAtmos.y);",
          "  outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.66, 0.8, 0.98) + vec3(0.02, 0.06, 0.1), low * 0.6);",
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
  const ramp = new THREE.DataTexture(new Uint8Array([74, 92, 186, 236, 255]), 5, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.LinearFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  const painted = atmos(withRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp }), 0.16));
  const paintedProps = atmos(occlude(withRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp }), 0.16)));
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
  const groundColour = (x, y, z, ny) => {
    const [u, v] = MAP.toUV(x, z);
    const t = MAP.terrainAtUV(u, v);
    const grain = MAP.fbm(u * 0.35 + 11, v * 0.35 - 4);
    const { up, down } = relief(x, z, y);
    if (ny < 0.62) {
      mixC(ISLE.rock, ISLE.rockDeep, grain * 1.2 - 0.1 + (y < 1 ? 0.35 : 0));
    } else if (t.stair) {
      mixC(ISLE.ruin, ISLE.ruinDeep, grain);
    } else if (y < 1.1 && (t.region?.beach || y < 0.7 || !t.region)) {
      if (y < -0.08) mixC(ISLE.sandWet, ISLE.seabed, -y / 2.2);
      else mixC(ISLE.sand, ISLE.sandWet, (0.45 - y) * 2 + grain * 0.3);
    } else {
      const top = t.region?.h >= MAP.LEVEL.top ? 0.35 : t.region?.h >= MAP.LEVEL.mid ? 0.15 : 0;
      mixC(ISLE.grassDeep, ISLE.grass, grain * 1.4 - 0.2 + top);
      if (top > 0.3) colour.lerp(tint.set(ISLE.grassTop), 0.25);
      /* Meadow patches: sunny yellow-green swathes and deeper cool ones, broader than the grain */
      const patch = MAP.fbm(u * 0.11 + 40, v * 0.11 - 13);
      colour.lerp(tint.set(ISLE.grassSun), smooth(patch, 0.5, 0.68) * 0.55);
      colour.lerp(tint.set(ISLE.grassShade), smooth(-patch, -0.44, -0.28) * 0.5);
      if (ny < 0.85) colour.lerp(tint.set(ISLE.moss), 0.6);
      const path = MAP.pathDist(u, v) - (grain - 0.5) * 0.5;
      if (path < 0.62) colour.lerp(tint.set(ISLE.dirt), path < 0.45 ? 0.85 : 0.45);
      if (t.region?.h >= MAP.LEVEL.top && Math.hypot(u - shrineAt[0], v - shrineAt[1]) < 5.2) colour.lerp(tint.set(ISLE.ruin), 0.55);
      const plaza = Math.hypot(u - plazaAt[0], v - plazaAt[1]) - (grain - 0.5) * 0.8;
      if (plaza < 2.9) colour.lerp(tint.set(plaza < 2.2 && rand(Math.round(u * 1.4), Math.round(v * 1.4)) > 0.3 ? ISLE.ruin : ISLE.dirt), 0.7);
      const camp = Math.hypot(u - campAt[0], v - campAt[1]) - (grain - 0.5) * 1.2;
      if (camp < 2.6) colour.lerp(tint.set(ISLE.dirt), camp < 1.8 ? 0.7 : 0.35);
      if (MAP.riverDist(u, v) < MAP.river.w + 0.2) colour.set(ISLE.seabed);
      /* Sunlit lips on every drop */
      if (down > 0.9) colour.lerp(tint.set(ISLE.grassTop), 0.3).offsetHSL(0.01, 0, 0.03);
    }
    /* Cool occlusion where a cliff rises over the ground */
    const ao = smooth(up, 0.5, 3.2);
    if (ao > 0) colour.multiply(tint.setRGB(1 - ao * 0.38, 1 - ao * 0.3, 1 - ao * 0.16));
    colour.offsetHSL(0, 0, (rand(x * 3.1, z * 2.7) - 0.5) * 0.035);
    return colour;
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
    const pos = [];
    const col = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const tri = (i0, i1, i2) => {
      a.set(px[i0], py[i0], pz[i0]);
      b.set(px[i1], py[i1], pz[i1]);
      c.set(px[i2], py[i2], pz[i2]);
      const ab = b.clone().sub(a);
      const ac = c.clone().sub(a);
      const normal = ac.cross(ab).normalize();
      const shade = groundColour((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3, Math.abs(normal.y));
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      for (let k = 0; k < 3; k += 1) col.push(shade.r, shade.g, shade.b);
    };
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        const k00 = j * n + i;
        const k10 = k00 + 1;
        const k01 = k00 + n;
        const k11 = k01 + 1;
        if (Math.max(py[k00], py[k10], py[k01], py[k11]) < -2.9) continue;
        if (Math.abs(py[k00] - py[k11]) <= Math.abs(py[k10] - py[k01])) {
          tri(k00, k01, k11);
          tri(k00, k11, k10);
        } else {
          tri(k00, k01, k10);
          tri(k10, k01, k11);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geometry.computeVertexNormals();
    terrain = new THREE.Mesh(geometry, painted);
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

  /* Boulders around the shore and in the shallows */
  for (let k = 0; k < 70; k += 1) {
    const x = min + rand(k * 3.3, 1.7) * span;
    const z = min + rand(k * 1.9, 8.1) * span;
    const [i, j] = cellOf(x, z);
    const h = hAt(i, j);
    if (h > 0.25 || h < -1.6) continue;
    const s = 0.35 + rand(k, 4.4) * 0.7;
    bake.add(G.rock[k % 3], k % 4 ? ISLE.rock : ISLE.rockDeep, at(x, h + s * 0.25, z, { ry: k, sx: s * 1.2, sy: s * 0.8, sz: s }), 0, [0.7, 1.08]);
  }

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

  /* Decks: the dock and pier on posts, the bridge with its rails */
  MAP.platforms.forEach((p) => {
    const [dx, dz] = worldDir(p.dir);
    const ry = Math.atan2(dx, dz);
    const boards = Math.round(p.len / 0.34);
    for (let k = 0; k < boards; k += 1) {
      const t = (k + 0.5) / boards;
      const [x, z] = uvToXZ(p.a[0] + p.dir[0] * p.len * t, p.a[1] + p.dir[1] * p.len * t);
      bake.add(G.box, k % 3 ? ISLE.plank : ISLE.wood, at(x, p.h - 0.06 + (rand(k, p.len) - 0.5) * 0.03, z, { ry: ry + (rand(p.len, k) - 0.5) * 0.06, sx: p.w * 2, sy: 0.12, sz: 0.3 }), (rand(k, 2) - 0.5) * 0.06);
    }
    const posts = Math.max(2, Math.round(p.len / 1.6) + 1);
    for (let k = 0; k < posts; k += 1) {
      const t = k / (posts - 1);
      [-1, 1].forEach((side) => {
        const off = p.w - 0.05;
        const [x, z] = uvToXZ(p.a[0] + p.dir[0] * p.len * t + p.dir[1] * off * side, p.a[1] + p.dir[1] * p.len * t - p.dir[0] * off * side);
        const bottom = p.name === "bridge" ? p.h - 1.2 : -1.6;
        const top = p.name === "bridge" ? p.h + 0.75 : p.h + (k % 2 ? 0.1 : 0.4);
        bake.add(G.hex, ISLE.woodDeep, at(x, (top + bottom) / 2, z, { sx: 0.11, sz: 0.11, sy: top - bottom }));
      });
    }
    if (p.name === "bridge") {
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
      const r = 5.3 + rand(k, 2) * 0.5;
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

  /* Plateau camp: campfire, fence along the drop, crates, barrels and lantern posts */
  const fires = [];
  {
    const fire = groundUV(-9.9, -7.1);
    for (let k = 0; k < 7; k += 1) {
      const a = (k / 7) * Math.PI * 2;
      bake.add(G.rock[k % 3], ISLE.rockDeep, at(fire.x + Math.cos(a) * 0.62, fire.h + 0.08, fire.z + Math.sin(a) * 0.62, { s: 0.2 }));
    }
    [0, 1.1, 2.2].forEach((a) => bake.add(G.hex, ISLE.woodDeep, at(fire.x, fire.h + 0.14, fire.z, { ry: a, rz: Math.PI / 2, sx: 0.08, sy: 0.9, sz: 0.08 })));
    const flame = new THREE.Group();
    flame.position.set(fire.x, fire.h + 0.2, fire.z);
    [["#ff8a3c", 0.32, 0.8], ["#ffd36a", 0.2, 0.55]].forEach(([c, r, hgt]) => {
      const m = new THREE.Mesh(G.cone, new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
      m.scale.set(r, hgt, r);
      m.position.y = hgt / 2;
      flame.add(m);
    });
    root.add(flame);
    fires.push(flame);
    block(fire.x, fire.z, 0.75);
  }

  const fence = (points, level) => {
    for (let k = 1; k < points.length; k += 1) {
      const [u0, v0] = points[k - 1];
      const [u1, v1] = points[k];
      const steps = Math.max(1, Math.round(Math.hypot(u1 - u0, v1 - v0) / 1.3));
      for (let s = 0; s <= steps; s += 1) {
        const p = groundUV(lerp(u0, u1, s / steps), lerp(v0, v1, s / steps));
        if (Math.abs(p.h - level) > 0.35) continue;
        bake.add(G.box, ISLE.woodDeep, at(p.x, p.h + 0.45, p.z, { ry: 0.785, sx: 0.13, sy: 0.9, sz: 0.13 }));
        block(p.x, p.z, 0.25);
        if (s === steps) continue;
        const q = groundUV(lerp(u0, u1, (s + 1) / steps), lerp(v0, v1, (s + 1) / steps));
        if (Math.abs(q.h - level) > 0.35) continue;
        const ry = Math.atan2(q.x - p.x, q.z - p.z);
        const len = Math.hypot(q.x - p.x, q.z - p.z);
        [0.35, 0.7].forEach((y) => bake.add(G.box, ISLE.wood, at((p.x + q.x) / 2, p.h + y, (p.z + q.z) / 2, { ry, sx: 0.07, sy: 0.09, sz: len })));
        for (let f = 0.25; f < 1; f += 0.25) {
          block(lerp(p.x, q.x, f), lerp(p.z, q.z, f), 0.25);
        }
      }
    }
  };
  fence([[-17.2, -5.4], [-16.2, -2.6], [-13.8, -1.4], [-11.2, -1.2]], MAP.LEVEL.mid);
  const crate = (u, v, s = 1, turn = 0) => {
    const p = groundUV(u, v);
    bake.add(G.box, ISLE.wood, at(p.x, p.h + 0.4 * s, p.z, { ry: turn, s: 0.8 * s }));
    [-0.3, 0.3].forEach((y) => bake.add(G.box, ISLE.woodDeep, at(p.x, p.h + (0.4 + y) * s, p.z, { ry: turn, sx: 0.84 * s, sy: 0.09 * s, sz: 0.84 * s })));
    block(p.x, p.z, 0.6 * s);
  };
  const barrel = (u, v, s = 1) => {
    const p = groundUV(u, v);
    bake.add(G.oct, ISLE.wood, at(p.x, p.h + 0.45 * s, p.z, { sx: 0.36 * s, sz: 0.36 * s, sy: 0.9 * s }));
    [0.18, 0.72].forEach((y) => bake.add(G.oct, ISLE.woodDeep, at(p.x, p.h + y * s, p.z, { sx: 0.385 * s, sz: 0.385 * s, sy: 0.08 * s })));
    block(p.x, p.z, 0.45 * s);
  };
  const lanterns = [];
  const lantern = (u, v) => {
    const p = groundUV(u, v);
    if (p.h < 0.2) return;
    bake.add(G.box, ISLE.woodDeep, at(p.x, p.h + 0.9, p.z, { sx: 0.12, sy: 1.8, sz: 0.12 }));
    bake.add(G.box, ISLE.woodDeep, at(p.x + 0.2, p.h + 1.76, p.z - 0.2, { ry: 0.785, sx: 0.08, sy: 0.08, sz: 0.62 }));
    bake.add(G.box, ISLE.woodDeep, at(p.x + 0.36, p.h + 1.66, p.z - 0.36, { sx: 0.3, sy: 0.06, sz: 0.3 }));
    glowBake.add(G.box, "#ffd98a", at(p.x + 0.36, p.h + 1.46, p.z - 0.36, { sx: 0.2, sy: 0.32, sz: 0.2 }));
    lanterns.push(new THREE.Vector3(p.x + 0.36, p.h + 1.46, p.z - 0.36));
    block(p.x, p.z, 0.3);
  };

  crate(-15.6, -8.4, 1, 0.3);
  crate(-15.9, -7.3, 0.7, 0.9);
  barrel(-14.9, -9.4);
  barrel(-14.2, -9.8, 0.85);
  crate(-10.3, 11.6, 0.9, 0.2);
  crate(-9.4, 12.2, 0.7, 1.1);
  barrel(-12.4, 11.2);
  [[-6.8, 4.6], [-5.2, 2.3], [-9.9, -2.4], [1.9, 1.4], [-2.4, -6.2], [1.4, -11.8], [-3.6, -11.6], [5.4, -5.2], [-12.2, 12.6]].forEach(([u, v]) => lantern(u, v));

  /* Beach stall: posts and a striped awning */
  {
    const p = groundUV(-4.6, 9.4);
    const ry = 0.785;
    [[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.6], [0.9, 0.6]].forEach(([a, b]) => {
      const x = p.x + Math.cos(ry) * a + Math.sin(ry) * b;
      const z = p.z - Math.sin(ry) * a + Math.cos(ry) * b;
      bake.add(G.box, ISLE.woodDeep, at(x, p.h + 0.9, z, { sx: 0.1, sy: 1.8 + (b < 0 ? 0.3 : 0), sz: 0.1 }));
    });
    for (let k = 0; k < 5; k += 1) {
      bake.add(G.box, k % 2 ? ISLE.cloth : ISLE.clothRed, at(p.x + Math.cos(ry) * (-0.8 + k * 0.4), p.h + 1.95, p.z - Math.sin(ry) * (-0.8 + k * 0.4), { ry, rx: -0.25, sx: 0.4, sy: 0.06, sz: 1.5 }));
    }
    bake.add(G.box, ISLE.plank, at(p.x, p.h + 0.75, p.z, { ry, sx: 1.9, sy: 0.12, sz: 0.8 }));
    bake.add(G.box, ISLE.wood, at(p.x, p.h + 0.4, p.z, { ry, sx: 1.8, sy: 0.7, sz: 0.7 }));
    block(p.x, p.z, 1.15);
  }

  /* Ruins: broken pillars and a fallen column along the path to the shrine */
  [[-4.4, -7.6, 3], [-5.6, -9.4, 2], [4.4, -9.8, 3], [2.4, -10.2, 1], [-3, -3.2, 2], [6.4, -12.4, 2], [-6.6, -13.2, 3]].forEach(([u, v, blocks], k) => {
    const p = groundUV(u, v);
    if (p.h < 2) return;
    for (let b = 0; b < blocks; b += 1) bake.add(G.oct, b % 2 ? ISLE.ruin : ISLE.ruinDeep, at(p.x, p.h + 0.4 + b * 0.78, p.z, { ry: b * 0.4, sx: 0.42, sz: 0.42, sy: 0.74 }));
    bake.add(G.oct, ISLE.ruinDeep, at(p.x, p.h + 0.1, p.z, { sx: 0.6, sz: 0.6, sy: 0.24 }));
    block(p.x, p.z, 0.65);
    if (k % 3 === 0) bake.add(G.oct, ISLE.ruin, at(p.x + 0.9, p.h + 0.3, p.z + 0.5, { rz: Math.PI / 2, ry: k, sx: 0.36, sz: 0.36, sy: 1.5 }));
  });

  /* The boat, moored by the pier; it bobs, so it keeps its own mesh */
  const boat = new THREE.Group();
  {
    const p = groundUV(...MAP.spots.boat);
    const hull = makeBake();
    const shape = new THREE.Shape();
    shape.moveTo(0, -1.9);
    shape.quadraticCurveTo(0.85, -1.1, 0.8, 0.6);
    shape.quadraticCurveTo(0.7, 1.5, 0, 1.7);
    shape.quadraticCurveTo(-0.7, 1.5, -0.8, 0.6);
    shape.quadraticCurveTo(-0.85, -1.1, 0, -1.9);
    const body = new THREE.ExtrudeGeometry(shape, { depth: 0.7, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1, curveSegments: 4 });
    body.rotateX(Math.PI / 2);
    hull.add(facet(body), ISLE.wood, at(0, 0.35, 0));
    hull.add(G.box, ISLE.plank, at(0, 0.38, 0.2, { sx: 1.3, sy: 0.06, sz: 2.4 }));
    hull.add(G.box, ISLE.clothRed, at(0, 0.5, -0.9, { sx: 1.1, sy: 0.22, sz: 0.4 }));
    hull.add(G.hex, ISLE.woodDeep, at(0, 2.2, 0.3, { sx: 0.07, sz: 0.07, sy: 3.8 }));
    hull.add(G.box, ISLE.woodDeep, at(0, 1.3, 0.1, { sx: 0.06, sy: 0.06, sz: 1.8 }));
    hull.add(G.box, ISLE.cloth, at(0, 2.2, -0.35, { rx: 0.12, sx: 0.04, sy: 1.8, sz: 1.1 }));
    hull.add(G.box, ISLE.star, at(0, 4.15, 0.3, { sx: 0.06, sy: 0.25, sz: 0.4 }));
    const mesh = hull.build(painted);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    boat.add(mesh);
    boat.position.set(p.x, 0, p.z);
    boat.rotation.y = 0.35;
    root.add(boat);
  }

  /* Trees, bushes, rocks and flowers, scattered with clear space for paths, stairs, decks, the stream and stops */
  const keepClear = [
    ...Object.values(MAP.spots).map(([u, v]) => ({ u, v, r: 3.4 })),
    { u: shrineAt[0], v: shrineAt[1], r: 7 },
    { u: plazaAt[0], v: plazaAt[1] + 1.2, r: 5 },
    ...clear.map(({ x, z, r }) => {
      const [u, v] = MAP.toUV(x, z);
      return { u, v, r };
    }),
  ];
  const pines = [pineGeo(ISLE.pine, ISLE.pineLight), pineGeo("#4a8a4c", "#6aa85e")];
  const rounds = [roundTreeGeo(0), roundTreeGeo(1)];
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
  scatter(
    1600,
    2.1,
    (t, u, v) => t.region && !t.region.beach && !t.region.stack && t.h > 2 && MAP.pathDist(u, v) > 1.6 && MAP.fbm(u * 0.16 + 3, v * 0.16) > 0.43,
    (x, h, z, k, u, v) => {
      const s = 0.8 + rand(k, 9) * 0.45;
      const round = t2(u, v);
      bake.put(round ? rounds[k % 2] : pines[k % 2], at(x, h - 0.05, z, { ry: rand(k, 3) * 6, s }));
      trees.push([x, z]);
      block(x, z, 0.5);
    }
  );
  function t2(u, v) {
    return MAP.fbm(u * 0.3 - 7, v * 0.3 + 2) > 0.55 && v > -10;
  }
  /* A pine on each sea stack, and a palm-ish round tree on the islet */
  [[15.5, 9.5], [20, -2.5], [-19.5, 1.5], [4.5, 12.6]].forEach(([u, v], k) => {
    const p = groundUV(u, v);
    bake.put(k === 3 ? rounds[0] : pines[k % 2], at(p.x, p.h - 0.05, p.z, { ry: k, s: k === 3 ? 0.9 : 0.75 }));
  });
  scatter(
    900,
    1.6,
    (t, u, v) => t.region && !t.region.stack && t.h > 0.3 && MAP.pathDist(u, v) > 1.1,
    (x, h, z, k) => {
      if (k % 3 === 0) {
        const s = 0.35 + rand(k, 1) * 0.4;
        bake.add(G.rock[k % 3], k % 2 ? ISLE.rock : ISLE.rockLight, at(x, h + s * 0.2, z, { ry: k, sx: s * 1.3, sy: s * 0.75, sz: s }));
        block(x, z, s * 0.9);
      } else if (h > 2) {
        bake.put(bushes[k % 2], at(x, h, z, { ry: k, s: 0.75 + rand(k, 4) * 0.5 }));
        block(x, z, 0.5);
      }
    }
  );
  scatter(
    1200,
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

  /* Grass tufts: instanced blades that sway in the wind and part around Niko */
  const player = new THREE.Vector3(999, 0, 999);
  const swayUniforms = { time: { value: 0 }, player: { value: player } };
  {
    const blade = (a, lean, h) =>
      paint(facet(new THREE.ConeGeometry(0.05, h, 3)), "#ffffff").applyMatrix4(at(Math.cos(a) * 0.08, h / 2, Math.sin(a) * 0.08, { rz: lean * Math.cos(a), rx: -lean * Math.sin(a) }));
    const tuftFlat = combine([blade(0, 0.3, 0.42), blade(2.1, 0.35, 0.34), blade(4.2, 0.25, 0.38), blade(1, 0.1, 0.3)]);
    const spots = [];
    scatter(coarse ? 1500 : 3200, 0.55, (t, u, v) => t.region && !t.region.beach && t.h > 0.8 && MAP.pathDist(u, v) > 0.55, (x, h, z) => spots.push([x, h, z]), false);
    const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.time = swayUniforms.time;
      shader.uniforms.player = swayUniforms.player;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float time;\nuniform vec3 player;")
        .replace(
          "#include <project_vertex>",
          [
            "vec4 mvPosition = vec4(transformed, 1.0);",
            "#ifdef USE_INSTANCING",
            "mvPosition = instanceMatrix * mvPosition;",
            "#endif",
            "float lift = max(transformed.y, 0.0);",
            "vec2 away = mvPosition.xz - player.xz;",
            "float dist = length(away);",
            "mvPosition.xz += away / max(dist, 0.001) * (1.0 - smoothstep(0.2, 1.1, dist)) * lift * 0.9;",
            "mvPosition.x += sin(time * 1.7 + mvPosition.x * 0.6 + mvPosition.z * 0.4) * 0.12 * lift;",
            "mvPosition.z += cos(time * 1.3 + mvPosition.x * 0.3) * 0.06 * lift;",
            "mvPosition = modelViewMatrix * mvPosition;",
            "gl_Position = projectionMatrix * mvPosition;",
          ].join("\n")
        );
    };
    material.customProgramCacheKey = () => "grass-sway";
    atmos(material);
    const tufts = new THREE.InstancedMesh(tuftFlat, material, spots.length);
    spots.forEach(([x, h, z], k) => {
      tufts.setMatrixAt(k, at(x, h - 0.02, z, { ry: rand(k, 7) * 6, s: 0.8 + rand(k, 3) * 0.7 }));
      tufts.setColorAt(k, groundColour(x, h, z, 1).offsetHSL(0.01, 0.06, 0.05 + (rand(k, 5) - 0.5) * 0.06));
    });
    tufts.receiveShadow = true;
    tufts.frustumCulled = false;
    root.add(tufts);
  }

  /* Floating rocks drift around the island, the way the concept board has them */
  const floaters = [[-21, -12, 9, 1.3], [16, -17, 12, 1], [23, 6, 7, 0.8], [-23, 13, 5.5, 0.9], [7, -22, 14, 1.1], [-8, 21, 4, 0.7]].map(([u, v, y, s], k) => {
    const [x, z] = uvToXZ(u, v);
    const piece = makeBake();
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
  for (let k = 0; k < size * size; k += 1) depthData[k] = Math.round(THREE.MathUtils.clamp(-hgrid[k], 0, 4) * 63.75);
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
    new THREE.PlaneGeometry(130, 130).rotateX(-Math.PI / 2),
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
        "  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);",
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
    boat.position.y = Math.sin(time * 1.1) * 0.06 - 0.05;
    boat.rotation.z = Math.sin(time * 0.9) * 0.035;
    boat.rotation.x = Math.sin(time * 0.7 + 1) * 0.02;
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
