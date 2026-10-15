/* node walk-trace.mjs <stopId> [fromU] [fromV] [base]: places Niko, walks him to a stop, logs where he is every 2s */
import puppeteer from "puppeteer-core";

const [id = "resume", fu = "13.2", fv = "-6", base = "http://127.0.0.1:8765/"] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
await page.setViewport({ width: 1280, height: 800 });
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 60000 });
await page.evaluate(() => window.PortfolioWorld.debug.finishIntro());
await wait(600);
const info = await page.evaluate(
  ({ id, fu, fv }) => {
    const d = window.PortfolioWorld.debug;
    d.placeUV(fu, fv);
    window.PortfolioWorld.walkTo(id);
    return d.route?.();
  },
  { id, fu: +fu, fv: +fv }
);
console.log("route", JSON.stringify(info));
for (let k = 0; k < 15; k += 1) {
  await wait(2000);
  const p = await page.evaluate(() => window.PortfolioWorld.debug.position().map((n) => +n.toFixed(2)));
  const prompt = await page.evaluate(() => (document.querySelector("#world-prompt").hidden ? null : document.querySelector("#world-prompt").innerText.trim()));
  console.log(k, JSON.stringify(p), prompt);
}
await page.screenshot({ path: `../review/walk-${id}.png` });
await browser.close();
