/* node .impeccable/tools/eval-world.mjs "<js returning JSON-able value>" [base]  (run from repo root)
   Loads the world, finishes the intro, runs the snippet in the page (PortfolioWorld.debug as `d`) and prints it. */
import puppeteer from "puppeteer-core";

const code = process.argv[2] || "d.climate()";
const base = process.argv[3] || "http://127.0.0.1:8765/";
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  protocolTimeout: 120000,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
page.on("console", (m) => /error|warn/i.test(m.type()) && console.log("console", m.text().slice(0, 400)));
await page.setViewport({ width: 1000, height: 640, deviceScaleFactor: Number(process.env.DPR || 1) });
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 240000 });
await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
await new Promise((r) => setTimeout(r, 2000));
console.log(JSON.stringify(await page.evaluate(new Function("const d = window.PortfolioWorld.debug; return (async () => (" + code + "))();")), null, 1));
/* SHOT=<name>: wait WAIT ms (default 3000) and save .impeccable/review/<name>.png */
if (process.env.SHOT) {
  await new Promise((r) => setTimeout(r, Number(process.env.WAIT || 3000)));
  /* CLIP="x,y,w,h" crops (CSS px) and magnifies it CLIP_SCALE times (default 3) */
  const clip = process.env.CLIP?.split(",").map(Number);
  await page.screenshot({
    path: `.impeccable/review/${process.env.SHOT}.png`,
    ...(clip ? { clip: { x: clip[0], y: clip[1], width: clip[2], height: clip[3], scale: Number(process.env.CLIP_SCALE || 3) } } : {}),
  });
}
await browser.close();
