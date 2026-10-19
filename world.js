/* Play world: an isometric arcade floor where a robot walks to whatever you click and opens it.
   Objects come from world-data.js; the panels they open live in index.html and script.js. */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FBXLoader } from "./.impeccable/fbx/addons/loaders/FBXLoader.js";
import nikoBody from "./assets/niko/low-poly-humanoid.glb";
import nikoIdleFbx from "./assets/Happy Idle.fbx";
import nikoRunFbx from "./assets/Running (1).fbx";
import nikoEyesUrl from "./assets/niko-eyes.png";
import { atmos, buildIsland, CLOUD_GLSL, CLOUD_SHADE, cloudCover, cloudShade, cloudSun, cloudTime, cloudUniforms, ISLE, lampGain, lamped, makeRamp, waterLight, occlude, seeThrough, rainAmt, windMul, windTime, weatherFog, weatherFogColor, weatherWet } from "./world-island.js";
import { lay, toXZ } from "./world-map.js";
import { windLines } from "./world-wind.js";
import { createClimate } from "./world-climate.js";
import { makeRain } from "./world-rain.js";
import { makeRays } from "./world-rays.js";

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
  /* Lite (phones, or ?lite=1; ?lite=0 opts out): draw straight to the screen with no offscreen bloom chain, which costs
     several times the scene itself on phone GPUs, and spend the savings on resolution; halo sprites stand in for bloom */
  const liteParam = new URLSearchParams(location.search).get("lite");
  const lite = liteParam === "1" || (coarse && liteParam !== "0");
  const MAX_RATIO = 2;
  const gsap = window.gsap;
  const projects = window.PROJECT_ALBUMS || [];
  const defs = (window.WORLD_OBJECTS || []).map((def) => {
    const [x, z] = def.u == null ? [def.x, def.z] : toXZ(...lay(def.u, def.v));
    if (!def.faceTo) return { ...def, x, z };
    const [tx, tz] = toXZ(...lay(...def.faceTo));
    return { ...def, x, z, facing: THREE.MathUtils.radToDeg(Math.atan2(tx - x, tz - z)) };
  });
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
  /* stencil: Niko's eyes are masked to his face, also when frames go straight to the screen */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, stencil: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_RATIO));
  renderer.setClearColor(0x000000, 0);
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  /* three's PCF takes five noise-spun taps, which leaves grainy or stair-stepped shadow edges. Instead: a 3×3 tent of
     hardware-filtered taps (each one already blends 2×2 texels), so the edge is a smooth ramp about four texels wide
     with no pattern in it. shadowRadius scales the tap spacing. */
  THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replace(
    /float radius = shadowRadius \* texelSize\.x;[\s\S]*?\) \* 0\.2;/,
    [
      "vec2 tap = texelSize * max( shadowRadius, 1.0 );",
      "float shadowSum = 0.0;",
      "float weightSum = 0.0;",
      "for ( int i = -2; i <= 2; i ++ ) {",
      "  for ( int j = -2; j <= 2; j ++ ) {",
      "    float w = 1.0 - 0.18 * float( abs( i ) + abs( j ) );",
      "    shadowSum += w * texture( shadowMap, vec3( shadowCoord.xy + vec2( float( i ), float( j ) ) * tap, shadowCoord.z ) );",
      "    weightSum += w;",
      "  }",
      "}",
      "shadow = smoothstep( 0.2, 0.8, shadowSum / weightSum );",
    ].join("\n")
  );

  const scene = new THREE.Scene();

  /* The camera sits far back along the iso direction so nothing on the island ever crosses its near plane */
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 260);
  const camOffset = new THREE.Vector3(40, 58, 40);
  const camLook = new THREE.Vector3(0, 0, 0);
  let viewHeight = 16;

  /* Final image, after t3ssel8r's pixel-art scenes and three.js' RenderPixelatedPass: the scene renders into a target,
     then one pass inks a thin outline wherever depth jumps (a silhouette over what lies behind it) and lifts convex
     creases (rock and cliff edges, steps) with a light edge. With `pixel` > 1 the target is that many times smaller and
     scaled up unfiltered, and the camera snaps to whole texels (the remainder slides the image) so nothing shimmers.
     Off by default (the painted look keeps edges soft); ?fx=1 turns it on, ?pixel=3 pixelates. Grass writes alpha 0.99
     so its blades get no crease highlight.
     Bloom (on unless ?bloom=0): the target is half float, so glows (lanterns, the fire, gems, stars) can be brighter than
     white. Whatever passes `threshold` is pulled out, halved down a mip chain and tent-filtered back up (dual filter),
     then added over the image, so bright things spill a soft light onto what is around them. */
  const post = (() => {
    const params = new URLSearchParams(location.search);
    const pixel = Math.max(1, Math.round(+params.get("pixel") || 1));
    /* Some phone GPUs can't draw into half float; there glows clip at white, so bloom keys off near-white instead */
    const hdr = params.get("hdr") !== "0" && (renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float"));
    const colorType = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const state = { on: params.get("fx") === "1" || pixel > 1, pixel, bloom: params.get("bloom") === "1" || (params.get("bloom") !== "0" && !lite), hdr, msaa: params.get("msaa") === "1" || (params.get("msaa") !== "0" && renderer.getPixelRatio() < 1.5), fxaa: params.get("aa") !== "0" };
    const active = () => state.on || state.bloom;
    const size = new THREE.Vector2();
    let target = null;
    /* Only the edge pass reads depth; without it, a plain depth/stencil buffer is far cheaper than a resolved texture */
    let targetEdges = false;
    const makeTarget = () => {
      target?.dispose();
      target = new THREE.WebGLRenderTarget(1, 1, { type: colorType, samples: state.pixel > 1 || !state.msaa ? 0 : 4, stencilBuffer: true });
      targetEdges = state.on;
      if (state.on) {
        const depth = new THREE.DepthTexture(1, 1);
        depth.format = THREE.DepthStencilFormat;
        depth.type = THREE.UnsignedInt248Type;
        target.depthTexture = depth;
      }
      const filter = state.pixel > 1 ? THREE.NearestFilter : THREE.LinearFilter;
      target.texture.minFilter = target.texture.magFilter = filter;
      size.set(0, 0);
    };
    const material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        res: { value: new THREE.Vector4() },
        span: { value: new THREE.Vector2(1, 1) },
        range: { value: new THREE.Vector2(1, 260) },
        shift: { value: new THREE.Vector2() },
        ink: { value: 1 },
        lift: { value: 1 },
        reach: { value: 1 },
        edges: { value: 0 },
        aa: { value: 0 },
        tBloom: { value: null },
        bloomStrength: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: [
        "uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec4 res; uniform vec2 span; uniform vec2 range;",
        "uniform vec2 shift; uniform float ink; uniform float lift; uniform float reach; varying vec2 vUv;",
        "uniform float edges; uniform float aa; uniform sampler2D tBloom; uniform float bloomStrength;",
        "float depthAt(vec2 uv){ return range.x + texture2D(tDepth, uv).r * (range.y - range.x); }",
        /* FXAA (console variant) for when the target has no MSAA: find the edge direction from the four diagonal lumas
           and blend along it, so stair-stepped edges and colour seams come out smooth */
        "float lumaAt(vec2 uv){ return dot(min(texture2D(tColor, uv).rgb, vec3(1.0)), vec3(0.299, 0.587, 0.114)); }",
        "vec3 fxaa(vec2 uv, vec3 rgbM){",
        "  vec2 px = res.zw;",
        "  float lM = dot(min(rgbM, vec3(1.0)), vec3(0.299, 0.587, 0.114));",
        "  float lNW = lumaAt(uv + vec2(-px.x, -px.y)); float lNE = lumaAt(uv + vec2(px.x, -px.y));",
        "  float lSW = lumaAt(uv + vec2(-px.x, px.y)); float lSE = lumaAt(uv + vec2(px.x, px.y));",
        "  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));",
        "  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));",
        "  if (lMax - lMin < max(0.04, lMax * 0.125)) return rgbM;",
        "  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));",
        "  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);",
        "  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), -8.0, 8.0) * px;",
        "  vec3 a = 0.5 * (texture2D(tColor, uv - dir / 6.0).rgb + texture2D(tColor, uv + dir / 6.0).rgb);",
        "  vec3 b = a * 0.5 + 0.25 * (texture2D(tColor, uv - dir * 0.5).rgb + texture2D(tColor, uv + dir * 0.5).rgb);",
        "  float lB = dot(min(b, vec3(1.0)), vec3(0.299, 0.587, 0.114));",
        "  return (lB < lMin || lB > lMax) ? a : b;",
        "}",
        "void main(){",
        "  vec2 uv = vUv + shift;",
        "  vec4 colour = texture2D(tColor, uv);",
        "  if (aa > 0.5) colour.rgb = fxaa(uv, colour.rgb);",
        "  float grass = step(abs(colour.a - 0.99), 0.004);",
        "  if (edges > 0.5) {",
        "  float d = depthAt(uv);",
        "  vec2 o = res.zw * reach;",
        "  float l = depthAt(uv - vec2(o.x, 0.0));",
        "  float r = depthAt(uv + vec2(o.x, 0.0));",
        "  float b = depthAt(uv - vec2(0.0, o.y));",
        "  float t = depthAt(uv + vec2(0.0, o.y));",
        /* Silhouette: a neighbour lies well behind this pixel (ortho depth is linear, so this is in world units) */
        "  float jump = max(max(l, r), max(b, t)) - d;",
        "  float outline = step(0.9, jump);",
        /* Convex crease: the pixel sits nearer than its neighbours' average while all of them are on the same surface */
        "  float texel = span.y * res.w * reach;",
        "  float near = max(max(abs(l - d), abs(r - d)), max(abs(b - d), abs(t - d)));",
        "  float crease = (l + r + b + t) * 0.25 - d;",
        "  float edge = smoothstep(texel * 0.3, texel * 0.6, crease) * step(near, 0.9) * (1.0 - grass) * (1.0 - outline);",
        "  colour.rgb *= 1.0 + edge * 0.35 * lift;",
        "  colour.rgb = mix(colour.rgb, colour.rgb * vec3(0.3, 0.32, 0.5), outline * 0.9 * ink);",
        "  if (ink > 5.0) colour = vec4(fract(d * 0.1), outline, edge, 1.0);",
        "  }",
        "  if (grass > 0.5) colour.a = 1.0;",
        /* The sky is CSS behind a transparent canvas: bloom over it raises the alpha, so it reads as light on the sky */
        "  vec3 bloom = texture2D(tBloom, uv).rgb * bloomStrength;",
        "  colour.rgb += bloom;",
        "  colour.a = max(colour.a, clamp(max(bloom.r, max(bloom.g, bloom.b)), 0.0, 1.0));",
        "  gl_FragColor = colour;",
        "  #include <colorspace_fragment>",
        "}",
      ].join("\n"),
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    const quadScene = new THREE.Scene();
    quadScene.add(quad);
    const quadCamera = new THREE.Camera();
    const draw = (shader, out) => {
      quad.material = shader;
      renderer.setRenderTarget(out);
      renderer.render(quadScene, quadCamera);
    };

    const bloom = (() => {
      const levels = coarse ? 4 : 5;
      const make = () => {
        const t = new THREE.WebGLRenderTarget(1, 1, { type: colorType, depthBuffer: false });
        t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter;
        t.texture.generateMipmaps = false;
        return t;
      };
      const down = Array.from({ length: levels }, make);
      const up = Array.from({ length: levels - 1 }, make);
      const vertexShader = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
      const pass = (fragmentShader, uniforms) =>
        new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
      /* Halve: a 4x4 box from five bilinear taps; the first level keeps only what is brighter than the threshold */
      const shrink = pass(
        [
          "uniform sampler2D tSrc; uniform vec2 texel; uniform vec4 cut; varying vec2 vUv;",
          "vec3 tap(vec2 uv){",
          "  vec3 c = texture2D(tSrc, uv).rgb;",
          "  if (cut.z < 0.5) return c;",
          /* One NaN or Inf pixel would smear into black blocks down the mip chain; drop it here */
          "  if (!(c.r + c.g + c.b < 1e4)) return vec3(0.0);",
          "  float bright = max(c.r, max(c.g, c.b));",
          /* Without HDR there is no excess over white to measure. Glows clip to white in every channel, while sunlit
             sand keeps its blue lower, so the weakest channel picks them out and a fixed gain stands in for the excess. */
          "  if (cut.w > 0.0) return c * smoothstep(cut.x, 1.0, min(c.r, min(c.g, c.b))) * cut.w;",
          "  float soft = clamp(bright - cut.x + cut.y, 0.0, 2.0 * cut.y);",
          "  soft = soft * soft / (4.0 * cut.y + 1e-4);",
          "  return c * max(soft, bright - cut.x) / max(bright, 1e-4);",
          "}",
          "void main(){",
          "  vec3 sum = tap(vUv) * 4.0;",
          "  sum += tap(vUv + texel * vec2(-1.0, -1.0)) + tap(vUv + texel * vec2(1.0, -1.0));",
          "  sum += tap(vUv + texel * vec2(-1.0, 1.0)) + tap(vUv + texel * vec2(1.0, 1.0));",
          "  gl_FragColor = vec4(sum / 8.0, 1.0);",
          "}",
        ].join("\n"),
        { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, cut: { value: new THREE.Vector4() } }
      );
      /* Double: a tent filter over the smaller level, added onto this level's own halved image */
      const grow = pass(
        [
          "uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 texel; varying vec2 vUv;",
          "void main(){",
          "  vec2 h = texel;",
          "  vec3 sum = texture2D(tSrc, vUv + vec2(-2.0 * h.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(2.0 * h.x, 0.0)).rgb;",
          "  sum += texture2D(tSrc, vUv + vec2(0.0, -2.0 * h.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, 2.0 * h.y)).rgb;",
          "  sum += (texture2D(tSrc, vUv + vec2(-h.x, -h.y)).rgb + texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb) * 2.0;",
          "  sum += (texture2D(tSrc, vUv + vec2(-h.x, h.y)).rgb + texture2D(tSrc, vUv + vec2(h.x, h.y)).rgb) * 2.0;",
          "  gl_FragColor = vec4(texture2D(tBase, vUv).rgb + sum / 12.0, 1.0);",
          "}",
        ].join("\n"),
        { tSrc: { value: null }, tBase: { value: null }, texel: { value: new THREE.Vector2() } }
      );
      const settings = hdr ? { threshold: 1, knee: 0.35, strength: 0.32, gain: 0 } : { threshold: 0.93, knee: 0, strength: 0.32, gain: 1.5 };
      const sized = new THREE.Vector2();
      return {
        settings,
        fit(w, h) {
          if (sized.x === w && sized.y === h) return;
          sized.set(w, h);
          down.forEach((t, k) => t.setSize(Math.max(1, w >> (k + 1)), Math.max(1, h >> (k + 1))));
          up.forEach((t, k) => t.setSize(Math.max(1, w >> (k + 1)), Math.max(1, h >> (k + 1))));
        },
        /* Returns the bloom texture (half the size of `source`) */
        run(source, w, h) {
          this.fit(w, h);
          const s = shrink.uniforms;
          s.cut.value.set(settings.threshold, settings.knee, 1, settings.gain);
          s.tSrc.value = source;
          s.texel.value.set(1 / w, 1 / h);
          draw(shrink, down[0]);
          s.cut.value.z = 0;
          for (let k = 1; k < levels; k += 1) {
            s.tSrc.value = down[k - 1].texture;
            s.texel.value.set(1 / down[k - 1].width, 1 / down[k - 1].height);
            draw(shrink, down[k]);
          }
          const g = grow.uniforms;
          for (let k = levels - 2; k >= 0; k -= 1) {
            const from = k === levels - 2 ? down[k + 1] : up[k + 1];
            g.tSrc.value = from.texture;
            g.tBase.value = down[k].texture;
            g.texel.value.set(1 / from.width, 1 / from.height);
            draw(grow, up[k]);
          }
          return up[0].texture;
        },
      };
    })();
    const drawing = new THREE.Vector2();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const texelSize = () => (camera.top - camera.bottom) / camera.zoom / Math.max(1, size.y);
    return {
      state,
      /* Pixel mode: move the camera onto the texel grid along its own right/up axes; the image shifts back by the rest */
      snap() {
        material.uniforms.shift.value.set(0, 0);
        if (!state.on || state.pixel < 2 || !size.y) return;
        const step = texelSize();
        right.setFromMatrixColumn(camera.matrixWorld, 0);
        up.setFromMatrixColumn(camera.matrixWorld, 1);
        const x = camera.position.dot(right);
        const y = camera.position.dot(up);
        const dx = Math.round(x / step) * step - x;
        const dy = Math.round(y / step) * step - y;
        camera.position.addScaledVector(right, dx).addScaledVector(up, dy);
        camera.updateMatrixWorld();
        const w = (camera.right - camera.left) / camera.zoom;
        const h = (camera.top - camera.bottom) / camera.zoom;
        material.uniforms.shift.value.set(-dx / w, -dy / h);
      },
      /* Shaders compile per output target, so warm-up has to aim at the same target the frames will use */
      bind() {
        if (!active()) return;
        if (!target) makeTarget();
        this.fit();
        renderer.setRenderTarget(target);
      },
      fit() {
        renderer.getDrawingBufferSize(drawing);
        const w = Math.max(1, Math.floor(drawing.x / state.pixel));
        const h = Math.max(1, Math.floor(drawing.y / state.pixel));
        if (w !== size.x || h !== size.y) {
          size.set(w, h);
          target.setSize(w, h);
        }
      },
      render() {
        if (!active()) {
          renderer.render(scene, camera);
          return;
        }
        if (!target || targetEdges !== state.on) makeTarget();
        this.fit();
        const w = size.x;
        const h = size.y;
        const u = material.uniforms;
        u.res.value.set(w, h, 1 / w, 1 / h);
        /* Lines about 2 CSS px wide at full resolution, one texel when pixelated */
        u.reach.value = state.pixel > 1 ? 1 : Math.max(1, 1.6 * Math.min(renderer.getPixelRatio(), 1.5));
        u.span.value.set((camera.right - camera.left) / camera.zoom, (camera.top - camera.bottom) / camera.zoom);
        u.range.value.set(camera.near, camera.far);
        u.tColor.value = target.texture;
        u.tDepth.value = target.depthTexture;
        u.edges.value = state.on ? 1 : 0;
        u.aa.value = target.samples === 0 && state.pixel === 1 && state.fxaa ? 1 : 0;
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        u.tBloom.value = state.bloom ? bloom.run(target.texture, w, h) : null;
        u.bloomStrength.value = state.bloom ? bloom.settings.strength : 0;
        draw(material, null);
      },
      set(options = {}) {
        const pixel = options.pixel == null ? state.pixel : Math.max(1, Math.round(options.pixel));
        if (options.on != null) state.on = options.on;
        if (options.bloom != null) state.bloom = options.bloom;
        ["threshold", "knee", "strength"].forEach((key) => options[key] != null && (bloom.settings[key] = options[key]));
        if (options.ink != null) material.uniforms.ink.value = options.ink;
        if (options.lift != null) material.uniforms.lift.value = options.lift;
        if (pixel !== state.pixel || (options.msaa != null && options.msaa !== state.msaa)) {
          state.pixel = pixel;
          if (options.msaa != null) state.msaa = options.msaa;
          makeTarget();
        }
        return { ...state, ...bloom.settings, ink: material.uniforms.ink.value, lift: material.uniforms.lift.value };
      },
    };
  })();

  /* Daylight: a warm, high sun from the upper left of the screen so shadows fall toward the viewer, a cool sky
     ambient that tints the shade blue, a cool bounce on the side away from the sun and a warm kiss from behind */
  const hemi = new THREE.HemisphereLight("#cfe4ff", "#9a8a68", 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight("#ffe7c2", 3.35);
  sun.position.set(-25, 30, 11);
  sun.castShadow = true;
  const SHADOW_SIZE = coarse ? 2048 : 4096;
  sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
  /* Deep enough for low evening light; the sides are fitted to the view in fitShadow */
  Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 200 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  /* A small push keeps faceted rocks from shadowing themselves. Larger values open a bright gap under every mesh. */
  sun.shadow.normalBias = 0.012;
  sun.shadow.radius = 1.35;
  /* One directional light, the way a Unity sun works: it redraws every frame so Niko casts a shadow and the
     island's shadows fall on him. bakeShadows still forces a redraw when the fit or the sun moves. */
  sun.shadow.autoUpdate = true;
  sun.shadow.needsUpdate = true;
  const bakeShadows = () => (sun.shadow.needsUpdate = true);
  const SUN_DISTANCE = 80;
  const sunAim = new THREE.Vector3(-25, 30, 11).normalize();
  /* The map covers only what the camera sees plus a margin (finer texels = clean edges, not stair steps), centred on a
     whole-texel grid so a re-fit never makes the edges crawl. It is re-fitted when the view drifts past the margin,
     the zoom changes the size it needs, or the sun moves. */
  const shadowFit = { center: new THREE.Vector3(), half: 0, reach: 40, dirty: true };
  const fitPoint = new THREE.Vector3();
  const fitDir = new THREE.Vector3();
  const lightRight = new THREE.Vector3();
  const lightUp = new THREE.Vector3();
  const fitShadow = () => {
    camera.getWorldDirection(fitDir);
    let reach = 0;
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      /* Up to the top of the sun-volume slices (world-rays.js), so the air there finds its shadows too */
      for (const h of [-1, 15]) {
        fitPoint.set(x, y, -1).unproject(camera);
        fitPoint.addScaledVector(fitDir, (h - fitPoint.y) / fitDir.y);
        reach = Math.max(reach, fitPoint.distanceTo(camLook));
      }
    }
    shadowFit.reach = reach + 2;
    const drift = Math.hypot(camLook.x - shadowFit.center.x, camLook.z - shadowFit.center.z);
    const want = Math.min(64, Math.ceil((reach * 1.12 + 4) / 4) * 4);
    if (!shadowFit.dirty && reach + drift < shadowFit.half && want > shadowFit.half * 0.7) return;
    shadowFit.dirty = false;
    shadowFit.half = want;
    lightRight.crossVectors(THREE.Object3D.DEFAULT_UP, sunAim).normalize();
    lightUp.crossVectors(sunAim, lightRight);
    const texel = (want * 2) / SHADOW_SIZE;
    const a = camLook.dot(lightRight);
    const b = camLook.dot(lightUp);
    shadowFit.center.copy(camLook)
      .addScaledVector(lightRight, Math.round(a / texel) * texel - a)
      .addScaledVector(lightUp, Math.round(b / texel) * texel - b);
    sun.target.position.copy(shadowFit.center);
    sun.position.copy(shadowFit.center).addScaledVector(sunAim, SUN_DISTANCE);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
    Object.assign(sun.shadow.camera, { left: -want, right: want, top: want, bottom: -want });
    sun.shadow.camera.updateProjectionMatrix();
    bakeShadows();
  };
  const placeSun = (dir) => {
    const next = new THREE.Vector3(dir[0], dir[1], dir[2]);
    /* ~0.12°: small enough that each redraw slides the shadows smoothly */
    if (next.dot(sunAim) > 0.999998 && !shadowFit.dirty && shadowFit.half > 0) return;
    sunAim.copy(next);
    shadowFit.dirty = true;
    fitShadow();
  };
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight("#8fbcff", 0.4);
  fill.position.set(14, 6, -4);
  scene.add(fill);

  const rim = new THREE.DirectionalLight("#ffc89a", 0.3);
  rim.position.set(-6, 8, -14);
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

  /* Niko's light floor: his shading never drops below albedo × (amb + key on the side facing a soft light from the
     camera's upper left). It is a max(), so in daylight the scene light wins and nothing changes; at night, in storms
     and under tree shadow he stays clear instead of sinking with the scene. `face` lifts the face further, `eye`
     dims the unlit eye decals a touch at night so they don't glow. */
  const charLight = {
    amb: { value: new THREE.Color(0.34, 0.34, 0.36) },
    key: { value: new THREE.Color(0.34, 0.33, 0.31) },
    dir: { value: new THREE.Vector3(-0.42, 0.55, 0.72).normalize() },
    face: { value: 0.16 },
    eye: { value: 1 },
  };
  const withCharLight = (material, face = false) => {
    const previous = material.onBeforeCompile;
    const key = material.customProgramCacheKey?.() || "";
    material.onBeforeCompile = (shader, renderer) => {
      previous?.(shader, renderer);
      shader.uniforms.charAmb = charLight.amb;
      shader.uniforms.charKey = charLight.key;
      shader.uniforms.charDir = charLight.dir;
      shader.uniforms.charFace = charLight.face;
      cloudUniforms(shader);
      Object.assign(shader.uniforms, { weatherWet, weatherFog, weatherFogColor });
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCharPos;")
        .replace("#include <fog_vertex>", "vCharPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <fog_vertex>");
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>\nuniform vec3 charAmb;\nuniform vec3 charKey;\nuniform vec3 charDir;\nuniform float charFace;\nuniform float weatherWet;\nuniform float weatherFog;\nuniform vec3 weatherFogColor;\nvarying vec3 vCharPos;\n${CLOUD_GLSL}`
        )
        .replace(
          "#include <opaque_fragment>",
          [
            /* The same weather as the island, a little lighter so he stays the clearest thing on screen: cloud shadow
               passing over him, wet cloth in rain, storm mist */
            "{",
            "  float sunLit = smoothstep(0.05, 0.4, length(reflectedLight.directDiffuse));",
            "  float charK = smoothstep(0.0, 0.3, dot(normal, charDir));",
            `  reflectedLight.indirectDiffuse = max(reflectedLight.indirectDiffuse, diffuseColor.rgb * (charAmb${face ? " + charFace * 0.5" : ""}));`,
            "  outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;",
            "  outgoingLight += diffuseColor.rgb * charKey * charK * sunLit;",
            "}",
            CLOUD_SHADE("vCharPos", "0.8"),
            "outgoingLight *= mix(vec3(1.0), vec3(0.8, 0.84, 0.92), weatherWet * 0.45);",
            "outgoingLight = mix(outgoingLight, weatherFogColor, clamp(weatherFog * 0.4, 0.0, 0.32));",
            "#include <opaque_fragment>",
          ].join("\n")
        );
    };
    material.customProgramCacheKey = () => `${key}-char2${face ? "-face" : ""}`;
    return material;
  };

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

  /* The island: terrain, water, stream, ruins, camp, dock and plants (world-island.js). Stops keep clear space. */

  const island = buildIsland({
    scene,
    withRim,
    coarse,
    clear: defs
      .filter((def) => def.action)
      .flatMap((def) => {
        const facing = THREE.MathUtils.degToRad(def.facing || 0);
        return [
          { x: def.x, z: def.z, r: 2.6 },
          { x: def.x + Math.sin(facing) * 2.2, z: def.z + Math.cos(facing) * 2.2, r: 2.2 },
        ];
      }),
  });
  const wind = calm ? null : windLines({ scene, groundAt: island.groundAt, count: coarse ? 4 : 6 });
  const windPixels = new THREE.Vector2();
  const rain = calm || lite ? null : makeRain({ scene, lite: coarse });
  const rays = calm ? null : makeRays({ scene, groundAt: island.groundAt, sun, shadowSize: SHADOW_SIZE, lite: lite || coarse });
  const rayTint = new THREE.Color();
  /* Fully lit air at strength 1 lifts the shade about this much (screen blend, so it never passes white) */
  const VOLUME_BASE = 0.035;
  const VOLUME_RAYS = 0.5;

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
    const buddyStar = flat(buddy, starGeo(0.14, 0.04, 0.05), glow("#ffe08a", 1.6), 0, 0, 0);
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
  /* Rigel crash-lands on the beach by the dock, the start of the island */
  const landing = island.spot("landing");
  robot.position.copy(landing);
  robot.rotation.y = Math.PI / 4;
  bot.body.scale.setScalar(1.12);
  const footRay = new THREE.Raycaster();
  const footOrigin = new THREE.Vector3();
  const footDown = new THREE.Vector3(0, -1, 0);
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
  const eyeMaterial = (tiles, layer, { lift = 0, opacity = 1, mask = true } = {}) => {
    const uniforms = {
      eyeShut: { value: 0 },
      eyeGaze: { value: new THREE.Vector2() },
      charEye: charLight.eye,
      ...Object.fromEntries(EYE_LAYERS.map((name) => [`t_${name}`, { value: tiles[name] }])),
    };
    const mat = new THREE.MeshBasicMaterial({ map: layer === "brow" ? tiles.brow : tiles.scl, color: "#f4eeee", transparent: true, depthWrite: false, opacity });
    if (lift && mask) {
      Object.assign(mat, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp });
    }
    /* A slight negative LOD bias keeps the tiny on-screen eye crisp instead of one mip too soft */
    const tile = (name, uv) => `eyeTap(t_${name}, ${uv})`;
    const fragment =
      layer === "brow"
        ? `diffuseColor *= ${tile("brow", "vMapUv")};`
        : [
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
        .replace("#include <map_fragment>", `${fragment}\ndiffuseColor.rgb *= charEye;`);
      if (lift) {
        shader.vertexShader = shader.vertexShader.replace(
          "#include <project_vertex>",
          `#include <project_vertex>\nmvPosition.z += ${(lift * NIKO_SCALE).toFixed(3)} * smoothstep(0.45, 0.85, normalize(transformedNormal).z);\ngl_Position = projectionMatrix * mvPosition;`
        );
      }
    };
    mat.customProgramCacheKey = () => `niko-eye-${layer}-${lift}-${mask ? 1 : 0}`;
    return { mat, uniforms };
  };
  /* Body slot is the clean T-pose. Hair, coat, clothes, and shoes are added here as their own skinned files on this skeleton. */
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
    const textured = meshes.some((mesh) => mesh.material?.map);
    /* This body has no eye cards. Seat the same painted decals on the front of the head; they follow the Head bone.
       A textured body already carries its own face, so the cards would sit on top of the paint. */
    if (!textured && !meshes.some((mesh) => mesh.material?.name === "eyeL") && bones.Head) {
      const skin = meshes.find((mesh) => mesh.material?.name === "skin");
      const raycaster = new THREE.Raycaster();
      const cells = 10;
      const halfW = 0.04;
      const halfH = 0.036;
      const seat = (x, y) => {
        const origin = new THREE.Vector3(x, y, 1).applyMatrix4(model.matrixWorld);
        const dir = new THREE.Vector3(0, 0, -1).transformDirection(model.matrixWorld).normalize();
        raycaster.set(origin, dir);
        raycaster.far = 4;
        const hit = skin && raycaster.intersectObject(skin, false)[0];
        if (!hit) return { point: new THREE.Vector3(x, y, 0.13), normal: new THREE.Vector3(0, 0, 1) };
        const point = model.worldToLocal(hit.point.clone());
        const normal = hit.face.normal.clone().transformDirection(skin.matrixWorld);
        normal.transformDirection(new THREE.Matrix4().copy(model.matrixWorld).invert()).normalize();
        point.addScaledVector(normal, 0.006);
        return { point, normal };
      };
      for (const [name, cx] of [["eyeL", 0.046], ["eyeR", -0.046]]) {
        const positions = [];
        const normals = [];
        const uvs = [];
        const indices = [];
        for (let j = 0; j <= cells; j += 1) {
          for (let i = 0; i <= cells; i += 1) {
            const x = cx + (i / cells - 0.5) * 2 * halfW;
            const y = 1.312 + (0.5 - j / cells) * 2 * halfH;
            const { point, normal } = seat(x, y);
            positions.push(point.x, point.y, point.z);
            normals.push(normal.x, normal.y, normal.z);
            uvs.push(i / cells, j / cells);
          }
        }
        for (let j = 0; j < cells; j += 1) {
          for (let i = 0; i < cells; i += 1) {
            const a = j * (cells + 1) + i;
            indices.push(a, a + cells + 1, a + cells + 2, a, a + cells + 2, a + 1);
          }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        const decal = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ name, color: "#ffffff" }));
        model.add(decal);
        model.updateMatrixWorld(true);
        bones.Head.attach(decal);
        meshes.push(decal);
      }
    }
    const eyeDecals = [["eyeL", 0], ["eyeR", 1]].map(([name, row]) => ({
      name,
      eye: eyeMaterial(eyeTiles[row], "eye", { lift: hasFace ? 0.08 : 0, mask: hasFace }),
      brows: [eyeMaterial(eyeTiles[row], "brow"), eyeMaterial(eyeTiles[row], "brow", { lift: hasFace ? 0.08 : 0, opacity: 0.4, mask: hasFace })],
    }));
    if (!hasFace) {
      eyeDecals.forEach((decal) => {
        decal.eye.mat.side = THREE.DoubleSide;
        decal.brows.forEach(({ mat }) => (mat.side = THREE.DoubleSide));
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
        mesh.material = withCharLight(lamped(withRim(new THREE.MeshToonMaterial({ map, gradientMap: ramp }))));
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
        mesh.receiveShadow = false;
        mesh.renderOrder = 3;
        mesh.frustumCulled = false;
        eye.brows.forEach(({ mat }, i) => {
          const brow = mesh.clone();
          brow.material = mat;
          brow.renderOrder = 2 + i * 2;
          mesh.parent.add(brow);
        });
        return;
      }
      if (name === "face") {
        mesh.material = faceMat;
        mesh.renderOrder = -1;
      } else if (name === "glow") mesh.material = glow("#ffe7a0", 2.4);
      else if (name === "lining") mesh.material = lining;
      else mesh.material = nikoToon(name === "skin" ? "#d7a07a" : `#${mesh.material.color.getHexString()}`);
      mesh.castShadow = name !== "glow" && name !== "face" && name !== "lining";
      mesh.receiveShadow = name !== "glow";
      mesh.frustumCulled = false;
      if (name !== "face" && name !== "glow" && name !== "lining") addInk(mesh, ink, aroundEyes);
    });
    const sockets = {};
    model.traverse((node) => {
      if (node.name.endsWith("Socket")) sockets[node.name.replace(/Socket$/, "")] = node;
    });

    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const [name, buf] of [["idle", nikoIdleFbx], ["run", nikoRunFbx]]) {
      const clip = retargetMixamo(name, parseFbx(buf), model, bones);
      actions[name] = mixer.clipAction(clip);
      actions[name].play();
      actions[name].setEffectiveWeight(name === "idle" ? 1 : 0);
    }
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
      cloak,
      sockets,
      parts,
      legs: [bones.RightUpLeg, bones.LeftUpLeg],
      knees: [bones.RightLeg, bones.LeftLeg],
      arms: [bones.RightArm, bones.LeftArm],
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
      ownPose: true,
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

  /* Click marker */

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
    const ctx = c.getContext("2d");
    ctx.fillStyle = "rgba(16, 43, 68, 0.45)";
    ctx.beginPath();
    ctx.arc(32, 32, 31, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.cream;
    ctx.beginPath();
    ctx.arc(32, 32, 21, 0, Math.PI * 2);
    ctx.fill();
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

  /* Intro pieces: Rigel, the star that falls onto the spawn ring, and what its impact throws up.
     Everything is built and drawn (invisibly) up front so nothing compiles mid-impact. */

  const playsIntro = Boolean(gsap) && !calm;
  const lights = { hemi, sun, fill, rim };
  const lightsOn = Object.fromEntries(Object.entries(lights).map(([key, light]) => [key, light.intensity]));
  const sky = { dawn: playsIntro ? 0 : 1 };
  const climate = createClimate({
    host,
    lights,
    lightsOn,
    lite,
    calm,
    params: new URLSearchParams(location.search),
  });
  /* The intro's night-to-day: the climate fades its own lights, tints and grade in by it */
  const setDawn = () => {
    climate.state.dawn = sky.dawn;
    climate.apply(climate.sample());
  };
  setDawn();
  /* The one place the climate reaches the scene shaders; lights and CSS are set inside the climate itself */
  const applyEnv = (s) => {
    windTime.value = s.windPhase;
    windMul.value = s.wind;
    rainAmt.value = s.rain;
    weatherWet.value = s.wet;
    weatherFog.value = s.fog;
    const dim = 0.22 + s.day * 0.78;
    weatherFogColor.value.setRGB(s.sky[0] * dim + 0.12 * s.day, s.sky[1] * dim + 0.1 * s.day, s.sky[2] * dim + 0.08 * s.day);
    lampGain.value = s.lampGain;
    cloudTime.value = s.cloudPhase;
    cloudCover.value = s.cover;
    cloudShade.value = s.shade;
    cloudSun.value.set(s.sunDir[0], s.sunDir[2]).divideScalar(Math.max(s.sunDir[1], 0.35));
    const wl = (1 - s.night) * (1 - s.storm * 0.25);
    waterLight.value.setRGB(THREE.MathUtils.lerp(0.3, 1, wl), THREE.MathUtils.lerp(0.38, 1, wl), THREE.MathUtils.lerp(0.6, 1, wl));
    placeSun(s.sunDir);
    /* Niko's own light: a floor under his shading that rises as the scene darkens, cooler at night so he still sits in
       the moonlight, and higher on the face so it never drops into mud */
    const d = s.dark;
    /* Storms keep him grey-blue and lower than night: the storm light is flat and dim, a bright floor read as a sticker */
    const st = s.storm * (1 - s.night);
    const lo = (day, night, storm) => THREE.MathUtils.lerp(THREE.MathUtils.lerp(day, night, s.night), storm, st);
    charLight.amb.value.setRGB(lo(0.34, 0.33, 0.26), lo(0.34, 0.38, 0.28), lo(0.36, 0.55, 0.34));
    charLight.key.value.setRGB(lo(0.34, 0.36, 0.22), lo(0.33, 0.38, 0.23), lo(0.31, 0.46, 0.27));
    charLight.face.value = lo(0.16, 0.22, 0.12);
    charLight.eye.value = lo(1, 0.88, 0.84);
  };
  let climateSample = climate.sample();
  if (!playsIntro) {
    climate.unlock();
    climateSample = climate.update(0);
  }
  applyEnv(climateSample);

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
    wave.position.copy(landing).y += 0.05;
    return wave;
  });

  const impactLight = new THREE.PointLight(PAL.yellow, 0, 16, 1.4);
  impactLight.position.copy(landing).y += 1.4;
  scene.add(impactLight);

  /* Once Niko is out, a small Rigel keeps hovering over the shrine in its beam of light */
  const shrineStar = new THREE.Sprite(flareMat(0.95));
  shrineStar.scale.setScalar(2.4);
  shrineStar.position.copy(island.shrine).y += 4.6;
  shrineStar.renderOrder = 3;
  shrineStar.visible = !playsIntro;
  scene.add(shrineStar);
  island.beamMat.uniforms.strength.value = playsIntro ? 0 : 0.85;

  const debrisGeo = new THREE.BoxGeometry(0.17, 0.17, 0.17);
  const debris = Array.from({ length: 22 }, (_, i) => {
    const mesh = new THREE.Mesh(debrisGeo, soft([ISLE.star, ISLE.ruin, PAL.cream][i % 3]));
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, v: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, size: 1 };
  });

  const fx = [];
  let shake = 0;
  let clock = 0;
  let intro = null;
  let introLive = playsIntro;

  if (playsIntro) robot.visible = false;

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
    pace: 1,
  };
  const AXIS_Z = new THREE.Vector3(0, 0, 1);
  const RAISED_ARM = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.35, 1.25));
  const overlayQ = new THREE.Quaternion();
  const breeze = new THREE.Vector3();

  /* Stops and props push Niko out softly; the walk grid keeps him off cliffs, out of the sea and off the stream */
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
    return pos;
  };

  /* Keeps a move only if it lands on walkable ground; otherwise slides along whichever axis still does */
  const stepTo = (from, pos) => {
    if (island.nav.walkable(pos.x, pos.z) || !island.nav.walkable(from.x, from.z)) return pos;
    if (island.nav.walkable(pos.x, from.z)) return pos.set(pos.x, pos.y, from.z);
    if (island.nav.walkable(from.x, pos.z)) return pos.set(from.x, pos.y, pos.z);
    return pos.copy(from);
  };

  const goTo = (point, obj = null) => {
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

  const updateRoute = (dt) => {
    if (!routeDots.count) return;
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

  let press = null;

  /* Floating stick: a touch that drags turns into a joystick where the drag began, and the base stays put there;
     a quick tap still walks there. Two fingers pinch to zoom instead. */
  const STICK = 46;
  const stick = { on: false, x: 0, y: 0, base: { x: 0, y: 0 } };
  const stickEl = document.createElement("div");
  stickEl.className = "world-stick";
  stickEl.setAttribute("aria-hidden", "true");
  const knobEl = document.createElement("span");
  knobEl.className = "world-stick-knob";
  stickEl.append(knobEl);
  host.append(stickEl);

  const placeStick = () => {
    const rect = host.getBoundingClientRect();
    stickEl.style.translate = `${(stick.base.x - rect.left).toFixed(1)}px ${(stick.base.y - rect.top).toFixed(1)}px`;
    knobEl.style.translate = `${(stick.x * STICK).toFixed(1)}px ${(stick.y * STICK).toFixed(1)}px`;
  };

  const releaseStick = () => {
    stick.on = false;
    stick.x = stick.y = 0;
    stickEl.classList.remove("is-on");
  };

  /* Zoom: the wheel and pinches move a goal that the camera eases toward; the intro tweens the camera itself */
  const ZOOM_MIN = 0.7;
  const ZOOM_MAX = 1.7;
  let zoomGoal = null;
  const zoomBy = (factor, now = false) => {
    zoomGoal = THREE.MathUtils.clamp((zoomGoal ?? camera.zoom) * factor, ZOOM_MIN, ZOOM_MAX);
    if (now) {
      camera.zoom = zoomGoal;
      camera.updateProjectionMatrix();
    }
  };
  const easeZoom = (dt) => {
    if (zoomGoal == null || introLive) return;
    camera.zoom = THREE.MathUtils.damp(camera.zoom, zoomGoal, 14, dt);
    if (Math.abs(camera.zoom - zoomGoal) < 0.0005) {
      camera.zoom = zoomGoal;
      zoomGoal = null;
    }
    camera.updateProjectionMatrix();
  };

  const touches = new Map();
  let pinch = null;
  const spread = () => {
    const [a, b] = touches.values();
    return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse") {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture?.(event.pointerId);
    }
    if (touches.size >= 2) {
      press = null;
      releaseStick();
      if (!pinch && !introLive) pinch = { dist: spread() };
      return;
    }
    if (press || pinch) return;
    press = document.hasFocus() ? { id: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType !== "mouse" } : null;
  });

  canvas.addEventListener("pointermove", (event) => {
    const touch = touches.get(event.pointerId);
    if (touch) {
      touch.x = event.clientX;
      touch.y = event.clientY;
    }
    if (pinch) {
      if (touches.size >= 2) {
        const dist = spread();
        zoomBy(dist / pinch.dist, true);
        pinch.dist = dist;
      }
      return;
    }

    if (!press?.touch || event.pointerId !== press.id || introLive || overlayOpen()) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    const len = Math.hypot(dx, dy);

    if (!stick.on) {
      if (len < 12) return;
      stick.on = true;
      stick.base.x = press.x;
      stick.base.y = press.y;
      stickEl.classList.add("is-on");
    }

    const k = len > STICK ? STICK / len : 1;
    stick.x = (dx * k) / STICK;
    stick.y = (dy * k) / STICK;
    placeStick();
  });

  /* Returns true while the touch belonged to a pinch, so lifting a finger from it neither taps nor steers */
  const lift = (event) => {
    touches.delete(event.pointerId);
    if (!pinch) return false;
    if (!touches.size) pinch = null;
    press = null;
    return true;
  };

  const dropPress = (event) => {
    if (lift(event)) return;
    if (press && event.pointerId !== press.id) return;
    press = null;
    releaseStick();
  };
  canvas.addEventListener("pointercancel", dropPress);
  canvas.addEventListener("lostpointercapture", dropPress);

  canvas.addEventListener("pointerup", (event) => {
    if (lift(event)) {
      return;
    }
    if (press && event.pointerId !== press.id) {
      return;
    }

    if (introLive) {
      press = null;
      speedUp();
      return;
    }

    if (stick.on) {
      press = null;
      releaseStick();
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
      if (introLive) return;
      const lines = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
      zoomBy(Math.exp(-THREE.MathUtils.clamp(event.deltaY * lines, -240, 240) * 0.0015));
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
    touches.clear();
    pinch = null;
    releaseStick();
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

    /* A light push walks slower; the run clip slows with it so the feet don't skate */
    const push = Math.hypot(stick.x, stick.y);
    if (stick.on && push > 0.2) {
      const pace = 0.4 + 0.6 * Math.min(1, (push - 0.2) / 0.55);
      x += (stick.x / push) * pace;
      y += (stick.y / push) * pace;
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
      resolveCollisions(robot.position);
      stepTo(before, robot.position);
      state.yaw = Math.atan2(input.x, input.z);
      state.pace = THREE.MathUtils.damp(state.pace, input.length(), 10, dt);
      moving = true;
    } else if (state.path.length) {
      state.pace = THREE.MathUtils.damp(state.pace, 1, 10, dt);
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

    /* Feet stay on the drawn ground, not the height grid: the mesh sags between samples, and standing on the
       grid leaves a lit gap under the soles. Decks stay on the grid height when the terrain is far below. */
    const guess = island.groundAt(robot.position.x, robot.position.z);
    footOrigin.set(robot.position.x, guess + 3, robot.position.z);
    footRay.set(footOrigin, footDown);
    footRay.far = 8;
    const footHit = footRay.intersectObject(island.terrain, false);
    const footY = footHit.length ? footHit[0].point.y : guess;
    const floor = Math.abs(footY - guess) < 0.8 ? footY : guess;
    robot.position.y = !moving || calm || !started ? floor : THREE.MathUtils.damp(robot.position.y, floor, 18, dt);
    travelled.subVectors(robot.position, before).setY(0);

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
    state.phase += dt * 10 * state.walk * state.pace;
    const step = Math.sin(state.phase);
    const swing = step * 0.7 * state.walk;
    const bob = Math.abs(Math.cos(state.phase)) * state.walk;

    /* Standing still, he turns three-quarters toward the camera and looks up, so his face reads from above */
    state.still = moving ? 0 : state.still + dt;
    const faceCam = bot.mixer && robot.visible && state.still > 0.9 && !state.path.length && !root.classList.contains("world-intro");
    if (state.holdYaw != null) state.yaw = Math.atan2(camOffset.x, camOffset.z) + state.holdYaw;
    else if (faceCam) {
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
      actions.run.setEffectiveTimeScale(1.2 * state.pace);
      bot.mixer.update(calm ? 0 : dt);
      /* These offsets were measured on the old skeleton, whose bones rested at identity. The Y Bot rig already
         carries Mixamo's bone axes, so the same turns point the limbs the wrong way. */
      if (!bot.ownPose) {
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
      }
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
    easeZoom(dt);
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

    climateSample = climate.update(dt);
    applyEnv(climateSample);
    if (island.beamMat && climate.state.unlocked) {
      island.beamMat.uniforms.strength.value = 0.85 + climateSample.night * 0.35 + climateSample.storm * 0.2;
    }
    island.halos.visible = !post.state.bloom;

    /* Camera follows Niko over the island */

    lookTarget.set(THREE.MathUtils.clamp(robot.position.x, -38, 38), robot.position.y, THREE.MathUtils.clamp(robot.position.z, -38, 38));
    keepInFrame(lookTarget);
    if (calm || !started) {
      camLook.copy(lookTarget);
    } else {
      camLook.x = THREE.MathUtils.damp(camLook.x, lookTarget.x, 4, dt);
      camLook.y = THREE.MathUtils.damp(camLook.y, lookTarget.y, 3, dt);
      camLook.z = THREE.MathUtils.damp(camLook.z, lookTarget.z, 4, dt);
    }
    camera.position.copy(camLook).add(camOffset);
    camera.lookAt(camLook);
    camera.updateMatrixWorld();
    fitShadow();
    post.snap();
    /* Niko's ink hull only reads once it is close to a pixel wide; thinner, it breaks into stray dark pixels wherever
       his parts overlap, so it only shows when zoomed in */
    if (bot.ink) bot.ink.visible = bot.inkWidth / ((camera.top - camera.bottom) / camera.zoom / Math.max(1, renderer.domElement.height)) > 0.8;
    if (rain) {
      rain.update(dt, {
        center: camLook,
        camera,
        groundAt: island.groundAt,
        intensity: climateSample.rain,
        storm: climateSample.storm,
        windMul: climateSample.wind,
        light: climateSample.day * (1 - climateSample.storm * 0.35),
      });
    }
    if (rays) {
      /* Sunlit air glows a little in any clear daylight (depth and brilliance); the rays layer turns it into shafts */
      const sunUp = climateSample.moon ? 0 : climateSample.day * (1 - climateSample.storm * 0.8);
      rays.update(dt, {
        camera,
        center: camLook,
        extent: shadowFit.reach,
        strength: VOLUME_BASE * sunUp * sky.dawn,
        rays: climateSample.rays * VOLUME_RAYS * sky.dawn,
        sunDir: climateSample.sunDir,
        tint: rayTint.setRGB(1, 0.9 + climateSample.gold * -0.08 + 0.04, 0.76 - climateSample.gold * 0.16),
      });
    }
    island.update(dt, calm ? 0 : time, robot.visible ? robot.position : null, renderer, rain?.hits);
    if (shrineStar.visible) {
      shrineStar.position.y = island.shrine.y + 4.6 + (calm ? 0 : Math.sin(time * 1.4) * 0.18);
      shrineStar.material.rotation = calm ? 0 : Math.sin(time * 0.5) * 0.15;
      if (climate.state.unlocked) {
        shrineStar.material.opacity = 0.95 + climateSample.night * 0.2 + climateSample.storm * 0.1;
      }
    }
    if (wind) {
      renderer.getDrawingBufferSize(windPixels);
      /* Breeze ribbons = fair / windy air only. Hide them in rain so streaks don't fight the storm. */
      wind.update(dt, {
        camera,
        level: camLook.y,
        pixels: windPixels,
        ratio: renderer.getPixelRatio(),
        on: started && !introLive && climateSample.rain < 0.05 && climateSample.wind > 0.55,
        rate: climateSample.wind * (1 + climateSample.gust),
        light: climateSample.day * (1 - climateSample.storm * 0.3),
      });
    }
    if (robot.visible) seeThrough.playerView.value.set(robot.position.x, robot.position.y + 0.95, robot.position.z).applyMatrix4(camera.matrixWorldInverse);
    else seeThrough.playerView.value.set(0, 0, -9999);

    if (shake > 0) {
      camera.translateX((Math.random() - 0.5) * shake);
      camera.translateY((Math.random() - 0.5) * shake);
      shake = Math.max(0, shake - dt * 1.8);
    }

    updatePrompt();
  };

  let last = performance.now();
  let frames = 0;
  const timing = { update: 0, render: 0, frame: 0 };

  /* Resolution steps down (never back up) while frames average slower than ~45 fps, so weak GPUs stay smooth */
  const quality = { ratio: renderer.getPixelRatio(), time: 0, frames: 0 };
  const setRatio = (ratio) => {
    quality.ratio = ratio;
    renderer.setPixelRatio(ratio);
    resize();
  };
  const adaptQuality = (dt) => {
    if (introLive || document.hidden || quality.locked) return;
    quality.time += dt;
    quality.frames += 1;
    if (quality.time < 2) return;
    const average = (quality.time / quality.frames) * 1000;
    quality.time = 0;
    quality.frames = 0;
    if (average <= 22) return;
    /* MSAA on the offscreen target goes first (resolving it costs more than the scene), then bloom (halos take over
       the glow), then resolution in quarter steps, never below 1x: under that the island turns visibly pixelated */
    if (post.state.bloom && post.state.msaa) post.set({ msaa: false });
    else if (post.state.bloom) post.set({ bloom: false });
    else if (quality.ratio > 1) setRatio(Math.max(1, quality.ratio - 0.25));
  };

  /* ?diag=1: a readout for checking a real phone (frame time, resolution, bloom, HDR, reduced motion, GPU) */
  const diag = new URLSearchParams(location.search).has("diag")
    ? (() => {
        const el = document.createElement("pre");
        el.style.cssText = "position:absolute;left:8px;bottom:8px;z-index:6;margin:0;padding:6px 8px;background:rgba(0,0,0,.65);color:#fff;font:11px/1.35 monospace;pointer-events:none;white-space:pre-wrap;max-width:70vw";
        host.append(el);
        const gl = renderer.getContext();
        const info = gl.getExtension("WEBGL_debug_renderer_info");
        return { el, gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown", ms: 16, at: 0 };
      })()
    : null;
  const showDiag = (now, raw) => {
    diag.ms += (raw - diag.ms) * 0.1;
    if (now - diag.at < 500) return;
    diag.at = now;
    diag.el.textContent = [
      `${diag.ms.toFixed(1)} ms  dpr ${renderer.getPixelRatio()}`,
      `bloom ${post.state.bloom ? "on" : "off"}  hdr ${post.state.hdr ? "yes" : "no"}  lite ${lite}  msaa ${post.state.msaa}`,
      `reduced motion ${calm ? "ON" : "off"}  coarse ${coarse}`,
      diag.gpu,
    ].join("\n");
  };

  renderer.setAnimationLoop((now) => {
    /* The frame timestamp can trail performance.now() (settle resets `last` with it), so never step backward */
    const dt = THREE.MathUtils.clamp((now - last) / 1000, 0, 0.05);
    if (diag) showDiag(now, Math.max(0, now - last));
    last = now;

    if (overlayOpen()) {
      return;
    }

    const t0 = performance.now();
    update(dt, now / 1000);
    const t1 = performance.now();

    /* While the opaque boot cover is up, a few warm-up frames are enough; the GPU is left to the loading screen */
    const covered = boot && root.classList.contains("world-intro") && boot.style.visibility !== "hidden" && (boot.style.opacity === "" || boot.style.opacity === "1");
    if (covered && frames > 3) return;

    renderer.info.reset();
    post.render();
    placeLabels();
    const t2 = performance.now();
    timing.update += (t1 - t0 - timing.update) * 0.05;
    timing.render += (t2 - t1 - timing.render) * 0.05;
    timing.frame += (dt * 1000 - timing.frame) * 0.05;
    adaptQuality(dt);
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
    touches.clear();
    pinch = null;
    releaseStick();
    started = false;
    last = performance.now();

    if (document.visibilityState === "visible") {
      setRatio(Math.min(window.devicePixelRatio, MAX_RATIO, quality.ratio));
    }

    intro?.progress(1);
  };

  document.addEventListener("visibilitychange", settle);
  window.addEventListener("pageshow", settle);

  /* Loading and intro */

  let loaded = false;
  let revealed = false;

  const loadPct = boot?.querySelector(".world-boot-pct");
  let loadShown = 0;
  const setLoad = (fraction) => {
    if (fraction > loadShown) field.pulse(0.5 + (fraction - loadShown) * 1.5);
    loadShown = Math.max(loadShown, fraction);
    boot?.style.setProperty("--load", fraction.toFixed(3));
    if (loadPct) loadPct.textContent = `${Math.round(fraction * 100)}%`;
  };

  /* The loading screen covers every asset (textures, Niko's model) and the first-draw costs: shaders are compiled,
     textures uploaded and the shadow map baked behind the cover, so nothing pops in or hitches once the island shows. */
  const loading = { done: 0, total: 0, textures: fromDisk, niko: false, warm: false };
  const showProgress = () => setLoad(Math.min(0.96, (loading.done + (loading.niko ? 1 : 0)) / (loading.total + 1)));
  manager.onProgress = (_url, done, total) => {
    Object.assign(loading, { done, total });
    showProgress();
  };

  const prewarm = async () => {
    const shown = [];
    scene.traverse((node) => {
      if (!node.visible) {
        node.visible = true;
        shown.push(node);
      }
    });
    post.bind();
    try {
      await renderer.compileAsync(scene, camera);
      /* Programs differ per output; if adaptive quality later drops bloom, the screen versions are ready too */
      if (renderer.getRenderTarget()) {
        renderer.setRenderTarget(null);
        await renderer.compileAsync(scene, camera);
        post.bind();
      }
    } catch (error) {
      console.warn("Shader warm-up failed", error);
    }
    scene.traverse((node) => {
      [node.material].flat().forEach((material) => {
        ["map", "emissiveMap", "alphaMap", "gradientMap"].forEach((key) => material?.[key]?.isTexture && renderer.initTexture(material[key]));
      });
    });
    bakeShadows();
    post.render();
    shown.forEach((node) => (node.visible = false));
  };

  const finishLoading = async () => {
    if (!loading.textures || !loading.niko || loading.warm) return;
    loading.warm = true;
    await prewarm();
    loaded = true;
    reveal();
  };

  manager.onLoad = () => {
    loading.textures = true;
    finishLoading();
  };
  nikoReady.then(() => {
    loading.niko = true;
    showProgress();
    finishLoading();
  });

  /* Fallbacks for a stalled network: stop waiting on textures, then on Niko, but still warm up before revealing */
  window.setTimeout(() => {
    loading.textures = true;
    finishLoading();
  }, 15000);
  window.setTimeout(() => {
    loading.textures = true;
    loading.niko = true;
    finishLoading();
  }, 25000);
  window.setTimeout(() => {
    loaded = true;
    bakeShadows();
    reveal();
  }, 40000);

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
    climate.unlock();
    climateSample = climate.update(0);
    applyEnv(climateSample);
    sky.dawn = 1;
    robot.visible = true;
    shrineStar.visible = true;
    shrineStar.material.opacity = 0.95;
    island.beamMat.uniforms.strength.value = 0.85;

    try {
      window.sessionStorage.setItem("fy-intro", "1");
    } catch {}
  };

  const fallFrom = new THREE.Vector3();
  const fallTo = landing.clone().add(new THREE.Vector3(0, 0.45, 0));
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

    bloom.position.copy(landing).y += 0.6;
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
      bit.mesh.position.set(landing.x + Math.cos(angle) * 0.45, landing.y + 0.35, landing.z + Math.sin(angle) * 0.45);
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
        const rest = island.groundAt(bit.mesh.position.x, bit.mesh.position.z) + 0.09;
        if (bit.mesh.position.y < rest) {
          bit.mesh.position.y = rest;
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
    fallFrom.copy(fallTo).add(new THREE.Vector3(0, drop, 0)).addScaledVector(screenRight, drop * 0.8 * lean);

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
      .to(sky, { dawn: 1, duration: 2.0, ease: "sine.inOut", onUpdate: setDawn }, W + 1.3)

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

      /* The shrine wakes: its beam rises and a small Rigel settles into it */
      .set(shrineStar, { visible: true }, land + 1.5)
      .fromTo(shrineStar.material, { opacity: 0 }, { opacity: 0.95, duration: 0.9, immediateRender: false }, land + 1.5)
      .fromTo(shrineStar.scale, { x: 0.4, y: 0.4 }, { x: 2.4, y: 2.4, duration: 0.9, ease: "back.out(2)", immediateRender: false }, land + 1.5)
      .to(island.beamMat.uniforms.strength, { value: 0.85, duration: 1.4, ease: "sine.inOut" }, land + 1.4)

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
        goTo(island.spot("games"));
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
      /* Hold Niko at an angle (radians) relative to the camera; null releases him */
      holdYaw: (angle) => void (state.holdYaw = angle),
      bot: () => bot,
      scene: () => scene,
      island: () => island,
      shrineStar: () => shrineStar,
      /* Final pass: { on, pixel, ink, lift } */
      post: (options) => post.set(options),
      stats: () => ({
        ms: Object.fromEntries(Object.entries(timing).map(([k, v]) => [k, +v.toFixed(2)])),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        programs: renderer.info.programs.length,
        textures: renderer.info.memory.textures,
        pixelRatio: renderer.getPixelRatio(),
        size: [renderer.domElement.width, renderer.domElement.height],
      }),
      /* Render sharper than the normal DPR cap, for close-up review shots */
      pixelRatio: (ratio) => {
        quality.locked = true;
        setRatio(ratio);
      },
      faceImages: () => [bot.faceOpen.image.toDataURL()],
      /* Island review: put Niko at a map spot (authored u, v as in world-map.js, before the K spread), zoom, skip the intro */
      placeUV: (u, v) => {
        const p = island.fromUV(...lay(u, v));
        robot.position.copy(p);
        state.path = [];
        started = false;
      },
      zoomNow: () => +camera.zoom.toFixed(3),
      zoom: (z) => {
        gsap.killTweensOf(camera);
        zoomGoal = null;
        camera.zoom = z;
        camera.updateProjectionMatrix();
      },
      finishIntro: () => void finishIntro(),
      /* climate({ hour, weather, instant }) — weather rolls in unless instant; climate() reads the live env */
      climate: (opts) => (opts == null ? climate.sample() : climate.set(opts)),
      /* Freeze clouds and water at time t (null to release) so screenshots differ only by wind */
      pinMotion: (t = null) => void (island.motion.pinned = t),
      wind: () => wind?.peek(),
      walkable: (x, z) => island.nav.walkable(x, z),
      position: () => robot.position.toArray(),
      route: () => state.path.map((p) => p.toArray().map((n) => +n.toFixed(2))),
      bakeShadows: () => bakeShadows(),
    },
  };
}
