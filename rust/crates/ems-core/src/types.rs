use nalgebra::{Vector3, UnitQuaternion};
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pose {
    pub position: [f64; 3],
    pub orientation: [f64; 4], // quaternion (x, y, z, w)
}

impl Pose {
    pub fn identity() -> Self {
        Self {
            position: [0.0, 0.0, 0.0],
            orientation: [0.0, 0.0, 0.0, 1.0],
        }
    }

    pub fn position_vec(&self) -> Vector3<f64> {
        Vector3::new(self.position[0], self.position[1], self.position[2])
    }

    pub fn orientation_quat(&self) -> UnitQuaternion<f64> {
        UnitQuaternion::from_quaternion(nalgebra::Quaternion::new(
            self.orientation[3],
            self.orientation[0],
            self.orientation[1],
            self.orientation[2],
        ))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolpathPoint {
    pub position: [f64; 3],
    pub orientation: Option<[f64; 3]>, // euler angles (A, B, C) for 5-axis/6-axis
    pub feed_rate: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JointState {
    pub values: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JointLimits {
    pub min: f64,
    pub max: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceBounds {
    pub min: [f64; 3],
    pub max: [f64; 3],
}

impl WorkspaceBounds {
    pub fn contains(&self, point: &[f64; 3]) -> bool {
        (0..3).all(|i| point[i] >= self.min[i] && point[i] <= self.max[i])
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViolationEvent {
    pub frame_index: usize,
    pub violation_type: ViolationType,
    pub position: [f64; 3],
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ViolationType {
    JointLimit { joint_index: usize },
    WorkspaceBound,
    Collision,
}
