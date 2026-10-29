import puppeteer from "puppeteer-core";

/* node longsword-check.mjs [base] [prefix] -> ../review/<prefix>-{ground,hand}.png */
const base = process.argv[2] || "http://127.0.0.1:8765/";
const prefix = process.argv[3] || "longsword";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  protocolTimeout: 120000,
  args: ["--ignore-gpu-blocklist"],
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.log("pageerror", error.message));
  page.on("console", (message) => /longsword|failed/i.test(message.text()) && console.log("console", message.text()));
  await page.setViewport({ width: 1100, height: 760 });
  await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 400 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i += 1) await wait(50);
  if (!(await page.evaluate(() => document.documentElement.classList.contains("world-ready")))) throw new Error("World did not become ready");
  await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
  await page.addStyleTag({ content: ".hud, .world-help, .world-labels { display: none !important; }" });
  await wait(2500);
  const read = (fn) => page.evaluate(fn);
  console.log("start", JSON.stringify(await read(() => window.PortfolioWorld.debug.longsword())));
  await page.screenshot({ path: `../review/${prefix}-ground.png` });

  const goal = await read(() => window.PortfolioWorld.debug.longsword().at);
  const movement = async () => {
    const position = await read(() => window.PortfolioWorld.debug.position());
    const dx = goal[0] - position[0];
    const dz = goal[2] - position[2];
    return {
      right: dx * Math.SQRT1_2 - dz * Math.SQRT1_2,
      up: -dx * Math.SQRT1_2 - dz * Math.SQRT1_2,
      distance: Math.hypot(dx, dz),
    };
  };
  let picked = false;
  for (let i = 0; i < 70 && !picked; i += 1) {
    const offset = await movement();
    const keys = [];
    if (offset.right > 0.2) keys.push("KeyD");
    if (offset.right < -0.2) keys.push("KeyA");
    if (offset.up > 0.2) keys.push("KeyW");
    if (offset.up < -0.2) keys.push("KeyS");
    for (const key of keys) await page.keyboard.down(key);
    await wait(90);
    for (const key of keys) await page.keyboard.up(key);
    picked = (await read(() => window.PortfolioWorld.debug.longsword())).held;
  }
  if (!picked) throw new Error(`Longsword pickup failed near ${JSON.stringify(await movement())}`);
  await wait(1200);
  const both = await read(() => ({
    sword: window.PortfolioWorld.debug.sword(true),
    longsword: window.PortfolioWorld.debug.longsword(),
  }));
  if (!both.sword.held || !both.longsword.held) throw new Error(`Could not hold both swords: ${JSON.stringify(both)}`);
  await read(() => window.PortfolioWorld.debug.zoom(4));
  await wait(1000);
  await page.screenshot({ path: `../review/${prefix}-hand.png`, clip: { x: 300, y: 80, width: 500, height: 600 } });
  console.log("both swords held", JSON.stringify(both));
} finally {
  await browser.close();
}
