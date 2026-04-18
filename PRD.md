# Easy Machine Simulator
### Product Requirements Document

---

## What It Is

A **browser-based 3D simulator** for CNC machines and robotic arms.  
Load a toolpath, configure your machine, and instantly see whether everything stays within bounds — work envelope, joint limits, and cable routing — all without installing anything.

```
Stack:  TypeScript + Three.js (WebGPU / WebGL2)
        Rust → WASM  (G-code parsing, kinematics, collision)
        Docker-only build pipeline
```

---

## Feature Areas

1. [Toolpath Input](#1-toolpath-input)
2. [Machine Configuration](#2-machine-configuration)
3. [Work Envelope](#3-work-envelope)
4. [Simulation & Playback](#4-simulation--playback)
5. [Violation Detection](#5-violation-detection)
6. [Cable & Tube Routing](#6-cable--tube-routing)
7. [3D Visualization](#7-3d-visualization)
8. [Report Export](#8-report-export)
9. [UI & Shortcuts](#9-ui--shortcuts)
10. [Theme](#10-theme)
11. [Non-Functional Requirements](#11-non-functional-requirements)

---

## 1. Toolpath Input

Three input formats, all normalised to the same internal representation.

| Format | Details |
|---|---|
| **G-code** | G0/G1/G2/G3 moves · G90/G91 absolute/relative · G17–G19 plane · G20/G21 units · arc interpolation |
| **CSV point list** | `x, y, z [, feed]` per row |
| **JSON CAD lines** | Array of 3D line segments |

> Format is **auto-detected** from file extension and content — no manual selection needed.

**Parser pipeline**

```
File upload
    │
    ├─ WASM worker (Rust)  ──── Float64Array (7 values/point: x y z a b c feed)
    │                                │
    └─ JS fallback ─────────────────┘
```

Rapid moves (G0) and feed moves (G1) are stored separately so they can be coloured differently in the viewport.

---

## 2. Machine Configuration

### Presets

| | Axes | Notes |
|---|---|---|
| **3-Axis CNC** | X · Y · Z | Base → table → gantry → spindle |
| **5-Axis CNC** | X · Y · Z · A · B | Adds rotary table + tilt ring |
| **6-Axis Robot** | J1 – J6 | Full revolute chain with configurable DH parameters |

---

### Custom Machine Builder

Build any machine from scratch using a **drag-and-drop component tree**.

**Component types**

`linear-axis` · `rotary-axis` · `robot-arm` · `rail` · `turntable` · `spindle` · `end-effector`

**Per-component properties**

| Property | Type |
|---|---|
| Name | Text |
| Position offset | X / Y / Z (mm) |
| Rotation | X / Y / Z (°) |
| Scale | Uniform multiplier |
| Joint type | Fixed · Prismatic · Revolute |
| Joint axis | X / Y / Z normalised vector |
| Joint limits | Min / Max |

**3D model upload** — STL · STEP · OBJ · GLB  
Auto-fit scaling applied on import; triangle count and bounding box shown.

**Live kinematics** — moving a parent component instantly propagates through all children via Three.js parent-child transforms. No DOM rebuild, no lag.

---

### Joint Control Panel

Each movable joint gets a **slider + numeric input**, range-locked to its limits.

- `P` badge → prismatic (mm) · `R` badge → revolute (rad)
- Edit min/max inline — current value is re-clamped automatically
- **Reset All** → every joint returns to 0
- **Cable stiffness cap** — if a cable has stiffness enforcement on, joint travel stops before the cable would be over-bent (binary search, 10 iterations)

---

## 3. Work Envelope

A transparent wireframe box showing the machine's reachable bounds.

- Turns **red** on any violation
- Toggle: `E` key or **Env** button in the View toolbar
- Auto-updates when machine configuration changes

---

## 4. Simulation & Playback

### Controls

| Action | Input |
|---|---|
| Play / Pause | `Space` or button |
| Step frame | `←` / `→` |
| Jump to start / end | `Home` / `End` |
| Seek to frame | Drag seek bar |
| Speed | ±0.5× steps (shown as multiplier) |
| Stop | Button — resets to frame 0 |

### Violation Handling

Choose per session how violations are handled:

| Mode | Behaviour |
|---|---|
| **Flag & Continue** | Violation frames marked red; playback finishes |
| **Stop at Boundary** | Playback pauses at the first violation frame |

---

## 5. Violation Detection

Four independent checks run against every toolpath frame.

| Check | Method |
|---|---|
| **Workspace bounds** | Point vs. machine X/Y/Z min–max box |
| **Joint limits** | Orientation angles vs. revolute/prismatic limits |
| **Cable curvature** | Menger curvature formula; flags if bend radius < minimum |
| **Cable twist** | Frenet-frame accumulation; flags if twist > maximum |

**Violation log panel**

- Shows the last 100 violations
- Colour-coded by type (workspace · joint · cable)
- Click any entry to seek playback to that frame
- Each record stores: frame index · world position · message · type

---

## 6. Cable & Tube Routing

Model real-world cables and fiber-optic tubes that are sensitive to bending and twisting.

### Cable Properties

| Property | Description |
|---|---|
| **Attach points** | Ordered list of `(component, localOffset [x,y,z])` |
| **Min bend radius** | mm — cable cannot bend tighter than this |
| **Max twist** | ° — cumulative rotation over cable length |
| **Diameter** | mm — rendered tube thickness |
| **Slack** | 0 = taut line · higher = drooping catenary |
| **Color** | RGB hex — tube and drag handle colour |
| **Enforce stiffness** | Joints are hard-stopped before this cable over-bends |

### Routing

Cable path is a **CatmullRom spline** through all attach-point world positions.  
When slack > 0, a drooped midpoint is inserted between every pair — this applies even to simple 2-point cables (without it, two points produce a straight line).

Near-duplicate consecutive points are filtered out to prevent degenerate geometry.

**Stress colouring** along tube length:

```
  Cable colour  →  Yellow  →  Red
  (safe)           (near limit)   (violation)
```

### Drag Handles

Each attach point has a **yellow sphere handle** in the 3D viewport (always visible, depth-test disabled).

- Hover → highlight
- Drag → moves on a camera-facing plane through the handle centre
- New world position → converted back to component local space → `localOffset` updated live
- OrbitControls disabled during drag; restored on mouse-up

### Via Points

Add intermediate attach points on the same or different components to pre-define curved cable routing without machine movement.

---

## 7. 3D Visualization

### Renderer

WebGPU (preferred) with automatic WebGL2 fallback.

### Scene Elements

| Element | Description |
|---|---|
| **Grid** | 2000 × 2000 unit, 40 divisions — colour-matched to theme |
| **Lighting** | Ambient 0.6 + directional key 0.8 + fill 0.3 (3-point setup) |
| **Toolpath line** | Yellow = rapid · Green = feed · Red = violation |
| **Position marker** | Cyan sphere at current frame |
| **Axes gizmo** | 120 × 120 px X/Y/Z indicator, bottom-left corner, separate canvas |

### Camera

| Action | Input |
|---|---|
| Orbit | Left-drag |
| Zoom | Scroll |
| Pan | Right-drag |
| Inertia | Enabled (damping factor 0.1) |

**Standard views** (View toolbar): 3D · Top · Bottom · Front · Back · Left · Right

**Camera tools**: Reset · Fit All · Center on Origin

---

## 8. Report Export

| Format | Contents |
|---|---|
| **JSON** | Timestamp · machine name / type / DOF / bounds · frame count · full violation list · pass/fail |
| **HTML** | Printable styled report — save as PDF via browser print dialog |

---

## 9. UI & Shortcuts

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│                   [ View toolbar ]                    [ ☀/🌙 ] │
├─────────────┬──────────────────────────────────┬───────────────┤
│  Toolpath   │                                  │    Machine    │
│             │                                  │   (scrolls)   │
│  Joint      │           3D Viewport            │               │
│  Control    │                                  │  Violations   │
│             │                                  │  Cables       │
├─────────────┴───────────┬──────────────────────┴───────────────┤
│                         │      Controls      │                  │
└─────────────────────────┴────────────────────┴──────────────────┘
```

- All side panels are **collapsible** — click the `▼` header to collapse to title-only
- Collapsing a panel releases its space to neighbours in the same column
- All docked panels share a uniform **260 px** width
- Custom **slim scrollbars** styled to match the active theme

### Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `←` / `→` | Step backward / forward |
| `Home` / `End` | First / last frame |
| `E` | Toggle envelope |
| `F` | Fit all in view |
| `R` | Reset camera |
| `C` | Centre on origin |
| `Numpad 1` | Front view (`+ Ctrl` → Back) |
| `Numpad 3` | Right view (`+ Ctrl` → Left) |
| `Numpad 7` | Top view (`+ Ctrl` → Bottom) |
| `Numpad 5` | Perspective view |

---

## 10. Theme

| | Dark (default) | Light |
|---|---|---|
| Scene background | `#1a1a2e` | `#dde0ee` |
| Panels | Near-black with blur | Near-white with blur |
| Grid | Purple-grey | Blue-grey |
| Accent | `#4a9eff` | `#1a6ed4` |

- Toggle button fixed **top-right**
- Preference saved to **`localStorage`** — persists across sessions

---

## 11. Non-Functional Requirements

| Requirement | Approach |
|---|---|
| **Zero render jank** | Main thread renders only; all parsing/kinematics/collision run in Web Workers |
| **WASM computation** | Rust → `wasm-pack` → `src/wasm-pkg/` at Docker build time |
| **Docker-only builds** | `npm install`, `cargo build`, `wasm-pack` never run on host |
| **SharedArrayBuffer** | COOP + COEP headers on dev server (`localhost:5173`) |
| **Browser support** | Chrome 113+ · Edge 113+ · Firefox 118+ · Safari 17+ |
| **License** | All dependencies MIT / Apache-2.0 / MPL-2.0 — zero license cost |
