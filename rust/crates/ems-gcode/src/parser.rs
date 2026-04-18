use ems_core::types::ToolpathPoint;
use serde::{Serialize, Deserialize};
use std::f64::consts::PI;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum DistanceMode {
    Absolute,    // G90
    Incremental, // G91
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum MotionMode {
    Rapid,           // G0
    Linear,          // G1
    ArcCW,           // G2
    ArcCCW,          // G3
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Plane {
    XY, // G17
    XZ, // G18
    YZ, // G19
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Units {
    Millimeters, // G21
    Inches,      // G20
}

#[derive(Debug, Clone)]
struct ParserState {
    x: f64,
    y: f64,
    z: f64,
    a: f64,
    b: f64,
    c: f64,
    feed_rate: f64,
    motion_mode: MotionMode,
    distance_mode: DistanceMode,
    plane: Plane,
    units: Units,
}

impl Default for ParserState {
    fn default() -> Self {
        Self {
            x: 0.0, y: 0.0, z: 0.0,
            a: 0.0, b: 0.0, c: 0.0,
            feed_rate: 0.0,
            motion_mode: MotionMode::Rapid,
            distance_mode: DistanceMode::Absolute,
            plane: Plane::XY,
            units: Units::Millimeters,
        }
    }
}

#[derive(Debug, Clone, Default)]
struct GCodeWord {
    x: Option<f64>,
    y: Option<f64>,
    z: Option<f64>,
    a: Option<f64>,
    b: Option<f64>,
    c: Option<f64>,
    i: Option<f64>,
    j: Option<f64>,
    k: Option<f64>,
    f: Option<f64>,
    r: Option<f64>,
    g_codes: Vec<u32>, // stored as integer * 10 to handle G28.1 etc.
    m_codes: Vec<u32>,
}

fn parse_line(line: &str) -> GCodeWord {
    let mut word = GCodeWord::default();
    let line = line.split(';').next().unwrap_or("").trim(); // strip comments
    let line = if let Some(idx) = line.find('(') {
        // strip parenthetical comments
        if let Some(end) = line[idx..].find(')') {
            let mut s = line[..idx].to_string();
            s.push_str(&line[idx + end + 1..]);
            return parse_line_inner(&s, &mut word);
        }
        &line[..idx]
    } else {
        line
    };
    parse_line_inner(line, &mut word);
    word
}

fn parse_line_inner(line: &str, word: &mut GCodeWord) -> GCodeWord {
    let mut chars = line.chars().peekable();
    while let Some(&ch) = chars.peek() {
        if ch.is_whitespace() {
            chars.next();
            continue;
        }
        let letter = ch.to_ascii_uppercase();
        chars.next();
        // collect number
        let mut num_str = String::new();
        while let Some(&c) = chars.peek() {
            if c.is_ascii_digit() || c == '.' || c == '-' || c == '+' {
                num_str.push(c);
                chars.next();
            } else {
                break;
            }
        }
        let val: f64 = num_str.parse().unwrap_or(0.0);
        match letter {
            'G' => word.g_codes.push((val * 10.0).round() as u32),
            'M' => word.m_codes.push(val as u32),
            'X' => word.x = Some(val),
            'Y' => word.y = Some(val),
            'Z' => word.z = Some(val),
            'A' => word.a = Some(val),
            'B' => word.b = Some(val),
            'C' => word.c = Some(val),
            'I' => word.i = Some(val),
            'J' => word.j = Some(val),
            'K' => word.k = Some(val),
            'F' => word.f = Some(val),
            'R' => word.r = Some(val),
            _ => {} // ignore N, S, T, etc.
        }
    }
    word.clone()
}

fn expand_arc(
    start: (f64, f64, f64),
    end: (f64, f64, f64),
    center_offset: (f64, f64),
    clockwise: bool,
    plane: Plane,
    segments_per_rev: usize,
) -> Vec<(f64, f64, f64)> {
    let (s0, s1, s_linear) = match plane {
        Plane::XY => (start.0, start.1, start.2),
        Plane::XZ => (start.0, start.2, start.1),
        Plane::YZ => (start.1, start.2, start.0),
    };
    let (e0, e1, e_linear) = match plane {
        Plane::XY => (end.0, end.1, end.2),
        Plane::XZ => (end.0, end.2, end.1),
        Plane::YZ => (end.1, end.2, end.0),
    };

    let cx = s0 + center_offset.0;
    let cy = s1 + center_offset.1;
    let r = ((s0 - cx).powi(2) + (s1 - cy).powi(2)).sqrt();

    let start_angle = (s1 - cy).atan2(s0 - cx);
    let mut end_angle = (e1 - cy).atan2(e0 - cx);

    if clockwise {
        if end_angle >= start_angle {
            end_angle -= 2.0 * PI;
        }
    } else {
        if end_angle <= start_angle {
            end_angle += 2.0 * PI;
        }
    }

    let sweep = end_angle - start_angle;
    let n_segments = ((sweep.abs() / (2.0 * PI)) * segments_per_rev as f64)
        .ceil()
        .max(1.0) as usize;

    let mut points = Vec::with_capacity(n_segments);
    for i in 1..=n_segments {
        let t = i as f64 / n_segments as f64;
        let angle = start_angle + sweep * t;
        let p0 = cx + r * angle.cos();
        let p1 = cy + r * angle.sin();
        let pl = s_linear + (e_linear - s_linear) * t;

        let point = match plane {
            Plane::XY => (p0, p1, pl),
            Plane::XZ => (p0, pl, p1),
            Plane::YZ => (pl, p0, p1),
        };
        points.push(point);
    }
    points
}

pub fn parse_gcode(input: &str) -> Vec<ToolpathPoint> {
    let mut state = ParserState::default();
    let mut points = Vec::new();

    // Add origin as first point
    points.push(ToolpathPoint {
        position: [0.0, 0.0, 0.0],
        orientation: None,
        feed_rate: None,
    });

    for line in input.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('%') {
            continue;
        }

        let word = parse_line(line);

        // Process G-codes for mode changes
        for &g in &word.g_codes {
            match g {
                0 => state.motion_mode = MotionMode::Rapid,
                10 => state.motion_mode = MotionMode::Linear,
                20 => state.motion_mode = MotionMode::ArcCW,
                30 => state.motion_mode = MotionMode::ArcCCW,
                170 => state.plane = Plane::XY,
                180 => state.plane = Plane::XZ,
                190 => state.plane = Plane::YZ,
                200 => state.units = Units::Inches,
                210 => state.units = Units::Millimeters,
                900 => state.distance_mode = DistanceMode::Absolute,
                910 => state.distance_mode = DistanceMode::Incremental,
                280 => {
                    // G28 - return to home
                    state.x = 0.0;
                    state.y = 0.0;
                    state.z = 0.0;
                    points.push(ToolpathPoint {
                        position: [0.0, 0.0, 0.0],
                        orientation: None,
                        feed_rate: Some(state.feed_rate),
                    });
                    continue;
                }
                _ => {} // ignore unsupported
            }
        }

        if let Some(f) = word.f {
            state.feed_rate = f;
        }

        // Check if there's any motion command
        let has_motion = word.x.is_some() || word.y.is_some() || word.z.is_some()
            || word.a.is_some() || word.b.is_some() || word.c.is_some();

        if !has_motion && word.i.is_none() && word.j.is_none() {
            continue;
        }

        let scale = match state.units {
            Units::Millimeters => 1.0,
            Units::Inches => 25.4,
        };

        // Calculate target position
        let (tx, ty, tz) = match state.distance_mode {
            DistanceMode::Absolute => (
                word.x.map(|v| v * scale).unwrap_or(state.x),
                word.y.map(|v| v * scale).unwrap_or(state.y),
                word.z.map(|v| v * scale).unwrap_or(state.z),
            ),
            DistanceMode::Incremental => (
                state.x + word.x.map(|v| v * scale).unwrap_or(0.0),
                state.y + word.y.map(|v| v * scale).unwrap_or(0.0),
                state.z + word.z.map(|v| v * scale).unwrap_or(0.0),
            ),
        };

        let ta = word.a.unwrap_or(state.a);
        let tb = word.b.unwrap_or(state.b);
        let tc = word.c.unwrap_or(state.c);

        match state.motion_mode {
            MotionMode::Rapid | MotionMode::Linear => {
                let orientation = if ta != 0.0 || tb != 0.0 || tc != 0.0 {
                    Some([ta, tb, tc])
                } else {
                    None
                };
                points.push(ToolpathPoint {
                    position: [tx, ty, tz],
                    orientation,
                    feed_rate: if state.motion_mode == MotionMode::Rapid {
                        None
                    } else {
                        Some(state.feed_rate)
                    },
                });
            }
            MotionMode::ArcCW | MotionMode::ArcCCW => {
                let clockwise = state.motion_mode == MotionMode::ArcCW;
                let ci = word.i.unwrap_or(0.0) * scale;
                let cj = word.j.unwrap_or(0.0) * scale;

                let center_offset = match state.plane {
                    Plane::XY => (ci, cj),
                    Plane::XZ => (ci, word.k.unwrap_or(0.0) * scale),
                    Plane::YZ => (cj, word.k.unwrap_or(0.0) * scale),
                };

                let arc_points = expand_arc(
                    (state.x, state.y, state.z),
                    (tx, ty, tz),
                    center_offset,
                    clockwise,
                    state.plane,
                    72, // segments per revolution
                );

                for (px, py, pz) in arc_points {
                    points.push(ToolpathPoint {
                        position: [px, py, pz],
                        orientation: None,
                        feed_rate: Some(state.feed_rate),
                    });
                }
            }
        }

        state.x = tx;
        state.y = ty;
        state.z = tz;
        state.a = ta;
        state.b = tb;
        state.c = tc;
    }

    points
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_linear() {
        let gcode = "G90 G21\nG0 X10 Y20 Z5\nG1 X30 Y40 Z10 F500";
        let points = parse_gcode(gcode);
        assert_eq!(points.len(), 3); // origin + 2 moves
        assert_eq!(points[1].position, [10.0, 20.0, 5.0]);
        assert_eq!(points[2].position, [30.0, 40.0, 10.0]);
        assert_eq!(points[2].feed_rate, Some(500.0));
    }

    #[test]
    fn test_incremental() {
        let gcode = "G91\nG1 X10 Y10\nG1 X5 Y5";
        let points = parse_gcode(gcode);
        assert_eq!(points.len(), 3);
        assert_eq!(points[1].position, [10.0, 10.0, 0.0]);
        assert_eq!(points[2].position, [15.0, 15.0, 0.0]);
    }

    #[test]
    fn test_arc_cw() {
        let gcode = "G90 G17\nG0 X10 Y0\nG2 X0 Y10 I-10 J0";
        let points = parse_gcode(gcode);
        assert!(points.len() > 3); // origin + rapid + arc segments
        let last = points.last().unwrap();
        assert!((last.position[0] - 0.0).abs() < 0.01);
        assert!((last.position[1] - 10.0).abs() < 0.01);
    }

    #[test]
    fn test_comments_stripped() {
        let gcode = "G0 X10 Y20 ; move to start\nG1 X30 (rapid) Y40";
        let points = parse_gcode(gcode);
        assert_eq!(points[1].position, [10.0, 20.0, 0.0]);
    }

    #[test]
    fn test_inches_to_mm() {
        let gcode = "G20\nG0 X1 Y1 Z1";
        let points = parse_gcode(gcode);
        assert_eq!(points[1].position, [25.4, 25.4, 25.4]);
    }
}
