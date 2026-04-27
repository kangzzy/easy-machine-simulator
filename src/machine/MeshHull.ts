import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { MeshHullMode } from '../types/deployment';

const HULL_COLOR = 0x88aacc;

export function toConvexHull(group: THREE.Group): THREE.Group {
  const points: THREE.Vector3[] = [];
  group.updateMatrixWorld(true);

  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const pos = child.geometry.getAttribute('position');
      if (!pos) return;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        v.applyMatrix4(child.matrixWorld);
        points.push(v.clone());
      }
    }
  });

  const result = new THREE.Group();
  if (points.length < 4) {
    return result;
  }

  const hullGeom = new ConvexGeometry(points);
  hullGeom.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: HULL_COLOR,
    metalness: 0.4,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  result.add(new THREE.Mesh(hullGeom, mat));
  return result;
}

export function countTriangles(group: THREE.Group): number {
  let total = 0;
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const idx = child.geometry.index;
      const pos = child.geometry.getAttribute('position');
      total += idx ? idx.count / 3 : (pos?.count ?? 0) / 3;
    }
  });
  return Math.round(total);
}

export function applyHullMode(group: THREE.Group, mode: MeshHullMode): THREE.Group {
  if (mode === 'convex-hull') {
    const hull = toConvexHull(group);
    disposeGroup(group);
    return hull;
  }
  return group;
}

export async function exportGroupToGlbBase64(group: THREE.Group): Promise<string> {
  const exporter = new GLTFExporter();
  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      group,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error('GLTFExporter returned non-binary result'));
      },
      (err) => reject(err),
      { binary: true },
    );
  });
  return arrayBufferToBase64(arrayBuffer);
}

export async function importGroupFromGlbBase64(base64: string): Promise<THREE.Group> {
  const buffer = base64ToArrayBuffer(base64);
  const loader = new GLTFLoader();
  return new Promise<THREE.Group>((resolve, reject) => {
    loader.parse(buffer, '', (gltf) => resolve(gltf.scene), (err) => reject(err));
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      const m = child.material;
      if (Array.isArray(m)) m.forEach(x => x.dispose()); else m?.dispose();
    }
  });
}
