import * as THREE from 'three';

const BPM = 120; // matches the beat the character animations were authored for (12 frames per beat at 24 fps)

/** Club backdrop: dark room with neon floor tiles that pulse on the beat, like the original's dance floor. */
export class Stage {
  readonly scene = new THREE.Scene();
  private tiles: THREE.MeshStandardMaterial[] = [];

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color('#0a0e26');
    s.fog = new THREE.Fog('#0a0e26', 6, 14);

    s.add(new THREE.HemisphereLight(0x9aa8ff, 0x2a1a4a, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.5, 4, 3.5);
    s.add(key);
    const cyan = new THREE.PointLight(0x18d8ff, 14, 7);
    cyan.position.set(-2.2, 1.4, -1.2);
    const pink = new THREE.PointLight(0xff2d9a, 14, 7);
    pink.position.set(2.2, 1.4, -1.4);
    s.add(cyan, pink);

    const palette = [0x14d6f2, 0x14d6f2, 0xa13cff, 0xff3da6];
    const n = 17;
    const size = 0.30;
    const geo = new THREE.BoxGeometry(size * 0.94, 0.05, size * 0.94);
    for (let x = 0; x < n; x++) {
      for (let z = 0; z < n; z++) {
        const color = palette[(x * 3 + z * 7) % palette.length];
        const mat = new THREE.MeshStandardMaterial({ color: 0x0c1230, emissive: color, emissiveIntensity: 0.4, roughness: 0.4 });
        const tile = new THREE.Mesh(geo, mat);
        tile.position.set((x - (n - 1) / 2) * size, -0.025, (z - (n - 1) / 2) * size);
        const dist = Math.hypot(tile.position.x, tile.position.z);
        tile.visible = dist < 2.45; // round-ish floor
        s.add(tile);
        this.tiles.push(mat);
        mat.userData.phase = dist;
      }
    }

    // Back wall with neon strips
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 6),
      new THREE.MeshStandardMaterial({ color: 0x151a3a, roughness: 0.9 }),
    );
    wall.position.set(0, 2.2, -3.4);
    s.add(wall);
    for (const [y, c] of [[1.0, 0x14d6f2], [1.5, 0xff3da6], [2.0, 0xa13cff]] as const) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(9, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: c }));
      strip.position.set(0, y, -3.35);
      s.add(strip);
    }

    // Soft blob shadow under the character
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.004;
    s.add(shadow);
  }

  update(time: number): void {
    const beat = (time * BPM) / 60;
    const pulse = Math.exp(-(beat % 1) * 4.5);
    for (const m of this.tiles) {
      const wave = 0.5 + 0.5 * Math.sin(beat * Math.PI - (m.userData.phase as number) * 2.2);
      m.emissiveIntensity = 0.25 + 0.55 * wave + 0.5 * pulse;
    }
  }
}
