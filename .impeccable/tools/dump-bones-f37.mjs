import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8797;
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
  await page.click("#world canvas");
  await new Promise((r) => setTimeout(r, 200));
  await page.keyboard.press("KeyF");

  const samples = [];
  const start = Date.now();
  while (Date.now() - start < 1800) {
    const s = await page.evaluate(() => {
      const pw = window.PortfolioWorld;
      const bot = pw?.debug?.bot?.();
      const state = pw?.debug?.state?.();
      const f = Math.floor((state?.punchTimer || 0) * 30);
      if (f >= 33 && f <= 42) {
        const lh = bot?.bones?.LeftHand;
        const lfa = bot?.bones?.LeftForeArm;
        const rh = bot?.bones?.RightHand;
        const mesh = pw?.debug?.scene?.()?.getObjectByName("NikoPunchLinearWindCore");

        const getPos = (b) => {
          if (!b) return null;
          const m = b.matrixWorld.elements;
          return [+m[12].toFixed(3), +m[13].toFixed(3), +m[14].toFixed(3)];
        };

        return {
          frame: f,
          timer: +state?.punchTimer?.toFixed(3),
          LeftHand: getPos(lh),
          LeftForeArm: getPos(lfa),
          RightHand: getPos(rh),
          meshPos: mesh ? [+mesh.position.x.toFixed(3), +mesh.position.y.toFixed(3), +mesh.position.z.toFixed(3)] : null,
          meshQuat: mesh ? mesh.quaternion.toArray().map((v) => +v.toFixed(3)) : null,
          meshVisible: mesh?.visible,
        };
      }
      return null;
    });
    if (s && (!samples.length || samples[samples.length - 1].frame !== s.frame)) {
      samples.push(s);
    }
    await new Promise((r) => setTimeout(r, 15));
  }
  await browser.close();
  server.close();
  console.log("Recorded samples:\n" + JSON.stringify(samples, null, 2));
}

main();
