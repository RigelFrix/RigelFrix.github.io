/* A small GLB writer for the editor kit: vertex colours, optional leaf texture, unlit so the editor shows the painted look. */
import { deflateSync } from "node:zlib";
import * as THREE from "three";

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};

export const pngRGBA = (width, height, rgba) => {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    raw[y * (1 + width * 4)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + row, width * 4).copy(raw, y * (1 + width * 4) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
};

const pad4 = (n) => (n + 3) & ~3;

/* root: a Group or Mesh. leaf marks a mesh that uses the foliage atlas. */
export function toGlb(root, leaf) {
  root.updateMatrixWorld(true);
  const bin = [];
  const views = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  let offset = 0;
  const push = (buf) => {
    const start = offset;
    bin.push(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength));
    offset += buf.byteLength;
    const pad = pad4(offset) - offset;
    if (pad) {
      bin.push(Buffer.alloc(pad));
      offset += pad;
    }
    return start;
  };
  const view = (byteOffset, byteLength) => {
    views.push({ buffer: 0, byteOffset, byteLength });
    return views.length - 1;
  };
  const accessor = (componentType, type, count, byteOffset, byteLength, min, max) => {
    accessors.push({ bufferView: view(byteOffset, byteLength), componentType, count, type, min, max });
    return accessors.length - 1;
  };

    const images = [];
  const textures = [];
  const materials = [
    { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 }, doubleSided: true, extensions: { KHR_materials_unlit: {} } },
  ];
  const imageIndex = new Map();
  const addImage = (png, { mask = false } = {}) => {
    const key = `${png.length}:${mask}`;
    if (imageIndex.has(key)) return imageIndex.get(key);
    const start = push(png);
    images.push({ bufferView: view(start, png.length), mimeType: "image/png" });
    textures.push({ source: images.length - 1 });
    materials.push({
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], baseColorTexture: { index: textures.length - 1 }, metallicFactor: 0, roughnessFactor: 1 },
      ...(mask ? { alphaMode: "MASK", alphaCutoff: 0.45 } : {}),
      doubleSided: true,
      extensions: { KHR_materials_unlit: {} },
    });
    imageIndex.set(key, materials.length - 1);
    return materials.length - 1;
  };
  const leafMaterial = leaf ? addImage(pngRGBA(leaf.width, leaf.height, leaf.data), { mask: true }) : 0;

  const addMesh = (mesh, space) => {
    const g = mesh.geometry.clone();
    const into = new THREE.Matrix4();
    into.copy(space).invert().multiply(mesh.matrixWorld);
    g.applyMatrix4(into);
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    if (!nrm) g.computeVertexNormals();
    const normal = g.attributes.normal;
    let color = g.attributes.color;
    if (!color && mesh.material?.color) {
      const c = new Float32Array(pos.count * 3);
      const col = mesh.material.color;
      for (let i = 0; i < pos.count; i += 1) c.set([col.r, col.g, col.b], i * 3);
      color = { array: c, itemSize: 3, count: pos.count };
    }
    const floats = (attr) => {
      const arr = attr.array instanceof Float32Array ? attr.array : new Float32Array(attr.array);
      let lo = [Infinity, Infinity, Infinity];
      let hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < attr.count; i += 1) {
        for (let k = 0; k < 3; k += 1) {
          lo[k] = Math.min(lo[k], arr[i * attr.itemSize + k]);
          hi[k] = Math.max(hi[k], arr[i * attr.itemSize + k]);
        }
      }
      const start = push(arr.subarray(0, attr.count * attr.itemSize));
      return accessor(5126, "VEC3", attr.count, start, attr.count * 12, lo, hi);
    };
    const attributes = { POSITION: floats(pos), NORMAL: floats(normal) };
    if (color) attributes.COLOR_0 = floats(color);
    const uv = g.attributes.uv;
    const materialIndex = mesh.userData.leaf
      ? leafMaterial
      : mesh.userData.image
        ? addImage(pngRGBA(mesh.userData.image.width, mesh.userData.image.height, mesh.userData.image.data))
        : 0;
    if (uv && materialIndex !== 0) {
      const arr = uv.array instanceof Float32Array ? uv.array : new Float32Array(uv.array);
      const start = push(arr.subarray(0, uv.count * 2));
      attributes.TEXCOORD_0 = accessor(5126, "VEC2", uv.count, start, uv.count * 8);
    }
    let indices;
    if (g.index) {
      const src = g.index.array;
      const wide = pos.count > 65535;
      const arr = wide ? new Uint32Array(src) : new Uint16Array(src);
      const start = push(arr);
      indices = accessor(wide ? 5125 : 5123, "SCALAR", arr.length, start, arr.byteLength);
    }
    return { attributes, ...(indices != null ? { indices } : {}), material: materialIndex };
  };

  /* One node per direct child, so each prop stays one object you can move in the editor */
  const parts = root.name === "island-kit" ? root.children.slice() : [root];
  parts.forEach((part) => {
    part.updateWorldMatrix(true, true);
    const prims = [];
    part.traverse((node) => {
      if (node.isMesh) prims.push(addMesh(node, part.matrixWorld));
    });
    meshes.push({ primitives: prims });
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    part.matrixWorld.decompose(p, q, s);
    nodes.push({
      name: part.name || "piece",
      translation: [p.x, p.y, p.z],
      rotation: [q.x, q.y, q.z, q.w],
      scale: [s.x, s.y, s.z],
      mesh: meshes.length - 1,
    });
  });

  const json = {
    asset: { version: "2.0", generator: "rigelfrix-kit" },
    extensionsUsed: ["KHR_materials_unlit"],
    scene: 0,
    scenes: [{ name: root.name || "kit", nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: offset }],
    ...(images.length ? { images, textures } : {}),
  };
  const jsonBuf = Buffer.from(JSON.stringify(json));
  const jsonPad = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length) - jsonBuf.length, 0x20)]);
  const binBuf = Buffer.concat(bin);
  const total = 12 + 8 + jsonPad.length + 8 + binBuf.length;
  const out = Buffer.alloc(12);
  out.write("glTF", 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonPad.length, 0);
  jh.write("JSON", 4, "ascii");
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(binBuf.length, 0);
  bh.write("BIN\0", 4, "ascii");
  return Buffer.concat([out, jh, jsonPad, bh, binBuf]);
}
