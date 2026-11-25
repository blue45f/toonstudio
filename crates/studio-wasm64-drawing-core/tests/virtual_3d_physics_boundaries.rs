#![cfg(feature = "virtual-3d-physics")]
use studio_wasm64_drawing_core::wasm_ffi::FFI_ERR_INVALID_PARAMETER;
use studio_wasm64_drawing_core::*;

#[test]
fn huge_finite_verlet_input_is_rejected_before_mutation() {
    let (mut x, mut y, mut z) = ([f32::MAX], [1.0], [0.0]);
    let (mut ox, mut oy, mut oz) = ([0.0], [1.0], [0.0]);
    let mut c = VerletSpringChainsSoa {
        pos_x: &mut x,
        pos_y: &mut y,
        pos_z: &mut z,
        prev_x: &mut ox,
        prev_y: &mut oy,
        prev_z: &mut oz,
        inv_mass: &[1.0],
        rest_len: &[0.0],
    };
    assert!(step_verlet_spring_chains_soa(&mut c, &[], &VerletSpringConfig::default()).is_err());
    assert_eq!(x, [f32::MAX]);
    assert_eq!(ox, [0.0]);
}
#[test]
fn unrepresentable_dt_and_force_are_rejected() {
    for cfg in [
        VerletSpringConfig {
            dt: f32::MIN_POSITIVE,
            ..Default::default()
        },
        VerletSpringConfig {
            wind_xyz: [f32::MAX; 3],
            ..Default::default()
        },
    ] {
        let mut c = VerletSpringChainsSoa {
            pos_x: &mut [],
            pos_y: &mut [],
            pos_z: &mut [],
            prev_x: &mut [],
            prev_y: &mut [],
            prev_z: &mut [],
            inv_mass: &[],
            rest_len: &[],
        };
        assert!(step_verlet_spring_chains_soa(&mut c, &[], &cfg).is_err());
    }
}
#[test]
fn huge_finite_ik_vectors_are_rejected_before_output_changes() {
    let mut j = [[0.0; 3]; 4];
    let before = j;
    assert!(solve_finger_fabrik_chain(
        &mut j,
        [f32::MAX; 3],
        [f32::MAX; 3],
        &FingerFabrikConfig::default()
    )
    .is_err());
    assert_eq!(j, before);
}
#[test]
fn full_hand_failure_does_not_commit_earlier_fingers() {
    let mut j = [[[0.0; 3]; 4]; 5];
    let before = j;
    let mut lengths = [[0.04, 0.03, 0.02]; 5];
    lengths[4][1] = 0.0;
    assert!(solve_hand_fabrik_15joints(
        &mut j,
        &lengths,
        &[[0.0, -0.04, 0.05]; 5],
        &[FingerFabrikConfig::default(); 5]
    )
    .is_err());
    assert_eq!(j, before);
}
#[test]
fn finite_hot_audio_and_state_do_not_poison_the_next_block() {
    let mut state = FoleyBiquadState {
        z1: f32::MAX,
        z2: f32::MAX,
        limiter_env: f32::MAX,
        lufs_energy_ewma: f32::MAX,
        lufs_gain: f32::MAX,
    };
    let (mut l, mut r) = ([0.0; 128], [0.0; 128]);
    let cfg = FoleyDspConfig {
        gain_db: 36.0,
        enable_lufs_leveling: true,
        ..Default::default()
    };
    let result = render_foley_biquad_block(&[f32::MAX; 128], &mut l, &mut r, &cfg, &mut state)
        .expect("bounded audio");
    assert!(l
        .iter()
        .chain(&r)
        .all(|x| x.is_finite() && x.abs() <= FOLEY_PEAK_CEILING));
    assert!([
        state.z1,
        state.z2,
        state.limiter_env,
        state.lufs_energy_ewma,
        state.lufs_gain,
        result.momentary_lufs
    ]
    .iter()
    .all(|x| x.is_finite()));
    render_foley_biquad_block(&[0.2; 128], &mut l, &mut r, &cfg, &mut state)
        .expect("next audio block");
    assert!(l.iter().chain(&r).all(|x| x.is_finite()));
}
#[test]
fn ffi_rejects_nonfinite_level_switch_and_large_counts_without_reading_buffers() {
    let mut state = [0.0, 0.0, 0.0, 0.0, 1.0];
    let before = state;
    let params = [
        48000.0,
        2400.0,
        0.707,
        0.0,
        0.0,
        0.95,
        50.0,
        -24.0,
        f32::NAN,
    ];
    let result = unsafe {
        wasm_render_foley_biquad_block(
            std::ptr::null(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            state.as_mut_ptr(),
            0,
            0,
            params.as_ptr(),
        )
    };
    assert_eq!(result, FFI_ERR_INVALID_PARAMETER);
    assert_eq!(state, before);
}

#[test]
fn ffi_work_limits_return_errors_before_null_buffer_access() {
    unsafe {
        assert_eq!(
            wasm_step_verlet_spring_chains_soa(
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                u32::MAX,
                0,
                4,
                std::ptr::null()
            ),
            FFI_ERR_INVALID_PARAMETER
        );
        assert_eq!(
            wasm_render_foley_biquad_block(
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                u32::MAX,
                0,
                std::ptr::null()
            ),
            FFI_ERR_INVALID_PARAMETER
        );
    }
}
