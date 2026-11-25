use super::*;

#[test]
fn fabrik_single_finger_reaches_anatomical_grip_target_with_exact_bones() {
    let bones = [0.042_f32, 0.028, 0.019];
    let mut j = [
        [0.0, 0.0, 0.0],
        [0.0, 0.0, 0.042],
        [0.0, 0.0, 0.070],
        [0.0, 0.0, 0.089],
    ];
    let res = solve_finger_fabrik_chain(
        &mut j,
        bones,
        [0.005, -0.045, 0.048],
        &FingerFabrikConfig::default(),
    )
    .expect("ik ok");
    assert!(
        res.reachable && res.converged,
        "목표 도달 실패: dist={}",
        res.target_distance
    );
    assert!(res.target_distance <= 1e-4 && res.max_bone_length_error <= 1e-4);
    assert_eq!(j[0], [0.0, 0.0, 0.0]);
    assert!(res.joint_flexion_rad[1] >= 0.0 && res.joint_flexion_rad[2] >= 0.0);
}

#[test]
fn fabrik_prevents_hyperextension_for_dorsal_back_of_hand_targets() {
    let bones = [0.040_f32, 0.025, 0.018];
    let mut j = [
        [0.0; 3],
        [0.0, 0.0, 0.040],
        [0.0, 0.0, 0.065],
        [0.0, 0.0, 0.083],
    ];
    let cfg = FingerFabrikConfig::default();
    let res =
        solve_finger_fabrik_chain(&mut j, bones, [0.0, 0.065, 0.020], &cfg).expect("dorsal ok");
    assert!(res.max_bone_length_error <= 1e-4);
    assert!(res.joint_flexion_rad[0] >= -cfg.limits.mcp_max_extension_rad - 1e-4);
    assert!(res.joint_flexion_rad[1] >= 0.0 && res.joint_flexion_rad[2] >= 0.0 && j[3][1] < 0.025);
}

#[test]
fn fabrik_enforces_max_flexion_and_mcp_splay_limits() {
    let limits = FingerAngleLimits {
        mcp_max_flexion_rad: 75.0_f32.to_radians(),
        mcp_max_extension_rad: 10.0_f32.to_radians(),
        mcp_max_splay_rad: 15.0_f32.to_radians(),
        pip_max_flexion_rad: 95.0_f32.to_radians(),
        dip_max_flexion_rad: 70.0_f32.to_radians(),
    };
    let cfg = FingerFabrikConfig {
        limits,
        ..Default::default()
    };
    let mut j = [
        [0.0; 3],
        [0.0, 0.0, 0.040],
        [0.0, 0.0, 0.066],
        [0.0, 0.0, 0.084],
    ];
    let res = solve_finger_fabrik_chain(&mut j, [0.040, 0.026, 0.018], [0.08, -0.04, -0.05], &cfg)
        .expect("lim ok");
    assert!(res.max_bone_length_error <= 1e-4);
    assert!(res.mcp_splay_rad.abs() <= limits.mcp_max_splay_rad + 1e-4);
    assert!(res.joint_flexion_rad[0] <= limits.mcp_max_flexion_rad + 1e-4);
    assert!(res.joint_flexion_rad[1] <= limits.pip_max_flexion_rad + 1e-4);
    assert!(res.joint_flexion_rad[2] <= limits.dip_max_flexion_rad + 1e-4);
}

#[test]
fn fabrik_unreachable_far_target_converges_to_smooth_full_extension() {
    let bones = [0.045_f32, 0.030, 0.020];
    let total_len = bones[0] + bones[1] + bones[2];
    let cfg = FingerFabrikConfig::default();
    for scale in [10.0_f32, 1_000.0_f32] {
        let mut j = [
            [0.0; 3],
            [0.0, -0.02, 0.03],
            [0.0, -0.05, 0.03],
            [0.0, -0.06, 0.01],
        ];
        let target = [0.05 * scale, -0.30 * scale, 0.95 * scale];
        let res = solve_finger_fabrik_chain(&mut j, bones, target, &cfg).expect("far ok");
        assert!(!res.reachable && res.max_bone_length_error <= 1e-4);
        assert!(res.joint_flexion_rad[1].abs() < 1e-4 && res.joint_flexion_rad[2].abs() < 1e-4);
        let tip_len = dist3(j[0], j[3]);
        assert!((tip_len - total_len).abs() < 1e-4);
        let t_len = dist3([0.0; 3], target);
        let cos_align =
            (j[3][0] * target[0] + j[3][1] * target[1] + j[3][2] * target[2]) / (tip_len * t_len);
        assert!(cos_align > 0.9999, "정렬 오차: {cos_align}");
        assert!(j.iter().all(|p| p.iter().all(|v| v.is_finite())));
    }
}

#[test]
fn fabrik_handles_collinear_and_zero_distance_root_targets_without_singularity() {
    let bones = [0.040_f32, 0.030, 0.020];
    let cfg = FingerFabrikConfig::default();
    let mut j_col = [
        [0.0; 3],
        [0.0, 0.0, 0.040],
        [0.0, 0.0, 0.070],
        [0.0, 0.0, 0.090],
    ];
    let r_col = solve_finger_fabrik_chain(&mut j_col, bones, [0.0, 0.0, 0.080], &cfg)
        .expect("collinear ok");
    assert!(
        r_col.max_bone_length_error <= 1e-4 && r_col.converged,
        "특이점 탈출 실패: dist={}",
        r_col.target_distance
    );
    assert!(r_col.joint_flexion_rad[1] > 0.05);

    let mut j_zero = [
        [0.1, 0.2, 0.3],
        [0.1, 0.2, 0.34],
        [0.1, 0.2, 0.37],
        [0.1, 0.2, 0.39],
    ];
    let r_zero =
        solve_finger_fabrik_chain(&mut j_zero, bones, [0.1, 0.2, 0.3], &cfg).expect("zero ok");
    assert!(
        r_zero.max_bone_length_error <= 1e-4
            && j_zero.iter().all(|p| p.iter().all(|v| v.is_finite()))
    );
}

#[test]
fn fabrik_full_15_joint_five_finger_hand_grips_3d_cylinder_prop() {
    let bones: [[f32; 3]; HAND_FINGER_COUNT] = [
        [0.036, 0.028, 0.022],
        [0.042, 0.026, 0.018],
        [0.046, 0.029, 0.019],
        [0.043, 0.027, 0.018],
        [0.035, 0.021, 0.016],
    ];
    let roots: [[f32; 3]; HAND_FINGER_COUNT] = [
        [-0.040, -0.015, 0.025],
        [-0.028, 0.0, 0.085],
        [-0.008, 0.0, 0.090],
        [0.012, 0.0, 0.086],
        [0.030, 0.0, 0.078],
    ];
    let mut hand = [[[0.0_f32; 3]; 4]; HAND_FINGER_COUNT];
    for f in 0..HAND_FINGER_COUNT {
        let r = roots[f];
        hand[f] = [
            r,
            [r[0], r[1], r[2] + bones[f][0]],
            [r[0], r[1], r[2] + bones[f][0] + bones[f][1]],
            [r[0], r[1], r[2] + bones[f][0] + bones[f][1] + bones[f][2]],
        ];
    }
    let mut configs = [FingerFabrikConfig::default(); HAND_FINGER_COUNT];
    configs[0].palm_forward = [0.6, -0.2, 0.8];
    configs[0].flexion_normal = [0.7, -0.7, -0.1];
    let targets: [[f32; 3]; HAND_FINGER_COUNT] = [
        [0.005, -0.045, 0.075],
        [-0.026, -0.042, 0.130],
        [-0.007, -0.048, 0.140],
        [0.013, -0.044, 0.132],
        [0.029, -0.036, 0.116],
    ];
    let res =
        solve_hand_fabrik_15joints(&mut hand, &bones, &targets, &configs).expect("15-joint ok");
    assert_eq!(res.solved_joints, HAND_TOTAL_JOINTS);
    assert_eq!(HAND_TOTAL_JOINTS, 15);
    assert!(res.max_bone_length_error <= 1e-4);
    for (f, fr) in res.fingers.iter().enumerate() {
        assert!(
            fr.converged,
            "손가락 {f} 미수렴: dist={}",
            fr.target_distance
        );
        assert!(fr.joint_flexion_rad[1] >= 0.0 && fr.joint_flexion_rad[2] >= 0.0);
    }
}

#[test]
fn fabrik_sanitizes_corrupted_initial_pose_and_stays_deterministic() {
    let (bones, target, cfg) = (
        [0.04, 0.03, 0.02],
        [0.0, -0.04, 0.05],
        FingerFabrikConfig::default(),
    );
    let mut j1 = [
        [0.0; 3],
        [f32::NAN, 0.0, 0.0],
        [0.0, f32::INFINITY, 0.0],
        [0.0, 0.0, f32::NAN],
    ];
    let mut j2 = j1;
    let r1 = solve_finger_fabrik_chain(&mut j1, bones, target, &cfg).expect("recover ok");
    let r2 = solve_finger_fabrik_chain(&mut j2, bones, target, &cfg).expect("repeat ok");
    assert_eq!((j1, r1), (j2, r2));
    assert!(r1.converged && r1.max_bone_length_error <= 1e-4);
}

#[test]
fn fabrik_rejects_invalid_bone_lengths_targets_and_config() {
    let mut j = [
        [0.0; 3],
        [0.0, 0.0, 0.04],
        [0.0, 0.0, 0.07],
        [0.0, 0.0, 0.09],
    ];
    let cfg = FingerFabrikConfig::default();
    assert_eq!(
        solve_finger_fabrik_chain(&mut j, [0.04, 0.0, 0.02], [0.0, -0.02, 0.05], &cfg),
        Err(DrawingCoreError::InvalidParameter {
            name: "bone_lengths"
        })
    );
    assert_eq!(
        solve_finger_fabrik_chain(&mut j, [0.04, 0.03, 0.02], [f32::NAN, 0.0, 0.0], &cfg),
        Err(DrawingCoreError::InvalidParameter { name: "target" })
    );
    assert_eq!(
        solve_finger_fabrik_chain(
            &mut j,
            [0.04, 0.03, 0.02],
            [0.0, -0.02, 0.05],
            &FingerFabrikConfig {
                palm_forward: [0.0, 0.0, 1.0],
                flexion_normal: [0.0, 0.0, -1.0],
                ..cfg
            }
        ),
        Err(DrawingCoreError::InvalidParameter {
            name: "flexion_normal"
        })
    );
    assert_eq!(
        solve_finger_fabrik_chain(
            &mut j,
            [0.04, 0.03, 0.02],
            [0.0, -0.02, 0.05],
            &FingerFabrikConfig {
                max_iterations: 0,
                ..cfg
            }
        ),
        Err(DrawingCoreError::InvalidParameter {
            name: "max_iterations"
        })
    );
}

// ============================================================================
// 3. 가상 스튜디오 공간 음향 Foley 2차 Biquad + -24 LUFS 리미터 DSP 테스트 (8건)
// ============================================================================
