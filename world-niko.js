import * as THREE from "three";
import { FBXLoader } from "./.impeccable/fbx/addons/loaders/FBXLoader.js";
import nikoBody from "./assets/niko/niko.glb";
import nikoHair from "./assets/niko/hair.glb";
import nikoIdleFbx from "./assets/niko/mixamo-idle.fbx";
import nikoRunFbx from "./assets/Running (1).fbx";
import lockonClips from "./assets/niko/lockon.json";
import punchClipData from "./assets/niko/punch-combo.json";
import onePunchClipData from "./assets/niko/one-punch.json";
import cascadeurIdleData from "./assets/niko/idle.json";
import cascadeurRunData from "./assets/niko/sprint.json";
import cascadeurStopData from "./assets/niko/stop.json";
import cascadeurStopMirrorData from "./assets/niko/stop-mirror.json";
import turn180ClipData from "./assets/niko/turn-180.json";
import nikoEyesUrl from "./assets/niko-eyes.png";

/** Niko procedural build, GLB load, retarget, clip actions, eyes/hair seating, cloak & secondary motion. */
export function createNiko(ctx) {
  const {
    renderer,
    scene,
    ramp,
    charLight,
    withCharLight,
    lamped,
    withRim,
    toon,
    glow,
    box,
    part,
    flat,
    halo,
    landing,
    getNikoSmear,
    getPunchHitbox,
  } = ctx;

  const NIKO = {
    cloak: "#efe6d3",
    lining: "#4a62a8",
    navy: "#2e3b6b",
    shirt: "#f3eee3",
    pants: "#4b3830",
    brown: "#7a5236",
    brownLight: "#9b6a40",
    brownDeep: "#45302a",
    sock: "#e6dac4",
    skin: "#f3c9a2",
    hair: "#6b3f26",
    hairLight: "#87522f",
    gold: "#e0a83a",
    eye: "#2a1a14",
    iris: "#8a5532",
  };

  /* Flat normals give the low-poly facets; the jitter is hashed on position so seam duplicates move together */
  const facet = (geometry, jitter = 0) => {
    const pos = geometry.attributes.position;
    if (jitter) {
      for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const n = (s) => {
          const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + s) * 43758.5453;
          return (v - Math.floor(v) - 0.5) * 2 * jitter;
        };
        pos.setXYZ(i, x + n(1), y + n(2), z + n(3));
      }
    }
    const out = geometry.index ? geometry.toNonIndexed() : geometry;
    out.computeVertexNormals();
    return out;
  };

  /* Four-point star, slightly taller than wide, bevelled into facets */
  const starGeo = (outer, inner, depth) => {
    const shape = new THREE.Shape();
    for (let i = 0; i < 8; i += 1) {
      const r = i % 2 ? inner : outer * (i % 4 === 0 ? 1.25 : 1);
      const a = (i / 8) * Math.PI * 2;
      if (i) shape.lineTo(Math.sin(a) * r, Math.cos(a) * r);
      else shape.moveTo(Math.sin(a) * r, Math.cos(a) * r);
    }
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.7, bevelSize: inner * 0.4, bevelSegments: 1 });
    geometry.center();
    return facet(geometry);
  };

  /* Ink outline: an inverted hull pushed out along smoothed normals; skinned parts get a hull bound to the same skeleton */
  const inkMaterial = (width) => {
    const ink = new THREE.MeshBasicMaterial({ color: "#2b1b24", side: THREE.BackSide });
    ink.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec3 inkNormal;")
        .replace("#include <begin_vertex>", `vec3 transformed = position + inkNormal * ${width.toFixed(4)};`);
    };
    ink.customProgramCacheKey = () => `ink-${width}`;
    return ink;
  };
  /* skip(x, y, z) drops the outline on triangles with a vertex in that (geometry-space) region */
  const addInk = (mesh, ink, skip) => {
    let geometry = mesh.geometry;
    if (!geometry.attributes.inkNormal) {
      const pos = geometry.attributes.position;
      const nrm = geometry.attributes.normal;
      const sums = new Map();
      const key = (i) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
      for (let i = 0; i < pos.count; i += 1) {
        const sum = sums.get(key(i)) || new THREE.Vector3();
        sums.set(key(i), sum.add(new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i))));
      }
      const out = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i += 1) sums.get(key(i)).clone().normalize().toArray(out, i * 3);
      geometry.setAttribute("inkNormal", new THREE.BufferAttribute(out, 3));
    }
    if (skip && geometry.index) {
      const pos = geometry.attributes.position;
      const src = geometry.index.array;
      const keep = [];
      const out = (i) => skip(pos.getX(i), pos.getY(i), pos.getZ(i));
      for (let t = 0; t < src.length; t += 3) if (!out(src[t]) && !out(src[t + 1]) && !out(src[t + 2])) keep.push(src[t], src[t + 1], src[t + 2]);
      const trimmed = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(geometry.attributes)) trimmed.setAttribute(name, attribute);
      trimmed.setIndex(keep);
      geometry = trimmed;
    }
    const hull = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(geometry, ink) : new THREE.Mesh(geometry, ink);
    if (mesh.isSkinnedMesh) {
      hull.bind(mesh.skeleton, mesh.bindMatrix);
      hull.frustumCulled = false;
    }
    mesh.add(hull);
    return hull;
  };
  /* The hair is an open shell of spikes. The body hull pushes along mesh normals, which point into the
     gaps and the cavity, so the ink reads as thick strokes inside the hair. This one keeps faces that
     point away from the skull and grows them straight out from it. */
  const addHairInk = (mesh) => {
    const src = mesh.geometry;
    const pos = src.attributes.position;
    const index = src.index.array;
    const keep = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    const mid = new THREE.Vector3();
    for (let t = 0; t < index.length; t += 3) {
      a.fromBufferAttribute(pos, index[t]);
      b.fromBufferAttribute(pos, index[t + 1]);
      c.fromBufferAttribute(pos, index[t + 2]);
      n.crossVectors(b.clone().sub(a), c.clone().sub(a));
      mid.copy(a).add(b).add(c);
      if (n.dot(mid) <= 0) continue;
      keep.push(index[t], index[t + 1], index[t + 2]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", pos);
    const inkNormal = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const len = Math.hypot(x, y, z) || 1;
      inkNormal[i * 3] = x / len;
      inkNormal[i * 3 + 1] = y / len;
      inkNormal[i * 3 + 2] = z / len;
    }
    geometry.setAttribute("inkNormal", new THREE.BufferAttribute(inkNormal, 3));
    geometry.setIndex(keep);
    const hull = new THREE.Mesh(geometry, inkMaterial(0.0016));
    hull.frustumCulled = false;
    mesh.add(hull);
    return hull;
  };

  const buildRobot = () => {
    const inked = [];
    const bothCache = new Map();
    const robot = new THREE.Group();
    const body = new THREE.Group();
    robot.add(body);
    const mat = (color) => toon(color);
    const both = (color) => {
      const key = `${color}-both`;
      if (!bothCache.has(key)) {
        bothCache.set(key, withRim(new THREE.MeshToonMaterial({ color, gradientMap: ramp, side: THREE.DoubleSide })));
      }
      return bothCache.get(key);
    };
    const ball = (r, w = 9, h = 7, j = 0) => facet(new THREE.SphereGeometry(r, w, h), j);
    const tube = (top, bottom, height, seg = 8, j = 0) => facet(new THREE.CylinderGeometry(top, bottom, height, seg), j);
    const profile = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
    const lathe = (pts, seg = 9, j = 0, start = 0, length = Math.PI * 2) => facet(new THREE.LatheGeometry(profile(pts), seg, start, length), j);
    const block = (w, h, d, r = 0.03) => facet(box(w, h, d, r));
    const up = new THREE.Vector3(0, 1, 0);
    const spike = (parent, at, dir, len, r, color, twist = 0) => {
      const d = new THREE.Vector3(...dir).normalize();
      const mesh = part(parent, facet(new THREE.ConeGeometry(r, len, 4).rotateY(twist)), mat(color), at[0] + d.x * len * 0.5, at[1] + d.y * len * 0.5, at[2] + d.z * len * 0.5);
      mesh.quaternion.setFromUnitVectors(up, d);
      return mesh;
    };

    /* Legs: baggy shorts, cream socks, chunky boots with a folded cuff */
    const legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(0.085 * side, 0.6, 0.01);
      body.add(hip);
      const knee = part(hip, lathe([[0.085, 0.04], [0.112, -0.06], [0.108, -0.18], [0.072, -0.24]], 7, 0.006), both(NIKO.pants));
      knee.scale.set(1.04, 1, 0.94);
      part(hip, tube(0.058, 0.062, 0.06, 7), mat(NIKO.sock), 0, -0.27, 0.02);
      part(hip, tube(0.084, 0.082, 0.05, 7, 0.004), mat(NIKO.brownLight), 0, -0.32, 0.015);
      part(hip, tube(0.07, 0.075, 0.17, 7), mat(NIKO.brown), 0, -0.42, 0.01);
      part(hip, block(0.13, 0.1, 0.2, 0.03), mat(NIKO.brown), 0, -0.53, 0.035);
      part(hip, block(0.14, 0.035, 0.21, 0.012), mat(NIKO.brownDeep), 0, -0.58, 0.035);
      part(hip, tube(0.078, 0.078, 0.025, 7), mat(NIKO.brownDeep), 0, -0.4, 0.02);
      return hip;
    });

    /* Shorts waist, slim shirt, navy undershirt, belts, bandolier, pouches */
    part(body, tube(0.19, 0.21, 0.13, 8, 0.005), mat(NIKO.pants), 0, 0.6, 0);
    part(body, lathe([[0.2, 0.63], [0.195, 0.76], [0.18, 0.9], [0.15, 1.04], [0, 1.06]], 8, 0.006), both(NIKO.shirt));
    const vee = part(body, facet(new THREE.ConeGeometry(0.07, 0.16, 3)), mat(NIKO.navy), 0, 0.97, 0.15);
    vee.rotation.set(Math.PI - 0.25, Math.PI / 6, 0);
    vee.scale.z = 0.35;
    part(body, tube(0.2, 0.205, 0.06, 8), mat(NIKO.brownDeep), 0, 0.68, 0);
    part(body, block(0.07, 0.065, 0.035, 0.01), mat(NIKO.gold), 0, 0.68, 0.205);
    const sling = part(body, tube(0.215, 0.225, 0.045, 8), mat(NIKO.brownLight), 0, 0.62, 0.01);
    sling.rotation.z = 0.16;
    part(body, block(0.04, 0.4, 0.025, 0.008), mat(NIKO.brownLight), 0.01, 0.86, 0.18).rotation.set(-0.18, 0, 0.6);
    [
      [-0.14, 0.6, 0.17, -0.7, 0.1],
      [-0.21, 0.61, 0.0, -1.57, 0.09],
    ].forEach(([x, y, z, ry, s]) => {
      const pouch = part(body, block(s, s * 1.05, 0.07, 0.018), mat(NIKO.brown), x, y, z);
      pouch.rotation.y = ry;
      part(pouch, block(s * 1.04, s * 0.4, 0.075, 0.01), mat(NIKO.brownLight), 0, s * 0.33, 0.003);
      part(pouch, block(0.02, 0.02, 0.02, 0.004), mat(NIKO.gold), 0, s * 0.2, 0.04);
    });

    /* Star lantern on the right hip: hangs from the belt and swings on its own */
    const lantern = new THREE.Group();
    lantern.position.set(0.19, 0.65, 0.15);
    lantern.scale.setScalar(0.85);
    body.add(lantern);
    part(lantern, tube(0.008, 0.008, 0.06, 4), mat(NIKO.brownDeep), 0, -0.03, 0);
    part(lantern, facet(new THREE.ConeGeometry(0.075, 0.06, 6)), mat(NIKO.brownDeep), 0, -0.08, 0);
    const bulb = flat(lantern, new THREE.CylinderGeometry(0.05, 0.05, 0.11, 6), glow("#ffd27a", 2.5), 0, -0.165, 0);
    [0, 1, 2].forEach((i) => {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      part(lantern, new THREE.BoxGeometry(0.014, 0.12, 0.014), mat(NIKO.brownDeep), Math.sin(a) * 0.054, -0.165, Math.cos(a) * 0.054);
    });
    part(lantern, tube(0.07, 0.065, 0.03, 6), mat(NIKO.brownDeep), 0, -0.235, 0);
    const bulbGlow = halo(lantern, { color: "#ffc35a", size: 0.7, y: -0.16, opacity: 0.45 });

    /* Puffy sleeves, brown cuffs and gloves */
    const arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.19 * side, 0.98, 0);
      body.add(shoulder);
      part(shoulder, ball(0.06, 8, 6), mat(NIKO.shirt), 0, -0.01, 0);
      part(shoulder, tube(0.05, 0.066, 0.27, 7, 0.004), mat(NIKO.shirt), 0.01 * side, -0.15, 0);
      part(shoulder, tube(0.062, 0.062, 0.05, 7), mat(NIKO.brown), 0.014 * side, -0.29, 0);
      part(shoulder, ball(0.055, 7, 6), mat(NIKO.brownDeep), 0.016 * side, -0.34, 0);
      return shoulder;
    });

    /* Cloak: a cylinder slice open at the front, pointed hem, cream outside with a blue back panel, blue lining */
    const capeH = 0.78;
    const capeGeo = new THREE.CylinderGeometry(0.26, 0.44, capeH, 14, 3, true, Math.PI * 0.36, Math.PI * 1.28);
    capeGeo.translate(0, -capeH / 2, 0);
    const cp = capeGeo.attributes.position;
    for (let i = 0; i < cp.count; i += 1) {
      if (cp.getY(i) < -capeH + 0.01) {
        const a = Math.atan2(cp.getX(i), cp.getZ(i));
        cp.setY(i, cp.getY(i) - Math.abs(Math.sin(a * 3)) * 0.08);
      }
    }
    const cloth = facet(capeGeo, 0.006);
    const shade = new THREE.Color(NIKO.cloak);
    const panel = new THREE.Color(NIKO.lining);
    const colors = [];
    for (let i = 0; i < cloth.attributes.position.count; i += 3) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let k = 0; k < 3; k += 1) {
        cx += cloth.attributes.position.getX(i + k) / 3;
        cy += cloth.attributes.position.getY(i + k) / 3;
        cz += cloth.attributes.position.getZ(i + k) / 3;
      }
      const back = Math.abs(Math.atan2(cx, -cz)) < 0.3 && cy < -0.2;
      for (let k = 0; k < 3; k += 1) colors.push(...(back ? panel : shade).toArray());
    }
    cloth.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const cape = new THREE.Group();
    cape.position.set(0, 1.08, -0.02);
    body.add(cape);
    part(cape, cloth, withRim(new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap: ramp }))).receiveShadow = false;
    part(cape, cloth, withRim(new THREE.MeshToonMaterial({ color: NIKO.lining, gradientMap: ramp, side: THREE.BackSide }))).receiveShadow = false;
    const capeStar = part(cape, starGeo(0.055, 0.018, 0.012), mat(NIKO.gold), 0, -0.5, -0.41);
    capeStar.rotation.x = -0.24;
    const clothBase = cloth.attributes.position.array.slice();

    /* Shoulder mantle open at the chest, cowl, navy scarf, star brooch */
    part(body, lathe([[0.33, 0.86], [0.3, 0.94], [0.22, 1.04], [0.13, 1.1]], 10, 0.01, 0.4, Math.PI * 2 - 0.8), both(NIKO.cloak));
    part(body, facet(new THREE.TorusGeometry(0.12, 0.055, 5, 9), 0.008), mat(NIKO.navy), 0, 1.05, 0.02).rotation.x = Math.PI / 2;
    part(body, facet(new THREE.TorusGeometry(0.14, 0.075, 5, 10), 0.01), mat(NIKO.cloak), 0, 1.11, 0).rotation.x = Math.PI / 2;
    part(body, ball(0.15, 8, 6, 0.01), mat(NIKO.cloak), 0, 1.13, -0.15).scale.set(1.4, 0.75, 0.9);
    const brooch = flat(body, starGeo(0.035, 0.012, 0.016), glow("#ffd36b"), -0.09, 1.0, 0.245);
    brooch.rotation.set(-0.3, -0.35, 0);
    flat(brooch, new THREE.SphereGeometry(0.014, 6, 4), glow("#7fa6ff"), 0, 0, 0.018);

    /* Head, about a third of his height; built at r 0.4 and scaled down. Anime shape: round skull, tapered jaw, small chin */
    const head = new THREE.Group();
    head.position.set(0, 1.1, 0);
    head.scale.setScalar(0.74);
    body.add(head);
    const skull = new THREE.SphereGeometry(0.4, 24, 18);
    const sk = skull.attributes.position;
    for (let i = 0; i < sk.count; i += 1) {
      let x = sk.getX(i);
      let y = sk.getY(i);
      let z = sk.getZ(i);
      if (y < 0) {
        const t = -y / 0.4;
        x *= 1 - 0.28 * t ** 1.5;
        z *= 1 - 0.08 * t;
        if (z > 0) z += 0.025 * t;
        y *= 1.08;
      }
      const faceBias = Math.max(0, y + 0.1);
      x *= 1 - 0.12 * faceBias;
      z *= 1 + 0.08 * faceBias;
      if (z > 0) z += 0.04 * Math.max(0, y + 0.22);
      sk.setXYZ(i, x, y + 0.32, z * 0.96);
    }
    skull.computeVertexNormals();
    /* Anime face shading: front normals lean toward one forward direction so the face lights as a single painted plane */
    const skn = skull.attributes.normal;
    const forward = new THREE.Vector3(0, 0.2, 1).normalize();
    const nv = new THREE.Vector3();
    for (let i = 0; i < skn.count; i += 1) {
      const w = THREE.MathUtils.smoothstep(sk.getZ(i), 0.05, 0.3);
      nv.set(skn.getX(i), skn.getY(i), skn.getZ(i)).lerp(forward, w * 0.85).normalize();
      skn.setXYZ(i, nv.x, nv.y, nv.z);
    }
    part(head, skull, mat(NIKO.skin));

    /* Painted face: the front of the skull gets a planar-projected canvas (eyes, brows, nose, mouth, blush); a shut-eye copy swaps in for blinks */
    const faceUV = (x, y) => [0.5 + x / 0.84, 0.5 + (y - 0.33) / 0.84];
    const paintFace = (shut, look = {}) => {
      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const uv = look.uv || faceUV;
      const px = (x) => size * uv(x, 0)[0];
      const py = (y) => size * (1 - uv(0, y)[1]);
      const ink = look.ink || "#2a1712";
      const iris = look.iris || ["#2c1810", "#6a3c22", "#c07f46"];
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (look.fill) {
        ctx.fillStyle = look.fill;
        ctx.fillRect(0, 0, size, size);
      }

      [-1, 1].forEach((s) => {
        const g = ctx.createRadialGradient(px(0.2 * s), py(0.145), 0, px(0.2 * s), py(0.145), 36);
        g.addColorStop(0, "rgba(238,128,108,0.42)");
        g.addColorStop(1, "rgba(238,128,108,0)");
        ctx.fillStyle = g;
        ctx.fillRect(px(0.2 * s) - 40, py(0.145) - 40, 80, 80);
        if (look.noEyes) return;

        ctx.strokeStyle = look.brow || "#5a3424";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(px(0.06 * s), py(0.36));
        ctx.quadraticCurveTo(px(0.15 * s), py(0.39), px(0.235 * s), py(0.365));
        ctx.stroke();

        const cx = px(0.145 * s);
        const cy = py(0.225);
        const w = 50;
        const h = 56;
        const k = look.eyeScale || 1;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(k, k);
        ctx.translate(-cx, -cy);
        if (shut) {
          ctx.strokeStyle = ink;
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.moveTo(cx - w * s, cy + 6);
          ctx.quadraticCurveTo(cx, cy + 24, cx + w * s, cy + 2);
          ctx.stroke();
          ctx.restore();
          return;
        }
        const inner = [cx - w * s, cy + 8];
        const outer = [cx + w * s, cy - 4];
        const upper = () => {
          ctx.moveTo(...inner);
          ctx.bezierCurveTo(cx - w * 0.6 * s, cy - h * 1.2, cx + w * 0.7 * s, cy - h * 1.15, ...outer);
        };
        ctx.save();
        ctx.beginPath();
        upper();
        ctx.bezierCurveTo(cx + w * 0.6 * s, cy + h * 1.05, cx - w * 0.5 * s, cy + h * 1.1, ...inner);
        ctx.fillStyle = "#fbf6ee";
        ctx.fill();
        ctx.clip();
        const ix = cx + 3 * s;
        const iy = cy + 6;
        const irisFill = ctx.createLinearGradient(0, iy - 46, 0, iy + 46);
        irisFill.addColorStop(0, iris[0]);
        irisFill.addColorStop(0.45, iris[1]);
        irisFill.addColorStop(1, iris[2]);
        ctx.fillStyle = irisFill;
        ctx.beginPath();
        const [irx, iry] = look.irisSize || [1, 1];
        ctx.ellipse(ix, iy, 31 * irx, 47 * iry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = look.irisLine || "#24130c";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = look.pupil || "#1d0f0a";
        ctx.beginPath();
        ctx.ellipse(ix, iy - 3, 13 * irx, 22 * iry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(40,20,12,0.28)";
        ctx.fillRect(cx - w - 4, cy - h * 1.3, w * 2 + 8, h * 0.5);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(ix - 10, iy - 20, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ix + 11, iy + 22, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = ink;
        ctx.lineWidth = 9;
        ctx.beginPath();
        upper();
        ctx.lineTo(outer[0] + 13 * s, outer[1] - 12);
        ctx.stroke();
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(outer[0] - 4 * s, outer[1] + 6);
        ctx.bezierCurveTo(cx + w * 0.55 * s, cy + h * 1.0, cx - w * 0.2 * s, cy + h * 1.08, cx - w * 0.45 * s, cy + h * 0.85);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
      });

      ctx.strokeStyle = "rgba(176,96,74,0.7)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px(0.012), py(0.18));
      ctx.lineTo(px(0.004), py(0.16));
      ctx.stroke();
      ctx.strokeStyle = "#8a3f30";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(px(-0.04), py(0.118));
      ctx.quadraticCurveTo(px(0), py(0.105), px(0.04), py(0.12));
      ctx.stroke();

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      texture.flipY = look.flipY ?? true;
      return texture;
    };
    const faceOpen = paintFace(false);
    const faceShut = paintFace(true);
    const facePos = [];
    const faceNormal = [];
    const faceUVs = [];
    const idx = skull.index.array;
    const nrm = skull.attributes.normal;
    for (let i = 0; i < idx.length; i += 3) {
      const tri = [idx[i], idx[i + 1], idx[i + 2]];
      if (tri.some((v) => sk.getZ(v) < 0.06)) continue;
      tri.forEach((v) => {
        facePos.push(sk.getX(v), sk.getY(v), sk.getZ(v));
        faceNormal.push(nrm.getX(v), nrm.getY(v), nrm.getZ(v));
        faceUVs.push(...faceUV(sk.getX(v), sk.getY(v)));
      });
    }
    const faceGeo = new THREE.BufferGeometry();
    faceGeo.setAttribute("position", new THREE.Float32BufferAttribute(facePos, 3));
    faceGeo.setAttribute("normal", new THREE.Float32BufferAttribute(faceNormal, 3));
    faceGeo.setAttribute("uv", new THREE.Float32BufferAttribute(faceUVs, 2));
    const faceMat = new THREE.MeshToonMaterial({
      map: faceOpen,
      emissive: "#ffffff",
      emissiveMap: faceOpen,
      emissiveIntensity: 0.35,
      gradientMap: ramp,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    flat(head, faceGeo, faceMat, 0, 0, 0);
    const eyes = [new THREE.Object3D()];

    /* Hair: a cap plus flat locks laid along the scalp in rings (crown, mid, nape), swept bangs and side locks */
    const hair = new THREE.Group();
    head.add(hair);
    const C = new THREE.Vector3(0, 0.43, -0.1);
    const R = new THREE.Vector3(0.44 * 1.08, 0.44 * 0.9, 0.44 * 1.02);
    const cap = part(hair, ball(0.44, 10, 8, 0.02), mat(NIKO.hair), C.x, C.y, C.z);
    cap.scale.set(1.12, 0.84, 1.1);
    cap.position.set(C.x, C.y + 0.04, C.z - 0.02);
    const strand = (base, dir, out, len, r, color) => {
      const d = new THREE.Vector3(...dir).normalize();
      const n = new THREE.Vector3(...out);
      const zAxis = n.addScaledVector(d, -n.dot(d)).normalize();
      const xAxis = new THREE.Vector3().crossVectors(d, zAxis);
      const mesh = part(hair, facet(new THREE.ConeGeometry(r, len, 4)), mat(color), base.x + d.x * len * 0.45, base.y + d.y * len * 0.45, base.z + d.z * len * 0.45);
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, d, zAxis));
      mesh.scale.set(1, 1, 0.5);
      return mesh;
    };
    const lock = (deg, e, len, r, color, bend = 0.35) => {
      const a = THREE.MathUtils.degToRad(deg);
      const n = new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
      const base = C.clone().add(n.clone().multiply(R).multiplyScalar(0.93));
      const down = new THREE.Vector3(Math.sin(e) * Math.sin(a), -Math.cos(e), Math.sin(e) * Math.cos(a));
      return strand(base, down.addScaledVector(n, bend).toArray(), n.toArray(), len, r, color);
    };
    [30, 90, 150, 210, 270, 330].forEach((a, i) => lock(a, 1.1, 0.3, 0.16, i % 2 ? NIKO.hairLight : NIKO.hair, 0.5));
    [70, 106, 142, 178, 214, 250, 286].forEach((a, i) => lock(a, 0.55, 0.32, 0.14, i % 2 ? NIKO.hair : NIKO.hairLight, 0.3));
    [130, 163, 196, 229].forEach((a) => lock(a, 0.05, 0.26, 0.12, NIKO.hair, 0.15));
    [-1, 1].forEach((side) => {
      strand(new THREE.Vector3(0.36 * side, 0.5, -0.02), [0.25 * side, -1, 0.1], [side, 0, 0.3], 0.36, 0.11, NIKO.hair);
      strand(new THREE.Vector3(0.32 * side, 0.52, 0.14), [0.15 * side, -1, 0.25], [side, 0, 0.6], 0.32, 0.1, NIKO.hairLight);
    });
    [
      [-0.24, 0.27],
      [-0.145, 0.29],
      [-0.05, 0.3],
      [0.05, 0.28],
      [0.145, 0.29],
      [0.24, 0.27],
    ].forEach(([x, len], i) => {
      strand(new THREE.Vector3(x, 0.64, 0.27 - Math.abs(x) * 0.3), [x * 1.2, -1, 0.55], [x, 0.3, 1], len, 0.1, i % 2 ? NIKO.hairLight : NIKO.hair);
    });

    /* The cowlick sways the way the old antenna did */
    const antenna = new THREE.Group();
    antenna.position.set(0.02, 0.8, 0.04);
    hair.add(antenna);
    spike(antenna, [0, 0, 0], [0, 1, 0.55], 0.2, 0.04, NIKO.hair);
    spike(antenna, [0, 0.16, 0.09], [0, 0.5, -1], 0.13, 0.03, NIKO.hairLight);

    /* The fallen star, now a small companion that floats beside him */
    const buddy = new THREE.Group();
    robot.add(buddy);
    const buddyStar = flat(buddy, starGeo(0.14, 0.04, 0.05), glow("#ffe08a", 1.6), 0, 0, 0);
    halo(buddy, { color: "#ffcf5a", size: 1.1, opacity: 0.55 });
    halo(buddy, { color: "#9fc0ff", size: 0.5, opacity: 0.35 });

    const ink = inkMaterial(0.011);
    robot.traverse((mesh) => {
      if (mesh.isMesh && mesh.material.isMeshToonMaterial && mesh.material.side === THREE.FrontSide && !mesh.material.transparent && mesh.geometry !== cloth) inked.push(mesh);
    });
    inked.forEach((mesh) => addInk(mesh, ink));

    scene.add(robot);
    return { robot, body, head, eyes, antenna, bulb, bulbGlow, cape, cloth, clothBase, hair, lantern, buddy, buddyStar, faceMat, faceOpen, faceShut, paintFace };
  };

  /* Cloak physics: each column of cape bones is a spring chain (VRM-style verlet tails). Tails keep their momentum, get
     pulled back toward the rest drape and down by gravity, and are pushed out of spheres on the body and legs. */
  const makeCloak = (bones, colliders) => {
    const chains = [];
    for (let c = 0; bones[`Cape${c}_0`]; c += 1) {
      const links = [];
      for (let k = 0; bones[`Cape${c}_${k + 1}`]; k += 1) {
        const bone = bones[`Cape${c}_${k}`];
        const child = bones[`Cape${c}_${k + 1}`];
        links.push({ bone, rest: child.position.clone(), axis: child.position.clone().normalize(), tail: new THREE.Vector3(), prev: new THREE.Vector3(), k });
      }
      chains.push(links);
    }
    const head = new THREE.Vector3();
    const restTail = new THREE.Vector3();
    const next = new THREE.Vector3();
    const push = new THREE.Vector3();
    const parentQ = new THREE.Quaternion();
    const spheres = colliders.map((c) => ({ ...c, center: new THREE.Vector3(), radius: 0 }));
    let ready = false;
    return {
      reset: () => (ready = false),
      update: (dt, scale, gust) => {
        const step = Math.min(dt, 1 / 30);
        for (const s of spheres) {
          s.center.copy(s.offset).applyMatrix4(s.bone.matrixWorld);
          s.radius = s.r * scale;
        }
        for (const links of chains) {
          for (const link of links) {
            const { bone, rest, axis } = link;
            bone.quaternion.identity();
            bone.updateMatrixWorld(true);
            head.setFromMatrixPosition(bone.matrixWorld);
            restTail.copy(rest).applyMatrix4(bone.matrixWorld);
            const length = head.distanceTo(restTail);
            if (!ready) {
              link.tail.copy(restTail);
              link.prev.copy(restTail);
            }
            const stiffness = (2.2 - link.k * 0.45) * length * 5;
            next.copy(link.tail).sub(link.prev).multiplyScalar(0.62).add(link.tail);
            next.addScaledVector(push.copy(restTail).sub(head).normalize(), stiffness * step);
            next.y -= 1.4 * length * 5 * step;
            next.addScaledVector(gust, length * 5 * step);
            next.sub(head).setLength(length).add(head);
            for (const s of spheres) {
              push.copy(next).sub(s.center);
              const reach = s.radius + 0.02 * scale;
              if (push.lengthSq() < reach * reach) next.copy(s.center).addScaledVector(push.normalize(), reach);
            }
            next.sub(head).setLength(length).add(head);
            link.prev.copy(link.tail);
            link.tail.copy(next);
            bone.parent.getWorldQuaternion(parentQ);
            push.copy(next).sub(head).normalize().applyQuaternion(parentQ.invert());
            bone.quaternion.setFromUnitVectors(axis, push);
            bone.updateMatrixWorld(true);
          }
        }
        ready = true;
      },
    };
  };

  const bot = buildRobot();
  const robot = bot.robot;
  if (landing) robot.position.copy(landing);
  robot.rotation.y = Math.PI / 4;
  bot.body.scale.setScalar(1.12);
  const pose = { crouch: 0, lift: 0, spin: 0, flip: 0, raise: 0, tilt: 0 };
  const jiggle = { lx: 0, lv: 0, hy: 0, hv: 0 };
  const buddyAt = new THREE.Vector3(0.55, 1.85, 0.1);
  const buddyTo = new THREE.Vector3();
  const breeze = new THREE.Vector3();
  bot.buddy.position.copy(buddyAt);
  bot.hairRest = 0;
  bot.hairLag = 0.25;
  bot.waist = 1.0;
  bot.grow = 1;

/* The cleaned Niko model (assets/niko.glb, split into parts, rigged and given Mixamo idle/walk/run clips by
   .impeccable/tools/niko-split.mjs and niko-rig.mjs) takes over from the procedural mascot once parsed.
   It is 1 unit tall, feet at -0.5, facing +z, bound in a T-pose; the clips bring the arms down. */
const NIKO_SCALE = 2.5;
/* Niko's eyes, Genshin style: layers cut straight from the reference (niko-eyes.py) into one atlas, 5 tiles per eye
   (sclera, iris, lash, brow, shut lash; row 0 = his left eye). The eye pass stacks sclera, the iris (clipped to the
   sclera, offset by eyeGaze so he can look around) and the lash, or the shut lash on blinks. Brows are their own pass. */
/* Each atlas tile becomes its own texture with its own mip chain. Mips of a shared atlas blend neighbouring tiles
   together once the eye is a few pixels wide on screen, which is what made the far-camera eyes muddy. Alpha is
   premultiplied before the mips are built, so transparent edges don't average in black. */
const EYE_LAYERS = ["scl", "iris", "lash", "brow", "shut"];
const eyeTextures = (image) => {
  const size = image.width / 5;
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return [0, 1].map((row) =>
    Object.fromEntries(
      EYE_LAYERS.map((layer, col) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        canvas.getContext("2d").drawImage(image, col * size, row * size, size, size, 0, 0, size, size);
        const texture = new THREE.CanvasTexture(canvas);
        Object.assign(texture, { colorSpace: THREE.SRGBColorSpace, flipY: false, premultiplyAlpha: true, anisotropy });
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        return [layer, texture];
      })
    )
  );
};
/* lit: the eye is shaded by the same toon light, shadows and night tint as the skin under it, so it reads as paint
   on the face instead of a bright sticker */
const eyeMaterial = (tiles, layer, { lift = 0, opacity = 1, mask = true, lit = false } = {}) => {
  const uniforms = {
    eyeShut: { value: 0 },
    eyeGaze: { value: new THREE.Vector2() },
    charEye: charLight.eye,
    ...Object.fromEntries(EYE_LAYERS.map((name) => [`t_${name}`, { value: tiles[name] }])),
  };
  const params = { map: layer === "brow" ? tiles.brow : tiles.scl, color: "#f4eeee", transparent: true, depthWrite: false, opacity };
  const mat = lit ? new THREE.MeshToonMaterial({ ...params, gradientMap: ramp }) : new THREE.MeshBasicMaterial(params);
  if (lift && mask) {
    Object.assign(mat, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp });
  }
  /* A slight negative LOD bias keeps the tiny on-screen eye crisp instead of one mip too soft */
  const tile = (name, uv) => `eyeTap(t_${name}, ${uv})`;
  const clip = "if (vMapUv.x < 0.0 || vMapUv.x > 1.0 || vMapUv.y < 0.0 || vMapUv.y > 1.0) discard;";
  const fragment =
    layer === "brow"
      ? `${clip}\ndiffuseColor *= ${tile("brow", "vMapUv")};`
      : [
          clip,
          `vec4 scl = ${tile("scl", "vMapUv")};`,
          `vec4 iris = ${tile("iris", "vMapUv - eyeGaze")};`,
          `vec4 lash = ${tile("lash", "vMapUv")};`,
          `vec4 shut = ${tile("shut", "vMapUv")};`,
          "vec3 eyeCol = mix(scl.rgb, iris.rgb, iris.a * scl.a);",
          "eyeCol = mix(eyeCol, lash.rgb, lash.a);",
          "vec4 eye = mix(vec4(eyeCol, max(scl.a, lash.a)), shut, eyeShut);",
          "diffuseColor *= eye;",
        ].join("\n");
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "uniform float eyeShut;",
          "uniform vec2 eyeGaze;",
          "uniform float charEye;",
          ...EYE_LAYERS.map((name) => `uniform sampler2D t_${name};`),
          "vec4 eyeTap(sampler2D t, vec2 uv){ vec4 c = texture2D(t, clamp(uv, 0.0, 1.0), -0.6); return vec4(c.rgb / max(c.a, 1e-4), c.a); }",
        ].join("\n")
      )
      .replace("#include <map_fragment>", lit ? fragment : `${fragment}\ndiffuseColor.rgb *= charEye;`);
    if (lift) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <project_vertex>",
        `#include <project_vertex>\nmvPosition.z += ${(lift * NIKO_SCALE).toFixed(3)} * smoothstep(0.45, 0.85, normalize(transformedNormal).z);\ngl_Position = projectionMatrix * mvPosition;`
      );
    }
  };
  mat.customProgramCacheKey = () => `niko-eye-${layer}-${lift}-${mask ? 1 : 0}-${lit ? 1 : 0}`;
  return { mat: lit ? withCharLight(lamped(mat)) : mat, uniforms };
};
/* Painted face, in three parts that each describe one asset:
   FACE_REF   where the eyes sit on the reference front render (pixels; his left eye is on the picture's right).
   faceAnchor where that face is on the mesh: the pointed nose tip and the crown. The nose is the origin and
              crown-to-nose sets the scale, so the reference layout carries over to any head.
   paintBox   where the painted eye is inside its atlas tile (alpha bounds of sclera + lash), so the art is
              stretched onto the reference eye box and not the padded tile.
   The eyes are then the head's own front triangles, skinned with the face, so turning him shows the cheek
   curving away instead of a card floating off it. */
const FACE_REF = { crown: 44, nose: [510.5, 192] };
/* Eye placement, in reference pixels (148 px = crown to nose tip, so 1 px is about 1/148 of the upper head).
   Try values live in the browser console with PortfolioWorld.debug.eyes({ gap: 24, raise: 9 }), then copy them here. */
const EYE_FIT = {
  gap: 28, // between the two inner corners; smaller brings the eyes together
  width: 39, // each eye, inner to outer corner
  height: 37, // each eye, top of the lashes to the lower lid
  raise: 7, // nose tip up to the lower lid; bigger moves the eyes up
};
/* Hair placement on the bald head. Scale 1 is the authored cap seated on the skull.
   Position is in head units: x toward the nose, y up, z toward his right. About 0.01 is a small nudge.
   Try it live with PortfolioWorld.debug.hair({ scale: 0.9, y: -0.02 }), then copy the numbers here. */
const HAIR_FIT = {
  scale: 1,
  x: 0.01,
  y: -0.02,
  z: 0.01,
};
let hairAdjust = null;
const applyHairFit = () => {
  if (hairAdjust) {
    hairAdjust.scale.setScalar(HAIR_FIT.scale);
    hairAdjust.position.set(HAIR_FIT.x, HAIR_FIT.y, HAIR_FIT.z);
  }
  return { ...HAIR_FIT };
};
const faceAnchor = (pos) => {
  let crown = -Infinity;
  for (let i = 0; i < pos.count; i += 1) crown = Math.max(crown, pos.getY(i));
  /* Profile down the middle of the face: the furthest-forward point at each height */
  const profile = new Map();
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    if (Math.abs(pos.getZ(i)) > 0.006 || y < crown * 0.7) continue;
    const key = Math.round(y * 1e4);
    profile.set(key, Math.max(profile.get(key) ?? -Infinity, pos.getX(i)));
  }
  const line = [...profile].sort((a, b) => a[0] - b[0]).map(([key, x]) => ({ y: key / 1e4, x }));
  const front = Math.max(...line.map((p) => p.x));
  /* The nose tip is the sharpest spike among the most-forward points; the brow ridge is a flat run, not a spike */
  let nose = line.reduce((a, b) => (b.x > a.x ? b : a));
  let sharpest = 0;
  line.forEach((p, i) => {
    if (p.x < front * 0.97 || i === 0 || i === line.length - 1) return;
    const spike = p.x - Math.max(line[i - 1].x, line[i + 1].x);
    if (spike > sharpest) [sharpest, nose] = [spike, p];
  });
  return { nose, crown, scale: (crown - nose.y) / (FACE_REF.nose[1] - FACE_REF.crown) };
};
const paintBox = (tiles) => {
  const size = tiles.scl.image.width;
  const box = [size, size, 0, 0];
  for (const layer of ["scl", "lash"]) {
    const { data } = tiles[layer].image.getContext("2d").getImageData(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (data[(y * size + x) * 4 + 3] < 24) continue;
        box[0] = Math.min(box[0], x);
        box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x + 1);
        box[3] = Math.max(box[3], y + 1);
      }
    }
  }
  return box.map((v) => v / size);
};
const paintEyes = (skin, eyeTiles) => {
  const src = skin?.geometry;
  const pos = src?.attributes.position;
  const norm = src?.attributes.normal;
  const skinIndex = src?.attributes.skinIndex;
  const skinWeight = src?.attributes.skinWeight;
  const index = src?.index;
  if (!pos || !norm || !skinIndex || !skinWeight || !index) return [];
  const { nose, crown, scale } = faceAnchor(pos);
  /* Reference pixel <-> mesh. Picture right is his left, which is -Z on this mesh (nose is +X). */
  const toPicture = (y, z) => [FACE_REF.nose[0] - z / scale, FACE_REF.nose[1] - (y - nose.y) / scale];
  /* The whole front of the face carries the paint, so EYE_FIT can move the eyes anywhere on it without
     rebuilding; texture coordinates outside the eye tile are discarded */
  const onHead = (i) => pos.getY(i) > nose.y - (crown - nose.y) * 0.4 && pos.getX(i) > nose.x * 0.45;
  /* side +1 = his left eye, on the picture's right */
  const specs = [
    { name: "eyeL", row: 0, side: 1 },
    { name: "eyeR", row: 1, side: -1 },
  ];
  return specs.map((spec) => {
    /* Atlas tiles keep picture orientation (row 0 has its iris on the nose side, like his left eye in the
       reference), so u follows picture x for both eyes and the pair mirrors across the nose */
    const [u0, v0, u1, v1] = paintBox(eyeTiles[spec.row]);
    const uv = (y, z) => {
      const { gap, width, height, raise } = EYE_FIT;
      const near = FACE_REF.nose[0] + (spec.side * gap) / 2;
      const far = near + spec.side * width;
      const left = Math.min(near, far);
      const bottom = FACE_REF.nose[1] - raise;
      const [px, py] = toPicture(y, z);
      return [u0 + ((px - left) / width) * (u1 - u0), v0 + ((py - (bottom - height)) / height) * (v1 - v0)];
    };
    const map = new Map();
    const positions = [];
    const normals = [];
    const uvs = [];
    const bones = [];
    const weights = [];
    const indices = [];
    const add = (i) => {
      const hit = map.get(i);
      if (hit != null) return hit;
      const n = positions.length / 3;
      map.set(i, n);
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
      uvs.push(0, 0);
      for (let k = 0; k < 4; k += 1) {
        bones.push(skinIndex.getComponent(i, k));
        weights.push(skinWeight.getComponent(i, k));
      }
      return n;
    };
    for (let t = 0; t < index.count; t += 3) {
      const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      if (!tri.every(onHead)) continue;
      indices.push(add(tri[0]), add(tri[1]), add(tri[2]));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(bones, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    geometry.setIndex(indices);
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial({ name: spec.name, color: "#ffffff" }));
    const brow = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial({ name: `${spec.name}-brow`, color: "#ffffff" }));
    const refit = () => {
      const attr = geometry.attributes.uv;
      const at = geometry.attributes.position;
      for (let k = 0; k < at.count; k += 1) attr.setXY(k, ...uv(at.getY(k), at.getZ(k)));
      attr.needsUpdate = true;
    };
    refit();
    Object.assign(mesh.userData, { brow, refit, anchor: { nose: [nose.x, nose.y], crown, scale } });
    [mesh, brow].forEach((decal) => {
      decal.bind(skin.skeleton, skin.bindMatrix);
      decal.frustumCulled = false;
      decal.castShadow = false;
      decal.receiveShadow = true;
      skin.parent.add(decal);
    });
    return mesh;
  });
};
/* Body slot is the clean T-pose. Coat, clothes, and shoes join here as their own skinned files. Hair is a static cap seated below. */
const NIKO_PARTS = { body: nikoBody };
const PREVIOUS_HEIGHT = 2.17;
/* Mixamo clips stay on the FBX. Any body with the same bone names can play them: the prefix is stripped,
   the clip's world swing is turned so the FBX's left arm lines up with this body's, and the hips only bob. */
const stripMixamo = (name) => name.replace(/^mixamorig\d*:?/, "");
const parseFbx = (buf) => new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
const retargetMixamo = (clipName, sourceGroup, model, bones) => {
  const srcBones = {};
  sourceGroup.traverse((node) => {
    if (node.isBone) srcBones[stripMixamo(node.name)] = node;
  });
  const names = Object.keys(bones).filter((name) => srcBones[name]);
  const armAcross = (map) => {
    const left = new THREE.Vector3();
    const right = new THREE.Vector3();
    map.LeftArm.getWorldPosition(left);
    map.RightArm.getWorldPosition(right);
    return left.sub(right).setY(0).normalize();
  };
  const savedYaw = model.rotation.y;
  model.rotation.y = 0;
  model.updateMatrixWorld(true);
  sourceGroup.updateMatrixWorld(true);
  const align = new THREE.Quaternion().setFromUnitVectors(armAcross(srcBones), armAcross(bones));
  const alignInv = align.clone().invert();
  const worldOf = (bone) => bone.getWorldQuaternion(new THREE.Quaternion());
  const srcRest = {};
  const tgtRest = {};
  for (const name of names) {
    srcRest[name] = worldOf(srcBones[name]);
    tgtRest[name] = worldOf(bones[name]);
  }
  const srcHipRest = srcBones.Hips.position.clone();
  const tgtHipRest = bones.Hips.position.clone();
  const hipScale = tgtHipRest.y / (Math.abs(srcHipRest.y) > 1e-4 ? srcHipRest.y : 1);
  model.rotation.y = savedYaw;
  const srcMixer = new THREE.AnimationMixer(sourceGroup);
  const srcClip = sourceGroup.animations[0];
  srcMixer.clipAction(srcClip).play();
  const frames = Math.max(2, Math.round(srcClip.duration * 30));
  const times = new Float32Array(frames);
  const quats = Object.fromEntries(names.map((name) => [name, new Float32Array(frames * 4)]));
  const hips = new Float32Array(frames * 3);
  /* The target rig retargets the idle stance wider than intended; keep the correction in these clip keys. */
  const idleLegCorrections = clipName === "idle" ? {
    LeftUpLeg: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.06),
    RightUpLeg: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.06),
  } : {};
  for (let frame = 0; frame < frames; frame += 1) {
    const time = (srcClip.duration * frame) / (frames - 1);
    times[frame] = time;
    srcMixer.setTime(time);
    sourceGroup.updateMatrixWorld(true);
    const posed = {};
    for (const name of names) {
      const delta = worldOf(srcBones[name]).multiply(srcRest[name].clone().invert());
      posed[name] = align.clone().multiply(delta).multiply(alignInv).multiply(tgtRest[name].clone()).normalize();
    }
    for (const name of names) {
      const parent = bones[name].parent;
      const local = parent && posed[parent.name]
        ? posed[parent.name].clone().invert().multiply(posed[name])
        : posed[name].clone();
      if (idleLegCorrections[name]) local.multiply(idleLegCorrections[name]);
      /* q and -q are the same pose. Keep each key on the short arc from the previous one so the
         hands don't spin a full turn between frames, or when two directions are blended. */
      if (frame > 0) {
        const prev = (frame - 1) * 4;
        const values = quats[name];
        const dot = values[prev] * local.x + values[prev + 1] * local.y + values[prev + 2] * local.z + values[prev + 3] * local.w;
        if (dot < 0) local.set(-local.x, -local.y, -local.z, -local.w);
      }
      quats[name].set([local.x, local.y, local.z, local.w], frame * 4);
    }
    hips[frame * 3] = tgtHipRest.x;
    hips[frame * 3 + 1] = tgtHipRest.y + (srcBones.Hips.position.y - srcHipRest.y) * hipScale;
    hips[frame * 3 + 2] = tgtHipRest.z;
  }
  const tracks = names.map((name) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, quats[name]));
  tracks.push(new THREE.VectorKeyframeTrack("Hips.position", times, hips));
  return new THREE.AnimationClip(clipName, srcClip.duration, tracks);
};
const useNikoModel = async () => {
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const loader = new GLTFLoader();
  const parse = (buf) => loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
  const loaded = {};
  for (const [slot, buf] of Object.entries(NIKO_PARTS)) loaded[slot] = await parse(buf);
  const gltf = loaded.body;
  const model = gltf.scene;
  model.traverse((node) => {
    if (node.isBone) node.name = stripMixamo(node.name);
  });
  const bones = {};
  model.traverse((node) => {
    if (node.isBone) bones[node.name] = node;
  });
  const parts = {};
  const claim = (slot, file) => {
    parts[slot] = [];
    const found = [];
    file.scene.traverse((node) => {
      if (node.isSkinnedMesh) found.push(node);
    });
    if (!found.length) throw new Error(`Niko ${slot} has no mesh`);
    for (const mesh of found) {
      const bindMatrix = mesh.bindMatrix.clone();
      const inverses = mesh.skeleton.boneInverses;
      const skinBones = mesh.skeleton.bones.map((bone) => {
        const hit = bones[bone.name];
        if (!hit) throw new Error(`Niko ${slot} is missing bone ${bone.name}`);
        return hit;
      });
      model.add(mesh);
      mesh.bind(new THREE.Skeleton(skinBones, inverses), bindMatrix);
      mesh.userData.slot = slot;
      parts[slot].push(mesh);
    }
  };
  for (const [slot, file] of Object.entries(loaded)) claim(slot, file);
  if (parts.body?.[0]) {
    getNikoSmear().bindSkeleton(parts.body[0].skeleton, model);
  }
  /* hair-short.glb is a Sketchfab cap: a tiny axis-swap scale and a large offset live on parent nodes,
     and its front points +Z. Bake that world matrix, yaw it onto the nose, then shrink it to this skull.
     Scale and position stay on the mesh (HAIR_FIT) so they can be nudged live. */
  const seatHair = (file, skin, headBone) => {
    let mesh = null;
    file.scene.traverse((node) => {
      if (node.isMesh && !mesh) mesh = node;
    });
    if (!mesh || !headBone) return null;
    const geometry = mesh.geometry;
    file.scene.updateMatrixWorld(true);
    geometry.applyMatrix4(mesh.matrixWorld);
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.scale.set(1, 1, 1);
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    const pos = geometry.attributes.position;
    const at = new THREE.Vector3();
    const centroid = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) centroid.add(at.set(pos.getX(i), pos.getY(i), pos.getZ(i)));
    centroid.multiplyScalar(1 / pos.count);
    const skinPos = skin.geometry.attributes.position;
    let maxY = -Infinity;
    for (let i = 0; i < skinPos.count; i += 1) maxY = Math.max(maxY, skinPos.getY(i));
    const skull = new THREE.Vector3();
    let skullCount = 0;
    let skullHalf = 0;
    for (let i = 0; i < skinPos.count; i += 1) {
      const y = skinPos.getY(i);
      if (y < maxY - 0.12) continue;
      at.set(skinPos.getX(i), y, skinPos.getZ(i));
      skull.add(at);
      skullCount += 1;
    }
    skull.multiplyScalar(1 / Math.max(1, skullCount));
    for (let i = 0; i < skinPos.count; i += 1) {
      if (skinPos.getY(i) < maxY - 0.12) continue;
      skullHalf = Math.max(skullHalf, Math.hypot(skinPos.getX(i) - skull.x, skinPos.getZ(i) - skull.z));
    }
    let hairHalf = 0;
    for (let i = 0; i < pos.count; i += 1) {
      hairHalf = Math.max(hairHalf, Math.hypot(pos.getX(i) - centroid.x, pos.getZ(i) - centroid.z));
    }
    const fit = (skullHalf * 1.28) / Math.max(hairHalf, 1e-4);
    geometry.translate(-centroid.x, -centroid.y, -centroid.z);
    geometry.scale(fit, fit, fit);
    geometry.translate(centroid.x, centroid.y, centroid.z);
    geometry.translate(skull.x - centroid.x, skull.y - centroid.y, skull.z - centroid.z);
    /* Leave the skull at the mesh origin so HAIR_FIT.scale grows around the head, and x/y/z nudge it in head axes. */
    geometry.translate(-skull.x, -skull.y, -skull.z);
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);
    const pivot = new THREE.Object3D();
    const seated = new THREE.Matrix4().makeTranslation(skull.x, skull.y, skull.z).premultiply(headBone.matrixWorld.clone().invert());
    pivot.matrix.copy(seated);
    pivot.matrix.decompose(pivot.position, pivot.quaternion, pivot.scale);
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.userData.slot = "hair";
    headBone.add(pivot);
    pivot.add(mesh);
    hairAdjust = mesh;
    applyHairFit();
    return mesh;
  };
  const hairMesh = seatHair(await parse(nikoHair), parts.body[0], bones.Head);
  model.scale.setScalar(1);
  /* The mesh nose is +X. A +90° yaw turns that nose toward -Z, so -90° faces him along +Z, which is forward for the walk. */
  model.rotation.y = -Math.PI / 2;
  model.updateMatrixWorld(true);
  const span = new THREE.Box3().setFromObject(model);
  model.scale.setScalar(PREVIOUS_HEIGHT / Math.max(0.001, span.max.y - span.min.y));
  /* This mesh is authored with its origin at the soles. The old waist lift left him in the air,
     and the plant only corrected offsets under 0.6, so the lift stayed. */
  model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);
  const planted = new THREE.Box3().setFromObject(model);
  if (Number.isFinite(planted.min.y)) model.position.y -= planted.min.y;
  const meshes = Object.values(parts).flat();
  if (hairMesh) meshes.push(hairMesh);

  /* Face texture carries only blush, nose and mouth; the eyes are their own decal meshes (eyeL/eyeR) */
  const faceOpen = bot.paintFace(false, {
    uv: (x, y) => [0.5 + (x * 0.31) / 0.26, 0.5 + ((y - 0.225) * 0.4 - 0.002) / 0.26],
    fill: "#f6cfb0",
    noEyes: true,
    flipY: false,
  });
  /* The face is drawn first (renderOrder -1) and marks its pixels in the stencil buffer, even where hair later covers them */
  const faceMat = withCharLight(withRim(new THREE.MeshToonMaterial({ map: faceOpen, emissive: "#000000", emissiveMap: faceOpen, gradientMap: ramp })), true);
  Object.assign(faceMat, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
  /* Eye decals draw over the bang strands, anime style, but only inside the face's stencil mask, so at side and back
     angles they never float over hair or cheeks. The depth pull only applies where the decal faces the camera; the
     camera is orthographic, so it changes occlusion, never screen position. Brows draw twice: solid where nothing
     covers them, and faintly through the bangs. */
  const eyeTiles = eyeTextures(await new THREE.ImageLoader().loadAsync(nikoEyesUrl));
  const hasFace = meshes.some((mesh) => mesh.material?.name === "face");
  if (!meshes.some((mesh) => mesh.material?.name === "eyeL")) {
    paintEyes(meshes.find((mesh) => mesh.isSkinnedMesh), eyeTiles).forEach((mesh) => meshes.push(mesh));
  }
  const eyeDecals = [["eyeL", 0], ["eyeR", 1]].map(([name, row]) => ({
    name,
    eye: eyeMaterial(eyeTiles[row], "eye", { lift: hasFace ? 0.08 : 0, mask: hasFace, lit: !hasFace }),
    brows: [eyeMaterial(eyeTiles[row], "brow", { lit: !hasFace })].concat(hasFace ? [eyeMaterial(eyeTiles[row], "brow", { lift: 0.08, opacity: 0.4, mask: true })] : []),
  }));
  if (!hasFace) {
    eyeDecals.forEach((decal) => {
      [decal.eye.mat, ...decal.brows.map(({ mat }) => mat)].forEach((mat) => {
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -4;
        mat.polygonOffsetUnits = -4;
      });
    });
  }
  const nikoCache = new Map();
  const nikoToon = (color) => {
    if (!nikoCache.has(color)) nikoCache.set(color, withCharLight(lamped(withRim(new THREE.MeshToonMaterial({ color, gradientMap: ramp })))));
    return nikoCache.get(color);
  };
  const lining = withCharLight(lamped(withRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp }))));
  const ink = inkMaterial(0.0038);
  /* No outline on the bang edges around the eye cut-outs: at game size they framed the eyes like goggles */
  const aroundEyes = (x, y, z) => z > 0.06 && y > 0.26 && y < 0.355 && Math.abs(x) < 0.11;
  meshes.forEach((mesh) => {
          if (mesh.material?.map) {
      const map = mesh.material.map;
      const baseMat = withCharLight(lamped(withRim(new THREE.MeshToonMaterial({ map, gradientMap: ramp }))));
        mesh.material = mesh.userData.slot === "body" ? getNikoSmear().enhanceMaterial(baseMat) : baseMat;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      return;
    }
    const name = mesh.material.name;
    const eye = eyeDecals.find((e) => e.name === name);
    if (eye) {
      mesh.material = eye.eye.mat;
      mesh.castShadow = false;
      mesh.receiveShadow = !hasFace;
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      const brow = mesh.userData.brow;
      if (brow) {
        brow.material = eye.brows[0].mat;
        brow.renderOrder = 4;
      }
      return;
    }
    if (name === "face") {
      mesh.material = faceMat;
      mesh.renderOrder = -1;
    } else if (name === "glow") mesh.material = glow("#ffe7a0", 2.4);
    else if (name === "lining") mesh.material = lining;
    else mesh.material = nikoToon(name === "skin" ? "#d7a07a" : `#${mesh.material.color.getHexString()}`);
    /* The cap's inner surface sits on the scalp. A small depth pull keeps the coplanar shell from flickering. */
    if (mesh.userData.slot === "hair") {
      mesh.material.side = THREE.DoubleSide;
      mesh.material.polygonOffset = true;
      mesh.material.polygonOffsetFactor = -2;
      mesh.material.polygonOffsetUnits = -2;
    }
    mesh.castShadow = name !== "glow" && name !== "face" && name !== "lining";
    mesh.receiveShadow = name !== "glow";
    mesh.frustumCulled = false;
    if (mesh.userData.slot === "hair") addHairInk(mesh);
    else if (name !== "face" && name !== "glow" && name !== "lining") addInk(mesh, ink, aroundEyes);
  });
  const sockets = {};
  model.traverse((node) => {
    if (node.name.endsWith("Socket")) sockets[node.name.replace(/Socket$/, "")] = node;
  });

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  const idleSource = parseFbx(nikoIdleFbx);
  const restPose = [];
  const sourceName = {};
  idleSource.traverse((node) => {
    if (!node.isBone) return;
    restPose.push([node, node.position.clone(), node.quaternion.clone()]);
    sourceName[stripMixamo(node.name)] = node.name;
  });
  const restorePose = () => restPose.forEach(([node, position, quaternion]) => {
    node.position.copy(position);
    node.quaternion.copy(quaternion);
  });
  const retargeted = (name, source) => retargetMixamo(name, source, model, bones);
  /* Unity hip curves are meters. The Mixamo FBX skeleton is centimeters. */
  const curvesClip = (entry, isUnity = false) => {
    const tracks = [];
    for (const bone of entry.bones) {
      const nodeName = sourceName[bone.name];
      if (!nodeName) continue;
      const flat = bone.q;
      /* Unity writes these arm binds as (x, -y, -z, w) relative to this FBX. Played raw, each wrist crosses to the other side and the hand meshes swap on the way back to idle. */
      const values = isUnity && /Shoulder|Arm|Hand/.test(bone.name)
        ? flat.map((value, index) => (index % 4 === 1 || index % 4 === 2 ? -value : value))
        : flat;
      tracks.push(new THREE.QuaternionKeyframeTrack(`${nodeName}.quaternion`, new Float32Array(bone.times), new Float32Array(values)));
      if (bone.pos) {
        const pos = bone.pos.map((value) => value * 100);
        tracks.push(new THREE.VectorKeyframeTrack(`${nodeName}.position`, new Float32Array(bone.posTimes), new Float32Array(pos)));
      }
    }
    return new THREE.AnimationClip(entry.name, entry.duration, tracks);
  };
  const directClip = (entry) => {
    const tracks = [];
    for (const bone of entry.bones) {
      if (!bones[bone.name]) continue;
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, new Float32Array(bone.times), new Float32Array(bone.q)));
      if (bone.pos) {
        tracks.push(new THREE.VectorKeyframeTrack(`${bone.name}.position`, new Float32Array(bone.posTimes), new Float32Array(bone.pos)));
      }
      if (bone.scale) {
        tracks.push(new THREE.VectorKeyframeTrack(`${bone.name}.scale`, new Float32Array(bone.scaleTimes || bone.times), new Float32Array(bone.scale)));
      }
    }
    return new THREE.AnimationClip(entry.name, entry.duration, tracks);
  };

  actions.run = mixer.clipAction(retargeted("run", parseFbx(nikoRunFbx)));
  actions.run.play();
  actions.run.setEffectiveWeight(0);

  const cascadeurIdleAction = mixer.clipAction(directClip(cascadeurIdleData));
  cascadeurIdleAction.play();
  cascadeurIdleAction.setEffectiveWeight(1);
  actions.idle = cascadeurIdleAction;
  /* The mixer blends quaternion tracks by their components. Two clips of the same hand pose still
     twist through a full turn if one track is stored as q and the other as -q. */
  const quatAt = (track, u) => {
    const times = track.times;
    const values = track.values;
    const last = times.length - 1;
    const time = u * times[last];
    let index = 0;
    while (index < last && times[index + 1] < time) index += 1;
    const next = Math.min(index + 1, last);
    const useNext = next !== index && time - times[index] > times[next] - time;
    const offset = (useNext ? next : index) * 4;
    return [values[offset], values[offset + 1], values[offset + 2], values[offset + 3]];
  };
  const matchHemisphere = (clip, reference, samples = 8, referenceAt = null) => {
    for (const track of clip.tracks) {
      if (!track.name.endsWith(".quaternion")) continue;
      const ref = reference.tracks.find((item) => item.name === track.name);
      if (!ref) continue;
      let neg = 0;
      let pos = 0;
      for (let step = 0; step < samples; step += 1) {
        const u = samples === 1 ? 0 : step / samples;
        const here = quatAt(track, u);
        const there = quatAt(ref, referenceAt == null ? u : referenceAt);
        const dot = here[0] * there[0] + here[1] * there[1] + here[2] * there[2] + here[3] * there[3];
        if (dot < 0) neg += 1;
        else pos += 1;
      }
      if (neg > pos) {
        const values = track.values;
        for (let i = 0; i < values.length; i += 1) values[i] *= -1;
      }
    }
  };
  /* Pixel Pass lock-on set: eight walk directions and the four run directions, same quaternion clips. */
  const lockMoves = [];
  for (const entry of lockonClips.clips) {
    restorePose();
    idleSource.animations = [curvesClip(entry, true)];
    const action = mixer.clipAction(retargeted(entry.name, idleSource));
    action.play();
    action.setEffectiveWeight(0);
    action.setEffectiveTimeScale(0);
    lockMoves.push({ name: entry.name, gait: entry.gait, x: entry.x, y: entry.y, action });
  }
  restorePose();
  idleSource.animations = [curvesClip(punchClipData, false)];
  const punchAction = mixer.clipAction(retargeted("punch", idleSource));
  punchAction.setLoop(THREE.LoopOnce, 1);
  punchAction.clampWhenFinished = false;
  punchAction.setEffectiveWeight(0);
  punchAction.setEffectiveTimeScale(1.5);
  punchAction.play();
  actions.punch = punchAction;

  const onePunchAction = mixer.clipAction(directClip(onePunchClipData));
  onePunchAction.setLoop(THREE.LoopOnce, 1);
  onePunchAction.clampWhenFinished = false;
  onePunchAction.setEffectiveWeight(0);
  onePunchAction.setEffectiveTimeScale(1.0);
  onePunchAction.play();
  actions.onePunch = onePunchAction;

  const sprintAction = mixer.clipAction(directClip(cascadeurRunData));
  sprintAction.setEffectiveWeight(0);
  sprintAction.play();
  actions.sprint = sprintAction;

  const stopAction = mixer.clipAction(directClip(cascadeurStopData));
  stopAction.setLoop(THREE.LoopOnce, 1);
  stopAction.clampWhenFinished = true;
  stopAction.setEffectiveWeight(0);
  stopAction.play();
  actions.stop = stopAction;

  /* Opposite-foot stop: baked in export-stop.mjs (world-space sagittal), not runtime local hacks. */
  const stopMirrorAction = mixer.clipAction(directClip(cascadeurStopMirrorData));
  stopMirrorAction.setLoop(THREE.LoopOnce, 1);
  stopMirrorAction.clampWhenFinished = true;
  stopMirrorAction.setEffectiveWeight(0);
  stopMirrorAction.play();
  actions.stopMirror = stopMirrorAction;

  restorePose();
  /* Cascadeur turning-180-v2 retargeted onto Niko (same pipeline as sprint.json). */
  const turn180Action = mixer.clipAction(directClip(turn180ClipData));
  turn180Action.setLoop(THREE.LoopOnce, 1);
  turn180Action.clampWhenFinished = false;
  turn180Action.setEffectiveWeight(0);
  turn180Action.setEffectiveTimeScale(0);
  turn180Action.play();
  actions.turn180 = turn180Action;

  bot.punchHitbox = getPunchHitbox();
  const quatMap = (clip) => {
    const map = {};
    for (const track of clip.tracks) {
      if (track.name.endsWith(".quaternion")) map[track.name.slice(0, -11)] = track;
    }
    return map;
  };
  const idleClip = actions.idle.getClip();
  /* Every direction is stored in idle's hemisphere. A per-clip sign flip is what made the hands
     trade places while the run blend fell back to idle. */
  lockMoves.forEach((move) => matchHemisphere(move.action.getClip(), idleClip, 8, 0));
  matchHemisphere(actions.run.getClip(), idleClip, 8, 0);
  if (actions.sprint) matchHemisphere(actions.sprint.getClip(), idleClip, 8, 0);
  if (actions.stop) matchHemisphere(actions.stop.getClip(), idleClip, 8, 0);
  if (actions.stopMirror) matchHemisphere(actions.stopMirror.getClip(), idleClip, 8, 0);
  /* 180 staggers off sprint — share sprint's quat hemisphere so the blend doesn't flip limbs. */
  if (actions.turn180) {
    matchHemisphere(actions.turn180.getClip(), actions.sprint?.getClip() || idleClip, 8, 0);
  }
  matchHemisphere(actions.punch.getClip(), idleClip, 8, 0);
  matchHemisphere(actions.onePunch.getClip(), idleClip, 8, 0);
  const idleQuats = quatMap(idleClip);
  lockMoves.forEach((move) => {
    move.quats = quatMap(move.action.getClip());
  });
  mixer.update(0);

  const sphere = (bone, offset, r) => ({ bone: bones[bone], offset: new THREE.Vector3(...offset), r });
  const cloak = makeCloak(bones, [
    sphere("Spine2", [0, 0.02, -0.02], 0.12),
    sphere("Spine", [0, -0.02, -0.01], 0.125),
    sphere("Hips", [0, -0.04, 0], 0.13),
    sphere("LeftUpLeg", [0, -0.1, 0], 0.08),
    sphere("RightUpLeg", [0, -0.1, 0], 0.08),
    sphere("LeftLeg", [0, -0.06, 0], 0.065),
    sphere("RightLeg", [0, -0.06, 0], 0.065),
  ]);

  let bulbGlow = new THREE.Group();
  if (bones.Lantern) {
    const glowHolder = new THREE.Group();
    glowHolder.position.set(0, -0.09, 0.03);
    glowHolder.scale.setScalar(1.12 / NIKO_SCALE);
    bones.Lantern.add(glowHolder);
    bulbGlow = halo(glowHolder, { color: "#ffc35a", size: 0.7, opacity: 0.45 });
  }
  const spare = () => new THREE.Object3D();

  const body = new THREE.Group();
  body.add(model);
  robot.remove(bot.body);
  robot.add(body);
  Object.assign(bot, {
    body,
    model,
    bones,
    mixer,
    actions,
    lockMoves,
    idleQuats,
    cloak,
    sockets,
    parts,
    head: bones.Head,
    antenna: bones.Ahoge || spare(),
    hair: bones.Hair || spare(),
    hairRest: bones.Hair ? bones.Hair.position.y : 0,
    hairLag: 0.09,
    lantern: bones.Lantern || spare(),
    cape: new THREE.Object3D(),
    cloth: null,
    waist: 1.1,
    grow: model.scale.y / 1.95,
    bulbGlow,
    faceMat,
    faceOpen,
    faceShut: faceOpen,
    eyeDecals,
    ink,
    inkWidth: 0.0038 * NIKO_SCALE,
  });
};

  const nikoReady = useNikoModel().catch((error) => console.warn("Niko model failed, keeping the built-in mascot", error));

  const updateNikoSecondary = (dt, time, { state, calm, swing, step, onAfterCloak }) => {
    /* The flip turns around the waist, not the feet */
    state.hop = Math.min(1, state.hop + dt / 0.38);
    const hop = state.hop < 1 ? Math.sin(state.hop * Math.PI) * 0.45 : 0;
    const waist = bot.waist;
    const leanDrop = (!state.turning180 ? Math.abs(state.bank) * 0.12 * state.sprint : 0);
    bot.body.position.y = hop + pose.lift - pose.crouch * 0.16 * bot.grow + waist * (1 - Math.cos(pose.flip)) - leanDrop;
    bot.body.position.z = -waist * Math.sin(pose.flip);
    bot.body.rotation.x = pose.flip;
    bot.body.rotation.z = 0;
    bot.body.rotation.y = pose.spin;
    bot.antenna.rotation.z = calm ? 0 : Math.sin(time * 3.1) * 0.12 + swing * 0.2;
    bot.antenna.rotation.x = -state.walk * 0.35;

    /* Secondary motion: the hip lantern swings with each step, the hair lags a beat behind the body */
    const k = Math.min(dt, 1 / 30);
    const hang = -bot.body.rotation.x % (Math.PI * 2) + Math.cos(state.phase) * 0.3 * state.walk;
    jiggle.lv += ((hang - jiggle.lx) * 70 - jiggle.lv * 4) * k;
    jiggle.lx += jiggle.lv * k;
    bot.lantern.rotation.x = jiggle.lx;
    bot.lantern.rotation.z = -bot.body.rotation.z + step * 0.15 * state.walk;
    const bodyY = bot.body.position.y;
    jiggle.hv += ((bodyY - jiggle.hy) * 160 - jiggle.hv * 11) * k;
    jiggle.hy += jiggle.hv * k;
    const lag = THREE.MathUtils.clamp(jiggle.hy - bodyY, -0.1, 0.1);
    bot.hair.position.y = bot.hairRest + lag * bot.hairLag;
    bot.hair.rotation.x = lag * 0.3;

    /* Cloak: swings back with speed, and the hem ripples */
    bot.cape.rotation.x = 0.06 + state.walk * 0.32 + pose.lift * 0.35 + (calm ? 0 : Math.sin(time * 2.3) * 0.03);
    if (!calm && bot.cloth) {
      const cloth = bot.cloth.attributes.position;
      const base = bot.clothBase;
      const gust = 0.025 + state.walk * 0.035 + pose.lift * 0.04;
      for (let i = 0; i < cloth.count; i += 1) {
        const x = base[i * 3];
        const y = base[i * 3 + 1];
        const z = base[i * 3 + 2];
        const depth = Math.max(0, -y / 0.78);
        const a = Math.atan2(x, z);
        const ripple = Math.sin(time * (4 + state.walk * 4) + a * 3 - depth * 2.5) * gust * depth * depth;
        cloth.setXYZ(i, x + Math.sin(a) * ripple, y, z + Math.cos(a) * ripple);
      }
      cloth.needsUpdate = true;
      bot.cloth.computeVertexNormals();
    }
    if (bot.cloak) {
      if (!robot.visible) {
        bot.cloak.reset();
      } else {
        robot.updateMatrixWorld(true);
        if (calm) breeze.set(0, 0, 0);
        else breeze.set(Math.sin(time * 1.3), 0, Math.cos(time * 0.9)).multiplyScalar(0.25);
        bot.cloak.update(dt, NIKO_SCALE * robot.scale.y, breeze);
      }
    }

    if (onAfterCloak) onAfterCloak();

    /* The star companion floats by his shoulder and rises above his hand when he raises it */
    const g = bot.grow;
    buddyTo.set((0.55 - pose.raise * 0.12) * g, (1.85 - pose.raise * (bot.mixer ? -0.25 : 0.15)) * g, (0.1 + pose.raise * 0.12 - state.walk * 0.35) * g);
    if (!calm) buddyTo.y += Math.sin(time * 2) * 0.06;
    bot.buddy.position.lerp(buddyTo, 1 - Math.exp(-dt * 6));
    bot.buddyStar.rotation.y = calm ? 0 : time * 1.6;

    if (time > state.blinkAt) {
      const t = time - state.blinkAt;
      const lid = t < 0.14 ? 0.15 : 1;
      bot.eyes.forEach((eye) => (eye.scale.y = lid));
      if (t >= 0.14) {
        state.blinkAt = time + 2.4 + Math.random() * 2.6;
      }
    }
    const shut = bot.eyes[0].scale.y < 0.5;
    const face = shut ? bot.faceShut : bot.faceOpen;
    if (bot.faceMat.map !== face) {
      bot.faceMat.map = face;
      bot.faceMat.emissiveMap = face;
    }
    bot.eyeDecals?.forEach((decal) => (decal.eye.uniforms.eyeShut.value = shut ? 1 : 0));
  };

  /* Niko's ink hull only reads once it is close to a pixel wide; thinner, it breaks into stray dark pixels wherever
     his parts overlap, so it only shows when zoomed in */
  const updateInk = (camera) => {
    if (bot.ink) bot.ink.visible = bot.inkWidth / ((camera.top - camera.bottom) / camera.zoom / Math.max(1, renderer.domElement.height)) > 0.8;
  };

  return {
    bot,
    robot,
    pose,
    NIKO_SCALE,
    EYE_FIT,
    HAIR_FIT,
    applyHairFit,
    inkMaterial,
    addInk,
    addHairInk,
    nikoReady,
    updateNikoSecondary,
    updateInk,
  };
}
