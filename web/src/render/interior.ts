import * as THREE from 'three';
import { BY_ID } from '../core/catalog';
import { PHASES, footprint, type PlacedItem, type Rot } from '../core/club';
import { buildProp } from './props';
import { DEFAULTS, type Decor } from '../core/decor';
import { buildShell } from './roomstyle';

const DEFAULTS_SEL = DEFAULTS as Decor['sel'];

/**
 * The inside of somebody else's club, to look at (not to edit): floor, two cutaway walls and their furniture. Building
 * coordinates, like the club the player owns.
 */
export function buildInterior(phaseId: number, items: Array<Pick<PlacedItem, 'id' | 'x' | 'y' | 'rot'> & { tier?: number }>, sel: Decor['sel'] = DEFAULTS_SEL): THREE.Group {
  const g = new THREE.Group();
  const p = PHASES[Math.min(Math.max(phaseId, 1), PHASES.length) - 1];
  // the same floor, walls, mouldings and pictures the owner has bought
  const shell = buildShell(p, sel);
  g.add(shell.floor, shell.wallN, shell.wallW);
  for (const it of items) {
    const def = BY_ID.get(it.id);
    if (!def) continue;
    const prop = buildProp(def.id, def.w, def.d, Math.min(4, Math.max(1, it.tier ?? 1)));
    const fp = footprint(def, it.rot as Rot);
    prop.position.set(it.x + fp.w / 2, 0, it.y + fp.d / 2);
    prop.rotation.y = (-it.rot * Math.PI) / 2;
    g.add(prop);
  }
  return g;
}
