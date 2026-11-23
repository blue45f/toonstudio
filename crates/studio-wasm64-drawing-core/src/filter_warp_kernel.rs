//! 고속 필터 및 2D 메쉬 변형 커널.
//!
//! 1. 선택 경계 외부 번짐 0% 분리형 가우시안 블러 (`gaussian_blur_rgba_masked`)
//! 2. 언샤프 마스크 (`unsharp_mask_rgba`)
//! 3. 다중 핀 MLS/ARAP 강체 2D 메쉬 워프 (`warp_mesh_rigid_mls`)

use crate::{checked_pixel_count, checked_rgba_len, DrawingCoreError};

/// 다중 핀 2D 메쉬 변형 제어점.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WarpPin {
    /// 변형 전 기준(rest) 위치 `[x, y]`.
    pub rest: [f32; 2],
    /// 변형 후 목표(target) 위치 `[x, y]`.
    pub target: [f32; 2],
    /// 핀 영향 가중치(기본 1.0, 양수).
    pub weight: f32,
}

impl WarpPin {
    /// 기본 가중치(`1.0`)로 워프 핀을 생성한다.
    #[must_use]
    pub fn new(rest: [f32; 2], target: [f32; 2]) -> Self {
        Self {
            rest,
            target,
            weight: 1.0,
        }
    }
}

fn build_gaussian_kernel_1d(sigma: f32) -> Vec<f32> {
    let radius = ((sigma * 3.0).ceil() as usize).clamp(1, 64);
    let len = radius * 2 + 1;
    let mut weights = vec![0.0_f32; len];
    let inv_two_sigma_sq = 1.0 / (2.0 * sigma * sigma);
    let mut sum = 0.0_f32;
    for (i, slot) in weights.iter_mut().enumerate() {
        let d = i as f32 - radius as f32;
        let w = (-d * d * inv_two_sigma_sq).exp();
        *slot = w;
        sum += w;
    }
    if sum > 0.0 {
        for slot in &mut weights {
            *slot /= sum;
        }
    }
    weights
}

/// 선택 영역 경계 외부 번짐 0%를 보장하는 분리형(수평+수직) 가우시안 블러 커널.
///
/// `selection_mask`가 주어지면:
/// - 마스크 값이 `0`인 외부 픽셀은 원본 RGBA를 비트 단위로 그대로 유지한다(외부 번짐 0%).
/// - 마스크 값이 `> 0`인 내부 픽셀은 마스크 가중치를 곱한 커널로만 정규화 합성해
///   선택 경계 바깥 색상이 안쪽으로 유입되지 않도록 차단한다.
pub fn gaussian_blur_rgba_masked(
    rgba: &[u8],
    width: u32,
    height: u32,
    sigma: f32,
    selection_mask: Option<&[u8]>,
) -> Result<Vec<u8>, DrawingCoreError> {
    let pixel_count = checked_pixel_count(width, height)?;
    let expected_rgba = checked_rgba_len(width, height)?;
    if rgba.len() != expected_rgba {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: expected_rgba,
            actual: rgba.len(),
        });
    }
    if let Some(mask) = selection_mask {
        if mask.len() != pixel_count {
            return Err(DrawingCoreError::BufferLengthMismatch {
                expected: pixel_count,
                actual: mask.len(),
            });
        }
    }
    if !sigma.is_finite() || sigma < 0.0 {
        return Err(DrawingCoreError::InvalidParameter { name: "sigma" });
    }
    if sigma < 1e-4 {
        return Ok(rgba.to_vec());
    }

    let w = width as usize;
    let h = height as usize;
    let kernel = build_gaussian_kernel_1d(sigma);
    let radius = kernel.len() / 2;

    // 1단계: 프리멀티플라이드 알파 float 버퍼 변환
    let mut premul = vec![0.0_f32; expected_rgba];
    for i in 0..pixel_count {
        let base = i * 4;
        let a = f32::from(rgba[base + 3]) / 255.0;
        premul[base] = f32::from(rgba[base]) * a;
        premul[base + 1] = f32::from(rgba[base + 1]) * a;
        premul[base + 2] = f32::from(rgba[base + 2]) * a;
        premul[base + 3] = f32::from(rgba[base + 3]);
    }

    // 2단계: 수평 패스 (선택 마스크 가중 정규화)
    let mut horiz = vec![0.0_f32; expected_rgba];
    for y in 0..h {
        let row_offset = y * w;
        for x in 0..w {
            let px_idx = row_offset + x;
            let dst_base = px_idx * 4;
            if let Some(mask) = selection_mask {
                if mask[px_idx] == 0 {
                    horiz[dst_base..dst_base + 4].copy_from_slice(&premul[dst_base..dst_base + 4]);
                    continue;
                }
            }

            let mut acc_r = 0.0_f32;
            let mut acc_g = 0.0_f32;
            let mut acc_b = 0.0_f32;
            let mut acc_a = 0.0_f32;
            let mut w_sum = 0.0_f32;

            for (k_idx, &kw) in kernel.iter().enumerate() {
                let offset = k_idx as isize - radius as isize;
                let sx = (x as isize + offset).clamp(0, (w - 1) as isize) as usize;
                let s_idx = row_offset + sx;
                let m_weight = match selection_mask {
                    Some(mask) => {
                        let mv = mask[s_idx];
                        if mv == 0 {
                            continue;
                        }
                        f32::from(mv) / 255.0
                    }
                    None => 1.0,
                };
                let weight = kw * m_weight;
                let s_base = s_idx * 4;
                acc_r += premul[s_base] * weight;
                acc_g += premul[s_base + 1] * weight;
                acc_b += premul[s_base + 2] * weight;
                acc_a += premul[s_base + 3] * weight;
                w_sum += weight;
            }

            if w_sum > 0.0 {
                let inv = 1.0 / w_sum;
                horiz[dst_base] = acc_r * inv;
                horiz[dst_base + 1] = acc_g * inv;
                horiz[dst_base + 2] = acc_b * inv;
                horiz[dst_base + 3] = acc_a * inv;
            } else {
                horiz[dst_base..dst_base + 4].copy_from_slice(&premul[dst_base..dst_base + 4]);
            }
        }
    }

    // 3단계: 수직 패스 + 언프리멀티플라이 RGBA8 출력
    let mut output = vec![0u8; expected_rgba];
    for y in 0..h {
        for x in 0..w {
            let px_idx = y * w + x;
            let dst_base = px_idx * 4;
            let center_mask = selection_mask.map_or(255u8, |m| m[px_idx]);
            if center_mask == 0 {
                output[dst_base..dst_base + 4].copy_from_slice(&rgba[dst_base..dst_base + 4]);
                continue;
            }

            let mut acc_r = 0.0_f32;
            let mut acc_g = 0.0_f32;
            let mut acc_b = 0.0_f32;
            let mut acc_a = 0.0_f32;
            let mut w_sum = 0.0_f32;

            for (k_idx, &kw) in kernel.iter().enumerate() {
                let offset = k_idx as isize - radius as isize;
                let sy = (y as isize + offset).clamp(0, (h - 1) as isize) as usize;
                let s_idx = sy * w + x;
                let m_weight = match selection_mask {
                    Some(mask) => {
                        let mv = mask[s_idx];
                        if mv == 0 {
                            continue;
                        }
                        f32::from(mv) / 255.0
                    }
                    None => 1.0,
                };
                let weight = kw * m_weight;
                let s_base = s_idx * 4;
                acc_r += horiz[s_base] * weight;
                acc_g += horiz[s_base + 1] * weight;
                acc_b += horiz[s_base + 2] * weight;
                acc_a += horiz[s_base + 3] * weight;
                w_sum += weight;
            }

            let (pr, pg, pb, pa) = if w_sum > 0.0 {
                let inv = 1.0 / w_sum;
                (acc_r * inv, acc_g * inv, acc_b * inv, acc_a * inv)
            } else {
                (
                    premul[dst_base],
                    premul[dst_base + 1],
                    premul[dst_base + 2],
                    premul[dst_base + 3],
                )
            };

            let alpha_norm = (pa / 255.0).clamp(0.0, 1.0);
            let (blur_r, blur_g, blur_b) = if alpha_norm > 1e-4 {
                (
                    (pr / alpha_norm).clamp(0.0, 255.0),
                    (pg / alpha_norm).clamp(0.0, 255.0),
                    (pb / alpha_norm).clamp(0.0, 255.0),
                )
            } else {
                (0.0, 0.0, 0.0)
            };
            let blur_a = pa.clamp(0.0, 255.0);

            if center_mask == 255 {
                output[dst_base] = blur_r.round() as u8;
                output[dst_base + 1] = blur_g.round() as u8;
                output[dst_base + 2] = blur_b.round() as u8;
                output[dst_base + 3] = blur_a.round() as u8;
            } else {
                let blend = f32::from(center_mask) / 255.0;
                let inv_blend = 1.0 - blend;
                output[dst_base] =
                    (f32::from(rgba[dst_base]) * inv_blend + blur_r * blend).round() as u8;
                output[dst_base + 1] =
                    (f32::from(rgba[dst_base + 1]) * inv_blend + blur_g * blend).round() as u8;
                output[dst_base + 2] =
                    (f32::from(rgba[dst_base + 2]) * inv_blend + blur_b * blend).round() as u8;
                output[dst_base + 3] =
                    (f32::from(rgba[dst_base + 3]) * inv_blend + blur_a * blend).round() as u8;
            }
        }
    }

    Ok(output)
}

/// 분리형 가우시안 기반 언샤프 마스크(Unsharp Mask) 커널.
///
/// 임계값(`threshold`) 미만의 미세한 차이에는 선명화를 적용하지 않아 평탄 영역 노이즈 증폭을 억제한다.
pub fn unsharp_mask_rgba(
    rgba: &[u8],
    width: u32,
    height: u32,
    sigma: f32,
    amount: f32,
    threshold: u8,
) -> Result<Vec<u8>, DrawingCoreError> {
    if !amount.is_finite() || amount < 0.0 {
        return Err(DrawingCoreError::InvalidParameter { name: "amount" });
    }
    let blurred = gaussian_blur_rgba_masked(rgba, width, height, sigma, None)?;
    if amount == 0.0 {
        return Ok(rgba.to_vec());
    }

    let thresh_f = f32::from(threshold);
    let mut output = vec![0u8; rgba.len()];
    let (out_chunks, _) = output.as_chunks_mut::<4>();
    let (orig_chunks, _) = rgba.as_chunks::<4>();
    let (blur_chunks, _) = blurred.as_chunks::<4>();
    for ((out_px, orig_px), blur_px) in out_chunks
        .iter_mut()
        .zip(orig_chunks.iter())
        .zip(blur_chunks.iter())
    {
        for ch in 0..3 {
            let o = f32::from(orig_px[ch]);
            let b = f32::from(blur_px[ch]);
            let diff = o - b;
            out_px[ch] = if diff.abs() >= thresh_f {
                (o + diff * amount).clamp(0.0, 255.0).round() as u8
            } else {
                orig_px[ch]
            };
        }
        out_px[3] = orig_px[3];
    }
    Ok(output)
}

/// 다중 핀 MLS/ARAP 강체(Rigid) 2D 메쉬 워프 커널 (Schaefer et al., SIGGRAPH 2006).
///
/// - 0개 핀: 항등 변환
/// - 1개 핀: 순수 평행이동
/// - 2개 이상 핀: 각 정점마다 역거리 가중치 `w_i = weight / d_i^(2*alpha)`로 최적 2D 강체 회전 `R(theta)`을
///   닫힌 해(closed-form)로 계산해 국소 비틀림과 반전을 방지한다.
pub fn warp_mesh_rigid_mls(
    vertices: &[[f32; 2]],
    pins: &[WarpPin],
    alpha: f32,
) -> Result<Vec<[f32; 2]>, DrawingCoreError> {
    if !alpha.is_finite() || alpha <= 0.0 {
        return Err(DrawingCoreError::InvalidParameter { name: "alpha" });
    }
    for v in vertices {
        if !v[0].is_finite() || !v[1].is_finite() {
            return Err(DrawingCoreError::InvalidParameter { name: "vertex" });
        }
    }
    for p in pins {
        if !p.rest[0].is_finite()
            || !p.rest[1].is_finite()
            || !p.target[0].is_finite()
            || !p.target[1].is_finite()
            || !p.weight.is_finite()
            || p.weight <= 0.0
        {
            return Err(DrawingCoreError::InvalidParameter { name: "pin" });
        }
    }

    if pins.is_empty() {
        return Ok(vertices.to_vec());
    }
    if pins.len() == 1 {
        let dx = pins[0].target[0] - pins[0].rest[0];
        let dy = pins[0].target[1] - pins[0].rest[1];
        return Ok(vertices.iter().map(|v| [v[0] + dx, v[1] + dy]).collect());
    }

    let mut weights = vec![0.0_f64; pins.len()];
    let mut deformed = Vec::with_capacity(vertices.len());
    let alpha_f64 = f64::from(alpha);

    for &v in vertices {
        let vx = f64::from(v[0]);
        let vy = f64::from(v[1]);

        let mut exact_pin_target: Option<[f32; 2]> = None;
        let mut w_sum = 0.0_f64;
        let mut p_star_x = 0.0_f64;
        let mut p_star_y = 0.0_f64;
        let mut q_star_x = 0.0_f64;
        let mut q_star_y = 0.0_f64;

        for (i, pin) in pins.iter().enumerate() {
            let dx = vx - f64::from(pin.rest[0]);
            let dy = vy - f64::from(pin.rest[1]);
            let dist_sq = dx * dx + dy * dy;
            if dist_sq < 1e-12 {
                exact_pin_target = Some(pin.target);
                break;
            }
            let wi = f64::from(pin.weight) / dist_sq.powf(alpha_f64);
            weights[i] = wi;
            w_sum += wi;
            p_star_x += wi * f64::from(pin.rest[0]);
            p_star_y += wi * f64::from(pin.rest[1]);
            q_star_x += wi * f64::from(pin.target[0]);
            q_star_y += wi * f64::from(pin.target[1]);
        }

        if let Some(target) = exact_pin_target {
            deformed.push(target);
            continue;
        }

        if w_sum <= 1e-18 {
            deformed.push(v);
            continue;
        }

        p_star_x /= w_sum;
        p_star_y /= w_sum;
        q_star_x /= w_sum;
        q_star_y /= w_sum;

        // 2D 최적 강체 회전 R(theta) = [[cos, -sin], [sin, cos]] 닫힌 해 계산
        let mut cos_num = 0.0_f64;
        let mut sin_num = 0.0_f64;
        for (i, pin) in pins.iter().enumerate() {
            let wi = weights[i];
            let ph_x = f64::from(pin.rest[0]) - p_star_x;
            let ph_y = f64::from(pin.rest[1]) - p_star_y;
            let qh_x = f64::from(pin.target[0]) - q_star_x;
            let qh_y = f64::from(pin.target[1]) - q_star_y;
            cos_num += wi * (ph_x * qh_x + ph_y * qh_y);
            sin_num += wi * (ph_x * qh_y - ph_y * qh_x);
        }

        let norm = cos_num.hypot(sin_num);
        let (cos_t, sin_t) = if norm > 1e-12 {
            (cos_num / norm, sin_num / norm)
        } else {
            (1.0, 0.0)
        };

        let vh_x = vx - p_star_x;
        let vh_y = vy - p_star_y;
        let out_x = cos_t * vh_x - sin_t * vh_y + q_star_x;
        let out_y = sin_t * vh_x + cos_t * vh_y + q_star_y;
        deformed.push([out_x as f32, out_y as f32]);
    }

    Ok(deformed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masked_gaussian_blur_has_zero_bleed_across_selection_boundary() {
        let w = 12u32;
        let h = 12u32;
        let mut rgba = vec![0u8; (w * h * 4) as usize];
        let mut mask = vec![0u8; (w * h) as usize];

        for y in 0..h as usize {
            for x in 0..w as usize {
                let idx = (y * w as usize + x) * 4;
                if x < 6 {
                    // 선택 내부: 빨강/노랑 패턴
                    rgba[idx] = 240;
                    rgba[idx + 1] = if (x + y) % 2 == 0 { 220 } else { 20 };
                    rgba[idx + 2] = 10;
                    rgba[idx + 3] = 255;
                    mask[y * w as usize + x] = 255;
                } else {
                    // 선택 외부: 순수 파랑 (절대 번지면 안 됨)
                    rgba[idx] = 0;
                    rgba[idx + 1] = 0;
                    rgba[idx + 2] = 250;
                    rgba[idx + 3] = 255;
                    mask[y * w as usize + x] = 0;
                }
            }
        }

        let blurred =
            gaussian_blur_rgba_masked(&rgba, w, h, 2.0, Some(&mask)).expect("masked blur ok");
        for y in 0..h as usize {
            for x in 0..w as usize {
                let idx = (y * w as usize + x) * 4;
                if x >= 6 {
                    // 외부 픽셀은 1비트도 변하지 않아야 한다 (외부 번짐 0%)
                    assert_eq!(&blurred[idx..idx + 4], &[0, 0, 250, 255]);
                } else {
                    // 내부 픽셀로 외부 파랑(250)이 유입되지 않아야 한다
                    assert_eq!(blurred[idx + 2], 10);
                }
            }
        }
    }

    #[test]
    fn unsharp_mask_enhances_edges_and_respects_threshold() {
        let w = 9u32;
        let h = 9u32;
        let mut rgba = vec![0u8; (w * h * 4) as usize];
        for y in 0..h as usize {
            for x in 0..w as usize {
                let idx = (y * w as usize + x) * 4;
                let v = if x < 4 { 80 } else { 180 };
                rgba[idx] = v;
                rgba[idx + 1] = v;
                rgba[idx + 2] = v;
                rgba[idx + 3] = 255;
            }
        }

        let sharpened = unsharp_mask_rgba(&rgba, w, h, 1.2, 1.5, 2).expect("unsharp ok");
        // 경계 왼쪽(x=3)은 더 어두워지고 오른쪽(x=4)은 더 밝아져 엣지 대비가 증가해야 한다.
        let left_edge = sharpened[(4 * 9 + 3) * 4];
        let right_edge = sharpened[(4 * 9 + 4) * 4];
        assert!(left_edge < 80, "왼쪽 엣지({left_edge}) < 80");
        assert!(right_edge > 180, "오른쪽 엣지({right_edge}) > 180");

        // 높은 임계값에서는 미세 변화 억제 확인
        let high_thresh = unsharp_mask_rgba(&rgba, w, h, 1.2, 1.5, 200).expect("high thresh ok");
        assert_eq!(high_thresh, rgba);
    }

    #[test]
    fn mls_rigid_warp_recovers_exact_rigid_rotation_and_pin_interpolation() {
        let angle = std::f32::consts::FRAC_PI_4; // 45도 회전
        let cos_a = angle.cos();
        let sin_a = angle.sin();
        let tx = 15.0_f32;
        let ty = -8.5_f32;
        let transform = |p: [f32; 2]| -> [f32; 2] {
            [
                p[0] * cos_a - p[1] * sin_a + tx,
                p[0] * sin_a + p[1] * cos_a + ty,
            ]
        };

        let pin_rests = [[0.0, 0.0], [100.0, 0.0], [0.0, 100.0], [100.0, 100.0]];
        let pins: Vec<WarpPin> = pin_rests
            .iter()
            .map(|&r| WarpPin::new(r, transform(r)))
            .collect();

        let vertices = vec![[0.0, 0.0], [50.0, 50.0], [25.0, 75.0], [100.0, 100.0]];
        let warped = warp_mesh_rigid_mls(&vertices, &pins, 1.0).expect("mls rigid ok");

        for (v, out) in vertices.iter().zip(warped.iter()) {
            let expected = transform(*v);
            let err = (out[0] - expected[0]).hypot(out[1] - expected[1]);
            assert!(
                err < 1e-4,
                "강체 변환 복원 오차 과다: err={err}, out={out:?}, expected={expected:?}"
            );
        }

        // 0핀 항등 · 1핀 평행이동 · 비정상 alpha 오류 확인
        assert_eq!(
            warp_mesh_rigid_mls(&vertices, &[], 1.0).expect("0 pin"),
            vertices
        );
        let one_pin = vec![WarpPin::new([10.0, 10.0], [20.0, 25.0])];
        let translated = warp_mesh_rigid_mls(&[[1.0, 2.0]], &one_pin, 1.0).expect("1 pin");
        assert_eq!(translated, vec![[11.0, 17.0]]);
        assert!(warp_mesh_rigid_mls(&vertices, &pins, 0.0).is_err());
    }
}
