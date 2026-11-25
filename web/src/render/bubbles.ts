import * as THREE from 'three';
import { canvasTexture } from './comic';

interface Bubble {
  sprite: THREE.Sprite;
  born: number;
  height: number;
}

const LIFE = 9; // seconds a line stays over a head
const MAX = 3; // lines stacked over one head

function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (g.measureText(t).width > width && line) {
      lines.push(line);
      line = word;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

/** The speech balloon of one line: the speaker's name in colour, then the words. */
function balloon(name: string, text: string, color: string): { tex: THREE.CanvasTexture; w: number; h: number } {
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = '700 26px system-ui, sans-serif';
  const lines = wrap(probe, text, 330);
  const w = 380;
  const h = 56 + lines.length * 32;
  const tex = canvasTexture(w, h + 18, (g) => {
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#14122c';
    g.lineWidth = 5;
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, 22);
    g.fill();
    g.stroke();
    // the little tail pointing at the speaker
    g.beginPath();
    g.moveTo(w / 2 - 12, h - 6);
    g.lineTo(w / 2, h + 12);
    g.lineTo(w / 2 + 12, h - 6);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(w / 2 - 12, h - 5);
    g.lineTo(w / 2, h + 12);
    g.lineTo(w / 2 + 12, h - 5);
    g.stroke();
    g.fillStyle = color;
    g.font = '800 24px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(name.slice(0, 16), w / 2, 36);
    g.fillStyle = '#14122c';
    g.font = '700 26px system-ui, sans-serif';
    lines.forEach((l, i) => g.fillText(l, w / 2, 68 + i * 32));
  });
  return { tex, w, h: h + 18 };
}

/** Speech balloons over characters, Habbo style: new lines appear on top and push the older ones up, then fade. */
export class Bubbles {
  private by = new Map<THREE.Object3D, Bubble[]>();

  say(who: THREE.Object3D, name: string, text: string, color = '#c01c75', now = performance.now() / 1000): void {
    const { tex, w, h } = balloon(name, text, color);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const height = (h / w) * 3.2;
    sprite.scale.set(3.2, height, 1);
    sprite.renderOrder = 30;
    who.add(sprite);
    const list = this.by.get(who) ?? [];
    list.push({ sprite, born: now, height });
    while (list.length > MAX) this.drop(who, list, list[0]);
    this.by.set(who, list);
    this.layout(list);
  }

  private drop(who: THREE.Object3D, list: Bubble[], b: Bubble): void {
    who.remove(b.sprite);
    b.sprite.material.map?.dispose();
    b.sprite.material.dispose();
    list.splice(list.indexOf(b), 1);
  }

  private layout(list: Bubble[]): void {
    let y = 3.55; // above the name tag
    for (let i = list.length - 1; i >= 0; i--) {
      list[i].sprite.position.y = y + list[i].height / 2;
      y += list[i].height + 0.08;
    }
  }

  update(now = performance.now() / 1000): void {
    for (const [who, list] of this.by) {
      for (const b of [...list]) {
        const age = now - b.born;
        if (age > LIFE) this.drop(who, list, b);
        else b.sprite.material.opacity = age > LIFE - 1.5 ? (LIFE - age) / 1.5 : 1;
      }
      this.layout(list);
      if (!list.length) this.by.delete(who);
    }
  }
}
