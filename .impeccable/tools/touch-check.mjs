/* node touch-check.mjs [base] [prefix]: portrait phone. Drags a floating stick (shot mid-drag), then taps
   the ground ahead to show the dotted route (shots right after the tap and while walking) */
import puppeteer from "puppeteer-core";

const [base = "http://127.0.0.1:8765/", prefix = "touch"] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => (m.type() === "error" || m.text().startsWith("TOP")) && console.log("console", m.text()));
await page.emulate({
  viewport: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36",
});
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 90000 });
await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
await wait(1500);
await page.bringToFront();

const where = () => page.evaluate(() => window.PortfolioWorld.debug.position?.());
console.log("start", JSON.stringify(await where()));
console.log("focus/top", JSON.stringify(await page.evaluate(() => {
  const c = document.querySelector(".world-canvas");
  const r = c.getBoundingClientRect();
  const top = document.elementsFromPoint(200, 600)[0];
  console.log("TOP", top.outerHTML.slice(0, 200), top.parentElement?.className, getComputedStyle(top).zIndex, getComputedStyle(top).position);
  console.log("TOP order", [...top.parentElement.children].map((e) => `${e.tagName}.${e.className}:${getComputedStyle(e).zIndex}`).join(" | "), getComputedStyle(c).zIndex, document.querySelectorAll(".world-sky").length);
  return [document.hasFocus(), document.elementsFromPoint(200, 600).map((e) => e.className || e.tagName).slice(0, 4), [r.x, r.y, r.width, r.height], getComputedStyle(c).pointerEvents, getComputedStyle(c).display, window.innerWidth, window.innerHeight];
})));
await page.evaluate(() => {
  const c = document.querySelector(".world-canvas");
  for (const type of ["pointerdown", "pointermove", "pointerup"]) c.addEventListener(type, (e) => (window.__ev = (window.__ev || []).concat(`${type}:${e.pointerType}`)));
});

/* Drag: press at (200, 600), pull up-right past the rim, hold */
const t = page.touchscreen;
await t.touchStart(200, 600);
for (let k = 1; k <= 8; k += 1) {
  await t.touchMove(200 + k * 10, 600 - k * 9);
  await wait(30);
}
await wait(2500);
console.log("stick", await page.evaluate(() => document.querySelector(".world-stick")?.className), await page.evaluate(() => (window.__ev || []).slice(0, 4).join(" ")));
await page.screenshot({ path: `../review/${prefix}-stick.png` });
await t.touchEnd();
await wait(600);
console.log("after drag", JSON.stringify(await where()), await page.evaluate(() => document.querySelector(".world-stick")?.className));

/* Tap: walk somewhere down-left */
await t.tap(110, 700);
await wait(500);
await page.screenshot({ path: `../review/${prefix}-route-a.png` });
console.log("route", JSON.stringify(await page.evaluate(() => window.PortfolioWorld.debug.route?.().length)));
await wait(2500);
await page.screenshot({ path: `../review/${prefix}-route-b.png` });
console.log("end", JSON.stringify(await where()));

/* Tap up onto the meadow so the route climbs the stairs over grass */
await t.tap(+(process.env.GX || 330), +(process.env.GY || 220));
await wait(900);
await page.screenshot({ path: `../review/${prefix}-route-c.png` });
await browser.close();
