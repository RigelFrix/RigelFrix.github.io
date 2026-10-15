import puppeteer from "puppeteer-core";

/* The play-world skip link sits off screen until focused. */

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
await page.goto("file:///C:/Users/User/Documents/personal/RigelFrix.github.io/index.html?view=world", { waitUntil: "load" });
const box = () => page.evaluate(() => Math.round(document.querySelector(".skip-link.world-only").getBoundingClientRect().bottom));
console.log("idle bottom", await box());
await page.keyboard.press("Tab");
console.log("focused bottom", await box());
await browser.close();
