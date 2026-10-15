import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const outDir = process.argv[3] || ".impeccable/review";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  protocolTimeout: 60000,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
await page.setViewport({ width: 800, height: 500, deviceScaleFactor: 4 });
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
for (let i = 0; i < 300 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i += 1) await wait(50);
await page.keyboard.press("w");
await wait(3500);
await page.addStyleTag({ content: ".hud, .world-help, .world-labels { display: none !important; }" });
await page.mouse.move(400, 250);
for (let i = 0; i < 8; i += 1) await page.mouse.wheel({ deltaY: -120 });
await wait(800);

const clip = { x: 300, y: 130, width: 200, height: 200 };
for (const key of ["KeyD", "KeyS", "KeyW"]) {
  await page.keyboard.down(key);
  await wait(900);
  await page.screenshot({ path: `${outDir}/niko-walk-${key}.png`, clip });
  await page.keyboard.up(key);
  await wait(200);
}
await wait(1500);
await page.screenshot({ path: `${outDir}/niko-idle.png`, clip });
await wait(9000);
await page.screenshot({ path: `${outDir}/niko-idle-late.png`, clip });
await browser.close();
