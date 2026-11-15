import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8863;
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
    const raw = req.url.split("?")[0];
    const rel = raw === "/" ? "/index.html" : raw;
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(file);
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(file).pipe(res);
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
      console.log(`BROWSER [${msg.type()}]:`, msg.text());
    });
    await page.setViewport({ width: 1280, height: 800 });

    console.log("Navigating to Dev Gym (?dev=1&skip=1)...");
    await page.goto(`http://127.0.0.1:${port}/?view=world&dev=1&skip=1`, { waitUntil: "domcontentloaded" });

    // Diagnostic poll
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const diag = await page.evaluate(() => {
        const root = document.documentElement;
        const pw = window.PortfolioWorld;
        const bot = pw?.debug?.bot?.();
        return {
          classes: root.className,
          pwActive: Boolean(pw?.active),
          botExists: Boolean(bot),
          actionsKeys: Object.keys(bot?.actions || {}),
        };
      });
      console.log(`Poll ${i * 500}ms:`, diag);
      if (diag.actionsKeys.includes("sprint")) {
        console.log("Actions loaded!");
        break;
      }
    }

    // Ensure intro is finished and canvas focused
    await page.evaluate(() => {
      window.PortfolioWorld?.debug?.finishIntro();
      window.PortfolioWorld?.debug?.zoom?.(1.8);
      document.getElementById("world-canvas")?.focus();
    });
    await new Promise((r) => setTimeout(r, 400));

    // Check actions.turn180 exists
    const actionInfo = await page.evaluate(() => {
      const bot = window.PortfolioWorld.debug.bot();
      const action = bot?.actions?.turn180;
      return {
        allActions: Object.keys(bot?.actions || {}),
        exists: Boolean(action),
        clipName: action?.getClip()?.name,
        duration: action?.getClip()?.duration,
      };
    });
    console.log("Actions info:", actionInfo);
    if (!actionInfo.exists) {
      throw new Error("actions.turn180 is missing on bot!");
    }

    // Step 1: Sprint with KeyS + ShiftLeft (toward the open south-east floor; W runs into the dummy)
    console.log("\n--- SPRINT FORWARD ---");
    await page.keyboard.down("ShiftLeft");
    await page.keyboard.down("KeyS");

    // Wait until sprint speed is reached
    let sprintReady = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const speed = await page.evaluate(() => window.PortfolioWorld.debug.speedMeter());
      if (speed >= 8.0) {
        sprintReady = true;
        console.log(`Reached sprint speed: ${speed.toFixed(2)} m/s (step ${i})`);
        break;
      }
    }
    if (!sprintReady) {
      const currentSpeed = await page.evaluate(() => window.PortfolioWorld.debug.speedMeter());
      console.warn(`Speed after 3s was ${currentSpeed} m/s`);
    }

    const preTurnState = await page.evaluate(() => {
      const s = window.PortfolioWorld.debug.state();
      return {
        speed: s.speedMeter,
        sprint: s.sprint,
        yaw: s.yaw,
        moveDir: [s.moveDir.x, s.moveDir.y, s.moveDir.z],
      };
    });
    console.log("Pre-turn state:", preTurnState);

    /* Warm-up lap: one full 180 and the run back. The first sprint and the first turn compile
       dust/wind/smear shaders (a 1–2 s stall), and the run back keeps Niko on open floor. */
    console.log("\n--- WARM-UP 180 ---");
    await new Promise((r) => setTimeout(r, 500));
    await page.keyboard.up("KeyS");
    await page.keyboard.down("KeyW");
    await new Promise((r) => setTimeout(r, 1500));
    await page.keyboard.up("KeyW");
    await page.keyboard.up("ShiftLeft");
    await new Promise((r) => setTimeout(r, 1200));
    await page.keyboard.down("ShiftLeft");
    await page.keyboard.down("KeyS");
    await new Promise((r) => setTimeout(r, 500));

    // Step 2: record every rendered frame in the page (root, body heading, feet), then reverse.
    await page.evaluate(() => {
      const pw = window.PortfolioWorld;
      const bot = pw.debug.bot();
      const state = pw.debug.state();
      const Vec = bot.bones.Hips.position.constructor;
      const a = new Vec();
      const b = new Vec();
      /* Heading of a left→right joint pair, as seen from above. */
      const heading = (left, right) => {
        left.getWorldPosition(a);
        right.getWorldPosition(b);
        return Math.atan2(a.x - b.x, a.z - b.z);
      };
      const foot = (bone) => {
        bone.getWorldPosition(a);
        return [a.x, a.y, a.z];
      };
      const rec = [];
      window.__turnRec = rec;
      const tick = () => {
        if (window.__turnRecStop) return;
        const pos = pw.debug.position();
        rec.push({
          now: performance.now(),
          turning: state.turning180,
          timer: state.turn180Timer,
          dur: state.turn180Dur,
          yaw: state.yaw,
          speed: state.speedMeter,
          sprint: state.sprint,
          pos: [pos[0], pos[2]],
          hip: heading(bot.bones.LeftUpLeg, bot.bones.RightUpLeg),
          chest: heading(bot.bones.LeftArm, bot.bones.RightArm),
          lf: foot(bot.bones.LeftFoot),
          rf: foot(bot.bones.RightFoot),
          turnW: bot.actions.turn180.getEffectiveWeight(),
          sprintW: bot.actions.sprint.getEffectiveWeight(),
          jogW: bot.actions.run.getEffectiveWeight(),
          scale: state.turn180Scale,
          move: [state.moveDir.x, state.moveDir.z],
          stopping: state.stopping,
        });
        if (rec.length > 4000) rec.shift();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await new Promise((r) => setTimeout(r, 500));

    console.log("\n--- TRIGGER 180 TURN (Release S, Press W) ---");
    await page.keyboard.up("KeyS");
    await page.keyboard.down("KeyW");

    const artifactDir = path.join(root, ".impeccable/review");
    fs.mkdirSync(artifactDir, { recursive: true });
    const shotTag = process.env.TAG || "turn-180";

    /* Apex ≈ frame 25 of 40 (feet planted, travel stopped). */
    let apexCaptured = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 25));
      const live = await page.evaluate(() => {
        const s = window.PortfolioWorld.debug.state();
        return { turning: s.turning180, norm: s.turn180Timer / (s.turn180Dur || 1) };
      });
      if (live.turning && live.norm >= 0.62 && !apexCaptured) {
        apexCaptured = true;
        await page.screenshot({ path: path.join(artifactDir, `${shotTag}-apex.png`) });
      }
    }
    await page.screenshot({ path: path.join(artifactDir, `${shotTag}-recovery.png`) });

    const rec = await page.evaluate(() => {
      window.__turnRecStop = true;
      return window.__turnRec;
    });
    await page.keyboard.up("KeyW");
    await page.keyboard.up("ShiftLeft");

    const deg = (r) => (r * 180) / Math.PI;
    const unwrap = (list) => {
      const out = [list[0]];
      for (let i = 1; i < list.length; i += 1) {
        let v = list[i];
        while (v - out[i - 1] > Math.PI) v -= Math.PI * 2;
        while (v - out[i - 1] < -Math.PI) v += Math.PI * 2;
        out.push(v);
      }
      return out;
    };
    const first = rec.findIndex((r) => r.turning);
    if (first < 3) throw new Error("state.turning180 was never triggered during reverse input!");
    let last = first;
    while (last + 1 < rec.length && rec[last + 1].turning) last += 1;
    const end = last + 1; // first frame after the clip
    const before = rec[first - 1];
    /* Inbound direction = the game's own travel direction on the last sprint frame. */
    const dir = before.move;
    const stalled = rec.slice(Math.max(1, first - 12), first + 1).some((r, i, list) => i > 0 && r.now - list[i - 1].now > 120);
    if (stalled || before.stopping) console.warn(`WARNING: frame stall or stop state right before the turn (stalled=${stalled}, stopping=${before.stopping}); rerun.`);
    const along = (p) => (p[0] - before.pos[0]) * dir[0] + (p[1] - before.pos[1]) * dir[1];
    const side = (p) => (p[0] - before.pos[0]) * dir[1] - (p[1] - before.pos[1]) * dir[0];
    const yawU = unwrap(rec.map((r) => r.yaw));
    const hipU = unwrap(rec.map((r) => r.hip));
    const chestU = unwrap(rec.map((r) => r.chest));
    const rel = (list, i) => deg(list[i] - list[first - 1]);
    const frameOf = (r) => (r.turning ? (r.timer / (r.dur || 1)) * 40 : null);
    const pad = (v, n, d = 1) => (typeof v === "number" ? v.toFixed(d) : String(v)).padStart(n);

    console.log(`\nscale ${rec[first].scale.toFixed(3)} world units per model unit; ${rec.length} frames recorded`);
    console.log("   ms  clipF  rootYaw  hipHead  chest  speed  along   side  turnW sprW jogW   RF along/side/y        LF along/side/y");
    const tailEnd = Math.min(rec.length - 1, end + 22);
    for (let i = first - 2; i <= tailEnd; i += 1) {
      const r = rec[i];
      const f = frameOf(r);
      console.log(
        pad(r.now - rec[first].now, 5, 0),
        pad(f == null ? (i < first ? "run" : "out") : f, 6),
        pad(rel(yawU, i), 8), pad(rel(hipU, i), 8), pad(rel(chestU, i), 7),
        pad(r.speed, 6), pad(along(r.pos), 6, 2), pad(side(r.pos), 6, 2),
        pad(r.turnW, 5, 2), pad(r.sprintW, 4, 2), pad(r.jogW, 4, 2),
        " ", pad(along([r.rf[0], r.rf[2]]), 6, 2), pad(side([r.rf[0], r.rf[2]]), 6, 2), pad(r.rf[1], 5, 2),
        " ", pad(along([r.lf[0], r.lf[2]]), 6, 2), pad(side([r.lf[0], r.lf[2]]), 6, 2), pad(r.lf[1], 5, 2),
      );
    }

    /* 1. Timing */
    const wall = (rec[end].now - rec[first].now) / 1000;
    const clipDur = rec[first].dur;
    /* 2. Root lands on exactly half a turn */
    const rootTurn = rel(yawU, end);
    /* 3. Body heading over the handoff: biggest single-frame step and total swing in the 0.3 s after the clip */
    const afterEnd = Math.min(rec.length - 1, end + Math.round(0.3 / Math.max(0.004, wall / Math.max(1, end - first))));
    let handoffStep = 0;
    let swingMin = Infinity;
    let swingMax = -Infinity;
    for (let i = end - 1; i <= afterEnd; i += 1) {
      if (i > end - 1) handoffStep = Math.max(handoffStep, Math.abs(deg(hipU[i] - hipU[i - 1])));
      swingMin = Math.min(swingMin, rel(hipU, i));
      swingMax = Math.max(swingMax, rel(hipU, i));
    }
    /* Biggest single-frame body heading step anywhere in the turn (a root snap shows up here). */
    let turnStep = 0;
    for (let i = first; i <= end; i += 1) turnStep = Math.max(turnStep, Math.abs(deg(hipU[i] - hipU[i - 1])));
    /* 4. Planted feet: right foot frames 16–38, left foot frames 23–31 */
    const slide = (key, f0, f1) => {
      const hits = rec.filter((r) => r.turning && frameOf(r) >= f0 && frameOf(r) <= f1).map((r) => [r[key][0], r[key][2]]);
      if (hits.length < 2) return NaN;
      let worst = 0;
      for (const p of hits) worst = Math.max(worst, Math.hypot(p[0] - hits[0][0], p[1] - hits[0][1]));
      return worst;
    };
    const rfSlide = slide("rf", 16, 38);
    const lfSlide = slide("lf", 23, 31);
    const exitGait = rec[Math.min(rec.length - 1, end + 2)];

    console.log(`\nTurn: clip ${clipDur.toFixed(3)} s, wall ${wall.toFixed(3)} s over ${end - first} frames`);
    console.log(`Root yaw change at clip end: ${rootTurn.toFixed(1)}° (expected ±180)`);
    console.log(`Body heading: biggest per-frame step in the turn ${turnStep.toFixed(1)}°, at/after the handoff ${handoffStep.toFixed(1)}°`);
    console.log(`Body heading in the 0.3 s after the clip: ${swingMin.toFixed(1)}° .. ${swingMax.toFixed(1)}° (sprint twist is ±17° around ±180)`);
    console.log(`Planted foot drift (world units, Niko is 2.5 tall): right f16–38 ${rfSlide.toFixed(3)}, left f23–31 ${lfSlide.toFixed(3)}`);
    console.log(`Gait 2 frames after the clip: sprint ${exitGait.sprintW.toFixed(2)} jog ${exitGait.jogW.toFixed(2)} speed ${exitGait.speed.toFixed(2)}`);

    const fails = [];
    if (Math.abs(clipDur - 40 / 60) > 0.02) fails.push(`clip duration ${clipDur.toFixed(3)} s, expected 0.667`);
    if (Math.abs(Math.abs(rootTurn) - 180) > 0.5) fails.push(`root turned ${rootTurn.toFixed(1)}°`);
    if (Math.abs(swingMax - swingMin) > 45) fails.push(`body swings ${(swingMax - swingMin).toFixed(1)}° after the handoff`);
    if (Math.min(Math.abs(swingMin + 180), Math.abs(swingMin - 180)) > 40) fails.push(`body is ${swingMin.toFixed(1)}° off after the handoff`);
    if (exitGait.sprintW < 0.9) fails.push(`gait after the clip is not sprint (${exitGait.sprintW.toFixed(2)})`);
    if (fails.length) throw new Error(`180 check failed: ${fails.join("; ")}`);

    console.log("\nSUCCESS: 180 turn plays the authored motion and hands off to sprint without a facing change.");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
