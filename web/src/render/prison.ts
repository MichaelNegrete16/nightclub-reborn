import * as THREE from 'three';
import type { ChoreAnim } from '../core/character';
import { toon } from './toon';
import { neon } from './comic';

/** Where the prison stands in the world: far to the west of the city, on the same ground, where nothing else is. */
export const PRISON_AT = { x: -300, z: 0 };
/** seconds a chore takes once the character is at its place */
export const WORK_SECONDS = 5.5;

export interface Station {
  id: ChoreAnim;
  name: string;
  doing: string;
  /** where the character stands (world) and which way they face */
  x: number;
  z: number;
  face: [number, number];
  /** the dirt of this place: it disappears as chores are done */
  dirt: THREE.Object3D[];
  /** the tool, moved each frame while working (t in seconds, local to the character) */
  tool(): { group: THREE.Group; move(t: number): void };
}

const A = PRISON_AT;
type Pt = [number, number, number];

/**
 * The prison, drawn like the club's inside: a dollhouse with its back and left walls. A cell, a bathroom with three toilets, a kitchen,
 * a laundry, a hall with puddles, a wall with an unfinished mural and a yard full of leaves. Each chore has its place; the dirt of
 * every place fades as the chores are done.
 */
export class PrisonWorld {
  readonly group = new THREE.Group();
  readonly stations: Station[] = [];
  readonly lights: THREE.Light[] = [];

  constructor() {
    this.group.position.set(A.x, 0, A.z);
    this.build();
  }

  private add<T extends THREE.Object3D>(o: T, parent: THREE.Object3D = this.group): T {
    parent.add(o);
    return o;
  }

  private box(w: number, h: number, d: number, color: number | string, p: Pt, parent?: THREE.Object3D, opacity?: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color, opacity ? { opacity, outline: false } : {}));
    m.position.set(p[0], p[1] + h / 2, p[2]);
    return this.add(m, parent);
  }

  private cyl(rt: number, rb: number, h: number, color: number | string, p: Pt, parent?: THREE.Object3D, seg = 14): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), toon(color));
    m.position.set(p[0], p[1] + h / 2, p[2]);
    return this.add(m, parent);
  }

  private ball(r: number, color: number | string, p: Pt, parent?: THREE.Object3D): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), toon(color));
    m.position.set(...p);
    return this.add(m, parent);
  }

  private build(): void {
    // a base like a model's: the building sits on a dark slab with a lighter floor on top
    this.box(23, 0.5, 19, 0x2e3250, [0, -0.7, 1]);
    this.box(21, 0.2, 17, 0x9aa0b6, [0, -0.2, 1]);
    // the zones of the floor, each with its own colour
    for (let x = 0; x < 6; x++) for (let z = 0; z < 5; z++) this.box(1, 0.04, 1, (x + z) % 2 ? 0xeaf6ff : 0x9fd0e8, [-3.5 + x, 0, -6.5 + z]); // the bathroom: blue and white
    for (let x = 0; x < 6; x++) for (let z = 0; z < 5; z++) this.box(1, 0.04, 1, (x + z) % 2 ? 0xf0d8b0 : 0xd8a878, [4.5 + x, 0, -6.5 + z]); // the kitchen: terracotta
    for (let x = 0; x < 6; x++) for (let z = 0; z < 5; z++) this.box(1, 0.04, 1, (x + z) % 2 ? 0xc8e8c0 : 0x9ac898, [4.5 + x, 0, -0.5 + z]); // the laundry: green
    for (let x = 0; x < 4; x++) for (let z = 0; z < 5; z++) this.box(1, 0.04, 1, (x + z) % 2 ? 0x7a7490 : 0x6a6480, [-10 + x, 0, -6.5 + z]); // the cell: dark
    this.box(9, 0.05, 5.4, 0x6a8a3a, [0, 0, 7.3]); // the yard: grass with a dirt patch
    this.box(5, 0.06, 3.4, 0x8a6a3a, [0, 0, 7.5]);
    // walls: two tones (teal below, cream above), a baseboard and a cap; only the back and the left ones, like the club
    this.box(21, 1.5, 0.4, 0x4f8a8a, [0, 0, -7.2]);
    this.box(21, 1.9, 0.4, 0xe8e0c8, [0, 1.5, -7.2]);
    this.box(0.4, 1.5, 16, 0x4f8a8a, [-10.2, 0, 1]);
    this.box(0.4, 1.9, 16, 0xe8e0c8, [-10.2, 1.5, 1]);
    this.box(21, 0.14, 0.5, 0x2e3250, [0, 3.4, -7.2]);
    this.box(0.5, 0.14, 16.5, 0x2e3250, [-10.2, 3.4, 1]);
    this.box(21, 0.18, 0.44, 0x2e3250, [0, 0, -7.2]);
    this.box(0.44, 0.18, 16, 0x2e3250, [-10.2, 0, 1]);
    // the cell: bars, a bunk, a tiny toilet, a sink and the days counted on the wall
    for (let i = 0; i < 9; i++) this.cyl(0.05, 0.05, 3.2, 0x2a2a36, [-6.2, 0, -6.6 + i * 0.55], undefined, 8);
    this.box(0.14, 0.14, 5.2, 0x2a2a36, [-6.2, 3.0, -4.4]);
    this.box(0.14, 0.14, 5.2, 0x2a2a36, [-6.2, 0.3, -4.4]);
    this.box(2.4, 0.3, 1.0, 0x5a4a6a, [-8.6, 0, -6.2]);
    this.box(2.4, 0.16, 1.0, 0xb8c0e0, [-8.6, 0.3, -6.2]);
    this.box(2.4, 0.3, 1.0, 0x5a4a6a, [-8.6, 1.3, -6.2]);
    this.box(2.4, 0.16, 1.0, 0xb8c0e0, [-8.6, 1.6, -6.2]);
    this.box(0.12, 1.3, 0.12, 0x2a2a36, [-9.7, 0, -6.6]);
    this.cyl(0.25, 0.22, 0.4, 0xeaf6ff, [-9.2, 0, -3.2]);
    this.box(0.5, 0.2, 0.3, 0xeaf6ff, [-9.8, 0.9, -2.2]);
    for (let g = 0; g < 2; g++) for (let i = 0; i < 4; i++) this.box(0.04, 0.5, 0.04, 0xfff3d0, [-7.2 + g * 0.8 + i * 0.12, 1.2, -6.95]);
    // barred windows on the back wall, with daylight
    for (const x of [-4.4, 3.2, 9.0]) {
      this.box(1.5, 1.1, 0.1, 0xbfe6ff, [x, 1.5, -6.95], undefined, 0.9);
      for (let i = 0; i < 4; i++) this.box(0.06, 1.2, 0.14, 0x2a2a36, [x - 0.55 + i * 0.37, 1.45, -6.9]);
      this.box(1.7, 0.1, 0.2, 0x2e3250, [x, 1.4, -6.9]);
      this.box(1.7, 0.1, 0.2, 0x2e3250, [x, 2.6, -6.9]);
    }
    // signs over each place, a clock and a notice board
    const sign = (text: string, color: string, x: number, y: number, w: number) => {
      const m = neon(text, color, w, w * 0.26, true);
      m.position.set(x, y, -6.9);
      this.group.add(m);
    };
    sign('PRISIÓN', '#ff4f6a', -8.2, 3.0, 3.0);
    sign('BAÑOS', '#5ec8ff', -0.6, 3.0, 2.2);
    sign('COCINA', '#f5b91d', 7.0, 3.0, 2.4);
    this.cyl(0.36, 0.36, 0.06, 0xf4f1ff, [-2.2, 2.0, -6.95], undefined, 20).rotation.x = Math.PI / 2;
    this.box(0.04, 0.3, 0.04, 0x2a2a36, [-2.2, 2.0, -6.9]);
    this.box(1.3, 0.9, 0.08, 0x8a6a3a, [1.8, 1.6, -6.95]);
    for (let i = 0; i < 4; i++) this.box(0.28, 0.36, 0.02, [0xffffff, 0xfff3b0, 0xffd0d8, 0xd0f0ff][i], [1.35 + i * 0.3, 1.9, -6.9]);

    this.bathroom();
    this.kitchen();
    this.laundry();
    this.hall();
    this.mural();
    this.yard();

    // the guard's desk, in a corner of the hall, with a screen
    this.box(1.8, 0.8, 0.9, 0x6a5a44, [3.6, 0, 6.0]);
    this.box(1.9, 0.08, 1.0, 0x8a7a64, [3.6, 0.8, 6.0]);
    this.box(0.5, 0.35, 0.05, 0x1a2a3a, [3.8, 0.95, 5.8]);
    this.box(0.08, 0.15, 0.08, 0x2a2a36, [3.8, 0.88, 5.85]);
    // lamps on poles (there is no ceiling: the building is open to the camera) with a glow of their own
    for (const [x, z] of [[-4.6, -1], [3.4, -1], [-4.6, 5.6], [9.4, 5.6]] as const) {
      this.cyl(0.07, 0.09, 3.0, 0x2a2a36, [x, 0, z], undefined, 8);
      const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshBasicMaterial({ color: 0xfff1c0 }));
      bulb.position.set(x, 3.15, z);
      this.group.add(bulb);
    }

    this.lights.push(this.add(new THREE.HemisphereLight(0xeaf0ff, 0x6a5a7a, 1.15)));
    for (const [x, z] of [[-1, -3], [7, -3], [6, 3], [-1, 3], [0, 7], [-8, -3]] as const) {
      const l = this.add(new THREE.PointLight(0xffe2b0, 22, 18));
      l.position.set(x, 3.2, z);
      this.lights.push(l);
    }
  }

  private station(s: Omit<Station, 'x' | 'z'> & { x: number; z: number }): void {
    this.stations.push({ ...s, x: A.x + s.x, z: A.z + s.z });
  }

  private bathroom(): void {
    const dirt: THREE.Object3D[] = [];
    for (const x of [-2.6, -0.6, 1.4]) {
      this.cyl(0.32, 0.26, 0.45, 0xe9ecf5, [x, 0, -6.4]);
      this.box(0.7, 0.55, 0.25, 0xe9ecf5, [x, 0.4, -6.85]);
      this.box(1.2, 1.8, 0.08, 0x8a96c8, [x + 1.0, 0, -5.6]);
      dirt.push(this.box(0.3, 0.04, 0.3, 0x4a3a1a, [x, 0.47, -6.4]), this.box(0.5, 0.03, 0.4, 0x5a4a2a, [x - 0.1, 0.0, -5.7]));
    }
    this.box(1.8, 0.1, 0.6, 0xe9ecf5, [-3.5, 0.9, -6.4]);
    this.station({
      id: 'scrub', name: 'Limpiar los baños', doing: 'Limpiando los baños…', x: -0.6, z: -4.9, face: [0, -1], dirt,
      tool: () => {
        const g = new THREE.Group();
        const sponge = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.16), toon(0xf2c40d));
        const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.26, 12), toon(0x2d7bff));
        bucket.position.set(0.45, 0.13, 0.2);
        g.add(sponge, bucket);
        return { group: g, move: (t) => sponge.position.set(0, 0.42, 0.55 + 0.1 * Math.sin(t * 9)) };
      },
    });
  }

  private kitchen(): void {
    const dirt: THREE.Object3D[] = [];
    this.box(5.4, 0.9, 0.9, 0x8a8fa6, [7, 0, -6.4]);
    this.box(5.5, 0.1, 1.0, 0xcfd6e8, [7, 0.9, -6.4]);
    for (const x of [5.6, 8.0]) {
      this.box(1.0, 0.06, 0.6, 0x4a4e66, [x, 1.0, -6.3]);
      this.cyl(0.05, 0.05, 0.4, 0xdfe6f2, [x, 1.0, -6.75]);
    }
    for (let i = 0; i < 6; i++) dirt.push(this.cyl(0.26, 0.26, 0.05, i % 2 ? 0xf4f1ff : 0xe0dcc8, [6.6 + (i % 3) * 0.5, 1.0 + Math.floor(i / 3) * 0.06 + 0.1, -6.4 + (i % 2) * 0.1], undefined, 16));
    dirt.push(this.cyl(0.2, 0.2, 0.2, 0x4a4a54, [9.0, 1.0, -6.3]));
    this.station({
      id: 'wash', name: 'Lavar los platos', doing: 'Lavando los platos…', x: 7, z: -5.1, face: [0, -1], dirt,
      tool: () => {
        const g = new THREE.Group();
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16), toon(0xf4f1ff));
        const sponge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.12), toon(0xf2c40d));
        g.add(plate, sponge);
        return { group: g, move: (t) => { plate.position.set(0, 0.5, 0.42); sponge.position.set(0.1 * Math.cos(t * 7), 0.54, 0.42 + 0.08 * Math.sin(t * 7)); } };
      },
    });
  }

  private laundry(): void {
    const dirt: THREE.Object3D[] = [];
    for (const z of [0.4, 2.2]) {
      this.box(1.1, 1.2, 1.1, 0xe9ecf5, [9.2, 0, z]);
      this.cyl(0.36, 0.36, 0.1, 0x2a2a34, [8.62, 0.45, z], undefined, 16).rotation.z = Math.PI / 2;
    }
    this.box(2.4, 0.8, 1.1, 0x8f6a3a, [6.5, 0, 3.0]);
    const colors = [0xff4fa3, 0x5ec8ff, 0xf5b91d, 0x3ddc97, 0xb04cff, 0xff6a3a, 0x5ec8ff, 0xff4fa3];
    colors.forEach((c, i) => dirt.push(this.box(0.55, 0.12, 0.45, c, [5.8 + (i % 4) * 0.45, 0.8 + Math.floor(i / 4) * 0.12, 2.8 + (i % 2) * 0.15])));
    this.station({
      id: 'fold', name: 'Doblar la ropa', doing: 'Doblando la ropa…', x: 6.5, z: 4.1, face: [0, -1], dirt,
      tool: () => {
        const g = new THREE.Group();
        const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.34), toon(0x5ec8ff));
        g.add(cloth);
        return { group: g, move: (t) => { cloth.position.set(0.05 * Math.sin(t * 5), 0.4, 0.5); cloth.scale.set(1 - 0.3 * Math.max(0, Math.sin(t * 5)), 1 + Math.max(0, Math.sin(t * 5)), 1); } };
      },
    });
  }

  private hall(): void {
    const dirt: THREE.Object3D[] = [];
    for (const [x, z, s] of [[-2.5, 1.0, 1.1], [-0.4, 2.6, 1.4], [1.6, 1.2, 0.9], [-1.4, 4.0, 1.2], [1.8, 3.6, 1.0]] as const) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.6, s * 0.6, 0.02, 20), toon(0x5a82c8, { opacity: 0.75, outline: false }));
      p.scale.z = 0.7;
      p.position.set(x, 0.03, z);
      this.group.add(p);
      dirt.push(p);
    }
    this.cyl(0.24, 0.2, 0.34, 0x2d7bff, [3.0, 0, 3.4]);
    this.station({
      id: 'mop', name: 'Trapear el piso', doing: 'Trapeando el piso…', x: -1.0, z: 2.0, face: [1, 0.2], dirt,
      tool: () => {
        const g = new THREE.Group();
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), toon(0x8f6a3a));
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.16), toon(0xdfe6f2));
        g.add(stick, head);
        return { group: g, move: (t) => { const x = 0.32 * Math.sin(t * 3); head.position.set(x, 0.04, 0.78); stick.position.set(x / 2, 0.46, 0.5); stick.rotation.set(0.9, 0, -x * 0.5); } };
      },
    });
  }

  private mural(): void {
    const dirt: THREE.Object3D[] = [];
    // a long mural on the west wall: the colours are there, under grey patches that disappear as it is painted
    const cols = [0xff4fa3, 0x5ec8ff, 0xf5b91d, 0x3ddc97, 0xb04cff, 0xff6a3a];
    cols.forEach((c, i) => this.box(0.08, 1.8, 0.8, c, [-9.95, 0.5, 0.3 + i * 0.8]));
    cols.forEach((_, i) => dirt.push(this.box(0.12, 1.9, 0.82, 0x7a7f96, [-9.88, 0.45, 0.3 + i * 0.8])));
    this.cyl(0.2, 0.17, 0.3, 0xff4fa3, [-8.7, 0, 5.4]);
    this.station({
      id: 'paint', name: 'Pintar la pared', doing: 'Pintando la pared…', x: -8.9, z: 2.6, face: [-1, 0], dirt,
      tool: () => {
        const g = new THREE.Group();
        const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 12), toon(0xff4fa3));
        roller.rotation.x = Math.PI / 2;
        g.add(roller);
        return { group: g, move: (t) => roller.position.set(0.1 * Math.sin(t * 2), 0.78 + 0.22 * Math.sin(t * 3), 0.6) };
      },
    });
  }

  private yard(): void {
    const dirt: THREE.Object3D[] = [];
    const rnd = (a: number) => ((Math.sin(a * 12.9898) * 43758.5453) % 1 + 1) % 1;
    for (let i = 0; i < 16; i++) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.14), toon([0x8a6a2a, 0x5a8a2a, 0xb06a2a][i % 3]));
      leaf.position.set(-3.4 + rnd(i + 1) * 6.8, 0.05, 5.4 + rnd(i + 7) * 3.8);
      leaf.rotation.y = rnd(i + 3) * 3;
      this.group.add(leaf);
      dirt.push(leaf);
    }
    // a low fence around the yard and one tree
    for (let i = 0; i < 10; i++) this.box(0.08, 0.9, 0.08, 0x6a5a44, [-4 + i * 0.9, 0, 9.4]);
    this.box(8.2, 0.08, 0.06, 0x6a5a44, [0, 0.7, 9.4]);
    for (let i = 0; i < 12; i++) this.cyl(0.015, 0.015, 0.35, 0x2a2a36, [-4 + i * 0.75, 0.9, 9.4], undefined, 4).rotation.z = i % 2 ? 0.7 : -0.7; // barbed wire
    this.cyl(0.14, 0.2, 1.6, 0x6a4a2a, [3.2, 0, 8.4]);
    this.ball(0.9, 0x3a8a3a, [3.2, 2.0, 8.4]);
    this.cyl(0.12, 0.17, 1.2, 0x6a4a2a, [-3.4, 0, 8.6]);
    this.ball(0.7, 0x4a9a3a, [-3.4, 1.7, 8.6]);
    this.station({
      id: 'sweep', name: 'Barrer el patio', doing: 'Barriendo el patio…', x: 0, z: 5.9, face: [0, 1], dirt,
      tool: () => {
        const g = new THREE.Group();
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), toon(0x8f6a3a));
        const bristles = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.12), toon(0xd9b24a));
        g.add(stick, bristles);
        return { group: g, move: (t) => { const x = 0.3 * Math.sin(t * 3); bristles.position.set(x, 0.04, 0.72); stick.position.set(x / 2, 0.46, 0.46); stick.rotation.set(0.95, 0, -x * 0.6); } };
      },
    });
  }

  /** How many chores are done (0 to 1): the dirt of every place fades as it is cleaned. */
  setProgress(p: number): void {
    for (const s of this.stations) {
      const keep = Math.ceil((1 - Math.min(1, Math.max(0, p))) * s.dirt.length);
      s.dirt.forEach((d, i) => (d.visible = i < keep));
    }
  }

  station$(id: string): Station | undefined {
    return this.stations.find((s) => s.id === id);
  }

  /** The camera: where to look and how far, for the whole building. */
  get view(): { x: number; z: number } {
    return { x: A.x, z: A.z + 1 };
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
}
