import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8802;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
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
      await new Promise((r) => setTimeout(r, 50));
    }

    await page.evaluate(() => {
      if (window.PortfolioWorld?.debug?.finishIntro) {
        window.PortfolioWorld.debug.finishIntro();
      }
      if (window.PortfolioWorld?.debug?.zoom) {
        window.PortfolioWorld.debug.zoom(2.8);
      }
    });

    await new Promise((r) => setTimeout(r, 500));
    await page.click("#world canvas");
    await new Promise((r) => setTimeout(r, 200));

    // Trigger punch!
    await page.keyboard.press("KeyF");

    let shotCaptured = false;
    const start = Date.now();

    while (Date.now() - start < 1800) {
      const data = await page.evaluate(() => {
        const pw = window.PortfolioWorld;
        const state = pw?.debug?.state?.();
        const wc = pw?.debug?.windCore?.();
        const robot = pw?.debug?.robot?.();
        const mesh = pw?.debug?.scene?.()?.getObjectByName("NikoPunchLinearWindCore");
        const f = Math.floor((state?.punchTimer || 0) * 30);

        let meshQuat = null;
        let meshPos = null;
        let meshScale = null;
        if (mesh) {
          meshQuat = [mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w];
          meshPos = [mesh.position.x, mesh.position.y, mesh.position.z];
          meshScale = [mesh.scale.x, mesh.scale.y, mesh.scale.z];
        }

        return {
          frame: f,
          timer: state?.punchTimer,
          visible: wc?.visible,
          robotYaw: robot ? robot.rotation.y : null,
          meshQuat,
          meshPos,
          meshScale,
        };
      });

      if (!shotCaptured && data.frame >= 37 && data.frame <= 39 && data.visible) {
        shotCaptured = true;
        const outPath = path.join(root, "assets", "niko", "facing-speedlines-impact.png");
        await page.screenshot({ path: outPath });
        console.log(`Saved screenshot to ${outPath}`);
        console.log(`Frame ${data.frame}: robotYaw=${data.robotYaw?.toFixed(3)}, meshScale=${JSON.stringify(data.meshScale?.map(v => +v.toFixed(2)))}`);
      }

      await new Promise((r) => setTimeout(r, 15));
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main();
