use ems_core::types::{WorkspaceBounds, JointLimits, ViolationEvent, ViolationType};

/// Check if a point is within workspace bounds.
pub fn check_workspace_bounds(
    point: &[f64; 3],
    bounds: &WorkspaceBounds,
    frame_index: usize,
) -> Option<ViolationEvent> {
    if !bounds.contains(point) {
        Some(ViolationEvent {
            frame_index,
            violation_type: ViolationType::WorkspaceBound,
            position: *point,
            message: format!(
                "Position [{:.2}, {:.2}, {:.2}] outside workspace bounds",
                point[0], point[1], point[2]
            ),
        })
    } else {
        None
    }
}

/// Check if joint values are within limits.
pub fn check_joint_limits(
    joint_values: &[f64],
    limits: &[JointLimits],
    frame_index: usize,
    position: &[f64; 3],
) -> Vec<ViolationEvent> {
    joint_values
        .iter()
        .zip(limits.iter())
        .enumerate()
        .filter_map(|(i, (val, lim))| {
            if *val < lim.min || *val > lim.max {
                Some(ViolationEvent {
                    frame_index,
                    violation_type: ViolationType::JointLimit { joint_index: i },
                    position: *position,
                    message: format!(
                        "Joint {} value {:.4} outside limits [{:.4}, {:.4}]",
                        i, val, lim.min, lim.max
                    ),
                })
            } else {
                None
            }
        })
        .collect()
}
