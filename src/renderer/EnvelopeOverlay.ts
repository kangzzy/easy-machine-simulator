import * as THREE from 'three';
import type { WorkspaceBounds } from '../types/machine';

export class EnvelopeOverlay {
  readonly group: THREE.Group;
  private envelopeMesh: THREE.Mesh | null = null;
  private edgesLine: THREE.LineSegments | null = null;
  private _visible = false;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'envelope-overlay';
    this.group.visible = false;
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
