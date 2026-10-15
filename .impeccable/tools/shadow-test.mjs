/* node shadow-test.mjs [base] [out] [live 0|1]: plateau shot with only hemi + sun, to see the sun shadows clearly */
import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const out = process.argv[3] || "shadow-test";
const live = process.argv[4] === "1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 60000 });
await page.evaluate(() => window.PortfolioWorld.debug.finishIntro());
await wait(800);
const info = await page.evaluate((live) => {
  const d = window.PortfolioWorld.debug;
  d.placeUV(-10, -5.4);
  d.zoom(1.4);
  return d.lights(0.3, 3, live);
}, live);
console.log(JSON.stringify(info));
await wait(900);
await page.screenshot({ path: `../review/${out}.png` });
await browser.close();
