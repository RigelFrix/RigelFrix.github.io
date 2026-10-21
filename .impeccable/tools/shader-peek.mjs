/* node shader-peek.mjs [base] [pattern]: lists the compiled programs and, for each, whether its fragment source contains
   `pattern` (default: the colour-space line). Debug aid for ShaderChunk patches. */
import puppeteer from "puppeteer-core";

const [base = "http://127.0.0.1:8765/", pattern = "sRGBTransferOETF( gl_FragColor )"] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: false,
  args: ["--ignore-gpu-blocklist", "--window-size=1300,860"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(`${base}?view=world&t=${Date.now()}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains("world-ready"), { timeout: 180000 });
await page.evaluate(() => void window.PortfolioWorld.debug.finishIntro());
await new Promise((r) => setTimeout(r, 2000));
const out = await page.evaluate((pattern) => {
  const r = window.PortfolioWorld.debug.renderer();
  const gl = r.getContext();
  return r.info.programs.map((p) => {
    const src = gl.getShaderSource(p.fragmentShader) || "";
    const line = src.split("\n").find((l) => /gl_FragColor = (linearToOutputTexel|sRGBTransferOETF)/.test(l)) || "";
    return `${p.name.padEnd(28)} has=${src.includes(pattern)}  ${line.trim()}`;
  });
}, pattern);
console.log(out.join("\n"));
await browser.close();
