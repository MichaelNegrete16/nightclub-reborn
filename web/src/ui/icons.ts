// Small inline SVG icons (24x24, drawn with strokes so they take the text color).
const svg = (body: string, fill = 'none') =>
  `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="${fill}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS: Record<string, string> = {
  shop: svg('<path d="M5 8h14l-1.2 11H6.2L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>'),
  inventory: svg('<path d="M3.5 8.5 12 4l8.5 4.5V17L12 21.5 3.5 17V8.5z"/><path d="M3.5 8.5 12 13l8.5-4.5M12 13v8.5"/>'),
  missions: svg('<path d="M6 21V4"/><path d="M6 5h11l-2 4 2 4H6"/>'),
  character: svg('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>'),
  menu: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>'),
  coin: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 9.8c.5-1 1.5-1.4 2.5-1.4 1.4 0 2.5.6 2.5 1.8 0 2.5-5 1.4-5 4 0 1.2 1.2 1.9 2.6 1.9 1.1 0 2-.4 2.4-1.2"/>'),
  star: svg('<path d="m12 3.5 2.5 5.3 5.7.7-4.2 4 1.1 5.7L12 16.4 6.9 19.2 8 13.5l-4.2-4 5.7-.7L12 3.5z"/>'),
  guests: svg('<circle cx="9" cy="8.5" r="3"/><circle cx="17" cy="9.5" r="2.4"/><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5M15.5 14.8c2.6-.3 4.8 1.2 5.5 4.2"/>'),
  luxury: svg('<path d="m12 3 8 6-8 12L4 9l8-6z"/><path d="M4 9h16M9.5 9 12 21l2.5-12M12 3l-2.5 6M12 3l2.5 6"/>'),
  rotate: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  move: svg('<path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>'),
  stash: svg('<path d="M3.5 9.5 12 5l8.5 4.5V17L12 21.5 3.5 17V9.5z"/><path d="M12 2v7M9 6.5 12 9.5l3-3"/>'),
  sell: svg('<path d="M3.5 12.5 12 4h7.5v7.5L11 20 3.5 12.5z"/><circle cx="15.5" cy="8.5" r="1.3"/>'),
  dance: svg('<circle cx="12" cy="4.5" r="2"/><path d="M12 7.5v6.5M4.5 5.5 12 9.5l7.5-4M8.5 21 12 14l3.5 7"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  undo: svg('<path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h9.5a5 5 0 0 1 0 10H11"/>'),
  center: svg('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>'),
  eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  door: svg('<path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21"/><path d="M4 21h16"/><circle cx="14.5" cy="12.5" r=".9" fill="currentColor"/>'),
  monitor: svg('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>'),
  music: svg('<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
  play: svg('<path d="M7 4.5v15l12-7.5z"/>'),
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  prev: svg('<path d="M18 5v14L8 12zM6 5v14"/>'),
  next: svg('<path d="M6 5v14l10-7zM18 5v14"/>'),
  city: svg('<path d="M4 21V9l5-3v15M9 21V4l6 3v14M15 21v-9l5 2v7"/><path d="M3 21h18"/>'),
  street: svg('<path d="M3 21 8.5 3M21 21 15.5 3"/><path d="M12 4v3M12 11v3M12 18v3"/>'),
  facade: svg('<path d="M4 21V8l8-4.5L20 8v13"/><path d="M2.5 21h19"/><path d="M9.5 21v-6h5v6"/><path d="M4 8h16"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8"/>'),
  moon: svg('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>'),
  cloud: svg('<path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4.5 4.5 0 0 1 .5 9H7z"/>'),
  rain: svg('<path d="M7 14.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 5.5a4.5 4.5 0 0 1 .5 9H7z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>'),
  back: svg('<path d="M15 5 8 12l7 7"/>'),
};

export const icon = (name: string): string => ICONS[name] ?? '';
