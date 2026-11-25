// The game's own tracks: a small step sequencer on the Web Audio API (drums, bass, a chord or lead), one pattern per
// genre. They loop forever and give the view an exact beat to dance to. No audio files needed.

import type { Genre } from '../core/music';

interface Pattern {
  /** 16 steps per bar: 1 = hit */
  kick: number[];
  snare: number[];
  hat: number[];
  /** bass note per step (semitones above the root, or -1 for none) */
  bass: number[];
  /** chord shape played on the first step of each bar (semitones) and how often */
  chord: number[];
  /** root note (MIDI) for each of the 4 bars */
  roots: number[];
  wave: OscillatorType;
  swing: number;
}

const X = (s: string) => s.split('').map((c) => (c === 'x' ? 1 : 0));
const B = (s: string) => s.split(' ').map((c) => (c === '.' ? -1 : Number(c)));

const PATTERNS: Record<Genre, Pattern> = {
  reggaeton: {
    kick: X('x...x...x...x...'), snare: X('...x..x....x..x.'), hat: X('x.x.x.x.x.x.x.x.'),
    bass: B('0 . . 0 . . 7 . 0 . . 0 . . 5 .'), chord: [0, 3, 7], roots: [57, 53, 55, 57], wave: 'sawtooth', swing: 0,
  },
  pop: {
    kick: X('x...x...x...x...'), snare: X('....x.......x...'), hat: X('..x...x...x...x.'),
    bass: B('0 . 0 . 7 . 7 . 5 . 5 . 3 . 3 .'), chord: [0, 4, 7], roots: [60, 55, 57, 53], wave: 'square', swing: 0,
  },
  house: {
    kick: X('x...x...x...x...'), snare: X('....x.......x...'), hat: X('..x...x...x...x.'),
    bass: B('. 0 . 0 . 0 . 0 . 0 . 0 . 0 . 0'), chord: [0, 3, 7, 10], roots: [57, 57, 53, 55], wave: 'sawtooth', swing: 0,
  },
  salsa: {
    kick: X('x..x..x...x..x..'), snare: X('..x...x...x...x.'), hat: X('x.xxx.xxx.xxx.xx'),
    bass: B('0 . . 7 . 5 . . 0 . . 7 . 3 . .'), chord: [0, 4, 7, 11], roots: [55, 52, 57, 50], wave: 'triangle', swing: 0.06,
  },
  rock: {
    kick: X('x.x...x.x.x...x.'), snare: X('....x.......x...'), hat: X('x.x.x.x.x.x.x.x.'),
    bass: B('0 0 . 0 0 0 . 0 5 5 . 5 3 3 . 3'), chord: [0, 7, 12], roots: [52, 52, 57, 55], wave: 'sawtooth', swing: 0,
  },
};

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

export class Synth {
  private ctx: AudioContext;
  private out: AudioNode;
  private timer = 0;
  private step = 0;
  private next = 0;
  private pattern: Pattern | null = null;
  private noise: AudioBuffer;
  bpm = 120;
  /** audio-clock time of step 0 of the current song, to know the beat the music is on */
  startedAt = 0;

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.out = out;
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  start(genre: Genre, bpm: number): void {
    this.stop();
    this.pattern = PATTERNS[genre];
    this.bpm = bpm;
    this.step = 0;
    this.next = this.ctx.currentTime + 0.08;
    this.startedAt = this.next;
    this.timer = window.setInterval(() => this.schedule(), 40);
    this.schedule();
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.pattern = null;
  }

  /** Beats played since the song started (fractional). */
  beats(): number {
    return this.pattern ? Math.max(0, ((this.ctx.currentTime - this.startedAt) * this.bpm) / 60) : 0;
  }

  private schedule(): void {
    const p = this.pattern;
    if (!p) return;
    const stepLen = 60 / this.bpm / 4;
    while (this.next < this.ctx.currentTime + 0.2) {
      const s = this.step % 16;
      const bar = Math.floor(this.step / 16) % 4;
      const t = this.next + (s % 2 ? p.swing * stepLen : 0);
      if (p.kick[s]) this.kick(t);
      if (p.snare[s]) this.snare(t);
      if (p.hat[s]) this.hat(t, s % 4 === 2 ? 0.5 : 0.28);
      if (p.bass[s] >= 0) this.tone(midi(p.roots[bar] - 24 + p.bass[s]), t, stepLen * 1.7, 0.34, p.wave === 'sawtooth' ? 'square' : 'sine', 500);
      if (s === 0) for (const n of p.chord) this.tone(midi(p.roots[bar] + n), t, stepLen * 7, 0.07, p.wave, 1800);
      if (s % 8 === 4 && this.step % 64 >= 32) this.tone(midi(p.roots[bar] + 12 + p.chord[(s / 4) % p.chord.length | 0]), t, stepLen * 2, 0.08, 'triangle', 3000);
      this.next += stepLen;
      this.step++;
    }
  }

  private env(g: GainNode, t: number, peak: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private kick(t: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, 0.95, 0.28);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.3);
  }

  private snare(t: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1500;
    const g = this.ctx.createGain();
    this.env(g, t, 0.45, 0.16);
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + 0.2);
  }

  private hat(t: number, vol: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    this.env(g, t, vol * 0.35, 0.05);
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + 0.07);
  }

  private tone(freq: number, t: number, dur: number, peak: number, type: OscillatorType, cutoff: number): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    this.env(g, t, peak, dur);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}
