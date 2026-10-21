/* node adapt-watch.mjs [base] [width] [height] [dpr] [seconds]: lets the frame-time guard (adaptQuality) work
   unlocked and prints frame time, pixel ratio, bloom and MSAA once a second. A large viewport at a high device pixel
   ratio stands in for a weak GPU on a big screen. Headful Edge, real GPU, vsync off. */
import puppeteer from "puppeteer-core";

const [base = "http://127.0.0.1:8765/", w = "2560", h = "1440", dpr = "2", seconds = "30"] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: false,
  protocolTimeout: 600000,
  args: ["--ignore-gpu-blocklist", "--window-size=1300,860", "--disable-frame-rate-limit", "--disable-gpu-vsync"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: +dpr });
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 300000 });
await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
for (let s = 0; s < +seconds; s += 1) {
  const r = await page.evaluate(
    () =>
      new Promise((done) => {
        const t = [];
        const tick = (now) => {
          t.push(now);
          if (now - t[0] < 1000) requestAnimationFrame(tick);
          else {
            const d = window.PortfolioWorld.debug;
            const p = d.post({});
            done({ ms: (t[t.length - 1] - t[0]) / Math.max(1, t.length - 1), ratio: d.stats().pixelRatio, bloom: p.bloom, msaa: p.msaa });
          }
        };
        requestAnimationFrame(tick);
      })
  );
  console.log(`${String(s + 1).padStart(3)}s  ${r.ms.toFixed(0).padStart(4)} ms  ratio ${r.ratio}  bloom ${r.bloom}  msaa ${r.msaa}`);
}
await browser.close();
