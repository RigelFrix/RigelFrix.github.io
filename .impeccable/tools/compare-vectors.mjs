import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8799;
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

  const vectors = [];
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
        const ls = bot?.bones?.LeftShoulder;
        const head = bot?.bones?.Head;
        const hips = bot?.bones?.Hips;
        const robot = pw?.debug?.robot?.();

        const getPos = (b) => {
          if (!b) return null;
          const m = b.matrixWorld.elements;
          return [m[12], m[13], m[14]];
        };

        const pLH = getPos(lh);
        const pLFA = getPos(lfa);
        const pLS = getPos(ls);
        const pHead = getPos(head);
        const pHips = getPos(hips);

        if (!pLH || !pLFA) return null;

        return {
          frame: f,
          hand: pLH,
          forearm: pLFA,
          shoulder: pLS,
          head: pHead,
          hips: pHips,
          robotYaw: robot ? robot.rotation.y : 0,
        };
      }
      return null;
    });

    if (s && (!vectors.length || vectors[vectors.length - 1].frame !== s.frame)) {
      vectors.push(s);
    }
    await new Promise((r) => setTimeout(r, 12));
  }

  await browser.close();
  server.close();

  const toScreen = (dx, dy, dz) => {
    const sx = dx * 0.7071 - dz * 0.7071;
    const sy = -dx * 0.5062 + dy * 0.6982 - dz * 0.5062;
    const len = Math.hypot(sx, sy);
    return len > 1e-4 ? [+(sx / len).toFixed(2), +(sy / len).toFixed(2)] : [0, 0];
  };

  console.log("Vector analysis across punch frames:");
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    const fdx = v.hand[0] - v.forearm[0];
    const fdy = v.hand[1] - v.forearm[1];
    const fdz = v.hand[2] - v.forearm[2];
    const screenForearm = toScreen(fdx, fdy, fdz);

    let screenArm = [0, 0];
    if (v.shoulder) {
      screenArm = toScreen(v.hand[0] - v.shoulder[0], v.hand[1] - v.shoulder[1], v.hand[2] - v.shoulder[2]);
    }

    let screenMotion = [0, 0];
    if (i > 0) {
      const prev = vectors[i - 1];
      screenMotion = toScreen(v.hand[0] - prev.hand[0], v.hand[1] - prev.hand[1], v.hand[2] - prev.hand[2]);
    }

    let screenLooking = [0, 0];
    if (v.head && v.hips) {
      screenLooking = toScreen(v.head[0] - v.hips[0], v.head[1] - v.hips[1], v.head[2] - v.hips[2]);
    }

    console.log(
      `f${v.frame} | Forearm: [${screenForearm}] | FullArm: [${screenArm}] | HandMotion: [${screenMotion}] | Looking: [${screenLooking}]`
    );
  }
}

main();
