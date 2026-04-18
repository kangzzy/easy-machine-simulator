import * as THREE from 'three';
import type { SceneManager } from './SceneManager';

export type ViewMode =
  | 'perspective'
  | 'top' | 'bottom'
  | 'front' | 'back'
  | 'left' | 'right';

export class ProjectionViews {
  private sceneManager: SceneManager;
  private defaultPosition = new THREE.Vector3(500, 400, 500);
  private defaultTarget = new THREE.Vector3(0, 0, 0);

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
  }

  setView(mode: ViewMode): void {
    const camera = this.sceneManager.camera;
    const controls = this.sceneManager.controls;
    const target = controls.target.clone();
    const dist = camera.position.distanceTo(target) || 800;

    camera.up.set(0, 1, 0);

    switch (mode) {
      case 'perspective':
        camera.position.set(
          target.x + dist * 0.577,
          target.y + dist * 0.577,
          target.z + dist * 0.577,
        );
        break;
      case 'top':
        camera.position.set(target.x, target.y + dist, target.z);
        camera.up.set(0, 0, -1);
        break;
      case 'bottom':
        camera.position.set(target.x, target.y - dist, target.z);
        camera.up.set(0, 0, 1);
        break;
      case 'front':
        camera.position.set(target.x, target.y, target.z + dist);
        break;
      case 'back':
        camera.position.set(target.x, target.y, target.z - dist);
        break;
      case 'right':
        camera.position.set(target.x + dist, target.y, target.z);
        break;
      case 'left':
        camera.position.set(target.x - dist, target.y, target.z);
        break;
    }

    controls.enableRotate = true;
    camera.lookAt(target);
    controls.update();
  }

  /** Reset camera to default position and look at origin */
  resetView(): void {
    const camera = this.sceneManager.camera;
    const controls = this.sceneManager.controls;

    camera.position.copy(this.defaultPosition);
    camera.up.set(0, 1, 0);
    controls.target.copy(this.defaultTarget);
    controls.enableRotate = true;
    camera.lookAt(this.defaultTarget);
    controls.update();
  }

  /** Center the view on origin (move target to 0,0,0, keep camera orientation) */
  centerView(): void {
    const camera = this.sceneManager.camera;
    const controls = this.sceneManager.controls;

    const offset = camera.position.clone().sub(controls.target);
    controls.target.set(0, 0, 0);
    camera.position.copy(offset);
    camera.lookAt(controls.target);
    controls.update();
  }

  /** Fit all scene objects into view */
  fitAll(): void {
    const camera = this.sceneManager.camera;
    const controls = this.sceneManager.controls;
    const scene = this.sceneManager.scene;

    const box = new THREE.Box3();
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.LineSegments) {
        box.expandByObject(obj);
      }
    });

    if (box.isEmpty()) {
      this.resetView();
      return;
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const dist = (maxDim / 2) / Math.tan(fov / 2) * 1.5;

    // Keep camera direction, adjust distance
    const dir = camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(center);
    camera.position.copy(center).add(dir.multiplyScalar(dist));
    camera.lookAt(center);
    controls.update();
  }
}
