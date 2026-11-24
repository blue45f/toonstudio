//! Kubelka-Munk 16파장(400~700nm) 5안료 분광 광학 혼색 커널.
//!
//! ToonStudio `real-media-tip-atlas.ts`의 16밴드 CIE D65 표준 광원·5원색 안료
//! (울트라마린 블루 · 카드뮴 옐로 · 카드뮴 레드 · 티타늄 화이트 · 아이보리 블랙)
//! 분광 모델을 순수 Rust로 구현해 Wasm 핫패스와 JS 폴백 간 바이트 동등성을 유지한다.

use std::sync::Mutex;

use crate::DrawingCoreError;

/// 가시광선 400~700nm 구간 20nm 간격 16개 분광 대역.
pub const KM_SPECTRAL_BANDS: usize = 16;

const CIE_XBAR: [f64; KM_SPECTRAL_BANDS] = [
    0.0143, 0.1344, 0.3483, 0.2908, 0.0956, 0.0049, 0.0633, 0.2904, 0.5945, 0.9163, 1.0622, 0.8544,
    0.4479, 0.1649, 0.0468, 0.0114,
];
const CIE_YBAR: [f64; KM_SPECTRAL_BANDS] = [
    0.0004, 0.004, 0.023, 0.06, 0.139, 0.323, 0.71, 0.954, 0.995, 0.87, 0.631, 0.381, 0.175, 0.061,
    0.017, 0.0041,
];
const CIE_ZBAR: [f64; KM_SPECTRAL_BANDS] = [
    0.0679, 0.6456, 1.7471, 1.6692, 0.813, 0.272, 0.0782, 0.0203, 0.0039, 0.0017, 0.0008, 0.0002,
    0.0, 0.0, 0.0, 0.0,
];
const CIE_D65: [f64; KM_SPECTRAL_BANDS] = [
    82.75, 93.43, 104.86, 117.81, 115.92, 109.35, 104.79, 107.69, 104.05, 96.33, 90.01, 87.7, 83.7,
    80.03, 78.28, 71.61,
];

// 5안료 반사율 R(λ): 블루, 옐로, 레드, 티타늄 화이트(고산란 S=4.5), 아이보리 블랙
const PIGMENT_R_0: [f64; KM_SPECTRAL_BANDS] = [
    0.8, 0.88, 0.92, 0.86, 0.48, 0.3, 0.22, 0.12, 0.032, 0.018, 0.016, 0.016, 0.018, 0.02, 0.022,
    0.025,
];
const PIGMENT_R_1: [f64; KM_SPECTRAL_BANDS] = [
    0.022, 0.022, 0.024, 0.028, 0.052, 0.48, 0.9, 0.96, 0.97, 0.97, 0.97, 0.97, 0.96, 0.96, 0.95,
    0.95,
];
const PIGMENT_R_2: [f64; KM_SPECTRAL_BANDS] = [
    0.22, 0.18, 0.14, 0.06, 0.022, 0.018, 0.018, 0.028, 0.085, 0.36, 0.82, 0.94, 0.96, 0.96, 0.96,
    0.95,
];
const PIGMENT_R_3: [f64; KM_SPECTRAL_BANDS] = [
    0.96, 0.985, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99,
];
const PIGMENT_R_4: [f64; KM_SPECTRAL_BANDS] = [0.008; KM_SPECTRAL_BANDS];

const S0: f64 = 0.65;
const S1: f64 = 1.05;
const S2: f64 = 0.8;
const S3: f64 = 4.5;
const S4: f64 = 0.45;

const fn build_k_curve(refl: [f64; KM_SPECTRAL_BANDS], scatter: f64) -> [f64; KM_SPECTRAL_BANDS] {
    let mut k = [0.0_f64; KM_SPECTRAL_BANDS];
    let mut i = 0;
    while i < KM_SPECTRAL_BANDS {
        let r = refl[i];
        let one_minus_r = 1.0 - r;
        k[i] = (scatter * one_minus_r * one_minus_r) / (2.0 * r);
        i += 1;
    }
    k
}

const fn build_spec_to_linear_matrix() -> (
    [f64; KM_SPECTRAL_BANDS],
    [f64; KM_SPECTRAL_BANDS],
    [f64; KM_SPECTRAL_BANDS],
) {
    let mut sx = 0.0_f64;
    let mut sy = 0.0_f64;
    let mut sz = 0.0_f64;
    let mut i = 0;
    while i < KM_SPECTRAL_BANDS {
        let d = CIE_D65[i];
        sx += CIE_XBAR[i] * d;
        sy += CIE_YBAR[i] * d;
        sz += CIE_ZBAR[i] * d;
        i += 1;
    }

    let mut out_r = [0.0_f64; KM_SPECTRAL_BANDS];
    let mut out_g = [0.0_f64; KM_SPECTRAL_BANDS];
    let mut out_b = [0.0_f64; KM_SPECTRAL_BANDS];
    let mut j = 0;
    while j < KM_SPECTRAL_BANDS {
        let d = CIE_D65[j];
        let wx = (CIE_XBAR[j] * d * 0.95047) / sx;
        let wy = (CIE_YBAR[j] * d) / sy;
        let wz = (CIE_ZBAR[j] * d * 1.08883) / sz;
        out_r[j] = 3.240_454_2 * wx - 1.537_138_5 * wy - 0.498_531_4 * wz;
        out_g[j] = -0.969_266 * wx + 1.876_010_8 * wy + 0.041_556 * wz;
        out_b[j] = 0.055_643_4 * wx - 0.204_025_9 * wy + 1.057_225_2 * wz;
        j += 1;
    }
    (out_r, out_g, out_b)
}

const K0: [f64; KM_SPECTRAL_BANDS] = build_k_curve(PIGMENT_R_0, S0);
const K1: [f64; KM_SPECTRAL_BANDS] = build_k_curve(PIGMENT_R_1, S1);
const K2: [f64; KM_SPECTRAL_BANDS] = build_k_curve(PIGMENT_R_2, S2);
const K3: [f64; KM_SPECTRAL_BANDS] = build_k_curve(PIGMENT_R_3, S3);
const K4: [f64; KM_SPECTRAL_BANDS] = build_k_curve(PIGMENT_R_4, S4);
const SPEC_MAT: (
    [f64; KM_SPECTRAL_BANDS],
    [f64; KM_SPECTRAL_BANDS],
    [f64; KM_SPECTRAL_BANDS],
) = build_spec_to_linear_matrix();
const SPEC_TO_LIN_R: [f64; KM_SPECTRAL_BANDS] = SPEC_MAT.0;
const SPEC_TO_LIN_G: [f64; KM_SPECTRAL_BANDS] = SPEC_MAT.1;
const SPEC_TO_LIN_B: [f64; KM_SPECTRAL_BANDS] = SPEC_MAT.2;

#[derive(Debug, Clone, Copy)]
struct PigmentConcEntry {
    c: [f64; 5],
    base_rgb: [f64; 3],
}

#[inline]
fn srgb_to_linear_f64(u: f64) -> f64 {
    let c = (u as f32).clamp(0.0, 1.0);
    if c <= 0.04045 {
        f64::from(c / 12.92)
    } else {
        f64::from(((c + 0.055) / 1.055).powf(2.4))
    }
}

#[inline]
fn linear_to_srgb_u8_f64(u: f64) -> u8 {
    let c = (u as f32).clamp(0.0, 1.0);
    let s = if c <= 0.003_130_8 {
        12.92 * c
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    };
    (s.clamp(0.0, 1.0) * 255.0).round() as u8
}

#[inline(never)]
fn eval_pigments_to_linear(c: [f64; 5]) -> [f64; 3] {
    let denom = (c[0] * S0 + c[1] * S1 + c[2] * S2 + c[3] * S3 + c[4] * S4).max(1e-6);
    let inv_s = 1.0 / denom;
    let mut r = 0.0_f64;
    let mut g = 0.0_f64;
    let mut b = 0.0_f64;
    for i in 0..KM_SPECTRAL_BANDS {
        let u = (c[0] * K0[i] + c[1] * K1[i] + c[2] * K2[i] + c[3] * K3[i] + c[4] * K4[i]) * inv_s;
        let refl = 1.0 + u - (u * u + 2.0 * u + 1e-12).sqrt();
        r += SPEC_TO_LIN_R[i] * refl;
        g += SPEC_TO_LIN_G[i] * refl;
        b += SPEC_TO_LIN_B[i] * refl;
    }
    [r, g, b]
}

fn solve_pigment_conc_for_cell(qr: u8, qg: u8, qb: u8) -> PigmentConcEntry {
    let cr255 = ((u16::from(qr) << 3) + 4).min(255) as f64;
    let cg255 = ((u16::from(qg) << 3) + 4).min(255) as f64;
    let cb255 = ((u16::from(qb) << 3) + 4).min(255) as f64;

    let tr = srgb_to_linear_f64(cr255 / 255.0);
    let tg = srgb_to_linear_f64(cg255 / 255.0);
    let tb = srgb_to_linear_f64(cb255 / 255.0);

    let r = cr255 / 255.0;
    let g = cg255 / 255.0;
    let b = cb255 / 255.0;
    let mn = r.min(g).min(b);
    let mx = r.max(g).max(b);
    let cr = r - mn;
    let cg = g - mn;
    let cb = b - mn;
    let yel = cr.min(cg) + (cg - cr).max(0.0) * 0.6;
    let red = (cr - cg).max(0.0);
    let blu = cb + (cg - cr).max(0.0) * 0.6;
    let sum = blu + yel + red + mn * 0.5 + (1.0 - mx) * 0.4 + 1e-9;

    let mut c = [
        blu / sum,
        yel / sum,
        red / sum,
        (mn * 0.5) / sum,
        ((1.0 - mx) * 0.4) / sum,
    ];

    let loss_of = |cand: [f64; 5]| -> f64 {
        let lin = eval_pigments_to_linear(cand);
        let d0 = lin[0] - tr;
        let d1 = lin[1] - tg;
        let d2 = lin[2] - tb;
        d0 * d0 + d1 * d1 + d2 * d2
    };

    let mut best_loss = loss_of(c);
    let mut delta = 0.25_f64;
    while delta >= 0.007 && best_loss >= 2e-5 {
        for i in 0..5 {
            for j in (i + 1)..5 {
                let ci = c[i];
                let cj = c[j];
                let mut improved = false;
                let d_plus = delta.min(cj);
                if d_plus > 1e-6 {
                    c[i] = ci + d_plus;
                    c[j] = cj - d_plus;
                    let l = loss_of(c);
                    if l < best_loss {
                        best_loss = l;
                        improved = true;
                    } else {
                        c[i] = ci;
                        c[j] = cj;
                    }
                }
                if !improved {
                    let d_minus = delta.min(ci);
                    if d_minus > 1e-6 {
                        c[i] = ci - d_minus;
                        c[j] = cj + d_minus;
                        let l = loss_of(c);
                        if l < best_loss {
                            best_loss = l;
                        } else {
                            c[i] = ci;
                            c[j] = cj;
                        }
                    }
                }
            }
        }
        delta *= 0.5;
    }

    let base_rgb = eval_pigments_to_linear(c);
    PigmentConcEntry { c, base_rgb }
}

/// 5비트 RGB 양자화 셀 기반 직접 사상 캐시(외부 HashMap/SipHash 의존 없이 경량 유지).
struct DirectMappedPigmentCache {
    slots: Vec<(u16, PigmentConcEntry)>,
}

const EMPTY_CACHE_KEY: u16 = u16::MAX;
const CACHE_MASK: usize = 2047;

static KM16_SHARED_CACHE: Mutex<Option<DirectMappedPigmentCache>> = Mutex::new(None);

impl DirectMappedPigmentCache {
    fn new() -> Self {
        Self {
            slots: vec![
                (
                    EMPTY_CACHE_KEY,
                    PigmentConcEntry {
                        c: [0.0; 5],
                        base_rgb: [0.0; 3],
                    }
                );
                CACHE_MASK + 1
            ],
        }
    }

    #[inline]
    fn resolve(&mut self, ri: u8, gi: u8, bi: u8) -> PigmentConcEntry {
        let qr = ri >> 3;
        let qg = gi >> 3;
        let qb = bi >> 3;
        let key = (u16::from(qr) << 10) | (u16::from(qg) << 5) | u16::from(qb);
        let slot_idx = ((usize::from(key).wrapping_mul(2_654_435_761)) >> 21) & CACHE_MASK;
        let slot = &mut self.slots[slot_idx];
        if slot.0 == key {
            return slot.1;
        }
        let entry = solve_pigment_conc_for_cell(qr, qg, qb);
        *slot = (key, entry);
        entry
    }
}

#[inline]
fn mix_pair_with_entries(
    color_a: [u8; 4],
    color_b: [u8; 4],
    l1: PigmentConcEntry,
    l2: PigmentConcEntry,
    t: f64,
) -> [u8; 4] {
    let w1 = 1.0 - t;
    let res_r1 = srgb_to_linear_f64(f64::from(color_a[0]) / 255.0) - l1.base_rgb[0];
    let res_g1 = srgb_to_linear_f64(f64::from(color_a[1]) / 255.0) - l1.base_rgb[1];
    let res_b1 = srgb_to_linear_f64(f64::from(color_a[2]) / 255.0) - l1.base_rgb[2];
    let res_r2 = srgb_to_linear_f64(f64::from(color_b[0]) / 255.0) - l2.base_rgb[0];
    let res_g2 = srgb_to_linear_f64(f64::from(color_b[1]) / 255.0) - l2.base_rgb[1];
    let res_b2 = srgb_to_linear_f64(f64::from(color_b[2]) / 255.0) - l2.base_rgb[2];

    let mixed_c = [
        w1 * l1.c[0] + t * l2.c[0],
        w1 * l1.c[1] + t * l2.c[1],
        w1 * l1.c[2] + t * l2.c[2],
        w1 * l1.c[3] + t * l2.c[3],
        w1 * l1.c[4] + t * l2.c[4],
    ];
    let lin = eval_pigments_to_linear(mixed_c);
    let r = linear_to_srgb_u8_f64(lin[0] + w1 * res_r1 + t * res_r2);
    let g = linear_to_srgb_u8_f64(lin[1] + w1 * res_g1 + t * res_g2);
    let b = linear_to_srgb_u8_f64(lin[2] + w1 * res_b1 + t * res_b2);
    let a = (w1 * f64::from(color_a[3]) + t * f64::from(color_b[3]))
        .clamp(0.0, 255.0)
        .round() as u8;
    [r, g, b, a]
}

/// 16파장(400~700nm) 5안료 Kubelka-Munk 분광 광학 혼색 단일 픽셀 커널.
pub fn mix_pigments_km16(
    color_a: [u8; 4],
    color_b: [u8; 4],
    ratio: f32,
) -> Result<[u8; 4], DrawingCoreError> {
    if !ratio.is_finite() {
        return Err(DrawingCoreError::InvalidParameter { name: "ratio" });
    }
    let t = f64::from(ratio.clamp(0.0, 1.0));
    if t <= 0.0 {
        return Ok(color_a);
    }
    if t >= 1.0 {
        return Ok(color_b);
    }
    if color_a[0] == color_b[0] && color_a[1] == color_b[1] && color_a[2] == color_b[2] {
        let a = ((1.0 - t) * f64::from(color_a[3]) + t * f64::from(color_b[3]))
            .clamp(0.0, 255.0)
            .round() as u8;
        return Ok([color_a[0], color_a[1], color_a[2], a]);
    }
    let l1 = solve_pigment_conc_for_cell(color_a[0] >> 3, color_a[1] >> 3, color_a[2] >> 3);
    let l2 = solve_pigment_conc_for_cell(color_b[0] >> 3, color_b[1] >> 3, color_b[2] >> 3);
    Ok(mix_pair_with_entries(color_a, color_b, l1, l2, t))
}

/// RGBA8 버퍼 구간에 대해 16파장 Kubelka-Munk 분광 혼색을 일괄 수행한다.
pub fn mix_pigments_km16_strip(
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

    let t = f64::from(ratio.clamp(0.0, 1.0));
    let pixel_count = dst_rgba.len() / 4;
    if t <= 0.0 {
        return Ok(pixel_count);
    }
    if t >= 1.0 {
        dst_rgba.copy_from_slice(src_rgba);
        return Ok(pixel_count);
    }

    let mut guard = KM16_SHARED_CACHE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let cache = guard.get_or_insert_with(DirectMappedPigmentCache::new);
    let (dst_chunks, _) = dst_rgba.as_chunks_mut::<4>();
    let (src_chunks, _) = src_rgba.as_chunks::<4>();
    for (dst_px, &src_px) in dst_chunks.iter_mut().zip(src_chunks.iter()) {
        if dst_px[0] == src_px[0] && dst_px[1] == src_px[1] && dst_px[2] == src_px[2] {
            dst_px[3] = ((1.0 - t) * f64::from(dst_px[3]) + t * f64::from(src_px[3]))
                .clamp(0.0, 255.0)
                .round() as u8;
            continue;
        }
        let l1 = cache.resolve(dst_px[0], dst_px[1], dst_px[2]);
        let l2 = cache.resolve(src_px[0], src_px[1], src_px[2]);
        *dst_px = mix_pair_with_entries(*dst_px, src_px, l1, l2, t);
    }
    Ok(pixel_count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn km16_blue_and_yellow_produces_vivid_natural_green() {
        let ultramarine = [24, 92, 214, 255];
        let cadmium_yellow = [245, 212, 28, 255];
        let mixed = mix_pigments_km16(ultramarine, cadmium_yellow, 0.5).expect("km16 mix");
        assert!(
            mixed[1] > mixed[0] && mixed[1] > mixed[2],
            "16파장 KM 파랑+노랑 혼색은 녹색 채널이 우세해야 한다: {mixed:?}"
        );
        assert_eq!(mixed[3], 255);
    }

    #[test]
    fn km16_strip_matches_single_pixel_kernel_bit_for_bit() {
        let mut dst = vec![
            24, 92, 214, 255, 220, 45, 38, 240, 24, 92, 214, 180, 120, 120, 120, 200,
        ];
        let src = vec![
            245, 212, 28, 255, 245, 212, 28, 120, 24, 92, 214, 60, 20, 160, 210, 255,
        ];
        let expected: Vec<u8> = dst
            .as_chunks::<4>()
            .0
            .iter()
            .zip(src.as_chunks::<4>().0.iter())
            .flat_map(|(&a, &b)| mix_pigments_km16(a, b, 0.45).expect("single ok"))
            .collect();

        let count = mix_pigments_km16_strip(&mut dst, &src, 0.45).expect("strip ok");
        assert_eq!(count, 4);
        assert_eq!(dst, expected);
    }

    #[test]
    fn km16_validates_ratio_and_endpoints() {
        let a = [180, 40, 20, 200];
        let b = [10, 140, 220, 100];
        assert_eq!(mix_pigments_km16(a, b, 0.0).expect("t=0"), a);
        assert_eq!(mix_pigments_km16(a, b, 1.0).expect("t=1"), b);
        assert_eq!(
            mix_pigments_km16(a, b, f32::NAN),
            Err(DrawingCoreError::InvalidParameter { name: "ratio" })
        );
    }
}
