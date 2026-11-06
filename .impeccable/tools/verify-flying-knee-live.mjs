import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8772;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".fbx": "application/octet-stream",
};

const server = http
  .createServer((req, res) => {
    let url = decodeURIComponent(req.url.split("?")[0]);
    if (url.endsWith("/")) url += "index.html";
    const file = path.join(root, url);
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    });
  })
  .listen(port, "127.0.0.1");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  console.log(`Test server running at http://127.0.0.1:${port}/`);
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
    protocolTimeout: 60000,
    args: ["--ignore-gpu-blocklist", "--use-gl=angle"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`http://127.0.0.1:${port}/?view=world&skip=1`, { waitUntil: "domcontentloaded" });

  for (let i = 0; i < 200 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i++) {
    await wait(50);
  }

  // Finish intro if active
  await page.evaluate(() => {
    if (window.PortfolioWorld?.debug?.finishIntro) {
      window.PortfolioWorld.debug.finishIntro();
    }
  });

  await wait(600);

  // Focus the canvas
  await page.click("#world canvas");
  await wait(200);

  // Check initial state
  const initial = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    const bot = pw?.debug?.bot?.();
    const pos = pw?.debug?.position?.();
    return {
      hasBot: Boolean(bot),
      hasPunchAction: Boolean(bot?.actions?.punch),
      timeScale: bot?.actions?.punch?.getEffectiveTimeScale(),
      position: pos,
    };
  });
  console.log("Initial state:", JSON.stringify(initial, null, 2));

  if (initial.timeScale !== 1.5) {
    throw new Error(`Expected timeScale 1.5, got ${initial.timeScale}`);
  }

  // Record initial position
  const posStart = initial.position;

  // Press 'F' key
  console.log("\n--- Triggering Refined Flying Knee Combo ('F' key) ---");
  await page.keyboard.press("KeyF");

  // Wait 150ms (well within keyframes 0-14, which last ~311ms at 1.5x)
  await wait(150);

  const keyframe0to14Check = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    const bot = pw?.debug?.bot?.();
    const state = pw?.debug?.state?.();
    const pos = pw?.debug?.position?.();
    return {
      punching: state?.punching,
      punchTimer: state?.punchTimer, // In clip seconds
      position: pos,
      punchWeight: bot?.actions?.punch?.getEffectiveWeight(),
      idleWeight: bot?.actions?.idle?.getEffectiveWeight(),
      runWeight: bot?.actions?.run?.getEffectiveWeight(),
    };
  });

  console.log("During Keyframes 0-14 check:", keyframe0to14Check);

  const dx = keyframe0to14Check.position[0] - posStart[0];
  const dz = keyframe0to14Check.position[2] - posStart[2];
  const distMoved0to14 = Math.hypot(dx, dz);
  console.log(`Displacement during keyframes 0-14: ${distMoved0to14.toFixed(4)}m`);

  if (distMoved0to14 < 0.20) {
    throw new Error(`Niko failed to move forward during keyframes 0-14! dist=${distMoved0to14}`);
  }

  // Interruption resistance check during combo
  await page.keyboard.down("KeyW");
  await page.keyboard.press("KeyF");
  await wait(200);
  await page.keyboard.up("KeyW");

  const midCheck = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    const bot = pw?.debug?.bot?.();
    const state = pw?.debug?.state?.();
    return {
      punching: state?.punching,
      punchTimer: state?.punchTimer,
      punchWeight: bot?.actions?.punch?.getEffectiveWeight(),
      runWeight: bot?.actions?.run?.getEffectiveWeight(),
    };
  });
  console.log("Mid-combo interruption test:", midCheck);
  if (midCheck.runWeight > 0.001 || midCheck.punchWeight !== 1.0) {
    throw new Error("Combo was overtaken or diluted during execution!");
  }

  // Wait for Knee Apex (t ~ 0.95s clip time -> ~0.63s wall time from start)
  await wait(350);

  const kneeApexCheck = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    const bot = pw?.debug?.bot?.();
    const state = pw?.debug?.state?.();
    const hipsY = bot?.bones?.Hips?.position?.y;
    return {
      punching: state?.punching,
      punchTimer: state?.punchTimer,
      punchImpacted1: state?.punchImpacted1,
      hipsY: hipsY,
    };
  });
  console.log("\nFlying Knee Apex:", kneeApexCheck);
  if (!kneeApexCheck.punchImpacted1) {
    throw new Error("Hit 1 (flying knee apex) was not triggered!");
  }

  // Wait for Diving Slam (t ~ 1.80s clip time -> ~1.20s wall time; waited ~700ms so far, wait 650ms more)
  await wait(650);

  const divingSlamCheck = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    const bot = pw?.debug?.bot?.();
    const state = pw?.debug?.state?.();
    return {
      punching: state?.punching,
      punchTimer: state?.punchTimer,
      punchImpacted2: state?.punchImpacted2,
    };
  });
  console.log("Diving Fist Slam:", divingSlamCheck);
  if (!divingSlamCheck.punchImpacted2) {
    throw new Error("Hit 2 (diving fist slam) was not triggered!");
  }

  // Wait for completion (2.667s clip / 1.5 = 1.78s wall clock; waited ~1.35s total, wait 600ms more)
  console.log("\n--- Waiting for completion (1.5x fast combo) ---");
  await wait(650);

  const finalCheck = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    const bot = pw?.debug?.bot?.();
    const state = pw?.debug?.state?.();
    const pos = pw?.debug?.position?.();
    return {
      punching: state?.punching,
      punchTimer: state?.punchTimer,
      punchWeight: bot?.actions?.punch?.getEffectiveWeight(),
      idleWeight: bot?.actions?.idle?.getEffectiveWeight(),
      runWeight: bot?.actions?.run?.getEffectiveWeight(),
      finalPos: pos,
    };
  });
  console.log("After combo completion (wall-clock ~1.85s):", finalCheck);

  if (finalCheck.punching !== false || finalCheck.punchWeight !== 0.0 || finalCheck.idleWeight < 0.95) {
    throw new Error("Combo did not complete cleanly to idle on time!");
  }

  const totalDx = finalCheck.finalPos[0] - posStart[0];
  const totalDz = finalCheck.finalPos[2] - posStart[2];
  const totalTravel = Math.hypot(totalDx, totalDz);
  console.log(`Total forward leap combo travel distance: ${totalTravel.toFixed(3)}m`);

  // Capture screenshot of completed pose
  fs.mkdirSync(".impeccable/review", { recursive: true });
  await page.screenshot({ path: ".impeccable/review/flying-knee-1.5x-verified.png" });
  console.log("Saved screenshot to .impeccable/review/flying-knee-1.5x-verified.png");

  if (errors.length) {
    console.warn("Browser warnings/errors:", errors);
  } else {
    console.log("Console errors: 0 (clean)");
  }

  console.log("\nALL REFINED 1.5X SPEED & KEYFRAME 0-14 FORWARD MOTION CHECKS PASSED!");
  await browser.close();
} catch (err) {
  console.error("Test failed:", err);
  process.exit(1);
} finally {
  server.close();
}
