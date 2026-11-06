import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8812;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const server = http
  .createServer((req, res) => {
    let u = decodeURIComponent(req.url.split("?")[0]);
    if (u.endsWith("/")) u += "index.html";
    const f = path.join(root, u);
    fs.readFile(f, (err, data) => {
      if (err) return res.writeHead(404).end();
      res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }).end(data);
    });
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
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(`http://127.0.0.1:${port}/?view=world&skip=1`, { waitUntil: "domcontentloaded" });

    for (let i = 0; i < 200 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }

    await page.evaluate(() => {
      window.PortfolioWorld?.debug?.finishIntro?.();
      window.PortfolioWorld?.debug?.zoom?.(2.0);
    });

    await new Promise((r) => setTimeout(r, 500));
    await page.click("#world canvas");
    await new Promise((r) => setTimeout(r, 200));

    // Install frame recorder inside browser animation loop
    await page.evaluate(() => {
      window.__punchHistory = [];
      const origRAF = window.requestAnimationFrame;
      window.requestAnimationFrame = function (cb) {
        return origRAF.call(window, function (t) {
          try {
            const pw = window.PortfolioWorld;
            const state = pw?.debug?.state?.();
            const wc = pw?.debug?.windCore?.();
            const mesh = pw?.debug?.scene?.()?.getObjectByName("NikoPunchLinearWindCore");
            const bot = pw?.debug?.bot?.();
            const robot = pw?.debug?.robot?.();
            if (state && state.punching) {
              const f = Math.floor((state.punchTimer || 0) * 30);
              let handPos = null;
              if (bot?.bones?.LeftHand) {
                const m = bot.bones.LeftHand.matrixWorld.elements;
                handPos = [+m[12].toFixed(3), +m[13].toFixed(3), +m[14].toFixed(3)];
              }
              window.__punchHistory.push({
                frame: f,
                timer: +state.punchTimer.toFixed(3),
                robotYaw: robot ? +robot.rotation.y.toFixed(3) : 0,
                handPos,
                wcVisible: wc?.visible,
                wcLocked: wc?.locked,
                meshPos: mesh ? [+mesh.position.x.toFixed(3), +mesh.position.y.toFixed(3), +mesh.position.z.toFixed(3)] : null,
                meshScale: mesh ? mesh.scale.toArray().map((v) => +v.toFixed(3)) : null,
              });
            }
          } catch (e) {}
          cb(t);
        });
      };
    });

    // Trigger punch!
    await page.keyboard.press("KeyF");

    let shotApex = false;
    let shotRecoil = false;
    const start = Date.now();

    while (Date.now() - start < 2000) {
      const data = await page.evaluate(() => {
        const pw = window.PortfolioWorld;
        const state = pw?.debug?.state?.();
        const wc = pw?.debug?.windCore?.();
        const f = Math.floor((state?.punchTimer || 0) * 30);
        return {
          frame: f,
          wcVisible: wc?.visible,
        };
      });

      if (!shotApex && data.frame >= 37 && data.frame <= 39 && data.wcVisible) {
        shotApex = true;
        const outPath = path.join(root, "assets", "niko", "wind-core-apex-world.png");
        const canvas = await page.$("#world canvas");
        if (canvas) await canvas.screenshot({ path: outPath });
        else await page.screenshot({ path: outPath });
        console.log(`Saved apex screenshot to ${outPath}`);
      }

      if (!shotRecoil && data.frame >= 41 && data.wcVisible) {
        shotRecoil = true;
        const outPath = path.join(root, "assets", "niko", "wind-core-recoil-world.png");
        const canvas = await page.$("#world canvas");
        if (canvas) await canvas.screenshot({ path: outPath });
        else await page.screenshot({ path: outPath });
        console.log(`Saved recoil screenshot to ${outPath}`);
      }

      await new Promise((r) => setTimeout(r, 10));
    }

    const recorded = await page.evaluate(() => window.__punchHistory || []);
    console.log("\n=== Frame-by-Frame Wind Core Diagnostics ===");
    const framesMap = new Map();
    for (const item of recorded) {
      if (item.frame >= 35 && item.frame <= 43 && !framesMap.has(item.frame)) {
        framesMap.set(item.frame, item);
      }
    }

    for (const [frame, item] of framesMap.entries()) {
      console.log(
        `F${frame.toString().padStart(2, " ")} (t=${item.timer}) vis=${item.wcVisible} locked=${item.wcLocked} | handPos=[${item.handPos}] | meshPos=[${item.meshPos}] scale=[${item.meshScale}]`
      );
    }

    // Verify position invariance across all active frames
    const activePositions = [];
    for (const [frame, item] of framesMap.entries()) {
      if (frame >= 36 && frame <= 42 && item.meshPos) {
        activePositions.push({ frame, pos: item.meshPos });
      }
    }

    if (activePositions.length >= 2) {
      const first = activePositions[0].pos;
      let allMatch = true;
      for (const entry of activePositions) {
        const diffX = Math.abs(entry.pos[0] - first[0]);
        const diffY = Math.abs(entry.pos[1] - first[1]);
        const diffZ = Math.abs(entry.pos[2] - first[2]);
        if (diffX > 0.001 || diffY > 0.001 || diffZ > 0.001) {
          allMatch = false;
          console.error(`FAILURE: Frame ${entry.frame} meshPos shifted! diff=(${diffX}, ${diffY}, ${diffZ})`);
        }
      }
      if (allMatch) {
        console.log("\nSUCCESS: mesh.position remained 100% stationary in world space across all active frames!");
      }
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main();
