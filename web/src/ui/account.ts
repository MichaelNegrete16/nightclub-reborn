import { button, el } from './dom';
import { openModal } from './modal';
import QRCode from 'qrcode';
import { adoptAccount, createCodeAccount, createPasskey, getToken, linkAddress, onPhone, type PasskeyPlace, makeLinkCode, myAccount, newRecoveryCode, passkeysAvailable, recoverWithCode, redeemLinkCode, removePasskey, signInWithPasskey, signOut, type AccountInfo } from '../net/session';
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

export function openAccount(ctx: Ctx, needLogin = false, required = false): void {
  // `required`: every player must protect their club once; the window stays until they do
  const modal = openModal(needLogin ? 'Tu club está protegido' : required ? 'Asegura tu club' : 'Mi cuenta', 'account', undefined, required || needLogin);
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
      const enter = (via: PasskeyPlace, label: string, cls: string) =>
        btn(label, cls, (b) => void busy(b, async () => {
          say(via === 'phone' && !onPhone() ? 'Escanea con tu celular el QR que muestra el navegador y confirma con tu huella o cara…' : 'Esperando tu huella, cara o PIN…');
          const r = await signInWithPasskey(via);
          if (!r.ok) return say(r.error, true);
          say('¡Listo! Cargando tu club…');
          await adoptAccount(r.pid, r.token);
        }));
      if (onPhone()) parts.push(enter('here', 'Entrar con mi passkey', 'btn primary'));
      else parts.push(enter('phone', 'Entrar con mi celular', 'btn primary'), enter('here', 'Entrar con este computador', 'btn'));
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
      btn('Ya lo guardé', 'btn primary', () => (required ? modal.close() : void draw())),
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
      const qr = el('img', 'acc-qr') as HTMLImageElement;
      qr.alt = 'Código QR para entrar desde otro dispositivo';
      qr.hidden = true;
      body.append(
        box('Cuenta protegida ✓', 'Tu club solo se abre con tus passkeys. Tu progreso está en la ciudad y lo ves igual desde el computador y el celular.'),
        box('Tus passkeys', list, ...(passkeysAvailable() ? [btn(onPhone() ? 'Agregar una passkey en este celular' : 'Agregar una passkey en mi celular', 'btn', (b) => void busy(b, async () => {
          say(onPhone() ? 'Esperando tu huella, cara o PIN…' : 'Escanea con tu celular el QR que muestra el navegador…');
          const r = await createPasskey();
          say(r.ok ? 'Passkey agregada.' : r.error, !r.ok);
          if (r.ok) void draw();
        }))] : [])),
        box('Vincular otro dispositivo', 'Escanea el código QR con la cámara del celular y entrarás con tu club y todo tu progreso. Si no puedes escanear, escribe los 8 números en el otro dispositivo (Menú › Cuenta › Ya tengo cuenta). Vale 5 minutos y se usa una sola vez.', btn(onPhone() ? 'Mostrar código para el computador' : 'Mostrar QR para el celular', 'btn primary', (b) => void busy(b, async () => {
          const r = await makeLinkCode();
          if (!r.ok) return say(r.error, true);
          linkOut.textContent = `${r.code.slice(0, 4)} ${r.code.slice(4)}`;
          try {
            qr.src = await QRCode.toDataURL(linkAddress(r.code), { width: 240, margin: 1, color: { dark: '#150d26', light: '#ffffff' } });
            qr.hidden = false;
          } catch {
            qr.hidden = true; // the numbers still work
          }
          say('Vale 5 minutos.');
        })), qr, linkOut),
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
      box('Protege tu club', onPhone()
        ? `${required ? 'Para seguir jugando, cada club necesita su cuenta. ' : ''}Crea tu passkey con la huella o la cara de este celular: es la llave de tu club en cualquier dispositivo, sin contraseñas.`
        : `${required ? 'Para seguir jugando, cada club necesita su cuenta. ' : ''}Tu celular será la llave de tu club: el navegador te mostrará un código QR, lo escaneas con la cámara del celular y confirmas con tu huella o tu cara. Necesitas el Bluetooth encendido en el computador y en el celular. Después entras desde cualquier computador con tu celular, sin contraseñas.`,
        ...(passkeysAvailable()
          ? [
            ...(['phone', 'here'] as PasskeyPlace[]).filter((v) => !onPhone() || v === 'here').map((via, i) =>
              btn(onPhone() ? 'Crear mi passkey' : via === 'phone' ? 'Crear passkey con mi celular' : 'Usar este computador (huella o PIN)', i === 0 ? 'btn primary' : 'btn', (b) => void busy(b, async () => {
                say(via === 'phone' && !onPhone() ? 'Escanea con tu celular el QR que muestra el navegador y confirma con tu huella o cara…' : 'Esperando tu huella, cara o PIN…');
                const r = await createPasskey(via);
                if (!r.ok) return say(r.error, true);
                ctx.toast('¡Cuenta protegida!', 'ok');
                if (r.recovery) showRecovery(r.recovery);
                else void draw();
              }))),
            ...(onPhone() ? [] : [el('p', 'sub', '¿Tu computador no tiene Bluetooth? Abre el juego en tu celular, crea ahí tu passkey y luego, en el celular, Menú › Cuenta › Mostrar QR: en el computador escribes los 8 números en «Ya tengo cuenta».')]),
          ]
          : [el('p', 'acc-msg bad', 'Este dispositivo no permite passkeys en esta dirección: usa la opción con código.')]),
        btn('Sin passkey: solo con código de recuperación', 'btn', (b) => void busy(b, async () => {
          const r = await createCodeAccount();
          if (!r.ok) return say(r.error, true);
          ctx.toast('¡Cuenta protegida!', 'ok');
          showRecovery(r.recovery);
        })),
      ),
      signInSection(),
      msg,
    );
  };
  void draw();
}
