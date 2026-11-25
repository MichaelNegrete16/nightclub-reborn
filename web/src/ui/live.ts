import type { Ctx } from './shop';

/**
 * Keeps a window up to date WITHOUT rebuilding its buttons while the game ticks. The game announces a change about twice
 * a second (money comes in), and rebuilding a window each time swaps the button under the finger: a click that starts on
 * the old button and ends on the new one is lost. So:
 *  - `draw` (the part with buttons) runs only when `sig()` changes, and never while a button is being pressed;
 *  - `live` (numbers and bars that have nothing to click) refreshes every time.
 * Returns the function that stops it.
 */
export function reactive(ctx: Ctx, sig: () => string, draw: () => void, live: () => void = () => {}): () => void {
  let last = '';
  let pressing = false;
  let dirty = false;
  const run = () => {
    dirty = false;
    last = sig();
    draw();
    live();
  };
  const down = () => (pressing = true);
  const up = () => {
    pressing = false;
    if (dirty) setTimeout(() => dirty && !pressing && run(), 80); // after the click has been delivered
  };
  document.addEventListener('pointerdown', down, true);
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', up, true);
  run();
  const off = ctx.subscribe(() => {
    if (sig() === last) return live();
    if (pressing) {
      dirty = true;
      return live();
    }
    run();
  });
  return () => {
    off();
    document.removeEventListener('pointerdown', down, true);
    document.removeEventListener('pointerup', up, true);
    document.removeEventListener('pointercancel', up, true);
  };
}
