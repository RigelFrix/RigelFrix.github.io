import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const outDir = process.argv[3] || "../review";
const only = process.argv[4];
const slow = 0.2;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  protocolTimeout: 60000,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

const until = async (page, fn, timeout = 30000, step = 25) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await page.evaluate(fn)) return true;
    await wait(step);
  }
  return false;
};

const frames = [
  ["crouch", 1.85],
  ["launch", 2.62],
  ["night", 3.15],
  ["dusk", 4.05],
  ["fall", 5.2],
  ["fall2", 5.5],
  ["impact", 5.72],
  ["jump", 6.25],
  ["land", 6.85],
  ["pose", 7.4],
  ["end", 8.9],
];

const shots = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
  { name: "closeup", width: 800, height: 500, mobile: false, scale: 3, zoom: true, frames: ["jump", "land", "pose", "end"] },
  { name: "niko", width: 800, height: 500, mobile: false, scale: 6, zoom: true, clip: { x: 345, y: 180, width: 110, height: 120 }, frames: ["jump", "land", "pose", "end"] },
].filter((shot) => !only || shot.name === only);

for (const shot of shots) {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.log(shot.name, "pageerror", error.message));
  page.on("console", (msg) => ["error", "warn"].includes(msg.type()) && console.log(shot.name, "console", msg.text()));
  await page.setViewport({ width: shot.width, height: shot.height, isMobile: shot.mobile, hasTouch: shot.mobile, deviceScaleFactor: shot.scale || 1 });

  await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await wait(250);
  await until(page, () => Boolean(window.gsap), 10000, 10);
  await page.evaluate((s) => void window.gsap.globalTimeline.timeScale(s), slow);

  if (!shot.frames) {
    await wait(400);
    await page.screenshot({ path: `${outDir}/${shot.name}-intro-boot.png` });
  }

  await until(page, () => document.documentElement.classList.contains("world-ready"), 30000, 10);
  await page.evaluate(() => {
    window.__intro = window.gsap.globalTimeline.getChildren(false, false, true).find((t) => t.duration() > 6);
    window.__intro?.pause();
  });

  if (shot.zoom) {
    await page.evaluate(() => void window.__intro?.seek(4.6, false));
    await wait(4000);
    await page.mouse.move(shot.width / 2, shot.height / 2);
    for (let i = 0; i < 8; i += 1) await page.mouse.wheel({ deltaY: -120 });
    await page.addStyleTag({ content: ".hud, .world-help, .world-labels { display: none !important; }" });
  }

  for (const [label, at] of frames.filter(([label]) => !shot.frames || shot.frames.includes(label))) {
    await page.evaluate((t) => void window.__intro?.seek(t, false), at);
    await wait(label === "impact" ? 150 : 500);
    await page.screenshot({ path: `${outDir}/${shot.name}-intro-${label}.png`, clip: shot.clip });
    const hud = await page.evaluate(() => getComputedStyle(document.querySelector(".hud")).opacity);
    console.log(shot.name, label, "hud", hud);
  }

  if (shot.frames) {
    await page.close();
    continue;
  }

  await page.evaluate(() => {
    window.__intro?.play();
    window.gsap.globalTimeline.timeScale(1);
  });
  await until(page, () => !document.documentElement.classList.contains("world-intro"));
  await wait(2500);
  const after = await page.evaluate(() => ({
    intro: sessionStorage.getItem("fy-intro"),
    timeline: window.__intro && `${window.__intro.progress().toFixed(3)} paused:${window.__intro.paused()} ts:${window.gsap.globalTimeline.timeScale()}`,
    boot: getComputedStyle(document.querySelector(".world-boot")).visibility,
    plates: [...document.querySelectorAll(".world-plate")].map((p) => getComputedStyle(p).visibility[0] + getComputedStyle(p).opacity).join(" "),
    help: getComputedStyle(document.querySelector(".world-help")).opacity,
    hud: getComputedStyle(document.querySelector(".hud")).opacity,
  }));
  console.log(shot.name, after);
  await page.screenshot({ path: `${outDir}/${shot.name}-intro-settled.png` });

  /* Second visit in the same session plays faster; a key press skips ahead */
  await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await wait(250);
  await until(page, () => document.documentElement.classList.contains("world-ready"), 30000, 10);
  const t = Date.now();
  await page.keyboard.press("w");
  await until(page, () => !document.documentElement.classList.contains("world-intro"));
  console.log(shot.name, "repeat+skip intro done in", Date.now() - t, "ms");
  await page.close();
}

await browser.close();
