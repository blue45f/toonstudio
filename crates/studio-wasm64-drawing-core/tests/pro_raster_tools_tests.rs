#![cfg(feature = "pro-raster-tools")]

use std::collections::HashMap;

use studio_wasm64_drawing_core::wasm_ffi::{
    FFI_ERR_BUFFER_LENGTH, FFI_ERR_INVALID_PARAMETER, FFI_ERR_NULL_OR_ALIAS,
};
use studio_wasm64_drawing_core::{
    extract_marching_ants_segments, extract_marching_ants_segments_with_threshold,
    flood_fill_rgba_scanline, liquify_displace_rgba, magic_wand_select_mask,
    magic_wand_select_mask_into, oklch_to_rgba_batch, render_halftone_screentone_rgba,
    rgba_to_cmyk_u8_batch, rgba_to_oklch_batch, wasm_alloc, wasm_extended_capabilities,
    wasm_extract_marching_ants_segments, wasm_flood_fill_rgba, wasm_free,
    wasm_liquify_displace_rgba, wasm_magic_wand_mask, wasm_oklch_to_rgba_batch,
    wasm_parse_psd_header, wasm_render_halftone_screentone, wasm_rgba_to_cmyk_batch,
    wasm_rgba_to_oklch_batch, wasm_vectorize_stroke_cubic, wasm_warp_mesh_rigid_mls, DirtyRect,
    DrawingCoreError, FloodFillConfig, HalftoneConfig, HalftonePattern, LiquifyBrushConfig,
    LiquifyMode, MagicWandConfig, DIRTY_RECT_FFI_U32_LEN, EMPTY_DIRTY_RECT,
    HALFTONE_FFI_PARAM_COUNT, LIQUIFY_FFI_PARAM_COUNT, MARCHING_ANT_SEGMENT_STRIDE,
    MLS_WARP_PIN_STRIDE, PSD_HEADER_FFI_U64_LEN, VECTORIZE_POINT_STRIDE, VECTORIZE_SEGMENT_STRIDE,
    VECTORIZE_STATS_LEN, WASM_EXTENDED_CAPABILITIES,
};

fn make_solid_rgba(w: u32, h: u32, color: [u8; 4]) -> Vec<u8> {
    let mut buf = vec![0u8; (w * h * 4) as usize];
    for chunk in buf.as_chunks_mut::<4>().0 {
        *chunk = color;
    }
    buf
}

fn set_px(rgba: &mut [u8], w: u32, x: u32, y: u32, color: [u8; 4]) {
    let off = ((y * w + x) * 4) as usize;
    rgba[off..off + 4].copy_from_slice(&color);
}

fn get_px(rgba: &[u8], w: u32, x: u32, y: u32) -> [u8; 4] {
    let off = ((y * w + x) * 4) as usize;
    [rgba[off], rgba[off + 1], rgba[off + 2], rgba[off + 3]]
}

fn draw_box_outline(rgba: &mut [u8], w: u32, x0: u32, y0: u32, x1: u32, y1: u32, color: [u8; 4]) {
    for x in x0..=x1 {
        set_px(rgba, w, x, y0, color);
        set_px(rgba, w, x, y1, color);
    }
    for y in y0..=y1 {
        set_px(rgba, w, x0, y, color);
        set_px(rgba, w, x1, y, color);
    }
}

fn build_synthetic_psd(is_psb: bool, width: u32, height: u32, layer_len: u64) -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"8BPS");
    bytes.extend_from_slice(&(if is_psb { 2u16 } else { 1u16 }).to_be_bytes());
    bytes.extend_from_slice(&[0u8; 6]); // reserved
    bytes.extend_from_slice(&4u16.to_be_bytes()); // RGBA 4 channels
    bytes.extend_from_slice(&height.to_be_bytes());
    bytes.extend_from_slice(&width.to_be_bytes());
    bytes.extend_from_slice(&8u16.to_be_bytes()); // 8-bit depth
    bytes.extend_from_slice(&3u16.to_be_bytes()); // RGB mode
    bytes.extend_from_slice(&0u32.to_be_bytes()); // Color Mode Data length
    bytes.extend_from_slice(&4u32.to_be_bytes()); // Image Resources length
    bytes.extend_from_slice(&[1, 2, 3, 4]);
    if is_psb {
        bytes.extend_from_slice(&layer_len.to_be_bytes());
    } else {
        bytes.extend_from_slice(&(layer_len as u32).to_be_bytes());
    }
    bytes
}

// ---------------------------------------------------------------------------
// 1. Flood Fill & Magic Wand & Marching Ants Tests
// ---------------------------------------------------------------------------

#[test]
fn flood_fill_fills_exact_enclosed_interior_and_dirty_rect() {
    let (w, h) = (24, 24);
    let white = [255, 255, 255, 255];
    let black = [0, 0, 0, 255];
    let blue = [30, 120, 240, 255];
    let mut rgba = make_solid_rgba(w, h, white);
    draw_box_outline(&mut rgba, w, 4, 5, 15, 14, black);

    let cfg = FloodFillConfig {
        tolerance: 0,
        gap_closing_radius: 0,
    };
    let res = flood_fill_rgba_scanline(&mut rgba, w, h, 8, 9, blue, &cfg, None).unwrap();
    // 내부 좌표: x=5..=14 (10px), y=6..=13 (8px) => 80px
    assert_eq!(res.filled_pixels, 80);
    assert_eq!(
        res.dirty_rect,
        DirtyRect {
            x: 5,
            y: 6,
            width: 10,
            height: 8,
        }
    );
    assert_eq!(get_px(&rgba, w, 5, 6), blue);
    assert_eq!(get_px(&rgba, w, 14, 13), blue);
    assert_eq!(get_px(&rgba, w, 4, 5), black);
    assert_eq!(get_px(&rgba, w, 0, 0), white);
}

#[test]
fn flood_fill_gap_closing_seals_lineart_gap_without_inner_halo() {
    let (w, h) = (24, 24);
    let white = [255, 255, 255, 255];
    let black = [0, 0, 0, 255];
    let red = [230, 40, 50, 255];
    let mut base = make_solid_rgba(w, h, white);
    draw_box_outline(&mut base, w, 4, 4, 15, 15, black);
    // 오른쪽 벽(x=15)에 2px 틈새 개방 (y=9, 10)
    set_px(&mut base, w, 15, 9, white);
    set_px(&mut base, w, 15, 10, white);

    // gap_closing_radius = 0이면 외부까지 누출됨
    let mut leaked = base.clone();
    let res_leak = flood_fill_rgba_scanline(
        &mut leaked,
        w,
        h,
        10,
        10,
        red,
        &FloodFillConfig {
            tolerance: 0,
            gap_closing_radius: 0,
        },
        None,
    )
    .unwrap();
    assert!(res_leak.filled_pixels > 100);
    assert_eq!(get_px(&leaked, w, 0, 0), red);

    // gap_closing_radius = 1이면 2px 틈새가 완전히 봉합되고 내부 10x10 = 100px만 여백 없이 채워짐
    let mut closed = base;
    let res_closed = flood_fill_rgba_scanline(
        &mut closed,
        w,
        h,
        10,
        10,
        red,
        &FloodFillConfig {
            tolerance: 0,
            gap_closing_radius: 1,
        },
        None,
    )
    .unwrap();
    assert_eq!(res_closed.filled_pixels, 100);
    assert_eq!(
        res_closed.dirty_rect,
        DirtyRect {
            x: 5,
            y: 5,
            width: 10,
            height: 10,
        }
    );
    assert_eq!(get_px(&closed, w, 0, 0), white);
    assert_eq!(get_px(&closed, w, 5, 5), red);
    assert_eq!(get_px(&closed, w, 14, 14), red);
}

#[test]
fn flood_fill_respects_tolerance_and_external_boundary_mask() {
    let (w, h) = (16, 16);
    let mut rgba = make_solid_rgba(w, h, [200, 200, 200, 255]);
    // 왼쪽 절반에 약한 노이즈(+12), 외부 경계 마스크는 x=8에 세로 장벽
    for y in 0..h {
        for x in 0..8 {
            let delta = ((x + y) % 12) as u8;
            set_px(&mut rgba, w, x, y, [200 + delta, 200 - delta, 200, 255]);
        }
    }
    let mut boundary_mask = vec![0u8; (w * h) as usize];
    for y in 0..h {
        boundary_mask[(y * w + 8) as usize] = 255;
    }

    let fill = [10, 200, 90, 255];
    let res = flood_fill_rgba_scanline(
        &mut rgba,
        w,
        h,
        0,
        0,
        fill,
        &FloodFillConfig {
            tolerance: 15,
            gap_closing_radius: 0,
        },
        Some(&boundary_mask),
    )
    .unwrap();
    assert_eq!(res.filled_pixels, 8 * 16);
    assert_eq!(
        res.dirty_rect,
        DirtyRect {
            x: 0,
            y: 0,
            width: 8,
            height: 16,
        }
    );
    assert_eq!(get_px(&rgba, w, 8, 5), [200, 200, 200, 255]);
    assert_eq!(get_px(&rgba, w, 12, 5), [200, 200, 200, 255]);
}

#[test]
fn flood_fill_handles_serpentine_labyrinth_and_noop_cases() {
    let (w, h) = (64, 64);
    let wall = [0, 0, 0, 255];
    let path = [250, 250, 250, 255];
    let fill = [255, 180, 0, 255];
    let mut rgba = make_solid_rgba(w, h, path);
    // 뱀 모양 미로 장벽 구성 (비재귀 스택 안정성 검증)
    for row in (1..h).step_by(2) {
        let gap_x = if (row / 2) % 2 == 0 { w - 1 } else { 0 };
        for x in 0..w {
            if x != gap_x {
                set_px(&mut rgba, w, x, row, wall);
            }
        }
    }
    let expected_path_pixels = (w * h) as usize - ((h / 2) as usize * (w as usize - 1));
    let res = flood_fill_rgba_scanline(
        &mut rgba,
        w,
        h,
        0,
        0,
        fill,
        &FloodFillConfig {
            tolerance: 0,
            gap_closing_radius: 0,
        },
        None,
    )
    .unwrap();
    assert_eq!(res.filled_pixels, expected_path_pixels);

    // 같은 색 + tolerance=0 재실행 시 0픽셀 조기 종료
    let noop = flood_fill_rgba_scanline(
        &mut rgba,
        w,
        h,
        0,
        0,
        fill,
        &FloodFillConfig {
            tolerance: 0,
            gap_closing_radius: 0,
        },
        None,
    )
    .unwrap();
    assert_eq!(noop.filled_pixels, 0);
    assert_eq!(noop.dirty_rect, EMPTY_DIRTY_RECT);

    // 시드가 경계 마스크 위에 있으면 0픽셀 반환
    let mut bmask = vec![0u8; (w * h) as usize];
    bmask[0] = 1;
    let blocked = flood_fill_rgba_scanline(
        &mut rgba,
        w,
        h,
        0,
        0,
        [1, 2, 3, 255],
        &FloodFillConfig::default(),
        Some(&bmask),
    )
    .unwrap();
    assert_eq!(blocked.filled_pixels, 0);
}

#[test]
fn magic_wand_binary_and_antialiased_selection_masks() {
    let (w, h) = (20, 20);
    let mut rgba = make_solid_rgba(w, h, [255, 255, 255, 255]);
    for y in 5..15 {
        for x in 5..15 {
            set_px(&mut rgba, w, x, y, [40, 80, 200, 255]);
        }
    }

    let hard = magic_wand_select_mask(
        &rgba,
        w,
        h,
        10,
        10,
        &MagicWandConfig {
            tolerance: 0,
            gap_closing_radius: 0,
            anti_alias: false,
        },
        None,
    )
    .unwrap();
    assert_eq!(hard.selected_pixels, 100);
    assert_eq!(
        hard.dirty_rect,
        DirtyRect {
            x: 5,
            y: 5,
            width: 10,
            height: 10,
        }
    );
    assert!(hard.mask.iter().all(|&v| v == 0 || v == 255));

    let soft = magic_wand_select_mask(
        &rgba,
        w,
        h,
        10,
        10,
        &MagicWandConfig {
            tolerance: 0,
            gap_closing_radius: 0,
            anti_alias: true,
        },
        None,
    )
    .unwrap();
    // 내부 중앙은 255 유지, 먼 외부는 0 유지, 경계에는 중간 알파(1..=254) 생성
    assert_eq!(soft.mask[(10 * w + 10) as usize], 255);
    assert_eq!(soft.mask[0], 0);
    assert!(soft.mask.iter().any(|&v| v > 0 && v < 255));
    assert!(soft.selected_pixels > hard.selected_pixels);
}

#[test]
fn marching_ants_merges_collinear_runs_and_preserves_closed_eulerian_contours() {
    let (w, h) = (16, 12);
    // 1) 빈 마스크 -> 0 선분
    let empty = vec![0u8; (w * h) as usize];
    assert!(extract_marching_ants_segments(&empty, w, h)
        .unwrap()
        .is_empty());

    // 2) 단순 10x6 직사각형 -> 정확히 4개 병합 선분, 둘레 32
    let mut rect = vec![0u8; (w * h) as usize];
    for y in 2..8 {
        for x in 3..13 {
            rect[(y * w + x) as usize] = 255;
        }
    }
    let rect_segs = extract_marching_ants_segments(&rect, w, h).unwrap();
    assert_eq!(rect_segs.len(), 4);
    let perimeter: u32 = rect_segs
        .iter()
        .map(|s| s.x0.abs_diff(s.x1) + s.y0.abs_diff(s.y1))
        .sum();
    assert_eq!(perimeter, 32);

    // 3) 도넛 형태(내부 4x2 구멍) -> 외곽 4 + 내부 4 = 8 선분 + 모든 꼭짓점 진입=진출 차수 균형
    for y in 4..6 {
        for x in 6..10 {
            rect[(y * w + x) as usize] = 0;
        }
    }
    let donut_segs = extract_marching_ants_segments(&rect, w, h).unwrap();
    assert_eq!(donut_segs.len(), 8);
    let mut balance: HashMap<(u32, u32), i32> = HashMap::new();
    for s in &donut_segs {
        assert!(s.x0 <= w && s.x1 <= w && s.y0 <= h && s.y1 <= h);
        *balance.entry((s.x0, s.y0)).or_insert(0) += 1;
        *balance.entry((s.x1, s.y1)).or_insert(0) -= 1;
    }
    assert!(balance.values().all(|&deg| deg == 0));

    // threshold = 0 거부
    assert_eq!(
        extract_marching_ants_segments_with_threshold(&rect, w, h, 0),
        Err(DrawingCoreError::InvalidParameter { name: "threshold" })
    );
}

#[test]
fn flood_fill_and_magic_wand_reject_invalid_inputs() {
    let mut rgba = vec![0u8; 16];
    assert!(matches!(
        flood_fill_rgba_scanline(&mut rgba, 0, 2, 0, 0, [0; 4], &FloodFillConfig::default(), None),
        Err(DrawingCoreError::InvalidDimensions { .. })
    ));
    assert!(matches!(
        flood_fill_rgba_scanline(&mut rgba, 2, 2, 2, 0, [0; 4], &FloodFillConfig::default(), None),
        Err(DrawingCoreError::InvalidParameter { name: "seed" })
    ));
    assert!(matches!(
        flood_fill_rgba_scanline(
            &mut rgba,
            2,
            2,
            0,
            0,
            [0; 4],
            &FloodFillConfig {
                tolerance: 0,
                gap_closing_radius: 9,
            },
            None,
        ),
        Err(DrawingCoreError::InvalidParameter {
            name: "gap_closing_radius"
        })
    ));
    let mut short_mask = vec![0u8; 3];
    assert!(matches!(
        magic_wand_select_mask_into(
            &rgba,
            2,
            2,
            0,
            0,
            &MagicWandConfig::default(),
            None,
            &mut short_mask,
        ),
        Err(DrawingCoreError::BufferLengthMismatch { .. })
    ));
}

// ---------------------------------------------------------------------------
// 2. OKLab/OKLCH, CMYK, Halftone Screentone & Liquify Tests
// ---------------------------------------------------------------------------

#[test]
fn oklch_reference_primaries_and_full_grid_roundtrip_accuracy() {
    let primaries: Vec<u8> = vec![
        0, 0, 0, 255, // Black
        255, 255, 255, 255, // White
        255, 0, 0, 255, // Red
        0, 255, 0, 255, // Green
        0, 0, 255, 128, // Blue 50% alpha
    ];
    let mut oklch = vec![0.0_f32; primaries.len()];
    assert_eq!(rgba_to_oklch_batch(&primaries, &mut oklch).unwrap(), 5);

    // Black: L=0, C=0
    assert!(oklch[0] < 1e-4 && oklch[1] < 1e-4);
    // White: L≈1, C≈0
    assert!((oklch[4] - 1.0).abs() < 1e-3 && oklch[5] < 1e-4);
    // Red (Bjorn Ottosson reference: L≈0.62796, C≈0.25768, H≈29.23°)
    assert!((oklch[8] - 0.628).abs() < 0.005);
    assert!((oklch[9] - 0.258).abs() < 0.005);
    assert!((oklch[10] - 29.23).abs() < 0.5);
    // Green: L≈0.8664, H≈142.5°
    assert!((oklch[12] - 0.866).abs() < 0.005);
    assert!((oklch[14] - 142.5).abs() < 0.5);
    // Blue: L≈0.4520, H≈264.05°
    assert!((oklch[16] - 0.452).abs() < 0.005);
    assert!((oklch[18] - 264.05).abs() < 0.5);

    // 17^3 = 4,913색 전수 왕복 오차 <= 1 LSB 검증
    let mut grid = Vec::with_capacity(17 * 17 * 17 * 4);
    for r in (0..=255).step_by(15) {
        for g in (0..=255).step_by(15) {
            for b in (0..=255).step_by(15) {
                grid.extend_from_slice(&[r as u8, g as u8, b as u8, ((r + g + b) % 256) as u8]);
            }
        }
    }
    let mut grid_oklch = vec![0.0_f32; grid.len()];
    let mut restored = vec![0u8; grid.len()];
    rgba_to_oklch_batch(&grid, &mut grid_oklch).unwrap();
    oklch_to_rgba_batch(&grid_oklch, &mut restored).unwrap();
    for (&orig, &back) in grid.iter().zip(restored.iter()) {
        assert!(orig.abs_diff(back) <= 1, "orig={orig}, back={back}");
    }
}

#[test]
fn oklch_to_rgba_sanitizes_nan_inf_and_out_of_gamut_chroma() {
    let hostile = [
        f32::NAN,
        f32::INFINITY,
        f32::NEG_INFINITY,
        f32::NAN,
        1.5,
        1.2,
        -720.0,
        2.0,
        -0.5,
        -0.3,
        45.0,
        -1.0,
    ];
    let mut out = vec![99u8; hostile.len()];
    assert_eq!(oklch_to_rgba_batch(&hostile, &mut out).unwrap(), 3);
    // 첫 픽셀은 모두 0으로 정규화
    assert_eq!(&out[0..4], &[0, 0, 0, 0]);
    // 둘째 픽셀은 sRGB 범위 및 알파 255로 클램프
    assert_eq!(out[7], 255);
    // 셋째 픽셀은 L=0, A=0으로 클램프
    assert_eq!(&out[8..12], &[0, 0, 0, 0]);
}

#[test]
fn cmyk_batch_preserves_primaries_and_gcr_colorimetric_invariant() {
    let samples: Vec<u8> = vec![
        255, 255, 255, 255, // White
        0, 0, 0, 0, // Transparent (over white paper => zero ink)
        0, 255, 255, 255, // Cyan
        255, 0, 255, 255, // Magenta
        255, 255, 0, 255, // Yellow
        0, 0, 0, 255, // Black
        128, 96, 64, 255, // Warm brown
    ];

    let mut cmyk_full = vec![0u8; samples.len()];
    assert_eq!(rgba_to_cmyk_u8_batch(&samples, &mut cmyk_full, 1.0).unwrap(), 7);
    assert_eq!(&cmyk_full[0..4], &[0, 0, 0, 0]);
    assert_eq!(&cmyk_full[4..8], &[0, 0, 0, 0]);
    assert_eq!(&cmyk_full[8..12], &[255, 0, 0, 0]);
    assert_eq!(&cmyk_full[12..16], &[0, 255, 0, 0]);
    assert_eq!(&cmyk_full[16..20], &[0, 0, 255, 0]);
    assert_eq!(&cmyk_full[20..24], &[0, 0, 0, 255]);

    let mut cmyk_zero_gcr = vec![0u8; samples.len()];
    rgba_to_cmyk_u8_batch(&samples, &mut cmyk_zero_gcr, 0.0).unwrap();
    assert_eq!(&cmyk_zero_gcr[20..24], &[255, 255, 255, 0]);

    // 모든 gcr_factor에 대해 감산 색채 불변식 (1-C)*(1-K) == R 검증
    for &gcr in &[0.0_f32, 0.25, 0.5, 0.75, 1.0] {
        let mut out = vec![0u8; 4];
        let rgb = [180u8, 120, 75, 255];
        rgba_to_cmyk_u8_batch(&rgb, &mut out, gcr).unwrap();
        let k = f32::from(out[3]) / 255.0;
        let rec_r = (1.0 - f32::from(out[0]) / 255.0) * (1.0 - k);
        let rec_g = (1.0 - f32::from(out[1]) / 255.0) * (1.0 - k);
        let rec_b = (1.0 - f32::from(out[2]) / 255.0) * (1.0 - k);
        assert!((rec_r - 180.0 / 255.0).abs() < 0.015, "gcr={gcr}");
        assert!((rec_g - 120.0 / 255.0).abs() < 0.015, "gcr={gcr}");
        assert!((rec_b - 75.0 / 255.0).abs() < 0.015, "gcr={gcr}");
    }

    assert!(matches!(
        rgba_to_cmyk_u8_batch(&samples, &mut cmyk_full, f32::NAN),
        Err(DrawingCoreError::InvalidParameter { name: "gcr_factor" })
    ));
}

#[test]
fn halftone_screentone_matches_target_area_coverage_across_all_patterns() {
    let (w, h) = (128, 128);
    let mut out = vec![0u8; (w * h * 4) as usize];

    for pattern in [
        HalftonePattern::Dot,
        HalftonePattern::Line,
        HalftonePattern::Crosshatch,
        HalftonePattern::Diamond,
    ] {
        for &density in &[0.0_f32, 0.25, 0.5, 0.75, 1.0] {
            let cfg = HalftoneConfig {
                pattern,
                cell_pitch_px: 8.0,
                angle_deg: 45.0,
                tone_density: density,
                softness: 0.02,
                ink_rgba: [0, 0, 0, 255],
                paper_rgba: [255, 255, 255, 255],
            };
            let count = render_halftone_screentone_rgba(None, &mut out, w, h, &cfg).unwrap();
            assert_eq!(count, (w * h) as usize);

            let ink_sum: f64 = out
                .as_chunks::<4>()
                .0
                .iter()
                .map(|p| 1.0 - f64::from(p[0]) / 255.0)
                .sum();
            let avg_ink = ink_sum / f64::from(w * h);
            assert!(
                (avg_ink - f64::from(density)).abs() < 0.04,
                "pattern={pattern:?}, density={density}, avg_ink={avg_ink:.4}"
            );
        }
    }

    // 투명 배경([0,0,0,0]) + 빨강 잉크([255,0,0,255]) 조합에서 어두운 테두리 프린지 0% 검증
    let transparent_cfg = HalftoneConfig {
        pattern: HalftonePattern::Dot,
        cell_pitch_px: 8.0,
        angle_deg: 30.0,
        tone_density: 0.4,
        softness: 0.12,
        ink_rgba: [255, 0, 0, 255],
        paper_rgba: [0, 0, 0, 0],
    };
    render_halftone_screentone_rgba(None, &mut out, w, h, &transparent_cfg).unwrap();
    for px in out.as_chunks::<4>().0 {
        if px[3] > 0 {
            assert_eq!(px[0], 255);
            assert_eq!(px[1], 0);
            assert_eq!(px[2], 0);
        }
    }
}

#[test]
fn liquify_push_bloat_pinch_and_twirl_match_expected_kinematics() {
    let (w, h) = (32, 32);
    let bg = [0, 0, 0, 255];
    let fg = [255, 255, 255, 255];

    // 1) Push: (16, 16) 흰색 점(+4px 오른쪽으로 밀기) -> 무게중심 X 증가
    let mut dot = make_solid_rgba(w, h, bg);
    for y in 14..=18 {
        for x in 14..=18 {
            set_px(&mut dot, w, x, y, fg);
        }
    }
    let mut dst = vec![0u8; dot.len()];
    let push_stats = liquify_displace_rgba(
        &dot,
        &mut dst,
        w,
        h,
        &LiquifyBrushConfig {
            mode: LiquifyMode::Push,
            cx: 16.0,
            cy: 16.0,
            radius: 10.0,
            strength: 1.0,
            dx: 4.0,
            dy: 0.0,
        },
    )
    .unwrap();
    assert!(push_stats.affected_pixels > 200);
    let centroid_x = |buf: &[u8]| -> f64 {
        let mut sx = 0.0;
        let mut sw = 0.0;
        for y in 0..h {
            for x in 0..w {
                let v = f64::from(get_px(buf, w, x, y)[0]);
                sx += f64::from(x) * v;
                sw += v;
            }
        }
        sx / sw
    };
    assert!(centroid_x(&dst) > centroid_x(&dot) + 1.5);
    // 반경 외부 코너 픽셀은 bit-exact 유지
    assert_eq!(get_px(&dst, w, 0, 0), bg);

    // 2) Bloat vs Pinch: 원판 총 밝기 면적 증가(Bloat) vs 감소(Pinch)
    let sum_luma = |buf: &[u8]| -> f64 {
        buf.as_chunks::<4>()
            .0
            .iter()
            .map(|p| f64::from(p[0]))
            .sum()
    };
    let base_luma = sum_luma(&dot);
    let mut bloated = vec![0u8; dot.len()];
    let mut pinched = vec![0u8; dot.len()];
    liquify_displace_rgba(
        &dot,
        &mut bloated,
        w,
        h,
        &LiquifyBrushConfig {
            mode: LiquifyMode::Bloat,
            cx: 16.0,
            cy: 16.0,
            radius: 12.0,
            strength: 0.9,
            dx: 0.0,
            dy: 0.0,
        },
    )
    .unwrap();
    liquify_displace_rgba(
        &dot,
        &mut pinched,
        w,
        h,
        &LiquifyBrushConfig {
            mode: LiquifyMode::Pinch,
            cx: 16.0,
            cy: 16.0,
            radius: 12.0,
            strength: 0.9,
            dx: 0.0,
            dy: 0.0,
        },
    )
    .unwrap();
    assert!(sum_luma(&bloated) > base_luma * 1.3);
    assert!(sum_luma(&pinched) < base_luma * 0.75);

    // 3) TwirlCw vs TwirlCcw: 3시 방향 마커(21, 16)가 CW에서는 아래(+Y), CCW에서는 위(-Y)로 이동
    let mut marker = make_solid_rgba(w, h, bg);
    for y in 15..=17 {
        for x in 20..=22 {
            set_px(&mut marker, w, x, y, fg);
        }
    }
    let centroid_y = |buf: &[u8]| -> f64 {
        let mut sy = 0.0;
        let mut sw = 0.0;
        for y in 0..h {
            for x in 0..w {
                let v = f64::from(get_px(buf, w, x, y)[0]);
                sy += f64::from(y) * v;
                sw += v;
            }
        }
        sy / sw
    };
    let mut cw = vec![0u8; marker.len()];
    let mut ccw = vec![0u8; marker.len()];
    liquify_displace_rgba(
        &marker,
        &mut cw,
        w,
        h,
        &LiquifyBrushConfig {
            mode: LiquifyMode::TwirlCw,
            cx: 16.0,
            cy: 16.0,
            radius: 12.0,
            strength: 1.0,
            dx: 0.0,
            dy: 0.0,
        },
    )
    .unwrap();
    liquify_displace_rgba(
        &marker,
        &mut ccw,
        w,
        h,
        &LiquifyBrushConfig {
            mode: LiquifyMode::TwirlCcw,
            cx: 16.0,
            cy: 16.0,
            radius: 12.0,
            strength: 1.0,
            dx: 0.0,
            dy: 0.0,
        },
    )
    .unwrap();
    assert!(centroid_y(&cw) > 17.5);
    assert!(centroid_y(&ccw) < 14.5);

    // NaN / 음수 반경 거부
    assert!(matches!(
        liquify_displace_rgba(
            &dot,
            &mut dst,
            w,
            h,
            &LiquifyBrushConfig {
                mode: LiquifyMode::Push,
                cx: 16.0,
                cy: 16.0,
                radius: f32::NAN,
                strength: 0.5,
                dx: 1.0,
                dy: 0.0,
            },
        ),
        Err(DrawingCoreError::InvalidParameter { name: "radius" })
    ));
}

// ---------------------------------------------------------------------------
// 3. C-ABI FFI Roundtrip & Pointer-Guard Tests
// ---------------------------------------------------------------------------

#[test]
fn ffi_extended_capabilities_and_mls_vector_psd_roundtrips() {
    let caps = wasm_extended_capabilities();
    assert_eq!(caps, WASM_EXTENDED_CAPABILITIES);
    assert_eq!(caps & 0x0007_FE00, 0x0007_FE00);
    #[cfg(all(feature = "extended-3d", feature = "virtual-3d-physics"))]
    assert_eq!(caps, 0x0007_FFFF);

    // 1) wasm_warp_mesh_rigid_mls: 90도 강체 회전
    let verts = [0.0_f32, 0.0, 10.0, 0.0, 10.0, 10.0];
    let pins = [
        0.0_f32, 0.0, 0.0, 0.0, 1.0, // pin 0 고정
        10.0, 0.0, 0.0, 10.0, 1.0, // pin 1 90도 회전
    ];
    let mut out_verts = [0.0_f32; 6];
    // SAFETY: 테스트용 지역 배열 슬라이스 포인터가 정렬·길이·비중첩 계약을 충족한다.
    let warped = unsafe {
        wasm_warp_mesh_rigid_mls(
            verts.as_ptr(),
            3,
            pins.as_ptr(),
            (pins.len() / MLS_WARP_PIN_STRIDE) as u32,
            1.0,
            out_verts.as_mut_ptr(),
        )
    };
    assert_eq!(warped, 3);
    assert!((out_verts[4] - (-10.0)).abs() < 1e-3);
    assert!((out_verts[5] - 10.0).abs() < 1e-3);
    // 앨리어싱 거부
    assert_eq!(
        unsafe {
            wasm_warp_mesh_rigid_mls(
                out_verts.as_ptr(),
                3,
                pins.as_ptr(),
                2,
                1.0,
                out_verts.as_mut_ptr(),
            )
        },
        FFI_ERR_NULL_OR_ALIAS
    );

    // 2) wasm_vectorize_stroke_cubic: 크기 조회 -> 실제 출력 -> 버퍼 부족 오류
    let mut pts = Vec::new();
    for i in 0..24 {
        let t = i as f32 / 23.0;
        pts.extend_from_slice(&[t * 100.0, (t * std::f32::consts::PI).sin() * 40.0, 0.5 + 0.4 * t]);
    }
    let mut stats = [0.0_f32; VECTORIZE_STATS_LEN];
    let needed = unsafe {
        wasm_vectorize_stroke_cubic(
            pts.as_ptr(),
            (pts.len() / VECTORIZE_POINT_STRIDE) as u32,
            0.25,
            1.0,
            std::ptr::null_mut(),
            0,
            stats.as_mut_ptr(),
        )
    };
    assert!(needed >= 1);
    assert_eq!(stats[0] as i32, needed);
    let mut segs = vec![0.0_f32; needed as usize * VECTORIZE_SEGMENT_STRIDE];
    let written = unsafe {
        wasm_vectorize_stroke_cubic(
            pts.as_ptr(),
            24,
            0.25,
            1.0,
            segs.as_mut_ptr(),
            needed as u32,
            stats.as_mut_ptr(),
        )
    };
    assert_eq!(written, needed);
    assert!((segs[0] - 0.0).abs() < 1e-3);
    assert!(stats[1] <= 1.5);
    // 버퍼 부족 테스트 (needed >= 1 -> cap = 0 with non-null ptr)
    assert_eq!(
        unsafe {
            wasm_vectorize_stroke_cubic(
                pts.as_ptr(),
                24,
                0.25,
                1.0,
                segs.as_mut_ptr(),
                0,
                std::ptr::null_mut(),
            )
        },
        FFI_ERR_BUFFER_LENGTH
    );

    // 3) wasm_parse_psd_header: PSD v1 & PSB v2 + 손상 시그니처 거부
    let psb = build_synthetic_psd(true, 40_000, 30_000, 128);
    let mut meta = [0u64; PSD_HEADER_FFI_U64_LEN];
    let ver = unsafe { wasm_parse_psd_header(psb.as_ptr(), psb.len() as u32, meta.as_mut_ptr()) };
    assert_eq!(ver, 2);
    assert_eq!(meta[0], 2); // version
    assert_eq!(meta[1], 1); // is_psb
    assert_eq!(meta[2], 4); // channels
    assert_eq!(meta[3], 40_000); // width
    assert_eq!(meta[4], 30_000); // height
    assert_eq!(meta[15], 1); // requires_memory64
    let bad = b"NOT_A_PSD_HEADER_BYTES_AT_ALL_000000";
    assert_eq!(
        unsafe { wasm_parse_psd_header(bad.as_ptr(), bad.len() as u32, meta.as_mut_ptr()) },
        FFI_ERR_INVALID_PARAMETER
    );
}

#[test]
fn ffi_pro_raster_tools_end_to_end_roundtrip_and_guards() {
    let (w, h) = (16u32, 16u32);
    let mut rgba = make_solid_rgba(w, h, [255, 255, 255, 255]);
    draw_box_outline(&mut rgba, w, 2, 2, 13, 13, [0, 0, 0, 255]);
    let mut dirty = [0u32; DIRTY_RECT_FFI_U32_LEN];

    // 1) Flood Fill FFI
    let filled = unsafe {
        wasm_flood_fill_rgba(
            rgba.as_mut_ptr(),
            std::ptr::null(),
            w,
            h,
            6,
            6,
            u32::from_le_bytes([20, 140, 250, 255]),
            0,
            0,
            dirty.as_mut_ptr(),
        )
    };
    assert_eq!(filled, 100);
    assert_eq!(dirty, [3, 3, 10, 10]);

    // 2) Magic Wand FFI + Marching Ants FFI
    let mut mask = vec![0u8; (w * h) as usize];
    let selected = unsafe {
        wasm_magic_wand_mask(
            rgba.as_ptr(),
            std::ptr::null(),
            mask.as_mut_ptr(),
            w,
            h,
            6,
            6,
            0,
            0,
            0,
            dirty.as_mut_ptr(),
        )
    };
    assert_eq!(selected, 100);
    assert_eq!(dirty, [3, 3, 10, 10]);

    let seg_count = unsafe {
        wasm_extract_marching_ants_segments(mask.as_ptr(), w, h, 1, std::ptr::null_mut(), 0)
    };
    assert_eq!(seg_count, 4);
    let mut seg_buf = vec![0u32; seg_count as usize * MARCHING_ANT_SEGMENT_STRIDE];
    assert_eq!(
        unsafe {
            wasm_extract_marching_ants_segments(
                mask.as_ptr(),
                w,
                h,
                1,
                seg_buf.as_mut_ptr(),
                seg_count as u32,
            )
        },
        4
    );

    // 3) OKLCH FFI roundtrip
    let pixel_count = w * h;
    let mut oklch = vec![0.0_f32; (pixel_count * 4) as usize];
    let mut back = vec![0u8; (pixel_count * 4) as usize];
    assert_eq!(
        unsafe { wasm_rgba_to_oklch_batch(rgba.as_ptr(), oklch.as_mut_ptr(), pixel_count) },
        pixel_count as i32
    );
    assert_eq!(
        unsafe { wasm_oklch_to_rgba_batch(oklch.as_ptr(), back.as_mut_ptr(), pixel_count) },
        pixel_count as i32
    );
    for (&a, &b) in rgba.iter().zip(back.iter()) {
        assert!(a.abs_diff(b) <= 1);
    }

    // 4) CMYK FFI + 앨리어싱/NaN 거부
    let mut cmyk = vec![0u8; rgba.len()];
    assert_eq!(
        unsafe { wasm_rgba_to_cmyk_batch(rgba.as_ptr(), cmyk.as_mut_ptr(), pixel_count, 0.7) },
        pixel_count as i32
    );
    assert_eq!(
        unsafe { wasm_rgba_to_cmyk_batch(rgba.as_ptr(), rgba.as_mut_ptr(), pixel_count, 0.7) },
        FFI_ERR_NULL_OR_ALIAS
    );
    assert_eq!(
        unsafe { wasm_rgba_to_cmyk_batch(rgba.as_ptr(), cmyk.as_mut_ptr(), pixel_count, f32::NAN) },
        FFI_ERR_INVALID_PARAMETER
    );

    // 5) Halftone FFI + invalid pattern guard
    let mut halftone = vec![0u8; rgba.len()];
    let ht_params: [f32; HALFTONE_FFI_PARAM_COUNT] = [6.0, 45.0, 0.5, 0.05];
    assert_eq!(
        unsafe {
            wasm_render_halftone_screentone(
                rgba.as_ptr(),
                halftone.as_mut_ptr(),
                w,
                h,
                0,
                u32::from_le_bytes([0, 0, 0, 255]),
                u32::from_le_bytes([255, 255, 255, 255]),
                ht_params.as_ptr(),
            )
        },
        pixel_count as i32
    );
    assert_eq!(
        unsafe {
            wasm_render_halftone_screentone(
                std::ptr::null(),
                halftone.as_mut_ptr(),
                w,
                h,
                99,
                0,
                0,
                std::ptr::null(),
            )
        },
        FFI_ERR_INVALID_PARAMETER
    );

    // 6) Liquify FFI + wasm_alloc/wasm_free + overlap guard
    let liq_params: [f32; LIQUIFY_FFI_PARAM_COUNT] = [8.0, 8.0, 5.0, 0.8, 2.0, -1.0];
    let dst_ptr = wasm_alloc(rgba.len());
    assert!(!dst_ptr.is_null());
    let affected = unsafe {
        wasm_liquify_displace_rgba(
            rgba.as_ptr(),
            dst_ptr,
            w,
            h,
            0,
            liq_params.as_ptr(),
            dirty.as_mut_ptr(),
        )
    };
    assert!(affected > 50);
    assert!(dirty[2] > 0 && dirty[3] > 0);
    assert_eq!(
        unsafe {
            wasm_liquify_displace_rgba(
                rgba.as_ptr(),
                rgba.as_mut_ptr(),
                w,
                h,
                0,
                liq_params.as_ptr(),
                std::ptr::null_mut(),
            )
        },
        FFI_ERR_NULL_OR_ALIAS
    );
    unsafe { wasm_free(dst_ptr, rgba.len()) };
}

#[test]
fn flood_fill_and_marching_ants_handle_1x1_and_large_closing_radius_safely() {
    // 1x1 캔버스 + 반경이 캔버스보다 큰 gap_closing_radius=8 경계 테스트
    let mut one = vec![10u8, 20, 30, 255];
    let res = flood_fill_rgba_scanline(
        &mut one,
        1,
        1,
        0,
        0,
        [200, 100, 50, 255],
        &FloodFillConfig {
            tolerance: 0,
            gap_closing_radius: 8,
        },
        None,
    )
    .unwrap();
    assert_eq!(res.filled_pixels, 1);
    assert_eq!(
        res.dirty_rect,
        DirtyRect {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
        }
    );
    assert_eq!(one, vec![200, 100, 50, 255]);

    let segs = extract_marching_ants_segments(&[255], 1, 1).unwrap();
    assert_eq!(segs.len(), 4);
    let perim: u32 = segs
        .iter()
        .map(|s| s.x0.abs_diff(s.x1) + s.y0.abs_diff(s.y1))
        .sum();
    assert_eq!(perim, 4);
}

#[test]
fn halftone_source_modulation_and_liquify_noop_boundaries() {
    let (w, h) = (32u32, 16u32);
    // 왼쪽 절반은 완전 검정(밀도 1.0), 오른쪽 절반은 완전 흰색(밀도 0.0)
    let mut src = make_solid_rgba(w, h, [255, 255, 255, 255]);
    for y in 0..h {
        for x in 0..(w / 2) {
            set_px(&mut src, w, x, y, [0, 0, 0, 255]);
        }
    }
    let mut out = vec![0u8; src.len()];
    let cfg = HalftoneConfig {
        pattern: HalftonePattern::Crosshatch,
        cell_pitch_px: 6.0,
        angle_deg: 0.0,
        tone_density: 1.0,
        softness: 0.0,
        ink_rgba: [0, 0, 0, 255],
        paper_rgba: [255, 255, 255, 255],
    };
    render_halftone_screentone_rgba(Some(&src), &mut out, w, h, &cfg).unwrap();
    // 왼쪽 절반은 전부 잉크([0,0,0,255]), 오른쪽 절반은 전부 용지([255,255,255,255])
    assert_eq!(get_px(&out, w, 4, 8), [0, 0, 0, 255]);
    assert_eq!(get_px(&out, w, 24, 8), [255, 255, 255, 255]);

    // 리퀴파이: 캔버스 바깥 중심 또는 strength=0은 원본 복제 + 0픽셀
    let mut liq_out = vec![0u8; src.len()];
    let oob = liquify_displace_rgba(
        &src,
        &mut liq_out,
        w,
        h,
        &LiquifyBrushConfig {
            mode: LiquifyMode::Bloat,
            cx: -50.0,
            cy: -50.0,
            radius: 10.0,
            strength: 0.8,
            dx: 0.0,
            dy: 0.0,
        },
    )
    .unwrap();
    assert_eq!(oob.affected_pixels, 0);
    assert_eq!(oob.dirty_rect, EMPTY_DIRTY_RECT);
    assert_eq!(liq_out, src);

    let zero_str = liquify_displace_rgba(
        &src,
        &mut liq_out,
        w,
        h,
        &LiquifyBrushConfig {
            mode: LiquifyMode::TwirlCw,
            cx: 16.0,
            cy: 8.0,
            radius: 8.0,
            strength: 0.0,
            dx: 0.0,
            dy: 0.0,
        },
    )
    .unwrap();
    assert_eq!(zero_str.affected_pixels, 0);
    assert_eq!(liq_out, src);
}

#[test]
fn ffi_psd_v1_truncation_and_marching_ants_error_guards() {
    let psd1 = build_synthetic_psd(false, 2048, 4096, 64);
    let mut meta = [0u64; PSD_HEADER_FFI_U64_LEN];
    let ver = unsafe { wasm_parse_psd_header(psd1.as_ptr(), psd1.len() as u32, meta.as_mut_ptr()) };
    assert_eq!(ver, 1);
    assert_eq!(meta[1], 0); // is_psb = false
    assert_eq!(meta[3], 2048);
    assert_eq!(meta[4], 4096);
    assert_eq!(meta[15], 0); // requires_memory64 = false

    // 잘린 입력 거부
    assert_eq!(
        unsafe { wasm_parse_psd_header(psd1.as_ptr(), 10, meta.as_mut_ptr()) },
        FFI_ERR_BUFFER_LENGTH
    );

    // 마칭 앤츠: threshold=0 및 버퍼 부족 오류 검증
    let mask = [255u8; 4];
    let mut tiny = [0u32; 4];
    assert_eq!(
        unsafe { wasm_extract_marching_ants_segments(mask.as_ptr(), 2, 2, 0, tiny.as_mut_ptr(), 1) },
        FFI_ERR_INVALID_PARAMETER
    );
    assert_eq!(
        unsafe { wasm_extract_marching_ants_segments(mask.as_ptr(), 2, 2, 1, tiny.as_mut_ptr(), 1) },
        FFI_ERR_BUFFER_LENGTH
    );
}
