use super::*;

/// 2차 Biquad IIR 필터 모드.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum FoleyFilterMode {
    Lowpass = 0,
    Bandpass = 1,
}

impl FoleyFilterMode {
    #[inline]
    #[must_use]
    pub const fn from_u32(v: u32) -> Option<Self> {
        match v {
            0 => Some(Self::Lowpass),
            1 => Some(Self::Bandpass),
            _ => None,
        }
    }
}

/// Foley Biquad·패닝·피크 제한 설정. lufs 명칭의 필드는 비가중 에너지 근사이며 표준 LUFS 측정이 아니다.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FoleyDspConfig {
    pub sample_rate: f32,
    pub mode: FoleyFilterMode,
    pub cutoff_hz: f32,
    pub q_factor: f32,
    pub pan: f32,
    pub gain_db: f32,
    pub limiter_ceiling: f32,
    pub limiter_release_ms: f32,
    pub target_lufs: f32,
    pub enable_lufs_leveling: bool,
}

impl Default for FoleyDspConfig {
    fn default() -> Self {
        Self {
            sample_rate: 48_000.0,
            mode: FoleyFilterMode::Lowpass,
            cutoff_hz: 2_400.0,
            q_factor: core::f32::consts::FRAC_1_SQRT_2,
            pan: 0.0,
            gain_db: 0.0,
            limiter_ceiling: FOLEY_PEAK_CEILING,
            limiter_release_ms: 50.0,
            target_lufs: FOLEY_TARGET_LUFS,
            enable_lufs_leveling: false,
        }
    }
}

/// AudioWorklet 블록 경계를 가로질러 결정론적 연속성을 유지하는 Foley DSP 상태.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FoleyBiquadState {
    pub z1: f32,
    pub z2: f32,
    pub limiter_env: f32,
    pub lufs_energy_ewma: f32,
    pub lufs_gain: f32,
}

impl FoleyBiquadState {
    #[inline]
    #[must_use]
    pub const fn new() -> Self {
        Self {
            z1: 0.0,
            z2: 0.0,
            limiter_env: 0.0,
            lufs_energy_ewma: 0.0,
            lufs_gain: 1.0,
        }
    }
}

impl Default for FoleyBiquadState {
    fn default() -> Self {
        Self::new()
    }
}

/// Foley DSP 블록 렌더 실행 통계.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct FoleyBlockStats {
    pub rendered_frames: usize,
    pub peak_abs: f32,
    pub limited_frames: usize,
    pub sanitized_samples: usize,
    pub momentary_lufs: f32,
    pub gain_reduction_db: f32,
}

#[derive(Debug, Clone, Copy)]
struct BiquadCoeffs {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}

#[inline]
fn validate_and_design_biquad(c: &FoleyDspConfig) -> Result<BiquadCoeffs, DrawingCoreError> {
    if !c.sample_rate.is_finite() || !(8_000.0..=192_000.0).contains(&c.sample_rate) {
        return Err(DrawingCoreError::InvalidParameter {
            name: "sample_rate",
        });
    }
    if !c.cutoff_hz.is_finite() || c.cutoff_hz <= 0.0 || c.cutoff_hz >= 0.49 * c.sample_rate {
        return Err(DrawingCoreError::InvalidParameter { name: "cutoff_hz" });
    }
    if !c.q_factor.is_finite() || !(0.1..=20.0).contains(&c.q_factor) {
        return Err(DrawingCoreError::InvalidParameter { name: "q_factor" });
    }
    if !c.pan.is_finite() || !(-1.0..=1.0).contains(&c.pan) {
        return Err(DrawingCoreError::InvalidParameter { name: "pan" });
    }
    if !c.gain_db.is_finite() || !(-60.0..=36.0).contains(&c.gain_db) {
        return Err(DrawingCoreError::InvalidParameter { name: "gain_db" });
    }
    if !c.limiter_ceiling.is_finite() || !(0.05..=FOLEY_PEAK_CEILING).contains(&c.limiter_ceiling) {
        return Err(DrawingCoreError::InvalidParameter {
            name: "limiter_ceiling",
        });
    }
    if !c.limiter_release_ms.is_finite() || !(1.0..=1_000.0).contains(&c.limiter_release_ms) {
        return Err(DrawingCoreError::InvalidParameter {
            name: "limiter_release_ms",
        });
    }
    if !c.target_lufs.is_finite() || !(-60.0..=-6.0).contains(&c.target_lufs) {
        return Err(DrawingCoreError::InvalidParameter {
            name: "target_lufs",
        });
    }
    let (sin_w0, cos_w0) = (2.0 * PI * c.cutoff_hz / c.sample_rate).sin_cos();
    let alpha = sin_w0 / (2.0 * c.q_factor);
    let inv_a0 = 1.0 / (1.0 + alpha);
    let (b0, b1, b2) = match c.mode {
        FoleyFilterMode::Lowpass => (0.5 * (1.0 - cos_w0), 1.0 - cos_w0, 0.5 * (1.0 - cos_w0)),
        FoleyFilterMode::Bandpass => (alpha, 0.0, -alpha),
    };
    Ok(BiquadCoeffs {
        b0: b0 * inv_a0,
        b1: b1 * inv_a0,
        b2: b2 * inv_a0,
        a1: (-2.0 * cos_w0) * inv_a0,
        a2: (1.0 - alpha) * inv_a0,
    })
}

/// Foley CPU DSP 커널. AudioWorklet 연결은 없으며 LUFS 명칭의 값은 K-weighting·게이팅 없는 비가중 에너지 추정이다.
/// 프레임은 65,536개까지, 입력 절대값 32 초과·비유한 샘플은 무음으로 정제한다.
pub fn render_foley_biquad_block(
    mono_in: &[f32],
    out_left: &mut [f32],
    out_right: &mut [f32],
    config: &FoleyDspConfig,
    state: &mut FoleyBiquadState,
) -> Result<FoleyBlockStats, DrawingCoreError> {
    let frames = mono_in.len();
    if frames > MAX_AUDIO_FRAMES {
        return Err(DrawingCoreError::InvalidParameter {
            name: "audio_frame_budget",
        });
    }
    validate_len(frames, out_left.len())?;
    validate_len(frames, out_right.len())?;
    let coeffs = validate_and_design_biquad(config)?;

    if !state.z1.is_finite() || state.z1.abs() > 1.0e12 {
        state.z1 = 0.0;
    }
    if !state.z2.is_finite() || state.z2.abs() > 1.0e12 {
        state.z2 = 0.0;
    }
    if !state.limiter_env.is_finite() || !(0.0..=1.0e12).contains(&state.limiter_env) {
        state.limiter_env = 0.0;
    }
    if !state.lufs_energy_ewma.is_finite() || !(0.0..=1.0e24).contains(&state.lufs_energy_ewma) {
        state.lufs_energy_ewma = 0.0;
    }
    if !state.lufs_gain.is_finite() || !(0.0625..=4.0).contains(&state.lufs_gain) {
        state.lufs_gain = 1.0;
    }

    let mut stats = FoleyBlockStats {
        rendered_frames: frames,
        momentary_lufs: MIN_LUFS_DB,
        ..FoleyBlockStats::default()
    };
    if frames == 0 {
        return Ok(stats);
    }

    let (pan_r, pan_l) = (0.5 * (config.pan + 1.0) * FRAC_PI_2).sin_cos();
    let pre_gain = 10.0_f32.powf(config.gain_db / 20.0);
    let release_coeff = (-1.0 / (0.001 * config.limiter_release_ms * config.sample_rate)).exp();
    let alpha_lufs = 1.0 - (-1.0 / (0.4 * config.sample_rate)).exp();
    let alpha_lufs_gain = 1.0 - (-1.0 / (0.05 * config.sample_rate)).exp();
    let target_energy = 10.0_f32.powf((config.target_lufs + 0.691) / 10.0);
    let (ceiling, knee_start) = (config.limiter_ceiling, config.limiter_ceiling * 0.75);
    let knee_headroom = ceiling - knee_start;

    let (mut out_energy_sum, mut min_lim_gain) = (0.0_f32, 1.0_f32);
    for i in 0..frames {
        let raw = mono_in[i];
        let x = if raw.is_finite() && raw.abs() <= 32.0 {
            raw * pre_gain
        } else {
            stats.sanitized_samples += 1;
            0.0
        };

        // Direct Form II Transposed 2차 Biquad IIR
        let y = coeffs.b0 * x + state.z1;
        state.z1 = flush_denormal(coeffs.b1 * x - coeffs.a1 * y + state.z2);
        state.z2 = flush_denormal(coeffs.b2 * x - coeffs.a2 * y);

        let (mut l, mut r) = (y * pan_l, y * pan_r);
        let pre_energy = l * l + r * r;
        state.lufs_energy_ewma = flush_denormal(
            state.lufs_energy_ewma + alpha_lufs * (pre_energy - state.lufs_energy_ewma),
        );
        if config.enable_lufs_leveling {
            if state.lufs_energy_ewma > 1e-8 {
                let desired = (target_energy / state.lufs_energy_ewma)
                    .sqrt()
                    .clamp(0.0625, 4.0);
                state.lufs_gain += alpha_lufs_gain * (desired - state.lufs_gain);
            }
            l *= state.lufs_gain;
            r *= state.lufs_gain;
        }

        // 스테레오 연동 Soft-Knee 피크 리미터 (C1 tanh 곡선, 절대 상한 <= 0.95)
        let peak = l.abs().max(r.abs());
        state.limiter_env = if peak > state.limiter_env {
            peak
        } else {
            flush_denormal(peak + release_coeff * (state.limiter_env - peak))
        };
        let lim_gain = if state.limiter_env > knee_start {
            stats.limited_frames += 1;
            let shaped = knee_start
                + knee_headroom
                    * ((state.limiter_env - knee_start) / knee_headroom)
                        .min(20.0)
                        .tanh();
            (shaped / state.limiter_env).clamp(0.0, 1.0)
        } else {
            1.0
        };
        min_lim_gain = min_lim_gain.min(lim_gain);

        let (ol, or) = (
            (l * lim_gain).clamp(-ceiling, ceiling),
            (r * lim_gain).clamp(-ceiling, ceiling),
        );
        out_left[i] = ol;
        out_right[i] = or;
        stats.peak_abs = stats.peak_abs.max(ol.abs().max(or.abs()));
        out_energy_sum += ol * ol + or * or;
    }

    let mean_energy = out_energy_sum / frames as f32;
    stats.momentary_lufs = if mean_energy > 1e-12 {
        (-0.691 + 10.0 * mean_energy.log10()).max(MIN_LUFS_DB)
    } else {
        MIN_LUFS_DB
    };
    stats.gain_reduction_db = if min_lim_gain < 1.0 {
        20.0 * min_lim_gain.max(1e-6).log10()
    } else {
        0.0
    };
    Ok(stats)
}
