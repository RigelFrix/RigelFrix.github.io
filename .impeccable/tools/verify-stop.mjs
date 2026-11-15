/* Verify sprint stop root motion against sprinting-stop-v3-3 export.
   node .impeccable/tools/verify-stop.mjs */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const stopData = JSON.parse(fs.readFileSync(path.join(root, "assets/niko/stop.json"), "utf8"));
const port = 8892;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const server = http
  .createServer((req, res) => {
    const rel = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Cache-Control": "no-cache", "Content-Type": types[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, "127.0.0.1");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      headless: true,
      args: ["--ignore-gpu-blocklist", "--use-gl=angle"],
    });
    const page = await browser.newPage();
    page.on("pageerror", (err) => console.error("PAGE:", err.message));
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`http://127.0.0.1:${port}/?view=world&dev=1&skip=1`, { waitUntil: "domcontentloaded" });
    for (let i = 0; i < 40; i += 1) {
      await sleep(400);
      if (await page.evaluate(() => Boolean(window.PortfolioWorld?.debug?.bot?.()?.actions?.stop))) break;
    }
    await page.evaluate(() => {
      window.PortfolioWorld.debug.finishIntro();
      document.getElementById("world-canvas")?.focus();
      const bot = window.PortfolioWorld.debug.bot();
      if (bot.robot) bot.robot.position.set(40, 0, 48);
    });
    await sleep(400);

    const trial = await page.evaluate(() => new Promise((resolve) => {
      const bot = window.PortfolioWorld.debug.bot();
      const state = window.PortfolioWorld.debug.state();
      const down = (k) => {
        if (k === "shift") {
          state.keys.add("shift");
          state.keys.add("shiftleft");
        } else state.keys.add(k);
      };
      const up = (k) => {
        if (k === "shift") {
          state.keys.delete("shift");
          state.keys.delete("shiftleft");
          state.keys.delete("shiftright");
        } else state.keys.delete(k);
      };
      const rec = [];
      let phase = "sprint";
      let t0 = performance.now();
      let startPos = null;
      let startScale = 1;
      down("s");
      down("shift");
      const tick = () => {
        const now = performance.now();
        const stopW = bot.actions.stop.getEffectiveWeight();
        const sprintW = bot.actions.sprint.getEffectiveWeight();
        const idleW = bot.actions.idle.getEffectiveWeight();
        if (phase === "sprint" && now - t0 > 1000 && state.speedMeter >= 9) {
          phase = "stop";
          startPos = bot.robot.position.clone();
          startScale = state.stopScale || 1;
          up("s");
          up("shift");
          t0 = now;
        }
        if (phase === "stop") {
          rec.push({
            now,
            timer: state.stopTimer,
            stopping: state.stopping ? 1 : 0,
            stopW,
            sprintW,
            idleW,
            speed: state.speedMeter,
            scale: state.stopScale,
            carry: state.stopCarry,
            x: bot.robot.position.x,
            z: bot.robot.position.z,
          });
          if (!state.stopping && rec.length > 8) {
            resolve({
              rec,
              start: { x: startPos.x, z: startPos.z },
              end: { x: bot.robot.position.x, z: bot.robot.position.z },
              scale: startScale || state.stopScale,
              dur: state.stopDur,
            });
            return;
          }
          if (now - t0 > 2000) {
            resolve({ rec, start: startPos, end: bot.robot.position, scale: state.stopScale, dur: state.stopDur, timedOut: true });
            return;
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));

    if (trial.timedOut) throw new Error("stop never finished");
    const root = stopData.root;
    const last = root.length / 2 - 1;
    const authoredModel = Math.hypot(root[last * 2] - root[0], root[last * 2 + 1] - root[1]);
    const dist = Math.hypot(trial.end.x - trial.start.x, trial.end.z - trial.start.z);
    const stopFrames = trial.rec.filter((r) => r.stopping);
    const maxStopW = Math.max(0, ...stopFrames.map((r) => r.stopW));
    const both = stopFrames.filter((r) => r.stopW > 0.2 && r.sprintW > 0.2).length;
    const durSeen = stopFrames.length ? stopFrames.at(-1).timer : 0;

    console.log(`authored travel ${authoredModel.toFixed(3)} model × scale ${trial.scale.toFixed(3)} ≈ ${(authoredModel * trial.scale).toFixed(3)} world (+ carry)`);
    console.log(`game travel ${dist.toFixed(3)} world over ${durSeen.toFixed(3)}s (clip ${stopData.duration}s)`);
    console.log(`stopW max ${maxStopW.toFixed(2)}, both-weighted frames ${both}, samples ${trial.rec.length}`);

    const fails = [];
    const rate = trial.dur > 0 ? stopData.duration / trial.dur : 1;
    console.log(`playback rate ~${rate.toFixed(2)}× (stopDur ${trial.dur?.toFixed(3)}s)`);
    if (durSeen < (trial.dur || stopData.duration) * 0.85) fails.push(`clip cropped (timer peaked at ${durSeen.toFixed(3)}s)`);
    if (maxStopW < 0.95) fails.push(`stop weight never exclusive (${maxStopW})`);
    if (both > 2) fails.push(`sprint+stop both weighted on ${both} frames`);
    /* Carry from sprint makes travel longer than bare authored; require at least ~70% of authored×scale. */
    const minTravel = authoredModel * trial.scale * 0.7;
    if (dist < minTravel) fails.push(`travel too short ${dist.toFixed(3)} < ${minTravel.toFixed(3)} (scale/root broken?)`);
    if (fails.length) throw new Error(fails.join("; "));
    console.log("SUCCESS: stop root motion plays the authored decelerate.");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
