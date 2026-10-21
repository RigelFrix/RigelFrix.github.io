/* node glow-parts.mjs [base] [prefix]: how much each glow layer brightens the settled daytime view. Shoots the same
   frame with motion pinned while switching off, one at a time: bloom, the sun volume (sunlit air), the CSS sun
   grade (.world-vignette before/after). Prints the mean brightness each one adds and saves the shots. */
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const [base = "http://127.0.0.1:8765/", prefix = "glow"] = process.argv.slice(2);
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
await page.evaluate(() => {
  const d = window.PortfolioWorld.debug;
  d.pixelRatio(1);
  d.climate({ hour: 11, weather: "fair", instant: true });
  d.pinMotion(3);
});
await wait(2500);
const mean = async (name) => {
  await wait(700);
  const file = fileURLToPath(new URL(`../review/${prefix}-${name}.png`, import.meta.url));
  const buf = await page.screenshot({ path: file });
  return buf;
};
const d = "PortfolioWorld.debug";
const steps = process.env.TRY
  ? [
      ["all", "0"],
      ...process.env.TRY.split(";").map((t, k) => [`try${k}`, `${d}.post(${t})`]),
      ["none", `${d}.post({ bloom: false })`],
    ]
  : [
  ["all", "0"],
  ["no-bloom", `${d}.post({ bloom: false })`],
  ["no-volume", `${d}.post({ bloom: true }); ${d}.scene().getObjectByName("sun-volume").visible = false`],
  ["no-css", `${d}.scene().getObjectByName("sun-volume").visible = true; document.querySelector(".world-vignette").classList.add("glow-off")`],
  ["none", `${d}.post({ bloom: false }); ${d}.scene().getObjectByName("sun-volume").visible = false`],
];
if (process.env.HOUR) await page.evaluate((h) => window.PortfolioWorld.debug.climate({ hour: +h, weather: "fair", instant: true }), process.env.HOUR);
await page.addStyleTag({ content: ".world-vignette.glow-off::before, .world-vignette.glow-off::after { display: none !important; }" });
for (const [name, js] of steps) {
  await page.evaluate(js);
  await mean(name);
  console.log(name);
}
await browser.close();
