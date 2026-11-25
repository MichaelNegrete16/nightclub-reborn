// What happens to the club's numbers when things happen. Shared by the game and by the economy simulator.

import { addXp, type ClubState } from './club.ts';
import type { GuestEvent } from './guests.ts';
import { XP } from './progression.ts';

/** Apply a batch of guest events: coins, XP and counters. Level-ups grow the building through addXp. */
export function applyEvents(state: ClubState, events: readonly GuestEvent[]): ClubState {
  if (events.length === 0) return state;
  let coins = 0;
  let xp = 0;
  let guests = 0;
  let drinks = 0;
  let dances = 0;
  let vips = 0;
  for (const e of events) {
    coins += e.amount;
    if (e.kind === 'cover') {
      xp += XP.cover;
      guests++;
    } else if (e.kind === 'vip') {
      xp += XP.vip;
      guests++;
      vips++;
    } else if (e.kind === 'show') {
      xp += 1; // the tips of the dancer: a little XP, no counter
    } else if (e.kind === 'fraud' || e.kind === 'wage' || e.kind === 'upkeep') {
      // only coins move
    } else if (e.kind === 'drink') {
      xp += XP.drink;
      drinks++;
    } else {
      xp += XP.dance;
      dances++;
    }
  }
  const next: ClubState = {
    ...state,
    coins: Math.max(0, state.coins + coins),
    stats: { ...state.stats, guests: state.stats.guests + guests, drinks: state.stats.drinks + drinks, dances: state.stats.dances + dances, vips: state.stats.vips + vips },
  };
  return addXp(next, xp);
}
