import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = 8857;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u.endsWith('/')) u += 'index.html';
  const f = path.join(root, u);
  fs.readFile(f, (err, data) => {
    if (err) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }).end(data);
  });
}).listen(port, '127.0.0.1');

async function main() {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: ['--ignore-gpu-blocklist', '--use-gl=angle'],
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + port + '/?view=world&skip=1');
  for (let i = 0; i < 200 && !(await page.evaluate(() => document.documentElement.classList.contains('world-ready'))); i++) {
    await new Promise(r => setTimeout(r, 50));
  }
  await page.evaluate(() => window.PortfolioWorld?.debug?.finishIntro?.());
  await new Promise(r => setTimeout(r, 400));
  await page.keyboard.press('KeyG');

  for (let step = 0; step < 40; step++) {
    const data = await page.evaluate(() => {
      const pw = window.PortfolioWorld;
      const state = pw?.debug?.state?.();
      const sm = pw?.debug?.punchSmoke?.();
      const bot = pw?.debug?.bot?.();
      const group = pw?.debug?.scene?.()?.getObjectByName('NikoPunchSaitamaSmokeVFX');
      return {
        f: Math.floor((state?.punchTimer || 0) * 30),
        punching: state?.punching,
        smokeActive: sm?.active,
        groupVisible: group?.visible,
        groupPos: group ? [group.position.x, group.position.y, group.position.z] : null,
        childrenCount: group?.children?.length,
        hasRightHand: !!bot?.bones?.RightHand,
      };
    });
    if (data.smokeActive || data.f >= 14) {
      console.log(JSON.stringify(data));
    }
    await new Promise(r => setTimeout(r, 20));
  }
  await browser.close();
  server.close();
}
main();
