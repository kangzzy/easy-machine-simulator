import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MAX_TRIANGLES = 10000;
const DEFAULT_COLOR = 0x8899aa;

/**
 * Load a 3D model file and return a simplified Three.js mesh.
 * Supports: STL, OBJ, GLB/GLTF, STEP/STP (via occt-import-js)
 */
export async function loadModelFile(file: File): Promise<{ mesh: THREE.Group; info: ModelInfo }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  let geometry: THREE.BufferGeometry | null = null;
  let group: THREE.Group | null = null;

  const arrayBuffer = await file.arrayBuffer();

  switch (ext) {
    case 'stl':
      geometry = new STLLoader().parse(arrayBuffer);
      break;
    case 'obj': {
      const text = new TextDecoder().decode(arrayBuffer);
      group = new OBJLoader().parse(text);
      break;
    }
    case 'glb':
    case 'gltf': {
      const result = await loadGLTF(arrayBuffer);
      group = result;
      break;
    }
    case 'step':
    case 'stp': {
      geometry = await loadSTEP(new Uint8Array(arrayBuffer));
      break;
    }
    default:
      throw new Error(`Unsupported format: .${ext}`);
  }

  // Build group from single geometry if needed
  if (geometry && !group) {
    const decimated = decimateGeometry(geometry, MAX_TRIANGLES);
    const mat = new THREE.MeshStandardMaterial({
      color: DEFAULT_COLOR,
      metalness: 0.4,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(decimated, mat);
    group = new THREE.Group();
    group.add(mesh);
  }

  if (!group) {
    group = new THREE.Group();
  }

  // Decimate all child meshes in group
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      child.geometry = decimateGeometry(child.geometry, MAX_TRIANGLES);
    }
  });

  // Compute info
  let totalTriangles = 0;
  let totalVertices = 0;
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const idx = child.geometry.index;
      totalTriangles += idx ? idx.count / 3 : (child.geometry.getAttribute('position')?.count ?? 0) / 3;
      totalVertices += child.geometry.getAttribute('position')?.count ?? 0;
    }
  });

  // Center and normalize scale
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  group.position.sub(center);

  const info: ModelInfo = {
    name: file.name,
    triangles: Math.round(totalTriangles),
    vertices: totalVertices,
    size: { x: size.x, y: size.y, z: size.z },
    maxDimension: maxDim,
  };

  return { mesh: group, info };
}

export interface ModelInfo {
  name: string;
  triangles: number;
  vertices: number;
  size: { x: number; y: number; z: number };
  maxDimension: number;
}

/**
 * Simple vertex-stride decimation: keep every Nth vertex to hit target triangle count.
 */
function decimateGeometry(geometry: THREE.BufferGeometry, maxTriangles: number): THREE.BufferGeometry {
  geometry.computeVertexNormals();

  const posAttr = geometry.getAttribute('position');
  if (!posAttr) return geometry;

  const indexAttr = geometry.index;
  const currentTriangles = indexAttr
    ? indexAttr.count / 3
    : posAttr.count / 3;

  if (currentTriangles <= maxTriangles) return geometry;

  // Merge vertices first for better decimation
  geometry = geometry.toNonIndexed();
  const positions = geometry.getAttribute('position');
  const triCount = positions.count / 3;
  const keepRatio = maxTriangles / triCount;
  const stride = Math.max(1, Math.floor(1 / keepRatio));

  const newPositions: number[] = [];
  const newNormals: number[] = [];
  const normals = geometry.getAttribute('normal');

  for (let i = 0; i < triCount; i += stride) {
    const base = i * 3;
    for (let v = 0; v < 3; v++) {
      const idx = base + v;
      if (idx >= positions.count) break;
      newPositions.push(positions.getX(idx), positions.getY(idx), positions.getZ(idx));
      if (normals) {
        newNormals.push(normals.getX(idx), normals.getY(idx), normals.getZ(idx));
      }
    }
  }

  const decimated = new THREE.BufferGeometry();
  decimated.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  if (newNormals.length > 0) {
    decimated.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
  } else {
    decimated.computeVertexNormals();
  }

  return decimated;
}

async function loadGLTF(buffer: ArrayBuffer): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    const blob = new Blob([buffer]);
    const url = URL.createObjectURL(blob);
    loader.load(url, (gltf) => {
      URL.revokeObjectURL(url);
      resolve(gltf.scene);
    }, undefined, (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    });
  });
}

async function loadSTEP(data: Uint8Array): Promise<THREE.BufferGeometry> {
  try {
    const occt = await import('occt-import-js');
    const result = await (occt as any).default().then((oc: any) => {
      return oc.ReadStepFile(data, null);
    });

    if (!result.success || result.meshes.length === 0) {
      throw new Error('Failed to parse STEP file');
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

      for (let i = 0; i < positions.length; i++) {
        allPositions.push(positions[i]);
      }
      if (normals) {
        for (let i = 0; i < normals.length; i++) {
          allNormals.push(normals[i]);
        }
      }
      for (let i = 0; i < indices.length; i++) {
        allIndices.push(indices[i] + indexOffset);
      }
      indexOffset += positions.length / 3;
    }

    merged.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
    if (allNormals.length > 0) {
      merged.setAttribute('normal', new THREE.Float32BufferAttribute(allNormals, 3));
    }
    merged.setIndex(allIndices);
    merged.computeVertexNormals();

    return merged;
  } catch (e) {
    console.error('STEP loading failed:', e);
    throw new Error('STEP file loading requires occt-import-js. File may be corrupted.');
  }
}
