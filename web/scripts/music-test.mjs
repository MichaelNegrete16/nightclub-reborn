// Music: links, playlist, tastes and how the crowd reacts (pure logic). Run: node --experimental-strip-types scripts/music-test.mjs
import assert from 'node:assert/strict';
import { newClub, placeItem, setPhase, sanitizeClub } from '../src/core/club.ts';
import { GuestSim } from '../src/core/guests.ts';
import {
  parseYouTube, parseSpotify, parseAudioUrl, addLocalTrack, addCloudTrack, addTrack, removeTrack, selectTrack, setPlaying, nextTrackId, sanitizeMusic, liking, tasteFor,
  GENRES, BUILTIN, LIBRARY, VIP_RATING, stars, currentTrack,
} from '../src/core/music.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };
const put = (s, id, x, y, rot = 0) => placeItem(s, id, x, y, rot, 'free').state;

function room() {
  let s = setPhase(newClub(), 3);
  for (let y = 4; y <= 9; y++) for (let x = 3; x <= 8; x++) s = put(s, 'floor_cyan', x, y);
  s = put(s, 'bar_straight', 1, 1);
  s = put(s, 'dj_booth', 7, 1);
  for (const x of [1, 2, 3]) s = put(s, 'stool', x, 2);
  return s;
}

test('YouTube and Spotify links are understood, other links are not', () => {
  assert.equal(parseYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTube('https://youtu.be/dQw4w9WgXcQ?t=3'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTube('https://www.youtube.com/watch?list=x&v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTube('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(parseSpotify('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc'), 'track/4uLU6hMCjMI75M1A2tKUQC');
  assert.equal(parseSpotify('https://open.spotify.com/intl-es/playlist/37i9dQZF1DXcBWIGoYBM5M'), 'playlist/37i9dQZF1DXcBWIGoYBM5M');
  assert.equal(parseSpotify('https://spotify.evil.com/track/4uLU6hMCjMI75M1A2tKUQC'), null);
});

test('adding, selecting and removing songs; no duplicates; a bad link is refused', () => {
  let s = newClub();
  assert.match(addTrack(s, 'https://example.com', 'x', 'pop', 100).error, /YouTube, de Spotify/);
  const r = addTrack(s, 'https://youtu.be/dQw4w9WgXcQ', '  Mi canción ', 'salsa', 400);
  assert.equal(r.error, undefined);
  s = r.state;
  const t = s.music.tracks[0];
  assert.deepEqual([t.title, t.genre, t.bpm, t.source], ['Mi canción', 'salsa', 200, 'youtube']);
  assert.match(addTrack(s, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'otra', 'pop', 100).error, /ya está/);
  s = selectTrack(s, r.id);
  assert.equal(currentTrack(s.music).id, r.id);
  assert.equal(nextTrackId(s.music), LIBRARY[0].id, 'the list wraps around');
  s = removeTrack(s, r.id);
  assert.equal(s.music.playing, false, 'removing what plays stops it');
  assert.equal(setPlaying(s, true).music.current, LIBRARY[0].id, 'play with nothing chosen starts the first track');
});

test('the game library is always in the list; a damaged save keeps only valid tracks and old links are dropped', () => {
  const m = sanitizeMusic({ tracks: [
    { id: 'a', source: 'cloud', ref: 'a1b2c3d4e5f6a7b8c9d0', genre: 'zzz', bpm: 'x', title: 5 },
    { id: 'b', source: 'cloud', ref: '<script>' }, { id: 'c', source: 'youtube', ref: 'dQw4w9WgXcQ' }, { id: 'd', source: 'builtin', ref: 'x' }, { id: 'e', source: 'spotify', ref: 'track/4uLU6hMCjMI75M1A2tKUQC' },
  ], current: 'gone', playing: true, volume: 9 });
  assert.equal(m.tracks.length, 1);
  assert.equal(m.tracks[0].genre, 'pop');
  assert.equal(m.volume, 1);
  assert.deepEqual([m.current, m.playing], [null, false]);
  assert.equal(sanitizeClub({ music: 'junk' }).music.tracks.length, 0);
});

test('tastes follow the genre shares, and liking has four levels', () => {
  const n = 20000;
  const count = {};
  for (let i = 0; i < n; i++) { const g = tasteFor(i / n); count[g] = (count[g] ?? 0) + 1; }
  for (const g of GENRES) assert.ok(Math.abs(count[g.id] / n - g.share) < 0.01, g.id);
  assert.equal(liking('pop', 'pop'), 'love');
  assert.equal(liking('pop', 'reggaeton'), 'ok');
  assert.equal(liking('rock', 'salsa'), 'dislike');
  assert.equal(liking('rock', null), 'silence');
  assert.equal(stars(100), 5);
  assert.equal(stars(50), 2.5);
});

function night(genreAt, seconds = 600, seed = 3) {
  const sim = new GuestSim(seed);
  sim.setLayout(room());
  let vip = 0;
  const emotes = {};
  for (let t = 0; t < seconds; t += 0.1) {
    sim.setMusic(genreAt(t));
    sim.update(0.1);
    if (sim.waitingVip) vip++;
    for (const g of sim.guests) if (g.emote?.ttl > 2.4) emotes[g.emote.kind] = (emotes[g.emote.kind] ?? 0) + 1;
  }
  return { sim, vip, emotes };
}

test('silence sinks the rating, empties the club and keeps stars away', () => {
  const { sim, vip, emotes } = night(() => null);
  assert.ok(sim.rating < 30, `rating ${sim.rating}`);
  assert.equal(vip, 0);
  assert.ok(emotes.bored > 0 && !emotes.love);
});

test('music the crowd likes lifts the rating and brings reactions of joy', () => {
  const quiet = night(() => null);
  const mixed = night((t) => ['reggaeton', 'pop', 'reggaeton', 'house'][Math.floor(t / 60) % 4]);
  assert.ok(mixed.sim.rating > quiet.sim.rating + 25, `${mixed.sim.rating} vs ${quiet.sim.rating}`);
  assert.ok(mixed.emotes.love > 0);
  const wrong = night(() => 'rock');
  assert.ok(wrong.sim.rating < mixed.sim.rating, 'a genre that only a few love does worse than a mix aimed at the crowd');
  assert.ok(wrong.emotes.hate > 0);
});

test('stars only come to a club rated above the bar', () => {
  assert.ok(VIP_RATING >= 75);
  const best = night((t) => ['reggaeton', 'pop', 'reggaeton', 'pop'][Math.floor(t / 45) % 4], 1500, 8);
  assert.ok(best.sim.rating > 60);
  const none = night(() => 'rock', 1500, 8);
  assert.equal(none.vip, 0, 'a poorly rated club never sees a VIP');
});

test('own files and direct audio links can be added too', () => {
  assert.equal(parseAudioUrl('https://example.com/a/song.mp3?x=1'), 'https://example.com/a/song.mp3?x=1');
  assert.equal(parseAudioUrl('https://example.com/page.html'), null);
  assert.equal(parseAudioUrl('javascript:alert(1).mp3'), null);
  let s = newClub();
  const r = addTrack(s, 'https://example.com/song.mp3', '', 'rock', 140);
  assert.equal(r.error, undefined);
  assert.equal(r.state.music.tracks[0].source, 'url');
  const l = addLocalTrack(s, 'fabc123', ' Mi tema ', 'salsa', 99);
  assert.deepEqual([l.state.music.tracks[0].source, l.state.music.tracks[0].title, l.state.music.tracks[0].ref], ['file', 'Mi tema', 'fabc123']);
  assert.match(addLocalTrack(s, '../x', 'x', 'pop', 100).error, /no válido/);
  const m = sanitizeMusic({ tracks: [{ id: 'f1', source: 'file', ref: 'f1abc', genre: 'pop', bpm: 100 }, { id: 'f2', source: 'file', ref: '../../etc', genre: 'pop', bpm: 100 }, { id: 'u1', source: 'url', ref: 'ftp://x/y.mp3' }] });
  assert.equal(m.tracks.length, 1, 'only well-formed file ids and http(s) audio links survive');
});

test('songs uploaded to the city are tracks anyone can play: checked ids, no duplicates, damaged saves cleaned', () => {
  const id = 'a1b2c3d4e5f60718293a';
  const r = addCloudTrack(newClub(), id, ' Mi tema ', 'salsa', 99);
  assert.deepEqual([r.state.music.tracks[0].source, r.state.music.tracks[0].ref, r.state.music.tracks[0].title], ['cloud', id, 'Mi tema']);
  assert.match(addCloudTrack(r.state, id, 'x', 'pop', 100).error, /ya está/);
  assert.match(addCloudTrack(newClub(), '../etc', 'x', 'pop', 100).error, /no válido/);
  const m = sanitizeMusic({ tracks: [{ id: 'c1', source: 'cloud', ref: id, genre: 'pop', bpm: 100 }, { id: 'c2', source: 'cloud', ref: 'zz', genre: 'pop', bpm: 100 }] });
  assert.equal(m.tracks.length, 1);
});

console.log(`\n${passed} tests passed`);
