/* Play world: an isometric arcade floor where a robot walks to whatever you click and opens it.
   Objects come from world-data.js; the panels they open live in index.html and script.js. */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FBXLoader } from "./.impeccable/fbx/addons/loaders/FBXLoader.js";
import nikoBody from "./assets/niko/low-poly-humanoid-v6-clean.glb";
import nikoHair from "./assets/niko/hair-short.glb";
import nikoIdleFbx from "./assets/niko/Idle.fbx";
import nikoRunFbx from "./assets/Running (1).fbx";
import lockonClips from "./assets/niko/lockon.json";
import xiphosGlb from "./assets/models/xiphos-sword.glb";
import longswordGlb from "./assets/models/longsword.glb";
import nikoEyesUrl from "./assets/niko-eyes.png";
import { atmos, buildIsland, CLOUD_GLSL, CLOUD_SHADE, cloudCover, cloudLightStyle, cloudShade, cloudSun, cloudTime, cloudUniforms, ISLE, lampGain, lamped, makeCloudMap, makeRamp, waterLight, occlude, seeThrough, rainAmt, windMul, windTime, weatherFog, weatherFogColor, weatherWet } from "./world-island.js";
import { lay, toXZ } from "./world-map.js";
import { windLines } from "./world-wind.js";
import { createClimate } from "./world-climate.js";
import { makeRain } from "./world-rain.js";
import { makeRays } from "./world-rays.js";

const root = document.documentElement;
const host = document.getElementById("world");
cloudLightStyle.value = new URLSearchParams(location.search).get("lighting") === "cloudsteps";

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
  const liteParam = new URLSearchParams(location.search).get("lite");
  const MAX_RATIO = 2;
  /* Lowest resolution the frame-time guard may fall back to (only while frames stay under ~30 fps at 1x) */
  const MIN_RATIO = 0.6;
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
  /* Software rendering (Chrome with hardware acceleration off, or a blocklisted GPU) draws every pixel on the CPU,
     at a fraction of a GPU's speed; such a browser starts in lite at a lower resolution so it stays usable */
  const gpuName = (() => {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  })();
  const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpuName);
  if (software) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 0.75));
    console.warn(`Portfolio world: software rendering (${gpuName}). Turning on hardware acceleration in the browser makes it much faster.`);
  }
  /* Lite (phones, software rendering, or ?lite=1; ?lite=0 opts out): draw straight to the screen with no offscreen
     bloom chain, which costs several times the scene itself on phone GPUs, and spend the savings on resolution; halo
     sprites stand in for bloom */
  const lite = liteParam === "1" || ((coarse || software) && liteParam !== "0");
  renderer.setClearColor(0x000000, 0);
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  /* three's PCF takes five noise-spun taps, which leaves grainy or stair-stepped shadow edges. Instead: a 5×5 tent of
     hardware-filtered taps (each one already blends 2×2 texels), so the edge is a smooth ramp about four texels wide
     with no pattern in it. shadowRadius scales the tap spacing.
     Most pixels are wholly in sun or wholly in shade, so the 9 even taps go first: when they all agree the answer is
     already 1 or 0 (a sliver small enough to slip between them stays above the smoothstep's 0.8 anyway), and only
     pixels on an edge pay for the other 16. */
  THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replace(
    /float radius = shadowRadius \* texelSize\.x;[\s\S]*?\) \* 0\.2;/,
    [
      "vec2 tap = texelSize * max( shadowRadius, 1.0 );",
      "float shadowSum = 0.0;",
      "float weightSum = 0.0;",
      "float probes = 0.0;",
      "for ( int i = -2; i <= 2; i += 2 ) {",
      "  for ( int j = -2; j <= 2; j += 2 ) {",
      "    float w = 1.0 - 0.18 * float( abs( i ) + abs( j ) );",
      "    float s = texture( shadowMap, vec3( shadowCoord.xy + vec2( float( i ), float( j ) ) * tap, shadowCoord.z ) );",
      "    probes += s;",
      "    shadowSum += w * s;",
      "    weightSum += w;",
      "  }",
      "}",
      "if ( probes > 8.999 ) shadow = 1.0;",
      "else if ( probes < 0.001 ) shadow = 0.0;",
      "else {",
      "  for ( int i = -2; i <= 2; i ++ ) {",
      "    for ( int j = -2; j <= 2; j ++ ) {",
      "      if ( abs( i ) % 2 == 0 && abs( j ) % 2 == 0 ) continue;",
      "      float w = 1.0 - 0.18 * float( abs( i ) + abs( j ) );",
      "      shadowSum += w * texture( shadowMap, vec3( shadowCoord.xy + vec2( float( i ), float( j ) ) * tap, shadowCoord.z ) );",
      "      weightSum += w;",
      "    }",
      "  }",
      "  shadow = smoothstep( 0.2, 0.8, shadowSum / weightSum );",
      "}",
    ].join("\n")
  );

  /* Every material writes display (sRGB) colour, also into the post target, so blending and the MSAA resolve work on
     the same values whether a frame goes through post or straight to the screen. Resolving in linear light made thin
     dark detail (grass blades, shade) fade, and the island looked paler whenever bloom was on. The post composite
     therefore does no colour conversion of its own. */
  /* Light that is taken away (cloud shade, Niko's light floor) can leave a channel below zero; pow() of that is NaN */
  THREE.ShaderChunk.colorspace_fragment = "gl_FragColor = sRGBTransferOETF( vec4( max( gl_FragColor.rgb, 0.0 ), gl_FragColor.a ) );";

  const scene = new THREE.Scene();

  /* The old island view: offset (40, 58, 40), looking straight at Niko, about 45.7° down.
     Yaw still orbits. The pitch is a live modifier (debug.angle, or ?angle= in degrees) and the
     camera stays on that same sphere so he remains in the middle of the screen. */
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 260);
  const CAM_REACH = Math.hypot(40, 58, 40);
  const angleQuery = new URLSearchParams(location.search).get("angle");
  const angleNumber = angleQuery == null || angleQuery === "" ? NaN : Number(angleQuery);
  let camPitch = Number.isFinite(angleNumber) ? THREE.MathUtils.degToRad(angleNumber) : Math.atan2(58, Math.hypot(40, 40));
  camPitch = THREE.MathUtils.clamp(camPitch, 0.18, 1.4);
  let camYaw = Math.PI / 4;
  let camYawGoal = camYaw;
  const camOffset = new THREE.Vector3();
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
      /* Only light sources glow: glow() parts are 2x+ white (~1.4+ once sRGB-encoded, which the target now holds), sunlit
         grass and sand stay under ~1.15. At the old threshold they bloomed too, which bled their colour over the whole
         island. Kept subtle on purpose. */
      const settings = hdr ? { threshold: 1.22, knee: 0.12, strength: 0.2, gain: 0 } : { threshold: 0.97, knee: 0, strength: 0.2, gain: 1.5 };
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

  const cloudMap = makeCloudMap(renderer, coarse ? 256 : 512);

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
  /* Keep depth bias at zero too; the negative offset reintroduced visible shadow detachment. */
  sun.shadow.bias = 0;
  /* Normal bias offsets each receiver along its normal and visibly lifts shadows off feet and prop bases. */
  sun.shadow.normalBias = 0;
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

  const bot = buildRobot();
  const robot = bot.robot;
  /* Rigel crash-lands on the beach by the dock, the start of the island */
  const landing = island.spot("landing");
  robot.position.copy(landing);
  robot.rotation.y = Math.PI / 4;

  /* Training dummy on the spawn court, in front of the camera and facing Niko.
     iltaen's Sketchfab dummy has downloads disabled, so this is an original prop in that role:
     helm, mail, sword, shield, and a wooden stand. */
  const dummyAt = landing.clone();
  dummyAt.x -= Math.SQRT1_2 * 3.2;
  dummyAt.z -= Math.SQRT1_2 * 3.2;
  dummyAt.y = island.groundAt(dummyAt.x, dummyAt.z);
  const dummy = new THREE.Group();
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
  const dummyRing = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.74, 28),
    new THREE.MeshBasicMaterial({ color: "#ffc93c", transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
  );
  dummyRing.rotation.x = -Math.PI / 2;
  dummyRing.position.y = 0.05;
  dummyRing.visible = false;
  dummy.add(dummyRing);
  const dummyFocus = new THREE.Vector3(dummyAt.x, dummyAt.y + 1.45, dummyAt.z);

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
      new THREE.MeshBasicMaterial({ color: "#ffc93c", transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }),
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
        if (introLive || !object.children.length) return;
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
  const swordPickup = makeSwordPickup({
    model: xiphosGlb,
    name: "Xiphos",
    size: 1.15,
    handName: "RightHand",
    offset: [-Math.SQRT1_2 * 1.2, Math.SQRT1_2 * 2.8],
  });
  const longswordPickup = makeSwordPickup({
    model: longswordGlb,
    name: "Longsword",
    size: 0.97,
    handName: "LeftHand",
    offset: [Math.SQRT1_2 * 1.3, -Math.SQRT1_2 * 1.3],
  });
  let lockTarget = null;
  let lockLost = 0;
  let lockSpeed = 0;
  let lockPhase = 0;
  let lockAngle = 0;
  let lockMag = 0;
  let lockBackYaw = 0;
  const lockDir = { x: 0, y: 0 };
  const LOCK_REACH = 18;
  const LOCK_PAD = 0.08;
  const LOCK_YAW_SKIP = THREE.MathUtils.degToRad(18);
  const viewPoint = new THREE.Vector3();
  const playerChest = new THREE.Vector3();
  const savedCamPos = new THREE.Vector3();
  const savedCamQuat = new THREE.Quaternion();
  const trialAnchor = new THREE.Vector3();
  /* 0–1 across the screen. The padded edge is the Pixel Pass safe viewport. */
  const inCamera = (world) => {
    viewPoint.copy(world).project(camera);
    if (!Number.isFinite(viewPoint.z) || viewPoint.z < -1 || viewPoint.z > 1) return false;
    const x = (viewPoint.x + 1) / 2;
    const y = (viewPoint.y + 1) / 2;
    return x >= LOCK_PAD && x <= 1 - LOCK_PAD && y >= LOCK_PAD && y <= 1 - LOCK_PAD;
  };
  colliders.push({ x: dummyAt.x, z: dummyAt.z, r: 0.45 });
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
    const curvesClip = (entry) => {
      const tracks = [];
      for (const bone of entry.bones) {
        const nodeName = sourceName[bone.name];
        if (!nodeName) continue;
        const flat = bone.q;
        /* Unity writes these arm binds as (x, -y, -z, w) relative to this FBX. Played raw, each wrist crosses to the other side and the hand meshes swap on the way back to idle. */
        const values = /Shoulder|Arm|Hand/.test(bone.name)
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
    for (const [name, source] of [["idle", idleSource], ["run", parseFbx(nikoRunFbx)]]) {
      actions[name] = mixer.clipAction(retargeted(name, source));
      actions[name].play();
      actions[name].setEffectiveWeight(name === "idle" ? 1 : 0);
    }
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
      idleSource.animations = [curvesClip(entry)];
      const action = mixer.clipAction(retargeted(entry.name, idleSource));
      action.play();
      action.setEffectiveWeight(0);
      action.setEffectiveTimeScale(0);
      lockMoves.push({ name: entry.name, gait: entry.gait, x: entry.x, y: entry.y, action });
    }
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
  const faceRight = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const posedQ = new THREE.Quaternion();
  const keyA = new THREE.Quaternion();
  const keyB = new THREE.Quaternion();
  const sampleTrack = (track, time, out) => {
    const times = track.times;
    const values = track.values;
    const last = times.length - 1;
    const span = times[last] || 1;
    let t = time % span;
    if (t < 0) t += span;
    let index = 0;
    while (index < last && times[index + 1] <= t) index += 1;
    if (index >= last) {
      const offset = last * 4;
      out.set(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
      return;
    }
    const gap = times[index + 1] - times[index];
    const u = gap > 1e-8 ? (t - times[index]) / gap : 0;
    const a = index * 4;
    const b = a + 4;
    keyA.set(values[a], values[a + 1], values[a + 2], values[a + 3]);
    keyB.set(values[b], values[b + 1], values[b + 2], values[b + 3]);
    out.copy(keyA).slerp(keyB, u);
  };
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
  let orbitDrag = null;
  const cursor = { x: 0.5, y: 0.5, on: false };

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

  /* Zoom: the wheel and pinches move a goal that the camera eases toward; the intro tweens the camera itself.
     Play stays inside 0.7–1.7. A debug zoom can pull further back (down to 0.25) and the wheel keeps that wider range until it is released. */
  const ZOOM_MIN = 0.7;
  const ZOOM_MAX = 1.7;
  const DEBUG_ZOOM_MIN = 0.25;
  const DEBUG_ZOOM_MAX = 8;
  let zoomGoal = null;
  let zoomHold = false;
  const zoomBy = (factor, now = false) => {
    const min = zoomHold ? DEBUG_ZOOM_MIN : ZOOM_MIN;
    const max = zoomHold ? DEBUG_ZOOM_MAX : ZOOM_MAX;
    zoomGoal = THREE.MathUtils.clamp((zoomGoal ?? camera.zoom) * factor, min, max);
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

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const rect = host.getBoundingClientRect();
    cursor.x = (event.clientX - rect.left) / Math.max(1, rect.width);
    cursor.y = (event.clientY - rect.top) / Math.max(1, rect.height);
    cursor.on = event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
  });
  window.addEventListener("pointerout", (event) => {
    if (!event.relatedTarget) cursor.on = false;
  });
  window.addEventListener("blur", () => {
    cursor.on = false;
  });

  /* Middle-click or G: a hit on the dummy locks on, a miss clears it. Same rule as Pixel Pass. */
  const tryLock = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    lockTarget = raycaster.intersectObject(dummy, true).length ? dummy : null;
    lockLost = 0;
    return Boolean(lockTarget);
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button === 1) {
      event.preventDefault();
      if (!introLive) tryLock(event.clientX, event.clientY);
      return;
    }
    if (event.button === 2) {
      if (event.pointerType === "mouse" && !introLive) {
        orbitDrag = { id: event.pointerId, x: event.clientX };
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {
          /* The pointer is already gone. The drag still tracks from the move events. */
        }
      }
      return;
    }
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
    if (orbitDrag && event.pointerId === orbitDrag.id) {
      const dx = event.clientX - orbitDrag.x;
      orbitDrag.x = event.clientX;
      camYawGoal -= dx * 0.12 * (Math.PI / 180);
      return;
    }
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
    if (orbitDrag && event.pointerId === orbitDrag.id) orbitDrag = null;
    if (lift(event)) return;
    if (press && event.pointerId !== press.id) return;
    press = null;
    releaseStick();
  };
  canvas.addEventListener("pointercancel", dropPress);
  canvas.addEventListener("lostpointercapture", dropPress);

  canvas.addEventListener("pointerup", (event) => {
    if (orbitDrag && event.pointerId === orbitDrag.id) {
      orbitDrag = null;
      return;
    }
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

    if (key === "g") {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = cursor.on ? rect.left + cursor.x * rect.width : rect.left + rect.width / 2;
      const y = cursor.on ? rect.top + cursor.y * rect.height : rect.top + rect.height / 2;
      tryLock(x, y);
    } else if (moveKeys[key] && (idle || !key.startsWith("arrow"))) {
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

  /* Screen-space input maps onto the floor along the camera's yaw. W walks the way the camera looks. */
  const screenUp = new THREE.Vector3();
  const screenRight = new THREE.Vector3();
  const steer = new THREE.Vector3();
  const dampAngle = (current, target, lambda, dt) => {
    const t = 1 - Math.exp(-Math.max(0.01, lambda) * dt);
    const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    return current + delta * t;
  };
  const applyCamAxes = () => {
    const back = Math.cos(camPitch) * CAM_REACH;
    const height = Math.sin(camPitch) * CAM_REACH;
    camOffset.set(Math.sin(camYaw) * back, height, Math.cos(camYaw) * back);
    screenUp.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    screenRight.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
  };
  applyCamAxes();

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
  const faceViewAt = new THREE.Vector3();
  const offTarget = new THREE.Vector3();
  const tiltOf = () => Math.sin(camPitch);
  const screenShift = new THREE.Vector3();
  const screenShiftGoal = new THREE.Vector3();
  const viewAnchor = new THREE.Vector3();

  /* The camera prefers to show the floor, but never lets the robot drift out of the middle of
     the screen. Narrow phone views need this most. */
  const keepInFrame = (target) => {
    const reachX = ((camera.right - camera.left) / 2 / camera.zoom) * 0.35;
    const reachY = (viewHeight / 2 / camera.zoom) * 0.35;

    const tilt = tiltOf();
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
    if (lockTarget) {
      const dx = dummyFocus.x - robot.position.x;
      const dz = dummyFocus.z - robot.position.z;
      const reach = dx * dx + dz * dz;
      const far = reach > LOCK_REACH * LOCK_REACH;
      if (reach > 0.0001) camYawGoal = Math.atan2(dx, dz) + Math.PI;
      /* While the yaw is still catching up, an off-screen dummy is not out of bounds yet. */
      const yawGap = Math.abs(Math.atan2(Math.sin(camYawGoal - camYaw), Math.cos(camYawGoal - camYaw)));
      playerChest.set(robot.position.x, robot.position.y + 1.2, robot.position.z);
      const outside = !far && yawGap <= LOCK_YAW_SKIP && (!inCamera(playerChest) || !inCamera(dummyFocus));
      if (far || outside) {
        lockLost += dt;
        if (lockLost >= 0.2) lockTarget = null;
      } else {
        lockLost = 0;
      }
    }
    dummyRing.visible = Boolean(lockTarget);
    if (!introLive) {
      camYaw = dampAngle(camYaw, camYawGoal, lockTarget ? 10 : 14, dt);
    }
    applyCamAxes();
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

    /* Standing still, he turns three-quarters toward the camera and looks up, so his face reads from above */
    state.still = moving ? 0 : state.still + dt;
    const faceCam = !lockTarget && bot.mixer && robot.visible && state.still > 0.9 && !state.path.length && !root.classList.contains("world-intro");
    if (lockTarget && !introLive) {
      /* Same turn as Pixel Pass: a yaw quaternion toward the dummy, then rotate towards it at 720°/s.
         This three build has slerp but not Quaternion.rotateTowards, so the step is applied here. */
      const dx = dummyFocus.x - robot.position.x;
      const dz = dummyFocus.z - robot.position.z;
      if (dx * dx + dz * dz > 0.0001) {
        /* Yaw-only quaternion step. A raw slerp is unstable when the turn is exactly 180°, which is the spawn facing. */
        const targetYaw = Math.atan2(dx, dz);
        let delta = Math.atan2(Math.sin(targetYaw - robot.rotation.y), Math.cos(targetYaw - robot.rotation.y));
        if (Math.abs(delta) > Math.PI - 0.001) delta = (delta < 0 ? -1 : 1) * (Math.PI - 0.001);
        const step = THREE.MathUtils.degToRad(720) * dt;
        const yaw = Math.abs(delta) <= step ? targetYaw : robot.rotation.y + Math.sign(delta) * step;
        /* The euler holds the yaw. Writing the quaternion gets folded back past ±90° by three's XYZ sync. */
        robot.rotation.y = yaw;
      }
      state.yaw = robot.rotation.y;
    } else if (state.holdYaw != null) state.yaw = Math.atan2(camOffset.x, camOffset.z) + state.holdYaw;
    else if (faceCam) {
      const camYaw = Math.atan2(camOffset.x, camOffset.z);
      let rel = state.yaw - camYaw;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      state.yaw = camYaw + THREE.MathUtils.clamp(rel, -0.4, 0.4);
    }
    state.faceUp = THREE.MathUtils.damp(state.faceUp, faceCam ? 1 : 0, 3, dt);
    if (!(lockTarget && !introLive)) {
      let turn = state.yaw - robot.rotation.y;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      robot.rotation.y += turn * Math.min(1, dt * (faceCam ? 4 : 12));
    }

    if (bot.mixer) {
      /* Free roam is idle against run. Lock-on plays the run directions in Niko's facing frame. */
      const { actions } = bot;
      const locked = lockTarget && bot.lockMoves;
      if (locked) {
        const face = robot.rotation.y;
        /* Same lateral sign as the movement. Negating it played the strafe that steps the other way. */
        const localX = input.x * Math.cos(face) + input.z * -Math.sin(face);
        const localZ = input.x * Math.sin(face) + input.z * Math.cos(face);
        const moving = localX * localX + localZ * localZ > 0.001;
        let aimX = 0;
        let aimY = 1;
        let aim = lockAngle;
        if (moving) aim = Math.atan2(localX, localZ);
        aimX = Math.sin(aim);
        aimY = Math.cos(aim);
        const turn = Math.atan2(Math.sin(aim - lockAngle), Math.cos(aim - lockAngle));
        /* Magnitude stays up while a direction is held, so a clip is always playing. Idle takes whatever is left. */
        lockMag = THREE.MathUtils.damp(lockMag, moving ? 1 : 0, moving ? 10 : 6, dt);
        /* A left-right flip is 180°. Sweeping the circle plays every clip in between. Jump the aim and let the clip weights crossfade. */
        if (moving && Math.abs(turn) > 1.8) lockAngle = aim;
        else if (moving) lockAngle += turn * (1 - Math.exp(-14 * dt));
        const sx = Math.sin(lockAngle);
        const sy = Math.cos(lockAngle);
        lockDir.x = sx * lockMag;
        lockDir.y = sy * lockMag;
        /* Lock-on plays the run set. The walk clips stay at weight 0. */
        const starting = moving && lockMag < 0.05;
        const targetSpeed = moving ? 0.5 : 0;
        if (starting) {
          let lead = null;
          let leadDot = -1;
          for (const move of bot.lockMoves) {
            if (move.gait !== "run") continue;
            const align = move.x * aimX + move.y * aimY;
            if (align > leadDot) {
              leadDot = align;
              lead = move;
            }
          }
          if (lead) {
            const clip = lead.action.getClip();
            const names = ["LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand"];
            let bestU = 0;
            let best = -1;
            for (let step = 0; step < 12; step += 1) {
              const u = step / 12;
              let total = 0;
              let count = 0;
              for (const name of names) {
                const track = clip.tracks.find((item) => item.name === `${name}.quaternion`);
                const bone = bot.bones[name];
                if (!track || !bone) continue;
                const times = track.times;
                const values = track.values;
                const last = times.length - 1;
                const time = u * times[last];
                let index = 0;
                while (index < last && times[index + 1] < time) index += 1;
                const next = Math.min(index + 1, last);
                const pick = next !== index && time - times[index] > times[next] - time ? next : index;
                const offset = pick * 4;
                let dot = values[offset] * bone.quaternion.x + values[offset + 1] * bone.quaternion.y + values[offset + 2] * bone.quaternion.z + values[offset + 3] * bone.quaternion.w;
                if (dot < 0) dot = -dot;
                total += dot;
                count += 1;
              }
              const score = count ? total / count : 0;
              if (score > best) {
                best = score;
                bestU = u;
              }
            }
            lockPhase = bestU;
          }
        }
        lockSpeed = THREE.MathUtils.damp(lockSpeed, targetSpeed, 5, dt);
        const runT = lockMag;
        actions.run.setEffectiveWeight(0);
        /* 0.7s run cycle at its authored speed. */
        if (!starting && lockSpeed > 0.04) lockPhase = (lockPhase + dt * 1.45) % 1;
        /* Only the two clips on either side of the stick. A dot-product blend also mixed in the
           opposite diagonal, so forward played the walk plus both jog diagonals at once. */
        const sectorWeights = (group) => {
          const weights = group.map(() => 0);
          if (Math.hypot(lockDir.x, lockDir.y) < 0.02 || group.length === 0) return weights;
          const angle = Math.atan2(lockDir.x, lockDir.y);
          const samples = group.map((move, index) => ({ index, angle: Math.atan2(move.x, move.y) })).sort((a, b) => a.angle - b.angle);
          const count = samples.length;
          if (count === 1) {
            weights[samples[0].index] = 1;
            return weights;
          }
          for (let i = 0; i < count; i += 1) {
            const a0 = samples[i].angle;
            let span = samples[(i + 1) % count].angle - a0;
            if (span <= 0) span += Math.PI * 2;
            let rel = Math.atan2(Math.sin(angle - a0), Math.cos(angle - a0));
            if (rel < 0) rel += Math.PI * 2;
            if (rel <= span + 1e-4) {
              const t = span < 1e-4 ? 0 : Math.min(1, rel / span);
              weights[samples[i].index] = 1 - t;
              weights[samples[(i + 1) % count].index] += t;
              break;
            }
          }
          return weights;
        };
        let posed = 0;
        let backGoal = 0;
        for (const gait of ["walk", "run"]) {
          const group = bot.lockMoves.filter((move) => move.gait === gait);
          const weights = gait === "run" ? sectorWeights(group) : group.map(() => 0);
          if (gait === "run" && Math.hypot(lockDir.x, lockDir.y) > 0.05) {
            const aim = Math.atan2(lockDir.x, lockDir.y);
            const fromBack = Math.atan2(Math.sin(aim - Math.PI), Math.cos(aim - Math.PI));
            const absBack = Math.abs(fromBack);
            const outer = Math.PI / 3;
            /* Diagonal backward movement uses the backward clip, with the hips turned into the strafe. */
            if (absBack < outer) {
              const back = group.findIndex((move) => move.name === "runB");
              const edge = 0.12;
              const u = absBack <= outer - edge ? 1 : (outer - absBack) / edge;
              const smooth = u * u * (3 - 2 * u);
              if (back >= 0 && smooth > 0) {
                for (let i = 0; i < weights.length; i += 1) weights[i] *= 1 - smooth;
                weights[back] += smooth;
                backGoal = fromBack * smooth;
              }
            }
          }
          const gaitWeight = gait === "run" ? runT : 0;
          group.forEach((move, index) => {
            const weight = THREE.MathUtils.damp(move.action.getEffectiveWeight(), weights[index] * gaitWeight, 8, dt);
            move.action.setEffectiveWeight(weight);
            move.action.setEffectiveTimeScale(0);
            move.action.time = lockPhase * move.action.getClip().duration;
            posed += weight;
          });
        }
        lockBackYaw = THREE.MathUtils.damp(lockBackYaw, backGoal, 8, dt);
        /* Whatever the run clips don't cover stays on idle. A gap here is the bind pose. */
        actions.idle.setEffectiveWeight(Math.max(0, 1 - posed));
      } else {
        actions.idle.setEffectiveWeight(1 - state.walk);
        actions.run.setEffectiveWeight(state.walk);
        actions.run.setEffectiveTimeScale(1.2 * state.pace);
        bot.lockMoves?.forEach((move) => move.action.setEffectiveWeight(0));
        lockSpeed = 0;
        lockMag = 0;
        lockBackYaw = 0;
      }
      bot.mixer.update(calm ? 0 : dt);
      /* The mixer averages quaternion components. Shoulders are converted above so the wrists stay on their own sides; this still takes the short arc for the arms on the way back to idle. */
      if (lockTarget && bot.idleQuats) {
        const idleWeight = actions.idle.getEffectiveWeight();
        let sources = idleWeight > 0.02 ? 1 : 0;
        for (const move of bot.lockMoves) {
          if (move.gait === "run" && move.action.getEffectiveWeight() > 0.02) sources += 1;
        }
        const armNames = sources > 1
          ? Object.keys(bot.idleQuats).filter((name) => /Hand|Arm|Shoulder/.test(name) && bot.bones[name])
          : [];
        for (const name of armNames) {
          let sx = 0;
          let sy = 0;
          let sz = 0;
          let sw = 0;
          let fx = 0;
          let fy = 0;
          let fz = 0;
          let fw = 1;
          let has = false;
          const add = (q, weight) => {
            if (!(weight > 0.0001)) return;
            let x = q.x;
            let y = q.y;
            let z = q.z;
            let w = q.w;
            if (!has) {
              fx = x;
              fy = y;
              fz = z;
              fw = w;
              has = true;
            } else if (x * fx + y * fy + z * fz + w * fw < 0) {
              x = -x;
              y = -y;
              z = -z;
              w = -w;
            }
            sx += x * weight;
            sy += y * weight;
            sz += z * weight;
            sw += w * weight;
          };
          sampleTrack(bot.idleQuats[name], actions.idle.time, posedQ);
          add(posedQ, idleWeight);
          for (const move of bot.lockMoves) {
            if (move.gait !== "run") continue;
            const weight = move.action.getEffectiveWeight();
            const track = move.quats?.[name];
            if (!track || !(weight > 0.0001)) continue;
            sampleTrack(track, move.action.time, posedQ);
            add(posedQ, weight);
          }
          const len = Math.hypot(sx, sy, sz, sw);
          if (len > 0.25) bot.bones[name].quaternion.set(sx / len, sy / len, sz / len, sw / len);
        }
      }
      /* Diagonal backward: turn the hips into the backward run while keeping the chest on the target. */
      if (lockTarget && Math.abs(lockBackYaw) > 0.02 && bot.bones?.Hips && bot.bones?.Spine2) {
        const yawWorld = (bone, radians) => {
          const parent = bone.parent;
          if (!parent) return;
          bone.updateWorldMatrix(true, false);
          const world = bone.getWorldQuaternion(posedQ);
          keyA.setFromAxisAngle(worldUp, radians);
          world.premultiply(keyA);
          parent.getWorldQuaternion(keyB);
          bone.quaternion.copy(keyB.invert()).multiply(world);
        };
        yawWorld(bot.bones.Hips, lockBackYaw);
        yawWorld(bot.bones.Spine2, -lockBackYaw);
      }
      /* Standing still, pitch the chest and head up toward the camera. Mixamo's local axes are not the old rig's, so this is a world-axis pitch around his right. */
      if (state.faceUp > 0.01 && bot.bones.Head && bot.model) {
        bot.model.updateWorldMatrix(true, false);
        const e = bot.model.matrixWorld.elements;
        faceRight.set(e[8], e[9], e[10]).normalize();
        const pitchWorld = (bone, radians) => {
          const parent = bone.parent;
          if (!parent) return;
          bone.updateWorldMatrix(true, false);
          const world = bone.getWorldQuaternion(posedQ);
          keyA.setFromAxisAngle(faceRight, radians);
          world.premultiply(keyA);
          parent.getWorldQuaternion(keyB);
          bone.quaternion.copy(keyB.invert()).multiply(world);
        };
        const lift = state.faceUp;
        if (bot.bones.Spine2) pitchWorld(bot.bones.Spine2, lift * 0.1);
        if (bot.bones.Neck) pitchWorld(bot.bones.Neck, lift * 0.16);
        pitchWorld(bot.bones.Head, lift * 0.34);
      }
    } else {
      bot.head.rotation.x = state.faceUp * 0.2;
    }

    /* The flip turns around the waist, not the feet */
    state.hop = Math.min(1, state.hop + dt / 0.38);
    const hop = state.hop < 1 ? Math.sin(state.hop * Math.PI) * 0.45 : 0;
    const waist = bot.waist;
    bot.body.position.y = hop + pose.lift - pose.crouch * 0.16 * bot.grow + waist * (1 - Math.cos(pose.flip));
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

    swordPickup.update(dt, time);
    longswordPickup.update(dt, time);

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
    if (lockTarget) lookTarget.lerpVectors(lookTarget, dummyFocus, 0.5);
    keepInFrame(lookTarget);
    const speed = dt > 0 ? travelled.length() / dt : 0;
    const follow = THREE.MathUtils.lerp(6, 18, THREE.MathUtils.clamp(speed / 8, 0, 1));
    if (calm || !started) {
      camLook.copy(lookTarget);
      screenShift.set(0, 0, 0);
    } else {
      camLook.x = THREE.MathUtils.damp(camLook.x, lookTarget.x, follow, dt);
      camLook.y = THREE.MathUtils.damp(camLook.y, lookTarget.y, follow, dt);
      camLook.z = THREE.MathUtils.damp(camLook.z, lookTarget.z, follow, dt);
      screenShiftGoal.set(0, 0, 0);
      if (cursor.on && !introLive && state.faceView == null) {
        const halfW = (camera.right - camera.left) / 2 / Math.max(0.001, camera.zoom);
        const halfH = viewHeight / 2 / Math.max(0.001, camera.zoom);
        const biasX = THREE.MathUtils.clamp((cursor.x - 0.5) * 2, -1, 1);
        const biasY = THREE.MathUtils.clamp((0.5 - cursor.y) * 2, -1, 1);
        const lookStrength = lockTarget ? 0.35 : 1;
        screenShiftGoal.addScaledVector(screenRight, biasX * 0.7 * halfW * lookStrength);
        screenShiftGoal.addScaledVector(screenUp, biasY * 1.1 * halfH * lookStrength);
        /* Lock-on look cannot shove Niko or the dummy past the padded screen edge. */
        if (lockTarget && screenShiftGoal.lengthSq() > 0.0001) {
          const fits = (scale) => {
            savedCamPos.copy(camera.position);
            savedCamQuat.copy(camera.quaternion);
            trialAnchor.copy(lookTarget).addScaledVector(screenShiftGoal, scale);
            camera.position.copy(trialAnchor).add(camOffset);
            camera.lookAt(trialAnchor);
            camera.updateMatrixWorld();
            playerChest.set(robot.position.x, robot.position.y + 1.2, robot.position.z);
            const safe = inCamera(playerChest) && inCamera(dummyFocus);
            camera.position.copy(savedCamPos);
            camera.quaternion.copy(savedCamQuat);
            camera.updateMatrixWorld();
            return safe;
          };
          if (!fits(1)) {
            let low = 0;
            let high = 1;
            for (let i = 0; i < 6; i += 1) {
              const mid = (low + high) / 2;
              if (fits(mid)) low = mid;
              else high = mid;
            }
            screenShiftGoal.multiplyScalar(low);
          }
        }
      }
      screenShift.x = THREE.MathUtils.damp(screenShift.x, screenShiftGoal.x, 15, dt);
      screenShift.y = THREE.MathUtils.damp(screenShift.y, screenShiftGoal.y, 15, dt);
      screenShift.z = THREE.MathUtils.damp(screenShift.z, screenShiftGoal.z, 15, dt);
    }
    viewAnchor.copy(camLook).add(screenShift);
    camera.position.copy(viewAnchor).add(camOffset);
    camera.lookAt(viewAnchor);
    if (state.faceView != null && bot.head) {
      /* Review only: a level camera on his face, faceView radians around from the front (0 = like the reference render) */
      const around = robot.rotation.y + state.faceView;
      bot.head.getWorldPosition(faceViewAt);
      faceViewAt.y += 0.1;
      camera.position.set(faceViewAt.x + Math.sin(around) * 4, faceViewAt.y, faceViewAt.z + Math.cos(around) * 4);
      camera.lookAt(faceViewAt);
      /* The game frustum is off-centre; slide the camera so the face lands mid-screen */
      camera.updateMatrixWorld();
      const ndc = faceViewAt.clone().project(camera);
      camera.translateX((ndc.x * (camera.right - camera.left)) / 2 / camera.zoom);
      camera.translateY((ndc.y * (camera.top - camera.bottom)) / 2 / camera.zoom);
    }
    camera.updateMatrixWorld();
    fitShadow();
    /* Cloud shadows for this frame, on the cloud plane above the view (shifted along the sun, as cloudAt3 reads it) */
    {
      const lift = 18 - camLook.y;
      cloudMap.update(camLook.x + cloudSun.value.x * lift, camLook.z + cloudSun.value.y * lift, Math.min(150, shadowFit.reach + cloudSun.value.length() * 24 + 8));
    }
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
    island.update(dt, calm ? 0 : time, robot.visible ? robot.position : null, renderer, rain?.hits, camera);
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
    /* Below 1x is only a stopgap: when frames have plenty of room again (a busy moment passed), climb back toward 1x.
       One step up costs ~1.4x the pixels, so 14 ms lands well under the 34 ms that would step it down again. */
    if (average < 14 && quality.ratio < 1) {
      setRatio(Math.min(1, quality.ratio + 0.15));
      return;
    }
    if (average <= 22) return;
    /* MSAA on the offscreen target goes first (resolving it costs more than the scene), then bloom (halos take over
       the glow), then resolution in quarter steps down to 1x. Far too slow (a weak GPU on a large screen) takes all
       of that at once. */
    if (average > 60) {
      post.set({ msaa: false, bloom: false });
      if (quality.ratio > 1) setRatio(Math.max(1, quality.ratio - 0.5));
      else if (quality.ratio > MIN_RATIO) setRatio(Math.max(MIN_RATIO, quality.ratio - 0.2));
    } else if (post.state.bloom && post.state.msaa) post.set({ msaa: false });
    else if (post.state.bloom) post.set({ bloom: false });
    else if (quality.ratio > 1) setRatio(Math.max(1, quality.ratio - 0.25));
    /* Still under ~30 fps at 1x: keep going below 1x. Softer, but playable instead of a slideshow; machines that
       manage 30 fps never get here */
    else if (average > 34 && quality.ratio > MIN_RATIO) setRatio(Math.max(MIN_RATIO, quality.ratio - 0.15));
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
      `reduced motion ${calm ? "ON" : "off"}  coarse ${coarse}  software ${software}`,
      diag.gpu,
    ].join("\n");
  };

  renderer.setAnimationLoop((now) => {
    /* The frame timestamp can trail performance.now() (settle resets `last` with it), so never step backward */
    const raw = Math.max(0, now - last) / 1000;
    const dt = Math.min(raw, 0.05);
    if (diag) showDiag(now, raw * 1000);
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
    /* Real frame time (dt is capped for the simulation); one-off hitches over 250 ms don't count */
    adaptQuality(Math.min(raw, 0.25));
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

    gsap.fromTo(impactLight, { intensity: 35 }, { intensity: 0, duration: 0.8, ease: "power2.out" });
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
      renderer: () => renderer,
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
      /* Debug camera only. zoom(0.4) pulls back past the play limit (0.7) so more of Niko is in frame.
         The wheel then stays in 0.25–8 until zoom(null) hands it back to play. zoom() reads the current value. */
      zoom: (z) => {
        gsap.killTweensOf(camera);
        if (z === undefined) return +camera.zoom.toFixed(3);
        if (z === null) {
          zoomHold = false;
          zoomGoal = THREE.MathUtils.clamp(camera.zoom, ZOOM_MIN, ZOOM_MAX);
          return +zoomGoal.toFixed(3);
        }
        zoomHold = z < ZOOM_MIN || z > ZOOM_MAX;
        zoomGoal = null;
        camera.zoom = z;
        camera.updateProjectionMatrix();
        return +camera.zoom.toFixed(3);
      },
      finishIntro: () => void finishIntro(),
      /* Level camera on Niko's face, `angle` radians around from the front, for comparing with the reference; null releases it */
      faceView: (angle = 0) => void (state.faceView = angle),
      /* Move the painted eyes live: eyes({ gap, width, height, raise }) in reference pixels (see EYE_FIT); returns the current fit */
      eyes: (fit) => {
        if (fit) {
          Object.assign(EYE_FIT, fit);
          bot.model?.traverse((node) => node.userData.refit?.());
        }
        return { ...EYE_FIT };
      },
      /* Move the hair live: hair({ scale, x, y, z }) — see HAIR_FIT. x is toward the nose, y is up, z is toward his right. */
      hair: (fit) => {
        if (fit) Object.assign(HAIR_FIT, fit);
        return applyHairFit();
      },
      /* climate({ hour, weather, instant }) — weather rolls in unless instant; climate() reads the live env */
      climate: (opts) => (opts == null ? climate.sample() : climate.set(opts)),
      /* Freeze clouds and water at time t (null to release) so screenshots differ only by wind */
      pinMotion: (t = null) => void (island.motion.pinned = t),
      wind: () => wind?.peek(),
      walkable: (x, z) => island.nav.walkable(x, z),
      position: () => robot.position.toArray(),
      /* Orbit yaw (radians). Omit it to read the live yaw. */
      yaw: (angle) => {
        if (angle == null) return camYaw;
        camYaw = camYawGoal = angle;
        applyCamAxes();
        return camYaw;
      },
      /* Screen point of the training dummy's chest, and lock-on. target(x, y) aims there; target() reads whether it is locked. */
      dummyScreen: () => {
        const p = dummyFocus.clone().project(camera);
        const box = renderer.domElement.getBoundingClientRect();
        return { x: box.left + ((p.x + 1) / 2) * box.width, y: box.top + ((1 - p.y) / 2) * box.height };
      },
      target: (x, y) => (x == null ? Boolean(lockTarget) : tryLock(x, y)),
      /* Read either sword's placement, or pass true to equip it immediately. */
      sword: (give) => swordPickup.debug(give),
      longsword: (give) => longswordPickup.debug(give),
      /* Live lock-on clip weights, so a direction can be checked without guessing from the pose. */
      lockClips: () => bot.lockMoves?.map((move) => ({ name: move.name, gait: move.gait, weight: +move.action.getEffectiveWeight().toFixed(3) })) ?? [],
      /* Look-down angle in degrees. angle(30) is shallower, angle(60) is steeper. Omit it to read the live angle.
         He stays in the centre. ?angle= sets the same value on load. */
      angle: (degrees) => {
        if (degrees == null) return +THREE.MathUtils.radToDeg(camPitch).toFixed(2);
        camPitch = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(degrees), 0.18, 1.4);
        applyCamAxes();
        return +THREE.MathUtils.radToDeg(camPitch).toFixed(2);
      },
      route: () => state.path.map((p) => p.toArray().map((n) => +n.toFixed(2))),
      bakeShadows: () => bakeShadows(),
    },
  };
}
