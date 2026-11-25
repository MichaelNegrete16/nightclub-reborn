import * as THREE from 'three';
import type { Peer } from '../net/client';
import { CELL } from '../core/world';
import { PlayerActor } from './player';
import { canvasTexture } from './comic';
import { isEmote } from '../core/emotes';

/** A floating name plate for a character. */
export function makeNameTag(name: string, color = '#ffffff'): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: canvasTexture(256, 64, (g) => {
        g.fillStyle = 'rgba(14,16,40,.85)';
        g.beginPath();
        g.roundRect(4, 4, 248, 56, 22);
        g.fill();
        g.fillStyle = color;
        g.font = '800 30px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(name.slice(0, 14), 128, 34);
      }),
      depthTest: false,
      transparent: true,
    }),
  );
  sprite.scale.set(2.2, 0.55, 1);
  sprite.position.y = 2.7;
  sprite.renderOrder = 19;
  return sprite;
}

/** The other players walking around the city: one character each, moving smoothly between the positions the server sends. */
export class RemotePlayers {
  readonly group = new THREE.Group();
  readonly actors = new Map<number, { actor: PlayerActor; inside: boolean }>();
  private looks = new Map<number, unknown>();
  /** the club being visited (its owner shows even when inside) */
  visiting: number | null = null;
  /** the dances run at the speed of the music (BPM over 100) */
  tempo = 1;
  /** names of the players, by lot, for the tag over their head */
  names = new Map<number, string>();
  private tags = new Map<number, { sprite: THREE.Sprite; name: string }>();

  /** Who is inside their own club right now (among the people nearby). */
  insideNow(): number[] {
    return [...this.actors].filter(([, a]) => a.inside).map(([n]) => n);
  }

  /** A new list of who is nearby (positions are in each player's own lot, plus their offset in lots from mine). */
  set(peers: Peer[]): void {
    const seen = new Set<number>();
    for (const p of peers) {
      seen.add(p.n);
      let a = this.actors.get(p.n);
      if (!a) {
        const actor = new PlayerActor();
        actor.speed = 3.4;
        this.group.add(actor.group);
        a = { actor, inside: false };
        this.actors.set(p.n, a);
        a.actor.teleport(p.x + p.di * CELL.w, p.z + p.dj * CELL.h);
      }
      if (p.look) {
        this.looks.set(p.n, p.look);
        void a.actor.setLook(p.look);
      }
      a.inside = p.m === 1;
      a.actor.stance = isEmote(p.e) ? p.e : null; // dancing while standing there
      const x = p.x + p.di * CELL.w;
      const z = p.z + p.dj * CELL.h;
      const far = Math.hypot(x - a.actor.x, z - a.actor.z) > 12;
      if (far) a.actor.teleport(x, z);
      else a.actor.path = [[x, z]];
    }
    for (const [n, a] of this.actors) {
      if (seen.has(n)) continue;
      this.group.remove(a.actor.group);
      this.actors.delete(n);
      this.tags.delete(n);
    }
  }

  update(dt: number): void {
    for (const [n, a] of this.actors) {
      a.actor.tempo = this.tempo;
      a.actor.update(dt);
      // someone inside their own club is not out in the street, unless you are visiting that club
      a.actor.group.visible = a.actor.ready && (!a.inside || this.visiting === n);
      this.tag(n, a);
    }
  }

  private tag(n: number, a: { actor: PlayerActor }): void {
    const name = this.names.get(n) ?? 'Jugador';
    let t = this.tags.get(n);
    if (!t || t.name !== name) {
      if (t) {
        a.actor.group.remove(t.sprite);
        t.sprite.material.map?.dispose();
        t.sprite.material.dispose();
      }
      const sprite = makeNameTag(name);
      a.actor.group.add(sprite);
      t = { sprite, name };
      this.tags.set(n, t);
    }
  }

  get count(): number {
    return this.actors.size;
  }

  clear(): void {
    for (const a of this.actors.values()) this.group.remove(a.actor.group);
    this.actors.clear();
  }
}
