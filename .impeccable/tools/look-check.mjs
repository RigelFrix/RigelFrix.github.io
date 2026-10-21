/* node look-check.mjs [base] [prefix]: full-view shots of the island in a few lights (overcast cloud shadows, clear
   day, night lamp pools, zoomed out) on the real GPU, for before/after comparisons of rendering changes. */
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const [base = "http://127.0.0.1:8765/", prefix = "look"] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: false,
  args: ["--ignore-gpu-blocklist", "--window-size=1300,860"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.setViewport({ width: 1280, height: 720 });
await page.goto(`${base}?view=world&t=${Date.now()}${process.env.Q ? `&${process.env.Q}` : ""}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 180000 });
await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
await wait(1500);
await page.addStyleTag({ content: ".hud, .world-help, .world-labels { display: none !important; }" });
const shots = [
  ["overcast", { hour: 13, weather: "overcast", instant: true }, 1],
  ["fair", { hour: 11, weather: "fair", instant: true }, 1],
  ["night", { hour: 22, weather: "fair", instant: true }, 1],
  ["zoomout", { hour: 15, weather: "fair", instant: true }, 0.7],
];
for (const [name, climate, zoom] of shots) {
  await page.evaluate((climate, zoom) => {
    window.PortfolioWorld.debug.climate(climate);
    window.PortfolioWorld.debug.zoom(zoom);
  }, climate, zoom);
  await wait(2500);
  const file = fileURLToPath(new URL(`../review/${prefix}-${name}.png`, import.meta.url));
  await page.screenshot({ path: file });
  console.log(name, file);
}
await browser.close();
