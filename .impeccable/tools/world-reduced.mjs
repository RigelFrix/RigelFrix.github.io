import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const outDir = process.argv[3] || "../review";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

const page = await browser.newPage();
page.on("pageerror", (error) => console.log("reduced pageerror", error.message));
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
await page.setViewport({ width: 1280, height: 800 });
await page.goto(`${base}?view=world`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 20000 });
await page.evaluate(() => window.PortfolioWorld.walkTo("skills"));
await page.waitForFunction(() => document.querySelector("#moves.is-open"), { timeout: 45000 });
await wait(300);
console.log(
  "reduced skills panel",
  await page.evaluate(() => {
    const s = document.querySelector("#moves");
    const li = s.querySelector(".move-list li");
    return { opacity: getComputedStyle(s).opacity, item: getComputedStyle(li).opacity, focus: document.activeElement.id };
  })
);
await page.screenshot({ path: `${outDir}/desktop-world-reduced-skills.png` });

const classic = await browser.newPage();
await classic.setViewport({ width: 1280, height: 800 });
await classic.goto(`${base}?view=classic`, { waitUntil: "networkidle2" });
await wait(1800);
await classic.screenshot({ path: `${outDir}/desktop-classic-hud.png`, clip: { x: 0, y: 0, width: 1280, height: 90 } });

await browser.close();
