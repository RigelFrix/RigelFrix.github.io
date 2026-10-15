import puppeteer from "puppeteer-core";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  protocolTimeout: 60000,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`http://127.0.0.1:8765/?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
await wait(300);
while (!(await page.evaluate(() => document.documentElement.classList.contains("world-ready")))) await wait(20);
await page.evaluate(() => {
  window.__intro = window.gsap.globalTimeline.getChildren(false, false, true).find((t) => t.duration() > 6);
  window.__intro.pause();
});
for (const t of [3.2, 3.5, 3.7]) {
  const info = await page.evaluate((t) => {
    window.__intro.seek(t, false);
    const { star, fall, bloom, camera } = window.__dbg;
    const p = star.position.clone().project(camera);
    return { t, p: fall.p.toFixed(2), opacity: star.material.opacity, pos: star.position.toArray().map((v) => v.toFixed(1)).join(","), ndc: [p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2)].join(","), visible: star.visible, bloom: bloom.material.opacity };
  }, t);
  console.log(info);
  await wait(500);
  await page.screenshot({ path: `../review/debug-star-${t}.png` });
}
await browser.close();
