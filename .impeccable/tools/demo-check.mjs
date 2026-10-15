import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const outDir = process.argv[3] || "../review";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});

const sheetState = (page) =>
  page.evaluate(() => ({
    open: !document.querySelector("#demo-player").hidden,
    playing: document.querySelector("#demo-player").classList.contains("is-playing"),
    title: document.querySelector("#demo-title").textContent,
    mode: document.querySelector("#demo-mode").textContent,
    story: document.querySelector("#demo-story").textContent.slice(0, 50),
    features: document.querySelectorAll("#demo-features li").length,
    shots: document.querySelectorAll("#demo-shots img").length,
    src: document.querySelector("#demo-frame").src,
    focus: document.activeElement?.id || document.activeElement?.className,
  }));

for (const shot of [
  { name: "desktop", width: 1440, height: 900, mobile: false, demo: 3 },
  { name: "mobile", width: 390, height: 844, mobile: true, demo: 6 },
]) {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.log(shot.name, "pageerror", error.message));
  page.on("requestfailed", (req) => !req.url().includes("about:blank") && console.log(shot.name, "requestfailed", req.url()));
  await page.setViewport({ width: shot.width, height: shot.height, isMobile: shot.mobile, hasTouch: shot.mobile });
  await page.goto(`${base}?view=classic&t=${Date.now()}`, { waitUntil: "networkidle2" });
  await page.click(".tile[data-index='0']");
  await wait(1400);
  await page.evaluate(() => document.querySelector("#project-modal-demos-wrap")?.scrollIntoView({ block: "center" }));
  await wait(600);
  await page.screenshot({ path: `${outDir}/${shot.name}-demo-list.png` });

  const buttons = await page.$$(".demo-play");
  console.log(shot.name, "game buttons:", buttons.length);
  await buttons[shot.demo].click();
  await wait(900);
  console.log(shot.name, "details", JSON.stringify(await sheetState(page)));
  await page.screenshot({ path: `${outDir}/${shot.name}-game-details.png` });

  if (shot.mobile) {
    await page.evaluate(() => document.querySelector(".demo-body").scrollTo(0, 9999));
    await wait(300);
    await page.screenshot({ path: `${outDir}/${shot.name}-game-details-end.png` });
  }

  await page.click("#demo-start");
  await wait(8000);
  console.log(shot.name, "playing", JSON.stringify(await sheetState(page)));
  await page.screenshot({ path: `${outDir}/${shot.name}-demo-player.png` });

  await page.click("#demo-back");
  await wait(300);
  console.log(shot.name, "back", JSON.stringify(await sheetState(page)));

  await page.keyboard.press("Escape");
  await wait(300);
  const after = await page.evaluate(() => ({
    sheetHidden: document.querySelector("#demo-player").hidden,
    frameSrc: document.querySelector("#demo-frame").src,
    dossierOpen: !document.querySelector("#project-modal").hidden,
    focus: document.activeElement?.textContent?.trim(),
  }));
  console.log(shot.name, "after escape", JSON.stringify(after));
  await page.close();
}

await browser.close();
