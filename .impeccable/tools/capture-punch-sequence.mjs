import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8804;
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
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
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
    args: ["--ignore-gpu-blocklist", "--use-gl=angle"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto("http://127.0.0.1:" + port + "/?view=world&skip=1", { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 200 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  await page.evaluate(() => {
    window.PortfolioWorld?.debug?.finishIntro?.();
    window.PortfolioWorld?.debug?.zoom?.(3.5);
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.click("#world canvas");
  await new Promise((r) => setTimeout(r, 100));

  // Trigger punch
  await page.keyboard.press("KeyF");

  const captured = new Set();
  const start = Date.now();
  const outDir = path.join(root, "assets", "niko", "punch-seq");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  while (Date.now() - start < 1800) {
    const info = await page.evaluate(() => {
      const pw = window.PortfolioWorld;
      const state = pw?.debug?.state?.();
      const bot = pw?.debug?.bot?.();
      const mesh = pw?.debug?.scene?.()?.getObjectByName("NikoPunchLinearWindCore");
      const f = Math.floor((state?.punchTimer || 0) * 30);
      let handPos = null;
      if (bot?.bones?.LeftHand) {
        const hm = bot.bones.LeftHand.matrixWorld.elements;
        handPos = [hm[12], hm[13], hm[14]];
      }
      return {
        frame: f,
        timer: state?.punchTimer,
        handPos,
        meshPos: mesh ? [mesh.position.x, mesh.position.y, mesh.position.z] : null,
        meshVisible: mesh?.visible,
      };
    });

    if (info && info.frame >= 34 && info.frame <= 42 && !captured.has(info.frame)) {
      captured.add(info.frame);
      const outPath = path.join(outDir, `frame-${info.frame}.png`);
      await page.screenshot({ path: outPath });
      console.log(`Captured frame ${info.frame}: handPos=[${info.handPos?.map(v => v.toFixed(3))}], meshPos=[${info.meshPos?.map(v => v.toFixed(3))}]`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }

  await browser.close();
  server.close();
  console.log("Done. Captured frames:", Array.from(captured));
}

main();
