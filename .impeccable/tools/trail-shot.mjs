/* node trail-shot.mjs [base] [prefix] [u] [v] [keys] [zoom]: Niko placed at (u, v) walks with the held keys
   ("d", "dw"...), then shots right after he stops and 3 s later (grass springs back) */
import puppeteer from "puppeteer-core";

const [base = "http://127.0.0.1:8765/", prefix = "trail", u = "-1", v = "4", keys = "d", zoom = "2.2"] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.setViewport({ width: +(process.env.W || 1280), height: +(process.env.H || 800) });
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 60000 });
await page.evaluate(() => window.PortfolioWorld.debug.finishIntro());
await wait(800);
await page.evaluate(({ u, v, zoom }) => {
  window.PortfolioWorld.debug.placeUV(+u, +v);
  window.PortfolioWorld.debug.zoom(+zoom);
  window.PortfolioWorld.debug.post({ bloom: true });
}, { u, v, zoom });
await wait(1000);
if (keys === "path") {
  /* Hop along +u in small steps, each one stamps the trail, then step off to the side */
  for (let k = 0; k <= 16; k += 1) {
    await page.evaluate(({ u, v, k }) => window.PortfolioWorld.debug.placeUV(+u - 1 + k * 0.125, +v), { u, v, k });
    await wait(250);
  }
  await page.evaluate(({ u, v, au, av }) => window.PortfolioWorld.debug.placeUV(+u + au, +v + av), { u, v, au: +(process.env.AU || 0), av: +(process.env.AV || -1.5) });
  await wait(300);
} else {
  if (keys !== "-") await page.mouse.click(5, 400);
  for (const k of keys) await page.keyboard.down(k);
  await wait(+(process.env.WALK || 5000));
  for (const k of keys) await page.keyboard.up(k);
}
await page.screenshot({ path: `../review/${prefix}-a.png` });
await wait(3000);
await page.screenshot({ path: `../review/${prefix}-b.png` });
await browser.close();
