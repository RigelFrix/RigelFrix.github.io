import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8840;
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
      // Target the dummy so Niko turns to face it
      const ds = window.PortfolioWorld?.debug?.dummyScreen?.();
      if (ds) window.PortfolioWorld.debug.target(ds.x, ds.y);
      window.PortfolioWorld?.debug?.zoom?.(2.0);
    });

    await new Promise((r) => setTimeout(r, 800));
    await page.click("#world canvas");
    await new Promise((r) => setTimeout(r, 100));

    // Punch!
    await page.keyboard.press("KeyF");

    const canvas = await page.$("#world canvas");
    let shot1 = false;
    let shot2 = false;
    const start = Date.now();

    while (Date.now() - start < 2500) {
      const info = await page.evaluate(() => {
        const pw = window.PortfolioWorld;
        const state = pw?.debug?.state?.();
        const sm = pw?.debug?.punchSmoke?.();
        const f = Math.floor((state?.punchTimer || 0) * 30);
        return { f, punching: state?.punching, smokeActive: sm?.active };
      });

      if (!shot1 && info.f >= 38 && info.smokeActive) {
        shot1 = true;
        await canvas.screenshot({ path: path.join(root, "assets/niko/smoke-test-impact.png") });
        console.log("Saved smoke-test-impact.png at frame " + info.f);
      }

      if (shot1 && !shot2 && info.f >= 42) {
        shot2 = true;
        await canvas.screenshot({ path: path.join(root, "assets/niko/smoke-test-billow.png") });
        console.log("Saved smoke-test-billow.png at frame " + info.f);
        break;
      }

      await new Promise((r) => setTimeout(r, 16));
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main();
