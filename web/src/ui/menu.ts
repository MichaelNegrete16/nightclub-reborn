import { button, el } from './dom';
import { WEATHER_LABEL, type EnvSetting, type Weather } from '../render/environment';
import { openModal } from './modal';
import { openGuide } from './guide';
import { openNews } from './news';
import { openAccount } from './account';
import { getPreference, setPreference, type Preference } from '../render/quality';
import { describe as describeSave } from '../net/cloud';
import { restoreGame } from '../net/restore';
import type { Ctx } from './shop';

export interface MenuDeps {
  ctx: Ctx;
  replayIntro(): void;
  restart(): void;
}

function confirmDialog(message: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v: boolean) => {
      if (answered) return;
      answered = true;
      resolve(v);
      modal.close();
    };
    const modal = openModal('¿Seguro?', 'confirm', () => answer(false));
    modal.body.append(el('p', '', message));
    const row = el('div', 'actions');
    row.append(button('Cancelar', 'btn', () => answer(false)), button(confirmLabel, 'btn danger', () => answer(true)));
    modal.body.append(row);
  });
}

export function openMenu(deps: MenuDeps): void {
  const club = deps.ctx.club;
  const modal = openModal('Menú', 'menu');
  const body = modal.body;

  const sec = (title: string) => {
    const s = el('section', 'menu-sec');
    s.append(el('h3', '', title));
    body.append(s);
    return s;
  };

  const game = sec('Partida');
  const guestsBtn = button(club.showGuests ? 'Invitados: sí' : 'Invitados: no', 'btn', () => {
    club.toggleGuests();
    guestsBtn.textContent = club.showGuests ? 'Invitados: sí' : 'Invitados: no';
  });
  game.append(
    guestsBtn,
    button('Novedades', 'btn', () => {
      modal.close();
      openNews(deps.ctx);
    }),
    button('Guía del juego', 'btn', () => {
      modal.close();
      openGuide(deps.ctx);
    }),
    button('Ver la historia otra vez', 'btn', () => {
      modal.close();
      deps.replayIntro();
    }),
    button('Empezar de cero', 'btn danger', async () => {
      if (await confirmDialog('Se borrará todo tu progreso: club, objetos, niveles y misiones. No se puede deshacer.', 'Sí, borrar todo')) {
        modal.close();
        deps.restart();
      }
    }),
  );
  game.append(el('p', 'sub', 'Tu partida se guarda sola en este navegador.'));

  const accountSec = sec('Cuenta');
  accountSec.append(
    el('p', 'sub', 'Protege tu club con una passkey y juega con tu progreso desde el celular y el computador.'),
    button('Mi cuenta', 'btn primary', () => {
      modal.close();
      openAccount(deps.ctx);
    }),
  );

  // the copy of the game on the server, and the recovery code
  const cloudSec = sec('Partida en la nube');
  const cloud = club.cloud;
  if (!cloud || club.net.status !== 'online') {
    cloudSec.append(el('p', 'sub', 'Se activa cuando estás en línea. Tu partida se guarda en este navegador.'));
  } else {
    const status = el('p', 'sub', 'Mirando la nube…');
    const refresh = async () => {
      const f = cloud.info ?? (await cloud.peek());
      status.textContent = cloud.problem || (f ? `Guardada en la nube: ${describeSave(f.meta)} (${new Date(f.at).toLocaleString('es-CO')}).` : 'Todavía no hay copia en la nube: se hace sola cada 30 segundos.');
    };
    void refresh();
    cloudSec.append(
      status,
      button('Guardar ahora', 'btn', async () => {
        status.textContent = 'Guardando…';
        await cloud.sync(true);
        void refresh();
      }),
      el('p', 'sub', 'Tu código de recuperación (guárdalo: con él recuperas tu partida en otro computador o si se borra el navegador):'),
    );
    const code = el('input', 'mu-input') as HTMLInputElement;
    code.readOnly = true;
    code.value = cloud.code;
    code.addEventListener('focus', () => code.select());
    cloudSec.append(code);
    const entry = el('input', 'mu-input') as HTMLInputElement;
    entry.placeholder = 'Pega aquí un código para recuperar una partida';
    cloudSec.append(
      entry,
      button('Recuperar esa partida', 'btn danger', async () => {
        const c = entry.value.trim();
        if (!/^[A-Za-z0-9_-]{8,40}$/.test(c)) return void (status.textContent = 'Ese código no es válido.');
        const game = await cloud.fetchGame(c);
        if (!game) return void (status.textContent = 'No hay ninguna partida guardada con ese código.');
        if (!(await confirmDialog(`Esto reemplaza tu partida de este navegador por la guardada (${describeSave(game.meta)}). Tu partida actual se perdería. ¿Seguimos?`, 'Sí, recuperar'))) return;
        restoreGame(game.state, c); // from now on this browser IS that player
      }),
    );
  }

  const envSec = sec('Ambiente');
  const env = club.env;
  const chipRow = (label: string, options: Array<[string, EnvSetting['time'] | EnvSetting['weather']]>, key: 'time' | 'weather') => {
    envSec.append(el('p', 'sub', label));
    const row = el('div', 'chips');
    const buttons = options.map(([text, value]) => {
      const b = button(text, 'chip', () => {
        env.apply({ ...env.setting, [key]: value } as EnvSetting);
        localStorage.setItem('nc.env.v1', JSON.stringify(env.setting));
        paint();
      });
      row.append(b);
      return { b, value };
    });
    const paint = () => buttons.forEach(({ b, value }) => b.classList.toggle('on', env.setting[key] === value));
    paint();
    envSec.append(row);
  };
  if (env.cityOffsetMs !== null) {
    envSec.append(el('p', 'sub', 'Estás en línea: la hora y el clima los decide la ciudad y son iguales para todos los jugadores. Para elegirlos tú, juega sin conexión.'));
  } else {
    chipRow('Hora', [['Real', 'auto'], ['Mañana', 9], ['Tarde', 17.5], ['Noche', 23]], 'time');
    chipRow('Clima', [['Real', 'auto'], ...(['clear', 'cloudy', 'rain', 'fog'] as Weather[]).map((w) => [WEATHER_LABEL[w], w] as [string, Weather])], 'weather');
    envSec.append(el('p', 'sub', '"Real" sigue la hora de tu equipo y un clima que cambia cada pocas horas.'));
  }

  const gfx = sec('Gráficos');
  gfx.append(el('p', 'sub', 'Si el juego va lento o tu computador es modesto, baja la calidad. En Automático el juego la ajusta solo.'));
  const gfxRow = el('div', 'chips');
  const gfxOpts: Array<[string, Preference]> = [['Automático', 'auto'], ['Alto', 'high'], ['Medio', 'medium'], ['Bajo', 'low']];
  gfxOpts.forEach(([text, value]) => {
    const b = button(text, 'chip', () => {
      if (value === getPreference()) return;
      setPreference(value);
      location.reload(); // the smoothing of edges is chosen when the game starts
    });
    b.classList.toggle('on', value === getPreference());
    gfxRow.append(b);
  });
  gfx.append(gfxRow, el('p', 'sub', 'Al cambiar, el juego se recarga (tu partida se guarda sola).'));

}
