import * as THREE from 'three';
import { loadModelFile, type ModelInfo } from './ModelLoader';
import type { WorkspaceBounds } from '../types/machine';

export type ComponentType =
  | 'linear-axis'
  | 'rotary-axis'
  | 'robot-arm'
  | 'rail'
  | 'turntable'
  | 'spindle'
  | 'end-effector'
  | 'custom-mesh';

export interface MachineComponent {
  id: string;
  type: ComponentType;
  name: string;
  mesh: THREE.Group;
  modelInfo?: ModelInfo;
  parentId: string | null;
  offset: [number, number, number];
  rotation: [number, number, number];     // degrees
  scale: number;
  axis: [number, number, number];         // joint movement/rotation axis
  limits: { min: number; max: number };
  jointType: 'prismatic' | 'revolute' | 'fixed';
  jointValue: number;                     // current joint value (mm or rad)
}

let nextId = 1;

export class MachineBuilder {
  private components = new Map<string, MachineComponent>();
  readonly rootGroup: THREE.Group;
  private onChange: (() => void) | null = null;

  constructor() {
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'machine-builder-root';
  }

  setOnChange(cb: () => void): void { this.onChange = cb; }
  getComponents(): MachineComponent[] { return Array.from(this.components.values()); }
  getComponent(id: string): MachineComponent | undefined { return this.components.get(id); }

  // ─── Presets ────────────────────────────────────────────────

  loadPreset(type: 'cnc-3axis' | 'cnc-5axis' | 'robot-6axis'): void {
    this.clear();
    const M = presetMeshes; // shorthand

    switch (type) {
      case 'cnc-3axis': {
        const base = this.addWithMesh(M.cncBase(), 'linear-axis', null,
          { name: 'Base', axis: [0,0,0], limits: {min:0,max:0}, jointType: 'fixed', offset: [0,-10,0] });
        const table = this.addWithMesh(M.cncTable(), 'linear-axis', base.id,
          { name: 'Table (Y)', axis: [0,0,1], limits: {min:-150,max:150}, jointType: 'prismatic', offset: [0,25,0] });
        const colL = this.addWithMesh(M.cncColumn(), 'linear-axis', base.id,
          { name: 'Column L', axis: [0,0,0], limits: {min:0,max:0}, jointType: 'fixed', offset: [-185,160,0] });
        const colR = this.addWithMesh(M.cncColumn(), 'linear-axis', base.id,
          { name: 'Column R', axis: [0,0,0], limits: {min:0,max:0}, jointType: 'fixed', offset: [185,160,0] });
        const gantry = this.addWithMesh(M.cncGantry(), 'linear-axis', base.id,
          { name: 'Gantry (X)', axis: [1,0,0], limits: {min:-200,max:200}, jointType: 'prismatic', offset: [0,260,0] });
        const spindleGrp = this.addWithMesh(M.cncSpindleGroup(), 'spindle', gantry.id,
          { name: 'Spindle (Z)', axis: [0,1,0], limits: {min:0,max:300}, jointType: 'prismatic', offset: [0,-30,0] });
        break;
      }
      case 'cnc-5axis': {
        const base = this.addWithMesh(M.cncBase(), 'linear-axis', null,
          { name: 'Base', axis: [0,0,0], limits: {min:0,max:0}, jointType: 'fixed', offset: [0,-10,0] });
        const rotaryTable = this.addWithMesh(M.cncRotaryTable(), 'turntable', base.id,
          { name: 'Rotary Table (A)', axis: [0,1,0], limits: {min:-2.094,max:2.094}, jointType: 'revolute', offset: [0,28,0] });
        const table = this.addWithMesh(M.cncTable(), 'linear-axis', rotaryTable.id,
          { name: 'Table (Y)', axis: [0,0,1], limits: {min:-150,max:150}, jointType: 'prismatic', offset: [0,10,0] });
        const colL = this.addWithMesh(M.cncColumn(), 'linear-axis', base.id,
          { name: 'Column L', jointType: 'fixed', offset: [-185,160,0] });
        const colR = this.addWithMesh(M.cncColumn(), 'linear-axis', base.id,
          { name: 'Column R', jointType: 'fixed', offset: [185,160,0] });
        const gantry = this.addWithMesh(M.cncGantry(), 'linear-axis', base.id,
          { name: 'Gantry (X)', axis: [1,0,0], limits: {min:-200,max:200}, jointType: 'prismatic', offset: [0,260,0] });
        const tilt = this.addWithMesh(M.cncTiltRing(), 'rotary-axis', gantry.id,
          { name: 'Tilt (B)', axis: [1,0,0], limits: {min:-2.094,max:2.094}, jointType: 'revolute', offset: [0,-10,0] });
        const spindleGrp = this.addWithMesh(M.cncSpindleGroup(), 'spindle', tilt.id,
          { name: 'Spindle (Z)', axis: [0,1,0], limits: {min:0,max:300}, jointType: 'prismatic', offset: [0,-20,0] });
        break;
      }
      case 'robot-6axis': {
        const colors = [0x4a6fa5, 0x5a7fb5, 0x6a8fc5, 0x7a9fd5, 0x8aafe5, 0xe07a5f];
        const lengths = [120, 150, 130, 40, 30, 20];
        const radii  = [25, 20, 15, 12, 10, 8];
        const names  = ['J1 Base','J2 Shoulder','J3 Elbow','J4 Wrist 1','J5 Wrist 2','J6 Wrist 3'];
        const axes: [number,number,number][] = [[0,1,0],[0,0,1],[0,0,1],[0,1,0],[0,0,1],[0,1,0]];
        const lims = [
          {min:-3.14159,max:3.14159}, {min:-2.268,max:2.268}, {min:-3.49,max:1.22},
          {min:-6.28,max:6.28}, {min:-2.094,max:2.094}, {min:-6.28,max:6.28}
        ];

        // Pedestal
        const ped = this.addWithMesh(M.robotPedestal(), 'rotary-axis', null,
          { name: 'Pedestal', jointType: 'fixed', offset: [0,15,0] });

        let parentId = ped.id;
        let yOff = 15;
        for (let i = 0; i < 6; i++) {
          const mesh = M.robotJoint(colors[i], radii[i], lengths[i]);
          const comp = this.addWithMesh(mesh, 'rotary-axis', parentId,
            { name: names[i], axis: axes[i], limits: lims[i], jointType: 'revolute', offset: [0, yOff, 0] });
          parentId = comp.id;
          yOff = lengths[i];
        }
        // End effector
        this.addWithMesh(M.robotEndEffector(), 'end-effector', parentId,
          { name: 'End Effector', jointType: 'fixed', offset: [0, 15, 0] });
        break;
      }
    }
  }

  // ─── Component CRUD ─────────────────────────────────────────

  addComponent(type: ComponentType, parentId: string | null = null): MachineComponent {
    const template = componentTemplates[type];
    return this.addWithMesh(template.buildMesh(), type, parentId, {
      name: template.defaultName,
      axis: [...template.defaultAxis],
      limits: { ...template.defaultLimits },
      jointType: template.defaultJointType,
      offset: [0, template.defaultYOffset, 0],
    });
  }

  private addWithMesh(
    mesh: THREE.Group, type: ComponentType, parentId: string | null,
    overrides: Partial<Pick<MachineComponent, 'name'|'axis'|'limits'|'jointType'|'offset'|'rotation'|'scale'>>
  ): MachineComponent {
    const id = `comp_${nextId++}`;
    mesh.name = id;
    const comp: MachineComponent = {
      id, type, mesh, parentId,
      name: overrides.name ?? type,
      modelInfo: undefined,
      offset: overrides.offset ?? [0,0,0],
      rotation: overrides.rotation ?? [0,0,0],
      scale: overrides.scale ?? 1,
      axis: (overrides.axis ?? [0,0,0]) as [number,number,number],
      limits: overrides.limits ?? { min: 0, max: 0 },
      jointType: overrides.jointType ?? 'fixed',
      jointValue: 0,
    };
    this.components.set(id, comp);
    this.rebuildSceneGraph();
    this.onChange?.();
    return comp;
  }

  async addCustomMesh(file: File, parentId: string | null = null): Promise<MachineComponent> {
    const { mesh, info } = await loadModelFile(file);
    const id = `comp_${nextId++}`;
    const initialScale = (info.maxDimension > 0) ? Math.min(200 / info.maxDimension, 1) : 1;
    mesh.name = id;
    const comp: MachineComponent = {
      id, type: 'custom-mesh', mesh, modelInfo: info, parentId,
      name: info.name.replace(/\.[^.]+$/, ''),
      offset: [0,0,0], rotation: [0,0,0], scale: initialScale,
      axis: [0,0,0], limits: { min: 0, max: 0 }, jointType: 'fixed', jointValue: 0,
    };
    this.components.set(id, comp);
    this.rebuildSceneGraph();
    this.onChange?.();
    return comp;
  }

  removeComponent(id: string): void {
    const toRemove = [...this.getDescendants(id), id];
    for (const rid of toRemove) {
      const comp = this.components.get(rid);
      if (comp) {
        comp.mesh.removeFromParent();
        comp.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            const m = child.material;
            if (Array.isArray(m)) m.forEach(x => x.dispose()); else m?.dispose();
          }
        });
      }
      this.components.delete(rid);
    }
    this.rebuildSceneGraph();
    this.onChange?.();
  }

  updateComponent(id: string, updates: Partial<Pick<MachineComponent, 'name'|'offset'|'rotation'|'scale'|'axis'|'limits'|'jointType'|'parentId'>>): void {
    const comp = this.components.get(id);
    if (!comp) return;
    Object.assign(comp, updates);
    this.rebuildSceneGraph();
    this.onChange?.();
  }

  // ─── Joint Values & Kinematics ──────────────────────────────

  setJointValue(id: string, value: number): void {
    const comp = this.components.get(id);
    if (!comp || comp.jointType === 'fixed') return;
    comp.jointValue = Math.max(comp.limits.min, Math.min(comp.limits.max, value));
    // Only update this component's transform — no tree rebuild, no DOM update
    this.applyKinematicsFor(comp);
  }

  /** Get all movable (non-fixed) components in tree order */
  getJoints(): MachineComponent[] {
    const result: MachineComponent[] = [];
    const walk = (parentId: string | null) => {
      for (const c of this.getChildren(parentId)) {
        if (c.jointType !== 'fixed') result.push(c);
        walk(c.id);
      }
    };
    walk(null);
    return result;
  }

  // ─── Internals ──────────────────────────────────────────────

  private getChildren(parentId: string | null): MachineComponent[] {
    return Array.from(this.components.values()).filter(c => c.parentId === parentId);
  }

  private getDescendants(id: string): string[] {
    const result: string[] = [];
    for (const child of this.getChildren(id)) {
      result.push(child.id);
      result.push(...this.getDescendants(child.id));
    }
    return result;
  }

  private rebuildSceneGraph(): void {
    while (this.rootGroup.children.length > 0) this.rootGroup.remove(this.rootGroup.children[0]);
    for (const root of this.getChildren(null)) this.attachComponent(root, this.rootGroup);
  }

  private attachComponent(comp: MachineComponent, parent: THREE.Object3D): void {
    comp.mesh.scale.setScalar(comp.scale);
    this.applyKinematicsFor(comp); // sets position + rotation + joint offset
    parent.add(comp.mesh);
    for (const child of this.getChildren(comp.id)) this.attachComponent(child, comp.mesh);
  }

  private applyKinematicsFor(comp: MachineComponent): void {
    const deg2rad = Math.PI / 180;

    // Always reset to base offset + rotation first
    comp.mesh.position.set(comp.offset[0], comp.offset[1], comp.offset[2]);
    comp.mesh.rotation.set(comp.rotation[0]*deg2rad, comp.rotation[1]*deg2rad, comp.rotation[2]*deg2rad);

    if (comp.jointType === 'fixed') return;
    const ax = new THREE.Vector3(comp.axis[0], comp.axis[1], comp.axis[2]);
    if (ax.lengthSq() === 0) return;

    if (comp.jointType === 'prismatic') {
      const travel = ax.clone().normalize().multiplyScalar(comp.jointValue);
      comp.mesh.position.add(travel);
    } else if (comp.jointType === 'revolute') {
      const jointQ = new THREE.Quaternion().setFromAxisAngle(ax.normalize(), comp.jointValue);
      comp.mesh.quaternion.premultiply(jointQ);
    }
  }

  computeWorkspaceBounds(): WorkspaceBounds {
    const box = new THREE.Box3().setFromObject(this.rootGroup);
    if (box.isEmpty()) return { min: [-500,-500,-500], max: [500,500,500] };
    const size = box.getSize(new THREE.Vector3());
    box.expandByVector(size.multiplyScalar(0.1));
    return { min: [box.min.x, box.min.z, box.min.y], max: [box.max.x, box.max.z, box.max.y] };
  }

  getDOF(): number {
    return Array.from(this.components.values()).filter(c => c.jointType !== 'fixed').length;
  }

  clear(): void {
    for (const id of Array.from(this.components.keys())) this.removeComponent(id);
  }
}

// ─── Preset Mesh Builders (detailed, matching original quality) ──────

const presetMeshes = {
  cncBase(): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(
      new THREE.BoxGeometry(400, 20, 300),
      new THREE.MeshStandardMaterial({ color: 0x4a6fa5, metalness: 0.6, roughness: 0.4 })
    ));
    return g;
  },
  cncTable(): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(
      new THREE.BoxGeometry(300, 10, 200),
      new THREE.MeshStandardMaterial({ color: 0x81b29a, metalness: 0.4, roughness: 0.6 })
    ));
    return g;
  },
  cncColumn(): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(
      new THREE.BoxGeometry(30, 300, 30),
      new THREE.MeshStandardMaterial({ color: 0x4a6fa5, metalness: 0.6, roughness: 0.4 })
    ));
    return g;
  },
  cncGantry(): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(
      new THREE.BoxGeometry(400, 30, 30),
      new THREE.MeshStandardMaterial({ color: 0x6b8cae, metalness: 0.5, roughness: 0.5 })
    ));
    return g;
  },
  cncSpindleGroup(): THREE.Group {
    const g = new THREE.Group();
    const mat1 = new THREE.MeshStandardMaterial({ color: 0x6b8cae, metalness: 0.5, roughness: 0.5 });
    const mat2 = new THREE.MeshStandardMaterial({ color: 0xe07a5f, metalness: 0.7, roughness: 0.3 });
    // Carriage
    const carriage = new THREE.Mesh(new THREE.BoxGeometry(40, 60, 40), mat1);
    carriage.position.y = 30;
    g.add(carriage);
    // Spindle body
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 80, 16), mat2);
    spindle.position.y = -35;
    g.add(spindle);
    // Tool tip
    const tip = new THREE.Mesh(new THREE.ConeGeometry(6, 20, 8), mat2);
    tip.position.y = -85;
    tip.rotation.x = Math.PI;
    g.add(tip);
    return g;
  },
  cncRotaryTable(): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(
      new THREE.CylinderGeometry(60, 60, 15, 32),
      new THREE.MeshStandardMaterial({ color: 0xd4a574, metalness: 0.5, roughness: 0.5 })
    ));
    return g;
  },
  cncTiltRing(): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(
      new THREE.TorusGeometry(20, 4, 12, 32),
      new THREE.MeshStandardMaterial({ color: 0xd4a574, metalness: 0.5, roughness: 0.5 })
    ));
    return g;
  },
  robotPedestal(): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(
      new THREE.CylinderGeometry(60, 70, 30, 32),
      new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.7, roughness: 0.3 })
    ));
    return g;
  },
  robotJoint(color: number, radius: number, linkLength: number): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.4 });
    // Joint sphere
    g.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 0.8, 16, 16), mat));
    // Link body
    if (linkLength > 0) {
      const link = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.5, radius * 0.6, linkLength, 12), mat
      );
      link.position.y = linkLength / 2;
      g.add(link);
    }
    return g;
  },
  robotEndEffector(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xe07a5f, metalness: 0.7, roughness: 0.3 });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(10, 30, 8), mat);
    cone.rotation.x = Math.PI;
    g.add(cone);
    return g;
  },
};

// ─── Generic Component Templates ──────────────────────────────

interface ComponentTemplate {
  defaultName: string;
  defaultAxis: [number, number, number];
  defaultLimits: { min: number; max: number };
  defaultJointType: 'prismatic' | 'revolute' | 'fixed';
  defaultYOffset: number;
  buildMesh: () => THREE.Group;
}

const componentTemplates: Record<ComponentType, ComponentTemplate> = {
  'linear-axis': {
    defaultName: 'Linear Axis', defaultAxis: [1,0,0], defaultLimits: {min:-200,max:200},
    defaultJointType: 'prismatic', defaultYOffset: 0,
    buildMesh: () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(300,10,20), new THREE.MeshStandardMaterial({color:0x6688aa,metalness:0.6,roughness:0.4})));
      const c = new THREE.Mesh(new THREE.BoxGeometry(40,20,30), new THREE.MeshStandardMaterial({color:0x88aacc,metalness:0.5,roughness:0.5}));
      c.position.y = 15; g.add(c);
      return g;
    },
  },
  'rotary-axis': {
    defaultName: 'Rotary Axis', defaultAxis: [0,1,0], defaultLimits: {min:-3.14159,max:3.14159},
    defaultJointType: 'revolute', defaultYOffset: 20,
    buildMesh: () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(50,55,15,32), new THREE.MeshStandardMaterial({color:0xd4a574,metalness:0.5,roughness:0.5})));
      const a = new THREE.Mesh(new THREE.ConeGeometry(5,15,8), new THREE.MeshStandardMaterial({color:0xff6644}));
      a.position.set(40,10,0); a.rotation.z = -Math.PI/2; g.add(a);
      return g;
    },
  },
  'robot-arm': {
    defaultName: '6-Axis Robot', defaultAxis: [0,0,1], defaultLimits: {min:-3.14159,max:3.14159},
    defaultJointType: 'revolute', defaultYOffset: 0,
    buildMesh: () => {
      const g = new THREE.Group();
      const cols = [0x4a6fa5,0x5a7fb5,0x6a8fc5,0x7a9fd5,0x8aafe5,0xe07a5f];
      const lens = [80,120,100,0,0,0]; const rads = [22,18,14,10,8,6];
      let p: THREE.Object3D = g; let y = 20;
      for (let i=0;i<6;i++) {
        const j = new THREE.Group(); j.position.set(0,y,0); y = lens[i];
        const m = new THREE.MeshStandardMaterial({color:cols[i],metalness:0.6,roughness:0.4});
        j.add(new THREE.Mesh(new THREE.SphereGeometry(rads[i]*0.7,12,12),m));
        if(lens[i]>0){const l=new THREE.Mesh(new THREE.CylinderGeometry(rads[i]*0.4,rads[i]*0.5,lens[i],10),m);l.position.y=lens[i]/2;j.add(l);}
        p.add(j); p = j;
      }
      return g;
    },
  },
  'rail': {
    defaultName: 'Linear Rail', defaultAxis: [1,0,0], defaultLimits: {min:-500,max:500},
    defaultJointType: 'prismatic', defaultYOffset: 0,
    buildMesh: () => {
      const g = new THREE.Group();
      const rm = new THREE.MeshStandardMaterial({color:0x555555,metalness:0.7,roughness:0.3});
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1000,15,30),rm));
      const g1=new THREE.Mesh(new THREE.BoxGeometry(1000,5,5),rm);g1.position.set(0,10,10);g.add(g1);
      const g2=new THREE.Mesh(new THREE.BoxGeometry(1000,5,5),rm);g2.position.set(0,10,-10);g.add(g2);
      const p=new THREE.Mesh(new THREE.BoxGeometry(80,10,50),new THREE.MeshStandardMaterial({color:0x88aacc,metalness:0.5,roughness:0.5}));
      p.position.y=17;g.add(p);
      return g;
    },
  },
  'turntable': {
    defaultName: 'Turntable', defaultAxis: [0,1,0], defaultLimits: {min:-6.28,max:6.28},
    defaultJointType: 'revolute', defaultYOffset: 10,
    buildMesh: () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(70,75,20,32),new THREE.MeshStandardMaterial({color:0x556677,metalness:0.6,roughness:0.4})));
      const t=new THREE.Mesh(new THREE.CylinderGeometry(65,65,8,32),new THREE.MeshStandardMaterial({color:0x7799aa,metalness:0.4,roughness:0.6}));
      t.position.y=14;g.add(t);
      return g;
    },
  },
  'spindle': {
    defaultName: 'Spindle', defaultAxis: [0,0,1], defaultLimits: {min:0,max:24000},
    defaultJointType: 'fixed', defaultYOffset: 30,
    buildMesh: () => {
      const g = new THREE.Group();
      const m=new THREE.MeshStandardMaterial({color:0xe07a5f,metalness:0.7,roughness:0.3});
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(15,15,60,16),m));
      const t=new THREE.Mesh(new THREE.ConeGeometry(6,20,8),m);t.position.y=-40;t.rotation.x=Math.PI;g.add(t);
      return g;
    },
  },
  'end-effector': {
    defaultName: 'End Effector', defaultAxis: [0,0,0], defaultLimits: {min:0,max:0},
    defaultJointType: 'fixed', defaultYOffset: 20,
    buildMesh: () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(30,15,30),new THREE.MeshStandardMaterial({color:0xaa6644,metalness:0.5,roughness:0.5})));
      const fm=new THREE.MeshStandardMaterial({color:0x888888,metalness:0.6,roughness:0.4});
      const f1=new THREE.Mesh(new THREE.BoxGeometry(5,25,10),fm);f1.position.set(-10,-20,0);g.add(f1);
      const f2=new THREE.Mesh(new THREE.BoxGeometry(5,25,10),fm);f2.position.set(10,-20,0);g.add(f2);
      return g;
    },
  },
  'custom-mesh': {
    defaultName: 'Custom Part', defaultAxis: [0,0,0], defaultLimits: {min:0,max:0},
    defaultJointType: 'fixed', defaultYOffset: 0, buildMesh: () => new THREE.Group(),
  },
};
