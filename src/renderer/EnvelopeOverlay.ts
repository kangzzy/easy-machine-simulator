import * as THREE from 'three';
import type { WorkspaceBounds } from '../types/machine';
import type { StrokeSpec } from '../types/deployment';

export class EnvelopeOverlay {
  readonly group: THREE.Group;
  readonly strokeGroup: THREE.Group;
  private envelopeMesh: THREE.Mesh | null = null;
  private edgesLine: THREE.LineSegments | null = null;
  private strokeEdges: THREE.LineSegments | null = null;
  private _visible = false;
  private _strokeVisible = false;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'envelope-overlay';
    this.group.visible = false;
    this.strokeGroup = new THREE.Group();
    this.strokeGroup.name = 'stroke-envelope-overlay';
    this.strokeGroup.visible = false;
  }

  updateBounds(bounds: WorkspaceBounds): void {
    this.clear();

    const size = [
      bounds.max[0] - bounds.min[0],
      bounds.max[2] - bounds.min[2], // Z → Y in Three.js
      bounds.max[1] - bounds.min[1], // Y → Z in Three.js
    ];
    const center = [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2, // Z → Y
      (bounds.min[1] + bounds.max[1]) / 2, // Y → Z
    ];

    // Transparent box
    const geom = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4a9eff,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.envelopeMesh = new THREE.Mesh(geom, mat);
    this.envelopeMesh.position.set(center[0], center[1], center[2]);
    this.group.add(this.envelopeMesh);

    // Wireframe edges
    const edgeGeom = new THREE.EdgesGeometry(geom);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x4a9eff, transparent: true, opacity: 0.5 });
    this.edgesLine = new THREE.LineSegments(edgeGeom, edgeMat);
    this.edgesLine.position.copy(this.envelopeMesh.position);
    this.group.add(this.edgesLine);
  }

  toggle(): void {
    this._visible = !this._visible;
    this.group.visible = this._visible;
  }

  show(): void {
    this._visible = true;
    this.group.visible = true;
  }

  hide(): void {
    this._visible = false;
    this.group.visible = false;
  }

  get visible(): boolean {
    return this._visible;
  }

  /**
   * Pulse the envelope color when a violation is near the boundary.
   */
  highlightViolation(active: boolean): void {
    if (!this.envelopeMesh) return;
    const mat = this.envelopeMesh.material as THREE.MeshBasicMaterial;
    if (active) {
      mat.color.setHex(0xff4a4a);
      mat.opacity = 0.15;
      if (this.edgesLine) {
        (this.edgesLine.material as THREE.LineBasicMaterial).color.setHex(0xff4a4a);
      }
    } else {
      mat.color.setHex(0x4a9eff);
      mat.opacity = 0.08;
      if (this.edgesLine) {
        (this.edgesLine.material as THREE.LineBasicMaterial).color.setHex(0x4a9eff);
      }
    }
  }

  // ─── Stroke envelope (required work envelope — separate from reach) ───

  setStrokeEnvelope(stroke: StrokeSpec | null, origin: [number, number, number] = [0, 0, 0]): void {
    this.clearStroke();
    if (!stroke) {
      this._strokeVisible = false;
      this.strokeGroup.visible = false;
      return;
    }

    const sx = Math.max(1, stroke.x);
    const sy = Math.max(1, stroke.y);
    const sz = Math.max(1, stroke.z);

    // Stroke uses machine X/Y/Z as workspace axes; map to Three.js Y-up like reach envelope:
    // X→X, Z→Y, Y→Z
    const geom = new THREE.BoxGeometry(sx, sz, sy);
    const edgeGeom = new THREE.EdgesGeometry(geom);
    const edgeMat = new THREE.LineDashedMaterial({
      color: 0xff9933,
      dashSize: 18,
      gapSize: 10,
      linewidth: 1,
      transparent: true,
      opacity: 0.9,
    });
    const lines = new THREE.LineSegments(edgeGeom, edgeMat);
    lines.computeLineDistances();
    lines.position.set(origin[0], origin[2] + sz / 2, origin[1]);
    geom.dispose();
    this.strokeEdges = lines;
    this.strokeGroup.add(lines);

    this._strokeVisible = true;
    this.strokeGroup.visible = true;
  }

  toggleStrokeEnvelope(): void {
    this._strokeVisible = !this._strokeVisible;
    this.strokeGroup.visible = this._strokeVisible;
  }

  get strokeVisible(): boolean { return this._strokeVisible; }

  private clearStroke(): void {
    if (this.strokeEdges) {
      this.strokeGroup.remove(this.strokeEdges);
      this.strokeEdges.geometry.dispose();
      (this.strokeEdges.material as THREE.Material).dispose();
      this.strokeEdges = null;
    }
  }

  private clear(): void {
    if (this.envelopeMesh) {
      this.group.remove(this.envelopeMesh);
      this.envelopeMesh.geometry.dispose();
      (this.envelopeMesh.material as THREE.Material).dispose();
      this.envelopeMesh = null;
    }
    if (this.edgesLine) {
      this.group.remove(this.edgesLine);
      this.edgesLine.geometry.dispose();
      (this.edgesLine.material as THREE.Material).dispose();
      this.edgesLine = null;
    }
  }
}
