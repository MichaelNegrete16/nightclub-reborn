import { BY_ID } from '../core/catalog';
import { KITS, RULES } from '../core/heist';
import type { HeistReply, ScoutReply } from '../net/client';
import { button, el, fmt } from './dom';
import { icon } from './icons';
import { openModal } from './modal';
import type { Ctx } from './shop';
import { TIER_NAMES } from '../core/tiers';

export interface HeistApi {
  scout(n: number): void;
  heist(n: number, want: string | null, kits: string[], skill?: number): void;
  /** the next reply of each kind goes to these */
  onScout(fn: (r: ScoutReply) => void): void;
  onHeist(fn: (r: HeistReply) => void): void;
}

const REASON: Record<string, string> = {
  self: 'Ese eres tú.',
  novice: `Hasta el nivel ${RULES.noviceLevel} nadie puede asaltar ni ser asaltado.`,
  band: `Solo puedes asaltar a quien esté a ${RULES.levelBand} niveles de ti o menos.`,
  cooldown: 'Todavía estás descansando del último robo.',
  sameTarget: 'Ya asaltaste a este club hace poco.',
  shield: 'Este club acaba de ser asaltado: está protegido un rato.',
  guard: 'Este club tiene un protector antirrobos activo: nadie puede asaltarlo ahora.',
  detained: 'Estás en prisión por un asalto fallido.',
  dailyCap: 'A este club ya le robaron lo máximo de hoy.',
  closed: 'Este club está clausurado.',
};

const wait = (until?: number) => {
  if (!until) return '';
  const m = Math.max(1, Math.round((until - Date.now()) / 60000));
  return m >= 60 ? ` Vuelve en ${Math.round(m / 60)} h.` : ` Vuelve en ${m} min.`;
};

/**
 * The short game of the robbery: three pins to set. A marker sweeps a bar; press the button (or Space) while it is over the
 * green part. Each hit counts. The result is a skill from 0.3 (nothing) to 0.8 (all three); the server limits it to that range.
 */
function lockGame(host: HTMLElement, onDone: (skill: number) => void): void {
  host.replaceChildren();
  const bar = el('div', 'lock-bar');
  const zone = el('div', 'lock-zone');
  const mark = el('div', 'lock-mark');
  bar.append(zone, mark);
  const info = el('p', 'sub', 'Pin 1 de 3: pulsa cuando la barra pase por lo verde.');
  const press = button('¡Ahora!', 'heist-go', () => hit());
  host.append(el('h4', '', 'Forzando la cerradura'), bar, info, press);
  let pin = 0;
  let hits = 0;
  let pos = 0;
  let dir = 1;
  let speed = 0.9;
  let zoneAt = 0.4;
  const width = 0.2;
  const setZone = () => {
    zoneAt = 0.1 + Math.random() * (0.8 - width);
    zone.style.left = `${zoneAt * 100}%`;
    zone.style.width = `${width * 100}%`;
    speed = 0.9 + pin * 0.35;
  };
  setZone();
  let last = performance.now();
  let raf = 0;
  const frame = (t: number) => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    pos += dir * speed * dt;
    if (pos > 1) { pos = 1; dir = -1; } else if (pos < 0) { pos = 0; dir = 1; }
    mark.style.left = `${pos * 100}%`;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  const finish = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', key);
    onDone(0.3 + 0.5 * (hits / 3));
  };
  const hit = () => {
    if (pos >= zoneAt && pos <= zoneAt + width) hits++;
    pin++;
    if (pin >= 3) return finish();
    info.textContent = `Pin ${pin + 1} de 3: ${hits} bien hasta ahora.`;
    setZone();
  };
  const key = (e: KeyboardEvent) => {
    if (e.code === 'Space') { e.preventDefault(); hit(); }
  };
  window.addEventListener('keydown', key);
  // closing the window stops the game
  new MutationObserver((_m, ob) => { if (!host.isConnected) { cancelAnimationFrame(raf); window.removeEventListener('keydown', key); ob.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
}

/** "Reconocimiento": look at a club, bring kits, choose what to take, and see what happened. Zeta sells the kits. */
export function openHeist(ctx: Ctx, n: number, api: HeistApi): void {
  const club = ctx.club;
  const modal = openModal('Asalto', 'heist');
  const body = el('div', 'heist-body');
  modal.body.append(body);
  let want: string | null = null;
  const bring = new Set<string>();
  let reply: ScoutReply | null = null;

  const show = (...nodes: Array<Node | string>) => body.replaceChildren(...nodes.map((x) => (typeof x === 'string' ? el('p', 'sub', x) : x)));

  const draw = () => {
    if (!reply) return show('Reconociendo el club…');
    if (!reply.ok || !reply.target) return show(reply.error ?? 'No se pudo ver ese club.');
    const t = reply.target;
    const own = club.state.kits;
    const head = el('div', 'heist-head');
    head.append(el('b', '', t.name), el('span', '', `Nivel ${t.level} · ${t.open ? `abierto, ${t.guests} invitados` : 'cerrado'}`));
    const sec = el('div', 'heist-sec');
    sec.append(el('span', 'tag', `🛡 ${t.guards} guardia${t.guards === 1 ? '' : 's'}`), el('span', 'tag', t.alarm ? '🚨 con alarma' : 'sin alarma'), el('span', 'tag', t.crowded ? '👥 lleno de gente' : 'poca gente'), el('span', 'tag', `💰 caja ${t.cash}`));

    const pieces = el('div', 'heist-pieces');
    pieces.append(el('h4', '', '¿Qué te quieres llevar? (solo una pieza)'));
    if (!t.pieces.length) pieces.append(el('p', 'sub', 'No hay piezas que valga la pena robar. Solo podrías llevarte parte de la caja.'));
    for (const p of t.pieces) {
      const def = BY_ID.get(p.id);
      const needs = p.heavy && !own.van;
      const row = el('button', `piece${want === p.uid ? ' on' : ''}${needs ? ' locked' : ''}`);
      (row as HTMLButtonElement).type = 'button';
      row.innerHTML = `<b>${def?.name ?? p.id}</b> <small>${TIER_NAMES[p.tier - 1]} · vale ${fmt(p.value)}${p.heavy ? ' · necesita furgoneta' : ''}</small>`;
      row.addEventListener('click', () => {
        if (needs) return club.say('Esa pieza es muy grande: necesitas la furgoneta.');
        want = want === p.uid ? null : p.uid;
        draw();
      });
      pieces.append(row);
    }

    const kitBox = el('div', 'heist-kits');
    kitBox.append(el('h4', '', 'Tu equipo (lo vende Zeta, sin preguntas)'));
    for (const k of KITS) {
      const have = own[k.id];
      const row = el('div', 'kit');
      const text = el('div', 'kit-text');
      text.append(el('b', '', `${k.name}${have ? ` ×${have}` : ''}`), el('span', '', k.desc));
      row.append(text);
      if (have > 0) {
        const on = bring.has(k.id);
        row.append(button(on ? 'Llevar ✓' : 'Llevar', `kit-btn${on ? ' on' : ''}`, () => {
          if (on) bring.delete(k.id);
          else bring.add(k.id);
          draw();
        }));
      }
      const buy = button('', 'kit-btn buy', () => {
        if (club.buyKit(k.id) === undefined) draw();
      });
      buy.innerHTML = `${icon('coin')} ${fmt(k.price)}`;
      buy.disabled = k.id === 'van' && have >= 1;
      row.append(buy);
      kitBox.append(row);
    }

    const odds = reply.odds ? Math.round((bring.size ? reply.odds.kitted : reply.odds.bare) * 100) : 0;
    const foot = el('div', 'heist-foot');
    const denied = reply.denied;
    foot.append(el('span', 'odds', denied ? `${REASON[denied.reason] ?? 'No se puede ahora.'}${wait(denied.until)}` : `Probabilidad aproximada: ${odds}%  ·  tu calor: ${reply.heat ?? 0}`));
    const send = (skill: number) => {
      show('Entrando por la puerta de atrás…');
      api.heist(n, want, [...bring], skill);
    };
    const go = button('Forzar la cerradura', 'heist-go', () => {
      const host = el('div', 'lock-game');
      show(host);
      lockGame(host, send);
    });
    const luck = button('A la suerte', 'heist-cancel', () => send(0.3));
    luck.title = 'Sin jugar: siempre es peor que forzarla bien.';
    go.disabled = luck.disabled = !!denied;
    foot.append(go, luck, button('Cancelar', 'heist-cancel', () => modal.close()));
    show(head, sec, pieces, kitBox, el('p', 'sub', 'Si te descubren, te detienen unas horas, pierdes lo que llevabas y tu calor sube. Si sale bien, lo robado queda "caliente": la policía lo busca.'), foot);
  };

  api.onScout((r) => {
    if (r.n !== n) return;
    reply = r;
    draw();
  });
  api.onHeist((r) => {
    if (r.n !== n) return;
    const x = r.result;
    if (!r.ok || !x) return show(r.error ?? 'No se pudo hacer el asalto.', button('Cerrar', 'heist-cancel', () => modal.close()));
    const box = el('div', 'heist-result');
    if (x.kind === 'denied') box.append(el('h3', '', 'No se pudo'), el('p', '', `${REASON[x.reason ?? ''] ?? 'Las reglas no lo permiten ahora.'}${wait(x.until)}`));
    else if (x.kind === 'fail') box.append(el('h3', 'bad', '¡Te descubrieron!'), el('p', '', x.jail ? `Sonó la alarma y la Brigada del Ruido te atrapó. Vas a prisión: para salir tienes que hacer ${x.jail.goal} tareas (baños, pisos, platos...). Tu club queda cerrado mientras tanto, pagas ${fmt(x.jail.fine)} de multa y tu calor sube.` : 'Sonó la alarma y la Brigada del Ruido te atrapó: vas a prisión, tu club cierra unos minutos y pagas una multa.'));
    else {
      const names = (x.pieces ?? []).map((p) => BY_ID.get(p.id)?.name ?? p.id).join(' y ');
      box.append(el('h3', 'ok', x.kind === 'full' ? '¡Golpe limpio!' : 'Salió regular…'), el('p', '', `A ${x.victim} le sacaste ${fmt(x.cash ?? 0)} monedas${names ? ` y te llevaste: ${names}` : ''}.${names ? ' La pieza está en tu bolsa, caliente: el calor sube mientras la tengas a la vista.' : ''}`));
    }
    box.append(el('p', 'sub', `Tu calor ahora: ${x.heat ?? 0}`), button('Cerrar', 'heist-cancel', () => modal.close()));
    show(box);
  });
  draw();
  api.scout(n);
}
