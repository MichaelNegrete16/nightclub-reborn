import { GENRES, GENRE_BY_ID, allTracks, type Genre, type Track } from '../core/music';
import { authHeaders } from '../net/session';
import { saveFile } from '../audio/files';
import { guestId, httpBase } from '../net/client';
import { button, el } from './dom';
import { icon } from './icons';
import { openModal } from './modal';
import { reactive } from './live';
import type { Ctx } from './shop';

const SOURCE_LABEL = { builtin: 'Del club', youtube: 'YouTube', spotify: 'Spotify', file: 'Tu archivo (solo tú)', url: 'Link de audio', cloud: 'Subida a la ciudad', song: 'Canción del juego' } as const;

/** The music window: what plays, the playlist, adding links, and what the crowd likes. */
export function openMusic(ctx: Ctx): void {
  const club = ctx.club;
  let unsub = () => {};
  const modal = openModal('Música', 'music', () => unsub());
  const rating = el('div', 'pill rating');
  modal.headExtra.append(rating);

  const now = el('section', 'mu-now');
  const crowd = el('section', 'mu-crowd');
  const list = el('section', 'mu-list');
  const add = el('section', 'mu-add');
  modal.body.append(now, crowd, list, add);

  // ---- add form ----
  let genre: Genre = 'reggaeton';
  const title = el('input', 'mu-input') as HTMLInputElement;
  title.placeholder = 'Nombre de la canción (opcional)';
  const bpm = el('input', 'mu-input mu-bpm') as HTMLInputElement;
  bpm.type = 'number';
  bpm.min = '60';
  bpm.max = '200';
  bpm.value = String(GENRE_BY_ID.get(genre)!.bpm);
  const chips = el('div', 'mu-chips');
  const msg = el('p', 'mu-msg');
  const drawChips = () => {
    chips.replaceChildren(
      ...GENRES.map((g) => {
        const b = button(g.label, `mu-chip${g.id === genre ? ' on' : ''}`, () => {
          genre = g.id;
          bpm.value = String(g.bpm);
          drawChips();
        });
        b.style.setProperty('--c', g.color);
        return b;
      }),
    );
  };
  drawChips();
  const hint = el('p', 'mu-hint', 'Elige el género real de la canción: tus invitados reaccionan según su gusto. Pon el BPM para que las luces y los parlantes vayan al compás.');
  const row = el('div', 'mu-row');
  row.append(title, bpm);
  // songs from this computer: the surest way, since YouTube refuses many videos outside its own site
  const picker = el('input', 'mu-file') as HTMLInputElement;
  picker.type = 'file';
  picker.accept = 'audio/*';
  picker.multiple = true;
  picker.hidden = true;
  picker.addEventListener('change', async () => {
    let added = 0;
    for (const f of [...(picker.files ?? [])]) {
      if (f.size > 15 * 1024 * 1024) {
        msg.textContent = `"${f.name}" pesa más de 15 MB: el servidor no la acepta. Usa un archivo más liviano.`;
        continue;
      }
      // online, the song goes to the city server: everybody hears the same file, in sync, without YouTube
      const base = httpBase();
      if (base && club.net.status === 'online') {
        msg.textContent = `Subiendo "${f.name}"…`;
        try {
          const r = await fetch(`${base}/upload?pid=${guestId()}&title=${encodeURIComponent(f.name.slice(0, 60))}`, { method: 'POST', body: f, headers: authHeaders() });
          const j = (await r.json()) as { id?: string; error?: string };
          if (!r.ok || !j.id) {
            msg.textContent = j.error ?? 'No se pudo subir la canción.';
            continue;
          }
          const err = club.addCloudSong(j.id, title.value || f.name.replace(/\.[^.]+$/, ''), genre, Number(bpm.value));
          if (err) msg.textContent = err;
          else added++;
          continue;
        } catch {
          msg.textContent = 'No se pudo subir al servidor: inténtalo otra vez. (Un archivo guardado solo en tu navegador no lo oyen tus visitantes.)';
          continue;
        }
      }
      const id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      try {
        await saveFile(id, f);
      } catch {
        msg.textContent = 'El navegador no dejó guardar el archivo (¿modo privado?).';
        continue;
      }
      const err = club.addLocalSong(id, title.value || f.name.replace(/\.[^.]+$/, ''), genre, Number(bpm.value));
      if (err) msg.textContent = err;
      else added++;
    }
    if (added) msg.textContent = added === 1 ? '¡Canción agregada y sonando!' : `¡${added} canciones agregadas!`;
    title.value = '';
    picker.value = '';
  });
  const upload = button('Subir canciones (las oye toda la ciudad)', 'mu-primary alt', () => picker.click());
  add.append(el('h3', '', 'Subir tu propia música'), row, chips, hint, upload, picker, msg);
  add.append(el('p', 'mu-hint', 'Las canciones del juego ya están en la lista y suenan igual para todos. Si quieres, sube las tuyas (con permiso; máximo 15 MB y 10 por jugador): se guardan en el servidor y las oyen tus visitantes igual y sin cortes.'));

  const trackRow = (t: Track, playingId: string | null) => {
    const g = GENRE_BY_ID.get(t.genre)!;
    const r = el('div', `mu-track${t.id === playingId ? ' on' : ''}`);
    const dot = el('i', 'mu-dot');
    dot.style.background = g.color;
    const text = el('div', 'mu-text');
    const bad = club.music.failed.has(t.id);
    text.append(el('b', '', t.title), el('small', '', bad ? '⚠ No se pudo reproducir esta canción.' : `${g.label} · ${t.bpm} BPM · ${SOURCE_LABEL[t.source]}`));
    if (bad) r.classList.add('failed');
    const play = button('', 'mu-btn', () => club.playTrack(t.id));
    play.innerHTML = icon(t.id === playingId ? 'music' : 'play');
    play.title = 'Poner esta canción';
    r.append(dot, text, play);
    if (t.source !== 'builtin' && t.source !== 'song') {
      const del = button('', 'mu-btn danger', () => club.removeSong(t.id));
      del.innerHTML = icon('close');
      del.title = 'Quitar de la playlist';
      r.append(del);
    }
    return r;
  };

  const draw = () => {
    const s = club.state;
    const m = s.music;
    const playing = club.music.track;
    const g = playing ? GENRE_BY_ID.get(playing.genre) : null;
    now.replaceChildren();
    const head = el('div', 'mu-now-head');
    head.append(el('small', '', m.playing ? 'Sonando ahora' : 'En pausa'), el('b', '', club.nowPlaying ?? 'Nada suena: tus invitados se aburren'));
    if (g) head.style.setProperty('--c', g.color);
    const controls = el('div', 'mu-controls');
    const mk = (ic: string, label: string, fn: () => void) => {
      const b = button('', 'mu-btn big', fn);
      b.innerHTML = icon(ic);
      b.title = label;
      return b;
    };
    controls.append(mk('prev', 'Anterior', () => club.skip(-1)), mk(m.playing ? 'pause' : 'play', m.playing ? 'Pausar' : 'Reproducir', () => club.togglePlay()), mk('next', 'Siguiente', () => club.skip(1)));
    const vol = el('input', 'mu-vol') as HTMLInputElement;
    vol.type = 'range';
    vol.min = '0';
    vol.max = '100';
    vol.value = String(Math.round(m.volume * 100));
    vol.title = 'Volumen';
    vol.addEventListener('input', () => club.setMusicVolume(Number(vol.value) / 100));
    now.append(head, controls, vol);

    list.replaceChildren(el('h3', '', 'Canciones'));
    const all = allTracks(m);
    const playingId = m.playing ? m.current : null;
    for (const t of all) list.append(trackRow(t, playingId));
  };
  const live = () => {
    rating.innerHTML = `${icon('star')} ${club.rating}`;
    crowd.replaceChildren(el('h3', '', 'Lo que le gusta a tu público'));
    const tastes = club.crowdTastes();
    const bars = el('div', 'mu-bars');
    for (const t of tastes) {
      const gg = GENRE_BY_ID.get(t.genre)!;
      const b = el('div', 'mu-bar');
      const fill = el('i');
      fill.style.height = `${Math.max(4, Math.round(t.share * 100))}%`;
      fill.style.background = gg.color;
      b.append(fill, el('small', '', gg.label), el('span', '', `${Math.round(t.share * 100)}%`));
      bars.append(b);
    }
    crowd.append(bars, el('p', 'mu-hint', 'Mira los globos sobre sus cabezas: ♥ les encanta, ♪ les gusta, ✖ no lo soportan, z z se aburren. Un ambiente alto atrae más gente y, por encima de 78, a los famosos.'));

  };
  unsub = reactive(
    ctx,
    // the volume is left out on purpose: dragging the slider changes it, and redrawing then would cut the drag
    () => { const m = club.state.music; return JSON.stringify([m.current, m.playing, m.tracks, club.nowPlaying, [...club.music.failed]]); },
    draw,
    live,
  );
}
