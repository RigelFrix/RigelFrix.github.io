import puppeteer from "puppeteer-core";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  protocolTimeout: 15000,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => console.log("console", m.type(), m.text()));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`http://127.0.0.1:8765/?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
for (let i = 0; i < 12; i += 1) {
  await wait(700);
  try {
    console.log(i, await page.evaluate(() => document.documentElement.className + " gsap:" + Boolean(window.gsap)));
  } catch (e) {
    console.log(i, "eval failed", e.message.slice(0, 80));
  }
}
await browser.close();
