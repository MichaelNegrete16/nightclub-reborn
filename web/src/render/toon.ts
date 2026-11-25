import * as THREE from 'three';

let grad: THREE.DataTexture | null = null;

/** 4 hard light bands: the toon look shared by characters and props. */
export function gradientMap(): THREE.DataTexture {
  if (!grad) {
    const data = new Uint8Array([120, 165, 215, 255]);
    grad = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter;
    grad.needsUpdate = true;
  }
  return grad;
}

export interface ToonOpts {
  emissive?: number | string;
  emissiveIntensity?: number;
  opacity?: number;
  outline?: boolean;
}

const shared = new Map<string, THREE.MeshToonMaterial>();

/**
 * A toon material. Plain ones (no glow, no transparency) are shared by colour: hundreds of objects of the same colour
 * then use one material, which the graphics card switches to far less often.
 */
export function toon(color: number | string, opts: ToonOpts = {}): THREE.MeshToonMaterial {
  const plain = opts.emissive === undefined && (opts.opacity === undefined || opts.opacity >= 1);
  const key = `${color}|${opts.outline === false ? 0 : 1}`;
  if (plain) {
    const hit = shared.get(key);
    if (hit) return hit;
  }
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap() });
  if (plain) {
    m.userData.shared = true; // never disposed: other objects use it too
    shared.set(key, m);
  }
  if (opts.emissive !== undefined) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  if (opts.opacity !== undefined && opts.opacity < 1) {
    m.transparent = true;
    m.opacity = opts.opacity;
  }
  m.userData.outlineParameters =
    opts.outline === false ? { visible: false } : { thickness: 0.0034, color: [0.02, 0.02, 0.05], alpha: 1, visible: true };
  return m;
}
