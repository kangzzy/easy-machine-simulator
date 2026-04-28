import * as THREE from 'three';
import { WorkerPool } from '../workers/WorkerPool';
import type { ProcessMeshRequest, ProcessMeshResult } from '../workers/mesh.worker';
import type { MeshHullMode } from '../types/deployment';

const DEFAULT_COLOR = 0x8899aa;

export interface ProcessedMesh {
  group: THREE.Group;
  triangleCount: number;
  vertexCount: number;
  size: { x: number; y: number; z: number };
}

let pool: WorkerPool<ProcessMeshRequest, ProcessMeshResult> | null = null;

function getPool(): WorkerPool<ProcessMeshRequest, ProcessMeshResult> {
  if (!pool) {
    pool = new WorkerPool<ProcessMeshRequest, ProcessMeshResult>(
      new URL('../workers/mesh.worker.ts', import.meta.url),
    );
  }
  return pool;
}

/**
 * Parse + simplify/hull a model file off the main thread. The worker returns plain
 * typed arrays which we wrap in a Three.js Mesh/Group on the UI thread.
 *
 * The file's coordinate origin is preserved (no auto-recentering) so robot link
 * STLs stay aligned to their joint axis.
 */
export async function processModelFile(
  file: File,
  opts: { hullMode: MeshHullMode },
): Promise<ProcessedMesh> {
  const buffer = await file.arrayBuffer();
  const result = await getPool().execute(
    'process',
    {
      buffer,
      fileName: file.name,
      hullMode: opts.hullMode,
    },
    [buffer],
  );

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(result.positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(result.normals, 3));
  if (result.indices) {
    geom.setIndex(new THREE.Uint32BufferAttribute(result.indices, 1));
  }

  const mat = new THREE.MeshStandardMaterial({
    color: DEFAULT_COLOR,
    metalness: 0.4,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geom, mat));

  return {
    group,
    triangleCount: result.triangleCount,
    vertexCount: result.vertexCount,
    size: result.size,
  };
}
