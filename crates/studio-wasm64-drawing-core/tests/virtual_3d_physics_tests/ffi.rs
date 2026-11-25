use super::*;

#[test]
fn extended_3d_wasm_ffi_verlet_spring_matches_safe_kernel_and_guards_ptrs() {
    assert_eq!(
        wasm_extended_3d_capabilities(),
        WASM_EXTENDED_3D_CAPABILITIES
    );
    assert_eq!(WASM_EXTENDED_3D_CAPABILITIES, 0x3F);

    let n = 6usize;
    let init_pos = [
        0.0_f32, 0.0, 0.0, 1.0, 1.0, 1.0, 1.8, 1.6, 1.4, 1.8, 1.6, 1.4, 0.0, 0.0, 0.0, 0.0, 0.0,
        0.0,
    ];
    let (inv_mass, rest_len, col_raw) = (
        [0.0_f32, 1.0, 1.0, 0.0, 1.0, 1.0],
        [0.0_f32, 0.2, 0.2, 0.0, 0.2, 0.2],
        [0.0_f32, 1.55, 0.0, 0.12],
    );
    let params: [f32; VERLET_SPRING_FFI_PARAM_COUNT] = [
        1.0 / 60.0,
        0.95,
        0.05,
        3.0,
        0.0,
        -1.5,
        -9.81,
        0.0,
        0.25,
        0.01,
    ];
    let (mut safe_pos, mut safe_prev) = (init_pos.to_vec(), init_pos.to_vec());
    {
        let (px, pr) = safe_pos.split_at_mut(n);
        let (py, pz) = pr.split_at_mut(n);
        let (ox, or) = safe_prev.split_at_mut(n);
        let (oy, oz) = or.split_at_mut(n);
        let mut c = VerletSpringChainsSoa {
            pos_x: px,
            pos_y: py,
            pos_z: pz,
            prev_x: ox,
            prev_y: oy,
            prev_z: oz,
            inv_mass: &inv_mass,
            rest_len: &rest_len,
        };
        let cfg = VerletSpringConfig {
            dt: params[0],
            stiffness: params[1],
            damping: params[2],
            wind_xyz: [params[3], params[4], params[5]],
            gravity_y: params[6],
            iterations: 5,
            floor_y: params[7],
            floor_restitution: params[8],
            particle_radius: params[9],
        };
        step_verlet_spring_chains_soa(&mut c, &[SphereCollider::new(0.0, 1.55, 0.0, 0.12)], &cfg)
            .expect("safe verlet");
    }

    let xyz_bytes = 3 * n * std::mem::size_of::<f32>();
    let (pos_ptr, prev_ptr) = (
        wasm_alloc(xyz_bytes) as *mut f32,
        wasm_alloc(xyz_bytes) as *mut f32,
    );
    assert!(!pos_ptr.is_null() && !prev_ptr.is_null());
    // SAFETY: `wasm_alloc` 16바이트 정렬 비중첩 버퍼로 Verlet FFI를 검증한다.
    unsafe {
        std::ptr::copy_nonoverlapping(init_pos.as_ptr(), pos_ptr, 3 * n);
        std::ptr::copy_nonoverlapping(init_pos.as_ptr(), prev_ptr, 3 * n);
        assert_eq!(
            wasm_step_verlet_spring_chains_soa(
                pos_ptr,
                prev_ptr,
                inv_mass.as_ptr(),
                rest_len.as_ptr(),
                col_raw.as_ptr(),
                n as u32,
                1,
                5,
                params.as_ptr()
            ),
            n as i32
        );
        assert_eq!(
            std::slice::from_raw_parts(pos_ptr, 3 * n),
            safe_pos.as_slice()
        );
        assert_eq!(
            std::slice::from_raw_parts(prev_ptr, 3 * n),
            safe_prev.as_slice()
        );
        assert!(
            wasm_step_verlet_spring_chains_soa(
                pos_ptr,
                pos_ptr,
                inv_mass.as_ptr(),
                rest_len.as_ptr(),
                std::ptr::null(),
                n as u32,
                0,
                4,
                std::ptr::null()
            ) < 0
        );
        assert!(
            wasm_step_verlet_spring_chains_soa(
                std::ptr::null_mut(),
                prev_ptr,
                inv_mass.as_ptr(),
                rest_len.as_ptr(),
                std::ptr::null(),
                n as u32,
                0,
                4,
                std::ptr::null()
            ) < 0
        );
        assert!(
            wasm_step_verlet_spring_chains_soa(
                pos_ptr,
                prev_ptr,
                inv_mass.as_ptr(),
                rest_len.as_ptr(),
                std::ptr::null(),
                n as u32,
                0,
                99,
                std::ptr::null()
            ) < 0
        );
        wasm_free(pos_ptr as *mut u8, xyz_bytes);
        wasm_free(prev_ptr as *mut u8, xyz_bytes);
    }
}

#[test]
fn extended_3d_wasm_ffi_fabrik_and_foley_match_safe_kernels_and_guards_ptrs() {
    let (bones, target) = ([0.042_f32, 0.028, 0.019], [0.004_f32, -0.042, 0.049]);
    let init_j = [
        0.0_f32, 0.0, 0.0, 0.0, 0.0, 0.042, 0.0, 0.0, 0.070, 0.0, 0.0, 0.089,
    ];
    let f_params: [f32; FABRIK_FINGER_FFI_PARAM_COUNT] = [
        0.0,
        0.0,
        1.0,
        0.0,
        -1.0,
        0.0,
        90.0_f32.to_radians(),
        15.0_f32.to_radians(),
        20.0_f32.to_radians(),
        105.0_f32.to_radians(),
        80.0_f32.to_radians(),
        1e-4,
    ];
    let mut safe_j = [
        [0.0; 3],
        [0.0, 0.0, 0.042],
        [0.0, 0.0, 0.070],
        [0.0, 0.0, 0.089],
    ];
    let safe_ik =
        solve_finger_fabrik_chain(&mut safe_j, bones, target, &FingerFabrikConfig::default())
            .expect("safe ik");

    let mono = make_sine(48_000.0, 1_400.0, 0.6, AUDIOWORKLET_BLOCK_FRAMES);
    let dsp_params: [f32; FOLEY_DSP_FFI_PARAM_COUNT] =
        [48_000.0, 1_800.0, 1.5, 0.3, 6.0, 0.95, 50.0, -24.0, 1.0];
    let dsp_cfg = FoleyDspConfig {
        mode: FoleyFilterMode::Bandpass,
        cutoff_hz: 1_800.0,
        q_factor: 1.5,
        pan: 0.3,
        gain_db: 6.0,
        enable_lufs_leveling: true,
        ..Default::default()
    };
    let (mut safe_l, mut safe_r, mut safe_st) = (
        vec![0.0_f32; 128],
        vec![0.0_f32; 128],
        FoleyBiquadState::new(),
    );
    render_foley_biquad_block(&mono, &mut safe_l, &mut safe_r, &dsp_cfg, &mut safe_st)
        .expect("safe dsp");

    let (j_b, blk_b, st_b) = (
        12 * 4,
        AUDIOWORKLET_BLOCK_FRAMES * 4,
        FOLEY_DSP_FFI_STATE_LEN * 4,
    );
    let (j_ptr, l_ptr, r_ptr, s_ptr) = (
        wasm_alloc(j_b) as *mut f32,
        wasm_alloc(blk_b) as *mut f32,
        wasm_alloc(blk_b) as *mut f32,
        wasm_alloc(st_b) as *mut f32,
    );
    assert!(!j_ptr.is_null() && !l_ptr.is_null() && !r_ptr.is_null() && !s_ptr.is_null());
    // SAFETY: `wasm_alloc` 비중첩 버퍼로 FABRIK·Foley FFI 비트 일치 및 오류 가드를 검증한다.
    unsafe {
        std::ptr::copy_nonoverlapping(init_j.as_ptr(), j_ptr, 12);
        assert_eq!(
            wasm_solve_finger_fabrik_chain(
                j_ptr,
                bones.as_ptr(),
                target.as_ptr(),
                24,
                f_params.as_ptr()
            ),
            safe_ik.iterations as i32
        );
        assert_eq!(std::slice::from_raw_parts(j_ptr, 12)[9..12], safe_j[3]);
        assert!(
            wasm_solve_finger_fabrik_chain(
                std::ptr::null_mut(),
                bones.as_ptr(),
                target.as_ptr(),
                24,
                std::ptr::null()
            ) < 0
        );

        let init_s = [0.0_f32, 0.0, 0.0, 0.0, 1.0];
        std::ptr::copy_nonoverlapping(init_s.as_ptr(), s_ptr, FOLEY_DSP_FFI_STATE_LEN);
        assert_eq!(
            wasm_render_foley_biquad_block(
                mono.as_ptr(),
                l_ptr,
                r_ptr,
                s_ptr,
                128,
                FoleyFilterMode::Bandpass as u32,
                dsp_params.as_ptr()
            ),
            128
        );
        assert_eq!(std::slice::from_raw_parts(l_ptr, 128), safe_l.as_slice());
        assert_eq!(std::slice::from_raw_parts(r_ptr, 128), safe_r.as_slice());
        assert_eq!(
            std::slice::from_raw_parts(s_ptr, FOLEY_DSP_FFI_STATE_LEN),
            [
                safe_st.z1,
                safe_st.z2,
                safe_st.limiter_env,
                safe_st.lufs_energy_ewma,
                safe_st.lufs_gain
            ]
        );
        assert!(
            wasm_render_foley_biquad_block(
                mono.as_ptr(),
                l_ptr,
                r_ptr,
                s_ptr,
                128,
                99,
                std::ptr::null()
            ) < 0
        );
        assert!(
            wasm_render_foley_biquad_block(
                mono.as_ptr(),
                l_ptr,
                l_ptr,
                s_ptr,
                128,
                0,
                std::ptr::null()
            ) < 0
        );
        wasm_free(j_ptr as *mut u8, j_b);
        wasm_free(l_ptr as *mut u8, blk_b);
        wasm_free(r_ptr as *mut u8, blk_b);
        wasm_free(s_ptr as *mut u8, st_b);
    }
}

#[test]
fn end_to_end_virtual_studio_frame_physics_hand_ik_and_foley_pipeline() {
    let (mut px, mut py, mut pz) = ([0.0, 0.01, 0.02, 0.03], [1.72, 1.52, 1.32, 1.12], [0.0; 4]);
    let (mut ox, mut oy, mut oz) = (px, py, pz);
    let mut chains = VerletSpringChainsSoa {
        pos_x: &mut px,
        pos_y: &mut py,
        pos_z: &mut pz,
        prev_x: &mut ox,
        prev_y: &mut oy,
        prev_z: &mut oz,
        inv_mass: &[0.0, 1.0, 1.0, 1.0],
        rest_len: &[0.0, 0.2, 0.2, 0.2],
    };
    let phys = step_verlet_spring_chains_soa(
        &mut chains,
        &[SphereCollider::new(0.0, 1.56, 0.0, 0.11)],
        &VerletSpringConfig {
            wind_xyz: [2.5, 0.0, 0.0],
            iterations: 6,
            ..Default::default()
        },
    )
    .expect("e2e phys");
    assert!(phys.total_kinetic_energy.is_finite());

    let bones = [[0.036, 0.026, 0.020]; HAND_FINGER_COUNT];
    let (mut hand, mut targets) = (
        [[[0.0_f32; 3]; 4]; HAND_FINGER_COUNT],
        [[0.0_f32; 3]; HAND_FINGER_COUNT],
    );
    for f in 0..HAND_FINGER_COUNT {
        let x0 = (f as f32 - 2.0) * 0.018 + 0.35;
        hand[f] = [
            [x0, 1.10, 0.20],
            [x0, 1.10, 0.236],
            [x0, 1.10, 0.262],
            [x0, 1.10, 0.282],
        ];
        targets[f] = [x0, 1.06, 0.245];
    }
    let hand_res = solve_hand_fabrik_15joints(
        &mut hand,
        &bones,
        &targets,
        &[FingerFabrikConfig::default(); 5],
    )
    .expect("e2e hand");
    assert!(hand_res.solved_joints == 15 && hand_res.max_bone_length_error <= 1e-4);

    let impact = make_sine(48_000.0, 1_200.0, 0.45, AUDIOWORKLET_BLOCK_FRAMES);
    let (mut l, mut r) = (
        [0.0_f32; AUDIOWORKLET_BLOCK_FRAMES],
        [0.0_f32; AUDIOWORKLET_BLOCK_FRAMES],
    );
    let dsp = render_foley_biquad_block(
        &impact,
        &mut l,
        &mut r,
        &FoleyDspConfig {
            mode: FoleyFilterMode::Bandpass,
            cutoff_hz: 1_200.0,
            q_factor: 1.8,
            pan: hand[2][3][0].clamp(-1.0, 1.0),
            ..Default::default()
        },
        &mut FoleyBiquadState::new(),
    )
    .expect("e2e dsp");
    assert!(
        dsp.rendered_frames == AUDIOWORKLET_BLOCK_FRAMES
            && dsp.peak_abs <= FOLEY_PEAK_CEILING
            && rms(&r) > rms(&l)
    );
}
