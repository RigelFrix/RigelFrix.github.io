/* node island-shots.mjs [base] [prefix] [zoom] [spots]: Niko placed at each map spot (u,v), one screenshot each.
   spots: "name:u:v,name:u:v" (default: the five zones). */
import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const prefix = process.argv[3] || "isl";
const zoom = +(process.argv[4] || 1);
const spots = (process.argv[5] || "shrine:-1:-12,plateau:-10:-5,ruins:1:-6,cliff:12:-4,beach:-7:10,overview:0:-2")
  .split(",")
  .map((s) => s.split(":"))
  .map(([name, u, v]) => ({ name, u: +u, v: +v }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && console.log("console", m.text()));
await page.setViewport({ width: 1440, height: 900 });
const t0 = Date.now();
await page.goto(`${base}?view=world&t=${t0}${process.env.Q ? `&${process.env.Q}` : ""}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 60000 });
console.log("ready", Date.now() - t0, "ms");
await page.evaluate(() => window.PortfolioWorld.debug.finishIntro());
await wait(800);
console.log(JSON.stringify(await page.evaluate(() => window.PortfolioWorld.debug.stats())));
for (const s of spots) {
  await page.evaluate(({ u, v, zoom, bake }) => {
    window.PortfolioWorld.debug.placeUV(u, v);
    window.PortfolioWorld.debug.zoom(zoom);
    if (bake) window.PortfolioWorld.debug.bakeShadows();
  }, { ...s, zoom: s.name === "overview" ? zoom * 0.55 : zoom, bake: Boolean(process.env.BAKE) });
  /* env JS: run before each shot, e.g. JS="PortfolioWorld.debug.post({bloom:true})" (slow frames drop bloom) */
  await page.evaluate(`void (window.PortfolioWorld.debug.post({ bloom: true }), ${process.env.JS || "0"})`);
  await wait(900);
  await page.screenshot({ path: `../review/${prefix}-${s.name}.png` });
}
await browser.close();
