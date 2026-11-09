import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8865;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".fbx": "application/octet-stream",
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
    window.PortfolioWorld?.debug?.zoom?.(1.4);
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.click("#world canvas");

  const canvas = await page.$("#world canvas");

  console.log("Triggering Combo Punch (F key)...");
  await page.keyboard.press("KeyF");

  let shot1 = false;
  let tImpact = 0;
  const start = Date.now();

  while (Date.now() - start < 2500) {
    const info = await page.evaluate(() => {
      const pw = window.PortfolioWorld;
      const state = pw?.debug?.state?.();
      const sm = pw?.debug?.punchSmoke?.();
      const f = Math.floor((state?.punchTimer || 0) * 30);
      return { f, punching: state?.punching, smokeActive: sm?.active, puffs: sm?.puffCount };
    });

    if (!shot1 && info.smokeActive && info.f >= 37) {
      shot1 = true;
      tImpact = Date.now();
      await canvas.screenshot({
        path: path.join(root, ".impeccable/review/saitama-combopunch-framed.png"),
      });
      console.log(`Saved saitama-combopunch-framed.png at frame ${info.f}`);
      break;
    }

    await new Promise((r) => setTimeout(r, 10));
  }

  console.log("Done!");
  await browser.close();
  server.close();
}

main();
