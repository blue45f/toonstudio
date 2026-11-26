//! Wave-3 순수 안전 Rust 실시간 오디오 DSP 믹서 커널 (`audio_dsp_mixer_kernel`).
//!
//! - RBJ Biquad 파라메트릭 EQ (`Lowpass` / `Highpass` / `Peaking`, Direct Form II Transposed)
//! - ITU-R BS.1770-4 K-가중 LUFS 라우드니스 + 4배 오버샘플링 큐빅 에르미트 True-Peak 측정기
//! - 소프트-니(Soft-Knee) 스테레오 링크 다이내믹스 컴프레서 + 브릭월 리미터
//! - Schroeder 알고리즘 리버브 (4 병렬 로우패스 댐핑 콤 필터 + 2 직렬 올패스 디퓨저)
//! - 선형 / 4점 큐빅 에르미트(Catmull-Rom) 피치-타임 리샘플러
//! - 등전력(Constant-Power) 팬·게인 다중 트랙 스테레오 믹서 (SIMD 자동 벡터화 친화)

use std::f32::consts::FRAC_PI_4;
use std::f64::consts::{PI, SQRT_2};

use crate::DrawingCoreError;

/// 지원 최저·최고 샘플레이트(Hz) 및 무음 판정 LUFS 하한(dBFS).
pub const MIN_AUDIO_SAMPLE_RATE: f32 = 8_000.0;
pub const MAX_AUDIO_SAMPLE_RATE: f32 = 384_000.0;
pub const SILENCE_LUFS_FLOOR: f32 = -120.0;

#[inline]
fn check_range(v: f32, lo: f32, hi: f32, name: &'static str) -> Result<(), DrawingCoreError> {
    if !v.is_finite() || v < lo || v > hi {
        return Err(DrawingCoreError::InvalidParameter { name });
    }
    Ok(())
}

#[inline]
fn clean_sample(x: f32) -> f32 {
    if x.is_finite() { x } else { 0.0 }
}

#[inline]
fn db_to_linear(db: f32) -> f32 {
    (db * (std::f32::consts::LN_10 / 20.0)).exp()
}

#[inline]
fn linear_to_db(lin: f32) -> f32 {
    if lin <= 1e-6 {
        SILENCE_LUFS_FLOOR
    } else {
        (20.0 / std::f32::consts::LN_10) * lin.ln()
    }
}

/// Biquad 파라메트릭 EQ 필터 종류.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum BiquadFilterKind {
    Lowpass = 0,
    Highpass = 1,
    Peaking = 2,
}

impl BiquadFilterKind {
    #[must_use]
    pub const fn from_u32(value: u32) -> Option<Self> {
        match value {
            0 => Some(Self::Lowpass),
            1 => Some(Self::Highpass),
            2 => Some(Self::Peaking),
            _ => None,
        }
    }
}

/// 정규화된 Direct Form II Transposed Biquad 계수 (`a0 == 1.0`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BiquadCoeffs {
    pub b0: f32,
    pub b1: f32,
    pub b2: f32,
    pub a1: f32,
    pub a2: f32,
}

impl BiquadCoeffs {
    /// RBJ Audio EQ Cookbook 공식으로 안전한 Biquad 계수를 설계한다.
    pub fn design(
        kind: BiquadFilterKind,
        sample_rate: f32,
        freq_hz: f32,
        q: f32,
        gain_db: f32,
    ) -> Result<Self, DrawingCoreError> {
        check_range(sample_rate, MIN_AUDIO_SAMPLE_RATE, MAX_AUDIO_SAMPLE_RATE, "sample_rate")?;
        if !freq_hz.is_finite() || freq_hz <= 0.0 || freq_hz >= sample_rate * 0.495 {
            return Err(DrawingCoreError::InvalidParameter { name: "freq_hz" });
        }
        check_range(q, 0.05, 40.0, "q")?;
        check_range(gain_db, -36.0, 36.0, "gain_db")?;

        let w0 = 2.0 * PI * f64::from(freq_hz) / f64::from(sample_rate);
        let (sin_w0, cos_w0) = w0.sin_cos();
        let alpha = sin_w0 / (2.0 * f64::from(q));

        let (b0, b1, b2, a0, a1, a2) = match kind {
            BiquadFilterKind::Lowpass => {
                let om = 1.0 - cos_w0;
                (om * 0.5, om, om * 0.5, 1.0 + alpha, -2.0 * cos_w0, 1.0 - alpha)
            }
            BiquadFilterKind::Highpass => {
                let op = 1.0 + cos_w0;
                (op * 0.5, -op, op * 0.5, 1.0 + alpha, -2.0 * cos_w0, 1.0 - alpha)
            }
            BiquadFilterKind::Peaking => {
                let amp = 10.0_f64.powf(f64::from(gain_db) / 40.0);
                (
                    1.0 + alpha * amp,
                    -2.0 * cos_w0,
                    1.0 - alpha * amp,
                    1.0 + alpha / amp,
                    -2.0 * cos_w0,
                    1.0 - alpha / amp,
                )
            }
        };

        let inv_a0 = 1.0 / a0;
        Ok(Self {
            b0: (b0 * inv_a0) as f32,
            b1: (b1 * inv_a0) as f32,
            b2: (b2 * inv_a0) as f32,
            a1: (a1 * inv_a0) as f32,
            a2: (a2 * inv_a0) as f32,
        })
    }

    #[inline]
    fn k_weight_stage1(sample_rate: f64) -> Self {
        let k = (PI * 1_681.974_450_955_533_f64 / sample_rate).tan();
        let q = 0.707_175_236_955_419_6_f64;
        let vh = 10.0_f64.powf(3.999_843_853_973_347_f64 / 20.0);
        let vb = vh.powf(0.499_666_774_154_541_6);
        let k2 = k * k;
        let inv_a0 = 1.0 / (1.0 + k / q + k2);
        Self {
            b0: ((vh + vb * k / q + k2) * inv_a0) as f32,
            b1: (2.0 * (k2 - vh) * inv_a0) as f32,
            b2: ((vh - vb * k / q + k2) * inv_a0) as f32,
            a1: (2.0 * (k2 - 1.0) * inv_a0) as f32,
            a2: ((1.0 - k / q + k2) * inv_a0) as f32,
        }
    }

    #[inline]
    fn k_weight_stage2(sample_rate: f64) -> Self {
        let k = (PI * 38.135_470_876_024_44_f64 / sample_rate).tan();
        let q = 0.500_327_037_323_877_3_f64;
        let k2 = k * k;
        let inv_a0 = 1.0 / (1.0 + k / q + k2);
        Self {
            b0: inv_a0 as f32,
            b1: (-2.0 * inv_a0) as f32,
            b2: inv_a0 as f32,
            a1: (2.0 * (k2 - 1.0) * inv_a0) as f32,
            a2: ((1.0 - k / q + k2) * inv_a0) as f32,
        }
    }
}

/// 단일 채널 Biquad 지연 상태.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct BiquadState {
    pub z1: f32,
    pub z2: f32,
}

impl BiquadState {
    #[inline]
    pub fn process_sample(&mut self, x: f32, c: &BiquadCoeffs) -> f32 {
        let s = clean_sample(x);
        let y = c.b0 * s + self.z1;
        self.z1 = c.b1 * s - c.a1 * y + self.z2;
        self.z2 = c.b2 * s - c.a2 * y;
        y
    }
}

/// 단일 채널 버퍼에 Biquad EQ를 제자리 적용한다.
pub fn process_biquad_in_place(samples: &mut [f32], coeffs: &BiquadCoeffs, state: &mut BiquadState) {
    let (mut z1, mut z2) = (state.z1, state.z2);
    let (b0, b1, b2, a1, a2) = (coeffs.b0, coeffs.b1, coeffs.b2, coeffs.a1, coeffs.a2);
    for sample in samples.iter_mut() {
        let s = clean_sample(*sample);
        let y = b0 * s + z1;
        z1 = b1 * s - a1 * y + z2;
        z2 = b2 * s - a2 * y;
        *sample = y;
    }
    state.z1 = z1;
    state.z2 = z2;
}

/// 스테레오 버퍼에 Biquad EQ를 제자리 적용한다.
pub fn process_biquad_stereo_in_place(
    left: &mut [f32],
    right: &mut [f32],
    coeffs: &BiquadCoeffs,
    state_l: &mut BiquadState,
    state_r: &mut BiquadState,
) -> Result<usize, DrawingCoreError> {
    if left.len() != right.len() {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: left.len(),
            actual: right.len(),
        });
    }
    process_biquad_in_place(left, coeffs, state_l);
    process_biquad_in_place(right, coeffs, state_r);
    Ok(left.len())
}

/// True-Peak 및 K-가중 LUFS 측정 결과.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LoudnessMetrics {
    pub integrated_lufs: f32,
    pub true_peak_linear: f32,
    pub true_peak_dbfs: f32,
    pub sample_peak_linear: f32,
}

#[inline]
fn cubic_hermite(xm1: f32, x0: f32, x1: f32, x2: f32, t: f32) -> f32 {
    let c1 = 0.5 * (x1 - xm1);
    let c2 = xm1 - 2.5 * x0 + 2.0 * x1 - 0.5 * x2;
    let c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);
    ((c3 * t + c2) * t + c1) * t + x0
}

#[inline]
fn channel_true_peak_4x(samples: &[f32]) -> (f32, f32) {
    let n = samples.len();
    let (mut sp, mut tp) = (0.0_f32, 0.0_f32);
    for i in 0..n {
        let x0 = clean_sample(samples[i]);
        let a0 = x0.abs();
        sp = sp.max(a0);
        tp = tp.max(a0);
        if i + 1 < n {
            let xm1 = if i > 0 { clean_sample(samples[i - 1]) } else { x0 };
            let x1 = clean_sample(samples[i + 1]);
            let x2 = if i + 2 < n { clean_sample(samples[i + 2]) } else { x1 };
            // Catmull-Rom 르베그 상수 상계(1.25): 상계가 현재 true_peak 이하이면 보간 피크 갱신 불가(수학적 동등)
            let local_max = xm1.abs().max(a0).max(x1.abs()).max(x2.abs());
            if local_max * 1.25 > tp {
                for t in [0.25_f32, 0.5_f32, 0.75_f32] {
                    tp = tp.max(cubic_hermite(xm1, x0, x1, x2, t).abs());
                }
            }
        }
    }
    (sp, tp)
}

/// 스테레오 버퍼의 4× 오버샘플링 True-Peak와 ITU-R BS.1770-4 K-가중 LUFS를 계산한다.
pub fn measure_loudness_true_peak(
    left: &[f32],
    right: &[f32],
    sample_rate: f32,
) -> Result<LoudnessMetrics, DrawingCoreError> {
    check_range(sample_rate, MIN_AUDIO_SAMPLE_RATE, MAX_AUDIO_SAMPLE_RATE, "sample_rate")?;
    if left.len() != right.len() {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: left.len(),
            actual: right.len(),
        });
    }
    let n = left.len();
    if n == 0 {
        return Ok(LoudnessMetrics {
            integrated_lufs: SILENCE_LUFS_FLOOR,
            true_peak_linear: 0.0,
            true_peak_dbfs: SILENCE_LUFS_FLOOR,
            sample_peak_linear: 0.0,
        });
    }

    let sr = f64::from(sample_rate);
    let k1 = BiquadCoeffs::k_weight_stage1(sr);
    let k2 = BiquadCoeffs::k_weight_stage2(sr);
    let (mut l1, mut l2) = (BiquadState::default(), BiquadState::default());
    let (mut r1, mut r2) = (BiquadState::default(), BiquadState::default());

    let (mut energy_l, mut energy_r) = (0.0_f64, 0.0_f64);
    for (&sl, &sr_s) in left.iter().zip(right.iter()) {
        let yl = f64::from(l2.process_sample(l1.process_sample(sl, &k1), &k2));
        let yr = f64::from(r2.process_sample(r1.process_sample(sr_s, &k1), &k2));
        energy_l += yl * yl;
        energy_r += yr * yr;
    }

    let mean_sq = (energy_l + energy_r) / (n as f64);
    let integrated_lufs = if mean_sq > 1e-12 {
        (-0.691 + 10.0 * mean_sq.log10()).max(f64::from(SILENCE_LUFS_FLOOR)) as f32
    } else {
        SILENCE_LUFS_FLOOR
    };

    let (sp_l, tp_l) = channel_true_peak_4x(left);
    let (sp_r, tp_r) = channel_true_peak_4x(right);
    let sample_peak_linear = sp_l.max(sp_r);
    let true_peak_linear = tp_l.max(tp_r);
    let true_peak_dbfs = if true_peak_linear > 1e-6 {
        (20.0 * f64::from(true_peak_linear).log10()).max(f64::from(SILENCE_LUFS_FLOOR)) as f32
    } else {
        SILENCE_LUFS_FLOOR
    };

    Ok(LoudnessMetrics {
        integrated_lufs,
        true_peak_linear,
        true_peak_dbfs,
        sample_peak_linear,
    })
}

/// 소프트-니 컴프레서 + 브릭월 리미터 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DynamicsConfig {
    pub sample_rate: f32,
    pub threshold_db: f32,
    pub ratio: f32,
    pub knee_db: f32,
    pub attack_ms: f32,
    pub release_ms: f32,
    pub makeup_db: f32,
    pub limiter_ceiling_db: f32,
}

impl Default for DynamicsConfig {
    fn default() -> Self {
        Self {
            sample_rate: 48_000.0,
            threshold_db: -18.0,
            ratio: 4.0,
            knee_db: 6.0,
            attack_ms: 5.0,
            release_ms: 80.0,
            makeup_db: 0.0,
            limiter_ceiling_db: -1.0,
        }
    }
}

/// 스테레오 다이내믹스 엔벨로프 상태 및 처리 통계.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct DynamicsState {
    pub env_linear: f32,
    pub limiter_gain: f32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DynamicsStats {
    pub frames: usize,
    pub max_gain_reduction_db: f32,
    pub peak_after_linear: f32,
}

/// 스테레오 링크 소프트-니 컴프레서 + 브릭월 리미터를 제자리 적용한다.
pub fn process_dynamics_stereo(
    left: &mut [f32],
    right: &mut [f32],
    cfg: &DynamicsConfig,
    state: &mut DynamicsState,
) -> Result<DynamicsStats, DrawingCoreError> {
    check_range(cfg.sample_rate, MIN_AUDIO_SAMPLE_RATE, MAX_AUDIO_SAMPLE_RATE, "sample_rate")?;
    if left.len() != right.len() {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: left.len(),
            actual: right.len(),
        });
    }
    check_range(cfg.threshold_db, -80.0, 0.0, "threshold_db")?;
    check_range(cfg.ratio, 1.0, 100.0, "ratio")?;
    check_range(cfg.knee_db, 0.0, 36.0, "knee_db")?;
    check_range(cfg.attack_ms, 0.05, 500.0, "attack_ms")?;
    check_range(cfg.release_ms, 1.0, 2000.0, "release_ms")?;
    check_range(cfg.makeup_db, -24.0, 36.0, "makeup_db")?;
    check_range(cfg.limiter_ceiling_db, -24.0, 0.0, "limiter_ceiling_db")?;

    let attack_c = (-1.0 / (cfg.attack_ms * 0.001 * cfg.sample_rate)).exp();
    let release_c = (-1.0 / (cfg.release_ms * 0.001 * cfg.sample_rate)).exp();
    let lim_release = (-1.0 / (0.040 * cfg.sample_rate)).exp();
    let makeup_lin = db_to_linear(cfg.makeup_db);
    let ceiling_lin = db_to_linear(cfg.limiter_ceiling_db);
    let slope = 1.0 / cfg.ratio - 1.0;
    let half_knee = cfg.knee_db * 0.5;
    let knee_start_lin = db_to_linear(cfg.threshold_db - half_knee);

    let mut env = if state.env_linear.is_finite() && state.env_linear >= 0.0 {
        state.env_linear
    } else {
        0.0
    };
    let mut lim_gain = if state.limiter_gain.is_finite() && state.limiter_gain > 0.0 {
        state.limiter_gain.min(1.0)
    } else {
        1.0
    };
    let (mut max_gr_db, mut peak_after) = (0.0_f32, 0.0_f32);

    for (l, r) in left.iter_mut().zip(right.iter_mut()) {
        let sl = clean_sample(*l);
        let sr_v = clean_sample(*r);
        let det = sl.abs().max(sr_v.abs());
        let c = if det > env { attack_c } else { release_c };
        env = c * env + (1.0 - c) * det;

        let comp_gain = if env <= knee_start_lin {
            makeup_lin
        } else {
            let over_db = linear_to_db(env) - cfg.threshold_db;
            let gr_db = if half_knee > 1e-4 && over_db < half_knee {
                let x = over_db + half_knee;
                slope * (x * x) / (2.0 * cfg.knee_db)
            } else {
                slope * over_db
            };
            max_gr_db = max_gr_db.max(-gr_db);
            db_to_linear(gr_db) * makeup_lin
        };
        let mut ol = sl * comp_gain;
        let mut or = sr_v * comp_gain;

        let post_peak = ol.abs().max(or.abs());
        let target_lim = if post_peak > ceiling_lin {
            ceiling_lin / post_peak
        } else {
            1.0
        };
        lim_gain = if target_lim < lim_gain {
            target_lim
        } else {
            lim_release * lim_gain + (1.0 - lim_release) * target_lim
        };
        ol = (ol * lim_gain).clamp(-ceiling_lin, ceiling_lin);
        or = (or * lim_gain).clamp(-ceiling_lin, ceiling_lin);
        peak_after = peak_after.max(ol.abs().max(or.abs()));
        *l = ol;
        *r = or;
    }

    state.env_linear = env;
    state.limiter_gain = lim_gain;
    Ok(DynamicsStats {
        frames: left.len(),
        max_gain_reduction_db: max_gr_db,
        peak_after_linear: peak_after,
    })
}

/// Schroeder 알고리즘 리버브 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SchroederReverbConfig {
    pub sample_rate: f32,
    pub room_size: f32,
    pub damping: f32,
    pub wet: f32,
    pub dry: f32,
}

impl Default for SchroederReverbConfig {
    fn default() -> Self {
        Self {
            sample_rate: 48_000.0,
            room_size: 0.65,
            damping: 0.35,
            wet: 0.30,
            dry: 0.85,
        }
    }
}

struct CombDelay {
    buf: Vec<f32>,
    idx: usize,
    store: f32,
}

impl CombDelay {
    fn new(len: usize) -> Self {
        Self { buf: vec![0.0; len.max(1)], idx: 0, store: 0.0 }
    }
    #[inline]
    fn tick(&mut self, input: f32, feedback: f32, damp1: f32, damp2: f32) -> f32 {
        let out = self.buf[self.idx];
        self.store = out * damp2 + self.store * damp1;
        self.buf[self.idx] = input + self.store * feedback;
        self.idx = (self.idx + 1) % self.buf.len();
        out
    }
}

struct AllpassDelay {
    buf: Vec<f32>,
    idx: usize,
}

impl AllpassDelay {
    fn new(len: usize) -> Self {
        Self { buf: vec![0.0; len.max(1)], idx: 0 }
    }
    #[inline]
    fn tick(&mut self, input: f32) -> f32 {
        let buf_out = self.buf[self.idx];
        self.buf[self.idx] = input + buf_out * 0.5;
        self.idx = (self.idx + 1) % self.buf.len();
        buf_out - input
    }
}

/// 4 병렬 댐핑 콤 필터 + 2 직렬 올패스 디퓨저 기반 Schroeder 스테레오 리버브를 렌더링한다.
pub fn process_schroeder_reverb_stereo(
    in_left: &[f32],
    in_right: &[f32],
    out_left: &mut [f32],
    out_right: &mut [f32],
    cfg: &SchroederReverbConfig,
) -> Result<usize, DrawingCoreError> {
    check_range(cfg.sample_rate, MIN_AUDIO_SAMPLE_RATE, MAX_AUDIO_SAMPLE_RATE, "sample_rate")?;
    let n = in_left.len();
    if in_right.len() != n || out_left.len() != n || out_right.len() != n {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: n,
            actual: in_right.len().min(out_left.len()).min(out_right.len()),
        });
    }
    check_range(cfg.room_size, 0.0, 1.0, "room_size")?;
    check_range(cfg.damping, 0.0, 1.0, "damping")?;
    check_range(cfg.wet, 0.0, 2.0, "wet")?;
    check_range(cfg.dry, 0.0, 2.0, "dry")?;

    let scale = f64::from(cfg.sample_rate) / 44_100.0;
    let sc = |base: usize, extra: usize| (((base + extra) as f64) * scale).round().max(1.0) as usize;
    let mut combs_l = [CombDelay::new(sc(1116, 0)), CombDelay::new(sc(1188, 0)), CombDelay::new(sc(1277, 0)), CombDelay::new(sc(1356, 0))];
    let mut combs_r = [CombDelay::new(sc(1116, 23)), CombDelay::new(sc(1188, 23)), CombDelay::new(sc(1277, 23)), CombDelay::new(sc(1356, 23))];
    let mut ap_l = [AllpassDelay::new(sc(225, 0)), AllpassDelay::new(sc(556, 0))];
    let mut ap_r = [AllpassDelay::new(sc(225, 23)), AllpassDelay::new(sc(556, 23))];

    let feedback = 0.70 + cfg.room_size * 0.28;
    let damp1 = cfg.damping * 0.65;
    let damp2 = 1.0 - damp1;

    for i in 0..n {
        let il = clean_sample(in_left[i]);
        let ir = clean_sample(in_right[i]);
        let feed = (il + ir) * 0.125;
        let mut acc_l = 0.0_f32;
        let mut acc_r = 0.0_f32;
        for c in &mut combs_l {
            acc_l += c.tick(feed, feedback, damp1, damp2);
        }
        for c in &mut combs_r {
            acc_r += c.tick(feed, feedback, damp1, damp2);
        }
        for a in &mut ap_l {
            acc_l = a.tick(acc_l);
        }
        for a in &mut ap_r {
            acc_r = a.tick(acc_r);
        }
        out_left[i] = il * cfg.dry + acc_l * cfg.wet;
        out_right[i] = ir * cfg.dry + acc_r * cfg.wet;
    }
    Ok(n)
}

/// 피치-타임 리샘플링 보간 모드.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum ResampleInterpolation {
    Linear = 0,
    CubicHermite = 1,
}

impl ResampleInterpolation {
    #[must_use]
    pub const fn from_u32(value: u32) -> Option<Self> {
        match value {
            0 => Some(Self::Linear),
            1 => Some(Self::CubicHermite),
            _ => None,
        }
    }
}

/// 단일 채널 오디오 버퍼를 지정된 `rate_ratio` (출력 1샘플당 입력 진행량)로 리샘플링한다.
pub fn resample_mono(
    input: &[f32],
    output: &mut [f32],
    rate_ratio: f32,
    mode: ResampleInterpolation,
) -> Result<usize, DrawingCoreError> {
    check_range(rate_ratio, 0.0625, 16.0, "rate_ratio")?;
    if output.is_empty() {
        return Ok(0);
    }
    if input.is_empty() {
        output.fill(0.0);
        return Ok(output.len());
    }
    let last = input.len() - 1;
    let step = f64::from(rate_ratio);
    for (i, dst) in output.iter_mut().enumerate() {
        let pos = (i as f64) * step;
        let idx = (pos.floor() as usize).min(last);
        let frac = (pos - (idx as f64)).clamp(0.0, 1.0) as f32;
        let x0 = input[idx];
        let x1 = input[(idx + 1).min(last)];
        *dst = match mode {
            ResampleInterpolation::Linear => x0 + (x1 - x0) * frac,
            ResampleInterpolation::CubicHermite => {
                cubic_hermite(input[idx.saturating_sub(1)], x0, x1, input[(idx + 2).min(last)], frac)
            }
        };
    }
    Ok(output.len())
}

/// 다중 트랙 믹서 파라미터 및 마스터 처리 보고서.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MixTrackParams {
    pub gain: f32,
    pub pan: f32,
    pub mute: bool,
}

impl Default for MixTrackParams {
    fn default() -> Self {
        Self { gain: 1.0, pan: 0.0, mute: false }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MixMasterReport {
    pub frames: usize,
    pub active_tracks: usize,
    pub loudness: LoudnessMetrics,
    pub dynamics: DynamicsStats,
}

/// 평면(planar) 다중 모노 트랙(`[track_count][frames]`)을 등전력 패닝으로 스테레오 버스에 믹싱한다.
pub fn mix_tracks_stereo(
    tracks_planar: &[f32],
    track_count: usize,
    frames: usize,
    params: &[MixTrackParams],
    out_left: &mut [f32],
    out_right: &mut [f32],
) -> Result<usize, DrawingCoreError> {
    let expected = track_count
        .checked_mul(frames)
        .ok_or(DrawingCoreError::InvalidParameter { name: "track_count" })?;
    if tracks_planar.len() != expected {
        return Err(DrawingCoreError::BufferLengthMismatch { expected, actual: tracks_planar.len() });
    }
    if params.len() != track_count {
        return Err(DrawingCoreError::BufferLengthMismatch { expected: track_count, actual: params.len() });
    }
    if out_left.len() != frames || out_right.len() != frames {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: frames,
            actual: out_left.len().min(out_right.len()),
        });
    }

    out_left.fill(0.0);
    out_right.fill(0.0);
    let mut active_tracks = 0usize;
    let norm = SQRT_2 as f32;

    for (t, p) in params.iter().enumerate() {
        check_range(p.gain, 0.0, 64.0, "gain")?;
        check_range(p.pan, -1.0, 1.0, "pan")?;
        if p.mute || p.gain == 0.0 {
            continue;
        }
        active_tracks += 1;
        let angle = (p.pan + 1.0) * FRAC_PI_4;
        let gl = p.gain * angle.cos() * norm;
        let gr = p.gain * angle.sin() * norm;
        let src = &tracks_planar[t * frames..(t + 1) * frames];
        for ((l, r), &s) in out_left.iter_mut().zip(out_right.iter_mut()).zip(src.iter()) {
            *l += s * gl;
            *r += s * gr;
        }
    }
    Ok(active_tracks)
}

/// 다중 트랙 스테레오 믹싱 + 소프트-니 컴프레서/브릭월 리미터 + K-가중 LUFS/True-Peak 측정 파이프라인.
pub fn mix_and_master_stereo(
    tracks_planar: &[f32],
    track_count: usize,
    frames: usize,
    params: &[MixTrackParams],
    dynamics_cfg: &DynamicsConfig,
    out_left: &mut [f32],
    out_right: &mut [f32],
) -> Result<MixMasterReport, DrawingCoreError> {
    let active_tracks = mix_tracks_stereo(tracks_planar, track_count, frames, params, out_left, out_right)?;
    let mut state = DynamicsState { env_linear: 0.0, limiter_gain: 1.0 };
    let dynamics = process_dynamics_stereo(out_left, out_right, dynamics_cfg, &mut state)?;
    let loudness = measure_loudness_true_peak(out_left, out_right, dynamics_cfg.sample_rate)?;
    Ok(MixMasterReport { frames, active_tracks, loudness, dynamics })
}
