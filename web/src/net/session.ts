import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { guestId, httpBase } from './client';
import { restoreGame } from './restore';

// The player's account on the city server: a session token (kept in this browser) and the calls that create, link and
// recover it. A club with no account keeps working as a guest. See server/auth.mjs.

const TOKEN_KEY = 'nc.token.v1';

export const getToken = (): string => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};
const setToken = (t: string): void => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked */
  }
};

/** Headers every request for this player's club must carry (empty for a guest). */
export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { 'x-nc-token': t } : {};
}

/** Passkeys need a secure page: https, or localhost. On a plain http address (a phone on the home network) only codes work. */
export const passkeysAvailable = (): boolean => window.isSecureContext && browserSupportsWebAuthn();

export interface Passkey {
  id: string;
  label: string;
  created: number;
}
export interface AccountInfo {
  pid: string;
  passkeys: Passkey[];
  sessions?: number;
}
export type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

async function api<T>(step: string, body: unknown = {}): Promise<Result<T>> {
  const base = httpBase();
  if (!base) return { ok: false, error: 'Estás sin conexión con la ciudad.' };
  try {
    const r = await fetch(`${base}/auth/${step}`, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { error?: string } & T;
    return r.ok && !j.error ? { ok: true, ...j } : { ok: false, error: j.error ?? 'No se pudo completar.' };
  } catch {
    return { ok: false, error: 'No se pudo hablar con el servidor.' };
  }
}

const deviceLabel = (): string => {
  const ua = navigator.userAgent;
  const what = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return `${what}${browser ? ` · ${browser}` : ''}`;
};

/** What the server knows about my account (needs a session). */
export const myAccount = () => api<AccountInfo>('me');

/** Protect this club (or add this device to the account) with a passkey. A new account gets its recovery code. */
/** On a phone the passkey lives in the phone itself; on a computer, by default, on the player's phone (the browser shows a QR). */
export type PasskeyPlace = 'phone' | 'here';
export const onPhone = (): boolean => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export async function createPasskey(via: PasskeyPlace = onPhone() ? 'here' : 'phone'): Promise<Result<AccountInfo & { recovery?: string }>> {
  const o = await api<{ options: Parameters<typeof startRegistration>[0]['optionsJSON']; cid: string }>('register/options', { pid: guestId(), via });
  if (!o.ok) return o;
  let response;
  try {
    response = await startRegistration({ optionsJSON: o.options });
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
  const v = await api<AccountInfo & { token: string; recovery?: string }>('register/verify', { cid: o.cid, response, label: via === 'phone' ? 'Mi celular' : deviceLabel() });
  if (v.ok) setToken(v.token);
  return v;
}

/** Sign in with a passkey this device (or the user's Google/Apple account) has: no id needed. */
export async function signInWithPasskey(via: PasskeyPlace = onPhone() ? 'here' : 'phone'): Promise<Result<AccountInfo & { token: string }>> {
  const o = await api<{ options: Parameters<typeof startAuthentication>[0]['optionsJSON']; cid: string }>('login/options', { via });
  if (!o.ok) return o;
  let response;
  try {
    response = await startAuthentication({ optionsJSON: o.options });
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
  return api<AccountInfo & { token: string }>('login/verify', { cid: o.cid, response });
}

/** Protect this club without a passkey: only a recovery code (for devices that cannot make a passkey). */
export async function createCodeAccount(): Promise<Result<AccountInfo & { recovery: string }>> {
  const r = await api<AccountInfo & { token: string; recovery: string }>('register/code', { pid: guestId() });
  if (r.ok) setToken(r.token);
  return r;
}

/** The address a phone opens (from the QR) to join this account with a link code. */
export const linkAddress = (code: string): string => `${location.origin}${location.pathname}?link=${encodeURIComponent(code)}`;

export const redeemLinkCode = (code: string) => api<AccountInfo & { token: string }>('link/redeem', { code });
export const recoverWithCode = (code: string) => api<AccountInfo & { token: string }>('recover', { code });
export const makeLinkCode = () => api<{ code: string; expires: number }>('link/create');
export const newRecoveryCode = () => api<{ recovery: string }>('recovery/new');
export const removePasskey = (id: string) => api<AccountInfo>('passkey/remove', { id });

export async function signOut(): Promise<void> {
  await api('logout');
  setToken('');
}

/**
 * This browser becomes that player: it keeps their id and session, and takes the game saved in the city (the account's
 * progress follows them to a new computer or phone). Reloads the page.
 */
export async function adoptAccount(pid: string, token: string): Promise<void> {
  setToken(token);
  const base = httpBase();
  if (base) {
    try {
      const r = await fetch(`${base}/save?pid=${encodeURIComponent(pid)}`, { headers: { 'x-nc-token': token } });
      if (r.ok) {
        const j = (await r.json()) as { state?: unknown };
        if (j.state) return restoreGame(j.state, pid);
      }
    } catch {
      /* the page will try again when it connects */
    }
  }
  restoreGame(undefined, pid);
}

function friendly(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError') return 'Cancelaste o se acabó el tiempo.';
  if (name === 'InvalidStateError') return 'Este dispositivo ya tiene una passkey para esta cuenta.';
  return 'No se pudo usar la passkey en este dispositivo.';
}
