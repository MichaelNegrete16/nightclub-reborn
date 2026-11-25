// The Brigada del Ruido, on the server. Every minute it looks at every club (offline ones too): hot pieces on show raise the
// owner's heat by the hour, and when the heat is high enough the police pay a visit (how often depends on the heat) and do
// what `policeAction` says: a fine, seized pieces, the club shut. Each visit is a letter ('police') the game applies.

import { patrolEveryHours, policeAction, heatNow, addHeat, choreGoalFor } from '../web/src/core/heist.ts';
import { hotHeatPerHour, isHot } from '../web/src/core/kits.ts';

const H = 3_600_000;

/** One pass over every player. Returns the visits made (for logs and tests). */
export function patrolTick(world, saves, deliver, now = Date.now()) {
  const visits = [];
  for (const [id, p] of world.players) {
    const save = saves.read(id);
    if (!save) continue;
    let crime = p.crime;
    // 1. hot pieces on show make the heat grow, by the hour (at most a day's worth at a time)
    if (crime.policeAt) {
      const dt = Math.min(24 * H, now - crime.policeAt);
      const rate = hotHeatPerHour(save.state.items, now);
      if (dt > 0 && rate > 0) crime = addHeat(crime, rate * (dt / H), now);
    }
    crime = { ...crime, policeAt: now };
    // 2. the visit
    const heat = heatNow(crime, now);
    const every = patrolEveryHours(heat);
    const hotShown = save.state.items.filter((i) => isHot(i.hot ?? 0, now));
    const hotBag = save.state.loot.filter((l) => isHot(l.hotUntil, now));
    if (every > 0 && now - (crime.patrolAt || 0) >= every * H && !(crime.closedUntil > now)) {
      const open = !!save.state.open || p.club.open;
      const act = policeAction(heat, hotShown.length + hotBag.length, open);
      const acts = act.fineShare > 0 || act.closeHours > 0 || act.seize;
      crime = { ...crime, patrolAt: now };
      if (acts) {
        // a patrol only looks at what is on show; a raid also searches the bag
        const seized = act.seize ? [...hotShown, ...(act.level === 'raid' ? hotBag : [])] : [];
        const fine = Math.floor(save.state.coins * act.fineShare);
        const closedUntil = act.closeHours ? now + act.closeHours * H : 0;
        if (closedUntil) crime = { ...crime, closedUntil };
        // stolen goods found while the club is being shut: this is an arrest. The owner goes to prison (chores to get out) for
        // as long as the club stays shut, like a thief caught in the act
        const arrest = !!closedUntil && seized.length > 0;
        const goal = arrest ? choreGoalFor(false) : 0;
        if (arrest) crime = { ...crime, detainedUntil: closedUntil, chores: 0, choreGoal: goal, lastChoreAt: 0 };
        // the visit takes its toll on the heat too: a raid starts the club from scratch
        if (act.level === 'raid') crime = { ...crime, heat: Math.min(heatNow(crime, now), 40), heatAt: now };
        const gone = new Set(seized.map((x) => x.uid));
        saves.update(id, (s) => ({ ...s, coins: Math.max(0, s.coins - fine), items: s.items.filter((i) => !gone.has(i.uid)), loot: s.loot.filter((l) => !gone.has(l.uid)), open: closedUntil ? false : s.open }), now);
        deliver(id, { id: `p${now}-${p.n}`, at: now, kind: 'police', by: 0, byName: 'Brigada del Ruido', cash: fine, closedUntil: closedUntil || undefined, ...(arrest ? { story: 'raid', chores: goal } : {}), pieces: seized.slice(0, 5).map((x) => ({ uid: x.uid, id: x.id, tier: x.tier ?? 1 })) });
        visits.push({ n: p.n, level: act.level, fine, seized: seized.length, closedUntil });
      }
    }
    world.setCrime(id, crime);
  }
  return visits;
}
