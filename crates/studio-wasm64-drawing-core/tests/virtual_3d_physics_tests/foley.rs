use super::*;

#[test]
fn foley_lowpass_biquad_passes_low_freq_and_attenuates_high_freq() {
    let (sr, frames) = (48_000.0, 2048usize);
    let cfg = FoleyDspConfig {
        sample_rate: sr,
        mode: FoleyFilterMode::Lowpass,
        cutoff_hz: 800.0,
        pan: -1.0,
        ..Default::default()
    };
    let (low_in, hi_in) = (
        make_sine(sr, 150.0, 0.25, frames),
        make_sine(sr, 12_000.0, 0.25, frames),
    );
    let (mut ll, mut rl, mut lh, mut rh) = (
        vec![0.0; frames],
        vec![0.0; frames],
        vec![0.0; frames],
        vec![0.0; frames],
    );
    render_foley_biquad_block(
        &low_in,
        &mut ll,
        &mut rl,
        &cfg,
        &mut FoleyBiquadState::new(),
    )
    .expect("lp low");
    render_foley_biquad_block(&hi_in, &mut lh, &mut rh, &cfg, &mut FoleyBiquadState::new())
        .expect("lp hi");
    assert!(rms(&ll[1024..]) / rms(&low_in[1024..]) > 0.90);
    assert!(rms(&lh[1024..]) / rms(&hi_in[1024..]) < 0.02);
}

#[test]
fn foley_bandpass_biquad_peaks_at_center_and_rejects_dc_and_nyquist() {
    let (sr, frames) = (48_000.0, 2048usize);
    let cfg = FoleyDspConfig {
        sample_rate: sr,
        mode: FoleyFilterMode::Bandpass,
        cutoff_hz: 2_000.0,
        q_factor: 2.0,
        pan: -1.0,
        ..Default::default()
    };
    let (dc_in, mid_in, hi_in) = (
        vec![0.3_f32; frames],
        make_sine(sr, 2_000.0, 0.3, frames),
        make_sine(sr, 16_000.0, 0.3, frames),
    );
    let (mut ldc, mut rdc, mut lmid, mut rmid, mut lhi, mut rhi) = (
        vec![0.0; frames],
        vec![0.0; frames],
        vec![0.0; frames],
        vec![0.0; frames],
        vec![0.0; frames],
        vec![0.0; frames],
    );
    render_foley_biquad_block(
        &dc_in,
        &mut ldc,
        &mut rdc,
        &cfg,
        &mut FoleyBiquadState::new(),
    )
    .expect("bp dc");
    render_foley_biquad_block(
        &mid_in,
        &mut lmid,
        &mut rmid,
        &cfg,
        &mut FoleyBiquadState::new(),
    )
    .expect("bp mid");
    render_foley_biquad_block(
        &hi_in,
        &mut lhi,
        &mut rhi,
        &cfg,
        &mut FoleyBiquadState::new(),
    )
    .expect("bp hi");
    assert!((rms(&lmid[1024..]) / rms(&mid_in[1024..]) - 1.0).abs() < 0.05);
    assert!(rms(&ldc[1024..]) / rms(&dc_in[1024..]) < 0.01);
    assert!(rms(&lhi[1024..]) / rms(&hi_in[1024..]) < 0.12);
}

#[test]
fn foley_constant_power_panning_preserves_stereo_energy_across_pan_sweep() {
    let mono = make_sine(48_000.0, 440.0, 0.2, 512);
    let mut ref_power: Option<f32> = None;
    for pan in [-1.0_f32, -0.5, 0.0, 0.5, 1.0] {
        let cfg = FoleyDspConfig {
            cutoff_hz: 12_000.0,
            pan,
            ..Default::default()
        };
        let (mut l, mut r) = (vec![0.0; 512], vec![0.0; 512]);
        render_foley_biquad_block(&mono, &mut l, &mut r, &cfg, &mut FoleyBiquadState::new())
            .expect("pan ok");
        let (pl, pr): (f32, f32) = (
            l[256..].iter().map(|v| v * v).sum(),
            r[256..].iter().map(|v| v * v).sum(),
        );
        let total = pl + pr;
        if let Some(rp) = ref_power {
            assert!((total - rp).abs() / rp < 1e-5);
        } else {
            ref_power = Some(total);
        }
        if pan == -1.0 {
            assert!(pr < 1e-10);
        }
        if pan == 1.0 {
            assert!(pl < 1e-10);
        }
        if pan == 0.0 {
            assert!((pl - pr).abs() < 1e-5);
        }
    }
}

#[test]
fn foley_soft_knee_limiter_enforces_095_ceiling_without_hard_clipping() {
    let hot = make_sine(48_000.0, 1_000.0, 1.2, 512);
    let cfg = FoleyDspConfig {
        cutoff_hz: 12_000.0,
        pan: -0.35,
        gain_db: 24.0,
        limiter_ceiling: FOLEY_PEAK_CEILING,
        ..Default::default()
    };
    let (mut l, mut r) = (vec![0.0; 512], vec![0.0; 512]);
    let st = render_foley_biquad_block(&hot, &mut l, &mut r, &cfg, &mut FoleyBiquadState::new())
        .expect("lim ok");
    assert!(
        st.limited_frames > 0 && st.gain_reduction_db < -10.0 && st.peak_abs <= FOLEY_PEAK_CEILING
    );
    assert!(l.iter().chain(&r).all(|v| v.abs() <= FOLEY_PEAK_CEILING));

    // 단조 증가 램프에서 Soft-Knee 구간이 하드 클리핑 평탄화 없이 0.95 미만으로 매끄럽게 증가
    let ramp: Vec<f32> = (0..128).map(|i| 0.72 + (i as f32 / 127.0) * 1.2).collect();
    let (mut rl, mut rr) = (vec![0.0; 128], vec![0.0; 128]);
    render_foley_biquad_block(
        &ramp,
        &mut rl,
        &mut rr,
        &FoleyDspConfig {
            cutoff_hz: 20_000.0,
            pan: -1.0,
            ..Default::default()
        },
        &mut FoleyBiquadState::new(),
    )
    .expect("ramp ok");
    assert!(rl.iter().all(|&v| v.abs() <= FOLEY_PEAK_CEILING));
    assert!(rl[127] > rl[80] && rl[80] > rl[40] && rl[127] < FOLEY_PEAK_CEILING);
}

#[test]
fn foley_block_split_continuity_128x2_matches_256x1_within_1e5() {
    let frames = AUDIOWORKLET_BLOCK_FRAMES * 2;
    let mono: Vec<f32> = (0..frames)
        .map(|i| {
            let t = i as f32 / 48_000.0;
            0.55 * (2.0 * PI * 680.0 * t).sin() + 0.45 * (2.0 * PI * 3_100.0 * t).cos()
        })
        .collect();
    for (mode, lufs_on) in [
        (FoleyFilterMode::Lowpass, false),
        (FoleyFilterMode::Bandpass, false),
        (FoleyFilterMode::Bandpass, true),
    ] {
        let cfg = FoleyDspConfig {
            mode,
            cutoff_hz: 1_500.0,
            q_factor: 1.4,
            pan: 0.25,
            gain_db: 6.0,
            enable_lufs_leveling: lufs_on,
            ..Default::default()
        };
        let (mut lf, mut rf, mut st_f) = (
            vec![0.0; frames],
            vec![0.0; frames],
            FoleyBiquadState::new(),
        );
        render_foley_biquad_block(&mono, &mut lf, &mut rf, &cfg, &mut st_f).expect("256 ok");
        let (mut ls, mut rs, mut st_s) = (
            vec![0.0; frames],
            vec![0.0; frames],
            FoleyBiquadState::new(),
        );
        render_foley_biquad_block(
            &mono[..128],
            &mut ls[..128],
            &mut rs[..128],
            &cfg,
            &mut st_s,
        )
        .expect("128a ok");
        render_foley_biquad_block(
            &mono[128..],
            &mut ls[128..],
            &mut rs[128..],
            &cfg,
            &mut st_s,
        )
        .expect("128b ok");
        let max_diff = lf
            .iter()
            .zip(&ls)
            .chain(rf.iter().zip(&rs))
            .map(|(a, b)| (a - b).abs())
            .fold(0.0_f32, f32::max);
        assert!(
            max_diff < 1e-5,
            "mode={mode:?} lufs={lufs_on} max_diff={max_diff}"
        );
        assert_eq!(st_f, st_s);
    }
}

#[test]
fn foley_lufs24_auto_leveling_converges_loud_signal_toward_minus_24_lufs() {
    let sr = 48_000.0;
    let cfg = FoleyDspConfig {
        sample_rate: sr,
        cutoff_hz: 8_000.0,
        target_lufs: FOLEY_TARGET_LUFS,
        enable_lufs_leveling: true,
        ..Default::default()
    };
    let (mut state, mut last_lufs, mut max_peak, mut phase) =
        (FoleyBiquadState::new(), 0.0_f32, 0.0_f32, 0usize);
    let (mut l, mut r) = (
        [0.0_f32; AUDIOWORKLET_BLOCK_FRAMES],
        [0.0_f32; AUDIOWORKLET_BLOCK_FRAMES],
    );
    for _ in 0..450 {
        let mut blk = [0.0_f32; AUDIOWORKLET_BLOCK_FRAMES];
        for s in &mut blk {
            *s = 0.5 * (2.0 * PI * 1_000.0 * phase as f32 / sr).sin();
            phase += 1;
        }
        let st =
            render_foley_biquad_block(&blk, &mut l, &mut r, &cfg, &mut state).expect("lufs ok");
        last_lufs = st.momentary_lufs;
        max_peak = max_peak.max(st.peak_abs);
    }
    assert!(
        (last_lufs - FOLEY_TARGET_LUFS).abs() < 1.5,
        "lufs={last_lufs}"
    );
    assert!(max_peak <= FOLEY_PEAK_CEILING);
}

#[test]
fn foley_sanitizes_nan_inf_samples_and_corrupted_state_without_poisoning() {
    let mut bad_in = make_sine(48_000.0, 1_000.0, 0.25, AUDIOWORKLET_BLOCK_FRAMES);
    bad_in[7] = f32::NAN;
    bad_in[42] = f32::INFINITY;
    bad_in[99] = f32::NEG_INFINITY;
    let mut state = FoleyBiquadState {
        z1: f32::NAN,
        z2: f32::INFINITY,
        limiter_env: -5.0,
        lufs_energy_ewma: f32::NAN,
        lufs_gain: 0.0,
    };
    let (mut l, mut r) = (
        [0.0; AUDIOWORKLET_BLOCK_FRAMES],
        [0.0; AUDIOWORKLET_BLOCK_FRAMES],
    );
    let st = render_foley_biquad_block(
        &bad_in,
        &mut l,
        &mut r,
        &FoleyDspConfig::default(),
        &mut state,
    )
    .expect("nan ok");
    assert_eq!(st.sanitized_samples, 3);
    assert!(l
        .iter()
        .chain(&r)
        .all(|v| v.is_finite() && v.abs() <= FOLEY_PEAK_CEILING));
    assert!(state.z1.is_finite() && state.z2.is_finite() && state.limiter_env.is_finite());
}

#[test]
fn foley_rejects_invalid_sample_rate_nyquist_q_pan_ceiling_and_buffer_len() {
    let (inp, mut l, mut r15, mut r16, mut st) = (
        [0.0_f32; 16],
        [0.0_f32; 16],
        [0.0_f32; 15],
        [0.0_f32; 16],
        FoleyBiquadState::new(),
    );
    assert_eq!(
        render_foley_biquad_block(&inp, &mut l, &mut r15, &FoleyDspConfig::default(), &mut st),
        Err(DrawingCoreError::BufferLengthMismatch {
            expected: 16,
            actual: 15
        })
    );
    for (cfg, name) in [
        (
            FoleyDspConfig {
                cutoff_hz: 24_000.0,
                ..Default::default()
            },
            "cutoff_hz",
        ),
        (
            FoleyDspConfig {
                limiter_ceiling: 0.99,
                ..Default::default()
            },
            "limiter_ceiling",
        ),
        (
            FoleyDspConfig {
                pan: 1.5,
                ..Default::default()
            },
            "pan",
        ),
        (
            FoleyDspConfig {
                sample_rate: 4_000.0,
                ..Default::default()
            },
            "sample_rate",
        ),
    ] {
        assert_eq!(
            render_foley_biquad_block(&inp, &mut l, &mut r16, &cfg, &mut st),
            Err(DrawingCoreError::InvalidParameter { name })
        );
    }
}

// ============================================================================
// 4. 확장 3D C-ABI FFI 비트 일치 및 가상 스튜디오 종단간 파이프라인 테스트 (3건)
// ============================================================================
