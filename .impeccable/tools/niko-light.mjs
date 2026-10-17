/* node .impeccable/tools/niko-light.mjs [base] [prefix] [dpr] [moods]  (run from repo root, server on :8765)
   Niko at the default game zoom under several moods. Saves the full frame and a crop around him blown up 6x with
   nearest-neighbour, so jagged edges and muddy pixels on his face read at a glance.
   moods: comma list of name:hour:weather, default noon:12:fair,dusk:18.6:fair,night:22:fair,storm:12:storm */
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const prefix = process.argv[3] || "light";
const dpr = Number(process.argv[4] || 1);
const moods = (process.argv[5] || "noon:12:fair,dusk:18.6:fair,night:22:fair,storm:12:storm").split(",").map((m) => m.split(":"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  protocolTimeout: 120000,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
await page.setViewport({ width: 1000, height: 640, deviceScaleFactor: dpr });
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 90000 });
await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
await page.evaluate((uv) => uv && window.PortfolioWorld.debug.placeUV(...uv), process.env.UV ? process.env.UV.split(/[ ,]/).map(Number) : null);
await page.addStyleTag({ content: ".hud, .world-help, .world-labels, .world-climate { display: none !important; }" });
await page.evaluate((r) => window.PortfolioWorld.debug.pixelRatio(r), dpr);
await wait(7000);
for (const [name, hour, weather] of moods) {
  await page.evaluate((h, w) => void window.PortfolioWorld.debug.climate({ hour: +h, weather: w, instant: true }), hour, weather);
  await wait(3000);
  const file = `.impeccable/review/${prefix}-${name}.png`;
  await page.screenshot({ path: file });
  const head = await page.evaluate(() => window.PortfolioWorld.debug.headOnScreen());
  const w = 70;
  const h = 90;
  const left = Math.max(0, Math.round((head.x - w / 2) * dpr));
  const top = Math.max(0, Math.round((head.y - 25) * dpr));
  await sharp(file)
    .extract({ left, top, width: w * dpr, height: h * dpr })
    .resize({ width: w * 6, height: h * 6, kernel: "nearest" })
    .toFile(`.impeccable/review/${prefix}-${name}-zoom.png`);
}
await browser.close();
