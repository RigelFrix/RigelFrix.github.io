import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8818;
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
  const browser = await puppeteer.launch({
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
    if (ds) window.PortfolioWorld.debug.target(ds.x, ds.y);
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.click("#world canvas");
  await new Promise((r) => setTimeout(r, 100));
  await page.keyboard.press("KeyF");

  const start = Date.now();
  let logItem = null;
  while (Date.now() - start < 2000) {
    const s = await page.evaluate(() => {
      const pw = window.PortfolioWorld;
      const state = pw?.debug?.state?.();
      const bot = pw?.debug?.bot?.();
      const robot = pw?.debug?.robot?.();
      const mesh = pw?.debug?.scene?.()?.getObjectByName("NikoPunchLinearWindCore");
      const f = Math.floor((state?.punchTimer || 0) * 30);
      if (f >= 38 && f <= 39) {
        const hm = bot?.bones?.LeftHand?.matrixWorld?.elements;
        return {
          frame: f,
          robotPos: robot ? [robot.position.x, robot.position.y, robot.position.z] : null,
          robotYaw: robot ? robot.rotation.y : null,
          handPos: hm ? [hm[12], hm[13], hm[14]] : null,
          meshPos: mesh ? [mesh.position.x, mesh.position.y, mesh.position.z] : null,
          meshQuat: mesh ? mesh.quaternion.toArray() : null,
          meshScale: mesh ? mesh.scale.toArray() : null,
          meshVisible: mesh?.visible,
        };
      }
      return null;
    });
    if (s && !logItem) {
      logItem = s;
      break;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  await browser.close();
  server.close();
  console.log("Log at apex:", JSON.stringify(logItem, null, 2));
}

main();
