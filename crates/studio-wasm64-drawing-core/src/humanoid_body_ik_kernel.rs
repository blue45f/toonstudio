//! 휴머노이드 전신 역기구학(IK) 커널:
//! - 폴 벡터(Pole-Vector) 굽힘 제어와 소프트 과신전 클램프를 갖춘 해석적 2-Bone 팔/다리 IK (`solve_two_bone_ik_3d`)
//! - 감쇠(Damping)·관절 원뿔 제한·뼈 길이 불변량을 보장하는 다관절 척추 CCD IK (`solve_ccd_chain_3d`)
//! - 지면 바닥 평면(Y-plane) 발 접지 클램프 (`clamp_foot_contact_floor_3d`)
//!
//! 외부 크레이트 0개(`std` 전용), `#![deny(unsafe_code)]`, NaN/Inf/퇴화 벡터 완전 안전.

use std::f32::consts::{FRAC_PI_2, PI};

use crate::DrawingCoreError;

/// CCD 척추 체인 최소 관절 수(루트 + 엔드 이펙터).
pub const MIN_CCD_CHAIN_JOINTS: usize = 2;
/// CCD 척추 체인 최대 관절 수.
pub const MAX_CCD_CHAIN_JOINTS: usize = 32;
/// CCD 최대 허용 반복 횟수.
pub const MAX_CCD_ITERATIONS: u32 = 256;

const VEC_EPS: f32 = 1e-6;
const MIN_BONE_LEN: f32 = 1e-5;

#[inline]
fn all_finite3(v: [f32; 3]) -> bool {
    v[0].is_finite() && v[1].is_finite() && v[2].is_finite()
}

#[inline]
fn v3_add(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

#[inline]
fn v3_sub(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

#[inline]
fn v3_scale(a: [f32; 3], s: f32) -> [f32; 3] {
    [a[0] * s, a[1] * s, a[2] * s]
}

#[inline]
fn v3_dot(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

#[inline]
fn v3_cross(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

#[inline]
fn v3_len(a: [f32; 3]) -> f32 {
    v3_dot(a, a).sqrt()
}

#[inline]
fn v3_normalize_or(a: [f32; 3], fallback: [f32; 3]) -> [f32; 3] {
    let l = v3_len(a);
    if l.is_finite() && l > VEC_EPS {
        v3_scale(a, 1.0 / l)
    } else {
        fallback
    }
}

/// 단위 벡터 `axis`에 수직인 안정적 직교 단위 벡터를 반환한다(공선 퇴화 방지).
#[inline]
fn any_orthogonal_unit(axis: [f32; 3]) -> [f32; 3] {
    let candidate = if axis[2].abs() < 0.9 {
        [0.0, 0.0, 1.0]
    } else {
        [1.0, 0.0, 0.0]
    };
    v3_normalize_or(v3_cross(axis, candidate), [1.0, 0.0, 0.0])
}

/// Rodrigues 회전 공식으로 벡터 `v`를 단위 축 `axis` 주위로 `angle_rad`만큼 회전한다.
#[inline]
fn rodrigues_rotate(v: [f32; 3], axis: [f32; 3], angle_rad: f32) -> [f32; 3] {
    let (s, c) = angle_rad.sin_cos();
    let k_cross_v = v3_cross(axis, v);
    let k_dot_v = v3_dot(axis, v);
    [
        v[0] * c + k_cross_v[0] * s + axis[0] * k_dot_v * (1.0 - c),
        v[1] * c + k_cross_v[1] * s + axis[1] * k_dot_v * (1.0 - c),
        v[2] * c + k_cross_v[2] * s + axis[2] * k_dot_v * (1.0 - c),
    ]
}

// ---------------------------------------------------------------------------
// 1. 지면 바닥 평면(Y-plane) 발 접지 클램프
// ---------------------------------------------------------------------------

/// 3D 발/엔드 이펙터 좌표를 바닥 평면 `floor_y + sole_offset` 이상으로 클램프한다.
///
/// 반환값: `(클램프된_좌표, 바닥_접지_발생_여부)`.
pub fn clamp_foot_contact_floor_3d(
    foot_pos: [f32; 3],
    floor_y: f32,
    sole_offset: f32,
) -> Result<([f32; 3], bool), DrawingCoreError> {
    if !all_finite3(foot_pos) {
        return Err(DrawingCoreError::InvalidParameter { name: "foot_pos" });
    }
    if !floor_y.is_finite() {
        return Err(DrawingCoreError::InvalidParameter { name: "floor_y" });
    }
    if !sole_offset.is_finite() || sole_offset < 0.0 {
        return Err(DrawingCoreError::InvalidParameter {
            name: "sole_offset",
        });
    }
    let min_y = floor_y + sole_offset;
    if foot_pos[1] < min_y {
        Ok(([foot_pos[0], min_y, foot_pos[2]], true))
    } else {
        Ok((foot_pos, false))
    }
}

// ---------------------------------------------------------------------------
// 2. 해석적 2-Bone 팔/다리 IK 솔버 (코사인 법칙 + 폴 벡터 + 소프트 과신전 클램프)
// ---------------------------------------------------------------------------

/// 해석적 2-Bone 팔/다리 IK 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TwoBoneIkConfig {
    /// 상완(어깨→팔꿈치) 또는 허벅지(고관절→무릎) 길이(m).
    pub upper_length: f32,
    /// 전완(팔꿈치→손목) 또는 정강이(무릎→발목) 길이(m).
    pub lower_length: f32,
    /// 소프트 과신전 클램프 개시 비율 `(0.5..=1.0]`(기본 `0.995` — 완전 신전 시 무릎/팔꿈치 팝핑 방지).
    pub soft_extension_ratio: f32,
    /// 최소 해부학적 굽힘 각도(라디안, `[0.0..=PI/2]`, 기본 `0.02` rad ≈ 1.15°).
    pub min_bend_angle_rad: f32,
    /// 선택적 바닥 평면 높이 `Y` (설정 시 발목/손목 목표가 바닥 아래로 침투하지 않도록 접지 클램프).
    pub floor_y: Option<f32>,
    /// 발바닥 두께/발목 오프셋(m, `>= 0.0`).
    pub foot_sole_offset: f32,
}

impl Default for TwoBoneIkConfig {
    fn default() -> Self {
        Self {
            upper_length: 0.42,
            lower_length: 0.40,
            soft_extension_ratio: 0.995,
            min_bend_angle_rad: 0.02,
            floor_y: None,
            foot_sole_offset: 0.0,
        }
    }
}

/// 해석적 2-Bone IK 풀이 결과.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TwoBoneIkResult {
    pub root: [f32; 3],
    pub mid: [f32; 3],
    pub end: [f32; 3],
    pub clamped_target: [f32; 3],
    /// 중간 관절(팔꿈치/무릎)의 굽힘 각도(라디안, 0 = 일직선, PI/2 = 90° 굴곡).
    pub bend_angle_rad: f32,
    pub floor_clamped: bool,
    pub soft_clamped: bool,
    /// 바닥 클램프된 목표점과 최종 `end` 간 유클리드 오차.
    pub target_error: f32,
}

/// 폴 벡터 굽힘 제어와 C1 소프트 과신전 클램프를 적용한 해석적 2-Bone 팔/다리 IK를 푼다.
pub fn solve_two_bone_ik_3d(
    root: [f32; 3],
    pole: [f32; 3],
    target: [f32; 3],
    config: &TwoBoneIkConfig,
) -> Result<TwoBoneIkResult, DrawingCoreError> {
    if !all_finite3(root) {
        return Err(DrawingCoreError::InvalidParameter { name: "root" });
    }
    if !all_finite3(pole) {
        return Err(DrawingCoreError::InvalidParameter { name: "pole" });
    }
    if !all_finite3(target) {
        return Err(DrawingCoreError::InvalidParameter { name: "target" });
    }
    if !config.upper_length.is_finite() || config.upper_length <= MIN_BONE_LEN {
        return Err(DrawingCoreError::InvalidParameter {
            name: "upper_length",
        });
    }
    if !config.lower_length.is_finite() || config.lower_length <= MIN_BONE_LEN {
        return Err(DrawingCoreError::InvalidParameter {
            name: "lower_length",
        });
    }
    if !config.soft_extension_ratio.is_finite()
        || config.soft_extension_ratio <= 0.5
        || config.soft_extension_ratio > 1.0
    {
        return Err(DrawingCoreError::InvalidParameter {
            name: "soft_extension_ratio",
        });
    }
    if !config.min_bend_angle_rad.is_finite()
        || config.min_bend_angle_rad < 0.0
        || config.min_bend_angle_rad > FRAC_PI_2
    {
        return Err(DrawingCoreError::InvalidParameter {
            name: "min_bend_angle_rad",
        });
    }
    if !config.foot_sole_offset.is_finite() || config.foot_sole_offset < 0.0 {
        return Err(DrawingCoreError::InvalidParameter {
            name: "foot_sole_offset",
        });
    }

    // 1) 선택적 바닥 평면 발 접지 클램프
    let (floor_target, floor_clamped) = if let Some(fy) = config.floor_y {
        clamp_foot_contact_floor_3d(target, fy, config.foot_sole_offset)?
    } else {
        (target, false)
    };

    let l1 = config.upper_length;
    let l2 = config.lower_length;
    let max_hard = l1 + l2;
    let min_reach = (l1 - l2).abs().max(1e-4);

    // 최소 굽힘 각도 `min_bend_angle_rad`로 제한되는 최대 도달 거리
    let max_angle_reach = (l1 * l1 + l2 * l2 + 2.0 * l1 * l2 * config.min_bend_angle_rad.cos())
        .max(min_reach * min_reach)
        .sqrt();
    let max_cap = max_angle_reach.min(max_hard * 0.999_99);
    let soft_start = (max_hard * config.soft_extension_ratio)
        .min(max_cap)
        .max(min_reach);

    let to_target = v3_sub(floor_target, root);
    let raw_dist = v3_len(to_target);

    // 2) C1 점근 소프트 과신전 클램프: `raw_dist <= soft_start` 구간은 0-오차, 초과는 매끄럽게 감쇠
    let (d, soft_clamped) = if raw_dist < min_reach {
        (min_reach, true)
    } else if raw_dist > soft_start {
        let span = (max_cap - soft_start).max(0.0);
        let damped = if span > 1e-6 {
            let excess = raw_dist - soft_start;
            soft_start + span * (1.0 - (-excess / span).exp())
        } else {
            soft_start
        };
        (damped.clamp(min_reach, max_cap), true)
    } else {
        (raw_dist, false)
    };

    // 3) 주축(u_axis) 및 폴 벡터 직교 투영(bend_axis)으로 IK 평면 정규직교 기저 구성
    let pole_rel = v3_sub(pole, root);
    let u_axis = if raw_dist > VEC_EPS {
        v3_scale(to_target, 1.0 / raw_dist)
    } else {
        v3_normalize_or(pole_rel, [0.0, -1.0, 0.0])
    };

    let pole_proj = v3_sub(pole_rel, v3_scale(u_axis, v3_dot(pole_rel, u_axis)));
    let bend_axis = if v3_len(pole_proj) > VEC_EPS {
        v3_normalize_or(pole_proj, any_orthogonal_unit(u_axis))
    } else {
        any_orthogonal_unit(u_axis)
    };

    // 4) 제2코사인 법칙으로 상완 각도 계산
    let cos_alpha = ((l1 * l1 + d * d - l2 * l2) / (2.0 * l1 * d)).clamp(-1.0, 1.0);
    let sin_alpha = (1.0 - cos_alpha * cos_alpha).max(0.0).sqrt();

    let mid = v3_add(
        root,
        v3_add(
            v3_scale(u_axis, l1 * cos_alpha),
            v3_scale(bend_axis, l1 * sin_alpha),
        ),
    );
    let end = v3_add(root, v3_scale(u_axis, d));

    let v_upper = v3_normalize_or(v3_sub(mid, root), u_axis);
    let v_lower = v3_normalize_or(v3_sub(end, mid), u_axis);
    let bend_angle_rad = v3_dot(v_upper, v_lower).clamp(-1.0, 1.0).acos();
    let target_error = v3_len(v3_sub(end, floor_target));

    Ok(TwoBoneIkResult {
        root,
        mid,
        end,
        clamped_target: floor_target,
        bend_angle_rad,
        floor_clamped,
        soft_clamped,
        target_error,
    })
}

// ---------------------------------------------------------------------------
// 3. 감쇠 다관절 척추 CCD IK 솔버 (원뿔 각도 제한 + 바닥 평면 클램프)
// ---------------------------------------------------------------------------

/// 다관절 척추 CCD IK 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CcdChainConfig {
    pub max_iterations: u32,
    pub tolerance: f32,
    /// 반복당 단일 관절 최대 회전 각도(라디안, 급격한 척추 비틀림 방지).
    pub max_step_angle_rad: f32,
    /// 감쇠 계수 `(0.0..=1.0]`(작을수록 척추 전체에 굽힘이 고르게 분산됨).
    pub damping: f32,
    /// 부모 뼈 방향 대비 각 관절 최대 허용 굴곡 원뿔 각도(라디안, `(0.0..=PI]`).
    pub max_joint_bend_rad: f32,
    /// 선택적 바닥 평면 높이 `Y` (설정 시 모든 비루트 관절과 목표가 바닥 위를 유지).
    pub floor_y: Option<f32>,
    /// 바닥 여유 높이(m, `>= 0.0`).
    pub floor_clearance: f32,
}

impl Default for CcdChainConfig {
    fn default() -> Self {
        Self {
            max_iterations: 16,
            tolerance: 1e-3,
            max_step_angle_rad: 0.35,
            damping: 0.75,
            max_joint_bend_rad: 0.65,
            floor_y: None,
            floor_clearance: 0.0,
        }
    }
}

/// 다관절 척추 CCD IK 수렴 결과.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CcdChainResult {
    pub iterations: u32,
    pub converged: bool,
    pub target_error: f32,
    pub max_bone_length_error: f32,
    pub floor_clamped_joints: usize,
}

/// 부모→자식 뼈 길이를 정확히 유지하면서 자식 관절을 `min_y` 바닥 평면 위로 투영한다.
fn enforce_bone_length_and_floor(
    parent: [f32; 3],
    child: [f32; 3],
    bone_len: f32,
    min_y: Option<f32>,
) -> ([f32; 3], bool) {
    let dir = v3_normalize_or(v3_sub(child, parent), [0.0, 1.0, 0.0]);
    let projected = v3_add(parent, v3_scale(dir, bone_len));
    let Some(floor_min) = min_y else {
        return (projected, false);
    };
    if projected[1] >= floor_min {
        return (projected, false);
    }

    // `projected[1] < floor_min`일 때 길이를 유지하면서 `y >= floor_min`으로 투영
    let dy = (floor_min - parent[1]).clamp(-bone_len, bone_len);
    let horiz_r = (bone_len * bone_len - dy * dy).max(0.0).sqrt();
    let dx = child[0] - parent[0];
    let dz = child[2] - parent[2];
    let h_len = dx.hypot(dz);
    let (hx, hz) = if h_len > VEC_EPS {
        (dx / h_len * horiz_r, dz / h_len * horiz_r)
    } else {
        (horiz_r, 0.0)
    };
    ([parent[0] + hx, parent[1] + dy, parent[2] + hz], true)
}

/// 감쇠 CCD(Cyclic Coordinate Descent)로 다관절 휴머노이드 척추/목 체인을 `target`으로 수렴시킨다.
pub fn solve_ccd_chain_3d(
    joints: &mut [[f32; 3]],
    target: [f32; 3],
    config: &CcdChainConfig,
) -> Result<CcdChainResult, DrawingCoreError> {
    let n = joints.len();
    if !(MIN_CCD_CHAIN_JOINTS..=MAX_CCD_CHAIN_JOINTS).contains(&n) {
        return Err(DrawingCoreError::InvalidParameter { name: "joints" });
    }
    if !joints.iter().copied().all(all_finite3) {
        return Err(DrawingCoreError::InvalidParameter { name: "joints" });
    }
    if !all_finite3(target) {
        return Err(DrawingCoreError::InvalidParameter { name: "target" });
    }
    if config.max_iterations == 0 || config.max_iterations > MAX_CCD_ITERATIONS {
        return Err(DrawingCoreError::InvalidParameter {
            name: "max_iterations",
        });
    }
    if !config.tolerance.is_finite() || config.tolerance < 0.0 {
        return Err(DrawingCoreError::InvalidParameter { name: "tolerance" });
    }
    if !config.max_step_angle_rad.is_finite()
        || config.max_step_angle_rad <= 0.0
        || config.max_step_angle_rad > PI
    {
        return Err(DrawingCoreError::InvalidParameter {
            name: "max_step_angle_rad",
        });
    }
    if !config.damping.is_finite() || config.damping <= 0.0 || config.damping > 1.0 {
        return Err(DrawingCoreError::InvalidParameter { name: "damping" });
    }
    if !config.max_joint_bend_rad.is_finite()
        || config.max_joint_bend_rad <= 0.0
        || config.max_joint_bend_rad > PI
    {
        return Err(DrawingCoreError::InvalidParameter {
            name: "max_joint_bend_rad",
        });
    }
    if !config.floor_clearance.is_finite() || config.floor_clearance < 0.0 {
        return Err(DrawingCoreError::InvalidParameter {
            name: "floor_clearance",
        });
    }

    let (effective_target, min_y) = if let Some(fy) = config.floor_y {
        let (clamped, _) = clamp_foot_contact_floor_3d(target, fy, config.floor_clearance)?;
        (clamped, Some(fy + config.floor_clearance))
    } else {
        (target, None)
    };

    let bone_count = n - 1;
    let mut bone_lengths = [0.0_f32; MAX_CCD_CHAIN_JOINTS];
    for i in 0..bone_count {
        let len = v3_len(v3_sub(joints[i + 1], joints[i]));
        if !len.is_finite() || len <= MIN_BONE_LEN {
            return Err(DrawingCoreError::InvalidParameter {
                name: "bone_length",
            });
        }
        bone_lengths[i] = len;
    }

    let rest_root_dir = v3_normalize_or(v3_sub(joints[1], joints[0]), [0.0, 1.0, 0.0]);
    let mut iterations = 0u32;
    let mut converged = false;
    let mut floor_clamped_joints = 0usize;

    for iter in 0..config.max_iterations {
        let current_err = v3_len(v3_sub(joints[n - 1], effective_target));
        let any_below_floor = min_y.is_some_and(|fy| joints[1..n].iter().any(|p| p[1] < fy));
        if !any_below_floor && current_err <= config.tolerance {
            converged = true;
            iterations = iter;
            break;
        }
        iterations = iter + 1;

        for j in (0..bone_count).rev() {
            let pivot = joints[j];
            let to_eff = v3_sub(joints[n - 1], pivot);
            let to_tgt = v3_sub(effective_target, pivot);
            let eff_len = v3_len(to_eff);
            let tgt_len = v3_len(to_tgt);
            if eff_len <= VEC_EPS || tgt_len <= VEC_EPS {
                continue;
            }
            let u = v3_scale(to_eff, 1.0 / eff_len);
            let v = v3_scale(to_tgt, 1.0 / tgt_len);
            let dot = v3_dot(u, v).clamp(-1.0, 1.0);
            let raw_angle = dot.acos();
            if raw_angle <= 1e-5 {
                continue;
            }

            let cross = v3_cross(u, v);
            let axis = if v3_len(cross) > VEC_EPS {
                v3_normalize_or(cross, any_orthogonal_unit(u))
            } else {
                any_orthogonal_unit(u)
            };
            let step_angle = (raw_angle * config.damping).min(config.max_step_angle_rad);

            for joint in &mut joints[(j + 1)..n] {
                let rel = v3_sub(*joint, pivot);
                *joint = v3_add(pivot, rodrigues_rotate(rel, axis, step_angle));
            }

            // 각 관절의 해부학적 굴곡 원뿔 한계 보정
            let parent_dir = if j == 0 {
                rest_root_dir
            } else {
                v3_normalize_or(v3_sub(joints[j], joints[j - 1]), rest_root_dir)
            };
            let child_dir = v3_normalize_or(v3_sub(joints[j + 1], pivot), parent_dir);
            let bend = v3_dot(parent_dir, child_dir).clamp(-1.0, 1.0).acos();
            if bend > config.max_joint_bend_rad {
                let excess = bend - config.max_joint_bend_rad;
                let back_cross = v3_cross(child_dir, parent_dir);
                let back_axis = if v3_len(back_cross) > VEC_EPS {
                    v3_normalize_or(back_cross, any_orthogonal_unit(child_dir))
                } else {
                    any_orthogonal_unit(child_dir)
                };
                for joint in &mut joints[(j + 1)..n] {
                    let rel = v3_sub(*joint, pivot);
                    *joint = v3_add(pivot, rodrigues_rotate(rel, back_axis, excess));
                }
            }
        }

        // 뼈 길이 불변량 + 선택적 바닥 평면 여유 높이 동시 투영
        floor_clamped_joints = 0;
        for i in 0..bone_count {
            let (next_pos, clamped) =
                enforce_bone_length_and_floor(joints[i], joints[i + 1], bone_lengths[i], min_y);
            joints[i + 1] = next_pos;
            if clamped {
                floor_clamped_joints += 1;
            }
        }

        if v3_len(v3_sub(joints[n - 1], effective_target)) <= config.tolerance {
            converged = true;
            break;
        }
    }

    let mut max_bone_length_error = 0.0_f32;
    for i in 0..bone_count {
        let len = v3_len(v3_sub(joints[i + 1], joints[i]));
        let err = (len - bone_lengths[i]).abs();
        if err > max_bone_length_error {
            max_bone_length_error = err;
        }
    }
    let target_error = v3_len(v3_sub(joints[n - 1], effective_target));

    Ok(CcdChainResult {
        iterations,
        converged,
        target_error,
        max_bone_length_error,
        floor_clamped_joints,
    })
}
