export type SimulationStatus =
  | 'idle'
  | 'parsing'
  | 'computing-kinematics'
  | 'checking-collisions'
  | 'ready'
  | 'playing'
  | 'paused';

export type BoundsMode = 'flag-and-continue' | 'stop-at-boundary';

export interface ViolationEvent {
  frameIndex: number;
  violationType: 'joint-limit' | 'workspace-bound' | 'collision';
  position: [number, number, number];
  message: string;
}

export interface SimulationState {
  status: SimulationStatus;
  currentFrame: number;
  totalFrames: number;
  boundsMode: BoundsMode;
  violations: ViolationEvent[];
}
