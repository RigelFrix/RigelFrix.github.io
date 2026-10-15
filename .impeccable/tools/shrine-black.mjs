/* node shrine-black.mjs [base] [prefix] [gpu]: iPhone SE emulation (375x667, DPR 2, touch) at the shrine.
   Shots: as is, bloom off, beam off, shrine star off. Pass gpu=1 to try the real GPU instead of swiftshader. */
import puppeteer from "puppeteer-core";

const [base = "http://127.0.0.1:8765/", prefix = "sb", gpu = "0"] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: gpu === "1" ? false : true,
  args: gpu === "1" ? ["--ignore-gpu-blocklist", "--window-size=420,760"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => m.type() === "error" && console.log("console", m.text()));
await page.emulate({
  viewport: { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
await page.goto(`${base}?view=world&diag=1&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 90000 });
await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
await wait(1000);
await page.evaluate(() => {
  const d = window.PortfolioWorld.debug;
  d.placeUV(-1, -9);
  d.pixelRatio(1.5);
});
const shot = async (name, js) => {
  await page.evaluate(js || "0");
  await wait(1500);
  await page.screenshot({ path: `../review/${prefix}-${name}.png` });
};
await shot("asis");
await shot("nobloom", "PortfolioWorld.debug.post({ bloom: false })");
await shot("bloom-nobeam", "PortfolioWorld.debug.post({ bloom: true }); PortfolioWorld.debug.island().beamMat.visible = false");
await shot("bloom-nostar", "PortfolioWorld.debug.island().beamMat.visible = true; PortfolioWorld.debug.shrineStar().visible = false");
await browser.close();
