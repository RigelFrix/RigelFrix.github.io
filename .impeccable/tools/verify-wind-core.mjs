import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8779;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".fbx": "application/octet-stream",
};

const server = http
  .createServer((req, res) => {
    let url = decodeURIComponent(req.url.split("?")[0]);
    if (url.endsWith("/")) url += "index.html";
    const file = path.join(root, url);
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    });
  })
  .listen(port, "127.0.0.1");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let browser = null;
  try {
    console.log(`Test server running at http://127.0.0.1:${port}/`);
    browser = await puppeteer.launch({
      executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      headless: true,
      protocolTimeout: 60000,
      args: ["--ignore-gpu-blocklist", "--use-gl=angle"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    page.on("console", (msg) => {
      const text = msg.text();
      if (!text.includes("[HMR]") && !text.includes("Download the React DevTools")) {
        console.log("  [browser console]", text);
      }
    });

    console.log("Navigating to world view...");
    await page.goto(`http://127.0.0.1:${port}/?view=world&skip=1`, { waitUntil: "domcontentloaded" });

    for (let i = 0; i < 200 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i++) {
      await wait(50);
    }

    // Finish intro if active
    await page.evaluate(() => {
      if (window.PortfolioWorld?.debug?.finishIntro) {
        window.PortfolioWorld.debug.finishIntro();
      }
    });

    await wait(600);

    // Focus the canvas
    await page.click("#world canvas");
    await wait(200);

    // Initial check
    const initialCheck = await page.evaluate(() => {
      const pw = window.PortfolioWorld;
      const bot = pw?.debug?.bot?.();
      const wc = pw?.debug?.windCore?.();
      return {
        hasBot: Boolean(bot),
        hasPunch: Boolean(bot?.actions?.punch),
        windCore: wc,
      };
    });
    console.log("Initial state:", initialCheck);

    if (initialCheck.windCore?.active) {
      throw new Error("Wind core should be inactive before punch!");
    }

    // Trigger punch!
    console.log("\nPressing 'F' to trigger punch combo...");
    await page.keyboard.press("KeyF");

    // Sample across frames 0 to 45
    const samples = [];
    const startTime = Date.now();
    let peakCaptured = false;

    while (Date.now() - startTime < 1600) {
      const sample = await page.evaluate(() => {
        const pw = window.PortfolioWorld;
        const state = pw?.debug?.state?.();
        const wc = pw?.debug?.windCore?.();
        const hb = pw?.debug?.punchHitbox?.();
        return {
          timer: state?.punchTimer,
          frame: Math.floor((state?.punchTimer || 0) * 30),
          windCoreActive: wc?.active,
          windCoreVisible: wc?.visible,
          windCoreScale: wc?.scale,
          hitboxActive: hb?.active,
        };
      });

      samples.push(sample);

      // If we are at peak punch impact (frames 37-40), capture a screenshot!
      if (!peakCaptured && sample.frame >= 37 && sample.frame <= 40 && sample.windCoreVisible) {
        peakCaptured = true;
        console.log(`\n>>> Capturing screenshot at frame ${sample.frame}! Wind core active: ${sample.windCoreActive}`);
        const screenshotPath = path.join(root, "assets", "niko", "wind-core-punch-impact.png");
        await page.screenshot({ path: screenshotPath });
        console.log(`Saved screenshot to ${screenshotPath}`);
      }

      await wait(25);
    }

    // Check samples
    const activeSamples = samples.filter((s) => s.windCoreActive);
    console.log(`\nSamples collected: ${samples.length}, Active wind core samples: ${activeSamples.length}`);
    if (activeSamples.length > 0) {
      console.log("Sample active frames:", activeSamples.map((s) => `f${s.frame}(len:${s.windCoreScale?.[2]?.toFixed(2)}m)`).slice(0, 10).join(", "));
    }

    // Final check after combo completes
    await wait(600);
    const finalCheck = await page.evaluate(() => {
      const pw = window.PortfolioWorld;
      const state = pw?.debug?.state?.();
      const wc = pw?.debug?.windCore?.();
      return {
        punching: state?.punching,
        windCoreActive: wc?.active,
        windCoreVisible: wc?.visible,
      };
    });
    console.log("\nFinal state after completion:", finalCheck);

    if (finalCheck.windCoreActive || finalCheck.windCoreVisible) {
      throw new Error("Wind core did not hide after combo completed!");
    }

    console.log("\n>>> ALL CHECKS PASSED SUCCESSFULLY! <<<");
  } catch (err) {
    console.error("Verification error:", err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main();

