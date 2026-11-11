import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(root, ".impeccable/review");
const base = process.argv[2] || "http://127.0.0.1:8765";
fs.mkdirSync(outDir, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
    args: ["--ignore-gpu-blocklist", "--use-gl=angle"],
  });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${base}/?view=world&dev=1&skip=1`, { waitUntil: "domcontentloaded" });

    for (let i = 0; i < 120; i++) {
      const ready = await page.evaluate(() => {
        const bot = window.PortfolioWorld?.debug?.bot?.();
        return Boolean(bot?.actions?.sprint && bot?.actions?.turn180);
      });
      if (ready) break;
      await wait(100);
    }

    await page.evaluate(() => {
      window.PortfolioWorld.debug.finishIntro();
      window.PortfolioWorld.debug.zoom?.(1.6);
      document.getElementById("world-canvas")?.focus();
    });
    await wait(300);

    const clearKeys = () =>
      page.evaluate(() => {
        window.PortfolioWorld.debug.state().keys.clear();
      });

    /* Atomically replace held keys so we never get a blank-input frame (that was triggering STOP). */
    const hold = (keys) =>
      page.evaluate((list) => {
        const s = window.PortfolioWorld.debug.state();
        s.keys.clear();
        for (const k of list) {
          if (k === "shift") s.keys.add("shift");
          else window.PortfolioWorld.debug.pressMove(k);
        }
      }, keys);

    const snap = () =>
      page.evaluate(() => {
        const s = window.PortfolioWorld.debug.state();
        const faceRad = window.PortfolioWorld.debug.bot()?.robot?.rotation?.y ?? s.yaw;
        let plantLag = s.yaw - faceRad;
        plantLag = Math.atan2(Math.sin(plantLag), Math.cos(plantLag));
        return {
          speed: +s.speedMeter.toFixed(2),
          sprint: +s.sprint.toFixed(3),
          bank: +s.bank.toFixed(3),
          turnLead: +(s.turnLead || 0).toFixed(3),
          chestTwist: +(s.chestTwist || 0).toFixed(3),
          pathOmega: +(s.pathOmega || 0).toFixed(3),
          plantLag: +plantLag.toFixed(3),
          turning180: s.turning180,
          stopping: s.stopping,
          yawDeg: +((s.yaw * 180) / Math.PI).toFixed(1),
          faceDeg: +((faceRad * 180) / Math.PI).toFixed(1),
          move: [+s.moveDir.x.toFixed(3), +s.moveDir.z.toFixed(3)],
          keys: [...s.keys].sort().join("+") || "-",
        };
      });

    const turn180Min = await page.evaluate(() => window.PortfolioWorld.sprint().turn180Speed ?? 7);
    await hold(["w", "shift"]);
    let sprintReady = false;
    for (let i = 0; i < 50; i++) {
      await wait(50);
      const s = await snap();
      if (s.speed >= Math.max(8, turn180Min + 0.5)) {
        sprintReady = true;
        console.log("Sprint ready:", s, "turn180SpeedMin=", turn180Min);
        break;
      }
    }
    if (!sprintReady) throw new Error(`Sprint never reached turn180 threshold: ${JSON.stringify(await snap())}`);

    /* Mild left arc: plant face lags travel yaw; chestTwist snaps toward stick. */
    await hold(["w", "a", "shift"]);
    let maxAbsBank = 0;
    let maxAbsOmega = 0;
    let maxAbsTwist = 0;
    let maxPlantLag = 0;
    let false180 = false;
    for (let i = 0; i < 24; i++) {
      await wait(40);
      const s = await snap();
      maxAbsBank = Math.max(maxAbsBank, Math.abs(s.bank));
      maxAbsOmega = Math.max(maxAbsOmega, Math.abs(s.pathOmega));
      maxAbsTwist = Math.max(maxAbsTwist, Math.abs(s.chestTwist || 0));
      maxPlantLag = Math.max(maxPlantLag, Math.abs(s.plantLag || 0));
      if (s.turning180) false180 = true;
    }
    console.log("Arc sample:", {
      maxAbsBank,
      maxAbsOmega,
      maxAbsTwist,
      maxPlantLagDeg: +((maxPlantLag * 180) / Math.PI).toFixed(1),
      false180,
      arcState: await snap(),
    });
    await page.screenshot({ path: path.join(outDir, "sprint-arc.png") });
    if (false180) throw new Error("180 fired during mild W+A arc");
    if (maxAbsOmega < 0.4) throw new Error(`pathOmega too low during arc (${maxAbsOmega})`);
    if (maxAbsBank < 0.04) throw new Error(`bank too low during arc (${maxAbsBank})`);
    if (maxAbsTwist < 0.05) throw new Error(`chestTwist too low during arc (${maxAbsTwist})`);
    if (maxPlantLag < 0.04) throw new Error(`plant lag too small (${maxPlantLag})`);
    if (maxPlantLag > 0.7) throw new Error(`plant lag too large (${maxPlantLag}) — body would skate`);
    if (maxAbsBank > 0.4) throw new Error(`bank too aggressive for soft hip lean (${maxAbsBank})`);
    if (maxAbsTwist > 0.85) throw new Error(`chestTwist too extreme (${maxAbsTwist}) — spine would pretzel`);

    /* Hard reverse W→S */
    await hold(["w", "shift"]);
    await wait(250);
    await hold(["s", "shift"]);
    let turned = false;
    let peakWeight = 0;
    const timeline = [];
    for (let i = 0; i < 28; i++) {
      await wait(40);
      const s = await snap();
      const weight = await page.evaluate(() => {
        const b = window.PortfolioWorld.debug.bot();
        return +(b?.actions?.turn180?.getEffectiveWeight() || 0).toFixed(3);
      });
      timeline.push({ ...s, weight });
      if (s.turning180) turned = true;
      peakWeight = Math.max(peakWeight, weight);
    }
    console.log("180 W→S timeline:");
    timeline.filter((_, i) => i % 3 === 0).forEach((t) => console.log(JSON.stringify(t)));
    await page.screenshot({ path: path.join(outDir, "sprint-180-exit.png") });
    if (!turned) throw new Error("180 never triggered on W→S reverse sprint");
    if (peakWeight < 0.5) throw new Error(`turn180 weight too low (${peakWeight})`);

    /* Real player pattern: sprint on A, press D while A still held. */
    await clearKeys();
    await wait(450);
    await hold(["a", "shift"]);
    let lateralReady = false;
    for (let i = 0; i < 40; i++) {
      await wait(50);
      if ((await snap()).speed >= 8) {
        lateralReady = true;
        break;
      }
    }
    if (!lateralReady) throw new Error("Lateral sprint never reached 8 m/s");

    await page.evaluate(() => window.PortfolioWorld.debug.pressMove("d"));
    let overlapTurn = false;
    let overlapStop = false;
    for (let i = 0; i < 20; i++) {
      await wait(40);
      const s = await snap();
      if (s.turning180) overlapTurn = true;
      if (s.stopping) overlapStop = true;
    }
    console.log("Overlap A hold + D press:", { overlapTurn, overlapStop, snap: await snap() });
    if (!overlapTurn) throw new Error("180 never triggered when pressing D while still holding A");
    if (overlapStop) throw new Error("A+D overlap incorrectly entered STOP instead of 180");

    for (let i = 0; i < 30; i++) {
      await wait(40);
      if (!(await snap()).turning180) break;
    }

    await hold(["a", "shift"]);
    let rapidFlip = false;
    for (let i = 0; i < 16; i++) {
      await wait(30);
      if ((await snap()).turning180) {
        rapidFlip = true;
        break;
      }
    }
    console.log("Rapid reverse after overlap 180:", rapidFlip);
    if (!rapidFlip) throw new Error("immediate reverse failed to re-arm 180");

    /* Mild reverse at jog should NOT 180. */
    await clearKeys();
    await wait(500);
    await hold(["w"]);
    await wait(400);
    await hold(["s"]);
    let jog180 = false;
    for (let i = 0; i < 12; i++) {
      await wait(40);
      if ((await snap()).turning180) jog180 = true;
    }
    if (jog180) throw new Error("180 fired at jog without Shift");

    /* Log mark-1/2 pattern: release S, brief Shift-only gap, then W (no overlap). */
    await clearKeys();
    await wait(500);
    await hold(["s", "shift"]);
    let gapReady = false;
    for (let i = 0; i < 40; i++) {
      await wait(50);
      if ((await snap()).speed >= 9) {
        gapReady = true;
        break;
      }
    }
    if (!gapReady) throw new Error("Gap-reverse sprint never reached 9 m/s");
    await hold(["shift"]);
    await wait(50);
    await hold(["w", "shift"]);
    let gapTurn = false;
    let gapStopStuck = false;
    for (let i = 0; i < 20; i++) {
      await wait(40);
      const s = await snap();
      if (s.turning180) gapTurn = true;
      if (s.stopping && !s.turning180 && i > 2) gapStopStuck = true;
    }
    console.log("Release-gap S→W 180:", { gapTurn, gapStopStuck, snap: await snap() });
    if (!gapTurn) throw new Error("180 never triggered on release-gap S↑ then W (no overlap)");

    if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(" | ")}`);
    console.log("SUCCESS: sprint arc + overlap + release-gap 180 gates verified");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
