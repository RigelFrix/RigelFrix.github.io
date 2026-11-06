import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const svgContent = fs.readFileSync(path.join(root, "favicon.svg"), "utf8");

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    margin: 0;
    padding: 30px;
    background: #0b0f19;
    color: #e2e8f0;
    font-family: system-ui, -apple-system, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
    flex-wrap: wrap;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 20px;
    border-radius: 12px;
  }
  .card-dark {
    background: #182032;
    border: 1px solid #2d3748;
  }
  .card-light {
    background: #f8fafc;
    color: #0f172a;
    border: 1px solid #cbd5e1;
  }
  .card-black {
    background: #000000;
    border: 1px solid #222;
  }
  .tab-bar-mock {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    border-radius: 8px 8px 0 0;
    font-size: 13px;
    font-weight: 500;
  }
  .tab-dark {
    background: #202634;
    color: #f1f5f9;
    border: 1px solid #334155;
    border-bottom: none;
  }
  .tab-light {
    background: #ffffff;
    color: #1e293b;
    border: 1px solid #cbd5e1;
    border-bottom: none;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .label {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.5px;
    opacity: 0.85;
  }
  .icon-preview {
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
</head>
<body>
  <h2>Transparent Rigel Star with Circular Crown (Game Icon Favicon)</h2>
  
  <div class="row">
    <div class="card card-dark">
      <div class="label">256 x 256 (Detail View on Dark)</div>
      <div class="icon-preview" style="width: 256px; height: 256px;">
        ${svgContent}
      </div>
    </div>
    
    <div class="card card-light">
      <div class="label">256 x 256 (Detail View on Light)</div>
      <div class="icon-preview" style="width: 256px; height: 256px;">
        ${svgContent}
      </div>
    </div>
  </div>

  <div class="row">
    <div class="card card-dark">
      <div class="label">Browser Tab Mockup (Dark Mode)</div>
      <div class="tab-bar-mock tab-dark">
        <div style="width: 16px; height: 16px;">${svgContent}</div>
        <span>Francis Yambao | Game Developer</span>
      </div>
    </div>

    <div class="card card-light">
      <div class="label">Browser Tab Mockup (Light Mode)</div>
      <div class="tab-bar-mock tab-light">
        <div style="width: 16px; height: 16px;">${svgContent}</div>
        <span>Francis Yambao | Game Developer</span>
      </div>
    </div>
  </div>

  <div class="row">
    <div class="card card-dark">
      <div class="label">64 x 64</div>
      <div class="icon-preview" style="width: 64px; height: 64px;">${svgContent}</div>
    </div>
    <div class="card card-dark">
      <div class="label">32 x 32</div>
      <div class="icon-preview" style="width: 32px; height: 32px;">${svgContent}</div>
    </div>
    <div class="card card-light">
      <div class="label">32 x 32 (Light)</div>
      <div class="icon-preview" style="width: 32px; height: 32px;">${svgContent}</div>
    </div>
    <div class="card card-black">
      <div class="label">16 x 16</div>
      <div class="icon-preview" style="width: 16px; height: 16px;">${svgContent}</div>
    </div>
    <div class="card card-light">
      <div class="label">16 x 16 (Light)</div>
      <div class="icon-preview" style="width: 16px; height: 16px;">${svgContent}</div>
    </div>
  </div>
</body>
</html>`;

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
    args: ["--ignore-gpu-blocklist", "--use-gl=angle"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 950, height: 850, deviceScaleFactor: 2 });
  await page.setContent(html);
  await new Promise((r) => setTimeout(r, 150));
  const outPath = path.join(root, "assets", "favicon-preview.png");
  await page.screenshot({ path: outPath });
  await browser.close();
  console.log("Screenshot saved to", outPath);
}

main();
