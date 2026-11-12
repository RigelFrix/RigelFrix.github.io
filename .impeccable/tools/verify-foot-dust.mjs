/* Sprint foot-leave dust: idle must not spawn; sprint must fire L then R leave bursts. */
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
        return Boolean(bot?.actions?.sprint && bot?.bones?.LeftFoot && bot?.bones?.RightFoot);
      });
      if (ready) break;
      await wait(100);
    }

    await page.evaluate(() => {
      window.PortfolioWorld.debug.finishIntro();
      window.PortfolioWorld.debug.zoom?.(1.6);
      document.getElementById("world-canvas")?.focus();
    });
    await wait(400);

    const clearKeys = () =>
      page.evaluate(() => {
        window.PortfolioWorld.debug.state().keys.clear();
      });

    const hold = (keys) =>
      page.evaluate((list) => {
        const s = window.PortfolioWorld.debug.state();
        s.keys.clear();
        for (const k of list) s.keys.add(k);
      }, keys);

    /* Idle: no dust. */
    await clearKeys();
    await page.evaluate(() => window.PortfolioWorld.debug.footDust("reset"));
    await wait(900);
    const idle = await page.evaluate(() => window.PortfolioWorld.debug.footDust());
    if (idle.spawnCount !== 0) {
      throw new Error(`idle spawned dust (count=${idle.spawnCount})`);
    }

    /* Sprint straight: expect ≥2 leave bursts and both feet over enough time. */
    await page.evaluate(() => window.PortfolioWorld.debug.footDust("reset"));
    await hold(["shift", "w"]);

    let sawL = false;
    let sawR = false;
    let lastCount = 0;
    let peakAlive = 0;
    for (let i = 0; i < 90; i++) {
      await wait(50);
      const snap = await page.evaluate(() => {
        const s = window.PortfolioWorld.debug.state();
        const dust = window.PortfolioWorld.debug.footDust();
        return {
          speed: +s.speedMeter.toFixed(2),
          sprint: +s.sprint.toFixed(2),
          spawnCount: dust.spawnCount,
          lastSide: dust.lastSide,
          alive: dust.alive,
        };
      });
      peakAlive = Math.max(peakAlive, snap.alive);
      if (snap.spawnCount > lastCount) {
        if (snap.lastSide === "L") sawL = true;
        if (snap.lastSide === "R") sawR = true;
        lastCount = snap.spawnCount;
      }
      if (sawL && sawR && snap.spawnCount >= 2) break;
    }

    await clearKeys();
    const final = await page.evaluate(() => window.PortfolioWorld.debug.footDust());

    /* Force-spawn path for debug API. */
    await page.evaluate(() => {
      window.PortfolioWorld.debug.footDust("reset");
      window.PortfolioWorld.debug.footDust("L");
      window.PortfolioWorld.debug.footDust("R");
    });
    const forced = await page.evaluate(() => window.PortfolioWorld.debug.footDust());

    const ok =
      final.spawnCount >= 2 &&
      sawL &&
      sawR &&
      peakAlive >= 1 &&
      forced.spawnCount === 2 &&
      pageErrors.length === 0;

    const report = {
      ok,
      idleSpawn: idle.spawnCount,
      sprintSpawn: final.spawnCount,
      sawL,
      sawR,
      peakAlive,
      forcedSpawn: forced.spawnCount,
      pageErrors,
      hash: await page.evaluate(() => {
        const src = document.querySelector('script[src*="world.bundle"]')?.src || "";
        const m = src.match(/[?&]v=([^&]+)/);
        return m?.[1] || null;
      }),
    };
    console.log(JSON.stringify(report, null, 2));
    if (!ok) {
      console.error("FAIL verify-foot-dust");
      process.exitCode = 1;
    } else {
      console.log("SUCCESS verify-foot-dust");
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
