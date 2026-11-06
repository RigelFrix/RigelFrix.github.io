import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8782;
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

async function main() {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      headless: true,
      protocolTimeout: 60000,
      args: ["--ignore-gpu-blocklist", "--use-gl=angle"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(`http://127.0.0.1:${port}/?view=world&skip=1`, { waitUntil: "domcontentloaded" });

    for (let i = 0; i < 200 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i++) {
      await wait(50);
    }

    // Finish intro & set high zoom
    await page.evaluate(() => {
      if (window.PortfolioWorld?.debug?.finishIntro) {
        window.PortfolioWorld.debug.finishIntro();
      }
      if (window.PortfolioWorld?.debug?.zoom) {
        window.PortfolioWorld.debug.zoom(3.2); // Zoom in on Niko!
      }
    });

    await wait(600);
    await page.click("#world canvas");
    await wait(200);

    // Trigger punch!
    await page.keyboard.press("KeyF");

    let captured = false;
    const start = Date.now();
    while (Date.now() - start < 1800) {
      const frameInfo = await page.evaluate(() => {
        const pw = window.PortfolioWorld;
        const state = pw?.debug?.state?.();
        const wc = pw?.debug?.windCore?.();
        return {
          frame: Math.floor((state?.punchTimer || 0) * 30),
          timer: state?.punchTimer,
          visible: wc?.visible,
          scale: wc?.scale,
        };
      });

      if (!captured && frameInfo.frame >= 37 && frameInfo.frame <= 40 && frameInfo.visible) {
        captured = true;
        console.log(`Capturing close-up punch shot at frame ${frameInfo.frame}!`);
        const closeUpPath = path.join(root, "assets", "niko", "wind-core-closeup.png");
        await page.screenshot({ path: closeUpPath });
        console.log(`Saved close-up to ${closeUpPath}`);
        break;
      }
      await wait(15);
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main();

