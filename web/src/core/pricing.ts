// One number that sets how expensive everything is. Prices of the shop, staff, facade, renovations and expansions, the
// starting purse and the coin rewards of the missions all go up together, so the game keeps its shape. What the club
// EARNS (cover, drinks, tips) and its running costs do not scale: that is the whole point, things are worth more.
// (`NC_PRICE_SCALE` is only read by the test scripts, to compare scales.)

const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
const fromEnv = Number(proc?.env?.NC_PRICE_SCALE);
export const PRICE_SCALE = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 3;
