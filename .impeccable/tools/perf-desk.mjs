/* node perf-desk.mjs [base] [gpu|soft] [width] [height] [dpr]: desktop frame-time breakdown.
   gpu  = headful Edge on the real GPU, vsync off (frame interval = real cost)
   soft = headless SwiftShader, i.e. Chrome with hardware acceleration off or a blocklisted GPU
   Per variant: frame interval, three's CPU update/render ms, draw calls, triangles, then each layer switched off
   in turn to see what it costs. env SHORT=1 stops after the base run, Q=<query> adds URL params. */
import puppeteer from "puppeteer-core";

const [base = "http://127.0.0.1:8765/", mode = "gpu", w = "1600", h = "900", dpr = "1"] = process.argv.slice(2);
const soft = mode === "soft";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: soft,
  protocolTimeout: 300000,
  args: soft
    ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--window-size=${w},${h}`]
    : ["--ignore-gpu-blocklist", `--window-size=${+w + 20},${+h + 140}`, "--disable-frame-rate-limit", "--disable-gpu-vsync"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: +dpr });
await page.goto(`${base}?view=world&t=${Date.now()}${process.env.Q ? `&${process.env.Q}` : ""}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 180000 });
await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
await wait(1500);
const info = await page.evaluate((dpr) => {
  const d = window.PortfolioWorld.debug;
  d.pixelRatio(+dpr);
  const gl = document.querySelector("canvas").getContext("webgl2");
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  const grass = d.scene().getObjectByName("grass");
  let cards = 0;
  grass?.traverse((o) => (cards += o.isInstancedMesh ? o.count : 0));
  return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "?", grass: cards };
}, dpr);
console.log(`${mode} ${w}x${h}@${dpr}  ${info.gpu}  grass cards ${info.grass}`);
await wait(1500);

const span = soft ? 6000 : 3000;
const measure = async (name, js) => {
  await page.evaluate(js || "0");
  await wait(soft ? 2500 : 1200);
  const r = await page.evaluate(
    (span) =>
      new Promise((done) => {
        const t = [];
        const tick = (now) => {
          t.push(now);
          if (now - t[0] < span) requestAnimationFrame(tick);
          else {
            const s = window.PortfolioWorld.debug.stats();
            done({ fps: ((t.length - 1) / ((t[t.length - 1] - t[0]) / 1000)).toFixed(1), ms: ((t[t.length - 1] - t[0]) / (t.length - 1)).toFixed(1), cpu: s.ms, calls: s.calls, tris: s.triangles });
          }
        };
        requestAnimationFrame(tick);
      }),
    span
  );
  console.log(name.padEnd(16), `${r.ms.padStart(6)} ms (${r.fps} fps)`, "cpu", JSON.stringify(r.cpu), "calls", r.calls, "tris", r.tris);
};

const d = "PortfolioWorld.debug";
const node = (name) => `${d}.scene().getObjectByName("${name}")`;
const show = (name, on) => `(${node(name)} || {}).visible = ${on}`;
await measure("base");
const sunShadow = `${d}.scene().children.find((o) => o.isDirectionalLight && o.castShadow).shadow`;
if (process.env.ONLY) {
  for (const [name, js, undo] of [
    ["shadow frozen", `${sunShadow}.autoUpdate = false`, `${sunShadow}.autoUpdate = true`],
    ["msaa off", `${d}.post({ msaa: false })`, `${d}.post({ msaa: true })`],
    ["sun-volume off", show("sun-volume", false), show("sun-volume", true)],
  ]) {
    await measure(name, js);
    await page.evaluate(undo);
    await measure("base again");
  }
}
if (!process.env.SHORT && !process.env.ONLY) {
  await measure("shadow frozen", `${sunShadow}.autoUpdate = false`);
  await page.evaluate(`${sunShadow}.autoUpdate = true`);
  await measure("bloom off", `${d}.post({ bloom: false })`);
  await measure("restore", `${d}.post({ bloom: true })`);
  for (const layer of ["grass", "leaves", "props", "ground", "sun-volume", "water", "stream"]) {
    await measure(`${layer} off`, show(layer, false));
    await page.evaluate(show(layer, true));
  }
}
await browser.close();
