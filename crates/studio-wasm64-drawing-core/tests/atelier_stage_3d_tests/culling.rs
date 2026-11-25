use super::*;

/// 해석적 3D 레이-AABB 교차 검사 (광선 P(t) = origin + t*(target-origin), t ∈ (0, 1)).
fn ray_hits_aabb_before_target(origin: [f32; 3], target: [f32; 3], b: &StageObjectAabb) -> bool {
    let d = [
        target[0] - origin[0],
        target[1] - origin[1],
        target[2] - origin[2],
    ];
    let (mut tmin, mut tmax) = (0.0_f32, 1.0_f32);
    for a in 0..3 {
        if d[a].abs() < 1e-8 {
            if origin[a] < b.min[a] || origin[a] > b.max[a] {
                return false;
            }
        } else {
            let inv = 1.0 / d[a];
            let mut t0 = (b.min[a] - origin[a]) * inv;
            let mut t1 = (b.max[a] - origin[a]) * inv;
            if t0 > t1 {
                std::mem::swap(&mut t0, &mut t1);
            }
            tmin = tmin.max(t0);
            tmax = tmax.min(t1);
            if tmin > tmax {
                return false;
            }
        }
    }
    tmin > 1e-5 && tmin < 1.0 - 1e-4
}

#[test]
fn cull_6plane_frustum_rejects_outside_all_six_planes_and_keeps_inside() {
    let cfg = std_camera_cfg(StageDepthRange::NegOneToOne);
    let objs = [
        box_at(0.0, 1.6, -10.0, 0.5, 0.5, 0.5, false),
        box_at(-40.0, 1.6, -10.0, 0.5, 0.5, 0.5, false),
        box_at(40.0, 1.6, -10.0, 0.5, 0.5, 0.5, false),
        box_at(0.0, 30.0, -10.0, 0.5, 0.5, 0.5, false),
        box_at(0.0, -30.0, -10.0, 0.5, 0.5, 0.5, false),
        box_at(0.0, 1.6, 5.0, 0.5, 0.5, 0.5, false),
        box_at(0.0, 1.6, -140.0, 0.5, 0.5, 0.5, false),
        box_at(-2.0, 1.0, -20.0, 1.0, 1.0, 1.0, false),
    ];
    let res = cull_scene_frustum_and_hiz(&objs, &cfg).expect("cull ok");
    assert_eq!(res.visible_indices, vec![0, 7]);
    assert_eq!(res.frustum_culled_count, 6);
    assert_eq!(res.occlusion_culled_count, 0);
}

#[test]
fn cull_hiz_aggressively_culls_objects_behind_large_occluder_wall() {
    let cfg = std_camera_cfg(StageDepthRange::NegOneToOne);
    let mut objs = vec![box_at(0.0, 1.6, -5.0, 4.0, 3.0, 0.3, true)];
    for i in 0..32 {
        let x = -1.5 + (i % 8) as f32 * 0.4;
        let y = 0.6 + (i / 8) as f32 * 0.5;
        objs.push(box_at(x, y, -18.0 - (i as f32 * 0.5), 0.2, 0.2, 0.2, false));
    }
    let res = cull_scene_frustum_and_hiz(&objs, &cfg).expect("cull ok");
    assert_eq!(res.occluders_rasterized, 1);
    assert_eq!(res.visible_indices, vec![0]);
    assert_eq!(res.occlusion_culled_count, 32);
}

#[test]
fn cull_hiz_zero_false_negatives_for_peeking_and_foreground_objects() {
    let cfg = std_camera_cfg(StageDepthRange::NegOneToOne);
    let objs = [
        box_at(0.0, 1.6, -6.0, 1.5, 1.2, 0.25, true),
        box_at(0.0, 1.6, -15.0, 0.4, 0.4, 0.4, false),
        box_at(0.0, 1.6, -3.0, 0.4, 0.4, 0.4, false),
        box_at(4.5, 1.6, -15.0, 0.5, 0.5, 0.5, false),
        box_at(-4.5, 1.6, -15.0, 0.5, 0.5, 0.5, false),
        box_at(0.0, 1.6, -15.0, 4.2, 0.3, 0.3, false),
    ];
    let res = cull_scene_frustum_and_hiz(&objs, &cfg).expect("cull ok");
    assert!(res.visible_indices.contains(&0));
    assert!(!res.visible_indices.contains(&1));
    for must_keep in [2u32, 3, 4, 5] {
        assert!(res.visible_indices.contains(&must_keep));
    }
}

#[test]
fn cull_hiz_zero_false_negatives_proof_against_analytic_3d_ray_oracle() {
    let eye = [6.5, 3.2, 9.0];
    let vp = build_stage_view_proj_rh(
        eye,
        [-1.0, 1.2, -14.0],
        [0.0, 1.0, 0.0],
        FRAC_PI_3,
        16.0 / 9.0,
        0.5,
        150.0,
        StageDepthRange::NegOneToOne,
    )
    .expect("vp");
    let cfg = StageCullingConfig::new(vp, eye);
    let mut rng = 0x5EED_60B1_u64;
    let mut objs = vec![
        box_at(1.0, 2.0, -4.0, 3.8, 3.2, 0.5, true),
        box_at(-4.5, 2.0, -8.0, 2.8, 3.0, 0.6, true),
        box_at(5.0, 1.8, -11.0, 2.2, 2.6, 0.5, true),
    ];
    for _ in 0..500 {
        let cx = -16.0 + lcg_f32(&mut rng) * 32.0;
        let cy = -2.0 + lcg_f32(&mut rng) * 8.0;
        let cz = -60.0 + lcg_f32(&mut rng) * 58.0;
        let h = 0.15 + lcg_f32(&mut rng) * 0.7;
        objs.push(box_at(cx, cy, cz, h, h, h, false));
    }
    let res = cull_scene_frustum_and_hiz(&objs, &cfg).expect("cull");
    assert!(res.occlusion_culled_count > 20, "실제 차폐 컬링 발생 필요");
    let vis_set: BTreeSet<u32> = res.visible_indices.iter().copied().collect();
    let occluders = &objs[..3];

    let objs_no_occ: Vec<_> = objs
        .iter()
        .map(|o| StageObjectAabb::new(o.min, o.max, false))
        .collect();
    let frustum_only = cull_scene_frustum_and_hiz(&objs_no_occ, &cfg).expect("frustum only");
    let mut false_negatives = 0usize;
    for idx in frustum_only.visible_indices {
        if vis_set.contains(&idx) {
            continue;
        }
        let b = &objs[idx as usize];
        let mid = [
            0.5 * (b.min[0] + b.max[0]),
            0.5 * (b.min[1] + b.max[1]),
            0.5 * (b.min[2] + b.max[2]),
        ];
        let mut samples = vec![mid];
        for mask in 0..8usize {
            samples.push([
                if (mask & 1) == 0 { b.min[0] } else { b.max[0] },
                if (mask & 2) == 0 { b.min[1] } else { b.max[1] },
                if (mask & 4) == 0 { b.min[2] } else { b.max[2] },
            ]);
        }
        for pt in samples {
            if !occluders
                .iter()
                .any(|occ| ray_hits_aabb_before_target(eye, pt, occ))
            {
                false_negatives += 1;
            }
        }
    }
    assert_eq!(
        false_negatives, 0,
        "Hi-Z false-negative는 반드시 0건이어야 함"
    );
}

#[test]
fn cull_hiz_occluder_never_self_occludes_and_handles_near_plane_wall() {
    let cfg = std_camera_cfg(StageDepthRange::NegOneToOne);
    let objs = [
        StageObjectAabb::new([-3.0, -1.0, -4.0], [3.0, 4.0, 0.2], true),
        box_at(0.0, 1.5, -14.0, 0.3, 0.3, 0.3, false),
        box_at(0.0, 1.6, -3.5, 0.8, 0.8, 0.4, true),
    ];
    let res = cull_scene_frustum_and_hiz(&objs, &cfg).expect("cull ok");
    assert!(res.visible_indices.contains(&0));
    assert!(res.visible_indices.contains(&2));
}

#[test]
fn cull_lod_selection_0_to_3_uses_closest_aabb_distance() {
    let cfg = std_camera_cfg(StageDepthRange::NegOneToOne);
    let objs = [
        box_at(0.0, 1.6, -5.0, 0.5, 0.5, 0.5, false),
        box_at(0.0, 1.6, -18.0, 0.5, 0.5, 0.5, false),
        box_at(0.0, 1.6, -40.0, 0.5, 0.5, 0.5, false),
        box_at(0.0, 1.6, -90.0, 0.5, 0.5, 0.5, false),
        StageObjectAabb::new([2.0, 0.0, -36.0], [4.0, 3.0, -4.0], false),
    ];
    let res = cull_scene_frustum_and_hiz(&objs, &cfg).expect("cull ok");
    assert_eq!(res.visible_indices, vec![0, 1, 2, 3, 4]);
    assert_eq!(res.visible_lods, vec![0, 1, 2, 3, 0]);
    assert_eq!(res.lod_counts, [2, 1, 1, 1]);
}

#[test]
fn cull_zero_to_one_depth_mode_matches_neg_one_to_one() {
    let cfg_gl = std_camera_cfg(StageDepthRange::NegOneToOne);
    let cfg_gpu = std_camera_cfg(StageDepthRange::ZeroToOne);
    let objs = [
        box_at(0.0, 1.6, -5.0, 4.0, 3.0, 0.3, true),
        box_at(0.0, 1.6, -20.0, 0.5, 0.5, 0.5, false),
        box_at(0.0, 1.6, -2.5, 0.4, 0.4, 0.4, false),
        box_at(0.0, 1.6, 5.0, 0.5, 0.5, 0.5, false),
    ];
    let r_gl = cull_scene_frustum_and_hiz(&objs, &cfg_gl).expect("gl");
    let r_gpu = cull_scene_frustum_and_hiz(&objs, &cfg_gpu).expect("gpu");
    assert_eq!(r_gl.visible_indices, vec![0, 2]);
    assert_eq!(r_gpu.visible_indices, r_gl.visible_indices);
    assert_eq!(r_gpu.visible_lods, r_gl.visible_lods);
    assert_eq!(r_gpu.occlusion_culled_count, 1);
    assert_eq!(r_gpu.frustum_culled_count, 1);
}

#[test]
fn cull_10000_stage_objects_scale_and_determinism() {
    let cfg = std_camera_cfg(StageDepthRange::NegOneToOne);
    let mut rng = 0xCAFE_60B0_u64;
    let mut objs = Vec::with_capacity(10_005);
    objs.push(box_at(0.0, 1.6, -4.0, 5.5, 3.5, 0.3, true));
    for _ in 0..10_004 {
        let x = -80.0 + lcg_f32(&mut rng) * 160.0;
        let y = -35.0 + lcg_f32(&mut rng) * 70.0;
        let z = -150.0 + lcg_f32(&mut rng) * 200.0;
        objs.push(box_at(x, y, z, 0.35, 0.35, 0.35, false));
    }
    let r1 = cull_scene_frustum_and_hiz(&objs, &cfg).expect("run1");
    let r2 = cull_scene_frustum_and_hiz(&objs, &cfg).expect("run2");
    assert_eq!(r1, r2);
    assert_eq!(
        r1.visible_indices.len() + r1.frustum_culled_count + r1.occlusion_culled_count,
        objs.len()
    );
    assert!(r1.frustum_culled_count > 5_000);
    assert!(r1.occlusion_culled_count > 500);
}

#[test]
fn cull_rejects_invalid_inputs_without_partial_output() {
    let mut cfg = std_camera_cfg(StageDepthRange::NegOneToOne);
    let objs = [box_at(0.0, 1.6, -5.0, 0.5, 0.5, 0.5, false)];
    let mut out_idx = [99u32; 1];
    let mut out_lod = [99u8; 1];

    let bad_obj = [StageObjectAabb::new(
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 1.0],
        false,
    )];
    assert!(matches!(
        cull_scene_frustum_and_hiz_into(&bad_obj, &cfg, &mut out_idx, &mut out_lod),
        Err(DrawingCoreError::InvalidParameter { .. })
    ));
    assert_eq!(out_idx, [99]);
    assert_eq!(out_lod, [99]);

    assert!(matches!(
        cull_scene_frustum_and_hiz_into(&objs, &cfg, &mut [], &mut out_lod),
        Err(DrawingCoreError::BufferLengthMismatch { .. })
    ));
    cfg.lod_distances = [20.0, 10.0, 40.0];
    assert!(cull_scene_frustum_and_hiz(&objs, &cfg).is_err());
    cfg.lod_distances = [10.0, 25.0, 60.0];
    cfg.view_proj[0] = f32::NAN;
    assert!(cull_scene_frustum_and_hiz(&objs, &cfg).is_err());
}
