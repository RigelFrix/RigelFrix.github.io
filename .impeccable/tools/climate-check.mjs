/* node climate-check.mjs [base] [prefix]  (run from .impeccable/tools, server on :8765)
   1. Wind: clouds and water pinned, camera still; two frames 0.5 s apart must differ on foliage and grass but not
      on stone, or the sway is frozen.
   2. Weather: fair -> storm -> fair without `instant`, logging the eased channels and saving a frame at each stage,
      so the order (clouds, then rain, then wet ground that dries late) can be checked. */
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const prefix = process.argv[3] || "climate";
const out = (name) => `../review/${prefix}-${name}.png`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => /error/i.test(m.type()) && errors.push(m.text().slice(0, 300)));
await page.setViewport({ width: 1100, height: 700 });
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 90000 });
await page.evaluate(() => {
  const d = window.PortfolioWorld.debug;
  d.finishIntro();
  d.placeUV(3, 1.5);
  d.zoom(3.2);
  d.climate({ hour: 12, weather: 3, instant: true });
  d.pinMotion(40);
  document.querySelector(".world-help")?.remove();
});
await wait(1500);

/* Changed-pixel share inside a box, between two frames */
const diff = async (a, b, [x0, y0, x1, y1]) => {
  const meta = await sharp(a).metadata();
  const [pa, pb] = await Promise.all([sharp(a).raw().toBuffer(), sharp(b).raw().toBuffer()]);
  const ch = meta.channels;
  let hit = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1)
    for (let x = x0; x < x1; x += 1) {
      const i = (y * meta.width + x) * ch;
      n += 1;
      if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) > 24) hit += 1;
    }
  return +(hit / n).toFixed(3);
};

const windA = await page.screenshot({ path: out("wind-a") });
await wait(500);
const windB = await page.screenshot({ path: out("wind-b") });
const env0 = await page.evaluate(() => window.PortfolioWorld.debug.climate());
console.log("wind", JSON.stringify({
  phase: +env0.windPhase.toFixed(2),
  wind: +env0.wind.toFixed(2),
  foliage: await diff(windA, windB, [40, 140, 340, 340]),
  grass: await diff(windA, windB, [420, 420, 700, 640]),
  stone: await diff(windA, windB, [380, 90, 500, 230]),
}));

const log = async (label) => {
  const s = await page.evaluate(() => window.PortfolioWorld.debug.climate());
  const r = (v) => +v.toFixed(2);
  console.log(label, JSON.stringify({ stage: s.stage, w: r(s.weather), cloud: r(s.cloud), wind: r(s.wind), rain: r(s.rain), wet: r(s.wet), fog: r(s.fog), storm: r(s.storm) }));
};

console.log("panel", await page.evaluate(() => Boolean(document.querySelector(".world-climate [data-preset]"))));
if (process.env.PRESETS !== "0") {
  for (const name of (process.env.PRESETS || "storm,rain,windy,gale,heat").split(",")) {
    await page.evaluate((n) => window.PortfolioWorld.debug.climate({ weather: n, instant: true }), name);
    await wait(2500);
    await log(name);
    await page.screenshot({ path: out(name) });
  }
}
if (process.env.ROLL) {
  await page.evaluate(() => window.PortfolioWorld.debug.climate({ weather: "storm" }));
  for (let k = 1; k <= 6; k += 1) {
    await wait(2500);
    await log(`storm+${k * 2.5}s`);
  }
}
console.log("errors", JSON.stringify(errors.filter((e) => !/KHR_parallel/.test(e)).slice(0, 6)));
await browser.close();
