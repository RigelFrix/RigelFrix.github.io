/* The island's layout, with no three.js in it so it can be previewed on its own (.impeccable/tools/map-preview.html).
   Shapes are authored in screen terms: u runs to the right of the screen, v toward the camera (down the screen).
   World x/z come from toXZ; the iso camera sits at +x +z. Higher ground sits further back so cliffs never hide Niko. */

import { parts as groundParts } from "./world-ground.js";

const S = Math.SQRT1_2;
export const toUV = (x, z) => [(x - z) * S, (x + z) * S];
export const toXZ = (u, v) => [(u + v) * S, (v - u) * S];

/* The layout below is authored at a compact size and spread by K, so places, paths and open ground grow while
   anything given as a width (paths, stairs, decks, the stream) keeps its size next to Niko. Hand-placed props and
   stops elsewhere use `lay` to land on the same spread layout. */
export const K = 1.32;
export const lay = (u, v) => [u * K, v * K];
const layAll = (points) => points.map(([u, v]) => lay(u, v));

export const LEVEL = { beach: 0.5, low: 3, mid: 5.6, top: 8.2 };

/* Value noise, hashed so the same point always gives the same answer */
const hash = (x, y) => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
};
const smooth = (t) => t * t * (3 - 2 * t);
const noise = (x, y) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
};
export const fbm = (x, y) => noise(x, y) * 0.57 + noise(x * 2.03 + 5.2, y * 2.03 + 1.3) * 0.29 + noise(x * 4.1 + 9.7, y * 4.1 + 3.1) * 0.14;
export const rand = hash;

const ell = (cu, cv, ru, rv) => {
  [cu, cv, ru, rv] = [cu * K, cv * K, ru * K, rv * K];
  return (u, v) => (Math.hypot((u - cu) / ru, (v - cv) / rv) - 1) * Math.min(ru, rv);
};

/* Terraces: the highest region a point falls in sets its height. `wobble` roughens the outline. */
const regions = [
  { name: "meadow", h: LEVEL.low, wobble: 2.2, seed: 1, parts: [ell(3, 1.5, 15, 8.5), ell(-6.5, -3, 8, 6.5), ell(11, -4.5, 7.5, 7.5)], cut: [ell(10.8, 6.4, 4, 4.4)] },
  /* Lower island: the old beach footprint, kept so the cliff under the meadow does not move, plus the
     spawn extensions listed in world-ground.js. Flat grass, no sand shelf. */
  {
    name: "ground",
    h: LEVEL.beach,
    flat: true,
    wobble: 1.6,
    seed: 2,
    parts: [ell(-10, 10.6, 10.8, 7.2), ell(0.4, 14.6, 8.4, 4), ell(-17.2, 2.6, 4.6, 5.6), ell(-15.4, 6.4, 5.4, 4.2), ...groundParts.map((p) => ell(...p))],
  },
  { name: "plateau", h: LEVEL.mid, wobble: 2, seed: 3, parts: [ell(-11.5, -6, 6.2, 5.4)] },
  { name: "ruins", h: LEVEL.mid, wobble: 1.6, seed: 4, parts: [ell(0.5, -7.6, 7, 3.4)] },
  { name: "cliffside", h: LEVEL.mid, wobble: 1.6, seed: 5, parts: [ell(11.6, -7.4, 7.4, 6.4)] },
  { name: "shrine", h: LEVEL.top, wobble: 1.4, seed: 6, parts: [ell(-1, -14.6, 7.2, 4.6)] },
];

/* Stairs ramp the height between two levels across a rectangle from a (bottom) to b (top) */
export const stairs = [
  { a: [-7.8, 11.8], b: [-6.6, 6.4], w: 1.35, from: LEVEL.beach, to: LEVEL.low },
  { a: [-7.4, 2.4], b: [-8.6, -2.6], w: 1.35, from: LEVEL.low, to: LEVEL.mid },
  { a: [0.6, 0.6], b: [0.6, -4.8], w: 1.45, from: LEVEL.low, to: LEVEL.mid, arch: true },
  { a: [-0.6, -7.4], b: [-0.9, -10.9], w: 1.45, from: LEVEL.mid, to: LEVEL.top, arch: true },
].map((s) => {
  const [a, b] = layAll([s.a, s.b]);
  const du = b[0] - a[0];
  const dv = b[1] - a[1];
  const len = Math.hypot(du, dv);
  return { ...s, a, b, len, dir: [du / len, dv / len] };
});

const inStair = (s, u, v) => {
  const pu = u - s.a[0];
  const pv = v - s.a[1];
  const t = (pu * s.dir[0] + pv * s.dir[1]) / s.len;
  const side = Math.abs(pu * s.dir[1] - pv * s.dir[0]);
  return t >= 0 && t <= 1 && side <= s.w ? t : -1;
};

/* The bridge over the stream. The lower island is solid ground, so it has no dock. */
export const platforms = [
  { name: "bridge", a: [6.2, -6.2], b: [9.4, -6.6], w: 1.05, h: LEVEL.mid + 0.32 },
].map((p) => {
  const [a, b] = layAll([p.a, p.b]);
  const du = b[0] - a[0];
  const dv = b[1] - a[1];
  const len = Math.hypot(du, dv);
  return { ...p, a, b, len, dir: [du / len, dv / len] };
});

/* Round decks: the shrine's dais, where Rigel lands */
export const dais = { c: lay(-1, -14.4), r: 3.9, h: LEVEL.top + 0.32 };

export const platformAt = (u, v) => {
  for (const p of platforms) {
    if (inStair(p, u, v) >= 0) return p;
  }
  if (Math.hypot(u - dais.c[0], v - dais.c[1]) <= dais.r) return dais;
  return null;
};

/* The stream runs from the foot of the shrine cliff, across the cliffside, and drops twice into the lagoon */
export const river = { w: 0.75, points: layAll([[5.6, -11.6], [6.6, -9.2], [7.7, -6.4], [8.4, -3.6], [9.2, -0.6], [9.9, 2.6], [10.3, 5.2]]) };

const segDist = (u, v, a, b) => {
  const du = b[0] - a[0];
  const dv = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((u - a[0]) * du + (v - a[1]) * dv) / (du * du + dv * dv)));
  return Math.hypot(u - a[0] - du * t, v - a[1] - dv * t);
};
const lineDist = (points, u, v) => {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) best = Math.min(best, segDist(u, v, points[i - 1], points[i]));
  return best;
};
export const riverDist = (u, v) => lineDist(river.points, u, v);

/* Footpaths: dirt in the grass, kept clear of trees */
export const paths = [
  [[-13.4, 13.2], [-10.6, 12], [-7.8, 11.8]],
  [[-10.6, 12], [-6.4, 13.6], [-2.4, 16.8]],
  [[-10.6, 12], [-14.6, 7.4], [-17, 3.4]],
  [[-6.6, 6.4], [-7.2, 4.2], [-7.4, 2.4]],
  [[-6.6, 6.4], [-3, 4.6], [0.6, 0.6]],
  [[-3, 4.6], [1.8, 6.6], [5.6, 6.2]],
  [[-8.6, -2.6], [-10.2, -4.2], [-11.6, -5.2]],
  [[-8.6, -2.6], [-6.6, -5.2]],
  [[0.6, -4.8], [-0.4, -6.2], [-0.6, -7.4]],
  [[0.6, -4.8], [3.4, -5.8], [6.2, -6.2]],
  [[9.4, -6.6], [11.6, -7.2], [13.2, -8]],
  [[-0.9, -10.9], [-1, -14.4]],
  [[-10.6, 12], [-13.4, 14.4], [-16.2, 16.4]],
].map(layAll);
export const pathDist = (u, v) => {
  let best = Infinity;
  for (const p of paths) best = Math.min(best, lineDist(p, u, v));
  return best;
};

/* Named spots (u, v) the world uses: Niko's landing, the stops, the boat */
export const spots = {
  landing: [-10.4, 10.6],
  shrine: [-1, -14.4],
  camp: [-9.8, -4.6],
  hut: [-12.6, -7.4],
  skills: [-7.6, -6.6],
  career: [3.6, -8],
  games: [13.2, -8],
  resume: [-4.6, -13.6],
  mail: [-18.3, 19.5],
  boat: [-21.7, 19.3],
  shack: [-15.4, 9.8],
  cove: [-17.4, 2.6],
};
for (const key in spots) spots[key] = lay(...spots[key]);

/* Height of the terrain (not decks) at u, v, and which region it belongs to */
export const terrainAtUV = (u, v) => {
  let h = -Infinity;
  let region = null;
  for (const r of regions) {
    let d = Infinity;
    for (const part of r.parts) d = Math.min(d, part(u, v));
    if (r.cut) for (const cut of r.cut) d = Math.max(d, -cut(u, v));
    d += (fbm((u / K) * 0.21 + r.seed * 17.3, (v / K) * 0.21 - r.seed * 9.1) - 0.5) * r.wobble * K;
    if (d >= 0) continue;
    const top = r.h;
    if (top > h) {
      h = top;
      region = r;
    }
  }
  if (region && !region.beach && !region.flat) h += (fbm(u * 0.5 + 40, v * 0.5) - 0.5) * 0.14;
  /* Open air under the island. -8 is below the rock skirt, and the terrain mesh leaves those cells out. */
  if (!region) h = -8;
  for (const s of stairs) {
    const t = inStair(s, u, v);
    if (t >= 0) return { h: s.from + (s.to - s.from) * t, region, stair: s };
  }
  return { h, region, stair: null };
};

export const heightAt = (x, z) => terrainAtUV(...toUV(x, z)).h;

/* Where Niko stands: the deck if there is one, else the ground */
export const groundAt = (x, z) => {
  const [u, v] = toUV(x, z);
  const deck = platformAt(u, v);
  const ground = terrainAtUV(u, v).h;
  return deck ? Math.max(deck.h, ground) : ground;
};

/* The grid the terrain mesh, nav and water all share */
export const GRID = { min: -44, size: 176, cell: 0.5 };
