/* node cpu-profile.mjs [base] [width] [height] [dpr]: samples the main thread for 4 s with the DevTools profiler while
   the world runs (headful Edge, real GPU, vsync off) and prints the functions with the most self time, plus totals
   per script. env Q=<query> adds URL params. */
import puppeteer from "puppeteer-core";

const [base = "http://127.0.0.1:8765/", w = "1600", h = "900", dpr = "1"] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: false,
  protocolTimeout: 300000,
  args: ["--ignore-gpu-blocklist", `--window-size=${+w + 20},${+h + 140}`, "--disable-frame-rate-limit", "--disable-gpu-vsync"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: +dpr });
await page.goto(`${base}?view=world&t=${Date.now()}${process.env.Q ? `&${process.env.Q}` : ""}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 180000 });
await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
await wait(1500);
await page.evaluate((dpr) => window.PortfolioWorld.debug.pixelRatio(+dpr), dpr);
await wait(1500);

const cdp = await page.createCDPSession();
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
await cdp.send("Profiler.start");
await wait(4000);
const { profile } = await cdp.send("Profiler.stop");

const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (dt[i] || 0)));
const total = [...self.values()].reduce((a, b) => a + b, 0);
const fn = new Map();
const script = new Map();
for (const [id, us] of self) {
  const { callFrame: c } = byId.get(id);
  const file = (c.url || "(native)").split("/").pop().split("?")[0] || "(native)";
  const key = `${c.functionName || "(anonymous)"}  ${file}:${c.lineNumber + 1}:${c.columnNumber + 1}`;
  fn.set(key, (fn.get(key) || 0) + us);
  script.set(file, (script.get(file) || 0) + us);
}
const pct = (us) => `${((us / total) * 100).toFixed(1).padStart(5)}%`;
console.log(`sampled ${(total / 1000).toFixed(0)} ms`);
console.log("by script:");
[...script].sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, v]) => console.log(`  ${pct(v)}  ${k}`));
console.log("top self time:");
[...fn].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log(`  ${pct(v)}  ${k}`));

/* Who calls the expensive native GL entry points: self time of each native node, charged to its caller chain */
const parent = new Map();
profile.nodes.forEach((n) => (n.children || []).forEach((c) => parent.set(c, n.id)));
const label = (id) => {
  const c = byId.get(id).callFrame;
  return `${c.functionName || "(anon)"}:${c.lineNumber + 1}:${c.columnNumber + 1}`;
};
for (const name of ["uniform4fv", "uniformMatrix4fv", "uniform1f", "drawElements"]) {
  const callers = new Map();
  for (const [id, us] of self) {
    if (byId.get(id).callFrame.functionName !== name) continue;
    const chain = [];
    let p = parent.get(id);
    for (let k = 0; k < 6 && p; k += 1, p = parent.get(p)) chain.push(label(p));
    const key = chain.join(" < ");
    callers.set(key, (callers.get(key) || 0) + us);
  }
  console.log(`\n${name} callers:`);
  [...callers].sort((a, b) => b[1] - a[1]).slice(0, 4).forEach(([k, v]) => console.log(`  ${pct(v)}  ${k}`));
}
await browser.close();
