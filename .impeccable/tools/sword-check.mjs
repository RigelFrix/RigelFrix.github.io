import puppeteer from "puppeteer-core";

/* node sword-check.mjs [base] [prefix] -> ../review/<prefix>-{ground,pickup,idle,run}.png */
const base = process.argv[2] || "http://127.0.0.1:8765/";
const prefix = process.argv[3] || "sword";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  protocolTimeout: 120000,
  args: ["--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
page.on("console", (msg) => /sword|failed/i.test(msg.text()) && console.log("console", msg.text()));
await page.setViewport({ width: 1100, height: 760 });
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
for (let i = 0; i < 400 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i += 1) await wait(50);
await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
await page.addStyleTag({ content: ".hud, .world-help, .world-labels { display: none !important; }" });
await wait(2500);
const d = (fn, ...args) => page.evaluate(fn, ...args);
console.log("start", JSON.stringify(await d(() => window.PortfolioWorld.debug.sword())));
await page.screenshot({ path: `../review/${prefix}-ground.png` });
await d(() => window.PortfolioWorld.debug.zoom(3));
await wait(1200);
await page.screenshot({ path: `../review/${prefix}-ground-close.png` });
await d(() => window.PortfolioWorld.debug.zoom(null));
await wait(800);

/* Walk toward it: 2.4 screen-right, 0.8 up-screen of the landing. */
const start = await d(() => window.PortfolioWorld.debug.position());
const goal = await d(() => window.PortfolioWorld.debug.sword().at);
const keys = async () => {
  const p = await d(() => window.PortfolioWorld.debug.position());
  const dx = goal[0] - p[0];
  const dz = goal[2] - p[2];
  const right = dx * Math.SQRT1_2 - dz * Math.SQRT1_2;
  const up = -dx * Math.SQRT1_2 - dz * Math.SQRT1_2;
  return { right, up, dist: Math.hypot(dx, dz) };
};
let picked = false;
for (let i = 0; i < 60 && !picked; i += 1) {
  const k = await keys();
  const press = [];
  if (k.right > 0.2) press.push("KeyD");
  if (k.right < -0.2) press.push("KeyA");
  if (k.up > 0.2) press.push("KeyW");
  if (k.up < -0.2) press.push("KeyS");
  for (const key of press) await page.keyboard.down(key);
  await wait(90);
  for (const key of press) await page.keyboard.up(key);
  picked = (await d(() => window.PortfolioWorld.debug.sword())).held;
  if (i === 6) await page.screenshot({ path: `../review/${prefix}-approach.png` });
}
await wait(150);
console.log("after walk", JSON.stringify(await d(() => window.PortfolioWorld.debug.sword())), JSON.stringify(await keys()), "start", start);
await wait(1200);
await d(() => window.PortfolioWorld.debug.zoom(2.6));
await wait(1500);
await page.screenshot({ path: `../review/${prefix}-idle.png`, clip: { x: 350, y: 120, width: 400, height: 520 } });
await d(() => window.PortfolioWorld.debug.zoom(5));
await wait(1500);
await page.screenshot({ path: `../review/${prefix}-hand.png`, clip: { x: 300, y: 80, width: 500, height: 600 } });
await d(() => window.PortfolioWorld.debug.yaw(window.PortfolioWorld.debug.yaw() + Math.PI / 2));
await wait(1200);
await page.screenshot({ path: `../review/${prefix}-hand-side.png`, clip: { x: 300, y: 80, width: 500, height: 600 } });
await d(() => window.PortfolioWorld.debug.yaw(window.PortfolioWorld.debug.yaw() - Math.PI / 2));
await d(() => window.PortfolioWorld.debug.zoom(2.6));
await page.keyboard.down("KeyA");
await wait(700);
await page.screenshot({ path: `../review/${prefix}-run.png`, clip: { x: 350, y: 120, width: 400, height: 520 } });
await page.keyboard.up("KeyA");
await browser.close();
