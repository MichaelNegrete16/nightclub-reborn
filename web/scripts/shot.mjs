// Visual check without a dev server: serves ./dist to a headless Chrome through request interception.
// Usage: npm run build && npm run shot -- <outDir>
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const outDir = path.resolve(process.argv[2] ?? path.join(here, '../../art/previews'));
await mkdir(outDir, { recursive: true });

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png',
};

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});

const errors = [];

async function open(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await ctx.route('http://nc.test/**', async (route) => {
    const u = new URL(route.request().url());
    const p = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname);
    try {
      const body = await readFile(path.join(dist, p));
      await route.fulfill({ status: 200, contentType: MIME[path.extname(p)] ?? 'application/octet-stream', body });
    } catch {
      await route.fulfill({ status: 404, body: 'not found' });
    }
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto('http://nc.test/?server=off&e2e');
  await page.waitForFunction(() => window.__nc?.ready, null, { timeout: 90000 });
  return page;
}

const male = {
  sex: 'male', skin: '#a4663f', hairStyle: 'curly_top', hairColor: '#3b2112', eyeColor: '#3b2112',
  top: 'hoodie', topColor: '#7a28d9', bottom: 'jeans', bottomColor: '#2c3f8f', shoesColor: '#f4f4f8',
  cap: false, capColor: '#e63a2e', glasses: false,
};
const female = {
  sex: 'female', skin: '#4e2a17', hairStyle: 'space_buns', hairColor: '#120d0b', eyeColor: '#2a6bd7',
  top: 'tshirt', topColor: '#12b8e6', bottom: 'skirt', bottomColor: '#e6199c', shoesColor: '#1b1f3a',
  cap: false, capColor: '#e63a2e', glasses: true,
};

const desktop = await open({ width: 1280, height: 800 });
await desktop.evaluate((c) => window.__nc.setConfig(c), male);
await desktop.evaluate(() => window.__nc.setAnim('dance'));
await desktop.waitForTimeout(1800);
await desktop.screenshot({ path: path.join(outDir, 'web_desktop_male.png') });

await desktop.evaluate((c) => window.__nc.setConfig(c), female);
await desktop.evaluate(() => window.__nc.setAnim('idle'));
await desktop.waitForTimeout(1800);
await desktop.screenshot({ path: path.join(outDir, 'web_desktop_female.png') });

// real click through the UI: pick "Hombre" then a hair style chip
await desktop.getByRole('button', { name: 'Hombre' }).click();
await desktop.waitForTimeout(800);
await desktop.getByRole('button', { name: 'Afro' }).click();
await desktop.waitForTimeout(600);
const afterClicks = await desktop.evaluate(() => window.__nc.getConfig());
console.log('after UI clicks:', afterClicks.sex, afterClicks.hairStyle);

const mobile = await open({ width: 390, height: 844 });
await mobile.evaluate((c) => window.__nc.setConfig(c), female);
await mobile.evaluate(() => window.__nc.setAnim('celebrate'));
await mobile.waitForTimeout(1500);
await mobile.screenshot({ path: path.join(outDir, 'web_mobile_female.png') });

await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
