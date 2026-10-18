import puppeteer from "puppeteer-core";
import fs from "node:fs";

const file = process.argv[2];
const prefix = process.argv[3] || "pose";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  protocolTimeout: 120000,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => /error|warn/i.test(m.type()) && console.log("console", m.text().slice(0, 300)));
await page.setViewport({ width: 700, height: 800, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:8765/.impeccable/tools/pose-view.html?file=${encodeURIComponent(file)}&t=${Date.now()}`);
for (let i = 0; i < 900 && !(await page.evaluate(() => window.ready)); i += 1) await wait(100);
const info = await page.evaluate(() => window.info);
fs.writeFileSync(`../review/${prefix}.json`, JSON.stringify(info, null, 2));
console.log(prefix, "meshes", info?.meshes?.length, "bones", info?.bones?.length);
for (const [name, yaw, elev] of [["front", 0, 0.05], ["side", Math.PI / 2, 0.05], ["back", Math.PI, 0.05]]) {
  await page.evaluate((y, e) => window.view(y, e, 2.1), yaw, elev);
  await page.screenshot({ path: `../review/${prefix}-${name}.png` });
}
const head = info?.bones?.find((b) => /Head$/.test(b.name));
if (head) {
  await page.evaluate((p) => window.focus(p[0], p[1], p[2], 0.35), head.p);
  await page.screenshot({ path: `../review/${prefix}-face.png` });
}
await browser.close();
