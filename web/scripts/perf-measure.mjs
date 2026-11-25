import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const chrome = process.env.CHROME ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff' };

const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--ignore-gpu-blocklist', '--no-sandbox', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const news = /id: '([^']+)'/.exec(await readFile(path.resolve(here, '../src/core/news.ts'), 'utf8'))?.[1] ?? '';
const saved = {
  story: { intro: true, name: 'Medida', seen: ['intro', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7'], done: [], tutorial: -1, news },
  coins: 5000000, xp: 5000000, phase: 5, open: false, inventory: {}, items: [],
  staff: { guard: 2, dj: 1, bartender: 2 },
};
await ctx.addInitScript((v) => {
  localStorage.setItem('nc.club.v1', JSON.stringify(v));
  localStorage.setItem('nc.quality', 'high');
}, saved);
let glb = 0;
await ctx.route('http://nc.test/**', async (route) => {
  const u = new URL(route.request().url());
  const p = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname);
  if (p.endsWith('.glb')) glb++;
  try {
    await route.fulfill({ status: 200, contentType: MIME[path.extname(p)] ?? 'application/octet-stream', body: await readFile(path.join(dist, p)) });
  } catch {
    await route.fulfill({ status: 404, body: 'not found' });
  }
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const t0 = Date.now();
await page.goto('http://nc.test/?server=off&e2e', { waitUntil: 'commit' });
await page.waitForFunction(() => window.__nc?.ready, null, { timeout: 90000 });
const readyMs = Date.now() - t0;
const glbAtReady = glb;

const built = await page.evaluate(() => {
  const c = window.__nc.club;
  const put = (id, x, y, r = 0) => c.tryPlace(id, x, y, r) === undefined;
  let placed = 0;
  const base = [['dj_booth', 8, 0], ['bar_straight', 1, 0], ['stool', 1, 1], ['stool', 2, 1], ['speaker', 6, 0], ['speaker', 11, 0], ['speaker', 0, 6], ['speaker', 17, 6]];
  for (const [id, x, y] of base) if (put(id, x, y)) placed++;
  for (let x = 3; x <= 14; x++) for (let y = 4; y <= 15; y++) if (put(['floor_cyan', 'floor_pink', 'floor_violet'][(x + y) % 3], x, y)) placed++;
  for (let y = 8; y <= 19; y++) for (const x of [0, 17]) if (put(y % 3 ? 'puff' : 'plant', x, y)) placed++;
  for (let x = 2; x <= 15; x += 1) if (put(x % 4 ? 'stool' : 'palm', x, 18)) placed++;
  const e0 = performance.now();
  c.tryPlace('plant', 16, 2, 0);
  const editMs = performance.now() - e0;
  const cells = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
  c.setNeighbors(cells.map(([i, j], k) => ({ kind: 'club', cell: { i, j }, name: `Club ${k}`, phase: 3, color: '#ff3da6', open: true, online: true, level: 15, rating: 60, n: 100 + k, guests: 36 })));
  c.setOpen(true);
  c.simulate(400);
  return { placed, items: c.state.items.length, phase: c.state.phase, editMs: Math.round(editMs) };
});
await page.waitForTimeout(45000);

const sample = await page.evaluate(async () => {
  const { renderer, club } = window.__nc;
  const info = renderer.info;
  const frames = 60;
  const dts = [];
  let calls = 0;
  let tris = 0;
  const draw = renderer.render;
  renderer.render = function (...args) {
    draw.apply(this, args);
    calls += info.render.calls;
    tris += info.render.triangles;
  };
  let last = performance.now();
  await new Promise((done) => {
    let n = 0;
    const tick = () => {
      const now = performance.now();
      dts.push(now - last);
      last = now;
      if (++n >= frames) done();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  renderer.render = draw;
  dts.shift();
  dts.sort((a, b) => a - b);
  let meshes = 0;
  let skinned = 0;
  club.scene.traverse((o) => {
    if (o.isSkinnedMesh) skinned++;
    else if (o.isMesh) meshes++;
  });
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
    drawCallsPerFrame: Math.round(calls / frames),
    trianglesPerFrame: Math.round(tris / frames),
    frameMsMedian: +dts[Math.floor(dts.length / 2)].toFixed(1),
    frameMsP95: +dts[Math.floor(dts.length * 0.95)].toFixed(1),
    geometriesInGpu: info.memory.geometries,
    texturesInGpu: info.memory.textures,
    shaderPrograms: info.programs?.length ?? 0,
    sceneMeshes: meshes,
    sceneSkinnedMeshes: skinned,
    guestsInside: club.guestCount,
    queue: club.queueCount,
    guestsDrawn: club.crowd.group.children.length,
    pedestrians: club.ambient.count,
    jsHeapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  };
});
if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
await browser.close();
console.log(JSON.stringify({ readyMs, glbRequestsAtReady: glbAtReady, glbRequestsTotal: glb, ...built, ...sample, errors }, null, 2));
