import type { ComponentType } from '../machine/MachineBuilder';

export type Priority = 'submit' | 'future';

export interface StrokeSpec {
  x: number;
  y: number;
  z: number;
}

export interface Dimensions {
  width: number;
  depth: number;
  height: number;
}

export type MeshHullMode = 'none' | 'decimated' | 'convex-hull';

export interface JointMeshAsset {
  fileName: string;
  format: 'stl' | 'step' | 'obj' | 'glb';
  hullMode: MeshHullMode;
  triangleCount: number;
  glbBase64: string;
  initialOffset: [number, number, number];
  initialRotation: [number, number, number];
}

export interface SerializedComponent {
  id: string;
  type: ComponentType;
  name: string;
  parentId: string | null;
  offset: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  axis: [number, number, number];
  limits: { min: number; max: number };
  jointType: 'prismatic' | 'revolute' | 'fixed';
  jointValue: number;
  dimensions?: Dimensions;
  meshAsset?: JointMeshAsset;
}

export interface StageSnapshot {
  schemaVersion: 1;
  basePresetId: string;
  components: SerializedComponent[];
  stroke?: StrokeSpec;
  scene?: {
    cameraPosition?: [number, number, number];
    cameraTarget?: [number, number, number];
  };
  exportedAt: number;
}

export interface DeploymentCase {
  id: string;
  schemaVersion: 1;
  name: string;
  customer: string;
  notes: string;
  priority: Priority;
  stroke: StrokeSpec;
  stage: StageSnapshot;
  createdAt: number;
  updatedAt: number;
}

export function isStageSnapshot(obj: unknown): obj is StageSnapshot {
  if (!obj || typeof obj !== 'object') return false;
  const s = obj as Partial<StageSnapshot>;
  return (
    s.schemaVersion === 1 &&
    typeof s.basePresetId === 'string' &&
    Array.isArray(s.components)
  );
}

export function isDeploymentCase(obj: unknown): obj is DeploymentCase {
  if (!obj || typeof obj !== 'object') return false;
  const c = obj as Partial<DeploymentCase>;
  return (
    c.schemaVersion === 1 &&
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    (c.priority === 'submit' || c.priority === 'future') &&
    !!c.stroke && typeof c.stroke.x === 'number' &&
    !!c.stage && isStageSnapshot(c.stage)
  );
}
