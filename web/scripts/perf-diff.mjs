import { chromium } from 'playwright-core';
import { readFile, writeFile } from 'node:fs/promises';

const chrome = process.env.CHROME ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
const [a, b] = await Promise.all(process.argv.slice(2, 4).map(async (f) => `data:image/png;base64,${(await readFile(f)).toString('base64')}`));
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const out = await page.evaluate(async ([a, b]) => {
  const load = async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, img.width, img.height);
  };
  const [x, y] = [await load(a), await load(b)];
  if (x.width !== y.width || x.height !== y.height) return { error: 'size' };
  let differing = 0;
  let over8 = 0;
  let max = 0;
  for (let i = 0; i < x.data.length; i += 4) {
    const d = Math.max(Math.abs(x.data[i] - y.data[i]), Math.abs(x.data[i + 1] - y.data[i + 1]), Math.abs(x.data[i + 2] - y.data[i + 2]));
    if (d > 0) differing++;
    if (d > 8) over8++;
    if (d > max) max = d;
  }
  const mask = new OffscreenCanvas(x.width, x.height);
  const mg = mask.getContext('2d');
  const md = mg.createImageData(x.width, x.height);
  for (let i = 0; i < x.data.length; i += 4) {
    const d = Math.max(Math.abs(x.data[i] - y.data[i]), Math.abs(x.data[i + 1] - y.data[i + 1]), Math.abs(x.data[i + 2] - y.data[i + 2]));
    const g = (x.data[i] + x.data[i + 1] + x.data[i + 2]) / 6;
    md.data[i] = d ? 255 : g;
    md.data[i + 1] = d > 8 ? 255 : d ? 0 : g;
    md.data[i + 2] = d ? 0 : g;
    md.data[i + 3] = 255;
  }
  mg.putImageData(md, 0, 0);
  const small = new OffscreenCanvas(1600, 900);
  small.getContext('2d').drawImage(mask, 0, 0, 1600, 900);
  const blob = await small.convertToBlob({ type: 'image/png' });
  const maskUrl = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
  const total = x.data.length / 4;
  return { width: x.width, height: x.height, pixels: total, differing, differingPct: +((100 * differing) / total).toFixed(4), over8, over8Pct: +((100 * over8) / total).toFixed(4), maxChannelDiff: max, maskUrl };
}, [a, b]);
await browser.close();
const { maskUrl, ...numbers } = out;
if (process.argv[4] && maskUrl) await writeFile(process.argv[4], Buffer.from(maskUrl.split(',')[1], 'base64'));
console.log(JSON.stringify(numbers, null, 2));
