import { button, el } from './dom';
import { icon } from './icons';

export interface ModalHandle {
  body: HTMLElement;
  headExtra: HTMLElement;
  close(): void;
}

const stack: ModalHandle[] = [];

let openHook: (className: string) => void = () => {};
/** Lets the guide know which windows the player has opened. */
export function setModalOpenHook(fn: (className: string) => void): void {
  openHook = fn;
}

/** True while any window is open (keyboard shortcuts of the game should be ignored then). */
export const modalOpen = (): boolean => stack.length > 0;

export function closeModals(): void {
  for (const m of [...stack]) m.close();
}

/** `locked`: the window can only be closed by the code (no X, no Escape, no click outside) — for steps that are required. */
export function openModal(title: string, className = '', onClose?: () => void, locked = false): ModalHandle {
  const host = document.getElementById('modal-root')!;
  const backdrop = el('div', 'backdrop');
  const box = el('div', `modal ${className}`);
  const head = el('div', 'modal-head');
  const headExtra = el('div', 'head-extra');
  const x = button('', 'icon-btn', () => handle.close());
  x.innerHTML = icon('close');
  x.setAttribute('aria-label', 'Cerrar');
  head.append(el('h2', '', title), headExtra, ...(locked ? [] : [x]));
  const body = el('div', 'modal-body');
  box.append(head, body);
  backdrop.append(box);
  host.append(backdrop);

  let closed = false;
  const onKey = (e: KeyboardEvent) => {
    if (!locked && e.key === 'Escape' && stack[stack.length - 1] === handle) handle.close();
  };
  const handle: ModalHandle = {
    body,
    headExtra,
    close() {
      if (closed) return;
      closed = true;
      backdrop.remove();
      window.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(handle), 1);
      onClose?.();
    },
  };
  backdrop.addEventListener('pointerdown', (e) => {
    if (!locked && e.target === backdrop) handle.close();
  });
  window.addEventListener('keydown', onKey);
  stack.push(handle);
  openHook(className);
  return handle;
}
