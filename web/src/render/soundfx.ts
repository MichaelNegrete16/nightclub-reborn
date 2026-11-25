import * as THREE from 'three';
import { canvasTexture } from './comic';

interface Source {
  group: THREE.Object3D;
  kind: 'speaker' | 'booth';
  bars: THREE.Mesh[];
}

interface Particle {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  kind: 'ring' | 'note';
  vx: number;
  vz: number;
}

const ringTexture = (() => {
  let t: THREE.CanvasTexture | null = null;
  return () =>
    (t ??= canvasTexture(128, 128, (g) => {
      g.strokeStyle = '#fff';
      g.lineWidth = 10;
      g.beginPath();
      g.arc(64, 64, 52, 0, Math.PI * 2);
      g.stroke();
    }));
})();

const noteTextures: THREE.CanvasTexture[] = [];
function noteTexture(i: number): THREE.CanvasTexture {
  return (noteTextures[i] ??= canvasTexture(96, 96, (g) => {
    g.fillStyle = '#fff';
    g.shadowColor = '#000';
    g.shadowBlur = 8;
    g.font = 'bold 72px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(['♪', '♫', '♬'][i % 3], 48, 52);
  }));
}

/**
 * What you SEE of the music: the speakers and the DJ booth thump on the beat, sound rings spread out from them, music
 * notes float up, and the booth has an equalizer. Everything is driven by the beat the audio engine reports.
 */
export class SoundFx {
  readonly group = new THREE.Group();
  private sources: Source[] = [];
  private particles: Particle[] = [];
  private lastBeat = -1;
  private pos = new THREE.Vector3();

  clearSources(): void {
    this.sources = [];
  }

  addSource(group: THREE.Object3D, kind: 'speaker' | 'booth'): void {
    const bars: THREE.Mesh[] = [];
    if (kind === 'booth') {
      // an equalizer on top of the DJ booth
      for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1), new THREE.MeshBasicMaterial({ color: 0x18d8ff }));
        m.userData.outlineParameters = { visible: false };
        m.position.set(-0.5 + i * 0.2, 0.8, -0.28);
        m.scale.y = 0.05;
        group.add(m);
        bars.push(m);
      }
    }
    this.sources.push({ group, kind, bars });
  }

  /** `sound` is null when nothing plays: everything settles. */
  update(dt: number, sound: { beat: number; pulse: number; color: string; bands: number[] } | null): void {
    if (!sound) {
      for (const s of this.sources) {
        s.group.scale.set(1, 1, 1);
        s.bars.forEach((b) => (b.scale.y = 0.05));
      }
    } else {
      const whole = Math.floor(sound.beat);
      const onBeat = whole !== this.lastBeat;
      this.lastBeat = whole;
      for (const s of this.sources) {
        const k = s.kind === 'speaker' ? 0.09 : 0.03;
        s.group.scale.set(1 + k * 0.5 * sound.pulse, 1 + k * sound.pulse, 1 + k * 0.5 * sound.pulse);
        s.bars.forEach((b, i) => {
          const h = 0.08 + 0.45 * sound.bands[i % sound.bands.length];
          b.scale.y = h;
          b.position.y = 0.72 + h / 2;
        });
        if (onBeat && s.kind === 'speaker') this.spawnRing(s, sound.color);
        if (onBeat && whole % 2 === 0 && s.kind === 'booth') this.spawnRing(s, sound.color);
        if (onBeat && Math.random() < 0.4) this.spawnNote(s, sound.color);
      }
    }
    for (const p of [...this.particles]) {
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        this.group.remove(p.sprite);
        p.sprite.material.dispose();
        this.particles.splice(this.particles.indexOf(p), 1);
        continue;
      }
      if (p.kind === 'ring') {
        p.sprite.scale.setScalar(0.5 + t * 3.2);
        p.sprite.material.opacity = 0.7 * (1 - t);
      } else {
        p.sprite.position.x += p.vx * dt;
        p.sprite.position.z += p.vz * dt;
        p.sprite.position.y += dt * 0.9;
        p.sprite.material.opacity = Math.min(1, (1 - t) * 1.6);
      }
    }
  }

  private origin(s: Source): THREE.Vector3 {
    s.group.getWorldPosition(this.pos);
    return this.pos.clone();
  }

  private spawnRing(s: Source, color: string): void {
    if (this.particles.length > 70) return;
    const mat = new THREE.SpriteMaterial({ map: ringTexture(), color, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
    const sprite = new THREE.Sprite(mat);
    const o = this.origin(s);
    sprite.position.set(o.x, s.kind === 'speaker' ? 0.9 : 0.95, o.z);
    sprite.scale.setScalar(0.5);
    this.group.add(sprite);
    this.particles.push({ sprite, age: 0, life: 0.95, kind: 'ring', vx: 0, vz: 0 });
  }

  private spawnNote(s: Source, color: string): void {
    if (this.particles.length > 70) return;
    const mat = new THREE.SpriteMaterial({ map: noteTexture(Math.floor(Math.random() * 3)), color, transparent: true, depthWrite: false, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    const o = this.origin(s);
    sprite.position.set(o.x + (Math.random() - 0.5) * 0.6, 1.5, o.z + (Math.random() - 0.5) * 0.6);
    sprite.scale.setScalar(0.55);
    sprite.renderOrder = 12;
    this.group.add(sprite);
    this.particles.push({ sprite, age: 0, life: 2.4, kind: 'note', vx: (Math.random() - 0.5) * 0.5, vz: (Math.random() - 0.5) * 0.5 });
  }
}
