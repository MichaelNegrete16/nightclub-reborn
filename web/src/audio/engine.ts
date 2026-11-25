import { currentTrack, trackById, type Genre, type MusicState, type Track } from '../core/music';
import { DeckBox } from './decks';
import { FileDeck, loadFile } from './files';
import { Synth } from './synth';

/**
 * Everything about sound: plays the current track (a built-in one through Web Audio, a link through its official
 * player), muffles it when the player is out in the street, and tells the view where the beat is and how loud it is.
 */
export class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private shaper: WaveShaperNode | null = null;
  /** the club's sound system, 0 (none) to 4: a basement system sounds dull and rough, an elite one clean and open */
  private system = 0;
  /** where the filter cuts the highs with the current system (Hz) */
  private sysCutoff = 20000;
  private analyser: AnalyserNode | null = null;
  private bins: Uint8Array<ArrayBuffer> | null = null;
  private synth: Synth | null = null;
  private nSynth: Synth | null = null;
  nGain: GainNode | null = null;
  private nKey = '';
  /** a friend's song, heard for real while visiting their club (replaces mine meanwhile) */
  /** the city server's address, for songs uploaded there */
  audioBase = '';
  private override: (Track & { start?: number }) | null = null;
  private deck: DeckBox;
  private files = new FileDeck();
  private playing: Track | null = null;
  private startedMs = 0;
  private volume = 0.7;
  private muffled = false;
  /** how much of the music reaches the listener: 1 inside the club, less in the street the farther away */
  private reach = 1;
  /** the player pressed next/ended: someone should pick the next track */
  onEnded: () => void = () => {};
  onError: (message: string, code?: number) => void = () => {};
  /** tracks YouTube refused to play, so the playlist can mark them */
  readonly failed = new Set<string>();

  constructor(deckParent: HTMLElement) {
    this.deck = new DeckBox(deckParent);
    this.deck.onEnded = () => this.onEnded();
    this.deck.onError = (m, code) => {
      this.failed.add(this.playing?.id ?? '');
      this.deck.note(m);
      this.onError(m, code);
    };
    this.files.onEnded = () => this.onEnded();
    this.files.onError = (m) => {
      this.failed.add(this.playing?.id ?? '');
      this.onError(m);
    };
    this.deck.onNeedsTap = () => this.deck.note('Toca el reproductor para activar el sonido.');
  }

  /** Browsers only allow sound after a click or tap: call this from one. */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.lowpass = this.ctx.createBiquadFilter();
      this.lowpass.type = 'lowpass';
      this.lowpass.frequency.value = 20000;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.bins = new Uint8Array(this.analyser.frequencyBinCount);
      this.shaper = this.ctx.createWaveShaper();
      this.shaper.oversample = '2x';
      this.master.connect(this.shaper).connect(this.lowpass).connect(this.analyser).connect(this.ctx.destination);
      this.setSystem(this.system || 4, true);
      this.synth = new Synth(this.ctx, this.master);
      // a second, quieter source for the club next door: heard through its own wall-muffling filter
      this.nGain = this.ctx.createGain();
      this.nGain.gain.value = 0;
      const nLow = this.ctx.createBiquadFilter();
      nLow.type = 'lowpass';
      nLow.frequency.value = 900;
      this.nGain.connect(nLow).connect(this.ctx.destination);
      this.nSynth = new Synth(this.ctx, this.nGain);
      this.applyVolume();
    }
    void this.ctx.resume();
  }

  /**
   * Set how good the club's sound system is (1 basement .. 4 elite; 0 = no equipment counts as basement). Worse gear cuts
   * the highs and adds a little roughness; the best is clean over the whole range.
   */
  setSystem(q: number, force = false): void {
    const level = Math.min(4, Math.max(1, Math.round(q || 1)));
    if (!force && level === this.system) return;
    this.system = level;
    this.sysCutoff = [2600, 5200, 10500, 20000][level - 1];
    if (this.shaper) {
      const k = [22, 9, 2.5, 0][level - 1];
      if (k === 0) this.shaper.curve = null;
      else {
        const n = 512;
        const c = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const x = (i * 2) / n - 1;
          c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); // soft clipping: the lower the system, the rougher the sound
        }
        this.shaper.curve = c;
      }
    }
    this.applyVolume();
  }

  get unlocked(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Make the sound match the club's state: what should be playing, and how loud. */
  sync(music: MusicState): void {
    this.volume = music.volume;
    this.applyVolume();
    const want = this.override ?? currentTrack(music) ?? null;
    if (want?.id === this.playing?.id && want?.ref === this.playing?.ref) return;
    this.halt();
    if (!want) return;
    if (want.source === 'builtin') {
      if (!this.ctx) return; // not unlocked yet: try again on the next sync
      this.synth!.start(want.genre, want.bpm);
    } else if (want.source === 'youtube') {
      void this.deck.playYouTube(want.ref, (want as { start?: number }).start ?? 0);
    } else if (want.source === 'file') {
      if (!this.ctx) return;
      this.files.routeThrough(this.ctx, this.master!); // real sound for the speakers and the equalizer
      void loadFile(want.ref).then((blob) => {
        if (this.playing?.id !== want.id) return; // the player already chose another song
        if (blob) this.files.playBlob(blob);
        else {
          this.failed.add(want.id);
          this.onError('Ese archivo no está en este navegador: súbelo otra vez.');
        }
      });
    } else if (want.source === 'cloud' || want.source === 'song') {
      if (!this.ctx) return;
      this.files.routeThrough(this.ctx, this.master!); // real sound for the speakers and the equalizer
      this.files.playUrl(want.source === 'song' ? `${this.audioBase}/songs/${want.ref}.mp3` : `${this.audioBase}/audio/${want.ref}`, (want as { start?: number }).start ?? 0, true);
    } else if (want.source === 'url') {
      this.files.playUrl(want.ref);
    } else {
      this.deck.playSpotify(want.ref);
    }
    this.playing = want;
    this.startedMs = performance.now();
  }

  /** What YouTube last reported (-2 nothing yet, 1 playing, 3 buffering, 2 paused, 0 ended) and the last error code. */
  get youtube(): { state: number; error: number } {
    return { state: this.deck.lastState, error: this.deck.lastError };
  }

  /**
   * The music of a neighbouring club, heard when you are near it (`reach` 0..1). Its own tracks (the game's) are heard
   * exactly; a link or file of theirs cannot be streamed to you, so you hear the same genre at the same tempo.
   */
  setNeighbor(face: { genre: Genre; bpm: number } | null, reach: number): void {
    if (!this.ctx || !this.nSynth || !this.nGain) return;
    const on = !!face && reach > 0.02;
    const key = on ? `${face!.genre}:${face!.bpm}` : '';
    if (key !== this.nKey) {
      this.nKey = key;
      if (on) this.nSynth.start(face!.genre, face!.bpm);
      else this.nSynth.stop();
    }
    this.nGain.gain.setTargetAtTime(on ? this.volume * 0.5 * reach * 0.8 : 0, this.ctx.currentTime, 0.2);
  }

  /** Hear a friend's real song (or my own again with null). */
  setOverride(t: (Track & { start?: number }) | null): void {
    if (t?.id === this.override?.id && t?.ref === this.override?.ref) return;
    this.override = t;
  }

  /** Is a visited club's real song the one being heard? */
  get hasOverride(): boolean {
    return this.override !== null;
  }

  /** When the current song started, on this computer's clock. */
  startedWall(): number {
    return Date.now() - (performance.now() - this.startedMs);
  }

  /** Who is playing now (null when silent). */
  get track(): Track | null {
    return this.playing;
  }

  get genre(): Genre | null {
    return this.playing?.genre ?? null;
  }

  private halt(): void {
    this.synth?.stop();
    this.deck.stop();
    this.files.stop();
    this.playing = null;
  }

  /**
   * Where the listener is. Inside the club the music plays at the volume the player chose. In the street it is dull and
   * soft (like music through a wall) near the club, and fades to nothing a few steps away. `reach` is 0..1.
   */
  setListening(inside: boolean, reach = 1): void {
    const r = inside ? 1 : Math.min(Math.max(reach, 0), 1);
    if (inside === !this.muffled && Math.abs(r - this.reach) < 0.01) return;
    this.muffled = !inside;
    this.reach = r;
    this.applyVolume();
  }

  private applyVolume(): void {
    const level = this.muffled ? 0.5 * this.reach : 1;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume * level * 0.8, this.ctx.currentTime, 0.1);
    if (this.lowpass && this.ctx) this.lowpass.frequency.setTargetAtTime(this.muffled ? 500 + 600 * this.reach : this.sysCutoff, this.ctx.currentTime, 0.15);
    this.deck.setVolume(this.volume * level);
    this.files.setVolume(this.volume * level);
  }

  /** Beats since the song began, fractional: exact for built-in tracks, from the BPM for links. */
  beats(): number {
    const t = this.playing;
    if (!t) return 0;
    if (t.source === 'builtin' && this.synth) return this.synth.beats();
    return ((performance.now() - this.startedMs) / 1000) * (t.bpm / 60);
  }

  get bpm(): number {
    return this.playing?.bpm ?? 120;
  }

  /** How loud the music is right now, 0..1 (real for built-in tracks, a pulse on the beat for links). */
  level(): number {
    if (!this.playing) return 0;
    if ((this.playing.source === 'builtin' || this.playing.source === 'file' || this.playing.source === 'cloud' || this.playing.source === 'song') && this.analyser && this.bins) {
      this.analyser.getByteFrequencyData(this.bins);
      let sum = 0;
      for (let i = 0; i < 8; i++) sum += this.bins[i];
      return Math.min(1, sum / (8 * 255) * 1.6);
    }
    const f = this.beats() % 1;
    return 0.35 + 0.65 * Math.exp(-f * 4);
  }

  /** Energy per band (for equalizer bars), each 0..1. */
  bands(n: number): number[] {
    const out = new Array<number>(n).fill(0);
    if (!this.playing) return out;
    if ((this.playing.source === 'builtin' || this.playing.source === 'file' || this.playing.source === 'cloud' || this.playing.source === 'song') && this.analyser && this.bins) {
      this.analyser.getByteFrequencyData(this.bins);
      const per = Math.floor(this.bins.length / n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let j = 0; j < per; j++) s += this.bins[i * per + j];
        out[i] = Math.min(1, (s / (per * 255)) * 1.8);
      }
      return out;
    }
    const b = this.beats();
    for (let i = 0; i < n; i++) out[i] = 0.25 + 0.6 * Math.abs(Math.sin(b * Math.PI * (0.5 + i * 0.37) + i)) * (0.5 + 0.5 * Math.exp(-(b % 1) * 3));
    return out;
  }
}

export { trackById };
