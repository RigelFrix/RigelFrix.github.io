/* Play world: an isometric arcade floor where a robot walks to whatever you click and opens it.
   Objects come from world-data.js; the panels they open live in index.html and script.js. */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const root = document.documentElement;
const host = document.getElementById("world");

window.PortfolioWorld = { active: root.classList.contains("world") };

const giveUp = (error) => {
  console.error("Play world failed to start", error);
  root.classList.remove("world", "world-ready");
  window.PortfolioWorld = { active: false };
};

if (window.PortfolioWorld.active && host) {
  start().catch(giveUp);
}

async function start() {
  const PAL = {
    cobalt: "#2430e6",
    cobaltDeep: "#1a21b8",
    ink: "#0e0c2b",
    inkRaise: "#1c1950",
    red: "#f23a2e",
    redDeep: "#d42a1f",
    yellow: "#ffc93c",
    cream: "#fff6e0",
  };

  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const gsap = window.gsap;
  const projects = window.PROJECT_ALBUMS || [];
  const defs = window.WORLD_OBJECTS || [];
  const HALF = 16;
  const LIMIT = HALF - 0.8;
  const ROBOT_R = 0.45;
  const SPEED = 4.6;

  const canvas = document.getElementById("world-canvas");
  const labelsEl = document.getElementById("world-labels");
  const prompt = document.getElementById("world-prompt");
  const promptOpen = document.getElementById("world-prompt-open");
  const promptLabel = document.getElementById("world-prompt-label");
  const promptLink = document.getElementById("world-prompt-link");
  const promptLinkLabel = document.getElementById("world-prompt-link-label");
  const loadingFill = document.getElementById("world-loading-fill");

  await Promise.race([
    document.fonts?.load('900 64px "Big Shoulders Display"') ?? Promise.resolve(),
    new Promise((resolve) => window.setTimeout(resolve, 1500)),
  ]);

  /* Renderer, scene, camera */

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.ink);
  scene.fog = new THREE.Fog(PAL.ink, 42, 70);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const camOffset = new THREE.Vector3(16, 17, 16);
  const camLook = new THREE.Vector3(0, 0, 0);
  let viewHeight = 16;

  const hemi = new THREE.HemisphereLight(PAL.cream, PAL.cobaltDeep, 1.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight("#fff1d6", 2.4);
  sun.position.set(9, 18, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  /* Materials and building blocks */

  const ramp = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  ramp.minFilter = THREE.NearestFilter;
  ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;

  const toonCache = new Map();
  const toon = (color) => {
    if (!toonCache.has(color)) {
      toonCache.set(color, new THREE.MeshToonMaterial({ color, gradientMap: ramp }));
    }
    return toonCache.get(color);
  };
  const glow = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const box = (w, h, d, r = 0) => (r ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d));

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

  const manager = new THREE.LoadingManager();
  const textureLoader = new THREE.TextureLoader(manager);
  const fromDisk = window.location.protocol === "file:";

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

  const textTexture = (text, { bg, fg, width = 512, height = 128, size = 86 }) => {
    const board = document.createElement("canvas");
    board.width = width;
    board.height = height;
    const ctx = board.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    let font = size;
    ctx.font = `900 ${font}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
    const label = text.toUpperCase();

    while (ctx.measureText(label).width > width * 0.86 && font > 24) {
      font -= 4;
      ctx.font = `900 ${font}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
    }

    const skew = Math.tan((-8 * Math.PI) / 180);
    ctx.setTransform(1, 0, skew, 1, (-skew * height) / 2, 0);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, width / 2, height / 2 + font * 0.06);

    const texture = new THREE.CanvasTexture(board);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  };

  const codeTexture = () => {
    const board = document.createElement("canvas");
    board.width = 256;
    board.height = 144;
    const ctx = board.getContext("2d");
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(0, 0, 256, 144);
    const colours = [PAL.yellow, PAL.red, PAL.cream, "#7f86f5"];
    let y = 16;

    for (let line = 0; line < 9; line += 1) {
      let x = 14 + (line % 3) * 12;
      const pieces = 2 + (line % 3);

      for (let piece = 0; piece < pieces; piece += 1) {
        const w = 18 + ((line * 7 + piece * 13) % 46);
        ctx.fillStyle = colours[(line + piece) % colours.length];
        ctx.fillRect(x, y, w, 6);
        x += w + 8;
      }

      y += 14;
    }

    const texture = new THREE.CanvasTexture(board);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };

  /* Floor: a cobalt arcade stage with a yellow trim */

  const stage = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 1, HALF * 2), [
    toon(PAL.cobaltDeep),
    toon(PAL.cobaltDeep),
    toon(PAL.cobalt),
    toon(PAL.cobaltDeep),
    toon(PAL.cobaltDeep),
    toon(PAL.cobaltDeep),
  ]);
  stage.position.y = -0.5;
  stage.receiveShadow = true;
  scene.add(stage);

  const grid = new THREE.GridHelper(HALF * 2, HALF, PAL.cobaltDeep, PAL.cobaltDeep);
  grid.position.y = 0.006;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  scene.add(grid);

  const trimMat = glow(PAL.yellow);
  [
    [0, HALF, HALF * 2 + 0.16, 0.16],
    [0, -HALF, HALF * 2 + 0.16, 0.16],
    [HALF, 0, 0.16, HALF * 2],
    [-HALF, 0, 0.16, HALF * 2],
  ].forEach(([x, z, w, d]) => flat(scene, new THREE.BoxGeometry(w, 0.1, d), trimMat, x, 0.02, z));

  const spawnRing = flat(scene, new THREE.RingGeometry(1.15, 1.42, 6), glow(PAL.yellow), 0, 0.02, 0);
  spawnRing.rotation.x = -Math.PI / 2;

  /* World objects */

  const spinners = [];
  const projectsById = new Map(projects.map((project, index) => [project.id, { project, index }]));

  const builders = {
    cabinet(def, order) {
      const g = new THREE.Group();
      const sideColour = order % 2 ? PAL.yellow : PAL.red;
      const marqueeText = order % 2 ? PAL.ink : PAL.cream;
      const project = projectsById.get(def.action?.project)?.project;

      part(g, box(1.5, 2.3, 1.2, 0.06), toon(PAL.inkRaise), 0, 1.15, 0);
      part(g, box(0.1, 2.5, 1.3, 0.03), toon(sideColour), -0.8, 1.25, 0);
      part(g, box(0.1, 2.5, 1.3, 0.03), toon(sideColour), 0.8, 1.25, 0);

      const deck = part(g, box(1.5, 0.14, 0.6, 0.04), toon(PAL.ink), 0, 1.08, 0.78);
      deck.rotation.x = 0.16;
      part(g, new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8), toon(PAL.ink), -0.38, 1.25, 0.82);
      part(g, new THREE.SphereGeometry(0.085, 14, 10), toon(PAL.red), -0.38, 1.37, 0.82);
      [0.08, 0.3, 0.52].forEach((x, i) => {
        part(g, new THREE.CylinderGeometry(0.065, 0.065, 0.06, 14), toon(i === 1 ? PAL.yellow : PAL.red), x, 1.17, 0.8);
      });

      const bezel = part(g, box(1.4, 1.02, 0.04, 0.02), toon(PAL.ink), 0, 1.72, 0.61);
      bezel.rotation.x = -0.1;
      const screenMat = project?.select?.tile
        ? new THREE.MeshBasicMaterial({ map: imageTexture(project.select.tile, 1.26 / 0.88), toneMapped: false })
        : glow(PAL.cobalt);
      const screen = flat(g, new THREE.PlaneGeometry(1.26, 0.88), screenMat, 0, 1.72, 0.635);
      screen.rotation.x = -0.1;

      part(g, box(1.6, 0.46, 0.5, 0.04), toon(sideColour), 0, 2.5, 0.3);
      flat(
        g,
        new THREE.PlaneGeometry(1.44, 0.34),
        new THREE.MeshBasicMaterial({ map: textTexture(def.label, { bg: sideColour, fg: marqueeText }), toneMapped: false }),
        0,
        2.5,
        0.555
      );

      return { group: g, labelY: 3.2, radius: 1.05, reach: 1.8 };
    },

    desk() {
      const g = new THREE.Group();
      flat(g, new THREE.BoxGeometry(3.8, 0.04, 3), toon(PAL.cobaltDeep), 0, 0.02, 0.25).receiveShadow = true;
      part(g, box(2.4, 0.12, 1.1, 0.03), toon(PAL.cream), 0, 0.95, -0.2);
      [-1.1, 1.1].forEach((x) => [-0.62, 0.22].forEach((z) => part(g, box(0.1, 0.9, 0.1), toon(PAL.ink), x, 0.45, z)));

      part(g, box(0.14, 0.32, 0.1), toon(PAL.ink), 0, 1.16, -0.48);
      part(g, box(1.24, 0.76, 0.08, 0.03), toon(PAL.ink), 0, 1.64, -0.48);
      flat(g, new THREE.PlaneGeometry(1.1, 0.62), new THREE.MeshBasicMaterial({ map: codeTexture(), toneMapped: false }), 0, 1.64, -0.435);
      part(g, box(0.82, 0.04, 0.26, 0.015), toon(PAL.inkRaise), 0, 1.03, 0.02);
      part(g, new THREE.CylinderGeometry(0.08, 0.08, 0.16, 14), toon(PAL.yellow), -0.85, 1.09, 0.05);

      const frame = new THREE.Group();
      frame.position.set(0.86, 1.27, -0.3);
      frame.rotation.set(-0.12, -0.35, 0);
      g.add(frame);
      part(frame, box(0.44, 0.54, 0.05, 0.015), toon(PAL.red), 0, 0, 0);
      flat(frame, new THREE.PlaneGeometry(0.34, 0.44), new THREE.MeshBasicMaterial({ map: imageTexture("./assets/me.jpg", 0.34 / 0.44), toneMapped: false }), 0, 0, 0.03);

      part(g, new THREE.CylinderGeometry(0.36, 0.36, 0.05, 16), toon(PAL.ink), 0, 0.03, 0.75);
      part(g, new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), toon(PAL.ink), 0, 0.3, 0.75);
      part(g, box(0.72, 0.1, 0.66, 0.04), toon(PAL.red), 0, 0.6, 0.75);
      part(g, box(0.72, 0.74, 0.1, 0.04), toon(PAL.red), 0, 1.0, 1.06);

      return { group: g, labelY: 2.7, radius: 1.45, reach: 2.1 };
    },

    skills() {
      const g = new THREE.Group();
      [-1.25, 1.25].forEach((x) => part(g, box(0.12, 2.4, 0.12), toon(PAL.ink), x, 1.2, -0.7));
      part(g, box(2.9, 0.78, 0.12, 0.04), toon(PAL.red), 0, 2.25, -0.7);
      flat(
        g,
        new THREE.PlaneGeometry(2.7, 0.6),
        new THREE.MeshBasicMaterial({ map: textTexture("Move list", { bg: PAL.red, fg: PAL.cream }), toneMapped: false }),
        0,
        2.25,
        -0.635
      );

      const gems = [new THREE.OctahedronGeometry(0.27), new THREE.IcosahedronGeometry(0.25), box(0.32, 0.32, 0.32, 0.05)];
      const gemColours = [PAL.red, PAL.yellow, PAL.cream];
      [-0.95, 0, 0.95].forEach((x, i) => {
        part(g, new THREE.CylinderGeometry(0.32, 0.4, 0.9, 8), toon(PAL.inkRaise), x, 0.45, 0);
        part(g, new THREE.CylinderGeometry(0.37, 0.37, 0.06, 8), toon(PAL.yellow), x, 0.93, 0);
        const gem = part(g, gems[i], toon(gemColours[i]), x, 1.36, 0);
        spinners.push({ mesh: gem, base: 1.36, offset: i * 1.7 });
      });

      return { group: g, labelY: 3.1, radius: 1.6, reach: 2.0 };
    },

    signpost() {
      const g = new THREE.Group();
      part(g, new THREE.CylinderGeometry(0.09, 0.11, 3.2, 10), toon(PAL.ink), 0, 1.6, 0);
      part(g, new THREE.SphereGeometry(0.15, 14, 10), toon(PAL.yellow), 0, 3.26, 0);

      [
        { text: "Game dev", bg: PAL.yellow, fg: PAL.ink, y: 2.78, turn: 0.4 },
        { text: "Full-stack", bg: PAL.red, fg: PAL.cream, y: 2.22, turn: -0.5 },
        { text: "Indie 2019", bg: PAL.cream, fg: PAL.ink, y: 1.66, turn: 0.15 },
      ].forEach((sign) => {
        const arm = new THREE.Group();
        arm.position.y = sign.y;
        arm.rotation.y = sign.turn;
        g.add(arm);
        part(arm, box(1.7, 0.42, 0.08, 0.03), toon(sign.bg), 0.78, 0, 0);
        const texture = textTexture(sign.text, { bg: sign.bg, fg: sign.fg, width: 512, height: 128 });
        flat(arm, new THREE.PlaneGeometry(1.56, 0.36), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), 0.78, 0, 0.045);
        const back = flat(arm, new THREE.PlaneGeometry(1.56, 0.36), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), 0.78, 0, -0.045);
        back.rotation.y = Math.PI;
      });

      [0.9, 1.75, 2.6].forEach((z, i) => {
        const stone = part(g, new THREE.CylinderGeometry(0.34, 0.34, 0.06, 6), toon(i % 2 ? PAL.cobaltDeep : PAL.inkRaise), 0, 0.03, z);
        stone.castShadow = false;
      });

      return { group: g, labelY: 3.9, radius: 1.35, reach: 2.0 };
    },

    mailbox() {
      const g = new THREE.Group();
      part(g, box(0.16, 1.0, 0.16), toon(PAL.ink), -0.7, 0.5, 0);
      part(g, box(0.62, 0.5, 0.95, 0.06), toon(PAL.red), -0.7, 1.25, 0);
      const lid = part(g, new THREE.CylinderGeometry(0.31, 0.31, 0.95, 18), toon(PAL.red), -0.7, 1.5, 0);
      lid.rotation.x = Math.PI / 2;
      part(g, box(0.5, 0.42, 0.03, 0.02), toon(PAL.redDeep), -0.7, 1.32, 0.48);

      const flag = new THREE.Group();
      flag.position.set(-0.37, 1.2, 0.18);
      g.add(flag);
      part(flag, box(0.04, 0.5, 0.04), toon(PAL.yellow), 0, 0.25, 0);
      part(flag, box(0.04, 0.18, 0.26), toon(PAL.yellow), 0, 0.42, 0.13);
      flag.rotation.x = -Math.PI / 2;

      [0.25, 1.95].forEach((x) => part(g, box(0.1, 1.7, 0.1), toon(PAL.ink), x, 0.85, -0.1));
      part(g, box(2.0, 0.72, 0.1, 0.03), toon(PAL.ink), 1.1, 1.75, -0.1);
      flat(
        g,
        new THREE.PlaneGeometry(1.86, 0.58),
        new THREE.MeshBasicMaterial({ map: textTexture("Continue?", { bg: PAL.ink, fg: PAL.yellow }), toneMapped: false }),
        1.1,
        1.75,
        -0.045
      );

      return {
        group: g,
        labelY: 2.9,
        radius: 1.55,
        reach: 2.0,
        react() {
          if (gsap && !calm) {
            gsap.fromTo(flag.rotation, { x: -Math.PI / 2 }, { x: 0, duration: 0.5, ease: "back.out(2.4)" });
          } else {
            flag.rotation.x = 0;
          }
        },
      };
    },

    board() {
      const g = new THREE.Group();
      [-0.52, 0.52].forEach((x) => {
        const leg = part(g, box(0.08, 2.3, 0.08), toon(PAL.ink), x, 1.1, -0.05);
        leg.rotation.x = 0.08;
      });
      const back = part(g, box(0.08, 1.9, 0.08), toon(PAL.ink), 0, 0.95, -0.42);
      back.rotation.x = -0.32;

      const panel = new THREE.Group();
      panel.position.set(0, 1.5, 0.05);
      panel.rotation.x = -0.08;
      g.add(panel);
      part(panel, box(1.34, 1.8, 0.08, 0.03), toon(PAL.ink), 0, 0, 0);
      flat(
        panel,
        new THREE.PlaneGeometry(1.18, 1.64),
        new THREE.MeshBasicMaterial({ map: imageTexture("./assets/resume-display.jpg", 1.18 / 1.64), toneMapped: false }),
        0,
        0,
        0.045
      );

      return { group: g, labelY: 2.95, radius: 0.95, reach: 1.7 };
    },

    lamp() {
      const g = new THREE.Group();
      part(g, new THREE.CylinderGeometry(0.3, 0.36, 0.2, 8), toon(PAL.ink), 0, 0.1, 0);
      part(g, new THREE.CylinderGeometry(0.07, 0.07, 3, 8), toon(PAL.ink), 0, 1.6, 0);
      part(g, box(0.56, 0.26, 0.56, 0.05), toon(PAL.inkRaise), 0, 3.15, 0);
      flat(g, new THREE.BoxGeometry(0.44, 0.06, 0.44), glow(PAL.yellow), 0, 3.0, 0);
      return { group: g, radius: 0.4 };
    },

    crate(def) {
      const g = new THREE.Group();
      part(g, box(1, 1, 1, 0.05), toon(PAL.redDeep), 0, 0.5, 0);
      [0.22, 0.78].forEach((y) => part(g, box(1.03, 0.1, 1.03, 0.02), toon(PAL.cream), 0, y, 0));
      return { group: g, radius: 0.78 * (def.scale || 1) };
    },

    pedestal() {
      const g = new THREE.Group();
      part(g, new THREE.CylinderGeometry(0.6, 0.7, 0.3, 8), toon(PAL.inkRaise), 0, 0.15, 0);
      return { group: g, labelY: 2.6, radius: 0.9, reach: 1.7 };
    },
  };

  const objects = [];
  const byId = new Map();
  const colliders = [];
  let cabinetOrder = 0;

  defs.forEach((def) => {
    const build = builders[def.kind] || builders.pedestal;
    const built = build(def, def.kind === "cabinet" ? cabinetOrder++ : 0);
    const group = built.group;
    const facing = THREE.MathUtils.degToRad(def.facing || 0);
    group.position.set(def.x, 0, def.z);
    group.rotation.y = facing;

    if (def.scale && !def.model) {
      group.scale.setScalar(def.scale);
    }

    scene.add(group);

    const radius = def.radius || built.radius || 0.8;
    colliders.push({ x: def.x, z: def.z, r: radius });

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
      spot: new THREE.Vector3(def.x, 0, def.z).addScaledVector(forward, reach),
      labelAt: new THREE.Vector3(def.x, built.labelY || 2.6, def.z),
      hover: 0,
      plate: null,
    };
    group.userData.worldObject = obj;

    const plate = document.createElement("button");
    plate.type = "button";
    plate.className = "world-plate";
    plate.textContent = def.label;
    plate.setAttribute("aria-label", `Walk to ${def.label}`);
    plate.addEventListener("click", () => goToObject(obj));
    labelsEl.append(plate);
    obj.plate = plate;

    objects.push(obj);
    byId.set(def.id, obj);

    if (def.model) {
      loadModel(obj);
    }
  });

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
    } catch (error) {
      console.warn(`Could not load ${obj.def.model}`, error);
    }
  }

  const interactiveGroups = objects.map((obj) => obj.group);

  /* Robot */

  const buildRobot = () => {
    const robot = new THREE.Group();
    const body = new THREE.Group();
    robot.add(body);
    const shell = toon(PAL.cream);
    const dark = toon(PAL.inkRaise);
    const accent = toon(PAL.red);

    const legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(0.19 * side, 0.62, 0);
      body.add(hip);
      part(hip, new THREE.CapsuleGeometry(0.12, 0.3, 4, 10), dark, 0, -0.27, 0);
      part(hip, box(0.26, 0.14, 0.38, 0.05), accent, 0, -0.55, 0.05);
      return hip;
    });

    part(body, box(0.82, 0.72, 0.58, 0.14), shell, 0, 1.0, 0);
    part(body, box(0.42, 0.26, 0.06, 0.04), accent, 0, 1.02, 0.29);
    const core = flat(body, new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16), glow(PAL.yellow), 0, 1.02, 0.33);
    core.rotation.x = Math.PI / 2;

    const arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.5 * side, 1.22, 0);
      body.add(shoulder);
      part(shoulder, new THREE.CapsuleGeometry(0.1, 0.3, 4, 10), shell, 0.02 * side, -0.24, 0);
      part(shoulder, new THREE.SphereGeometry(0.13, 14, 12), accent, 0.02 * side, -0.5, 0);
      return shoulder;
    });

    const head = new THREE.Group();
    head.position.set(0, 1.4, 0);
    body.add(head);
    part(head, box(0.9, 0.64, 0.66, 0.18), shell, 0, 0.3, 0);
    part(head, box(0.72, 0.36, 0.06, 0.08), toon(PAL.ink), 0, 0.3, 0.32);
    const eyes = [-0.15, 0.15].map((x) => flat(head, box(0.12, 0.16, 0.02), glow(PAL.yellow), x, 0.31, 0.36));
    [-1, 1].forEach((side) => {
      const bolt = part(head, new THREE.CylinderGeometry(0.08, 0.08, 0.08, 14), accent, 0.47 * side, 0.3, 0);
      bolt.rotation.z = Math.PI / 2;
    });

    const antenna = new THREE.Group();
    antenna.position.set(0, 0.62, 0);
    head.add(antenna);
    part(antenna, new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), dark, 0, 0.15, 0);
    part(antenna, new THREE.SphereGeometry(0.085, 14, 12), accent, 0, 0.34, 0);

    scene.add(robot);
    return { robot, body, legs, arms, head, eyes, antenna };
  };

  const bot = buildRobot();
  const robot = bot.robot;
  robot.position.set(0, 0, 0);

  /* Click marker */

  const marker = flat(scene, new THREE.RingGeometry(0.26, 0.4, 32), new THREE.MeshBasicMaterial({ color: PAL.yellow, transparent: true, toneMapped: false }), 0, 0.03, 0);
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  let markerAge = 1;

  const showMarker = (point) => {
    marker.position.set(point.x, 0.03, point.z);
    marker.visible = true;
    markerAge = 0;
  };

  /* Movement */

  const state = {
    path: [],
    pending: null,
    keys: new Set(),
    walk: 0,
    yaw: 0,
    hop: 1,
    stuck: 0,
    near: null,
    phase: 0,
    blinkAt: 2,
  };

  const resolveCollisions = (pos) => {
    colliders.forEach((c) => {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = c.r + ROBOT_R;
      const d2 = dx * dx + dz * dz;

      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.0001;
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    });
    pos.x = THREE.MathUtils.clamp(pos.x, -LIMIT, LIMIT);
    pos.z = THREE.MathUtils.clamp(pos.z, -LIMIT, LIMIT);
    return pos;
  };

  const planPath = (from, to, depth = 0) => {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len2 = dx * dx + dz * dz;

    if (depth > 2 || len2 < 0.0001) {
      return [to];
    }

    let first = null;

    colliders.forEach((c) => {
      const r = c.r + ROBOT_R + 0.1;
      const t = THREE.MathUtils.clamp(((c.x - from.x) * dx + (c.z - from.z) * dz) / len2, 0, 1);
      const cx = from.x + dx * t;
      const cz = from.z + dz * t;
      const dist = Math.hypot(cx - c.x, cz - c.z);

      if (t > 0.02 && t < 0.98 && dist < r && (!first || t < first.t)) {
        first = { c, t, cx, cz, dist, r };
      }
    });

    if (!first) {
      return [to];
    }

    const { c, cx, cz, dist, r } = first;
    let nx = (cx - c.x) / (dist || 1);
    let nz = (cz - c.z) / (dist || 1);

    if (dist < 0.01) {
      const len = Math.sqrt(len2);
      nx = -dz / len;
      nz = dx / len;
    }

    const detour = resolveCollisions(new THREE.Vector3(c.x + nx * (r + 0.45), 0, c.z + nz * (r + 0.45)));
    return [...planPath(from, detour, depth + 1), ...planPath(detour, to, depth + 1)];
  };

  const goTo = (point, obj = null) => {
    const target = resolveCollisions(point.clone());
    state.path = planPath(robot.position.clone(), target);
    state.pending = obj;
    state.stuck = 0;
    showMarker(target);
  };

  function goToObject(obj) {
    if (robot.position.distanceTo(obj.spot) < 0.35) {
      state.path = [];
      state.pending = obj;
      arrive();
      return;
    }

    goTo(obj.spot, obj);
  }

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
    const obj = state.pending;
    state.pending = null;

    if (!obj) {
      return;
    }

    state.yaw = Math.atan2(obj.def.x - robot.position.x, obj.def.z - robot.position.z);
    state.hop = 0;

    if (obj.def.action.type === "link") {
      return;
    }

    window.setTimeout(() => act(obj), calm ? 0 : 320);
  }

  /* Input: pointer */

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundHit = new THREE.Vector3();
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

    if (raycaster.ray.intersectPlane(groundPlane, groundHit)) {
      return { point: groundHit.clone() };
    }

    return {};
  };

  let press = null;

  canvas.addEventListener("pointerdown", (event) => {
    press = { x: event.clientX, y: event.clientY };
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
      press = null;
      return;
    }

    press = null;
    const hit = castAt(event.clientX, event.clientY);

    if (hit.obj) {
      goToObject(hit.obj);
    } else if (hit.point) {
      goTo(hit.point);
    }
  });

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

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * (1 - event.deltaY * 0.0012), 0.7, 1.7);
      camera.updateProjectionMatrix();
    },
    { passive: false }
  );

  /* Input: keyboard and controller */

  const moveKeys = {
    w: [0, -1],
    arrowup: [0, -1],
    s: [0, 1],
    arrowdown: [0, 1],
    a: [-1, 0],
    arrowleft: [-1, 0],
    d: [1, 0],
    arrowright: [1, 0],
  };

  const overlayOpen = () => Boolean(window.Portfolio?.anyOpen?.());
  const typing = (target) => target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable]");

  window.addEventListener("keydown", (event) => {
    if (overlayOpen() || typing(event.target) || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const key = event.key.toLowerCase();
    const idle = event.target === document.body || event.target === canvas;

    if (moveKeys[key] && (idle || !key.startsWith("arrow"))) {
      event.preventDefault();
      state.keys.add(key);
    } else if (key === "e" || ((key === "enter" || key === " ") && idle)) {
      if (state.near) {
        event.preventDefault();
        interactNear();
      }
    }
  });

  window.addEventListener("keyup", (event) => state.keys.delete(event.key.toLowerCase()));
  window.addEventListener("blur", () => state.keys.clear());

  const interactNear = () => {
    const obj = state.near;

    if (!obj) {
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

  let padA = false;
  const readPad = () => {
    const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);

    if (!pad) {
      return null;
    }

    let x = pad.axes[0] || 0;
    let y = pad.axes[1] || 0;

    if (Math.hypot(x, y) < 0.25) {
      x = 0;
      y = 0;
    }

    x += (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
    y += (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0);

    const a = Boolean(pad.buttons[0]?.pressed);
    if (a && !padA && state.near) {
      interactNear();
    }
    padA = a;

    return { x, y };
  };

  /* Screen-space input maps onto the isometric floor */

  const screenUp = new THREE.Vector3(-1, 0, -1).normalize();
  const screenRight = new THREE.Vector3(1, 0, -1).normalize();
  const steer = new THREE.Vector3();

  const inputVector = () => {
    let x = 0;
    let y = 0;

    state.keys.forEach((key) => {
      x += moveKeys[key][0];
      y += moveKeys[key][1];
    });

    const pad = readPad();
    if (pad) {
      x += pad.x;
      y += pad.y;
    }

    steer.set(0, 0, 0).addScaledVector(screenRight, x).addScaledVector(screenUp, -y);
    if (steer.lengthSq() > 1) {
      steer.normalize();
    }
    return steer;
  };

  /* Prompt for whatever the robot is standing next to */

  const updatePrompt = () => {
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

  /* Layout */

  const resize = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;

    if (!width || !height) {
      return;
    }

    renderer.setSize(width, height, false);
    const aspect = width / height;
    viewHeight = aspect < 1 ? Math.max(19, 13.5 / aspect) : Math.max(15.5, 22 / aspect);
    camera.left = (-viewHeight * aspect) / 2;
    camera.right = (viewHeight * aspect) / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
  };

  new ResizeObserver(resize).observe(host);
  resize();

  const projected = new THREE.Vector3();

  const placeLabels = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;

    objects.forEach((obj) => {
      projected.copy(obj.labelAt).project(camera);
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      const off = x < -60 || x > width + 60 || y < 0 || y > height + 40;
      obj.plate.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      obj.plate.classList.toggle("is-off", off);
      obj.plate.classList.toggle("is-near", obj === state.near);
    });
  };

  /* Frame loop */

  const travelled = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  let started = false;

  const update = (dt, time) => {
    const input = inputVector();
    const before = robot.position.clone();
    let moving = false;

    if (input.lengthSq() > 0.0001) {
      state.path = [];
      state.pending = null;
      robot.position.addScaledVector(input, SPEED * dt);
      state.yaw = Math.atan2(input.x, input.z);
      moving = true;
    } else if (state.path.length) {
      const target = state.path[0];
      const dx = target.x - robot.position.x;
      const dz = target.z - robot.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 0.06) {
        state.path.shift();
        if (!state.path.length) {
          arrive();
        }
      } else {
        const step = Math.min(dist, SPEED * dt);
        robot.position.x += (dx / dist) * step;
        robot.position.z += (dz / dist) * step;
        state.yaw = Math.atan2(dx, dz);
        moving = true;
      }
    }

    resolveCollisions(robot.position);
    travelled.subVectors(robot.position, before);

    if (state.path.length && travelled.length() < SPEED * dt * 0.2) {
      state.stuck += dt;
      if (state.stuck > 0.45) {
        const pending = state.pending;
        state.path = [];
        if (pending && robot.position.distanceTo(pending.spot) < 2) {
          arrive();
        } else {
          state.pending = null;
        }
      }
    } else {
      state.stuck = 0;
    }

    if (moving && !root.classList.contains("world-moved")) {
      root.classList.add("world-moved");
    }

    /* Robot animation */

    state.walk = THREE.MathUtils.damp(state.walk, moving ? 1 : 0, 10, dt);
    state.phase += dt * 11 * state.walk;
    const swing = Math.sin(state.phase) * 0.7 * state.walk;

    let turn = state.yaw - robot.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    robot.rotation.y += turn * Math.min(1, dt * 12);

    bot.legs[0].rotation.x = swing;
    bot.legs[1].rotation.x = -swing;
    bot.arms[0].rotation.x = -swing * 0.8;
    bot.arms[1].rotation.x = swing * 0.8;

    const idle = calm ? 0 : Math.sin(time * 2.2) * 0.025 * (1 - state.walk);
    state.hop = Math.min(1, state.hop + dt / 0.38);
    const hop = state.hop < 1 ? Math.sin(state.hop * Math.PI) * 0.45 : 0;
    bot.body.position.y = Math.abs(Math.sin(state.phase)) * 0.09 * state.walk + idle + hop;
    bot.head.rotation.z = Math.sin(state.phase * 0.5) * 0.06 * state.walk;
    bot.antenna.rotation.z = calm ? 0 : Math.sin(time * 3.1) * 0.12 + swing * 0.15;

    if (time > state.blinkAt) {
      const t = time - state.blinkAt;
      const lid = t < 0.14 ? 0.15 : 1;
      bot.eyes.forEach((eye) => (eye.scale.y = lid));
      if (t >= 0.14) {
        state.blinkAt = time + 2.4 + Math.random() * 2.6;
      }
    }

    if (!calm) {
      spinners.forEach((spinner) => {
        spinner.mesh.rotation.y = time * 0.9 + spinner.offset;
        spinner.mesh.position.y = spinner.base + Math.sin(time * 1.6 + spinner.offset) * 0.08;
      });
    }

    objects.forEach((obj) => {
      const target = obj === hovered || obj === state.near ? 1 : 0;
      obj.hover = THREE.MathUtils.damp(obj.hover, target, 12, dt);
      const scale = (obj.def.scale && !obj.def.model ? obj.def.scale : 1) * (1 + obj.hover * 0.04);
      obj.group.scale.setScalar(scale);
    });

    if (marker.visible) {
      markerAge += dt / 0.55;
      marker.scale.setScalar(0.6 + markerAge * 0.9);
      marker.material.opacity = Math.max(0, 1 - markerAge);
      marker.visible = markerAge < 1;
    }

    /* Camera follows, but stays over the floor */

    lookTarget.set(THREE.MathUtils.clamp(robot.position.x, -7, 7), 0, THREE.MathUtils.clamp(robot.position.z, -6, 7));
    if (calm || !started) {
      camLook.copy(lookTarget);
    } else {
      camLook.x = THREE.MathUtils.damp(camLook.x, lookTarget.x, 4, dt);
      camLook.z = THREE.MathUtils.damp(camLook.z, lookTarget.z, 4, dt);
    }
    camera.position.copy(camLook).add(camOffset);
    camera.lookAt(camLook);

    updatePrompt();
  };

  let last = performance.now();
  let frames = 0;

  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (overlayOpen()) {
      return;
    }

    update(dt, now / 1000);
    renderer.render(scene, camera);
    placeLabels();
    started = true;

    frames += 1;
    if (frames === 2) {
      reveal();
    }
  });

  /* Loading and intro */

  let loaded = fromDisk;
  let revealed = false;

  manager.onProgress = (_url, done, total) => {
    if (loadingFill) {
      loadingFill.style.transform = `scaleX(${total ? done / total : 1})`;
    }
  };

  manager.onLoad = () => {
    loaded = true;
    reveal();
  };

  window.setTimeout(() => {
    loaded = true;
    reveal();
  }, 6000);

  function reveal() {
    if (revealed || !loaded || frames < 2) {
      return;
    }

    revealed = true;
    root.classList.add("world-ready");

    if (gsap && !calm) {
      gsap.from(bot.body.position, { y: 7, duration: 0.9, ease: "bounce.out", delay: 0.25 });
      gsap.fromTo(camera, { zoom: 0.82 }, { zoom: 1, duration: 1.4, ease: "expo.out", onUpdate: () => camera.updateProjectionMatrix() });
    }
  }

  /* HUD links walk the robot instead of scrolling */

  const travel = { "#player": "about", "#moves": "skills", "#career": "career", "#contact": "contact" };

  document.querySelectorAll('.hud a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");

      if (href === "#select") {
        event.preventDefault();
        goTo(new THREE.Vector3(0, 0, -6.4));
        return;
      }

      const obj = byId.get(travel[href]);
      if (obj) {
        event.preventDefault();
        goToObject(obj);
      }
    });
  });

  window.PortfolioWorld = {
    active: true,
    walkTo: (id) => {
      const obj = byId.get(id);
      if (obj) {
        goToObject(obj);
      }
    },
  };
}
