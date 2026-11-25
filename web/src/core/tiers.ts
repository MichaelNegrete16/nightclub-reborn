// Every object has four versions. You buy the first (the basement kind) and pay to upgrade it. Pure data and numbers.
//
//   1  De sótano    cheap, worn, what a basement club starts with
//   2  Profesional  a proper bar's gear
//   3  Premium      top brands: looks and sounds much better
//   4  Élite        the best money can buy

export type Tier = 1 | 2 | 3 | 4;
export const MAX_TIER_N = 4;

export const TIER_NAMES = ['De sótano', 'Profesional', 'Premium', 'Élite'];
/** luxury of a piece, by version */
export const TIER_LUXURY = [1, 1.7, 2.6, 4];
/** what going UP to each version costs, as a multiple of the object's base price (index 0 is unused) */
export const TIER_COST = [0, 1.5, 4, 10];
/** player level needed to upgrade to each version */
export const TIER_LEVEL = [1, 4, 12, 25];

export function clampTier(t: unknown): Tier {
  return (Number.isFinite(t) ? Math.min(Math.max(Math.floor(t as number), 1), MAX_TIER_N) : 1) as Tier;
}

/** Price of going from `tier` to the next version. */
export function upgradeCost(basePrice: number, tier: Tier): number {
  return Math.round(basePrice * TIER_COST[tier]);
}

/** Everything paid for a piece in this version (the purchase and the upgrades): selling returns half of it. */
export function invested(basePrice: number, tier: Tier): number {
  let total = basePrice;
  for (let t = 1; t < tier; t++) total += upgradeCost(basePrice, t as Tier);
  return total;
}

/** How good the sound is, 1 (basement) to 4 (studio clean), from the speakers and the DJ booth. 0 if there is none. */
export function soundQuality(tiers: number[]): number {
  return tiers.length ? tiers.reduce((a, b) => a + b, 0) / tiers.length : 0;
}
