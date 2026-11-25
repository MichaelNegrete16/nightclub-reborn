import { fillText, SPEAKERS, type Scene } from '../core/story';
import { button, el } from './dom';

export interface DialogueEnv {
  name: string;
  /** portrait picture (data URL) for a speaker id; null for the narrator */
  portrait(who: string): Promise<string | null>;
  /** comic panel picture for a shot id; null if there is none */
  shot(id: string): Promise<string | null>;
  /** start drawing panels in the background */
  prefetch(ids: string[]): void;
  /** page tint for a shot (flashbacks are sepia) */
  filter(id: string): string | undefined;
}

/** Colour behind a character when a line has no comic panel of its own. */
const BACKDROP: Record<string, string> = {
  beto: 'linear-gradient(135deg, #7a4a1a, #2a1608)',
  rosa: 'linear-gradient(135deg, #c0431f, #3a1208)',
  zeta: 'linear-gradient(135deg, #7a1a4a, #1a0820)',
  you: 'linear-gradient(135deg, #0f7a9c, #0a1a40)',
};

/**
 * A comic page: one big panel per moment of the story (a 3D picture), with captions for the narrator and speech balloons
 * for the characters. Resolves with the player's motive, if the scene asked for one.
 */
export function playScene(scene: Scene, env: DialogueEnv): Promise<string | undefined> {
  return new Promise((resolve) => {
    const root = document.getElementById('dialogue-root')!;
    const wrap = el('div', 'dialogue comic');
    const head = el('div', 'cm-head');
    head.append(el('span', 'cm-title', scene.title));
    const skip = button('Saltar', 'dlg-skip', () => finish());
    head.append(skip);

    const page = el('div', 'cm-page');
    const panel = el('div', 'cm-panel main');
    const img = el('img', 'cm-img') as HTMLImageElement;
    img.draggable = false;
    const fallback = el('div', 'cm-fallback');
    const portrait = el('img', 'cm-portrait') as HTMLImageElement;
    portrait.draggable = false;
    fallback.append(portrait);
    const halftone = el('div', 'cm-halftone');
    const inset = el('div', 'cm-panel inset');
    const insetImg = el('img', 'cm-img') as HTMLImageElement;
    insetImg.draggable = false;
    inset.append(insetImg, el('div', 'cm-halftone'));
    panel.append(img, fallback, halftone, inset);

    const words = el('div', 'cm-words');
    const caption = el('div', 'cm-caption');
    const bubble = el('div', 'cm-bubble');
    const tag = el('span', 'cm-tag');
    const text = el('p', 'cm-text');
    bubble.append(tag, text);
    words.append(caption, bubble);
    const choices = el('div', 'dlg-choices');
    const hint = el('div', 'dlg-hint', 'Toca o pulsa Espacio para continuar');
    page.append(panel, words, choices, hint);
    wrap.append(head, page);
    root.append(wrap);

    let motive: string | undefined;
    let index = -1;
    let typing = false;
    let timer = 0;
    let full = '';
    let target: HTMLElement = bubble;
    let waitingChoice = false;
    let done = false;
    let shotId = '';
    let insetId = '';

    const lines = () => scene.lines.filter((l) => !l.onlyIf || l.onlyIf === motive);

    env.prefetch([...new Set(scene.lines.flatMap((l) => [l.shot, l.inset]).filter((x): x is string => !!x))]);

    const finish = () => {
      if (done) return;
      done = true;
      window.clearInterval(timer);
      window.removeEventListener('keydown', onKey);
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 280);
      resolve(motive);
    };

    const typeOut = (node: HTMLElement, s: string) => {
      target = node;
      full = s;
      node.textContent = '';
      typing = true;
      wrap.dataset.typing = 'true';
      let i = 0;
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        i += 2;
        node.textContent = s.slice(0, i);
        if (i >= s.length) {
          window.clearInterval(timer);
          typing = false;
          wrap.dataset.typing = 'false';
        }
      }, 22);
    };

    /** Show the picture for this line: a comic panel if there is one, otherwise the speaker on a coloured backdrop. */
    const showPicture = async (who: string, id: string | undefined) => {
      const want = id ?? shotId;
      const pic = want ? await env.shot(want) : null;
      if (done) return;
      if (want !== shotId || (!pic && who !== 'narrator')) {
        shotId = want;
        panel.classList.remove('enter');
        void panel.offsetWidth; // restart the cut animation
        panel.classList.add('enter');
      }
      if (pic) {
        img.src = pic;
        img.style.display = '';
        img.className = `cm-img${env.filter(want) ? ` ${env.filter(want)}` : ''}`;
        fallback.style.display = 'none';
      } else {
        img.style.display = 'none';
        fallback.style.display = '';
        fallback.style.background = BACKDROP[who] ?? BACKDROP.you;
        const p = who === 'narrator' ? null : await env.portrait(who);
        if (done) return;
        portrait.style.display = p ? '' : 'none';
        portrait.classList.toggle('right', who === 'you');
        if (p) portrait.src = p;
      }
    };

    const showInset = async (id: string | undefined) => {
      if (id === undefined || id === insetId) return;
      insetId = id;
      const pic = id ? await env.shot(id) : null;
      if (done) return;
      if (pic) {
        insetImg.src = pic;
        inset.classList.remove('enter');
        void inset.offsetWidth;
        inset.classList.add('show', 'enter');
      } else {
        inset.classList.remove('show');
      }
    };

    const next = async () => {
      if (done || waitingChoice) return;
      if (typing) {
        window.clearInterval(timer);
        target.textContent = full;
        typing = false;
        wrap.dataset.typing = 'false';
        return;
      }
      index++;
      const line = lines()[index];
      if (!line) return finish();
      const who = line.who as string;
      const sp = SPEAKERS[who];
      wrap.dataset.who = who;
      wrap.dataset.line = String(index);
      await Promise.all([showPicture(who, line.shot), showInset(line.inset)]);
      if (done) return;

      const narrator = who === 'narrator';
      caption.style.display = narrator ? '' : 'none';
      bubble.style.display = narrator ? 'none' : '';
      bubble.classList.toggle('right', who === 'you');
      bubble.dataset.who = who;
      tag.textContent = sp?.name ? fillText(sp.name, { name: env.name, motive }) : '';
      typeOut(narrator ? caption : text, fillText(line.text, { name: env.name, motive }));

      choices.replaceChildren();
      hint.style.display = line.choice ? 'none' : '';
      if (line.choice) {
        waitingChoice = true;
        for (const c of line.choice) {
          choices.append(
            button(c.label, 'dlg-choice', () => {
              motive = c.value;
              waitingChoice = false;
              choices.replaceChildren();
              next();
            }),
          );
        }
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    panel.addEventListener('pointerdown', () => next());
    words.addEventListener('pointerdown', () => next());
    next();
  });
}
