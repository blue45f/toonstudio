//! Wave 58A 순수 Rust SIMD128 가상 스튜디오 스프링 물리 · 15관절 손 FABRIK IK · 공간 음향 Foley DSP 통합 테스트.
#![cfg(feature = "extended-3d")]

use std::f32::consts::PI;

use studio_wasm64_drawing_core::{
    render_foley_biquad_block, solve_finger_fabrik_chain, solve_hand_fabrik_15joints,
    step_verlet_spring_chains_soa, wasm_alloc, wasm_extended_3d_capabilities, wasm_free,
    wasm_render_foley_biquad_block, wasm_solve_finger_fabrik_chain,
    wasm_step_verlet_spring_chains_soa, DrawingCoreError, FingerAngleLimits, FingerFabrikConfig,
    FoleyBiquadState, FoleyDspConfig, FoleyFilterMode, SphereCollider, VerletSpringChainsSoa,
    VerletSpringConfig, AUDIOWORKLET_BLOCK_FRAMES, FABRIK_FINGER_FFI_PARAM_COUNT,
    FOLEY_DSP_FFI_PARAM_COUNT, FOLEY_DSP_FFI_STATE_LEN, FOLEY_PEAK_CEILING, FOLEY_TARGET_LUFS,
    HAND_FINGER_COUNT, HAND_TOTAL_JOINTS, VERLET_SPRING_FFI_PARAM_COUNT,
    WASM_EXTENDED_3D_CAPABILITIES,
};

fn dist3(a: [f32; 3], b: [f32; 3]) -> f32 {
    let (dx, dy, dz) = (a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    (dx * dx + dy * dy + dz * dz).sqrt()
}

fn make_sine(sr: f32, freq_hz: f32, amp: f32, frames: usize) -> Vec<f32> {
    (0..frames).map(|i| amp * (2.0 * PI * freq_hz * i as f32 / sr).sin()).collect()
}

fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() { 0.0 } else { (samples.iter().map(|&s| s * s).sum::<f32>() / samples.len() as f32).sqrt() }
}

// ============================================================================
// 1. 가상 스튜디오 2.5D/3D 스프링 머리카락·의상 베를레(Verlet) 물리 테스트 (9건)
// ============================================================================

#[test]
fn verlet_pinned_root_invariance_under_gravity_wind_and_collisions() {
    let (mut px, mut py, mut pz) = ([0.25; 5], [1.8, 1.6, 1.4, 1.2, 1.0], [-0.1; 5]);
    let (mut ox, mut oy, mut oz) = (px, py, pz);
    let (im, rl) = ([0.0, 1.0, 1.0, 1.0, 1.0], [0.0, 0.2, 0.2, 0.2, 0.2]);
    let colliders = [SphereCollider::new(0.25, 1.75, -0.10, 0.15)];
    let cfg = VerletSpringConfig { wind_xyz: [6.0, 1.5, -4.0], iterations: 6, ..Default::default() };
    for _ in 0..120 {
        let mut c = VerletSpringChainsSoa { pos_x: &mut px, pos_y: &mut py, pos_z: &mut pz, prev_x: &mut ox, prev_y: &mut oy, prev_z: &mut oz, inv_mass: &im, rest_len: &rl };
        let st = step_verlet_spring_chains_soa(&mut c, &colliders, &cfg).expect("step ok");
        assert_eq!(st.active_constraints, 4);
        assert_eq!((px[0], py[0], pz[0]), (0.25, 1.80, -0.10));
        assert_eq!((ox[0], oy[0], oz[0]), (0.25, 1.80, -0.10));
    }
    assert!(px[4] > 0.30 && pz[4] < -0.12);
}

#[test]
fn verlet_distance_constraints_converge_across_pbd_iterations() {
    let run = |iterations: u32| -> f32 {
        // 5링크 체인을 정지 길이의 1.5배로 늘린 뒤 단일 스텝 PBD 반복 수렴 잔차 비교
        let mut px: Vec<f32> = (0..6).map(|i| i as f32 * 0.30).collect();
        let (mut py, mut pz) = (vec![2.0_f32; 6], vec![0.0_f32; 6]);
        let (mut ox, mut oy, mut oz) = (px.clone(), py.clone(), pz.clone());
        let (im, rl) = ([0.0, 1.0, 1.0, 1.0, 1.0, 1.0], [0.0, 0.2, 0.2, 0.2, 0.2, 0.2]);
        let cfg = VerletSpringConfig { stiffness: 1.0, damping: 0.0, gravity_y: 0.0, iterations, ..Default::default() };
        let mut c = VerletSpringChainsSoa { pos_x: &mut px, pos_y: &mut py, pos_z: &mut pz, prev_x: &mut ox, prev_y: &mut oy, prev_z: &mut oz, inv_mass: &im, rest_len: &rl };
        step_verlet_spring_chains_soa(&mut c, &[], &cfg).expect("pbd ok").max_constraint_error
    };
    let (e1, e4, e8) = (run(1), run(4), run(8));
    assert!(e4 < e1, "4회({e4}) < 1회({e1})");
    assert!(e8 < e4, "8회({e8}) < 4회({e4})");
    assert!(e8 < 0.05, "8회 수렴 오차 과다: {e8}");
}

#[test]
fn verlet_energy_decays_monotonically_without_explosion() {
    let (mut px, mut py, mut pz) = ([0.0, 0.5], [2.0, 2.0], [0.0, 0.0]);
    let (mut ox, mut oy, mut oz) = ([0.0, 0.5], [2.0, 2.06], [0.0, 0.0]);
    let (im, rl) = ([0.0, 1.0], [0.0, 0.5]);
    let cfg = VerletSpringConfig { stiffness: 1.0, damping: 0.06, gravity_y: 0.0, iterations: 4, ..Default::default() };
    let (mut prev_ke, mut first_ke, mut last_ke) = (f32::INFINITY, 0.0_f32, 0.0_f32);
    for step in 0..120 {
        let mut c = VerletSpringChainsSoa { pos_x: &mut px, pos_y: &mut py, pos_z: &mut pz, prev_x: &mut ox, prev_y: &mut oy, prev_z: &mut oz, inv_mass: &im, rest_len: &rl };
        let st = step_verlet_spring_chains_soa(&mut c, &[], &cfg).expect("energy ok");
        assert!(st.total_kinetic_energy.is_finite());
        if step == 0 { first_ke = st.total_kinetic_energy; assert!(first_ke > 0.1); }
        else { assert!(st.total_kinetic_energy <= prev_ke + 1e-5, "step={step}: {} > {}", st.total_kinetic_energy, prev_ke); }
        prev_ke = st.total_kinetic_energy;
        last_ke = st.total_kinetic_energy;
    }
    assert!(last_ke < first_ke * 0.01);
}

#[test]
fn verlet_multi_chain_hair_independence_and_4wide_simd_tails() {
    for count in [1usize, 3, 4, 5, 13, 21] {
        let mut px: Vec<f32> = (0..count).map(|i| (i / 3) as f32 * 2.0).collect();
        let mut py: Vec<f32> = (0..count).map(|i| 3.0 - (i % 3) as f32 * 0.25).collect();
        let mut pz = vec![0.0_f32; count];
        let (mut ox, mut oy, mut oz) = (px.clone(), py.clone(), pz.clone());
        let im: Vec<f32> = (0..count).map(|i| if i % 3 == 0 { 0.0 } else { 1.0 }).collect();
        let rl: Vec<f32> = (0..count).map(|i| if i % 3 == 0 { 0.0 } else { 0.25 }).collect();
        let cfg = VerletSpringConfig { wind_xyz: [2.0, 0.0, 0.5], iterations: 5, ..Default::default() };
        for _ in 0..20 {
            let mut c = VerletSpringChainsSoa { pos_x: &mut px, pos_y: &mut py, pos_z: &mut pz, prev_x: &mut ox, prev_y: &mut oy, prev_z: &mut oz, inv_mass: &im, rest_len: &rl };
            step_verlet_spring_chains_soa(&mut c, &[], &cfg).expect("multi ok");
        }
        for i in 0..count {
            assert!(px[i].is_finite() && py[i].is_finite() && pz[i].is_finite());
            if i % 3 == 0 { assert_eq!((px[i], py[i]), ((i / 3) as f32 * 2.0, 3.0)); }
            else { assert!((dist3([px[i], py[i], pz[i]], [px[i - 1], py[i - 1], pz[i - 1]]) - 0.25).abs() < 1e-2); }
        }
    }
}

#[test]
fn verlet_sphere_collider_pushes_hair_outside_head_and_shoulders() {
    let (mut px, mut py, mut pz) = ([0.0, 0.02, 0.03, 0.04, 0.05], [1.80, 1.55, 1.30, 1.05, 0.80], [0.0; 5]);
    let (mut ox, mut oy, mut oz) = (px, py, pz);
    let (im, rl) = ([0.0, 1.0, 1.0, 1.0, 1.0], [0.0, 0.25, 0.25, 0.25, 0.25]);
    let cols = [
        SphereCollider::new(0.0, 1.50, 0.0, 0.14),
        SphereCollider::new(0.18, 1.15, 0.0, 0.12),
        SphereCollider::new(-0.18, 1.15, 0.0, 0.12),
    ];
    let cfg = VerletSpringConfig { particle_radius: 0.02, iterations: 6, damping: 0.08, ..Default::default() };
    let mut hits = 0usize;
    for _ in 0..40 {
        let mut c = VerletSpringChainsSoa { pos_x: &mut px, pos_y: &mut py, pos_z: &mut pz, prev_x: &mut ox, prev_y: &mut oy, prev_z: &mut oz, inv_mass: &im, rest_len: &rl };
        hits += step_verlet_spring_chains_soa(&mut c, &cols, &cfg).expect("col ok").sphere_collisions;
    }
    assert!(hits > 0);
    for i in 1..5 {
        for col in &cols {
            let d = dist3([px[i], py[i], pz[i]], [col.center_x, col.center_y, col.center_z]);
            assert!(d >= col.radius + cfg.particle_radius - 1e-3, "입자 {i} 침투 d={d}");
        }
    }
}

#[test]
fn verlet_floor_plane_prevents_penetration_and_bounces_with_restitution() {
    let run_drop = |restitution: f32| -> (f32, f32, usize) {
        let (mut px, mut py, mut pz, mut ox, mut oy, mut oz) = ([0.0], [0.40], [0.0], [0.0], [0.40], [0.0]);
        let cfg = VerletSpringConfig { damping: 0.0, floor_restitution: restitution, particle_radius: 0.02, iterations: 2, ..Default::default() };
        let (mut min_y, mut peak, mut bounced, mut hits) = (f32::INFINITY, 0.0_f32, false, 0usize);
        for _ in 0..60 {
            let mut c = VerletSpringChainsSoa { pos_x: &mut px, pos_y: &mut py, pos_z: &mut pz, prev_x: &mut ox, prev_y: &mut oy, prev_z: &mut oz, inv_mass: &[1.0], rest_len: &[0.0] };
            let st = step_verlet_spring_chains_soa(&mut c, &[], &cfg).expect("drop ok");
            min_y = min_y.min(py[0]);
            if st.floor_collisions > 0 { hits += st.floor_collisions; bounced = true; }
            if bounced { peak = peak.max(py[0]); }
        }
        (min_y, peak, hits)
    };
    let (min_b, peak_b, hits_b) = run_drop(0.75);
    let (min_d, peak_d, hits_d) = run_drop(0.0);
    assert!(min_b >= 0.02 - 1e-6 && min_d >= 0.02 - 1e-6);
    assert!(hits_b > 0 && hits_d > 0);
    assert!(peak_b > 0.15, "반발 상승 부족: {peak_b}");
    assert!((peak_d - 0.02).abs() < 1e-4, "무반발 정지 실패: {peak_d}");
}

#[test]
fn verlet_wind_deflects_cloth_chain_in_3d_direction() {
    let (mut px, mut py, mut pz) = ([0.0; 5], [2.0, 1.8, 1.6, 1.4, 1.2], [0.0; 5]);
    let (mut ox, mut oy, mut oz) = (px, py, pz);
    let (im, rl) = ([0.0, 1.0, 1.0, 1.0, 1.0], [0.0, 0.2, 0.2, 0.2, 0.2]);
    let cfg = VerletSpringConfig { stiffness: 1.0, wind_xyz: [8.0, 0.0, -4.0], damping: 0.08, iterations: 8, ..Default::default() };
    for _ in 0..90 {
        let mut c = VerletSpringChainsSoa { pos_x: &mut px, pos_y: &mut py, pos_z: &mut pz, prev_x: &mut ox, prev_y: &mut oy, prev_z: &mut oz, inv_mass: &im, rest_len: &rl };
        step_verlet_spring_chains_soa(&mut c, &[], &cfg).expect("wind ok");
    }
    assert!(px[4] > 0.35 && pz[4] < -0.15 && (px[4] / -pz[4] - 2.0).abs() < 0.25);
    for i in 1..5 {
        assert!((dist3([px[i], py[i], pz[i]], [px[i - 1], py[i - 1], pz[i - 1]]) - 0.2).abs() < 2e-3);
    }
}

#[test]
fn verlet_sanitizes_nan_inf_inputs_and_coincident_particles_safely() {
    let (mut px, mut py, mut pz) = ([0.0, f32::NAN, 0.0, 0.0], [1.5, 1.5, f32::INFINITY, 1.5], [0.0, 0.0, 0.0, f32::NEG_INFINITY]);
    let (mut ox, mut oy, mut oz) = ([0.0, f32::NAN, 0.0, 0.0], [1.5; 4], [0.0; 4]);
    let (im, rl) = ([0.0, 1.0, f32::NAN, 1.0], [0.0, 0.25, 0.25, 0.25]);
    let bad_cols = [SphereCollider::new(f32::NAN, 0.0, 0.0, 0.5), SphereCollider::new(0.0, 0.0, 0.0, -1.0)];
    let mut c = VerletSpringChainsSoa { pos_x: &mut px, pos_y: &mut py, pos_z: &mut pz, prev_x: &mut ox, prev_y: &mut oy, prev_z: &mut oz, inv_mass: &im, rest_len: &rl };
    let st = step_verlet_spring_chains_soa(&mut c, &bad_cols, &VerletSpringConfig::default()).expect("nan ok");
    assert_eq!(st.sanitized_particles, 3);
    assert!(st.total_kinetic_energy.is_finite());
    for i in 0..4 {
        assert!(px[i].is_finite() && py[i].is_finite() && pz[i].is_finite());
        assert!(ox[i].is_finite() && oy[i].is_finite() && oz[i].is_finite());
    }
}

#[test]
fn verlet_rejects_mismatched_slices_and_invalid_config() {
    let (mut px, mut py_bad, mut py, mut pz) = ([0.0; 2], [0.0; 1], [0.0; 2], [0.0; 2]);
    let (mut ox, mut oy, mut oz) = ([0.0; 2], [0.0; 2], [0.0; 2]);
    let (im, rl) = ([0.0, 1.0], [0.0, 0.2]);
    let mut c_bad = VerletSpringChainsSoa { pos_x: &mut px, pos_y: &mut py_bad, pos_z: &mut pz, prev_x: &mut ox, prev_y: &mut oy, prev_z: &mut oz, inv_mass: &im, rest_len: &rl };
    assert_eq!(step_verlet_spring_chains_soa(&mut c_bad, &[], &VerletSpringConfig::default()), Err(DrawingCoreError::BufferLengthMismatch { expected: 2, actual: 1 }));
    let mut c = VerletSpringChainsSoa { pos_x: &mut px, pos_y: &mut py, pos_z: &mut pz, prev_x: &mut ox, prev_y: &mut oy, prev_z: &mut oz, inv_mass: &im, rest_len: &rl };
    for (cfg, name) in [
        (VerletSpringConfig { iterations: 0, ..Default::default() }, "iterations"),
        (VerletSpringConfig { iterations: 9, ..Default::default() }, "iterations"),
        (VerletSpringConfig { dt: 0.0, ..Default::default() }, "dt"),
        (VerletSpringConfig { stiffness: 1.5, ..Default::default() }, "stiffness"),
        (VerletSpringConfig { damping: -0.1, ..Default::default() }, "damping"),
    ] {
        assert_eq!(step_verlet_spring_chains_soa(&mut c, &[], &cfg), Err(DrawingCoreError::InvalidParameter { name }));
    }
}

// ============================================================================
// 2. 15관절 3D 손가락 FABRIK IK 솔버 테스트 (8건)
// ============================================================================

#[test]
fn fabrik_single_finger_reaches_anatomical_grip_target_with_exact_bones() {
    let bones = [0.042_f32, 0.028, 0.019];
    let mut j = [[0.0, 0.0, 0.0], [0.0, 0.0, 0.042], [0.0, 0.0, 0.070], [0.0, 0.0, 0.089]];
    let res = solve_finger_fabrik_chain(&mut j, bones, [0.005, -0.045, 0.048], &FingerFabrikConfig::default()).expect("ik ok");
    assert!(res.reachable && res.converged, "목표 도달 실패: dist={}", res.target_distance);
    assert!(res.target_distance <= 1e-4 && res.max_bone_length_error <= 1e-4);
    assert_eq!(j[0], [0.0, 0.0, 0.0]);
    assert!(res.joint_flexion_rad[1] >= 0.0 && res.joint_flexion_rad[2] >= 0.0);
}

#[test]
fn fabrik_prevents_hyperextension_for_dorsal_back_of_hand_targets() {
    let bones = [0.040_f32, 0.025, 0.018];
    let mut j = [[0.0; 3], [0.0, 0.0, 0.040], [0.0, 0.0, 0.065], [0.0, 0.0, 0.083]];
    let cfg = FingerFabrikConfig::default();
    let res = solve_finger_fabrik_chain(&mut j, bones, [0.0, 0.065, 0.020], &cfg).expect("dorsal ok");
    assert!(res.max_bone_length_error <= 1e-4);
    assert!(res.joint_flexion_rad[0] >= -cfg.limits.mcp_max_extension_rad - 1e-4);
    assert!(res.joint_flexion_rad[1] >= 0.0 && res.joint_flexion_rad[2] >= 0.0 && j[3][1] < 0.025);
}

#[test]
fn fabrik_enforces_max_flexion_and_mcp_splay_limits() {
    let limits = FingerAngleLimits {
        mcp_max_flexion_rad: 75.0_f32.to_radians(), mcp_max_extension_rad: 10.0_f32.to_radians(),
        mcp_max_splay_rad: 15.0_f32.to_radians(), pip_max_flexion_rad: 95.0_f32.to_radians(),
        dip_max_flexion_rad: 70.0_f32.to_radians(),
    };
    let cfg = FingerFabrikConfig { limits, ..Default::default() };
    let mut j = [[0.0; 3], [0.0, 0.0, 0.040], [0.0, 0.0, 0.066], [0.0, 0.0, 0.084]];
    let res = solve_finger_fabrik_chain(&mut j, [0.040, 0.026, 0.018], [0.08, -0.04, -0.05], &cfg).expect("lim ok");
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
        let mut j = [[0.0; 3], [0.0, -0.02, 0.03], [0.0, -0.05, 0.03], [0.0, -0.06, 0.01]];
        let target = [0.05 * scale, -0.30 * scale, 0.95 * scale];
        let res = solve_finger_fabrik_chain(&mut j, bones, target, &cfg).expect("far ok");
        assert!(!res.reachable && res.max_bone_length_error <= 1e-4);
        assert!(res.joint_flexion_rad[1].abs() < 1e-4 && res.joint_flexion_rad[2].abs() < 1e-4);
        let tip_len = dist3(j[0], j[3]);
        assert!((tip_len - total_len).abs() < 1e-4);
        let t_len = dist3([0.0; 3], target);
        let cos_align = (j[3][0] * target[0] + j[3][1] * target[1] + j[3][2] * target[2]) / (tip_len * t_len);
        assert!(cos_align > 0.9999, "정렬 오차: {cos_align}");
        assert!(j.iter().all(|p| p.iter().all(|v| v.is_finite())));
    }
}

#[test]
fn fabrik_handles_collinear_and_zero_distance_root_targets_without_singularity() {
    let bones = [0.040_f32, 0.030, 0.020];
    let cfg = FingerFabrikConfig::default();
    let mut j_col = [[0.0; 3], [0.0, 0.0, 0.040], [0.0, 0.0, 0.070], [0.0, 0.0, 0.090]];
    let r_col = solve_finger_fabrik_chain(&mut j_col, bones, [0.0, 0.0, 0.080], &cfg).expect("collinear ok");
    assert!(r_col.max_bone_length_error <= 1e-4 && r_col.converged, "특이점 탈출 실패: dist={}", r_col.target_distance);
    assert!(r_col.joint_flexion_rad[1] > 0.05);

    let mut j_zero = [[0.1, 0.2, 0.3], [0.1, 0.2, 0.34], [0.1, 0.2, 0.37], [0.1, 0.2, 0.39]];
    let r_zero = solve_finger_fabrik_chain(&mut j_zero, bones, [0.1, 0.2, 0.3], &cfg).expect("zero ok");
    assert!(r_zero.max_bone_length_error <= 1e-4 && j_zero.iter().all(|p| p.iter().all(|v| v.is_finite())));
}

#[test]
fn fabrik_full_15_joint_five_finger_hand_grips_3d_cylinder_prop() {
    let bones: [[f32; 3]; HAND_FINGER_COUNT] = [
        [0.036, 0.028, 0.022], [0.042, 0.026, 0.018], [0.046, 0.029, 0.019],
        [0.043, 0.027, 0.018], [0.035, 0.021, 0.016],
    ];
    let roots: [[f32; 3]; HAND_FINGER_COUNT] = [
        [-0.040, -0.015, 0.025], [-0.028, 0.0, 0.085], [-0.008, 0.0, 0.090],
        [0.012, 0.0, 0.086], [0.030, 0.0, 0.078],
    ];
    let mut hand = [[[0.0_f32; 3]; 4]; HAND_FINGER_COUNT];
    for f in 0..HAND_FINGER_COUNT {
        let r = roots[f];
        hand[f] = [r, [r[0], r[1], r[2] + bones[f][0]], [r[0], r[1], r[2] + bones[f][0] + bones[f][1]], [r[0], r[1], r[2] + bones[f][0] + bones[f][1] + bones[f][2]]];
    }
    let mut configs = [FingerFabrikConfig::default(); HAND_FINGER_COUNT];
    configs[0].palm_forward = [0.6, -0.2, 0.8];
    configs[0].flexion_normal = [0.7, -0.7, -0.1];
    let targets: [[f32; 3]; HAND_FINGER_COUNT] = [
        [0.005, -0.045, 0.075], [-0.026, -0.042, 0.130], [-0.007, -0.048, 0.140],
        [0.013, -0.044, 0.132], [0.029, -0.036, 0.116],
    ];
    let res = solve_hand_fabrik_15joints(&mut hand, &bones, &targets, &configs).expect("15-joint ok");
    assert_eq!(res.solved_joints, HAND_TOTAL_JOINTS);
    assert_eq!(HAND_TOTAL_JOINTS, 15);
    assert!(res.max_bone_length_error <= 1e-4);
    for (f, fr) in res.fingers.iter().enumerate() {
        assert!(fr.converged, "손가락 {f} 미수렴: dist={}", fr.target_distance);
        assert!(fr.joint_flexion_rad[1] >= 0.0 && fr.joint_flexion_rad[2] >= 0.0);
    }
}

#[test]
fn fabrik_sanitizes_corrupted_initial_pose_and_stays_deterministic() {
    let (bones, target, cfg) = ([0.04, 0.03, 0.02], [0.0, -0.04, 0.05], FingerFabrikConfig::default());
    let mut j1 = [[0.0; 3], [f32::NAN, 0.0, 0.0], [0.0, f32::INFINITY, 0.0], [0.0, 0.0, f32::NAN]];
    let mut j2 = j1;
    let r1 = solve_finger_fabrik_chain(&mut j1, bones, target, &cfg).expect("recover ok");
    let r2 = solve_finger_fabrik_chain(&mut j2, bones, target, &cfg).expect("repeat ok");
    assert_eq!((j1, r1), (j2, r2));
    assert!(r1.converged && r1.max_bone_length_error <= 1e-4);
}

#[test]
fn fabrik_rejects_invalid_bone_lengths_targets_and_config() {
    let mut j = [[0.0; 3], [0.0, 0.0, 0.04], [0.0, 0.0, 0.07], [0.0, 0.0, 0.09]];
    let cfg = FingerFabrikConfig::default();
    assert_eq!(solve_finger_fabrik_chain(&mut j, [0.04, 0.0, 0.02], [0.0, -0.02, 0.05], &cfg), Err(DrawingCoreError::InvalidParameter { name: "bone_lengths" }));
    assert_eq!(solve_finger_fabrik_chain(&mut j, [0.04, 0.03, 0.02], [f32::NAN, 0.0, 0.0], &cfg), Err(DrawingCoreError::InvalidParameter { name: "target" }));
    assert_eq!(solve_finger_fabrik_chain(&mut j, [0.04, 0.03, 0.02], [0.0, -0.02, 0.05], &FingerFabrikConfig { palm_forward: [0.0, 0.0, 1.0], flexion_normal: [0.0, 0.0, -1.0], ..cfg }), Err(DrawingCoreError::InvalidParameter { name: "flexion_normal" }));
    assert_eq!(solve_finger_fabrik_chain(&mut j, [0.04, 0.03, 0.02], [0.0, -0.02, 0.05], &FingerFabrikConfig { max_iterations: 0, ..cfg }), Err(DrawingCoreError::InvalidParameter { name: "max_iterations" }));
}

// ============================================================================
// 3. 가상 스튜디오 공간 음향 Foley 2차 Biquad + -24 LUFS 리미터 DSP 테스트 (8건)
// ============================================================================

#[test]
fn foley_lowpass_biquad_passes_low_freq_and_attenuates_high_freq() {
    let (sr, frames) = (48_000.0, 2048usize);
    let cfg = FoleyDspConfig { sample_rate: sr, mode: FoleyFilterMode::Lowpass, cutoff_hz: 800.0, pan: -1.0, ..Default::default() };
    let (low_in, hi_in) = (make_sine(sr, 150.0, 0.25, frames), make_sine(sr, 12_000.0, 0.25, frames));
    let (mut ll, mut rl, mut lh, mut rh) = (vec![0.0; frames], vec![0.0; frames], vec![0.0; frames], vec![0.0; frames]);
    render_foley_biquad_block(&low_in, &mut ll, &mut rl, &cfg, &mut FoleyBiquadState::new()).expect("lp low");
    render_foley_biquad_block(&hi_in, &mut lh, &mut rh, &cfg, &mut FoleyBiquadState::new()).expect("lp hi");
    assert!(rms(&ll[1024..]) / rms(&low_in[1024..]) > 0.90);
    assert!(rms(&lh[1024..]) / rms(&hi_in[1024..]) < 0.02);
}

#[test]
fn foley_bandpass_biquad_peaks_at_center_and_rejects_dc_and_nyquist() {
    let (sr, frames) = (48_000.0, 2048usize);
    let cfg = FoleyDspConfig { sample_rate: sr, mode: FoleyFilterMode::Bandpass, cutoff_hz: 2_000.0, q_factor: 2.0, pan: -1.0, ..Default::default() };
    let (dc_in, mid_in, hi_in) = (vec![0.3_f32; frames], make_sine(sr, 2_000.0, 0.3, frames), make_sine(sr, 16_000.0, 0.3, frames));
    let (mut ldc, mut rdc, mut lmid, mut rmid, mut lhi, mut rhi) = (vec![0.0; frames], vec![0.0; frames], vec![0.0; frames], vec![0.0; frames], vec![0.0; frames], vec![0.0; frames]);
    render_foley_biquad_block(&dc_in, &mut ldc, &mut rdc, &cfg, &mut FoleyBiquadState::new()).expect("bp dc");
    render_foley_biquad_block(&mid_in, &mut lmid, &mut rmid, &cfg, &mut FoleyBiquadState::new()).expect("bp mid");
    render_foley_biquad_block(&hi_in, &mut lhi, &mut rhi, &cfg, &mut FoleyBiquadState::new()).expect("bp hi");
    assert!((rms(&lmid[1024..]) / rms(&mid_in[1024..]) - 1.0).abs() < 0.05);
    assert!(rms(&ldc[1024..]) / rms(&dc_in[1024..]) < 0.01);
    assert!(rms(&lhi[1024..]) / rms(&hi_in[1024..]) < 0.12);
}

#[test]
fn foley_constant_power_panning_preserves_stereo_energy_across_pan_sweep() {
    let mono = make_sine(48_000.0, 440.0, 0.2, 512);
    let mut ref_power: Option<f32> = None;
    for pan in [-1.0_f32, -0.5, 0.0, 0.5, 1.0] {
        let cfg = FoleyDspConfig { cutoff_hz: 12_000.0, pan, ..Default::default() };
        let (mut l, mut r) = (vec![0.0; 512], vec![0.0; 512]);
        render_foley_biquad_block(&mono, &mut l, &mut r, &cfg, &mut FoleyBiquadState::new()).expect("pan ok");
        let (pl, pr): (f32, f32) = (l[256..].iter().map(|v| v * v).sum(), r[256..].iter().map(|v| v * v).sum());
        let total = pl + pr;
        if let Some(rp) = ref_power { assert!((total - rp).abs() / rp < 1e-5); } else { ref_power = Some(total); }
        if pan == -1.0 { assert!(pr < 1e-10); }
        if pan == 1.0 { assert!(pl < 1e-10); }
        if pan == 0.0 { assert!((pl - pr).abs() < 1e-5); }
    }
}

#[test]
fn foley_soft_knee_limiter_enforces_095_ceiling_without_hard_clipping() {
    let hot = make_sine(48_000.0, 1_000.0, 1.2, 512);
    let cfg = FoleyDspConfig { cutoff_hz: 12_000.0, pan: -0.35, gain_db: 24.0, limiter_ceiling: FOLEY_PEAK_CEILING, ..Default::default() };
    let (mut l, mut r) = (vec![0.0; 512], vec![0.0; 512]);
    let st = render_foley_biquad_block(&hot, &mut l, &mut r, &cfg, &mut FoleyBiquadState::new()).expect("lim ok");
    assert!(st.limited_frames > 0 && st.gain_reduction_db < -10.0 && st.peak_abs <= FOLEY_PEAK_CEILING);
    assert!(l.iter().chain(&r).all(|v| v.abs() <= FOLEY_PEAK_CEILING));

    // 단조 증가 램프에서 Soft-Knee 구간이 하드 클리핑 평탄화 없이 0.95 미만으로 매끄럽게 증가
    let ramp: Vec<f32> = (0..128).map(|i| 0.72 + (i as f32 / 127.0) * 1.2).collect();
    let (mut rl, mut rr) = (vec![0.0; 128], vec![0.0; 128]);
    render_foley_biquad_block(&ramp, &mut rl, &mut rr, &FoleyDspConfig { cutoff_hz: 20_000.0, pan: -1.0, ..Default::default() }, &mut FoleyBiquadState::new()).expect("ramp ok");
    assert!(rl.iter().all(|&v| v.abs() <= FOLEY_PEAK_CEILING));
    assert!(rl[127] > rl[80] && rl[80] > rl[40] && rl[127] < FOLEY_PEAK_CEILING);
}

#[test]
fn foley_block_split_continuity_128x2_matches_256x1_within_1e5() {
    let frames = AUDIOWORKLET_BLOCK_FRAMES * 2;
    let mono: Vec<f32> = (0..frames).map(|i| {
        let t = i as f32 / 48_000.0;
        0.55 * (2.0 * PI * 680.0 * t).sin() + 0.45 * (2.0 * PI * 3_100.0 * t).cos()
    }).collect();
    for (mode, lufs_on) in [(FoleyFilterMode::Lowpass, false), (FoleyFilterMode::Bandpass, false), (FoleyFilterMode::Bandpass, true)] {
        let cfg = FoleyDspConfig { mode, cutoff_hz: 1_500.0, q_factor: 1.4, pan: 0.25, gain_db: 6.0, enable_lufs_leveling: lufs_on, ..Default::default() };
        let (mut lf, mut rf, mut st_f) = (vec![0.0; frames], vec![0.0; frames], FoleyBiquadState::new());
        render_foley_biquad_block(&mono, &mut lf, &mut rf, &cfg, &mut st_f).expect("256 ok");
        let (mut ls, mut rs, mut st_s) = (vec![0.0; frames], vec![0.0; frames], FoleyBiquadState::new());
        render_foley_biquad_block(&mono[..128], &mut ls[..128], &mut rs[..128], &cfg, &mut st_s).expect("128a ok");
        render_foley_biquad_block(&mono[128..], &mut ls[128..], &mut rs[128..], &cfg, &mut st_s).expect("128b ok");
        let max_diff = lf.iter().zip(&ls).chain(rf.iter().zip(&rs)).map(|(a, b)| (a - b).abs()).fold(0.0_f32, f32::max);
        assert!(max_diff < 1e-5, "mode={mode:?} lufs={lufs_on} max_diff={max_diff}");
        assert_eq!(st_f, st_s);
    }
}

#[test]
fn foley_lufs24_auto_leveling_converges_loud_signal_toward_minus_24_lufs() {
    let sr = 48_000.0;
    let cfg = FoleyDspConfig { sample_rate: sr, cutoff_hz: 8_000.0, target_lufs: FOLEY_TARGET_LUFS, enable_lufs_leveling: true, ..Default::default() };
    let (mut state, mut last_lufs, mut max_peak, mut phase) = (FoleyBiquadState::new(), 0.0_f32, 0.0_f32, 0usize);
    let (mut l, mut r) = ([0.0_f32; AUDIOWORKLET_BLOCK_FRAMES], [0.0_f32; AUDIOWORKLET_BLOCK_FRAMES]);
    for _ in 0..450 {
        let mut blk = [0.0_f32; AUDIOWORKLET_BLOCK_FRAMES];
        for s in &mut blk { *s = 0.5 * (2.0 * PI * 1_000.0 * phase as f32 / sr).sin(); phase += 1; }
        let st = render_foley_biquad_block(&blk, &mut l, &mut r, &cfg, &mut state).expect("lufs ok");
        last_lufs = st.momentary_lufs;
        max_peak = max_peak.max(st.peak_abs);
    }
    assert!((last_lufs - FOLEY_TARGET_LUFS).abs() < 1.5, "lufs={last_lufs}");
    assert!(max_peak <= FOLEY_PEAK_CEILING);
}

#[test]
fn foley_sanitizes_nan_inf_samples_and_corrupted_state_without_poisoning() {
    let mut bad_in = make_sine(48_000.0, 1_000.0, 0.25, AUDIOWORKLET_BLOCK_FRAMES);
    bad_in[7] = f32::NAN; bad_in[42] = f32::INFINITY; bad_in[99] = f32::NEG_INFINITY;
    let mut state = FoleyBiquadState { z1: f32::NAN, z2: f32::INFINITY, limiter_env: -5.0, lufs_energy_ewma: f32::NAN, lufs_gain: 0.0 };
    let (mut l, mut r) = ([0.0; AUDIOWORKLET_BLOCK_FRAMES], [0.0; AUDIOWORKLET_BLOCK_FRAMES]);
    let st = render_foley_biquad_block(&bad_in, &mut l, &mut r, &FoleyDspConfig::default(), &mut state).expect("nan ok");
    assert_eq!(st.sanitized_samples, 3);
    assert!(l.iter().chain(&r).all(|v| v.is_finite() && v.abs() <= FOLEY_PEAK_CEILING));
    assert!(state.z1.is_finite() && state.z2.is_finite() && state.limiter_env.is_finite());
}

#[test]
fn foley_rejects_invalid_sample_rate_nyquist_q_pan_ceiling_and_buffer_len() {
    let (inp, mut l, mut r15, mut r16, mut st) = ([0.0_f32; 16], [0.0_f32; 16], [0.0_f32; 15], [0.0_f32; 16], FoleyBiquadState::new());
    assert_eq!(render_foley_biquad_block(&inp, &mut l, &mut r15, &FoleyDspConfig::default(), &mut st), Err(DrawingCoreError::BufferLengthMismatch { expected: 16, actual: 15 }));
    for (cfg, name) in [
        (FoleyDspConfig { cutoff_hz: 24_000.0, ..Default::default() }, "cutoff_hz"),
        (FoleyDspConfig { limiter_ceiling: 0.99, ..Default::default() }, "limiter_ceiling"),
        (FoleyDspConfig { pan: 1.5, ..Default::default() }, "pan"),
        (FoleyDspConfig { sample_rate: 4_000.0, ..Default::default() }, "sample_rate"),
    ] {
        assert_eq!(render_foley_biquad_block(&inp, &mut l, &mut r16, &cfg, &mut st), Err(DrawingCoreError::InvalidParameter { name }));
    }
}

// ============================================================================
// 4. 확장 3D C-ABI FFI 비트 일치 및 가상 스튜디오 종단간 파이프라인 테스트 (3건)
// ============================================================================

#[test]
fn extended_3d_wasm_ffi_verlet_spring_matches_safe_kernel_and_guards_ptrs() {
    assert_eq!(wasm_extended_3d_capabilities(), WASM_EXTENDED_3D_CAPABILITIES);
    assert_eq!(WASM_EXTENDED_3D_CAPABILITIES, 0x3F);

    let n = 6usize;
    let init_pos = [0.0_f32, 0.0, 0.0, 1.0, 1.0, 1.0, 1.8, 1.6, 1.4, 1.8, 1.6, 1.4, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    let (inv_mass, rest_len, col_raw) = ([0.0_f32, 1.0, 1.0, 0.0, 1.0, 1.0], [0.0_f32, 0.2, 0.2, 0.0, 0.2, 0.2], [0.0_f32, 1.55, 0.0, 0.12]);
    let params: [f32; VERLET_SPRING_FFI_PARAM_COUNT] = [1.0 / 60.0, 0.95, 0.05, 3.0, 0.0, -1.5, -9.81, 0.0, 0.25, 0.01];
    let (mut safe_pos, mut safe_prev) = (init_pos.to_vec(), init_pos.to_vec());
    {
        let (px, pr) = safe_pos.split_at_mut(n); let (py, pz) = pr.split_at_mut(n);
        let (ox, or) = safe_prev.split_at_mut(n); let (oy, oz) = or.split_at_mut(n);
        let mut c = VerletSpringChainsSoa { pos_x: px, pos_y: py, pos_z: pz, prev_x: ox, prev_y: oy, prev_z: oz, inv_mass: &inv_mass, rest_len: &rest_len };
        let cfg = VerletSpringConfig { dt: params[0], stiffness: params[1], damping: params[2], wind_xyz: [params[3], params[4], params[5]], gravity_y: params[6], iterations: 5, floor_y: params[7], floor_restitution: params[8], particle_radius: params[9] };
        step_verlet_spring_chains_soa(&mut c, &[SphereCollider::new(0.0, 1.55, 0.0, 0.12)], &cfg).expect("safe verlet");
    }

    let xyz_bytes = 3 * n * std::mem::size_of::<f32>();
    let (pos_ptr, prev_ptr) = (wasm_alloc(xyz_bytes) as *mut f32, wasm_alloc(xyz_bytes) as *mut f32);
    assert!(!pos_ptr.is_null() && !prev_ptr.is_null());
    // SAFETY: `wasm_alloc` 16바이트 정렬 비중첩 버퍼로 Verlet FFI를 검증한다.
    unsafe {
        std::ptr::copy_nonoverlapping(init_pos.as_ptr(), pos_ptr, 3 * n);
        std::ptr::copy_nonoverlapping(init_pos.as_ptr(), prev_ptr, 3 * n);
        assert_eq!(wasm_step_verlet_spring_chains_soa(pos_ptr, prev_ptr, inv_mass.as_ptr(), rest_len.as_ptr(), col_raw.as_ptr(), n as u32, 1, 5, params.as_ptr()), n as i32);
        assert_eq!(std::slice::from_raw_parts(pos_ptr, 3 * n), safe_pos.as_slice());
        assert_eq!(std::slice::from_raw_parts(prev_ptr, 3 * n), safe_prev.as_slice());
        assert!(wasm_step_verlet_spring_chains_soa(pos_ptr, pos_ptr, inv_mass.as_ptr(), rest_len.as_ptr(), std::ptr::null(), n as u32, 0, 4, std::ptr::null()) < 0);
        assert!(wasm_step_verlet_spring_chains_soa(std::ptr::null_mut(), prev_ptr, inv_mass.as_ptr(), rest_len.as_ptr(), std::ptr::null(), n as u32, 0, 4, std::ptr::null()) < 0);
        assert!(wasm_step_verlet_spring_chains_soa(pos_ptr, prev_ptr, inv_mass.as_ptr(), rest_len.as_ptr(), std::ptr::null(), n as u32, 0, 99, std::ptr::null()) < 0);
        wasm_free(pos_ptr as *mut u8, xyz_bytes);
        wasm_free(prev_ptr as *mut u8, xyz_bytes);
    }
}

#[test]
fn extended_3d_wasm_ffi_fabrik_and_foley_match_safe_kernels_and_guards_ptrs() {
    let (bones, target) = ([0.042_f32, 0.028, 0.019], [0.004_f32, -0.042, 0.049]);
    let init_j = [0.0_f32, 0.0, 0.0, 0.0, 0.0, 0.042, 0.0, 0.0, 0.070, 0.0, 0.0, 0.089];
    let f_params: [f32; FABRIK_FINGER_FFI_PARAM_COUNT] = [
        0.0, 0.0, 1.0, 0.0, -1.0, 0.0, 90.0_f32.to_radians(), 15.0_f32.to_radians(),
        20.0_f32.to_radians(), 105.0_f32.to_radians(), 80.0_f32.to_radians(), 1e-4,
    ];
    let mut safe_j = [[0.0; 3], [0.0, 0.0, 0.042], [0.0, 0.0, 0.070], [0.0, 0.0, 0.089]];
    let safe_ik = solve_finger_fabrik_chain(&mut safe_j, bones, target, &FingerFabrikConfig::default()).expect("safe ik");

    let mono = make_sine(48_000.0, 1_400.0, 0.6, AUDIOWORKLET_BLOCK_FRAMES);
    let dsp_params: [f32; FOLEY_DSP_FFI_PARAM_COUNT] = [48_000.0, 1_800.0, 1.5, 0.3, 6.0, 0.95, 50.0, -24.0, 1.0];
    let dsp_cfg = FoleyDspConfig { mode: FoleyFilterMode::Bandpass, cutoff_hz: 1_800.0, q_factor: 1.5, pan: 0.3, gain_db: 6.0, enable_lufs_leveling: true, ..Default::default() };
    let (mut safe_l, mut safe_r, mut safe_st) = (vec![0.0_f32; 128], vec![0.0_f32; 128], FoleyBiquadState::new());
    render_foley_biquad_block(&mono, &mut safe_l, &mut safe_r, &dsp_cfg, &mut safe_st).expect("safe dsp");

    let (j_b, blk_b, st_b) = (12 * 4, AUDIOWORKLET_BLOCK_FRAMES * 4, FOLEY_DSP_FFI_STATE_LEN * 4);
    let (j_ptr, l_ptr, r_ptr, s_ptr) = (wasm_alloc(j_b) as *mut f32, wasm_alloc(blk_b) as *mut f32, wasm_alloc(blk_b) as *mut f32, wasm_alloc(st_b) as *mut f32);
    assert!(!j_ptr.is_null() && !l_ptr.is_null() && !r_ptr.is_null() && !s_ptr.is_null());
    // SAFETY: `wasm_alloc` 비중첩 버퍼로 FABRIK·Foley FFI 비트 일치 및 오류 가드를 검증한다.
    unsafe {
        std::ptr::copy_nonoverlapping(init_j.as_ptr(), j_ptr, 12);
        assert_eq!(wasm_solve_finger_fabrik_chain(j_ptr, bones.as_ptr(), target.as_ptr(), 24, f_params.as_ptr()), safe_ik.iterations as i32);
        assert_eq!(std::slice::from_raw_parts(j_ptr, 12)[9..12], safe_j[3]);
        assert!(wasm_solve_finger_fabrik_chain(std::ptr::null_mut(), bones.as_ptr(), target.as_ptr(), 24, std::ptr::null()) < 0);

        let init_s = [0.0_f32, 0.0, 0.0, 0.0, 1.0];
        std::ptr::copy_nonoverlapping(init_s.as_ptr(), s_ptr, FOLEY_DSP_FFI_STATE_LEN);
        assert_eq!(wasm_render_foley_biquad_block(mono.as_ptr(), l_ptr, r_ptr, s_ptr, 128, FoleyFilterMode::Bandpass as u32, dsp_params.as_ptr()), 128);
        assert_eq!(std::slice::from_raw_parts(l_ptr, 128), safe_l.as_slice());
        assert_eq!(std::slice::from_raw_parts(r_ptr, 128), safe_r.as_slice());
        assert_eq!(std::slice::from_raw_parts(s_ptr, FOLEY_DSP_FFI_STATE_LEN), [safe_st.z1, safe_st.z2, safe_st.limiter_env, safe_st.lufs_energy_ewma, safe_st.lufs_gain]);
        assert!(wasm_render_foley_biquad_block(mono.as_ptr(), l_ptr, r_ptr, s_ptr, 128, 99, std::ptr::null()) < 0);
        assert!(wasm_render_foley_biquad_block(mono.as_ptr(), l_ptr, l_ptr, s_ptr, 128, 0, std::ptr::null()) < 0);
        wasm_free(j_ptr as *mut u8, j_b); wasm_free(l_ptr as *mut u8, blk_b);
        wasm_free(r_ptr as *mut u8, blk_b); wasm_free(s_ptr as *mut u8, st_b);
    }
}

#[test]
fn end_to_end_virtual_studio_frame_physics_hand_ik_and_foley_pipeline() {
    let (mut px, mut py, mut pz) = ([0.0, 0.01, 0.02, 0.03], [1.72, 1.52, 1.32, 1.12], [0.0; 4]);
    let (mut ox, mut oy, mut oz) = (px, py, pz);
    let mut chains = VerletSpringChainsSoa { pos_x: &mut px, pos_y: &mut py, pos_z: &mut pz, prev_x: &mut ox, prev_y: &mut oy, prev_z: &mut oz, inv_mass: &[0.0, 1.0, 1.0, 1.0], rest_len: &[0.0, 0.2, 0.2, 0.2] };
    let phys = step_verlet_spring_chains_soa(&mut chains, &[SphereCollider::new(0.0, 1.56, 0.0, 0.11)], &VerletSpringConfig { wind_xyz: [2.5, 0.0, 0.0], iterations: 6, ..Default::default() }).expect("e2e phys");
    assert!(phys.total_kinetic_energy.is_finite());

    let bones = [[0.036, 0.026, 0.020]; HAND_FINGER_COUNT];
    let (mut hand, mut targets) = ([[[0.0_f32; 3]; 4]; HAND_FINGER_COUNT], [[0.0_f32; 3]; HAND_FINGER_COUNT]);
    for f in 0..HAND_FINGER_COUNT {
        let x0 = (f as f32 - 2.0) * 0.018 + 0.35;
        hand[f] = [[x0, 1.10, 0.20], [x0, 1.10, 0.236], [x0, 1.10, 0.262], [x0, 1.10, 0.282]];
        targets[f] = [x0, 1.06, 0.245];
    }
    let hand_res = solve_hand_fabrik_15joints(&mut hand, &bones, &targets, &[FingerFabrikConfig::default(); 5]).expect("e2e hand");
    assert!(hand_res.solved_joints == 15 && hand_res.max_bone_length_error <= 1e-4);

    let impact = make_sine(48_000.0, 1_200.0, 0.45, AUDIOWORKLET_BLOCK_FRAMES);
    let (mut l, mut r) = ([0.0_f32; AUDIOWORKLET_BLOCK_FRAMES], [0.0_f32; AUDIOWORKLET_BLOCK_FRAMES]);
    let dsp = render_foley_biquad_block(&impact, &mut l, &mut r, &FoleyDspConfig { mode: FoleyFilterMode::Bandpass, cutoff_hz: 1_200.0, q_factor: 1.8, pan: hand[2][3][0].clamp(-1.0, 1.0), ..Default::default() }, &mut FoleyBiquadState::new()).expect("e2e dsp");
    assert!(dsp.rendered_frames == AUDIOWORKLET_BLOCK_FRAMES && dsp.peak_abs <= FOLEY_PEAK_CEILING && rms(&r) > rms(&l));
}
