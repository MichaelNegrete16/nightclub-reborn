import { CELEB_BY_ID, type Celeb } from '../core/celebs';

// Caricature portraits of the famous guests, drawn with the 2D canvas: a huge head on a small body, big eyes and a big
// smile, the hair and the accessories that make each one recognisable, on a burst of colour. Cached as image URLs.

const W = 320;
const H = 360;
const cache = new Map<string, string>();

/** The portrait of a famous guest as an image URL (null for an unknown id). */
export function caricature(id: string): string | null {
  const hit = cache.get(id);
  if (hit) return hit;
  const c = CELEB_BY_ID.get(id);
  if (!c) return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  draw(canvas.getContext('2d')!, c);
  const url = canvas.toDataURL('image/png');
  cache.set(id, url);
  return url;
}

const INK = '#15101f';

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1))));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

function draw(g: CanvasRenderingContext2D, c: Celeb): void {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // background: a burst of rays
  g.fillStyle = c.bg;
  g.fillRect(0, 0, W, H);
  g.save();
  g.translate(W / 2, H * 0.42);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 16; i++) {
    g.rotate((Math.PI * 2) / 16);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-30, -320);
    g.lineTo(30, -320);
    g.closePath();
    if (i % 2 === 0) g.fill();
  }
  g.restore();
  const vign = g.createRadialGradient(W / 2, H * 0.45, 80, W / 2, H * 0.45, 260);
  vign.addColorStop(0, 'rgba(0,0,0,0)');
  vign.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = vign;
  g.fillRect(0, 0, W, H);

  const hx = W / 2;
  const hy = 165; // head centre
  const rx = 88;
  const ry = 100;
  const stroke = (w = 5) => {
    g.strokeStyle = INK;
    g.lineWidth = w;
    g.stroke();
  };
  const fill = (color: string, w = 5) => {
    g.fillStyle = color;
    g.fill();
    stroke(w);
  };
  const ellipse = (x: number, y: number, a: number, b: number, rot = 0) => {
    g.beginPath();
    g.ellipse(x, y, a, b, rot, 0, Math.PI * 2);
  };

  // ---- behind the head: long hair, afro, braids, poncho/body ------------------------------
  if (c.hair === 'afro') {
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      ellipse(hx + Math.cos(a) * 112, hy - 30 + Math.sin(a) * 105, 42, 42);
      fill(c.hairColor, 4);
    }
    ellipse(hx, hy - 30, 120, 112);
    g.fillStyle = c.hairColor;
    g.fill();
  }
  if (c.hair === 'long') {
    g.beginPath();
    g.moveTo(hx - rx - 14, hy - 30);
    g.quadraticCurveTo(hx - rx - 30, hy + 120, hx - rx + 4, hy + 170);
    g.lineTo(hx + rx - 4, hy + 170);
    g.quadraticCurveTo(hx + rx + 30, hy + 120, hx + rx + 14, hy - 30);
    g.closePath();
    fill(c.hairColor);
  }
  if (c.hair === 'braids') {
    for (let i = -5; i <= 5; i++) {
      if (Math.abs(i) < 2) continue;
      const x = hx + i * 17;
      g.beginPath();
      g.moveTo(x, hy - 40);
      g.lineTo(x + i * 2, hy + 150);
      g.strokeStyle = INK;
      g.lineWidth = 16;
      g.stroke();
      g.strokeStyle = c.hairColor;
      g.lineWidth = 10;
      g.stroke();
      ellipse(x + i * 2, hy + 152, 7, 7);
      fill(c.accent, 3);
    }
  }

  // ---- the small body ----------------------------------------------------------------------
  g.beginPath();
  g.moveTo(hx - 130, H + 10);
  g.quadraticCurveTo(hx - 125, H - 85, hx - 40, H - 98);
  g.lineTo(hx + 40, H - 98);
  g.quadraticCurveTo(hx + 125, H - 85, hx + 130, H + 10);
  g.closePath();
  fill(c.outfit);
  if (c.acc.includes('poncho')) {
    // a striped ruana over the shoulders
    g.save();
    g.clip();
    for (let i = 0; i < 9; i++) {
      g.fillStyle = i % 2 ? shade(c.outfit, 0.7) : c.accent;
      g.fillRect(hx - 140 + i * 32, H - 110, 14, 140);
    }
    g.restore();
    g.beginPath();
    g.moveTo(hx - 130, H + 10);
    g.quadraticCurveTo(hx - 125, H - 85, hx - 40, H - 98);
    g.lineTo(hx + 40, H - 98);
    g.quadraticCurveTo(hx + 125, H - 85, hx + 130, H + 10);
    stroke();
  }
  if (c.acc.includes('jersey')) {
    // a football shirt: collar stripe and the number
    g.fillStyle = '#1e4fd6';
    g.fillRect(hx - 40, H - 100, 80, 10);
    g.font = '900 52px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#1e4fd6';
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.strokeText(String(c.number ?? 10), hx + 70, H - 22);
    g.fillText(String(c.number ?? 10), hx + 70, H - 22);
  }
  // neck
  g.beginPath();
  g.rect(hx - 22, hy + 80, 44, 50);
  fill(shade(c.skin, 0.85));

  // ears
  for (const s of [-1, 1]) {
    ellipse(hx + s * (rx - 4), hy + 8, 18, 26);
    fill(c.skin);
  }
  // ---- the head ----------------------------------------------------------------------------
  ellipse(hx, hy, rx, ry);
  fill(c.skin, 6);
  if (c.older) {
    g.strokeStyle = shade(c.skin, 0.7);
    g.lineWidth = 3;
    for (const dy of [-62, -52]) {
      g.beginPath();
      g.moveTo(hx - 36, hy + dy);
      g.quadraticCurveTo(hx, hy + dy - 6, hx + 36, hy + dy);
      g.stroke();
    }
  }

  // cheeks
  g.fillStyle = 'rgba(255,90,110,0.28)';
  for (const s of [-1, 1]) {
    ellipse(hx + s * 52, hy + 38, 18, 11);
    g.fill();
  }

  // eyes: big and round, looking a little to the side
  const eyeY = hy - 2;
  for (const s of [-1, 1]) {
    ellipse(hx + s * 34, eyeY, 22, 26);
    fill('#ffffff', 4);
    ellipse(hx + s * 34 + 5, eyeY + 4, 11, 13);
    g.fillStyle = INK;
    g.fill();
    ellipse(hx + s * 34 + 9, eyeY - 2, 4, 4);
    g.fillStyle = '#ffffff';
    g.fill();
    // eyebrows, raised: they are happy to be here
    g.beginPath();
    g.moveTo(hx + s * 14, eyeY - 34);
    g.quadraticCurveTo(hx + s * 34, eyeY - 48, hx + s * 56, eyeY - 36);
    g.strokeStyle = c.older ? '#9a9a9a' : c.hair === 'none' || c.hair === 'bald' ? INK : c.hairColor === '#f5d76e' ? '#5a3a18' : c.hairColor;
    g.lineWidth = 8;
    g.stroke();
  }

  // nose
  g.beginPath();
  if (c.nose === 'long') {
    g.moveTo(hx - 2, eyeY + 6);
    g.quadraticCurveTo(hx + 26, eyeY + 44, hx + 4, eyeY + 50);
    g.quadraticCurveTo(hx - 8, eyeY + 50, hx - 10, eyeY + 44);
    fill(shade(c.skin, 0.92), 4);
  } else if (c.nose === 'small') {
    ellipse(hx, eyeY + 36, 9, 7);
    fill(shade(c.skin, 0.9), 4);
  } else {
    ellipse(hx, eyeY + 36, 19, 14);
    fill(shade(c.skin, 0.9), 4);
  }

  // mustache / beard / goatee
  if (c.beard === 'beard') {
    g.beginPath();
    g.moveTo(hx - rx + 6, hy + 10);
    g.quadraticCurveTo(hx - rx + 10, hy + ry + 4, hx, hy + ry + 18);
    g.quadraticCurveTo(hx + rx - 10, hy + ry + 4, hx + rx - 6, hy + 10);
    g.quadraticCurveTo(hx, hy + 52, hx - rx + 6, hy + 10);
    fill(c.hairColor === '#15101f' ? '#1d140c' : c.hairColor, 4);
  }

  // mouth: a wide open smile with teeth
  g.beginPath();
  g.moveTo(hx - 40, hy + 54);
  g.quadraticCurveTo(hx, hy + 60, hx + 40, hy + 54);
  g.quadraticCurveTo(hx, hy + 104, hx - 40, hy + 54);
  g.closePath();
  fill('#5a1020', 4);
  g.save();
  g.clip();
  g.fillStyle = '#ffffff';
  g.fillRect(hx - 42, hy + 52, 84, 13);
  g.fillStyle = '#ff6a7a';
  ellipse(hx, hy + 88, 20, 10);
  g.fill();
  g.restore();
  if (c.lips) {
    g.beginPath();
    g.moveTo(hx - 40, hy + 54);
    g.quadraticCurveTo(hx, hy + 60, hx + 40, hy + 54);
    g.quadraticCurveTo(hx, hy + 104, hx - 40, hy + 54);
    g.strokeStyle = c.lips;
    g.lineWidth = 7;
    g.stroke();
  }
  if (c.beard === 'mustache') {
    g.beginPath();
    g.moveTo(hx, hy + 46);
    g.quadraticCurveTo(hx - 30, hy + 36, hx - 50, hy + 58);
    g.quadraticCurveTo(hx - 26, hy + 52, hx, hy + 56);
    g.quadraticCurveTo(hx + 26, hy + 52, hx + 50, hy + 58);
    g.quadraticCurveTo(hx + 30, hy + 36, hx, hy + 46);
    fill(c.older ? '#cfcfcf' : c.hairColor === '#e8b04a' ? '#c08a2a' : '#2a1a10', 4);
  }
  if (c.beard === 'goatee') {
    g.beginPath();
    g.moveTo(hx - 14, hy + 90);
    g.quadraticCurveTo(hx, hy + 116, hx + 14, hy + 90);
    g.closePath();
    fill(c.hairColor === '#f5d76e' ? '#5a3a18' : c.hairColor, 3);
  }

  // ---- hair on top -------------------------------------------------------------------------
  const cap = (top: number, color: string) => {
    g.beginPath();
    g.moveTo(hx - rx - 2, hy - 18);
    g.quadraticCurveTo(hx - rx, top, hx, top - 6);
    g.quadraticCurveTo(hx + rx, top, hx + rx + 2, hy - 18);
    g.quadraticCurveTo(hx, hy - 62, hx - rx - 2, hy - 18);
    fill(color);
  };
  switch (c.hair) {
    case 'curly':
      for (let i = 0; i < 11; i++) {
        const a = Math.PI + (i / 10) * Math.PI;
        ellipse(hx + Math.cos(a) * 80, hy - 40 + Math.sin(a) * 70, 26, 24);
        fill(c.hairColor, 4);
      }
      break;
    case 'afro':
      cap(hy - 120, c.hairColor);
      break;
    case 'long':
      cap(hy - 112, c.hairColor);
      g.beginPath();
      g.moveTo(hx + 10, hy - 104);
      g.quadraticCurveTo(hx - 50, hy - 70, hx - rx + 4, hy - 4);
      g.strokeStyle = shade(c.hairColor, 1.35);
      g.lineWidth = 6;
      g.stroke();
      break;
    case 'fade':
      // short sides, a tall bleached top
      cap(hy - 96, '#2a1a10');
      g.beginPath();
      g.roundRect(hx - 62, hy - 140, 124, 64, 22);
      fill(c.hairColor);
      g.strokeStyle = shade(c.hairColor, 0.75);
      g.lineWidth = 4;
      for (let x = -40; x <= 40; x += 20) {
        g.beginPath();
        g.moveTo(hx + x, hy - 132);
        g.lineTo(hx + x + 10, hy - 86);
        g.stroke();
      }
      break;
    case 'bun':
      cap(hy - 108, c.hairColor);
      ellipse(hx, hy - 128, 38, 32);
      fill(c.hairColor);
      ellipse(hx, hy - 104, 30, 8);
      fill(c.accent, 3);
      break;
    case 'mohawk':
      cap(hy - 92, shade(c.skin, 0.8));
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        const x = hx - 50 + i * 20;
        g.moveTo(x - 12, hy - 90);
        g.lineTo(x + 2, hy - 160 + Math.abs(i - 2.5) * 10);
        g.lineTo(x + 14, hy - 90);
        g.closePath();
        fill(i % 2 ? c.accent : c.hairColor, 4);
      }
      break;
    case 'braids':
      cap(hy - 104, c.hairColor);
      g.strokeStyle = shade(c.hairColor, 1.6);
      g.lineWidth = 3;
      for (let x = -60; x <= 60; x += 20) {
        g.beginPath();
        g.moveTo(hx + x * 0.3, hy - 102);
        g.lineTo(hx + x, hy - 30);
        g.stroke();
      }
      break;
    case 'slick':
      cap(hy - 106, c.hairColor);
      g.beginPath();
      g.moveTo(hx - 30, hy - 104);
      g.quadraticCurveTo(hx + 40, hy - 120, hx + rx, hy - 40);
      g.strokeStyle = shade(c.hairColor, 1.35);
      g.lineWidth = 7;
      g.stroke();
      break;
    case 'bald':
      ellipse(hx - 30, hy - 66, 22, 10, -0.4);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fill();
      break;
    default:
      break;
  }

  // ---- accessories -------------------------------------------------------------------------
  const has = (a: string) => c.acc.includes(a as Celeb['acc'][number]);
  if (has('vueltiao')) {
    // the sombrero vueltiao: wide brim and crown with black and cream stripes
    const stripes = (draw: () => void) => {
      g.save();
      draw();
      g.clip();
      for (let y = 0; y < H; y += 12) {
        g.fillStyle = (y / 12) % 2 ? INK : '#f4ead0';
        g.fillRect(0, y, W, 12);
      }
      g.restore();
      draw();
      stroke(5);
    };
    stripes(() => ellipse(hx, hy - 72, 150, 34));
    stripes(() => {
      g.beginPath();
      g.moveTo(hx - 70, hy - 76);
      g.quadraticCurveTo(hx - 66, hy - 160, hx, hy - 162);
      g.quadraticCurveTo(hx + 66, hy - 160, hx + 70, hy - 76);
      g.quadraticCurveTo(hx, hy - 60, hx - 70, hy - 76);
    });
  }
  if (has('turban')) {
    g.beginPath();
    g.moveTo(hx - rx - 6, hy - 30);
    g.quadraticCurveTo(hx - rx - 10, hy - 170, hx, hy - 168);
    g.quadraticCurveTo(hx + rx + 10, hy - 170, hx + rx + 6, hy - 30);
    g.quadraticCurveTo(hx, hy - 70, hx - rx - 6, hy - 30);
    fill(c.outfit);
    g.strokeStyle = c.accent;
    g.lineWidth = 9;
    for (const k of [0.35, 0.65]) {
      g.beginPath();
      g.moveTo(hx - rx + 6, hy - 40 - k * 90);
      g.quadraticCurveTo(hx, hy - 70 - k * 110, hx + rx - 6, hy - 40 - k * 90);
      g.stroke();
    }
    ellipse(hx + 40, hy - 150, 22, 18);
    fill(c.accent, 4);
  }
  if (has('helmet')) {
    g.beginPath();
    g.moveTo(hx - rx - 8, hy - 26);
    g.quadraticCurveTo(hx - rx, hy - 150, hx, hy - 150);
    g.quadraticCurveTo(hx + rx, hy - 150, hx + rx + 8, hy - 26);
    g.quadraticCurveTo(hx, hy - 60, hx - rx - 8, hy - 26);
    fill('#ffffff');
    g.fillStyle = c.accent;
    for (const x of [-46, 0, 46]) {
      g.beginPath();
      g.ellipse(hx + x, hy - 108 + Math.abs(x) * 0.3, 10, 26, 0, 0, Math.PI * 2);
      g.fill();
    }
    // polka dots on the jersey: the king of the mountains
    g.fillStyle = '#d6314a';
    for (const [x, y] of [[-90, H - 40], [-50, H - 20], [60, H - 50], [95, H - 15], [20, H - 30]]) {
      g.beginPath();
      g.arc(hx + x, y, 9, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (has('cap')) {
    g.beginPath();
    g.moveTo(hx - rx, hy - 40);
    g.quadraticCurveTo(hx - rx + 4, hy - 140, hx, hy - 140);
    g.quadraticCurveTo(hx + rx - 4, hy - 140, hx + rx, hy - 40);
    g.closePath();
    fill(c.accent === '#ffffff' ? '#d6314a' : c.accent);
    ellipse(hx - 70, hy - 44, 70, 16, 0.12);
    fill(c.accent === '#ffffff' ? '#a8283c' : shade(c.accent, 0.8));
  }
  if (has('headphones')) {
    g.beginPath();
    g.arc(hx, hy - 20, rx + 14, Math.PI * 1.05, Math.PI * 1.95);
    g.strokeStyle = INK;
    g.lineWidth = 16;
    g.stroke();
    g.strokeStyle = c.accent;
    g.lineWidth = 9;
    g.stroke();
    for (const s of [-1, 1]) {
      g.beginPath();
      g.roundRect(hx + s * (rx + 4) - 20, hy - 26, 40, 62, 14);
      fill(INK);
      g.beginPath();
      g.roundRect(hx + s * (rx + 4) - 12, hy - 18, 24, 46, 10);
      fill(c.accent, 3);
    }
  }
  if (has('shades') || has('star_shades')) {
    for (const s of [-1, 1]) {
      g.beginPath();
      if (has('star_shades')) {
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 14 : 32;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const x = hx + s * 36 + Math.cos(a) * r;
          const y = eyeY + Math.sin(a) * r;
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.closePath();
        fill(c.accent);
      } else {
        g.roundRect(hx + s * 36 - 30, eyeY - 18, 60, 36, 12);
        fill('#1a1a2a');
        g.beginPath();
        g.moveTo(hx + s * 36 - 18, eyeY - 8);
        g.lineTo(hx + s * 36 - 4, eyeY - 12);
        g.strokeStyle = 'rgba(255,255,255,0.6)';
        g.lineWidth = 4;
        g.stroke();
      }
    }
    g.beginPath();
    g.moveTo(hx - 8, eyeY - 4);
    g.lineTo(hx + 8, eyeY - 4);
    stroke(6);
  }
  if (has('glasses')) {
    for (const s of [-1, 1]) {
      ellipse(hx + s * 34, eyeY, 28, 28);
      g.strokeStyle = INK;
      g.lineWidth = 7;
      g.stroke();
    }
    g.beginPath();
    g.moveTo(hx - 8, eyeY - 4);
    g.lineTo(hx + 8, eyeY - 4);
    stroke(6);
  }
  if (has('flower')) {
    const fx = hx + 70;
    const fy = hy - 100;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ellipse(fx + Math.cos(a) * 20, fy + Math.sin(a) * 20, 16, 16);
      fill(c.accent, 4);
    }
    ellipse(fx, fy, 11, 11);
    fill('#f5d21d', 4);
  }
  if (has('hoops') || has('earring')) {
    for (const s of has('hoops') ? [-1, 1] : [1]) {
      g.beginPath();
      g.arc(hx + s * (rx - 2), hy + 46, has('hoops') ? 16 : 7, 0, Math.PI * 2);
      g.strokeStyle = INK;
      g.lineWidth = 9;
      g.stroke();
      g.strokeStyle = '#f5c21d';
      g.lineWidth = 5;
      g.stroke();
    }
  }
  if (has('pearls')) {
    for (let i = -4; i <= 4; i++) {
      ellipse(hx + i * 14, H - 96 + Math.abs(i) * -3 + 14, 7, 7);
      fill('#fffaf0', 3);
    }
  }
  if (has('chain')) {
    g.beginPath();
    g.moveTo(hx - 46, H - 96);
    g.quadraticCurveTo(hx, H - 30, hx + 46, H - 96);
    g.strokeStyle = INK;
    g.lineWidth = 12;
    g.stroke();
    g.strokeStyle = '#f5c21d';
    g.lineWidth = 7;
    g.stroke();
    ellipse(hx, H - 52, 15, 18);
    fill('#f5c21d', 4);
  }
  if (has('phone')) {
    // a selfie: the phone up in one hand
    g.save();
    g.translate(hx + 112, H - 120);
    g.rotate(0.25);
    g.beginPath();
    g.roundRect(-24, -44, 48, 88, 10);
    fill('#2a2438');
    g.beginPath();
    g.roundRect(-18, -36, 36, 70, 6);
    fill(c.accent, 3);
    g.restore();
    ellipse(hx + 112, H - 70, 18, 18);
    fill(c.skin);
  }
  if (has('mic')) {
    g.save();
    g.translate(hx - 108, H - 100);
    g.rotate(-0.4);
    g.beginPath();
    g.roundRect(-8, -10, 16, 70, 6);
    fill('#2a2438');
    ellipse(0, -22, 20, 20);
    fill('#bfc4d6');
    g.restore();
    ellipse(hx - 100, H - 52, 18, 18);
    fill(c.skin);
  }
}
