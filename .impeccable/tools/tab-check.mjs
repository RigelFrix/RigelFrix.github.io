import puppeteer from "puppeteer-core";

/* Tab key through the world: nothing should scroll or shift. */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: false,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--window-size=1100,800"],
});
const a = (await browser.pages())[0];
a.on("pageerror", (error) => console.log("pageerror", error.message));
await a.setViewport({ width: 1024, height: 700 });
await a.goto("file:///C:/Users/User/Documents/personal/RigelFrix.github.io/index.html?view=world", { waitUntil: "load" });
await wait(3000);

const probe = () =>
  a.evaluate(() => {
    const el = document.activeElement;
    const scrolled = [document.scrollingElement, document.body, ...document.querySelectorAll("#world, #world-labels, .hud, main")]
      .filter((n) => n && (n.scrollLeft || n.scrollTop))
      .map((n) => `${n.id || n.className || n.tagName}:${n.scrollLeft},${n.scrollTop}`);
    const canvas = document.querySelector("#world-canvas").getBoundingClientRect();
    return `${(el.textContent || el.tagName).trim().slice(0, 22).padEnd(22)} scrolled=[${scrolled}] canvasX=${Math.round(canvas.x)}`;
  });

for (let i = 0; i < 18; i++) {
  await a.keyboard.press("Tab");
  await wait(250);
  console.log(i + 1, await probe());
}
await a.screenshot({ path: "../review/tab-key.png" });
await browser.close();
