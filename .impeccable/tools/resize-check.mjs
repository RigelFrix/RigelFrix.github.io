import puppeteer from "puppeteer-core";

/* A docked DevTools panel resizes the page on every tab switch. The robot should stay centred. */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
await page.setViewport({ width: 1280, height: 760 });
await page.goto("file:///C:/Users/User/Documents/personal/RigelFrix.github.io/index.html?view=world", { waitUntil: "load" });
await wait(3000);

const frame = async (label) => {
  await wait(700);
  const info = await page.evaluate(() => {
    const w = document.querySelector("#world");
    const about = [...document.querySelectorAll(".world-plate")].find((p) => p.textContent === "About me").getBoundingClientRect();
    return { w: w.clientWidth, h: w.clientHeight, aboutX: Math.round(about.x + about.width / 2), aboutY: Math.round(about.y) };
  });
  await page.screenshot({ path: `../review/resize-${label}.png` });
  console.log(label, info);
};

await frame("wide");
await page.setViewport({ width: 700, height: 760 });
await frame("devtools");
await page.setViewport({ width: 1280, height: 760 });
await frame("wide-again");
await browser.close();
