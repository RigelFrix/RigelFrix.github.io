/* 180 turn entry check: every direction pair × every way of pressing the opposite key.
   gap < 0  = overlap (opposite key goes down while the first is still held)
   gap >= 0 = same-finger reverse (first key up, wait `gap` ms, opposite key down); this is how W↔S is usually typed.
   Keys are sent from inside the page on rAF so the gap is exact, and every rendered frame is recorded.

   node .impeccable/tools/verify-turn-180-gap.mjs
   env: GAPS="-1,0,30,60,100,140,200"  PAIRS="s>w,w>s,d>a,a>d"  DUMP="s>w:100" (per-frame table for one trial) */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8864;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const GAPS = (process.env.GAPS || "-1,0,30,60,100,140,200").split(",").map(Number);
const PAIRS = (process.env.PAIRS || "s>w,w>s,d>a,a>d").split(",").map((p) => p.split(">"));
const DUMP = process.env.DUMP || "";

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
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, "127.0.0.1");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Runs in the page: one trial, driven and recorded on rAF. */
const trial = ({ from, to, gap, home }) =>
  new Promise((resolve) => {
    const pw = window.PortfolioWorld;
    const bot = pw.debug.bot();
    const state = pw.debug.state();
    const scene = pw.debug.scene();
    let robot = bot.model;
    while (robot.parent && robot.parent !== scene) robot = robot.parent;
    const Vec = bot.bones.Hips.position.constructor;
    const a = new Vec();
    const b = new Vec();
    const key = (type, k) => document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, shiftKey: k !== "Shift" }));
    const heading = (left, right) => {
      left.getWorldPosition(a);
      right.getWorldPosition(b);
      return Math.atan2(a.x - b.x, a.z - b.z);
    };
    const foot = (bone) => {
      bone.getWorldPosition(a);
      return [a.x, a.y, a.z];
    };
    robot.position.x = home[0];
    robot.position.z = home[1];
    const rec = [];
    let phase = "settle";
    let t0 = performance.now();
    let upAt = 0;
    let downAt = 0;
    let steady = 0;
    const tick = () => {
      const now = performance.now();
      if (phase === "settle" && now - t0 > 500) {
        key("keydown", "Shift");
        key("keydown", from);
        phase = "sprint";
        t0 = now;
      } else if (phase === "sprint") {
        steady = state.speedMeter >= 10.3 && !state.turning180 ? steady + 1 : 0;
        if (steady >= 12 || now - t0 > 3000) {
          if (gap < 0) {
            key("keydown", to);
            downAt = now;
            upAt = now;
            phase = "overlap";
          } else {
            key("keyup", from);
            upAt = now;
            phase = "gap";
          }
        }
      } else if (phase === "overlap" && now - downAt >= 40) {
        key("keyup", from);
        phase = "run";
      } else if (phase === "gap" && now - upAt >= gap) {
        key("keydown", to);
        downAt = now;
        phase = "run";
      } else if (phase === "run" && now - downAt > 1300) {
        key("keyup", to);
        key("keyup", "Shift");
        resolve({ rec, upAt, downAt });
        return;
      }
      if (phase !== "settle") {
        rec.push({
          now,
          turning: state.turning180,
          timer: state.turn180Timer,
          dur: state.turn180Dur,
          speed: state.speedMeter,
          stopping: state.stopping,
          pos: [robot.position.x, robot.position.z],
          face: robot.rotation.y,
          hip: heading(bot.bones.LeftUpLeg, bot.bones.RightUpLeg),
          lf: foot(bot.bones.LeftFoot),
          rf: foot(bot.bones.RightFoot),
          turnW: bot.actions.turn180.getEffectiveWeight(),
          sprintW: bot.actions.sprint.getEffectiveWeight(),
          stopW: bot.actions.stop ? bot.actions.stop.getEffectiveWeight() : 0,
          move: [state.moveDir.x, state.moveDir.z],
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

const deg = (r) => (r * 180) / Math.PI;
const wrap = (r) => Math.atan2(Math.sin(r), Math.cos(r));
const pad = (v, n, d = 1) => (typeof v === "number" ? v.toFixed(d) : String(v)).padStart(n);

function analyse({ rec, upAt, downAt }) {
  /* Old travel direction = the game's own moveDir on the last frame before any key changed. */
  const iUp = rec.findIndex((r) => r.now >= upAt);
  const base = rec[Math.max(0, iUp - 1)];
  const dir = base.move;
  const along = (p) => (p[0] - base.pos[0]) * dir[0] + (p[1] - base.pos[1]) * dir[1];
  const iDown = rec.findIndex((r) => r.now >= downAt);
  const first = rec.findIndex((r, i) => i >= iDown - 1 && r.turning);
  const out = { started: first >= 0 };
  /* Root speed along the old direction, frame to frame. */
  const vel = (i) => (i > 0 ? (along(rec[i].pos) - along(rec[i - 1].pos)) / Math.max(1e-3, (rec[i].now - rec[i - 1].now) / 1000) : 0);
  const until = first >= 0 ? first : rec.length - 1;
  /* Between the key press and the turn: how far he ran the new way, and how far the facing went. */
  let peak = -Infinity;
  let back = 0;
  let faceOff = 0;
  for (let i = Math.max(0, iDown - 1); i <= until; i += 1) {
    peak = Math.max(peak, along(rec[i].pos));
    back = Math.max(back, peak - along(rec[i].pos));
    if (i < until || first < 0) faceOff = Math.max(faceOff, Math.abs(deg(wrap(rec[i].face - base.face))));
  }
  out.back = back;
  out.faceOff = faceOff;
  if (first < 0) return out;
  let last = first;
  while (last + 1 < rec.length && rec[last + 1].turning) last += 1;
  const end = Math.min(rec.length - 1, last + 1);
  out.delay = rec[first].now - downAt;
  out.joinFrame = (Math.max(0, rec[first].timer - (rec[first].now - rec[first - 1].now) / 1000) / rec[first].dur) * 40;
  out.faceSnap = Math.abs(deg(wrap(rec[first].face - rec[first - 1].face)));
  out.speedBefore = vel(first - 1);
  out.speedAfter = vel(first + 1);
  out.forward = Math.max(...rec.slice(first, end + 1).map((r) => along(r.pos))) - along(rec[first - 1].pos);
  /* Fastest the root gets before the first foot plants (frame 16), averaged over ~40 ms. */
  out.peak = 0;
  for (let i = first; i <= last && (rec[i].timer / rec[i].dur) * 40 <= 16; i += 1) {
    let j = i;
    while (j > first - 1 && rec[i].now - rec[j].now < 40) j -= 1;
    const span = (rec[i].now - rec[j].now) / 1000;
    if (span > 0.03) out.peak = Math.max(out.peak, (along(rec[i].pos) - along(rec[j].pos)) / span);
  }
  out.wall = (rec[end].now - rec[first].now) / 1000;
  out.turn = deg(wrap(rec[end].face - base.face));
  const frameOf = (r) => (r.timer / (r.dur || 1)) * 40;
  const slide = (key, f0, f1) => {
    const hits = rec.slice(first, last + 1).filter((r) => frameOf(r) >= f0 && frameOf(r) <= f1).map((r) => [r[key][0], r[key][2]]);
    let worst = 0;
    for (const p of hits) worst = Math.max(worst, Math.hypot(p[0] - hits[0][0], p[1] - hits[0][1]));
    return worst;
  };
  out.rf = slide("rf", 16, 38);
  out.lf = slide("lf", 23, 31);
  let step = 0;
  for (let i = first + 1; i <= end; i += 1) step = Math.max(step, Math.abs(deg(wrap(rec[i].hip - rec[i - 1].hip))));
  out.hipStep = step;
  out.exitSprint = rec[Math.min(rec.length - 1, end + 2)].sprintW;
  out.dump = () => {
    console.log("    ms clipF  face   hip  speed  vel  along  turnW sprW stopW  RF along/y    LF along/y");
    for (let i = Math.max(1, iUp - 3); i <= Math.min(rec.length - 1, end + 14); i += 1) {
      const r = rec[i];
      console.log(
        pad(r.now - downAt, 6, 0), pad(r.turning ? frameOf(r) : r.stopping ? "stop" : "-", 5),
        pad(deg(wrap(r.face - base.face)), 6), pad(deg(wrap(r.hip - base.hip)), 6), pad(r.speed, 5), pad(vel(i), 5),
        pad(along(r.pos), 6, 2), pad(r.turnW, 5, 2), pad(r.sprintW, 4, 2), pad(r.stopW, 4, 2),
        " ", pad(along([r.rf[0], r.rf[2]]), 6, 2), pad(r.rf[1], 5, 2), " ", pad(along([r.lf[0], r.lf[2]]), 6, 2), pad(r.lf[1], 5, 2),
      );
    }
  };
  return out;
}

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
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`http://127.0.0.1:${port}/?view=world&dev=1&skip=1`, { waitUntil: "domcontentloaded" });
    for (let i = 0; i < 60; i += 1) {
      await sleep(500);
      const ready = await page.evaluate(() => Boolean(window.PortfolioWorld?.debug?.bot?.()?.actions?.turn180));
      if (ready) break;
    }
    await page.evaluate(() => {
      window.PortfolioWorld.debug.finishIntro();
      document.getElementById("world-canvas")?.focus();
    });
    await sleep(600);
    const bundle = await page.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => s.includes("world.bundle")) || "");
    console.log(`bundle ${bundle.split("/").pop()}`);

    /* Open floor south of the low walls; every direction has 30+ units of room. */
    const home = [40, 48];
    /* Warm-up: first sprint and first turn compile dust / wind / smear shaders. */
    await page.evaluate(trial, { from: "s", to: "w", gap: -1, home });
    await sleep(900);

    console.log("\npair  gap  180  delay  join  back  faceOff faceSnap  v.before v.after  peak  fwd   wall  turn   RF    LF  hipStep exit");
    const fails = [];
    for (const [from, to] of PAIRS) {
      for (const gap of GAPS) {
        const data = await page.evaluate(trial, { from, to, gap, home });
        await sleep(900);
        const r = analyse(data);
        const tag = `${from}>${to}`;
        if (!r.started) {
          console.log(tag.padEnd(5), pad(gap, 4, 0), "  no", " ".repeat(11), pad(r.back, 5, 2), pad(r.faceOff, 7));
        } else {
          console.log(
            tag.padEnd(5), pad(gap, 4, 0), " yes", pad(r.delay, 6, 0), pad(r.joinFrame, 5), pad(r.back, 5, 2), pad(r.faceOff, 7), pad(r.faceSnap, 8),
            pad(r.speedBefore, 9), pad(r.speedAfter, 7), pad(r.peak, 5), pad(r.forward, 5, 2), pad(r.wall, 6, 3), pad(r.turn, 6), pad(r.rf, 5, 2), pad(r.lf, 5, 2), pad(r.hipStep, 7), pad(r.exitSprint, 5, 2),
          );
          /* A turn must start on the key press, from the facing he had, without first running the new way. */
          if (r.back > 0.05) fails.push(`${tag} gap ${gap}: ran ${r.back.toFixed(2)} units the new way before the turn`);
          if (r.faceSnap > 3) fails.push(`${tag} gap ${gap}: facing snapped ${r.faceSnap.toFixed(1)}° at the start`);
          if (r.delay > 40) fails.push(`${tag} gap ${gap}: turn started ${r.delay.toFixed(0)} ms after the key`);
          /* Measured from the facing before the key, which trails the travel direction by up to ~0.5°. */
          if (Math.abs(Math.abs(r.turn) - 180) > 1) fails.push(`${tag} gap ${gap}: root turned ${r.turn.toFixed(1)}°`);
          if (r.exitSprint < 0.9) fails.push(`${tag} gap ${gap}: gait after the clip is not sprint (${r.exitSprint.toFixed(2)})`);
        }
        if (DUMP === `${tag}:${gap}` && r.dump) r.dump();
      }
    }
    console.log("\ndelay = ms from the opposite key to the turn; join = clip frame it starts on; back = units run the new way before the turn;");
    console.log("faceOff = facing change before the turn; faceSnap = facing step on the first turn frame; v = root speed along the old direction;");
    console.log("peak = fastest root speed before the first plant (frame 16; the clip plants at 5.5);");
    console.log("fwd = forward travel to the apex; RF/LF = planted foot drift (f16–38, f23–31); hipStep = biggest per-frame body heading step.");
    if (fails.length) throw new Error(`180 entry check failed:\n  ${fails.join("\n  ")}`);
    console.log("\nSUCCESS: every 180 started on the key press, from the current facing.");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error("FATAL ERROR:", err.message || err);
  process.exit(1);
});
