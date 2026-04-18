import * as THREE from 'three';

export interface CableDefinition {
  id: string;
  name: string;
  /** Component IDs where the cable attaches (in order from start to end) */
  attachPoints: { componentId: string; localOffset: [number, number, number] }[];
  /** Minimum allowed bend radius in mm */
  minBendRadius: number;
  /** Maximum allowed twist in degrees over the full cable length */
  maxTwistDeg: number;
  /** Cable diameter in mm (for visualization) */
  diameter: number;
  /** Cable color */
  color: number;
  /** Intermediate slack points between attachments (0 = taut, higher = more droop) */
  slack: number;
  /** If true, joint movement is physically limited when this cable would be over-bent */
  stiffnessEnforced: boolean;
}

export interface CableViolation {
  cableId: string;
  cableName: string;
  type: 'curvature' | 'twist';
  segmentIndex: number;
  value: number;      // actual bend radius (mm) or twist (deg)
  limit: number;      // min bend radius or max twist
  position: [number, number, number];
  message: string;
}

interface CableState {
  definition: CableDefinition;
  mesh: THREE.Mesh;
  pathPoints: THREE.Vector3[];
  violations: CableViolation[];
}

let nextCableId = 1;

export class CableRouter {
  private cables = new Map<string, CableState>();
  readonly group: THREE.Group;
  private sceneRoot: THREE.Object3D | null = null;
  private onViolation: ((violations: CableViolation[]) => void) | null = null;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'cable-router';
  }

  setSceneRoot(root: THREE.Object3D): void {
    this.sceneRoot = root;
  }

  setOnViolation(cb: (violations: CableViolation[]) => void): void {
    this.onViolation = cb;
  }

  /** World positions of every attach point for a given cable (post-kinematics). */
  getAttachPointWorldPositions(cableId: string): THREE.Vector3[] {
    const state = this.cables.get(cableId);
    if (!state || !this.sceneRoot) return [];
    this.sceneRoot.updateMatrixWorld(true);
    return state.definition.attachPoints.map(ap => {
      const obj = this.findObject(ap.componentId);
      if (!obj) return new THREE.Vector3();
      return obj.localToWorld(new THREE.Vector3(...ap.localOffset));
    });
  }

  /** Convert a world-space position to a component's local space. */
  worldToComponentLocal(componentId: string, world: THREE.Vector3): [number, number, number] | null {
    const obj = this.findObject(componentId);
    if (!obj) return null;
    const local = obj.worldToLocal(world.clone());
    return [local.x, local.y, local.z];
  }

  hasEnforcedViolations(): boolean {
    for (const [, state] of this.cables) {
      if (state.definition.stiffnessEnforced && state.violations.length > 0) return true;
    }
    return false;
  }

  addCable(def: Partial<CableDefinition> & { attachPoints: CableDefinition['attachPoints'] }): CableDefinition {
    const id = def.id ?? `cable_${nextCableId++}`;
    const full: CableDefinition = {
      id,
      name: def.name ?? `Cable ${nextCableId - 1}`,
      attachPoints: def.attachPoints,
      minBendRadius: def.minBendRadius ?? 50,
      maxTwistDeg: def.maxTwistDeg ?? 360,
      diameter: def.diameter ?? 8,
      color: def.color ?? 0xffaa00,
      slack: def.slack ?? 0.3,
      stiffnessEnforced: def.stiffnessEnforced ?? false,
    };

    const mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.6,
        metalness: 0.2,
        side: THREE.DoubleSide,
      })
    );
    mesh.name = `cable-${id}`;

    this.cables.set(id, { definition: full, mesh, pathPoints: [], violations: [] });
    this.group.add(mesh);
    return full;
  }

  removeCable(id: string): void {
    const state = this.cables.get(id);
    if (!state) return;
    this.group.remove(state.mesh);
    state.mesh.geometry.dispose();
    (state.mesh.material as THREE.Material).dispose();
    this.cables.delete(id);
  }

  getCables(): CableDefinition[] {
    return Array.from(this.cables.values()).map(s => s.definition);
  }

  getCable(id: string): CableDefinition | null {
    return this.cables.get(id)?.definition ?? null;
  }

  updateCable(id: string, updates: Partial<CableDefinition>): void {
    const state = this.cables.get(id);
    if (!state) return;
    Object.assign(state.definition, updates);
  }

  getViolations(): CableViolation[] {
    const all: CableViolation[] = [];
    for (const state of this.cables.values()) {
      all.push(...state.violations);
    }
    return all;
  }

  /** Recalculate all cable paths based on current joint positions */
  update(): void {
    if (!this.sceneRoot) return;

    // Force matrix world recalculation so localToWorld() returns post-kinematics positions
    this.sceneRoot.updateMatrixWorld(true);

    let allViolations: CableViolation[] = [];

    for (const [, state] of this.cables) {
      const { definition } = state;

      // 1. Collect world positions of attachment points
      const rawPoints: THREE.Vector3[] = [];
      for (const ap of definition.attachPoints) {
        const obj = this.findObject(ap.componentId);
        if (!obj) continue;
        const local = new THREE.Vector3(ap.localOffset[0], ap.localOffset[1], ap.localOffset[2]);
        obj.localToWorld(local);
        rawPoints.push(local);
      }

      // Deduplicate consecutive near-identical points — TubeGeometry silently
      // produces invisible NaN geometry when the spline has zero-length segments.
      const worldPoints: THREE.Vector3[] = rawPoints.length > 0 ? [rawPoints[0]] : [];
      for (let i = 1; i < rawPoints.length; i++) {
        if (rawPoints[i].distanceTo(worldPoints[worldPoints.length - 1]) > 0.5) {
          worldPoints.push(rawPoints[i]);
        }
      }

      if (worldPoints.length < 2) continue;

      // 2. Generate smooth path with Catmull-Rom spline + slack
      const curve = this.buildCurve(worldPoints, definition.slack);
      const pathPoints = curve.getPoints(Math.max(worldPoints.length * 20, 60));
      state.pathPoints = pathPoints;

      // 3. Calculate curvature and twist, find violations
      state.violations = this.checkViolations(definition, pathPoints);
      allViolations.push(...state.violations);

      // 4. Build tube mesh with color-coded stress
      this.buildTubeMesh(state, pathPoints);
    }

    this.onViolation?.(allViolations);
  }

  private findObject(componentId: string): THREE.Object3D | null {
    if (!this.sceneRoot) return null;
    let found: THREE.Object3D | null = null;
    this.sceneRoot.traverse((child) => {
      if (child.name === componentId) found = child;
    });
    return found;
  }

  private buildCurve(points: THREE.Vector3[], slack: number): THREE.CatmullRomCurve3 {
    if (slack <= 0) {
      return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
    }

    // Insert a drooped midpoint between every pair of points.
    // This works for 2-point cables too — without it, CatmullRom on 2 points is a straight line.
    const expanded: THREE.Vector3[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const dist = a.distanceTo(b);
      mid.y -= dist * slack * 0.3;
      expanded.push(mid, b);
    }

    return new THREE.CatmullRomCurve3(expanded, false, 'catmullrom', 0.5);
  }

  private checkViolations(def: CableDefinition, path: THREE.Vector3[]): CableViolation[] {
    const violations: CableViolation[] = [];

    // Curvature check (approximate bend radius from 3 consecutive points)
    for (let i = 1; i < path.length - 1; i++) {
      const a = path[i - 1];
      const b = path[i];
      const c = path[i + 1];

      const ab = b.clone().sub(a);
      const bc = c.clone().sub(b);
      const cross = ab.clone().cross(bc);
      const crossLen = cross.length();
      const abLen = ab.length();
      const bcLen = bc.length();

      if (abLen < 0.001 || bcLen < 0.001) continue;

      // Bend radius = (|ab| * |bc| * |ab + bc|) / (2 * |ab x bc|)
      const acLen = a.distanceTo(c);
      const bendRadius = crossLen > 0.0001
        ? (abLen * bcLen * acLen) / (2 * crossLen)
        : Infinity;

      if (bendRadius < def.minBendRadius && bendRadius > 0) {
        violations.push({
          cableId: def.id,
          cableName: def.name,
          type: 'curvature',
          segmentIndex: i,
          value: bendRadius,
          limit: def.minBendRadius,
          position: [b.x, b.y, b.z],
          message: `Bend radius ${bendRadius.toFixed(1)}mm < min ${def.minBendRadius}mm`,
        });
      }
    }

    // Twist check (accumulated twist along path using Frenet frames)
    let totalTwist = 0;
    let prevNormal: THREE.Vector3 | null = null;

    for (let i = 1; i < path.length - 1; i++) {
      const tangent = path[i + 1].clone().sub(path[i - 1]).normalize();
      // Approximate normal via second derivative
      const d2 = path[i + 1].clone().sub(path[i].clone().multiplyScalar(2)).add(path[i - 1]);
      let normal = d2.clone().sub(tangent.clone().multiplyScalar(d2.dot(tangent)));
      if (normal.length() < 0.0001) {
        normal = new THREE.Vector3(0, 1, 0); // fallback
      }
      normal.normalize();

      if (prevNormal) {
        const dot = Math.max(-1, Math.min(1, prevNormal.dot(normal)));
        const angle = Math.acos(dot) * (180 / Math.PI);
        totalTwist += angle;
      }
      prevNormal = normal;
    }

    if (totalTwist > def.maxTwistDeg) {
      const mid = path[Math.floor(path.length / 2)];
      violations.push({
        cableId: def.id,
        cableName: def.name,
        type: 'twist',
        segmentIndex: Math.floor(path.length / 2),
        value: totalTwist,
        limit: def.maxTwistDeg,
        position: [mid.x, mid.y, mid.z],
        message: `Twist ${totalTwist.toFixed(1)}\u00B0 > max ${def.maxTwistDeg}\u00B0`,
      });
    }

    return violations;
  }

  private buildTubeMesh(state: CableState, path: THREE.Vector3[]): void {
    const def = state.definition;
    const radius = def.diameter / 2;
    const radialSegments = 8;

    if (path.length < 2) return;

    // Need at least 3 tubular segments for TubeGeometry to produce valid geometry
    const tubularSegments = Math.max(path.length - 1, 3);

    let tubeGeom: THREE.TubeGeometry;
    try {
      const curve = new THREE.CatmullRomCurve3(path, false, 'catmullrom', 0.3);
      tubeGeom = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
    } catch {
      return; // degenerate path — skip silently
    }

    // Color by stress level
    const colors = new Float32Array(tubeGeom.getAttribute('position').count * 3);
    const vertsPerRing = radialSegments + 1;

    // Pre-compute curvature per path segment
    const curvatureStress = new Float32Array(path.length);
    for (let i = 1; i < path.length - 1; i++) {
      const a = path[i - 1], b = path[i], c = path[i + 1];
      const ab = b.clone().sub(a);
      const bc = c.clone().sub(b);
      const cross = ab.clone().cross(bc);
      const crossLen = cross.length();
      const abLen = ab.length();
      const bcLen = bc.length();
      const acLen = a.distanceTo(c);
      const bendRadius = crossLen > 0.0001 ? (abLen * bcLen * acLen) / (2 * crossLen) : Infinity;
      // Stress: 0 = safe, 1 = at limit, >1 = exceeded
      curvatureStress[i] = bendRadius < Infinity ? def.minBendRadius / bendRadius : 0;
    }

    for (let i = 0; i <= tubularSegments; i++) {
      const stress = Math.min(curvatureStress[Math.min(i, path.length - 1)], 2);
      // Green (safe) → Yellow (warning) → Red (violation)
      let r: number, g: number, b: number;
      if (stress < 0.5) {
        // Safe: cable color
        r = ((def.color >> 16) & 0xff) / 255;
        g = ((def.color >> 8) & 0xff) / 255;
        b = (def.color & 0xff) / 255;
      } else if (stress < 1.0) {
        // Warning: yellow
        const t = (stress - 0.5) * 2;
        r = 1;
        g = 1 - t * 0.3;
        b = 0.2 * (1 - t);
      } else {
        // Violation: red
        r = 1;
        g = 0.1;
        b = 0.1;
      }

      for (let j = 0; j < vertsPerRing; j++) {
        const idx = (i * vertsPerRing + j) * 3;
        colors[idx] = r;
        colors[idx + 1] = g;
        colors[idx + 2] = b;
      }
    }

    tubeGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Replace geometry
    state.mesh.geometry.dispose();
    state.mesh.geometry = tubeGeom;
  }

  clear(): void {
    for (const id of Array.from(this.cables.keys())) {
      this.removeCable(id);
    }
  }
}
