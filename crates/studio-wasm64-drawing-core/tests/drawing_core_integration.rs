//! `studio-wasm64-drawing-core` 통합 테스트 (C-ABI · 경계값 · 종단간 파이프라인 검증).

use studio_wasm64_drawing_core::{
    apply_impasto_lighting_rgba, gaussian_blur_rgba_masked, mix_pigments_km,
    parse_psd_header_streaming, sample_world_paper_height, unsharp_mask_rgba,
    vectorize_stroke_to_cubic_beziers, warp_mesh_rigid_mls, wasm_drawing_core_abi_version,
    wasm_mix_pigments_km_packed, wasm_sample_world_paper_height, DrawingCoreError,
    ImpastoLightConfig, PaperGrainConfig, StrokePoint2D, TileKey, VirtualTileSwapper64, WarpPin,
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
