// The club while its owner is away. ONLY the running server pays for it: every minute that the server is up, a club whose owner
// is not playing (closed the game, or left the tab hidden) earns a share of its usual income, up to 8 hours per absence. If the
// server is off nothing is generated, and nothing is credited later for the time it was off. The player gets a letter ("income")
// when they come back, and the server's own copy of their game is credited at that moment.

import { OFFLINE_CAP_MIN, OFFLINE_EFFICIENCY } from '../web/src/core/offline.ts';
import { incomePerMinuteCap } from '../web/src/core/ledger.ts';
import { upkeepPerMinute } from '../web/src/core/renovation.ts';
import { wagePerMinute } from '../web/src/core/staff.ts';
import { SLACK } from '../web/src/core/ledger.ts';

/** What this club earns per minute, net, when nobody is there: what the game last measured, but never more than the server's own simulation allows. */
export function awayRate(state, shadowRate) {
  const stamped = Math.max(0, state.offline?.rate ?? 0);
  if (!state.open || stamped <= 0) return 0;
  const costs = wagePerMinute(state) + upkeepPerMinute(state);
  const bound = shadowRate > 0 ? (shadowRate - costs) * SLACK : incomePerMinuteCap(state, state) / 4;
  return Math.max(0, Math.min(stamped, bound));
}

/** One minute of the server's life: every absent club earns its share. `isAway(id)` says whether the owner is not playing. */
export function awayTick(world, saves, shadows, isAway) {
  let credited = 0;
  for (const [id, p] of world.players) {
    if (!isAway(id)) continue;
    const save = saves.read(id);
    if (!save) continue;
    const away = p.away ?? { coins: 0, minutes: 0 };
    if (away.minutes >= OFFLINE_CAP_MIN) {
      p.away = away;
      continue;
    }
    const rate = awayRate(save.state, shadows.rateOf(id));
    p.away = { coins: away.coins + rate * OFFLINE_EFFICIENCY, minutes: away.minutes + 1 };
    credited += rate * OFFLINE_EFFICIENCY;
  }
  return credited;
}

/** The owner is back: turn what accumulated into a letter and into the server's copy. Returns the coins paid (0 when nothing). */
export function settleAway(world, saves, id, deliver, now = Date.now()) {
  const p = world.players.get(id);
  const away = p?.away;
  if (!p || !away) return 0;
  const coins = Math.floor(away.coins);
  p.away = { coins: 0, minutes: 0 };
  if (coins < 1 || away.minutes < 5) return 0;
  saves.update(id, (s) => ({ ...s, coins: s.coins + coins }), now);
  deliver(id, { id: `a${now}-${p.n}`, at: now, kind: 'income', by: -1, byName: '', cash: coins, minutes: away.minutes, pieces: [] });
  return coins;
}
