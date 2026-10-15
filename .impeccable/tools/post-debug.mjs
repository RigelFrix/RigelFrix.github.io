/* node post-debug.mjs [base] [out.png] [u] [v] [ink]: the edge pass's debug view (ink 9 = depth/outline/crease) */
import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const out = process.argv[3] || "../review/post-debug.png";
const u = +(process.argv[4] ?? -8);
const v = +(process.argv[5] ?? -2);
const ink = +(process.argv[6] ?? 9);
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.PortfolioWorld?.debug && document.documentElement.classList.contains("world-ready"), { timeout: 120000 });
await page.evaluate(({ u, v, ink }) => {
  const d = window.PortfolioWorld.debug;
  d.finishIntro?.();
  d.placeUV(u, v);
  d.post({ ink });
}, { u, v, ink });
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: out });
await browser.close();
