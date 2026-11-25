use super::*;

fn run_stamp(
    w: u32,
    h: u32,
    lut: &PaperTileLut,
    p: &TactileBrushParams,
) -> (Vec<u8>, Vec<f32>, TactileStampStats) {
    let (mut rgba, mut hb) = (
        vec![0u8; (w * h * 4) as usize],
        vec![0.0_f32; (w * h) as usize],
    );
    let st = stamp_tactile_bristle_rgba(&mut rgba, &mut hb, w, h, lut, p).expect("ok");
    (rgba, hb, st)
}

#[test]
fn paper_lut_all_four_kinds_are_deterministic_and_bounded() {
    for kind in [
        PaperKind::Hanji,
        PaperKind::Kent,
        PaperKind::ColdPress,
        PaperKind::LinenCanvas,
    ] {
        let a = generate_paper_tile_lut(kind, 2026);
        assert_eq!(
            (a.heights().len(), a.kind(), a.seed()),
            (PAPER_TILE_LEN, kind, 2026)
        );
        assert_eq!(a, generate_paper_tile_lut(kind, 2026));
        assert!(a
            .heights()
            .iter()
            .all(|v| v.is_finite() && (0.0..=1.0).contains(v)));
        assert_ne!(a.heights(), generate_paper_tile_lut(kind, 7777).heights());
    }
}

#[test]
fn paper_lut_four_kinds_exhibit_distinct_physical_statistics() {
    let (kent, hanji) = (
        generate_paper_tile_lut(PaperKind::Kent, 42).stats(),
        generate_paper_tile_lut(PaperKind::Hanji, 42).stats(),
    );
    let (cold, linen) = (
        generate_paper_tile_lut(PaperKind::ColdPress, 42).stats(),
        generate_paper_tile_lut(PaperKind::LinenCanvas, 42).stats(),
    );
    assert!(kent.std_dev < 0.08 && cold.std_dev > kent.std_dev * 2.5);
    assert!(hanji.std_dev > kent.std_dev * 1.5 && linen.std_dev > kent.std_dev * 2.0);
}

#[test]
fn paper_lut_wrapping_o1_sampling_handles_negative_and_periodic_coords() {
    let lut = generate_paper_tile_lut(PaperKind::ColdPress, 101);
    for &(x, y) in &[(0, 0), (17, 41), (63, 63), (-1, -1), (-65, 130)] {
        let base = lut.sample_wrapped(x, y);
        assert_eq!(base, lut.sample_wrapped(x + 64, y));
        assert_eq!(base, lut.sample_wrapped(x - 128, y + 256));
    }
    assert!((0.0..=1.0).contains(&lut.sample_wrapped(i32::MIN, i32::MAX)));
    let bi = lut.sample_bilinear_wrapped(-12.25, 99.75, 1.5);
    assert!(bi.is_finite() && (0.0..=1.0).contains(&bi));
}

#[test]
fn paper_lut_seamless_wrap_continuity_has_no_edge_cliff() {
    let lut = generate_paper_tile_lut(PaperKind::ColdPress, 55);
    let seam: f32 = (0..64)
        .map(|y| (lut.sample_wrapped(63, y) - lut.sample_wrapped(0, y)).abs())
        .sum();
    let inner: f32 = (0..64)
        .map(|y| (lut.sample_wrapped(31, y) - lut.sample_wrapped(32, y)).abs())
        .sum();
    assert!(seam < inner * 2.0 + 1.0);
}

#[test]
fn paper_lut_central_difference_normal_is_bounded_and_respects_relief() {
    let lut = generate_paper_tile_lut(PaperKind::LinenCanvas, 9);
    assert_eq!(lut.sample_normal_xy(10, 10, 0.0), [0.0, 0.0]);
    assert_eq!(lut.sample_normal_xy(10, 10, f32::NAN), [0.0, 0.0]);
    let mut max_sq = 0.0_f32;
    for y in 0..64 {
        for x in 0..64 {
            let [nx, ny] = lut.sample_normal_xy(x, y, 2.0);
            let sq = nx * nx + ny * ny;
            assert!(sq.is_finite() && sq < 1.0);
            max_sq = max_sq.max(sq);
        }
    }
    assert!(max_sq > 0.05);
}

#[test]
fn stamp_pressure_monotonicity_increases_total_pigment_coverage() {
    let lut = generate_paper_tile_lut(PaperKind::ColdPress, 2026);
    let totals: Vec<(usize, u64)> = [0.15_f32, 0.50, 0.95]
        .iter()
        .map(|&pressure| {
            let p = TactileBrushParams {
                cx: 32.0,
                cy: 32.0,
                radius: 16.0,
                pressure,
                dryness: 0.4,
                paper_tooth_strength: 0.95,
                wet_edge_strength: 0.0,
                impasto_height: 0.0,
                ..Default::default()
            };
            let (rgba, _, st) = run_stamp(64, 64, &lut, &p);
            (
                st.touched_pixels,
                rgba.iter().skip(3).step_by(4).map(|&a| u64::from(a)).sum(),
            )
        })
        .collect();
    assert!(totals[0].1 < totals[1].1 && totals[1].1 < totals[2].1 && totals[0].0 <= totals[2].0);
}

#[test]
fn stamp_paper_tooth_modulation_favors_peaks_over_valleys_at_low_pressure() {
    let lut = generate_paper_tile_lut(PaperKind::ColdPress, 88);
    let p = TactileBrushParams {
        cx: 32.0,
        cy: 32.0,
        radius: 22.0,
        pressure: 0.25,
        speed: 0.0,
        dryness: 0.5,
        paper_tooth_strength: 1.0,
        wet_edge_strength: 0.0,
        impasto_height: 0.0,
        ..Default::default()
    };
    let (rgba, _, _) = run_stamp(64, 64, &lut, &p);
    let (mut pa, mut pn, mut va, mut vn) = (0u64, 0u64, 0u64, 0u64);
    for y in 20..44 {
        for x in 20..44 {
            let (h, a) = (
                lut.sample_wrapped(x, y),
                u64::from(rgba[((y as usize) * 64 + x as usize) * 4 + 3]),
            );
            if h >= 0.72 {
                pa += a;
                pn += 1;
            } else if h <= 0.28 {
                va += a;
                vn += 1;
            }
        }
    }
    assert!(pn > 0 && vn > 0 && (pa as f64 / pn as f64) > (va as f64 / vn as f64) * 1.4);
}

#[test]
fn stamp_split_bristle_creates_higher_cross_stroke_variance_when_dry_and_fast() {
    let lut = generate_paper_tile_lut(PaperKind::Kent, 12);
    let cross_var = |dryness: f32, speed: f32| -> f64 {
        let p = TactileBrushParams {
            cx: 32.0,
            cy: 32.0,
            radius: 20.0,
            pressure: 0.75,
            speed,
            dryness,
            bristle_count: 8,
            paper_tooth_strength: 0.0,
            wet_edge_strength: 0.0,
            impasto_height: 0.0,
            ..Default::default()
        };
        let (rgba, _, _) = run_stamp(64, 64, &lut, &p);
        let vals: Vec<f64> = (18..46)
            .map(|y| f64::from(rgba[(y * 64 + 32) * 4 + 3]))
            .collect();
        let mean = vals.iter().sum::<f64>() / vals.len() as f64;
        vals.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / vals.len() as f64
    };
    assert!(cross_var(0.95, 1.5) > cross_var(0.0, 0.0) * 3.0);
}

#[test]
fn stamp_bristle_count_clamps_safely_between_3_and_16() {
    let lut = generate_paper_tile_lut(PaperKind::Kent, 5);
    let run = |bristle_count: u8| {
        run_stamp(
            48,
            48,
            &lut,
            &TactileBrushParams {
                cx: 24.0,
                cy: 24.0,
                radius: 16.0,
                dryness: 0.9,
                speed: 1.2,
                bristle_count,
                paper_tooth_strength: 0.0,
                wet_edge_strength: 0.0,
                impasto_height: 0.0,
                ..Default::default()
            },
        )
        .0
    };
    assert_eq!(run(0), run(MIN_BRISTLE_COUNT));
    assert_eq!(run(255), run(MAX_BRISTLE_COUNT));
    assert_ne!(run(MIN_BRISTLE_COUNT), run(MAX_BRISTLE_COUNT));
}

#[test]
fn stamp_tilt_elongates_footprint_horizontally_along_direction() {
    let lut = generate_paper_tile_lut(PaperKind::Kent, 7);
    let span = |tilt_x: f32| {
        let (_, _, st) = run_stamp(
            80,
            80,
            &lut,
            &TactileBrushParams {
                cx: 40.0,
                cy: 40.0,
                radius: 14.0,
                tilt_x,
                tilt_y: 0.0,
                dryness: 0.0,
                paper_tooth_strength: 0.0,
                wet_edge_strength: 0.0,
                impasto_height: 0.0,
                ..Default::default()
            },
        );
        st.dirty_max_x - st.dirty_min_x
    };
    assert!(span(0.95) > span(0.0) + 8);
}

#[test]
fn stamp_wet_edge_pooling_concentrates_rim_alpha_over_interior() {
    let lut = generate_paper_tile_lut(PaperKind::Kent, 3);
    let (rgba, _, _) = run_stamp(
        64,
        64,
        &lut,
        &TactileBrushParams {
            cx: 32.0,
            cy: 32.0,
            radius: 20.0,
            color_rgba: [40, 90, 180, 175],
            pressure: 0.75,
            speed: 0.0,
            dryness: 0.05,
            paper_tooth_strength: 0.0,
            wet_edge_strength: 1.0,
            impasto_height: 0.0,
            ..Default::default()
        },
    );
    let (mut isum, mut in_, mut rsum, mut rn) = (0u64, 0u64, 0u64, 0u64);
    for y in 0..64 {
        for x in 0..64 {
            let (d, a) = (
                (x as f32 + 0.5 - 32.0).hypot(y as f32 + 0.5 - 32.0) / 20.0,
                u64::from(rgba[(y * 64 + x) * 4 + 3]),
            );
            if d <= 0.35 {
                isum += a;
                in_ += 1;
            } else if (0.76..=0.90).contains(&d) {
                rsum += a;
                rn += 1;
            }
        }
    }
    assert!((rsum as f64 / rn as f64) > (isum as f64 / in_ as f64) * 1.25);
}

#[test]
fn stamp_impasto_updates_height_buffer_and_creates_45deg_directional_highlight() {
    let lut = generate_paper_tile_lut(PaperKind::Kent, 19);
    let (rgba, _, st) = run_stamp(
        64,
        64,
        &lut,
        &TactileBrushParams {
            cx: 32.0,
            cy: 32.0,
            radius: 18.0,
            color_rgba: [150, 120, 95, 255],
            pressure: 0.9,
            speed: 0.0,
            dryness: 0.0,
            paper_tooth_strength: 0.0,
            wet_edge_strength: 0.0,
            impasto_height: 1.4,
            ..Default::default()
        },
    );
    assert!(st.peak_height > 0.5 && st.peak_specular > 0.05);
    let luma = |x: usize, y: usize| -> u32 {
        let o = (y * 64 + x) * 4;
        u32::from(rgba[o]) + u32::from(rgba[o + 1]) + u32::from(rgba[o + 2])
    };
    assert!(luma(41, 41) > luma(22, 22) + 30);
}

#[test]
fn stamp_zero_impasto_preserves_height_buffer() {
    let lut = generate_paper_tile_lut(PaperKind::Hanji, 1);
    let (mut rgba, mut hb) = (vec![0u8; 32 * 32 * 4], vec![0.25_f32; 32 * 32]);
    let st = stamp_tactile_bristle_rgba(
        &mut rgba,
        &mut hb,
        32,
        32,
        &lut,
        &TactileBrushParams {
            cx: 16.0,
            cy: 16.0,
            radius: 10.0,
            impasto_height: 0.0,
            ..Default::default()
        },
    )
    .expect("ok");
    assert!(st.touched_pixels > 0 && st.peak_height == 0.0 && hb.iter().all(|&v| v == 0.25));
}

#[test]
fn stamp_completely_oob_dab_is_safe_noop() {
    let lut = generate_paper_tile_lut(PaperKind::ColdPress, 4);
    for &(cx, cy) in &[(-100.0, -100.0), (500.0, 500.0), (16.0, -50.0)] {
        let (rgba, _, st) = run_stamp(
            32,
            32,
            &lut,
            &TactileBrushParams {
                cx,
                cy,
                radius: 8.0,
                ..Default::default()
            },
        );
        assert_eq!(st.touched_pixels, 0);
        assert!(rgba.iter().all(|&b| b == 0));
    }
}

#[test]
fn stamp_corner_clipped_dab_stamps_visible_quadrant_without_oob() {
    let lut = generate_paper_tile_lut(PaperKind::Hanji, 6);
    let (rgba, _, st) = run_stamp(
        32,
        32,
        &lut,
        &TactileBrushParams {
            cx: 0.0,
            cy: 0.0,
            radius: 10.0,
            ..Default::default()
        },
    );
    assert!(st.touched_pixels > 20 && st.dirty_min_x == 0 && st.dirty_min_y == 0 && rgba[3] > 0);
}

#[test]
fn stamp_rejects_nan_infinity_and_buffer_mismatches_and_sanitizes_nan_height() {
    let lut = generate_paper_tile_lut(PaperKind::Kent, 2);
    let (mut rgba, mut hb) = (vec![0u8; 16 * 16 * 4], vec![f32::NAN; 16 * 16]);
    assert!(stamp_tactile_bristle_rgba(
        &mut rgba,
        &mut hb,
        16,
        16,
        &lut,
        &TactileBrushParams {
            cx: f32::NAN,
            ..Default::default()
        }
    )
    .is_err());
    assert!(stamp_tactile_bristle_rgba(
        &mut rgba,
        &mut hb,
        16,
        16,
        &lut,
        &TactileBrushParams {
            radius: 0.0,
            ..Default::default()
        }
    )
    .is_err());
    assert!(stamp_tactile_bristle_rgba(
        &mut rgba,
        &mut hb,
        16,
        16,
        &lut,
        &TactileBrushParams {
            paper_scale: -1.0,
            ..Default::default()
        }
    )
    .is_err());
    assert!(stamp_tactile_bristle_rgba(
        &mut rgba[..16],
        &mut hb,
        16,
        16,
        &lut,
        &TactileBrushParams::default()
    )
    .is_err());
    assert!(stamp_tactile_bristle_rgba(
        &mut rgba,
        &mut hb[..8],
        16,
        16,
        &lut,
        &TactileBrushParams::default()
    )
    .is_err());
    let st = stamp_tactile_bristle_rgba(
        &mut rgba,
        &mut hb,
        16,
        16,
        &lut,
        &TactileBrushParams {
            cx: 8.0,
            cy: 8.0,
            radius: 5.0,
            impasto_height: 0.8,
            ..Default::default()
        },
    )
    .expect("ok");
    assert!(st.touched_pixels > 0 && hb[8 * 16 + 8].is_finite() && hb[8 * 16 + 8] > 0.0);
}

#[test]
fn stamp_zero_alpha_pigment_and_paper_kind_codes() {
    let lut = generate_paper_tile_lut(PaperKind::LinenCanvas, 8);
    let (_, _, st) = run_stamp(
        16,
        16,
        &lut,
        &TactileBrushParams {
            color_rgba: [255, 0, 0, 0],
            ..Default::default()
        },
    );
    assert_eq!(st.touched_pixels, 0);
    assert_eq!(
        (
            PaperKind::from_u32(0),
            PaperKind::from_u32(3),
            PaperKind::from_u32(4)
        ),
        (Some(PaperKind::Hanji), Some(PaperKind::LinenCanvas), None)
    );
}
