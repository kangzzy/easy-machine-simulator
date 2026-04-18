use wasm_bindgen::prelude::*;
use js_sys::Float64Array;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn ping() -> String {
    "pong".to_string()
}

/// Parse G-code string and return toolpath points as a flat Float64Array.
/// Layout: [x0, y0, z0, a0, b0, c0, feed0, x1, y1, z1, a1, b1, c1, feed1, ...]
/// 7 values per point.
#[wasm_bindgen]
pub fn parse_gcode(input: &str) -> Float64Array {
    let points = ems_gcode::parser::parse_gcode(input);
    let mut flat = Vec::with_capacity(points.len() * 7);
    for p in &points {
        flat.push(p.position[0]);
        flat.push(p.position[1]);
        flat.push(p.position[2]);
        let (a, b, c) = p.orientation.map(|o| (o[0], o[1], o[2])).unwrap_or((0.0, 0.0, 0.0));
        flat.push(a);
        flat.push(b);
        flat.push(c);
        flat.push(p.feed_rate.unwrap_or(-1.0)); // -1 = rapid
    }
    Float64Array::from(flat.as_slice())
}

/// Return the number of points from a parsed G-code result.
#[wasm_bindgen]
pub fn gcode_point_count(input: &str) -> usize {
    ems_gcode::parser::parse_gcode(input).len()
}

/// Check workspace bounds for an array of points.
/// Returns a JSON array of violation events.
#[wasm_bindgen]
pub fn check_bounds_batch(
    positions: &Float64Array,
    bounds_json: &str,
) -> JsValue {
    let bounds: ems_core::types::WorkspaceBounds =
        serde_json::from_str(bounds_json).unwrap_or(ems_core::types::WorkspaceBounds {
            min: [f64::NEG_INFINITY; 3],
            max: [f64::INFINITY; 3],
        });

    let data = positions.to_vec();
    let stride = 7; // x,y,z,a,b,c,feed
    let mut violations = Vec::new();

    for (i, chunk) in data.chunks(stride).enumerate() {
        if chunk.len() < 3 { break; }
        let point = [chunk[0], chunk[1], chunk[2]];
        if let Some(v) = ems_collision::bounds::check_workspace_bounds(&point, &bounds, i) {
            violations.push(v);
        }
    }

    serde_wasm_bindgen::to_value(&violations).unwrap_or(JsValue::NULL)
}

/// Compute forward kinematics for a 3-axis CNC.
/// Input: flat Float64Array of toolpath positions [x,y,z,a,b,c,feed, ...]
/// Output: flat Float64Array of joint states [j0,j1,j2, ...] (3 per frame for 3-axis)
#[wasm_bindgen]
pub fn compute_fk_cnc3(positions: &Float64Array) -> Float64Array {
    let data = positions.to_vec();
    let stride = 7;
    let mut joint_states = Vec::with_capacity((data.len() / stride) * 3);

    for chunk in data.chunks(stride) {
        if chunk.len() < 3 { break; }
        // 3-axis CNC: joint states = Cartesian positions directly
        joint_states.push(chunk[0]); // X axis
        joint_states.push(chunk[1]); // Y axis
        joint_states.push(chunk[2]); // Z axis
    }

    Float64Array::from(joint_states.as_slice())
}

/// Compute forward kinematics for a 5-axis CNC.
/// Input: flat Float64Array [x,y,z,a,b,c,feed, ...]
/// Output: flat Float64Array [j0,j1,j2,j3,j4, ...] (5 per frame)
#[wasm_bindgen]
pub fn compute_fk_cnc5(positions: &Float64Array) -> Float64Array {
    let data = positions.to_vec();
    let stride = 7;
    let mut joint_states = Vec::with_capacity((data.len() / stride) * 5);

    for chunk in data.chunks(stride) {
        if chunk.len() < 6 { break; }
        joint_states.push(chunk[0]); // X
        joint_states.push(chunk[1]); // Y
        joint_states.push(chunk[2]); // Z
        joint_states.push(chunk[3].to_radians()); // A rotary
        joint_states.push(chunk[4].to_radians()); // B rotary
    }

    Float64Array::from(joint_states.as_slice())
}

/// Check joint limits for a batch of joint states.
/// joints_data: flat array of joint states
/// dof: degrees of freedom per frame
/// limits_json: JSON array of {min, max} per joint
/// Returns JSON array of violation events.
#[wasm_bindgen]
pub fn check_joint_limits_batch(
    joints_data: &Float64Array,
    dof: usize,
    limits_json: &str,
) -> JsValue {
    let limits: Vec<ems_core::types::JointLimits> =
        serde_json::from_str(limits_json).unwrap_or_default();

    if limits.len() < dof {
        return JsValue::NULL;
    }

    let data = joints_data.to_vec();
    let mut violations = Vec::new();

    for (frame_idx, chunk) in data.chunks(dof).enumerate() {
        if chunk.len() < dof { break; }
        let joint_violations = ems_collision::bounds::check_joint_limits(
            chunk,
            &limits[..dof],
            frame_idx,
            &[0.0, 0.0, 0.0], // position approximation
        );
        violations.extend(joint_violations);
    }

    serde_wasm_bindgen::to_value(&violations).unwrap_or(JsValue::NULL)
}
