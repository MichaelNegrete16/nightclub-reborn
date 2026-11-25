// The shadow club: the server's own copy of a club's night. It runs the same guest simulation the game runs (core/guests.ts)
// from the club's saved layout, with no player at the door, and counts what such a club earns. The server compares that with
// what the player's game says it earned: a game can earn a bit more than the shadow (a better door, luck) but not several times
// more. Pure logic: the clock is the number of seconds it is stepped.

import type { ClubState } from './club.ts';
import { GuestSim } from './guests.ts';
import { GENRES, allTracks, type Genre } from './music.ts';
import { XP } from './progression.ts';

export const STEP = 0.5;

export class ShadowClub {
  readonly sim: GuestSim;
  /** coins (income only) and XP earned and seconds simulated, since the last `take` */
  coins = 0;
  xp = 0;
  seconds = 0;
  /** coins per minute earned while the club was open (kept after the shadow stops, to value time it did not run) */
  openRate = 0;
  private openSeconds = 0;
  private openCoins = 0;
  private carry = 0;
  private playing = false;
  private genres: Genre[] = [];
  private clock = 0;

  constructor(seed: number) {
    this.sim = new GuestSim(seed);
    this.sim.upkeepOn = true;
  }

  /** Make the shadow match a saved game (layout, doors, music). Cheap to call again and again. */
  sync(state: ClubState, rank = 1): void {
    this.sim.rankBoost = rank;
    this.sim.setLayout(state);
    if (this.sim.enabled !== state.open) this.sim.setOpen(state.open);
    // the shadow DJ is an ideal one: every minute it puts on the genre (from the player's own list) that most of the crowd loves
    this.playing = state.music.playing;
    this.genres = [...new Set(allTracks(state.music).map((t) => t.genre))];
    this.pick();
  }

  private pick(): void {
    if (!this.playing || !this.genres.length) return this.sim.setMusic(null);
    const inside = this.sim.guests.filter((g) => !g.leaving);
    const count = new Map<Genre, number>();
    for (const g of inside) count.set(g.taste, (count.get(g.taste) ?? 0) + 1);
    const top = GENRES.map((g) => g.id).filter((g) => this.genres.includes(g)).sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0)).slice(0, 2);
    this.sim.setMusic(top[Math.floor(this.clock / 60) % 2] ?? top[0] ?? null);
  }

  /** Run `seconds` of the night. `count` false is a warm-up: the crowd builds up but nothing is counted. */
  run(seconds: number, count = true): void {
    this.carry += seconds;
    while (this.carry >= STEP) {
      this.carry -= STEP;
      this.sim.update(STEP);
      this.clock += STEP;
      if (this.clock % 60 === 0) this.pick();
      // a star at the door: the shadow checks and lets the real ones in, like a careful doorman
      const g = this.sim.waitingVip;
      if (g) {
        if (!g.vip?.checked) this.sim.checkVip(g.id);
        if (g.vip?.real) this.sim.admitVip(g.id);
        else this.sim.rejectVip(g.id);
      }
      if (!count) continue;
      let gained = 0;
      for (const e of this.sim.events) {
        if (e.amount > 0) gained += e.amount;
        this.xp += e.kind === 'cover' ? XP.cover : e.kind === 'vip' ? XP.vip : e.kind === 'drink' ? XP.drink : e.kind === 'dance' ? XP.dance : e.kind === 'show' ? 1 : 0;
      }
      this.coins += gained;
      this.seconds += STEP;
      if (this.sim.enabled) {
        this.openSeconds += STEP;
        this.openCoins += gained;
        if (this.openSeconds >= 60) {
          this.openRate = this.openCoins / (this.openSeconds / 60);
          this.openSeconds = 0;
          this.openCoins = 0;
        }
      }
    }
  }

  /** What was counted since the last call, and start counting again. */
  take(): { coins: number; xp: number; seconds: number; rate: number } {
    const out = { coins: this.coins, xp: this.xp, seconds: this.seconds, rate: this.openRate };
    this.coins = 0;
    this.xp = 0;
    this.seconds = 0;
    return out;
  }
}
