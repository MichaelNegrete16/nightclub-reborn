// Music from the player's own computer: the files are kept in the browser (IndexedDB), because the club's saved state
// only holds the playlist, not megabytes of audio. They go through Web Audio, so the speakers and the equalizer move
// to the real sound.

const DB = 'nc-music';
const STORE = 'files';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function saveFile(id: string, blob: Blob): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadFile(id: string): Promise<Blob | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).get(id);
    r.onsuccess = () => resolve(r.result as Blob | undefined);
    r.onerror = () => reject(r.error);
  });
}

export async function deleteFile(id: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** One audio element for local files and direct audio links. */
export class FileDeck {
  readonly el = new Audio();
  private source: MediaElementAudioSourceNode | null = null;
  private url: string | null = null;
  onEnded: () => void = () => {};
  onError: (message: string) => void = () => {};

  constructor() {
    this.el.preload = 'auto';
    this.el.addEventListener('ended', () => this.onEnded());
    this.el.addEventListener('error', () => this.onError('No se pudo reproducir ese audio. Revisa que el archivo o el link sean de música (mp3, ogg, wav o m4a).'));
  }

  /** Connect to Web Audio once (only for same-origin sources such as blobs: other sites' audio would go silent). */
  routeThrough(ctx: AudioContext, out: AudioNode): void {
    if (this.source) return;
    this.source = ctx.createMediaElementSource(this.el);
    this.source.connect(out);
  }

  get routed(): boolean {
    return this.source !== null;
  }

  playBlob(blob: Blob): void {
    this.release();
    this.url = URL.createObjectURL(blob);
    this.el.src = this.url;
    void this.el.play().catch(() => this.onError('El navegador bloqueó el sonido: toca la pantalla y vuelve a pulsar play.'));
  }

  /** `start` seconds in (to join a song that is already going); `cors` for songs from the city server so they can feed the equalizer. */
  playUrl(url: string, start = 0, cors = false): void {
    this.release();
    this.el.crossOrigin = cors ? 'anonymous' : null;
    this.el.src = url;
    if (start > 0.5) {
      const seek = () => {
        // a song that is shorter than the time since the club started it: join at the same point of its next round
        const d = this.el.duration;
        this.el.currentTime = Number.isFinite(d) && d > 1 ? start % d : start;
        this.el.removeEventListener('loadedmetadata', seek);
      };
      this.el.addEventListener('loadedmetadata', seek);
    }
    void this.el.play().catch(() => this.onError('No se pudo reproducir ese link de audio.'));
  }

  stop(): void {
    this.el.pause();
    this.release();
  }

  setVolume(v: number): void {
    // routed audio is volume-controlled by the master gain
    this.el.volume = this.source ? 1 : Math.min(Math.max(v, 0), 1);
  }

  private release(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
}
