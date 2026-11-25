// City layout rules (pure logic). Run: node --experimental-strip-types scripts/world-test.mjs
import assert from 'node:assert/strict';
import { LOT, STREET, CELL, lotOrigin, buildingOrigin, spiralCell, simulatedNeighbors, fitsInLot, BUILDING_OFFSET } from '../src/core/world.ts';
import { PHASES } from '../src/core/club.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };

test('every phase of the club, up to the biggest, fits inside its own lot with a yard around it', () => {
  for (const p of PHASES) assert.ok(fitsInLot(p.id), `phase ${p.id} (${p.w}x${p.h}) does not fit`);
});

test('growing never reaches a neighbour: the biggest building stays at least a street-width plus yard from the next lot', () => {
  const biggest = PHASES[PHASES.length - 1];
  const gapEast = LOT.w - (BUILDING_OFFSET.x + biggest.w) + STREET;
  const gapSouth = LOT.h - (BUILDING_OFFSET.z + biggest.h) + STREET;
  assert.ok(gapEast >= STREET + 2 && gapSouth >= STREET + 2, `gaps ${gapEast} / ${gapSouth}`);
});

test('the spiral hands out unique lots, starting at the centre and spreading outwards with no gaps', () => {
  const seen = new Set();
  const N = 400;
  for (let n = 0; n < N; n++) {
    const c = spiralCell(n);
    const k = `${c.i},${c.j}`;
    assert.ok(!seen.has(k), `cell ${k} handed out twice (n=${n})`);
    seen.add(k);
  }
  assert.deepEqual(spiralCell(0), { i: 0, j: 0 });
  // the first 9 are exactly the 3x3 block, the first 25 the 5x5 block: no holes
  for (const [count, radius] of [[9, 1], [25, 2], [49, 3], [81, 4]]) {
    const block = new Set();
    for (let n = 0; n < count; n++) block.add(`${spiralCell(n).i},${spiralCell(n).j}`);
    for (let i = -radius; i <= radius; i++) for (let j = -radius; j <= radius; j++) assert.ok(block.has(`${i},${j}`), `hole at ${i},${j} in the first ${count}`);
  }
});

test('consecutive spiral cells are always adjacent (a friend who joins next door really is next door)', () => {
  for (let n = 1; n < 200; n++) {
    const a = spiralCell(n - 1);
    const b = spiralCell(n);
    assert.ok(Math.abs(a.i - b.i) + Math.abs(a.j - b.j) <= 2, `jump between ${n - 1} and ${n}`);
  }
});

test('lots sit on an exact grid and never overlap: a street always separates two lots', () => {
  const a = lotOrigin({ i: 0, j: 0 });
  const e = lotOrigin({ i: 1, j: 0 });
  const s = lotOrigin({ i: 0, j: 1 });
  assert.equal(e.x - a.x, CELL.w);
  assert.equal(s.z - a.z, CELL.h);
  assert.equal(e.x - (a.x + LOT.w), STREET);
  assert.equal(s.z - (a.z + LOT.h), STREET);
  const b = buildingOrigin({ i: 2, j: -1 });
  const o = lotOrigin({ i: 2, j: -1 });
  assert.deepEqual([b.x - o.x, b.z - o.z], [BUILDING_OFFSET.x, BUILDING_OFFSET.z]);
});

test('simulated neighbours are deterministic, never sit on the player\'s lot, and never share a cell', () => {
  const a = simulatedNeighbors(7);
  const b = simulatedNeighbors(7);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, simulatedNeighbors(8));
  const cells = new Set(a.map((n) => `${n.cell.i},${n.cell.j}`));
  assert.equal(cells.size, a.length);
  assert.ok(!cells.has('0,0'));
  const near = a.filter((n) => Math.max(Math.abs(n.cell.i), Math.abs(n.cell.j)) === 1);
  assert.equal(near.length, 8, 'all 8 lots around the player are accounted for');
  assert.ok(near.some((n) => n.kind === 'club') && near.some((n) => n.kind === 'vacant'), 'a mix of clubs and free lots');
  for (const n of a) if (n.kind === 'club') assert.ok(n.phase >= 1 && n.phase <= PHASES.length && fitsInLot(n.phase));
});

console.log(`\n${passed} tests passed`);
