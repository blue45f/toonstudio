//! 지각 균일 OKLab/OKLCH · 인쇄 CMYK(UCR/GCR) · 절차적 하프톤 스크린톤 · 방사형 리퀴파이 커널.
//!
//! 1. `rgba_to_oklch_batch` / `oklch_to_rgba_batch`: Björn Ottosson OKLab/OKLCH 정밀 일괄 변환 (NaN/Inf 안전 + sRGB 색역 클램프).
//! 2. `rgba_to_cmyk_u8_batch`: 웹툰 단행본 인쇄용 UCR/GCR 흑판 생성 비율 지원 CMYK 변환.
//! 3. `render_halftone_screentone_rgba`: 면적 보정된 원형 도트·평행선·크로스해치·다이아몬드 스크린톤 생성기.
//! 4. `liquify_displace_rgba`: Push·Bloat·Pinch·Twirl(CW/CCW) 5종 모드 + 스무스스텝 감쇠 + 프리멀티플라이드 이중선형 보간 리퀴파이.

use std::f64::consts::PI;

use crate::{checked_rgba_len, DirtyRect, DrawingCoreError};

const EMPTY_DIRTY_RECT: DirtyRect = DirtyRect {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
};

/// 하프톤 스크린톤 셀 간격 최소·최대값(px).
pub const MIN_HALFTONE_PITCH_PX: f32 = 1.0;
pub const MAX_HALFTONE_PITCH_PX: f32 = 1024.0;

// ---------------------------------------------------------------------------
// 1. Björn Ottosson OKLab / OKLCH 일괄 변환
// ---------------------------------------------------------------------------

#[inline]
fn srgb_u8_to_linear_f64(v: u8) -> f64 {
    let c = f64::from(v) / 255.0;
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

#[inline]
fn linear_f64_to_srgb_u8(lin: f64) -> u8 {
    let c = lin.clamp(0.0, 1.0);
    let srgb = if c <= 0.0031308 {
        12.92 * c
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    };
    (srgb.clamp(0.0, 1.0) * 255.0).round() as u8
}

fn build_srgb_to_linear_lut() -> [f64; 256] {
    let mut lut = [0.0_f64; 256];
    for (i, slot) in lut.iter_mut().enumerate() {
        *slot = srgb_u8_to_linear_f64(i as u8);
    }
    lut
}

/// RGBA8 버퍼를 Björn Ottosson OKLCH(`f32[4] = [L, C, H_deg, alpha]`) 버퍼로 일괄 변환한다.
///
/// - `L ∈ [0.0, 1.0]`, `C >= 0.0`, `H_deg ∈ [0.0, 360.0)`, `alpha ∈ [0.0, 1.0]`.
/// - 무채색(`C < 1e-6`)에서는 부동소수점 위상 잡음을 막기 위해 `H_deg = 0.0`으로 고정한다.
pub fn rgba_to_oklch_batch(rgba: &[u8], out_oklch: &mut [f32]) -> Result<usize, DrawingCoreError> {
    if !rgba.len().is_multiple_of(4) {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: (rgba.len() / 4) * 4,
            actual: rgba.len(),
        });
    }
    if out_oklch.len() != rgba.len() {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: rgba.len(),
            actual: out_oklch.len(),
        });
    }
    let pixel_count = rgba.len() / 4;
    if pixel_count == 0 {
        return Ok(0);
    }

    let lut = build_srgb_to_linear_lut();
    let (src_px, _) = rgba.as_chunks::<4>();
    let (dst_px, _) = out_oklch.as_chunks_mut::<4>();

    for (dst, &src) in dst_px.iter_mut().zip(src_px.iter()) {
        let r = lut[usize::from(src[0])];
        let g = lut[usize::from(src[1])];
        let b = lut[usize::from(src[2])];

        let l = 0.4122214708_f64 * r + 0.5363325363_f64 * g + 0.0514459929_f64 * b;
        let m = 0.2119034982_f64 * r + 0.6806995451_f64 * g + 0.1073969566_f64 * b;
        let s = 0.0883024619_f64 * r + 0.2817188376_f64 * g + 0.6299787005_f64 * b;

        let l_ = l.cbrt();
        let m_ = m.cbrt();
        let s_ = s.cbrt();

        let ok_l = (0.2104542553_f64 * l_ + 0.7936177850_f64 * m_ - 0.0040720468_f64 * s_)
            .clamp(0.0, 1.0);
        let ok_a = 1.9779984951_f64 * l_ - 2.4285922050_f64 * m_ + 0.4505937099_f64 * s_;
        let ok_b = 0.0259040371_f64 * l_ + 0.7827717662_f64 * m_ - 0.8086757660_f64 * s_;

        let chroma = ok_a.hypot(ok_b);
        let hue_deg = if chroma < 1e-6 {
            0.0_f64
        } else {
            let deg = ok_b.atan2(ok_a).to_degrees().rem_euclid(360.0);
            if deg >= 360.0 {
                0.0
            } else {
                deg
            }
        };

        dst[0] = ok_l as f32;
        dst[1] = if chroma < 1e-7 { 0.0 } else { chroma as f32 };
        dst[2] = hue_deg as f32;
        dst[3] = f32::from(src[3]) / 255.0;
    }

    Ok(pixel_count)
}

/// OKLCH(`f32[4] = [L, C, H_deg, alpha]`) 버퍼를 sRGB 색역으로 안전하게 클램프해 RGBA8로 일괄 변환한다.
///
/// NaN·무한대·음수 채도 등 비정상 입력을 panic 없이 안전한 0으로 정규화한다.
pub fn oklch_to_rgba_batch(oklch: &[f32], out_rgba: &mut [u8]) -> Result<usize, DrawingCoreError> {
    if !oklch.len().is_multiple_of(4) {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: (oklch.len() / 4) * 4,
            actual: oklch.len(),
        });
    }
    if out_rgba.len() != oklch.len() {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: oklch.len(),
            actual: out_rgba.len(),
        });
    }
    let pixel_count = oklch.len() / 4;
    if pixel_count == 0 {
        return Ok(0);
    }

    let (src_px, _) = oklch.as_chunks::<4>();
    let (dst_px, _) = out_rgba.as_chunks_mut::<4>();

    for (dst, &src) in dst_px.iter_mut().zip(src_px.iter()) {
        let ok_l = if src[0].is_finite() {
            f64::from(src[0]).clamp(0.0, 1.0)
        } else {
            0.0
        };
        let ok_c = if src[1].is_finite() {
            f64::from(src[1]).clamp(0.0, 2.0)
        } else {
            0.0
        };
        let h_rad = if src[2].is_finite() {
            f64::from(src[2]).rem_euclid(360.0).to_radians()
        } else {
            0.0
        };
        let alpha = if src[3].is_finite() {
            f64::from(src[3]).clamp(0.0, 1.0)
        } else {
            0.0
        };

        let ok_a = ok_c * h_rad.cos();
        let ok_b = ok_c * h_rad.sin();

        let l_ = ok_l + 0.3963377774_f64 * ok_a + 0.2158037573_f64 * ok_b;
        let m_ = ok_l - 0.1055613458_f64 * ok_a - 0.0638541728_f64 * ok_b;
        let s_ = ok_l - 0.0894841775_f64 * ok_a - 1.2914855480_f64 * ok_b;

        let l = l_ * l_ * l_;
        let m = m_ * m_ * m_;
        let s = s_ * s_ * s_;

        let r_lin = 4.0767416621_f64 * l - 3.3077115913_f64 * m + 0.2309699292_f64 * s;
        let g_lin = -1.2684380046_f64 * l + 2.6097574011_f64 * m - 0.3413193965_f64 * s;
        let b_lin = -0.0041960863_f64 * l - 0.7034186147_f64 * m + 1.7076147010_f64 * s;

        dst[0] = linear_f64_to_srgb_u8(r_lin);
        dst[1] = linear_f64_to_srgb_u8(g_lin);
        dst[2] = linear_f64_to_srgb_u8(b_lin);
        dst[3] = (alpha * 255.0).round() as u8;
    }

    Ok(pixel_count)
}

// ---------------------------------------------------------------------------
// 2. 인쇄 출판용 UCR/GCR CMYK 일괄 변환
// ---------------------------------------------------------------------------

/// RGBA8 버퍼를 단행본 인쇄 출판용 CMYK8(`[C, M, Y, K]`) 버퍼로 일괄 변환한다.
///
/// - 반투명 픽셀은 백색 용지(`[255, 255, 255]`) 위에 합성해 투명 영역에서 불필요한 잉크가 출력되지 않도록 한다.
/// - `gcr_factor ∈ [0.0, 1.0]`: UCR/GCR 흑판(K) 치환 비율(`1.0` = 최대 흑판 치환, `0.0` = 순수 CMY).
/// - 모든 `gcr_factor`에서 감산 복원식 `(1 - C) * (1 - K) == R`의 색채 불변식을 만족한다.
pub fn rgba_to_cmyk_u8_batch(
    rgba: &[u8],
    out_cmyk: &mut [u8],
    gcr_factor: f32,
) -> Result<usize, DrawingCoreError> {
    if !rgba.len().is_multiple_of(4) {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: (rgba.len() / 4) * 4,
            actual: rgba.len(),
        });
    }
    if out_cmyk.len() != rgba.len() {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: rgba.len(),
            actual: out_cmyk.len(),
        });
    }
    if !gcr_factor.is_finite() || !(0.0..=1.0).contains(&gcr_factor) {
        return Err(DrawingCoreError::InvalidParameter { name: "gcr_factor" });
    }
    let pixel_count = rgba.len() / 4;
    if pixel_count == 0 {
        return Ok(0);
    }

    let gcr = f64::from(gcr_factor);
    let (src_px, _) = rgba.as_chunks::<4>();
    let (dst_px, _) = out_cmyk.as_chunks_mut::<4>();

    for (dst, &src) in dst_px.iter_mut().zip(src_px.iter()) {
        let a = f64::from(src[3]) / 255.0;
        let inv_a = 1.0 - a;
        let r = (f64::from(src[0]) / 255.0) * a + inv_a;
        let g = (f64::from(src[1]) / 255.0) * a + inv_a;
        let b = (f64::from(src[2]) / 255.0) * a + inv_a;

        let c0 = (1.0 - r).clamp(0.0, 1.0);
        let m0 = (1.0 - g).clamp(0.0, 1.0);
        let y0 = (1.0 - b).clamp(0.0, 1.0);

        let k_max = c0.min(m0).min(y0);
        let k = (k_max * gcr).clamp(0.0, 1.0);
        let denom = 1.0 - k;

        let (c, m, y) = if denom > 1e-6 {
            (
                ((c0 - k) / denom).clamp(0.0, 1.0),
                ((m0 - k) / denom).clamp(0.0, 1.0),
                ((y0 - k) / denom).clamp(0.0, 1.0),
            )
        } else {
            (0.0, 0.0, 0.0)
        };

        dst[0] = (c * 255.0).round() as u8;
        dst[1] = (m * 255.0).round() as u8;
        dst[2] = (y * 255.0).round() as u8;
        dst[3] = (k * 255.0).round() as u8;
    }

    Ok(pixel_count)
}

// ---------------------------------------------------------------------------
// 3. 절차적 웹툰 하프톤 / 스크린톤 생성기
// ---------------------------------------------------------------------------

/// 웹툰·만화 스크린톤 하프톤 패턴 종류.
#[repr(u32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HalftonePattern {
    /// 원형 망점(AM Circle Dot).
    Dot = 0,
    /// 평행선 톤(Parallel Line).
    Line = 1,
    /// 직교 크로스해치(Crosshatch).
    Crosshatch = 2,
    /// 다이아몬드 망점(Diamond).
    Diamond = 3,
}

impl HalftonePattern {
    #[must_use]
    pub const fn from_u32(code: u32) -> Option<Self> {
        match code {
            0 => Some(Self::Dot),
            1 => Some(Self::Line),
            2 => Some(Self::Crosshatch),
            3 => Some(Self::Diamond),
            _ => None,
        }
    }
}

/// 절차적 하프톤 스크린톤 생성 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct HalftoneConfig {
    /// 망점 패턴 종류.
    pub pattern: HalftonePattern,
    /// 스크린 셀 피치(픽셀 단위, `1.0..=1024.0`).
    pub cell_pitch_px: f32,
    /// 스크린 회전 각도(도 단위, 예: `45.0`).
    pub angle_deg: f32,
    /// 톤 밀도(`0.0..=1.0`). `source_rgba`가 `None`이면 균일 톤 밀도, `Some`이면 음영 곱 계수로 작용.
    pub tone_density: f32,
    /// 망점 경계 안티앨리어싱 폭(`0.0..=0.5`, `0.0`은 완전 1비트 날카로운 잉크).
    pub softness: f32,
    /// 잉크(전경) RGBA 색상.
    pub ink_rgba: [u8; 4],
    /// 용지(배경) RGBA 색상 (투명 오버레이 시 `[0, 0, 0, 0]`).
    pub paper_rgba: [u8; 4],
}

impl Default for HalftoneConfig {
    fn default() -> Self {
        Self {
            pattern: HalftonePattern::Dot,
            cell_pitch_px: 8.0,
            angle_deg: 45.0,
            tone_density: 0.35,
            softness: 0.06,
            ink_rgba: [0, 0, 0, 255],
            paper_rgba: [255, 255, 255, 255],
        }
    }
}

#[inline]
fn halftone_signed_distance(pattern: HalftonePattern, fx: f64, fy: f64, density: f64) -> f64 {
    match pattern {
        HalftonePattern::Dot => {
            if density <= 0.5 {
                let r = (density / PI).sqrt();
                fx.hypot(fy) - r
            } else {
                let r_hole = ((1.0 - density) / PI).sqrt();
                let c_dist = (0.5 - fx.abs()).hypot(0.5 - fy.abs());
                r_hole - c_dist
            }
        }
        HalftonePattern::Line => fy.abs() - 0.5 * density,
        HalftonePattern::Crosshatch => {
            let half_w = 0.5 * (1.0 - (1.0 - density).max(0.0).sqrt());
            fx.abs().min(fy.abs()) - half_w
        }
        HalftonePattern::Diamond => {
            let manhattan = fx.abs() + fy.abs();
            if density <= 0.5 {
                let t = (density * 0.5).sqrt();
                manhattan - t
            } else {
                let t_hole = ((1.0 - density) * 0.5).sqrt();
                let corner_m = 1.0 - manhattan;
                t_hole - corner_m
            }
        }
    }
}

#[inline]
fn blend_premul_rgba(paper: [f64; 4], ink: [f64; 4], cov: f64) -> [u8; 4] {
    let inv = 1.0 - cov;
    let a = paper[3] * inv + ink[3] * cov;
    if a <= 1e-6 {
        return [0, 0, 0, 0];
    }
    let pr = paper[0] * inv + ink[0] * cov;
    let pg = paper[1] * inv + ink[1] * cov;
    let pb = paper[2] * inv + ink[2] * cov;
    [
        ((pr / a).clamp(0.0, 255.0)).round() as u8,
        ((pg / a).clamp(0.0, 255.0)).round() as u8,
        ((pb / a).clamp(0.0, 255.0)).round() as u8,
        ((a * 255.0).clamp(0.0, 255.0)).round() as u8,
    ]
}

/// 고속 절차적 웹툰 하프톤·스크린톤 RGBA8 렌더링 커널.
///
/// - `source_rgba`가 `None`이면 균일 밀도(`config.tone_density`) 스크린톤 시트를 생성한다.
/// - `source_rgba`가 `Some(src)`이면 입력 픽셀의 휘도(Rec.709)와 알파를 기반으로
///   `density = (1 - luma) * alpha * config.tone_density`를 픽셀마다 변조해 그라데이션 망점을 생성한다.
pub fn render_halftone_screentone_rgba(
    source_rgba: Option<&[u8]>,
    out_rgba: &mut [u8],
    width: u32,
    height: u32,
    config: &HalftoneConfig,
) -> Result<usize, DrawingCoreError> {
    let expected_rgba = checked_rgba_len(width, height)?;
    if out_rgba.len() != expected_rgba {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: expected_rgba,
            actual: out_rgba.len(),
        });
    }
    if let Some(src) = source_rgba {
        if src.len() != expected_rgba {
            return Err(DrawingCoreError::BufferLengthMismatch {
                expected: expected_rgba,
                actual: src.len(),
            });
        }
    }
    if !config.cell_pitch_px.is_finite()
        || config.cell_pitch_px < MIN_HALFTONE_PITCH_PX
        || config.cell_pitch_px > MAX_HALFTONE_PITCH_PX
    {
        return Err(DrawingCoreError::InvalidParameter {
            name: "cell_pitch_px",
        });
    }
    if !config.angle_deg.is_finite() {
        return Err(DrawingCoreError::InvalidParameter { name: "angle_deg" });
    }
    if !config.tone_density.is_finite() || !(0.0..=1.0).contains(&config.tone_density) {
        return Err(DrawingCoreError::InvalidParameter {
            name: "tone_density",
        });
    }
    if !config.softness.is_finite() || !(0.0..=0.5).contains(&config.softness) {
        return Err(DrawingCoreError::InvalidParameter { name: "softness" });
    }

    let w = width as usize;
    let h = height as usize;
    let inv_pitch = 1.0 / f64::from(config.cell_pitch_px);
    let angle_rad = f64::from(config.angle_deg).to_radians();
    let cos_p = angle_rad.cos() * inv_pitch;
    let sin_p = angle_rad.sin() * inv_pitch;
    let edge = f64::from(config.softness);
    let base_density = f64::from(config.tone_density);

    let paper_a = f64::from(config.paper_rgba[3]) / 255.0;
    let paper_pm = [
        f64::from(config.paper_rgba[0]) * paper_a,
        f64::from(config.paper_rgba[1]) * paper_a,
        f64::from(config.paper_rgba[2]) * paper_a,
        paper_a,
    ];
    let ink_a = f64::from(config.ink_rgba[3]) / 255.0;
    let ink_pm = [
        f64::from(config.ink_rgba[0]) * ink_a,
        f64::from(config.ink_rgba[1]) * ink_a,
        f64::from(config.ink_rgba[2]) * ink_a,
        ink_a,
    ];

    let src_chunks = source_rgba.map(|s| s.as_chunks::<4>().0);
    let (out_chunks, _) = out_rgba.as_chunks_mut::<4>();

    for y in 0..h {
        let cy = y as f64 + 0.5;
        let row_off = y * w;
        let mut u = 0.5 * cos_p + cy * sin_p;
        let mut v = -0.5 * sin_p + cy * cos_p;

        for x in 0..w {
            let idx = row_off + x;
            let density = if let Some(src_px) = src_chunks {
                let p = src_px[idx];
                let luma = (0.2126 * f64::from(p[0])
                    + 0.7152 * f64::from(p[1])
                    + 0.0722 * f64::from(p[2]))
                    / 255.0;
                let alpha = f64::from(p[3]) / 255.0;
                ((1.0 - luma) * alpha * base_density).clamp(0.0, 1.0)
            } else {
                base_density
            };

            let cov = if density <= 1e-6 {
                0.0
            } else if density >= 1.0 - 1e-6 {
                1.0
            } else {
                let fx = u - u.floor() - 0.5;
                let fy = v - v.floor() - 0.5;
                let sd = halftone_signed_distance(config.pattern, fx, fy, density);
                if edge <= 1e-6 {
                    if sd <= 0.0 {
                        1.0
                    } else {
                        0.0
                    }
                } else {
                    let t = ((edge - sd) / (2.0 * edge)).clamp(0.0, 1.0);
                    t * t * (3.0 - 2.0 * t)
                }
            };

            out_chunks[idx] = if cov <= 0.0 {
                config.paper_rgba
            } else if cov >= 1.0 {
                config.ink_rgba
            } else {
                blend_premul_rgba(paper_pm, ink_pm, cov)
            };

            u += cos_p;
            v -= sin_p;
        }
    }

    Ok(w * h)
}

// ---------------------------------------------------------------------------
// 4. 방사형 리퀴파이(Liquify) 브러시 변위 커널
// ---------------------------------------------------------------------------

/// 리퀴파이 브러시 변형 모드.
#[repr(u32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LiquifyMode {
    /// 스트로크 방향 `(dx, dy)`로 밀기(Push).
    Push = 0,
    /// 중심에서 바깥으로 부풀리기(Bloat).
    Bloat = 1,
    /// 중심 방향으로 오므리기(Pinch).
    Pinch = 2,
    /// 화면 좌표계 기준 시계 방향 회전(Twirl CW).
    TwirlCw = 3,
    /// 화면 좌표계 기준 반시계 방향 회전(Twirl CCW).
    TwirlCcw = 4,
}

impl LiquifyMode {
    #[must_use]
    pub const fn from_u32(code: u32) -> Option<Self> {
        match code {
            0 => Some(Self::Push),
            1 => Some(Self::Bloat),
            2 => Some(Self::Pinch),
            3 => Some(Self::TwirlCw),
            4 => Some(Self::TwirlCcw),
            _ => None,
        }
    }
}

/// 방사형 리퀴파이 브러시 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LiquifyBrushConfig {
    pub mode: LiquifyMode,
    /// 브러시 중심 X (px).
    pub cx: f32,
    /// 브러시 중심 Y (px).
    pub cy: f32,
    /// 브러시 영향 반경 (px, `> 0.0`).
    pub radius: f32,
    /// 변형 강도 (`0.0..=1.0`).
    pub strength: f32,
    /// `Push` 모드에서 적용할 X 변위 (px).
    pub dx: f32,
    /// `Push` 모드에서 적용할 Y 변위 (px).
    pub dy: f32,
}

/// 리퀴파이 실행 결과 통계.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LiquifyStats {
    /// 브러시 원 내부에서 실제로 재샘플링된 픽셀 수.
    pub affected_pixels: usize,
    /// 영향을 받은 픽셀을 감싸는 최소 경계 사각형.
    pub dirty_rect: DirtyRect,
}

#[inline]
fn sample_bilinear_premul(src_px: &[[u8; 4]], w: usize, h: usize, sx: f64, sy: f64) -> [u8; 4] {
    let max_x = (w - 1) as f64;
    let max_y = (h - 1) as f64;
    let cx = sx.clamp(0.0, max_x);
    let cy = sy.clamp(0.0, max_y);

    let x0 = cx.floor() as usize;
    let y0 = cy.floor() as usize;
    let x1 = (x0 + 1).min(w - 1);
    let y1 = (y0 + 1).min(h - 1);
    let fx = cx - x0 as f64;
    let fy = cy - y0 as f64;

    let w00 = (1.0 - fx) * (1.0 - fy);
    let w10 = fx * (1.0 - fy);
    let w01 = (1.0 - fx) * fy;
    let w11 = fx * fy;

    let p00 = src_px[y0 * w + x0];
    let p10 = src_px[y0 * w + x1];
    let p01 = src_px[y1 * w + x0];
    let p11 = src_px[y1 * w + x1];

    let mut pr = 0.0_f64;
    let mut pg = 0.0_f64;
    let mut pb = 0.0_f64;
    let mut pa = 0.0_f64;
    for (p, weight) in [(p00, w00), (p10, w10), (p01, w01), (p11, w11)] {
        let a = f64::from(p[3]) / 255.0;
        let wa = weight * a;
        pr += f64::from(p[0]) * wa;
        pg += f64::from(p[1]) * wa;
        pb += f64::from(p[2]) * wa;
        pa += wa;
    }

    if pa <= 1e-6 {
        return [0, 0, 0, 0];
    }
    [
        (pr / pa).clamp(0.0, 255.0).round() as u8,
        (pg / pa).clamp(0.0, 255.0).round() as u8,
        (pb / pa).clamp(0.0, 255.0).round() as u8,
        (pa * 255.0).clamp(0.0, 255.0).round() as u8,
    ]
}

/// 방사형 리퀴파이(Push·Bloat·Pinch·Twirl) 브러시 변위 커널.
///
/// 브러시 외곽 영역은 원본 그대로 보존되며, 원 내부 픽셀에만 C1 스무스스텝 감쇠와
/// 역방향 프리멀티플라이드 이중선형 보간을 적용한다.
pub fn liquify_displace_rgba(
    src_rgba: &[u8],
    dst_rgba: &mut [u8],
    width: u32,
    height: u32,
    config: &LiquifyBrushConfig,
) -> Result<LiquifyStats, DrawingCoreError> {
    let expected_rgba = checked_rgba_len(width, height)?;
    if src_rgba.len() != expected_rgba {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: expected_rgba,
            actual: src_rgba.len(),
        });
    }
    if dst_rgba.len() != expected_rgba {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: expected_rgba,
            actual: dst_rgba.len(),
        });
    }
    if !config.cx.is_finite() || !config.cy.is_finite() {
        return Err(DrawingCoreError::InvalidParameter { name: "center" });
    }
    if !config.radius.is_finite() || config.radius <= 0.0 {
        return Err(DrawingCoreError::InvalidParameter { name: "radius" });
    }
    if !config.strength.is_finite() || !(0.0..=1.0).contains(&config.strength) {
        return Err(DrawingCoreError::InvalidParameter { name: "strength" });
    }
    if !config.dx.is_finite() || !config.dy.is_finite() {
        return Err(DrawingCoreError::InvalidParameter { name: "delta" });
    }

    dst_rgba.copy_from_slice(src_rgba);

    if config.strength == 0.0
        || (config.mode == LiquifyMode::Push && config.dx == 0.0 && config.dy == 0.0)
    {
        return Ok(LiquifyStats {
            affected_pixels: 0,
            dirty_rect: EMPTY_DIRTY_RECT,
        });
    }

    let w = width as usize;
    let h = height as usize;
    let cx = f64::from(config.cx);
    let cy = f64::from(config.cy);
    let radius = f64::from(config.radius);
    let radius_sq = radius * radius;
    let strength = f64::from(config.strength);
    let dx = f64::from(config.dx);
    let dy = f64::from(config.dy);

    let min_xf = (cx - radius).floor();
    let max_xf = (cx + radius).ceil();
    let min_yf = (cy - radius).floor();
    let max_yf = (cy + radius).ceil();

    if max_xf < 0.0 || max_yf < 0.0 || min_xf >= w as f64 || min_yf >= h as f64 {
        return Ok(LiquifyStats {
            affected_pixels: 0,
            dirty_rect: EMPTY_DIRTY_RECT,
        });
    }

    let x_start = min_xf.max(0.0) as usize;
    let x_end = (max_xf.min((w - 1) as f64)) as usize;
    let y_start = min_yf.max(0.0) as usize;
    let y_end = (max_yf.min((h - 1) as f64)) as usize;

    let (src_px, _) = src_rgba.as_chunks::<4>();
    let (dst_px, _) = dst_rgba.as_chunks_mut::<4>();

    let mut affected = 0usize;
    let mut dirty_min_x = w;
    let mut dirty_max_x = 0usize;
    let mut dirty_min_y = h;
    let mut dirty_max_y = 0usize;

    for y in y_start..=y_end {
        let ry = y as f64 - cy;
        let ry_sq = ry * ry;
        let row_off = y * w;
        for x in x_start..=x_end {
            let rx = x as f64 - cx;
            let dist_sq = rx * rx + ry_sq;
            if dist_sq >= radius_sq {
                continue;
            }
            let r_norm = dist_sq.sqrt() / radius;
            let t = 1.0 - r_norm;
            // C1 스무스스텝 감쇠: 중심(1.0)과 외곽(0.0) 양쪽에서 도함수 0을 보장해 이음새를 없앤다.
            let falloff = t * t * (3.0 - 2.0 * t);

            let (sx, sy) = match config.mode {
                LiquifyMode::Push => (x as f64 - dx * strength * falloff, y as f64 - dy * strength * falloff),
                LiquifyMode::Bloat => {
                    let scale = (1.0 - 0.5 * strength * falloff).max(0.05);
                    (cx + rx * scale, cy + ry * scale)
                }
                LiquifyMode::Pinch => {
                    let scale = 1.0 + 0.5 * strength * falloff;
                    (cx + rx * scale, cy + ry * scale)
                }
                LiquifyMode::TwirlCw => {
                    let theta = -strength * (PI * 0.5) * falloff;
                    let (sin_t, cos_t) = theta.sin_cos();
                    (cx + rx * cos_t - ry * sin_t, cy + rx * sin_t + ry * cos_t)
                }
                LiquifyMode::TwirlCcw => {
                    let theta = strength * (PI * 0.5) * falloff;
                    let (sin_t, cos_t) = theta.sin_cos();
                    (cx + rx * cos_t - ry * sin_t, cy + rx * sin_t + ry * cos_t)
                }
            };

            dst_px[row_off + x] = sample_bilinear_premul(src_px, w, h, sx, sy);
            affected += 1;
            if x < dirty_min_x {
                dirty_min_x = x;
            }
            if x > dirty_max_x {
                dirty_max_x = x;
            }
            if y < dirty_min_y {
                dirty_min_y = y;
            }
            if y > dirty_max_y {
                dirty_max_y = y;
            }
        }
    }

    let dirty_rect = if affected > 0 {
        DirtyRect {
            x: dirty_min_x as u32,
            y: dirty_min_y as u32,
            width: (dirty_max_x - dirty_min_x + 1) as u32,
            height: (dirty_max_y - dirty_min_y + 1) as u32,
        }
    } else {
        EMPTY_DIRTY_RECT
    };

    Ok(LiquifyStats {
        affected_pixels: affected,
        dirty_rect,
    })
}
