import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8776;
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
    window.PortfolioWorld?.debug?.zoom?.(3.0);
  });

  await wait(600);

  // Focus the canvas
  await page.click("#world canvas");
  await wait(200);

  // Check initial smear state
  const initial = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    const smear = pw?.debug?.nikoSmear?.();
    return {
      hasSmear: Boolean(smear),
      smearActive: smear?.active,
      stretch: smear?.stretch,
    };
  });
  console.log("Initial state:", JSON.stringify(initial, null, 2));

  if (!initial.hasSmear || initial.smearActive !== false) {
    throw new Error("Initial nikoSmear setup check failed!");
  }

  // Press 'F' key to trigger combo
  console.log("\n--- Triggering combo ('F' key) ---");
  await page.keyboard.press("KeyF");

  // Sample during frames 15-25 (before frame 33)
  await page.waitForFunction(() => {
    const f = window.PortfolioWorld?.debug?.punchHitbox?.().frame;
    return f >= 15 && f <= 28;
  }, { timeout: 5000 });

  const samplePre = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    const hitbox = pw?.debug?.punchHitbox?.();
    const smear = pw?.debug?.nikoSmear?.();
    return {
      frame: hitbox?.frame,
      smearActive: smear?.active,
      stretch: smear?.stretch,
    };
  });
  console.log("Sample Pre-Smear (frame ~20):", samplePre);

  if (samplePre.smearActive !== false || samplePre.stretch > 0) {
    throw new Error(`Smear should NOT be active before frame 33! frame=${samplePre.frame}`);
  }

  // Wait until frame enters 34-41 window (Left arm swing)
  await page.waitForFunction(() => {
    const f = window.PortfolioWorld?.debug?.punchHitbox?.().frame;
    return f >= 34 && f <= 41;
  }, { timeout: 5000 });

  const sampleActive = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    const hitbox = pw?.debug?.punchHitbox?.();
    const smear = pw?.debug?.nikoSmear?.();
    return {
      frame: hitbox?.frame,
      hitboxActive: hitbox?.active,
      smearActive: smear?.active,
      stretch: smear?.stretch,
      armSide: smear?.armSide,
      lagDistance: smear?.lagDistance,
    };
  });
  console.log("Sample DURING Smear (frame 33-42):", sampleActive);

  if (sampleActive.smearActive !== true || sampleActive.stretch <= 0) {
    throw new Error(`Smear MUST be active during frames 33-42! frame=${sampleActive.frame}, active=${sampleActive.smearActive}`);
  }
  if (sampleActive.armSide !== -1.0) {
    throw new Error(`Smear armSide MUST be -1.0 (Left Arm)! got=${sampleActive.armSide}`);
  }

  // Capture screenshot of left arm smear
  fs.mkdirSync(".impeccable/review", { recursive: true });
  await page.screenshot({ path: ".impeccable/review/niko-left-arm-smear.png" });
  console.log("Saved left arm smear screenshot to .impeccable/review/niko-left-arm-smear.png");

  // Wait until frame passes 43
  await page.waitForFunction(() => {
    const f = window.PortfolioWorld?.debug?.punchHitbox?.().frame;
    return f >= 44;
  }, { timeout: 5000 });

  const samplePost = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    const hitbox = pw?.debug?.punchHitbox?.();
    const smear = pw?.debug?.nikoSmear?.();
    return {
      frame: hitbox?.frame,
      smearActive: smear?.active,
      stretch: smear?.stretch,
    };
  });
  console.log("Sample Post-Smear (frame 44+):", samplePost);

  if (samplePost.smearActive !== false || samplePost.stretch > 0) {
    throw new Error(`Smear should deactivate after frame 42! frame=${samplePost.frame}, active=${samplePost.smearActive}`);
  }

  // Wait for combo completion
  await page.waitForFunction(() => {
    return !window.PortfolioWorld?.debug?.state?.().punching;
  }, { timeout: 5000 });

  const sampleEnd = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    const smear = pw?.debug?.nikoSmear?.();
    return {
      smearActive: smear?.active,
      stretch: smear?.stretch,
    };
  });
  console.log("After combo completion:", sampleEnd);

  if (sampleEnd.smearActive !== false) {
    throw new Error("Smear was not cleanly deactivated at combo end!");
  }

  if (errors.length) {
    console.warn("Browser warnings/errors:", errors);
  } else {
    console.log("Console errors: 0 (clean)");
  }

  console.log("\nALL NIKO LEFT ARM SMEAR (FRAMES 33-42) CHECKS PASSED!");
  await browser.close();
} catch (err) {
  console.error("Test failed:", err);
  process.exit(1);
} finally {
  server.close();
}

