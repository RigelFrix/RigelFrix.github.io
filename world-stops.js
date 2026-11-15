import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import xiphosGlb from "./assets/models/xiphos-sword.glb";
import longswordGlb from "./assets/models/longsword.glb";
import { createWerewolfBoss } from "./world-boss.js";

/** Materials/primitives, LoadingManager, island stops/nav, route/raycast/labels, dummy, swords & werewolf boss. */
export function createStops(ctx) {
  const {
    scene,
    canvas,
    camera,
    host,
    labelsEl,
    prompt,
    promptOpen,
    promptLabel,
    promptLink,
    promptLinkLabel,
    PAL,
    ISLE,
    island,
    projects,
    defs,
    gsap,
    calm,
    coarse,
    isDevMap,
    ramp,
    lamped,
    withRim,
    atmos,
    occlude,
    makeRamp,
    bakeShadows,
    getHudBottom,
    getIntroLive,
    getClock,
    getState,
  } = ctx;

  /* Island props share the terrain's crisp banded ramp */
  const softRamp = makeRamp();

  const toonCache = new Map();
  const flatToon = new Map();
  const toon = (color) => {
    if (!toonCache.has(color)) {
      const material = lamped(withRim(new THREE.MeshToonMaterial({ color, gradientMap: ramp })));
      toonCache.set(color, material);
      flatToon.set(material, "toon");
    }
    return toonCache.get(color);
  };
  const softCache = new Map();
  const soft = (color) => {
    if (!softCache.has(color)) {
      const material = atmos(occlude(withRim(new THREE.MeshToonMaterial({ color, gradientMap: softRamp }), 0.06)));
      softCache.set(color, material);
      flatToon.set(material, "soft");
    }
    return softCache.get(color);
  };
  const softMapped = (map) => atmos(withRim(new THREE.MeshToonMaterial({ map, gradientMap: softRamp }), 0.06));
  /* `power` above 1 makes a light source: brighter than white, so bloom spreads it */
  const glow = (color, power = 1) => {
    const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    material.color.multiplyScalar(power);
    material.userData.flatGlow = true;
    return material;
  };
  const box = (w, h, d, r = Math.min(0.05, Math.min(w, h, d) * 0.3)) => new RoundedBoxGeometry(w, h, d, 2, r);

  const part = (parent, geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const flat = (parent, geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  /* Fewer draw calls: a static group's flat-coloured toon parts (and its glow parts) are baked into one mesh, with the
     colours moved into vertex colours. Anything under a node marked userData.live (spinning gems, the mailbox flag)
     keeps its own mesh so it can still move. */
  const painted = {
    toon: lamped(withRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp }))),
    soft: atmos(occlude(withRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: softRamp }), 0.06))),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  const mergeStatic = (group) => {
    group.updateMatrixWorld(true);
    const toGroup = group.matrixWorld.clone().invert();
    const buckets = new Map();
    group.traverse((node) => {
      if (!node.isMesh || node.isSkinnedMesh) return;
      const kind = flatToon.get(node.material) || (node.material.userData?.flatGlow ? "glow" : null);
      if (!kind) return;
      for (let up = node; up && up !== group; up = up.parent) if (up.userData.live) return;
      const key = `${kind}|${node.castShadow}|${node.receiveShadow}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(node);
    });
    buckets.forEach((nodes, key) => {
      if (nodes.length < 2) return;
      const geometries = nodes.map((node) => {
        const source = node.geometry;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", source.attributes.position.clone());
        if (source.attributes.normal) geometry.setAttribute("normal", source.attributes.normal.clone());
        else geometry.computeVertexNormals();
        const count = geometry.attributes.position.count;
        geometry.setIndex(source.index ? source.index.clone() : [...Array(count).keys()]);
        const { r, g, b } = node.material.color;
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i += 1) colors.set([r, g, b], i * 3);
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toGroup, node.matrixWorld));
        return geometry;
      });
      const merged = mergeGeometries(geometries);
      geometries.forEach((geometry) => geometry.dispose());
      if (!merged) return;
      const [kind, cast, receive] = key.split("|");
      const mesh = new THREE.Mesh(merged, painted[kind]);
      mesh.castShadow = cast === "true";
      mesh.receiveShadow = receive === "true";
      group.add(mesh);
      nodes.forEach((node) => node.removeFromParent());
    });
  };

  const manager = new THREE.LoadingManager();
  const textureLoader = new THREE.TextureLoader(manager);
  const fromDisk = window.location.protocol === "file:";

  const textTexture = (text, { bg, fg, width = 512, height = 128, size = 86 }) => {
    const board = document.createElement("canvas");
    board.width = width;
    board.height = height;
    const context = board.getContext("2d");
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    let font = size;
    context.font = `900 ${font}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
    const label = text.toUpperCase();

    while (context.measureText(label).width > width * 0.86 && font > 24) {
      font -= 4;
      context.font = `900 ${font}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
    }

    const skew = Math.tan((-8 * Math.PI) / 180);
    context.setTransform(1, 0, skew, 1, (-skew * height) / 2, 0);
    context.fillStyle = fg;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, width / 2, height / 2 + font * 0.06);

    const texture = new THREE.CanvasTexture(board);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  };

  const imageTexture = (src, aspect) => {
    if (fromDisk) {
      return textTexture("", { bg: PAL.inkRaise, fg: PAL.inkRaise, width: 64, height: 64 });
    }

    const texture = textureLoader.load(encodeURI(src), (loaded) => {
      const imageAspect = loaded.image.width / loaded.image.height;

      if (imageAspect > aspect) {
        loaded.repeat.set(aspect / imageAspect, 1);
        loaded.offset.set((1 - loaded.repeat.x) / 2, 0);
      } else {
        loaded.repeat.set(1, imageAspect / aspect);
        loaded.offset.set(0, (1 - loaded.repeat.y) / 2);
      }
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  };

  const codeTexture = () => {
    const board = document.createElement("canvas");
    board.width = 256;
    board.height = 144;
    const context = board.getContext("2d");
    context.fillStyle = PAL.ink;
    context.fillRect(0, 0, 256, 144);
    const colours = [PAL.yellow, PAL.red, PAL.cream, "#7f86f5"];
    let y = 16;

    for (let line = 0; line < 9; line += 1) {
      let x = 14 + (line % 3) * 12;
      const pieces = 2 + (line % 3);

      for (let piece = 0; piece < pieces; piece += 1) {
        const w = 18 + ((line * 7 + piece * 13) % 46);
        context.fillStyle = colours[(line + piece) % colours.length];
        context.fillRect(x, y, w, 6);
        x += w + 8;
      }

      y += 14;
    }

    const texture = new THREE.CanvasTexture(board);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };

  /* Soft round textures for glows, contact shadows, motes and clouds */

  const softTexture = (stops) => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const context = c.getContext("2d");
    const g = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    stops.forEach(([at, colour]) => g.addColorStop(at, colour));
    context.fillStyle = g;
    context.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };

  const blobTexture = softTexture([
    [0, "rgba(255,255,255,1)"],
    [0.45, "rgba(255,255,255,0.55)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  const haloTexture = softTexture([
    [0, "rgba(255,255,255,1)"],
    [0.2, "rgba(255,255,255,0.6)"],
    [1, "rgba(255,255,255,0)"],
  ]);

  const decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const decal = (parent, { color, size, x = 0, z = 0, y = 0.014, opacity = 0.5, additive = false }) => {
    const mesh = new THREE.Mesh(
      decalGeo,
      new THREE.MeshBasicMaterial({
        map: additive ? haloTexture : blobTexture,
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        toneMapped: false,
      })
    );
    mesh.position.set(x, y, z);
    mesh.scale.set(size, 1, size);
    mesh.renderOrder = additive ? 1 : 0;
    parent.add(mesh);
    return mesh;
  };

  const halo = (parent, { color, size, x = 0, y = 0, z = 0, opacity = 0.6 }) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: haloTexture, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    );
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(size);
    parent.add(sprite);
    return sprite;
  };

  /* World objects */

  const spinners = [];
  const projectsById = new Map(projects.map((project, index) => [project.id, { project, index }]));

  const builders = {
    /* A game: a carved shrine tablet with a glowing screen that plays its art */
    monolith(def, order) {
      const g = new THREE.Group();
      const project = projectsById.get(def.action?.project)?.project;
      const trim = order % 2 ? ISLE.star : ISLE.rigel;

      part(g, box(2.2, 0.34, 1.4, 0.08), soft(ISLE.ruinDeep), 0, 0.17, 0);
      part(g, box(1.8, 3, 0.66, 0.12), soft(ISLE.rock), 0, 1.8, -0.05);
      part(g, box(2.06, 0.38, 0.86, 0.08), soft(ISLE.ruin), 0, 3.4, -0.05);
      const cap = part(g, new THREE.ConeGeometry(0.66, 0.6, 4), soft(ISLE.ruin), 0, 3.88, -0.05);
      cap.rotation.y = Math.PI / 4;
      flat(g, new THREE.OctahedronGeometry(0.2), glow(trim, 2.2), 0, 3.88, 0.28);

      flat(g, new THREE.PlaneGeometry(1.52, 1.12), glow(trim), 0, 2.08, 0.285);
      const screenMat = project?.select?.tile
        ? new THREE.MeshBasicMaterial({ map: imageTexture(project.select.tile, 1.38 / 0.98), toneMapped: false })
        : glow(ISLE.water);
      flat(g, new THREE.PlaneGeometry(1.38, 0.98), screenMat, 0, 2.08, 0.292);
      [-0.8, 0.8].forEach((x) => flat(g, box(0.06, 1.7, 0.04), glow(trim), x, 1.7, 0.29));
      flat(g, new THREE.PlaneGeometry(1.5, 0.38), softMapped(textTexture(def.label, { bg: ISLE.ruin, fg: "#3b3848" })), 0, 1.06, 0.29);

      decal(g, { color: trim, size: 3.2, z: 1.1, opacity: 0.22, additive: true });
      halo(g, { color: trim, size: 2.6, y: 2.1, z: 0.6, opacity: 0.16 });
      return { group: g, labelY: 4.7, radius: 0.95, reach: 1.9 };
    },

    /* About me: the camp's A-frame tent with a work desk out front */
    hut() {
      const g = new THREE.Group();
      part(g, box(4.4, 0.18, 4.2, 0.04), soft(ISLE.plank), 0, 0.09, -0.4);

      const tent = new THREE.Group();
      tent.position.set(0, 0.18, -1.35);
      g.add(tent);
      [-1, 1].forEach((side) => {
        const panel = part(tent, box(0.07, 2.7, 2.5), soft(ISLE.cloth), side * 0.7, 1.15, 0);
        panel.rotation.z = side * 0.53;
        const stripe = part(tent, box(0.08, 0.34, 2.52), soft(ISLE.clothRed), side * 1.28, 0.2, 0);
        stripe.rotation.z = side * 0.53;
      });
      part(tent, box(0.12, 0.12, 2.8), soft(ISLE.woodDeep), 0, 2.36, 0);
      const opening = new THREE.Shape();
      opening.moveTo(-1.25, 0);
      opening.lineTo(1.25, 0);
      opening.lineTo(0, 2.2);
      opening.closePath();
      flat(tent, new THREE.ShapeGeometry(opening), new THREE.MeshBasicMaterial({ color: "#3a3046" }), 0, 0.02, 1.1);
      flat(tent, new THREE.ShapeGeometry(opening), soft(ISLE.cloth), 0, 0.02, -1.22).rotation.y = Math.PI;
      [-1, 1].forEach((side) => {
        const pole = part(tent, box(0.1, 2.9, 0.1), soft(ISLE.woodDeep), side * 0.2, 1.3, 1.22);
        pole.rotation.z = side * -0.32;
      });
      const pennant = part(tent, new THREE.ConeGeometry(0.16, 0.6, 3), soft(ISLE.clothRed), 0.3, 2.62, 1.3);
      pennant.rotation.z = -Math.PI / 2;

      part(g, box(2.2, 0.1, 1, 0.03), soft(ISLE.plank), 0, 0.98, 0.75);
      [-0.95, 0.95].forEach((x) => [0.35, 1.15].forEach((z) => part(g, box(0.1, 0.8, 0.1), soft(ISLE.woodDeep), x, 0.58, z)));
      part(g, box(0.8, 0.04, 0.5, 0.015), soft("#3b3848"), -0.1, 1.05, 0.72);
      const lid = part(g, box(0.8, 0.52, 0.04, 0.015), soft("#3b3848"), -0.1, 1.3, 0.5);
      lid.rotation.x = -0.18;
      const code = flat(g, new THREE.PlaneGeometry(0.72, 0.44), new THREE.MeshBasicMaterial({ map: codeTexture(), toneMapped: false }), -0.1, 1.3, 0.525);
      code.rotation.x = -0.18;
      part(g, new THREE.CylinderGeometry(0.08, 0.08, 0.16, 12), soft(ISLE.star), 0.62, 1.11, 0.95);

      const frame = new THREE.Group();
      frame.position.set(0.72, 1.28, 0.55);
      frame.rotation.set(-0.12, -0.4, 0);
      g.add(frame);
      part(frame, box(0.44, 0.54, 0.05, 0.015), soft(ISLE.wood), 0, 0, 0);
      flat(frame, new THREE.PlaneGeometry(0.34, 0.44), new THREE.MeshBasicMaterial({ map: imageTexture("./assets/me.jpg", 0.34 / 0.44), toneMapped: false }), 0, 0, 0.03);

      part(g, new THREE.CylinderGeometry(0.3, 0.34, 0.6, 8), soft(ISLE.wood), 0, 0.48, 1.65);
      return { group: g, labelY: 3.6, radius: 1.9, reach: 2.6 };
    },

    /* Skills: a carved board over three pedestals, each with a floating gem */
    skills() {
      const g = new THREE.Group();
      [-1.3, 1.3].forEach((x) => part(g, box(0.16, 2.6, 0.16), soft(ISLE.woodDeep), x, 1.3, -0.7));
      part(g, box(3, 0.82, 0.14, 0.04), soft(ISLE.plank), 0, 2.3, -0.7);
      flat(g, new THREE.PlaneGeometry(2.8, 0.64), softMapped(textTexture("Move list", { bg: ISLE.plank, fg: "#3b2a1c" })), 0, 2.3, -0.625);

      const gems = [new THREE.OctahedronGeometry(0.27), new THREE.IcosahedronGeometry(0.25), new THREE.OctahedronGeometry(0.25)];
      const gemColours = [PAL.red, ISLE.star, ISLE.rigel];
      [-0.95, 0, 0.95].forEach((x, i) => {
        part(g, new THREE.CylinderGeometry(0.3, 0.4, 0.9, 8), soft(ISLE.ruin), x, 0.45, 0);
        part(g, new THREE.CylinderGeometry(0.36, 0.36, 0.08, 8), soft(ISLE.ruinDeep), x, 0.93, 0);
        const gem = part(g, gems[i], glow(gemColours[i], 1.8), x, 1.36, 0);
        gem.userData.live = true;
        gem.castShadow = false;
        spinners.push({ mesh: gem, base: 1.36, offset: i * 1.7 });
      });
      return { group: g, labelY: 3.3, radius: 1.6, reach: 2.0 };
    },

    /* Career: three carved milestones by the ruins path */
    milestones() {
      const g = new THREE.Group();
      [
        { text: "Game dev", x: -1.15, h: 2.1, turn: 0.18 },
        { text: "Full-stack", x: 0, h: 2.3, turn: 0 },
        { text: "Indie 2019", x: 1.15, h: 2.05, turn: -0.18 },
      ].forEach((stone, i) => {
        const s = new THREE.Group();
        s.position.x = stone.x;
        s.rotation.y = stone.turn;
        g.add(s);
        part(s, box(1.0, stone.h, 0.5, 0.08), soft(i === 1 ? ISLE.rockLight : ISLE.rock), 0, stone.h / 2, 0);
        part(s, box(1.12, 0.2, 0.62, 0.04), soft(ISLE.ruinDeep), 0, 0.1, 0);
        flat(s, new THREE.PlaneGeometry(0.88, 0.3), softMapped(textTexture(stone.text, { bg: ISLE.ruin, fg: "#3b3848", width: 512, height: 160 })), 0, stone.h * 0.62, 0.255);
        flat(s, new THREE.OctahedronGeometry(0.13), glow(ISLE.star, 2.2), 0, stone.h + 0.2, 0);
      });
      return { group: g, labelY: 3.4, radius: 1.6, reach: 2.0 };
    },

    /* Contact: a red mailbox at the end of the pier */
    mailbox() {
      const g = new THREE.Group();
      part(g, box(0.16, 1.0, 0.16), soft(ISLE.woodDeep), 0, 0.5, 0);
      part(g, box(0.62, 0.5, 0.95, 0.06), soft(PAL.red), 0, 1.25, 0);
      const lid = part(g, new THREE.CylinderGeometry(0.31, 0.31, 0.95, 18), soft(PAL.red), 0, 1.5, 0);
      lid.rotation.x = Math.PI / 2;
      part(g, box(0.5, 0.42, 0.03, 0.02), soft(PAL.redDeep), 0, 1.32, 0.48);

      const flag = new THREE.Group();
      flag.userData.live = true;
      flag.position.set(0.33, 1.2, 0.18);
      g.add(flag);
      part(flag, box(0.04, 0.5, 0.04), soft(ISLE.star), 0, 0.25, 0);
      part(flag, box(0.04, 0.18, 0.26), soft(ISLE.star), 0, 0.42, 0.13);
      flag.rotation.x = -Math.PI / 2;

      return {
        group: g,
        labelY: 2.4,
        radius: 0.5,
        reach: 1.4,
        react() {
          if (gsap && !calm) {
            gsap.fromTo(flag.rotation, { x: -Math.PI / 2 }, { x: 0, duration: 0.5, ease: "back.out(2.4)" });
          } else {
            flag.rotation.x = 0;
          }
        },
      };
    },

    /* Resume: a stone lectern at the shrine holding the printed page */
    lectern() {
      const g = new THREE.Group();
      part(g, box(1.3, 0.24, 1, 0.06), soft(ISLE.ruinDeep), 0, 0.12, 0);
      part(g, box(0.62, 1.2, 0.5, 0.06), soft(ISLE.ruin), 0, 0.82, 0);
      const panel = new THREE.Group();
      panel.position.set(0, 1.62, 0.05);
      panel.rotation.x = 0.55;
      g.add(panel);
      part(panel, box(1.3, 0.08, 1.7, 0.03), soft(ISLE.ruin), 0, 0, 0);
      flat(panel, box(1.36, 0.04, 1.76), glow(ISLE.star), 0, -0.03, 0);
      const page = flat(panel, new THREE.PlaneGeometry(1.14, 1.54), new THREE.MeshBasicMaterial({ map: imageTexture("./assets/resume-display.jpg", 1.14 / 1.54), toneMapped: false }), 0, 0.045, 0);
      page.rotation.x = -Math.PI / 2;
      halo(g, { color: ISLE.star, size: 2.2, y: 1.7, z: 0.3, opacity: 0.16 });
      return { group: g, labelY: 2.9, radius: 0.9, reach: 1.7 };
    },

    pedestal() {
      const g = new THREE.Group();
      part(g, new THREE.CylinderGeometry(0.6, 0.7, 0.3, 8), soft(ISLE.ruin), 0, 0.15, 0);
      return { group: g, labelY: 2.6, radius: 0.9, reach: 1.7 };
    },
  };

  const objects = [];
  const byId = new Map();
  const colliders = [];
  let cabinetOrder = 0;

  async function loadModel(obj) {
    if (fromDisk) {
      return;
    }

    try {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const gltf = await new GLTFLoader(manager).loadAsync(encodeURI(obj.def.model));
      const model = gltf.scene;
      model.scale.setScalar(obj.def.scale || 1);
      model.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
      obj.group.clear();
      obj.group.add(model);
      bakeShadows();
    } catch (error) {
      console.warn(`Could not load ${obj.def.model}`, error);
    }
  }

  /* Route marker & path dots */
  const marker = flat(scene, new THREE.RingGeometry(0.26, 0.4, 32), new THREE.MeshBasicMaterial({ color: PAL.yellow, transparent: true, toneMapped: false }), 0, 0.03, 0);
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  let markerAge = 1;

  const showMarker = (point) => {
    marker.position.set(point.x, island.groundAt(point.x, point.z) + 0.05, point.z);
    marker.visible = true;
    markerAge = 0;
  };

  /* Route: dots along the path Niko is about to walk. They draw out from his feet and he eats them as he goes. */
  const ROUTE_GAP = 0.62;
  const ROUTE_MAX = 220;
  const routeTexture = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const context = c.getContext("2d");
    context.fillStyle = "rgba(16, 43, 68, 0.45)";
    context.beginPath();
    context.arc(32, 32, 31, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PAL.cream;
    context.beginPath();
    context.arc(32, 32, 21, 0, Math.PI * 2);
    context.fill();
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();
  const routeDots = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.3, 0.3).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: routeTexture, transparent: true, depthWrite: false, toneMapped: false }),
    ROUTE_MAX
  );
  routeDots.count = 0;
  routeDots.renderOrder = 3;
  routeDots.frustumCulled = false;
  scene.add(routeDots);
  const route = { dots: [], length: 0, age: 0, fade: 0 };
  const routeMatrix = new THREE.Matrix4();
  const routeQuat = new THREE.Quaternion();
  const routeSpot = new THREE.Vector3();
  const routeSize = new THREE.Vector3();

  const showRoute = (from, path) => {
    route.dots.length = 0;
    let prev = from;
    let along = 0;
    let next = ROUTE_GAP * 0.9;
    for (const point of path) {
      const seg = Math.hypot(point.x - prev.x, point.z - prev.z);
      while (seg > 0 && next <= along + seg && route.dots.length < ROUTE_MAX) {
        const t = (next - along) / seg;
        const x = prev.x + (point.x - prev.x) * t;
        const z = prev.z + (point.z - prev.z) * t;
        route.dots.push({ x, y: island.groundAt(x, z) + 0.08, z, along: next });
        next += ROUTE_GAP;
      }
      along += seg;
      prev = point;
    }
    while (route.dots.length && route.dots[route.dots.length - 1].along > along - 0.45) route.dots.pop();
    route.length = along;
    route.age = 0;
    routeDots.count = route.dots.length;
  };

  let botRef = null;
  let robotRef = null;

  const act = (obj) => {
    const action = obj.def.action;
    obj.react?.();

    if (action.type === "project") {
      const entry = projectsById.get(action.project);
      if (entry) {
        window.Portfolio?.openProject?.(entry.index, obj.plate);
      }
    } else if (action.type === "section") {
      window.Portfolio?.openSection?.(action.section, obj.plate);
    }
  };

  function arrive() {
    const state = getState();
    const robot = robotRef;
    const obj = state.pending;
    state.pending = null;

    if (!obj || !robot) {
      return;
    }

    state.yaw = Math.atan2(obj.def.x - robot.position.x, obj.def.z - robot.position.z);
    state.hop = 0;

    if (obj.def.action.type === "link") {
      return;
    }

    window.setTimeout(() => act(obj), calm ? 0 : 320);
  }

  const goTo = (point, obj = null) => {
    const state = getState();
    const robot = robotRef;
    if (!robot || state.punching) return;
    const path = island.nav.path(robot.position, point);
    if (!path?.length) {
      if (obj && robot.position.distanceTo(obj.spot) < 2) {
        state.path = [];
        state.pending = obj;
        arrive();
      }
      return;
    }
    state.path = path;
    state.pending = obj;
    state.stuck = 0;
    showMarker(path[path.length - 1]);
    showRoute(robot.position, path);
  };

  function goToObject(obj) {
    const state = getState();
    const robot = robotRef;
    if (!robot || state.punching) return;
    if (robot.position.distanceTo(obj.spot) < 0.35) {
      state.path = [];
      state.pending = obj;
      arrive();
      return;
    }

    goTo(obj.spot, obj);
  }

  if (isDevMap) {
    // Register all dev map obstacles into colliders array
    if (island.colliders) {
      colliders.push(...island.colliders);
    }
  } else {
    defs.forEach((def) => {
      const build = builders[def.kind] || builders.pedestal;
      const built = build(def, def.kind === "monolith" ? cabinetOrder++ : 0);
      const group = built.group;
      const facing = THREE.MathUtils.degToRad(def.facing || 0);
      const floor = island.groundAt(def.x, def.z);
      group.position.set(def.x, floor, def.z);
      group.rotation.set(0, facing, THREE.MathUtils.degToRad(def.lean || 0), "YXZ");

      if (def.scale && !def.model) {
        group.scale.setScalar(def.scale);
      }

      scene.add(group);
      mergeStatic(group);

      const radius = def.radius || built.radius || 0.8;
      colliders.push({ x: def.x, z: def.z, r: radius });
      decal(scene, { color: "#2a3a2a", size: radius * 2.9, x: def.x, z: def.z, y: floor + 0.03, opacity: 0.3 });

      if (!def.action) {
        if (def.model) {
          loadModel({ def, group });
        }
        return;
      }

      const reach = built.reach || radius + 0.8;
      const forward = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
      const obj = {
        def,
        group,
        radius,
        react: built.react,
        spot: new THREE.Vector3(def.x, floor, def.z).addScaledVector(forward, reach),
        labelAt: new THREE.Vector3(def.x, floor + (built.labelY || 2.6), def.z),
        hover: 0,
        plate: null,
      };
      group.userData.worldObject = obj;

      const plate = document.createElement("button");
      plate.type = "button";
      plate.className = "world-plate";
      plate.textContent = def.label;
      plate.setAttribute("aria-label", `Walk to ${def.label}`);
      plate.style.setProperty("--i", objects.length);
      plate.addEventListener("click", () => goToObject(obj));
      labelsEl.append(plate);
      obj.plate = plate;

      objects.push(obj);
      byId.set(def.id, obj);

      if (def.model) {
        loadModel(obj);
      }
    });
  }

  const interactiveGroups = objects.map((obj) => obj.group);

  /* The walk grid blocks the stops too; each stop's standing spot is moved onto walkable ground */
  island.nav.build(colliders);
  objects.forEach((obj) => {
    if (!island.nav.walkable(obj.spot.x, obj.spot.z)) {
      const near = island.nav.nearest(obj.spot.x, obj.spot.z);
      if (near) obj.spot.copy(near);
    }
    obj.spot.y = island.groundAt(obj.spot.x, obj.spot.z);
  });

  /* Ambience: pollen motes drifting over the island */

  const moteCount = coarse ? 70 : 140;
  const motes = new Float32Array(moteCount * 3);
  const moteDrift = Array.from({ length: moteCount }, (_, i) => {
    motes[i * 3] = (Math.random() * 2 - 1) * 20;
    motes[i * 3 + 1] = 1 + Math.random() * 11;
    motes[i * 3 + 2] = (Math.random() * 2 - 1) * 20;
    return { rise: 0.12 + Math.random() * 0.35, phase: Math.random() * Math.PI * 2 };
  });
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motes, 3));
  const moteField = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({
      map: haloTexture,
      color: "#fff6d8",
      size: coarse ? 5 : 7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    })
  );
  moteField.frustumCulled = false;
  scene.add(moteField);

  /* Spawn dummy, sword pickups & sample boss once Niko is constructed. */
  let dummy = null;
  let dummyRing = null;
  let dummyFocus = null;
  let swordPickup = null;
  let longswordPickup = null;
  let werewolfBoss = null;

  const spawnEntities = ({ landing, bot, robot, addShake }) => {
    botRef = bot;
    robotRef = robot;

    /* Training dummy on the spawn court, in front of the camera and facing Niko.
       iltaen's Sketchfab dummy has downloads disabled, so this is an original prop in that role:
       helm, mail, sword, shield, and a wooden stand. */
    const dummyAt = landing.clone();
    dummyAt.x -= Math.SQRT1_2 * 3.2;
    dummyAt.z -= Math.SQRT1_2 * 3.2;
    dummyAt.y = island.groundAt(dummyAt.x, dummyAt.z);
    dummy = new THREE.Group();
    const dummyBody = new THREE.Group();
    dummy.add(dummyBody);
    const wood = soft(ISLE.wood);
    const woodDeep = soft(ISLE.woodDeep);
    const mail = soft("#8e94a1");
    const helmCol = soft("#c5ccd4");
    const blade = soft("#e4eaf1");
    const shieldCol = soft("#7e8b98");
    const cross = soft("#e8eef3");
    const armCol = soft("#c4895a");
    const slit = soft("#2a241c");
    part(dummyBody, box(1.2, 0.1, 0.16), woodDeep, 0, 0.06, 0);
    part(dummyBody, box(0.16, 0.1, 1.2), woodDeep, 0, 0.1, 0);
    part(dummyBody, new THREE.CylinderGeometry(0.09, 0.11, 1.12, 7), wood, 0, 0.66, 0);
    part(dummyBody, box(0.62, 0.7, 0.34, 0.05), mail, 0, 1.5, 0);
    part(dummyBody, box(0.5, 0.18, 0.3, 0.04), mail, 0, 1.1, 0.02);
    part(dummyBody, new THREE.CylinderGeometry(0.2, 0.24, 0.34, 7), helmCol, 0, 2.02, 0);
    part(dummyBody, box(0.3, 0.07, 0.06), slit, 0, 1.94, 0.18);
    const swordArm = new THREE.Group();
    swordArm.position.set(0.28, 1.68, 0);
    swordArm.rotation.z = -1.05;
    part(swordArm, box(0.4, 0.11, 0.11), armCol, 0.22, 0, 0);
    part(swordArm, box(0.16, 0.06, 0.06), wood, 0.46, -0.02, 0);
    part(swordArm, box(0.22, 0.05, 0.08), woodDeep, 0.5, 0.08, 0);
    part(swordArm, box(0.07, 0.62, 0.035), blade, 0.5, 0.42, 0);
    dummyBody.add(swordArm);
    const shieldArm = new THREE.Group();
    shieldArm.position.set(-0.28, 1.52, 0.04);
    shieldArm.rotation.z = 0.35;
    part(shieldArm, box(0.32, 0.11, 0.11), armCol, -0.14, 0, 0);
    part(shieldArm, box(0.5, 0.62, 0.06, 0.05), shieldCol, -0.46, 0.02, 0.02);
    part(shieldArm, box(0.1, 0.36, 0.03), cross, -0.46, 0.04, 0.07);
    part(shieldArm, box(0.3, 0.1, 0.03), cross, -0.46, 0.06, 0.07);
    dummyBody.add(shieldArm);
    dummy.position.copy(dummyAt);
    dummy.rotation.y = Math.atan2(landing.x - dummyAt.x, landing.z - dummyAt.z);
    scene.add(dummy);
    mergeStatic(dummyBody);
    dummyRing = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.74, 28),
      new THREE.MeshBasicMaterial({ color: "#ffc93c", transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })
    );
    dummyRing.rotation.x = -Math.PI / 2;
    dummyRing.position.y = 0.05;
    dummyRing.visible = false;
    dummy.add(dummyRing);
    dummyFocus = new THREE.Vector3(dummyAt.x, dummyAt.y + 1.45, dummyAt.z);

    const makeSwordPickup = ({ model, name, size, handName, offset }) => {
      const at = landing.clone();
      at.x += offset[0];
      at.z += offset[1];
      if (!island.nav.walkable(at.x, at.z)) {
        const near = island.nav.nearest(at.x, at.z);
        if (near) at.copy(near);
      }
      at.y = island.groundAt(at.x, at.z);

      const object = new THREE.Group();
      object.name = name;
      object.position.set(at.x, at.y + 0.66 * size, at.z);
      object.rotation.set(0.14, 0.6, Math.PI + 0.1);
      object.scale.setScalar(size);
      scene.add(object);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.46, 0.56, 28),
        new THREE.MeshBasicMaterial({ color: "#ffc93c", transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(at.x, at.y + 0.05, at.z);
      scene.add(ring);

      const grip = {
        held: false,
        flying: 0,
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
        scale: 1,
        fromPosition: new THREE.Vector3(),
        fromQuaternion: new THREE.Quaternion(),
        fromScale: size,
      };
      const load = async () => {
        const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
        const gltf = await new GLTFLoader().parseAsync(model.buffer.slice(model.byteOffset, model.byteOffset + model.byteLength), "");
        gltf.scene.traverse((node) => {
          if (!node.isMesh) return;
          node.material = softMapped(node.material.map);
          node.castShadow = true;
          node.receiveShadow = true;
        });
        object.add(gltf.scene);
        bakeShadows();
      };
      load().catch((error) => console.warn(`${name} model failed`, error));

      const fitGrip = () => {
        const bones = bot.bones;
        const hand = bones?.[handName];
        const index = bones?.[`${handName}Index1`]?.position;
        const pinky = bones?.[`${handName}Pinky1`]?.position;
        const middle = bones?.[`${handName}Middle1`]?.position;
        if (!hand || !index || !pinky || !middle) return false;
        const knuckles = index.clone().sub(pinky).normalize();
        const fingers = middle.clone().addScaledVector(knuckles, -middle.dot(knuckles)).normalize();
        const palm = new THREE.Vector3().crossVectors(knuckles, fingers).normalize();
        const thumb = bones[`${handName}Thumb1`]?.position;
        if (thumb && thumb.dot(palm) < 0) palm.negate();
        const dip = THREE.MathUtils.degToRad(35);
        const along = knuckles.multiplyScalar(Math.cos(dip)).addScaledVector(fingers, Math.sin(dip));
        const across = new THREE.Vector3().crossVectors(along, palm);
        grip.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, along, palm));
        const handScale = hand.getWorldScale(new THREE.Vector3()).x;
        grip.scale = size / handScale;
        grip.position.copy(middle).multiplyScalar(0.75)
          .addScaledVector(palm, 0.03 / handScale)
          .addScaledVector(new THREE.Vector3(0, 0.1, 0).applyQuaternion(grip.quaternion), -grip.scale);
        return true;
      };
      const equip = () => {
        bot.bones[handName].add(object);
        object.position.copy(grip.position);
        object.quaternion.copy(grip.quaternion);
        object.scale.setScalar(grip.scale);
        grip.flying = 0;
        grip.held = true;
        ring.visible = false;
      };
      const target = new THREE.Matrix4();
      const to = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3() };
      const update = (dt, time) => {
        if (grip.held) return;
        ring.material.opacity = 0.4 + Math.sin(time * 3) * 0.2;
        if (!grip.flying) {
          if (getIntroLive() || !object.children.length) return;
          if (Math.hypot(robot.position.x - at.x, robot.position.z - at.z) > 1.1 || !fitGrip()) return;
          grip.fromPosition.copy(object.position);
          grip.fromQuaternion.copy(object.quaternion);
          grip.fromScale = object.scale.x;
          grip.flying = 0.0001;
          ring.visible = false;
        }
        grip.flying = Math.min(1, grip.flying + dt / 0.4);
        if (grip.flying >= 1) {
          equip();
          return;
        }
        const ease = grip.flying * grip.flying * (3 - 2 * grip.flying);
        const hand = bot.bones[handName];
        hand.updateWorldMatrix(true, false);
        target.compose(grip.position, grip.quaternion, to.scale.setScalar(grip.scale));
        target.premultiply(hand.matrixWorld).decompose(to.position, to.quaternion, to.scale);
        object.position.lerpVectors(grip.fromPosition, to.position, ease);
        object.position.y += Math.sin(ease * Math.PI) * 0.6;
        object.quaternion.slerpQuaternions(grip.fromQuaternion, to.quaternion, ease);
        object.scale.setScalar(THREE.MathUtils.lerp(grip.fromScale, to.scale.x, ease));
      };
      const debug = (give) => {
        if (give && !grip.held && fitGrip()) equip();
        return { held: grip.held, at: at.toArray().map((n) => +n.toFixed(2)) };
      };
      return { update, debug };
    };

    swordPickup = makeSwordPickup({
      model: xiphosGlb,
      name: "Xiphos",
      size: 1.15,
      handName: "RightHand",
      offset: [-Math.SQRT1_2 * 1.2, Math.SQRT1_2 * 2.8],
    });
    longswordPickup = makeSwordPickup({
      model: longswordGlb,
      name: "Longsword",
      size: 0.97,
      handName: "LeftHand",
      offset: [Math.SQRT1_2 * 1.3, -Math.SQRT1_2 * 1.3],
    });

    /* Sample Boss handler (world-boss.js, world-boss-anim.js, world-smear.js) */
    werewolfBoss = createWerewolfBoss({
      scene,
      island,
      landing,
      robot,
      colliders,
      decal,
      halo,
      glow,
      softMapped,
      bakeShadows,
      isIntroLive: getIntroLive,
      addShake,
    });

    colliders.push({ x: dummyAt.x, z: dummyAt.z, r: 0.45 });
  };

  /* Input raycast & lock-on picking */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundHit = new THREE.Vector3();

  /* The ray is marched down from above the shrine until it dips under the ground, then refined by halving */
  const rayGround = (ray, out) => {
    const top = (12 - ray.origin.y) / ray.direction.y;
    const bottom = (-1.5 - ray.origin.y) / ray.direction.y;
    let last = top;
    for (let t = top; t <= bottom; t += 0.15) {
      ray.at(t, out);
      if (out.y <= island.groundAt(out.x, out.z)) {
        let lo = last;
        let hi = t;
        for (let k = 0; k < 8; k += 1) {
          const mid = (lo + hi) / 2;
          ray.at(mid, out);
          if (out.y <= island.groundAt(out.x, out.z)) hi = mid;
          else lo = mid;
        }
        return ray.at(hi, out);
      }
      last = t;
    }
    return null;
  };
  let hovered = null;

  const castAt = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(interactiveGroups, true);

    for (const hit of hits) {
      let node = hit.object;
      while (node && !node.userData.worldObject) {
        node = node.parent;
      }
      if (node) {
        return { obj: node.userData.worldObject };
      }
    }

    if (rayGround(raycaster.ray, groundHit)) {
      return { point: groundHit.clone() };
    }

    return {};
  };

  /* Middle-click or G: a hit on the boss/dummy locks on, a miss clears it. Same rule as Pixel Pass. */
  const pickLockTarget = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hitBoss = werewolfBoss?.group && raycaster.intersectObject(werewolfBoss.group, true).length;
    const hitDummy = dummy && raycaster.intersectObject(dummy, true).length;
    if (hitBoss) return werewolfBoss.group;
    if (hitDummy) return dummy;
    return null;
  };

  if (!coarse) {
    let hoverQueued = false;
    canvas.addEventListener("pointermove", (event) => {
      if (hoverQueued) {
        return;
      }
      hoverQueued = true;
      window.requestAnimationFrame(() => {
        hoverQueued = false;
        const next = castAt(event.clientX, event.clientY).obj || null;

        if (next !== hovered) {
          hovered?.plate.classList.remove("is-hover");
          next?.plate.classList.add("is-hover");
          hovered = next;
          canvas.style.cursor = next ? "pointer" : "";
        }
      });
    });
  }

  const interactNear = () => {
    const state = getState();
    const robot = robotRef;
    const obj = state.near;

    if (!obj || !robot) {
      return;
    }

    if (obj.def.action.type === "link") {
      window.open(obj.def.action.href, "_blank", "noopener");
      return;
    }

    state.yaw = Math.atan2(obj.def.x - robot.position.x, obj.def.z - robot.position.z);
    act(obj);
  };

  promptOpen.addEventListener("click", interactNear);

  const updateRoute = (dt) => {
    const state = getState();
    const robot = robotRef;
    const clock = getClock();
    if (!routeDots.count || !robot) return;
    route.age += dt;
    let left = 0;
    let prev = robot.position;
    for (const point of state.path) {
      left += Math.hypot(point.x - prev.x, point.z - prev.z);
      prev = point;
    }
    const done = route.length - left;
    route.fade = THREE.MathUtils.damp(route.fade, state.path.length ? 1 : 0, state.path.length ? 14 : 8, dt);
    if (!state.path.length && route.fade < 0.02) {
      routeDots.count = 0;
      return;
    }
    routeDots.material.opacity = 0.92 * route.fade;
    route.dots.forEach((dot, i) => {
      const grow = calm ? 1 : THREE.MathUtils.clamp((route.age * 30 - dot.along) / 1.2, 0, 1);
      const eaten = THREE.MathUtils.clamp((dot.along - done) / 0.6, 0, 1);
      const pulse = calm ? 1 : 1 + Math.max(0, Math.sin(clock * 5 - dot.along * 0.9)) * 0.22;
      routeSize.setScalar(grow * eaten * pulse);
      routeDots.setMatrixAt(i, routeMatrix.compose(routeSpot.set(dot.x, dot.y, dot.z), routeQuat, routeSize));
    });
    routeDots.instanceMatrix.needsUpdate = true;
  };

  /* Prompt for whatever the robot is standing next to */
  const updatePrompt = () => {
    const state = getState();
    const robot = robotRef;
    if (!robot) return;
    let near = null;

    if (!state.path.length) {
      let best = Infinity;
      objects.forEach((obj) => {
        const d = Math.hypot(robot.position.x - obj.spot.x, robot.position.z - obj.spot.z);
        if (d < 1.3 && d < best) {
          best = d;
          near = obj;
        }
      });
    }

    if (near === state.near) {
      return;
    }

    state.near = near;
    prompt.hidden = !near;

    if (!near) {
      return;
    }

    const action = near.def.action;
    const isLink = action.type === "link";
    promptOpen.hidden = isLink;
    promptLink.hidden = !isLink;

    if (isLink) {
      promptLink.href = action.href;
      promptLinkLabel.textContent = action.text || `Open ${near.def.label}`;
    } else {
      promptLabel.textContent = `Open ${near.def.label}`;
    }
  };

  const projected = new THREE.Vector3();

  const placeLabels = () => {
    const state = getState();
    const hudBottom = getHudBottom();
    const width = host.clientWidth;
    const height = host.clientHeight;

    objects.forEach((obj) => {
      projected.copy(obj.labelAt).project(camera);
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      const off = x < -60 || x > width + 60 || y < hudBottom + 30 || y > height + 40;
      obj.plate.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      obj.plate.classList.toggle("is-off", off);
      obj.plate.classList.toggle("is-near", obj === state.near);
    });
  };

  const updateActors = (dt, time) => {
    swordPickup?.update(dt, time);
    longswordPickup?.update(dt, time);
    werewolfBoss?.update(dt, time);
  };

  const updateStops = (dt, time) => {
    const state = getState();
    if (!calm) {
      spinners.forEach((spinner) => {
        spinner.mesh.rotation.y = time * 0.9 + spinner.offset;
        spinner.mesh.position.y = spinner.base + Math.sin(time * 1.6 + spinner.offset) * 0.08;
      });

      moteDrift.forEach((mote, i) => {
        motes[i * 3] += Math.sin(time * 0.6 + mote.phase) * 0.18 * dt;
        motes[i * 3 + 1] += mote.rise * dt;
        motes[i * 3 + 2] += Math.cos(time * 0.5 + mote.phase) * 0.18 * dt;
        if (motes[i * 3 + 1] > 12) {
          motes[i * 3 + 1] = 1;
        }
      });
      moteGeo.attributes.position.needsUpdate = true;
      moteField.material.opacity = 0.62 + Math.sin(time * 1.3) * 0.12;
    }

    objects.forEach((obj) => {
      const target = obj === hovered || obj === state.near ? 1 : 0;
      obj.hover = THREE.MathUtils.damp(obj.hover, target, 12, dt);
      const scale = (obj.def.scale && !obj.def.model ? obj.def.scale : 1) * (1 + obj.hover * 0.04);
      obj.group.scale.setScalar(scale);
    });

    updateRoute(dt);
    if (marker.visible) {
      markerAge += dt / 0.55;
      marker.scale.setScalar(0.6 + markerAge * 0.9);
      marker.material.opacity = Math.max(0, 1 - markerAge);
      marker.visible = markerAge < 1;
    }
  };

  return {
    softRamp,
    toon,
    soft,
    softMapped,
    glow,
    box,
    part,
    flat,
    mergeStatic,
    manager,
    fromDisk,
    decal,
    halo,
    objects,
    byId,
    colliders,
    spawnEntities,
    get dummy() {
      return dummy;
    },
    get dummyRing() {
      return dummyRing;
    },
    get dummyFocus() {
      return dummyFocus;
    },
    get swordPickup() {
      return swordPickup;
    },
    get longswordPickup() {
      return longswordPickup;
    },
    get werewolfBoss() {
      return werewolfBoss;
    },
    castAt,
    pickLockTarget,
    goTo,
    goToObject,
    arrive,
    interactNear,
    updatePrompt,
    placeLabels,
    updateActors,
    updateStops,
  };
}
