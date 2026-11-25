// Graphics quality: three tiers and an automatic governor that steps down when the computer cannot keep up.
// What each tier turns off is chosen by what costs the most on modest graphics cards.

export type Tier = 'high' | 'medium' | 'low';
export type Preference = 'auto' | Tier;

export interface Settings {
  /** resolution: device pixels per CSS pixel, at most */
  pixelRatio: number;
  /** black ink outlines (they draw the whole scene a second time) */
  outline: boolean;
  /** smooth edges (only changes with a reload: it is chosen when the canvas is created) */
  antialias: boolean;
  /** frames per second limit; 0 = as many as the screen shows */
  fpsCap: number;
  /** the pulsing coloured lights over the dance floor */
  neonLights: boolean;
  /** rain, clouds and stars */
  weatherFx: boolean;
  /** how many lots around yours are drawn */
  cityRange: number;
  /** animate each guest's body every N frames */
  mixerEvery: number;
  /** how many guests are drawn at most (the rest still count, they just are not shown) */
  maxGuests: number;
  /** how many people stand in the lines outside the other clubs */
  maxAmbient: number;
}

export const TIERS: Record<Tier, Settings> = {
  high: { pixelRatio: 2, outline: true, antialias: true, fpsCap: 0, neonLights: true, weatherFx: true, cityRange: 3, mixerEvery: 1, maxGuests: 60, maxAmbient: 40 },
  medium: { pixelRatio: 1.25, outline: true, antialias: false, fpsCap: 0, neonLights: true, weatherFx: true, cityRange: 2, mixerEvery: 2, maxGuests: 40, maxAmbient: 20 },
  low: { pixelRatio: 1, outline: false, antialias: false, fpsCap: 30, neonLights: false, weatherFx: false, cityRange: 1, mixerEvery: 3, maxGuests: 24, maxAmbient: 8 },
};

const PREF_KEY = 'nc.quality';
const AUTO_KEY = 'nc.quality.auto';
const ORDER: Tier[] = ['high', 'medium', 'low'];

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage blocked: the choice just does not last */
  }
};

export function getPreference(): Preference {
  const p = read(PREF_KEY);
  return p === 'high' || p === 'medium' || p === 'low' ? p : 'auto';
}

export function setPreference(p: Preference): void {
  write(PREF_KEY, p);
  if (p === 'auto') write(AUTO_KEY, '');
}

/** A first guess for this computer (few cores or little memory: medium; a phone: medium). */
export function guessTier(): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const weak = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  const phone = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return weak || phone ? 'medium' : 'high';
}

/** The tier to start with: the one chosen, or (auto) the last one the governor settled on, or the guess. */
export function startTier(): Tier {
  const p = getPreference();
  if (p !== 'auto') return p;
  const saved = read(AUTO_KEY);
  return saved === 'high' || saved === 'medium' || saved === 'low' ? saved : guessTier();
}

/**
 * Watches the real frame time. If the average over a few seconds is too slow, it asks for the next lower tier (and
 * remembers it for the next visit). It never raises quality by itself: a stutter is worse than a plainer picture.
 */
export class Governor {
  tier: Tier;
  onChange: (t: Tier) => void = () => {};
  private sum = 0;
  private frames = 0;
  private warm = 120; // ignore the first frames: shaders compile and models load

  private auto: boolean;

  constructor(tier: Tier, auto: boolean) {
    this.tier = tier;
    this.auto = auto;
  }

  setAuto(auto: boolean, tier: Tier): void {
    this.auto = auto;
    this.tier = tier;
    this.sum = 0;
    this.frames = 0;
    this.warm = 120;
  }

  /** Call once per drawn frame with the real time since the last one, in seconds. */
  frame(dt: number): void {
    if (!this.auto || this.tier === 'low') return;
    if (this.warm > 0) {
      this.warm--;
      return;
    }
    // a pause (tab in the background) is not slowness
    if (dt > 0.5) return;
    this.sum += dt;
    this.frames++;
    if (this.frames < 90) return;
    const avg = this.sum / this.frames;
    this.sum = 0;
    this.frames = 0;
    if (avg > 1 / 28) {
      this.tier = ORDER[ORDER.indexOf(this.tier) + 1];
      this.warm = 90;
      write(AUTO_KEY, this.tier);
      this.onChange(this.tier);
    }
  }
}
