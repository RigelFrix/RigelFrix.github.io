/* node perf-check.mjs [base] [dpr] [cpu]: headful Edge on the real GPU, phone viewport (390x844) at a locked pixel ratio
   (default 3, so the GPU is the bottleneck), CPU throttled by [cpu]x (default 1). For each variant it measures the
   average frame interval over 3 s plus three's CPU update/render ms. */
import puppeteer from "puppeteer-core";

const [base = "http://127.0.0.1:8765/", dpr = "3", cpu = "1"] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: false,
  args: ["--ignore-gpu-blocklist", "--window-size=460,940", "--disable-frame-rate-limit", "--disable-gpu-vsync"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.emulate({
  viewport: { width: 390, height: 844, deviceScaleFactor: +dpr, isMobile: true, hasTouch: true },
  userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile",
});
await page.goto(`${base}?view=world&t=${Date.now()}${process.env.Q ? `&${process.env.Q}` : ""}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 90000 });
await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
await wait(1500);
if (+cpu > 1) await page.emulateCPUThrottling(+cpu);
await page.evaluate((dpr) => {
  const d = window.PortfolioWorld.debug;
  d.placeUV(-4, 2);
  d.pixelRatio(+dpr);
}, dpr);
await wait(1500);

const measure = async (name, js) => {
  await page.evaluate(js || "0");
  await wait(1200);
  const r = await page.evaluate(
    () =>
      new Promise((done) => {
        const t = [];
        const tick = (now) => {
          t.push(now);
          if (now - t[0] < 3000) requestAnimationFrame(tick);
          else {
            const s = window.PortfolioWorld.debug.stats();
            done({ fps: ((t.length - 1) / ((t[t.length - 1] - t[0]) / 1000)).toFixed(1), ms: ((t[t.length - 1] - t[0]) / (t.length - 1)).toFixed(1), cpu: s.ms, calls: s.calls, tris: s.triangles });
          }
        };
        requestAnimationFrame(tick);
      })
  );
  console.log(name.padEnd(16), `${r.ms} ms (${r.fps} fps)`, "cpu", JSON.stringify(r.cpu), "calls", r.calls, "tris", r.tris);
};

const d = "PortfolioWorld.debug";
const node = (name) => `${d}.scene().getObjectByName("${name}")`;
await measure("base");
await measure("msaa off", `${d}.post({ msaa: false })`);
await measure("+ bloom off", `${d}.post({ bloom: false })`);
await measure("restore", `${d}.post({ msaa: true, bloom: true })`);
if (process.env.SHORT) {
  await browser.close();
  process.exit(0);
}
await measure("grass off", `${node("grass")}.visible = false`);
await measure("leaves off", `${node("grass")}.visible = true; ${node("leaves")}.visible = false`);
await measure("water off", `${node("leaves")}.visible = true; ${node("water")}.visible = false`);
await measure("props off", `${node("water")}.visible = true; ${node("props")}.visible = false`);
await measure("terrain off", `${node("props")}.visible = true; ${node("terrain")}.visible = false`);
await measure("niko off", `${node("terrain")}.visible = true; ${d}.bot().root ? 0 : 0; ${d}.scene().children.forEach((c) => c.userData.robot && (c.visible = false))`);
await browser.close();
