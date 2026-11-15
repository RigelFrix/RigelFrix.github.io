/* Play world: thin orchestrator wiring modular subsystems (camera, post/lighting, climate/island, stops/props, Niko, locomotion, input, intro).
   Objects come from world-data.js; the panels they open live in index.html and script.js. */

import * as THREE from "three";
import { atmos, buildIsland, CLOUD_GLSL, CLOUD_SHADE, cloudCover, cloudLightStyle, cloudShade, cloudSun, cloudTime, cloudUniforms, ISLE, lampGain, lamped, makeCloudMap, makeRamp, waterLight, occlude, seeThrough, rainAmt, windMul, windTime, weatherFog, weatherFogColor, weatherWet } from "./world-island.js";
import { lay, toXZ } from "./world-map.js";
import { windLines } from "./world-wind.js";
import { createClimate } from "./world-climate.js";
import { makeRain } from "./world-rain.js";
import { makeRays } from "./world-rays.js";
import { createSmearHandler } from "./world-smear.js";
import { createFootDust } from "./world-foot-dust.js";
import { createWindTear } from "./world-wind-tear.js";
import { createNikoHitboxes } from "./world-niko-hitboxes.js";
import { buildDevMap } from "./world-dev-map.js";
import { createPlayLog } from "./world-play-log.js";
import { createCamera } from "./world-camera.js";
import { createPost } from "./world-post.js";
import { createStops } from "./world-stops.js";
import { createNiko } from "./world-niko.js";
import { createLoco } from "./world-loco.js";
import { createInput } from "./world-input.js";
import { createBootField, createIntro } from "./world-intro.js";

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
  const devParam = new URLSearchParams(location.search);
  const isDevMap = devParam.get("map") === "dev" || devParam.get("dev") === "1" || devParam.has("dev") || devParam.has("devmap");
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

  const canvas = document.getElementById("world-canvas");
  const labelsEl = document.getElementById("world-labels");
  const prompt = document.getElementById("world-prompt");
  const promptOpen = document.getElementById("world-prompt-open");
  const promptLabel = document.getElementById("world-prompt-label");
  const promptLink = document.getElementById("world-prompt-link");
  const promptLinkLabel = document.getElementById("world-prompt-link-label");
  const hudEl = document.querySelector(".hud");
  const boot = host.querySelector(".world-boot");
  const flash = host.querySelector(".world-flash");
  root.classList.add("world-intro");
  const field = createBootField({ boot, root, calm });

  await Promise.race([
    document.fonts?.load('900 64px "Big Shoulders Display"') ?? Promise.resolve(),
    new Promise((resolve) => window.setTimeout(resolve, 1500)),
  ]);

  /* Renderer, scene, camera */

  /* The sky is CSS behind a transparent canvas, so the intro can fade it from night to dusk.
     stencil: Niko's eyes are masked to his face, also when frames go straight to the screen. */
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

  /* 5x5 hardware-filtered tent PCF + sRGB transfer OETF matching world-post.js */
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
  THREE.ShaderChunk.colorspace_fragment = "gl_FragColor = sRGBTransferOETF( vec4( max( gl_FragColor.rgb, 0.0 ), gl_FragColor.a ) );";

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 260);

  let introApi = null;
  let locoApi = null;
  let clock = 0;
  let started = false;

  const cameraApi = createCamera({
    camera,
    renderer,
    host,
    hudEl,
    getIntroLive: () => introApi?.isIntroLive() ?? false,
  });

  const postApi = createPost({
    renderer,
    scene,
    camera,
    host,
    camLook: cameraApi.camLook,
    coarse,
    lite,
    software,
    calm,
    MIN_RATIO,
    getIntroLive: () => introApi?.isIntroLive() ?? false,
    resize: cameraApi.resize,
  });

  const cloudMap = makeCloudMap(renderer, coarse ? 256 : 512);

  /* Shared shader hooks & lighting environment */
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

  /* Niko's light floor: his shading never drops below albedo * (amb + key on the side facing a soft light from the
     camera's upper left). */
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
    material.onBeforeCompile = (shader, rendererRef) => {
      previous?.(shader, rendererRef);
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

  /* Island, atmosphere & sky climate */
  const island = isDevMap
    ? buildDevMap({ scene, withRim, ramp, colliders: [] })
    : buildIsland({
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
  const wind = (calm || isDevMap) ? null : windLines({ scene, groundAt: island.groundAt, count: coarse ? 4 : 6 });
  const windPixels = new THREE.Vector2();
  const rain = (calm || lite || isDevMap) ? null : makeRain({ scene, lite: coarse });
  const rays = (calm || isDevMap) ? null : makeRays({ scene, groundAt: island.groundAt, sun: postApi.sun, shadowSize: postApi.SHADOW_SIZE, lite: lite || coarse });
  const rayTint = new THREE.Color();
  const VOLUME_BASE = 0.035;
  const VOLUME_RAYS = 0.5;

  const playsIntro = Boolean(gsap) && !calm && !isDevMap;
  const lights = { hemi: postApi.hemi, sun: postApi.sun, fill: postApi.fill, rim: postApi.rim };
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
  const setDawn = () => {
    climate.state.dawn = sky.dawn;
    climate.apply(climate.sample());
  };
  setDawn();
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
    postApi.placeSun(s.sunDir);
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

  /* World stops, props, combat helpers & Niko */
  const stopsApi = createStops({
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
    bakeShadows: postApi.bakeShadows,
    getHudBottom: cameraApi.getHudBottom,
    getIntroLive: () => introApi?.isIntroLive() ?? false,
    getClock: () => clock,
    getState: () => locoApi.state,
  });

  const nikoHitboxes = createNikoHitboxes({ scene, radius: 0.45 });
  if (devParam.get("hitbox") === "1" || devParam.has("hitbox")) nikoHitboxes.setDebug(true);
  const nikoSmear = createSmearHandler({
    weight: 6.8,
    noiseScale: 30.0,
    noisePower: 2.3,
    stretch: 1.65,
    sheenColor: "#ffe17d",
  });
  const footDust = createFootDust({ scene, camera });
  const windTear = createWindTear({ scene, camera });

  const landing = island.spot("landing");
  const nikoApi = createNiko({
    renderer,
    scene,
    ramp,
    charLight,
    withCharLight,
    lamped,
    withRim,
    toon: stopsApi.toon,
    glow: stopsApi.glow,
    box: stopsApi.box,
    part: stopsApi.part,
    flat: stopsApi.flat,
    halo: stopsApi.halo,
    landing,
    getNikoSmear: () => nikoSmear,
    getPunchHitbox: () => locoApi.punchHitbox,
  });
  const { bot, robot } = nikoApi;

  stopsApi.spawnEntities({
    landing,
    bot,
    robot,
    addShake: (amt) => introApi?.addShake(amt),
  });

  const overlayOpen = () => Boolean(window.Portfolio?.anyOpen?.());
  const playLogInput = { x: 0, z: 0 };
  const playLog = createPlayLog({
    host,
    getMeta: () => ({
      url: location.href,
      map: isDevMap ? "dev" : "island",
      view: "world",
      bundle: document.querySelector('script[src*="world.bundle.js"]')?.getAttribute("src") || "",
    }),
    getSnap: () => {
      const state = locoApi.state;
      return {
        keys: state.keys,
        speed: state.speedMeter,
        sprint: state.sprint,
        yaw: state.yaw,
        face: robot.rotation.y,
        moveDir: state.moveDir,
        input: playLogInput,
        bank: state.bank,
        turnLead: state.turnLead,
        chestTwist: state.chestTwist,
        pathOmega: state.pathOmega,
        travelDot: state.moveDir.x * playLogInput.x + state.moveDir.z * playLogInput.z,
        turning180: state.turning180,
        stopping: state.stopping,
        stopMirror: state.stopMirror,
        punching: state.punching,
        lock: Boolean(locoApi.getLockTarget()),
        moving: state.wasMoving,
        pos: robot.position,
        turn180Weight: state.turn180Weight,
        sprintWeight: bot.actions?.sprint?.getEffectiveWeight?.() ?? 0,
      };
    },
  });

  locoApi = createLoco({
    root,
    host,
    devParam,
    isDevMap,
    island,
    nikoHitboxes,
    nikoSmear,
    footDust,
    cameraApi,
    NIKO_SCALE: nikoApi.NIKO_SCALE,
    getBot: () => nikoApi.bot,
    getRobot: () => nikoApi.robot,
    getColliders: () => stopsApi.colliders,
    getDummy: () => stopsApi.dummy,
    getDummyFocus: () => stopsApi.dummyFocus,
    getDummyRing: () => stopsApi.dummyRing,
    getWerewolfBoss: () => stopsApi.werewolfBoss,
    pickLockTarget: stopsApi.pickLockTarget,
    getInputVector: () => inputVector(),
    getPlayLog: () => playLog,
    getPlayLogInput: () => playLogInput,
    getArrive: () => stopsApi.arrive,
    getIntroLive: () => introApi?.isIntroLive() ?? false,
    getStarted: () => started,
    getCalm: () => calm,
    getClock: () => clock,
  });

  const inputApi = createInput({
    host,
    canvas,
    state: locoApi.state,
    getIntroLive: () => introApi.isIntroLive(),
    overlayOpen,
    zoomBy: cameraApi.zoomBy,
    orbitBy: cameraApi.orbitBy,
    playLog,
    playLogInput,
    onSpeedUp: () => introApi.speedUp(),
    onTryLock: (x, y) => locoApi.tryLock(x, y),
    onPunch: () => locoApi.triggerPunch(),
    onOnePunch: () => locoApi.triggerOnePunch(),
    onInteract: () => stopsApi.interactNear(),
    getCursorLockPoint: (c) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: c.on ? rect.left + c.x * rect.width : rect.left + rect.width / 2,
        y: c.on ? rect.top + c.y * rect.height : rect.top + rect.height / 2,
      };
    },
  });
  const inputVector = () => inputApi.inputVector(cameraApi.screenRight, cameraApi.screenUp);

  const lookTarget = new THREE.Vector3();
  introApi = createIntro({
    scene,
    renderer,
    camera,
    post: postApi.post,
    gsap,
    root,
    boot,
    flash,
    field,
    PAL,
    ISLE,
    calm,
    isDevMap,
    playsIntro,
    island,
    landing,
    sky,
    setDawn,
    climate,
    getClimateSample: () => climateSample,
    setClimateSample: (cs) => {
      climateSample = cs;
    },
    applyEnv,
    soft: stopsApi.soft,
    flat: stopsApi.flat,
    bakeShadows: postApi.bakeShadows,
    pose: nikoApi.pose,
    bot,
    robot,
    nikoReady: nikoApi.nikoReady,
    manager: stopsApi.manager,
    fromDisk: stopsApi.fromDisk,
    cameraApi,
    lookTarget,
    getState: () => locoApi.state,
    getClock: () => clock,
  });

  /* Frame loop */
  const camLimit = isDevMap ? 85 : 38;
  const update = (dt, time) => {
    clock = time;
    const { step, swing, targetFocus } = locoApi.update(dt);
    nikoApi.updateNikoSecondary(dt, time, {
      state: locoApi.state,
      calm,
      swing,
      step,
      onAfterCloak: () => stopsApi.updateActors(dt, time),
    });
    stopsApi.updateStops(dt, time);
    cameraApi.easeZoom(dt);
    introApi.updateIntroFx(dt, time);

    climateSample = climate.update(dt);
    applyEnv(climateSample);
    if (island.beamMat && climate.state.unlocked) {
      island.beamMat.uniforms.strength.value = 0.85 + climateSample.night * 0.35 + climateSample.storm * 0.2;
    }
    island.halos.visible = !postApi.post.state.bloom;

    /* Camera follows Niko over the island */
    const lockTarget = locoApi.getLockTarget();
    lookTarget.set(
      THREE.MathUtils.clamp(robot.position.x, -camLimit, camLimit),
      robot.position.y,
      THREE.MathUtils.clamp(robot.position.z, -camLimit, camLimit)
    );
    if (lockTarget) lookTarget.lerpVectors(lookTarget, targetFocus, 0.5);
    cameraApi.keepInFrame(lookTarget, robot);
    cameraApi.follow(dt, {
      robot,
      lookTarget,
      lockTarget,
      targetFocus,
      cursor: inputApi.cursor,
      calm,
      started,
      faceView: locoApi.state.faceView,
      bot,
      inCamera: cameraApi.inCamera,
      travelled: locoApi.travelled,
    });
    camera.updateMatrixWorld();
    postApi.fitShadow();
    {
      const lift = 18 - cameraApi.camLook.y;
      cloudMap.update(
        cameraApi.camLook.x + cloudSun.value.x * lift,
        cameraApi.camLook.z + cloudSun.value.y * lift,
        Math.min(150, postApi.shadowFit.reach + cloudSun.value.length() * 24 + 8)
      );
    }
    postApi.post.snap();
    nikoApi.updateInk(camera);
    nikoHitboxes.update({ bones: bot.bones, robot, punch: locoApi.punchHitbox });
    footDust.update(dt, camera, {
      light: climateSample.day * (1 - climateSample.storm * 0.35),
      night: climateSample.night,
    });
    windTear.update(dt, {
      root: bot.body || robot,
      bones: bot.bones,
      regions: nikoHitboxes,
      position: robot.position,
      moveDir: locoApi.state.moveDir,
      facing: robot.rotation.y,
      sprint: locoApi.state.sprint,
      speed: locoApi.state.speedMeter,
      camera,
      light: climateSample.day * (1 - climateSample.storm * 0.35),
      night: climateSample.night,
    });
    if (rain) {
      rain.update(dt, {
        center: cameraApi.camLook,
        camera,
        groundAt: island.groundAt,
        intensity: climateSample.rain,
        storm: climateSample.storm,
        windMul: climateSample.wind,
        light: climateSample.day * (1 - climateSample.storm * 0.35),
      });
    }
    if (rays) {
      const sunUp = climateSample.moon ? 0 : climateSample.day * (1 - climateSample.storm * 0.8);
      rays.update(dt, {
        camera,
        center: cameraApi.camLook,
        extent: postApi.shadowFit.reach,
        strength: VOLUME_BASE * sunUp * sky.dawn,
        rays: climateSample.rays * VOLUME_RAYS * sky.dawn,
        sunDir: climateSample.sunDir,
        tint: rayTint.setRGB(1, 0.9 + climateSample.gold * -0.08 + 0.04, 0.76 - climateSample.gold * 0.16),
      });
    }
    island.update(dt, calm ? 0 : time, robot.visible ? robot.position : null, renderer, rain?.hits, camera);
    if (wind) {
      renderer.getDrawingBufferSize(windPixels);
      wind.update(dt, {
        camera,
        level: cameraApi.camLook.y,
        pixels: windPixels,
        ratio: renderer.getPixelRatio(),
        on: started && !introApi.isIntroLive() && climateSample.rain < 0.05 && climateSample.wind > 0.55,
        rate: climateSample.wind * (1 + climateSample.gust),
        light: climateSample.day * (1 - climateSample.storm * 0.3),
      });
    }
    if (robot.visible) seeThrough.playerView.value.set(robot.position.x, robot.position.y + 0.95, robot.position.z).applyMatrix4(camera.matrixWorldInverse);
    else seeThrough.playerView.value.set(0, 0, -9999);

    introApi.applyShake(dt);
    stopsApi.updatePrompt();
  };

  let last = performance.now();

  renderer.setAnimationLoop((now) => {
    const raw = Math.max(0, now - last) / 1000;
    const dt = Math.min(raw, 0.05);
    if (postApi.diag) postApi.showDiag(now, raw * 1000);
    last = now;

    if (overlayOpen()) {
      return;
    }

    const t0 = performance.now();
    update(dt, now / 1000);
    const t1 = performance.now();

    if (introApi.isCovered() && introApi.getFrames() > 3) return;

    renderer.info.reset();
    postApi.post.render();
    stopsApi.placeLabels();
    const t2 = performance.now();
    postApi.timing.update += (t1 - t0 - postApi.timing.update) * 0.05;
    postApi.timing.render += (t2 - t1 - postApi.timing.render) * 0.05;
    postApi.timing.frame += (dt * 1000 - postApi.timing.frame) * 0.05;
    postApi.adaptQuality(Math.min(raw, 0.25));
    started = true;
    introApi.stepFrame();
  });

  /* Leaving the tab: drop held input, finish the intro, and frame the robot again on return */
  const settle = () => {
    inputApi.clearKeys();
    inputApi.clearPointer();
    started = false;
    last = performance.now();

    if (document.visibilityState === "visible") {
      postApi.setRatio(Math.min(window.devicePixelRatio, MAX_RATIO, postApi.quality.ratio));
    }

    introApi.finishIntro();
  };

  document.addEventListener("visibilitychange", settle);
  window.addEventListener("pageshow", settle);

  /* HUD links walk the robot instead of scrolling */
  const travel = { "#player": "about", "#moves": "skills", "#career": "career", "#contact": "contact" };

  document.querySelectorAll('.hud a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");

      if (introApi.isIntroLive() && !introApi.hasIntro()) {
        event.preventDefault();
        return;
      }

      introApi.finishIntro();

      if (href === "#select") {
        event.preventDefault();
        stopsApi.goTo(island.spot("games"));
        return;
      }

      const obj = stopsApi.byId.get(travel[href]);
      if (obj) {
        event.preventDefault();
        stopsApi.goToObject(obj);
      }
    });
  });

  window.PortfolioWorld = {
    active: true,
    triggerPunch: () => locoApi.triggerPunch(),
    triggerOnePunch: () => locoApi.triggerOnePunch(),
    log: playLog,
    sprint: (opts) => locoApi.sprint(opts),
    animeFps: (fps) => locoApi.animeFps(fps),
    walkTo: (id) => {
      const obj = stopsApi.byId.get(id);
      introApi.finishIntro();
      if (obj && !introApi.isIntroLive()) {
        stopsApi.goToObject(obj);
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
      holdYaw: (angle) => void (locoApi.state.holdYaw = angle),
      bot: () => bot,
      scene: () => scene,
      renderer: () => renderer,
      island: () => island,
      shrineStar: () => introApi.shrineStar,
      /* Final pass: { on, pixel, ink, lift } */
      post: (options) => postApi.post.set(options),
      stats: () => ({
        ms: Object.fromEntries(Object.entries(postApi.timing).map(([k, v]) => [k, +v.toFixed(2)])),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        programs: renderer.info.programs.length,
        textures: renderer.info.memory.textures,
        pixelRatio: renderer.getPixelRatio(),
        size: [renderer.domElement.width, renderer.domElement.height],
      }),
      /* Render sharper than the normal DPR cap, for close-up review shots */
      pixelRatio: (ratio) => {
        postApi.quality.locked = true;
        postApi.setRatio(ratio);
      },
      faceImages: () => [bot.faceOpen.image.toDataURL()],
      /* Island review: put Niko at a map spot (authored u, v as in world-map.js, before the K spread), zoom, skip the intro */
      placeUV: (u, v) => {
        const p = island.fromUV(...lay(u, v));
        robot.position.copy(p);
        locoApi.state.path = [];
        started = false;
      },
      zoomNow: () => +camera.zoom.toFixed(3),
      zoom: (z) => {
        gsap.killTweensOf(camera);
        return cameraApi.debugZoom(z);
      },
      finishIntro: () => void introApi.finishIntro(),
      /* Level camera on Niko's face, `angle` radians around from the front, for comparing with the reference; null releases it */
      faceView: (angle = 0) => void (locoApi.state.faceView = angle),
      eyes: (fit) => {
        if (fit) {
          Object.assign(nikoApi.EYE_FIT, fit);
          bot.model?.traverse((node) => node.userData.refit?.());
        }
        return { ...nikoApi.EYE_FIT };
      },
      hair: (fit) => {
        if (fit) Object.assign(nikoApi.HAIR_FIT, fit);
        return nikoApi.applyHairFit();
      },
      climate: (opts) => (opts == null ? climate.sample() : climate.set(opts)),
      pinMotion: (t = null) => void (island.motion.pinned = t),
      wind: () => wind?.peek(),
      walkable: (x, z) => island.nav.walkable(x, z),
      position: () => robot.position.toArray(),
      state: () => locoApi.state,
      speedMeter: () => +locoApi.state.speedMeter.toFixed(2),
      stopThreshold: () => locoApi.getStopThreshold(),
      nikoSmear: () => ({
        lagDistance: nikoSmear.getLagDistance(),
        active: nikoSmear.uniforms.uSmearStretch.value > 0,
        stretch: +nikoSmear.uniforms.uSmearStretch.value.toFixed(3),
        armSide: nikoSmear.uniforms.uSmearArmSide.value,
      }),
      punchSmoke: () => ({
        active: false,
        puffCount: 0,
      }),
      footDust: (force) => locoApi.debugFootDust(force),
      windTear: () => windTear.stats(),
      punchHitbox: () => ({
        active: locoApi.punchHitbox.active,
        frame: locoApi.punchHitbox.frame,
        position: locoApi.punchHitbox.position.toArray(),
        box: { min: locoApi.punchHitbox.box.min.toArray(), max: locoApi.punchHitbox.box.max.toArray() },
        radius: locoApi.punchHitbox.radius,
        show: (v = true) => nikoHitboxes.setDebug(v),
      }),
      hitbox: (on) => {
        if (on == null) return nikoHitboxes.debug();
        return nikoHitboxes.setDebug(on);
      },
      regions: () => ({
        names: nikoHitboxes.names,
        boxes: nikoHitboxes.snapshot(),
        sample: (name) => {
          const p = nikoHitboxes.sample(name);
          return p ? p.toArray() : null;
        },
        center: (name) => {
          const p = nikoHitboxes.centerOf(name);
          return p ? p.toArray() : null;
        },
      }),
      yaw: (angle) => cameraApi.debugYaw(angle),
      dummyScreen: () => {
        const p = stopsApi.dummyFocus.clone().project(camera);
        const box = renderer.domElement.getBoundingClientRect();
        return { x: box.left + ((p.x + 1) / 2) * box.width, y: box.top + ((1 - p.y) / 2) * box.height };
      },
      target: (x, y) => (x == null ? Boolean(locoApi.getLockTarget()) : locoApi.tryLock(x, y)),
      sword: (give) => stopsApi.swordPickup.debug(give),
      longsword: (give) => stopsApi.longswordPickup.debug(give),
      boss: (options) => stopsApi.werewolfBoss.debug(options),
      sprint: (opts) => window.PortfolioWorld.sprint(opts),
      animeFps: (fps) => window.PortfolioWorld.animeFps(fps),
      lockClips: () => bot.lockMoves?.map((move) => ({ name: move.name, gait: move.gait, weight: +move.action.getEffectiveWeight().toFixed(3) })) ?? [],
      angle: (degrees) => cameraApi.debugAngle(degrees),
      route: () => locoApi.state.path.map((p) => p.toArray().map((n) => +n.toFixed(2))),
      bakeShadows: () => postApi.bakeShadows(),
      log: playLog,
      pressMove: inputApi.pressMove,
      releaseMove: inputApi.releaseMove,
    },
  };

  {
    const params = new URLSearchParams(location.search);
    const logParam = params.get("log");
    const wantLog = (logParam != null && logParam !== "0") || localStorage.getItem("fy-play-log") === "1";
    if (wantLog) playLog.enable(logParam != null ? "url" : "localStorage");
  }
}
