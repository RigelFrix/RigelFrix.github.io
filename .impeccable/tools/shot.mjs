/* node shot.mjs <url> <out.png> [width] [height] [waitTitle]: screenshot any page once its title says "ready" */
import puppeteer from "puppeteer-core";

const [url, out, width = "900", height = "900", wait = "ready"] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
page.on("console", (m) => console.log("console", m.text()));
await page.setViewport({ width: +width, height: +height });
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction((t) => document.title === t, { timeout: 60000 }, wait);
await page.screenshot({ path: out });
await browser.close();
