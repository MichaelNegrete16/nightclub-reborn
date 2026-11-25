import { button, el } from './dom';
import { openModal } from './modal';
import { adoptAccount, createPasskey, getToken, makeLinkCode, myAccount, newRecoveryCode, passkeysAvailable, recoverWithCode, redeemLinkCode, removePasskey, signInWithPasskey, signOut, type AccountInfo } from '../net/session';
import type { Ctx } from './shop';

/**
 * "Mi cuenta": protect the club with a passkey (fingerprint / face / PIN), join from another device with a code, or come back
 * with the recovery code. `needLogin` opens it as the sign-in screen (the club belongs to an account and this browser has no session).
 */
/** A button whose handler gets the button itself (to disable it while it works). */
const btn = (label: string, cls: string, fn: (b: HTMLButtonElement) => void): HTMLButtonElement => {
  const b = button(label, cls, () => fn(b));
  return b;
};

export function openAccount(ctx: Ctx, needLogin = false): void {
  const modal = openModal(needLogin ? 'Tu club está protegido' : 'Mi cuenta', 'account');
  const body = modal.body;
  const msg = el('p', 'acc-msg');
  const say = (text: string, bad = false) => {
    msg.textContent = text;
    msg.className = `acc-msg${bad ? ' bad' : ''}`;
  };
  const busy = async (btn: HTMLButtonElement, fn: () => Promise<void>) => {
    btn.disabled = true;
    try {
      await fn();
    } finally {
      btn.disabled = false;
    }
  };

  const box = (title: string, ...children: Array<HTMLElement | string>) => {
    const s = el('section', 'menu-sec');
    s.append(el('h3', '', title), ...children.map((c) => (typeof c === 'string' ? el('p', 'sub', c) : c)));
    return s;
  };

  // ---- ways to come in (guests and people with a new device) ----
  const signInSection = (): HTMLElement => {
    const parts: HTMLElement[] = [];
    if (passkeysAvailable()) {
      parts.push(
        btn('Entrar con passkey', 'btn primary', (b) => void busy(b, async () => {
          say('Esperando tu huella, cara o PIN…');
          const r = await signInWithPasskey();
          if (!r.ok) return say(r.error, true);
          say('¡Listo! Cargando tu club…');
          await adoptAccount(r.pid, r.token);
        })),
      );
    } else {
      parts.push(el('p', 'sub', 'Las passkeys solo funcionan en una página segura (https o localhost). Aquí puedes entrar con un código.'));
    }
    const link = el('input', 'mu-input') as HTMLInputElement;
    link.placeholder = 'Código de 8 dígitos de otro dispositivo';
    link.inputMode = 'numeric';
    link.maxLength = 12;
    const rec = el('input', 'mu-input') as HTMLInputElement;
    rec.placeholder = 'Código de recuperación (XXXXX-XXXXX-…)';
    rec.maxLength = 30;
    parts.push(
      link,
      btn('Entrar con este código', 'btn', (b) => void busy(b, async () => {
        const r = await redeemLinkCode(link.value);
        if (!r.ok) return say(r.error, true);
        await adoptAccount(r.pid, r.token);
      })),
      rec,
      btn('Recuperar mi cuenta', 'btn', (b) => void busy(b, async () => {
        const r = await recoverWithCode(rec.value);
        if (!r.ok) return say(r.error, true);
        await adoptAccount(r.pid, r.token);
      })),
    );
    return box('Ya tengo cuenta', 'Entra con tu passkey, con el código que te da otro dispositivo (Menú › Cuenta › Vincular otro dispositivo) o con tu código de recuperación.', ...parts);
  };

  const showRecovery = (code: string) => {
    body.replaceChildren(
      box('Guarda tu código de recuperación', 'Es la única forma de volver a tu club si pierdes todos tus dispositivos. Cópialo y guárdalo en un lugar seguro: no lo volverás a ver igual.'),
    );
    const big = el('input', 'mu-input acc-code') as HTMLInputElement;
    big.readOnly = true;
    big.value = code;
    big.addEventListener('focus', () => big.select());
    body.append(
      big,
      btn('Copiar', 'btn', () => void navigator.clipboard?.writeText(code).then(() => say('Copiado.'), () => say('Cópialo a mano.', true))),
      msg,
      btn('Ya lo guardé', 'btn primary', () => draw()),
    );
  };

  // ---- the account screen ----
  const draw = async () => {
    body.replaceChildren();
    if (needLogin && !getToken()) {
      body.append(box('Tu club tiene cuenta', 'Para entrar a este club hace falta tu passkey o un código.'), signInSection(), msg);
      return;
    }
    const me = getToken() ? await myAccount() : null;
    if (me?.ok) {
      const acc: AccountInfo = me;
      const list = el('div', 'acc-list');
      for (const p of acc.passkeys) {
        const row = el('div', 'acc-row');
        row.append(el('span', '', `${p.label} · ${new Date(p.created).toLocaleDateString('es-CO')}`));
        if (acc.passkeys.length > 1) row.append(btn('Quitar', 'btn small', async () => {
          const r = await removePasskey(p.id);
          if (!r.ok) return say(r.error, true);
          void draw();
        }));
        list.append(row);
      }
      const linkOut = el('p', 'acc-link');
      body.append(
        box('Cuenta protegida ✓', 'Tu club solo se abre con tus passkeys. Tu progreso está en la ciudad y lo ves igual desde el computador y el celular.'),
        box('Tus passkeys', list, ...(passkeysAvailable() ? [btn('Agregar una passkey en este dispositivo', 'btn', (b) => void busy(b, async () => {
          say('Esperando tu huella, cara o PIN…');
          const r = await createPasskey();
          say(r.ok ? 'Passkey agregada.' : r.error, !r.ok);
          if (r.ok) void draw();
        }))] : [])),
        box('Vincular otro dispositivo', 'Genera un código y escríbelo en el otro dispositivo (Menú › Cuenta › Ya tengo cuenta). Vale 5 minutos y se usa una sola vez.', btn('Generar código', 'btn', (b) => void busy(b, async () => {
          const r = await makeLinkCode();
          if (!r.ok) return say(r.error, true);
          linkOut.textContent = `${r.code.slice(0, 4)} ${r.code.slice(4)}`;
          say('Vale 5 minutos.');
        })), linkOut),
        box('Código de recuperación', 'Si pierdes todos tus dispositivos es la única forma de volver. Generar uno nuevo anula el anterior.', btn('Generar uno nuevo', 'btn', (b) => void busy(b, async () => {
          const r = await newRecoveryCode();
          if (!r.ok) return say(r.error, true);
          showRecovery(r.recovery);
        }))),
        box('Sesión', btn('Cerrar sesión en este dispositivo', 'btn danger', async () => {
          await signOut();
          location.reload();
        })),
        msg,
      );
      return;
    }
    // a guest: nothing protects this club yet
    body.append(
      box('Protege tu club', 'Ahora mismo tu club está guardado solo en este navegador. Crea una passkey (tu huella, tu cara o el PIN del dispositivo) y podrás entrar desde el celular o el computador con tu progreso, sin contraseñas.',
        ...(passkeysAvailable()
          ? [btn('Crear mi passkey', 'btn primary', (b) => void busy(b, async () => {
            say('Esperando tu huella, cara o PIN…');
            const r = await createPasskey();
            if (!r.ok) return say(r.error, true);
            ctx.toast('¡Cuenta protegida!', 'ok');
            if (r.recovery) showRecovery(r.recovery);
            else void draw();
          }))]
          : [el('p', 'acc-msg bad', 'Este dispositivo no permite passkeys en esta dirección (hace falta https o localhost).')])),
      signInSection(),
      msg,
    );
  };
  void draw();
}
