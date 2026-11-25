// Income while the player is away: the club keeps working, but less efficiently and only for a while, so it rewards
// coming back without making it pointless to play. Pure logic (the clock is passed in).

import type { ClubState } from './club.ts';

/** Net coins per minute the open club was earning when the player left, and when that was. */
export interface OfflineInfo {
  rate: number;
  /** timestamp in ms of the last time the game was running */
  at: number;
}

/** An unattended club earns this share of what it earns when you run it. */
export const OFFLINE_EFFICIENCY = 0.35;
/** ...for at most this many minutes (8 hours). */
export const OFFLINE_CAP_MIN = 480;
/** Absences shorter than this do not count. */
export const OFFLINE_MIN_MIN = 5;

export function newOffline(): OfflineInfo {
  return { rate: 0, at: 0 };
}

export function sanitizeOffline(raw: unknown): OfflineInfo {
  const r = (raw ?? {}) as Partial<OfflineInfo>;
  return {
    rate: Number.isFinite(r.rate) ? Math.min(Math.max(r.rate as number, 0), 1e6) : 0,
    at: Number.isFinite(r.at) ? Math.max(r.at as number, 0) : 0,
  };
}

/** Remember how the club is doing right now (called regularly while playing). */
export function stamp(state: ClubState, netPerMinute: number, nowMs: number): ClubState {
  return { ...state, offline: { rate: state.open ? Math.max(0, Math.round(netPerMinute)) : 0, at: nowMs } };
}

export interface Settled {
  state: ClubState;
  earned: number;
  minutes: number;
}

/** What the club earned while the player was away. Null when there is nothing to report. */
export function settle(state: ClubState, nowMs: number): Settled | null {
  const { rate, at } = state.offline;
  if (!at || !state.open || rate <= 0) return null;
  const away = Math.max(0, (nowMs - at) / 60_000);
  if (away < OFFLINE_MIN_MIN) return null;
  const minutes = Math.min(away, OFFLINE_CAP_MIN);
  const earned = Math.round(rate * minutes * OFFLINE_EFFICIENCY);
  return { state: { ...state, coins: state.coins + earned, offline: { rate, at: nowMs } }, earned, minutes: Math.round(minutes) };
}
