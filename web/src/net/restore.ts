// Putting a saved game into this browser and starting again with it. While it happens, the game must not write its own (older)
// club over the one just restored: the club is saved a moment after every change, and that pending save used to land between
// writing the restored game and the reload, so the player came back to the empty club they had before.

const CLUB_KEY = 'nc.club.v1';
const GUEST_KEY = 'nc.guest.v1';

let restoring = false;

/** True while a restore is under way: nothing may write the club to this browser. */
export const isRestoring = (): boolean => restoring;

/** Make this browser that game (and, with `guest`, that player), then reload. With no `state`, only the player changes. */
export function restoreGame(state: unknown, guest?: string): void {
  restoring = true;
  try {
    if (state !== undefined && state !== null) localStorage.setItem(CLUB_KEY, JSON.stringify(state));
    if (guest) localStorage.setItem(GUEST_KEY, guest);
  } catch {
    /* storage blocked: nothing to restore into */
  }
  // a link opened from a QR carries the code in the address: come back without it (and never redeem it twice)
  const url = new URL(location.href);
  if (url.searchParams.has('link')) {
    url.searchParams.delete('link');
    location.replace(url.toString());
  } else location.reload();
}
