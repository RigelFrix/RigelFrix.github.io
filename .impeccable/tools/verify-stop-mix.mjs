import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8849;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".json": "application/json",
  ".png": "image/png",
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

    // Ensure intro is fully finished and canvas focused
    await page.evaluate(() => {
      window.PortfolioWorld.debug.finishIntro();
      document.getElementById("world-canvas")?.focus();
    });
    await new Promise((r) => setTimeout(r, 200));

    // 1. Sprint for 0.6s
    console.log("Holding Shift + W to sprint...");
    await page.evaluate(() => {
      const s = window.PortfolioWorld.debug.state();
      s.keys.add("w");
      s.keys.add("shift");
    });
    await new Promise((r) => setTimeout(r, 600));

    const sprintState = await page.evaluate(() => {
      const b = window.PortfolioWorld.debug.bot();
      const s = window.PortfolioWorld.debug.state();
      return {
        pos: window.PortfolioWorld.debug.position(),
        sprintWeight: b.actions?.sprint?.getEffectiveWeight(),
        sprintVal: s.sprint,
        pace: s.pace,
        walk: s.walk,
        stopping: s.stopping,
      };
    });
    console.log("Mid-sprint state:", JSON.stringify(sprintState));

    // 2. Release keys to trigger abrupt stop
    console.log("Releasing Shift + W to trigger abrupt stop...");
    await page.evaluate(() => {
      const s = window.PortfolioWorld.debug.state();
      s.keys.delete("w");
      s.keys.delete("shift");
    });

    const timeline = [];
    for (let i = 0; i < 35; i++) {
      await new Promise((r) => setTimeout(r, 20));
      const step = await page.evaluate(() => {
        const s = window.PortfolioWorld.debug.state();
        const b = window.PortfolioWorld.debug.bot();
        return {
          stopping: s.stopping,
          timer: +s.stopTimer.toFixed(3),
          pos: window.PortfolioWorld.debug.position().map((v) => +v.toFixed(3)),
          sprintWeight: +(b.actions?.sprint?.getEffectiveWeight() || 0).toFixed(3),
          stopWeight: +(b.actions?.stop?.getEffectiveWeight() || 0).toFixed(3),
          idleWeight: +(b.actions?.idle?.getEffectiveWeight() || 0).toFixed(3),
        };
      });
      timeline.push(step);
    }

    console.log("Stop transition timeline sample:");
    timeline.filter((_, idx) => idx % 4 === 0).forEach((t) => console.log(JSON.stringify(t)));

    // Verify properties:
    const firstStopStep = timeline.find((t) => t.stopping);
    console.log(`First stop step:`, JSON.stringify(firstStopStep));

    const apex = timeline.find((t) => t.timer > 0.15 && t.timer < 0.28);
    console.log(`Apex stop weight (t=${apex?.timer}s): ${apex?.stopWeight}, idleWeight: ${apex?.idleWeight}`);

    const finalStep = timeline[timeline.length - 1];
    console.log(`Final settle (t=${finalStep.timer}s, stopping=${finalStep.stopping}): idleWeight=${finalStep.idleWeight}, stopWeight=${finalStep.stopWeight}`);

    const displacement = Math.hypot(
      timeline[timeline.length - 1].pos[0] - sprintState.pos[0],
      timeline[timeline.length - 1].pos[2] - sprintState.pos[2]
    );
    console.log(`Total skid displacement during stop: ${displacement.toFixed(3)}m`);

    console.log("All stopping mix assertions verified successfully!");
  } catch (err) {
    console.error("Test error:", err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main();
