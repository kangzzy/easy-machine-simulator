import { SceneManager } from '../renderer/SceneManager';
import { ToolpathVisualizer } from '../renderer/ToolpathVisualizer';
import { AnimationController } from '../renderer/AnimationController';
import { EnvelopeOverlay } from '../renderer/EnvelopeOverlay';
import { ProjectionViews } from '../renderer/ProjectionViews';
import { WorkerPool } from '../workers/WorkerPool';
import { getMachinePreset } from '../machine/MachineLoader';
import { MachineBuilder, type ComponentType, type MachineComponent } from '../machine/MachineBuilder';
import { CableRouter, type CableDefinition, type CableViolation } from '../machine/CableRouter';
import { CableHandleManager } from '../machine/CableHandleManager';
import type { MachineDefinition, MachineType } from '../types/machine';
import type { ViolationEvent, BoundsMode, SimulationStatus } from '../types/simulation';
import * as THREE from 'three';

type EventName = 'stateChange' | 'frameChange' | 'toolpathLoaded' | 'machineChanged' | 'violationsUpdated' | 'cableViolation';

export class SimulationEngine {
  readonly animationController = new AnimationController();
  readonly toolpathVisualizer = new ToolpathVisualizer();
  readonly envelopeOverlay: EnvelopeOverlay;
  readonly projectionViews: ProjectionViews;
  readonly machineBuilder = new MachineBuilder();
  readonly cableRouter = new CableRouter();

  private sceneManager: SceneManager;
  private wasmWorker: WorkerPool<any, any>;
  private _status: SimulationStatus = 'idle';
  private _machineDefinition: MachineDefinition | null = null;
  private _machineVisual: THREE.Group | null = null;
  private _violations: ViolationEvent[] = [];
  private _boundsMode: BoundsMode = 'flag-and-continue';
  private _toolpathData: Float64Array | null = null;
  private _builderMode = false;
  private cableHandleManager: CableHandleManager | null = null;
  private listeners = new Map<EventName, Set<() => void>>();

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
    this.envelopeOverlay = new EnvelopeOverlay();
    this.projectionViews = new ProjectionViews(sceneManager);

    // Initialize WASM worker
    this.wasmWorker = new WorkerPool<any, any>(
      new URL('../workers/wasm.worker.ts', import.meta.url)
    );

    // Add toolpath visualizer to scene
    sceneManager.addToScene(this.toolpathVisualizer.group);
    sceneManager.addToScene(this.envelopeOverlay.group);
    sceneManager.addToScene(this.cableRouter.group);

    // Cable violation listener
    this.cableRouter.setOnViolation(() => this.emit('cableViolation'));

    // Machine builder change listener
    this.machineBuilder.setOnChange(() => {
      if (this._builderMode) {
        const bounds = this.machineBuilder.computeWorkspaceBounds();
        this.envelopeOverlay.updateBounds(bounds);
        this.emit('machineChanged');
      }
    });

    // Set default machine
    this.setMachineType('cnc-3axis');

    // Animation loop
    this.animationController.setOnFrameChange((frame) => {
      this.toolpathVisualizer.setCurrentFrame(frame);
      this.updateMachinePosition(frame);
      this.emit('frameChange');
    });

    sceneManager.onAnimate((dt) => {
      this.animationController.update(dt);
    });

    // Cable drag handles — needs canvas + controls from SceneManager
    this.cableHandleManager = new CableHandleManager(
      sceneManager.scene,
      sceneManager.camera,
      sceneManager.canvas,
      sceneManager.controls,
      this.cableRouter,
      (cableId, attachIdx, offset) => {
        const cable = this.cableRouter.getCable(cableId);
        if (!cable) return;
        cable.attachPoints[attachIdx].localOffset = offset;
        this.cableRouter.updateCable(cableId, { attachPoints: cable.attachPoints });
        this.cableRouter.update();
        this.cableHandleManager!.updatePositions();
        this.emit('cableViolation');
      },
    );
  }

  get status(): SimulationStatus { return this._status; }
  get machineDefinition(): MachineDefinition | null { return this._machineDefinition; }
  get violations(): ViolationEvent[] { return this._violations; }
  get currentFrame(): number { return this.animationController.currentFrame; }
  get totalFrames(): number { return this.animationController.totalFrames; }

  // Event system
  on(event: EventName, cb: () => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
  }

  off(event: EventName, cb: () => void): void {
    this.listeners.get(event)?.delete(cb);
  }

  private emit(event: EventName): void {
    this.listeners.get(event)?.forEach(cb => cb());
  }

  /** Re-emit all events — call after UI is mounted to sync initial state */
  notifyAll(): void {
    this.emit('machineChanged');
    this.emit('stateChange');
  }

  // Machine management — always uses MachineBuilder
  setMachineType(type: MachineType): void {
    const def = getMachinePreset(type);
    this._machineDefinition = def;

    // Remove old visual if not using builder
    if (this._machineVisual) {
      this.sceneManager.removeFromScene(this._machineVisual);
      this._machineVisual = null;
    }

    // Ensure builder group is in scene
    if (!this._builderMode) {
      this._builderMode = true;
      this.sceneManager.addToScene(this.machineBuilder.rootGroup);
      this.cableRouter.setSceneRoot(this.machineBuilder.rootGroup);
    }

    // Populate builder from preset
    this.machineBuilder.loadPreset(type as 'cnc-3axis' | 'cnc-5axis' | 'robot-6axis');

    this.envelopeOverlay.updateBounds(def.workspaceBounds);
    this.emit('machineChanged');

    if (this._toolpathData) {
      this.processToolpath(this._toolpathData);
    }
  }

  loadURDF(_urdfText: string): void {
    console.log('URDF loading not yet implemented');
  }

  // Machine builder
  enableMachineBuilder(): void {
    if (this._builderMode) return;
    this._builderMode = true;
    if (this._machineVisual) {
      this.sceneManager.removeFromScene(this._machineVisual);
      this._machineVisual = null;
    }
    this.sceneManager.addToScene(this.machineBuilder.rootGroup);
    this.cableRouter.setSceneRoot(this.machineBuilder.rootGroup);
    this._machineDefinition = {
      name: 'Custom Machine',
      type: 'cnc-3axis',
      joints: [],
      workspaceBounds: this.machineBuilder.computeWorkspaceBounds(),
    };
    this.emit('machineChanged');
  }

  disableMachineBuilder(): void {
    // No-op now — builder is always active
  }

  addMachineComponent(type: ComponentType, parentId?: string | null): MachineComponent {
    if (!this._builderMode) this.enableMachineBuilder();
    return this.machineBuilder.addComponent(type, parentId ?? null);
  }

  async addCustomMeshComponent(file: File, parentId?: string | null): Promise<MachineComponent> {
    if (!this._builderMode) this.enableMachineBuilder();
    return this.machineBuilder.addCustomMesh(file, parentId ?? null);
  }

  removeMachineComponent(id: string): void {
    this.machineBuilder.removeComponent(id);
  }

  updateMachineComponent(id: string, updates: Partial<Pick<MachineComponent, 'name' | 'offset' | 'rotation' | 'scale' | 'axis' | 'limits' | 'jointType' | 'parentId'>>): void {
    this.machineBuilder.updateComponent(id, updates);
  }

  getMachineComponents(): MachineComponent[] {
    return this.machineBuilder.getComponents();
  }

  getBuilderDOF(): number {
    return this.machineBuilder.getDOF();
  }

  getJointsList(): MachineComponent[] {
    return this.machineBuilder.getJoints();
  }

  setJointValue(id: string, requestedValue: number): void {
    if (this.cableRouter.getCables().length === 0) {
      this.machineBuilder.setJointValue(id, requestedValue);
      return;
    }

    const prevValue = this.machineBuilder.getComponent(id)?.jointValue ?? requestedValue;
    this.machineBuilder.setJointValue(id, requestedValue);
    this.cableRouter.update();

    // Stiffness enforcement: binary-search for the furthest safe joint value
    if (this.cableRouter.hasEnforcedViolations() && prevValue !== requestedValue) {
      let lo = prevValue;
      let hi = requestedValue;
      if (lo > hi) [lo, hi] = [hi, lo];
      let safeSide = prevValue; // last known non-violating value

      for (let iter = 0; iter < 10; iter++) {
        const mid = (lo + hi) / 2;
        this.machineBuilder.setJointValue(id, mid);
        this.cableRouter.update();
        if (this.cableRouter.hasEnforcedViolations()) {
          // violation — back toward prevValue
          if (requestedValue >= prevValue) hi = mid; else lo = mid;
        } else {
          safeSide = mid;
          // safe — push further toward requestedValue
          if (requestedValue >= prevValue) lo = mid; else hi = mid;
        }
      }

      this.machineBuilder.setJointValue(id, safeSide);
      this.cableRouter.update();
    }

    this.cableHandleManager?.updatePositions();
    this.emit('cableViolation');
  }

  getJointValue(id: string): number {
    return this.machineBuilder.getComponent(id)?.jointValue ?? 0;
  }

  // Cable / tube routing
  addCable(def: Partial<CableDefinition> & { attachPoints: CableDefinition['attachPoints'] }): CableDefinition {
    const cable = this.cableRouter.addCable(def);
    this.cableRouter.update();
    this.cableHandleManager?.updatePositions();
    this.emit('cableViolation');
    return cable;
  }

  removeCable(id: string): void {
    this.cableRouter.removeCable(id);
    this.cableHandleManager?.updatePositions();
    this.emit('cableViolation');
  }

  updateCable(id: string, updates: Partial<CableDefinition>): void {
    this.cableRouter.updateCable(id, updates);
    this.cableRouter.update();
    this.cableHandleManager?.updatePositions();
    this.emit('cableViolation');
  }

  getCables(): CableDefinition[] {
    return this.cableRouter.getCables();
  }

  getCableViolations(): CableViolation[] {
    return this.cableRouter.getViolations();
  }

  updateCables(): void {
    this.cableRouter.update();
    this.cableHandleManager?.updatePositions();
    this.emit('cableViolation');
  }

  setBoundsMode(mode: BoundsMode): void {
    this._boundsMode = mode;
  }

  // Toolpath loading
  async loadGCode(gcode: string): Promise<void> {
    this._status = 'parsing';
    this.emit('stateChange');

    try {
      const result = await this.wasmWorker.execute('parse_gcode', gcode);
      if (result instanceof Float64Array || ArrayBuffer.isView(result)) {
        this._toolpathData = new Float64Array(result as ArrayBuffer);
      } else if (Array.isArray(result)) {
        // Fallback: convert from array of objects
        this._toolpathData = this.pointsToFloat64Array(result);
      } else {
        this._toolpathData = new Float64Array(0);
      }
      this.processToolpath(this._toolpathData);
    } catch (e) {
      console.error('G-code parse error:', e);
      // Fallback: parse client-side
      this._toolpathData = this.parseGCodeClientSide(gcode);
      this.processToolpath(this._toolpathData);
    }
  }

  loadPointList(csvText: string): void {
    const lines = csvText.trim().split('\n');
    const points: number[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('x')) continue;
      const parts = trimmed.split(/[,\s\t]+/).map(Number);
      if (parts.length >= 3 && parts.every(n => !isNaN(n))) {
        points.push(parts[0], parts[1], parts[2], 0, 0, 0, parts[3] ?? 100);
      }
    }

    this._toolpathData = new Float64Array(points);
    this.processToolpath(this._toolpathData);
  }

  loadCADLines(jsonText: string): void {
    try {
      const data = JSON.parse(jsonText);
      const lines: number[][] = Array.isArray(data) ? data : data.lines ?? data.points ?? [];
      const points: number[] = [];

      for (const pt of lines) {
        if (Array.isArray(pt) && pt.length >= 3) {
          points.push(pt[0], pt[1], pt[2], 0, 0, 0, pt[3] ?? 100);
        }
      }

      this._toolpathData = new Float64Array(points);
      this.processToolpath(this._toolpathData);
    } catch (e) {
      console.error('CAD lines parse error:', e);
    }
  }

  private processToolpath(data: Float64Array): void {
    if (data.length === 0) return;

    this._status = 'computing-kinematics';
    this.emit('stateChange');

    // Load into visualizer
    this.toolpathVisualizer.loadFromFloat64Array(data);

    // Compute joint states (for CNC, this is trivial — positions map directly)
    const dof = this._machineDefinition?.joints.length ?? 3;
    const pointCount = Math.floor(data.length / 7);
    const jointStates = new Float64Array(pointCount * dof);

    for (let i = 0; i < pointCount; i++) {
      const offset = i * 7;
      for (let j = 0; j < Math.min(dof, 7); j++) {
        jointStates[i * dof + j] = data[offset + j];
      }
    }

    this.animationController.load(jointStates, dof);

    // Check bounds
    this._status = 'checking-collisions';
    this.emit('stateChange');
    this.checkBounds(data);

    this._status = 'ready';
    this.emit('stateChange');
    this.emit('toolpathLoaded');
  }

  private checkBounds(data: Float64Array): void {
    if (!this._machineDefinition) return;

    const bounds = this._machineDefinition.workspaceBounds;
    const stride = 7;
    const violations: ViolationEvent[] = [];

    for (let i = 0; i < data.length / stride; i++) {
      const offset = i * stride;
      const x = data[offset];
      const y = data[offset + 1];
      const z = data[offset + 2];

      if (x < bounds.min[0] || x > bounds.max[0] ||
          y < bounds.min[1] || y > bounds.max[1] ||
          z < bounds.min[2] || z > bounds.max[2]) {
        violations.push({
          frameIndex: i,
          violationType: 'workspace-bound',
          position: [x, y, z],
          message: `Pos [${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}] out of bounds`,
        });
      }

      // Check joint limits
      const joints = this._machineDefinition.joints;
      const vals = [x, y, z, data[offset + 3], data[offset + 4]];
      for (let j = 0; j < joints.length && j < vals.length; j++) {
        const v = joints[j].type === 'revolute' ? vals[j] * Math.PI / 180 : vals[j];
        if (v < joints[j].limits.min || v > joints[j].limits.max) {
          violations.push({
            frameIndex: i,
            violationType: 'joint-limit',
            position: [x, y, z],
            message: `Joint ${joints[j].name} = ${v.toFixed(2)} outside [${joints[j].limits.min}, ${joints[j].limits.max}]`,
          });
          break;
        }
      }
    }

    this._violations = violations;
    this.toolpathVisualizer.markViolations(violations.map(v => v.frameIndex));
    this.emit('violationsUpdated');
  }

  private updateMachinePosition(frame: number): void {
    if (!this._machineVisual || !this._toolpathData) return;

    const offset = frame * 7;
    if (offset + 2 >= this._toolpathData.length) return;

    const x = this._toolpathData[offset];
    const y = this._toolpathData[offset + 1];
    const z = this._toolpathData[offset + 2];

    // Update machine visual joints based on type
    const type = this._machineDefinition?.type;
    if (type === 'cnc-3axis' || type === 'cnc-5axis') {
      // Move spindle group
      const spindle = this._machineVisual.getObjectByName('spindle-group');
      if (spindle) {
        spindle.position.set(x, z + 155, y); // coordinate transform to Three.js Y-up
      }
      // Move table for Y axis
      const table = this._machineVisual.getObjectByName('table');
      if (table) {
        table.position.set(0, 15, y);
      }
    } else if (type === 'robot-6axis') {
      // Phase 4: proper FK chain update
      this.updateRobotArm(frame);
    }

    // Check for stop-at-boundary
    if (this._boundsMode === 'stop-at-boundary') {
      const hasViolation = this._violations.some(v => v.frameIndex === frame);
      if (hasViolation && this.animationController.state === 'playing') {
        this.animationController.pause();
      }
    }
  }

  private updateRobotArm(frame: number): void {
    if (!this._machineVisual || !this._toolpathData) return;
    const jointState = this.animationController.getCurrentJointState();
    if (!jointState) return;

    // Update each joint rotation in the visual hierarchy
    const joints = this._machineVisual.children.filter(c => c.name.startsWith('joint'));
    for (let i = 0; i < joints.length && i < jointState.length; i++) {
      const joint = joints[i];
      // Revolute joints rotate around their axis
      joint.rotation.z = jointState[i];
    }
  }

  // Playback controls
  togglePlayPause(): void {
    if (this.animationController.state === 'playing') {
      this.animationController.pause();
    } else {
      this.animationController.play();
    }
    this.emit('stateChange');
  }

  play(): void { this.animationController.play(); this.emit('stateChange'); }
  pause(): void { this.animationController.pause(); this.emit('stateChange'); }
  stop(): void { this.animationController.stop(); this.emit('stateChange'); }
  stepForward(): void { this.animationController.stepForward(); }
  stepBackward(): void { this.animationController.stepBackward(); }
  seekTo(frame: number): void { this.animationController.seekTo(frame); }

  // View controls
  setView(view: 'perspective' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'): void {
    this.projectionViews.setView(view);
  }

  resetView(): void {
    this.projectionViews.resetView();
  }

  centerView(): void {
    this.projectionViews.centerView();
  }

  fitAll(): void {
    this.projectionViews.fitAll();
  }

  toggleEnvelopeOverlay(): void {
    this.envelopeOverlay.toggle();
  }

  // Report export
  exportReport(): void {
    const report = {
      timestamp: new Date().toISOString(),
      machine: this._machineDefinition ? {
        name: this._machineDefinition.name,
        type: this._machineDefinition.type,
        dof: this._machineDefinition.joints.length,
        workspaceBounds: this._machineDefinition.workspaceBounds,
      } : null,
      toolpath: {
        totalFrames: this.totalFrames,
        pointCount: this._toolpathData ? Math.floor(this._toolpathData.length / 7) : 0,
      },
      violations: {
        total: this._violations.length,
        byType: {
          workspaceBound: this._violations.filter(v => v.violationType === 'workspace-bound').length,
          jointLimit: this._violations.filter(v => v.violationType === 'joint-limit').length,
          collision: this._violations.filter(v => v.violationType === 'collision').length,
        },
        details: this._violations,
      },
      result: this._violations.length === 0 ? 'PASS' : 'FAIL',
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulation-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Client-side fallback G-code parser (when WASM is not available)
  private parseGCodeClientSide(gcode: string): Float64Array {
    const points: number[] = [0, 0, 0, 0, 0, 0, -1]; // origin
    let x = 0, y = 0, z = 0, feed = 0;
    let absolute = true;

    for (const rawLine of gcode.split('\n')) {
      const line = rawLine.split(';')[0].trim();
      if (!line) continue;

      const words: Record<string, number> = {};
      const regex = /([A-Z])([+-]?\d*\.?\d+)/gi;
      let match;
      while ((match = regex.exec(line)) !== null) {
        words[match[1].toUpperCase()] = parseFloat(match[2]);
      }

      if (words.G !== undefined) {
        if (words.G === 90) absolute = true;
        if (words.G === 91) absolute = false;
      }
      if (words.F !== undefined) feed = words.F;

      if (words.X !== undefined || words.Y !== undefined || words.Z !== undefined) {
        if (absolute) {
          x = words.X ?? x;
          y = words.Y ?? y;
          z = words.Z ?? z;
        } else {
          x += words.X ?? 0;
          y += words.Y ?? 0;
          z += words.Z ?? 0;
        }
        const isRapid = words.G === 0;
        points.push(x, y, z, 0, 0, 0, isRapid ? -1 : feed);
      }
    }

    return new Float64Array(points);
  }

  private pointsToFloat64Array(points: any[]): Float64Array {
    const flat: number[] = [];
    for (const p of points) {
      flat.push(
        p.position?.[0] ?? 0,
        p.position?.[1] ?? 0,
        p.position?.[2] ?? 0,
        p.orientation?.[0] ?? 0,
        p.orientation?.[1] ?? 0,
        p.orientation?.[2] ?? 0,
        p.feed_rate ?? -1,
      );
    }
    return new Float64Array(flat);
  }
}
