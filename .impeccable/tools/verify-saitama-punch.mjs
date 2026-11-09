import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8853;
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
  let browser = null;
  try {
    browser = await puppeteer.launch({
      executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      headless: true,
      args: ["--ignore-gpu-blocklist", "--use-gl=angle"],
    });
    const page = await browser.newPage();
    page.on("pageerror", (err) => console.error("BROWSER PAGE ERROR:", err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error("BROWSER CONSOLE ERROR:", msg.text());
    });
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(`http://127.0.0.1:${port}/?view=world&skip=1`, { waitUntil: "domcontentloaded" });

    for (let i = 0; i < 200 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }

    await page.evaluate(() => {
      window.PortfolioWorld?.debug?.finishIntro?.();
      window.PortfolioWorld?.debug?.zoom?.(2.5);
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.click("#world canvas");

    const canvas = await page.$("#world canvas");

    console.log("Triggering One Punch (G key)...");
    await page.keyboard.press("KeyG");

    let gImpact = false;
    let gApex = false;
    let impactTime = 0;
    const startG = Date.now();

    while (Date.now() - startG < 2000) {
      const info = await page.evaluate(() => {
        const pw = window.PortfolioWorld;
        const state = pw?.debug?.state?.();
        const sm = pw?.debug?.punchSmoke?.();
        const f = Math.floor((state?.punchTimer || 0) * 30);
        return {
          f,
          punching: state?.punching,
          punchType: state?.punchType,
          smokeActive: sm?.active,
          puffCount: sm?.puffCount,
        };
      });

      if (!gImpact && info.smokeActive && info.f >= 16) {
        gImpact = true;
        impactTime = Date.now();
        await canvas.screenshot({
          path: path.join(root, ".impeccable/review/saitama-onepunch-centered-impact.png"),
        });
        console.log(`Saved saitama-onepunch-centered-impact.png at frame ${info.f}`);
      }

      if (gImpact && !gApex && Date.now() - impactTime >= 75 && info.smokeActive) {
        gApex = true;
        await canvas.screenshot({
          path: path.join(root, ".impeccable/review/saitama-onepunch-centered-apex.png"),
        });
        console.log(`Saved saitama-onepunch-centered-apex.png at frame ${info.f}`);
        break;
      }

      await new Promise((r) => setTimeout(r, 10));
    }

    await new Promise((r) => setTimeout(r, 800));

    console.log("Triggering Combo Punch (F key)...");
    await page.keyboard.press("KeyF");

    let fImpact = false;
    let fApex = false;
    let fImpactTime = 0;
    const startF = Date.now();

    while (Date.now() - startF < 2500) {
      const info = await page.evaluate(() => {
        const pw = window.PortfolioWorld;
        const state = pw?.debug?.state?.();
        const sm = pw?.debug?.punchSmoke?.();
        const f = Math.floor((state?.punchTimer || 0) * 30);
        return {
          f,
          punching: state?.punching,
          smokeActive: sm?.active,
          puffCount: sm?.puffCount,
        };
      });

      if (!fImpact && info.smokeActive && info.f >= 37) {
        fImpact = true;
        fImpactTime = Date.now();
        await canvas.screenshot({
          path: path.join(root, ".impeccable/review/saitama-combopunch-centered-impact.png"),
        });
        console.log(`Saved saitama-combopunch-centered-impact.png at frame ${info.f}`);
      }

      if (fImpact && !fApex && Date.now() - fImpactTime >= 75 && info.smokeActive) {
        fApex = true;
        await canvas.screenshot({
          path: path.join(root, ".impeccable/review/saitama-combopunch-centered-apex.png"),
        });
        console.log(`Saved saitama-combopunch-centered-apex.png at frame ${info.f}`);
        break;
      }

      await new Promise((r) => setTimeout(r, 12));
    }

    console.log("Done!");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main();
