use super::*;

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
fn v3_norm_or(a: [f32; 3], fb: [f32; 3]) -> [f32; 3] {
    let l = v3_len(a);
    if l.is_finite() && l > VEC_EPS {
        v3_scale(a, 1.0 / l)
    } else {
        fb
    }
}

/// 해부학적 손가락 관절 각도 제한(라디안, PIP/DIP 과신전 0 rad 차단).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FingerAngleLimits {
    pub mcp_max_flexion_rad: f32,
    pub mcp_max_extension_rad: f32,
    pub mcp_max_splay_rad: f32,
    pub pip_max_flexion_rad: f32,
    pub dip_max_flexion_rad: f32,
}

impl Default for FingerAngleLimits {
    fn default() -> Self {
        Self {
            mcp_max_flexion_rad: 90.0_f32.to_radians(),
            mcp_max_extension_rad: 15.0_f32.to_radians(),
            mcp_max_splay_rad: 20.0_f32.to_radians(),
            pip_max_flexion_rad: 105.0_f32.to_radians(),
            dip_max_flexion_rad: 80.0_f32.to_radians(),
        }
    }
}

/// 3관절 손가락 FABRIK 솔버 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FingerFabrikConfig {
    pub palm_forward: [f32; 3],
    pub flexion_normal: [f32; 3],
    pub limits: FingerAngleLimits,
    pub tolerance: f32,
    pub max_iterations: u32,
}

impl Default for FingerFabrikConfig {
    fn default() -> Self {
        Self {
            palm_forward: [0.0, 0.0, 1.0],
            flexion_normal: [0.0, -1.0, 0.0],
            limits: FingerAngleLimits::default(),
            tolerance: 1e-4,
            max_iterations: 24,
        }
    }
}

/// 단일 3관절 손가락 FABRIK 수렴 결과.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct FingerIkResult {
    pub iterations: u32,
    pub target_distance: f32,
    pub reachable: bool,
    pub converged: bool,
    pub max_bone_length_error: f32,
    pub joint_flexion_rad: [f32; FINGER_JOINT_COUNT],
    pub mcp_splay_rad: f32,
}

/// 5손가락 × 3관절(총 15관절) 3D 손 FABRIK 통합 결과.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct HandIkResult {
    pub solved_joints: usize,
    pub fingers: [FingerIkResult; HAND_FINGER_COUNT],
    pub max_bone_length_error: f32,
    pub max_target_distance: f32,
}

type FingerBasis = ([f32; 3], [f32; 3], [f32; 3]);

#[inline]
fn validate_finger_config(cfg: &FingerFabrikConfig) -> Result<FingerBasis, DrawingCoreError> {
    if !cfg.palm_forward.iter().copied().all(bounded_scene) || v3_len(cfg.palm_forward) <= VEC_EPS {
        return Err(DrawingCoreError::InvalidParameter {
            name: "palm_forward",
        });
    }
    if !cfg.flexion_normal.iter().copied().all(bounded_scene)
        || v3_len(cfg.flexion_normal) <= VEC_EPS
    {
        return Err(DrawingCoreError::InvalidParameter {
            name: "flexion_normal",
        });
    }
    let fwd = v3_norm_or(cfg.palm_forward, [0.0, 0.0, 1.0]);
    let flex_proj = v3_sub(
        cfg.flexion_normal,
        v3_scale(fwd, v3_dot(cfg.flexion_normal, fwd)),
    );
    if v3_len(flex_proj) <= VEC_EPS {
        return Err(DrawingCoreError::InvalidParameter {
            name: "flexion_normal",
        });
    }
    let flex = v3_norm_or(flex_proj, [0.0, -1.0, 0.0]);
    let side = v3_norm_or(v3_cross(fwd, flex), [1.0, 0.0, 0.0]);
    let l = &cfg.limits;
    let ok = |v: f32, hi: f32| v.is_finite() && v >= 0.0 && v <= hi;
    if !ok(l.mcp_max_flexion_rad, PI)
        || !ok(l.mcp_max_extension_rad, FRAC_PI_2)
        || !ok(l.mcp_max_splay_rad, FRAC_PI_2 - 0.01)
        || !ok(l.pip_max_flexion_rad, PI)
        || !ok(l.dip_max_flexion_rad, PI)
    {
        return Err(DrawingCoreError::InvalidParameter { name: "limits" });
    }
    if !cfg.tolerance.is_finite() || cfg.tolerance <= 0.0 {
        return Err(DrawingCoreError::InvalidParameter { name: "tolerance" });
    }
    if cfg.max_iterations == 0 || cfg.max_iterations > 128 {
        return Err(DrawingCoreError::InvalidParameter {
            name: "max_iterations",
        });
    }
    Ok((fwd, flex, side))
}

#[inline]
fn fk_2d(angles: [f32; 3], bones: [f32; 3]) -> [[f32; 2]; 4] {
    let (s0, c0) = angles[0].sin_cos();
    let p1 = [bones[0] * c0, bones[0] * s0];
    let a1 = angles[0] + angles[1];
    let (s1, c1) = a1.sin_cos();
    let p2 = [p1[0] + bones[1] * c1, p1[1] + bones[1] * s1];
    let (s2, c2) = (a1 + angles[2]).sin_cos();
    [
        [0.0, 0.0],
        p1,
        p2,
        [p2[0] + bones[2] * c2, p2[1] + bones[2] * s2],
    ]
}

#[inline]
fn backward_2d_constrained(
    pts: &mut [[f32; 2]; 4],
    bones: [f32; 3],
    lim: &FingerAngleLimits,
) -> [f32; 3] {
    let t0 = if pts[1][0].abs() > VEC_EPS || pts[1][1].abs() > VEC_EPS {
        pts[1][1].atan2(pts[1][0])
    } else {
        0.0
    }
    .clamp(-lim.mcp_max_extension_rad, lim.mcp_max_flexion_rad);
    let p1 = [bones[0] * t0.cos(), bones[0] * t0.sin()];
    let (d1u, d1v) = (pts[2][0] - p1[0], pts[2][1] - p1[1]);
    let t1 = if d1u.abs() > VEC_EPS || d1v.abs() > VEC_EPS {
        wrap_angle_pi(d1v.atan2(d1u) - t0).clamp(0.0, lim.pip_max_flexion_rad)
    } else {
        0.0
    };
    let phi1 = t0 + t1;
    let p2 = [p1[0] + bones[1] * phi1.cos(), p1[1] + bones[1] * phi1.sin()];
    let (d2u, d2v) = (pts[3][0] - p2[0], pts[3][1] - p2[1]);
    let t2 = if d2u.abs() > VEC_EPS || d2v.abs() > VEC_EPS {
        wrap_angle_pi(d2v.atan2(d2u) - phi1).clamp(0.0, lim.dip_max_flexion_rad)
    } else {
        0.0
    };
    let angles = [t0, t1, t2];
    *pts = fk_2d(angles, bones);
    angles
}

/// 관절 한계(DIP/PIP 포화) 교착을 해소하는 1-패스 해부학 제약 CCD 각도 보정.
#[inline]
fn polish_ccd_2d(
    angles: &mut [f32; 3],
    bones: [f32; 3],
    target: [f32; 2],
    lim: &FingerAngleLimits,
) -> [[f32; 2]; 4] {
    let mins = [-lim.mcp_max_extension_rad, 0.0, 0.0];
    let maxs = [
        lim.mcp_max_flexion_rad,
        lim.pip_max_flexion_rad,
        lim.dip_max_flexion_rad,
    ];
    let mut pts = fk_2d(*angles, bones);
    for j in (0..3).rev() {
        let (eu, ev) = (pts[3][0] - pts[j][0], pts[3][1] - pts[j][1]);
        let (tu, tv) = (target[0] - pts[j][0], target[1] - pts[j][1]);
        if eu.hypot(ev) > VEC_EPS && tu.hypot(tv) > VEC_EPS {
            angles[j] =
                (angles[j] + wrap_angle_pi(tv.atan2(tu) - ev.atan2(eu))).clamp(mins[j], maxs[j]);
            pts = fk_2d(*angles, bones);
        }
    }
    pts
}

#[inline]
fn rebuild_3d_finger(
    joints: &mut [[f32; 3]; 4],
    root: [f32; 3],
    fwd_s: [f32; 3],
    flex: [f32; 3],
    pts: &[[f32; 2]; 4],
    bones: [f32; 3],
) -> f32 {
    for i in 0..4 {
        joints[i] = v3_add(
            root,
            v3_add(v3_scale(fwd_s, pts[i][0]), v3_scale(flex, pts[i][1])),
        );
    }
    (0..3)
        .map(|i| (v3_len(v3_sub(joints[i + 1], joints[i])) - bones[i]).abs())
        .fold(0.0_f32, f32::max)
}

/// 3관절 단일 손가락 CPU IK. 루트·목표·기준축 절대값은 1e6 이하, 뼈 길이는 1e-6..=1e3이다.
/// reachable은 총 뼈 길이 기준이며 관절 제한 내 목표 도달 여부는 converged·target_distance로 확인한다.
pub fn solve_finger_fabrik_chain(
    joints: &mut [[f32; 3]; FINGER_POINT_COUNT],
    bone_lengths: [f32; FINGER_JOINT_COUNT],
    target: [f32; 3],
    config: &FingerFabrikConfig,
) -> Result<FingerIkResult, DrawingCoreError> {
    let (fwd, flex, side) = validate_finger_config(config)?;
    if !joints[0].iter().copied().all(bounded_scene) {
        return Err(DrawingCoreError::InvalidParameter { name: "joints" });
    }
    if !target.iter().copied().all(bounded_scene) {
        return Err(DrawingCoreError::InvalidParameter { name: "target" });
    }
    if !bone_lengths
        .iter()
        .all(|&l| l.is_finite() && (1.0e-6..=1.0e3).contains(&l))
    {
        return Err(DrawingCoreError::InvalidParameter {
            name: "bone_lengths",
        });
    }

    let root = joints[0];
    let total_len = bone_lengths[0] + bone_lengths[1] + bone_lengths[2];
    let to_target = v3_sub(target, root);
    let dist_3d = v3_len(to_target);

    // MCP 외전 평면 `span(fwd_splayed, flex)` 정렬
    let (tf, ts) = (v3_dot(to_target, fwd), v3_dot(to_target, side));
    let raw_splay = if tf.abs() > VEC_EPS || ts.abs() > VEC_EPS {
        if tf >= 0.0 {
            ts.atan2(tf)
        } else {
            (-ts).atan2(-tf)
        }
    } else {
        0.0
    };
    let splay = raw_splay.clamp(
        -config.limits.mcp_max_splay_rad,
        config.limits.mcp_max_splay_rad,
    );
    let (sin_s, cos_s) = splay.sin_cos();
    let fwd_s = v3_norm_or(v3_add(v3_scale(fwd, cos_s), v3_scale(side, sin_s)), fwd);
    let (tu, tv) = (v3_dot(to_target, fwd_s), v3_dot(to_target, flex));
    let dist_2d = tu.hypot(tv);

    // 도달 불가능 원거리 목표: 해부학적 제한 내 완전 신전 방향 매끄러운 수렴
    if dist_3d >= total_len || dist_2d >= total_len {
        let t0 = if dist_2d > VEC_EPS { tv.atan2(tu) } else { 0.0 }.clamp(
            -config.limits.mcp_max_extension_rad,
            config.limits.mcp_max_flexion_rad,
        );
        let p1 = [bone_lengths[0] * t0.cos(), bone_lengths[0] * t0.sin()];
        let t1 = wrap_angle_pi((tv - p1[1]).atan2(tu - p1[0]) - t0)
            .clamp(0.0, config.limits.pip_max_flexion_rad);
        let p2 = [
            p1[0] + bone_lengths[1] * (t0 + t1).cos(),
            p1[1] + bone_lengths[1] * (t0 + t1).sin(),
        ];
        let t2 = wrap_angle_pi((tv - p2[1]).atan2(tu - p2[0]) - (t0 + t1))
            .clamp(0.0, config.limits.dip_max_flexion_rad);
        let angles = [t0, t1, t2];
        let pts = fk_2d(angles, bone_lengths);
        let max_err = rebuild_3d_finger(joints, root, fwd_s, flex, &pts, bone_lengths);
        let tip_dist = v3_len(v3_sub(target, joints[3]));
        return Ok(FingerIkResult {
            iterations: 1,
            target_distance: tip_dist,
            reachable: false,
            converged: tip_dist <= config.tolerance,
            max_bone_length_error: max_err,
            joint_flexion_rad: angles,
            mcp_splay_rad: splay,
        });
    }

    // 도달 가능 영역: 등쪽 아치(Dorsal Arch) 시드 + FABRIK Forward/Backward + 제약 CCD 보정
    let (cu, cv) = if dist_2d > VEC_EPS {
        (tu / dist_2d, tv / dist_2d)
    } else {
        (1.0, 0.0)
    };
    let dorsal = [cv, -cu];
    let base_angle = if dist_2d > VEC_EPS { tv.atan2(tu) } else { 0.3 };
    let mut angles = [
        (base_angle - 0.35).clamp(
            -config.limits.mcp_max_extension_rad,
            config.limits.mcp_max_flexion_rad,
        ),
        (0.55_f32).min(config.limits.pip_max_flexion_rad),
        (0.35_f32).min(config.limits.dip_max_flexion_rad),
    ];
    let mut pts = fk_2d(angles, bone_lengths);

    let mut iterations = 0u32;
    for iter in 0..config.max_iterations {
        if (pts[3][0] - tu).hypot(pts[3][1] - tv) <= config.tolerance {
            break;
        }
        iterations = iter + 1;

        // Forward Reaching (Tip → Root) + 등쪽 반평면 보존 반사
        pts[3] = [tu, tv];
        for idx in (0..FINGER_JOINT_COUNT).rev() {
            let (du, dv) = (pts[idx][0] - pts[idx + 1][0], pts[idx][1] - pts[idx + 1][1]);
            let d = du.hypot(dv);
            let (ru, rv) = if d > VEC_EPS {
                (du / d, dv / d)
            } else {
                (-cu + 0.25 * dorsal[0], -cv + 0.25 * dorsal[1])
            };
            let rlen = ru.hypot(rv).max(VEC_EPS);
            let mut p = [
                pts[idx + 1][0] + (ru / rlen) * bone_lengths[idx],
                pts[idx + 1][1] + (rv / rlen) * bone_lengths[idx],
            ];
            if (idx == 1 || idx == 2) && dist_2d > VEC_EPS {
                let side_d = p[0] * dorsal[0] + p[1] * dorsal[1];
                if side_d < 0.0 {
                    p[0] -= 2.0 * side_d * dorsal[0];
                    p[1] -= 2.0 * side_d * dorsal[1];
                }
            }
            pts[idx] = p;
        }
        // Backward Reaching (Root → Tip) + 제약 CCD 1-패스로 관절 한계 교착 해소
        angles = backward_2d_constrained(&mut pts, bone_lengths, &config.limits);
        pts = polish_ccd_2d(&mut angles, bone_lengths, [tu, tv], &config.limits);
    }

    let max_err = rebuild_3d_finger(joints, root, fwd_s, flex, &pts, bone_lengths);
    let tip_dist = v3_len(v3_sub(target, joints[3]));
    Ok(FingerIkResult {
        iterations,
        target_distance: tip_dist,
        reachable: true,
        converged: tip_dist <= config.tolerance,
        max_bone_length_error: max_err,
        joint_flexion_rad: angles,
        mcp_splay_rad: splay,
    })
}

/// 5손가락 CPU IK. 다섯 솔버가 모두 성공한 뒤 좌표를 반영하며 오류이면 입력 손을 보존한다.
pub fn solve_hand_fabrik_15joints(
    hand_joints: &mut [[[f32; 3]; FINGER_POINT_COUNT]; HAND_FINGER_COUNT],
    bone_lengths: &[[f32; FINGER_JOINT_COUNT]; HAND_FINGER_COUNT],
    targets: &[[f32; 3]; HAND_FINGER_COUNT],
    configs: &[FingerFabrikConfig; HAND_FINGER_COUNT],
) -> Result<HandIkResult, DrawingCoreError> {
    let mut next_joints = *hand_joints;
    let mut out = HandIkResult {
        solved_joints: HAND_TOTAL_JOINTS,
        ..HandIkResult::default()
    };
    for f in 0..HAND_FINGER_COUNT {
        let res = solve_finger_fabrik_chain(
            &mut next_joints[f],
            bone_lengths[f],
            targets[f],
            &configs[f],
        )?;
        out.max_bone_length_error = out.max_bone_length_error.max(res.max_bone_length_error);
        out.max_target_distance = out.max_target_distance.max(res.target_distance);
        out.fingers[f] = res;
    }
    *hand_joints = next_joints;
    Ok(out)
}

// ============================================================================
// 3. Foley Biquad·피크 제한·비가중 에너지 추정 DSP
// ============================================================================
