export interface MachineDefinition {
  name: string;
  type: MachineType;
  joints: JointDefinition[];
  workspaceBounds: WorkspaceBounds;
}

export type MachineType = 'cnc-3axis' | 'cnc-5axis' | 'robot-6axis';

export interface JointDefinition {
  name: string;
  type: 'revolute' | 'prismatic';
  axis: [number, number, number];
  limits: { min: number; max: number };
  dhParams?: { theta: number; d: number; a: number; alpha: number };
}

export interface WorkspaceBounds {
  min: [number, number, number];
  max: [number, number, number];
}
