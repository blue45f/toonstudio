use super::*;

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
        &nx,
        &ny,
        &nz,
        &depth,
        w,
        h,
        &LtLineArtConfig::default(),
        &mut out,
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
        &nx,
        &ny,
        &nz,
        &depth,
        w,
        h,
        &LtLineArtConfig::default(),
        &mut out,
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
        &nx,
        &ny,
        &nz,
        &depth,
        w,
        h,
        &LtLineArtConfig::default(),
        &mut out,
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
        &nx,
        &ny,
        &nz,
        &depth,
        w,
        h,
        &LtLineArtConfig::default(),
        &mut out,
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
        if v <= e0 {
            return 0.0;
        }
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
            let gx =
                (-d(xm, ym) + d(xp, ym)) + 2.0 * (-d(xm, y) + d(xp, y)) + (-d(xm, yp) + d(xp, yp));
            let gy = (-d(xm, ym) - 2.0 * d(x, ym) - d(xp, ym))
                + (d(xm, yp) + 2.0 * d(x, yp) + d(xp, yp));
            let dg = (gx * gx + gy * gy).sqrt() * 0.25;
            let nc = unit(y * wu + x);
            let dot = |o: [f32; 3]| (nc[0] * o[0] + nc[1] * o[1] + nc[2] * o[2]).clamp(-1.0, 1.0);
            let nd = (1.0 - dot(unit(y * wu + xm)))
                .max(1.0 - dot(unit(y * wu + xp)))
                .max(1.0 - dot(unit(ym * wu + x)))
                .max(1.0 - dot(unit(yp * wu + x)));
            let dr = smooth(
                cfg.depth_threshold,
                cfg.depth_threshold + cfg.edge_softness,
                dg,
            );
            let nr = smooth(
                cfg.normal_edge_threshold,
                cfg.normal_edge_threshold + cfg.edge_softness,
                nd,
            );
            let raw = ((dr * cfg.depth_weight)
                .max(nr * cfg.normal_weight)
                .clamp(0.0, 1.0)
                * 255.0)
                .round() as u8;
            let expected = if raw < cfg.min_ink_alpha { 0 } else { raw };
            assert_eq!(
                out[y * wu + x],
                expected,
                "픽셀 ({x},{y}) 4-와이드 vs 스칼라 참조 불일치"
            );
        }
    }
}

#[test]
fn lt_lineart_handles_tiny_dimensions_hard_edges_and_sanitizes_nan_inf() {
    // 1x1 최소 크기 + NaN/Inf 정제 안전성
    let mut out1 = [99u8; 1];
    let s1 = extract_lt_lineart_from_gbuffer(
        &[f32::NAN],
        &[0.0],
        &[1.0],
        &[f32::INFINITY],
        1,
        1,
        &LtLineArtConfig::default(),
        &mut out1,
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
    let hard_cfg = LtLineArtConfig {
        edge_softness: 0.0,
        ..LtLineArtConfig::default()
    };
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
        Err(DrawingCoreError::InvalidDimensions {
            width: 0,
            height: 4
        })
    );
    assert_eq!(
        extract_lt_lineart_from_gbuffer(
            &[0.0; 3], &[0.0; 4], &[1.0; 4], &[0.0; 4], 2, 2, &cfg, &mut out
        ),
        Err(DrawingCoreError::BufferLengthMismatch {
            expected: 4,
            actual: 3
        })
    );
    let bad_cfg = LtLineArtConfig {
        depth_threshold: f32::NAN,
        ..cfg
    };
    assert_eq!(
        extract_lt_lineart_from_gbuffer(
            &[0.0; 4], &[0.0; 4], &[1.0; 4], &[0.0; 4], 2, 2, &bad_cfg, &mut out
        ),
        Err(DrawingCoreError::InvalidParameter { name: "config" })
    );
    let bad_norm_cfg = LtLineArtConfig {
        normal_edge_threshold: 2.5,
        ..cfg
    };
    assert_eq!(
        extract_lt_lineart_from_gbuffer(
            &[0.0; 4],
            &[0.0; 4],
            &[1.0; 4],
            &[0.0; 4],
            2,
            2,
            &bad_norm_cfg,
            &mut out
        ),
        Err(DrawingCoreError::InvalidParameter { name: "config" })
    );
}
