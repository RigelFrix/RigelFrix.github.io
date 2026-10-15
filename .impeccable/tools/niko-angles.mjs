/* node niko-angles.mjs [base] [prefix]: Niko's head at several angles to the camera, zoomed in, in one page load.
   Writes .impeccable/review/<prefix>-<deg>.png and a contact sheet <prefix>-sheet.png */
import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const prefix = process.argv[3] || "angles";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  protocolTimeout: 60000,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
await page.setViewport({ width: 800, height: 500, deviceScaleFactor: Number(process.argv[5] || 4) });
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
for (let i = 0; i < 300 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i += 1) await wait(50);
await page.keyboard.press("w");
await wait(3500);
await page.addStyleTag({ content: ".hud, .world-help, .world-labels { display: none !important; }" });
await page.mouse.move(400, 250);
for (let i = 0; i < Number(process.env.NIKO_ZOOM ?? 30); i += 1) await page.mouse.wheel({ deltaY: -120 });
/* argv[6]: optional JS run in the page before the shots, e.g. to hide or tint parts via PortfolioWorld.debug.bot() */
if (process.argv[6]) await page.evaluate((code) => void new Function(code)(), process.argv[6]);
if (process.argv[5]) await page.evaluate((r) => window.PortfolioWorld.debug.pixelRatio(r), Number(process.argv[5]));
const angles = (process.argv[4] || "0,35,70,110,-35,-70").split(",").map(Number);
for (const deg of angles) {
  await page.evaluate((a) => window.PortfolioWorld.debug.holdYaw(a), (deg * Math.PI) / 180);
  await wait(deg === angles[0] ? 4000 : 1800);
  const head = await page.evaluate(() => window.PortfolioWorld.debug.headOnScreen());
  await page.screenshot({ path: `.impeccable/review/${prefix}-${deg}.png`, clip: { x: head.x - 22, y: head.y - 24, width: 44, height: 40 } });
}
await browser.close();
