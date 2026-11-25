// Draws every comic panel of the story to PNG files so they can be reviewed. Usage: npm run build && node scripts/shots.mjs <outDir>
import { chromium } from 'playwright-core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const outDir = path.resolve(process.argv[2] ?? path.join(here, '../../art/previews/comic'));
await mkdir(outDir, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => localStorage.setItem('nc.club.v1', JSON.stringify({ story: { intro: true, name: 'Camila', seen: ['intro'], done: [] } })));
await ctx.route('http://nc.test/**', async (route) => {
  const u = new URL(route.request().url());
  const p = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname);
  try { await route.fulfill({ status: 200, contentType: MIME[path.extname(p)] ?? 'application/octet-stream', body: await readFile(path.join(dist, p)) }); }
  catch { await route.fulfill({ status: 404, body: 'not found' }); }
});
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://nc.test/?server=off&e2e');
await page.waitForFunction(() => window.__nc?.ready, null, { timeout: 90000 });
const ids = ['city', 'door', 'letter', 'beto_dream', 'record', 'inside', 'rosa_bar', 'empty_floor', 'dream_party', 'zeta', 'neon_fest'];
for (const id of ids) {
  const t0 = Date.now();
  const url = await page.evaluate(([id]) => window.__nc.comic.shot(id, { player: window.__nc.getConfig(), name: 'Camila' }), [id]);
  if (!url) { console.log(id, 'NO IMAGE'); continue; }
  await writeFile(path.join(outDir, `${id}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  console.log(id, 'ok', Date.now() - t0, 'ms');
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
