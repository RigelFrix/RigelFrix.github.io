import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8790;
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

  const history = [];
  const start = Date.now();
  while (Date.now() - start < 1800) {
    const s = await page.evaluate(() => {
      const pw = window.PortfolioWorld;
      const bot = pw?.debug?.bot?.();
      const state = pw?.debug?.state?.();
      const hand = bot?.bones?.LeftHand;
      const forearm = bot?.bones?.LeftForeArm;
      if (!hand || !forearm) return null;
      const hm = hand.matrixWorld.elements;
      const fm = forearm.matrixWorld.elements;
      return {
        frame: Math.floor((state?.punchTimer || 0) * 30),
        handPos: [hm[12], hm[13], hm[14]],
        forearmPos: [fm[12], fm[13], fm[14]],
      };
    });
    if (s) history.push(s);
    await new Promise((r) => setTimeout(r, 16));
  }
  await browser.close();
  server.close();

  console.log("Recorded " + history.length + " frames:");
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    if (curr.frame >= 33 && curr.frame <= 42 && curr.frame !== prev.frame) {
      // Hand displacement vector (throw direction)
      const dx = curr.handPos[0] - prev.handPos[0];
      const dy = curr.handPos[1] - prev.handPos[1];
      const dz = curr.handPos[2] - prev.handPos[2];
      const speed = Math.hypot(dx, dy, dz);
      const throwDir = [dx / speed, dy / speed, dz / speed].map((v) => +v.toFixed(3));
      const wakeDir = [-throwDir[0], -throwDir[1], -throwDir[2]].map((v) => +v.toFixed(3));

      // Vector from forearm to hand
      const fdx = curr.handPos[0] - curr.forearmPos[0];
      const fdy = curr.handPos[1] - curr.forearmPos[1];
      const fdz = curr.handPos[2] - curr.forearmPos[2];
      const armLen = Math.hypot(fdx, fdy, fdz);
      const armDir = [fdx / armLen, fdy / armLen, fdz / armLen].map((v) => +v.toFixed(3));

      console.log(
        `Frame ${curr.frame} | handSpeed: ${speed.toFixed(3)}m | throwDir: [${throwDir}] | oppositeWake: [${wakeDir}] | armDir: [${armDir}]`
      );
    }
  }
}

main();

