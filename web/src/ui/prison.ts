import type { CharacterConfig, ChoreAnim } from '../core/character';
import type { ClubView } from '../render/club';
import { button, el } from './dom';

const CHORES: Array<{ id: ChoreAnim; icon: string; name: string }> = [
  { id: 'scrub', icon: '🚽', name: 'Limpiar baños' },
  { id: 'mop', icon: '🧹', name: 'Trapear' },
  { id: 'wash', icon: '🍽️', name: 'Lavar platos' },
  { id: 'fold', icon: '👕', name: 'Doblar ropa' },
  { id: 'paint', icon: '🎨', name: 'Pintar pared' },
  { id: 'sweep', icon: '🍂', name: 'Barrer patio' },
];

/**
 * The prison, as the player lives it: while the server says they are detained, the camera goes to the prison building and the character
 * (in an orange suit) walks to the place of each chore and works there with its own animation. The buttons choose the chore; the
 * server counts them (one every few seconds at most) and the last one opens the door. The more chores, the sooner out.
 */
export class Prison {
  private root: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private fill: HTMLElement | null = null;
  private count: HTMLElement | null = null;
  private buttons: HTMLButtonElement[] = [];
  private waiting = false;
  private note = '';

  constructor(private host: HTMLElement, private club: ClubView, private sendChore: () => void, private look: () => CharacterConfig) {
    club.onChoreProgress = (p) => {
      if (this.status && p !== null) this.status.textContent = `${this.doing} ${Math.round(p * 100)}%`;
      this.lock();
    };
    club.onChoreDone = () => {
      this.waiting = true;
      if (this.status) this.status.textContent = 'Tarea hecha: avisando al guardia…';
      this.sendChore();
      window.setTimeout(() => this.waiting && this.answered({ ok: false, error: 'El guardia no respondió: inténtalo otra vez.', done: this.club.crime.chores, goal: this.club.crime.choreGoal, released: false }), 6000);
      this.lock();
    };
  }

  private doing = '';

  get inside(): boolean {
    return this.club.crime.detainedUntil > Date.now() && this.club.crime.choreGoal > 0;
  }

  /** Call whenever the crime record changes: goes in or out of the prison and redraws the progress. */
  update(): void {
    if (!this.inside) {
      if (this.club.prison) this.club.leavePrison(this.look());
      if (this.root) {
        this.root.remove();
        this.root = null;
        document.body.classList.remove('in-prison');
      }
      this.waiting = false;
      return;
    }
    if (!this.club.prison) this.club.enterPrison(this.look());
    if (!this.root) this.build();
    this.draw();
  }

  /** The server answered a chore. */
  answered(r: { ok: boolean; error?: string; done: number; goal: number; released: boolean }): void {
    this.waiting = false;
    if (r.ok && !r.released) this.club.crime = { ...this.club.crime, chores: r.done, choreGoal: r.goal };
    if (r.ok && r.released) this.club.crime = { ...this.club.crime, detainedUntil: 0, closedUntil: 0, choreGoal: 0, chores: 0 };
    this.note = r.ok ? (r.released ? '' : '¡Tarea hecha! Una menos.') : r.error ?? '';
    this.update();
  }

  private build(): void {
    document.body.classList.add('in-prison');
    const root = el('div', 'prison-hud');
    const top = el('div', 'prison-top');
    const head = el('div', 'prison-title');
    head.append(el('h2', '', 'Prisión'), el('p', '', 'Haz tareas para salir: entre más hagas, más rápido sales.'));
    this.count = el('b', 'prison-count', '');
    const bar = el('div', 'bar');
    this.fill = el('i');
    bar.append(this.fill);
    top.append(head, this.count, bar);
    this.status = el('div', 'prison-status', '');
    const row = el('div', 'prison-row');
    this.buttons = CHORES.map((c) => {
      const b = button('', 'prison-pick', () => this.pick(c.id, c.name));
      b.append(el('span', 'prison-icon', c.icon), el('b', '', c.name));
      row.append(b);
      return b;
    });
    root.append(top, this.status, row);
    this.root = root;
    this.host.append(root);
  }

  private pick(id: ChoreAnim, name: string): void {
    if (this.waiting || this.club.working) return;
    this.doing = `${name}…`;
    this.note = '';
    if (this.club.startChore(id) && this.status) this.status.textContent = `Yendo a: ${name}`;
    this.lock();
  }

  private lock(): void {
    const busy = this.waiting || this.club.working;
    for (const b of this.buttons) b.disabled = busy;
  }

  private draw(): void {
    const c = this.club.crime;
    const goal = c.choreGoal || 20;
    if (this.count) this.count.textContent = `${c.chores} de ${goal} tareas`;
    if (this.fill) this.fill.style.width = `${Math.round((c.chores / goal) * 100)}%`;
    this.club.prison?.setProgress(c.chores / goal);
    if (this.status && !this.club.working && !this.waiting) {
      const left = Math.max(0, c.detainedUntil - Date.now());
      this.status.textContent = this.note || `Elige una tarea. Si no haces ninguna, sales solo en ${Math.floor(left / 3_600_000)} h ${Math.round((left % 3_600_000) / 60000)} min. Tu club está cerrado.`;
    }
    this.lock();
  }
}
