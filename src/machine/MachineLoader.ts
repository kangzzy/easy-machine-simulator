import * as THREE from 'three';
import type { MachineDefinition, MachineType } from '../types/machine';

import cnc3axis from './presets/cnc-3axis.json';
import cnc5axis from './presets/cnc-5axis.json';
import robot6axis from './presets/robot-6axis.json';

const presets: Record<MachineType, MachineDefinition> = {
  'cnc-3axis': cnc3axis as MachineDefinition,
  'cnc-5axis': cnc5axis as MachineDefinition,
  'robot-6axis': robot6axis as MachineDefinition,
};

export function getMachinePreset(type: MachineType): MachineDefinition {
  return presets[type];
}

export function buildMachineVisual(def: MachineDefinition): THREE.Group {
  switch (def.type) {
    case 'cnc-3axis': return buildCNC3Axis(def);
    case 'cnc-5axis': return buildCNC5Axis(def);
    case 'robot-6axis': return buildRobot6Axis(def);
    default: return new THREE.Group();
  }
}

function buildCNC3Axis(_def: MachineDefinition): THREE.Group {
  const group = new THREE.Group();
  group.name = 'machine-cnc-3axis';

  const baseMat = new THREE.MeshStandardMaterial({ color: 0x4a6fa5, metalness: 0.6, roughness: 0.4 });
  const gantryMat = new THREE.MeshStandardMaterial({ color: 0x6b8cae, metalness: 0.5, roughness: 0.5 });
  const spindleMat = new THREE.MeshStandardMaterial({ color: 0xe07a5f, metalness: 0.7, roughness: 0.3 });
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x81b29a, metalness: 0.4, roughness: 0.6 });

  // Base
  const base = new THREE.Mesh(new THREE.BoxGeometry(400, 20, 300), baseMat);
  base.position.set(0, -10, 0);
  group.add(base);

  // Table (Y-axis movement)
  const table = new THREE.Mesh(new THREE.BoxGeometry(300, 10, 200), tableMat);
  table.position.set(0, 15, 0);
  table.name = 'table';
  group.add(table);

  // Columns
  const colL = new THREE.Mesh(new THREE.BoxGeometry(30, 300, 30), baseMat);
  colL.position.set(-185, 150, 0);
  group.add(colL);
  const colR = new THREE.Mesh(new THREE.BoxGeometry(30, 300, 30), baseMat);
  colR.position.set(185, 150, 0);
  group.add(colR);

  // Gantry beam
  const gantry = new THREE.Mesh(new THREE.BoxGeometry(400, 30, 30), gantryMat);
  gantry.position.set(0, 250, 0);
  group.add(gantry);

  // Spindle group (moves as unit along X, Z)
  const spindleGroup = new THREE.Group();
  spindleGroup.name = 'spindle-group';

  const carriage = new THREE.Mesh(new THREE.BoxGeometry(40, 60, 40), gantryMat);
  carriage.position.set(0, 65, 0);
  spindleGroup.add(carriage);

  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 80, 16), spindleMat);
  spindle.position.set(0, 0, 0);
  spindleGroup.add(spindle);

  const tip = new THREE.Mesh(new THREE.ConeGeometry(6, 20, 8), spindleMat);
  tip.position.set(0, -50, 0);
  tip.rotation.x = Math.PI;
  spindleGroup.add(tip);

  spindleGroup.position.set(0, 155, 0);
  group.add(spindleGroup);

  return group;
}

function buildCNC5Axis(_def: MachineDefinition): THREE.Group {
  const group = buildCNC3Axis(_def);
  group.name = 'machine-cnc-5axis';

  // Add rotary table indicator (A-axis)
  const rotaryMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, metalness: 0.5, roughness: 0.5 });
  const rotary = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 15, 32), rotaryMat);
  rotary.position.set(0, 28, 0);
  rotary.name = 'rotary-a';
  group.add(rotary);

  // B-axis tilt indicator on spindle
  const tiltRing = new THREE.Mesh(
    new THREE.TorusGeometry(15, 3, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xd4a574, metalness: 0.5, roughness: 0.5 })
  );
  const spindleGroup = group.getObjectByName('spindle-group');
  if (spindleGroup) {
    tiltRing.position.set(0, 40, 0);
    tiltRing.name = 'tilt-b';
    spindleGroup.add(tiltRing);
  }

  return group;
}

function buildRobot6Axis(_def: MachineDefinition): THREE.Group {
  const group = new THREE.Group();
  group.name = 'machine-robot-6axis';

  const colors = [0x4a6fa5, 0x5a7fb5, 0x6a8fc5, 0x7a9fd5, 0x8aafe5, 0xe07a5f];

  // Base pedestal
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.7, roughness: 0.3 });
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(60, 70, 30, 32), baseMat);
  pedestal.position.set(0, 15, 0);
  group.add(pedestal);

  // Build kinematic chain as nested groups
  const linkLengths = [120, 150, 130, 0, 0, 0];
  const linkRadii = [25, 20, 15, 12, 10, 8];

  let parent: THREE.Object3D = group;
  let yOffset = 30;

  for (let i = 0; i < 6; i++) {
    const joint = new THREE.Group();
    joint.name = `joint${i}`;
    joint.position.set(0, yOffset, 0);
    yOffset = linkLengths[i];

    // Joint sphere
    const jointMat = new THREE.MeshStandardMaterial({
      color: colors[i],
      metalness: 0.6,
      roughness: 0.4,
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(linkRadii[i] * 0.8, 16, 16), jointMat);
    joint.add(sphere);

    // Link body
    if (linkLengths[i] > 0) {
      const link = new THREE.Mesh(
        new THREE.CylinderGeometry(linkRadii[i] * 0.5, linkRadii[i] * 0.6, linkLengths[i], 12),
        jointMat
      );
      link.position.set(0, linkLengths[i] / 2, 0);
      joint.add(link);
    }

    parent.add(joint);
    parent = joint;
  }

  // End effector
  const eeMat = new THREE.MeshStandardMaterial({ color: 0xe07a5f, metalness: 0.7, roughness: 0.3 });
  const ee = new THREE.Mesh(new THREE.ConeGeometry(10, 30, 8), eeMat);
  ee.position.set(0, 15, 0);
  ee.rotation.x = Math.PI;
  ee.name = 'end-effector';
  parent.add(ee);

  return group;
}
