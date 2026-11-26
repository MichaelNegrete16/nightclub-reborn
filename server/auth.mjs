// Accounts for the city: a player (a "pid", the id the whole server already uses) can protect their club with passkeys
// (fingerprint / face / PIN of the phone or computer, synced by Google or Apple), link a new device with a short code from
// a device that is already in, or come back with a recovery code. Nothing here knows passwords.
//
// A club with no account keeps working as before (the browser's guest id). Once it has one, every request for it must carry
// a session token, so knowing somebody's id is no longer enough to play as them.

import crypto from 'node:crypto';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';

const SESSION_DAYS = 90;
const LINK_MS = 5 * 60 * 1000;
const CHALLENGE_MS = 5 * 60 * 1000;
const RP_NAME = 'Nightclub Reborn';
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const rand = (n) => crypto.randomBytes(n).toString('base64url');

/** 8 digits for linking a device ("1234 5678"), 20 letters and digits for recovery ("K7QM2-…"). */
const linkCode = () => String(crypto.randomInt(0, 100_000_000)).padStart(8, '0');
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const recoveryCode = () => Array.from({ length: 4 }, () => Array.from({ length: 5 }, () => ALPHA[crypto.randomInt(0, ALPHA.length)]).join('')).join('-');
const cleanCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function createAuth({ db, origins }) {
  /** challenge id -> { challenge, pid, kind, exp } */
  const challenges = new Map();
  const q = {
    account: db.prepare('SELECT pid FROM accounts WHERE pid = ?'),
    addAccount: db.prepare('INSERT INTO accounts (pid, created, recovery_hash) VALUES (?, ?, ?)'),
    setRecovery: db.prepare('UPDATE accounts SET recovery_hash = ? WHERE pid = ?'),
    byRecovery: db.prepare('SELECT pid FROM accounts WHERE recovery_hash = ?'),
    creds: db.prepare('SELECT id, transports, label, created FROM credentials WHERE pid = ? ORDER BY created'),
    cred: db.prepare('SELECT id, pid, public_key, counter, transports FROM credentials WHERE id = ?'),
    addCred: db.prepare('INSERT INTO credentials (id, pid, public_key, counter, transports, label, created) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    bump: db.prepare('UPDATE credentials SET counter = ? WHERE id = ?'),
    delCred: db.prepare('DELETE FROM credentials WHERE id = ? AND pid = ?'),
    addSession: db.prepare('INSERT INTO sessions (hash, pid, created, last, device) VALUES (?, ?, ?, ?, ?)'),
    session: db.prepare('SELECT pid, last FROM sessions WHERE hash = ?'),
    touch: db.prepare('UPDATE sessions SET last = ? WHERE hash = ?'),
    delSession: db.prepare('DELETE FROM sessions WHERE hash = ?'),
    sessions: db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE pid = ?'),
    addLink: db.prepare('INSERT OR REPLACE INTO link_codes (hash, pid, expires) VALUES (?, ?, ?)'),
    link: db.prepare('SELECT pid, expires FROM link_codes WHERE hash = ?'),
    delLink: db.prepare('DELETE FROM link_codes WHERE hash = ?'),
    delLinksOf: db.prepare('DELETE FROM link_codes WHERE pid = ?'),
  };

  const hasAccount = (pid) => !!q.account.get(pid);

  function newSession(pid, device, now = Date.now()) {
    const token = rand(32);
    q.addSession.run(sha(token), pid, now, now, String(device ?? '').slice(0, 60));
    return token;
  }

  /** The pid a session token belongs to, or null (expired and unknown tokens both). */
  function pidOf(token, now = Date.now()) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const row = q.session.get(sha(token));
    if (!row) return null;
    if (now - row.last > SESSION_DAYS * 86_400_000) {
      q.delSession.run(sha(token));
      return null;
    }
    if (now - row.last > 3_600_000) q.touch.run(now, sha(token)); // sliding expiry, written at most once an hour
    return row.pid;
  }

  /** May this request act as `pid`? Clubs with no account are open like before; clubs with one need their token. */
  function allowed(pid, token) {
    if (!hasAccount(pid)) return true;
    return pidOf(token) === pid;
  }

  function okOrigin(origin) {
    if (!origin || !origins.includes(origin)) return null;
    return { origin, rpID: new URL(origin).hostname };
  }

  function putChallenge(challenge, pid, kind, now) {
    for (const [k, v] of challenges) if (v.exp < now) challenges.delete(k);
    const cid = rand(12);
    challenges.set(cid, { challenge, pid, kind, exp: now + CHALLENGE_MS });
    return cid;
  }
  function takeChallenge(cid, kind, now) {
    const c = challenges.get(cid);
    challenges.delete(cid);
    return c && c.kind === kind && c.exp > now ? c : null;
  }

  const view = (pid) => ({ pid, passkeys: q.creds.all(pid).map((c) => ({ id: c.id, label: c.label, created: c.created })) });

  return {
    hasAccount,
    pidOf,
    allowed,

    /** Start creating a passkey for a club: a guest claims theirs, or an account adds another device (needs a session). */
    /** `via`: 'phone' asks the browser to keep the passkey on the player's phone (it shows its own QR); 'here' keeps it on this device. */
    async registerOptions({ pid, token, name, origin, via }, now = Date.now()) {
      const o = okOrigin(origin);
      if (!o) return { status: 400, error: 'Este sitio no está autorizado para passkeys.' };
      if (hasAccount(pid) && pidOf(token, now) !== pid) return { status: 401, error: 'Entra primero con tu cuenta.' };
      const existing = q.creds.all(pid);
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: o.rpID,
        userName: String(name || 'jugador').slice(0, 40),
        userID: new TextEncoder().encode(pid),
        attestationType: 'none',
        authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
        ...(via === 'phone' ? { preferredAuthenticatorType: 'remoteDevice' } : via === 'here' ? { preferredAuthenticatorType: 'localDevice' } : {}),
        excludeCredentials: existing.map((c) => ({ id: c.id })),
      });
      return { options, cid: putChallenge(options.challenge, pid, 'register', now) };
    },

    /** Finish creating it. A new account gets its recovery code here, once. */
    async registerVerify({ cid, response, origin, label, device }, now = Date.now()) {
      const o = okOrigin(origin);
      const ch = takeChallenge(cid, 'register', now);
      if (!o || !ch) return { status: 400, error: 'Se venció el intento: vuelve a probar.' };
      let v;
      try {
        v = await verifyRegistrationResponse({ response, expectedChallenge: ch.challenge, expectedOrigin: o.origin, expectedRPID: o.rpID, requireUserVerification: false });
      } catch (e) {
        return { status: 400, error: `No se pudo verificar la passkey: ${e.message}` };
      }
      if (!v.verified) return { status: 400, error: 'No se pudo verificar la passkey.' };
      const c = v.registrationInfo.credential;
      let recovery;
      db.exec('BEGIN');
      try {
        if (!hasAccount(ch.pid)) {
          recovery = recoveryCode();
          q.addAccount.run(ch.pid, now, sha(cleanCode(recovery)));
        }
        q.addCred.run(c.id, ch.pid, Buffer.from(c.publicKey), c.counter, JSON.stringify(c.transports ?? []), String(label || 'Mi dispositivo').slice(0, 40), now);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        return { status: 409, error: 'Esa passkey ya está registrada.' };
      }
      return { pid: ch.pid, token: newSession(ch.pid, device, now), recovery, ...view(ch.pid) };
    },

    /**
     * Protect a guest club without a passkey (a device that cannot make one): the account is created with only a recovery code,
     * and this device gets a session. Other devices join later with a link code (or the QR) from this one.
     */
    registerCode({ pid, device }, now = Date.now()) {
      if (hasAccount(pid)) return { status: 409, error: 'Este club ya tiene cuenta: entra con tu passkey o un código.' };
      const recovery = recoveryCode();
      q.addAccount.run(pid, now, sha(cleanCode(recovery)));
      return { pid, token: newSession(pid, device, now), recovery, ...view(pid) };
    },

    /** Start signing in: no id needed, the device offers the passkeys it has for this site. */
    async loginOptions({ origin, via }, now = Date.now()) {
      const o = okOrigin(origin);
      if (!o) return { status: 400, error: 'Este sitio no está autorizado para passkeys.' };
      const options = await generateAuthenticationOptions({ rpID: o.rpID, userVerification: 'preferred' });
      // the passkey is on the phone: tell the browser to go straight to "use a phone" (its own QR)
      if (via === 'phone') options.hints = ['hybrid'];
      return { options, cid: putChallenge(options.challenge, null, 'login', now) };
    },

    async loginVerify({ cid, response, origin, device }, now = Date.now()) {
      const o = okOrigin(origin);
      const ch = takeChallenge(cid, 'login', now);
      if (!o || !ch) return { status: 400, error: 'Se venció el intento: vuelve a probar.' };
      const row = typeof response?.id === 'string' ? q.cred.get(response.id) : null;
      if (!row) return { status: 401, error: 'Esa passkey no está registrada en esta ciudad.' };
      let v;
      try {
        v = await verifyAuthenticationResponse({
          response,
          expectedChallenge: ch.challenge,
          expectedOrigin: o.origin,
          expectedRPID: o.rpID,
          requireUserVerification: false,
          credential: { id: row.id, publicKey: new Uint8Array(row.public_key), counter: row.counter, transports: JSON.parse(row.transports || '[]') },
        });
      } catch (e) {
        return { status: 401, error: `No se pudo verificar la passkey: ${e.message}` };
      }
      if (!v.verified) return { status: 401, error: 'No se pudo verificar la passkey.' };
      q.bump.run(v.authenticationInfo.newCounter, row.id);
      return { pid: row.pid, token: newSession(row.pid, device, now), ...view(row.pid) };
    },

    /** A code to type on another device (needs a session): good for 5 minutes, once. */
    linkCreate({ token }, now = Date.now()) {
      const pid = pidOf(token, now);
      if (!pid) return { status: 401, error: 'Entra primero con tu cuenta.' };
      q.delLinksOf.run(pid);
      const code = linkCode();
      q.addLink.run(sha(code), pid, now + LINK_MS);
      return { code, expires: now + LINK_MS };
    },

    linkRedeem({ code, device }, now = Date.now()) {
      const h = sha(cleanCode(code));
      const row = q.link.get(h);
      if (!row || row.expires < now) return { status: 401, error: 'Ese código no sirve o ya venció.' };
      q.delLink.run(h);
      return { pid: row.pid, token: newSession(row.pid, device, now), ...view(row.pid) };
    },

    /** The long code given at registration: a way back when every device is lost. */
    recover({ code, device }, now = Date.now()) {
      const row = q.byRecovery.get(sha(cleanCode(code)));
      if (!row) return { status: 401, error: 'Ese código de recuperación no es válido.' };
      return { pid: row.pid, token: newSession(row.pid, device, now), ...view(row.pid) };
    },

    /** A fresh recovery code (the old one stops working). */
    newRecovery({ token }, now = Date.now()) {
      const pid = pidOf(token, now);
      if (!pid) return { status: 401, error: 'Entra primero con tu cuenta.' };
      const recovery = recoveryCode();
      q.setRecovery.run(sha(cleanCode(recovery)), pid);
      return { recovery };
    },

    me({ token }, now = Date.now()) {
      const pid = pidOf(token, now);
      return pid ? { ...view(pid), sessions: q.sessions.get(pid).n } : { status: 401, error: 'Sin sesión.' };
    },

    removePasskey({ token, id }, now = Date.now()) {
      const pid = pidOf(token, now);
      if (!pid) return { status: 401, error: 'Entra primero con tu cuenta.' };
      if (q.creds.all(pid).length <= 1) return { status: 400, error: 'Es tu única passkey: no la puedes quitar.' };
      q.delCred.run(String(id), pid);
      return view(pid);
    },

    logout({ token }) {
      if (typeof token === 'string') q.delSession.run(sha(token));
      return { ok: true };
    },
  };
}
