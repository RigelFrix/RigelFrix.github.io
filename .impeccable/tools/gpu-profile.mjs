/* node gpu-profile.mjs [base] [width] [height] [dpr]: GPU time per frame for each part of the scene, measured with
   EXT_disjoint_timer_query_webgl2 around every draw in the main pass (headful Edge on the real GPU, vsync off).
   The post chain (bloom, composite) and the shadow map are not scene draws; they show up as the gap between the
   summed draws and the frame interval. env Q=<query> adds URL params, ZOOM sets the camera zoom. */
import puppeteer from "puppeteer-core";

const [base = "http://127.0.0.1:8765/", w = "1600", h = "900", dpr = "1"] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: false,
  protocolTimeout: 300000,
  args: ["--ignore-gpu-blocklist", `--window-size=${+w + 20},${+h + 140}`, "--disable-frame-rate-limit", "--disable-gpu-vsync"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: +dpr });
await page.goto(`${base}?view=world&t=${Date.now()}${process.env.Q ? `&${process.env.Q}` : ""}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 180000 });
await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
await wait(1500);
await page.evaluate((dpr, zoom) => {
  const d = window.PortfolioWorld.debug;
  d.pixelRatio(+dpr);
  if (zoom) d.zoom(+zoom);
}, dpr, process.env.ZOOM || 0);
await wait(1500);

const result = await page.evaluate(
  () =>
    new Promise((done) => {
      const d = window.PortfolioWorld.debug;
      const scene = d.scene();
      const gl = document.querySelector("canvas").getContext("webgl2");
      const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      const known = new Set(["grass", "leaves", "props", "glows", "ground", "water", "stream", "sun-volume", "rain", "halos", "island"]);
      const labelOf = (o) => {
        let n = o;
        let top = o;
        while (n && n !== scene) {
          if (known.has(n.name) && n.name !== "island") return n.name;
          top = n;
          n = n.parent;
        }
        if (top.userData?.robot || top === d.bot()?.body?.parent) return "niko";
        return o.name || top.name || o.type;
      };
      const pending = [];
      const totals = {};
      const counts = {};
      let active = null;
      scene.traverse((o) => {
        if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
        const label = labelOf(o);
        const before = o.onBeforeRender;
        const after = o.onAfterRender;
        o.onBeforeRender = function (...args) {
          before.apply(this, args);
          if (active) return;
          const q = gl.createQuery();
          gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
          active = { q, label };
        };
        o.onAfterRender = function (...args) {
          if (active) {
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            pending.push(active);
            counts[active.label] = (counts[active.label] || 0) + 1;
            active = null;
          }
          after.apply(this, args);
        };
      });
      const start = performance.now();
      let frames = 0;
      const tick = () => {
        frames += 1;
        for (let i = pending.length - 1; i >= 0; i -= 1) {
          const { q, label } = pending[i];
          if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) totals[label] = (totals[label] || 0) + gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
          gl.deleteQuery(q);
          pending.splice(i, 1);
        }
        if (performance.now() - start < 4000) requestAnimationFrame(tick);
        else {
          const span = performance.now() - start;
          const stats = d.stats();
          done({
            frameMs: span / frames,
            draws: Object.fromEntries(Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / frames).toFixed(2)])),
            calls: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, +(v / frames).toFixed(1)])),
            sceneCalls: stats.calls,
            tris: stats.triangles,
          });
        }
      };
      requestAnimationFrame(tick);
    })
);
const summed = Object.values(result.draws).reduce((a, b) => a + b, 0);
console.log(`frame ${result.frameMs.toFixed(1)} ms, scene draws ${summed.toFixed(1)} ms GPU, rest (shadow map, post, compositing) ~${(result.frameMs - summed).toFixed(1)} ms`);
for (const [k, v] of Object.entries(result.draws)) console.log(`  ${k.padEnd(18)} ${v.toFixed(2).padStart(6)} ms  (${result.calls[k]} draws)`);
console.log(`calls ${result.sceneCalls}, triangles ${result.tris}`);

/* Second pass: one query per renderer.render call (main scene incl. its shadow map, every post pass), plus how
   often the shadow map is redrawn. The per-draw hooks above are removed first by reloading the page. */
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 180000 });
await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
await wait(1500);
await page.evaluate((dpr, zoom) => {
  const d = window.PortfolioWorld.debug;
  d.pixelRatio(+dpr);
  if (zoom) d.zoom(+zoom);
}, dpr, process.env.ZOOM || 0);
await wait(1500);
const passes = await page.evaluate(
  () =>
    new Promise((done) => {
      const d = window.PortfolioWorld.debug;
      const renderer = d.renderer();
      const scene = d.scene();
      const gl = renderer.getContext();
      const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      const pending = [];
      const totals = {};
      let shadowDraws = 0;
      const shadowRender = renderer.shadowMap.render.bind(renderer.shadowMap);
      renderer.shadowMap.render = (...args) => {
        if (renderer.shadowMap.needsUpdate || renderer.shadowMap.autoUpdate) shadowDraws += args[0].some((l) => l.castShadow && (l.shadow.autoUpdate || l.shadow.needsUpdate)) ? 1 : 0;
        return shadowRender(...args);
      };
      const render = renderer.render.bind(renderer);
      let index = 0;
      renderer.render = (s, c) => {
        const target = renderer.getRenderTarget();
        const label = s === scene ? (target ? "scene -> offscreen" : "scene -> screen") : `post ${index++} -> ${target ? `${target.width}x${target.height}` : "screen"}`;
        const q = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        render(s, c);
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        pending.push({ q, label: s === scene ? label : label.replace(/post \d+/, "post") });
      };
      const start = performance.now();
      let frames = 0;
      const tick = () => {
        frames += 1;
        index = 0;
        for (let i = pending.length - 1; i >= 0; i -= 1) {
          const { q, label } = pending[i];
          if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) totals[label] = (totals[label] || 0) + gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
          gl.deleteQuery(q);
          pending.splice(i, 1);
        }
        if (performance.now() - start < 4000) requestAnimationFrame(tick);
        else done({ frameMs: (performance.now() - start) / frames, totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, +(v / frames).toFixed(2)])), shadowDraws, frames });
      };
      requestAnimationFrame(tick);
    })
);
console.log(`\nper render call (frame ${passes.frameMs.toFixed(1)} ms, shadow map redrawn ${passes.shadowDraws} times in ${passes.frames} frames)`);
for (const [k, v] of Object.entries(passes.totals).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(24)} ${v.toFixed(2).padStart(6)} ms`);

/* Third: the page's CSS layers over and under the transparent canvas, composited by the browser */
const interval = () =>
  page.evaluate(
    () =>
      new Promise((done) => {
        const t = [];
        const tick = (now) => {
          t.push(now);
          if (now - t[0] < 3000) requestAnimationFrame(tick);
          else done((t[t.length - 1] - t[0]) / (t.length - 1));
        };
        requestAnimationFrame(tick);
      })
  );
console.log(`\nCSS layers: with ${(await interval()).toFixed(1)} ms`);
await page.addStyleTag({ content: ".world-vignette, .world-vignette::before, .world-vignette::after { display: none !important; }" });
await wait(800);
console.log(`  vignette/grade hidden ${(await interval()).toFixed(1)} ms`);
await page.addStyleTag({ content: ".world-sky, .world-sky::before, .world-sky::after { display: none !important; }" });
await wait(800);
console.log(`  + sky hidden ${(await interval()).toFixed(1)} ms`);
await browser.close();
