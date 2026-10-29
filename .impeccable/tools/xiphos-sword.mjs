/* Builds an original low-poly xiphos (leaf-shaped bronze blade, worn iron hilt) as a standalone GLB.
   Hand-painted look from small baked textures; flat-shaded facets for the PS2/GameCube feel.
   Run from the repository root: node .impeccable/tools/xiphos-sword.mjs */
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import * as THREE from "../../vendor/three/three.module.min.js";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const output = "assets/models/xiphos-sword.glb";
const document = new Document();
const root = document.createScene("Xiphos");
const buffer = document.createBuffer();
const sceneNode = document.createNode("Xiphos");
root.addChild(sceneNode);

/* Seeded so the painted wear is the same on every build. */
let seed = 7;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const range = (a, b) => a + rand() * (b - a);

/* Blade texture: u runs edge to edge, v runs base (top row) to tip (bottom row). */
const bladeSvg = () => {
  const patina = [];
  for (let i = 0; i < 46; i += 1) {
    const x = range(14, 114);
    const y = range(0, 250) ** 1.08 * 0.94;
    const color = rand() < 0.55 ? "#4f8f7a" : rand() < 0.5 ? "#6fae94" : "#3e6f5f";
    patina.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${range(3, 13).toFixed(1)}" ry="${range(4, 18).toFixed(1)}" fill="${color}" opacity="${range(0.25, 0.6).toFixed(2)}"/>`);
  }
  const pits = [];
  for (let i = 0; i < 70; i += 1) {
    pits.push(`<circle cx="${range(10, 118).toFixed(1)}" cy="${range(0, 256).toFixed(1)}" r="${range(0.5, 1.6).toFixed(2)}" fill="#3d2a18" opacity="${range(0.25, 0.55).toFixed(2)}"/>`);
  }
  const scratches = [];
  for (let i = 0; i < 26; i += 1) {
    const x = range(8, 120);
    const y = range(0, 250);
    const len = range(6, 22);
    const tilt = range(-0.5, 0.5);
    scratches.push(`<path d="M${x.toFixed(1)} ${y.toFixed(1)} l${(len * tilt).toFixed(1)} ${len.toFixed(1)}" stroke="#f6dca2" stroke-width="${range(0.4, 1).toFixed(2)}" opacity="${range(0.2, 0.45).toFixed(2)}"/>`);
  }
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="128" height="256" viewBox="0 0 128 256">
    <defs>
      <linearGradient id="bronze" x1="0" x2="1">
        <stop stop-color="#f0c67a"/><stop offset=".12" stop-color="#cf9a52"/>
        <stop offset=".42" stop-color="#b27a3c"/><stop offset=".5" stop-color="#dcaa62"/>
        <stop offset=".58" stop-color="#b27a3c"/><stop offset=".88" stop-color="#cf9a52"/>
        <stop offset="1" stop-color="#f0c67a"/>
      </linearGradient>
      <linearGradient id="edge" x1="0" x2="1">
        <stop stop-color="#f7dc9c" stop-opacity=".95"/><stop offset="1" stop-color="#f7dc9c" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="tipFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset=".55" stop-color="#2e4a40" stop-opacity="0"/><stop offset="1" stop-color="#2e4a40" stop-opacity=".18"/>
      </linearGradient>
      <filter id="soft"><feGaussianBlur stdDeviation="2.4"/></filter>
    </defs>
    <rect width="128" height="256" fill="url(#bronze)"/>
    <g filter="url(#soft)">${patina.join("")}</g>
    <rect width="128" height="256" fill="url(#tipFade)"/>
    ${pits.join("")}
    <rect x="60" width="8" height="256" fill="#d9a560" opacity=".55"/>
    <rect x="63" width="2" height="256" fill="#f4d391" opacity=".8"/>
    <rect x="55" width="3" height="256" fill="#6e4520" opacity=".45"/>
    <rect x="70" width="3" height="256" fill="#6e4520" opacity=".45"/>
    <rect width="12" height="256" fill="url(#edge)"/>
    <rect x="116" width="12" height="256" fill="url(#edge)" transform="rotate(180 122 128)"/>
    ${scratches.join("")}
  </svg>`;
};

/* Worn iron: mottled grey with rust blooms and bright rubbed scratches. Tiles. */
const ironSvg = () => {
  const blotches = [];
  for (let i = 0; i < 40; i += 1) {
    const color = rand() < 0.5 ? "#3a3936" : "#77736b";
    blotches.push(`<ellipse cx="${range(0, 128).toFixed(1)}" cy="${range(0, 128).toFixed(1)}" rx="${range(4, 14).toFixed(1)}" ry="${range(3, 10).toFixed(1)}" fill="${color}" opacity="${range(0.3, 0.6).toFixed(2)}"/>`);
  }
  const rust = [];
  for (let i = 0; i < 18; i += 1) {
    const color = rand() < 0.5 ? "#7a4a2b" : "#9b5a2e";
    rust.push(`<ellipse cx="${range(0, 128).toFixed(1)}" cy="${range(0, 128).toFixed(1)}" rx="${range(2, 9).toFixed(1)}" ry="${range(2, 7).toFixed(1)}" fill="${color}" opacity="${range(0.3, 0.65).toFixed(2)}"/>`);
  }
  const scratches = [];
  for (let i = 0; i < 22; i += 1) {
    const x = range(0, 128);
    const y = range(0, 128);
    scratches.push(`<path d="M${x.toFixed(1)} ${y.toFixed(1)} l${range(-10, 10).toFixed(1)} ${range(-6, 6).toFixed(1)}" stroke="#a8a49a" stroke-width="${range(0.4, 1).toFixed(2)}" opacity="${range(0.3, 0.6).toFixed(2)}"/>`);
  }
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <defs><filter id="soft"><feGaussianBlur stdDeviation="2"/></filter></defs>
    <rect width="128" height="128" fill="#5b5a56"/>
    <g filter="url(#soft)">${blotches.join("")}${rust.join("")}</g>
    ${scratches.join("")}
  </svg>`;
};

/* Dark leather cord wound around the grip. */
const leatherSvg = () => {
  const bands = [];
  for (let y = -16; y < 80; y += 8) {
    bands.push(`<path d="M0 ${y} L64 ${y + 16}" stroke="#2b1a12" stroke-width="2.2" opacity=".85"/>`);
    bands.push(`<path d="M0 ${y + 3} L64 ${y + 19}" stroke="#7a5236" stroke-width="1.2" opacity=".55"/>`);
  }
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" fill="#4a2f20"/>
    ${bands.join("")}
  </svg>`;
};

const makeTexture = async (name, svg) => {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return document.createTexture(name)
    .setImage(new Uint8Array(png))
    .setMimeType("image/png")
    .setURI(`${name.toLowerCase().replace(/\s+/g, "-")}.png`);
};
const textures = {
  blade: await makeTexture("Xiphos bronze", bladeSvg()),
  iron: await makeTexture("Xiphos iron", ironSvg()),
  leather: await makeTexture("Xiphos leather", leatherSvg()),
};

const makeMaterial = (name, texture, options = {}) => {
  const material = document.createMaterial(name)
    .setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(options.metallic ?? 0)
    .setRoughnessFactor(options.roughness ?? 0.8)
    .setBaseColorTexture(texture);
  return material;
};
const materials = {
  blade: makeMaterial("Patinated bronze", textures.blade, { metallic: 0.55, roughness: 0.42 }),
  iron: makeMaterial("Worn iron", textures.iron, { metallic: 0.6, roughness: 0.68 }),
  leather: makeMaterial("Leather cord", textures.leather, { roughness: 0.9 }),
};

/* Facets: every triangle gets its own normal. */
const faceted = (geometry) => {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.computeVertexNormals();
  return flat;
};
/* Hilt pieces share a tiling iron texture; project UVs from the side so the scale matches across parts. */
const boxUv = (geometry, scale = 7) => {
  const pos = geometry.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    uv[i * 2] = (pos.getX(i) + pos.getZ(i) * 0.7) * scale;
    uv[i * 2 + 1] = pos.getY(i) * scale;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
};

let triangles = 0;
const addMesh = (name, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) => {
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  triangles += (geometry.index ? geometry.index.count : positions.count) / 3;
  const primitive = document.createPrimitive().setMaterial(material)
    .setAttribute("POSITION", document.createAccessor().setType("VEC3").setArray(new Float32Array(positions.array)).setBuffer(buffer))
    .setAttribute("NORMAL", document.createAccessor().setType("VEC3").setArray(new Float32Array(normals.array)).setBuffer(buffer));
  if (uv) primitive.setAttribute("TEXCOORD_0", document.createAccessor().setType("VEC2").setArray(new Float32Array(uv.array)).setBuffer(buffer));
  if (geometry.index) primitive.setIndices(document.createAccessor().setType("SCALAR").setArray(new Uint32Array(geometry.index.array)).setBuffer(buffer));
  const mesh = document.createMesh(name).addPrimitive(primitive);
  const transform = new THREE.Object3D();
  transform.position.fromArray(position);
  transform.rotation.set(...rotation);
  sceneNode.addChild(document.createNode(name).setMesh(mesh)
    .setTranslation(transform.position.toArray())
    .setRotation(transform.quaternion.toArray()));
};

/* Blade: leaf profile (slight waist above the guard, widest about two-thirds up, then a long point),
   lenticular section with a raised midrib. Origin is the guard face, +Y toward the tip. */
const BLADE_BASE = 0.205;
const BLADE_LENGTH = 0.71;
const profile = [
  [0, 0.034, 0.011],
  [0.07, 0.031, 0.0105],
  [0.18, 0.034, 0.0102],
  [0.32, 0.041, 0.0098],
  [0.46, 0.049, 0.0092],
  [0.58, 0.055, 0.0086],
  [0.68, 0.056, 0.008],
  [0.77, 0.051, 0.0072],
  [0.85, 0.041, 0.0062],
  [0.92, 0.026, 0.0048],
  [0.97, 0.012, 0.0032],
];
const ring = [[-1, 0], [-0.5, 0.72], [0, 1], [0.5, 0.72], [1, 0], [0.5, -0.72], [0, -1], [-0.5, -0.72]];
const bladeGeometry = (() => {
  const positions = [];
  const uvs = [];
  const index = [];
  for (const [t, w, h] of profile) {
    for (const [x, z] of ring) {
      positions.push(x * w, BLADE_BASE + t * BLADE_LENGTH, z * h);
      uvs.push((x + 1) / 2, t);
    }
  }
  const n = ring.length;
  for (let s = 0; s < profile.length - 1; s += 1) {
    for (let k = 0; k < n; k += 1) {
      const a = s * n + k;
      const b = s * n + ((k + 1) % n);
      const c = a + n;
      const d = b + n;
      index.push(a, c, b, b, c, d);
    }
  }
  const tip = positions.length / 3;
  positions.push(0, BLADE_BASE + BLADE_LENGTH, 0);
  uvs.push(0.5, 1);
  const last = (profile.length - 1) * n;
  for (let k = 0; k < n; k += 1) index.push(last + k, tip, last + ((k + 1) % n));
  const base = positions.length / 3;
  positions.push(0, BLADE_BASE, 0);
  uvs.push(0.5, 0);
  for (let k = 0; k < n; k += 1) index.push(base, k, (k + 1) % n);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return faceted(geometry);
})();
addMesh("Bronze blade", bladeGeometry, materials.blade);

/* Short iron crossguard with drooped tips and a raised centre, the classic xiphos guard. */
const guardShape = new THREE.Shape();
[
  [-0.082, 0.176], [-0.088, 0.19], [-0.07, 0.206], [-0.03, 0.212], [0, 0.222],
  [0.03, 0.212], [0.07, 0.206], [0.088, 0.19], [0.082, 0.176], [0.05, 0.18],
  [0, 0.172], [-0.05, 0.18],
].forEach(([x, y], i) => (i ? guardShape.lineTo(x, y) : guardShape.moveTo(x, y)));
guardShape.closePath();
const guard = new THREE.ExtrudeGeometry(guardShape, { depth: 0.036, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1 });
guard.translate(0, 0, -0.018);
addMesh("Iron guard", faceted(boxUv(guard)), materials.iron);

/* Grip: spindle with a swell in the middle, octagonal; leather cord over the centre. */
const lathe = (points, segments = 8) => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
const gripIron = lathe([[0.001, 0.02], [0.026, 0.02], [0.028, 0.04], [0.025, 0.05], [0.025, 0.15], [0.028, 0.16], [0.026, 0.176], [0.001, 0.176]]);
addMesh("Iron grip", faceted(boxUv(gripIron)), materials.iron);
const cord = lathe([[0.0262, 0.052], [0.031, 0.075], [0.033, 0.098], [0.031, 0.122], [0.0262, 0.148]]);
const cordUv = cord.getAttribute("uv");
for (let i = 0; i < cordUv.count; i += 1) cordUv.setXY(i, cordUv.getX(i) * 3, cordUv.getY(i) * 2);
addMesh("Leather cord", faceted(cord), materials.leather);

/* Pommel: flattened iron disc with a small cap, like the round-knob xiphos hilts. */
const pommel = lathe([[0.001, -0.032], [0.016, -0.03], [0.038, -0.018], [0.044, 0], [0.038, 0.014], [0.022, 0.022], [0.02, 0.026], [0.001, 0.026]]);
addMesh("Iron pommel", faceted(boxUv(pommel)), materials.iron);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const absoluteOutput = path.resolve(output);
fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
await io.write(absoluteOutput, document);
console.log(`Wrote ${output} (${triangles} triangles)`);
