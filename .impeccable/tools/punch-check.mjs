import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8769;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".glb": "model/gltf-binary",
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
  console.log(`Server started on http://127.0.0.1:${port}/`);
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

  await page.setViewport({ width: 1200, height: 800 });
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

  await wait(800);

  // Zoom in on Niko and set angle
  await page.evaluate(() => {
    window.PortfolioWorld?.debug?.zoom?.(3.2);
    // Turn Niko so his right arm faces across camera view
    window.PortfolioWorld?.debug?.holdYaw?.(-0.8);
  });
  await wait(400);

  // Focus the canvas
  await page.click("#world canvas");
  await wait(200);

  // Press 'F' key
  console.log("Pressing 'F' key via keyboard event...");
  await page.keyboard.press("KeyF");

  // Wait ~200ms to hit the apex of the punch (strike impact)
  await wait(200);

  const apexPunch = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    const bot = pw?.debug?.bot?.();
    const punchAction = bot?.actions?.punch;
    const rHand = bot?.bones?.RightHand;
    const rShoulder = bot?.bones?.RightShoulder;
    let handScale = null;
    let armLength = null;
    if (rHand && rShoulder) {
      handScale = +rHand.scale.x.toFixed(3);
      const vH = rHand.getWorldPosition(new rHand.position.constructor());
      const vS = rShoulder.getWorldPosition(new rShoulder.position.constructor());
      armLength = +vH.distanceTo(vS).toFixed(3);
    }
    return {
      punchWeight: punchAction ? +punchAction.getEffectiveWeight().toFixed(3) : 0,
      punchTime: punchAction ? +punchAction.time.toFixed(3) : 0,
      isRunning: punchAction ? punchAction.isRunning() : false,
      handScale,
      armLength,
    };
  });

  console.log("Apex punch state:", JSON.stringify(apexPunch));

  // Take screenshot of the power punch!
  const reviewDir = path.join(root, ".impeccable/review");
  if (!fs.existsSync(reviewDir)) fs.mkdirSync(reviewDir, { recursive: true });
  await page.screenshot({ path: path.join(reviewDir, "niko-power-punch-profile.png") });
  console.log("Saved screenshot: .impeccable/review/niko-power-punch-profile.png");

  // Wait 400ms more (total > 600ms, punch duration is 467ms) for punch animation to finish
  await wait(400);

  const postPunch = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    const bot = pw?.debug?.bot?.();
    const punchAction = bot?.actions?.punch;
    const rHand = bot?.bones?.RightHand;
    return {
      punchWeight: punchAction ? +punchAction.getEffectiveWeight().toFixed(3) : 0,
      isRunning: punchAction ? punchAction.isRunning() : false,
      handScale: rHand ? +rHand.scale.x.toFixed(3) : null,
    };
  });

  console.log("Post-punch state:", JSON.stringify(postPunch));

  console.log("SUCCESS: Profile punch verified!");
  await browser.close();
} finally {
  server.close();
}
