import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8806;
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
  await page.goto("http://127.0.0.1:" + port + "/?view=world&skip=1", { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 200 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  await page.evaluate(() => window.PortfolioWorld?.debug?.finishIntro?.());
  await new Promise((r) => setTimeout(r, 300));
  await page.click("#world canvas");
  await new Promise((r) => setTimeout(r, 100));

  await page.keyboard.press("KeyF");

  const start = Date.now();
  const log = [];

  while (Date.now() - start < 1800) {
    const s = await page.evaluate(() => {
      const pw = window.PortfolioWorld;
      const state = pw?.debug?.state?.();
      const bot = pw?.debug?.bot?.();
      const robot = pw?.debug?.robot?.();
      if (!bot?.bones?.LeftHand || !robot) return null;
      const hm = bot.bones.LeftHand.matrixWorld.elements;
      const fm = bot.bones.LeftForeArm.matrixWorld.elements;
      return {
        timer: state?.punchTimer,
        frame: Math.floor((state?.punchTimer || 0) * 30),
        hand: [+hm[12].toFixed(3), +hm[13].toFixed(3), +hm[14].toFixed(3)],
        forearm: [+fm[12].toFixed(3), +fm[13].toFixed(3), +fm[14].toFixed(3)],
        robotY: +robot.position.y.toFixed(3),
      };
    });
    if (s && s.frame >= 34 && s.frame <= 42) {
      if (log.length === 0 || log[log.length - 1].timer !== s.timer) {
        log.push(s);
      }
    }
    await new Promise((r) => setTimeout(r, 5));
  }

  await browser.close();
  server.close();

  for (const item of log) {
    console.log(`F${item.frame} (t=${item.timer.toFixed(3)}): hand=[${item.hand}] forearm=[${item.forearm}] robotY=${item.robotY}`);
  }
}

main();
