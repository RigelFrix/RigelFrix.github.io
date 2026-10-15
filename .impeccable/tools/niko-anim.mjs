/* Dumps every clip listed in ../anim/clips.json to ../anim/<name>.json through anim-dump.html (needs the local
   server on :8765). Add a Mixamo FBX (any character, "In Place", T-pose rig) by adding a line:
     "jump": { "file": "/path/from/repo/root/Jump.fbx" }
   then run this and niko-rig.mjs. Usage: node niko-anim.mjs [name ...] */
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("../anim/clips.json", "utf8"));
const only = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  protocolTimeout: 120000,
});
for (const [name, src] of Object.entries(manifest)) {
  if (only.length && !only.includes(name)) continue;
  const page = await browser.newPage();
  let failed = null;
  page.on("pageerror", (e) => (failed = e.message));
  const query = `file=${encodeURIComponent(src.file)}${src.clip ? `&clip=${encodeURIComponent(src.clip)}` : ""}`;
  await page.goto(`http://127.0.0.1:8765/.impeccable/tools/anim-dump.html?${query}`);
  for (let i = 0; i < 600 && !failed && !(await page.evaluate(() => !!window.result)); i += 1) await wait(100);
  if (failed) throw new Error(`${name}: ${failed}`);
  const result = await page.evaluate(() => JSON.stringify(window.result));
  await page.close();
  fs.writeFileSync(`../anim/${name}.json`, result);
  const r = JSON.parse(result);
  const fingers = Object.keys(r.bones).filter((b) => /Hand(Index|Thumb|Middle|Ring|Pinky)/.test(b)).length;
  console.log(name.padEnd(8), r.duration.toFixed(2), "s", String(r.frames).padStart(3), "frames", "armDir", r.armDir.map((v) => v.toFixed(2)).join(","), "finger bones", fingers);
}
await browser.close();
