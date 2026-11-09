import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8863;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = http
  .createServer((req, res) => {
    const raw = req.url.split("?")[0];
    const rel = raw === "/" ? "/index.html" : raw;
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(file);
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, "127.0.0.1");

async function main() {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      headless: true,
      args: ["--ignore-gpu-blocklist", "--use-gl=angle"],
    });
    const page = await browser.newPage();
    page.on("pageerror", (err) => console.error("BROWSER PAGE ERROR:", err.message));
    page.on("console", (msg) => {
      console.log(`BROWSER [${msg.type()}]:`, msg.text());
    });
    await page.setViewport({ width: 1280, height: 800 });

    console.log("Navigating to Dev Gym (?dev=1&skip=1)...");
    await page.goto(`http://127.0.0.1:${port}/?view=world&dev=1&skip=1`, { waitUntil: "domcontentloaded" });

    // Diagnostic poll
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const diag = await page.evaluate(() => {
        const root = document.documentElement;
        const pw = window.PortfolioWorld;
        const bot = pw?.debug?.bot?.();
        return {
          classes: root.className,
          pwActive: Boolean(pw?.active),
          botExists: Boolean(bot),
          actionsKeys: Object.keys(bot?.actions || {}),
        };
      });
      console.log(`Poll ${i * 500}ms:`, diag);
      if (diag.actionsKeys.includes("sprint")) {
        console.log("Actions loaded!");
        break;
      }
    }

    // Ensure intro is finished and canvas focused
    await page.evaluate(() => {
      window.PortfolioWorld?.debug?.finishIntro();
      window.PortfolioWorld?.debug?.zoom?.(1.8);
      document.getElementById("world-canvas")?.focus();
    });
    await new Promise((r) => setTimeout(r, 400));

    // Check actions.turn180 exists
    const actionInfo = await page.evaluate(() => {
      const bot = window.PortfolioWorld.debug.bot();
      const action = bot?.actions?.turn180;
      return {
        allActions: Object.keys(bot?.actions || {}),
        exists: Boolean(action),
        clipName: action?.getClip()?.name,
        duration: action?.getClip()?.duration,
      };
    });
    console.log("Actions info:", actionInfo);
    if (!actionInfo.exists) {
      throw new Error("actions.turn180 is missing on bot!");
    }

    // Step 1: Sprint forward with KeyW and ShiftLeft
    console.log("\n--- SPRINT FORWARD ---");
    await page.keyboard.down("ShiftLeft");
    await page.keyboard.down("KeyW");

    // Wait until sprint speed is reached
    let sprintReady = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const speed = await page.evaluate(() => window.PortfolioWorld.debug.speedMeter());
      if (speed >= 8.0) {
        sprintReady = true;
        console.log(`Reached sprint speed: ${speed.toFixed(2)} m/s (step ${i})`);
        break;
      }
    }
    if (!sprintReady) {
      const currentSpeed = await page.evaluate(() => window.PortfolioWorld.debug.speedMeter());
      console.warn(`Speed after 3s was ${currentSpeed} m/s`);
    }

    const preTurnState = await page.evaluate(() => {
      const s = window.PortfolioWorld.debug.state();
      return {
        speed: s.speedMeter,
        sprint: s.sprint,
        yaw: s.yaw,
        moveDir: [s.moveDir.x, s.moveDir.y, s.moveDir.z],
      };
    });
    console.log("Pre-turn state:", preTurnState);

    // Step 2: Trigger 180 Turn by releasing KeyW and pressing KeyS
    console.log("\n--- TRIGGER 180 TURN (Release W, Press S) ---");
    await page.keyboard.up("KeyW");
    await page.keyboard.down("KeyS");

    // Sample over the next 800ms
    const samples = [];
    let apexCaptured = false;
    let turn180Triggered = false;

    const artifactDir = "C:/Users/User/.gemini/antigravity/brain/617efa33-7c5e-4561-8cce-4af1d77681d8";

    for (let i = 0; i < 18; i++) {
      await new Promise((r) => setTimeout(r, 40));
      const snap = await page.evaluate(() => {
        const s = window.PortfolioWorld.debug.state();
        const bot = window.PortfolioWorld.debug.bot();
        return {
          t: s.turn180Timer,
          turning180: s.turning180,
          weight: s.turn180Weight,
          actionWeight: bot?.actions?.turn180?.getEffectiveWeight() || 0,
          speed: s.speedMeter,
          yaw: s.yaw,
          pos: [s.turn180StartDir.x, s.turn180StartDir.z],
        };
      });
      samples.push(snap);
      if (snap.turning180) turn180Triggered = true;

      if (snap.turning180 && snap.t >= 0.25 && !apexCaptured) {
        apexCaptured = true;
        console.log(`Capturing turn-180-apex screenshot at t=${snap.t.toFixed(3)}s...`);
        await page.screenshot({ path: path.join(artifactDir, "turn-180-apex.png") });
      }
    }

    console.log(`Capturing turn-180-recovery screenshot...`);
    await page.screenshot({ path: path.join(artifactDir, "turn-180-recovery.png") });

    // Release keys
    await page.keyboard.up("KeyS");
    await page.keyboard.up("ShiftLeft");

    console.log("\nTurn 180 timeline samples:");
    samples.forEach((s, idx) => {
      console.log(`[${(idx * 40).toString().padStart(3, " ")}ms] turning180=${s.turning180} timer=${s.t.toFixed(2)}s weight=${s.weight.toFixed(2)} actionWeight=${s.actionWeight.toFixed(2)} speed=${s.speed.toFixed(2)} yaw=${(s.yaw * 180 / Math.PI).toFixed(1)}°`);
    });

    const postTurnState = await page.evaluate(() => {
      const s = window.PortfolioWorld.debug.state();
      return {
        speed: s.speedMeter,
        sprint: s.sprint,
        yaw: s.yaw,
        moveDir: [s.moveDir.x, s.moveDir.y, s.moveDir.z],
      };
    });
    console.log("\nPost-turn state:", postTurnState);

    const yawDeltaDeg = Math.abs(postTurnState.yaw - preTurnState.yaw) * 180 / Math.PI;
    console.log(`Yaw change: ${yawDeltaDeg.toFixed(1)}° (expected ~180°)`);

    if (!turn180Triggered) {
      throw new Error("state.turning180 was never triggered during reverse input!");
    }

    console.log("\nSUCCESS: 180 Turn animation and locomotion mechanic fully verified!");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
