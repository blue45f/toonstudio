#![cfg(feature = "extended-suite")]

use std::f32::consts::PI;

use studio_wasm64_drawing_core::{
    build_arc_length_table, classify_and_dedup_tiles, cmyk_to_rgba_proof_batch,
    display_p3_to_oklch_batch, display_p3_to_srgb_rgba_batch, expand_variable_width_stroke,
    extract_palette_median_cut, flatten_cubic_bezier_adaptive, fnv1a_hash_64, hit_test_polygon_2d,
    hit_test_polygon_batch_2d, measure_loudness_true_peak, mix_and_master_stereo,
    mix_tracks_stereo, oklch_f32_to_srgb_rgba_batch, oklch_to_display_p3_batch,
    plan_webtoon_smart_slices, process_biquad_stereo_in_place, process_dynamics_stereo,
    process_schroeder_reverb_stereo, resample_mono, rgba_to_cmyk_tac_batch,
    sample_polyline_at_arc_length, simplify_polyline_rdp, smooth_polyline_chaikin,
    srgb_rgba_to_display_p3_batch, srgb_rgba_to_oklch_f32_batch, wasm_audio_biquad_eq_stereo,
    wasm_audio_mix_master_stereo, wasm_audio_resample_mono, wasm_audio_schroeder_reverb_stereo,
    wasm_color_extract_palette_median_cut, wasm_color_p3_to_srgb_batch,
    wasm_color_rgba_to_cmyk_tac_batch, wasm_color_srgb_to_p3_batch,
    wasm_vector_expand_stroke_outline, wasm_vector_flatten_bezier_arc_len,
    wasm_vector_hit_test_batch, wasm_vector_simplify_rdp, wasm_vector_smooth_chaikin,
    wasm_wave3_capabilities, wasm_webtoon_dedup_tiles_fnv64, wasm_webtoon_plan_smart_slices,
    BiquadCoeffs, BiquadFilterKind, BiquadState, CmykTacConfig, DynamicsConfig, DynamicsState,
    MixTrackParams, ResampleInterpolation, SchroederReverbConfig, StrokeJoinStyle, TileClass,
    WebtoonSliceConfig, WindingFillRule, SILENCE_LUFS_FLOOR, WASM_WAVE3_CAPABILITIES,
};

fn rms(samples: &[f32]) -> f32 {
    let sum: f32 = samples.iter().map(|s| s * s).sum();
    (sum / (samples.len().max(1) as f32)).sqrt()
}

fn sine_wave(frames: usize, freq_hz: f32, sr: f32, amp: f32) -> Vec<f32> {
    (0..frames)
        .map(|i| (2.0 * PI * freq_hz * (i as f32) / sr).sin() * amp)
        .collect()
}

#[test]
fn audio_biquad_eq_lowpass_highpass_peaking_and_chunk_continuity() {
    let sr = 48_000.0;
    let low = sine_wave(4096, 150.0, sr, 0.5);
    let high = sine_wave(4096, 8_000.0, sr, 0.5);

    // Lowpass at 1 kHz passes 150 Hz and strongly attenuates 8 kHz
    let lp = BiquadCoeffs::design(BiquadFilterKind::Lowpass, sr, 1000.0, 0.707, 0.0).unwrap();
    let (mut l_low, mut r_high) = (low.clone(), high.clone());
    let (mut sl, mut sr_st) = (BiquadState::default(), BiquadState::default());
    process_biquad_stereo_in_place(&mut l_low, &mut r_high, &lp, &mut sl, &mut sr_st).unwrap();
    assert!(rms(&l_low[512..]) > 0.30);
    assert!(rms(&r_high[512..]) < 0.03);

    // Highpass at 2 kHz passes 8 kHz and strongly attenuates 150 Hz
    let hp = BiquadCoeffs::design(BiquadFilterKind::Highpass, sr, 2000.0, 0.707, 0.0).unwrap();
    let (mut l_low2, mut r_high2) = (low.clone(), high.clone());
    let (mut sl2, mut sr2) = (BiquadState::default(), BiquadState::default());
    process_biquad_stereo_in_place(&mut l_low2, &mut r_high2, &hp, &mut sl2, &mut sr2).unwrap();
    assert!(rms(&l_low2[512..]) < 0.02);
    assert!(rms(&r_high2[512..]) > 0.30);

    // Peaking +6 dB at 1 kHz boosts 1 kHz sine and preserves chunked state continuity
    let pk = BiquadCoeffs::design(BiquadFilterKind::Peaking, sr, 1000.0, 1.5, 6.0).unwrap();
    let mut full_l = sine_wave(1024, 1000.0, sr, 0.25);
    let mut full_r = full_l.clone();
    let mut chunk_l = full_l.clone();
    let mut chunk_r = full_r.clone();
    process_biquad_stereo_in_place(&mut full_l, &mut full_r, &pk, &mut BiquadState::default(), &mut BiquadState::default()).unwrap();
    let (mut csl, mut csr) = (BiquadState::default(), BiquadState::default());
    process_biquad_stereo_in_place(&mut chunk_l[..512], &mut chunk_r[..512], &pk, &mut csl, &mut csr).unwrap();
    process_biquad_stereo_in_place(&mut chunk_l[512..], &mut chunk_r[512..], &pk, &mut csl, &mut csr).unwrap();
    assert!(rms(&full_l[256..]) > rms(&sine_wave(768, 1000.0, sr, 0.25)) * 1.8);
    for (a, b) in full_l.iter().zip(chunk_l.iter()) {
        assert!((a - b).abs() < 1e-6);
    }
}

#[test]
fn audio_loudness_true_peak_dynamics_reverb_resampler_and_mixer() {
    let sr = 48_000.0;
    // Silence returns floor
    let silent = measure_loudness_true_peak(&[0.0; 256], &[0.0; 256], sr).unwrap();
    assert_eq!(silent.integrated_lufs, SILENCE_LUFS_FLOOR);

    // Inter-sample True-Peak detection on Fs/4 45-deg shifted sine (peaks between samples!)
    let isp: Vec<f32> = (0..64)
        .map(|i| ((i as f32) * PI * 0.5 + PI * 0.25).sin())
        .collect();
    let isp_metrics = measure_loudness_true_peak(&isp, &isp, sr).unwrap();
    assert!(isp_metrics.sample_peak_linear < 0.72);
    assert!(isp_metrics.true_peak_linear > isp_metrics.sample_peak_linear + 0.15);

    // Dynamics compressor + brickwall limiter enforces ceiling strictly on +12 dB hot signal
    let mut dl = sine_wave(2048, 440.0, sr, 4.0);
    let mut dr = sine_wave(2048, 440.0, sr, 4.0);
    let dcfg = DynamicsConfig {
        sample_rate: sr,
        threshold_db: -12.0,
        ratio: 6.0,
        knee_db: 6.0,
        attack_ms: 1.0,
        release_ms: 50.0,
        makeup_db: 3.0,
        limiter_ceiling_db: -1.0,
    };
    let ceiling_lin = 10.0_f32.powf(-1.0 / 20.0);
    let dstats = process_dynamics_stereo(&mut dl, &mut dr, &dcfg, &mut DynamicsState { env_linear: 0.0, limiter_gain: 1.0 }).unwrap();
    assert!(dstats.max_gain_reduction_db > 10.0);
    assert!(dstats.peak_after_linear <= ceiling_lin + 1e-5);
    for (&l, &r) in dl.iter().zip(dr.iter()) {
        assert!(l.abs() <= ceiling_lin + 1e-5 && r.abs() <= ceiling_lin + 1e-5);
    }

    // Schroeder reverb generates stereo decorrelated decay tail from unit impulse
    let mut imp_l = vec![0.0_f32; 4096];
    let mut imp_r = vec![0.0_f32; 4096];
    imp_l[0] = 1.0;
    imp_r[0] = 1.0;
    let mut rev_l = vec![0.0_f32; 4096];
    let mut rev_r = vec![0.0_f32; 4096];
    process_schroeder_reverb_stereo(&imp_l, &imp_r, &mut rev_l, &mut rev_r, &SchroederReverbConfig::default()).unwrap();
    assert!(rms(&rev_l[1500..]) > 1e-3);
    let stereo_diff: f32 = rev_l[1500..].iter().zip(rev_r[1500..].iter()).map(|(a, b)| (a - b).abs()).sum();
    assert!(stereo_diff > 1.0);

    // Cubic Hermite resampler achieves higher accuracy than linear on smooth sine
    let src = sine_wave(512, 1200.0, sr, 0.8);
    let mut out_lin = vec![0.0_f32; 256];
    let mut out_cub = vec![0.0_f32; 256];
    let ratio = 1.37_f32;
    resample_mono(&src, &mut out_lin, ratio, ResampleInterpolation::Linear).unwrap();
    resample_mono(&src, &mut out_cub, ratio, ResampleInterpolation::CubicHermite).unwrap();
    let err = |buf: &[f32]| -> f32 {
        buf[8..240]
            .iter()
            .enumerate()
            .map(|(k, &v)| {
                let idx = (k + 8) as f32 * ratio;
                let exact = (2.0 * PI * 1200.0 * idx / sr).sin() * 0.8;
                (v - exact).abs()
            })
            .fold(0.0_f32, f32::max)
    };
    assert!(err(&out_cub) < err(&out_lin));

    // Multi-track equal-power mixer + mute + master pipeline
    let frames = 1024;
    let t0 = sine_wave(frames, 300.0, sr, 0.5);
    let t1 = sine_wave(frames, 600.0, sr, 0.5);
    let t2 = sine_wave(frames, 900.0, sr, 0.9);
    let mut tracks = Vec::with_capacity(frames * 3);
    tracks.extend_from_slice(&t0);
    tracks.extend_from_slice(&t1);
    tracks.extend_from_slice(&t2);
    let params = [
        MixTrackParams { gain: 0.8, pan: -1.0, mute: false },
        MixTrackParams { gain: 0.8, pan: 1.0, mute: false },
        MixTrackParams { gain: 1.0, pan: 0.0, mute: true },
    ];
    let (mut ml, mut mr) = (vec![0.0_f32; frames], vec![0.0_f32; frames]);
    let active = mix_tracks_stereo(&tracks, 3, frames, &params, &mut ml, &mut mr).unwrap();
    assert_eq!(active, 2);
    // Hard-panned L track dominates ml, R track dominates mr
    assert!((ml[10] - t0[10] * 0.8 * 2.0_f32.sqrt()).abs() < 1e-4);
    assert!((mr[10] - t1[10] * 0.8 * 2.0_f32.sqrt()).abs() < 1e-4);

    let report = mix_and_master_stereo(&tracks, 3, frames, &params, &dcfg, &mut ml, &mut mr).unwrap();
    assert_eq!(report.active_tracks, 2);
    assert!(report.loudness.integrated_lufs > -30.0 && report.loudness.integrated_lufs < 0.0);
}

#[test]
fn vector_path_rdp_chaikin_bezier_stroke_outline_and_winding_hit_test() {
    // 1) RDP removes collinear intermediates while keeping sharp corner
    let poly = [0.0, 0.0, 2.0, 0.05, 5.0, -0.04, 10.0, 0.0, 10.0, 10.0];
    let simp = simplify_polyline_rdp(&poly, 0.2).unwrap();
    assert_eq!(simp, vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0]);

    // 2) Chaikin open preserves endpoints; closed produces 2*N per pass
    let open = [0.0, 0.0, 10.0, 0.0, 10.0, 10.0];
    let sm_open = smooth_polyline_chaikin(&open, 2, false, 0.25).unwrap();
    assert_eq!((sm_open[0], sm_open[1]), (0.0, 0.0));
    assert_eq!((sm_open[sm_open.len() - 2], sm_open[sm_open.len() - 1]), (10.0, 10.0));
    let sq = [0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0];
    let sm_closed = smooth_polyline_chaikin(&sq, 1, true, 0.25).unwrap();
    assert_eq!(sm_closed.len() / 2, 8);

    // 3) Cubic Bezier adaptive flattening + arc-length sampling (quarter circle approx)
    let k = 0.552_284_8_f32;
    let flat = flatten_cubic_bezier_adaptive([10.0, 0.0], [10.0, 10.0 * k], [10.0 * k, 10.0], [0.0, 10.0], 0.05).unwrap();
    let expected_arc = 5.0 * PI;
    assert!((flat.total_length - expected_arc).abs() < 0.15);
    let mid = sample_polyline_at_arc_length(&flat.points_xy, &flat.arc_lengths, flat.total_length * 0.5).unwrap();
    assert!((mid[0] - 10.0 * (PI * 0.25).cos()).abs() < 0.15);
    assert!((mid[1] - 10.0 * (PI * 0.25).sin()).abs() < 0.15);
    assert_eq!(build_arc_length_table(&flat.points_xy).unwrap().len(), flat.arc_lengths.len());

    // 4) Variable-width calligraphy stroke expansion (Miter vs Bevel + hairpin miter fallback)
    let spine = [0.0, 0.0, 2.0, 20.0, 0.0, 6.0, 20.0, 20.0, 3.0];
    let miter = expand_variable_width_stroke(&spine, StrokeJoinStyle::Miter { miter_limit: 4.0 }).unwrap();
    let bevel = expand_variable_width_stroke(&spine, StrokeJoinStyle::Bevel).unwrap();
    assert!(miter.polygon_xy.iter().all(|v| v.is_finite()));
    assert!(bevel.polygon_xy.len() > miter.polygon_xy.len());
    // Center of first segment must be inside expanded stroke polygon!
    assert!(hit_test_polygon_2d(&miter.polygon_xy, 10.0, 0.0, WindingFillRule::NonZero));
    assert!(!hit_test_polygon_2d(&miter.polygon_xy, 10.0, -20.0, WindingFillRule::NonZero));

    // Hairpin acute bend triggers miter-limit fallback cleanly without huge spike
    let hairpin = [0.0, 0.0, 4.0, 20.0, 0.0, 4.0, 0.0, 0.5, 4.0];
    let clamped = expand_variable_width_stroke(&hairpin, StrokeJoinStyle::Miter { miter_limit: 2.0 }).unwrap();
    assert!(clamped.polygon_xy.iter().all(|v| v.abs() < 35.0));

    // 5) Non-Zero vs Even-Odd on classic 5-point self-intersecting pentagram
    let mut star = Vec::with_capacity(10);
    for idx in [0usize, 2, 4, 1, 3] {
        let ang = (idx as f32) * 2.0 * PI / 5.0 - PI * 0.5;
        star.push(ang.cos() * 10.0);
        star.push(ang.sin() * 10.0);
    }
    assert!(hit_test_polygon_2d(&star, 0.0, 0.0, WindingFillRule::NonZero));
    assert!(!hit_test_polygon_2d(&star, 0.0, 0.0, WindingFillRule::EvenOdd));
    let mut hits = [0u8; 3];
    let cnt = hit_test_polygon_batch_2d(&star, &[0.0, 0.0, 0.0, -8.0, 50.0, 50.0], WindingFillRule::EvenOdd, &mut hits).unwrap();
    assert_eq!(cnt, 1);
    assert_eq!(hits, [0, 1, 0]);
}

#[test]
fn webtoon_smart_slicer_avoids_speech_balloon_and_dedups_tiles_fnv64() {
    // Standard 64-bit FNV-1a vectors
    assert_eq!(fnv1a_hash_64(b""), 0xcbf2_9ce4_8422_2325);
    assert_eq!(fnv1a_hash_64(b"foobar"), 0x8594_4171_f739_67e8);

    // Build 128 x 600 vertical strip:
    // - Panel 1 art at y=40..210
    // - Speech balloon spanning y=240..340 (directly across target_height=300!) with dark border + white interior + dark text strokes
    // - Clean white gutter at y=355..395
    // - Panel 2 art at y=410..560
    let (w, h) = (128u32, 600u32);
    let mut img = vec![255u8; (w * h * 4) as usize];
    let mut paint = |x: u32, y: u32, rgb: [u8; 3]| {
        let off = ((y * w + x) * 4) as usize;
        img[off] = rgb[0];
        img[off + 1] = rgb[1];
        img[off + 2] = rgb[2];
        img[off + 3] = 255;
    };
    for y in 40..210 {
        for x in 12..116 {
            paint(x, y, [((x * 3) % 200) as u8, 120, ((y * 2) % 200) as u8]);
        }
    }
    // Speech balloon outline + interior text spanning y=240..340
    for y in 240..=340 {
        for x in 20..=108 {
            let on_border = y <= 242 || y >= 338 || x <= 22 || x >= 106;
            let on_text = (y % 18 == 8 || y % 18 == 9) && (36..=92).contains(&x) && (x % 6 < 3);
            if on_border || on_text {
                paint(x, y, [18, 18, 22]);
            }
        }
    }
    for y in 410..560 {
        for x in 16..112 {
            paint(x, y, [70, 90, 180]);
        }
    }

    let cfg = WebtoonSliceConfig {
        target_height: 300,
        min_height: 180,
        max_height: 420,
        search_window: 100,
        ink_l1_threshold: 28,
        continuity_weight: 4.0,
    };
    let spans = plan_webtoon_smart_slices(&img, w, h, &cfg).unwrap();
    assert_eq!(spans.len(), 2);
    assert_eq!(spans[0].start_y, 0);
    assert_eq!(spans[1].end_y, h);
    // Must NEVER slice inside speech balloon y=240..=340! Must pick clean gutter!
    assert!(spans[0].end_y < 240 || spans[0].end_y > 340, "cut landed inside balloon at y={}", spans[0].end_y);
    assert!(spans[0].is_clean_gutter);

    // 64-bit tile dedup & empty/solid/content classifier on 64x64 with 32x32 tiles (2x2 grid)
    let mut tile_img = vec![0u8; 64 * 64 * 4]; // top-left (0,0) = transparent
    for y in 0..32 {
        for x in 32..64 {
            let off = (y * 64 + x) * 4;
            tile_img[off..off + 4].copy_from_slice(&[250, 248, 243, 255]); // (1,0) solid
        }
    }
    for y in 32..64 {
        for x in 0..32 {
            let off = (y * 64 + x) * 4;
            tile_img[off..off + 4].copy_from_slice(&[250, 248, 243, 255]); // (0,1) duplicate solid
        }
    }
    for y in 32..64 {
        for x in 32..64 {
            let off = (y * 64 + x) * 4;
            tile_img[off..off + 4].copy_from_slice(&[(x * 4) as u8, (y * 3) as u8, 90, 255]); // (1,1) content
        }
    }
    let rep = classify_and_dedup_tiles(&tile_img, 64, 64, 32).unwrap();
    assert_eq!(rep.total_tiles, 4);
    assert_eq!(rep.unique_tiles, 3);
    assert_eq!(rep.duplicate_tiles, 1);
    assert_eq!(rep.empty_transparent_tiles, 1);
    assert_eq!(rep.solid_color_tiles, 2);
    assert_eq!(rep.content_tiles, 1);
    assert_eq!(rep.entries[0].class, TileClass::EmptyTransparent);
    assert_eq!(rep.entries[1].class, TileClass::SolidColor);
    assert_eq!(rep.entries[2].canonical_tile_index, 1);
    assert_eq!(rep.entries[3].class, TileClass::Content);
}

#[test]
fn color_srgb_oklch_display_p3_cmyk_tac_and_median_cut_palette() {
    let srgb = [
        255, 255, 255, 255, // white
        0, 0, 0, 255, // rich black (tests TAC!)
        220, 48, 64, 255, // crimson
        32, 168, 120, 200, // emerald semi-transparent
    ];

    // 1) sRGB <-> Display-P3 roundtrip (<= 1 u8 diff)
    let mut p3 = vec![0.0_f32; srgb.len()];
    let mut back = vec![0u8; srgb.len()];
    assert_eq!(srgb_rgba_to_display_p3_batch(&srgb, &mut p3).unwrap(), 4);
    assert_eq!(display_p3_to_srgb_rgba_batch(&p3, &mut back).unwrap(), 4);
    for (a, b) in srgb.iter().zip(back.iter()) {
        assert!(a.abs_diff(*b) <= 1);
    }

    // Wide-gamut Display-P3 pure green [0, 1, 0] has strictly larger OKLCH chroma than sRGB [0, 255, 0]
    let mut lch_p3 = [0.0_f32; 4];
    let mut lch_srgb = [0.0_f32; 4];
    display_p3_to_oklch_batch(&[0.0, 1.0, 0.0, 1.0], &mut lch_p3).unwrap();
    srgb_rgba_to_oklch_f32_batch(&[0, 255, 0, 255], &mut lch_srgb).unwrap();
    assert!(lch_p3[1] > lch_srgb[1] + 0.04);
    let mut p3_rt = [0.0_f32; 4];
    oklch_to_display_p3_batch(&lch_p3, &mut p3_rt).unwrap();
    assert!((p3_rt[1] - 1.0).abs() < 1e-3);

    // sRGB <-> OKLCH roundtrip
    let mut oklch = vec![0.0_f32; srgb.len()];
    let mut back_ok = vec![0u8; srgb.len()];
    srgb_rgba_to_oklch_f32_batch(&srgb, &mut oklch).unwrap();
    oklch_f32_to_srgb_rgba_batch(&oklch, &mut back_ok).unwrap();
    for (a, b) in srgb.iter().zip(back_ok.iter()) {
        assert!(a.abs_diff(*b) <= 1);
    }

    // 2) CMYK UCR/GCR with TAC = 240% strictly caps C+M+Y+K <= 240% even on pure black with low GCR!
    let mut cmyk = vec![0u8; srgb.len()];
    let tac_cfg = CmykTacConfig { gcr_strength: 0.25, ucr_start: 0.0, max_k: 0.85, tac_limit_pct: 240.0 };
    let stats = rgba_to_cmyk_tac_batch(&srgb, &mut cmyk, &tac_cfg).unwrap();
    assert_eq!(stats.pixel_count, 4);
    assert!(stats.clamped_pixels >= 1);
    assert!(stats.max_tac_pct <= 240.01);
    for &px in cmyk.as_chunks::<4>().0 {
        let sum_pct = (f32::from(px[0]) + f32::from(px[1]) + f32::from(px[2]) + f32::from(px[3])) / 255.0 * 100.0;
        assert!(sum_pct <= 240.01, "TAC exceeded: {sum_pct}%");
    }
    let mut proof = vec![0u8; srgb.len()];
    cmyk_to_rgba_proof_batch(&cmyk, &mut proof).unwrap();
    assert_eq!(&proof[0..4], &[255, 255, 255, 255]);

    // 3) Deterministic Median-Cut palette extractor recovers exact dominant colors & skips transparent
    let mut palette_img = Vec::new();
    for _ in 0..300 {
        palette_img.extend_from_slice(&[20, 68, 53, 255]);
    }
    for _ in 0..150 {
        palette_img.extend_from_slice(&[235, 195, 72, 255]);
    }
    for _ in 0..75 {
        palette_img.extend_from_slice(&[198, 58, 72, 255]);
    }
    for _ in 0..500 {
        palette_img.extend_from_slice(&[0, 0, 255, 0]); // transparent ignored
    }
    let swatches = extract_palette_median_cut(&palette_img, 16, 128).unwrap();
    assert_eq!(swatches.len(), 3);
    assert_eq!((swatches[0].r, swatches[0].g, swatches[0].b, swatches[0].count), (20, 68, 53, 300));
    assert_eq!((swatches[1].r, swatches[1].g, swatches[1].b, swatches[1].count), (235, 195, 72, 150));
    assert_eq!((swatches[2].r, swatches[2].g, swatches[2].b, swatches[2].count), (198, 58, 72, 75));
}

#[test]
fn wave3_c_abi_exports_and_safety_boundaries() {
    assert_eq!(wasm_wave3_capabilities(), WASM_WAVE3_CAPABILITIES);
    assert_eq!(wasm_wave3_capabilities(), 0x0F);

    unsafe {
        // Audio FFI
        let mut l = sine_wave(128, 440.0, 48_000.0, 0.5);
        let mut r = l.clone();
        let eq_p = [48_000.0_f32, 1000.0, 0.707, 0.0];
        let mut eq_s = [0.0_f32; 4];
        assert_eq!(wasm_audio_biquad_eq_stereo(l.as_mut_ptr(), r.as_mut_ptr(), 128, 0, eq_p.as_ptr(), eq_s.as_mut_ptr()), 128);
        assert_eq!(wasm_audio_biquad_eq_stereo(l.as_mut_ptr(), l.as_mut_ptr(), 128, 0, eq_p.as_ptr(), eq_s.as_mut_ptr()), -1);

        let tr_p = [1.0_f32, 0.0, 0.0];
        let mut ol = [0.0_f32; 128];
        let mut or = [0.0_f32; 128];
        let mut met = [0.0_f32; 6];
        assert_eq!(wasm_audio_mix_master_stereo(l.as_ptr(), 1, 128, tr_p.as_ptr(), std::ptr::null(), ol.as_mut_ptr(), or.as_mut_ptr(), met.as_mut_ptr()), 128);
        assert_eq!(met[5] as u32, 1);

        let mut rl = [0.0_f32; 128];
        let mut rr = [0.0_f32; 128];
        assert_eq!(wasm_audio_schroeder_reverb_stereo(l.as_ptr(), r.as_ptr(), rl.as_mut_ptr(), rr.as_mut_ptr(), 128, std::ptr::null()), 128);

        let mut rs = [0.0_f32; 64];
        assert_eq!(wasm_audio_resample_mono(l.as_ptr(), 128, rs.as_mut_ptr(), 64, 2.0, 1), 64);

        // Vector FFI (2-pass capacity queries)
        let poly = [0.0_f32, 0.0, 5.0, 0.0, 10.0, 0.0, 10.0, 10.0];
        let need_rdp = wasm_vector_simplify_rdp(poly.as_ptr(), 4, 0.5, std::ptr::null_mut(), 0);
        assert_eq!(need_rdp, 3);
        let mut out_rdp = [0.0_f32; 6];
        assert_eq!(wasm_vector_simplify_rdp(poly.as_ptr(), 4, 0.5, out_rdp.as_mut_ptr(), 3), 3);
        assert_eq!(wasm_vector_simplify_rdp(poly.as_ptr(), 4, 0.5, out_rdp.as_mut_ptr(), 2), -4);

        let need_ch = wasm_vector_smooth_chaikin(out_rdp.as_ptr(), 3, 1, 0, 0.25, std::ptr::null_mut(), 0);
        assert_eq!(need_ch, 6);
        let mut out_ch = [0.0_f32; 12];
        assert_eq!(wasm_vector_smooth_chaikin(out_rdp.as_ptr(), 3, 1, 0, 0.25, out_ch.as_mut_ptr(), 6), 6);

        let bez = [0.0_f32, 0.0, 5.0, 10.0, 15.0, 10.0, 20.0, 0.0];
        let need_bz = wasm_vector_flatten_bezier_arc_len(bez.as_ptr(), 0.2, std::ptr::null_mut(), std::ptr::null_mut(), 0);
        assert!(need_bz >= 4);
        let mut bz_xy = vec![0.0_f32; (need_bz as usize) * 2];
        let mut bz_arc = vec![0.0_f32; need_bz as usize];
        assert_eq!(wasm_vector_flatten_bezier_arc_len(bez.as_ptr(), 0.2, bz_xy.as_mut_ptr(), bz_arc.as_mut_ptr(), need_bz as u32), need_bz);

        let spine = [0.0_f32, 0.0, 3.0, 10.0, 0.0, 3.0];
        let need_st = wasm_vector_expand_stroke_outline(spine.as_ptr(), 2, 1, 4.0, std::ptr::null_mut(), 0);
        assert_eq!(need_st, 4);
        let mut st_poly = vec![0.0_f32; 8];
        assert_eq!(wasm_vector_expand_stroke_outline(spine.as_ptr(), 2, 1, 4.0, st_poly.as_mut_ptr(), 4), 4);

        let queries = [5.0_f32, 0.0, 5.0, 20.0];
        let mut hits = [0u8; 2];
        assert_eq!(wasm_vector_hit_test_batch(st_poly.as_ptr(), 4, queries.as_ptr(), 2, 0, hits.as_mut_ptr()), 1);
        assert_eq!(hits, [1, 0]);

        // Webtoon Slicer & Dedup FFI
        let img = vec![255u8; 32 * 64 * 4];
        let sp_p = [32.0_f32, 16.0, 48.0, 8.0, 28.0, 4.0];
        let n_spans = wasm_webtoon_plan_smart_slices(img.as_ptr(), 32, 64, sp_p.as_ptr(), std::ptr::null_mut(), 0);
        assert_eq!(n_spans, 2);
        let mut sp_out = vec![0.0_f32; 10];
        assert_eq!(wasm_webtoon_plan_smart_slices(img.as_ptr(), 32, 64, sp_p.as_ptr(), sp_out.as_mut_ptr(), 2), 2);

        let mut summary = [0u32; 8];
        let mut entries = [0u64; 4];
        assert_eq!(wasm_webtoon_dedup_tiles_fnv64(img.as_ptr(), 32, 64, 32, summary.as_mut_ptr(), entries.as_mut_ptr(), 2), 2);
        assert_eq!(summary[3], 1); // 1 unique solid tile
        assert_eq!(summary[4], 1); // 1 duplicate tile

        // Color FFI
        let px = [200u8, 100, 50, 255, 0, 0, 0, 255];
        let mut p3 = [0.0_f32; 8];
        let mut back = [0u8; 8];
        assert_eq!(wasm_color_srgb_to_p3_batch(px.as_ptr(), p3.as_mut_ptr(), 2), 2);
        assert_eq!(wasm_color_p3_to_srgb_batch(p3.as_ptr(), back.as_mut_ptr(), 2), 2);
        let mut cmyk = [0u8; 8];
        let mut cstats = [0.0_f32; 2];
        assert_eq!(wasm_color_rgba_to_cmyk_tac_batch(px.as_ptr(), cmyk.as_mut_ptr(), 2, std::ptr::null(), cstats.as_mut_ptr()), 2);
        let mut swatches = [0u32; 8];
        assert_eq!(wasm_color_extract_palette_median_cut(px.as_ptr(), 2, 4, 128, swatches.as_mut_ptr()), 2);
    }
}
