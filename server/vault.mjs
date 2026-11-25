// The server's view of a player's club: whether what they upload is believable, what a thief could take (the "vault"), and
// how losses from robberies are kept even if the player's game does not apply them.

import { BY_ID } from '../web/src/core/catalog.ts';
import { levelOf } from '../web/src/core/progression.ts';
import { TIER_LEVEL } from '../web/src/core/tiers.ts';
import { applyMail } from '../web/src/core/mail.ts';
import { tierOfItem } from '../web/src/core/club.ts';
import { allowance, wealthOf } from '../web/src/core/ledger.ts';

/** Generous limits: a real player never gets near them, so honest games are never touched. */
/** The ledger's allowance is already a few times the honest income; this is the margin on top before anything is clamped. */
export const TOLERANCE = 1.5;

export const CAPS = {
  /** most coins a game can gain per minute, plus a flat allowance for one-off gains (mission rewards, selling a big piece) */
  coinsPerMin: 8000,
  coinsFlat: 8_000_000,
  xpPerMin: 800,
  xpFlat: 60_000,
  /** a game that appears for the first time (an existing player joining) may already be big, but not absurd */
  firstCoins: 2_000_000_000,
  firstXp: 50_000_000,
};

/**
 * Check an uploaded game against the stored one. The result is what the server KEEPS (the player's own game is never
 * changed by this): impossible gains are clamped and reported in `flags`.
 */
export function validate(prev, state, elapsedMs, measured = null) {
  const flags = [];
  const out = { ...state };
  const min = Math.max(0, elapsedMs) / 60_000;
  if (prev) {
    // the ledger: the club's wealth can only grow by what it could have earned in this time (and by finished missions)
    const allow = allowance(prev, state, min, measured ?? undefined);
    const gained = wealthOf(state) - wealthOf(prev);
    const excess = gained - allow.coins * (measured && (measured.seconds > 0 || measured.rate > 0) ? 1 : TOLERANCE);
    if (excess > 0) {
      // take the excess out of the cash (never below the stored amount minus nothing: the club keeps what it had)
      out.coins = Math.max(Math.min(prev.coins, state.coins), Math.floor(state.coins - excess));
      flags.push('coins');
    }
    const xpCap = prev.xp + allow.xp * (measured && (measured.seconds > 0 || measured.rate > 0) ? 1 : TOLERANCE);
    if (state.xp > xpCap) {
      out.xp = Math.floor(xpCap);
      flags.push('xp');
    }
    if (allow.bogus.length) flags.push('missions');
  } else {
    if (state.coins > CAPS.firstCoins) {
      out.coins = CAPS.firstCoins;
      flags.push('coins');
    }
    if (state.xp > CAPS.firstXp) {
      out.xp = CAPS.firstXp;
      flags.push('xp');
    }
  }
  // a version of a piece needs the level that opens it
  const level = levelOf(out.xp).level;
  let lowered = false;
  out.items = out.items.map((it) => {
    const t = tierOfItem(it);
    let allowed = 1;
    for (let k = 2; k <= 4; k++) if (level >= TIER_LEVEL[k - 1]) allowed = k;
    if (t > allowed) {
      lowered = true;
      return { ...it, tier: allowed > 1 ? allowed : undefined };
    }
    return it;
  });
  if (lowered) flags.push('tier');
  // the same piece cannot appear twice
  const seen = new Set();
  const unique = out.items.filter((i) => (seen.has(i.uid) ? false : (seen.add(i.uid), true)));
  if (unique.length !== out.items.length) {
    out.items = unique;
    flags.push('duplicates');
  }
  return { state: out, flags };
}

/** What a thief could take from this club, and how well it is guarded. */
export function vaultOf(state, crowded = false) {
  return {
    cash: state.coins,
    pieces: state.items.map((i) => ({ uid: i.uid, id: i.id, tier: tierOfItem(i) })).filter((p) => BY_ID.has(p.id)),
    security: { guards: state.staff.guard, alarm: false, crowded, locks: 0 },
  };
}

/** The losses of letters the player has not confirmed yet are taken out of whatever they upload. */
export function reconcile(state, pendingMail) {
  return applyMail(state, pendingMail);
}
