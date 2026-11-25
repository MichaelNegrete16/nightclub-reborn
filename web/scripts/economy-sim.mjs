// Economy simulator: a bot plays the real game rules (guests, income, XP, shop, placement) for a long time and we
// read off how many ACTIVE minutes each level takes. Usage:
//   node --experimental-strip-types scripts/economy-sim.mjs [maxMinutes] [A] [B]
import { newClub, buyItem, placeItem, statsOf, levelNow, owned, phaseOf, doorCells } from '../src/core/club.ts';
import { CATALOG } from '../src/core/catalog.ts';
import { GuestSim } from '../src/core/guests.ts';
import { applyEvents } from '../src/core/game.ts';
import { PHASE_LEVELS, levelOf, setCurve } from '../src/core/progression.ts';
import { UPGRADES, buyUpgrade } from '../src/core/exterior.ts';
import { STAFF, hireStaff, wagePerMinute } from '../src/core/staff.ts';
import { GENRES } from '../src/core/music.ts';
import { buyRenovation } from '../src/core/renovation.ts';
import { buyExpansion, nextExpansion } from '../src/core/expansion.ts';
import { upgradeItem } from '../src/core/club.ts';
import { upgradeCost } from '../src/core/tiers.ts';
import { VIP_CHECK_COST } from '../src/core/guests.ts';
import { allowance, wealthOf } from '../src/core/ledger.ts';
import { ShadowClub } from '../src/core/shadow.ts';
import { validate } from '../../server/vault.mjs';
import { sanitizeClub } from '../src/core/club.ts';

const maxMinutes = Number(process.argv[2] ?? 6000);
/** MUSIC=0 plays without the music system (the old model); by default the bot plays like a real player */
const WITH_MUSIC = process.env.MUSIC !== '0';
if (process.argv[3]) setCurve(Number(process.argv[3]), Number(process.argv[4]));

// goal for the "regular" player (45 active min/day), in days, from docs/WORLD_AND_DECOR.md section 8.2
const TARGET_DAYS = { 6: 3, 13: 17, 23: 59, 36: 150, 51: 298, 71: 559 };
const PROFILES = { casual: 27, regular: 45, intenso: 120 }; // active minutes per day

function tryPlace(state, id, cells) {
  const def = CATALOG.find((d) => d.id === id);
  for (const [x, y] of cells) {
    for (const rot of def.w === def.d ? [0] : [0, 1]) {
      const r = placeItem(state, id, x, y, rot, 'buy');
      if (!r.error) return r.state;
    }
  }
  return null;
}

function roomCells(state, order) {
  const p = phaseOf(state);
  const cells = [];
  for (let y = 0; y < p.h - 1; y++) for (let x = 0; x < p.w; x++) cells.push([x, y]);
  const cx = p.w / 2, cy = p.h / 2;
  if (order === 'center') cells.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
  if (order === 'topleft') cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  if (order === 'topright') cells.sort((a, b) => a[1] - b[1] || b[0] - a[0]);
  if (order === 'bottom') cells.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return cells;
}

/** One shopping trip. Returns the new state (bot spends like a sensible player, cheapest useful things first). */
function shop(state) {
  const lvl = levelNow(state);
  const placed = (id) => state.items.filter((i) => i.id === id).length;
  // gifts from the story: place the uncle's booth
  if (owned(state, 'dj_booth') > 0 && placed('dj_booth') === 0) {
    const r = tryPlace(state, 'dj_booth', roomCells(state, 'topright'));
    if (r) state = r;
  }
  for (let round = 0; round < 8; round++) {
    const st = statsOf(state);
    const phase = phaseOf(state);
    const bars = placed('bar_straight');
    const tiles = placed('floor_cyan') + placed('floor_pink') + placed('floor_violet');
    const maxTiles = Math.floor(phase.w * phase.h * 0.4);
    // a real player saves up for the bar (the tutorial makes sure of it); the bot does too instead of spending on cheap things
    const barDef = CATALOG.find((d) => d.id === 'bar_straight');
    const needBar = bars < 1 + Math.floor(st.capacity / 28) && barDef.unlockLevel <= lvl;
    if (needBar && state.coins < barDef.price) break;
    // once the level opens the next expansion, a real player saves for it instead of buying more furniture
    const exNext = nextExpansion(state);
    const reserve = exNext && lvl >= exNext.unlockLevel ? exNext.price : 0;
    const candidates = [];
    for (const def of CATALOG) {
      if (needBar && def.id !== 'bar_straight') continue;
      if (reserve && state.coins - def.price < reserve) continue; // saving for the works
      if (def.unlockLevel > lvl || state.coins < def.price) continue;
      if (def.id === 'dj_booth') continue;
      let gain = def.luxury * 0.6;
      if (def.layer === 'floor') {
        if (tiles >= maxTiles) continue;
        gain += 12;
      } else if (def.id === 'bar_straight') {
        if (bars >= 1 + Math.floor(st.capacity / 28)) continue;
        gain += 40;
      } else if (def.id === 'stool') {
        if (placed('stool') >= bars * 3) continue;
        gain += 14;
      } else if (def.seats) {
        gain += 10 * def.seats;
      }
      candidates.push({ def, value: gain / def.price });
    }
    candidates.sort((a, b) => b.value - a.value);
    let bought = false;
    for (const { def } of candidates) {
      let order = def.layer === 'floor' ? 'center' : def.category === 'decor' || def.category === 'trophies' ? 'bottom' : 'topleft';
      let cells = roomCells(state, order);
      if (def.id === 'stool') {
        cells = state.items.filter((i) => i.id === 'bar_straight').flatMap((b) => [0, 1, 2].map((dx) => [b.x + dx, b.y + 1]));
      }
      if (def.id === 'bar_straight') cells = roomCells(state, 'topleft').filter(([, y]) => y === 0);
      const next = tryPlace(state, def.id, cells);
      if (next) {
        state = next;
        bought = true;
        break;
      }
    }
    if (!bought) break;
  }
  return state;
}

/** The bot's side of running the club: pick music for the crowd, hire staff, upgrade the facade, deal with VIPs. */
function manage(state, sim, minute, log) {
  if (!WITH_MUSIC) return state;
  // music: alternate between the two genres most of the crowd loves, a minute each
  const inside = sim.guests.filter((g) => !g.leaving);
  const count = Object.fromEntries(GENRES.map((g) => [g.id, 0]));
  for (const g of inside) count[g.taste]++;
  const top = GENRES.map((g) => g.id).sort((a, b) => count[b] - count[a]).slice(0, 2);
  sim.setMusic(top[minute % 2] ?? 'reggaeton');
  // staff, as soon as it is affordable (twice the hiring fee in the bank)
  for (const d of STAFF) {
    if (state.coins >= d.hire * 2) {
      const r = hireStaff(state, d.role);
      if (!r.error) { state = r.state; log.hired[d.role] = (log.hired[d.role] ?? minute); }
    }
  }
  // improve equipment: the lowest version first, when there is twice the cost in the bank (and the works are not being saved for)
  const ex0 = nextExpansion(state);
  const saving = ex0 && levelNow(state) >= ex0.unlockLevel;
  if (!saving) {
    const cand = [...state.items].sort((x, y) => (x.tier ?? 1) - (y.tier ?? 1));
    for (const it of cand) {
      const def = CATALOG.find((d) => d.id === it.id);
      const tier = it.tier ?? 1;
      if (tier >= 4 || state.coins < 2 * upgradeCost(def.price, tier)) continue;
      const r = upgradeItem(state, it.uid);
      if (!r.error) { state = r.state; log.upgrades++; break; }
    }
  }
  // the works that grow the building, as soon as the level opens them and there is 1.3 times the price in the bank
  const ex = nextExpansion(state);
  if (ex && state.coins >= ex.price * 1.3) { const r = buyExpansion(state); if (!r.error) { state = r.state; log.expand.push(minute); } }
  // renovations, when there is twice the price in the bank
  const nr = buyRenovation({ ...state, coins: 1e12 });
  if (!nr.error) {
    const price = 1e12 - nr.state.coins;
    if (state.coins >= 2 * price) { const r = buyRenovation(state); if (!r.error) { state = r.state; log.reno++; } }
  }
  // facade upgrades
  for (const u of UPGRADES) {
    if (u.price > 0 && state.coins >= u.price * 2) {
      const r = buyUpgrade(state, u.id);
      if (!r.error) { state = r.state; log.facade++; }
    }
  }
  return state;
}

/** A VIP at the door: investigate (costs coins) and let in only the real ones. */
function door(state, sim, log) {
  const g = sim.waitingVip;
  if (!g) return state;
  if (!g.vip.checked && state.coins >= VIP_CHECK_COST) {
    state = { ...state, coins: state.coins - VIP_CHECK_COST };
    sim.checkVip(g.id);
  }
  if (g.vip.checked) {
    if (g.vip.real) { sim.admitVip(g.id); log.vip++; } else { sim.rejectVip(g.id); log.fake++; }
  } else sim.rejectVip(g.id);
  return state;
}

function run(minutes, seed) {
  let state = newClub();
  const sim = new GuestSim(seed);
  sim.upkeepOn = WITH_MUSIC;
  state = shop(state);
  sim.setLayout(state);
  const reached = {};
  const log = { upgrades: 0, expand: [], hired: {}, reno: 0, upkeep: 0, facade: 0, vip: 0, fake: 0, income: 0, wages: 0, kinds: {} };
  const dt = 0.5;
  const steps = Math.round(60 / dt);
  let lastPhase = state.phase;
  const incomeAt = []; let lastLv = 0; const rateAt = log.rateAt = {};
  // UPLOAD_EVERY=n: the server's ledger judges the game every n minutes, as if it were uploaded; we keep the worst ratio
  const EVERY = Number(process.env.UPLOAD_EVERY ?? 0);
  let uploaded = EVERY ? sanitizeClub(JSON.parse(JSON.stringify(state))) : null;
  log.ledger = { worstCoins: 0, worstXp: 0, flagged: 0, checks: 0, worstShadowCoins: 0, worstShadowXp: 0 };
  // the server's shadow club, with its own seed and its own ideal DJ (the bot's state has no playing music: say it plays)
  const shadow = new ShadowClub(4242);
  const asPlaying = (st) => ({ ...st, open: true, music: { ...st.music, playing: true } });
  shadow.sync(asPlaying(state));
  shadow.run(240, false);
  for (let m = 1; m <= minutes; m++) {
    state = manage(state, sim, m, log);
    for (let i = 0; i < steps; i++) {
      sim.update(dt);
      if (WITH_MUSIC && i % 10 === 0) state = door(state, sim, log);
      for (const e of sim.events) { if (e.kind === "upkeep") log.upkeep += -e.amount; else if (e.kind === "wage") log.wages += -e.amount; else if (e.amount > 0) { log.income += e.amount; log.kinds[e.kind] = (log.kinds[e.kind] ?? 0) + e.amount; } }
      if (sim.events.length) state = applyEvents(state, sim.events);
    }
    incomeAt[m] = log.income;
    const lv = levelOf(state.xp).level;
    if (lv !== lastLv) { lastLv = lv; if (m > 60) rateAt[lv] = Math.round((incomeAt[m] - incomeAt[m - 60]) / 60); }
    for (const t of Object.keys(TARGET_DAYS)) if (lv >= Number(t) && reached[t] === undefined) reached[t] = m;
    if (m % 6 === 0 || state.phase !== lastPhase || m % 6 === 1) {
      if (m % 6 === 0 || state.phase !== lastPhase) state = shop(state);
      lastPhase = state.phase;
      sim.setLayout(state);
    }
    if (m % 6 === 0) shadow.sync(asPlaying(state)); // like a real upload, not every minute
    shadow.run(60);
    if (EVERY && m % EVERY === 0) {
      const now = sanitizeClub(JSON.parse(JSON.stringify(state)));
      const a = allowance(uploaded, now, EVERY);
      log.ledger.worstCoins = Math.max(log.ledger.worstCoins, (wealthOf(now) - wealthOf(uploaded)) / a.coins);
      log.ledger.worstXp = Math.max(log.ledger.worstXp, (now.xp - uploaded.xp) / a.xp);
      const meas = shadow.take();
      const b = allowance(uploaded, now, EVERY, meas);
      log.ledger.worstShadowCoins = Math.max(log.ledger.worstShadowCoins, (wealthOf(now) - wealthOf(uploaded)) / b.coins);
      log.ledger.worstShadowXp = Math.max(log.ledger.worstShadowXp, (now.xp - uploaded.xp) / b.xp);
      log.ledger.checks++;
      if (validate(uploaded, now, EVERY * 60000).flags.some((f) => f === 'coins' || f === 'xp')) log.ledger.flagged++;
      uploaded = now;
    }
    if (reached[71] !== undefined) break;
    if (m % 1000 === 0) process.stderr.write(`  ... ${m} min, level ${lv}, coins ${state.coins}, capacity ${statsOf(state).capacity}, rating ${Math.round(sim.rating)}, income ${Math.round(log.income / m)}/min, wages ${Math.round(log.wages / m)}/min, upkeep ${Math.round(log.upkeep / m)}/min, renovations ${log.reno}\n`);
  }
  return { reached, state, log };
}

const { reached, state, log } = run(maxMinutes, 7);
if (process.env.DEBUG_ITEMS) console.log(JSON.stringify(state.items.reduce((a, i) => ((a[i.id] = (a[i.id] ?? 0) + 1), a), {})));
if (process.env.UPLOAD_EVERY) console.log('LEDGER (1.0 = the whole allowance; clamped only above 1.5):', JSON.stringify(log.ledger));
console.log('income per minute (last hour) when each level was reached:', JSON.stringify(log.rateAt));
console.log('income by kind per minute:', JSON.stringify(Object.fromEntries(Object.entries(log.kinds).map(([k, v]) => [k, Math.round(v / maxMinutes)]))));
console.log(`price scale ${process.env.NC_PRICE_SCALE ?? 'default'} | expansions bought at minute ${JSON.stringify(log.expand)} | upgrades bought ${log.upgrades}`);
console.log(`music ${WITH_MUSIC ? 'ON' : 'off'} | staff hired at minute ${JSON.stringify(log.hired)} | facade upgrades ${log.facade} | stars admitted ${log.vip}, impostors turned away ${log.fake}`);
console.log(`\nbot played up to ${maxMinutes} active minutes; final level ${levelOf(state.xp).level}, coins ${state.coins}, capacity ${statsOf(state).capacity}, objects ${statsOf(state).objects}`);
console.log('level | target (regular, days) | bot: active min | days @ casual / regular / intenso');
for (const lv of PHASE_LEVELS.slice(1)) {
  const m = reached[lv];
  const f = (p) => (m === undefined ? '  -' : (m / PROFILES[p]).toFixed(1));
  console.log(`${String(lv).padStart(5)} | ${String(TARGET_DAYS[lv]).padStart(22)} | ${m === undefined ? 'not reached'.padStart(15) : String(m).padStart(15)} | ${f('casual')} / ${f('regular')} / ${f('intenso')}`);
}
