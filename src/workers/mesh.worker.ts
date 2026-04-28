/// Mesh processing worker: parse STL/OBJ/GLB/STEP and optionally simplify or hull.
/// Returns plain Float32Array/Uint32Array typed arrays so the main thread just
/// reconstructs a BufferGeometry — no DOM access required here.

import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

import type { WorkerMessage, WorkerResponse } from './WorkerPool';

export type MeshHullMode = 'none' | 'decimated' | 'convex-hull';

export interface ProcessMeshRequest {
  buffer: ArrayBuffer;
  fileName: string;
  hullMode: MeshHullMode;
  /** Decimation cap for the raw load step (only applied in 'none' mode for storage budget). */
  storageCap?: number;
  /** Triangle target for the 'decimated' mode (default 8000). */
  decimateTarget?: number;
  /** Hard cap for SimplifyModifier input. */
  simplifyInputCap?: number;
}

export interface ProcessMeshResult {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array | null;
  triangleCount: number;
  size: { x: number; y: number; z: number };
  vertexCount: number;
}

const DEFAULT_DECIMATE_TARGET = 8000;
const DEFAULT_STORAGE_CAP = 120_000;
// SimplifyModifier runs in this worker so the UI never freezes. We can be generous
// with the input size — the trade-off is wall-clock time (large meshes may take
// 30+ seconds), not a frozen page.
const DEFAULT_SIMPLIFY_HARD_CAP = 250_000;

self.onmessage = async (e: MessageEvent<WorkerMessage<ProcessMeshRequest>>) => {
  const { id, type, payload } = e.data;
  try {
    let result: ProcessMeshResult;
    switch (type) {
      case 'process':
        result = await processMesh(payload);
        break;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
    const transfers: Transferable[] = [result.positions.buffer, result.normals.buffer];
    if (result.indices) transfers.push(result.indices.buffer);
    const response: WorkerResponse<ProcessMeshResult> = { id, type, payload: result };
    (self as any).postMessage(response, transfers);
  } catch (err: any) {
    const response: WorkerResponse = {
      id,
      type,
      payload: null,
      error: err?.message ?? String(err),
    };
    self.postMessage(response);
  }
};

async function processMesh(req: ProcessMeshRequest): Promise<ProcessMeshResult> {
  const ext = (req.fileName.split('.').pop() ?? '').toLowerCase();
  let group = await parseToGroup(req.buffer, ext);

  // Bake any nested transforms (OBJ/GLB sometimes have non-identity local transforms)
  // so all geometry is in a single coordinate space. We do NOT recenter — the file's
  // origin is preserved.
  group = bakeTransforms(group);

  // Apply hull mode
  if (req.hullMode === 'convex-hull') {
    group = toConvexHull(group);
  } else if (req.hullMode === 'decimated') {
    simplifyGroupInPlace(
      group,
      req.decimateTarget ?? DEFAULT_DECIMATE_TARGET,
      req.simplifyInputCap ?? DEFAULT_SIMPLIFY_HARD_CAP,
    );
  } else if (req.hullMode === 'none') {
    // For storage budget: cap very large 원본 meshes via stride decimation as a
    // last resort (avoids 50MB+ base64 case files). Stride leaves holes but the
    // user explicitly chose 원본, so we only kick in for absurdly large inputs.
    const cap = req.storageCap ?? DEFAULT_STORAGE_CAP;
    strideCapInPlace(group, cap);
  }

  // Merge all child meshes into a single position/normal/index buffer.
  const merged = mergeAllMeshes(group);
  if (!merged) {
    throw new Error('No mesh data found in file.');
  }

  const bbox = new THREE.Box3();
  const tmpVec = new THREE.Vector3();
  const positions = merged.positions;
  for (let i = 0; i < positions.length; i += 3) {
    tmpVec.set(positions[i], positions[i + 1], positions[i + 2]);
    bbox.expandByPoint(tmpVec);
  }
  const size = bbox.getSize(new THREE.Vector3());

  return {
    positions: merged.positions,
    normals: merged.normals,
    indices: merged.indices,
    triangleCount: merged.indices ? merged.indices.length / 3 : merged.positions.length / 9,
    vertexCount: merged.positions.length / 3,
    size: { x: size.x, y: size.y, z: size.z },
  };
}

// ─── Parsing ─────────────────────────────────────────────────────────

async function parseToGroup(buffer: ArrayBuffer, ext: string): Promise<THREE.Group> {
  switch (ext) {
    case 'stl': {
      const geom = new STLLoader().parse(buffer);
      return wrapGeometry(geom);
    }
    case 'obj': {
      const text = new TextDecoder().decode(buffer);
      return new OBJLoader().parse(text);
    }
    case 'glb':
    case 'gltf':
      return await parseGLTF(buffer);
    case 'step':
    case 'stp': {
      const geom = await parseSTEP(new Uint8Array(buffer));
      return wrapGeometry(geom);
    }
    default:
      throw new Error(`Unsupported format: .${ext}`);
  }
}

function wrapGeometry(geom: THREE.BufferGeometry): THREE.Group {
  if (!geom.getAttribute('normal')) geom.computeVertexNormals();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geom, new THREE.MeshBasicMaterial()));
  return group;
}

async function parseGLTF(buffer: ArrayBuffer): Promise<THREE.Group> {
  // GLTFLoader.parse() is the synchronous variant that takes a buffer directly —
  // no need for blob URLs (which would require DOM access).
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(buffer, '', (gltf) => resolve(gltf.scene), (err) => reject(err));
  });
}

async function parseSTEP(data: Uint8Array): Promise<THREE.BufferGeometry> {
  let occt: any;
  try {
    occt = await import('occt-import-js');
  } catch (e: any) {
    throw new Error(`STEP 로더(occt-import-js)를 불러오지 못했습니다: ${e?.message ?? e}`);
  }

  let oc: any;
  try {
    // The WASM file is served from /public so Vite doesn't intercept the request
    // with the SPA index.html fallback. Without locateFile, occt-import-js asks for
    // it relative to the worker bundle URL which Vite redirects to index.html and
    // WebAssembly.instantiate then complains about the magic word.
    oc = await occt.default({
      locateFile: (path: string) => (path.endsWith('.wasm') ? '/occt-import-js.wasm' : path),
    });
  } catch (e: any) {
    throw new Error(`STEP WASM 초기화 실패: ${e?.message ?? e}`);
  }

  let result: any;
  try {
    result = oc.ReadStepFile(data, null);
  } catch (e: any) {
    throw new Error(`STEP 파싱 오류: ${e?.message ?? e}`);
  }

  if (!result?.success) {
    throw new Error('STEP 파일 파싱 실패 (occt-import-js가 success=false 반환).');
  }
  if (!result.meshes || result.meshes.length === 0) {
    throw new Error('STEP 파일에서 메시를 추출하지 못했습니다.');
  }

  const merged = new THREE.BufferGeometry();
  const allPositions: number[] = [];
  const allNormals: number[] = [];
  const allIndices: number[] = [];
  let indexOffset = 0;

  for (const mesh of result.meshes) {
    const positions = mesh.attributes.position.array;
    const normals = mesh.attributes.normal?.array;
    const indices = mesh.index.array;
    for (let i = 0; i < positions.length; i++) allPositions.push(positions[i]);
    if (normals) {
      for (let i = 0; i < normals.length; i++) allNormals.push(normals[i]);
    }
    for (let i = 0; i < indices.length; i++) allIndices.push(indices[i] + indexOffset);
    indexOffset += positions.length / 3;
  }

  merged.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
  if (allNormals.length > 0) {
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(allNormals, 3));
  }
  merged.setIndex(allIndices);
  merged.computeVertexNormals();
  return merged;
}

// ─── Transforms ──────────────────────────────────────────────────────

function bakeTransforms(group: THREE.Group): THREE.Group {
  group.updateMatrixWorld(true);
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      child.geometry.applyMatrix4(child.matrixWorld);
      child.position.set(0, 0, 0);
      child.rotation.set(0, 0, 0);
      child.scale.set(1, 1, 1);
      child.updateMatrix();
      child.matrixWorld.identity();
    }
  });
  group.position.set(0, 0, 0);
  group.rotation.set(0, 0, 0);
  group.scale.set(1, 1, 1);
  return group;
}

// ─── Convex hull ─────────────────────────────────────────────────────

function toConvexHull(group: THREE.Group): THREE.Group {
  const points: THREE.Vector3[] = [];
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const pos = child.geometry.getAttribute('position');
      if (!pos) return;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        points.push(v.clone());
      }
    }
  });
  const out = new THREE.Group();
  if (points.length < 4) return out;
  const hullGeom = new ConvexGeometry(points);
  hullGeom.computeVertexNormals();
  out.add(new THREE.Mesh(hullGeom, new THREE.MeshBasicMaterial()));
  return out;
}

// ─── Decimation (SimplifyModifier) ──────────────────────────────────

function simplifyGroupInPlace(group: THREE.Group, targetTotal: number, hardCap: number): void {
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

  if (currentTotal > hardCap) {
    throw new Error(
      `삼각형 ${Math.round(currentTotal).toLocaleString()}개는 데시메이션 한도(${hardCap.toLocaleString()})를 초과합니다. ` +
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

// ─── Stride cap (only for 원본 mode storage budget) ─────────────────

function strideCapInPlace(group: THREE.Group, maxTriangles: number): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    const geom = child.geometry;
    const idx = geom.index;
    const pos = geom.getAttribute('position');
    const tris = idx ? idx.count / 3 : (pos?.count ?? 0) / 3;
    if (tris <= maxTriangles) return;

    const src = idx ? geom.toNonIndexed() : geom;
    const positions = src.getAttribute('position');
    const triCount = Math.floor(positions.count / 3);
    const stride = Math.max(1, Math.ceil(triCount / maxTriangles));
    const newPositions: number[] = [];
    for (let i = 0; i < triCount; i += stride) {
      const base = i * 3;
      if (base + 2 >= positions.count) break;
      for (let v = 0; v < 3; v++) {
        const k = base + v;
        newPositions.push(positions.getX(k), positions.getY(k), positions.getZ(k));
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    out.computeVertexNormals();
    if (src !== geom) src.dispose();
    child.geometry.dispose();
    child.geometry = out;
  });
}

// ─── Merge child meshes into single buffer ──────────────────────────

interface MergedBuffers {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array | null;
}

function mergeAllMeshes(group: THREE.Group): MergedBuffers | null {
  const meshes: THREE.Mesh[] = [];
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) meshes.push(child);
  });
  if (meshes.length === 0) return null;

  // Single-mesh fast path.
  if (meshes.length === 1) {
    const geom = meshes[0].geometry;
    const pos = geom.getAttribute('position');
    let nrm = geom.getAttribute('normal');
    if (!nrm) {
      geom.computeVertexNormals();
      nrm = geom.getAttribute('normal');
    }
    const positions = new Float32Array(pos.array as Float32Array);
    const normals = new Float32Array(nrm.array as Float32Array);
    const indices = geom.index ? new Uint32Array(geom.index.array as Uint32Array) : null;
    return { positions, normals, indices };
  }

  // Multi-mesh: concatenate. Convert all to non-indexed for simplicity, then
  // re-index would be a nice-to-have but not necessary for rendering.
  const allPositions: number[] = [];
  const allNormals: number[] = [];
  for (const m of meshes) {
    const geom = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const pos = geom.getAttribute('position');
    let nrm = geom.getAttribute('normal');
    if (!nrm) {
      geom.computeVertexNormals();
      nrm = geom.getAttribute('normal');
    }
    for (let i = 0; i < pos.array.length; i++) allPositions.push(pos.array[i]);
    for (let i = 0; i < nrm.array.length; i++) allNormals.push(nrm.array[i]);
  }
  return {
    positions: new Float32Array(allPositions),
    normals: new Float32Array(allNormals),
    indices: null,
  };
}
