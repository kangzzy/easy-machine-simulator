import * as THREE from 'three';

/**
 * Create a placeholder 3-axis CNC machine for visual verification.
 * Replaced with proper kinematic chain visualization in Phase 3.
 */
export function createPlaceholderCNC(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cnc-3axis-placeholder';

  const baseMat = new THREE.MeshStandardMaterial({ color: 0x4a6fa5, metalness: 0.6, roughness: 0.4 });
  const gantryMat = new THREE.MeshStandardMaterial({ color: 0x6b8cae, metalness: 0.5, roughness: 0.5 });
  const spindleMat = new THREE.MeshStandardMaterial({ color: 0xe07a5f, metalness: 0.7, roughness: 0.3 });
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x81b29a, metalness: 0.4, roughness: 0.6 });

  // Base / frame
  const base = new THREE.Mesh(new THREE.BoxGeometry(400, 20, 300), baseMat);
  base.position.set(0, -10, 0);
  group.add(base);

  // Table (moves along Y / front-back)
  const table = new THREE.Mesh(new THREE.BoxGeometry(300, 10, 200), tableMat);
  table.position.set(0, 15, 0);
  group.add(table);

  // Left column
  const colL = new THREE.Mesh(new THREE.BoxGeometry(30, 300, 30), baseMat);
  colL.position.set(-185, 150, 0);
  group.add(colL);

  // Right column
  const colR = new THREE.Mesh(new THREE.BoxGeometry(30, 300, 30), baseMat);
  colR.position.set(185, 150, 0);
  group.add(colR);

  // Gantry beam (moves along X)
  const gantry = new THREE.Mesh(new THREE.BoxGeometry(400, 30, 30), gantryMat);
  gantry.position.set(0, 250, 0);
  group.add(gantry);

  // Spindle carriage (moves along Z)
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(40, 60, 40), gantryMat);
  carriage.position.set(0, 220, 0);
  group.add(carriage);

  // Spindle (tool)
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 80, 16), spindleMat);
  spindle.position.set(0, 155, 0);
  group.add(spindle);

  // Tool tip indicator
  const tipGeom = new THREE.ConeGeometry(6, 20, 8);
  const tip = new THREE.Mesh(tipGeom, spindleMat);
  tip.position.set(0, 105, 0);
  tip.rotation.x = Math.PI;
  group.add(tip);

  return group;
}
