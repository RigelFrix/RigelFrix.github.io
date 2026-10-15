import puppeteer from "puppeteer-core";

/* node model-view.mjs <url path of .glb> <prefix>  -> .impeccable/review/<prefix>-{front,side,iso,top}.png */
const file = process.argv[2];
const prefix = process.argv[3] || "model";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  protocolTimeout: 120000,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.setViewport({ width: 600, height: 700 });
await page.goto(`http://127.0.0.1:8765/.impeccable/tools/model-view.html?file=${encodeURIComponent(file)}`);
for (let i = 0; i < 900 && !(await page.evaluate(() => window.ready)); i += 1) await wait(100);
console.log(await page.evaluate(() => JSON.stringify(window.info)));
for (const [name, yaw, elev] of [["front", 0, 0.1], ["side", Math.PI / 2, 0.1], ["iso", Math.PI / 4, 0.6], ["top", 0.3, 1.3]]) {
  await page.evaluate((y, e) => window.view(y, e), yaw, elev);
  await page.screenshot({ path: `../review/${prefix}-${name}.png` });
}
await browser.close();
