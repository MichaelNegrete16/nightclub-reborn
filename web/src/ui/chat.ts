import { button, el } from './dom';

export interface Line {
  name: string;
  text: string;
  mine: boolean;
}

/** The chat box: the last lines of conversation and a field to write. Enter opens it, Enter sends, Escape leaves it. */
export class ChatBox {
  readonly root = el('div', 'chat');
  private log = el('div', 'chat-log');
  private input = el('input', 'chat-input') as HTMLInputElement;
  private lines: Array<{ node: HTMLElement; at: number }> = [];
  onSend: (text: string) => void = () => {};

  constructor(host: HTMLElement) {
    this.input.placeholder = 'Escribe aquí… (Enter para hablar)';
    this.input.maxLength = 100;
    this.input.autocomplete = 'off';
    const send = button('', 'chat-send', () => this.submit());
    send.textContent = 'Enviar';
    const row = el('div', 'chat-row');
    row.append(this.input, send);
    this.root.append(this.log, row);
    host.append(this.root);
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // typing must not trigger the game's shortcuts
      if (e.key === 'Enter') this.submit();
      else if (e.key === 'Escape') this.input.blur();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (document.querySelector('.dialogue, .title-screen, .backdrop')) return;
      e.preventDefault();
      this.input.focus();
    });
    window.setInterval(() => this.fade(), 1000);
  }

  private submit(): void {
    const text = this.input.value.trim();
    this.input.value = '';
    if (text) this.onSend(text);
    this.input.blur();
  }

  add(line: Line): void {
    const node = el('div', `chat-line${line.mine ? ' mine' : ''}`);
    node.append(el('b', '', line.name), document.createTextNode(` ${line.text}`));
    this.log.append(node);
    this.lines.push({ node, at: Date.now() });
    while (this.lines.length > 6) this.lines.shift()!.node.remove();
  }

  /** Old lines melt away so the screen stays clear (typing keeps them all visible). */
  private fade(): void {
    const focused = document.activeElement === this.input;
    for (const l of this.lines) l.node.classList.toggle('old', !focused && Date.now() - l.at > 14000);
  }
}
