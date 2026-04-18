export interface GCodeParseRequest {
  gcode: string;
}

export interface GCodeParseResponse {
  points: Array<{ position: [number, number, number]; orientation?: [number, number, number] }>;
}

export interface KinematicsRequest {
  machineConfig: string; // JSON
  toolpathPoints: Float64Array;
}

export interface KinematicsResponse {
  jointStates: Float64Array; // flat array: [frame0_j0, frame0_j1, ..., frame1_j0, ...]
  errors: string[];
}

export interface CollisionCheckRequest {
  jointStates: Float64Array;
  boundsJson: string;
  limitsJson: string;
}

export interface CollisionCheckResponse {
  violations: Array<{
    frameIndex: number;
    type: string;
    position: [number, number, number];
    message: string;
  }>;
}
