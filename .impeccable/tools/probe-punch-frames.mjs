import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8792;
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

  const frames = [];
  let lastF = -1;
  const start = Date.now();
  while (Date.now() - start < 1800) {
    const s = await page.evaluate(() => {
      const pw = window.PortfolioWorld;
      const bot = pw?.debug?.bot?.();
      const state = pw?.debug?.state?.();
      const robot = pw?.debug?.robot?.();
      const hand = bot?.bones?.LeftHand;
      const forearm = bot?.bones?.LeftForeArm;
      if (!hand || !forearm || !robot) return null;
      const hm = hand.matrixWorld.elements;
      const fm = forearm.matrixWorld.elements;
      return {
        frame: Math.floor((state?.punchTimer || 0) * 30),
        timer: state?.punchTimer,
        robotPos: [robot.position.x, robot.position.y, robot.position.z],
        robotYaw: robot.rotation.y,
        handPos: [hm[12], hm[13], hm[14]],
        forearmPos: [fm[12], fm[13], fm[14]],
      };
    });
    if (s && s.frame !== lastF && s.frame >= 33 && s.frame <= 43) {
      frames.push(s);
      lastF = s.frame;
    }
    await new Promise((r) => setTimeout(r, 4));
  }
  await browser.close();
  server.close();

  console.log("Frames captured:");
  for (const f of frames) {
    console.log(`F${f.frame} (t=${f.timer.toFixed(3)}) robotYaw=${f.robotYaw.toFixed(3)}:`);
    console.log(`  robot:   [${f.robotPos.map(v => v.toFixed(3))}]`);
    console.log(`  hand:    [${f.handPos.map(v => v.toFixed(3))}]`);
    console.log(`  forearm: [${f.forearmPos.map(v => v.toFixed(3))}]`);
  }
}

main();
