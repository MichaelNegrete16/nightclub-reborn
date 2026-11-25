// One picture with every catalog object, for design review. Usage: npm run build && node scripts/props-sheet.mjs [out.png]
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const out = path.resolve(process.argv[2] ?? path.join(here, '../../art/previews/props_sheet.png'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
await ctx.route('http://nc.test/**', async (route) => {
  const u = new URL(route.request().url());
  const p = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname);
  try { await route.fulfill({ status: 200, contentType: MIME[path.extname(p)] ?? 'application/octet-stream', body: await readFile(path.join(dist, p)) }); } catch { await route.fulfill({ status: 404, body: 'nf' }); }
});
const page = await ctx.newPage();
await page.goto('http://nc.test/?server=off&e2e');
await page.waitForFunction(() => window.__nc?.ready, null, { timeout: 90000 });
await page.evaluate(() => {
  const ui = window.__nc.ui;
  const thumbs = ui.ctx.thumbs;
  const ids = [...window.__nc.catalogIds];
  document.body.innerHTML = '<div id="sheet" style="display:grid;grid-template-columns:repeat(8,1fr);gap:6px;padding:10px;background:#2b3150;color:#fff;font:12px sans-serif;width:1480px"></div>';
  const sheet = document.getElementById('sheet');
  for (const id of ids) { const d = document.createElement('div'); d.style.textAlign = 'center'; d.innerHTML = `<img src="${thumbs.item(id)}" style="width:170px;height:170px;background:#3a4166;border-radius:12px"><br>${id}`; sheet.append(d); }
});
await page.waitForTimeout(800);
await (await page.$('#sheet')).screenshot({ path: out });
await browser.close();
console.log('saved', out);
