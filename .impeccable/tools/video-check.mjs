import fs from "node:fs";
import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const edge = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(fs.existsSync);
const browser = await puppeteer.launch({ executablePath: edge, headless: "new", args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.goto(base + "?view=classic", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.PROJECT_ALBUMS);

const results = await page.evaluate(async () => {
  const data = window.PROJECT_ALBUMS;
  const urls = [];
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (o.type === "video" && /^https:/.test(o.src)) urls.push(o.src);
    Object.values(o).forEach(walk);
  };
  walk(data);
  const one = (url) => new Promise((done) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "metadata";
    const t = setTimeout(() => done({ url, ok: false, why: "timeout" }), 20000);
    v.onloadedmetadata = () => { clearTimeout(t); done({ url, ok: true, w: v.videoWidth, h: v.videoHeight, d: Math.round(v.duration) }); };
    v.onerror = () => { clearTimeout(t); done({ url, ok: false, why: v.error && v.error.code }); };
    v.src = url;
  });
  return { found: urls.length, list: await Promise.all(urls.map(one)) };
});
console.log("videos found", results.found);
for (const r of results.list) console.log(r.ok ? "OK " : "BAD", r.url.slice(48, 81), r.ok ? `${r.w}x${r.h} ${r.d}s` : r.why);
await browser.close();
