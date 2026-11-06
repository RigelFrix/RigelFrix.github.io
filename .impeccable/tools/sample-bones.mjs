import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8784;
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".glb": "model/gltf-binary",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
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
  await page.goto("http://127.0.0.1:" + port + "/?view=world&skip=1");
  for (let i = 0; i < 200 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  await page.evaluate(() => window.PortfolioWorld?.debug?.finishIntro?.());
  await new Promise((r) => setTimeout(r, 400));
  await page.keyboard.press("KeyF");

  const samples = [];
  const start = Date.now();
  while (Date.now() - start < 1800) {
    const s = await page.evaluate(() => {
      const pw = window.PortfolioWorld;
      const bot = pw?.debug?.bot?.();
      const state = pw?.debug?.state?.();
      const robot = pw?.debug?.robot?.();
      const hand = bot?.bones?.LeftHand;
      const forearm = bot?.bones?.LeftForeArm;
      const pHand = hand ? hand.getWorldPosition(new THREE.Vector3()) : null;
      const pForearm = forearm ? forearm.getWorldPosition(new THREE.Vector3()) : null;
      return {
        timer: state?.punchTimer,
        frame: Math.floor((state?.punchTimer || 0) * 30),
        pHand: pHand ? [pHand.x, pHand.y, pHand.z] : null,
        pForearm: pForearm ? [pForearm.x, pForearm.y, pForearm.z] : null,
        robotYaw: robot ? robot.rotation.y : 0,
      };
    });
    samples.push(s);
    await new Promise((r) => setTimeout(r, 15));
  }

  await browser.close();
  server.close();

  const f32to42 = samples.filter((s) => s.frame >= 32 && s.frame <= 42);
  console.log("Frame samples:");
  f32to42.forEach((s) => {
    if (s.pHand && s.pForearm) {
      const dx = +(s.pHand[0] - s.pForearm[0]).toFixed(3);
      const dy = +(s.pHand[1] - s.pForearm[1]).toFixed(3);
      const dz = +(s.pHand[2] - s.pForearm[2]).toFixed(3);
      const len = Math.hypot(dx, dy, dz);
      const nx = +(dx / len).toFixed(3);
      const ny = +(dy / len).toFixed(3);
      const nz = +(dz / len).toFixed(3);
      const forwardX = +Math.sin(s.robotYaw).toFixed(3);
      const forwardZ = +Math.cos(s.robotYaw).toFixed(3);
      console.log(`f${s.frame} dir:[${nx}, ${ny}, ${nz}] forward:[${forwardX}, 0, ${forwardZ}]`);
    }
  });
}

main();

