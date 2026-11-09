import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8851;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".fbx": "application/octet-stream",
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

    // Open dev map with clean arena lighting
    await page.goto(`http://127.0.0.1:${port}/?map=dev&skip=1`, { waitUntil: "domcontentloaded" });

    for (let i = 0; i < 200 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }

    await page.evaluate(() => {
      window.PortfolioWorld?.debug?.finishIntro?.();
    });
    await new Promise((r) => setTimeout(r, 400));

    // Turn camera for a 3/4 front-side heroic angle on Niko (like the Saitama portrait!)
    await page.evaluate(() => {
      window.PortfolioWorld?.debug?.yaw?.(Math.PI * 0.70);
      window.PortfolioWorld?.debug?.angle?.(24); // Low cinematic angle
      window.PortfolioWorld?.debug?.zoom?.(3.5); // Close-up on Niko!
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.click("#world canvas");

    const canvas = await page.$("#world canvas");

    console.log("Triggering One Punch (G key) in Dev Gym close-up...");
    await page.keyboard.press("KeyG");

    let gImpact = false;
    let gApex = false;
    let impactTime = 0;
    const startG = Date.now();

    while (Date.now() - startG < 2200) {
      const info = await page.evaluate(() => {
        const pw = window.PortfolioWorld;
        const state = pw?.debug?.state?.();
        const sm = pw?.debug?.punchSmoke?.();
        const f = Math.floor((state?.punchTimer || 0) * 30);
        return {
          f,
          punching: state?.punching,
          punchType: state?.punchType,
          smokeActive: sm?.active,
          puffCount: sm?.puffCount,
        };
      });

      if (!gImpact && info.smokeActive && info.f >= 16) {
        gImpact = true;
        impactTime = Date.now();
        await canvas.screenshot({
          path: path.join(root, ".impeccable/review/saitama-closeup-impact.png"),
        });
        console.log(`Saved saitama-closeup-impact.png at frame ${info.f}`);
      }

      if (gImpact && !gApex && Date.now() - impactTime >= 65 && info.smokeActive) {
        gApex = true;
        await canvas.screenshot({
          path: path.join(root, ".impeccable/review/saitama-closeup-apex.png"),
        });
        console.log(`Saved saitama-closeup-apex.png at frame ${info.f}`);
        break;
      }

      await new Promise((r) => setTimeout(r, 10));
    }

    console.log("Dev Gym close-up captured successfully!");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main();
