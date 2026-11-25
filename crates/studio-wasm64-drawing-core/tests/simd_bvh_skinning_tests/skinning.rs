use super::*;

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
            pos_x: &px,
            pos_y: &py,
            pos_z: &pz,
            norm_x: &nx,
            norm_y: &ny,
            norm_z: &nz,
            joints: [&j0, &j0, &j0, &j0],
            weights: [&w0, &zw, &zw, &zw],
        };
        let (mut ox, mut oy, mut oz) = (vec![0.0; count], vec![0.0; count], vec![0.0; count]);
        let (mut onx, mut ony, mut onz) = (vec![0.0; count], vec![0.0; count], vec![0.0; count]);
        let mut out = VrmMeshSoaOutput {
            pos_x: &mut ox,
            pos_y: &mut oy,
            pos_z: &mut oz,
            norm_x: &mut onx,
            norm_y: &mut ony,
            norm_z: &mut onz,
        };
        let stats =
            skin_vrm_mesh_4bone_soa(&input, &[IDENTITY_MAT4], &mut out).expect("identity ok");
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
        pos_x: &px,
        pos_y: &py,
        pos_z: &pz,
        norm_x: &nx,
        norm_y: &ny,
        norm_z: &nz,
        joints: [&j0, &jz, &jz, &jz],
        weights: [&w0, &zw, &zw, &zw],
    };
    let (mut ox, mut oy, mut oz) = ([0.0; 5], [0.0; 5], [0.0; 5]);
    let (mut onx, mut ony, mut onz) = ([0.0; 5], [0.0; 5], [0.0; 5]);
    let mut out = VrmMeshSoaOutput {
        pos_x: &mut ox,
        pos_y: &mut oy,
        pos_z: &mut oz,
        norm_x: &mut onx,
        norm_y: &mut ony,
        norm_z: &mut onz,
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
        pos_x: &px,
        pos_y: &py,
        pos_z: &pz,
        norm_x: &nx,
        norm_y: &ny,
        norm_z: &nz,
        joints: [&j0, &j1, &j2, &j3],
        weights: [&w0, &w1, &w2, &w3],
    };
    let (mut ox, mut oy, mut oz) = (vec![0.0; n], vec![0.0; n], vec![0.0; n]);
    let (mut onx, mut ony, mut onz) = (vec![0.0; n], vec![0.0; n], vec![0.0; n]);
    let mut out = VrmMeshSoaOutput {
        pos_x: &mut ox,
        pos_y: &mut oy,
        pos_z: &mut oz,
        norm_x: &mut onx,
        norm_y: &mut ony,
        norm_z: &mut onz,
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
    let (nx, ny, nz) = (
        [3.0, 0.0, 1.0, 0.0],
        [4.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
    );
    let (j0, w0, zw) = ([0u16; 4], [1.0_f32; 4], [0.0_f32; 4]);
    let input = VrmMeshSoaInput {
        pos_x: &px,
        pos_y: &py,
        pos_z: &pz,
        norm_x: &nx,
        norm_y: &ny,
        norm_z: &nz,
        joints: [&j0, &j0, &j0, &j0],
        weights: [&w0, &zw, &zw, &zw],
    };
    let (mut ox, mut oy, mut oz, mut onx, mut ony, mut onz) =
        ([0.0; 4], [0.0; 4], [0.0; 4], [0.0; 4], [0.0; 4], [0.0; 4]);
    let mut out = VrmMeshSoaOutput {
        pos_x: &mut ox,
        pos_y: &mut oy,
        pos_z: &mut oz,
        norm_x: &mut onx,
        norm_y: &mut ony,
        norm_z: &mut onz,
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
        pos_x: &px,
        pos_y: &py,
        pos_z: &pz,
        norm_x: &nx,
        norm_y: &ny,
        norm_z: &nz,
        joints: [&j0, &jz, &jz, &jz],
        weights: [&w0, &w1, &zw, &zw],
    };
    let (mut ox, mut oy, mut oz, mut onx, mut ony, mut onz) =
        ([0.0; 5], [0.0; 5], [0.0; 5], [0.0; 5], [0.0; 5], [0.0; 5]);
    let mut out = VrmMeshSoaOutput {
        pos_x: &mut ox,
        pos_y: &mut oy,
        pos_z: &mut oz,
        norm_x: &mut onx,
        norm_y: &mut ony,
        norm_z: &mut onz,
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
        pos_x: &empty_f,
        pos_y: &empty_f,
        pos_z: &empty_f,
        norm_x: &empty_f,
        norm_y: &empty_f,
        norm_z: &empty_f,
        joints: [&empty_j; 4],
        weights: [&empty_f; 4],
    };
    let (mut e1, mut e2, mut e3, mut e4, mut e5, mut e6) = ([], [], [], [], [], []);
    let mut out_empty = VrmMeshSoaOutput {
        pos_x: &mut e1,
        pos_y: &mut e2,
        pos_z: &mut e3,
        norm_x: &mut e4,
        norm_y: &mut e5,
        norm_z: &mut e6,
    };
    assert_eq!(
        skin_vrm_mesh_4bone_soa(&inp_empty, &[], &mut out_empty),
        Err(DrawingCoreError::InvalidParameter {
            name: "bone_matrices"
        })
    );

    let a2 = [0.0_f32; 2];
    let a1 = [0.0_f32; 1];
    let j2 = [0u16; 2];
    let inp_bad = VrmMeshSoaInput {
        pos_x: &a2,
        pos_y: &a1,
        pos_z: &a2,
        norm_x: &a2,
        norm_y: &a2,
        norm_z: &a2,
        joints: [&j2; 4],
        weights: [&a2; 4],
    };
    let (mut o1, mut o2, mut o3, mut o4, mut o5, mut o6) =
        ([0.0; 2], [0.0; 2], [0.0; 2], [0.0; 2], [0.0; 2], [0.0; 2]);
    let mut out_ok = VrmMeshSoaOutput {
        pos_x: &mut o1,
        pos_y: &mut o2,
        pos_z: &mut o3,
        norm_x: &mut o4,
        norm_y: &mut o5,
        norm_z: &mut o6,
    };
    assert_eq!(
        skin_vrm_mesh_4bone_soa(&inp_bad, &[IDENTITY_MAT4], &mut out_ok),
        Err(DrawingCoreError::BufferLengthMismatch {
            expected: 2,
            actual: 1
        })
    );
}

#[test]
fn skinning_large_2049_vertex_mesh_is_deterministic_and_unit_normal() {
    let n = 2049usize;
    let bones: Vec<[f32; 16]> = (0..64).map(|b| mat4_rot_z(b as f32 * 0.1)).collect();
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
        pos_x: &px,
        pos_y: &py,
        pos_z: &pz,
        norm_x: &nx,
        norm_y: &ny,
        norm_z: &nz,
        joints: [&j0, &j1, &j2, &j3],
        weights: [&w0, &w1, &w2, &w3],
    };
    let (mut ox, mut oy, mut oz) = (vec![0.0; n], vec![0.0; n], vec![0.0; n]);
    let (mut onx, mut ony, mut onz) = (vec![0.0; n], vec![0.0; n], vec![0.0; n]);
    let mut out = VrmMeshSoaOutput {
        pos_x: &mut ox,
        pos_y: &mut oy,
        pos_z: &mut oz,
        norm_x: &mut onx,
        norm_y: &mut ony,
        norm_z: &mut onz,
    };
    let stats = skin_vrm_mesh_4bone_soa(&input, &bones, &mut out).expect("large ok");
    assert_eq!(stats.skinned_vertices, n);
    for i in 0..n {
        assert!(ox[i].is_finite() && oy[i].is_finite() && oz[i].is_finite());
        let nlen = (onx[i] * onx[i] + ony[i] * ony[i] + onz[i] * onz[i]).sqrt();
        assert!((nlen - 1.0).abs() < 1e-4);
    }
}
