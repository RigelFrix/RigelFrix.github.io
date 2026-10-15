/* node zoom-check.mjs [base] [prefix]: desktop wheel zoom in/out, then a phone pinch (CDP two-finger touch)
   and a long stick drag (the base must stay where the drag began). Prints camera zoom after each step. */
import puppeteer from "puppeteer-core";

const [base = "http://127.0.0.1:8765/", prefix = "zoom"] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const zoomOf = (page) => page.evaluate(() => +window.PortfolioWorld.debug.camera?.()?.zoom || null);
const open = async (mobile) => {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  if (mobile) await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile" });
  else await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 90000 });
  await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
  await wait(1500);
  await page.bringToFront();
  return page;
};
const camZoom = (page) => page.evaluate(() => window.__zoom?.());

/* Desktop wheel */
const desk = await open(false);
await desk.evaluate(() => (window.__zoom = () => window.PortfolioWorld.debug.zoomNow()));
console.log("desk start", await camZoom(desk));
await desk.mouse.move(640, 400);
for (let k = 0; k < 4; k += 1) {
  await desk.mouse.wheel({ deltaY: -120 });
  await wait(120);
}
await wait(1500);
console.log("desk after wheel in", await camZoom(desk));
await desk.screenshot({ path: `../review/${prefix}-desk-in.png` });
for (let k = 0; k < 8; k += 1) {
  await desk.mouse.wheel({ deltaY: 120 });
  await wait(120);
}
await wait(1500);
console.log("desk after wheel out", await camZoom(desk));
await desk.close();

/* Phone pinch */
const phone = await open(true);
await phone.evaluate(() => (window.__zoom = () => window.PortfolioWorld.debug.zoomNow()));
const cdp = await phone.createCDPSession();
const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
console.log("phone start", await camZoom(phone));
await touch("touchStart", [[195, 420]]);
await touch("touchStart", [[195, 420], [195, 520]]);
for (let k = 1; k <= 10; k += 1) {
  await touch("touchMove", [[195, 420 - k * 12], [195, 520 + k * 12]]);
  await wait(40);
}
await touch("touchEnd", []);
await wait(800);
console.log("phone after pinch out (zoom in)", await camZoom(phone), "stick", await phone.evaluate(() => document.querySelector(".world-stick").className));
await phone.screenshot({ path: `../review/${prefix}-pinch.png` });

/* Long stick drag: base must not move */
await touch("touchStart", [[120, 650]]);
for (let k = 1; k <= 12; k += 1) {
  await touch("touchMove", [[120 + k * 12, 650 - k * 10]]);
  await wait(30);
}
await wait(1500);
console.log("stick", await phone.evaluate(() => {
  const el = document.querySelector(".world-stick");
  const r = el.getBoundingClientRect();
  const k = el.firstElementChild.getBoundingClientRect();
  return [el.className, Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2), Math.round(k.x + k.width / 2), Math.round(k.y + k.height / 2)].join(" ");
}));
await phone.screenshot({ path: `../review/${prefix}-stick.png` });
await touch("touchEnd", []);
await browser.close();
