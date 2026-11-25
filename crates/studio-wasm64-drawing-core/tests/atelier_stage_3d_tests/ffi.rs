use super::*;

#[test]
fn ffi_cull_stage_frustum_hiz_matches_safe_kernel_and_guards_ptrs() {
    assert_eq!(
        wasm_atelier_stage_3d_capabilities(),
        WASM_ATELIER_STAGE_3D_CAPABILITIES
    );
    assert_eq!(WASM_ATELIER_STAGE_3D_CAPABILITIES, 0x07);

    let cfg = std_camera_cfg(StageDepthRange::NegOneToOne);
    let objs = [
        box_at(0.0, 1.6, -5.0, 3.5, 3.0, 0.3, true),
        box_at(0.0, 1.6, -20.0, 0.4, 0.4, 0.4, false),
        box_at(0.0, 1.6, -2.5, 0.3, 0.3, 0.3, false),
        box_at(0.0, 1.6, 8.0, 0.5, 0.5, 0.5, false),
    ];
    let safe = cull_scene_frustum_and_hiz(&objs, &cfg).expect("safe");
    let cam_raw: [f32; STAGE_CULL_CAMERA_FFI_LEN] = [
        cfg.camera_pos[0],
        cfg.camera_pos[1],
        cfg.camera_pos[2],
        cfg.lod_distances[0],
        cfg.lod_distances[1],
        cfg.lod_distances[2],
        0.0,
    ];
    let mut aabb_raw = Vec::with_capacity(objs.len() * STAGE_CULL_AABB_STRIDE);
    for o in &objs {
        aabb_raw.extend_from_slice(&o.min);
        aabb_raw.extend_from_slice(&o.max);
        aabb_raw.push(if o.is_occluder { 1.0 } else { 0.0 });
    }
    let mut out_idx = vec![0u32; objs.len()];
    let mut out_lod = vec![0u8; objs.len()];
    let mut out_stats = [0u32; STAGE_CULL_STATS_FFI_LEN];
    // SAFETY: 모든 버퍼의 정렬·길이가 계약과 일치하고 출력은 입력 및 서로와 비중첩이다.
    unsafe {
        let rc = wasm_cull_stage_frustum_hiz(
            cfg.view_proj.as_ptr(),
            cam_raw.as_ptr(),
            aabb_raw.as_ptr(),
            objs.len() as u32,
            out_idx.as_mut_ptr(),
            out_lod.as_mut_ptr(),
            out_stats.as_mut_ptr(),
        );
        assert_eq!(rc, safe.visible_indices.len() as i32);
        assert_eq!(&out_idx[..rc as usize], safe.visible_indices.as_slice());
        assert_eq!(&out_lod[..rc as usize], safe.visible_lods.as_slice());
        assert_eq!(out_stats[1], safe.frustum_culled_count as u32);
        assert_eq!(out_stats[2], safe.occlusion_culled_count as u32);
        assert!(
            wasm_cull_stage_frustum_hiz(
                std::ptr::null(),
                cam_raw.as_ptr(),
                aabb_raw.as_ptr(),
                objs.len() as u32,
                out_idx.as_mut_ptr(),
                out_lod.as_mut_ptr(),
                std::ptr::null_mut(),
            ) < 0
        );
        assert!(
            wasm_cull_stage_frustum_hiz(
                cfg.view_proj.as_ptr(),
                cam_raw.as_ptr(),
                aabb_raw.as_ptr(),
                objs.len() as u32,
                out_idx.as_mut_ptr(),
                out_idx.as_mut_ptr().cast::<u8>(),
                std::ptr::null_mut(),
            ) < 0
        );
    }
}

#[test]
fn ffi_resolve_stage_sphere_overlaps_matches_safe_kernel_and_guards_ptrs() {
    let mut safe_bodies = [
        AtelierSphereBody::new(0, [0.0, 0.0, 0.0], 0.5, 0.0),
        AtelierSphereBody::new(1, [0.4, 0.0, 0.0], 0.5, 1.0),
        AtelierSphereBody::new(2, [1.0, 0.0, 0.0], 0.5, 1.0),
    ];
    let mut raw = Vec::with_capacity(safe_bodies.len() * STAGE_SPHERE_BODY_STRIDE);
    for b in &safe_bodies {
        raw.extend_from_slice(&[b.pos[0], b.pos[1], b.pos[2], b.radius, b.inv_mass]);
    }
    let safe_stats = resolve_sphere_overlaps(&mut safe_bodies, 0.25, 6, 0.9).expect("safe");
    let bytes = raw.len() * std::mem::size_of::<f32>();
    let ptr = wasm_alloc(bytes).cast::<f32>();
    assert!(!ptr.is_null());
    // SAFETY: `wasm_alloc` 16바이트 정렬 버퍼에 정확한 길이로 복사·호출 후 해제한다.
    unsafe {
        std::ptr::copy_nonoverlapping(raw.as_ptr(), ptr, raw.len());
        let rc = wasm_resolve_stage_sphere_overlaps(ptr, 3, 0.25, 6, 0.9);
        assert_eq!(rc, safe_stats.resolved_pairs as i32);
        let res = std::slice::from_raw_parts(ptr, raw.len());
        for i in 0..3 {
            assert_eq!(&res[i * 5..i * 5 + 3], &safe_bodies[i].pos);
        }
        assert!(wasm_resolve_stage_sphere_overlaps(std::ptr::null_mut(), 3, 0.25, 6, 0.9) < 0);
        assert!(wasm_resolve_stage_sphere_overlaps(ptr, 3, 0.25, 0, 0.9) < 0);
        wasm_free(ptr.cast::<u8>(), bytes);
    }
}

#[test]
fn ffi_acoustics_lighting_matches_safe_kernel_and_end_to_end_atelier_stage_frame() {
    let cfg = std_camera_cfg(StageDepthRange::NegOneToOne);
    let stage_objs = [
        box_at(0.0, 1.6, -5.0, 3.0, 2.5, 0.25, true),
        box_at(0.0, 1.6, -15.0, 0.5, 0.5, 0.5, false),
        box_at(-1.2, 1.4, -3.2, 0.35, 0.8, 0.35, false),
        box_at(1.2, 1.4, -3.2, 0.35, 0.8, 0.35, false),
    ];
    let culled = cull_scene_frustum_and_hiz(&stage_objs, &cfg).expect("cull");
    assert_eq!(culled.visible_indices, vec![0, 2, 3]);

    let mut cast_bodies = [
        AtelierSphereBody::new(2, [-0.2, 1.4, -3.2], 0.35, 1.0),
        AtelierSphereBody::new(3, [0.2, 1.4, -3.2], 0.35, 1.0),
    ];
    resolve_sphere_overlaps(&mut cast_bodies, 0.25, 6, 1.0).expect("overlap");
    assert!(dist3(cast_bodies[0].pos, cast_bodies[1].pos) >= 0.699);

    let listener = AtelierListenerPose::default();
    let sources = [
        AtelierAudioSource {
            position: cast_bodies[0].pos,
            base_gain: 1.0,
            ref_distance: 1.0,
            max_distance: 30.0,
            occlusion_factor: 0.0,
        },
        AtelierAudioSource {
            position: [0.0, 1.6, -15.0],
            base_gain: 1.0,
            ref_distance: 1.0,
            max_distance: 30.0,
            occlusion_factor: 1.0,
        },
    ];
    let lights = [AtelierStageLight {
        kind: AtelierLightKind::Point,
        position_or_dir: [0.0, 3.2, -2.5],
        color_rgb: [1.0, 0.95, 0.9],
        intensity: 8.0,
        radius: 0.35,
    }];
    let samples = [AtelierCastSample {
        position: cast_bodies[0].pos,
        normal: [0.6, 0.4, 0.7],
        rim_power: 3.0,
        rim_strength: 0.8,
    }];
    let mut safe_a = [AtelierAudioEval::default(); 2];
    let mut safe_l = [AtelierLightingEval::default(); 1];
    evaluate_stage_acoustics_and_lighting(
        &listener,
        &sources,
        &lights,
        &samples,
        &mut safe_a,
        &mut safe_l,
    )
    .expect("safe eval");
    assert!(safe_a[0].lowpass_cutoff_hz > safe_a[1].lowpass_cutoff_hz);
    assert!(safe_l[0].total_illuminance > 0.0);

    let lis_raw: [f32; STAGE_LISTENER_FFI_LEN] = [
        listener.position[0],
        listener.position[1],
        listener.position[2],
        listener.forward[0],
        listener.forward[1],
        listener.forward[2],
        listener.up[0],
        listener.up[1],
        listener.up[2],
        listener.head_shadow_lpf_hz,
        listener.air_absorption_per_m,
    ];
    let mut src_raw = Vec::with_capacity(2 * STAGE_AUDIO_SOURCE_STRIDE);
    for s in &sources {
        src_raw.extend_from_slice(&[
            s.position[0],
            s.position[1],
            s.position[2],
            s.base_gain,
            s.ref_distance,
            s.max_distance,
            s.occlusion_factor,
        ]);
    }
    let lgt_raw: [f32; STAGE_LIGHT_STRIDE] = [0.0, 0.0, 3.2, -2.5, 1.0, 0.95, 0.9, 8.0, 0.35];
    let smp_raw: [f32; STAGE_CAST_SAMPLE_STRIDE] = [
        samples[0].position[0],
        samples[0].position[1],
        samples[0].position[2],
        samples[0].normal[0],
        samples[0].normal[1],
        samples[0].normal[2],
        samples[0].rim_power,
        samples[0].rim_strength,
    ];
    let mut out_a_raw = [0.0_f32; 2 * STAGE_AUDIO_OUT_STRIDE];
    let mut out_l_raw = [0.0_f32; STAGE_LIGHTING_OUT_STRIDE];
    // SAFETY: 모든 버퍼가 정렬·길이·비중첩 계약을 만족한다.
    unsafe {
        let rc = wasm_evaluate_stage_acoustics_and_lighting(
            lis_raw.as_ptr(),
            src_raw.as_ptr(),
            lgt_raw.as_ptr(),
            smp_raw.as_ptr(),
            2,
            1,
            1,
            out_a_raw.as_mut_ptr(),
            out_l_raw.as_mut_ptr(),
        );
        assert_eq!(rc, 3);
        assert_eq!(out_a_raw[0], safe_a[0].left_gain);
        assert_eq!(out_a_raw[4], safe_a[0].lowpass_cutoff_hz);
        assert_eq!(out_a_raw[10], safe_a[1].lowpass_cutoff_hz);
        assert_eq!(out_l_raw[6], safe_l[0].total_illuminance);
        assert_eq!(out_l_raw[7], safe_l[0].rim_intensity);
        assert!(
            wasm_evaluate_stage_acoustics_and_lighting(
                lis_raw.as_ptr(),
                src_raw.as_ptr(),
                lgt_raw.as_ptr(),
                smp_raw.as_ptr(),
                2,
                1,
                1,
                out_a_raw.as_mut_ptr(),
                out_a_raw.as_mut_ptr(),
            ) < 0
        );
    }
}
