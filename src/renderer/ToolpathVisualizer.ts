import * as THREE from 'three';

export class ToolpathVisualizer {
  readonly group: THREE.Group;
  private pathLine: THREE.Line | null = null;
  private currentPositionMarker: THREE.Mesh;
  private positionData: Float64Array | null = null;
  private stride = 7; // x,y,z,a,b,c,feed
  private violationFrames = new Set<number>();

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'toolpath';

    // Current position marker (sphere)
    const markerGeom = new THREE.SphereGeometry(3, 16, 16);
    const markerMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00aaaa });
    this.currentPositionMarker = new THREE.Mesh(markerGeom, markerMat);
    this.currentPositionMarker.visible = false;
    this.group.add(this.currentPositionMarker);
  }

  /**
   * Load toolpath from parsed Float64Array (7 values per point: x,y,z,a,b,c,feed)
   */
  loadFromFloat64Array(data: Float64Array): void {
    this.positionData = data;
    this.violationFrames.clear();

    // Remove old path
    if (this.pathLine) {
      this.group.remove(this.pathLine);
      this.pathLine.geometry.dispose();
      (this.pathLine.material as THREE.Material).dispose();
      this.pathLine = null;
    }

    const pointCount = Math.floor(data.length / this.stride);
    if (pointCount < 2) return;

    // Build positions and colors
    const positions = new Float32Array(pointCount * 3);
    const colors = new Float32Array(pointCount * 3);

    for (let i = 0; i < pointCount; i++) {
      const offset = i * this.stride;
      positions[i * 3] = data[offset];
      positions[i * 3 + 1] = data[offset + 2]; // Z → Y (Three.js Y-up)
      positions[i * 3 + 2] = data[offset + 1]; // Y → Z

      const feed = data[offset + 6];
      if (feed < 0) {
        // Rapid - yellow
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.9;
        colors[i * 3 + 2] = 0.2;
      } else {
        // Feed move - green
        colors[i * 3] = 0.2;
        colors[i * 3 + 1] = 0.9;
        colors[i * 3 + 2] = 0.3;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 1,
    });

    this.pathLine = new THREE.Line(geometry, material);
    this.group.add(this.pathLine);
  }

  /**
   * Mark specific frames as violations (turns them red)
   */
  markViolations(frameIndices: number[]): void {
    if (!this.pathLine) return;

    const colorAttr = this.pathLine.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (const idx of frameIndices) {
      this.violationFrames.add(idx);
      colorAttr.setXYZ(idx, 1.0, 0.1, 0.1); // red
    }
    colorAttr.needsUpdate = true;
  }

  /**
   * Update current position marker to a specific frame
   */
  setCurrentFrame(frameIndex: number): void {
    if (!this.positionData) return;

    const offset = frameIndex * this.stride;
    if (offset + 2 >= this.positionData.length) return;

    this.currentPositionMarker.position.set(
      this.positionData[offset],
      this.positionData[offset + 2], // Z → Y
      this.positionData[offset + 1], // Y → Z
    );
    this.currentPositionMarker.visible = true;

    // Update path colors to show progress (blue for traversed)
    if (this.pathLine) {
      const colorAttr = this.pathLine.geometry.getAttribute('color') as THREE.BufferAttribute;
      const pointCount = Math.floor(this.positionData.length / this.stride);
      for (let i = 0; i < pointCount; i++) {
        if (this.violationFrames.has(i)) {
          colorAttr.setXYZ(i, 1.0, 0.1, 0.1);
        } else if (i <= frameIndex) {
          colorAttr.setXYZ(i, 0.3, 0.5, 1.0); // blue = traversed
        } else {
          const feed = this.positionData[i * this.stride + 6];
          if (feed < 0) {
            colorAttr.setXYZ(i, 1.0, 0.9, 0.2);
          } else {
            colorAttr.setXYZ(i, 0.2, 0.9, 0.3);
          }
        }
      }
      colorAttr.needsUpdate = true;
    }
  }

  getPointCount(): number {
    if (!this.positionData) return 0;
    return Math.floor(this.positionData.length / this.stride);
  }

  dispose(): void {
    if (this.pathLine) {
      this.pathLine.geometry.dispose();
      (this.pathLine.material as THREE.Material).dispose();
    }
  }
}
