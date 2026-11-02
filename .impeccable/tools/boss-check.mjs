import puppeteer from "puppeteer-core";

/* node boss-check.mjs [base] [prefix] -> ../review/<prefix>-{idle,run,windup,smear,impact}.png */
const base = process.argv[2] || "http://127.0.0.1:8765/";
const prefix = process.argv[3] || "boss-anim";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  protocolTimeout: 120000,
  args: ["--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
page.on("console", (msg) => /boss|werewolf|failed|error/i.test(msg.text()) && console.log("console", msg.text()));
await page.setViewport({ width: 1200, height: 800 });
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
for (let i = 0; i < 400 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i += 1) await wait(50);
await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
await page.addStyleTag({ content: ".hud, .world-help, .world-labels { display: none !important; }" });
await wait(1600);

const d = (fn, ...args) => page.evaluate(fn, ...args);
await d(() => window.PortfolioWorld.debug.zoom(2.35));
await wait(700);

/* 1. Stylistic Idle */
console.log("idle", JSON.stringify(await d(() => window.PortfolioWorld.debug.boss({ mode: "idle", time: null, resetPos: true }))));
await wait(350);
await page.screenshot({ path: `../review/${prefix}-idle.png` });

/* 2. Stylistic Run */
console.log("run", JSON.stringify(await d(() => window.PortfolioWorld.debug.boss({ mode: "run", inPlace: true, time: 0.16 }))));
await wait(250);
await page.screenshot({ path: `../review/${prefix}-run.png` });

/* 3. Right-Hand Swing Wind-up (arm extended wide back-right) */
console.log("windup", JSON.stringify(await d(() => window.PortfolioWorld.debug.boss({ mode: "punch", time: 0.44 }))));
await wait(250);
await page.screenshot({ path: `../review/${prefix}-windup.png` });

/* 4. Right-Hand Wide Arc Swing (Godot mesh-smearing forming along the curved hand/arm arc) */
console.log("smear", JSON.stringify(await d(() => window.PortfolioWorld.debug.boss({ mode: "punch", time: 0.54 }))));
await wait(250);
await page.screenshot({ path: `../review/${prefix}-smear.png` });

/* 5. Follow-Through & Smear Settle (smear settling back into the hand/arm mesh) */
console.log("impact", JSON.stringify(await d(() => window.PortfolioWorld.debug.boss({ mode: "punch", time: 0.68 }))));
await wait(250);
await page.screenshot({ path: `../review/${prefix}-impact.png` });

/* Restore auto mode */
await d(() => window.PortfolioWorld.debug.boss({ mode: "auto", inPlace: false, time: null, resetPos: true }));
await browser.close();
