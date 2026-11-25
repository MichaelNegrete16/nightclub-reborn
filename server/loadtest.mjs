// Load test: starts the server as its own process and connects N fake players. Run: npm run load -- 200 30
//   args: players (default 200), seconds at full load (default 20)
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const N = Number(process.argv[2] ?? 200);
const SECONDS = Number(process.argv[3] ?? 20);
const PORT = 8790 + Math.floor(Math.random() * 100);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ['--experimental-strip-types', 'index.mjs'], {
  cwd: new URL('.', import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT), DATA_FILE: '', MAX_PER_IP: '100000' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((r) => server.stdout.on('data', (d) => d.toString().includes('listening') && r()));

const stats = async () => (await fetch(`http://127.0.0.1:${PORT}/stats`)).json();
const cpuOf = (pid) => {
  // cumulative CPU seconds of the server process, from /proc
  try {
    const f = readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ');
    return (Number(f[13]) + Number(f[14])) / 100;
  } catch {
    return 0;
  }
};
import { readFileSync } from 'node:fs';

const bots = [];
let bytesIn = 0;
let msgsIn = 0;
let seenCity = 0;
const latencies = [];
const phases = [1, 1, 1, 2, 2, 3, 4, 5, 6, 7];

function makeBot(i) {
  const id = `bot-${String(i).padStart(5, '0')}-loadtest`;
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  const bot = { ws, id, got: false, rating: 50, mark: 0 };
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', id, name: `Bot ${i}` })));
  ws.on('message', (d) => {
    bytesIn += d.length;
    msgsIn++;
    if (!bot.got) { bot.got = true; seenCity++; }
    if (i === 1 && bots[0]?.mark) {
      const m = JSON.parse(d.toString());
      if (m.clubs?.some((c) => c.rating === bots[0].mark.rating && c.name === 'Probe')) { latencies.push(Date.now() - bots[0].mark.at); bots[0].mark = 0; }
    }
  });
  ws.on('error', () => {});
  return bot;
}
const updateBot = (b, i) => {
  if (b.ws.readyState !== 1) return;
  b.ws.send(JSON.stringify({ t: 'club', club: { name: `Club ${i}`, phase: phases[i % phases.length], level: 1 + (i % 60), rating: Math.floor(Math.random() * 100), open: Math.random() < 0.7, guests: Math.floor(Math.random() * 40) } }));
};

console.log(`connecting ${N} players...`);
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  bots.push(makeBot(i));
  if (i % 50 === 49) await sleep(300); // a ramp, not a stampede
}
while (seenCity < N && Date.now() - t0 < 30000) await sleep(100);
console.log(`${seenCity}/${N} players got their city in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// steady state: everybody updates their club every 5-10 s
const timers = bots.map((b, i) => setInterval(() => updateBot(b, i), 5000 + Math.random() * 5000));
const cpu0 = cpuOf(server.pid);
const m0 = msgsIn;
const b0 = bytesIn;
const probe = setInterval(() => {
  if (bots[0].ws.readyState !== 1 || bots[0].mark) return;
  const rating = 1 + Math.floor(Math.random() * 99);
  bots[0].mark = { rating, at: Date.now() };
  bots[0].ws.send(JSON.stringify({ t: 'club', club: { name: 'Probe', phase: 1, level: 1, rating, open: true, guests: 0 } }));
}, 2500);
await sleep(SECONDS * 1000);
clearInterval(probe);
timers.forEach(clearInterval);
const s = await stats();
const cpu = (cpuOf(server.pid) - cpu0) / SECONDS;
const lat = latencies.sort((a, b) => a - b);
console.log('');
console.log(`players online       ${s.online}/${N}`);
console.log(`lots handed out      ${s.lots}`);
console.log(`messages to players  ${((msgsIn - m0) / SECONDS).toFixed(0)}/s  (${((bytesIn - b0) / SECONDS / 1024).toFixed(0)} KB/s total, ${((bytesIn - b0) / SECONDS / N).toFixed(0)} B/s per player)`);
console.log(`server memory        ${s.rssMB} MB`);
console.log(`server CPU           ${(cpu * 100).toFixed(0)}% of one core`);
console.log(`update latency       ${lat.length ? `median ${lat[Math.floor(lat.length / 2)]} ms, worst ${lat[lat.length - 1]} ms (${lat.length} probes)` : 'no probe arrived'}`);
const ok = s.online === N && seenCity === N && lat.length > 0;
console.log(ok ? '\nOK' : '\nPROBLEM');
bots.forEach((b) => b.ws.close());
server.kill('SIGTERM');
await sleep(200);
process.exit(ok ? 0 : 1);
