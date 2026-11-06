import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const svgContent = fs.readFileSync(path.join(root, "favicon.svg"), "utf8");

const makeHtml = (size) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; padding: 0; background: transparent; overflow: hidden; width: ${size}px; height: ${size}px; }
  svg { width: ${size}px; height: ${size}px; display: block; }
</style>
</head>
<body>${svgContent}</body>
</html>`;

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
    args: ["--ignore-gpu-blocklist", "--use-gl=angle"],
  });
  const page = await browser.newPage();

  // 192x192
  await page.setViewport({ width: 192, height: 192 });
  await page.setContent(makeHtml(192), { waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(root, "assets", "icon-192.png"), omitBackground: true });

  // 512x512
  await page.setViewport({ width: 512, height: 512 });
  await page.setContent(makeHtml(512), { waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(root, "assets", "icon-512.png"), omitBackground: true });

  await browser.close();
  console.log("Exported icon-192.png and icon-512.png");
}

main();
