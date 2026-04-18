export interface ToolpathPoint {
  position: [number, number, number];
  orientation?: [number, number, number]; // euler angles for 5/6-axis
  feedRate?: number;
}

export type ToolpathFormat = 'gcode' | 'point-list' | 'cad-lines';

export interface ToolpathData {
  format: ToolpathFormat;
  points: ToolpathPoint[];
  totalLength: number;
}
