/* Builds an original low-poly medieval longsword prop.
   Run from the repository root: node .impeccable/tools/longsword.mjs */
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import * as THREE from "../../vendor/three/three.module.min.js";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const output = "assets/models/longsword.glb";
const document = new Document();
const root = document.createScene("Longsword");
const buffer = document.createBuffer();
const sceneNode = document.createNode("Longsword");
root.addChild(sceneNode);

let seed = 41;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const range = (a, b) => a + rand() * (b - a);

const bladeSvg = () => {
  const stains = [];
  for (let i = 0; i < 38; i += 1) {
    const color = rand() < 0.5 ? "#718086" : "#d3dbd6";
    stains.push(`<ellipse cx="${range(8, 120).toFixed(1)}" cy="${range(0, 256).toFixed(1)}" rx="${range(3, 11).toFixed(1)}" ry="${range(5, 20).toFixed(1)}" fill="${color}" opacity="${range(0.1, 0.24).toFixed(2)}"/>`);
  }
  const scratches = [];
  for (let i = 0; i < 34; i += 1) {
    const x = range(7, 121);
    const y = range(0, 252);
    const len = range(5, 28);
    scratches.push(`<path d="M${x.toFixed(1)} ${y.toFixed(1)} l${range(-2, 2).toFixed(1)} ${len.toFixed(1)}" stroke="${rand() < 0.5 ? "#dce1dc" : "#46545a"}" stroke-width="${range(0.35, 0.9).toFixed(2)}" opacity="${range(0.2, 0.48).toFixed(2)}"/>`);
  }
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="128" height="256" viewBox="0 0 128 256">
    <defs>
      <linearGradient id="steel" x1="0" x2="1">
        <stop stop-color="#d8ded8"/><stop offset=".12" stop-color="#92a1a1"/>
        <stop offset=".32" stop-color="#c5d0ca"/><stop offset=".5" stop-color="#7c8f93"/>
        <stop offset=".68" stop-color="#c5d0ca"/><stop offset=".88" stop-color="#92a1a1"/>
        <stop offset="1" stop-color="#d8ded8"/>
      </linearGradient>
      <linearGradient id="edge" x1="0" x2="1">
        <stop stop-color="#f0f0e5"/><stop offset=".5" stop-color="#faf5df"/>
        <stop offset="1" stop-color="#aebbbb"/>
      </linearGradient>
      <linearGradient id="fuller" x1="0" x2="1">
        <stop stop-color="#59676d" stop-opacity=".1"/><stop offset=".5" stop-color="#39484f" stop-opacity=".65"/>
        <stop offset="1" stop-color="#59676d" stop-opacity=".1"/>
      </linearGradient>
      <filter id="soft"><feGaussianBlur stdDeviation="1.8"/></filter>
    </defs>
    <rect width="128" height="256" fill="url(#steel)"/>
    <rect x="51" width="26" height="256" fill="url(#fuller)"/>
    <rect x="17" width="7" height="256" fill="url(#edge)" opacity=".8"/>
    <rect x="104" width="7" height="256" fill="url(#edge)" opacity=".8"/>
    <g filter="url(#soft)">${stains.join("")}</g>
    <rect x="61" width="2" height="256" fill="#d2d7ce" opacity=".48"/>
    ${scratches.join("")}
  </svg>`;
};

const ironSvg = () => {
  const marks = [];
  for (let i = 0; i < 32; i += 1) {
    const color = rand() < 0.5 ? "#292d2f" : "#8a8b82";
    marks.push(`<ellipse cx="${range(0, 128).toFixed(1)}" cy="${range(0, 128).toFixed(1)}" rx="${range(3, 12).toFixed(1)}" ry="${range(2, 9).toFixed(1)}" fill="${color}" opacity="${range(0.25, 0.55).toFixed(2)}"/>`);
  }
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <defs><filter id="soft"><feGaussianBlur stdDeviation="2"/></filter></defs>
    <rect width="128" height="128" fill="#555a5a"/>
    <g filter="url(#soft)">${marks.join("")}</g>
    <path d="M12 33l20 -8M73 87l18 -5M39 112l14 -6" stroke="#bab9ad" stroke-width="1" opacity=".45"/>
  </svg>`;
};

const leatherSvg = () => {
  const wraps = [];
  for (let y = -16; y < 80; y += 8) {
    wraps.push(`<path d="M0 ${y} L64 ${y + 16}" stroke="#241a16" stroke-width="2.4"/>`);
    wraps.push(`<path d="M0 ${y + 3} L64 ${y + 19}" stroke="#866349" stroke-width="1" opacity=".7"/>`);
  }
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" fill="#493225"/>
    ${wraps.join("")}
  </svg>`;
};

const brassSvg = () => `
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <defs><linearGradient id="brass" x1="0" x2="1"><stop stop-color="#6f4a1f"/><stop offset=".48" stop-color="#c59a4e"/><stop offset="1" stop-color="#795321"/></linearGradient></defs>
    <rect width="64" height="64" fill="url(#brass)"/>
    <path d="M5 18l16 -5M38 43l18 -6M12 54l8 -3" stroke="#e0c47b" stroke-width="1" opacity=".55"/>
  </svg>`;

const makeTexture = async (name, svg) => {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return document.createTexture(name)
    .setImage(new Uint8Array(png))
    .setMimeType("image/png")
    .setURI(`${name.toLowerCase().replace(/\s+/g, "-")}.png`);
};
const textures = {
  blade: await makeTexture("Longsword steel", bladeSvg()),
  iron: await makeTexture("Longsword iron", ironSvg()),
  leather: await makeTexture("Longsword leather", leatherSvg()),
  brass: await makeTexture("Longsword brass", brassSvg()),
};
const makeMaterial = (name, texture, metallic, roughness) => document.createMaterial(name)
  .setBaseColorFactor([1, 1, 1, 1])
  .setMetallicFactor(metallic)
  .setRoughnessFactor(roughness)
  .setBaseColorTexture(texture);
const materials = {
  blade: makeMaterial("Worn steel", textures.blade, 0.7, 0.48),
  iron: makeMaterial("Dark iron", textures.iron, 0.6, 0.72),
  leather: makeMaterial("Wrapped leather", textures.leather, 0, 0.9),
  brass: makeMaterial("Dull brass", textures.brass, 0.65, 0.55),
};

const faceted = (geometry) => {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.computeVertexNormals();
  return flat;
};
const boxUv = (geometry, scale = 7) => {
  const positions = geometry.getAttribute("position");
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i += 1) {
    uv[i * 2] = (positions.getX(i) + positions.getZ(i) * 0.7) * scale;
    uv[i * 2 + 1] = positions.getY(i) * scale;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
};

let triangles = 0;
const addMesh = (name, geometry, material, position = [0, 0, 0]) => {
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
  sceneNode.addChild(document.createNode(name).setMesh(mesh).setTranslation(transform.position.toArray()));
};

const BLADE_BASE = 0.235;
const BLADE_LENGTH = 0.86;
const profile = [
  [0, 0.043, 0.012],
  [0.08, 0.042, 0.0115],
  [0.24, 0.043, 0.0108],
  [0.45, 0.044, 0.010],
  [0.66, 0.041, 0.009],
  [0.82, 0.035, 0.0075],
  [0.93, 0.023, 0.0055],
  [0.985, 0.009, 0.003],
];
const section = [
  [-1, 0], [-0.72, 0.54], [-0.3, 0.86], [0, 0.48], [0.3, 0.86], [0.72, 0.54], [1, 0],
  [0.72, -0.54], [0.3, -0.86], [0, -0.48], [-0.3, -0.86], [-0.72, -0.54],
];
const bladeGeometry = (() => {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (const [t, width, thickness] of profile) {
    for (const [x, z] of section) {
      positions.push(x * width, BLADE_BASE + t * BLADE_LENGTH, z * thickness);
      uvs.push((x + 1) / 2, t);
    }
  }
  const n = section.length;
  for (let s = 0; s < profile.length - 1; s += 1) {
    for (let k = 0; k < n; k += 1) {
      const a = s * n + k;
      const b = s * n + ((k + 1) % n);
      const c = a + n;
      const d = b + n;
      indices.push(a, c, b, b, c, d);
    }
  }
  const tip = positions.length / 3;
  positions.push(0, BLADE_BASE + BLADE_LENGTH, 0);
  uvs.push(0.5, 1);
  const last = (profile.length - 1) * n;
  for (let k = 0; k < n; k += 1) indices.push(last + k, tip, last + ((k + 1) % n));
  const base = positions.length / 3;
  positions.push(0, BLADE_BASE, 0);
  uvs.push(0.5, 0);
  for (let k = 0; k < n; k += 1) indices.push(base, k, (k + 1) % n);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return faceted(geometry);
})();
addMesh("Long steel blade", bladeGeometry, materials.blade);

const guardShape = new THREE.Shape();
[
  [-0.137, 0.204], [-0.145, 0.219], [-0.126, 0.234], [-0.082, 0.239], [-0.035, 0.226],
  [0, 0.221], [0.035, 0.226], [0.082, 0.239], [0.126, 0.234], [0.145, 0.219],
  [0.137, 0.204], [0.095, 0.209], [0, 0.213], [-0.095, 0.209],
].forEach(([x, y], i) => (i ? guardShape.lineTo(x, y) : guardShape.moveTo(x, y)));
guardShape.closePath();
const guard = new THREE.ExtrudeGeometry(guardShape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1 });
guard.translate(0, 0, -0.02);
addMesh("Aged crossguard", faceted(boxUv(guard)), materials.iron);

const lathe = (points, segments = 8) => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
const grip = lathe([[0.001, 0.025], [0.025, 0.025], [0.029, 0.044], [0.027, 0.058], [0.027, 0.159], [0.029, 0.176], [0.024, 0.19], [0.001, 0.19]]);
addMesh("Iron tang", faceted(boxUv(grip)), materials.iron);
const wrap = lathe([[0.0275, 0.052], [0.032, 0.073], [0.034, 0.104], [0.032, 0.136], [0.0275, 0.163]]);
const wrapUv = wrap.getAttribute("uv");
for (let i = 0; i < wrapUv.count; i += 1) wrapUv.setXY(i, wrapUv.getX(i) * 3, wrapUv.getY(i) * 2);
addMesh("Leather-wrapped grip", faceted(wrap), materials.leather);

const pommel = lathe([[0.001, -0.052], [0.019, -0.05], [0.036, -0.039], [0.043, -0.023], [0.04, -0.006], [0.026, 0.007], [0.001, 0.009]], 8);
addMesh("Faceted iron pommel", faceted(boxUv(pommel)), materials.iron);
const pommelCap = lathe([[0.001, -0.054], [0.015, -0.053], [0.019, -0.05], [0.001, -0.049]], 8);
addMesh("Brass pommel pin", faceted(pommelCap), materials.brass);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const absoluteOutput = path.resolve(output);
fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
await io.write(absoluteOutput, document);
console.log(`Wrote ${output} (${triangles} triangles)`);
