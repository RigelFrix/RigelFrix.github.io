import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const outDir = process.argv[3] || "../review";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});

for (const shot of [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
]) {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.log(shot.name, "PAGEERROR", error.message));
  page.on("console", (msg) => msg.type() === "error" && console.log(shot.name, "console", msg.text()));
  page.on("requestfailed", (req) => console.log(shot.name, "requestfailed", req.url()));
  await page.setViewport({ width: shot.width, height: shot.height, isMobile: shot.mobile, hasTouch: shot.mobile });
  await page.goto(`${base}?view=classic&t=${Date.now()}`, { waitUntil: "networkidle2" });

  await wait(250);
  await page.screenshot({ path: `${outDir}/${shot.name}-boot-mid.png` });
  await wait(1500);

  const state = await page.evaluate(() => ({
    motion: document.documentElement.classList.contains("motion"),
    lenis: document.documentElement.classList.contains("lenis"),
    boot: document.documentElement.classList.contains("boot"),
    name: document.querySelector("#stage-name").textContent,
    nameLabel: document.querySelector("#stage-name").getAttribute("aria-label"),
    cursor: getComputedStyle(document.querySelector(".p1-cursor")).transform,
  }));
  console.log(shot.name, "after boot", JSON.stringify(state));
  await page.screenshot({ path: `${outDir}/${shot.name}-fold.png` });

  if (!shot.mobile) {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("ArrowRight");
    await wait(900);
    const swapped = await page.evaluate(() => ({
      name: document.querySelector("#stage-name").textContent,
      label: document.querySelector("#stage-name").getAttribute("aria-label"),
      current: document.querySelector(".tile.is-current")?.dataset.index,
      cursor: getComputedStyle(document.querySelector(".p1-cursor")).transform,
    }));
    console.log(shot.name, "after ArrowRight", JSON.stringify(swapped));
    await page.screenshot({ path: `${outDir}/${shot.name}-swap.png` });
    await page.keyboard.press("KeyA");
    await wait(600);
    console.log(shot.name, "after A", await page.$eval("#stage-name", (n) => n.textContent));
  }

  await page.click(".tile[data-index='2']");
  await wait(330);
  await page.screenshot({ path: `${outDir}/${shot.name}-wipe.png` });
  await wait(1100);
  const opened = await page.evaluate(() => ({
    dossier: !document.querySelector("#project-modal").hidden,
    title: document.querySelector("#project-modal-title").textContent,
    focus: document.activeElement?.id,
    lenisStopped: document.documentElement.classList.contains("lenis-stopped"),
  }));
  console.log(shot.name, "dossier", JSON.stringify(opened));
  await page.keyboard.press("Escape");
  await wait(300);
  console.log(shot.name, "lenis stopped after close:", await page.evaluate(() => document.documentElement.classList.contains("lenis-stopped")));

  for (const id of ["player", "moves", "career", "contact"]) {
    await page.evaluate((target) => document.getElementById(target).scrollIntoView(), id);
    await wait(1300);
    await page.screenshot({ path: `${outDir}/${shot.name}-play-${id}.png` });
    console.log(
      shot.name,
      id,
      "nav active:",
      await page.evaluate(() => [...document.querySelectorAll(".hud-nav a.is-active")].map((a) => a.getAttribute("href")).join(","))
    );
  }

  const tail = await page.evaluate(() => ({
    active: [...document.querySelectorAll(".hud-nav a.is-active")].map((a) => a.textContent),
    count: document.querySelector("#continue-count").textContent,
    countHidden: document.querySelector("#continue-count").hidden,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  console.log(shot.name, "tail", JSON.stringify(tail));
  await page.close();
}

const reduced = await browser.newPage();
await reduced.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
await reduced.setViewport({ width: 1440, height: 900 });
reduced.on("pageerror", (error) => console.log("reduced PAGEERROR", error.message));
await reduced.goto(`${base}?view=classic&t=${Date.now()}`, { waitUntil: "networkidle2" });
await wait(400);
console.log(
  "reduced",
  JSON.stringify(
    await reduced.evaluate(() => ({
      motion: document.documentElement.classList.contains("motion"),
      boot: document.documentElement.classList.contains("boot"),
      hudVisible: getComputedStyle(document.querySelector(".hud")).visibility,
    }))
  )
);
await reduced.click(".tile[data-index='1']");
await wait(200);
console.log("reduced dossier open:", await reduced.evaluate(() => !document.querySelector("#project-modal").hidden));

await browser.close();
