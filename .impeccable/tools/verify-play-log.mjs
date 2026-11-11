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
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${base}/?view=world&dev=1&skip=1&log=1`, { waitUntil: "domcontentloaded" });

    for (let i = 0; i < 100; i++) {
      const ready = await page.evaluate(() => Boolean(window.PortfolioWorld?.log && window.PortfolioWorld?.debug?.bot?.()?.actions?.sprint));
      if (ready) break;
      await wait(100);
    }

    await page.evaluate(() => {
      window.PortfolioWorld.debug.finishIntro();
      document.getElementById("world-canvas")?.focus();
    });
    await wait(200);

    const enabled = await page.evaluate(() => window.PortfolioWorld.log.enabled);
    if (!enabled) throw new Error("play-log did not auto-enable with ?log=1");

    await page.evaluate(() => {
      const s = window.PortfolioWorld.debug.state();
      s.keys.clear();
      s.keys.add("w");
      s.keys.add("shift");
    });
    await wait(700);
    await page.evaluate(() => {
      const s = window.PortfolioWorld.debug.state();
      s.keys.delete("w");
      s.keys.add("s");
    });
    await wait(600);
    await page.evaluate(() => window.PortfolioWorld.log.mark("verify-play-log"));

    const text = await page.evaluate(() => window.PortfolioWorld.log.dump());
    const out = path.join(outDir, "play-log-verify.txt");
    fs.writeFileSync(out, text);
    console.log(text.split("\n").slice(0, 40).join("\n"));
    console.log(`\n... wrote ${out}`);

    if (!text.includes("[SESSION]")) throw new Error("missing SESSION");
    if (!text.includes("[SAMPLE]") && !text.includes("[LOCO]")) throw new Error("missing SAMPLE/LOCO");
    if (!text.includes("[MARK]")) throw new Error("missing MARK");
    if (!text.includes("## Timeline")) throw new Error("missing Timeline section");
    console.log("SUCCESS: play-log dump is agent-readable");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
