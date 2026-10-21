/* node perf-compare.mjs <urlA> <urlB> [width] [height] [dpr]: frame time of two builds, alternated ROUNDS times
   (default 3) in one headful Edge on the real GPU, vsync off, quality locked at dpr. Medians per build. The same
   spot and light every time. env Q=<query> adds URL params to both. */
import puppeteer from "puppeteer-core";

const [a, b, w = "1600", h = "900", dpr = "1"] = process.argv.slice(2);
const rounds = +(process.env.ROUNDS || 3);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: false,
  protocolTimeout: 600000,
  args: ["--ignore-gpu-blocklist", `--window-size=${+w + 20},${+h + 140}`, "--disable-frame-rate-limit", "--disable-gpu-vsync"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: +dpr });
const run = async (url) => {
  await page.goto(`${url}?view=world&t=${Date.now()}${process.env.Q ? `&${process.env.Q}` : ""}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 180000 });
  await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
  await wait(1500);
  await page.evaluate((dpr) => {
    const d = window.PortfolioWorld.debug;
    d.pixelRatio(+dpr);
    d.climate({ hour: 11, weather: "fair", instant: true });
  }, dpr);
  await wait(2500);
  return page.evaluate(
    () =>
      new Promise((done) => {
        const t = [];
        const tick = (now) => {
          t.push(now);
          if (now - t[0] < 4000) requestAnimationFrame(tick);
          else {
            const s = window.PortfolioWorld.debug.stats();
            done({ ms: (t[t.length - 1] - t[0]) / (t.length - 1), calls: s.calls, tris: s.triangles });
          }
        };
        requestAnimationFrame(tick);
      })
  );
};
const median = (v) => [...v].sort((x, y) => x - y)[Math.floor(v.length / 2)];
const res = { A: [], B: [] };
let info = {};
for (let r = 0; r < rounds; r += 1) {
  for (const [key, url] of [["A", a], ["B", b]]) {
    const out = await run(url);
    res[key].push(out.ms);
    info[key] = out;
    console.log(`round ${r + 1} ${key} ${out.ms.toFixed(1)} ms  calls ${out.calls} tris ${out.tris}`);
  }
}
const ma = median(res.A);
const mb = median(res.B);
console.log(`\nA ${a}: ${ma.toFixed(1)} ms (${(1000 / ma).toFixed(0)} fps)\nB ${b}: ${mb.toFixed(1)} ms (${(1000 / mb).toFixed(0)} fps)\nB is ${(((ma - mb) / ma) * 100).toFixed(0)}% faster`);
await browser.close();
