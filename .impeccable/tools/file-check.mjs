import puppeteer from "puppeteer-core";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("console", (msg) => ["error", "warning"].includes(msg.type()) && console.log("console", msg.type(), msg.text().slice(0, 200)));
page.on("pageerror", (error) => console.log("pageerror", error.message));
await page.setViewport({ width: 1280, height: 800 });
await page.goto("file:///C:/Users/User/Documents/personal/RigelFrix.github.io/index.html?view=world", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 60000 });
console.log("ready", await page.evaluate(() => document.documentElement.className));
await page.evaluate(() => window.PortfolioWorld.walkTo("about"));
const opened = await page
  .waitForFunction(() => document.querySelector("#player.is-open"), { timeout: 45000 })
  .then(() => true, () => false);
console.log("about opened", opened);
await page.keyboard.press("Escape");
await wait(1500);
await page.screenshot({ path: "../review/desktop-world-file.png" });
console.log("12s", await page.evaluate(() => document.documentElement.className));
await browser.close();
