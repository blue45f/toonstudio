//! Wave-3 순수 안전 Rust 색관리·인쇄 출판 커널 (`color_cmyk_oklch_kernel`).
//!
//! - sRGB ↔ OKLCH (Björn Ottosson OKLab/OKLCH, sRGB LUT 가속)
//! - sRGB ↔ Display-P3 (CSS Color 4 / D65 선형 변환 행렬 + 광색역 OKLCH ↔ Display-P3 직결)
//! - 인쇄 출판용 CMYK (UCR 시작점 + GCR 흑판 강도 + 최대 흑판 `max_k` + 총 잉크량 한도 `TAC`, 예: 300%)
//!   및 소프트 프루핑 CMYK → sRGB 변환
//! - 결정적 5-5-5 히스토그램 기반 고속 Median-Cut 16색(1..=64색) 팔레트 추출기

use crate::DrawingCoreError;

/// 기본 인쇄 총 잉크량 한도(TAC = Total Area Coverage, 300%).
pub const DEFAULT_CMYK_TAC_LIMIT_PCT: f32 = 300.0;
/// Median-Cut 팔레트 최대 추출 색상 수.
pub const MAX_MEDIAN_CUT_COLORS: usize = 64;

#[inline]
fn srgb_comp_to_linear(c: f64) -> f64 {
    let clamped = c.clamp(0.0, 1.0);
    if clamped <= 0.04045 {
        clamped / 12.92
    } else {
        ((clamped + 0.055) / 1.055).powf(2.4)
    }
}

#[inline]
fn linear_to_srgb_comp(lin: f64) -> f64 {
    let c = lin.clamp(0.0, 1.0);
    if c <= 0.003_130_8 {
        12.92 * c
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    }
}

#[inline]
fn linear_to_srgb_u8(lin: f64) -> u8 {
    (linear_to_srgb_comp(lin).clamp(0.0, 1.0) * 255.0).round() as u8
}

fn build_u8_to_linear_lut() -> [f64; 256] {
    let mut lut = [0.0_f64; 256];
    for (i, slot) in lut.iter_mut().enumerate() {
        *slot = srgb_comp_to_linear(f64::from(i as u8) / 255.0);
    }
    lut
}

// ---------------------------------------------------------------------------
// 1. sRGB ↔ Display-P3 ↔ OKLCH 색공간 변환
// ---------------------------------------------------------------------------

#[inline]
fn linear_srgb_to_linear_p3(r: f64, g: f64, b: f64) -> [f64; 3] {
    [
        0.822_461_968_7 * r + 0.177_538_031_3 * g,
        0.033_194_198_9 * r + 0.966_805_801_1 * g,
        0.017_082_630_7 * r + 0.072_397_440_7 * g + 0.910_519_928_6 * b,
    ]
}

#[inline]
fn linear_p3_to_linear_srgb(r: f64, g: f64, b: f64) -> [f64; 3] {
    [
        1.224_940_176_3 * r - 0.224_940_176_3 * g,
        -0.042_056_954_7 * r + 1.042_056_954_7 * g,
        -0.019_637_554_6 * r - 0.078_636_045_6 * g + 1.098_273_600_2 * b,
    ]
}

#[inline]
fn linear_srgb_to_oklch(r: f64, g: f64, b: f64) -> [f32; 3] {
    let l = 0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b;
    let m = 0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b;
    let s = 0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b;

    let l_ = l.cbrt();
    let m_ = m.cbrt();
    let s_ = s.cbrt();

    let ok_l = (0.210_454_255_3 * l_ + 0.793_617_785_0 * m_ - 0.004_072_046_8 * s_).clamp(0.0, 1.0);
    let ok_a = 1.977_998_495_1 * l_ - 2.428_592_205_0 * m_ + 0.450_593_709_9 * s_;
    let ok_b = 0.025_904_037_1 * l_ + 0.782_771_766_2 * m_ - 0.808_675_766_0 * s_;

    let chroma = ok_a.hypot(ok_b);
    let hue_deg = if chroma < 1e-6 {
        0.0
    } else {
        let deg = ok_b.atan2(ok_a).to_degrees().rem_euclid(360.0);
        if deg >= 360.0 {
            0.0
        } else {
            deg
        }
    };
    [
        ok_l as f32,
        if chroma < 1e-7 { 0.0 } else { chroma as f32 },
        hue_deg as f32,
    ]
}

#[inline]
fn oklch_to_linear_srgb(l_in: f32, c_in: f32, h_deg_in: f32) -> [f64; 3] {
    let ok_l = if l_in.is_finite() {
        f64::from(l_in).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let ok_c = if c_in.is_finite() {
        f64::from(c_in).clamp(0.0, 2.0)
    } else {
        0.0
    };
    let h_rad = if h_deg_in.is_finite() {
        f64::from(h_deg_in).rem_euclid(360.0).to_radians()
    } else {
        0.0
    };

    let ok_a = ok_c * h_rad.cos();
    let ok_b = ok_c * h_rad.sin();

    let l_ = ok_l + 0.396_337_777_4 * ok_a + 0.215_803_757_3 * ok_b;
    let m_ = ok_l - 0.105_561_345_8 * ok_a - 0.063_854_172_8 * ok_b;
    let s_ = ok_l - 0.089_484_177_5 * ok_a - 1.291_485_548_0 * ok_b;

    let l = l_ * l_ * l_;
    let m = m_ * m_ * m_;
    let s = s_ * s_ * s_;

    [
        4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s,
        -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s,
        -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701_0 * s,
    ]
}

fn validate_quad_buffers(a_len: usize, b_len: usize) -> Result<usize, DrawingCoreError> {
    if !a_len.is_multiple_of(4) {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: (a_len / 4) * 4,
            actual: a_len,
        });
    }
    if b_len != a_len {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: a_len,
            actual: b_len,
        });
    }
    Ok(a_len / 4)
}

/// sRGB RGBA8 버퍼를 정규화된 Display-P3 `f32[4] = [R_p3, G_p3, B_p3, alpha]` 버퍼로 일괄 변환한다.
pub fn srgb_rgba_to_display_p3_batch(
    srgb_rgba: &[u8],
    out_p3_rgba: &mut [f32],
) -> Result<usize, DrawingCoreError> {
    let pixels = validate_quad_buffers(srgb_rgba.len(), out_p3_rgba.len())?;
    let lut = build_u8_to_linear_lut();
    for (dst, &src) in out_p3_rgba
        .as_chunks_mut::<4>()
        .0
        .iter_mut()
        .zip(srgb_rgba.as_chunks::<4>().0)
    {
        let p3_lin = linear_srgb_to_linear_p3(
            lut[usize::from(src[0])],
            lut[usize::from(src[1])],
            lut[usize::from(src[2])],
        );
        dst[0] = linear_to_srgb_comp(p3_lin[0]) as f32;
        dst[1] = linear_to_srgb_comp(p3_lin[1]) as f32;
        dst[2] = linear_to_srgb_comp(p3_lin[2]) as f32;
        dst[3] = f32::from(src[3]) / 255.0;
    }
    Ok(pixels)
}

/// Display-P3 `f32[4] = [R_p3, G_p3, B_p3, alpha]` 버퍼를 sRGB RGBA8로 안전하게 색역 클램프해 변환한다.
pub fn display_p3_to_srgb_rgba_batch(
    p3_rgba: &[f32],
    out_srgb_rgba: &mut [u8],
) -> Result<usize, DrawingCoreError> {
    let pixels = validate_quad_buffers(p3_rgba.len(), out_srgb_rgba.len())?;
    for (dst, &src) in out_srgb_rgba
        .as_chunks_mut::<4>()
        .0
        .iter_mut()
        .zip(p3_rgba.as_chunks::<4>().0)
    {
        let rp = if src[0].is_finite() {
            srgb_comp_to_linear(f64::from(src[0]))
        } else {
            0.0
        };
        let gp = if src[1].is_finite() {
            srgb_comp_to_linear(f64::from(src[1]))
        } else {
            0.0
        };
        let bp = if src[2].is_finite() {
            srgb_comp_to_linear(f64::from(src[2]))
        } else {
            0.0
        };
        let alpha = if src[3].is_finite() {
            f64::from(src[3]).clamp(0.0, 1.0)
        } else {
            0.0
        };
        let srgb_lin = linear_p3_to_linear_srgb(rp, gp, bp);
        dst[0] = linear_to_srgb_u8(srgb_lin[0]);
        dst[1] = linear_to_srgb_u8(srgb_lin[1]);
        dst[2] = linear_to_srgb_u8(srgb_lin[2]);
        dst[3] = (alpha * 255.0).round() as u8;
    }
    Ok(pixels)
}

/// Display-P3 `f32[4]` 버퍼를 광색역 보존 상태로 OKLCH `[L, C, H_deg, alpha]`로 직접 변환한다.
pub fn display_p3_to_oklch_batch(
    p3_rgba: &[f32],
    out_oklch: &mut [f32],
) -> Result<usize, DrawingCoreError> {
    let pixels = validate_quad_buffers(p3_rgba.len(), out_oklch.len())?;
    for (dst, &src) in out_oklch
        .as_chunks_mut::<4>()
        .0
        .iter_mut()
        .zip(p3_rgba.as_chunks::<4>().0)
    {
        let rp = if src[0].is_finite() {
            srgb_comp_to_linear(f64::from(src[0]))
        } else {
            0.0
        };
        let gp = if src[1].is_finite() {
            srgb_comp_to_linear(f64::from(src[1]))
        } else {
            0.0
        };
        let bp = if src[2].is_finite() {
            srgb_comp_to_linear(f64::from(src[2]))
        } else {
            0.0
        };
        // 광색역 Display-P3 선형 좌표를 클램프 없이 확장 sRGB 선형 공간으로 투영 후 OKLCH 계산
        let ext_srgb = linear_p3_to_linear_srgb(rp, gp, bp);
        let lch = linear_srgb_to_oklch(ext_srgb[0], ext_srgb[1], ext_srgb[2]);
        dst[0] = lch[0];
        dst[1] = lch[1];
        dst[2] = lch[2];
        dst[3] = if src[3].is_finite() {
            src[3].clamp(0.0, 1.0)
        } else {
            0.0
        };
    }
    Ok(pixels)
}

/// OKLCH `[L, C, H_deg, alpha]` 버퍼를 Display-P3 `f32[4]`로 직접 변환한다.
pub fn oklch_to_display_p3_batch(
    oklch: &[f32],
    out_p3_rgba: &mut [f32],
) -> Result<usize, DrawingCoreError> {
    let pixels = validate_quad_buffers(oklch.len(), out_p3_rgba.len())?;
    for (dst, &src) in out_p3_rgba
        .as_chunks_mut::<4>()
        .0
        .iter_mut()
        .zip(oklch.as_chunks::<4>().0)
    {
        let ext_srgb = oklch_to_linear_srgb(src[0], src[1], src[2]);
        let p3_lin = linear_srgb_to_linear_p3(ext_srgb[0], ext_srgb[1], ext_srgb[2]);
        dst[0] = linear_to_srgb_comp(p3_lin[0]) as f32;
        dst[1] = linear_to_srgb_comp(p3_lin[1]) as f32;
        dst[2] = linear_to_srgb_comp(p3_lin[2]) as f32;
        dst[3] = if src[3].is_finite() {
            src[3].clamp(0.0, 1.0)
        } else {
            0.0
        };
    }
    Ok(pixels)
}

/// sRGB RGBA8 버퍼를 OKLCH `[L, C, H_deg, alpha]`로 변환한다.
pub fn srgb_rgba_to_oklch_f32_batch(
    srgb_rgba: &[u8],
    out_oklch: &mut [f32],
) -> Result<usize, DrawingCoreError> {
    let pixels = validate_quad_buffers(srgb_rgba.len(), out_oklch.len())?;
    let lut = build_u8_to_linear_lut();
    for (dst, &src) in out_oklch
        .as_chunks_mut::<4>()
        .0
        .iter_mut()
        .zip(srgb_rgba.as_chunks::<4>().0)
    {
        let lch = linear_srgb_to_oklch(
            lut[usize::from(src[0])],
            lut[usize::from(src[1])],
            lut[usize::from(src[2])],
        );
        dst[0] = lch[0];
        dst[1] = lch[1];
        dst[2] = lch[2];
        dst[3] = f32::from(src[3]) / 255.0;
    }
    Ok(pixels)
}

/// OKLCH `[L, C, H_deg, alpha]` 버퍼를 sRGB RGBA8로 변환한다.
pub fn oklch_f32_to_srgb_rgba_batch(
    oklch: &[f32],
    out_srgb_rgba: &mut [u8],
) -> Result<usize, DrawingCoreError> {
    let pixels = validate_quad_buffers(oklch.len(), out_srgb_rgba.len())?;
    for (dst, &src) in out_srgb_rgba
        .as_chunks_mut::<4>()
        .0
        .iter_mut()
        .zip(oklch.as_chunks::<4>().0)
    {
        let lin = oklch_to_linear_srgb(src[0], src[1], src[2]);
        dst[0] = linear_to_srgb_u8(lin[0]);
        dst[1] = linear_to_srgb_u8(lin[1]);
        dst[2] = linear_to_srgb_u8(lin[2]);
        let a = if src[3].is_finite() {
            f64::from(src[3]).clamp(0.0, 1.0)
        } else {
            0.0
        };
        dst[3] = (a * 255.0).round() as u8;
    }
    Ok(pixels)
}

// ---------------------------------------------------------------------------
// 2. UCR / GCR + TAC(총 잉크량 한도, 예: 300%) 인쇄 CMYK 변환 및 소프트 프루핑
// ---------------------------------------------------------------------------

/// 인쇄 출판 CMYK UCR/GCR 및 TAC 한도 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CmykTacConfig {
    /// GCR(Gray Component Replacement) 흑판 치환 강도 (`0.0..=1.0`, 기본 `0.8`).
    pub gcr_strength: f32,
    /// UCR(Under Color Removal) 흑판 시작 임계값 (`0.0..=0.95`, 기본 `0.0`).
    pub ucr_start: f32,
    /// 허용 최대 흑판 비율 (`0.0..=1.0`, 기본 `0.95`).
    pub max_k: f32,
    /// 총 잉크량 한도 TAC (`100.0..=400.0` %, 오프셋 인쇄 표준 `300.0`).
    pub tac_limit_pct: f32,
}

impl Default for CmykTacConfig {
    fn default() -> Self {
        Self {
            gcr_strength: 0.80,
            ucr_start: 0.0,
            max_k: 0.95,
            tac_limit_pct: DEFAULT_CMYK_TAC_LIMIT_PCT,
        }
    }
}

/// TAC 적용 CMYK 일괄 변환 통계.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CmykTacStats {
    pub pixel_count: usize,
    pub clamped_pixels: usize,
    pub max_tac_pct: f32,
}

/// RGBA8 버퍼를 UCR/GCR 및 TAC(예: 300%) 총 잉크량 제한이 보장된 인쇄용 CMYK8로 변환한다.
pub fn rgba_to_cmyk_tac_batch(
    rgba: &[u8],
    out_cmyk: &mut [u8],
    cfg: &CmykTacConfig,
) -> Result<CmykTacStats, DrawingCoreError> {
    let pixel_count = validate_quad_buffers(rgba.len(), out_cmyk.len())?;
    if !cfg.gcr_strength.is_finite() || !(0.0..=1.0).contains(&cfg.gcr_strength) {
        return Err(DrawingCoreError::InvalidParameter {
            name: "gcr_strength",
        });
    }
    if !cfg.ucr_start.is_finite() || !(0.0..=0.95).contains(&cfg.ucr_start) {
        return Err(DrawingCoreError::InvalidParameter { name: "ucr_start" });
    }
    if !cfg.max_k.is_finite() || !(0.0..=1.0).contains(&cfg.max_k) {
        return Err(DrawingCoreError::InvalidParameter { name: "max_k" });
    }
    if !cfg.tac_limit_pct.is_finite() || !(100.0..=400.0).contains(&cfg.tac_limit_pct) {
        return Err(DrawingCoreError::InvalidParameter {
            name: "tac_limit_pct",
        });
    }

    let gcr = f64::from(cfg.gcr_strength);
    let ucr_start = f64::from(cfg.ucr_start);
    let max_k = f64::from(cfg.max_k);
    let tac_max = f64::from(cfg.tac_limit_pct) / 100.0;

    let mut clamped_pixels = 0usize;
    let mut max_tac_observed = 0.0_f64;

    for (dst, &src) in out_cmyk
        .as_chunks_mut::<4>()
        .0
        .iter_mut()
        .zip(rgba.as_chunks::<4>().0)
    {
        // 백색 인쇄 용지 위 알파 합성
        let a = f64::from(src[3]) / 255.0;
        let inv_a = 1.0 - a;
        let r = (f64::from(src[0]) / 255.0) * a + inv_a;
        let g = (f64::from(src[1]) / 255.0) * a + inv_a;
        let b = (f64::from(src[2]) / 255.0) * a + inv_a;

        let c0 = (1.0 - r).clamp(0.0, 1.0);
        let m0 = (1.0 - g).clamp(0.0, 1.0);
        let y0 = (1.0 - b).clamp(0.0, 1.0);

        let k_neutral = c0.min(m0).min(y0);
        let k_raw = if k_neutral <= ucr_start {
            0.0
        } else {
            ((k_neutral - ucr_start) / (1.0 - ucr_start)) * k_neutral * gcr
        };
        let mut k = k_raw.min(max_k).clamp(0.0, 1.0);
        let denom = 1.0 - k;
        let (mut c, mut m, mut y) = if denom > 1e-6 {
            (
                ((c0 - k) / denom).clamp(0.0, 1.0),
                ((m0 - k) / denom).clamp(0.0, 1.0),
                ((y0 - k) / denom).clamp(0.0, 1.0),
            )
        } else {
            (0.0, 0.0, 0.0)
        };

        // TAC (Total Area Coverage) 잉크 상한 강제
        let total_ink = c + m + y + k;
        if total_ink > tac_max {
            clamped_pixels += 1;
            if k >= tac_max {
                k = tac_max.min(1.0);
                c = 0.0;
                m = 0.0;
                y = 0.0;
            } else {
                let cmy_sum = c + m + y;
                if cmy_sum > 1e-9 {
                    let allowed_cmy = (tac_max - k).max(0.0);
                    let scale = (allowed_cmy / cmy_sum).min(1.0);
                    c *= scale;
                    m *= scale;
                    y *= scale;
                }
            }
        }

        // 반올림 후에도 8비트 정수 합이 TAC를 초과하지 않도록 바닥/보정 보장
        let mut cu = (c * 255.0).round().clamp(0.0, 255.0) as u32;
        let mut mu = (m * 255.0).round().clamp(0.0, 255.0) as u32;
        let mut yu = (y * 255.0).round().clamp(0.0, 255.0) as u32;
        let ku = (k * 255.0).round().clamp(0.0, 255.0) as u32;
        let max_u8_sum = (tac_max * 255.0).floor() as u32;
        while cu + mu + yu + ku > max_u8_sum {
            if cu >= mu && cu >= yu && cu > 0 {
                cu -= 1;
            } else if mu >= yu && mu > 0 {
                mu -= 1;
            } else if yu > 0 {
                yu -= 1;
            } else {
                break;
            }
        }

        let final_tac = f64::from(cu + mu + yu + ku) / 255.0 * 100.0;
        if final_tac > max_tac_observed {
            max_tac_observed = final_tac;
        }
        dst[0] = cu as u8;
        dst[1] = mu as u8;
        dst[2] = yu as u8;
        dst[3] = ku as u8;
    }

    Ok(CmykTacStats {
        pixel_count,
        clamped_pixels,
        max_tac_pct: max_tac_observed as f32,
    })
}

/// 인쇄 CMYK8 버퍼를 소프트 프루핑용 sRGB RGBA8로 복원한다.
pub fn cmyk_to_rgba_proof_batch(
    cmyk: &[u8],
    out_rgba: &mut [u8],
) -> Result<usize, DrawingCoreError> {
    let pixel_count = validate_quad_buffers(cmyk.len(), out_rgba.len())?;
    for (dst, &src) in out_rgba
        .as_chunks_mut::<4>()
        .0
        .iter_mut()
        .zip(cmyk.as_chunks::<4>().0)
    {
        let c = f64::from(src[0]) / 255.0;
        let m = f64::from(src[1]) / 255.0;
        let y = f64::from(src[2]) / 255.0;
        let k = f64::from(src[3]) / 255.0;
        let one_minus_k = 1.0 - k;
        dst[0] = (((1.0 - c) * one_minus_k).clamp(0.0, 1.0) * 255.0).round() as u8;
        dst[1] = (((1.0 - m) * one_minus_k).clamp(0.0, 1.0) * 255.0).round() as u8;
        dst[2] = (((1.0 - y) * one_minus_k).clamp(0.0, 1.0) * 255.0).round() as u8;
        dst[3] = 255;
    }
    Ok(pixel_count)
}

// ---------------------------------------------------------------------------
// 3. 고속 결정적 Median-Cut 팔레트 추출기 (5-5-5 RGB 히스토그램)
// ---------------------------------------------------------------------------

/// 추출된 단일 팔레트 스와치.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PaletteSwatch {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub count: u32,
    pub coverage: f32,
}

#[derive(Clone, Copy)]
struct HistBin {
    r_q: u8,
    g_q: u8,
    b_q: u8,
    count: u32,
    r_sum: u64,
    g_sum: u64,
    b_sum: u64,
}

#[derive(Clone, Copy)]
struct ColorBox {
    start: usize,
    end: usize,
    population: u64,
    r_min: u8,
    r_max: u8,
    g_min: u8,
    g_max: u8,
    b_min: u8,
    b_max: u8,
}

impl ColorBox {
    fn from_slice(bins: &[HistBin], start: usize, end: usize) -> Self {
        let mut r_min = u8::MAX;
        let mut r_max = 0u8;
        let mut g_min = u8::MAX;
        let mut g_max = 0u8;
        let mut b_min = u8::MAX;
        let mut b_max = 0u8;
        let mut pop = 0u64;
        for bin in &bins[start..end] {
            r_min = r_min.min(bin.r_q);
            r_max = r_max.max(bin.r_q);
            g_min = g_min.min(bin.g_q);
            g_max = g_max.max(bin.g_q);
            b_min = b_min.min(bin.b_q);
            b_max = b_max.max(bin.b_q);
            pop += u64::from(bin.count);
        }
        Self {
            start,
            end,
            population: pop,
            r_min,
            r_max,
            g_min,
            g_max,
            b_min,
            b_max,
        }
    }

    #[inline]
    fn len(&self) -> usize {
        self.end - self.start
    }

    #[inline]
    fn widest_channel(&self) -> (u8, u8) {
        let dr = self.r_max.saturating_sub(self.r_min);
        let dg = self.g_max.saturating_sub(self.g_min);
        let db = self.b_max.saturating_sub(self.b_min);
        if dr >= dg && dr >= db {
            (0, dr)
        } else if dg >= db {
            (1, dg)
        } else {
            (2, db)
        }
    }

    #[inline]
    fn split_priority(&self) -> u64 {
        if self.len() <= 1 {
            return 0;
        }
        let (_, max_range) = self.widest_channel();
        if max_range == 0 {
            return 0;
        }
        self.population.saturating_mul(u64::from(max_range) + 1)
    }
}

/// RGBA8 버퍼에서 결정적 Median-Cut 알고리즘으로 대표 색상 팔레트(기본 16색, 최대 64색)를 추출한다.
///
/// - `alpha_threshold`: 이 값 미만의 투명 픽셀은 팔레트 집계에서 제외한다.
/// - 결과는 픽셀 점유 수 내림차순(동률 시 packed RGB 오름차순)으로 결정적 정렬된다.
pub fn extract_palette_median_cut(
    rgba: &[u8],
    max_colors: usize,
    alpha_threshold: u8,
) -> Result<Vec<PaletteSwatch>, DrawingCoreError> {
    if !rgba.len().is_multiple_of(4) {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: (rgba.len() / 4) * 4,
            actual: rgba.len(),
        });
    }
    if max_colors == 0 || max_colors > MAX_MEDIAN_CUT_COLORS {
        return Err(DrawingCoreError::InvalidParameter { name: "max_colors" });
    }

    // 5-5-5 RGB 32,768 버킷 단일 패스 집계 (O(N), 완전 결정적)
    let mut counts = vec![0u32; 32_768];
    let mut r_sums = vec![0u64; 32_768];
    let mut g_sums = vec![0u64; 32_768];
    let mut b_sums = vec![0u64; 32_768];
    let mut total_visible = 0u64;

    for &px in rgba.as_chunks::<4>().0 {
        if px[3] < alpha_threshold {
            continue;
        }
        let key = ((usize::from(px[0]) >> 3) << 10)
            | ((usize::from(px[1]) >> 3) << 5)
            | (usize::from(px[2]) >> 3);
        counts[key] = counts[key].saturating_add(1);
        r_sums[key] += u64::from(px[0]);
        g_sums[key] += u64::from(px[1]);
        b_sums[key] += u64::from(px[2]);
        total_visible += 1;
    }

    if total_visible == 0 {
        return Ok(Vec::new());
    }

    let mut bins = Vec::with_capacity(256);
    for key in 0..32_768usize {
        let count = counts[key];
        if count > 0 {
            bins.push(HistBin {
                r_q: ((key >> 10) & 31) as u8,
                g_q: ((key >> 5) & 31) as u8,
                b_q: (key & 31) as u8,
                count,
                r_sum: r_sums[key],
                g_sum: g_sums[key],
                b_sum: b_sums[key],
            });
        }
    }

    let mut boxes = vec![ColorBox::from_slice(&bins, 0, bins.len())];

    while boxes.len() < max_colors {
        let mut best_idx = None;
        let mut best_prio = 0u64;
        for (idx, b) in boxes.iter().enumerate() {
            let prio = b.split_priority();
            if prio > best_prio {
                best_prio = prio;
                best_idx = Some(idx);
            }
        }
        let Some(idx) = best_idx else {
            break;
        };
        let target = boxes.remove(idx);
        let (ch, _) = target.widest_channel();
        bins[target.start..target.end].sort_by_key(|bin| match ch {
            0 => (bin.r_q, bin.g_q, bin.b_q),
            1 => (bin.g_q, bin.r_q, bin.b_q),
            _ => (bin.b_q, bin.r_q, bin.g_q),
        });

        let half_pop = target.population / 2;
        let mut acc = 0u64;
        let mut split = target.start + 1;
        for (i, bin) in bins.iter().enumerate().take(target.end - 1).skip(target.start) {
            acc += u64::from(bin.count);
            split = i + 1;
            if acc >= half_pop {
                break;
            }
        }

        boxes.push(ColorBox::from_slice(&bins, target.start, split));
        boxes.push(ColorBox::from_slice(&bins, split, target.end));
    }

    let mut swatches = Vec::with_capacity(boxes.len());
    for b in boxes {
        let mut pop = 0u64;
        let mut rs = 0u64;
        let mut gs = 0u64;
        let mut bs = 0u64;
        for bin in &bins[b.start..b.end] {
            pop += u64::from(bin.count);
            rs += bin.r_sum;
            gs += bin.g_sum;
            bs += bin.b_sum;
        }
        if pop == 0 {
            continue;
        }
        let r = ((rs + pop / 2) / pop).min(255) as u8;
        let g = ((gs + pop / 2) / pop).min(255) as u8;
        let b_ch = ((bs + pop / 2) / pop).min(255) as u8;
        swatches.push(PaletteSwatch {
            r,
            g,
            b: b_ch,
            count: u32::try_from(pop).unwrap_or(u32::MAX),
            coverage: (pop as f32) / (total_visible as f32),
        });
    }

    swatches.sort_by(|a, b| {
        b.count
            .cmp(&a.count)
            .then_with(|| (a.r, a.g, a.b).cmp(&(b.r, b.g, b.b)))
    });
    Ok(swatches)
}
