/* node wind-peek.mjs [base]: wind line state a few seconds after the intro, plus a shot */
import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => m.type() !== "log" && console.log("console", m.text().slice(0, 1500)));
await page.setViewport({ width: 800, height: 500 });
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 60000 });
await page.evaluate(() => window.PortfolioWorld.debug.finishIntro());
/* Shoot whenever a line is well drawn in (head past half, tail not yet eating it) */
let shots = 0;
for (let k = 0; k < 120 && shots < 3; k += 1) {
  await wait(250);
  const lines = await page.evaluate(() => window.PortfolioWorld.debug.wind());
  if (lines.some((l) => l.live && l.head > 0.55 && l.age < 1.6)) {
    await page.screenshot({ path: `../review/wp2-${shots}.png` });
    console.log("shot", shots, JSON.stringify(lines.filter((l) => l.live)));
    shots += 1;
    await wait(2500);
  }
}
await browser.close();
