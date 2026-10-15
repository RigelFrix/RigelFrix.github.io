import puppeteer from "puppeteer-core";

const file = process.argv[2] || "/Low-Poly Starry Mage Explorer.glb";
const prefix = process.argv[3] || "glb";
const extra = process.argv[4] || "";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  protocolTimeout: 120000,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => console.log("console", m.text()));
await page.setViewport({ width: 700, height: 800 });
await page.goto(`http://127.0.0.1:8765/.impeccable/tools/glb-preview.html?file=${encodeURIComponent(file)}${extra}`);
for (let i = 0; i < 600 && !(await page.evaluate(() => window.ready)); i += 1) await wait(100);
console.log(await page.evaluate(() => JSON.stringify(window.info)));
const views = [
  ["front", 0, 0.1, 1],
  ["side", Math.PI / 2, 0.1, 1],
  ["back", Math.PI, 0.1, 1],
  ["iso", Math.PI / 4, 0.6, 1],
  ["face", 0, 0.05, 3.2, "head"],
  ["face-high", 0, 0.5, 3.2, "head"],
  ["face-34", 0.6, 0.35, 3.2, "head"],
  ["hand", 0.5, 0.5, 7, "LeftHand"],
  ["hand-under", 0.9, -0.6, 7, "LeftHand"],
];
for (const [name, yaw, elev, zoom, focus] of views) {
  await page.evaluate((y, e, z, f) => {
    let t = null;
    if (f === "head") t = window.boneAt("Head").map((v, k) => v + (k === 1 ? 0.06 : 0));
    else if (f) t = window.boneAt(f).map((v, k) => v + (k === 0 ? 0.035 : 0));
    window.view(y, e, z, t);
  }, yaw, elev, zoom, focus || null);
  await page.screenshot({ path: `.impeccable/review/${prefix}-${name}.png` });
}
await browser.close();
