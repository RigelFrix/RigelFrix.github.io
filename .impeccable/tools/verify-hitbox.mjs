import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8775;
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
    const hitbox = pw?.debug?.punchHitbox?.();
    return {
      hasBot: Boolean(bot),
      hasLeftHandBone: Boolean(bot?.bones?.LeftHand),
      hasHitbox: Boolean(hitbox),
      hitboxActive: hitbox?.active,
      hitboxFrame: hitbox?.frame,
    };
  });
  console.log("Initial state:", JSON.stringify(initial, null, 2));

  if (!initial.hasLeftHandBone || !initial.hasHitbox || initial.hitboxActive !== false) {
    throw new Error("Initial hitbox setup check failed!");
  }

  // Press 'F' key to trigger combo
  console.log("\n--- Triggering combo ('F' key) ---");
  await page.keyboard.press("KeyF");

  // Sample during frames 10-25
  await page.waitForFunction(() => {
    const f = window.PortfolioWorld?.debug?.punchHitbox?.().frame;
    return f >= 15 && f <= 30;
  }, { timeout: 5000 });

  const samplePre = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    const state = pw?.debug?.state?.();
    const hitbox = pw?.debug?.punchHitbox?.();
    return {
      punching: state?.punching,
      punchTimer: state?.punchTimer,
      frame: hitbox?.frame,
      active: hitbox?.active,
    };
  });
  console.log("Sample Pre-Hitbox (frame ~20):", samplePre);

  if (samplePre.active !== false || samplePre.frame >= 37) {
    throw new Error(`Hitbox should NOT be active before frame 37! frame=${samplePre.frame}`);
  }

  // Wait until frame enters 37-40 window
  await page.waitForFunction(() => {
    const f = window.PortfolioWorld?.debug?.punchHitbox?.().frame;
    return f >= 37 && f <= 40;
  }, { timeout: 5000 });

  const sampleActive = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    const state = pw?.debug?.state?.();
    const hitbox = pw?.debug?.punchHitbox?.();
    return {
      punching: state?.punching,
      punchTimer: state?.punchTimer,
      frame: hitbox?.frame,
      active: hitbox?.active,
      hitboxPos: hitbox?.position,
      box: hitbox?.box,
      radius: hitbox?.radius,
    };
  });
  console.log("Sample DURING Hitbox (frame 37-40):", sampleActive);

  if (sampleActive.active !== true) {
    throw new Error(`Hitbox MUST be active during frames 37-40! frame=${sampleActive.frame}, active=${sampleActive.active}`);
  }
  if (sampleActive.frame < 37 || sampleActive.frame > 40) {
    throw new Error(`Hitbox active outside frame 37-40! frame=${sampleActive.frame}`);
  }

  // Verify box bounds enclose the position
  const { hitboxPos, box } = sampleActive;
  const inside = (
    hitboxPos[0] >= box.min[0] && hitboxPos[0] <= box.max[0] &&
    hitboxPos[1] >= box.min[1] && hitboxPos[1] <= box.max[1] &&
    hitboxPos[2] >= box.min[2] && hitboxPos[2] <= box.max[2]
  );
  if (!inside) {
    throw new Error("Hitbox center is outside its bounding box!");
  }
  console.log("Verified: Hitbox center is within its bounding box, radius is", sampleActive.radius);

  // Wait until frame passes 40 (frame 41+)
  await page.waitForFunction(() => {
    const f = window.PortfolioWorld?.debug?.punchHitbox?.().frame;
    return f >= 41;
  }, { timeout: 5000 });

  const samplePost = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    const state = pw?.debug?.state?.();
    const hitbox = pw?.debug?.punchHitbox?.();
    return {
      punching: state?.punching,
      punchTimer: state?.punchTimer,
      frame: hitbox?.frame,
      active: hitbox?.active,
    };
  });
  console.log("Sample Post-Hitbox (frame 41+):", samplePost);

  if (samplePost.active !== false) {
    throw new Error(`Hitbox should deactivate immediately after frame 40! frame=${samplePost.frame}, active=${samplePost.active}`);
  }

  // Wait for combo to completely finish
  await page.waitForFunction(() => {
    return !window.PortfolioWorld?.debug?.state?.().punching;
  }, { timeout: 5000 });

  const sampleEnd = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    const state = pw?.debug?.state?.();
    const hitbox = pw?.debug?.punchHitbox?.();
    return {
      punching: state?.punching,
      punchTimer: state?.punchTimer,
      frame: hitbox?.frame,
      active: hitbox?.active,
    };
  });
  console.log("After combo completion:", sampleEnd);

  if (sampleEnd.punching !== false || sampleEnd.active !== false) {
    throw new Error("Hitbox was not cleanly deactivated at combo end!");
  }

  if (errors.length) {
    console.warn("Browser warnings/errors:", errors);
  } else {
    console.log("Console errors: 0 (clean)");
  }

  console.log("\nALL HITBOX AND EFFECTS REMOVAL VERIFICATION CHECKS PASSED!");
  await browser.close();
} catch (err) {
  console.error("Test failed:", err);
  process.exit(1);
} finally {
  server.close();
}
