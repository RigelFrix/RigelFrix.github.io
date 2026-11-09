import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8863;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".fbx": "application/octet-stream",
  ".json": "application/json",
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

  await page.goto(`http://127.0.0.1:${port}/?view=world&skip=1`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 200 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }

  await page.evaluate(() => window.PortfolioWorld?.debug?.finishIntro?.());
  await new Promise((r) => setTimeout(r, 400));

  await page.keyboard.press("KeyG");

  const timeline = [];
  const start = Date.now();
  while (Date.now() - start < 1500) {
    const s = await page.evaluate(() => {
      const pw = window.PortfolioWorld;
      const state = pw?.debug?.state?.();
      const group = pw?.debug?.scene?.()?.getObjectByName("NikoPunchSaitamaSmokeVFX");
      const mat = group?.children[1]?.children[0]?.material;
      const f = Math.floor((state?.punchTimer || 0) * 30);
      return {
        f,
        punching: state?.punching,
        groupVis: group?.visible,
        alpha: mat?.uniforms?.uGlobalAlpha?.value,
        progress: mat?.uniforms?.uProgress?.value,
      };
    });
    if (s.f >= 14 && s.f <= 30) {
      timeline.push(s);
    }
    await new Promise((r) => setTimeout(r, 16));
  }

  console.log("Timeline frames 14-30:");
  const seen = new Set();
  for (const t of timeline) {
    if (!seen.has(t.f)) {
      seen.add(t.f);
      console.log(JSON.stringify(t));
    }
  }

  await browser.close();
  server.close();
}

main();
