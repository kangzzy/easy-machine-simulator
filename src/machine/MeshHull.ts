import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MeshHullMode } from '../types/deployment';

const HULL_COLOR = 0x88aacc;
const DECIMATE_TARGET_TRIANGLES = 8000;
// SimplifyModifier is O(n²)-ish; refuse inputs above this so we don't lock up the
// page. Stride pre-decimation creates holes, so we don't fall back to it for the
// 'decimated' mode — we just ask the user to pick a smaller file or 외피만 mode.
const SIMPLIFY_INPUT_HARD_CAP = 60_000;

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
  if (mode === 'decimated') {
    simplifyGroupInPlace(group, DECIMATE_TARGET_TRIANGLES);
    return group;
  }
  return group;
}

/**
 * Run the quadric-error SimplifyModifier on each mesh in the group, distributing
 * the triangle budget proportionally so the overall silhouette is preserved.
 * Mutates child geometries in place.
 */
function simplifyGroupInPlace(group: THREE.Group, targetTotal: number): void {
  const meshes: THREE.Mesh[] = [];
  let currentTotal = 0;
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      meshes.push(child);
      const idx = child.geometry.index;
      const pos = child.geometry.getAttribute('position');
      currentTotal += idx ? idx.count / 3 : (pos?.count ?? 0) / 3;
    }
  });

  if (meshes.length === 0 || currentTotal <= targetTotal) return;

  if (currentTotal > SIMPLIFY_INPUT_HARD_CAP) {
    throw new Error(
      `모델 삼각형 수가 너무 많아 데시메이션 불가 (${Math.round(currentTotal).toLocaleString()} > ${SIMPLIFY_INPUT_HARD_CAP.toLocaleString()}). ` +
      `더 가벼운 파일을 사용하거나 "외피만" 모드를 선택하세요.`,
    );
  }

  const ratio = targetTotal / currentTotal;
  const modifier = new SimplifyModifier();

  for (const mesh of meshes) {
    const geom = mesh.geometry;
    const idx = geom.index;
    const pos = geom.getAttribute('position');
    const tris = idx ? idx.count / 3 : (pos?.count ?? 0) / 3;
    const targetTris = Math.max(64, Math.floor(tris * ratio));
    if (targetTris >= tris) continue;

    try {
      // SimplifyModifier needs welded vertices (no duplicates) — STL especially has
      // every vertex duplicated 3x because triangles are independent.
      const merged = mergeVertices(geom);
      merged.deleteAttribute('uv');
      merged.deleteAttribute('uv2');
      merged.deleteAttribute('color');
      merged.deleteAttribute('tangent');

      const verticesNow = merged.getAttribute('position').count;
      const workingTris = merged.index ? merged.index.count / 3 : verticesNow / 3;
      const finalRatio = targetTris / workingTris;
      const targetVertices = Math.max(32, Math.floor(verticesNow * finalRatio));
      const removeCount = Math.max(0, verticesNow - targetVertices);

      let simplified: THREE.BufferGeometry;
      if (removeCount === 0) {
        simplified = merged;
      } else {
        simplified = modifier.modify(merged, removeCount);
        merged.dispose();
      }
      simplified.computeVertexNormals();

      mesh.geometry.dispose();
      mesh.geometry = simplified;
    } catch (e) {
      console.warn('SimplifyModifier failed for a mesh, keeping original:', e);
    }
  }
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
