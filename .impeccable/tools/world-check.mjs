import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const outDir = process.argv[3] || "../review";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

const waitFor = async (page, fn, timeout = 10000, arg) => {
  try {
    await page.waitForFunction(fn, { timeout, polling: 100 }, arg);
    return true;
  } catch {
    return false;
  }
};

const plateByLabel = (page, label) =>
  page.evaluateHandle((text) => [...document.querySelectorAll(".world-plate")].find((p) => p.textContent === text), label);

const state = (page) =>
  page.evaluate(() => ({
    world: document.documentElement.classList.contains("world"),
    ready: document.documentElement.classList.contains("world-ready"),
    open: document.querySelector("main > section.is-open")?.id || null,
    dossier: !document.querySelector("#project-modal").hidden,
    prompt: document.querySelector("#world-prompt").hidden ? null : document.querySelector("#world-prompt").innerText.trim(),
    focus: document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName,
  }));

for (const shot of [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
]) {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.log(shot.name, "pageerror", error.message));
  page.on("console", (msg) => msg.type() === "error" && console.log(shot.name, "console", msg.text()));
  page.on("requestfailed", (req) => !/\.mp4|about:blank/.test(req.url()) && console.log(shot.name, "requestfailed", req.url()));
  await page.setViewport({ width: shot.width, height: shot.height, isMobile: shot.mobile, hasTouch: shot.mobile });

  const t0 = Date.now();
  await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
  const ready = await waitFor(page, () => document.documentElement.classList.contains("world-ready"), 20000);
  console.log(shot.name, "ready", ready, `${Date.now() - t0}ms`, await state(page));
  const landed = await waitFor(page, () => !document.documentElement.classList.contains("world-intro"), 40000);
  console.log(shot.name, "intro done", landed, `${Date.now() - t0}ms`);
  await wait(1800);
  await page.screenshot({ path: `${outDir}/${shot.name}-world.png` });

  const plates = await page.evaluate(() =>
    [...document.querySelectorAll(".world-plate")].map((p) => {
      const r = p.getBoundingClientRect();
      return `${p.textContent}${p.classList.contains("is-off") ? "(off)" : ""}@${Math.round(r.x)},${Math.round(r.y)}`;
    })
  );
  console.log(shot.name, "plates", plates.join(" | "));

  /* About desk opens the About section */
  await page.evaluate(() => window.PortfolioWorld.walkTo("about"));
  const aboutOpen = await waitFor(page, () => document.querySelector("#player.is-open"), 120000);
  await wait(700);
  console.log(shot.name, "about", aboutOpen, await state(page));
  await page.screenshot({ path: `${outDir}/${shot.name}-world-about.png` });
  await page.keyboard.press("Escape");
  await wait(300);
  console.log(shot.name, "after escape", await state(page));

  /* A cabinet opens its dossier through the wipe */
  await page.evaluate(() => window.PortfolioWorld.walkTo("cab-dijoker"));
  const dossier = await waitFor(page, () => !document.querySelector("#project-modal").hidden, 120000);
  await wait(900);
  console.log(shot.name, "dossier", dossier, await state(page));
  await page.screenshot({ path: `${outDir}/${shot.name}-world-dossier.png` });
  await page.keyboard.press("Escape");
  await wait(400);

  /* Resume board shows a link prompt */
  await page.evaluate(() => window.PortfolioWorld.walkTo("resume"));
  const resume = await waitFor(page, () => !document.querySelector("#world-prompt").hidden && !document.querySelector("#world-prompt-link").hidden, 120000);
  await wait(500);
  console.log(shot.name, "resume prompt", resume, await state(page));
  await page.screenshot({ path: `${outDir}/${shot.name}-world-resume.png` });

  /* Contact opens with the countdown */
  await page.evaluate(() => window.PortfolioWorld.walkTo("contact"));
  const contact = await waitFor(page, () => document.querySelector("#contact.is-open"), 180000);
  await wait(1500);
  console.log(shot.name, "contact", contact, await page.evaluate(() => document.querySelector("#continue-count")?.textContent), await state(page));
  await page.screenshot({ path: `${outDir}/${shot.name}-world-contact.png` });
  await page.keyboard.press("Escape");
  await wait(300);

  if (!shot.mobile) {
    /* Keyboard: walk with D, then click empty floor */
    await page.keyboard.down("KeyD");
    await wait(700);
    await page.keyboard.up("KeyD");
    await page.mouse.click(720, 520);
    await wait(1500);
    await page.screenshot({ path: `${outDir}/${shot.name}-world-walk.png` });
    console.log(shot.name, "after walk", await state(page));

    /* Skills via HUD-less keyboard path: HUD link walks the robot */
    await page.click('.hud-nav a[href="#moves"]');
    const skills = await waitFor(page, () => document.querySelector("#moves.is-open"), 120000);
    await wait(700);
    console.log(shot.name, "skills via HUD", skills, await state(page));
    await page.screenshot({ path: `${outDir}/${shot.name}-world-skills.png` });
    await page.keyboard.press("Escape");
  } else {
    await page.touchscreen.tap(200, 420);
    await wait(1500);
    console.log(shot.name, "after tap walk", await state(page));
    await page.evaluate(() => window.PortfolioWorld.walkTo("career"));
    await wait(2500);
    await page.screenshot({ path: `${outDir}/${shot.name}-world-career-walk.png` });
    const career = await waitFor(page, () => document.querySelector("#career.is-open"), 120000);
    await wait(700);
    console.log(shot.name, "career tap", career, await state(page));
    await page.screenshot({ path: `${outDir}/${shot.name}-world-career.png` });
  }

  await page.close();
}

/* Classic fallback, and the choice sticks */
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("classic", "pageerror", error.message));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${base}?view=classic`, { waitUntil: "networkidle2" });
console.log("classic", await state(page), await page.evaluate(() => getComputedStyle(document.querySelector("#select")).display));
await page.goto(base, { waitUntil: "networkidle2" });
console.log("classic sticks", (await state(page)).world === false);
await page.goto(`${base}?view=world`, { waitUntil: "domcontentloaded" });
console.log("world again", await waitFor(page, () => document.documentElement.classList.contains("world-ready"), 20000));

await browser.close();
