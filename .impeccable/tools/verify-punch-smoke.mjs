import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8835;
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
    page.on("pageerror", (err) => console.error("BROWSER PAGE ERROR:", err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error("BROWSER CONSOLE ERROR:", msg.text());
    });
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(`http://127.0.0.1:${port}/?view=world&skip=1`, { waitUntil: "domcontentloaded" });

    for (let i = 0; i < 200 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }

    await page.evaluate(() => {
      window.PortfolioWorld?.debug?.finishIntro?.();
    });
    await new Promise((r) => setTimeout(r, 400));

    // Walk Niko onto the open court so he is centered cleanly on the camera
    await page.evaluate(() => {
      window.PortfolioWorld?.walkTo?.("about");
    });
    await new Promise((r) => setTimeout(r, 1600));

    // Close any popup overlay and zoom in on Niko
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 300));

    await page.evaluate(() => {
      window.PortfolioWorld?.debug?.zoom?.(2.8);
    });
    await new Promise((r) => setTimeout(r, 600));
    await page.click("#world canvas");
    await new Promise((r) => setTimeout(r, 100));

    // Hook frame timeline
    await page.evaluate(() => {
      window.__smokeTimeline = [];
      const origRAF = window.requestAnimationFrame;
      window.requestAnimationFrame = function (cb) {
        return origRAF.call(window, function (t) {
          try {
            const pw = window.PortfolioWorld;
            const state = pw?.debug?.state?.();
            const sm = pw?.debug?.punchSmoke?.();
            const hb = pw?.debug?.punchHitbox?.();
            const f = Math.floor((state?.punchTimer || 0) * 30);
            if (sm?.active || state?.punching) {
              window.__smokeTimeline.push({
                f,
                timer: state?.punchTimer ? +state.punchTimer.toFixed(3) : 0,
                punching: state?.punching,
                hitboxActive: hb?.active,
                smokeActive: sm?.active,
                puffCount: sm?.puffCount,
              });
            }
          } catch (e) {}
          cb(t);
        });
      };
    });

    // Trigger punch
    await page.keyboard.press("KeyF");

    const canvas = await page.$("#world canvas");
    let shotImpact = false;
    let shotBillow = false;
    let shotLinger = false;
    let impactTime = 0;
    const start = Date.now();

    while (Date.now() - start < 3000) {
      const info = await page.evaluate(() => {
        const pw = window.PortfolioWorld;
        const state = pw?.debug?.state?.();
        const sm = pw?.debug?.punchSmoke?.();
        const f = Math.floor((state?.punchTimer || 0) * 30);
        return {
          f,
          punching: state?.punching,
          timer: state?.punchTimer,
          smokeActive: sm?.active,
          puffCount: sm?.puffCount,
        };
      });

      // Stage 1: Impact frame 38-40
      if (!shotImpact && info.punching && info.f >= 38 && info.smokeActive) {
        await canvas.screenshot({
          path: path.join(root, "assets/niko/punch-smoke-1-impact.png"),
        });
        shotImpact = true;
        impactTime = Date.now();
        console.log(`Saved Stage 1 (Impact Ejection, Frame ${info.f}) [${info.puffCount} ribbons active]`);
      }

      // Stage 2: Billowing expansion (~220ms after impact)
      if (shotImpact && !shotBillow && Date.now() - impactTime >= 220 && info.smokeActive) {
        await canvas.screenshot({
          path: path.join(root, "assets/niko/punch-smoke-2-billow.png"),
        });
        shotBillow = true;
        console.log(`Saved Stage 2 (Billowing Expansion) [${info.puffCount} ribbons active]`);
      }

      // Stage 3: Lingering dissolve (~500ms after impact)
      if (shotImpact && shotBillow && !shotLinger && Date.now() - impactTime >= 500 && info.smokeActive) {
        await canvas.screenshot({
          path: path.join(root, "assets/niko/punch-smoke-3-fade.png"),
        });
        shotLinger = true;
        console.log(`Saved Stage 3 (Lingering Dissolve) [${info.puffCount} ribbons active, punching=${info.punching}]`);
        break;
      }

      await new Promise((r) => setTimeout(r, 16));
    }

    const timeline = await page.evaluate(() => window.__smokeTimeline || []);
    console.log(`Recorded ${timeline.length} timeline frames.`);
    const activeFrames = timeline.filter((t) => t.f >= 35 && t.f <= 45);
    console.log("Frames 35-45:", JSON.stringify(activeFrames, null, 2));
  } catch (err) {
    console.error("Error during verification:", err);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main();
