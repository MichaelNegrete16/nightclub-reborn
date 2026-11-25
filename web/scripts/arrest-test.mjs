// The arrest scene tells what really happened (pure logic). Run: node --experimental-strip-types scripts/arrest-test.mjs
import assert from 'node:assert/strict';
import { arrestScene } from '../src/core/arrest.ts';
import { SPEAKERS } from '../src/core/story.ts';
import { NPC_LOOKS } from '../src/core/npcs.ts';
import { cleanMail } from '../src/core/mail.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };
const jail = { id: 'j1', at: 1000, kind: 'jail', chores: 30, by: 3, byName: 'Club Rival', cash: 1250, closedUntil: 1000 + 6 * 3600_000, pieces: [{ uid: 'a', id: 'gold_statue', tier: 2 }], stolenCash: 0, story: 'caught', kitsUsed: ['picks', 'jammer'] };

test('a caught thief sees the raid, the evidence of the attempt, and the cell with the real numbers', () => {
  const sc = arrestScene(jail, 'Camila');
  assert.ok(sc.lines.length >= 5);
  const shots = sc.lines.filter((l) => l.shot).map((l) => l.shot.split('|')[0]);
  assert.deepEqual(shots, ['raid', 'evidence', 'cell']);
  const text = sc.lines.map((l) => l.text).join(' ');
  assert.match(text, /Club Rival/);
  assert.match(text, /estatua dorada/);
  assert.match(text, /ganzúas/i);
  assert.match(text, /30 tareas/);
  assert.match(text, /limpiar baños/);
  assert.match(text, /1\.250/);
  assert.match(text, /No alcanzaste a llevarte nada/);
  assert.equal(sc.lines.find((l) => l.shot?.startsWith('evidence')).shot, 'evidence|gold_statue|0|0');
  for (const l of sc.lines) assert.ok(l.who in SPEAKERS, l.who);
  assert.ok(NPC_LOOKS.ferro, 'the commissioner has a face');
});

test('a convicted robber sees what was taken: the pieces and the money, and how', () => {
  const sc = arrestScene({ ...jail, story: 'convicted', stolenCash: 26338, kitsUsed: [], pieces: [{ uid: 'a', id: 'speaker', tier: 1 }, { uid: 'b', id: 'disco_ball', tier: 1 }] }, 'Jackson');
  const text = sc.lines.map((l) => l.text).join(' ');
  assert.match(text, /altavoz y bola disco/);
  assert.match(text, /26\.338 monedas/);
  assert.match(text, /sin ningún equipo/);
  assert.equal(sc.lines.find((l) => l.shot?.startsWith('evidence')).shot, 'evidence|speaker,disco_ball|26338|1');
});

test('the letter keeps its story fields when it travels', () => {
  const m = cleanMail([jail])[0];
  assert.equal(m.story, 'caught');
  assert.deepEqual(m.kitsUsed, ['picks', 'jammer']);
  assert.equal(m.pieces[0].id, 'gold_statue');
  assert.equal(cleanMail([{ ...jail, stolenCash: 99.9, story: 'hax' }])[0].story, undefined);
  assert.equal(cleanMail([{ ...jail, stolenCash: 99.9 }])[0].stolenCash, 99);
});

console.log(`\n${passed} tests passed`);
