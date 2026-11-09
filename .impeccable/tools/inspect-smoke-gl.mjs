import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = 8862;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".fbx": "application/octet-stream",
  ".json": "application/json",
};

const server = http
  .createServer((req, res) => {
    let u = decodeURIComponent(req.url.split("?")[0]);
    if (u.endsWith("/")) u += "index.html";
    const f = path.join(root, u);
    fs.readFile(f, (err, data) => {
      if (err) return res.writeHead(404).end();
      res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }).end(data);
    });
  })
  .listen(port, "127.0.0.1");

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
    args: ["--ignore-gpu-blocklist", "--use-gl=angle"],
  });
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("CONSOLE ERROR:", msg.text());
  });

  await page.goto(`http://127.0.0.1:${port}/?view=world&skip=1`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 200 && !(await page.evaluate(() => document.documentElement.classList.contains("world-ready"))); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }

  await page.evaluate(() => window.PortfolioWorld?.debug?.finishIntro?.());
  await new Promise((r) => setTimeout(r, 400));

  // Trigger manual spawn
  const res = await page.evaluate(() => {
    const pw = window.PortfolioWorld;
    pw.debug.punchSmoke().spawn("onePunch");
    const group = pw.debug.scene?.()?.getObjectByName("NikoPunchSaitamaSmokeVFX");
    const bannerGroup = group?.children[1];
    const bannerMesh = bannerGroup?.children[0];
    const puffGroup = group?.children[0];
    const puff0 = puffGroup?.children[0];
    return {
      groupVisible: group?.visible,
      groupPos: group?.position.toArray(),
      bannerGroupPos: bannerGroup?.position.toArray(),
      bannerGroupQuat: bannerGroup?.quaternion.toArray(),
      bannerScale: bannerGroup?.scale.toArray(),
      bannerMeshVisible: bannerMesh?.visible,
      bannerMeshGeoIndices: bannerMesh?.geometry?.index?.count,
      puff0Pos: puff0?.position.toArray(),
      puff0Scale: puff0?.scale.toArray(),
      puff0Visible: puff0?.visible,
      uniforms: {
        alpha: bannerMesh?.material?.uniforms?.uGlobalAlpha?.value,
        progress: bannerMesh?.material?.uniforms?.uProgress?.value,
      },
    };
  });

  console.log("Smoke check result:", JSON.stringify(res, null, 2));

  await browser.close();
  server.close();
}

main();
