import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rel = new THREE.Matrix4();
const inv = new THREE.Matrix4();
const c0 = new THREE.Vector3();
const c1 = new THREE.Vector3();
const c2 = new THREE.Vector3();

function rigid(m: THREE.Matrix4): boolean {
  if (m.determinant() <= 0) return false;
  c0.setFromMatrixColumn(m, 0);
  c1.setFromMatrixColumn(m, 1);
  c2.setFromMatrixColumn(m, 2);
  const s = c0.lengthSq();
  const eps = s * 1e-4;
  return Math.abs(c1.lengthSq() - s) < eps && Math.abs(c2.lengthSq() - s) < eps && Math.abs(c0.dot(c1)) < eps && Math.abs(c0.dot(c2)) < eps && Math.abs(c1.dot(c2)) < eps;
}

function keyOf(mat: THREE.Material): string | null {
  const t = mat as THREE.MeshToonMaterial;
  if (!t.isMeshToonMaterial || t.transparent || t.opacity < 1 || !t.visible) return null;
  if (t.map || t.emissiveMap || t.alphaMap || t.normalMap || t.bumpMap || t.displacementMap || t.aoMap || t.lightMap) return null;
  if (t.side !== THREE.FrontSide || !t.depthTest || !t.depthWrite || t.wireframe || t.vertexColors || t.alphaTest > 0) return null;
  if (t.userData.shared) return `s${t.id}`;
  return [t.color.getHex(), t.emissive.getHex(), t.emissiveIntensity, t.gradientMap?.id ?? 0, t.fog ? 1 : 0, JSON.stringify(t.userData.outlineParameters ?? null)].join('|');
}

function steady(mesh: THREE.Mesh, root: THREE.Object3D): boolean {
  if (mesh.userData.pulse || mesh.renderOrder !== 0) return false;
  for (let o: THREE.Object3D | null = mesh; o && o !== root; o = o.parent) {
    if ((!o.visible && !o.userData.merged) || o.userData.spin !== undefined || o.userData.live || o.userData.tick !== undefined) return false;
  }
  return true;
}

function partOf(mesh: THREE.Mesh): THREE.BufferGeometry {
  const geo = mesh.geometry;
  const part = new THREE.BufferGeometry();
  const src = geo.index ? geo.toNonIndexed() : geo;
  part.setAttribute('position', src.attributes.position.clone());
  part.setAttribute('normal', src.attributes.normal.clone());
  if (src !== geo) src.dispose();
  rel.multiplyMatrices(inv, mesh.matrixWorld);
  part.applyMatrix4(rel);
  return part;
}

export function mergeStatic(root: THREE.Object3D, out: THREE.Group): void {
  root.updateMatrixWorld(true);
  inv.copy(root.matrixWorld).invert();
  const groups = new Map<string, { material: THREE.Material; meshes: THREE.Mesh[] }>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    if (Array.isArray(mesh.material) || !steady(mesh, root)) return;
    const geo = mesh.geometry;
    if (!geo.attributes.position || !geo.attributes.normal || Object.keys(geo.morphAttributes).length) return;
    const key = keyOf(mesh.material);
    if (!key) return;
    rel.multiplyMatrices(inv, mesh.matrixWorld);
    if (!rigid(rel)) return;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { material: mesh.material, meshes: [] }));
    g.meshes.push(mesh);
  });
  const old = new Map<string, THREE.Mesh>();
  for (const child of out.children) old.set(child.userData.key as string, child as THREE.Mesh);
  for (const [key, g] of groups) {
    const prev = old.get(key);
    if (g.meshes.length < 2) {
      for (const m of g.meshes) show(m, true);
      continue;
    }
    const sig = g.meshes.map((m) => m.id).join(',');
    if (prev && prev.userData.sig === sig && prev.material === g.material) {
      old.delete(key);
      continue;
    }
    const merged = mergeGeometries(g.meshes.map(partOf), false);
    if (!merged) {
      for (const m of g.meshes) show(m, true);
      continue;
    }
    for (const m of g.meshes) show(m, false);
    const mesh = new THREE.Mesh(merged, g.material);
    mesh.userData.key = key;
    mesh.userData.sig = sig;
    out.add(mesh);
  }
  for (const stale of old.values()) {
    out.remove(stale);
    stale.geometry.dispose();
  }
}

function show(mesh: THREE.Mesh, on: boolean): void {
  if (on && !mesh.userData.merged) return;
  mesh.visible = on;
  mesh.userData.merged = !on;
}
