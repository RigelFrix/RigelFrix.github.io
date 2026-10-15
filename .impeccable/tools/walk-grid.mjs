/* node walk-grid.mjs u0 v0 u1 v1 [base]: prints the walk grid along a strip (rows across, '#' walkable) */
import puppeteer from "puppeteer-core";

const [u0, v0, u1, v1] = process.argv.slice(2, 6).map(Number);
const base = process.argv[6] || "http://127.0.0.1:8765/";
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 60000 });
const rows = await page.evaluate(
  ({ u0, v0, u1, v1 }) => {
    const d = window.PortfolioWorld.debug;
    const S = Math.SQRT1_2;
    const len = Math.hypot(u1 - u0, v1 - v0);
    const [du, dv] = [(u1 - u0) / len, (v1 - v0) / len];
    const out = [];
    for (let t = -0.5; t <= len + 0.5; t += 0.25) {
      let row = "";
      for (let s = -3; s <= 3; s += 0.25) {
        const u = u0 + du * t + dv * s;
        const v = v0 + dv * t - du * s;
        row += d.walkable((u + v) * S, (v - u) * S) ? "#" : ".";
      }
      out.push(`${t.toFixed(2).padStart(6)} ${row}`);
    }
    return out;
  },
  { u0, v0, u1, v1 }
);
console.log(rows.join("\n"));
await browser.close();
