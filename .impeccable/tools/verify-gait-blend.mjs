/* Jog ↔ sprint blend check: soft posture ease + Shift-spam hysteresis.
   Asserts the mix does not thrash at high speed, and a clean enter takes ~gaitBlend (not a snap).
   node .impeccable/tools/verify-gait-blend.mjs */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8876;
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
      if (await page.evaluate(() => Boolean(window.PortfolioWorld?.debug?.bot?.()?.actions?.sprint))) break;
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
      const a = bot.bones.Hips.position.clone();
      const rec = [];
      let phase = "jog";
      let t0 = performance.now();
      let flips = 0;
      let nextFlip = 0;
      down("s");
      const tick = () => {
        const now = performance.now();
        bot.bones.LeftFoot.getWorldPosition(a);
        const lf = [a.x, a.y, a.z];
        bot.bones.RightFoot.getWorldPosition(a);
        const rf = [a.x, a.y, a.z];
        const lq = bot.bones.LeftFoot.quaternion;
        const rq = bot.bones.RightFoot.quaternion;
        const sprintW = bot.actions.sprint.getEffectiveWeight();
        const jogW = bot.actions.run.getEffectiveWeight();
        rec.push({
          now,
          phase,
          gaitSprint: state.gaitSprint ? 1 : 0,
          gaitMix: state.gaitMix ?? 0,
          sprintW,
          jogW,
          both: sprintW > 0.08 && jogW > 0.08 ? 1 : 0,
          lf,
          rf,
          lq: [lq.x, lq.y, lq.z, lq.w],
          rq: [rq.x, rq.y, rq.z, rq.w],
          speed: state.speedMeter,
        });
        /* Jog first, then one clean Shift enter, then high-speed Shift spam. */
        if (phase === "jog" && now - t0 > 500) {
          phase = "enter";
          down("shift");
          t0 = now;
        }
        if (phase === "enter" && now - t0 > 900) {
          phase = "spam";
          nextFlip = now;
        }
        if (phase === "spam" && now >= nextFlip && flips < 16) {
          if (flips % 2 === 0) up("shift");
          else down("shift");
          flips += 1;
          nextFlip = now + 70 + (flips % 3) * 40;
        }
        if (phase === "spam" && flips >= 16 && now > nextFlip + 450) {
          up("s");
          up("shift");
          resolve(rec);
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));

    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const qstep = (a, b) => {
      const d = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
      return (Math.acos(d) * 360) / Math.PI;
    };

    let maxFoot = 0;
    let maxAnkle = 0;
    let enterRiseMs = 0;
    let enterStart = null;
    let enterDone = false;
    let spamSwitches = 0;
    let spamBothNearOne = 0;
    let spamFrames = 0;
    for (let i = 1; i < trial.length; i += 1) {
      const dt = (trial[i].now - trial[i - 1].now) / 1000;
      if (dt >= 0.001 && dt <= 0.12) {
        const foot = Math.max(dist(trial[i].lf, trial[i - 1].lf), dist(trial[i].rf, trial[i - 1].rf));
        const ankle = Math.max(qstep(trial[i].lq, trial[i - 1].lq), qstep(trial[i].rq, trial[i - 1].rq));
        maxFoot = Math.max(maxFoot, foot);
        maxAnkle = Math.max(maxAnkle, ankle);
      }
      if (trial[i].phase === "enter") {
        if (enterStart == null && trial[i].gaitMix > 0.02) enterStart = trial[i].now;
        if (enterStart != null && !enterDone && trial[i].gaitMix >= 0.98) {
          enterRiseMs = trial[i].now - enterStart;
          enterDone = true;
        }
      }
      if (trial[i].phase === "spam" && trial[i].speed >= 7) {
        spamFrames += 1;
        if (trial[i].gaitSprint !== trial[i - 1].gaitSprint) spamSwitches += 1;
        /* At high speed with hysteresis the mix should stay near sprint, not thrash through mid-blend. */
        if (trial[i].both && trial[i].gaitMix < 0.85) spamBothNearOne += 1;
      }
    }

    console.log(`frames ${trial.length}, enter rise ${enterRiseMs.toFixed(0)} ms, spam switches ${spamSwitches}, mid-blend spam frames ${spamBothNearOne}/${spamFrames}`);
    console.log(`max foot step ${maxFoot.toFixed(3)}, max ankle ${maxAnkle.toFixed(1)}°`);

    const fails = [];
    if (!enterDone) fails.push("gaitMix never reached sprint during enter");
    /* Soft blend should take a noticeable fraction of gaitBlend (0.5 s), not a one-frame snap. */
    if (enterRiseMs < 250) fails.push(`enter rise too fast (${enterRiseMs.toFixed(0)} ms) — body would still snap`);
    if (enterRiseMs > 900) fails.push(`enter rise too slow (${enterRiseMs.toFixed(0)} ms)`);
    if (spamSwitches > 3) fails.push(`gait preference flipped ${spamSwitches} times during high-speed Shift spam`);
    if (spamBothNearOne > 8) fails.push(`mix thrashed through mid-blend during spam (${spamBothNearOne} frames)`);
    if (maxAnkle > 120) fails.push(`ankle step ${maxAnkle.toFixed(1)}° too violent`);
    if (fails.length) throw new Error(fails.join("; "));
    console.log("SUCCESS: soft jog↔sprint lean + spam hysteresis.");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
