/* node launch-shots.mjs [base] [prefix]: what a first visit looks like, quality unlocked (adaptQuality free to act).
   Shots during the intro landing, right after it, and ~12 s later, with bloom/MSAA state logged for each. */
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const [base = "http://127.0.0.1:8765/", prefix = "launch"] = process.argv.slice(2);
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
const shot = async (name) => {
  const state = await page.evaluate(() => {
    const p = window.PortfolioWorld.debug.post({});
    return `bloom ${p.bloom} msaa ${p.msaa} strength ${p.strength} threshold ${p.threshold} ratio ${window.PortfolioWorld.debug.stats().pixelRatio}`;
  });
  await page.screenshot({ path: fileURLToPath(new URL(`../review/${prefix}-${name}.png`, import.meta.url)) });
  console.log(name, state);
};
for (const [name, at] of [["intro-4s", 4000], ["intro-7s", 3000], ["landed", 3500], ["later", 12000]]) {
  await wait(at);
  await shot(name);
}
await browser.close();
