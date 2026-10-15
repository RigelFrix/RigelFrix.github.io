/* node load-order.mjs [base]: when Niko's model is ready vs when the loading screen hands over (world-ready) */
import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
page.on("console", (m) => m.type() === "error" && console.log("console", m.text()));
await page.setViewport({ width: 1000, height: 600 });
const start = Date.now();
await page.goto(`${base}?view=world&t=${start}`, { waitUntil: "domcontentloaded" });
const seen = {};
while (Date.now() - start < 30000 && !seen.ready) {
  const s = await page.evaluate(() => ({
    niko: Boolean(window.PortfolioWorld?.debug?.bot?.()?.model),
    ready: document.documentElement.classList.contains("world-ready"),
    pct: document.querySelector(".world-boot-pct")?.textContent,
  }));
  for (const key of ["niko", "ready"]) if (s[key] && !seen[key]) seen[key] = { ms: Date.now() - start, pct: s.pct };
  await new Promise((r) => setTimeout(r, 50));
}
console.log(JSON.stringify(seen));
await browser.close();
