// The dances, checked on the real skeleton of both characters: every clip exists and loops, nothing is NaN, the feet stay on
// the floor (no sinking, no floating, except the jump) and the poses really differ. Run: node --experimental-strip-types scripts/dances-test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeDanceClips, findBone, LOOP_SECONDS } from '../src/render/dances.ts';
import { EMOTES, crowdDances, isEmote } from '../src/core/emotes.ts';
import { CHORE_ANIMS } from '../src/core/character.ts';

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('ok  -', name); };

async function load(sex) {
  const buf = fs.readFileSync(new URL(`../public/models/base_${sex}.glb`, import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
}

for (const sex of ['male', 'female']) {
  const gltf = await load(sex);
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const clips = makeDanceClips(root);
  const footL = findBone(root, 'footL');
  const footR = findBone(root, 'footR');
  const head = findBone(root, 'head');
  const handR = findBone(root, 'handR');
  const pos = (o) => o.getWorldPosition(new THREE.Vector3());
  const restFoot = Math.min(pos(footL).y, pos(footR).y);
  const mixer = new THREE.AnimationMixer(root);

  await test(`${sex}: every dance has a clip with all the bones, loops and has no NaN`, () => {
    assert.equal(clips.length, EMOTES.length + CHORE_ANIMS.length, 'every dance and every prison chore has a clip');
    for (const c of clips) {
      assert.equal(c.tracks.length, 18, c.name);
      assert.ok(Math.abs(c.duration - LOOP_SECONDS) < 1e-9);
      for (const t of c.tracks) {
        assert.ok(t.values.every(Number.isFinite), `${c.name} ${t.name}`);
        const n = t.getValueSize();
        for (let k = 0; k < n; k++) assert.ok(Math.abs(t.values[k] - t.values[t.values.length - n + k]) < 1e-6, `${c.name} ${t.name} does not loop`);
      }
    }
  });

  await test(`${sex}: the feet stay on the floor in every dance (the jump may leave it)`, () => {
    for (const c of clips) {
      const action = mixer.clipAction(c);
      action.play();
      let lowest = Infinity;
      let highest = -Infinity;
      for (let i = 0; i < 24; i++) {
        action.time = (i / 24) * LOOP_SECONDS;
        mixer.update(0);
        root.updateMatrixWorld(true);
        const y = Math.min(pos(footL).y, pos(footR).y);
        lowest = Math.min(lowest, y);
        highest = Math.max(highest, y);
      }
      action.stop();
      mixer.uncacheAction(c);
      assert.ok(lowest >= restFoot - 0.006, `${sex} ${c.name}: the feet sink ${(restFoot - lowest).toFixed(3)}`);
      assert.ok(highest <= restFoot + (c.name === 'saltos' ? 0.3 : 0.012), `${sex} ${c.name}: the feet float ${(highest - restFoot).toFixed(3)}`);
    }
  });

  await test(`${sex}: the saludo raises the hand above the head, and the dances differ from each other`, () => {
    const sample = (c, t) => {
      const a = mixer.clipAction(c);
      a.play();
      a.time = t;
      mixer.update(0);
      root.updateMatrixWorld(true);
      const v = [pos(handR).x, pos(handR).y, pos(handR).z, pos(head).y];
      a.stop();
      mixer.uncacheAction(c);
      return v;
    };
    const saludo = clips.find((c) => c.name === 'saludo');
    const s = sample(saludo, 0);
    assert.ok(s[1] > s[3], 'the waving hand is above the head');
    const poses = clips.map((c) => sample(c, LOOP_SECONDS * 0.3));
    for (let i = 0; i < poses.length; i++) for (let j = i + 1; j < poses.length; j++) {
      const d = Math.hypot(...poses[i].map((x, k) => x - poses[j][k]));
      assert.ok(d > 0.002, `${clips[i].name} and ${clips[j].name} look the same`);
    }
  });
}

await test('the crowd has a dance for every genre, and emotes are recognised by id', () => {
  for (const g of ['reggaeton', 'pop', 'house', 'salsa', 'rock', null]) assert.ok(crowdDances(g).length >= 1, String(g));
  assert.ok(isEmote('dancehall') && !isEmote('nope') && !isEmote(null));
  assert.ok(EMOTES.filter((e) => e.unlockLevel === 1).length >= 2, 'a new player has something to do');
});

console.log(`\n${passed} tests passed`);
