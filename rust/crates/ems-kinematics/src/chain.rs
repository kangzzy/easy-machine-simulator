use ems_core::types::JointLimits;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum JointType {
    Revolute,
    Prismatic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Joint {
    pub name: String,
    pub joint_type: JointType,
    pub limits: JointLimits,
    /// DH parameters: [theta_offset, d, a, alpha]
    pub dh_params: [f64; 4],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KinematicChain {
    pub name: String,
    pub joints: Vec<Joint>,
}

impl KinematicChain {
    pub fn dof(&self) -> usize {
        self.joints.len()
    }
}
