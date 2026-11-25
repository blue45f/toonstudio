//! `studio-wasm64-drawing-core` 통합 테스트 (C-ABI · 경계값 · 종단간 파이프라인 검증).

use studio_wasm64_drawing_core::{
    apply_impasto_lighting_rgba, composite_tile_dirty_rect, fnv1a_checksum_32,
    gaussian_blur_rgba_masked, generate_paper_tile_lut, mix_pigments_km, mix_pigments_km16,
    parse_psd_header_streaming, sample_world_paper_height, stamp_tactile_bristle_rgba,
    unsharp_mask_rgba, vectorize_stroke_to_cubic_beziers, warp_mesh_rigid_mls, wasm_alloc,
    wasm_apply_impasto_lighting_rgba, wasm_composite_tile_dirty_rect,
    wasm_drawing_core_abi_version, wasm_fnv1a_checksum, wasm_free, wasm_gaussian_blur_rgba,
    wasm_hotpath_capabilities, wasm_mix_pigments_km16_packed, wasm_mix_pigments_km16_strip,
    wasm_mix_pigments_km_packed, wasm_sample_world_paper_height, wasm_stamp_tactile_bristle,
    wasm_unsharp_mask_rgba, wasm_xor_tile_delta_bytes, xor_tile_delta_bytes, DirtyRect,
    DrawingCoreError, ImpastoLightConfig, PaperGrainConfig, PaperKind, StrokePoint2D,
    TactileBrushParams, TileBlendMode, TileKey, VirtualTileSwapper64, WarpPin,
    TACTILE_BRUSH_FFI_PARAM_COUNT, WASM_HOTPATH_CAPABILITIES,
};

#[test]
fn c_abi_wasm_scalar_exports_match_safe_rust_kernels() {
    assert_eq!(wasm_drawing_core_abi_version(), 1);

    let blue = [24u8, 92, 214, 255];
    let yellow = [245u8, 212, 28, 255];
    let expected = mix_pigments_km(blue, yellow, 0.5).expect("km mix");
    let packed =
        wasm_mix_pigments_km_packed(u32::from_le_bytes(blue), u32::from_le_bytes(yellow), 0.5);
    assert_eq!(packed.to_le_bytes(), expected);

    // NaN 전달 시 panic 없이 원본 색상 반환
    let fallback = wasm_mix_pigments_km_packed(
        u32::from_le_bytes(blue),
        u32::from_le_bytes(yellow),
        f32::NAN,
    );
    assert_eq!(fallback, u32::from_le_bytes(blue));

    let h = wasm_sample_world_paper_height(64.0, 128.0, 24.0, 2026);
    assert!((0.0..=1.0).contains(&h));
    assert_eq!(
        wasm_sample_world_paper_height(f32::NAN, 0.0, 24.0, 2026),
        -1.0
    );
}

#[test]
fn end_to_end_paper_brush_impasto_filter_pipeline_stays_deterministic() {
    let w = 16u32;
    let h = 16u32;
    let cfg = PaperGrainConfig::default();

    let mut rgba = vec![0u8; (w * h * 4) as usize];
    let mut height_map = vec![0.0_f32; (w * h) as usize];

    for y in 0..h {
        for x in 0..w {
            let grain = sample_world_paper_height(x as f32 * 2.0, y as f32 * 2.0, &cfg)
                .expect("paper height");
            height_map[(y * w + x) as usize] = grain;
            let mixed = mix_pigments_km([28, 86, 210, 255], [240, 205, 32, 255], grain)
                .expect("pigment mix");
            let idx = ((y * w + x) * 4) as usize;
            rgba[idx..idx + 4].copy_from_slice(&mixed);
        }
    }

    let stats =
        apply_impasto_lighting_rgba(&mut rgba, &height_map, w, h, &ImpastoLightConfig::default())
            .expect("impasto lighting");
    assert_eq!(stats.shaded_pixels, (w * h) as usize);

    let blurred = gaussian_blur_rgba_masked(&rgba, w, h, 1.4, None).expect("blur");
    let sharpened = unsharp_mask_rgba(&blurred, w, h, 1.0, 0.9, 1).expect("unsharp");
    assert_eq!(sharpened.len(), rgba.len());

    // 동일 입력 재실행 시 결정론적 비트 일치 확인
    let blurred_2 = gaussian_blur_rgba_masked(&rgba, w, h, 1.4, None).expect("blur 2");
    assert_eq!(blurred, blurred_2);
}

#[test]
fn gaussian_blur_and_impasto_reject_dimension_and_buffer_mismatches() {
    assert_eq!(
        gaussian_blur_rgba_masked(&[], 0, 10, 1.0, None),
        Err(DrawingCoreError::InvalidDimensions {
            width: 0,
            height: 10
        })
    );
    assert_eq!(
        gaussian_blur_rgba_masked(&[0u8; 12], 2, 2, 1.0, None),
        Err(DrawingCoreError::BufferLengthMismatch {
            expected: 16,
            actual: 12
        })
    );
    assert_eq!(
        gaussian_blur_rgba_masked(&[0u8; 16], 2, 2, 1.0, Some(&[255u8; 3])),
        Err(DrawingCoreError::BufferLengthMismatch {
            expected: 4,
            actual: 3
        })
    );
    let mut buf = vec![255u8; 16];
    assert_eq!(
        apply_impasto_lighting_rgba(&mut buf, &[0.0; 3], 2, 2, &ImpastoLightConfig::default()),
        Err(DrawingCoreError::BufferLengthMismatch {
            expected: 4,
            actual: 3
        })
    );
}

#[test]
fn mls_warp_handles_multi_pin_deformation_without_nan_or_collapse() {
    let mut vertices = Vec::new();
    for y in 0..8 {
        for x in 0..8 {
            vertices.push([x as f32 * 20.0, y as f32 * 20.0]);
        }
    }
    let pins = vec![
        WarpPin::new([0.0, 0.0], [0.0, 0.0]),
        WarpPin::new([140.0, 0.0], [140.0, 12.0]),
        WarpPin::new([70.0, 70.0], [82.0, 64.0]),
        WarpPin::new([140.0, 140.0], [126.0, 148.0]),
    ];

    let deformed = warp_mesh_rigid_mls(&vertices, &pins, 1.5).expect("multi-pin mls");
    assert_eq!(deformed.len(), vertices.len());
    for pt in &deformed {
        assert!(pt[0].is_finite() && pt[1].is_finite());
    }
    // 핀 위치 정점의 정확 보간 검증
    assert!((deformed[0][0] - 0.0).abs() < 1e-4 && (deformed[0][1] - 0.0).abs() < 1e-4);
    assert!((deformed[63][0] - 126.0).abs() < 1e-4 && (deformed[63][1] - 148.0).abs() < 1e-4);
}

#[test]
fn vectorizer_handles_empty_and_sharp_corner_strokes() {
    let empty = vectorize_stroke_to_cubic_beziers(&[], 0.5, 1.0).expect("empty ok");
    assert!(empty.segments.is_empty());

    let single = vectorize_stroke_to_cubic_beziers(
        &[StrokePoint2D {
            x: 10.0,
            y: 20.0,
            pressure: 0.7,
        }],
        0.5,
        1.0,
    )
    .expect("single ok");
    assert!(single.segments.is_empty());

    // L자 직각 꺾임 스트로크: 꼭짓점이 보존되고 오차가 허용치 이하
    let mut l_shape = Vec::new();
    for i in 0..=20 {
        l_shape.push(StrokePoint2D {
            x: i as f32 * 5.0,
            y: 0.0,
            pressure: 0.8,
        });
    }
    for i in 1..=20 {
        l_shape.push(StrokePoint2D {
            x: 100.0,
            y: i as f32 * 5.0,
            pressure: 0.8,
        });
    }
    let vec_res = vectorize_stroke_to_cubic_beziers(&l_shape, 0.25, 1.5).expect("l-shape ok");
    assert!(!vec_res.segments.is_empty());
    assert!(vec_res.max_fit_error <= 1.5);
}

#[test]
fn virtual_tile_swapper64_stress_swaps_many_tiles_losslessly() {
    let tile_bytes = 256usize;
    let budget = (tile_bytes * 4) as u64;
    let mut swapper =
        VirtualTileSwapper64::with_tile_bytes(tile_bytes, budget, 0x1_0000_0000).expect("init");

    let mut golden = Vec::new();
    for i in 0..20u32 {
        let mut data = vec![0u8; tile_bytes];
        let (chunks, _) = data.as_chunks_mut::<4>();
        for (idx, px) in chunks.iter_mut().enumerate() {
            px[0] = (i * 11) as u8;
            px[1] = (idx as u8).wrapping_mul(3);
            px[2] = 200u8.wrapping_sub(i as u8);
            px[3] = 255;
        }
        let key = TileKey {
            layer_id: 2,
            tile_x: i % 5,
            tile_y: i / 5,
        };
        swapper.write_tile(key, &data).expect("write tile");
        assert!(swapper.stats().resident_bytes <= budget);
        golden.push((key, data));
    }

    assert!(swapper.stats().swap_outs >= 16);

    for (key, expected) in &golden {
        let read_back = swapper
            .read_tile(*key)
            .expect("read back")
            .expect("tile present");
        assert_eq!(read_back, expected.as_slice());
        assert!(swapper.stats().resident_bytes <= budget);
    }

    // 잘못된 PSD 헤더에 대한 Display 메시지 검증
    let err = parse_psd_header_streaming(&[0u8; 32]).expect_err("bad psd");
    assert!(!err.to_string().is_empty());
}

#[test]
fn wasm_ffi_linear_memory_exports_match_safe_kernels_and_guard_invalid_ptrs() {
    assert_eq!(wasm_hotpath_capabilities(), WASM_HOTPATH_CAPABILITIES);

    let blue = [24u8, 92, 214, 255];
    let yellow = [245u8, 212, 28, 255];
    let expected_km16 = mix_pigments_km16(blue, yellow, 0.5).expect("km16");
    let packed_km16 =
        wasm_mix_pigments_km16_packed(u32::from_le_bytes(blue), u32::from_le_bytes(yellow), 0.5);
    assert_eq!(packed_km16.to_le_bytes(), expected_km16);

    let w = 16u32;
    let h = 16u32;
    let len = (w * h * 4) as usize;
    let mut src = vec![0u8; len];
    let mut heights = vec![0.0_f32; (w * h) as usize];
    for y in 0..h as usize {
        for x in 0..w as usize {
            let idx = (y * w as usize + x) * 4;
            src[idx] = if x < 8 { 64 } else { 208 };
            src[idx + 1] = ((x * 13 + y * 7) % 256) as u8;
            src[idx + 2] = 150;
            src[idx + 3] = 255;
            heights[y * w as usize + x] = ((x as f32 - 8.0).hypot(y as f32 - 8.0) / 12.0).min(1.0);
        }
    }

    let expected_blur = gaussian_blur_rgba_masked(&src, w, h, 1.3, None).expect("blur");
    let expected_unsharp = unsharp_mask_rgba(&src, w, h, 1.3, 1.4, 2).expect("unsharp");
    let mut expected_impasto = src.clone();
    let impasto_stats = apply_impasto_lighting_rgba(
        &mut expected_impasto,
        &heights,
        w,
        h,
        &ImpastoLightConfig::default(),
    )
    .expect("impasto");

    let mut next_tile = src.clone();
    next_tile[0] ^= 0x55;
    next_tile[64] ^= 0xAA;
    let mut expected_delta = vec![0u8; len];
    let expected_changed =
        xor_tile_delta_bytes(&src, &next_tile, &mut expected_delta).expect("xor");

    let src_ptr = wasm_alloc(len);
    let dst_ptr = wasm_alloc(len);
    let next_ptr = wasm_alloc(len);
    assert!(!src_ptr.is_null() && !dst_ptr.is_null() && !next_ptr.is_null());

    // SAFETY: `wasm_alloc(len)`으로 할당한 비중첩 유효 버퍼를 대상으로 FFI 경계 동작을 검증한다.
    unsafe {
        std::ptr::copy_nonoverlapping(src.as_ptr(), src_ptr, len);
        std::ptr::copy_nonoverlapping(next_tile.as_ptr(), next_ptr, len);

        let blur_rc = wasm_gaussian_blur_rgba(src_ptr, std::ptr::null(), dst_ptr, w, h, 1.3);
        assert_eq!(blur_rc, (w * h) as i32);
        assert_eq!(
            std::slice::from_raw_parts(dst_ptr, len),
            expected_blur.as_slice()
        );

        let unsharp_rc = wasm_unsharp_mask_rgba(src_ptr, dst_ptr, w, h, 1.3, 1.4, 2);
        assert!(unsharp_rc > 0);
        assert_eq!(
            std::slice::from_raw_parts(dst_ptr, len),
            expected_unsharp.as_slice()
        );

        std::ptr::copy_nonoverlapping(src.as_ptr(), dst_ptr, len);
        let impasto_rc =
            wasm_apply_impasto_lighting_rgba(dst_ptr, heights.as_ptr(), w, h, std::ptr::null());
        assert_eq!(impasto_rc, impasto_stats.shaded_pixels as i32);
        assert_eq!(
            std::slice::from_raw_parts(dst_ptr, len),
            expected_impasto.as_slice()
        );

        let xor_rc = wasm_xor_tile_delta_bytes(src_ptr, next_ptr, dst_ptr, len as u32);
        assert_eq!(xor_rc, expected_changed as i32);
        assert_eq!(
            std::slice::from_raw_parts(dst_ptr, len),
            expected_delta.as_slice()
        );
        assert_eq!(
            wasm_fnv1a_checksum(dst_ptr, len as u32),
            fnv1a_checksum_32(&expected_delta)
        );

        let strip_rc = wasm_mix_pigments_km16_strip(dst_ptr, src_ptr, w * h, 0.5);
        assert_eq!(strip_rc, (w * h) as i32);

        // null·aliasing 방어: panic 대신 음수 오류 코드 반환 확인
        assert!(wasm_unsharp_mask_rgba(src_ptr, src_ptr, w, h, 1.3, 1.4, 2) < 0);
        assert!(wasm_xor_tile_delta_bytes(std::ptr::null(), next_ptr, dst_ptr, len as u32) < 0);

        wasm_free(src_ptr, len);
        wasm_free(dst_ptr, len);
        wasm_free(next_ptr, len);
    }
}

#[test]
fn wasm_ffi_tactile_bristle_and_tile_compositor_match_safe_kernels_and_guard_bounds() {
    let (w, h) = (32u32, 32u32);
    let rgba_len = (w * h * 4) as usize;
    let height_len = (w * h) as usize;
    let height_bytes = height_len * std::mem::size_of::<f32>();

    let color = [68u8, 112, 184, 215];
    let params_arr: [f32; TACTILE_BRUSH_FFI_PARAM_COUNT] = [
        16.0, 16.0, 10.0, 0.78, 0.65, 0.25, -0.1, 0.3, 0.45, 0.85, 1.0, 0.55, 0.9,
    ];
    let safe_params = TactileBrushParams {
        cx: params_arr[0],
        cy: params_arr[1],
        radius: params_arr[2],
        color_rgba: color,
        pressure: params_arr[3],
        speed: params_arr[4],
        tilt_x: params_arr[5],
        tilt_y: params_arr[6],
        direction_rad: params_arr[7],
        dryness: params_arr[8],
        bristle_count: 9,
        paper_tooth_strength: params_arr[9],
        paper_scale: params_arr[10],
        wet_edge_strength: params_arr[11],
        impasto_height: params_arr[12],
        seed: 2026,
    };

    let mut expected_rgba = vec![0u8; rgba_len];
    let mut expected_h = vec![0.0_f32; height_len];
    let lut = generate_paper_tile_lut(PaperKind::ColdPress, 2026);
    let expected_stats = stamp_tactile_bristle_rgba(
        &mut expected_rgba,
        &mut expected_h,
        w,
        h,
        &lut,
        &safe_params,
    )
    .expect("safe stamp");

    let mut comp_dst = vec![96u8; rgba_len];
    let comp_src = expected_rgba.clone();
    let dirty = DirtyRect {
        x: 6,
        y: 8,
        width: 18,
        height: 14,
    };
    let expected_comp_px = composite_tile_dirty_rect(
        &mut comp_dst,
        &comp_src,
        w,
        h,
        dirty,
        TileBlendMode::Overlay,
        200,
    )
    .expect("safe composite");

    let rgba_ptr = wasm_alloc(rgba_len);
    let height_ptr = wasm_alloc(height_bytes) as *mut f32;
    let dst_ptr = wasm_alloc(rgba_len);
    assert!(!rgba_ptr.is_null() && !height_ptr.is_null() && !dst_ptr.is_null());

    // SAFETY: `wasm_alloc`으로 할당한 16바이트 정렬 비중첩 버퍼로 신규 C-ABI 경계를 검증한다.
    unsafe {
        std::ptr::write_bytes(rgba_ptr, 0, rgba_len);
        std::ptr::write_bytes(height_ptr as *mut u8, 0, height_bytes);
        std::ptr::write_bytes(dst_ptr, 96, rgba_len);

        let stamp_rc = wasm_stamp_tactile_bristle(
            rgba_ptr,
            height_ptr,
            w,
            h,
            PaperKind::ColdPress as u32,
            u32::from_le_bytes(color),
            9,
            2026,
            params_arr.as_ptr(),
        );
        assert_eq!(stamp_rc, expected_stats.touched_pixels as i32);
        assert_eq!(
            std::slice::from_raw_parts(rgba_ptr, rgba_len),
            expected_rgba.as_slice()
        );
        assert_eq!(
            std::slice::from_raw_parts(height_ptr, height_len),
            expected_h.as_slice()
        );

        let comp_rc = wasm_composite_tile_dirty_rect(
            dst_ptr,
            rgba_ptr,
            w,
            h,
            dirty.x,
            dirty.y,
            dirty.width,
            dirty.height,
            TileBlendMode::Overlay as u32,
            200,
        );
        assert_eq!(comp_rc, expected_comp_px as i32);
        assert_eq!(
            std::slice::from_raw_parts(dst_ptr, rgba_len),
            comp_dst.as_slice()
        );

        // 잘못된 포인터·중첩·열거 코드·투명도 범위 초과 시 음수 오류 코드 반환 검증
        assert!(
            wasm_stamp_tactile_bristle(
                std::ptr::null_mut(),
                height_ptr,
                w,
                h,
                0,
                0,
                8,
                1,
                std::ptr::null()
            ) < 0
        );
        assert!(
            wasm_stamp_tactile_bristle(rgba_ptr, height_ptr, w, h, 99, 0, 8, 1, std::ptr::null())
                < 0
        );
        assert!(wasm_composite_tile_dirty_rect(dst_ptr, dst_ptr, w, h, 0, 0, 4, 4, 0, 255) < 0);
        assert!(wasm_composite_tile_dirty_rect(dst_ptr, rgba_ptr, w, h, 0, 0, 4, 4, 99, 255) < 0);
        assert!(wasm_composite_tile_dirty_rect(dst_ptr, rgba_ptr, w, h, 0, 0, 4, 4, 0, 256) < 0);

        wasm_free(rgba_ptr, rgba_len);
        wasm_free(height_ptr as *mut u8, height_bytes);
        wasm_free(dst_ptr, rgba_len);
    }
}
