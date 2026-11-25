// Graphics governor (pure logic). Run: node --experimental-strip-types scripts/quality-test.mjs
import assert from 'node:assert/strict';
import { Governor, TIERS } from '../src/render/quality.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };
const run = (g, dt, n) => { for (let i = 0; i < n; i++) g.frame(dt); };

test('a computer that keeps up stays on high; a slow one steps down, one tier at a time, and stops at low', () => {
  const fast = new Governor('high', true);
  const seen = [];
  fast.onChange = (t) => seen.push(t);
  run(fast, 1 / 60, 2000);
  assert.deepEqual(seen, []);
  const slow = new Governor('high', true);
  slow.onChange = (t) => seen.push(t);
  run(slow, 1 / 15, 3000);
  assert.deepEqual(seen, ['medium', 'low']);
  assert.equal(slow.tier, 'low');
});

test('it never steps down in a manual choice, ignores the first frames and long pauses, and never raises quality', () => {
  const seen = [];
  const manual = new Governor('high', false);
  manual.onChange = (t) => seen.push(t);
  run(manual, 1 / 10, 3000);
  assert.deepEqual(seen, []);
  const g = new Governor('high', true);
  g.onChange = (t) => seen.push(t);
  run(g, 1 / 5, 100); // warm-up: shaders compiling
  run(g, 3, 500); // tab in the background
  assert.deepEqual(seen, []);
  const f = new Governor('low', true);
  f.onChange = (t) => seen.push(t);
  run(f, 1 / 120, 2000);
  assert.equal(f.tier, 'low');
});

test('lower tiers really ask for less', () => {
  const { high, medium, low } = TIERS;
  assert.ok(high.pixelRatio > medium.pixelRatio && medium.pixelRatio > low.pixelRatio);
  assert.ok(high.cityRange > medium.cityRange && medium.cityRange > low.cityRange);
  assert.ok(high.outline && !low.outline && low.fpsCap === 30 && !low.neonLights && !low.weatherFx);
  assert.ok(high.mixerEvery < medium.mixerEvery && medium.mixerEvery < low.mixerEvery);
});

console.log(`\n${passed} tests passed`);
