use nalgebra::{Matrix4, Vector3, UnitQuaternion};

/// Build a 4x4 homogeneous transform from DH parameters.
pub fn dh_transform(theta: f64, d: f64, a: f64, alpha: f64) -> Matrix4<f64> {
    let (st, ct) = theta.sin_cos();
    let (sa, ca) = alpha.sin_cos();

    Matrix4::new(
        ct, -st * ca,  st * sa, a * ct,
        st,  ct * ca, -ct * sa, a * st,
        0.0,      sa,       ca,      d,
        0.0,     0.0,      0.0,    1.0,
    )
}

/// Build a 4x4 homogeneous transform from position and quaternion.
pub fn pose_to_matrix(position: &Vector3<f64>, orientation: &UnitQuaternion<f64>) -> Matrix4<f64> {
    let rot = orientation.to_rotation_matrix();
    let mut m = Matrix4::identity();
    m.fixed_view_mut::<3, 3>(0, 0).copy_from(rot.matrix());
    m[(0, 3)] = position[0];
    m[(1, 3)] = position[1];
    m[(2, 3)] = position[2];
    m
}

/// Extract position from a 4x4 homogeneous transform.
pub fn matrix_position(m: &Matrix4<f64>) -> Vector3<f64> {
    Vector3::new(m[(0, 3)], m[(1, 3)], m[(2, 3)])
}
