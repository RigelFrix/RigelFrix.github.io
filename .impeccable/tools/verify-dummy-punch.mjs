import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8816;
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
      const ds = window.PortfolioWorld?.debug?.dummyScreen?.();
      if (ds) {
        window.PortfolioWorld.debug.target(ds.x, ds.y);
      }
      window.PortfolioWorld?.debug?.zoom?.(2.2);
    });

    // Wait for Niko to rotate towards the dummy
    await new Promise((r) => setTimeout(r, 800));
    await page.click("#world canvas");
    await new Promise((r) => setTimeout(r, 100));

    // Punch!
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
          visible: wc?.visible,
          locked: wc?.locked,
          meshPos: wc?.position,
          meshScale: wc?.scale,
        };
      });

      if (!shotApex && data.frame >= 38 && data.frame <= 39 && data.visible) {
        shotApex = true;
        const outPath = path.join(root, "assets", "niko", "dummy-punch-apex.png");
        const canvas = await page.$("#world canvas");
        if (canvas) await canvas.screenshot({ path: outPath });
        console.log(`Saved apex screenshot to ${outPath} at frame ${data.frame}: meshPos=[${data.meshPos?.map(v => +v.toFixed(3))}]`);
      }

      if (!shotRecoil && data.frame >= 41 && data.visible) {
        shotRecoil = true;
        const outPath = path.join(root, "assets", "niko", "dummy-punch-recoil.png");
        const canvas = await page.$("#world canvas");
        if (canvas) await canvas.screenshot({ path: outPath });
        console.log(`Saved recoil screenshot to ${outPath} at frame ${data.frame}: meshPos=[${data.meshPos?.map(v => +v.toFixed(3))}]`);
      }

      await new Promise((r) => setTimeout(r, 15));
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main();
