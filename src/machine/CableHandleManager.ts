import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CableRouter } from './CableRouter';

interface DragState {
  mesh: THREE.Mesh;
  cableId: string;
  attachIdx: number;
  componentId: string;
  plane: THREE.Plane;
  planeHit: THREE.Vector3;  // hit point on plane at drag start
  handleStart: THREE.Vector3; // handle world pos at drag start
}

const HANDLE_RADIUS = 7;
const HANDLE_COLOR_BASE = 0xffcc00;
const HANDLE_COLOR_HOVER = 0xffffff;

export class CableHandleManager {
  private group = new THREE.Group();
  /** Map cableId -> array of handle meshes, one per attach point */
  private handleMap = new Map<string, THREE.Mesh[]>();
  private raycaster = new THREE.Raycaster();
  private drag: DragState | null = null;
  private hoveredMesh: THREE.Mesh | null = null;
  private readonly _tmp = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private canvas: HTMLCanvasElement,
    private controls: OrbitControls,
    private cableRouter: CableRouter,
    private onOffsetChanged: (cableId: string, attachIdx: number, offset: [number, number, number]) => void,
  ) {
    this.group.name = 'cable-handles';
    this.group.renderOrder = 999;
    this.scene.add(this.group);

    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseup', this.onMouseUp);
  }

  /** Rebuild / reposition all handles from current cable state. */
  updatePositions(): void {
    const cables = this.cableRouter.getCables();
    const activeCableIds = new Set(cables.map(c => c.id));

    // Remove stale cable handles
    for (const [id, meshes] of this.handleMap) {
      if (!activeCableIds.has(id)) {
        meshes.forEach(m => { this.group.remove(m); m.geometry.dispose(); });
        this.handleMap.delete(id);
      }
    }

    for (const cable of cables) {
      const worldPositions = this.cableRouter.getAttachPointWorldPositions(cable.id);
      let meshes = this.handleMap.get(cable.id) ?? [];

      // Create missing handles
      while (meshes.length < worldPositions.length) {
        const m = this.makeHandle(cable.color);
        meshes.push(m);
        this.group.add(m);
      }

      // Hide extra handles (attach points removed)
      for (let i = worldPositions.length; i < meshes.length; i++) {
        meshes[i].visible = false;
      }

      // Update positions and metadata
      for (let i = 0; i < worldPositions.length; i++) {
        const m = meshes[i];
        m.visible = true;
        m.position.copy(worldPositions[i]);
        m.userData = { cableId: cable.id, attachIdx: i, componentId: cable.attachPoints[i].componentId };
        // Update colour in case cable colour changed
        (m.material as THREE.MeshStandardMaterial).color.set(cable.color);
      }

      this.handleMap.set(cable.id, meshes);
    }
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private makeHandle(color: number): THREE.Mesh {
    const geo = new THREE.SphereGeometry(HANDLE_RADIUS, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(HANDLE_COLOR_BASE).multiplyScalar(0.4),
      roughness: 0.2,
      metalness: 0.6,
      depthTest: false,   // always visible, even inside other geometry
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 999;
    mesh.userData.isCableHandle = true;
    return mesh;
  }

  private ndcFromEvent(e: MouseEvent): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
  }

  private allVisibleHandles(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const meshes of this.handleMap.values()) out.push(...meshes.filter(m => m.visible));
    return out;
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    this.raycaster.setFromCamera(this.ndcFromEvent(e), this.camera);
    const hits = this.raycaster.intersectObjects(this.allVisibleHandles(), false);
    if (!hits.length) return;

    const hit = hits[0];
    const mesh = hit.object as THREE.Mesh;
    if (!mesh.userData.isCableHandle) return;

    e.stopPropagation();
    this.controls.enabled = false;

    // Drag plane: faces the camera, passes through the handle centre
    const normal = new THREE.Vector3().subVectors(this.camera.position, mesh.position).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, mesh.position);

    const planeHit = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, planeHit);

    this.drag = {
      mesh,
      cableId: mesh.userData.cableId,
      attachIdx: mesh.userData.attachIdx,
      componentId: mesh.userData.componentId,
      plane,
      planeHit: planeHit.clone(),
      handleStart: mesh.position.clone(),
    };

    (mesh.material as THREE.MeshStandardMaterial).emissive.set(HANDLE_COLOR_HOVER);
    (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1;
  };

  private onMouseMove = (e: MouseEvent): void => {
    this.raycaster.setFromCamera(this.ndcFromEvent(e), this.camera);

    if (this.drag) {
      const currentHit = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.drag.plane, currentHit)) {
        // New world position = handleStart + (currentHit - planeHit)
        const delta = currentHit.clone().sub(this.drag.planeHit);
        const newWorld = this.drag.handleStart.clone().add(delta);
        this.drag.mesh.position.copy(newWorld);

        const local = this.cableRouter.worldToComponentLocal(this.drag.componentId, newWorld);
        if (local) {
          this.onOffsetChanged(this.drag.cableId, this.drag.attachIdx, local);
        }
      }
      return;
    }

    // Hover highlight
    const hits = this.raycaster.intersectObjects(this.allVisibleHandles(), false);
    const hit = hits[0]?.object as THREE.Mesh | undefined;
    if (hit !== this.hoveredMesh) {
      if (this.hoveredMesh) {
        (this.hoveredMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
        this.canvas.style.cursor = '';
      }
      this.hoveredMesh = hit?.userData.isCableHandle ? hit : null;
      if (this.hoveredMesh) {
        (this.hoveredMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
        this.canvas.style.cursor = 'grab';
      }
    }
  };

  private onMouseUp = (): void => {
    if (!this.drag) return;
    (this.drag.mesh.material as THREE.MeshStandardMaterial).emissive.set(HANDLE_COLOR_BASE).multiplyScalar(0.4);
    (this.drag.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
    this.drag = null;
    this.controls.enabled = true;
    this.canvas.style.cursor = '';
  };

  dispose(): void {
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.scene.remove(this.group);
  }
}
