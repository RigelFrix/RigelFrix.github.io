/* node perf-ab.mjs [base] [width] [height] [dpr]: what each part of the frame costs, measured A/B. Each toggle is
   switched on and off ROUNDS times (default 4) with ~1.5 s of frames each way and the medians compared, because a
   laptop GPU's clock wanders too much for single runs. Headful Edge, real GPU, vsync off. Quality is locked (no
   automatic step-down) at the given pixel ratio. env Q=<query> adds URL params, ONLY=<name,...> picks toggles. */
import puppeteer from "puppeteer-core";

const [base = "http://127.0.0.1:8765/", w = "1600", h = "900", dpr = "1"] = process.argv.slice(2);
const rounds = +(process.env.ROUNDS || 4);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* SOFT=1: SwiftShader (CPU rasteriser). Slow, but steady, so it ranks the work in each part of the frame. */
const soft = !!process.env.SOFT;
const span = soft ? 6000 : 1500;
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: soft,
  protocolTimeout: 900000,
  args: soft
    ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    : ["--ignore-gpu-blocklist", `--window-size=${+w + 20},${+h + 140}`, "--disable-frame-rate-limit", "--disable-gpu-vsync"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: +dpr });
await page.goto(`${base}?view=world&t=${Date.now()}${process.env.Q ? `&${process.env.Q}` : ""}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 180000 });
await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
await wait(1500);
await page.evaluate((dpr) => window.PortfolioWorld.debug.pixelRatio(+dpr), dpr);
await wait(2000);

const interval = (span) =>
  page.evaluate(
    (span) =>
      new Promise((done) => {
        const t = [];
        const tick = (now) => {
          t.push(now);
          if (now - t[0] < span) requestAnimationFrame(tick);
          else done((t[t.length - 1] - t[0]) / (t.length - 1));
        };
        requestAnimationFrame(tick);
      }),
    span
  );
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const d = "PortfolioWorld.debug";
const node = (name) => `${d}.scene().getObjectByName("${name}")`;
const show = (name, on) => `(${node(name)} || {}).visible = ${on}`;
const sunShadow = `${d}.scene().children.find((o) => o.isDirectionalLight && o.castShadow).shadow`;
const toggles = [
  ["shadow frozen", `${sunShadow}.autoUpdate = false`, `${sunShadow}.autoUpdate = true`],
  ["msaa off", `${d}.post({ msaa: false })`, `${d}.post({ msaa: true })`],
  ["bloom off", `${d}.post({ bloom: false })`, `${d}.post({ bloom: true })`],
  ...["grass", "props", "leaves", "ground", "sun-volume", "water"].map((n) => [`${n} off`, show(n, false), show(n, true)]),
  ["half resolution", `${d}.pixelRatio(${+dpr / 2})`, `${d}.pixelRatio(${+dpr})`],
  ["empty scene", `${d}.scene().children.forEach((c) => (c.userData.wasVisible = c.visible, c.visible = false))`, `${d}.scene().children.forEach((c) => (c.visible = c.userData.wasVisible))`],
  ["canvas hidden", `document.querySelector("canvas").style.visibility = "hidden"`, `document.querySelector("canvas").style.visibility = ""`],
].filter(([name]) => !process.env.ONLY || process.env.ONLY.split(",").some((k) => name.startsWith(k)));

const info = await page.evaluate(() => {
  const gl = window.PortfolioWorld.debug.renderer().getContext();
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const s = window.PortfolioWorld.debug.stats();
  return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "?", calls: s.calls, tris: s.triangles };
});
console.log(`${w}x${h}@${dpr} ${process.env.Q || ""}  ${info.gpu}  calls ${info.calls} tris ${info.tris}`);
const baseline = [];
for (const [name, on, off] of toggles) {
  const a = [];
  const b = [];
  for (let r = 0; r < rounds; r += 1) {
    await wait(soft ? 1500 : 300);
    a.push(await interval(span));
    await page.evaluate(on);
    await wait(soft ? 1500 : 500);
    b.push(await interval(span));
    await page.evaluate(off);
  }
  baseline.push(...a);
  const ma = median(a);
  const mb = median(b);
  console.log(`${name.padEnd(16)} ${ma.toFixed(1).padStart(6)} -> ${mb.toFixed(1).padStart(6)} ms   saves ${(ma - mb).toFixed(1).padStart(5)} ms (${(((ma - mb) / ma) * 100).toFixed(0)}%)`);
}
console.log(`base median over the whole run ${median(baseline).toFixed(1)} ms`);
await browser.close();
