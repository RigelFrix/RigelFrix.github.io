/* node gl-errors.mjs [base]: counts WebGL console errors while the world loads and plays its intro */
import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
const t0 = Date.now();
const errors = [];
page.on("console", (m) => m.type() !== "log" && errors.push(`${Date.now() - t0}ms ${m.text().slice(0, 2000)}`));
page.on("pageerror", (e) => errors.push(`${Date.now() - t0}ms pageerror ${e.message}`));
await page.setViewport({ width: 1280, height: 800 });
await page.goto(`${base}?view=world&t=${t0}`, { waitUntil: "domcontentloaded" });
const ready = await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 60000 }).then(() => true, () => false);
console.log(ready ? "ready" : "NOT READY", Date.now() - t0);
if (!ready) {
  errors.slice(0, 8).forEach((e) => console.log(e.slice(0, 600)));
  await browser.close();
  process.exit(1);
}
await wait(12000);
console.log(errors.length, "messages");
errors.slice(0, 8).forEach((e) => console.log(e));
await browser.close();
