// Niko's painted face vs the reference: a level front shot (debug.faceView) and a side shot, plus the
// mesh anchor the eyes were laid out from. Usage: node face-fit.mjs [base] [prefix]
import puppeteer from "puppeteer-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const prefix = process.argv[3] || "face-fit";
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../review");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  protocolTimeout: 120000,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
await page.goto(`${base}?view=world&bloom=0&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
for (let i = 0; i < 600 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i++) await wait(50);
await page.evaluate(() => window.PortfolioWorld.debug.finishIntro());
await wait(200);
await page.evaluate(() => window.PortfolioWorld.debug.climate({ hour: 15, weather: "overcast", instant: true }));
await page.addStyleTag({ content: ".hud, .world-help, .world-labels, .world-boot, .world-vignette { display: none !important; }" });
// EYES='{"gap":24,"raise":9}' tries an eye fit before the shots (same keys as EYE_FIT in world.js)
if (process.env.EYES) console.log("eyes", JSON.stringify(await page.evaluate((fit) => window.PortfolioWorld.debug.eyes(JSON.parse(fit)), process.env.EYES)));
else console.log("eyes", JSON.stringify(await page.evaluate(() => window.PortfolioWorld.debug.eyes())));

const anchor = await page.evaluate(() => {
  const found = [];
  window.PortfolioWorld.debug.bot().model.traverse((n) => n.userData?.anchor && found.push(n.userData.anchor));
  return found[0] || null;
});
console.log("anchor", JSON.stringify(anchor));

const shot = async (name, angle) => {
  await page.evaluate((angle) => {
    const d = window.PortfolioWorld.debug;
    d.holdYaw(0);
    d.faceView(angle);
    d.zoom(9);
  }, angle);
  await wait(1500);
  const head = await page.evaluate(() => window.PortfolioWorld.debug.headOnScreen());
  const clip = angle == null
    ? { x: Math.max(0, Math.round(head.x - 110)), y: Math.max(0, Math.round(head.y - 150)), width: 220, height: 200 }
    : { x: 640 - 150, y: 400 - 150, width: 300, height: 300 };
  const file = path.join(out, `${prefix}-${name}.png`);
  await page.screenshot({ path: file, clip });
  console.log(name, file);
};
await shot("front", 0);
await shot("side", 1.1);
await shot("game", null);
await browser.close();
