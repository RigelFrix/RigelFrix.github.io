import puppeteer from "puppeteer-core";

const base = process.argv[2] || "http://127.0.0.1:8765/";
const outDir = process.argv[3] || "../review";
const mode = process.argv[4] || "all";

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});

const shots = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
];

for (const shot of shots) {
  const page = await browser.newPage();
  await page.setViewport({
    width: shot.width,
    height: shot.height,
    deviceScaleFactor: 1,
    isMobile: shot.mobile,
    hasTouch: shot.mobile,
  });
  await page.goto(`${base}?view=classic&t=${Date.now()}`, { waitUntil: "networkidle2" });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${outDir}/${shot.name}-fold.png` });

  if (mode === "all" || mode === "sections") {
    await page.evaluate(async () => {
      document.querySelectorAll("img[loading='lazy']").forEach((img) => (img.loading = "eager"));
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      await Promise.all(
        [...document.images].map((img) =>
          img.complete ? null : new Promise((r) => img.addEventListener("load", r, { once: true }))
        )
      );
      window.scrollTo(0, 0);
    });
    await page.addStyleTag({ content: ".hud{position:relative !important}" });
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: `${outDir}/${shot.name}.png`, fullPage: true });

    for (const selector of [".player", ".moves", ".career", ".continue"]) {
      const node = await page.$(selector);
      await node.screenshot({ path: `${outDir}/${shot.name}-${selector.slice(1)}.png` });
    }
  }

  if (mode === "all" || mode === "modal") {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click(".tile[data-index='3']");
    await new Promise((r) => setTimeout(r, 1400));
    await page.screenshot({ path: `${outDir}/${shot.name}-dossier.png` });
  }

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  console.log(shot.name, JSON.stringify(overflow));
  await page.close();
}

await browser.close();
