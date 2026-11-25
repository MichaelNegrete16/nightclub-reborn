// Robberies, settled on the server. The thief asks to look at a club ("scout") and then to rob it ("attempt"); the server
// decides everything with the same pure rules the game uses (web/src/core/heist.ts), draws the dice itself, changes both
// players' records and sends each one a letter. The player's game only ever receives the outcome.

import { levelOf } from '../web/src/core/progression.ts';
import { tierOfItem } from '../web/src/core/club.ts';
import { BY_ID } from '../web/src/core/catalog.ts';
import {
  KIT_BY_ID, RULES, choreGoalFor, guardPrice, lockedUids, securityOfClub, addHeat, applyHeist, heatNow, isStealable, launderPrice, needsVan, pieceValue, resolveHeist, successChance, whyNot,
} from '../web/src/core/heist.ts';

const KITS = ['picks', 'jammer', 'van', 'disguise'];

/** What the server needs to know about one player to judge a robbery. */
function party(world, saves, id) {
  const p = world.players.get(id);
  const save = saves.read(id);
  if (!p || !save) return null;
  return { id, n: p.n, name: p.club.name, state: save.state, level: levelOf(save.state.xp).level, crime: p.crime, face: p.club };
}

function securityOf(v) {
  return securityOfClub(v.state.items, v.state.staff.guard, v.face.open && v.face.guests >= 10);
}

/** The pieces of a club as the rules see them: the ones behind a safe or an armoured vitrine are marked locked. */
function piecesOf(v, sec) {
  const all = v.state.items.map((i) => ({ uid: i.uid, id: i.id, tier: tierOfItem(i) })).filter((p) => BY_ID.has(p.id));
  const locked = lockedUids(all, sec.locks);
  return all.map((p) => ({ ...p, locked: locked.has(p.uid) }));
}

const cashHint = (c) => (c < 5_000 ? 'poca' : c < 100_000 ? 'media' : 'mucha');

/** A look at a club before robbing it: what guards it, what could be taken, and whether the rules allow it now. */
export function scout(world, saves, thiefId, targetN, now = Date.now()) {
  const thief = party(world, saves, thiefId);
  const victimId = world.byN.get(targetN);
  const victim = victimId ? party(world, saves, victimId) : null;
  if (!thief) return { ok: false, error: 'Tu partida todavía no está en el servidor: espera un momento y vuelve a intentarlo.' };
  if (!victim) return { ok: false, error: 'Ese club no se puede asaltar todavía.' };
  const sec = securityOf(victim);
  const pieces = piecesOf(victim, sec)
    .map((p) => ({ ...p, steal: isStealable(p), heavy: needsVan(p), value: pieceValue(p) }))
    .filter((p) => p.steal)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const no = whyNot({ n: thief.n, level: thief.level, crime: thief.crime }, { n: victim.n, level: victim.level, crime: victim.crime }, now);
  const kits = thief.state.kits;
  return {
    ok: true,
    target: { n: victim.n, name: victim.name, level: victim.level, open: victim.face.open, guests: victim.face.guests, guards: sec.guards, alarm: sec.alarm, crowded: sec.crowded, cash: cashHint(victim.state.coins), pieces },
    denied: no,
    kits,
    heat: Math.round(heatNow(thief.crime, now)),
    // the odds with nothing and with every kit (the player sees how much the kits help)
    odds: { bare: successChance([], sec), kitted: successChance(['picks', 'jammer'], sec) },
  };
}

/**
 * Try the robbery. `rng` draws a number in [0, 1) and `idGen` makes ids (both injectable for tests).
 * Returns { ok, result } and delivers the letters through `deliver(id, letter)`.
 */
export function attempt(world, saves, thiefId, targetN, req, deliver, now = Date.now(), rng = Math.random) {
  const thief = party(world, saves, thiefId);
  const victimId = world.byN.get(targetN);
  const victim = victimId ? party(world, saves, victimId) : null;
  if (!thief) return { ok: false, error: 'Tu partida todavía no está en el servidor.' };
  if (!victim) return { ok: false, error: 'Ese club no se puede asaltar todavía.' };
  const kits = (Array.isArray(req.kits) ? req.kits : []).filter((k, i, a) => KITS.includes(k) && a.indexOf(k) === i);
  // you can only bring what you own (the server's copy of your bag decides)
  for (const k of kits) if ((thief.state.kits[k] ?? 0) < 1) return { ok: false, error: `No tienes ${KIT_BY_ID.get(k).name}.` };
  const sec = securityOf(victim);
  const skill = Math.min(0.8, Math.max(0.3, Number(req.skill) || 0.5)); // the short game is not checked yet: its effect is capped
  const pieces = piecesOf(victim, sec);
  const out = resolveHeist({ n: thief.n, level: thief.level, crime: thief.crime }, { n: victim.n, level: victim.level, crime: victim.crime }, victim.state.coins, pieces, typeof req.want === 'string' ? req.want : null, kits, sec, skill, rng(), now);
  if (out.kind === 'denied') return { ok: true, result: { kind: 'denied', reason: out.reason, until: out.until } };

  // the kits that are used up go whatever happens
  const used = kits.filter((k) => KIT_BY_ID.get(k).consumed);
  const effects = applyHeist({ n: thief.n, level: thief.level, crime: thief.crime }, { n: victim.n, level: victim.level, crime: victim.crime }, out, now);
  let thiefCrime = effects.thief;
  // a disguise halves the heat that a caught thief gets
  if (out.kind === 'fail' && kits.includes('disguise')) thiefCrime = { ...thiefCrime, heat: Math.round(heatNow(thief.crime, now) + RULES.heatPerFail / 2), heatAt: now };
  // the alarm rings: the police hear about it unless the jammer cut it
  if (sec.alarm && !kits.includes('jammer')) thiefCrime = addHeat(thiefCrime, 10, now);
  // robbing ends the thief's own anti-theft protector (it is for the ones who are robbed, not for the ones who rob)
  thiefCrime = { ...thiefCrime, guardUntil: 0 };
  // caught in the act: prison. The thief leaves it by doing chores (20, or 30 for a hard target: an alarm or a heavy piece); their
  // own club stays shut while they are inside, and they pay a fine. After 6 hours they are let out anyway.
  let jail = null;
  if (out.kind === 'fail') {
    const wanted = pieces.find((p) => p.uid === req.want);
    const hard = sec.alarm || (!!wanted && needsVan(wanted));
    const goal = choreGoalFor(hard);
    thiefCrime = { ...thiefCrime, closedUntil: thiefCrime.detainedUntil, chores: 0, choreGoal: goal, lastChoreAt: 0 };
    const cash = saves.read(thief.id)?.state.coins ?? 0;
    jail = { goal, fine: Math.floor(cash * RULES.fineShare), until: thiefCrime.detainedUntil, victim: victim.name };
  }
  world.setCrime(thief.id, thiefCrime);
  world.setCrime(victim.id, effects.victim);

  const loot = out.kind === 'fail' ? { cash: 0, pieces: [] } : out.loot;
  const letterId = `h${now}-${thief.n}-${victim.n}`;
  const hotUntil = now + RULES.coolOff;
  // the victim: the cash and the piece are gone from the server's copy right now, and the letter says so
  if (loot.cash || loot.pieces.length) {
    const gone = new Set(loot.pieces.map((p) => p.uid));
    saves.update(victim.id, (s) => ({ ...s, coins: Math.max(0, s.coins - loot.cash), items: s.items.filter((i) => !gone.has(i.uid)) }), now);
    deliver(victim.id, { id: `${letterId}-r`, at: now, kind: 'robbed', by: thief.n, byName: thief.name, cash: loot.cash, pieces: loot.pieces.map((p) => ({ uid: p.uid, id: p.id, tier: p.tier })) });
  }
  // the thief: the cash, the hot piece (with a new id of its own) and the kits spent
  const mine = loot.pieces.map((p, i) => ({ uid: `${letterId}-${i}`, id: p.id, tier: p.tier, hotUntil }));
  saves.update(thief.id, (s) => ({ ...s, coins: s.coins + loot.cash, loot: [...s.loot, ...mine.map((m) => ({ ...m, from: victim.n }))], kits: Object.fromEntries(Object.entries(s.kits).map(([k, v]) => [k, used.includes(k) ? Math.max(0, v - 1) : v])) }), now);
  deliver(thief.id, { id: `${letterId}-t`, at: now, kind: 'loot', by: victim.n, byName: victim.name, cash: loot.cash, pieces: mine, kitsUsed: used });

  if (jail) {
    saves.update(thief.id, (st) => ({ ...st, coins: Math.max(0, st.coins - jail.fine), open: false }), now);
    // the letter carries the whole story, for the arrest scene: who was robbed, which piece they went for, and with what
    const wanted = pieces.find((p) => p.uid === req.want);
    deliver(thief.id, { id: `${letterId}-j`, at: now, kind: 'jail', story: 'caught', chores: jail.goal, by: victim.n, byName: victim.name, cash: jail.fine, stolenCash: 0, closedUntil: jail.until, kitsUsed: kits, pieces: wanted ? [{ uid: wanted.uid, id: wanted.id, tier: wanted.tier }] : [] });
    world.players.get(thief.id).jailVictim = victim.name;
  }
  return { ok: true, result: { kind: out.kind, jail, cash: loot.cash, pieces: mine.map((m) => ({ id: m.id, tier: m.tier })), victim: victim.name, heat: Math.round(heatNow(thiefCrime, now)), detainedUntil: thiefCrime.detainedUntil } };
}

/** Pay the receiver to clean a stolen piece (the server's copy of the bag decides what it costs). */
export function launder(saves, id, uid, now = Date.now()) {
  const save = saves.read(id);
  const inBag = save?.state.loot.find((l) => l.uid === uid);
  const onShow = save?.state.items.find((i) => i.uid === uid && (i.hot ?? 0) > now);
  const piece = inBag ?? (onShow ? { id: onShow.id, tier: onShow.tier ?? 1 } : null);
  if (!piece) return { ok: false, error: 'Esa pieza no está en tu bolsa ni en tu club.' };
  const price = launderPrice({ uid, id: piece.id, tier: piece.tier });
  if (save.state.coins < price) return { ok: false, error: 'No te alcanzan las monedas.' };
  saves.update(id, (s) => ({ ...s, coins: s.coins - price, loot: s.loot.map((l) => (l.uid === uid ? { ...l, hotUntil: 0 } : l)), items: s.items.map((i) => (i.uid === uid ? { ...i, hot: undefined } : i)) }), now);
  return { ok: true, price };
}

/** Buy the anti-theft protector: for 2, 6, 12 or 24 hours nobody can rob this club. Paid from the server's copy; the player gets a letter. */
export function buyGuard(world, saves, id, hours, deliver, now = Date.now()) {
  if (!RULES.guardHours.includes(hours)) return { ok: false, error: 'Ese protector no existe.' };
  const p = world.players.get(id);
  const save = saves.read(id);
  if (!p || !save) return { ok: false, error: 'Tu partida todavía no está en el servidor: espera un momento.' };
  const level = levelOf(save.state.xp).level;
  const price = guardPrice(level, hours);
  const have = Math.max(p.crime.guardUntil ?? 0, now);
  if (have + hours * 3_600_000 > now + RULES.guardMaxHours * 3_600_000) return { ok: false, error: `Ya estás protegido: el protector no pasa de ${RULES.guardMaxHours} horas seguidas.` };
  if (save.state.coins < price) return { ok: false, error: 'No te alcanzan las monedas.' };
  const until = have + hours * 3_600_000;
  world.setCrime(id, { ...p.crime, guardUntil: until });
  saves.update(id, (s) => ({ ...s, coins: s.coins - price }), now);
  deliver(id, { id: `g${now}-${p.n}`, at: now, kind: 'fee', by: -1, byName: `Protector antirrobos ${hours} h`, cash: price, pieces: [] });
  return { ok: true, price, until };
}

/**
 * One chore done in prison (cleaning the toilets, mopping...). The server counts at most one every few seconds, so a modified game
 * cannot skip the sentence; the last chore opens the door: the prison ends and the club can open again.
 */
export function doChore(world, id, now = Date.now()) {
  const p = world.players.get(id);
  if (!p) return { ok: false, error: 'Jugador desconocido.' };
  const c = p.crime;
  if (!(c.detainedUntil > now)) return { ok: false, error: 'No estás en prisión.' };
  const goal = c.choreGoal || RULES.choreGoalSoft;
  if (c.lastChoreAt && now - c.lastChoreAt < RULES.choreGapMs) return { ok: false, error: 'Vas muy rápido: el guardia está mirando.', done: c.chores, goal };
  const done = c.chores + 1;
  if (done >= goal) {
    world.setCrime(id, { ...c, detainedUntil: 0, closedUntil: 0, chores: 0, choreGoal: 0, lastChoreAt: 0 });
    p.jailVictim = '';
    return { ok: true, done: goal, goal, released: true };
  }
  world.setCrime(id, { ...c, chores: done, choreGoal: goal, lastChoreAt: now });
  return { ok: true, done, goal, released: false };
}

/**
 * Undo a prison that should not have been (only the ones who fail are caught; a robbery nobody saw is not punished): the prison and the
 * closure end, the fine is given back as a letter, and the letters about it that were never read are withdrawn.
 */
export function pardon(world, saves, n, deliver, now = Date.now()) {
  const id = world.byN.get(n);
  const p = id && world.players.get(id);
  const save = id && saves.read(id);
  if (!p || !save) return { ok: false, error: 'No existe ese club.' };
  const retro = (r) => r.kind === 'jail' && String(r.id).startsWith('c');
  const fine = save.state.reports.filter(retro).reduce((a, r) => a + r.cash, 0) || p.mail.filter((m) => m.kind === 'jail' && m.id.startsWith('c')).reduce((a, m) => a + m.cash, 0);
  p.mail = p.mail.filter((m) => !(m.kind === 'jail' && m.id.startsWith('c')));
  world.setCrime(id, { ...p.crime, detainedUntil: 0, closedUntil: 0, chores: 0, choreGoal: 0, lastChoreAt: 0 });
  p.jailVictim = '';
  saves.update(id, (s) => ({ ...s, coins: s.coins + fine, reports: s.reports.filter((r) => !retro(r)) }), now);
  if (fine) deliver(id, { id: `p${now}-${p.n}`, at: now, kind: 'refund', by: -1, byName: 'Nadie te vio: te devolvemos la multa', cash: fine, pieces: [] });
  return { ok: true, name: p.club.name, refunded: fine };
}

/** Put a player back in prison until a given moment (the owner fixing a record: the sentence of a robbery that really failed). */
export function detain(world, n, until, now = Date.now()) {
  const id = world.byN.get(n);
  const p = id && world.players.get(id);
  if (!p || !(until > now)) return { ok: false, error: 'Club o fecha no válidos.' };
  world.setCrime(id, { ...p.crime, detainedUntil: until, closedUntil: until, chores: 0, choreGoal: RULES.choreGoalSoft, lastChoreAt: 0 });
  return { ok: true, name: p.club.name, until };
}
