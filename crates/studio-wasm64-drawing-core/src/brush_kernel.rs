//! 물리 기반 브러시 광학·질감 커널.
//!
//! 1. Kubelka-Munk 스펙트럼 광학 혼색 (`mix_pigments_km`)
//! 2. 월드 좌표 고정 2층 종이 높이장 (`sample_world_paper_height`)
//! 3. 2.5D 임파스토 Sobel 법선 광원 셰이딩 (`apply_impasto_lighting_rgba`)

use crate::{checked_pixel_count, checked_rgba_len, DrawingCoreError};

/// 반사율 경계 클램프: `K/S = (1 - R)^2 / (2R)` 계산 시 0 나눗셈을 차단한다.
const KM_REFLECTANCE_MIN: f32 = 0.003;
const KM_REFLECTANCE_MAX: f32 = 0.997;

/// 월드 좌표 고정 2층 종이 질감 파라미터.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PaperGrainConfig {
    /// 저주파 콜드프레스 종이 요철(tooth) 주기 스케일(px).
    pub macro_scale: f32,
    /// 고주파 면섬유(fiber weave) 주기 스케일(px).
    pub micro_scale: f32,
    /// 저주파 층 가중치(0 이상).
    pub macro_weight: f32,
    /// 고주파 층 가중치(0 이상).
    pub micro_weight: f32,
    /// 결정론적 시드.
    pub seed: u32,
}

impl Default for PaperGrainConfig {
    fn default() -> Self {
        Self {
            macro_scale: 24.0,
            micro_scale: 6.0,
            macro_weight: 0.65,
            micro_weight: 0.35,
            seed: 2026,
        }
    }
}

/// 2.5D 임파스토 Sobel 광원 셰이딩 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ImpastoLightConfig {
    /// 광원 방위각(라디안).
    pub azimuth_rad: f32,
    /// 광원 고도각(라디안, `0..PI/2`).
    pub elevation_rad: f32,
    /// 높이장 기울기 증폭 계수(양수).
    pub relief_strength: f32,
    /// 주변광 강도(0..1).
    pub ambient: f32,
    /// 확산광 강도(0..2).
    pub diffuse_strength: f32,
    /// 스페큘러 하이라이트 강도(0..1).
    pub specular_strength: f32,
    /// Blinn-Phong 광택 지수(1..128).
    pub shininess: f32,
}

impl Default for ImpastoLightConfig {
    fn default() -> Self {
        Self {
            azimuth_rad: std::f32::consts::FRAC_PI_4,
            elevation_rad: 0.959_931_1, // 55 deg
            relief_strength: 1.8,
            ambient: 0.35,
            diffuse_strength: 0.75,
            specular_strength: 0.22,
            shininess: 24.0,
        }
    }
}

/// 임파스토 셰이딩 실행 통계.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ImpastoShadingStats {
    /// 알파가 0보다 커서 셰이딩이 적용된 픽셀 수.
    pub shaded_pixels: usize,
    /// 평균 Sobel 경사 크기.
    pub avg_slope: f32,
    /// 최대 스페큘러 기여도.
    pub peak_specular: f32,
}

#[inline]
fn srgb_u8_to_linear(channel: u8) -> f32 {
    let s = f32::from(channel) / 255.0;
    if s <= 0.04045 {
        s / 12.92
    } else {
        ((s + 0.055) / 1.055).powf(2.4)
    }
}

#[inline]
fn linear_to_srgb_u8(linear: f32) -> u8 {
    let clamped = linear.clamp(0.0, 1.0);
    let s = if clamped <= 0.003_130_8 {
        clamped * 12.92
    } else {
        1.055 * clamped.powf(1.0 / 2.4) - 0.055
    };
    (s.clamp(0.0, 1.0) * 255.0).round() as u8
}

#[inline]
fn reflectance_to_ks(reflectance: f32) -> f32 {
    let r = reflectance.clamp(KM_REFLECTANCE_MIN, KM_REFLECTANCE_MAX);
    let one_minus_r = 1.0 - r;
    (one_minus_r * one_minus_r) / (2.0 * r)
}

/// 수치 안정 역변환: `R = 1 / (1 + ks + sqrt(ks^2 + 2*ks))`.
#[inline]
fn ks_to_reflectance(ks: f32) -> f32 {
    let safe_ks = ks.max(0.0);
    let denom = 1.0 + safe_ks + (safe_ks * safe_ks + 2.0 * safe_ks).sqrt();
    (1.0 / denom).clamp(0.0, 1.0)
}

/// Kubelka-Munk 감산 광학 혼색 커널.
///
/// `ratio == 0.0`이면 `color_a`, `ratio == 1.0`이면 `color_b`를 반환하며,
/// 파랑+노랑 안료 혼합 시 탁한 회색 대신 자연스러운 녹색 계열을 보존한다.
pub fn mix_pigments_km(
    color_a: [u8; 4],
    color_b: [u8; 4],
    ratio: f32,
) -> Result<[u8; 4], DrawingCoreError> {
    if !ratio.is_finite() {
        return Err(DrawingCoreError::InvalidParameter { name: "ratio" });
    }
    let t = ratio.clamp(0.0, 1.0);
    if t == 0.0 {
        return Ok(color_a);
    }
    if t == 1.0 {
        return Ok(color_b);
    }

    let inv_t = 1.0 - t;
    let mut out = [0u8; 4];
    for ch in 0..3 {
        let ra = srgb_u8_to_linear(color_a[ch]);
        let rb = srgb_u8_to_linear(color_b[ch]);
        let ks_mix = inv_t * reflectance_to_ks(ra) + t * reflectance_to_ks(rb);
        let r_mix = ks_to_reflectance(ks_mix);
        out[ch] = linear_to_srgb_u8(r_mix);
    }
    let alpha = inv_t * f32::from(color_a[3]) + t * f32::from(color_b[3]);
    out[3] = alpha.clamp(0.0, 255.0).round() as u8;
    Ok(out)
}

/// RGBA8 버퍼 구간에 대해 Kubelka-Munk 광학 혼색을 일괄 수행한다.
pub fn mix_pigments_km_strip(
    dst_rgba: &mut [u8],
    src_rgba: &[u8],
    ratio: f32,
) -> Result<usize, DrawingCoreError> {
    if !ratio.is_finite() {
        return Err(DrawingCoreError::InvalidParameter { name: "ratio" });
    }
    if dst_rgba.len() != src_rgba.len() || !dst_rgba.len().is_multiple_of(4) {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: dst_rgba.len(),
            actual: src_rgba.len(),
        });
    }
    let mut processed = 0usize;
    let (dst_chunks, _) = dst_rgba.as_chunks_mut::<4>();
    let (src_chunks, _) = src_rgba.as_chunks::<4>();
    for (dst_px, &src_px) in dst_chunks.iter_mut().zip(src_chunks.iter()) {
        let mixed = mix_pigments_km(*dst_px, src_px, ratio)?;
        *dst_px = mixed;
        processed += 1;
    }
    Ok(processed)
}

#[inline]
fn hash_grid_u32(ix: i32, iy: i32, seed: u32) -> f32 {
    let mut h = (ix as u32).wrapping_mul(0x9E37_79B1)
        ^ (iy as u32).wrapping_mul(0x85EB_CA77)
        ^ seed.wrapping_mul(0xC2B2_AE3D);
    h ^= h >> 15;
    h = h.wrapping_mul(0x2C1B_3C6D);
    h ^= h >> 12;
    h = h.wrapping_mul(0x297A_2D39);
    h ^= h >> 15;
    (h as f32) / (u32::MAX as f32)
}

#[inline]
fn quintic(t: f32) -> f32 {
    t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
}

fn value_noise_2d(x: f32, y: f32, seed: u32) -> f32 {
    let fx = x.floor();
    let fy = y.floor();
    let ix = fx as i32;
    let iy = fy as i32;
    let tx = quintic((x - fx).clamp(0.0, 1.0));
    let ty = quintic((y - fy).clamp(0.0, 1.0));

    let v00 = hash_grid_u32(ix, iy, seed);
    let v10 = hash_grid_u32(ix.wrapping_add(1), iy, seed);
    let v01 = hash_grid_u32(ix, iy.wrapping_add(1), seed);
    let v11 = hash_grid_u32(ix.wrapping_add(1), iy.wrapping_add(1), seed);

    let nx0 = v00 + (v10 - v00) * tx;
    let nx1 = v01 + (v11 - v01) * tx;
    nx0 + (nx1 - nx0) * ty
}

/// 월드 좌표에 고정된 2층 종이 높이장(매크로 요철 + 마이크로 섬유 직조)을 결정론적으로 샘플링한다.
///
/// 반환값은 `[0.0, 1.0]` 범위이며, 캔버스 팬/줌이나 스트로크 분할에 관계없이 동일 월드 좌표에서
/// 항상 동일한 높이를 반환한다.
pub fn sample_world_paper_height(
    world_x: f32,
    world_y: f32,
    config: &PaperGrainConfig,
) -> Result<f32, DrawingCoreError> {
    if !world_x.is_finite() || !world_y.is_finite() {
        return Err(DrawingCoreError::InvalidParameter {
            name: "world_coord",
        });
    }
    if !config.macro_scale.is_finite() || config.macro_scale <= 0.0 {
        return Err(DrawingCoreError::InvalidParameter {
            name: "macro_scale",
        });
    }
    if !config.micro_scale.is_finite() || config.micro_scale <= 0.0 {
        return Err(DrawingCoreError::InvalidParameter {
            name: "micro_scale",
        });
    }
    if !config.macro_weight.is_finite()
        || !config.micro_weight.is_finite()
        || config.macro_weight < 0.0
        || config.micro_weight < 0.0
    {
        return Err(DrawingCoreError::InvalidParameter {
            name: "grain_weight",
        });
    }
    let weight_sum = config.macro_weight + config.micro_weight;
    if weight_sum <= 0.0 {
        return Err(DrawingCoreError::InvalidParameter {
            name: "grain_weight",
        });
    }

    // 1층: 매크로 종이 요철 (2옥타브 fBM)
    let mx = world_x / config.macro_scale;
    let my = world_y / config.macro_scale;
    let macro_oct1 = value_noise_2d(mx, my, config.seed);
    let macro_oct2 = value_noise_2d(
        mx * 2.03 + 17.3,
        my * 2.03 - 11.7,
        config.seed.wrapping_add(101),
    );
    let macro_layer = macro_oct1 * 0.68 + macro_oct2 * 0.32;

    // 2층: 마이크로 면섬유 (회전 격자 노이즈 + 직교 섬유 하모닉)
    let ux = world_x / config.micro_scale;
    let uy = world_y / config.micro_scale;
    let rot_x = ux * 0.866_025_4 - uy * 0.5;
    let rot_y = ux * 0.5 + uy * 0.866_025_4;
    let fiber_noise = value_noise_2d(rot_x, rot_y, config.seed.wrapping_add(313));
    let weave_harmonic =
        0.5 + 0.25 * (ux * std::f32::consts::TAU).sin() + 0.25 * (uy * std::f32::consts::TAU).cos();
    let micro_layer = fiber_noise * 0.72 + weave_harmonic * 0.28;

    let combined =
        (macro_layer * config.macro_weight + micro_layer * config.micro_weight) / weight_sum;
    Ok(combined.clamp(0.0, 1.0))
}

#[inline]
fn pow_shininess_f32(base: f32, exp: f32) -> f32 {
    if (exp - exp.trunc()).abs() == 0.0 && (0.0..=256.0).contains(&exp) {
        let mut n = exp as u32;
        let mut acc = 1.0_f32;
        let mut factor = base;
        while n > 0 {
            if (n & 1) != 0 {
                acc *= factor;
            }
            n >>= 1;
            if n > 0 {
                factor *= factor;
            }
        }
        acc
    } else {
        base.powf(exp)
    }
}

/// 2.5D 임파스토 높이장에 3x3 Sobel 법선을 계산해 Blinn-Phong 광원 셰이딩을 RGBA8 버퍼에 적용한다.
pub fn apply_impasto_lighting_rgba(
    rgba: &mut [u8],
    height_map: &[f32],
    width: u32,
    height: u32,
    light: &ImpastoLightConfig,
) -> Result<ImpastoShadingStats, DrawingCoreError> {
    let pixel_count = checked_pixel_count(width, height)?;
    let expected_rgba = checked_rgba_len(width, height)?;
    if rgba.len() != expected_rgba {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: expected_rgba,
            actual: rgba.len(),
        });
    }
    if height_map.len() != pixel_count {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: pixel_count,
            actual: height_map.len(),
        });
    }
    if !light.azimuth_rad.is_finite()
        || !light.elevation_rad.is_finite()
        || !light.relief_strength.is_finite()
        || light.relief_strength < 0.0
        || !light.ambient.is_finite()
        || !light.diffuse_strength.is_finite()
        || !light.specular_strength.is_finite()
        || !light.shininess.is_finite()
        || light.shininess <= 0.0
    {
        return Err(DrawingCoreError::InvalidParameter {
            name: "impasto_light",
        });
    }

    let w = width as usize;
    let h = height as usize;
    let cos_el = light.elevation_rad.cos();
    let lx = light.azimuth_rad.cos() * cos_el;
    let ly = light.azimuth_rad.sin() * cos_el;
    let lz = light.elevation_rad.sin().max(0.01);
    let l_len = (lx * lx + ly * ly + lz * lz).sqrt();
    let (lx, ly, lz) = (lx / l_len, ly / l_len, lz / l_len);

    // 시선 벡터 V = (0, 0, 1) 기준 Blinn-Phong 하프 벡터 H = normalize(L + V)
    let hx = lx;
    let hy = ly;
    let hz = lz + 1.0;
    let h_len = (hx * hx + hy * hy + hz * hz).sqrt();
    let (hx, hy, hz) = (hx / h_len, hy / h_len, hz / h_len);

    let sample_h = |x: usize, y: usize| -> f32 {
        let v = height_map.get(y * w + x).copied().unwrap_or(0.0);
        if v.is_finite() {
            v
        } else {
            0.0
        }
    };

    let mut shaded_pixels = 0usize;
    let mut slope_sum = 0.0_f64;
    let mut peak_specular = 0.0_f32;

    for y in 0..h {
        let ym = y.saturating_sub(1);
        let yp = (y + 1).min(h - 1);
        for x in 0..w {
            let idx = (y * w + x) * 4;
            let alpha_u8 = rgba[idx + 3];
            if alpha_u8 == 0 {
                continue;
            }
            let xm = x.saturating_sub(1);
            let xp = (x + 1).min(w - 1);

            let tl = sample_h(xm, ym);
            let tc = sample_h(x, ym);
            let tr = sample_h(xp, ym);
            let ml = sample_h(xm, y);
            let mr = sample_h(xp, y);
            let bl = sample_h(xm, yp);
            let bc = sample_h(x, yp);
            let br = sample_h(xp, yp);

            let gx = ((-tl + tr) + 2.0 * (-ml + mr) + (-bl + br)) * light.relief_strength;
            let gy = ((-tl - 2.0 * tc - tr) + (bl + 2.0 * bc + br)) * light.relief_strength;

            let nx_raw = -gx;
            let ny_raw = -gy;
            let inv_norm = 1.0 / (nx_raw * nx_raw + ny_raw * ny_raw + 1.0).sqrt();
            let nx = nx_raw * inv_norm;
            let ny = ny_raw * inv_norm;
            let nz = inv_norm;

            let ndotl = (nx * lx + ny * ly + nz * lz).max(0.0);
            let ndoth = (nx * hx + ny * hy + nz * hz).max(0.0);
            let alpha_norm = f32::from(alpha_u8) / 255.0;
            let diffuse_factor = (light.ambient + light.diffuse_strength * ndotl).max(0.0);
            let specular_add =
                light.specular_strength * pow_shininess_f32(ndoth, light.shininess) * alpha_norm;

            for ch in 0..3 {
                let base = f32::from(rgba[idx + ch]) / 255.0;
                let lit = (base * diffuse_factor + specular_add).clamp(0.0, 1.0);
                rgba[idx + ch] = (lit * 255.0).round() as u8;
            }

            shaded_pixels += 1;
            slope_sum += f64::from((gx * gx + gy * gy).sqrt());
            if specular_add > peak_specular {
                peak_specular = specular_add;
            }
        }
    }

    let avg_slope = if shaded_pixels > 0 {
        (slope_sum / shaded_pixels as f64) as f32
    } else {
        0.0
    };

    Ok(ImpastoShadingStats {
        shaded_pixels,
        avg_slope,
        peak_specular,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn km_mix_blue_and_yellow_yields_green_dominant_pigment() {
        let ultramarine = [24, 92, 214, 255];
        let cadmium_yellow = [245, 212, 28, 255];
        let mixed = mix_pigments_km(ultramarine, cadmium_yellow, 0.5).expect("valid km mix");
        assert!(
            mixed[1] > mixed[0] && mixed[1] > mixed[2],
            "Kubelka-Munk 파랑+노랑 혼색은 녹색 채널이 우세해야 한다: {mixed:?}"
        );
        assert_eq!(mixed[3], 255);
    }

    #[test]
    fn km_mix_endpoints_and_error_guards() {
        let a = [180, 40, 20, 200];
        let b = [10, 140, 220, 100];
        assert_eq!(mix_pigments_km(a, b, 0.0).expect("t=0"), a);
        assert_eq!(mix_pigments_km(a, b, 1.0).expect("t=1"), b);
        assert_eq!(
            mix_pigments_km(a, b, f32::NAN),
            Err(DrawingCoreError::InvalidParameter { name: "ratio" })
        );

        let mut strip = [180, 40, 20, 255, 24, 92, 214, 255];
        let src = [10, 140, 220, 255, 245, 212, 28, 255];
        let count = mix_pigments_km_strip(&mut strip, &src, 0.5).expect("strip ok");
        assert_eq!(count, 2);
        assert!(strip[5] > strip[4] && strip[5] > strip[6]);
    }

    #[test]
    fn world_paper_height_is_deterministic_and_bounded() {
        let cfg = PaperGrainConfig::default();
        let h1 = sample_world_paper_height(128.5, -42.25, &cfg).expect("sample 1");
        let h2 = sample_world_paper_height(128.5, -42.25, &cfg).expect("sample 2");
        assert_eq!(h1, h2);
        assert!((0.0..=1.0).contains(&h1));

        let other_seed = PaperGrainConfig { seed: 9999, ..cfg };
        let h3 = sample_world_paper_height(128.5, -42.25, &other_seed).expect("other seed");
        assert_ne!(h1, h3);

        assert!(sample_world_paper_height(f32::INFINITY, 0.0, &cfg).is_err());
        assert!(sample_world_paper_height(
            0.0,
            0.0,
            &PaperGrainConfig {
                macro_scale: 0.0,
                ..cfg
            }
        )
        .is_err());
    }

    #[test]
    fn impasto_sobel_lighting_shades_slopes_and_preserves_transparent_pixels() {
        let w = 5u32;
        let h = 5u32;
        let mut rgba = vec![140u8; (w * h * 4) as usize];
        for i in 0..(w * h) as usize {
            rgba[i * 4 + 3] = 255;
        }
        // (0, 0) 픽셀은 완전 투명 -> 셰이딩에 의해 변경되지 않아야 한다.
        rgba[0] = 11;
        rgba[1] = 22;
        rgba[2] = 33;
        rgba[3] = 0;

        // 중앙이 솟아오른 임파스토 덩어리 높이장
        let mut heights = vec![0.0_f32; (w * h) as usize];
        heights[2 * 5 + 2] = 1.0;
        heights[2 * 5 + 1] = 0.5;
        heights[2 * 5 + 3] = 0.5;
        heights[5 + 2] = 0.5;
        heights[3 * 5 + 2] = 0.5;

        let light = ImpastoLightConfig {
            azimuth_rad: 0.0, // +X 방향에서 비춤
            elevation_rad: std::f32::consts::FRAC_PI_4,
            relief_strength: 2.0,
            ambient: 0.25,
            diffuse_strength: 0.85,
            specular_strength: 0.25,
            shininess: 16.0,
        };

        let stats = apply_impasto_lighting_rgba(&mut rgba, &heights, w, h, &light)
            .expect("impasto shading ok");
        assert_eq!(stats.shaded_pixels, 24);
        assert!(stats.avg_slope > 0.0);
        // 투명 픽셀 무손실 보존 확인
        assert_eq!(&rgba[0..4], &[11, 22, 33, 0]);
        // 광원(+X)을 마주보는 오른쪽 경사면(x=3,y=2)이 반대쪽(x=1,y=2)보다 밝아야 한다.
        let lit_side = rgba[(2 * 5 + 3) * 4];
        let shadow_side = rgba[(2 * 5 + 1) * 4];
        assert!(
            lit_side > shadow_side,
            "광원 정면 경사({lit_side})가 그림자 경사({shadow_side})보다 밝아야 한다"
        );
    }
}
