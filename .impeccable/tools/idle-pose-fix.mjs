import puppeteer from "puppeteer-core";
import fs from "node:fs";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const out = process.argv[3] || "../review";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  protocolTimeout: 90000,
  args: ["--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 2 });
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
for (let i = 0; i < 400 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i += 1) await wait(50);
await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
await wait(2500);
await page.addStyleTag({ content: ".hud, .world-help, .world-labels { display: none !important; }" });
await page.evaluate(() => {
  const d = window.PortfolioWorld.debug;
  d.zoom(2.2);
  d.holdYaw?.(0);
});
await wait(400);

const measure = () => page.evaluate(() => {
  const bot = window.PortfolioWorld.debug.bot();
  bot.model.updateWorldMatrix(true, true);
  const local = (bone) => {
    const me = bot.model.matrixWorld.elements;
    const be = bone.matrixWorld.elements;
    const rx = me[0], ry = me[1], rz = me[2];
    const ux = me[4], uy = me[5], uz = me[6];
    const fx = me[8], fy = me[9], fz = me[10];
    const s2 = rx * rx + ry * ry + rz * rz || 1;
    const wx = be[12] - me[12];
    const wy = be[13] - me[13];
    const wz = be[14] - me[14];
    return [
      +((rx * wx + ry * wy + rz * wz) / s2).toFixed(3),
      +((ux * wx + uy * wy + uz * wz) / s2).toFixed(3),
      +((fx * wx + fy * wy + fz * wz) / s2).toFixed(3),
    ];
  };
  const q = (name) => bot.bones[name].quaternion.toArray().map((n) => +n.toFixed(3));
  const nose = bot.bones.Head;
  const headFwd = (() => {
    const e = nose.matrixWorld.elements;
    /* model +X is nose after yaw; world forward of head ≈ bone local +X column after model */
    return [+e[0].toFixed(3), +e[1].toFixed(3), +e[2].toFixed(3)];
  })();
  return {
    faceUp: +window.PortfolioWorld.debug.bot && null,
    still: null,
    head: q("Head"),
    neck: q("Neck"),
    spine2: q("Spine2"),
    leftFoot: local(bot.bones.LeftFoot),
    rightFoot: local(bot.bones.RightFoot),
    leftUpLeg: q("LeftUpLeg"),
    rightUpLeg: q("RightUpLeg"),
    hips: local(bot.bones.Hips),
    headWorldY: +nose.matrixWorld.elements[13].toFixed(3),
    footGap: +(local(bot.bones.LeftFoot)[2] - local(bot.bones.RightFoot)[2]).toFixed(3),
  };
});

const a = await measure();
console.log("idle", JSON.stringify(a));
await page.screenshot({ path: `${out}/idle-new-front.png`, clip: { x: 350, y: 80, width: 300, height: 520 } });

await page.evaluate(() => {
  const bot = window.PortfolioWorld.debug.bot();
  /* Force no face-up overlay by keeping him "busy" */
  window.PortfolioWorld.debug.bot().mixer._actions.find((x) => /idle/i.test(x.getClip().name));
});
/* Disable faceCam by giving a tiny path or lock — use hold still override via walking briefly then stop with path */
await page.evaluate(() => {
  /* zero faceUp by forcing still timer reset via a fake key bump handled next */
});
await page.keyboard.down("KeyW");
await wait(200);
await page.keyboard.up("KeyW");
await wait(100);
const midWalk = await measure();
console.log("after step", JSON.stringify({ ...midWalk, footGap: midWalk.footGap }));
await page.screenshot({ path: `${out}/idle-new-walk.png`, clip: { x: 350, y: 80, width: 300, height: 520 } });
await wait(2000);
const settled = await measure();
console.log("settled again", JSON.stringify(settled));
await page.screenshot({ path: `${out}/idle-new-settled.png`, clip: { x: 350, y: 80, width: 300, height: 520 } });
await browser.close();
