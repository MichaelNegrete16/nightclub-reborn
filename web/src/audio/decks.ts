// Players for the player's own links. YouTube uses its official IFrame player and Spotify its official embed; both are
// shown in a small box in the corner (YouTube's rules do not allow hiding the player). Their sound cannot be analysed
// by the game, so the view dances to the BPM the player gave the song.

interface YTPlayer {
  loadVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  setVolume(v: number): void;
  destroy(): void;
}

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApi: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  ytApi ??= new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve();
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      ytApi = null;
      reject(new Error('No se pudo cargar YouTube (¿sin internet?).'));
    };
    document.head.append(s);
  });
  return ytApi;
}

/** The little box in the corner where the YouTube or Spotify player lives. */
/** What YouTube's error codes mean for the player, in plain words. */
export function youtubeErrorText(code: number): string {
  if (code === 101 || code === 150 || code === 153) return 'El dueño de ese video no deja usarlo fuera de YouTube. Busca otra versión (lyric video, audio oficial o un cover) y pega ese link.';
  if (code === 100) return 'Ese video ya no existe o es privado.';
  if (code === 2) return 'El link de YouTube no es válido.';
  return 'YouTube no pudo reproducir ese video aquí. Prueba con otro.';
}

export class DeckBox {
  readonly root = document.createElement('div');
  private body = document.createElement('div');
  private yt: YTPlayer | null = null;
  private ytHost: HTMLElement | null = null;
  private ytReady = false;
  private pendingVideo: string | null = null;
  volume = 70;
  /** last thing YouTube told us (for tests and the UI) */
  lastState = -2;
  lastError = 0;
  onEnded: () => void = () => {};
  onError: (message: string, code?: number) => void = () => {};
  onNeedsTap: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.root.className = 'deck-box';
    this.root.hidden = true;
    const bar = document.createElement('div');
    bar.className = 'deck-bar';
    const label = document.createElement('span');
    label.textContent = '♪ Reproductor';
    const min = document.createElement('button');
    min.textContent = '–';
    min.title = 'Achicar o agrandar';
    min.onclick = () => this.root.classList.toggle('small');
    bar.append(label, min);
    this.body.className = 'deck-body';
    this.root.append(bar, this.body);
    parent.append(this.root);
  }

  /** Show a short message on top of the player (e.g. why it is silent). */
  note(text: string): void {
    let n = this.root.querySelector('.deck-note') as HTMLElement | null;
    if (!n) {
      n = document.createElement('div');
      n.className = 'deck-note';
      this.root.append(n);
    }
    n.textContent = text;
    n.hidden = !text;
  }

  async playYouTube(videoId: string, start = 0): Promise<void> {
    this.clear('youtube');
    this.note('');
    this.lastError = 0;
    this.lastState = -2;
    this.root.hidden = false;
    this.pendingVideo = videoId;
    try {
      await loadYouTubeApi();
    } catch (e) {
      this.onError((e as Error).message);
      return;
    }
    if (this.pendingVideo !== videoId) return; // the player already chose something else
    if (!this.yt) {
      this.ytHost = document.createElement('div');
      this.body.append(this.ytHost);
      this.yt = new window.YT!.Player(this.ytHost, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, start: Math.floor(start) },
        events: {
          onReady: () => {
            this.ytReady = true;
            this.yt?.setVolume(this.volume);
            this.yt?.playVideo();
          },
          onStateChange: (e: { data: number }) => {
            this.lastState = e.data;
            if (e.data === 1) this.lastError = 0;
            if (e.data === 0) this.onEnded();
          },
          // the browser stopped the sound until the player is tapped: the player is on screen, so the user can tap it
          onAutoplayBlocked: () => this.onNeedsTap(),
          onError: (e: { data: number }) => {
            this.lastError = e.data;
            this.onError(youtubeErrorText(e.data), e.data);
          },
        },
      });
    } else if (this.ytReady) {
      (this.yt as unknown as { loadVideoById(o: { videoId: string; startSeconds: number }): void }).loadVideoById({ videoId, startSeconds: start });
    } else {
      // still starting up: swap the video once it is ready
      const wait = window.setInterval(() => {
        if (this.ytReady) {
          window.clearInterval(wait);
          (this.yt as unknown as { loadVideoById(o: { videoId: string; startSeconds: number }): void } | null)?.loadVideoById({ videoId, startSeconds: start });
        }
      }, 200);
    }
  }

  playSpotify(ref: string): void {
    this.clear('spotify');
    this.root.hidden = false;
    const f = document.createElement('iframe');
    f.src = `https://open.spotify.com/embed/${ref}?utm_source=generator&theme=0`;
    f.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
    f.loading = 'lazy';
    f.className = 'spotify';
    this.body.append(f);
  }

  /** Stop everything and hide the box. */
  stop(): void {
    this.pendingVideo = null;
    this.yt?.pauseVideo();
    this.body.querySelector('iframe.spotify')?.remove();
    this.root.hidden = true;
  }

  setVolume(v: number): void {
    this.volume = Math.round(v * 100);
    if (this.ytReady) this.yt?.setVolume(this.volume);
  }

  private clear(keep: 'youtube' | 'spotify'): void {
    if (keep !== 'spotify') this.body.querySelector('iframe.spotify')?.remove();
    if (keep !== 'youtube') this.yt?.pauseVideo();
    this.ytHost && (this.ytHost.style.display = keep === 'youtube' ? '' : 'none');
    const own = this.body.querySelector('iframe:not(.spotify)') as HTMLElement | null;
    if (own) own.style.display = keep === 'youtube' ? '' : 'none';
  }
}
