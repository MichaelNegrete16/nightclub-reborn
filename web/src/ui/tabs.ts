import { el } from './dom';

export interface TabDef {
  id: string;
  label: string;
}

export interface Tabs {
  bar: HTMLElement;
  /** the id of the tab that is showing */
  current(): string;
  select(id: string): void;
  /** small text after a tab's name (a count, a "!") */
  badge(id: string, text: string): void;
}

/** A row of tabs: only the page of the chosen one shows. `pages` maps a tab id to its page; the pages stay in the DOM. */
export function makeTabs(defs: TabDef[], pages: Record<string, HTMLElement>, start = defs[0].id, onChange: (id: string) => void = () => {}): Tabs {
  const bar = el('div', 'tabs');
  bar.setAttribute('role', 'tablist');
  const btns = new Map<string, HTMLButtonElement>();
  const marks = new Map<string, HTMLElement>();
  let cur = start;
  const select = (id: string) => {
    cur = id;
    for (const [k, b] of btns) {
      b.classList.toggle('on', k === id);
      b.setAttribute('aria-selected', String(k === id));
    }
    for (const [k, p] of Object.entries(pages)) p.hidden = k !== id;
    onChange(id);
  };
  for (const d of defs) {
    const b = el('button', 'tab');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    const mark = el('small', 'tab-badge');
    mark.hidden = true;
    b.append(el('span', '', d.label), mark);
    b.addEventListener('click', () => select(d.id));
    btns.set(d.id, b);
    marks.set(d.id, mark);
    bar.append(b);
  }
  select(start);
  return { bar, current: () => cur, select, badge: (id, text) => { const m = marks.get(id); if (m) { m.textContent = text; m.hidden = !text; } } };
}
