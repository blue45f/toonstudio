//! Wave 52A 순수 Rust SIMD128 친화 VRM 4-본 스키닝 · Morton BVH · 3D LT 선화 통합 테스트.

use std::f32::consts::FRAC_PI_2;

use studio_wasm64_drawing_core::{
    build_morton_bvh_2d, encode_morton_2d_u32, encode_morton_3d_u32,
    extract_lt_lineart_from_gbuffer, query_morton_bvh_aabb, skin_vrm_mesh_4bone_soa, Aabb2D,
    DrawingCoreError, LtLineArtConfig, VrmMeshSoaInput, VrmMeshSoaOutput, IDENTITY_MAT4,
};

fn mat4_translation(tx: f32, ty: f32, tz: f32) -> [f32; 16] {
    [
        1.0, 0.0, 0.0, 0.0, // col 0
        0.0, 1.0, 0.0, 0.0, // col 1
        0.0, 0.0, 1.0, 0.0, // col 2
        tx, ty, tz, 1.0, // col 3
    ]
}

fn mat4_rot_z(rad: f32) -> [f32; 16] {
    let (s, c) = rad.sin_cos();
    [
        c, s, 0.0, 0.0, // col 0
        -s, c, 0.0, 0.0, // col 1
        0.0, 0.0, 1.0, 0.0, // col 2
        0.0, 0.0, 0.0, 1.0, // col 3
    ]
}

fn mat4_rot_y(rad: f32) -> [f32; 16] {
    let (s, c) = rad.sin_cos();
    [
        c, 0.0, -s, 0.0, // col 0
        0.0, 1.0, 0.0, 0.0, // col 1
        s, 0.0, c, 0.0, // col 2
        0.0, 0.0, 0.0, 1.0, // col 3
    ]
}

fn mat4_uniform_scale(s: f32) -> [f32; 16] {
    [
        s, 0.0, 0.0, 0.0, 0.0, s, 0.0, 0.0, 0.0, 0.0, s, 0.0, 0.0, 0.0, 0.0, 1.0,
    ]
}

fn lcg_next(state: &mut u64) -> f32 {
    *state = state.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1_442_695_040_888_963_407);
    ((*state >> 40) as u32) as f32 / (u32::MAX >> 8) as f32
}

// ============================================================================
// 1. VRM 4-본 SoA 스키닝 수학·정확도·안전성 테스트
// ============================================================================

#[test]
fn skinning_identity_preserves_positions_across_varied_vertex_counts() {
    for count in [0usize, 1, 3, 4, 5, 17, 64] {
        let px: Vec<f32> = (0..count).map(|i| i as f32 * 0.5 - 3.0).collect();
        let py: Vec<f32> = (0..count).map(|i| (i as f32).sin()).collect();
        let pz: Vec<f32> = (0..count).map(|i| i as f32 * -0.25).collect();
        let nx = vec![0.0; count];
        let ny = vec![1.0; count];
        let nz = vec![0.0; count];
        let j0 = vec![0u16; count];
        let w0 = vec![1.0_f32; count];
        let zw = vec![0.0_f32; count];

        let input = VrmMeshSoaInput {
            pos_x: &px, pos_y: &py, pos_z: &pz,
            norm_x: &nx, norm_y: &ny, norm_z: &nz,
            joints: [&j0, &j0, &j0, &j0],
            weights: [&w0, &zw, &zw, &zw],
        };
        let (mut ox, mut oy, mut oz) = (vec![0.0; count], vec![0.0; count], vec![0.0; count]);
        let (mut onx, mut ony, mut onz) = (vec![0.0; count], vec![0.0; count], vec![0.0; count]);
        let mut out = VrmMeshSoaOutput {
            pos_x: &mut ox, pos_y: &mut oy, pos_z: &mut oz,
            norm_x: &mut onx, norm_y: &mut ony, norm_z: &mut onz,
        };
        let stats = skin_vrm_mesh_4bone_soa(&input, &[IDENTITY_MAT4], &mut out).expect("identity ok");
        assert_eq!(stats.skinned_vertices, count);
        assert_eq!(stats.clamped_oob_joints, 0);
        assert_eq!(stats.sanitized_nan_vertices, 0);
        assert_eq!((ox, oy, oz), (px, py, pz));
        assert_eq!((onx, ony, onz), (nx, ny, nz));
    }
}

#[test]
fn skinning_rotation_z_and_y_transforms_positions_and_normals_exactly() {
    let px = [1.0, 0.0, 2.0, -1.0, 0.0];
    let py = [0.0, 1.0, 0.0, 0.0, 3.0];
    let pz = [0.0, 0.0, 1.0, 2.0, 0.0];
    let nx = [1.0, 0.0, 1.0, 0.0, 0.0];
    let ny = [0.0, 1.0, 0.0, 0.0, 1.0];
    let nz = [0.0, 0.0, 0.0, 1.0, 0.0];
    let j0 = [0u16, 0, 1, 1, 0];
    let jz = [0u16; 5];
    let w0 = [1.0_f32; 5];
    let zw = [0.0_f32; 5];

    let bones = [mat4_rot_z(FRAC_PI_2), mat4_rot_y(FRAC_PI_2)];
    let input = VrmMeshSoaInput {
        pos_x: &px, pos_y: &py, pos_z: &pz,
        norm_x: &nx, norm_y: &ny, norm_z: &nz,
        joints: [&j0, &jz, &jz, &jz],
        weights: [&w0, &zw, &zw, &zw],
    };
    let (mut ox, mut oy, mut oz) = ([0.0; 5], [0.0; 5], [0.0; 5]);
    let (mut onx, mut ony, mut onz) = ([0.0; 5], [0.0; 5], [0.0; 5]);
    let mut out = VrmMeshSoaOutput {
        pos_x: &mut ox, pos_y: &mut oy, pos_z: &mut oz,
        norm_x: &mut onx, norm_y: &mut ony, norm_z: &mut onz,
    };
    skin_vrm_mesh_4bone_soa(&input, &bones, &mut out).expect("rot ok");

    // RotZ(+90°): (1,0,0) -> (0,1,0), (0,1,0) -> (-1,0,0), (0,3,0) -> (-3,0,0)
    assert!((ox[0] - 0.0).abs() < 1e-5 && (oy[0] - 1.0).abs() < 1e-5 && oz[0].abs() < 1e-5);
    assert!((ox[1] + 1.0).abs() < 1e-5 && oy[1].abs() < 1e-5 && oz[1].abs() < 1e-5);
    assert!((ox[4] + 3.0).abs() < 1e-5 && oy[4].abs() < 1e-5 && oz[4].abs() < 1e-5);
    assert!((onx[0] - 0.0).abs() < 1e-5 && (ony[0] - 1.0).abs() < 1e-5);
    assert!((onx[1] + 1.0).abs() < 1e-5 && ony[1].abs() < 1e-5);

    // RotY(+90°): (x,y,z) -> (z, y, -x) => (2,0,1) -> (1,0,-2), (-1,0,2) -> (2,0,1)
    assert!((ox[2] - 1.0).abs() < 1e-5 && oy[2].abs() < 1e-5 && (oz[2] + 2.0).abs() < 1e-5);
    assert!((ox[3] - 2.0).abs() < 1e-5 && oy[3].abs() < 1e-5 && (oz[3] - 1.0).abs() < 1e-5);
    assert!(onx[2].abs() < 1e-5 && ony[2].abs() < 1e-5 && (onz[2] + 1.0).abs() < 1e-5);
    assert!((onx[3] - 1.0).abs() < 1e-5 && ony[3].abs() < 1e-5 && onz[3].abs() < 1e-5);
}

#[test]
fn skinning_4bone_weighted_blend_matches_analytical_lbs() {
    let bones = [
        mat4_translation(10.0, 0.0, 0.0),
        mat4_translation(0.0, 20.0, 0.0),
        mat4_translation(0.0, 0.0, 30.0),
        mat4_translation(-10.0, -20.0, -30.0),
    ];
    let n = 8usize;
    let px = vec![1.0; n];
    let py = vec![2.0; n];
    let pz = vec![3.0; n];
    let nx = vec![0.0; n];
    let ny = vec![0.0; n];
    let nz = vec![1.0; n];
    let (j0, j1, j2, j3) = (vec![0u16; n], vec![1u16; n], vec![2u16; n], vec![3u16; n]);
    // 합 2.0인 비정규화 가중치 [0.8, 0.6, 0.4, 0.2] -> 정규화 [0.4, 0.3, 0.2, 0.1]
    let (w0, w1, w2, w3) = (vec![0.8; n], vec![0.6; n], vec![0.4; n], vec![0.2; n]);
    let input = VrmMeshSoaInput {
        pos_x: &px, pos_y: &py, pos_z: &pz,
        norm_x: &nx, norm_y: &ny, norm_z: &nz,
        joints: [&j0, &j1, &j2, &j3],
        weights: [&w0, &w1, &w2, &w3],
    };
    let (mut ox, mut oy, mut oz) = (vec![0.0; n], vec![0.0; n], vec![0.0; n]);
    let (mut onx, mut ony, mut onz) = (vec![0.0; n], vec![0.0; n], vec![0.0; n]);
    let mut out = VrmMeshSoaOutput {
        pos_x: &mut ox, pos_y: &mut oy, pos_z: &mut oz,
        norm_x: &mut onx, norm_y: &mut ony, norm_z: &mut onz,
    };
    skin_vrm_mesh_4bone_soa(&input, &bones, &mut out).expect("4-bone ok");

    // 예상 이동: tx = 0.4*10 - 0.1*10 = 3.0, ty = 0.3*20 - 0.1*20 = 4.0, tz = 0.2*30 - 0.1*30 = 3.0
    for i in 0..n {
        assert!((ox[i] - 4.0).abs() < 1e-4);
        assert!((oy[i] - 6.0).abs() < 1e-4);
        assert!((oz[i] - 6.0).abs() < 1e-4);
        assert!(onx[i].abs() < 1e-5 && ony[i].abs() < 1e-5 && (onz[i] - 1.0).abs() < 1e-5);
    }
}

#[test]
fn skinning_renormalizes_scaled_and_degenerate_normals() {
    let bones = [mat4_uniform_scale(4.5)];
    let (px, py, pz) = ([1.0, 2.0, 3.0, 4.0], [0.0; 4], [0.0; 4]);
    let (nx, ny, nz) = ([3.0, 0.0, 1.0, 0.0], [4.0, 0.0, 1.0, 0.0], [0.0, 0.0, 1.0, 0.0]);
    let (j0, w0, zw) = ([0u16; 4], [1.0_f32; 4], [0.0_f32; 4]);
    let input = VrmMeshSoaInput {
        pos_x: &px, pos_y: &py, pos_z: &pz, norm_x: &nx, norm_y: &ny, norm_z: &nz,
        joints: [&j0, &j0, &j0, &j0], weights: [&w0, &zw, &zw, &zw],
    };
    let (mut ox, mut oy, mut oz, mut onx, mut ony, mut onz) =
        ([0.0; 4], [0.0; 4], [0.0; 4], [0.0; 4], [0.0; 4], [0.0; 4]);
    let mut out = VrmMeshSoaOutput {
        pos_x: &mut ox, pos_y: &mut oy, pos_z: &mut oz,
        norm_x: &mut onx, norm_y: &mut ony, norm_z: &mut onz,
    };
    skin_vrm_mesh_4bone_soa(&input, &bones, &mut out).expect("scale ok");

    assert!((ox[0] - 4.5).abs() < 1e-5);
    assert!((onx[0] - 0.6).abs() < 1e-5 && (ony[0] - 0.8).abs() < 1e-5 && onz[0].abs() < 1e-5);
    // 영벡터 법선(인덱스 1, 3)은 안전 기본 법선 [0, 0, 1]로 폴백
    assert_eq!((onx[1], ony[1], onz[1]), (0.0, 0.0, 1.0));
    assert_eq!((onx[3], ony[3], onz[3]), (0.0, 0.0, 1.0));
}

#[test]
fn skinning_guards_oob_joints_nan_inputs_and_zero_weights_without_panic() {
    let mut nan_bone = IDENTITY_MAT4;
    nan_bone[12] = f32::NAN;
    let bones = [mat4_translation(5.0, 0.0, 0.0), nan_bone];

    let px = [1.0, f32::NAN, 2.0, 3.0, 4.0];
    let py = [0.0, 1.0, f32::INFINITY, 0.0, 0.0];
    let pz = [0.0, 0.0, 0.0, 0.0, 0.0];
    let nx = [1.0, f32::NAN, 0.0, 0.0, 0.0];
    let ny = [0.0, 0.0, 1.0, 0.0, 0.0];
    let nz = [0.0, 0.0, 0.0, 1.0, 1.0];
    // v0: OOB joint 999, v1: NaN pos/norm, v2: NaN weight + Inf pos, v3: zero weights, v4: NaN bone
    let j0 = [999u16, 0, 0, 0, 1];
    let jz = [0u16; 5];
    let w0 = [1.0, 1.0, f32::NAN, -2.0, 1.0];
    let w1 = [0.0, 0.0, 1.0, 0.0, 0.0];
    let zw = [0.0; 5];

    let input = VrmMeshSoaInput {
        pos_x: &px, pos_y: &py, pos_z: &pz, norm_x: &nx, norm_y: &ny, norm_z: &nz,
        joints: [&j0, &jz, &jz, &jz], weights: [&w0, &w1, &zw, &zw],
    };
    let (mut ox, mut oy, mut oz, mut onx, mut ony, mut onz) =
        ([0.0; 5], [0.0; 5], [0.0; 5], [0.0; 5], [0.0; 5], [0.0; 5]);
    let mut out = VrmMeshSoaOutput {
        pos_x: &mut ox, pos_y: &mut oy, pos_z: &mut oz,
        norm_x: &mut onx, norm_y: &mut ony, norm_z: &mut onz,
    };

    let stats = skin_vrm_mesh_4bone_soa(&input, &bones, &mut out).expect("guarded ok");
    assert_eq!(stats.clamped_oob_joints, 1);
    assert_eq!(stats.sanitized_nan_vertices, 2);
    assert_eq!(stats.zero_weight_fallbacks, 1);
    // 모든 출력 정점/법선은 반드시 유한값이어야 함
    for i in 0..5 {
        assert!(ox[i].is_finite() && oy[i].is_finite() && oz[i].is_finite());
        assert!(onx[i].is_finite() && ony[i].is_finite() && onz[i].is_finite());
    }
    // v0은 OOB이므로 항등 행렬 적용 -> 위치 유지
    assert_eq!((ox[0], oy[0], oz[0]), (1.0, 0.0, 0.0));
    // v3은 가중치 0 폴백 -> 위치 유지
    assert_eq!((ox[3], oy[3], oz[3]), (3.0, 0.0, 0.0));
    // v4는 NaN 본 -> 항등 폴백
    assert_eq!((ox[4], oy[4], oz[4]), (4.0, 0.0, 0.0));
}

#[test]
fn skinning_rejects_empty_bones_and_mismatched_slice_lengths() {
    let empty_f: [f32; 0] = [];
    let empty_j: [u16; 0] = [];
    let inp_empty = VrmMeshSoaInput {
        pos_x: &empty_f, pos_y: &empty_f, pos_z: &empty_f,
        norm_x: &empty_f, norm_y: &empty_f, norm_z: &empty_f,
        joints: [&empty_j; 4], weights: [&empty_f; 4],
    };
    let (mut e1, mut e2, mut e3, mut e4, mut e5, mut e6) = ([], [], [], [], [], []);
    let mut out_empty = VrmMeshSoaOutput {
        pos_x: &mut e1, pos_y: &mut e2, pos_z: &mut e3,
        norm_x: &mut e4, norm_y: &mut e5, norm_z: &mut e6,
    };
    assert_eq!(
        skin_vrm_mesh_4bone_soa(&inp_empty, &[], &mut out_empty),
        Err(DrawingCoreError::InvalidParameter { name: "bone_matrices" })
    );

    let a2 = [0.0_f32; 2];
    let a1 = [0.0_f32; 1];
    let j2 = [0u16; 2];
    let inp_bad = VrmMeshSoaInput {
        pos_x: &a2, pos_y: &a1, pos_z: &a2, norm_x: &a2, norm_y: &a2, norm_z: &a2,
        joints: [&j2; 4], weights: [&a2; 4],
    };
    let (mut o1, mut o2, mut o3, mut o4, mut o5, mut o6) =
        ([0.0; 2], [0.0; 2], [0.0; 2], [0.0; 2], [0.0; 2], [0.0; 2]);
    let mut out_ok = VrmMeshSoaOutput {
        pos_x: &mut o1, pos_y: &mut o2, pos_z: &mut o3,
        norm_x: &mut o4, norm_y: &mut o5, norm_z: &mut o6,
    };
    assert_eq!(
        skin_vrm_mesh_4bone_soa(&inp_bad, &[IDENTITY_MAT4], &mut out_ok),
        Err(DrawingCoreError::BufferLengthMismatch { expected: 2, actual: 1 })
    );
}

#[test]
fn skinning_large_2049_vertex_mesh_is_deterministic_and_unit_normal() {
    let n = 2049usize;
    let bones: Vec<[f32; 16]> = (0..64)
        .map(|b| mat4_rot_z(b as f32 * 0.1))
        .collect();
    let px: Vec<f32> = (0..n).map(|i| (i as f32 * 0.03).sin()).collect();
    let py: Vec<f32> = (0..n).map(|i| (i as f32 * 0.05).cos()).collect();
    let pz: Vec<f32> = (0..n).map(|i| (i % 19) as f32 * 0.1).collect();
    let nx: Vec<f32> = (0..n).map(|i| ((i % 7) as f32 - 3.0) * 0.5).collect();
    let ny: Vec<f32> = (0..n).map(|i| ((i % 5) as f32 - 2.0) * 0.5).collect();
    let nz = vec![1.0_f32; n];
    let j0: Vec<u16> = (0..n).map(|i| (i % 64) as u16).collect();
    let j1: Vec<u16> = (0..n).map(|i| ((i + 7) % 64) as u16).collect();
    let j2: Vec<u16> = (0..n).map(|i| ((i + 13) % 64) as u16).collect();
    let j3: Vec<u16> = (0..n).map(|i| ((i + 29) % 64) as u16).collect();
    let (w0, w1, w2, w3) = (vec![0.5; n], vec![0.25; n], vec![0.15; n], vec![0.10; n]);
    let input = VrmMeshSoaInput {
        pos_x: &px, pos_y: &py, pos_z: &pz, norm_x: &nx, norm_y: &ny, norm_z: &nz,
        joints: [&j0, &j1, &j2, &j3], weights: [&w0, &w1, &w2, &w3],
    };
    let (mut ox, mut oy, mut oz) = (vec![0.0; n], vec![0.0; n], vec![0.0; n]);
    let (mut onx, mut ony, mut onz) = (vec![0.0; n], vec![0.0; n], vec![0.0; n]);
    let mut out = VrmMeshSoaOutput {
        pos_x: &mut ox, pos_y: &mut oy, pos_z: &mut oz,
        norm_x: &mut onx, norm_y: &mut ony, norm_z: &mut onz,
    };
    let stats = skin_vrm_mesh_4bone_soa(&input, &bones, &mut out).expect("large ok");
    assert_eq!(stats.skinned_vertices, n);
    for i in 0..n {
        assert!(ox[i].is_finite() && oy[i].is_finite() && oz[i].is_finite());
        let nlen = (onx[i] * onx[i] + ony[i] * ony[i] + onz[i] * onz[i]).sqrt();
        assert!((nlen - 1.0).abs() < 1e-4);
    }
}

// ============================================================================
// 2. Morton Z-Order Curve & 2D 고속 BVH 테스트
// ============================================================================

#[test]
fn morton_2d_is_strictly_monotonic_along_axes_and_bijective_on_grid() {
    for y in 0..64u16 {
        let mut prev = encode_morton_2d_u32(0, y);
        for x in 1..64u16 {
            let cur = encode_morton_2d_u32(x, y);
            assert!(cur > prev, "X축 단조성 위반: ({x},{y})");
            prev = cur;
        }
    }
    for x in 0..64u16 {
        let mut prev = encode_morton_2d_u32(x, 0);
        for y in 1..64u16 {
            let cur = encode_morton_2d_u32(x, y);
            assert!(cur > prev, "Y축 단조성 위반: ({x},{y})");
            prev = cur;
        }
    }
    // 64x64 그리드 내 충돌 0건 (전단사 검증)
    let mut seen = Vec::with_capacity(64 * 64);
    for y in 0..64u16 {
        for x in 0..64u16 {
            seen.push(encode_morton_2d_u32(x, y));
        }
    }
    seen.sort_unstable();
    seen.dedup();
    assert_eq!(seen.len(), 64 * 64);
}

#[test]
fn morton_3d_is_strictly_monotonic_along_xyz_and_clamps_overflow() {
    for x in 0..16u16 {
        for y in 0..16u16 {
            let mut prev = encode_morton_3d_u32(x, y, 0);
            for z in 1..16u16 {
                let cur = encode_morton_3d_u32(x, y, z);
                assert!(cur > prev);
                prev = cur;
            }
        }
    }
    assert_eq!(encode_morton_3d_u32(1, 0, 0), 0b001);
    assert_eq!(encode_morton_3d_u32(0, 1, 0), 0b010);
    assert_eq!(encode_morton_3d_u32(0, 0, 1), 0b100);
    assert_eq!(encode_morton_3d_u32(1023, 1023, 1023), 0x3FFF_FFFF);
    assert_eq!(
        encode_morton_3d_u32(5000, 1023, 777),
        encode_morton_3d_u32(1023, 1023, 777)
    );
}

#[test]
fn morton_2d_preserves_quadrant_spatial_locality() {
    // 같은 4분면(좌하단) 내 근접 셀은 대각선 반대 4분면 셀보다 Morton 거리 차이가 훨씬 작아야 함
    let a = encode_morton_2d_u32(10, 12);
    let near = encode_morton_2d_u32(11, 13);
    let far = encode_morton_2d_u32(60_000, 60_000);
    assert!(a.abs_diff(near) < a.abs_diff(far) / 1_000_000);
}

#[test]
fn morton_bvh_2000_aabbs_matches_brute_force_100_percent() {
    let mut rng = 0x2026_52A0_CAFE_BABEu64;
    let mut aabbs = Vec::with_capacity(2000);
    for _ in 0..2000 {
        let cx = lcg_next(&mut rng) * 4000.0 - 2000.0;
        let cy = lcg_next(&mut rng) * 4000.0 - 2000.0;
        let hw = 2.0 + lcg_next(&mut rng) * 45.0;
        let hh = 2.0 + lcg_next(&mut rng) * 45.0;
        aabbs.push(Aabb2D::new(cx - hw, cy - hh, cx + hw, cy + hh));
    }

    let bvh = build_morton_bvh_2d(&aabbs).expect("build 2000 ok");
    assert_eq!(bvh.primitive_count(), 2000);
    assert!(bvh.morton_codes.windows(2).all(|w| w[0] <= w[1]));

    let queries = [
        Aabb2D::new(-5000.0, -5000.0, -4500.0, -4500.0), // 완전 미스
        Aabb2D::new(-3000.0, -3000.0, 3000.0, 3000.0),   // 전체 히트
        Aabb2D::new(-100.0, -100.0, 100.0, 100.0),       // 중앙 소형 뷰포트
        Aabb2D::new(500.0, -1800.0, 520.0, 1800.0),      // 세로 슬라이스
        Aabb2D::new(-1900.0, 400.0, 1900.0, 415.0),      // 가로 슬라이스
        Aabb2D::new(1234.0, -777.0, 1234.0, -777.0),     // 단일 점 쿼리
        Aabb2D::new(-1500.0, 800.0, -200.0, 1600.0),     // 2사분면
        Aabb2D::new(250.0, 250.0, 1100.0, 950.0),        // 1사분면
    ];

    for q in queries {
        let mut bvh_hits = query_morton_bvh_aabb(&bvh, q).expect("query ok");
        bvh_hits.sort_unstable();
        let mut brute_hits: Vec<u32> = aabbs
            .iter()
            .enumerate()
            .filter_map(|(i, b)| b.intersects(&q).then_some(i as u32))
            .collect();
        brute_hits.sort_unstable();
        assert_eq!(bvh_hits, brute_hits, "쿼리 {q:?} BVH vs 브루트포스 불일치");
    }
}

#[test]
fn morton_bvh_handles_coincident_degenerate_aabbs_and_boundary_touches() {
    // 64개 AABB가 완전히 같은 중심 좌표를 가져도 무한 재귀 없이 정확히 구축·쿼리됨
    let coincident = vec![Aabb2D::new(10.0, 20.0, 15.0, 25.0); 64];
    let bvh = build_morton_bvh_2d(&coincident).expect("coincident ok");
    let mut hits = query_morton_bvh_aabb(&bvh, Aabb2D::new(15.0, 25.0, 30.0, 40.0)).expect("touch ok");
    hits.sort_unstable();
    assert_eq!(hits, (0..64u32).collect::<Vec<_>>());

    let miss = query_morton_bvh_aabb(&bvh, Aabb2D::new(15.01, 20.0, 30.0, 40.0)).expect("miss ok");
    assert!(miss.is_empty());
}

#[test]
fn morton_bvh_handles_empty_single_and_rejects_nan_or_inverted_aabbs() {
    let empty_bvh = build_morton_bvh_2d(&[]).expect("empty ok");
    assert!(empty_bvh.is_empty());
    assert!(query_morton_bvh_aabb(&empty_bvh, Aabb2D::new(0.0, 0.0, 1.0, 1.0))
        .expect("empty query ok")
        .is_empty());

    let single = build_morton_bvh_2d(&[Aabb2D::new(-1.0, -1.0, 1.0, 1.0)]).expect("single ok");
    assert_eq!(
        query_morton_bvh_aabb(&single, Aabb2D::new(0.0, 0.0, 2.0, 2.0)).expect("hit"),
        vec![0]
    );

    // NaN / Inf / 역전된 AABB 거부 검증
    assert_eq!(
        build_morton_bvh_2d(&[Aabb2D::new(f32::NAN, 0.0, 1.0, 1.0)]),
        Err(DrawingCoreError::InvalidParameter { name: "aabbs" })
    );
    assert_eq!(
        build_morton_bvh_2d(&[Aabb2D::new(5.0, 0.0, 1.0, 1.0)]),
        Err(DrawingCoreError::InvalidParameter { name: "aabbs" })
    );
    assert_eq!(
        query_morton_bvh_aabb(&single, Aabb2D::new(0.0, f32::INFINITY, 1.0, 2.0)),
        Err(DrawingCoreError::InvalidParameter { name: "query" })
    );
    assert_eq!(
        query_morton_bvh_aabb(&single, Aabb2D::new(2.0, 0.0, 1.0, 2.0)),
        Err(DrawingCoreError::InvalidParameter { name: "query" })
    );
}

// ============================================================================
// 3. 3D G-Buffer → 웹툰 LT 선화 추출 테스트
// ============================================================================

#[test]
fn lt_lineart_flat_plane_produces_zero_percent_ink() {
    let (w, h) = (32u32, 32u32);
    let n = (w * h) as usize;
    let nx = vec![0.0_f32; n];
    let ny = vec![0.0_f32; n];
    let nz = vec![1.0_f32; n];
    let depth = vec![0.5_f32; n];
    let mut out = vec![255u8; n];

    let stats = extract_lt_lineart_from_gbuffer(
        &nx, &ny, &nz, &depth, w, h, &LtLineArtConfig::default(), &mut out,
    )
    .expect("flat ok");
    assert_eq!(stats.total_pixels, n);
    assert_eq!(stats.ink_pixels, 0);
    assert_eq!(stats.depth_edge_pixels, 0);
    assert_eq!(stats.normal_edge_pixels, 0);
    assert!(out.iter().all(|&a| a == 0));
}

#[test]
fn lt_lineart_detects_sharp_depth_silhouette_at_100_percent() {
    let (w, h) = (24u32, 16u32);
    let n = (w * h) as usize;
    let nx = vec![0.0_f32; n];
    let ny = vec![0.0_f32; n];
    let nz = vec![1.0_f32; n];
    let mut depth = vec![0.1_f32; n];
    for y in 0..h as usize {
        for x in 12..w as usize {
            depth[y * w as usize + x] = 1.0;
        }
    }
    let mut out = vec![0u8; n];
    let stats = extract_lt_lineart_from_gbuffer(
        &nx, &ny, &nz, &depth, w, h, &LtLineArtConfig::default(), &mut out,
    )
    .expect("depth edge ok");

    assert!(stats.depth_edge_pixels > 0);
    assert_eq!(stats.normal_edge_pixels, 0);
    // 깊이 단차 경계(x=11, x=12)는 100%(255) 잉크 검출, 멀리 떨어진 평면(x<=9, x>=14)은 0%
    for y in 1..(h as usize - 1) {
        assert_eq!(out[y * w as usize + 11], 255);
        assert_eq!(out[y * w as usize + 12], 255);
        assert_eq!(out[y * w as usize + 4], 0);
        assert_eq!(out[y * w as usize + 20], 0);
    }
}

#[test]
fn lt_lineart_detects_90_degree_normal_crease_at_100_percent() {
    let (w, h) = (20u32, 16u32);
    let n = (w * h) as usize;
    let mut nx = vec![0.0_f32; n];
    let ny = vec![0.0_f32; n];
    let mut nz = vec![1.0_f32; n];
    let depth = vec![0.5_f32; n];
    for y in 0..h as usize {
        for x in 10..w as usize {
            nx[y * w as usize + x] = 1.0;
            nz[y * w as usize + x] = 0.0;
        }
    }
    let mut out = vec![0u8; n];
    let stats = extract_lt_lineart_from_gbuffer(
        &nx, &ny, &nz, &depth, w, h, &LtLineArtConfig::default(), &mut out,
    )
    .expect("normal crease ok");

    assert_eq!(stats.depth_edge_pixels, 0);
    assert!(stats.normal_edge_pixels > 0);
    for y in 0..h as usize {
        assert_eq!(out[y * w as usize + 9], 255);
        assert_eq!(out[y * w as usize + 10], 255);
        assert_eq!(out[y * w as usize + 3], 0);
        assert_eq!(out[y * w as usize + 17], 0);
    }
}

#[test]
fn lt_lineart_extracts_3d_box_silhouette_and_inner_ridge_cleanly() {
    let (w, h) = (32u32, 32u32);
    let n = (w * h) as usize;
    let mut nx = vec![0.0_f32; n];
    let ny = vec![0.0_f32; n];
    let mut nz = vec![1.0_f32; n];
    let mut depth = vec![1.0_f32; n];

    // 중앙 3D 박스: x∈[8..24), y∈[8..24), 깊이 0.2. 좌반부 앞면(0,0,1), 우반부 측면(1,0,0)
    for y in 8..24usize {
        for x in 8..24usize {
            let idx = y * w as usize + x;
            depth[idx] = 0.2;
            if x >= 16 {
                nx[idx] = 1.0;
                nz[idx] = 0.0;
            }
        }
    }
    let mut out = vec![0u8; n];
    let stats = extract_lt_lineart_from_gbuffer(
        &nx, &ny, &nz, &depth, w, h, &LtLineArtConfig::default(), &mut out,
    )
    .expect("3d box ok");

    assert!(stats.depth_edge_pixels > 0 && stats.normal_edge_pixels > 0);
    // 외곽 실루엣(x=8, y=12)과 내부 90° 모서리(x=16, y=16)는 255 잉크
    assert_eq!(out[12 * 32 + 8], 255);
    assert_eq!(out[16 * 32 + 16], 255);
    // 배경(2,2)과 박스 평면 내부(12,12 / 20,16)는 0% 클린
    assert_eq!(out[2 * 32 + 2], 0);
    assert_eq!(out[12 * 32 + 12], 0);
    assert_eq!(out[16 * 32 + 20], 0);
}

#[test]
fn lt_lineart_4wide_interior_matches_reference_scalar_on_non_aligned_dimensions() {
    let (w, h) = (19u32, 13u32);
    let n = (w * h) as usize;
    let mut rng = 0x52A_1234_9999u64;
    let nx: Vec<f32> = (0..n).map(|_| lcg_next(&mut rng) * 2.0 - 1.0).collect();
    let ny: Vec<f32> = (0..n).map(|_| lcg_next(&mut rng) * 2.0 - 1.0).collect();
    let nz: Vec<f32> = (0..n).map(|_| 0.2 + lcg_next(&mut rng)).collect();
    let depth: Vec<f32> = (0..n).map(|_| lcg_next(&mut rng)).collect();
    let cfg = LtLineArtConfig {
        depth_threshold: 0.18,
        normal_edge_threshold: 0.22,
        depth_weight: 1.0,
        normal_weight: 0.9,
        edge_softness: 0.12,
        min_ink_alpha: 12,
    };
    let mut out = vec![0u8; n];
    let stats = extract_lt_lineart_from_gbuffer(&nx, &ny, &nz, &depth, w, h, &cfg, &mut out)
        .expect("non-aligned ok");

    // 동일 입력 재실행 결정론 + 독립 스칼라 Sobel/법선 내적 참조 구현과 픽셀 단위 100% 일치 확인
    let mut out2 = vec![0u8; n];
    let stats2 = extract_lt_lineart_from_gbuffer(&nx, &ny, &nz, &depth, w, h, &cfg, &mut out2)
        .expect("repeat ok");
    assert_eq!(out, out2);
    assert_eq!(stats, stats2);
    assert!(out.iter().all(|&a| a == 0 || a >= cfg.min_ink_alpha));
    assert_eq!(stats.ink_pixels, out.iter().filter(|&&a| a > 0).count());

    let unit = |idx: usize| -> [f32; 3] {
        let len = (nx[idx] * nx[idx] + ny[idx] * ny[idx] + nz[idx] * nz[idx]).sqrt();
        [nx[idx] / len, ny[idx] / len, nz[idx] / len]
    };
    let smooth = |e0: f32, e1: f32, v: f32| -> f32 {
        if v <= e0 { return 0.0; }
        let t = ((v - e0) / (e1 - e0)).clamp(0.0, 1.0);
        t * t * (3.0 - 2.0 * t)
    };
    let (wu, hu) = (w as usize, h as usize);
    for y in 0..hu {
        let ym = y.saturating_sub(1);
        let yp = (y + 1).min(hu - 1);
        for x in 0..wu {
            let xm = x.saturating_sub(1);
            let xp = (x + 1).min(wu - 1);
            let d = |xx: usize, yy: usize| depth[yy * wu + xx];
            let gx = (-d(xm, ym) + d(xp, ym)) + 2.0 * (-d(xm, y) + d(xp, y)) + (-d(xm, yp) + d(xp, yp));
            let gy = (-d(xm, ym) - 2.0 * d(x, ym) - d(xp, ym)) + (d(xm, yp) + 2.0 * d(x, yp) + d(xp, yp));
            let dg = (gx * gx + gy * gy).sqrt() * 0.25;
            let nc = unit(y * wu + x);
            let dot = |o: [f32; 3]| (nc[0] * o[0] + nc[1] * o[1] + nc[2] * o[2]).clamp(-1.0, 1.0);
            let nd = (1.0 - dot(unit(y * wu + xm)))
                .max(1.0 - dot(unit(y * wu + xp)))
                .max(1.0 - dot(unit(ym * wu + x)))
                .max(1.0 - dot(unit(yp * wu + x)));
            let dr = smooth(cfg.depth_threshold, cfg.depth_threshold + cfg.edge_softness, dg);
            let nr = smooth(cfg.normal_edge_threshold, cfg.normal_edge_threshold + cfg.edge_softness, nd);
            let raw = ((dr * cfg.depth_weight).max(nr * cfg.normal_weight).clamp(0.0, 1.0) * 255.0).round() as u8;
            let expected = if raw < cfg.min_ink_alpha { 0 } else { raw };
            assert_eq!(out[y * wu + x], expected, "픽셀 ({x},{y}) 4-와이드 vs 스칼라 참조 불일치");
        }
    }
}

#[test]
fn lt_lineart_handles_tiny_dimensions_hard_edges_and_sanitizes_nan_inf() {
    // 1x1 최소 크기 + NaN/Inf 정제 안전성
    let mut out1 = [99u8; 1];
    let s1 = extract_lt_lineart_from_gbuffer(
        &[f32::NAN], &[0.0], &[1.0], &[f32::INFINITY], 1, 1, &LtLineArtConfig::default(), &mut out1,
    )
    .expect("1x1 nan ok");
    assert_eq!(s1.sanitized_nan_pixels, 1);
    assert_eq!(out1[0], 0);

    // 8x8에 NaN 2픽셀 주입해도 크래시·전파 없이 처리
    let (w, h) = (8u32, 8u32);
    let n = (w * h) as usize;
    let mut nx = vec![0.0_f32; n];
    let ny = vec![0.0_f32; n];
    let nz = vec![1.0_f32; n];
    let mut depth = vec![0.0_f32; n];
    nx[10] = f32::NAN;
    depth[20] = f32::NEG_INFINITY;
    let mut out = vec![0u8; n];
    let hard_cfg = LtLineArtConfig { edge_softness: 0.0, ..LtLineArtConfig::default() };
    let stats = extract_lt_lineart_from_gbuffer(&nx, &ny, &nz, &depth, w, h, &hard_cfg, &mut out)
        .expect("8x8 nan ok");
    assert_eq!(stats.sanitized_nan_pixels, 2);
    assert!(out.iter().all(|&a| a == 0 || a == 255));
}

#[test]
fn lt_lineart_rejects_invalid_dimensions_buffers_and_config() {
    let cfg = LtLineArtConfig::default();
    let mut out = vec![0u8; 4];
    assert_eq!(
        extract_lt_lineart_from_gbuffer(&[], &[], &[], &[], 0, 4, &cfg, &mut []),
        Err(DrawingCoreError::InvalidDimensions { width: 0, height: 4 })
    );
    assert_eq!(
        extract_lt_lineart_from_gbuffer(&[0.0; 3], &[0.0; 4], &[1.0; 4], &[0.0; 4], 2, 2, &cfg, &mut out),
        Err(DrawingCoreError::BufferLengthMismatch { expected: 4, actual: 3 })
    );
    let bad_cfg = LtLineArtConfig { depth_threshold: f32::NAN, ..cfg };
    assert_eq!(
        extract_lt_lineart_from_gbuffer(&[0.0; 4], &[0.0; 4], &[1.0; 4], &[0.0; 4], 2, 2, &bad_cfg, &mut out),
        Err(DrawingCoreError::InvalidParameter { name: "config" })
    );
    let bad_norm_cfg = LtLineArtConfig { normal_edge_threshold: 2.5, ..cfg };
    assert_eq!(
        extract_lt_lineart_from_gbuffer(&[0.0; 4], &[0.0; 4], &[1.0; 4], &[0.0; 4], 2, 2, &bad_norm_cfg, &mut out),
        Err(DrawingCoreError::InvalidParameter { name: "config" })
    );
}

#[test]
fn end_to_end_vrm_skinning_to_morton_bvh_culling_pipeline() {
    // 스키닝된 VRM 정점 160개를 40개 삼각형 AABB로 투영해 Morton BVH 프러스텀 컬링 검증
    let tri_count = 40usize;
    let v_count = tri_count * 3;
    let bones = [mat4_translation(12.0, -4.0, 0.0), mat4_rot_z(0.35)];
    let px: Vec<f32> = (0..v_count).map(|i| (i % 20) as f32 * 3.0).collect();
    let py: Vec<f32> = (0..v_count).map(|i| (i / 20) as f32 * 4.0).collect();
    let pz = vec![0.0_f32; v_count];
    let (nx, ny, nz) = (vec![0.0; v_count], vec![0.0; v_count], vec![1.0; v_count]);
    let j0: Vec<u16> = (0..v_count).map(|i| (i % 2) as u16).collect();
    let jz = vec![0u16; v_count];
    let (w0, zw) = (vec![1.0_f32; v_count], vec![0.0_f32; v_count]);
    let input = VrmMeshSoaInput {
        pos_x: &px, pos_y: &py, pos_z: &pz, norm_x: &nx, norm_y: &ny, norm_z: &nz,
        joints: [&j0, &jz, &jz, &jz], weights: [&w0, &zw, &zw, &zw],
    };
    let (mut ox, mut oy, mut oz) = (vec![0.0; v_count], vec![0.0; v_count], vec![0.0; v_count]);
    let (mut onx, mut ony, mut onz) = (vec![0.0; v_count], vec![0.0; v_count], vec![0.0; v_count]);
    let mut out = VrmMeshSoaOutput {
        pos_x: &mut ox, pos_y: &mut oy, pos_z: &mut oz,
        norm_x: &mut onx, norm_y: &mut ony, norm_z: &mut onz,
    };
    skin_vrm_mesh_4bone_soa(&input, &bones, &mut out).expect("e2e skin ok");

    let mut tri_aabbs = Vec::with_capacity(tri_count);
    for t in 0..tri_count {
        let i0 = t * 3;
        let min_x = ox[i0].min(ox[i0 + 1]).min(ox[i0 + 2]);
        let max_x = ox[i0].max(ox[i0 + 1]).max(ox[i0 + 2]);
        let min_y = oy[i0].min(oy[i0 + 1]).min(oy[i0 + 2]);
        let max_y = oy[i0].max(oy[i0 + 1]).max(oy[i0 + 2]);
        tri_aabbs.push(Aabb2D::new(min_x, min_y, max_x, max_y));
    }
    let bvh = build_morton_bvh_2d(&tri_aabbs).expect("e2e bvh ok");
    let view = Aabb2D::new(10.0, 0.0, 45.0, 20.0);
    let mut bvh_hits = query_morton_bvh_aabb(&bvh, view).expect("e2e query ok");
    bvh_hits.sort_unstable();
    let brute: Vec<u32> = tri_aabbs
        .iter()
        .enumerate()
        .filter_map(|(i, b)| b.intersects(&view).then_some(i as u32))
        .collect();
    assert_eq!(bvh_hits, brute);
    assert!(!bvh_hits.is_empty());
}

#[cfg(feature = "extended-3d")]
#[test]
fn extended_3d_wasm_ffi_exports_match_safe_kernels_and_guard_bad_ptrs() {
    use studio_wasm64_drawing_core::{
        wasm_alloc, wasm_encode_morton_2d_u32, wasm_encode_morton_3d_u32,
        wasm_extended_3d_capabilities, wasm_extract_lt_lineart_from_gbuffer, wasm_free,
        wasm_skin_vrm_mesh_4bone_soa, LT_LINEART_FFI_PARAM_COUNT, WASM_EXTENDED_3D_CAPABILITIES,
    };

    assert_eq!(wasm_extended_3d_capabilities(), WASM_EXTENDED_3D_CAPABILITIES);
    assert_eq!(wasm_encode_morton_2d_u32(13, 27), encode_morton_2d_u32(13, 27));
    assert_eq!(wasm_encode_morton_3d_u32(13, 27, 41), encode_morton_3d_u32(13, 27, 41));

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
            pos_x: &in_pos[0..n], pos_y: &in_pos[n..2 * n], pos_z: &in_pos[2 * n..3 * n],
            norm_x: &in_norm[0..n], norm_y: &in_norm[n..2 * n], norm_z: &in_norm[2 * n..3 * n],
            joints: [&joints[0..n], &joints[n..2 * n], &joints[2 * n..3 * n], &joints[3 * n..4 * n]],
            weights: [&weights[0..n], &weights[n..2 * n], &weights[2 * n..3 * n], &weights[3 * n..4 * n]],
        };
        let mut out = VrmMeshSoaOutput { pos_x: opx, pos_y: opy, pos_z: opz, norm_x: onx, norm_y: ony, norm_z: onz };
        skin_vrm_mesh_4bone_soa(&inp, &bones, &mut out).expect("safe skin");
    }

    let xyz_bytes = 3 * n * std::mem::size_of::<f32>();
    let out_pos_ptr = wasm_alloc(xyz_bytes) as *mut f32;
    let out_norm_ptr = wasm_alloc(xyz_bytes) as *mut f32;
    assert!(!out_pos_ptr.is_null() && !out_norm_ptr.is_null());

    // 2) LT 선화 FFI vs 안전 커널 비트 일치
    let (w, h) = (12u32, 10u32);
    let p = (w * h) as usize;
    let mut g_norm = vec![0.0_f32; 3 * p];
    for i in 0..p { g_norm[2 * p + i] = 1.0; }
    let mut g_depth = vec![0.1_f32; p];
    for y in 0..h as usize {
        for x in 6..w as usize { g_depth[y * w as usize + x] = 1.0; }
    }
    let lt_params: [f32; LT_LINEART_FFI_PARAM_COUNT] = [0.15, 0.25, 1.0, 1.0, 0.15, 0.0];
    let mut safe_lt = vec![0u8; p];
    let safe_lt_stats = extract_lt_lineart_from_gbuffer(
        &g_norm[0..p], &g_norm[p..2 * p], &g_norm[2 * p..3 * p],
        &g_depth, w, h, &LtLineArtConfig::default(), &mut safe_lt,
    )
    .expect("safe lt");
    let out_lt_ptr = wasm_alloc(p);
    assert!(!out_lt_ptr.is_null());

    // SAFETY: `wasm_alloc`으로 할당된 16바이트 정렬 비중첩 버퍼에 대해 확장 3D FFI를 검증한다.
    unsafe {
        let rc_skin = wasm_skin_vrm_mesh_4bone_soa(
            in_pos.as_ptr(), in_norm.as_ptr(), joints.as_ptr(), weights.as_ptr(),
            bones.as_ptr().cast::<f32>(), out_pos_ptr, out_norm_ptr, n as u32, bones.len() as u32,
        );
        assert_eq!(rc_skin, n as i32);
        assert_eq!(std::slice::from_raw_parts(out_pos_ptr, 3 * n), safe_pos.as_slice());
        assert_eq!(std::slice::from_raw_parts(out_norm_ptr, 3 * n), safe_norm.as_slice());

        // aliasing / null / bone_count=0 방어 확인
        assert!(wasm_skin_vrm_mesh_4bone_soa(
            out_pos_ptr, in_norm.as_ptr(), joints.as_ptr(), weights.as_ptr(),
            bones.as_ptr().cast::<f32>(), out_pos_ptr, out_norm_ptr, n as u32, bones.len() as u32,
        ) < 0);
        assert!(wasm_skin_vrm_mesh_4bone_soa(
            in_pos.as_ptr(), in_norm.as_ptr(), joints.as_ptr(), weights.as_ptr(),
            bones.as_ptr().cast::<f32>(), out_pos_ptr, out_norm_ptr, n as u32, 0,
        ) < 0);

        let rc_lt = wasm_extract_lt_lineart_from_gbuffer(
            g_norm.as_ptr(), g_depth.as_ptr(), out_lt_ptr, w, h, lt_params.as_ptr(),
        );
        assert_eq!(rc_lt, safe_lt_stats.ink_pixels as i32);
        assert_eq!(std::slice::from_raw_parts(out_lt_ptr, p), safe_lt.as_slice());
        assert!(wasm_extract_lt_lineart_from_gbuffer(
            std::ptr::null(), g_depth.as_ptr(), out_lt_ptr, w, h, std::ptr::null(),
        ) < 0);

        wasm_free(out_pos_ptr as *mut u8, xyz_bytes);
        wasm_free(out_norm_ptr as *mut u8, xyz_bytes);
        wasm_free(out_lt_ptr, p);
    }
}
