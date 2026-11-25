use super::*;

#[cfg(feature = "extended-3d")]
#[test]
fn extended_3d_wasm_ffi_exports_match_safe_kernels_and_guard_bad_ptrs() {
    use studio_wasm64_drawing_core::{
        wasm_encode_morton_2d_u32, wasm_encode_morton_3d_u32, wasm_extended_3d_capabilities,
        wasm_extract_lt_lineart_from_gbuffer, wasm_skin_vrm_mesh_4bone_soa,
        LT_LINEART_FFI_PARAM_COUNT, WASM_EXTENDED_3D_CAPABILITIES,
    };

    assert_eq!(
        wasm_extended_3d_capabilities(),
        WASM_EXTENDED_3D_CAPABILITIES
    );
    assert_eq!(
        wasm_encode_morton_2d_u32(13, 27),
        encode_morton_2d_u32(13, 27)
    );
    assert_eq!(
        wasm_encode_morton_3d_u32(13, 27, 41),
        encode_morton_3d_u32(13, 27, 41)
    );

    // 1) VRM 스키닝 FFI vs 안전 커널 비트 일치
    let n = 6usize;
    let bones = [mat4_rot_z(FRAC_PI_2), mat4_translation(3.0, -2.0, 1.0)];
    let in_pos = [
        1.0_f32, 0.0, 2.0, -1.0, 0.5, 3.0, // x
        0.0, 1.0, 0.0, 2.0, -0.5, 1.0, // y
        0.0, 0.0, 1.0, 0.0, 2.0, -1.0, // z
    ];
    let in_norm = [
        1.0_f32, 0.0, 0.0, 0.0, 1.0, 0.0, // nx
        0.0, 1.0, 0.0, 1.0, 0.0, 0.0, // ny
        0.0, 0.0, 1.0, 0.0, 0.0, 1.0, // nz
    ];
    let joints = [
        0u16, 0, 1, 1, 0, 1, // j0
        1, 1, 0, 0, 1, 0, // j1
        0, 0, 0, 0, 0, 0, // j2
        0, 0, 0, 0, 0, 0, // j3
    ];
    let weights = [
        0.7_f32, 1.0, 0.5, 1.0, 0.25, 0.8, // w0
        0.3, 0.0, 0.5, 0.0, 0.75, 0.2, // w1
        0.0, 0.0, 0.0, 0.0, 0.0, 0.0, // w2
        0.0, 0.0, 0.0, 0.0, 0.0, 0.0, // w3
    ];

    let mut safe_pos = vec![0.0_f32; 3 * n];
    let mut safe_norm = vec![0.0_f32; 3 * n];
    {
        let (opx, r1) = safe_pos.split_at_mut(n);
        let (opy, opz) = r1.split_at_mut(n);
        let (onx, r2) = safe_norm.split_at_mut(n);
        let (ony, onz) = r2.split_at_mut(n);
        let inp = VrmMeshSoaInput {
            pos_x: &in_pos[0..n],
            pos_y: &in_pos[n..2 * n],
            pos_z: &in_pos[2 * n..3 * n],
            norm_x: &in_norm[0..n],
            norm_y: &in_norm[n..2 * n],
            norm_z: &in_norm[2 * n..3 * n],
            joints: [
                &joints[0..n],
                &joints[n..2 * n],
                &joints[2 * n..3 * n],
                &joints[3 * n..4 * n],
            ],
            weights: [
                &weights[0..n],
                &weights[n..2 * n],
                &weights[2 * n..3 * n],
                &weights[3 * n..4 * n],
            ],
        };
        let mut out = VrmMeshSoaOutput {
            pos_x: opx,
            pos_y: opy,
            pos_z: opz,
            norm_x: onx,
            norm_y: ony,
            norm_z: onz,
        };
        skin_vrm_mesh_4bone_soa(&inp, &bones, &mut out).expect("safe skin");
    }

    let mut out_pos = vec![0.0_f32; 3 * n];
    let mut out_norm = vec![0.0_f32; 3 * n];
    let out_pos_ptr = out_pos.as_mut_ptr();
    let out_norm_ptr = out_norm.as_mut_ptr();

    // 2) LT 선화 FFI vs 안전 커널 비트 일치
    let (w, h) = (12u32, 10u32);
    let p = (w * h) as usize;
    let mut g_norm = vec![0.0_f32; 3 * p];
    for i in 0..p {
        g_norm[2 * p + i] = 1.0;
    }
    let mut g_depth = vec![0.1_f32; p];
    for y in 0..h as usize {
        for x in 6..w as usize {
            g_depth[y * w as usize + x] = 1.0;
        }
    }
    let lt_params: [f32; LT_LINEART_FFI_PARAM_COUNT] = [0.15, 0.25, 1.0, 1.0, 0.15, 0.0];
    let mut safe_lt = vec![0u8; p];
    let safe_lt_stats = extract_lt_lineart_from_gbuffer(
        &g_norm[0..p],
        &g_norm[p..2 * p],
        &g_norm[2 * p..3 * p],
        &g_depth,
        w,
        h,
        &LtLineArtConfig::default(),
        &mut safe_lt,
    )
    .expect("safe lt");
    let mut out_lt = vec![0u8; p];
    let out_lt_ptr = out_lt.as_mut_ptr();

    // SAFETY: 사용 범위가 각 벡터의 길이 안에 있다. FFI는 입력과 출력이 겹치는 검사 사례를 접근 전에 거부한다.
    unsafe {
        let rc_skin = wasm_skin_vrm_mesh_4bone_soa(
            in_pos.as_ptr(),
            in_norm.as_ptr(),
            joints.as_ptr(),
            weights.as_ptr(),
            bones.as_ptr().cast::<f32>(),
            out_pos_ptr,
            out_norm_ptr,
            n as u32,
            bones.len() as u32,
        );
        assert_eq!(rc_skin, n as i32);

        // aliasing / null / bone_count=0 방어 확인
        assert!(
            wasm_skin_vrm_mesh_4bone_soa(
                out_pos_ptr,
                in_norm.as_ptr(),
                joints.as_ptr(),
                weights.as_ptr(),
                bones.as_ptr().cast::<f32>(),
                out_pos_ptr,
                out_norm_ptr,
                n as u32,
                bones.len() as u32,
            ) < 0
        );
        assert!(
            wasm_skin_vrm_mesh_4bone_soa(
                in_pos.as_ptr(),
                in_norm.as_ptr(),
                joints.as_ptr(),
                weights.as_ptr(),
                bones.as_ptr().cast::<f32>(),
                out_pos_ptr,
                out_norm_ptr,
                n as u32,
                0,
            ) < 0
        );

        let rc_lt = wasm_extract_lt_lineart_from_gbuffer(
            g_norm.as_ptr(),
            g_depth.as_ptr(),
            out_lt_ptr,
            w,
            h,
            lt_params.as_ptr(),
        );
        assert_eq!(rc_lt, safe_lt_stats.ink_pixels as i32);
        assert!(
            wasm_extract_lt_lineart_from_gbuffer(
                std::ptr::null(),
                g_depth.as_ptr(),
                out_lt_ptr,
                w,
                h,
                std::ptr::null(),
            ) < 0
        );
    }
    assert_eq!(out_pos, safe_pos);
    assert_eq!(out_norm, safe_norm);
    assert_eq!(out_lt, safe_lt);
}

#[test]
fn extended_skinning_overflow_rejects_without_partial_output_or_input_changes() {
    let n = 5;
    let mut positions = [1.0; 15];
    positions[4] = f32::MAX;
    let original = positions;
    let normals = [0.0; 15];
    let joints = [0; 20];
    let mut weights = [0.0; 20];
    weights[..n].fill(1.0);
    let mut bone = IDENTITY_MAT4;
    bone[0] = 2.0;
    let mut out_pos = [17.0; 15];
    let mut out_norm = [18.0; 15];
    // SAFETY: 모든 배열의 길이·정렬이 계약에 맞고 출력은 입력 및 서로와 겹치지 않는다.
    let result = unsafe {
        studio_wasm64_drawing_core::wasm_skin_vrm_mesh_4bone_soa(
            positions.as_ptr(),
            normals.as_ptr(),
            joints.as_ptr(),
            weights.as_ptr(),
            bone.as_ptr(),
            out_pos.as_mut_ptr(),
            out_norm.as_mut_ptr(),
            n as u32,
            1,
        )
    };
    assert_eq!(result, -3);
    assert_eq!(positions, original);
    assert_eq!(out_pos, [17.0; 15]);
    assert_eq!(out_norm, [18.0; 15]);
}
