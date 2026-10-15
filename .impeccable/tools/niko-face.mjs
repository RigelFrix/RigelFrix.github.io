import puppeteer from "puppeteer-core";
import fs from "node:fs";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const out = process.argv[3] || ".impeccable/review/niko-face.png";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  protocolTimeout: 60000,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") console.log("console", m.text()); });
await page.setViewport({ width: 800, height: 500, deviceScaleFactor: Number(process.argv[4] || 7) });
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
for (let i = 0; i < 300 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i += 1) await wait(50);
await page.keyboard.press("w");
await wait(3500);
await page.addStyleTag({ content: ".hud, .world-help, .world-labels { display: none !important; }" });
await page.mouse.move(400, 250);
for (let i = 0; i < 30; i += 1) await page.mouse.wheel({ deltaY: -120 });
await page.keyboard.down("KeyS");
await wait(350);
await page.keyboard.up("KeyS");
await wait(7000);
const head = await page.evaluate(() => window.PortfolioWorld.debug.headOnScreen());
console.log("head", JSON.stringify(head), "viewport", JSON.stringify(await page.evaluate(() => [innerWidth, innerHeight, scrollY])));
const images = await page.evaluate(() => window.PortfolioWorld.debug.faceImages());
images.forEach((url, i) => fs.writeFileSync(out.replace(".png", `-tex${i}.png`), Buffer.from(url.split(",")[1], "base64")));
await page.screenshot({ path: out, clip: { x: head.x - 55, y: head.y - 25, width: 110, height: 120 } });
await page.screenshot({ path: out.replace(".png", "-head.png"), clip: { x: head.x - 20, y: head.y - 22, width: 40, height: 34 } });
await browser.close();
