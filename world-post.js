import * as THREE from "three";

/** Post-processing composer (outlines, creases, FXAA, dual-filter bloom, texel snap), lights/shadows & adaptive quality. */
export function createPost(ctx) {
  const {
    renderer,
    scene,
    camera,
    host,
    camLook,
    coarse,
    lite,
    software,
    calm,
    MIN_RATIO,
    getIntroLive,
    resize,
  } = ctx;

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

  const timing = { update: 0, render: 0, frame: 0 };

  /* Resolution steps down (never back up) while frames average slower than ~45 fps, so weak GPUs stay smooth */
  const quality = { ratio: renderer.getPixelRatio(), time: 0, frames: 0 };
  const setRatio = (ratio) => {
    quality.ratio = ratio;
    renderer.setPixelRatio(ratio);
    resize();
  };
  const adaptQuality = (dt) => {
    if (getIntroLive() || document.hidden || quality.locked) return;
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

  return {
    post,
    hemi,
    sun,
    fill,
    rim,
    SHADOW_SIZE,
    sunAim,
    shadowFit,
    fitShadow,
    placeSun,
    bakeShadows,
    timing,
    quality,
    setRatio,
    adaptQuality,
    diag,
    showDiag,
  };
}
