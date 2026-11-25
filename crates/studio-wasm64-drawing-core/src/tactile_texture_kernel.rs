//! 결정론적 64×64 타일링 종이 요철 LUT 및 5층 물리 브러시 질감 스탬퍼 커널.
//!
//! 1. 4종 무이음 64×64 종이 하이트맵 LUT (`PaperKind`: Hanji · Kent · ColdPress · LinenCanvas)
//!    + 비트마스크 O(1) 래핑 샘플링 + 중앙차분 법선(`nx, ny`)
//! 2. 5층 물리 브러시 스탬퍼 (`stamp_tactile_bristle_rgba`):
//!    타원 기울기 · 필압 종이 투과 · 3~16가닥 분기 갈필 · 모세관 습윤 에지 · 45° 임파스토 릴리프.

use std::f32::consts::{FRAC_1_SQRT_2, TAU};

use crate::{checked_pixel_count, checked_rgba_len, DrawingCoreError};

/// 64×64 타일링 종이 LUT 해상도·크기 및 갈필 필라멘트 범위 상수.
pub const PAPER_TILE_DIM: usize = 64;
const PAPER_TILE_MASK: usize = PAPER_TILE_DIM - 1;
pub const PAPER_TILE_LEN: usize = PAPER_TILE_DIM * PAPER_TILE_DIM;
pub const MIN_BRISTLE_COUNT: u8 = 3;
pub const MAX_BRISTLE_COUNT: u8 = 16;

/// 4종 물리 종이/캔버스 지지체 프리셋.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PaperKind {
    Hanji = 0,
    Kent = 1,
    ColdPress = 2,
    LinenCanvas = 3,
}

impl PaperKind {
    #[must_use]
    pub const fn from_u32(code: u32) -> Option<Self> {
        match code {
            0 => Some(Self::Hanji), 1 => Some(Self::Kent),
            2 => Some(Self::ColdPress), 3 => Some(Self::LinenCanvas),
            _ => None,
        }
    }
}

/// 64×64 종이 LUT 통계 요약.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PaperLutStats {
    pub min: f32,
    pub max: f32,
    pub mean: f32,
    pub std_dev: f32,
}

/// 결정론적 64×64 타일링 종이 하이트맵 LUT (`[0.0, 1.0]` 정규화).
#[derive(Debug, Clone, PartialEq)]
pub struct PaperTileLut {
    kind: PaperKind,
    seed: u32,
    heights: Vec<f32>,
}

impl PaperTileLut {
    #[must_use]
    pub const fn kind(&self) -> PaperKind { self.kind }
    #[must_use]
    pub const fn seed(&self) -> u32 { self.seed }
    #[must_use]
    pub fn heights(&self) -> &[f32] { &self.heights }

    /// 비트마스크를 사용해 음수·대형 정수 좌표에서도 O(1) 래핑 샘플링한다.
    #[inline]
    #[must_use]
    pub fn sample_wrapped(&self, x: i32, y: i32) -> f32 {
        let idx = (((y as usize) & PAPER_TILE_MASK) << 6) | ((x as usize) & PAPER_TILE_MASK);
        self.heights.get(idx).copied().unwrap_or(0.0)
    }

    /// 월드 좌표를 스케일링해 O(1) 이중선형 래핑 샘플링한다.
    #[inline(never)]
    #[must_use]
    pub fn sample_bilinear_wrapped(&self, world_x: f32, world_y: f32, scale: f32) -> f32 {
        let inv_s = 1.0 / scale.max(1e-4);
        let (sx, sy) = (world_x * inv_s, world_y * inv_s);
        let (fx, fy) = (sx.floor(), sy.floor());
        let (ix, iy, tx, ty) = (fx as i32, fy as i32, clamp01(sx - fx), clamp01(sy - fy));
        let (h00, h10) = (self.sample_wrapped(ix, iy), self.sample_wrapped(ix.wrapping_add(1), iy));
        let (h01, h11) = (self.sample_wrapped(ix, iy.wrapping_add(1)), self.sample_wrapped(ix.wrapping_add(1), iy.wrapping_add(1)));
        let top = h00 + (h10 - h00) * tx;
        top + ((h01 + (h11 - h01) * tx) - top) * ty
    }

    /// 중앙차분으로 단위 법선의 `(nx, ny)` 성분을 O(1) 산출한다.
    #[inline(never)]
    #[must_use]
    pub fn sample_normal_xy(&self, x: i32, y: i32, relief: f32) -> [f32; 2] {
        let r = if relief.is_finite() { relief.max(0.0) } else { 0.0 };
        if r == 0.0 { return [0.0, 0.0]; }
        let dx = (self.sample_wrapped(x.wrapping_add(1), y) - self.sample_wrapped(x.wrapping_sub(1), y)) * 0.5 * r;
        let dy = (self.sample_wrapped(x, y.wrapping_add(1)) - self.sample_wrapped(x, y.wrapping_sub(1))) * 0.5 * r;
        let inv = 1.0 / (dx * dx + dy * dy + 1.0).sqrt();
        [-dx * inv, -dy * inv]
    }

    /// LUT 전체의 최소·최대·평균·표준편차 통계를 반환한다.
    #[must_use]
    pub fn stats(&self) -> PaperLutStats {
        let (mut min, mut max, mut sum) = (f32::INFINITY, f32::NEG_INFINITY, 0.0_f64);
        for &h in &self.heights { min = min.min(h); max = max.max(h); sum += f64::from(h); }
        let mean = sum / (PAPER_TILE_LEN as f64);
        let var = self.heights.iter().map(|&h| (f64::from(h) - mean).powi(2)).sum::<f64>() / (PAPER_TILE_LEN as f64);
        PaperLutStats { min, max, mean: mean as f32, std_dev: var.sqrt() as f32 }
    }
}

#[inline]
fn hash_u32(x: u32, y: u32, seed: u32) -> f32 {
    let mut h = x.wrapping_mul(0x9E37_79B1) ^ y.wrapping_mul(0x85EB_CA77) ^ seed.wrapping_mul(0xC2B2_AE3D);
    h ^= h >> 15; h = h.wrapping_mul(0x2C1B_3C6D);
    h ^= h >> 12; h = h.wrapping_mul(0x297A_2D39);
    ((h ^ (h >> 15)) as f32) * (1.0 / (u32::MAX as f32))
}

#[inline(never)]
fn clamp01(v: f32) -> f32 { v.clamp(0.0, 1.0) }

#[inline(never)]
fn to_u8_clamped(v: f32) -> u8 { (v.clamp(0.0, 1.0) * 255.0).round() as u8 }

#[inline(never)]
fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let denom = edge1 - edge0;
    if denom.abs() <= 1e-6 { return if x >= edge1 { 1.0 } else { 0.0 }; }
    let t = clamp01((x - edge0) / denom);
    t * t * (3.0 - 2.0 * t)
}

#[inline(never)]
fn periodic_torus_noise(x: usize, y: usize, px: usize, py: usize, seed: u32) -> f32 {
    let (sx, sy) = (x * px, y * py);
    let (ix0, iy0) = (sx >> 6, sy >> 6);
    let (ix1, iy1) = ((ix0 + 1) % px, (iy0 + 1) % py);
    let (ux, uy) = ((sx & 63) as f32 * (1.0 / 64.0), (sy & 63) as f32 * (1.0 / 64.0));
    let tx = ux * ux * ux * (ux * (ux * 6.0 - 15.0) + 10.0);
    let ty = uy * uy * uy * (uy * (uy * 6.0 - 15.0) + 10.0);
    let (v00, v10) = (hash_u32(ix0 as u32, iy0 as u32, seed), hash_u32(ix1 as u32, iy0 as u32, seed));
    let (v01, v11) = (hash_u32(ix0 as u32, iy1 as u32, seed), hash_u32(ix1 as u32, iy1 as u32, seed));
    let nx0 = v00 + (v10 - v00) * tx;
    nx0 + ((v01 + (v11 - v01) * tx) - nx0) * ty
}

#[inline(never)]
fn fbm2(x: usize, y: usize, p0: usize, s0: u32, s1: u32, w0: f32) -> f32 {
    periodic_torus_noise(x, y, p0, p0, s0) * w0
        + periodic_torus_noise(x, y, p0 * 2, p0 * 2, s1) * (1.0 - w0)
}

#[inline(never)]
fn ridge_sq(n: f32) -> f32 { let r = 1.0 - (2.0 * n - 1.0).abs(); r * r }

#[inline(never)]
fn rational_bell(q: f32) -> f32 { 1.0 / (1.0 + q + 0.5 * q * q) }

#[inline]
fn finite_or_zero(v: f32) -> f32 { if v.is_finite() { v } else { 0.0 } }

#[inline(never)]
fn clamp_u32(v: f32, max_v: u32) -> u32 { (v.max(0.0) as u32).min(max_v) }

/// 4종 결정론적 64×64 무이음 타일링 종이 요철 하이트맵 LUT를 생성한다.
#[must_use]
pub fn generate_paper_tile_lut(kind: PaperKind, seed: u32) -> PaperTileLut {
    let mut heights = vec![0.0_f32; PAPER_TILE_LEN];
    let (s1, s2, s3) = (seed.wrapping_add(101), seed.wrapping_add(313), seed.wrapping_add(733));
    for (idx, slot) in heights.iter_mut().enumerate() {
        let (x, y) = (idx & PAPER_TILE_MASK, idx >> 6);
        let h = match kind {
            PaperKind::Kent => 0.5 + (fbm2(x, y, 16, seed, s1, 0.55) - 0.5) * 0.24,
            PaperKind::Hanji => {
                let f1 = ridge_sq(periodic_torus_noise((x + 2 * y) & 63, (2 * x + 64 - y) & 63, 2, 32, seed));
                let f2 = ridge_sq(periodic_torus_noise((3 * x + 64 - y) & 63, (x + 3 * y) & 63, 4, 16, s1));
                let pulp = fbm2(x, y, 8, s2, s3, 0.65);
                0.5 + (pulp * 0.40 + f1 * 0.38 + f2 * 0.22 - 0.48) * 1.45
            }
            PaperKind::ColdPress => {
                let (o4, o8) = (periodic_torus_noise(x, y, 4, 4, seed), periodic_torus_noise(x, y, 8, 8, s1));
                let hi = fbm2(x, y, 16, s2, s3, 0.70);
                let ridge = 1.0 - (2.0 * o8 - 1.0).abs();
                0.5 + (o4 * 0.44 + o8 * 0.26 + hi * 0.20 + ridge * 0.10 - 0.5) * 2.25
            }
            PaperKind::LinenCanvas => {
                let (fx, fy) = ((x as f32) * (TAU / 64.0), (y as f32) * (TAU / 64.0));
                let (warp, weft) = (0.5 + 0.5 * (8.0 * fx).sin(), 0.5 + 0.5 * (8.0 * fy).sin());
                let twill = 0.5 + 0.5 * (4.0 * (fx + fy)).cos();
                0.82 * (warp * twill + weft * (1.0 - twill)) + 0.18 * fbm2(x, y, 16, seed, s1, 0.60)
            }
        };
        *slot = clamp01(h);
    }
    PaperTileLut { kind, seed, heights }
}

/// 5층 물리 브러시 질감 스탬퍼 입력 파라미터.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TactileBrushParams {
    pub cx: f32, pub cy: f32, pub radius: f32, pub color_rgba: [u8; 4],
    pub pressure: f32, pub speed: f32, pub tilt_x: f32, pub tilt_y: f32,
    pub direction_rad: f32, pub dryness: f32, pub bristle_count: u8,
    pub paper_tooth_strength: f32, pub paper_scale: f32, pub wet_edge_strength: f32,
    pub impasto_height: f32, pub seed: u32,
}

impl Default for TactileBrushParams {
    fn default() -> Self {
        Self {
            cx: 32.0, cy: 32.0, radius: 12.0, color_rgba: [42, 68, 124, 220],
            pressure: 0.72, speed: 0.35, tilt_x: 0.15, tilt_y: 0.0, direction_rad: 0.0,
            dryness: 0.25, bristle_count: 8, paper_tooth_strength: 0.65, paper_scale: 1.0,
            wet_edge_strength: 0.4, impasto_height: 0.55, seed: 2026,
        }
    }
}

/// 5층 물리 브러시 스탬프 실행 통계.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct TactileStampStats {
    pub touched_pixels: usize, pub avg_coverage: f32, pub peak_height: f32, pub peak_specular: f32,
    pub dirty_min_x: u32, pub dirty_min_y: u32, pub dirty_max_x: u32, pub dirty_max_y: u32,
}

fn validate_tactile_params(p: &TactileBrushParams) -> Result<(), DrawingCoreError> {
    let finite_check = p.cx * 0.0 + p.cy * 0.0 + p.radius * 0.0 + p.pressure * 0.0
        + p.speed * 0.0 + p.tilt_x * 0.0 + p.tilt_y * 0.0 + p.direction_rad * 0.0
        + p.dryness * 0.0 + p.paper_tooth_strength * 0.0 + p.paper_scale * 0.0
        + p.wet_edge_strength * 0.0 + p.impasto_height * 0.0;
    if finite_check != 0.0
        || p.radius <= 0.0
        || p.paper_scale <= 0.0
        || p.impasto_height < 0.0
        || p.speed < 0.0
    {
        return Err(DrawingCoreError::InvalidParameter { name: "tactile" });
    }
    Ok(())
}

#[inline]
fn pow24(x: f32) -> f32 { let x2 = x * x; let x4 = x2 * x2; let x8 = x4 * x4; x8 * x8 * x8 }

#[inline(never)]
fn blend_pigment_over(px: &mut [u8; 4], src_rgb: [f32; 3], rim_darken: f32, eff_a: f32) {
    let inv_255 = 1.0_f32 / 255.0;
    let dst_a = f32::from(px[3]) * inv_255;
    let out_a = eff_a + dst_a * (1.0 - eff_a);
    if out_a <= 1e-5 { return; }
    let (inv_out, dst_w) = (1.0 / out_a, dst_a * (1.0 - eff_a));
    for (ch, &sc) in px[..3].iter_mut().zip(src_rgb.iter()) {
        let dc = f32::from(*ch) * inv_255;
        *ch = to_u8_clamped((sc * rim_darken * eff_a + dc * dst_w) * inv_out);
    }
    px[3] = to_u8_clamped(out_a);
}

#[derive(Clone, Copy, Default)]
struct BristleLane {
    pos: f32,
    load: f32,
    phase: f32,
}

#[inline(never)]
#[allow(clippy::too_many_arguments)]
fn apply_impasto_relief_pass(
    rgba_px: &mut [[u8; 4]], height_buffer: &[f32], dab_weights: &[f32], width: usize, height: usize,
    bounds: [u32; 4], paper_lut: &PaperTileLut, tooth_strength: f32, paper_scale: f32, impasto_h: f32,
) -> f32 {
    let [min_x, min_y, max_x, max_y] = bounds;
    let bbox_w = (max_x - min_x + 1) as usize;
    // 45° 방위각·45° 고도각 광원 L=(0.5, 0.5, 1/sqrt(2)) 및 시선 V=(0,0,1) 기준 Blinn 하프벡터 H
    const LX: f32 = 0.5;
    const LY: f32 = 0.5;
    const LZ: f32 = FRAC_1_SQRT_2;
    const HX: f32 = 0.270_598_05;
    const HY: f32 = 0.270_598_05;
    const HZ: f32 = 0.923_879_5;
    let (relief_gain, impasto_mix, inv_scale) = (1.8 + impasto_h * 1.6, impasto_h.min(1.0), 1.0 / paper_scale);
    let spec_gain = 0.48 * (impasto_h.min(2.0) * 0.5 + 0.25);
    let mut peak_specular = 0.0_f32;
    let sample_h = |sx: usize, sy: usize| -> f32 {
        finite_or_zero(height_buffer.get(sy * width + sx).copied().unwrap_or(0.0))
    };

    for y in min_y..=max_y {
        let (yu, ym, yp) = (y as usize, (y as usize).saturating_sub(1), (y as usize + 1).min(height - 1));
        for x in min_x..=max_x {
            let w_dab = dab_weights.get((y - min_y) as usize * bbox_w + (x - min_x) as usize).copied().unwrap_or(0.0);
            if w_dab <= 0.0 { continue; }
            let (xu, xm, xp) = (x as usize, (x as usize).saturating_sub(1), (x as usize + 1).min(width - 1));
            let gx = (sample_h(xp, yu) - sample_h(xm, yu)) * 0.5 * relief_gain;
            let gy = (sample_h(xu, yp) - sample_h(xu, ym)) * 0.5 * relief_gain;
            let [pnx, pny] = paper_lut.sample_normal_xy(
                (x as f32 * inv_scale).floor() as i32,
                (y as f32 * inv_scale).floor() as i32,
                tooth_strength * 0.45,
            );
            let (nx_r, ny_r) = (-gx + pnx, -gy + pny);
            let inv_n = 1.0 / (nx_r * nx_r + ny_r * ny_r + 1.0).sqrt();
            let (nx, ny, nz) = (nx_r * inv_n, ny_r * inv_n, inv_n);
            let lambert = 0.54 + 0.72 * (nx * LX + ny * LY + nz * LZ).max(0.0);
            let specular = pow24((nx * HX + ny * HY + nz * HZ).max(0.0)) * spec_gain * w_dab;
            peak_specular = peak_specular.max(specular);
            let blend_k = clamp01(w_dab * impasto_mix);
            if let Some(px) = rgba_px.get_mut(yu * width + xu) {
                for ch in &mut px[..3] {
                    let base = f32::from(*ch) * (1.0 / 255.0);
                    let lit = clamp01(base * lambert + specular);
                    *ch = to_u8_clamped(base + (lit - base) * blend_k);
                }
            }
        }
    }
    peak_specular
}

/// 5층 물리 브러시 질감 스탬퍼: RGBA8 캔버스와 2.5D 임파스토 `height_buffer`를 동시 갱신한다.
pub fn stamp_tactile_bristle_rgba(
    rgba: &mut [u8], height_buffer: &mut [f32], width: u32, height: u32,
    paper_lut: &PaperTileLut, params: &TactileBrushParams,
) -> Result<TactileStampStats, DrawingCoreError> {
    let pixel_count = checked_pixel_count(width, height)?;
    let expected_rgba = checked_rgba_len(width, height)?;
    if rgba.len() != expected_rgba {
        return Err(DrawingCoreError::BufferLengthMismatch { expected: expected_rgba, actual: rgba.len() });
    }
    if height_buffer.len() != pixel_count {
        return Err(DrawingCoreError::BufferLengthMismatch { expected: pixel_count, actual: height_buffer.len() });
    }
    validate_tactile_params(params)?;
    if params.color_rgba[3] == 0 { return Ok(TactileStampStats::default()); }

    let (pressure, dryness) = (clamp01(params.pressure), clamp01(params.dryness));
    let (tooth_strength, wet_edge_strength) = (clamp01(params.paper_tooth_strength), clamp01(params.wet_edge_strength));
    let impasto_h = params.impasto_height.min(4.0);
    let tilt_mag = (params.tilt_x * params.tilt_x + params.tilt_y * params.tilt_y).sqrt().min(1.0);

    // 1층: 기울기 변형 타원 반경 및 Dirty-Rect 경계 클램프
    let (rx, ry) = (params.radius * (1.0 + tilt_mag * 0.65), params.radius * (1.0 - tilt_mag * 0.22).max(0.5));
    let bound_r = rx.max(ry) + 1.0;
    let (min_xf, max_xf, min_yf, max_yf) = (
        (params.cx - bound_r).floor(), (params.cx + bound_r).ceil(),
        (params.cy - bound_r).floor(), (params.cy + bound_r).ceil(),
    );
    if max_xf < 0.0 || max_yf < 0.0 || min_xf >= width as f32 || min_yf >= height as f32 {
        return Ok(TactileStampStats::default());
    }
    let (min_x, max_x) = (clamp_u32(min_xf, width - 1), clamp_u32(max_xf, width - 1));
    let (min_y, max_y) = (clamp_u32(min_yf, height - 1), clamp_u32(max_yf, height - 1));
    let (bbox_w, bbox_h, w_usize, h_usize) = ((max_x - min_x + 1) as usize, (max_y - min_y + 1) as usize, width as usize, height as usize);

    // 3층: 3~16가닥 분기 갈필 필라멘트 사전 계산
    let bristle_n = params.bristle_count.clamp(MIN_BRISTLE_COUNT, MAX_BRISTLE_COUNT) as usize;
    let split_drive = clamp01(dryness * 0.55 + params.speed.min(2.0) * 0.28 + tilt_mag * 0.22);
    let spacing = 1.72 / (bristle_n as f32);
    let sigma = (spacing * (0.95 - 0.74 * split_drive)).max(0.025);
    let inv_two_sigma_sq = 1.0 / (2.0 * sigma * sigma);
    let mut lanes = [BristleLane::default(); MAX_BRISTLE_COUNT as usize];
    for (i, lane) in lanes.iter_mut().take(bristle_n).enumerate() {
        let jitter = (hash_u32(i as u32, 11, params.seed) - 0.5) * spacing * 0.28;
        *lane = BristleLane {
            pos: (-0.86 + (i as f32 + 0.5) * spacing + jitter).clamp(-0.92, 0.92),
            load: 0.72 + 0.28 * hash_u32(i as u32, 29, params.seed),
            phase: hash_u32(i as u32, 53, params.seed),
        };
    }

    let (cos_dir, sin_dir, inv_rx, inv_ry, inv_255) = (params.direction_rad.cos(), params.direction_rad.sin(), 1.0 / rx, 1.0 / ry, 1.0_f32 / 255.0);
    let base_alpha = f32::from(params.color_rgba[3]) * inv_255;
    let src_rgb = [f32::from(params.color_rgba[0]) * inv_255, f32::from(params.color_rgba[1]) * inv_255, f32::from(params.color_rgba[2]) * inv_255];
    let wetness = wet_edge_strength * (1.0 - 0.7 * dryness);
    let valley_floor = (1.0 - pressure) * (1.0 - pressure).sqrt() * (0.68 + 0.32 * dryness);

    let (rgba_px, _) = rgba.as_chunks_mut::<4>();
    let mut dab_weights = if impasto_h > 0.0 { vec![0.0_f32; bbox_w * bbox_h] } else { Vec::new() };
    let (mut touched_pixels, mut cov_sum, mut peak_height) = (0usize, 0.0_f64, 0.0_f32);

    for y in min_y..=max_y {
        let dy = (y as f32 + 0.5) - params.cy;
        let row_base = (y as usize) * w_usize;
        let local_row = (y - min_y) as usize * bbox_w;
        for x in min_x..=max_x {
            let dx = (x as f32 + 0.5) - params.cx;
            let (u_n, v_n) = ((dx * cos_dir + dy * sin_dir) * inv_rx, (-dx * sin_dir + dy * cos_dir) * inv_ry);
            let r_sq = u_n * u_n + v_n * v_n;
            if r_sq >= 1.0 { continue; }
            let r_norm = r_sq.sqrt();
            let core_mask = smoothstep(1.0, 0.76 + 0.16 * wetness, r_norm);
            let paper_h = paper_lut.sample_bilinear_wrapped(x as f32, y as f32, params.paper_scale);
            let tooth_factor = (1.0 - tooth_strength)
                + tooth_strength * smoothstep(valley_floor - 0.16, valley_floor + 0.30, paper_h + pressure * 0.45);

            let mut bristle_peak = 0.0_f32;
            for lane in lanes.iter().take(bristle_n) {
                let dv = v_n - lane.pos;
                let q = dv * dv * inv_two_sigma_sq;
                if q < 8.0 {
                    let ph = u_n * 0.72 + lane.phase;
                    let along = 1.0 - (2.0 * (ph - ph.floor()) - 1.0).abs();
                    bristle_peak = bristle_peak.max(rational_bell(q) * lane.load * (1.0 - split_drive * 0.42 * (1.0 - paper_h) * (1.0 - along)));
                }
            }
            let bristle_factor = (1.0 - split_drive) + split_drive * bristle_peak;
            let rim_band = rational_bell(((r_norm - 0.84) * (1.0 / 0.11)).powi(2));
            let capillary = (1.0 - 0.36 * wetness * (1.0 - r_norm)) + 0.62 * wetness * rim_band;
            let eff_a = clamp01(base_alpha * core_mask * tooth_factor * bristle_factor * capillary * (0.30 + 0.70 * pressure));
            if eff_a <= 1e-4 { continue; }

            let rim_darken = 1.0 - 0.20 * wetness * rim_band;
            let px_idx = row_base + (x as usize);
            if let Some(px) = rgba_px.get_mut(px_idx) {
                blend_pigment_over(px, src_rgb, rim_darken, eff_a);
            }
            if impasto_h > 0.0 {
                if let Some(h_slot) = height_buffer.get_mut(px_idx) {
                    let prev_h = finite_or_zero(*h_slot);
                    let deposit = eff_a * impasto_h
                        * (0.42 + 0.38 * (1.0 - r_sq).max(0.0) + 0.20 * bristle_peak + 0.16 * wetness * rim_band)
                        * (0.35 + 0.65 * pressure);
                    let next_h = (prev_h + deposit).clamp(0.0, 8.0);
                    *h_slot = next_h;
                    peak_height = peak_height.max(next_h);
                }
                if let Some(w_slot) = dab_weights.get_mut(local_row + (x - min_x) as usize) {
                    *w_slot = eff_a;
                }
            }
            touched_pixels += 1;
            cov_sum += f64::from(eff_a);
        }
    }

    let peak_specular = if impasto_h > 0.0 && touched_pixels > 0 {
        apply_impasto_relief_pass(
            rgba_px, height_buffer, &dab_weights, w_usize, h_usize,
            [min_x, min_y, max_x, max_y], paper_lut, tooth_strength, params.paper_scale, impasto_h,
        )
    } else { 0.0 };

    Ok(TactileStampStats {
        touched_pixels,
        avg_coverage: if touched_pixels > 0 { (cov_sum / touched_pixels as f64) as f32 } else { 0.0 },
        peak_height, peak_specular, dirty_min_x: min_x, dirty_min_y: min_y, dirty_max_x: max_x, dirty_max_y: max_y,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run_stamp(w: u32, h: u32, lut: &PaperTileLut, p: &TactileBrushParams) -> (Vec<u8>, Vec<f32>, TactileStampStats) {
        let (mut rgba, mut hb) = (vec![0u8; (w * h * 4) as usize], vec![0.0_f32; (w * h) as usize]);
        let st = stamp_tactile_bristle_rgba(&mut rgba, &mut hb, w, h, lut, p).expect("ok");
        (rgba, hb, st)
    }

    #[test]
    fn paper_lut_all_four_kinds_are_deterministic_and_bounded() {
        for kind in [PaperKind::Hanji, PaperKind::Kent, PaperKind::ColdPress, PaperKind::LinenCanvas] {
            let a = generate_paper_tile_lut(kind, 2026);
            assert_eq!((a.heights().len(), a.kind(), a.seed()), (PAPER_TILE_LEN, kind, 2026));
            assert_eq!(a, generate_paper_tile_lut(kind, 2026));
            assert!(a.heights().iter().all(|v| v.is_finite() && (0.0..=1.0).contains(v)));
            assert_ne!(a.heights(), generate_paper_tile_lut(kind, 7777).heights());
        }
    }

    #[test]
    fn paper_lut_four_kinds_exhibit_distinct_physical_statistics() {
        let (kent, hanji) = (generate_paper_tile_lut(PaperKind::Kent, 42).stats(), generate_paper_tile_lut(PaperKind::Hanji, 42).stats());
        let (cold, linen) = (generate_paper_tile_lut(PaperKind::ColdPress, 42).stats(), generate_paper_tile_lut(PaperKind::LinenCanvas, 42).stats());
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
        let seam: f32 = (0..64).map(|y| (lut.sample_wrapped(63, y) - lut.sample_wrapped(0, y)).abs()).sum();
        let inner: f32 = (0..64).map(|y| (lut.sample_wrapped(31, y) - lut.sample_wrapped(32, y)).abs()).sum();
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
        let totals: Vec<(usize, u64)> = [0.15_f32, 0.50, 0.95].iter().map(|&pressure| {
            let p = TactileBrushParams { cx: 32.0, cy: 32.0, radius: 16.0, pressure, dryness: 0.4, paper_tooth_strength: 0.95, wet_edge_strength: 0.0, impasto_height: 0.0, ..Default::default() };
            let (rgba, _, st) = run_stamp(64, 64, &lut, &p);
            (st.touched_pixels, rgba.iter().skip(3).step_by(4).map(|&a| u64::from(a)).sum())
        }).collect();
        assert!(totals[0].1 < totals[1].1 && totals[1].1 < totals[2].1 && totals[0].0 <= totals[2].0);
    }

    #[test]
    fn stamp_paper_tooth_modulation_favors_peaks_over_valleys_at_low_pressure() {
        let lut = generate_paper_tile_lut(PaperKind::ColdPress, 88);
        let p = TactileBrushParams { cx: 32.0, cy: 32.0, radius: 22.0, pressure: 0.25, speed: 0.0, dryness: 0.5, paper_tooth_strength: 1.0, wet_edge_strength: 0.0, impasto_height: 0.0, ..Default::default() };
        let (rgba, _, _) = run_stamp(64, 64, &lut, &p);
        let (mut pa, mut pn, mut va, mut vn) = (0u64, 0u64, 0u64, 0u64);
        for y in 20..44 {
            for x in 20..44 {
                let (h, a) = (lut.sample_wrapped(x, y), u64::from(rgba[((y as usize) * 64 + x as usize) * 4 + 3]));
                if h >= 0.72 { pa += a; pn += 1; } else if h <= 0.28 { va += a; vn += 1; }
            }
        }
        assert!(pn > 0 && vn > 0 && (pa as f64 / pn as f64) > (va as f64 / vn as f64) * 1.4);
    }

    #[test]
    fn stamp_split_bristle_creates_higher_cross_stroke_variance_when_dry_and_fast() {
        let lut = generate_paper_tile_lut(PaperKind::Kent, 12);
        let cross_var = |dryness: f32, speed: f32| -> f64 {
            let p = TactileBrushParams { cx: 32.0, cy: 32.0, radius: 20.0, pressure: 0.75, speed, dryness, bristle_count: 8, paper_tooth_strength: 0.0, wet_edge_strength: 0.0, impasto_height: 0.0, ..Default::default() };
            let (rgba, _, _) = run_stamp(64, 64, &lut, &p);
            let vals: Vec<f64> = (18..46).map(|y| f64::from(rgba[(y * 64 + 32) * 4 + 3])).collect();
            let mean = vals.iter().sum::<f64>() / vals.len() as f64;
            vals.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / vals.len() as f64
        };
        assert!(cross_var(0.95, 1.5) > cross_var(0.0, 0.0) * 3.0);
    }

    #[test]
    fn stamp_bristle_count_clamps_safely_between_3_and_16() {
        let lut = generate_paper_tile_lut(PaperKind::Kent, 5);
        let run = |bristle_count: u8| run_stamp(48, 48, &lut, &TactileBrushParams { cx: 24.0, cy: 24.0, radius: 16.0, dryness: 0.9, speed: 1.2, bristle_count, paper_tooth_strength: 0.0, wet_edge_strength: 0.0, impasto_height: 0.0, ..Default::default() }).0;
        assert_eq!(run(0), run(MIN_BRISTLE_COUNT));
        assert_eq!(run(255), run(MAX_BRISTLE_COUNT));
        assert_ne!(run(MIN_BRISTLE_COUNT), run(MAX_BRISTLE_COUNT));
    }

    #[test]
    fn stamp_tilt_elongates_footprint_horizontally_along_direction() {
        let lut = generate_paper_tile_lut(PaperKind::Kent, 7);
        let span = |tilt_x: f32| {
            let (_, _, st) = run_stamp(80, 80, &lut, &TactileBrushParams { cx: 40.0, cy: 40.0, radius: 14.0, tilt_x, tilt_y: 0.0, dryness: 0.0, paper_tooth_strength: 0.0, wet_edge_strength: 0.0, impasto_height: 0.0, ..Default::default() });
            st.dirty_max_x - st.dirty_min_x
        };
        assert!(span(0.95) > span(0.0) + 8);
    }

    #[test]
    fn stamp_wet_edge_pooling_concentrates_rim_alpha_over_interior() {
        let lut = generate_paper_tile_lut(PaperKind::Kent, 3);
        let (rgba, _, _) = run_stamp(64, 64, &lut, &TactileBrushParams { cx: 32.0, cy: 32.0, radius: 20.0, color_rgba: [40, 90, 180, 175], pressure: 0.75, speed: 0.0, dryness: 0.05, paper_tooth_strength: 0.0, wet_edge_strength: 1.0, impasto_height: 0.0, ..Default::default() });
        let (mut isum, mut in_, mut rsum, mut rn) = (0u64, 0u64, 0u64, 0u64);
        for y in 0..64 {
            for x in 0..64 {
                let (d, a) = ((x as f32 + 0.5 - 32.0).hypot(y as f32 + 0.5 - 32.0) / 20.0, u64::from(rgba[(y * 64 + x) * 4 + 3]));
                if d <= 0.35 { isum += a; in_ += 1; } else if (0.76..=0.90).contains(&d) { rsum += a; rn += 1; }
            }
        }
        assert!((rsum as f64 / rn as f64) > (isum as f64 / in_ as f64) * 1.25);
    }

    #[test]
    fn stamp_impasto_updates_height_buffer_and_creates_45deg_directional_highlight() {
        let lut = generate_paper_tile_lut(PaperKind::Kent, 19);
        let (rgba, _, st) = run_stamp(64, 64, &lut, &TactileBrushParams { cx: 32.0, cy: 32.0, radius: 18.0, color_rgba: [150, 120, 95, 255], pressure: 0.9, speed: 0.0, dryness: 0.0, paper_tooth_strength: 0.0, wet_edge_strength: 0.0, impasto_height: 1.4, ..Default::default() });
        assert!(st.peak_height > 0.5 && st.peak_specular > 0.05);
        let luma = |x: usize, y: usize| -> u32 { let o = (y * 64 + x) * 4; u32::from(rgba[o]) + u32::from(rgba[o + 1]) + u32::from(rgba[o + 2]) };
        assert!(luma(41, 41) > luma(22, 22) + 30);
    }

    #[test]
    fn stamp_zero_impasto_preserves_height_buffer() {
        let lut = generate_paper_tile_lut(PaperKind::Hanji, 1);
        let (mut rgba, mut hb) = (vec![0u8; 32 * 32 * 4], vec![0.25_f32; 32 * 32]);
        let st = stamp_tactile_bristle_rgba(&mut rgba, &mut hb, 32, 32, &lut, &TactileBrushParams { cx: 16.0, cy: 16.0, radius: 10.0, impasto_height: 0.0, ..Default::default() }).expect("ok");
        assert!(st.touched_pixels > 0 && st.peak_height == 0.0 && hb.iter().all(|&v| v == 0.25));
    }

    #[test]
    fn stamp_completely_oob_dab_is_safe_noop() {
        let lut = generate_paper_tile_lut(PaperKind::ColdPress, 4);
        for &(cx, cy) in &[(-100.0, -100.0), (500.0, 500.0), (16.0, -50.0)] {
            let (rgba, _, st) = run_stamp(32, 32, &lut, &TactileBrushParams { cx, cy, radius: 8.0, ..Default::default() });
            assert_eq!(st.touched_pixels, 0);
            assert!(rgba.iter().all(|&b| b == 0));
        }
    }

    #[test]
    fn stamp_corner_clipped_dab_stamps_visible_quadrant_without_oob() {
        let lut = generate_paper_tile_lut(PaperKind::Hanji, 6);
        let (rgba, _, st) = run_stamp(32, 32, &lut, &TactileBrushParams { cx: 0.0, cy: 0.0, radius: 10.0, ..Default::default() });
        assert!(st.touched_pixels > 20 && st.dirty_min_x == 0 && st.dirty_min_y == 0 && rgba[3] > 0);
    }

    #[test]
    fn stamp_rejects_nan_infinity_and_buffer_mismatches_and_sanitizes_nan_height() {
        let lut = generate_paper_tile_lut(PaperKind::Kent, 2);
        let (mut rgba, mut hb) = (vec![0u8; 16 * 16 * 4], vec![f32::NAN; 16 * 16]);
        assert!(stamp_tactile_bristle_rgba(&mut rgba, &mut hb, 16, 16, &lut, &TactileBrushParams { cx: f32::NAN, ..Default::default() }).is_err());
        assert!(stamp_tactile_bristle_rgba(&mut rgba, &mut hb, 16, 16, &lut, &TactileBrushParams { radius: 0.0, ..Default::default() }).is_err());
        assert!(stamp_tactile_bristle_rgba(&mut rgba, &mut hb, 16, 16, &lut, &TactileBrushParams { paper_scale: -1.0, ..Default::default() }).is_err());
        assert!(stamp_tactile_bristle_rgba(&mut rgba[..16], &mut hb, 16, 16, &lut, &TactileBrushParams::default()).is_err());
        assert!(stamp_tactile_bristle_rgba(&mut rgba, &mut hb[..8], 16, 16, &lut, &TactileBrushParams::default()).is_err());
        let st = stamp_tactile_bristle_rgba(&mut rgba, &mut hb, 16, 16, &lut, &TactileBrushParams { cx: 8.0, cy: 8.0, radius: 5.0, impasto_height: 0.8, ..Default::default() }).expect("ok");
        assert!(st.touched_pixels > 0 && hb[8 * 16 + 8].is_finite() && hb[8 * 16 + 8] > 0.0);
    }

    #[test]
    fn stamp_zero_alpha_pigment_and_paper_kind_codes() {
        let lut = generate_paper_tile_lut(PaperKind::LinenCanvas, 8);
        let (_, _, st) = run_stamp(16, 16, &lut, &TactileBrushParams { color_rgba: [255, 0, 0, 0], ..Default::default() });
        assert_eq!(st.touched_pixels, 0);
        assert_eq!((PaperKind::from_u32(0), PaperKind::from_u32(3), PaperKind::from_u32(4)), (Some(PaperKind::Hanji), Some(PaperKind::LinenCanvas), None));
    }
}
