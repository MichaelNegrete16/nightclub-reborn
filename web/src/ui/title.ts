import { button, el } from './dom';

/** Title screen for a new game: asks the player's name. */
export function showTitle(defaultName: string): Promise<string> {
  return new Promise((resolve) => {
    const root = document.getElementById('dialogue-root')!;
    const wrap = el('div', 'title-screen');
    const logo = el('h1', 'logo');
    logo.innerHTML = '<span>NIGHTCLUB</span><span class="b">REBORN</span>';
    const tag = el('p', 'tagline', 'Del sótano al escenario más grande del mundo.');
    const form = el('form', 'name-form');
    const label = el('label', '', '¿Cómo te llamamos, DJ?');
    const input = el('input', 'name-input') as HTMLInputElement;
    input.maxLength = 16;
    input.value = defaultName;
    input.placeholder = 'Tu nombre de DJ';
    input.autocomplete = 'off';
    const go = button('Comenzar', 'btn primary big', () => submit());
    go.type = 'submit';
    form.append(label, input, go);
    wrap.append(logo, tag, form);
    root.append(wrap);
    setTimeout(() => input.select(), 50);

    const submit = () => {
      const name = input.value.trim().slice(0, 16) || 'DJ';
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 300);
      resolve(name);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit();
    });
  });
}
