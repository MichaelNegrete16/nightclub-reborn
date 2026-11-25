import * as THREE from 'three';
import { randomConfig } from '../core/character';
import { PHASES, doorCells } from '../core/club';
import { SIDEWALK_Y } from '../core/guests';
import { buildingOrigin, type Neighbor } from '../core/world';
import { PlayerActor } from './player';

interface Person {
  actor: PlayerActor;
  /** walking into the club: removed when it gets there */
  entering: boolean;
}

interface ClubLine {
  ox: number;
  oz: number;
  mid: number;
  h: number;
  /** how many people the line should have, from how busy the club is */
  want: number;
  line: Person[];
  timer: number;
  seed: number;
}

const MAX_PEOPLE = 40;
const SPACING = 1.05;

/**
 * Life outside the other players' clubs: while a club is open, people walk along the sidewalk, wait in line on the
 * carpet and go in one by one. The length of the line follows how busy that club is. (This is scenery: it is not the
 * other player's real guests, whose simulation only runs on their own computer.)
 */
export class NeighborCrowd {
  readonly group = new THREE.Group();
  private clubs = new Map<number, ClubLine>();
  private total = 0;
  /** most people standing in lines at once (graphics quality) */
  maxPeople = MAX_PEOPLE;
  private rnd = 1;

  private rand(): number {
    this.rnd = (this.rnd * 16807) % 2147483647;
    return this.rnd / 2147483647;
  }

  /** People now standing in lines or walking to them. */
  get count(): number {
    return this.total;
  }

  /** The clubs around: which are open and how busy they are. */
  setClubs(neighbors: Neighbor[]): void {
    const live = new Set<number>();
    for (const nb of neighbors) {
      if (nb.kind !== 'club' || nb.n === undefined || !nb.open || nb.online === false) continue;
      live.add(nb.n);
      const want = Math.min(6, Math.ceil((nb.guests ?? 0) / 6));
      let c = this.clubs.get(nb.n);
      if (!c) {
        const p = PHASES[Math.min(Math.max(nb.phase, 1), PHASES.length) - 1];
        const o = buildingOrigin(nb.cell);
        c = { ox: o.x, oz: o.z, mid: doorCells(p)[0][0] + 0.5, h: p.h, want, line: [], timer: 2 + this.rand() * 4, seed: nb.n };
        this.clubs.set(nb.n, c);
      }
      c.want = want;
    }
    for (const [n, c] of this.clubs) {
      if (live.has(n)) continue;
      this.dismiss(c);
      this.clubs.delete(n);
    }
  }

  private dismiss(c: ClubLine): void {
    for (const p of c.line) this.remove(p);
    c.line = [];
  }

  private remove(p: Person): void {
    this.group.remove(p.actor.group);
    this.total--;
  }

  private spot(c: ClubLine, i: number): [number, number] {
    return [c.ox + c.mid, c.oz + c.h + 1.4 + i * SPACING];
  }

  private arrive(c: ClubLine): void {
    if (this.total >= this.maxPeople) return;
    const actor = new PlayerActor();
    actor.size = 0.85;
    actor.speed = 2.2 + this.rand() * 0.6;
    void actor.setLook(randomConfig(this.rand() < 0.5 ? 'male' : 'female'));
    // they come walking along the sidewalk from one side, then turn up the carpet
    const side = this.rand() < 0.5 ? -1 : 1;
    const sidewalk = c.oz + SIDEWALK_Y;
    actor.teleport(c.ox + c.mid + side * (22 + this.rand() * 8), sidewalk);
    const [sx, sz] = this.spot(c, c.line.length);
    actor.path = [[c.ox + c.mid, sidewalk], [sx, sz]];
    this.group.add(actor.group);
    this.total++;
    c.line.push({ actor, entering: false });
  }

  update(dt: number): void {
    for (const c of this.clubs.values()) {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.timer = 3.5 + this.rand() * 4;
        const front = c.line.find((p) => !p.entering);
        if (front && c.line.filter((p) => !p.entering).length >= Math.min(2, c.want)) {
          // the first in line goes in; everybody else steps forward
          front.entering = true;
          front.actor.path = [[c.ox + c.mid, c.oz + c.h + 0.3], [c.ox + c.mid, c.oz + c.h - 1.2]];
          c.line.filter((p) => !p.entering).forEach((p, i) => (p.actor.path = [this.spot(c, i)]));
        }
        if (c.line.filter((p) => !p.entering).length < c.want) this.arrive(c);
      }
      for (const p of [...c.line]) {
        p.actor.update(dt);
        p.actor.group.visible = p.actor.ready;
        if (p.entering && !p.actor.moving) {
          this.remove(p);
          c.line.splice(c.line.indexOf(p), 1);
        }
      }
    }
  }
}
