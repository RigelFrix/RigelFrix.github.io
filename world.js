/* Play world: an isometric arcade floor where a robot walks to whatever you click and opens it.
   Objects come from world-data.js; the panels they open live in index.html and script.js. */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import nikoGlb from "./assets/niko.glb";

const root = document.documentElement;
const host = document.getElementById("world");

window.PortfolioWorld = { active: root.classList.contains("world") };

const giveUp = (error) => {
  console.error("Play world failed to start", error);
  root.classList.remove("world", "world-ready", "world-intro");
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
    periwinkle: "#7f86f5",
    lilac: "#a7acff",
    violet: "#5a50de",
    rock: "#1b1785",
    rockDeep: "#141068",
    rockDeeper: "#0f0c4c",
    haze: "#221e8a",
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
  const boot = host.querySelector(".world-boot");
  const flash = host.querySelector(".world-flash");
  root.classList.add("world-intro");

  /* Boot starfield: stars are shoved outward by each charge pulse and spring back; `warp` eases them apart and dims them as Rigel leaves */
  const field = (() => {
    const el = boot?.querySelector(".world-starfield");
    const ctx = el?.getContext("2d");
    const api = { warp: 0, spread: 0, pulse() {} };
    if (!ctx) return api;

    const tints = ["#ffffff", "#ffffff", "#d8e6ff", "#a9c6ff", "#7fa8ff", "#ffe8c4", "#ffc2a6"];
    let stars = [];
    let w = 0;
    let h = 0;
    let reach = 1;
    let dpr = 1;
    let last = performance.now();

    const build = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      reach = Math.hypot(w, h) / 2;
      stars = Array.from({ length: Math.min(260, Math.round((w * h) / 3600)) }, () => {
        const dx = (Math.random() - 0.5) * w;
        const dy = (Math.random() - 0.5) * h;
        const r = Math.max(Math.hypot(dx, dy), 1);
        const big = Math.random() < 0.05;
        return {
          r,
          ux: dx / r,
          uy: dy / r,
          near: 1 - Math.min(r / reach, 1) * 0.6,
          depth: 0.3 + Math.random() * 0.7,
          size: big ? 1.4 + Math.random() * 1 : 0.35 + Math.random() * 0.9,
          big,
          color: tints[Math.floor(Math.random() * tints.length)],
          alpha: 0.35 + Math.random() * 0.65,
          phase: Math.random() * Math.PI * 2,
          rate: 1 + Math.random() * 3,
          push: 0,
          vel: 0,
        };
      });
    };

    const draw = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      stars.forEach((s) => {
        if (!calm) {
          s.vel += (-38 * s.push - 7 * s.vel) * dt;
          s.push += s.vel * dt;
        }
        const rad = (s.r + s.push + api.spread * 26 * s.depth) * (1 + api.warp * (0.12 + s.depth * 0.28));
        const x = w / 2 + s.ux * rad;
        const y = h / 2 + s.uy * rad;
        const glint = calm ? 1 : 0.65 + 0.35 * Math.sin(now / 1000 * s.rate + s.phase);
        ctx.globalAlpha = s.alpha * glint * (1 - api.warp * 0.55);
        ctx.fillStyle = ctx.strokeStyle = s.color;

        if (s.size < 1) {
          ctx.fillRect(x - s.size, y - s.size, s.size * 2, s.size * 2);
          return;
        }
        ctx.beginPath();
        ctx.arc(x, y, s.size, 0, Math.PI * 2);
        ctx.fill();
        if (s.big) {
          ctx.globalAlpha *= 0.5;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(x - s.size * 4, y);
          ctx.lineTo(x + s.size * 4, y);
          ctx.moveTo(x, y - s.size * 4);
          ctx.lineTo(x, y + s.size * 4);
          ctx.stroke();
        }
      });

      const hidden = !root.classList.contains("world-intro") || boot.style.visibility === "hidden";
      if (!hidden) window.requestAnimationFrame(draw);
    };

    api.pulse = (strength = 1) => {
      if (calm) return;
      stars.forEach((s) => (s.vel = Math.max(-700, Math.min(900, s.vel + strength * 420 * s.depth * s.near))));
    };

    build();
    window.addEventListener("resize", build);
    window.requestAnimationFrame(draw);
    return api;
  })();

  await Promise.race([
    document.fonts?.load('900 64px "Big Shoulders Display"') ?? Promise.resolve(),
    new Promise((resolve) => window.setTimeout(resolve, 1500)),
  ]);

  /* Renderer, scene, camera */

  /* The sky is CSS behind a transparent canvas, so the intro can fade it from night to dusk. */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAL.haze, 36, 82);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const camOffset = new THREE.Vector3(16, 17, 16);
  const camLook = new THREE.Vector3(0, 0, 0);
  let viewHeight = 16;

  /* Warm key from the right, cool fill from the left, a coral kiss from behind */
  const hemi = new THREE.HemisphereLight("#ffeedd", "#3b2fc0", 1.45);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight("#ffe3bd", 2.5);
  sun.position.set(10, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -21, right: 21, top: 21, bottom: -21, near: 1, far: 60 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  scene.add(sun);

  const fill = new THREE.DirectionalLight("#7cc8ff", 0.6);
  fill.position.set(-10, 5, 8);
  scene.add(fill);

  const rim = new THREE.DirectionalLight("#ff8f7d", 0.45);
  rim.position.set(-4, 8, -12);
  scene.add(rim);

  /* Materials and building blocks */

  const ramp = new THREE.DataTexture(new Uint8Array([72, 118, 168, 214, 255]), 5, 1, THREE.RedFormat);
  ramp.minFilter = THREE.LinearFilter;
  ramp.magFilter = THREE.LinearFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;

  /* Soft toon shading plus a lavender fresnel, so rounded edges catch light instead of reading as flat boxes */
  const withRim = (material, strength = 0.42) => {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.rimColor = { value: new THREE.Color("#cfc8ff") };
      shader.uniforms.rimStrength = { value: strength };
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;")
        .replace(
          "#include <opaque_fragment>",
          [
            "vec3 rimView = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);",
            "float rimAmount = pow(1.0 - saturate(dot(normal, rimView)), 3.0);",
            "outgoingLight += rimColor * rimAmount * rimStrength;",
            "#include <opaque_fragment>",
          ].join("\n")
        );
    };
    material.customProgramCacheKey = () => `rim-${strength}`;
    return material;
  };

  const toonCache = new Map();
  const toon = (color) => {
    if (!toonCache.has(color)) {
      toonCache.set(color, withRim(new THREE.MeshToonMaterial({ color, gradientMap: ramp })));
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

  /* Soft round textures for glows, contact shadows, motes and clouds */

  const softTexture = (stops) => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    stops.forEach(([at, colour]) => g.addColorStop(at, colour));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
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

  /* Floor: a floating cobalt island, tiled on top, layered rock below, rimmed in yellow */

  const roundedRect = (half, r) => {
    const s = new THREE.Shape();
    const e = half - r;
    s.moveTo(half, -e);
    s.absarc(e, e, r, 0, Math.PI / 2);
    s.absarc(-e, e, r, Math.PI / 2, Math.PI);
    s.absarc(-e, -e, r, Math.PI, Math.PI * 1.5);
    s.absarc(e, -e, r, Math.PI * 1.5, Math.PI * 2);
    return s;
  };

  const slab = (parent, { half, r, top, depth, material, bevel = 0 }) => {
    const geometry = new THREE.ExtrudeGeometry(roundedRect(half - bevel, r), {
      depth: Math.max(0.01, depth - bevel * 2),
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 4,
      curveSegments: 10,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, top - depth + bevel, 0);
    const mesh = new THREE.Mesh(geometry, material);
    parent.add(mesh);
    return mesh;
  };

  const floorTexture = (() => {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#1b23bf";
    ctx.fillRect(0, 0, size, size);
    ["#2b35ee", "#2630e4", "#2832ea", "#2329dc"].forEach((tone, i) => {
      const x = (i % 2) * 128;
      const y = Math.floor(i / 2) * 128;
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.roundRect(x + 4, y + 4, 120, 120, 18);
      ctx.fill();
      const sheen = ctx.createLinearGradient(x, y, x + 128, y + 128);
      sheen.addColorStop(0, "rgba(255,255,255,0.09)");
      sheen.addColorStop(0.55, "rgba(255,255,255,0)");
      sheen.addColorStop(1, "rgba(8,6,40,0.12)");
      ctx.fillStyle = sheen;
      ctx.fill();
    });
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(0.25, 0.25);
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  })();

  const island = new THREE.Group();
  scene.add(island);

  const floorMat = withRim(new THREE.MeshToonMaterial({ map: floorTexture, gradientMap: ramp }));
  slab(island, { half: HALF, r: 1.6, top: 0, depth: 0.6, material: [floorMat, toon(PAL.cobaltDeep)], bevel: 0.16 }).receiveShadow = true;
  slab(island, { half: HALF + 0.14, r: 1.74, top: -0.2, depth: 0.22, material: glow(PAL.yellow) });
  slab(island, { half: HALF - 0.25, r: 1.5, top: -0.42, depth: 1.5, material: toon(PAL.rock), bevel: 0.3 });
  slab(island, { half: HALF - 1.4, r: 1.6, top: -1.9, depth: 1.7, material: toon(PAL.rockDeep), bevel: 0.35 });
  slab(island, { half: HALF - 3.4, r: 1.8, top: -3.55, depth: 2.4, material: toon(PAL.rockDeeper), bevel: 0.4 });

  const spawnRing = flat(scene, new THREE.RingGeometry(1.15, 1.42, 6), glow(PAL.yellow), 0, 0.02, 0);
  spawnRing.rotation.x = -Math.PI / 2;
  decal(scene, { color: PAL.yellow, size: 5.5, opacity: 0.16, additive: true, y: 0.016 });

  /* World objects */

  const spinners = [];
  const projectsById = new Map(projects.map((project, index) => [project.id, { project, index }]));

  const builders = {
    cabinet(def, order) {
      const g = new THREE.Group();
      const sideColour = order % 2 ? PAL.yellow : PAL.red;
      const marqueeText = order % 2 ? PAL.ink : PAL.cream;
      const project = projectsById.get(def.action?.project)?.project;

      part(g, box(1.5, 2.3, 1.2, 0.16), toon(PAL.inkRaise), 0, 1.15, 0);
      part(g, box(0.14, 2.5, 1.3, 0.06), toon(sideColour), -0.8, 1.25, 0);
      part(g, box(0.14, 2.5, 1.3, 0.06), toon(sideColour), 0.8, 1.25, 0);
      decal(g, { color: "#8d95ff", size: 2.8, z: 1.35, opacity: 0.32, additive: true });

      const deck = part(g, box(1.5, 0.14, 0.6, 0.06), toon(PAL.ink), 0, 1.08, 0.78);
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

      part(g, box(1.6, 0.46, 0.5, 0.12), toon(sideColour), 0, 2.5, 0.3);
      halo(g, { color: sideColour, size: 2.2, y: 2.55, z: 0.75, opacity: 0.22 });
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
      part(g, new THREE.CylinderGeometry(0.26, 0.36, 0.24, 20), toon(PAL.ink), 0, 0.12, 0);
      part(g, new THREE.CylinderGeometry(0.06, 0.08, 3, 12), toon(PAL.ink), 0, 1.6, 0);
      const cap = part(g, new THREE.SphereGeometry(0.36, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), toon(PAL.inkRaise), 0, 3.12, 0);
      cap.castShadow = false;
      flat(g, new THREE.SphereGeometry(0.2, 18, 12), glow(PAL.cream), 0, 3.06, 0);
      halo(g, { color: PAL.yellow, size: 2.6, y: 3.0, opacity: 0.55 });
      decal(g, { color: PAL.yellow, size: 6, opacity: 0.2, additive: true });
      return { group: g, radius: 0.4 };
    },

    crate(def) {
      const g = new THREE.Group();
      part(g, box(1, 1, 1, 0.14), toon(PAL.redDeep), 0, 0.5, 0);
      [0.22, 0.78].forEach((y) => part(g, box(1.04, 0.1, 1.04, 0.045), toon(PAL.cream), 0, y, 0));
      return { group: g, radius: 0.78 * (def.scale || 1) };
    },

    bush() {
      const g = new THREE.Group();
      const tones = [PAL.periwinkle, PAL.violet, PAL.lilac];
      [
        [0, 0.55, 0, 0.62],
        [0.52, 0.38, 0.18, 0.44],
        [-0.46, 0.36, 0.22, 0.4],
        [0.08, 0.98, -0.04, 0.42],
      ].forEach(([x, y, z, r], i) => part(g, new THREE.IcosahedronGeometry(r, 2), toon(tones[i % 3]), x, y, z));
      [
        [0.3, 0.92, 0.42],
        [-0.36, 0.66, 0.5],
        [0.62, 0.5, 0.48],
        [-0.05, 1.3, 0.22],
        [0.2, 0.4, 0.66],
      ].forEach(([x, y, z]) => flat(g, new THREE.SphereGeometry(0.045, 8, 6), glow(PAL.yellow), x, y, z));
      return { group: g, radius: 0.85 };
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
    decal(scene, { color: "#07052a", size: radius * 2.9, x: def.x, z: def.z, opacity: 0.4 });

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

  /* Ambience: drifting motes over the floor, clouds under the island, islets in the distance */

  const moteCount = coarse ? 70 : 140;
  const motes = new Float32Array(moteCount * 3);
  const moteDrift = Array.from({ length: moteCount }, (_, i) => {
    motes[i * 3] = (Math.random() * 2 - 1) * (HALF + 1);
    motes[i * 3 + 1] = 0.3 + Math.random() * 7;
    motes[i * 3 + 2] = (Math.random() * 2 - 1) * (HALF + 1);
    return { rise: 0.12 + Math.random() * 0.35, phase: Math.random() * Math.PI * 2 };
  });
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motes, 3));
  const moteField = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({
      map: haloTexture,
      color: "#ffe4a0",
      size: coarse ? 6 : 8,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    })
  );
  moteField.frustumCulled = false;
  scene.add(moteField);

  const clouds = [
    [-21, -5.5, -6, 13, 0.22],
    [-9, -6.5, -22, 15, 0.2],
    [8, -5, -21, 12, 0.18],
    [21, -6, 2, 12, 0.18],
    [14, -7.5, 19, 16, 0.2],
    [-4, -8, 22, 14, 0.18],
    [-19, -7, 13, 12, 0.16],
  ].map(([x, y, z, size, opacity], i) => {
    const cloud = halo(scene, { color: "#9c94ff", size, x, y, z, opacity });
    cloud.material.blending = THREE.NormalBlending;
    cloud.material.fog = false;
    cloud.scale.y = size * 0.42;
    return { sprite: cloud, x, phase: i * 1.7 };
  });

  const islets = [
    [-13.4, -3.2, -20.4, 1.15],
    [-18.6, -2.2, -10.9, 0.85],
    [-3.8, -3.4, -19.4, 0.95],
  ].map(([x, y, z, s], i) => {
    const g = new THREE.Group();
    slab(g, { half: 2, r: 0.9, top: 0, depth: 0.5, material: [toon(PAL.cobalt), toon(PAL.cobaltDeep)], bevel: 0.12 });
    const root = part(g, new THREE.ConeGeometry(1.7, 2.6, 8), toon(PAL.rockDeep), 0, -1.75, 0);
    root.rotation.x = Math.PI;
    if (i !== 1) {
      const shrub = builders.bush().group;
      shrub.scale.setScalar(0.8);
      g.add(shrub);
    }
    g.position.set(x, y, z);
    g.scale.setScalar(s);
    g.rotation.y = i * 0.7;
    scene.add(g);
    return { group: g, base: y, phase: i * 1.9 };
  });

  /* Mascot: Niko, Child of the Star. Chibi low poly: spiky brown hair with a cowlick, cream cloak with a blue lining
     and a gold star, navy scarf, star brooch, belts and pouches, baggy shorts, chunky boots, a star lantern on the hip,
     and the fallen star floating beside him. The rig keeps the old robot names (antenna = cowlick, bulb = lantern glass). */

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
  const addInk = (mesh, ink) => {
    const geometry = mesh.geometry;
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
    const hull = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(geometry, ink) : new THREE.Mesh(geometry, ink);
    if (mesh.isSkinnedMesh) {
      hull.bind(mesh.skeleton, mesh.bindMatrix);
      hull.frustumCulled = false;
    }
    mesh.add(hull);
    return hull;
  };

  const buildRobot = () => {
    const inked = [];
    const robot = new THREE.Group();
    const body = new THREE.Group();
    robot.add(body);
    const mat = (color) => toon(color);
    const both = (color) => {
      const key = `${color}-both`;
      if (!toonCache.has(key)) {
        toonCache.set(key, withRim(new THREE.MeshToonMaterial({ color, gradientMap: ramp, side: THREE.DoubleSide })));
      }
      return toonCache.get(key);
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
      hip.position.set(0.095 * side, 0.6, 0);
      body.add(hip);
      part(hip, lathe([[0.085, 0.04], [0.112, -0.06], [0.108, -0.18], [0.072, -0.24]], 7, 0.006), both(NIKO.pants));
      part(hip, tube(0.058, 0.062, 0.06, 7), mat(NIKO.sock), 0, -0.27, 0);
      part(hip, tube(0.084, 0.082, 0.05, 7, 0.004), mat(NIKO.brownLight), 0, -0.32, 0);
      part(hip, tube(0.07, 0.075, 0.17, 7), mat(NIKO.brown), 0, -0.42, 0);
      part(hip, block(0.13, 0.1, 0.2, 0.03), mat(NIKO.brown), 0, -0.53, 0.035);
      part(hip, block(0.14, 0.035, 0.21, 0.012), mat(NIKO.brownDeep), 0, -0.58, 0.035);
      part(hip, tube(0.078, 0.078, 0.025, 7), mat(NIKO.brownDeep), 0, -0.4, 0);
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
    const bulb = flat(lantern, new THREE.CylinderGeometry(0.05, 0.05, 0.11, 6), glow("#ffd27a"), 0, -0.165, 0);
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
        x *= 1 - 0.3 * t ** 1.5;
        z *= 1 - 0.12 * t;
        if (z > 0) z += 0.03 * t;
        y *= 1.1;
      }
      sk.setXYZ(i, x, y + 0.33, z * 0.95);
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
    part(hair, ball(0.44, 10, 8, 0.02), mat(NIKO.hair), C.x, C.y, C.z).scale.set(1.08, 0.9, 1.02);
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
    const buddyStar = flat(buddy, starGeo(0.14, 0.04, 0.05), glow("#ffe08a"), 0, 0, 0);
    halo(buddy, { color: "#ffcf5a", size: 1.1, opacity: 0.55 });
    halo(buddy, { color: "#9fc0ff", size: 0.5, opacity: 0.35 });

    const ink = inkMaterial(0.011);
    robot.traverse((mesh) => {
      if (mesh.isMesh && mesh.material.isMeshToonMaterial && mesh.material.side === THREE.FrontSide && !mesh.material.transparent && mesh.geometry !== cloth) inked.push(mesh);
    });
    inked.forEach((mesh) => addInk(mesh, ink));

    scene.add(robot);
    return { robot, body, legs, arms, head, eyes, antenna, bulb, bulbGlow, cape, cloth, clothBase, hair, lantern, buddy, buddyStar, faceMat, faceOpen, faceShut, paintFace };
  };

  const bot = buildRobot();
  const robot = bot.robot;
  robot.position.set(0, 0, 0);
  robot.rotation.y = Math.PI / 4;
  bot.body.scale.setScalar(1.12);
  const robotShadow = decal(scene, { color: "#07052a", size: 1.5, opacity: 0.5, y: 0.018 });
  const pose = { crouch: 0, lift: 0, spin: 0, flip: 0, raise: 0, tilt: 0 };
  const jiggle = { lx: 0, lv: 0, hy: 0, hv: 0 };
  const buddyAt = new THREE.Vector3(0.55, 1.85, 0.1);
  const buddyTo = new THREE.Vector3();
  bot.buddy.position.copy(buddyAt);
  bot.hairRest = 0;
  bot.hairLag = 0.25;
  bot.knees = [];

  bot.waist = 1.0;
  bot.grow = 1;

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

  /* The cleaned Niko model (assets/niko.glb, split into parts, rigged and given Mixamo idle/walk/run clips by
     .impeccable/tools/niko-split.mjs and niko-rig.mjs) takes over from the procedural mascot once parsed.
     It is 1 unit tall, feet at -0.5, facing +z, bound in a T-pose; the clips bring the arms down. */
  const NIKO_SCALE = 2.5;
  /* One eye on a transparent canvas filling the eye decal's 0..1 UVs (v down, u toward model +x). side 1 = his left eye,
     whose outer corner is toward +u. Bold shapes only: at game size it shows as a dark lash, a tall iris and a glint. */
  const paintNikoEye = (side, shut) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const ink = "#1c1838";
    const x = (v) => 64 + v * side;
    const inner = [x(-36), 76];
    const outer = [x(38), 62];
    if (shut) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(...inner);
      ctx.quadraticCurveTo(x(2), 96, ...outer);
      ctx.stroke();
      return eyeTexture(canvas);
    }
    const lid = () => {
      ctx.moveTo(...inner);
      ctx.bezierCurveTo(x(-28), 34, x(22), 26, ...outer);
    };
    ctx.save();
    ctx.beginPath();
    lid();
    ctx.bezierCurveTo(x(40), 100, x(14), 114, x(-4), 112);
    ctx.bezierCurveTo(x(-24), 110, x(-36), 94, ...inner);
    ctx.fillStyle = "#fbf8f2";
    ctx.fill();
    ctx.clip();
    const iris = ctx.createLinearGradient(0, 34, 0, 110);
    iris.addColorStop(0, "#161838");
    iris.addColorStop(0.5, "#2c3378");
    iris.addColorStop(1, "#8d98e6");
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.ellipse(x(2), 74, 27, 38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0f1029";
    ctx.beginPath();
    ctx.ellipse(x(2), 70, 12, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(18,16,48,0.4)";
    ctx.fillRect(0, 20, 128, 22);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(55, 55, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(74, 94, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 9;
    ctx.beginPath();
    lid();
    ctx.lineTo(outer[0] + 9 * side, outer[1] - 9);
    ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x(32), 90);
    ctx.quadraticCurveTo(x(14), 110, x(-8), 108);
    ctx.stroke();
    return eyeTexture(canvas);
  };
  const eyeTexture = (canvas) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.flipY = false;
    return texture;
  };
  const useNikoModel = async () => {
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const data = nikoGlb.buffer.slice(nikoGlb.byteOffset, nikoGlb.byteOffset + nikoGlb.byteLength);
    const gltf = await new GLTFLoader().parseAsync(data, "");
    const model = gltf.scene;
    model.scale.setScalar(NIKO_SCALE);
    model.position.y = 0.5 * NIKO_SCALE;
    const bones = {};
    const meshes = [];
    model.traverse((node) => {
      if (node.isBone) bones[node.name] = node;
      if (node.isSkinnedMesh) meshes.push(node);
    });

    /* Face texture carries only blush, nose and mouth; the eyes are their own decal meshes (eyeL/eyeR) */
    const faceOpen = bot.paintFace(false, {
      uv: (x, y) => [0.5 + (x * 0.31) / 0.26, 0.5 + ((y - 0.225) * 0.4 - 0.002) / 0.26],
      fill: "#f6cfb0",
      noEyes: true,
      flipY: false,
    });
    const faceMat = withRim(new THREE.MeshToonMaterial({ map: faceOpen, emissive: "#000000", emissiveMap: faceOpen, gradientMap: ramp }));
    /* Eye decals: drawn bold and simple for the small on-screen size (lash line, tall iris, two highlights), and pulled
       toward the camera in depth while they face it so the remaining bang strands don't cut them */
    const eyeDecals = [["eyeL", 1], ["eyeR", -1]].map(([name, side]) => {
      const open = paintNikoEye(side, false);
      const shut = paintNikoEye(side, true);
      const mat = new THREE.MeshToonMaterial({ map: open, emissive: "#555555", emissiveMap: open, gradientMap: ramp, transparent: true, depthWrite: false });
      mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
          "#include <project_vertex>",
          `#include <project_vertex>\nmvPosition.z += ${(0.04 * NIKO_SCALE).toFixed(3)} * smoothstep(0.35, 0.8, normalize(transformedNormal).z);\ngl_Position = projectionMatrix * mvPosition;`
        );
      };
      mat.customProgramCacheKey = () => "niko-eye";
      return { name, mat, open, shut };
    });
    const lining = withRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp }));
    const ink = inkMaterial(0.0038);
    meshes.forEach((mesh) => {
      const name = mesh.material.name;
      const eye = eyeDecals.find((e) => e.name === name);
      if (eye) {
        mesh.material = eye.mat;
        mesh.renderOrder = 2;
        mesh.frustumCulled = false;
        return;
      }
      if (name === "face") mesh.material = faceMat;
      else if (name === "glow") mesh.material = glow("#ffe7a0");
      else if (name === "lining") mesh.material = lining;
      else mesh.material = toon(`#${mesh.material.color.getHexString()}`);
      mesh.castShadow = name !== "glow";
      mesh.receiveShadow = name !== "lining" && name !== "glow";
      mesh.frustumCulled = false;
      if (name !== "face" && name !== "glow" && name !== "lining") addInk(mesh, ink);
    });
    const sockets = {};
    model.traverse((node) => {
      if (node.name.endsWith("Socket")) sockets[node.name.replace(/Socket$/, "")] = node;
    });

    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const clip of gltf.animations) {
      actions[clip.name] = mixer.clipAction(clip);
      actions[clip.name].play();
      actions[clip.name].setEffectiveWeight(0);
    }
    actions.idle.setEffectiveWeight(1);
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

    const glowHolder = new THREE.Group();
    glowHolder.position.set(0, -0.09, 0.03);
    glowHolder.scale.setScalar(1.12 / NIKO_SCALE);
    bones.Lantern.add(glowHolder);
    const bulbGlow = halo(glowHolder, { color: "#ffc35a", size: 0.7, opacity: 0.45 });

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
      cloak,
      sockets,
      legs: [bones.RightUpLeg, bones.LeftUpLeg],
      knees: [bones.RightLeg, bones.LeftLeg],
      arms: [bones.RightArm, bones.LeftArm],
      head: bones.Head,
      antenna: bones.Ahoge,
      hair: bones.Hair,
      hairRest: bones.Hair.position.y,
      hairLag: 0.09,
      lantern: bones.Lantern,
      cape: new THREE.Object3D(),
      cloth: null,
      waist: 1.1,
      grow: NIKO_SCALE / 1.95,
      bulbGlow,
      faceMat,
      faceOpen,
      faceShut: faceOpen,
      eyeDecals,
    });
  };
  useNikoModel().catch((error) => console.warn("Niko model failed, keeping the built-in mascot", error));

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

  /* Intro pieces: Rigel, the star that falls onto the spawn ring, and what its impact throws up.
     Everything is built and drawn (invisibly) up front so nothing compiles mid-impact. */

  const playsIntro = Boolean(gsap) && !calm;
  const lights = { hemi, sun, fill, rim };
  const lightsOn = Object.fromEntries(Object.entries(lights).map(([key, light]) => [key, light.intensity]));
  const lightsNight = { hemi: 0.32, sun: 0, fill: 0.35, rim: 0.25 };
  const sky = { dawn: playsIntro ? 0 : 1 };
  const setDawn = () => host.style.setProperty("--dawn", sky.dawn.toFixed(3));
  setDawn();

  /* Same Rigel as the loading screen: white-hot core, blue glow, faint halo ring and thin diffraction spikes */
  const flareTexture = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    ctx.translate(128, 128);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 128);
    glow.addColorStop(0, "rgba(255, 255, 255, 1)");
    glow.addColorStop(0.08, "rgba(232, 242, 255, 1)");
    glow.addColorStop(0.2, "rgba(140, 190, 255, 0.65)");
    glow.addColorStop(0.45, "rgba(70, 130, 255, 0.18)");
    glow.addColorStop(1, "rgba(60, 110, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-128, -128, 256, 256);
    ctx.strokeStyle = "rgba(170, 205, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 66, 0, Math.PI * 2);
    ctx.stroke();
    const spike = (len, width, angle, alpha) => {
      ctx.save();
      ctx.rotate(angle);
      const line = ctx.createLinearGradient(-len, 0, len, 0);
      line.addColorStop(0, "rgba(160, 200, 255, 0)");
      line.addColorStop(0.5, `rgba(255, 255, 255, ${alpha})`);
      line.addColorStop(1, "rgba(160, 200, 255, 0)");
      ctx.fillStyle = line;
      ctx.fillRect(-len, -width / 2, len * 2, width);
      ctx.restore();
    };
    spike(128, 3, 0, 1);
    spike(128, 3, Math.PI / 2, 1);
    spike(64, 2, Math.PI / 4, 0.5);
    spike(64, 2, -Math.PI / 4, 0.5);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();

  const flareMat = (opacity) =>
    new THREE.SpriteMaterial({ map: flareTexture, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });

  const star = new THREE.Sprite(flareMat(1));
  star.scale.setScalar(3.6);
  star.renderOrder = 3;
  star.visible = false;
  scene.add(star);

  const ghosts = [0.42, 0.26, 0.15, 0.08].map((opacity, i) => {
    const ghost = new THREE.Sprite(flareMat(0));
    ghost.userData.opacity = opacity;
    ghost.scale.setScalar(3.6 * (0.85 - i * 0.14));
    ghost.renderOrder = 2;
    scene.add(ghost);
    return ghost;
  });

  const bloomTexture = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(240, 247, 255, 1)");
    g.addColorStop(0.22, "rgba(140, 190, 255, 0.7)");
    g.addColorStop(1, "rgba(80, 130, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();

  const bloom = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: bloomTexture, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  );
  bloom.renderOrder = 1;
  scene.add(bloom);

  const shockwaves = [PAL.yellow, PAL.cream].map((color) => {
    const wave = flat(
      scene,
      new THREE.RingGeometry(0.9, 1.08, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
      0,
      0.04,
      0
    );
    wave.rotation.x = -Math.PI / 2;
    return wave;
  });

  const impactLight = new THREE.PointLight(PAL.yellow, 0, 16, 1.4);
  impactLight.position.set(0, 1.4, 0);
  scene.add(impactLight);

  const debrisGeo = new THREE.BoxGeometry(0.17, 0.17, 0.17);
  const debris = Array.from({ length: 22 }, (_, i) => {
    const mesh = new THREE.Mesh(debrisGeo, toon([PAL.yellow, PAL.red, PAL.cream][i % 3]));
    mesh.castShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, v: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, size: 1 };
  });

  const fx = [];
  let shake = 0;
  let clock = 0;
  let intro = null;
  let introLive = playsIntro;

  if (playsIntro) {
    Object.entries(lights).forEach(([key, light]) => (light.intensity = lightsNight[key]));
    robot.visible = false;
  }

  /* Movement */

  const state = {
    path: [],
    pending: null,
    keys: new Set(),
    walk: 0,
    yaw: Math.PI / 4,
    hop: 1,
    stuck: 0,
    near: null,
    phase: 0,
    blinkAt: 2,
    still: 0,
    faceUp: 0,
  };
  const AXIS_Z = new THREE.Vector3(0, 0, 1);
  const RAISED_ARM = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.35, 1.25));
  const overlayQ = new THREE.Quaternion();
  const breeze = new THREE.Vector3();

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
    press = document.hasFocus() ? { x: event.clientX, y: event.clientY } : null;
  });

  canvas.addEventListener("pointerup", (event) => {
    if (introLive) {
      press = null;
      speedUp();
      return;
    }

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

    if (introLive) {
      if (key !== "tab" && key !== "shift") {
        speedUp();
      }
      return;
    }

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
  window.addEventListener("blur", () => {
    state.keys.clear();
    press = null;
  });

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

  /* The canvas runs under the header, but the floor is framed in the area below it */
  const hudEl = document.querySelector(".hud");
  let hudBottom = 0;

  const resize = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;

    if (!width || !height) {
      return;
    }

    renderer.setSize(width, height, false);
    const hud = Math.min(hudEl?.offsetHeight || 0, height * 0.3);
    hudBottom = hud;
    const usable = height - hud;
    const aspect = width / usable;
    viewHeight = aspect < 1 ? Math.max(19, 13.5 / aspect) : Math.max(15.5, 22 / aspect);
    const unit = viewHeight / usable;
    camera.left = (-width * unit) / 2;
    camera.right = (width * unit) / 2;
    camera.top = viewHeight / 2 + hud * unit;
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
      const off = x < -60 || x > width + 60 || y < hudBottom + 30 || y > height + 40;
      obj.plate.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      obj.plate.classList.toggle("is-off", off);
      obj.plate.classList.toggle("is-near", obj === state.near);
    });
  };

  /* Frame loop */

  const travelled = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const offTarget = new THREE.Vector3();
  const tilt = camOffset.y / camOffset.length();

  /* The camera prefers to show the floor, but never lets the robot drift out of the middle of
     the screen. Narrow phone views need this most. */
  const keepInFrame = (target) => {
    const reachX = ((camera.right - camera.left) / 2 / camera.zoom) * 0.35;
    const reachY = (viewHeight / 2 / camera.zoom) * 0.35;

    offTarget.subVectors(robot.position, target);
    const across = offTarget.dot(screenRight);
    const up = offTarget.dot(screenUp) * tilt;

    if (Math.abs(across) > reachX) {
      target.addScaledVector(screenRight, across - Math.sign(across) * reachX);
    }
    if (Math.abs(up) > reachY) {
      target.addScaledVector(screenUp, (up - Math.sign(up) * reachY) / tilt);
    }
  };
  let started = false;

  const still = new THREE.Vector3();

  const update = (dt, time) => {
    clock = time;
    const input = introLive ? still : inputVector();
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
    state.phase += dt * 10 * state.walk;
    const step = Math.sin(state.phase);
    const swing = step * 0.7 * state.walk;
    const bob = Math.abs(Math.cos(state.phase)) * state.walk;

    /* Standing still, he turns three-quarters toward the camera and looks up, so his face reads from above */
    state.still = moving ? 0 : state.still + dt;
    const faceCam = bot.mixer && robot.visible && state.still > 0.9 && !state.path.length && !root.classList.contains("world-intro");
    if (faceCam) {
      const camYaw = Math.atan2(camOffset.x, camOffset.z);
      let rel = state.yaw - camYaw;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      state.yaw = camYaw + THREE.MathUtils.clamp(rel, -0.4, 0.4);
    }
    state.faceUp = THREE.MathUtils.damp(state.faceUp, faceCam ? 1 : 0, 3, dt);
    let turn = state.yaw - robot.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    robot.rotation.y += turn * Math.min(1, dt * (faceCam ? 4 : 12));

    const rest = 1 - state.walk;
    const breathe = calm ? 0 : Math.sin(time * 2.2) * rest;
    const sway = calm ? 0 : Math.sin(time * 1.6) * 0.06 * rest;
    const look = calm ? 0 : (Math.sin(time * 0.53) * 0.7 + Math.sin(time * 1.31) * 0.3) * 0.22 * rest;
    const wave = calm ? 0 : Math.sin(time * 3) * 0.06 * pose.raise;

    if (bot.mixer) {
      /* Mixamo idle and run clips, blended by speed; intro poses and the camera look are layered on top */
      const { actions, bones } = bot;
      actions.idle.setEffectiveWeight(1 - state.walk);
      actions.run.setEffectiveWeight(state.walk);
      actions.run.setEffectiveTimeScale(1.2);
      bot.mixer.update(calm ? 0 : dt);
      const spread = 0.2 + pose.crouch * 0.45;
      bones.LeftArm.quaternion.premultiply(overlayQ.setFromAxisAngle(AXIS_Z, spread));
      bones.RightArm.quaternion.premultiply(overlayQ.setFromAxisAngle(AXIS_Z, -spread));
      if (pose.raise > 0.001) {
        bones.LeftArm.quaternion.slerp(RAISED_ARM, pose.raise);
        bones.LeftForeArm.quaternion.slerp(overlayQ.identity(), pose.raise);
        bones.LeftHand.rotateZ(wave * 4);
      }
      if (pose.crouch > 0.001) {
        bot.legs.forEach((leg) => leg.rotateX(-pose.crouch * 0.9));
        bot.knees.forEach((knee) => knee.rotateX(pose.crouch * 1.5));
        bones.LeftFoot.rotateX(-pose.crouch * 0.6);
        bones.RightFoot.rotateX(-pose.crouch * 0.6);
      }
      bones.Spine2.rotateX(-state.faceUp * 0.08);
      bones.Neck.rotateX(-state.faceUp * 0.18);
      bones.Head.rotateY(look * (0.7 - state.faceUp * 0.45));
      bones.Head.rotateX(-pose.tilt * 0.16 - 0.1 - state.faceUp * 0.38);
      bones.Head.rotateZ(pose.tilt * 0.2);
    } else {
      bot.legs.forEach((leg, i) => {
        const side = i ? 1 : -1;
        leg.rotation.x = swing * -side * 1.1;
        leg.rotation.z = side * pose.crouch * 0.28;
      });
      bot.arms[0].rotation.x = -swing * 0.8 + pose.crouch * 0.7;
      bot.arms[0].rotation.z = -0.16 - sway - pose.crouch * 0.5 - pose.raise * 0.3;
      bot.arms[1].rotation.x = swing * 0.9 + pose.crouch * 0.7 - pose.raise * 2.75;
      bot.arms[1].rotation.z = 0.16 + sway + pose.raise * 0.5 + pose.crouch * 0.5 + wave;
      bot.head.rotation.z = Math.sin(state.phase * 0.5) * 0.05 * state.walk + sway * 0.5 + pose.tilt * 0.2;
      bot.head.rotation.x = -pose.tilt * 0.16 - state.walk * 0.08 + bob * 0.04;
      bot.head.rotation.y = look;
    }

    /* The flip turns around the waist, not the feet */
    state.hop = Math.min(1, state.hop + dt / 0.38);
    const hop = state.hop < 1 ? Math.sin(state.hop * Math.PI) * 0.45 : 0;
    const waist = bot.waist;
    const bounce = bot.mixer ? 0 : bob * 0.08 + breathe * 0.012;
    bot.body.position.y = bounce + hop + pose.lift - pose.crouch * 0.16 * bot.grow + waist * (1 - Math.cos(pose.flip));
    bot.body.position.z = -waist * Math.sin(pose.flip);
    bot.body.rotation.x = state.walk * (bot.mixer ? 0.03 : 0.1) + pose.flip;
    bot.body.rotation.z = bot.mixer ? 0 : step * 0.05 * state.walk;
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

    /* The star companion floats by his shoulder and rises above his hand when he raises it */
    const g = bot.grow;
    buddyTo.set((0.55 - pose.raise * 0.12) * g, (1.85 - pose.raise * (bot.mixer ? -0.25 : 0.15)) * g, (0.1 + pose.raise * 0.12 - state.walk * 0.35) * g);
    if (!calm) buddyTo.y += Math.sin(time * 2) * 0.06;
    bot.buddy.position.lerp(buddyTo, 1 - Math.exp(-dt * 6));
    bot.buddyStar.rotation.y = calm ? 0 : time * 1.6;

    robotShadow.visible = robot.visible;
    robotShadow.position.set(robot.position.x, 0.018, robot.position.z);
    const air = THREE.MathUtils.clamp(bot.body.position.y, 0, 1.2);
    robotShadow.scale.set((1.5 - air * 0.5) * bot.grow, 1, (1.5 - air * 0.5) * bot.grow);
    robotShadow.material.opacity = 0.5 - air * 0.25;

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
    bot.eyeDecals?.forEach((eye) => {
      const map = shut ? eye.shut : eye.open;
      if (eye.mat.map === map) return;
      eye.mat.map = map;
      eye.mat.emissiveMap = map;
    });

    if (!calm) {
      spinners.forEach((spinner) => {
        spinner.mesh.rotation.y = time * 0.9 + spinner.offset;
        spinner.mesh.position.y = spinner.base + Math.sin(time * 1.6 + spinner.offset) * 0.08;
      });

      moteDrift.forEach((mote, i) => {
        motes[i * 3] += Math.sin(time * 0.6 + mote.phase) * 0.18 * dt;
        motes[i * 3 + 1] += mote.rise * dt;
        motes[i * 3 + 2] += Math.cos(time * 0.5 + mote.phase) * 0.18 * dt;
        if (motes[i * 3 + 1] > 7.5) {
          motes[i * 3 + 1] = 0.3;
        }
      });
      moteGeo.attributes.position.needsUpdate = true;
      moteField.material.opacity = 0.62 + Math.sin(time * 1.3) * 0.12;

      clouds.forEach((cloud) => (cloud.sprite.position.x = cloud.x + Math.sin(time * 0.08 + cloud.phase) * 1.6));
      islets.forEach((islet) => (islet.group.position.y = islet.base + Math.sin(time * 0.7 + islet.phase) * 0.18));
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

    for (let i = fx.length - 1; i >= 0; i -= 1) {
      if (!fx[i](dt)) {
        fx.splice(i, 1);
      }
    }

    /* Camera follows, but stays over the floor */

    lookTarget.set(THREE.MathUtils.clamp(robot.position.x, -7, 7), 0, THREE.MathUtils.clamp(robot.position.z, -6, 7));
    keepInFrame(lookTarget);
    if (calm || !started) {
      camLook.copy(lookTarget);
    } else {
      camLook.x = THREE.MathUtils.damp(camLook.x, lookTarget.x, 4, dt);
      camLook.z = THREE.MathUtils.damp(camLook.z, lookTarget.z, 4, dt);
    }
    camera.position.copy(camLook).add(camOffset);
    camera.lookAt(camLook);

    if (shake > 0) {
      camera.translateX((Math.random() - 0.5) * shake);
      camera.translateY((Math.random() - 0.5) * shake);
      shake = Math.max(0, shake - dt * 1.8);
    }

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

    /* While the opaque boot cover is up, a few warm-up frames are enough; the GPU is left to the loading screen */
    const covered = boot && root.classList.contains("world-intro") && boot.style.visibility !== "hidden" && (boot.style.opacity === "" || boot.style.opacity === "1");
    if (covered && frames > 3) return;

    renderer.render(scene, camera);
    placeLabels();
    started = true;

    frames += 1;
    if (frames === 2) {
      reveal();
    }
  });

  /* Leaving the tab: drop held input, finish the intro, and frame the robot again on return */

  const settle = () => {
    state.keys.clear();
    press = null;
    started = false;
    last = performance.now();

    if (document.visibilityState === "visible") {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
      resize();
    }

    intro?.progress(1);
  };

  document.addEventListener("visibilitychange", settle);
  window.addEventListener("pageshow", settle);

  /* Loading and intro */

  let loaded = fromDisk;
  let revealed = false;

  const loadPct = boot?.querySelector(".world-boot-pct");
  let loadShown = 0;
  const setLoad = (fraction) => {
    if (fraction > loadShown) field.pulse(0.5 + (fraction - loadShown) * 1.5);
    loadShown = Math.max(loadShown, fraction);
    boot?.style.setProperty("--load", fraction.toFixed(3));
    if (loadPct) loadPct.textContent = `${Math.round(fraction * 100)}%`;
  };

  manager.onProgress = (_url, done, total) => setLoad(total ? done / total : 1);

  manager.onLoad = () => {
    loaded = true;
    reveal();
  };

  window.setTimeout(() => {
    loaded = true;
    reveal();
  }, 6000);

  const seenIntro = (() => {
    try {
      return window.sessionStorage.getItem("fy-intro") === "1";
    } catch {
      return false;
    }
  })();

  /* The star twinkles for at least this long after navigation, so it reads as a moment, not a flicker. */
  const holdUntil = seenIntro ? 500 : 1500;

  function reveal() {
    if (revealed || !loaded || frames < 2) {
      return;
    }

    revealed = true;
    setLoad(1);
    window.setTimeout(playIntro, Math.max(350, holdUntil - performance.now()));
  }

  const endIntro = () => {
    introLive = false;
    intro = null;
    root.classList.remove("world-intro");
    Object.entries(lights).forEach(([key, light]) => (light.intensity = lightsOn[key]));
    sky.dawn = 1;
    setDawn();
    robot.visible = true;

    try {
      window.sessionStorage.setItem("fy-intro", "1");
    } catch {}
  };

  const fallFrom = new THREE.Vector3();
  const fallTo = new THREE.Vector3(0, 0.45, 0);
  const fall = { p: 0, spin: 0 };

  const placeStar = () => {
    star.position.lerpVectors(fallFrom, fallTo, fall.p);
    ghosts.forEach((ghost, i) => {
      ghost.position.lerpVectors(fallFrom, fallTo, Math.max(0, fall.p - (i + 1) * 0.07));
    });
  };

  const impact = () => {
    star.visible = false;
    ghosts.forEach((ghost) => (ghost.material.opacity = 0));

    robot.visible = true;
    state.yaw = Math.atan2(camOffset.x, camOffset.z);
    robot.rotation.y = state.yaw;
    bot.eyes.forEach((eye) => (eye.scale.y = 0.15));
    state.blinkAt = clock + 0.9;

    bloom.position.set(0, 0.6, 0);
    gsap.fromTo(bloom.scale, { x: 3, y: 3 }, { x: 11, y: 11, duration: 0.5, ease: "expo.out" });
    gsap.fromTo(bloom.material, { opacity: 1 }, { opacity: 0, duration: 0.55, ease: "power2.out" });
    gsap.fromTo(impactLight, { intensity: 70 }, { intensity: 0, duration: 0.8, ease: "power2.out" });
    gsap.fromTo(camera, { zoom: 1.06 }, { zoom: 1, duration: 0.6, ease: "expo.out", onUpdate: () => camera.updateProjectionMatrix() });
    gsap.fromTo(flash, { opacity: 0.45 }, { opacity: 0, duration: 0.35, ease: "power2.out" });
    shake = 0.55;

    shockwaves.forEach((wave, i) => {
      gsap.fromTo(wave.scale, { x: 0.6, y: 0.6 }, { x: i ? 3.6 : 5.6, y: i ? 3.6 : 5.6, duration: 0.7, delay: i * 0.1, ease: "expo.out" });
      gsap.fromTo(wave.material, { opacity: 1 }, { opacity: 0, duration: 0.7, delay: i * 0.1, ease: "power2.in" });
    });

    debris.forEach((bit, i) => {
      const angle = (i / debris.length) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 2.6 + Math.random() * 3.6;
      bit.v.set(Math.cos(angle) * speed, 4 + Math.random() * 4.5, Math.sin(angle) * speed);
      bit.spin.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
      bit.mesh.position.set(Math.cos(angle) * 0.45, 0.35, Math.sin(angle) * 0.45);
      bit.size = 0.6 + Math.random() * 0.8;
      bit.life = 1.2 + Math.random() * 0.5;
      bit.mesh.visible = true;
    });

    fx.push((dt) => {
      let alive = false;
      debris.forEach((bit) => {
        if (bit.life <= 0) {
          bit.mesh.visible = false;
          return;
        }
        alive = true;
        bit.life -= dt;
        bit.v.y -= 22 * dt;
        bit.mesh.position.addScaledVector(bit.v, dt);
        if (bit.mesh.position.y < 0.09) {
          bit.mesh.position.y = 0.09;
          bit.v.y *= -0.36;
          bit.v.x *= 0.55;
          bit.v.z *= 0.55;
          bit.spin.multiplyScalar(0.5);
        }
        bit.mesh.rotation.x += bit.spin.x * dt;
        bit.mesh.rotation.y += bit.spin.y * dt;
        bit.mesh.rotation.z += bit.spin.z * dt;
        bit.mesh.scale.setScalar(bit.size * THREE.MathUtils.clamp(bit.life / 0.35, 0, 1));
      });
      return alive;
    });
  };

  function playIntro() {
    root.classList.add("world-ready");

    if (!playsIntro) {
      endIntro();
      return;
    }

    const starEl = boot.querySelector(".world-star");
    const tail = boot.querySelector(".world-tail");
    const lift = Math.max(window.innerHeight, 600) * 0.8;
    const lean = Math.tan(THREE.MathUtils.degToRad(8));

    const hud = boot.querySelector(".world-boot-hud");
    const aura = boot.querySelector(".world-aura");
    const halo = boot.querySelector(".world-halo");
    const ping = boot.querySelector(".world-ping");
    const sparkBox = boot.querySelector(".world-sparks");
    const spark = () => sparkBox.appendChild(document.createElement("i"));
    const burst = Array.from({ length: 16 }, spark);
    const trail = Array.from({ length: 16 }, spark);
    const echoes = Array.from({ length: 8 }, () => sparkBox.appendChild(document.createElement("b")));

    gsap.set([...burst, ...trail, ...echoes], { autoAlpha: 0 });

    const crowns = boot.querySelectorAll(".world-corona-2, .world-corona-3");
    const zoomTo = () => camera.updateProjectionMatrix();
    /* The boot sequence runs until W; everything on the island is timed from there */
    const W = 1.65;
    const land = W + 4.0;

    /* Start the fall just above the top edge, so the whole drop is on screen */
    const drop = (viewHeight / 2 / 0.8 + 1.5) / 0.8;
    fallFrom.set(0, drop, 0).addScaledVector(screenRight, drop * 0.8 * lean);

    intro = gsap.timeline({ onComplete: endIntro, defaults: { ease: "power2.out" } });
    intro.timeScale(seenIntro ? 1.6 : 1);

    /* A ring completes: a radial wave rolls out from it, the starfield is shoved back and Rigel throbs */
    const wave = (at, from, k) =>
      intro
        .call(() => field.pulse(1 + k * 0.4), null, at)
        .to(field, { spread: (k + 1) * 0.6, duration: 0.6 }, at)
        .fromTo(ping, { scale: from, autoAlpha: 0.9 }, { scale: from * 2.2, autoAlpha: 0, duration: 0.8, immediateRender: false }, at)
        .to(starEl, { scale: 1.15 + k * 0.08, duration: 0.12 }, at)
        .to(starEl, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.5)" }, at + 0.12);

    /* Rigel turns slowly at first and winds up faster with every ring */
    intro.to(starEl, { rotation: 360, duration: 2.2, ease: "power2.in" }, 0);
    wave(0.15, 1.15, 0);
    /* Each crown blooms out of the one inside it, turning as it settles */
    const bloomCrown = (el, at, alpha) =>
      intro.fromTo(el, { scale: 0.55, rotation: -40, autoAlpha: 0 }, { scale: 1, rotation: 0, autoAlpha: alpha, duration: 0.7, ease: "back.out(1.4)" }, at);
    bloomCrown(crowns[0], 0.35, 1);
    wave(0.95, 1.7, 1);
    bloomCrown(crowns[1], 1.05, 0.65);
    wave(1.7, 2.24, 2);

    intro
      /* The rings fold into Rigel as it swells and draws the stars back in, then it flashes and launches */
      .to(hud, { autoAlpha: 0, y: 8, duration: 0.4 }, 1.9)
      .call(() => field.pulse(-1.3), null, 1.9)
      .to(halo, { scale: 0.5, duration: 0.3, ease: "power2.in" }, 1.9)
      .to(aura, { scale: 1.4, duration: 0.3, ease: "power2.in" }, 1.9)
      .to(starEl, { scale: 1.35, duration: 0.3, ease: "power2.in" }, 1.9)
      .call(() => field.pulse(3), null, 2.2)
      .to(halo, { scale: 2.2, autoAlpha: 0, duration: 0.6 }, 2.2)
      .to(aura, { scale: 2.4, autoAlpha: 0, duration: 0.7 }, 2.2)
      .fromTo(ping, { scale: 0.5, autoAlpha: 1 }, { scale: 5, autoAlpha: 0, duration: 0.8, ease: "expo.out", immediateRender: false }, 2.2)
      .to(starEl, { y: -lift, x: lift * lean, scaleX: 0.8, scaleY: 1.6, duration: 0.6, ease: "power2.in" }, 2.3)
      .to(field, { warp: 1, duration: 1.4, ease: "power2.out" }, 2.2)
      .fromTo(tail, { scaleY: 0, autoAlpha: 0 }, { scaleY: 1, autoAlpha: 1, duration: 0.35 }, 2.3);

    burst.forEach((el, i) => {
      const angle = (i / burst.length) * Math.PI * 2 + Math.random() * 0.4;
      const reach = 60 + Math.random() * 90;
      intro.fromTo(
        el,
        { x: 0, y: 0, scale: 1.4, rotation: 0, autoAlpha: 1 },
        { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach + 20, scale: 0, rotation: 180, duration: 0.7 + Math.random() * 0.4, ease: "power2.out", immediateRender: false },
        2.2
      );
    });

    /* Sparks shed along the flight path: power2.in puts the star at lift * p² */
    trail.forEach((el, i) => {
      const at = 2.34 + i * 0.03;
      const climb = lift * Math.pow((at - 2.3) / 0.6, 2);
      intro.fromTo(
        el,
        { x: climb * lean + (Math.random() - 0.5) * 24, y: -climb, scale: 0.6 + Math.random() * 0.7, autoAlpha: 1 },
        { x: `+=${(Math.random() - 0.5) * 60}`, y: `+=${20 + Math.random() * 40}`, scale: 0, duration: 1 + Math.random() * 0.5, ease: "sine.out", immediateRender: false },
        at
      );
    });

    /* Afterglows: dropped where Rigel just was, so they spread further apart as it speeds up */
    echoes.forEach((el, i) => {
      const at = 2.36 + i * 0.05;
      const climb = lift * Math.pow((at - 2.3) / 0.6, 2);
      intro.fromTo(
        el,
        { x: climb * lean, y: -climb, scale: 1.1 - i * 0.05, autoAlpha: 0.75 },
        { scale: 0.35, autoAlpha: 0, duration: 0.8, ease: "power1.out", immediateRender: false },
        at
      );
    });

    intro

      /* The cover lifts onto the island at night, then dusk rolls in over sky and floor */
      .to(boot, { autoAlpha: 0, duration: 1.0, ease: "power1.inOut" }, W + 1.15)
      .fromTo(camera, { zoom: 0.8 }, { zoom: 1, duration: 2.6, ease: "power2.inOut", onUpdate: zoomTo }, W + 1.0)
      .to(sky, { dawn: 1, duration: 1.8, ease: "sine.inOut", onUpdate: setDawn }, W + 1.3)
      .to(hemi, { intensity: lightsOn.hemi, duration: 1.8, ease: "sine.inOut" }, W + 1.3)
      .to(fill, { intensity: lightsOn.fill, duration: 1.6, ease: "sine.inOut" }, W + 1.4)
      .to(rim, { intensity: lightsOn.rim, duration: 1.6, ease: "sine.inOut" }, W + 1.5)
      .to(sun, { intensity: lightsOn.sun, duration: 1.6, ease: "sine.inOut" }, W + 1.7)

      /* It falls back in along the same line and hits the spawn ring */
      .call(() => {
        star.visible = true;
        ghosts.forEach((ghost) => (ghost.material.opacity = ghost.userData.opacity));
      }, null, W + 3.0)
      .fromTo(fall, { p: 0 }, { p: 1, duration: 1.0, ease: "power1.in", onUpdate: placeStar }, W + 3.0)
      .call(impact, null, land)

      /* Niko bursts out of the crater, front-flips, lands, then waves and lifts the lantern */
      .set(pose, { crouch: 1, lift: 0, spin: 0, flip: 0, raise: 0, tilt: 0 }, land)
      .set(bot.buddy.scale, { x: 0.01, y: 0.01, z: 0.01 }, land)
      .fromTo(robot.scale, { x: 1.45, y: 0.42, z: 1.45 }, { x: 1, y: 1, z: 1, duration: 0.35, ease: "back.out(3)", immediateRender: false }, land)
      .to(pose, { crouch: 0, lift: 1.1, duration: 0.5, ease: "power2.out" }, land + 0.35)
      .to(pose, { flip: Math.PI * 2, duration: 0.72, ease: "power1.inOut" }, land + 0.4)
      .fromTo(robot.scale, { x: 0.82, y: 1.22, z: 0.82 }, { x: 1, y: 1, z: 1, duration: 0.45, immediateRender: false }, land + 0.35)
      .to(pose, { lift: 0, duration: 0.3, ease: "power2.in" }, land + 0.85)
      .set(pose, { flip: 0 }, land + 1.15)
      .to(pose, { crouch: 0.5, duration: 0.1, ease: "power1.out" }, land + 1.15)
      .fromTo(
        robot.scale,
        { x: 1.22, y: 0.8, z: 1.22 },
        { x: 1, y: 1, z: 1, duration: 0.6, ease: "elastic.out(1, 0.45)", immediateRender: false },
        land + 1.15
      )
      .fromTo(shockwaves[1].scale, { x: 0.4, y: 0.4 }, { x: 2.2, y: 2.2, duration: 0.5, immediateRender: false }, land + 1.15)
      .fromTo(shockwaves[1].material, { opacity: 0.8 }, { opacity: 0, duration: 0.5, ease: "power1.in", immediateRender: false }, land + 1.15)
      .to(pose, { crouch: 0, raise: 1, tilt: 1, duration: 0.5, ease: "back.out(2)" }, land + 1.25)
      .fromTo(bot.buddy.scale, { x: 0.01, y: 0.01, z: 0.01 }, { x: 1, y: 1, z: 1, duration: 0.5, ease: "back.out(3)", immediateRender: false }, land + 1.35)
      .fromTo(bot.bulbGlow.scale, { x: 2.4, y: 2.4 }, { x: 0.7, y: 0.7, duration: 0.7, immediateRender: false }, land + 1.3)

      /* The header, name plates and control card arrive once the robot is standing; controls unlock */
      .call(
        () => {
          introLive = false;
          root.classList.remove("world-intro");
        },
        null,
        land + 0.7
      )
      .to(pose, { raise: 0, tilt: 0, duration: 0.7, ease: "power2.inOut" }, land + 2.6);

    introLive = true;
  }

  const speedUp = () => intro?.timeScale(Math.max(intro.timeScale(), 3.5));
  const finishIntro = () => intro?.progress(1);

  /* HUD links walk the robot instead of scrolling */

  const travel = { "#player": "about", "#moves": "skills", "#career": "career", "#contact": "contact" };

  document.querySelectorAll('.hud a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");

      if (introLive && !intro) {
        event.preventDefault();
        return;
      }

      finishIntro();

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
      finishIntro();
      if (obj && !introLive) {
        goToObject(obj);
      }
    },
    /* Hooks for the screenshot checks: Niko's head in CSS pixels, and the painted face textures */
    debug: {
      headOnScreen: () => {
        const p = (bot.head || robot).getWorldPosition(new THREE.Vector3()).project(camera);
        const box = renderer.domElement.getBoundingClientRect();
        return { x: box.left + ((p.x + 1) / 2) * box.width, y: box.top + ((1 - p.y) / 2) * box.height };
      },
      faceImages: () => [bot.faceOpen, ...(bot.eyeDecals || []).flatMap((e) => [e.open, e.shut])].map((t) => t.image.toDataURL()),
    },
  };
}
