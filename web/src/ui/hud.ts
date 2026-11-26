import { nextBlackoutNight } from '../core/heist';
import { VIP_RATING, stars } from '../core/music';
import { levelOf, titleFor } from '../core/progression';
import type { MissionView } from '../core/story';
import { statsOf, type ClubState } from '../core/club';
import { WEATHER_LABEL, type Weather } from '../render/environment';
import { el, fmt } from './dom';
import { icon } from './icons';

/** Top bar (player, level, XP, coins, luxury, guests) and the current-mission tracker. */
export class Hud {
  readonly root = el('div', 'hud');
  private badge = el('div', 'lvl-badge');
  private who = el('b');
  private title = el('small');
  private xpFill = el('i');
  private xpText = el('span');
  private coins = el('div', 'pill coins');
  private lux = el('div', 'pill lux');
  private guests = el('div', 'pill guests');
  private sky = el('div', 'pill sky');
  private rating = el('div', 'pill rating');
  private song = el('button', 'pill song');
  private netPill = el('div', 'pill net');
  private heat = el('div', 'pill heat');
  private rankPill = el('button', 'pill rank');
  private tracker = el('button', 'tracker');
  private everOnline = false;

  constructor(handlers: { openMissions(): void; openMenu(): void; openMusic(): void; openRanking(): void }) {
    const player = el('div', 'hud-player');
    const info = el('div', 'who');
    const bar = el('div', 'xpbar');
    bar.append(this.xpFill, this.xpText);
    info.append(this.who, this.title, bar);
    player.append(this.badge, info);

    const stats = el('div', 'hud-stats');
    this.song.type = 'button';
    this.song.addEventListener('click', handlers.openMusic);
    this.rankPill.type = 'button';
    this.rankPill.addEventListener('click', handlers.openRanking);
    stats.append(this.coins, this.lux, this.guests, this.rating, this.rankPill, this.song, this.netPill, this.heat, this.sky);

    const menu = el('button', 'icon-btn menu-btn');
    menu.type = 'button';
    menu.innerHTML = icon('menu');
    menu.setAttribute('aria-label', 'Menú');
    menu.addEventListener('click', handlers.openMenu);

    const top = el('div', 'hud-top');
    top.append(player, stats, menu);

    this.tracker.type = 'button';
    this.tracker.addEventListener('click', handlers.openMissions);
    this.root.append(top, this.tracker);
  }

  update(state: ClubState, guests: number, capacity: number, queue: number, rating: number, song: string | null, net: { status: string; online: number }, crime?: { heat: number; shieldUntil: number; detainedUntil: number; closedUntil: number; guardUntil?: number; chores?: number; choreGoal?: number; blackout: boolean }, rank?: { rank: number; of: number; factor: number } | null): void {
    const lv = levelOf(state.xp);
    this.badge.textContent = String(lv.level);
    this.who.textContent = state.story.name || 'DJ';
    this.title.textContent = titleFor(lv.level);
    this.xpFill.style.width = `${Math.round(lv.progress * 100)}%`;
    this.xpText.textContent = `${fmt(lv.into)} / ${fmt(lv.need)} XP`;
    this.coins.innerHTML = `${icon('coin')} ${fmt(state.coins)}`;
    this.lux.innerHTML = `${icon('luxury')} ${fmt(statsOf(state).luxury)}`;
    this.lux.title = 'Lujo';
    this.guests.innerHTML = `${icon('guests')} ${guests}/${capacity}${queue ? ` <small>+${queue} en fila</small>` : ''}`;
    const s = stars(rating);
    const tone = rating >= VIP_RATING ? 'great' : rating >= 55 ? 'good' : rating >= 35 ? 'meh' : 'bad';
    this.rating.className = `pill rating ${tone}`;
    this.rating.innerHTML = `${icon('star')} ${rating}<small>${'★'.repeat(Math.floor(s))}${s % 1 ? '½' : ''}</small>`;
    this.rating.title = `Ambiente del club: ${rating}/100. Con ${VIP_RATING} o más pueden venir los famosos. Sube con música que le guste a tu público, lujo y un DJ.`;
    this.song.innerHTML = `${icon('music')} <span>${song ?? 'Sin música'}</span>`;
    this.song.classList.toggle('silent', !song);
    this.song.title = 'Abrir la música';
    const now = Date.now();
    const c = crime;
    const show = !!c && (c.heat > 0 || c.shieldUntil > now || c.detainedUntil > now || c.closedUntil > now || c.blackout || (nextBlackoutNight(now) - now) < 24 * 3_600_000);
    this.heat.hidden = !show;
    if (c && show) {
      const tone = c.heat >= 85 ? 'raid' : c.heat >= 60 ? 'high' : c.heat >= 30 ? 'mid' : 'low';
      this.heat.className = `pill heat ${tone}`;
      const mins = (t: number) => Math.max(1, Math.round((t - now) / 60000));
      const extra = c.detainedUntil > now ? ` · en prisión ${c.chores ?? 0}/${c.choreGoal || 20} tareas` : c.closedUntil > now ? ` · clausurado ${mins(c.closedUntil)} min` : c.shieldUntil > now ? ` · protegido ${mins(c.shieldUntil)} min` : '';
      this.heat.innerHTML = `🔥 ${Math.round(c.heat)}${extra}${c.blackout ? ' · 🌑 Noche del Apagón: el calor baja el doble' : (nextBlackoutNight(now) - now) < 24 * 3_600_000 ? ` · 🌑 Apagón en ${Math.max(1, Math.round((nextBlackoutNight(now) - now) / 3_600_000))} h` : ''}`;
      this.heat.title = 'Tu calor con la policía. Sube con los robos y las piezas robadas a la vista; baja con las horas.';
    }
    const r = rank;
    this.rankPill.hidden = !r || r.of < 1;
    if (r && r.of >= 1) {
      this.rankPill.innerHTML = r.rank > 0 ? `${icon('star')} Puesto ${r.rank}/${r.of}` : `${icon('lock')} Cerrado`;
      this.rankPill.className = `pill rank ${r.rank === 1 ? 'first' : r.rank > 0 && r.rank <= 3 ? 'top' : ''}`;
      this.rankPill.title = r.rank > 0 ? `Tu puesto en el ranking de la ciudad. Recibes ${Math.round((r.factor - 1) * 100) >= 0 ? '+' : ''}${Math.round((r.factor - 1) * 100)}% de gente en la puerta.` : 'Un club cerrado no compite en el ranking.';
    }
    this.netPill.hidden = net.status === 'off' && net.online === 0 && !this.everOnline;
    if (net.status === 'online') this.everOnline = true;
    this.netPill.className = `pill net ${net.status}`;
    this.netPill.innerHTML = `${icon('city')} ${net.status === 'online' ? `${net.online} en línea` : net.status === 'connecting' ? 'Conectando…' : 'Sin conexión'}`;
    this.netPill.title = net.status === 'online' ? 'Jugadores conectados a la ciudad' : 'Jugando solo: el servidor de la ciudad no responde. Seguimos intentando.';
    this.guests.title = 'Dentro del club / aforo máximo, y gente esperando en la puerta';
  }

  /** Hour and weather over the city (follows the player's clock unless chosen in the menu). */
  updateSky(hour: number, weather: Weather, night: number, cycle: { night: boolean; minsLeft: number } | null = null): void {
    const hh = Math.floor(hour) % 24;
    const mm = Math.floor((hour % 1) * 60);
    const ic = weather === 'rain' ? 'rain' : weather === 'cloudy' || weather === 'fog' ? 'cloud' : night > 0.55 ? 'moon' : 'sun';
    const time = cycle ? `${cycle.night ? 'Noche' : 'Día'} · ${cycle.night ? 'amanece' : 'anochece'} en ${Math.max(1, Math.ceil(cycle.minsLeft))} min` : `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.sky.innerHTML = `${icon(ic)} ${time} · ${WEATHER_LABEL[weather]}`;
    this.sky.title = 'Hora y clima de la ciudad';
  }

  updateTracker(missions: MissionView[]): void {
    const first = missions[0];
    this.tracker.replaceChildren();
    this.tracker.classList.toggle('empty', !first);
    if (!first) {
      this.tracker.append(el('b', '', 'Sin misiones por ahora'));
      return;
    }
    const pct = Math.round((first.progress.current / first.progress.target) * 100);
    const head = el('div', 'tr-head');
    head.append(el('span', 'tr-tag', 'Misión'), el('b', '', first.mission.title));
    const bar = el('div', 'bar');
    const fill = el('i');
    fill.style.width = `${pct}%`;
    bar.append(fill);
    const count = el('span', 'count', `${fmt(first.progress.current)}/${fmt(first.progress.target)}`);
    const row = el('div', 'tr-row');
    row.append(bar, count);
    this.tracker.append(head, el('small', '', first.mission.hint), row);
    if (missions.length > 1) this.tracker.append(el('em', 'more', `+${missions.length - 1} más`));
  }
}
