# Easy Machine Simulator — Implementation Reference

## Overview

A cross-platform web-based physical machine simulator for CNC machines and robotic arms. Verifies work envelopes and toolpaths with 3D visualization. Built with TypeScript + Three.js (WebGPU/WebGL2) and Rust/WASM for computation.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Rendering | Three.js with WebGPU renderer (WebGL2 fallback) |
| Computation | Rust → WASM via wasm-pack, in Web Workers |
| Build | Vite + vite-plugin-wasm + Docker multi-stage |
| Testing | Vitest (TS), cargo test (Rust) |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  UI Layer (ControlPanel, MachinePanel, ToolpathPanel)   │
│         ↕ events                                        │
│  SimulationEngine  ←→  AnimationController              │
│         ↕ postMessage          ↕ requestAnimationFrame  │
├─────────┬──────────────────────┴────────────────────────┤
│  WASM Worker                   │  SceneManager          │
│  (gcode parsing,               │  MachineVisualizer     │
│   kinematics, collision)       │  ToolpathVisualizer    │
│                                │  EnvelopeOverlay       │
└────────────────────────────────┴────────────────────────┘
         Web Workers                  Main Thread Only
```

**Main thread** = rendering + UI only. **All heavy computation** runs in Rust/WASM Web Workers.

### Data Flow

```
User uploads file
  → wasm.worker.ts loads WASM, calls parse_gcode()
  → Returns Float64Array (7 values/point: x,y,z,a,b,c,feed)
  → SimulationEngine computes joint states per frame
  → Bounds checking against workspace limits + joint limits
  → Pre-computed frames loaded into AnimationController
  → Render loop reads frames[i] each tick → updates 3D scene
```

### Coordinate System

G-code uses X/Y/Z. Three.js uses Y-up, so the ToolpathVisualizer maps: **X→X, Z→Y, Y→Z**.

---

## Commands

```bash
# Dev server (builds WASM + installs deps + starts Vite with hot-reload)
docker compose up dev --build

# Dev server (detached)
docker compose up dev --build -d

# Production build (builds + serves via nginx on port 8080)
docker compose --profile prod up prod --build

# Stop all containers
docker compose down

# Rebuild from scratch (no cache)
docker compose build --no-cache dev

# View logs
docker compose logs dev --tail=50
```

Dev server: http://localhost:5173/

---

## File Structure

### Root

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage: Rust WASM build → npm deps → dev/prod Node.js → nginx |
| `docker-compose.yml` | Dev service (port 5173, hot-reload) + prod service (port 8080, nginx) |
| `docker-entrypoint.sh` | Copies WASM pkg into volume-mounted src/ at container start |
| `vite.config.ts` | Vite + WASM plugin + COOP/COEP headers for SharedArrayBuffer |
| `package.json` | Dependencies: three, vite, vitest, wasm plugins |
| `tsconfig.json` | ES2022, strict mode, path aliases (@/* → src/*) |
| `index.html` | Entry HTML with #app container |

### Rust WASM Workspace (`rust/`)

#### ems-core — Shared types and math

| File | Exports |
|------|---------|
| `src/types.rs` | `Pose` (position + quaternion), `ToolpathPoint`, `JointState`, `JointLimits`, `WorkspaceBounds` (with `contains()`), `ViolationEvent`, `ViolationType` (enum: JointLimit, WorkspaceBound, Collision) |
| `src/math.rs` | `dh_transform()` — DH parameter → 4x4 matrix; `pose_to_matrix()` — position+quat → matrix; `matrix_position()` — extract position from matrix |

#### ems-gcode — G-code parser

| File | Exports |
|------|---------|
| `src/parser.rs` | `parse_gcode(input: &str) -> Vec<ToolpathPoint>` — Full parser supporting G0/G1/G2/G3, G90/G91, G17-19 planes, G20/G21 units, arc interpolation (72 segments/rev), comment stripping. Internal types: `DistanceMode`, `MotionMode`, `Plane`, `Units` |

Tested: simple linear, incremental mode, clockwise arcs, comments, inch-to-mm conversion.

#### ems-kinematics — Kinematic chain definitions

| File | Exports |
|------|---------|
| `src/chain.rs` | `JointType` (Revolute/Prismatic), `Joint` (name, type, limits, DH params), `KinematicChain` (name, joints, `dof()`) |

#### ems-collision — Bounds and collision checking

| File | Exports |
|------|---------|
| `src/bounds.rs` | `check_workspace_bounds()` → `Option<ViolationEvent>`; `check_joint_limits()` → `Vec<ViolationEvent>` |

#### ems-wasm — WASM-bindgen entry crate

| WASM Export | Signature | Description |
|-------------|-----------|-------------|
| `ping()` | `→ String` | Round-trip verification |
| `parse_gcode(input)` | `&str → Float64Array` | 7 values/point: x,y,z,a,b,c,feed |
| `gcode_point_count(input)` | `&str → usize` | Point count without allocating full array |
| `compute_fk_cnc3(positions)` | `Float64Array → Float64Array` | 3-axis CNC FK (3 joints/frame) |
| `compute_fk_cnc5(positions)` | `Float64Array → Float64Array` | 5-axis CNC FK (5 joints/frame) |
| `check_bounds_batch(positions, bounds_json)` | `→ JsValue` | Batch workspace bounds check |
| `check_joint_limits_batch(joints, dof, limits_json)` | `→ JsValue` | Batch joint limit check |

---

### TypeScript Source (`src/`)

#### Entry Point

**`src/main.ts`** — Initializes SceneManager → SimulationEngine → UIController. Displays renderer type (WebGPU/WebGL2) in status bar.

#### Type Definitions (`src/types/`)

| File | Key Types |
|------|-----------|
| `machine.ts` | `MachineDefinition`, `MachineType` ('cnc-3axis'\|'cnc-5axis'\|'robot-6axis'), `JointDefinition`, `WorkspaceBounds` |
| `toolpath.ts` | `ToolpathPoint`, `ToolpathFormat` ('gcode'\|'point-list'\|'cad-lines'), `ToolpathData` |
| `simulation.ts` | `SimulationStatus` (7 states), `BoundsMode`, `ViolationEvent`, `SimulationState` |
| `worker-messages.ts` | Request/response types for worker communication |

#### Renderer (`src/renderer/`)

| File | Class/Function | Responsibility |
|------|---------------|----------------|
| `RendererFactory.ts` | `createRenderer()` | WebGPU detection → fallback to WebGL2 |
| `SceneManager.ts` | `SceneManager` | Scene, PerspectiveCamera (60° FOV), OrbitControls, ambient+directional lights, grid, axes helper. `setAnimationLoop()` for render loop. |
| `ToolpathVisualizer.ts` | `ToolpathVisualizer` | Loads Float64Array → BufferGeometry lines. Color coding: yellow=rapid, green=feed, blue=traversed, red=violation. Current position: cyan sphere marker. |
| `AnimationController.ts` | `AnimationController` | Play/pause/stop/step/seek over pre-computed Float64Array frame buffer. Variable speed (0.1x–10x). 30fps base rate. |
| `EnvelopeOverlay.ts` | `EnvelopeOverlay` | Transparent blue box + wireframe edges for workspace bounds. Toggleable. Pulses red on violations. |
| `ProjectionViews.ts` | `ProjectionViews` | Repositions camera for Top/Front/Side orthographic views. Disables orbit rotation in 2D modes. |
| `MachineVisualizer.ts` | `createPlaceholderCNC()` | Legacy placeholder (superseded by MachineLoader) |

#### Machine (`src/machine/`)

| File | Purpose |
|------|---------|
| `MachineLoader.ts` | `getMachinePreset(type)` loads JSON configs. `buildMachineVisual(def)` creates Three.js groups: CNC3 (base+table+gantry+spindle), CNC5 (adds rotary table+tilt ring), Robot6 (6-joint nested kinematic chain with colored links/spheres). |
| `presets/cnc-3axis.json` | 3-axis CNC: XYZ prismatic, bounds ±200/±150/0–300 |
| `presets/cnc-5axis.json` | 5-axis CNC: XYZ + A/B revolute (±120°) |
| `presets/robot-6axis.json` | 6-axis robot: 6 revolute joints with DH parameters |

#### Simulation (`src/simulation/`)

**`SimulationEngine.ts`** — Central coordinator.

| Method Group | Methods |
|-------------|---------|
| Events | `on(event, cb)`, `off(event, cb)` — Events: stateChange, frameChange, toolpathLoaded, machineChanged, violationsUpdated |
| Machine | `setMachineType(type)`, `loadURDF(text)`, `setBoundsMode(mode)` |
| Toolpath | `loadGCode(text)`, `loadPointList(csv)`, `loadCADLines(json)` |
| Playback | `togglePlayPause()`, `play()`, `pause()`, `stop()`, `stepForward()`, `stepBackward()`, `seekTo(frame)` |
| View | `setView(mode)`, `toggleEnvelopeOverlay()` |
| Export | `exportReport()` — Downloads JSON with machine info, violations summary, pass/fail |

Internal pipeline: `processToolpath()` → `checkBounds()` → load into AnimationController. Client-side fallback parser if WASM unavailable.

#### Workers (`src/workers/`)

| File | Purpose |
|------|---------|
| `WorkerPool.ts` | Typed promise-based worker wrapper. `execute(type, payload, transfers)` → Promise. Handles pending message tracking. |
| `wasm.worker.ts` | Loads ems_wasm WASM module. Handles 'ping' and 'parse_gcode' messages. Lazy initialization with graceful fallback. |

#### UI (`src/ui/`)

| File | Panel | Position | Features |
|------|-------|----------|----------|
| `UIController.ts` | Orchestrator | — | Mounts all panels, sets up keyboard shortcuts |
| `ControlPanel.ts` | Playback | Bottom center | Stop/back/play-pause/forward buttons, speed ±, seek slider, frame counter |
| `ToolpathPanel.ts` | File input | Top left | File upload (.nc/.gcode/.csv/.json), format selector, point count display |
| `MachinePanel.ts` | Machine config | Top right | Machine type selector, URDF upload, bounds mode, machine info |
| `ViolationLog.ts` | Violations | Bottom right | Scrollable log (last 100), click-to-seek, count badge, color-coded by type |
| `ViewPanel.ts` | View controls | Top center | 3D/Top/Front/Side view buttons, envelope toggle, export button |
| `ReportExporter.ts` | Export | — | `exportJSON()` and `exportHTML()` (styled report with pass/fail, violation table) |

**`styles/main.css`** — Dark theme (navy panels with glassmorphism), CSS custom properties, violation colors (red/yellow/magenta).

#### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| Left Arrow | Step backward |
| Right Arrow | Step forward |
| Home | Jump to first frame |
| End | Jump to last frame |
| E | Toggle envelope overlay |

---

### Sample Toolpaths (`public/sample-toolpaths/`)

| File | Description |
|------|-------------|
| `square.nc` | Square pocket: 4-side perimeter at Z=-10, 500mm/min feed |
| `circle.nc` | Circular arc pocket: G2 full circle, two depth passes |
| `out-of-bounds.nc` | Intentionally exceeds X/Y bounds to trigger violations |

---

## Machine Presets

### 3-Axis CNC Mill
- **DOF:** 3 (X, Y, Z prismatic)
- **Workspace:** X: ±200mm, Y: ±150mm, Z: 0–300mm
- **Visual:** Base plate + table + dual columns + gantry beam + spindle with tool tip

### 5-Axis CNC Mill
- **DOF:** 5 (XYZ prismatic + A/B revolute)
- **Workspace:** Same as 3-axis, A/B: ±120°
- **Visual:** Extends 3-axis with rotary table (A) and tilt ring (B) on spindle

### 6-Axis Robot Arm
- **DOF:** 6 (all revolute)
- **DH Parameters:** Standard serial chain (d: 120, a: 150/130, varying alpha)
- **Workspace:** 600mm radius sphere
- **Visual:** Pedestal base + 6 nested joint groups with colored link cylinders + end effector cone

---

## Docker Build Pipeline

```
Dockerfile stages:
  1. wasm-builder (rust:1.84) → wasm-pack build → /build/wasm-out/
  2. deps (node:22) → npm install → /app/node_modules/
  3. dev (node:22) → COPY sources + wasm-pkg → entrypoint copies to volume
  4. prod (node:22) → tsc + vite build → /app/dist/
  5. serve (nginx:alpine) → serves /app/dist/ on port 80
```

**Volume mount strategy:** `./src:/app/src` enables hot-reload but overwrites the WASM pkg. The `docker-entrypoint.sh` copies `/app/wasm-pkg → /app/src/wasm-pkg` at container start (after volumes are mounted).

---

## Key Design Decisions

1. **Float64Array data format:** 7 values per toolpath point (x,y,z,a,b,c,feed). Feed rate of -1 indicates rapid move. Enables zero-copy transfer between WASM and JavaScript.

2. **Client-side fallback:** If WASM fails to load, `SimulationEngine.parseGCodeClientSide()` provides basic G-code parsing in JavaScript.

3. **Pre-computed frames:** All toolpath positions and joint states are computed upfront and stored in typed arrays. The render loop only reads `frames[currentFrame]` — zero per-frame computation.

4. **Event bus:** SimulationEngine uses a simple listener map (`Map<EventName, Set<() => void>>`) for decoupled UI updates.

5. **Coordinate mapping:** G-code XYZ → Three.js XZY (Y-up convention). Applied in ToolpathVisualizer and machine position updates.
