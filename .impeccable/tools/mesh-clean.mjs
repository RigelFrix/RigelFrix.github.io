// Light clean-up of a skinned GLB body: drops zero-area triangles, fills small holes (open edge loops),
// and recomputes smooth normals. Vertices that only differ by UV (texture seams) share one normal, so the toon
// light no longer creases along seams. UVs, skin weights, rig and texture are left as they are.
// --texture <file.jpg> swaps in a new base-colour image (for example the padded atlas from tex-pad.py).
// Usage (from .impeccable/tools): node mesh-clean.mjs <in.glb> <out.glb> [maxHoleEdges=8] [--texture file.jpg]
import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";

const args = process.argv.slice(2);
const texAt = args.indexOf("--texture");
const texFile = texAt >= 0 ? args.splice(texAt, 2)[1] : null;
const [input, output, maxHoleArg] = args;
if (!input || !output) {
  console.log("usage: node mesh-clean.mjs <in.glb> <out.glb> [maxHoleEdges] [--texture file.jpg]");
  process.exit(1);
}
const maxHole = Number(maxHoleArg || 8);
const io = new NodeIO();
const doc = await io.read(input);
/* Blender can export a second copy of the armature with its own unused skin. Same bone names twice means the
   game's animation can bind to the copy the mesh doesn't follow, so skins and node trees nothing uses are removed. */
{
  const root = doc.getRoot();
  const usedSkins = new Set(root.listNodes().map((node) => node.getSkin()).filter(Boolean));
  for (const skin of root.listSkins()) {
    if (!usedSkins.has(skin)) {
      console.log(`removed unused skin ${skin.getName() || "(unnamed)"}`);
      skin.dispose();
    }
  }
  const joints = new Set([...usedSkins].flatMap((skin) => skin.listJoints()));
  const needed = (node) => !!node.getMesh() || joints.has(node) || node.listChildren().some(needed);
  const drop = (node) => {
    node.listChildren().forEach(drop);
    node.dispose();
  };
  for (const scene of root.listScenes()) {
    for (const node of scene.listChildren()) {
      if (needed(node)) continue;
      console.log(`removed unused node tree ${node.getName() || "(unnamed)"}`);
      drop(node);
    }
  }
}
if (texFile) {
  for (const material of doc.getRoot().listMaterials()) {
    const texture = material.getBaseColorTexture();
    if (!texture) continue;
    texture.setImage(new Uint8Array(readFileSync(texFile))).setMimeType(texFile.endsWith(".png") ? "image/png" : "image/jpeg");
    console.log(`base colour of ${material.getName() || "material"} <- ${texFile}`);
  }
}

for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const posAcc = prim.getAttribute("POSITION");
    const idxAcc = prim.getIndices();
    if (!posAcc || !idxAcc) continue;
    const pos = posAcc.getArray();
    const count = posAcc.getCount();
    const tris = Array.from(idxAcc.getArray());

    /* One id per distinct position, so split vertices count as one surface point */
    const weldKey = new Map();
    const weld = new Int32Array(count);
    for (let i = 0; i < count; i += 1) {
      const key = `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
      if (!weldKey.has(key)) weldKey.set(key, weldKey.size);
      weld[i] = weldKey.get(key);
    }
    const p = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    const cross = (a, b, c) => {
      const [ax, ay, az] = p(a);
      const [bx, by, bz] = p(b);
      const [cx, cy, cz] = p(c);
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    };
    const area2 = (t) => Math.hypot(...cross(tris[t], tris[t + 1], tris[t + 2]));

    /* Folded slivers: thin triangles facing against the surface around them (an edit pushed a vertex through).
       Their shortest edge collapses to its midpoint, so the fold flattens into a zero-area triangle dropped below. */
    const around = new Float64Array(weldKey.size * 3);
    for (let t = 0; t < tris.length; t += 3) {
      const n = cross(tris[t], tris[t + 1], tris[t + 2]);
      for (let k = 0; k < 3; k += 1) for (let c = 0; c < 3; c += 1) around[weld[tris[t + k]] * 3 + c] += n[c];
    }
    const sameSpot = new Map();
    for (let i = 0; i < count; i += 1) {
      if (!sameSpot.has(weld[i])) sameSpot.set(weld[i], []);
      sameSpot.get(weld[i]).push(i);
    }
    let collapsed = 0;
    for (let t = 0; t < tris.length; t += 3) {
      const tri = [tris[t], tris[t + 1], tris[t + 2]];
      const n = cross(...tri);
      const len = Math.hypot(...n);
      if (len < 1e-12) continue;
      const s = [0, 1, 2].map((c) => around[weld[tri[0]] * 3 + c] + around[weld[tri[1]] * 3 + c] + around[weld[tri[2]] * 3 + c]);
      const facing = (n[0] * s[0] + n[1] * s[1] + n[2] * s[2]) / (len * (Math.hypot(...s) || 1));
      const edges = [0, 1, 2].map((k) => [tri[k], tri[(k + 1) % 3]]);
      const long = edges.map(([a, b]) => Math.hypot(...p(a).map((v, c) => v - p(b)[c])));
      /* Only specks: a bigger fold is shape (the shorts hem folds back), and collapsing it tangles the surface */
      const thin = len / Math.max(...long) ** 2 < 0.1 && len < 4e-5;
      if (facing > -0.2 || !thin) continue;
      const [a, b] = edges[long.indexOf(Math.min(...long))];
      const mid = p(a).map((v, c) => (v + p(b)[c]) / 2);
      const keep = weld[a];
      const gone = weld[b];
      if (keep === gone) continue;
      const merged = [...sameSpot.get(keep), ...sameSpot.get(gone)];
      for (const i of merged) {
        pos.set(mid, i * 3);
        weld[i] = keep;
      }
      sameSpot.set(keep, merged);
      sameSpot.delete(gone);
      collapsed += 1;
    }
    posAcc.setArray(pos);

    /* Drop zero-area triangles */
    const kept = [];
    let dropped = 0;
    for (let t = 0; t < tris.length; t += 3) {
      if (area2(t) < 1e-12 || new Set([weld[tris[t]], weld[tris[t + 1]], weld[tris[t + 2]]]).size < 3) dropped += 1;
      else kept.push(tris[t], tris[t + 1], tris[t + 2]);
    }

    /* Open edges: welded edges used by one triangle. The fill runs each one the other way round. */
    const uses = new Map();
    for (let t = 0; t < kept.length; t += 3) {
      for (let k = 0; k < 3; k += 1) {
        const a = kept[t + k];
        const b = kept[t + ((k + 1) % 3)];
        const key = Math.min(weld[a], weld[b]) + ":" + Math.max(weld[a], weld[b]);
        const hit = uses.get(key);
        if (hit) hit.n += 1;
        else uses.set(key, { n: 1, a, b });
      }
    }
    const back = new Map();
    for (const { n, a, b } of uses.values()) if (n === 1) back.set(weld[b], { from: b, to: a });
    const filled = [];
    const done = new Set();
    for (const start of back.keys()) {
      if (done.has(start)) continue;
      const loop = [];
      let at = start;
      while (back.has(at) && !done.has(at) && loop.length <= maxHole) {
        done.add(at);
        const step = back.get(at);
        loop.push(step.from);
        at = weld[step.to];
      }
      if (at !== start || loop.length < 3 || loop.length > maxHole) continue;
      for (let k = 1; k < loop.length - 1; k += 1) kept.push(loop[0], loop[k], loop[k + 1]);
      filled.push(loop.length);
    }

    /* Smooth normals: area-weighted face normals summed per surface point */
    const sum = new Float64Array(weldKey.size * 3);
    for (let t = 0; t < kept.length; t += 3) {
      const n = cross(kept[t], kept[t + 1], kept[t + 2]);
      for (let k = 0; k < 3; k += 1) {
        const w = weld[kept[t + k]] * 3;
        sum[w] += n[0];
        sum[w + 1] += n[1];
        sum[w + 2] += n[2];
      }
    }
    const normals = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const w = weld[i] * 3;
      const len = Math.hypot(sum[w], sum[w + 1], sum[w + 2]) || 1;
      normals[i * 3] = sum[w] / len;
      normals[i * 3 + 1] = sum[w + 1] / len;
      normals[i * 3 + 2] = sum[w + 2] / len;
    }
    const normalAcc = prim.getAttribute("NORMAL") || doc.createAccessor().setType("VEC3").setBuffer(posAcc.getBuffer());
    normalAcc.setArray(normals);
    prim.setAttribute("NORMAL", normalAcc);
    idxAcc.setArray(count > 65535 ? new Uint32Array(kept) : new Uint16Array(kept));

    console.log(`${mesh.getName() || "mesh"}: ${tris.length / 3} -> ${kept.length / 3} tris, collapsed ${collapsed} folded slivers, dropped ${dropped} degenerate, filled ${filled.length} holes (${filled.join(", ") || "none"} edges), normals smoothed over ${weldKey.size} points`);
  }
}
await io.write(output, doc);
console.log("wrote", output);
