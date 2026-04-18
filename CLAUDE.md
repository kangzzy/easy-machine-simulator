# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Physical machine simulator (CNC + robotic arms) for verifying work envelopes and toolpaths. Web-based with 3D visualization. All development happens inside Docker — no local toolchain installs.

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

Dev server: http://localhost:5173/ (COOP/COEP headers enabled for SharedArrayBuffer).

## Architecture

**Rendering (main thread only):** TypeScript + Three.js with WebGPU renderer (WebGL2 fallback). The render loop must never be blocked.

**Computation (Web Workers):** Rust compiled to WASM via wasm-pack. The `wasm.worker.ts` loads the WASM module and handles G-code parsing, kinematics, and collision checking. Falls back to client-side JS parsing if WASM unavailable.

**Data flow:** User uploads file → WASM worker parses to Float64Array (7 values/point: x,y,z,a,b,c,feed) → SimulationEngine computes joint states → bounds checking → pre-computed frames loaded into AnimationController → render loop reads `frames[i]` each tick.

**Coordinate system:** G-code uses X/Y/Z. Three.js uses Y-up, so the ToolpathVisualizer maps: X→X, Z→Y, Y→Z.

## Project Structure

- `rust/crates/ems-core/` — Shared types (Pose, JointState, WorkspaceBounds), nalgebra math, DH transforms
- `rust/crates/ems-gcode/` — G-code parser (G0/G1/G2/G3, G90/G91, G17-19, G20/G21), arc interpolation
- `rust/crates/ems-kinematics/` — Kinematic chain definition with DH parameters
- `rust/crates/ems-collision/` — Workspace bounds checking, joint limit validation
- `rust/crates/ems-wasm/` — wasm-bindgen entry crate: `parse_gcode`, `compute_fk_cnc3/5`, `check_bounds_batch`, `check_joint_limits_batch`
- `src/renderer/` — SceneManager, ToolpathVisualizer, EnvelopeOverlay, ProjectionViews, AnimationController
- `src/workers/` — WorkerPool (typed promise-based worker wrapper), wasm.worker.ts
- `src/machine/` — MachineLoader, presets/ (cnc-3axis.json, cnc-5axis.json, robot-6axis.json)
- `src/simulation/` — SimulationEngine (central coordinator, event bus, state machine)
- `src/ui/` — ControlPanel, ToolpathPanel, MachinePanel, ViewPanel, ViolationLog, ReportExporter
- `src/types/` — Shared TypeScript interfaces (machine, toolpath, simulation, worker-messages)

## Key Constraints

- **Docker-only:** Never run `npm install`, `cargo build`, or `wasm-pack` on the host. Everything builds inside Docker.
- **Zero rendering delay:** Main thread does rendering only. Heavy computation belongs in Web Workers.
- **Bounded workspace:** Each machine has joint limits and workspace bounds. Out-of-bounds handling: flag-and-continue or stop-at-boundary (user-selectable).
- **WASM output:** wasm-pack builds to `src/wasm-pkg/` (gitignored, generated at Docker build time).

## Keyboard Shortcuts

- Space: play/pause
- Left/Right arrows: step backward/forward
- Home/End: jump to first/last frame
- E: toggle envelope overlay
