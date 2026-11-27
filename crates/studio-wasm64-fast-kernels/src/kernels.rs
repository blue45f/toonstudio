//! ToonStudio Wave-54 `fast-anything` 외곽 루프 4종 순수 안전 Rust 커널.
//!
//! 1. `meijster_edt2d_sq_f32`: Meijster 2-Pass 정확 2D 유클리드 제곱 거리 변환 (`O(W*H)`)
//! 2. `sdf_gap_close_flood_fill_u8`: 거리장 기반 틈새 봉합 4-연결 시드 채색 + `1px` Halo-Free 트래핑
//! 3. `pack_bc1_tile_rgba_to_64bit`: `4x4` 블록 주성분(PCA) 엔드포인트 `RGB565` + 32비트 2비트 인덱스 패킹
//! 4. `oil_bristle_stamp_accumulate_rgba`: 오일·수채 브러시 스탬프 외곽 누적 블렌딩 (색상 픽업·습도 감쇠·알파 합성)
//!
//! 모든 핵심 연산은 100% 안전 Rust(`#![forbid(unsafe_code)]`)이며,
//! JavaScript 레퍼런스 오라클과 비트 단위 0-diff 동등성을 보장한다.

#![forbid(unsafe_code)]

use alloc::vec;
use alloc::vec::Vec;

/// 커널 실행 오류 모델 (panic 없는 안정적 오류 코드 변환용).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FastKernelError {
    InvalidDimensions,
    BufferLengthMismatch,
    InvalidParameter,
    OutOfBoundsSeed,
}

#[inline]
fn checked_pixel_count(width: u32, height: u32) -> Result<usize, FastKernelError> {
    if width == 0 || height == 0 {
        return Err(FastKernelError::InvalidDimensions);
    }
    let w = usize::try_from(width).map_err(|_| FastKernelError::InvalidDimensions)?;
    let h = usize::try_from(height).map_err(|_| FastKernelError::InvalidDimensions)?;
    w.checked_mul(h).ok_or(FastKernelError::InvalidDimensions)
}

#[inline]
fn meijster_sep(i: i64, u: i64, gi: i64, gu: i64) -> i64 {
    // Meijster et al. (2000) 식 (3): 수학적 내림 나눗셈(div_euclid)으로 음수 분자도 정확히 일치시킨다.
    let num = (u * u - i * i) + (gu * gu - gi * gi);
    let den = 2 * (u - i);
    num.div_euclid(den)
}

/// 1. Meijster 2-Pass 정확 2D 유클리드 제곱 거리 변환 (`O(W*H)`).
///
/// - 입력 `obstacle_mask`: `0` = 빈 공간, `!= 0` = 장애물(거리 0).
/// - 출력 `out_dist_sq`: 각 픽셀에서 가장 가까운 장애물까지의 유클리드 거리 제곱(`f32`).
///   장애물이 전혀 없는 영상은 `(width + height)^2`로 결정론적 초기화된다.
pub fn meijster_edt2d_sq_f32(
    obstacle_mask: &[u8],
    width: u32,
    height: u32,
    out_dist_sq: &mut [f32],
) -> Result<usize, FastKernelError> {
    let pixel_count = checked_pixel_count(width, height)?;
    if obstacle_mask.len() != pixel_count || out_dist_sq.len() != pixel_count {
        return Err(FastKernelError::BufferLengthMismatch);
    }
    let w = width as usize;
    let h = height as usize;
    let inf = (width as i64) + (height as i64);
    let inf_i32 = i32::try_from(inf).map_err(|_| FastKernelError::InvalidDimensions)?;

    // Pass 1: 행 우선(row-major) 수직 1D 맨해튼 거리 스캔 (캐시 친화적 + 정확 동일 결과).
    let mut g = vec![0i32; pixel_count];

    // Top-to-bottom 스캔
    for x in 0..w {
        g[x] = if obstacle_mask[x] != 0 { 0 } else { inf_i32 };
    }
    for y in 1..h {
        let row = y * w;
        let prev = (y - 1) * w;
        for x in 0..w {
            if obstacle_mask[row + x] != 0 {
                g[row + x] = 0;
            } else {
                let candidate = g[prev + x].saturating_add(1);
                g[row + x] = if candidate < inf_i32 {
                    candidate
                } else {
                    inf_i32
                };
            }
        }
    }

    // Bottom-to-top 스캔
    for y in (0..h.saturating_sub(1)).rev() {
        let row = y * w;
        let next = (y + 1) * w;
        for x in 0..w {
            let candidate = g[next + x].saturating_add(1);
            if candidate < g[row + x] {
                g[row + x] = candidate;
            }
        }
    }

    // Pass 2: 각 행에 대해 포물선 하한 포락선(lower envelope) O(W) 스캔.
    let mut s = vec![0usize; w];
    let mut t = vec![0i64; w];

    for y in 0..h {
        let row = y * w;
        let g_row = &g[row..row + w];
        let out_row = &mut out_dist_sq[row..row + w];

        let mut q: usize = 0;
        s[0] = 0;
        t[0] = 0;

        for u in 1..w {
            let u64 = u as i64;
            let gu = i64::from(g_row[u]);
            while {
                let sq = s[q] as i64;
                let gsq = i64::from(g_row[s[q]]);
                let tq = t[q];
                let d_prev = (tq - sq) * (tq - sq) + gsq * gsq;
                let d_curr = (tq - u64) * (tq - u64) + gu * gu;
                d_prev > d_curr
            } {
                if q == 0 {
                    q = usize::MAX;
                    break;
                }
                q -= 1;
            }

            if q == usize::MAX {
                q = 0;
                s[0] = u;
                t[0] = 0;
            } else {
                let sq = s[q] as i64;
                let gsq = i64::from(g_row[s[q]]);
                let sep = 1 + meijster_sep(sq, u64, gsq, gu);
                if sep < (w as i64) {
                    q += 1;
                    s[q] = u;
                    t[q] = sep;
                }
            }
        }

        for u in (0..w).rev() {
            let u64 = u as i64;
            while q > 0 && u64 < t[q] {
                q -= 1;
            }
            let sq = s[q] as i64;
            let dx = u64 - sq;
            let dy = i64::from(g_row[s[q]]);
            let dist_sq = if dy >= inf {
                inf * inf
            } else {
                dx * dx + dy * dy
            };
            out_row[u] = dist_sq as f32;
        }
    }

    Ok(pixel_count)
}

/// 2. 거리장 기반 틈새 봉합 4-연결 시드 채색 + `1px` Halo-Free 트래핑 외곽 루프.
///
/// - 입력 `lineart_mask`: `!= 0` 선화(장애물), `0` 채색 가능 영역.
/// - 입력 `dist_sq`: `meijster_edt2d_sq_f32`가 산출한 제곱 거리장.
/// - 출력 `out_fill`: `0` = 미채색, `1` = 본체 채색 영역, `2` = 선화 경계 `1px` Halo-Free 트래핑 영역.
/// - 반환값: 채색된 총 픽셀 수 (`out_fill[i] != 0`).
#[allow(clippy::too_many_arguments)]
pub fn sdf_gap_close_flood_fill_u8(
    lineart_mask: &[u8],
    dist_sq: &[f32],
    width: u32,
    height: u32,
    seed_x: u32,
    seed_y: u32,
    gap_close_radius_px: f32,
    out_fill: &mut [u8],
) -> Result<usize, FastKernelError> {
    let pixel_count = checked_pixel_count(width, height)?;
    if lineart_mask.len() != pixel_count
        || dist_sq.len() != pixel_count
        || out_fill.len() != pixel_count
    {
        return Err(FastKernelError::BufferLengthMismatch);
    }
    if seed_x >= width || seed_y >= height {
        return Err(FastKernelError::OutOfBoundsSeed);
    }
    if !gap_close_radius_px.is_finite() || gap_close_radius_px < 0.0 {
        return Err(FastKernelError::InvalidParameter);
    }

    out_fill.fill(0);

    let w = width as usize;
    let h = height as usize;
    let seed_idx = (seed_y as usize) * w + (seed_x as usize);
    if lineart_mask[seed_idx] != 0 {
        return Ok(0);
    }

    let threshold_sq = gap_close_radius_px * gap_close_radius_px;
    if dist_sq[seed_idx] < threshold_sq {
        return Ok(0);
    }

    // Phase A: 침식된 안전 코어(`dist_sq >= R^2`) 내부 4-연결 BFS.
    let mut queue: Vec<u32> = Vec::with_capacity(pixel_count.min(65_536));
    out_fill[seed_idx] = 1;
    queue.push(seed_idx as u32);

    let mut head: usize = 0;
    while head < queue.len() {
        let cur = queue[head] as usize;
        head += 1;
        let x = cur % w;
        let y = cur / w;

        if x > 0 {
            let n = cur - 1;
            if out_fill[n] == 0 && lineart_mask[n] == 0 && dist_sq[n] >= threshold_sq {
                out_fill[n] = 1;
                queue.push(n as u32);
            }
        }
        if x + 1 < w {
            let n = cur + 1;
            if out_fill[n] == 0 && lineart_mask[n] == 0 && dist_sq[n] >= threshold_sq {
                out_fill[n] = 1;
                queue.push(n as u32);
            }
        }
        if y > 0 {
            let n = cur - w;
            if out_fill[n] == 0 && lineart_mask[n] == 0 && dist_sq[n] >= threshold_sq {
                out_fill[n] = 1;
                queue.push(n as u32);
            }
        }
        if y + 1 < h {
            let n = cur + w;
            if out_fill[n] == 0 && lineart_mask[n] == 0 && dist_sq[n] >= threshold_sq {
                out_fill[n] = 1;
                queue.push(n as u32);
            }
        }
    }

    // Phase B: `ceil(R)` 단계 제한 4-연결 지오데식 팽창으로 내벽 경계 복구 (틈새 누출 차단).
    let expand_steps = ceil_nonneg_f32(gap_close_radius_px);
    if expand_steps > 0 {
        let mut frontier: Vec<u32> = Vec::new();
        for &idx_u32 in &queue {
            let idx = idx_u32 as usize;
            let x = idx % w;
            let y = idx / w;
            let has_open_neighbor = (x > 0 && out_fill[idx - 1] == 0 && lineart_mask[idx - 1] == 0)
                || (x + 1 < w && out_fill[idx + 1] == 0 && lineart_mask[idx + 1] == 0)
                || (y > 0 && out_fill[idx - w] == 0 && lineart_mask[idx - w] == 0)
                || (y + 1 < h && out_fill[idx + w] == 0 && lineart_mask[idx + w] == 0);
            if has_open_neighbor {
                frontier.push(idx_u32);
            }
        }

        let mut next_frontier: Vec<u32> = Vec::new();
        for _step in 0..expand_steps {
            if frontier.is_empty() {
                break;
            }
            next_frontier.clear();
            for &idx_u32 in &frontier {
                let idx = idx_u32 as usize;
                let x = idx % w;
                let y = idx / w;

                if x > 0 {
                    let n = idx - 1;
                    if out_fill[n] == 0 && lineart_mask[n] == 0 {
                        out_fill[n] = 1;
                        next_frontier.push(n as u32);
                    }
                }
                if x + 1 < w {
                    let n = idx + 1;
                    if out_fill[n] == 0 && lineart_mask[n] == 0 {
                        out_fill[n] = 1;
                        next_frontier.push(n as u32);
                    }
                }
                if y > 0 {
                    let n = idx - w;
                    if out_fill[n] == 0 && lineart_mask[n] == 0 {
                        out_fill[n] = 1;
                        next_frontier.push(n as u32);
                    }
                }
                if y + 1 < h {
                    let n = idx + w;
                    if out_fill[n] == 0 && lineart_mask[n] == 0 {
                        out_fill[n] = 1;
                        next_frontier.push(n as u32);
                    }
                }
            }
            core::mem::swap(&mut frontier, &mut next_frontier);
        }
    }

    // Phase C: 1px Halo-Free 트래핑 외곽 루프 (채색 본체 `1`과 4-연결로 맞닿은 선화 픽셀을 `2`로 마킹).
    let mut filled_count: usize = 0;
    for y in 0..h {
        let row = y * w;
        for x in 0..w {
            let idx = row + x;
            if out_fill[idx] == 1 {
                filled_count += 1;
            } else if lineart_mask[idx] != 0 {
                let touches_core = (x > 0 && out_fill[idx - 1] == 1)
                    || (x + 1 < w && out_fill[idx + 1] == 1)
                    || (y > 0 && out_fill[idx - w] == 1)
                    || (y + 1 < h && out_fill[idx + w] == 1);
                if touches_core {
                    out_fill[idx] = 2;
                    filled_count += 1;
                }
            }
        }
    }

    Ok(filled_count)
}

#[inline]
fn ceil_nonneg_f32(v: f32) -> u32 {
    if v <= 0.0 {
        return 0;
    }
    let trunc = v as u32;
    if (trunc as f32) < v {
        trunc.saturating_add(1)
    } else {
        trunc
    }
}

#[inline]
fn pack_rgb565(r: i32, g: i32, b: i32) -> u16 {
    let r5 = ((r * 31 + 127) / 255) as u16;
    let g6 = ((g * 63 + 127) / 255) as u16;
    let b5 = ((b * 31 + 127) / 255) as u16;
    (r5 << 11) | (g6 << 5) | b5
}

#[inline]
fn unpack_rgb565(c: u16) -> (i32, i32, i32) {
    let r5 = ((c >> 11) & 0x1F) as i32;
    let g6 = ((c >> 5) & 0x3F) as i32;
    let b5 = (c & 0x1F) as i32;
    ((r5 << 3) | (r5 >> 2), (g6 << 2) | (g6 >> 4), (b5 << 3) | (b5 >> 2))
}

/// 3. `256x256` 등 4배수 RGBA8 타일을 BC1(DXT1) 64비트 블록 스트림으로 패킹하는 외곽 루프.
///
/// 각 `4x4` 블록마다 3x3 공분산 행렬의 주성분 축(정수 power iteration 4회)으로 엔드포인트를 추출하고
/// `RGB565` 두 엔드포인트 + 32비트 2비트 인덱스(총 8바이트 = 64비트)로 리틀엔디언 패킹한다.
/// 순수 정수 연산만 사용해 JS 레퍼런스 오라클과 비트 단위 0-diff를 보장한다.
pub fn pack_bc1_tile_rgba_to_64bit(
    rgba: &[u8],
    width: u32,
    height: u32,
    out_bc1_bytes: &mut [u8],
) -> Result<usize, FastKernelError> {
    if width == 0 || height == 0 || (width & 3) != 0 || (height & 3) != 0 {
        return Err(FastKernelError::InvalidDimensions);
    }
    let pixel_count = checked_pixel_count(width, height)?;
    let expected_rgba = pixel_count
        .checked_mul(4)
        .ok_or(FastKernelError::InvalidDimensions)?;
    let blocks_x = (width / 4) as usize;
    let blocks_y = (height / 4) as usize;
    let block_count = blocks_x
        .checked_mul(blocks_y)
        .ok_or(FastKernelError::InvalidDimensions)?;
    let expected_out = block_count
        .checked_mul(8)
        .ok_or(FastKernelError::InvalidDimensions)?;

    if rgba.len() != expected_rgba || out_bc1_bytes.len() != expected_out {
        return Err(FastKernelError::BufferLengthMismatch);
    }

    let w = width as usize;
    let mut br = [0i32; 16];
    let mut bg = [0i32; 16];
    let mut bb = [0i32; 16];
    let mut out_offset: usize = 0;

    for by in 0..blocks_y {
        let base_y = by * 4;
        for bx in 0..blocks_x {
            let base_x = bx * 4;
            let mut sum_r: i32 = 0;
            let mut sum_g: i32 = 0;
            let mut sum_b: i32 = 0;
            let mut min_r: i32 = 255;
            let mut min_g: i32 = 255;
            let mut min_b: i32 = 255;
            let mut max_r: i32 = 0;
            let mut max_g: i32 = 0;
            let mut max_b: i32 = 0;

            let mut pi = 0usize;
            for ly in 0..4 {
                let row_off = ((base_y + ly) * w + base_x) * 4;
                for lx in 0..4 {
                    let off = row_off + lx * 4;
                    let r = i32::from(rgba[off]);
                    let g = i32::from(rgba[off + 1]);
                    let b = i32::from(rgba[off + 2]);
                    br[pi] = r;
                    bg[pi] = g;
                    bb[pi] = b;
                    sum_r += r;
                    sum_g += g;
                    sum_b += b;
                    if r < min_r {
                        min_r = r;
                    }
                    if r > max_r {
                        max_r = r;
                    }
                    if g < min_g {
                        min_g = g;
                    }
                    if g > max_g {
                        max_g = g;
                    }
                    if b < min_b {
                        min_b = b;
                    }
                    if b > max_b {
                        max_b = b;
                    }
                    pi += 1;
                }
            }

            // 단색 블록 고속 경로
            if min_r == max_r && min_g == max_g && min_b == max_b {
                let c = pack_rgb565(min_r, min_g, min_b);
                let c_bytes = c.to_le_bytes();
                out_bc1_bytes[out_offset] = c_bytes[0];
                out_bc1_bytes[out_offset + 1] = c_bytes[1];
                out_bc1_bytes[out_offset + 2] = c_bytes[0];
                out_bc1_bytes[out_offset + 3] = c_bytes[1];
                out_bc1_bytes[out_offset + 4] = 0;
                out_bc1_bytes[out_offset + 5] = 0;
                out_bc1_bytes[out_offset + 6] = 0;
                out_bc1_bytes[out_offset + 7] = 0;
                out_offset += 8;
                continue;
            }

            // 3x3 공분산 행렬 누적 (중심 좌표 x16 기준)
            let mut c_rr: i32 = 0;
            let mut c_rg: i32 = 0;
            let mut c_rb: i32 = 0;
            let mut c_gg: i32 = 0;
            let mut c_gb: i32 = 0;
            let mut c_bb: i32 = 0;
            for i in 0..16 {
                let dr = (br[i] << 4) - sum_r;
                let dg = (bg[i] << 4) - sum_g;
                let db = (bb[i] << 4) - sum_b;
                c_rr += dr * dr;
                c_rg += dr * dg;
                c_rb += dr * db;
                c_gg += dg * dg;
                c_gb += dg * db;
                c_bb += db * db;
            }
            let m_rr = c_rr >> 8;
            let m_rg = c_rg >> 8;
            let m_rb = c_rb >> 8;
            let m_gg = c_gg >> 8;
            let m_gb = c_gb >> 8;
            let m_bb = c_bb >> 8;

            // 주성분 고유벡터 추정 (정수 power iteration 4회)
            let mut ax = max_r - min_r;
            let mut ay = max_g - min_g;
            let mut az = max_b - min_b;
            for _ in 0..4 {
                let nx = m_rr * ax + m_rg * ay + m_rb * az;
                let ny = m_rg * ax + m_gg * ay + m_gb * az;
                let nz = m_rb * ax + m_gb * ay + m_bb * az;
                let max_abs = nx.abs().max(ny.abs()).max(nz.abs());
                if max_abs == 0 {
                    break;
                }
                let max_abs64 = i64::from(max_abs);
                ax = ((i64::from(nx) * 256) / max_abs64) as i32;
                ay = ((i64::from(ny) * 256) / max_abs64) as i32;
                az = ((i64::from(nz) * 256) / max_abs64) as i32;
            }

            // 주성분 축 투영으로 최소/최대 엔드포인트 픽셀 선택
            let mut min_proj = i32::MAX;
            let mut max_proj = i32::MIN;
            let mut min_idx: usize = 0;
            let mut max_idx: usize = 0;
            for i in 0..16 {
                let proj = br[i] * ax + bg[i] * ay + bb[i] * az;
                if proj < min_proj {
                    min_proj = proj;
                    min_idx = i;
                }
                if proj > max_proj {
                    max_proj = proj;
                    max_idx = i;
                }
            }

            let mut c0 = pack_rgb565(br[max_idx], bg[max_idx], bb[max_idx]);
            let mut c1 = pack_rgb565(br[min_idx], bg[min_idx], bb[min_idx]);
            if c0 < c1 {
                core::mem::swap(&mut c0, &mut c1);
            }

            let indices: u32 = if c0 == c1 {
                0
            } else {
                let (r0, g0, b0) = unpack_rgb565(c0);
                let (r1, g1, b1) = unpack_rgb565(c1);
                let pal_r = [
                    r0,
                    r1,
                    (2 * r0 + r1 + 1) / 3,
                    (r0 + 2 * r1 + 1) / 3,
                ];
                let pal_g = [
                    g0,
                    g1,
                    (2 * g0 + g1 + 1) / 3,
                    (g0 + 2 * g1 + 1) / 3,
                ];
                let pal_b = [
                    b0,
                    b1,
                    (2 * b0 + b1 + 1) / 3,
                    (b0 + 2 * b1 + 1) / 3,
                ];

                let mut packed: u32 = 0;
                for i in 0..16 {
                    let r = br[i];
                    let g = bg[i];
                    let b = bb[i];
                    let mut best_k: u32 = 0;
                    let mut best_d = i32::MAX;
                    for k in 0..4 {
                        let dr = r - pal_r[k];
                        let dg = g - pal_g[k];
                        let db = b - pal_b[k];
                        let d = dr * dr + dg * dg + db * db;
                        if d < best_d {
                            best_d = d;
                            best_k = k as u32;
                        }
                    }
                    packed |= best_k << (i * 2);
                }
                packed
            };

            let c0_bytes = c0.to_le_bytes();
            let c1_bytes = c1.to_le_bytes();
            let idx_bytes = indices.to_le_bytes();
            out_bc1_bytes[out_offset] = c0_bytes[0];
            out_bc1_bytes[out_offset + 1] = c0_bytes[1];
            out_bc1_bytes[out_offset + 2] = c1_bytes[0];
            out_bc1_bytes[out_offset + 3] = c1_bytes[1];
            out_bc1_bytes[out_offset + 4] = idx_bytes[0];
            out_bc1_bytes[out_offset + 5] = idx_bytes[1];
            out_bc1_bytes[out_offset + 6] = idx_bytes[2];
            out_bc1_bytes[out_offset + 7] = idx_bytes[3];
            out_offset += 8;
        }
    }

    Ok(block_count)
}

/// 오일·수채 브러시 스탬프 외곽 누적 설정 파라미터.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OilBristleConfig {
    pub brush_r: u8,
    pub brush_g: u8,
    pub brush_b: u8,
    pub brush_a: u8,
    pub pickup_q8: u32,
    pub wetness_q8: u32,
    pub decay_q8: u32,
    pub hardness_q8: u32,
    pub bristle_count: u32,
}

/// 4. 오일·수채 브러시 스탬프 외곽 누적 블렌딩 루프.
///
/// - `canvas_rgba`: `width * height * 4` 제자리 누적 RGBA8 캔버스.
/// - `stamps`: 스탬프당 4개 `f32` (`[cx, cy, radius_px, pressure]`)로 패킹된 연속 스트로크 배열.
/// - 각 스탬프마다 브러시 저장조(색상 픽업)·습도 감쇠·강모 결 변조·Porter-Duff Source-Over 알파 합성을 수행한다.
/// - 반환값: 실제 합성된 픽셀 누적 횟수.
pub fn oil_bristle_stamp_accumulate_rgba(
    canvas_rgba: &mut [u8],
    width: u32,
    height: u32,
    stamps: &[f32],
    config: OilBristleConfig,
) -> Result<usize, FastKernelError> {
    let pixel_count = checked_pixel_count(width, height)?;
    let expected_rgba = pixel_count
        .checked_mul(4)
        .ok_or(FastKernelError::InvalidDimensions)?;
    if canvas_rgba.len() != expected_rgba || (stamps.len() & 3) != 0 {
        return Err(FastKernelError::BufferLengthMismatch);
    }

    let w = width as i32;
    let h = height as i32;
    let stamp_count = stamps.len() / 4;
    let pickup_q8 = config.pickup_q8.min(256) as i32;
    let decay_q8 = config.decay_q8.min(256) as i32;
    let hardness_q8 = config.hardness_q8.min(256) as i32;
    let bristle_count = config.bristle_count.clamp(1, 16) as i32;
    let brush_a = i32::from(config.brush_a);

    let mut load_r_q8 = i32::from(config.brush_r) << 8;
    let mut load_g_q8 = i32::from(config.brush_g) << 8;
    let mut load_b_q8 = i32::from(config.brush_b) << 8;
    let mut wet_q8 = config.wetness_q8.min(256) as i32;

    let mut prev_cx_q4: i32 = 0;
    let mut prev_cy_q4: i32 = 0;
    let mut has_prev = false;
    let mut total_blended: usize = 0;

    for s in 0..stamp_count {
        if wet_q8 <= 0 {
            break;
        }
        let base = s * 4;
        let cx_f = stamps[base];
        let cy_f = stamps[base + 1];
        let rad_f = stamps[base + 2];
        let pres_f = stamps[base + 3];
        if !cx_f.is_finite() || !cy_f.is_finite() || !rad_f.is_finite() || !pres_f.is_finite() {
            return Err(FastKernelError::InvalidParameter);
        }

        let cx_q4 = (cx_f * 16.0) as i32;
        let cy_q4 = (cy_f * 16.0) as i32;
        let radius_q4 = ((rad_f * 16.0) as i32).max(0);
        let pressure_q8 = ((pres_f * 256.0) as i32).clamp(0, 256);

        // 스트로크 진행 법선 벡터(정수 방향 코사인) 산출
        let (norm_x, norm_y) = if has_prev {
            let mv_x = cx_q4 - prev_cx_q4;
            let mv_y = cy_q4 - prev_cy_q4;
            let mag = mv_x.abs().max(mv_y.abs());
            if mag > 0 {
                ((-mv_y * 16) / mag, (mv_x * 16) / mag)
            } else {
                (16, 0)
            }
        } else {
            (16, 0)
        };
        prev_cx_q4 = cx_q4;
        prev_cy_q4 = cy_q4;
        has_prev = true;

        if radius_q4 <= 0 || pressure_q8 <= 0 || brush_a <= 0 {
            wet_q8 = (wet_q8 * decay_q8) >> 8;
            continue;
        }

        let r_sq_q8 = i64::from(radius_q4) * i64::from(radius_q4);
        let rad_px = (radius_q4 + 15) >> 4;
        let min_x = ((cx_q4 >> 4) - rad_px - 1).max(0);
        let max_x = ((cx_q4 >> 4) + rad_px + 1).min(w - 1);
        let min_y = ((cy_q4 >> 4) - rad_px - 1).max(0);
        let max_y = ((cy_q4 >> 4) + rad_px + 1).min(h - 1);

        if min_x > max_x || min_y > max_y {
            wet_q8 = (wet_q8 * decay_q8) >> 8;
            continue;
        }

        let src_r = (load_r_q8 >> 8).clamp(0, 255);
        let src_g = (load_g_q8 >> 8).clamp(0, 255);
        let src_b = (load_b_q8 >> 8).clamp(0, 255);
        let mix_w = (pickup_q8 * wet_q8) >> 8;

        let mut sample_r: i64 = 0;
        let mut sample_g: i64 = 0;
        let mut sample_b: i64 = 0;
        let mut sample_w: i64 = 0;

        for py in min_y..=max_y {
            let dy_q4 = (py << 4) + 8 - cy_q4;
            let dy_sq = i64::from(dy_q4) * i64::from(dy_q4);
            let row_off = (py as usize) * (w as usize);

            for px in min_x..=max_x {
                let dx_q4 = (px << 4) + 8 - cx_q4;
                let dist_sq_q8 = i64::from(dx_q4) * i64::from(dx_q4) + dy_sq;
                if dist_sq_q8 >= r_sq_q8 {
                    continue;
                }

                let norm_sq_q8 = ((dist_sq_q8 * 256) / r_sq_q8) as i32;
                let falloff_q8 = 256 - norm_sq_q8;
                let soft_q8 = (falloff_q8 * falloff_q8) >> 8;
                let shaped_q8 = soft_q8 + (((falloff_q8 - soft_q8) * hardness_q8) >> 8);

                let cross = (dx_q4 * norm_x + dy_q4 * norm_y).abs();
                let wave = ((cross * bristle_count) >> 6) & 31;
                let tri = if wave < 16 { wave } else { 31 - wave };
                let bristle_q8 = 160 + tri * 6;

                let alpha_mid = (((shaped_q8 * bristle_q8) >> 8) * pressure_q8) >> 8;
                let alpha = ((alpha_mid * brush_a * wet_q8) >> 16).clamp(0, 255);
                if alpha <= 0 {
                    continue;
                }

                let off = (row_off + (px as usize)) * 4;
                let dst_r = i32::from(canvas_rgba[off]);
                let dst_g = i32::from(canvas_rgba[off + 1]);
                let dst_b = i32::from(canvas_rgba[off + 2]);
                let dst_a = i32::from(canvas_rgba[off + 3]);

                let (eff_r, eff_g, eff_b) = if dst_a > 0 {
                    let w_pick = (alpha * dst_a) >> 8;
                    if w_pick > 0 {
                        sample_r += i64::from(dst_r * w_pick);
                        sample_g += i64::from(dst_g * w_pick);
                        sample_b += i64::from(dst_b * w_pick);
                        sample_w += i64::from(w_pick);
                    }
                    (
                        (src_r + (((dst_r - src_r) * mix_w) >> 9)).clamp(0, 255),
                        (src_g + (((dst_g - src_g) * mix_w) >> 9)).clamp(0, 255),
                        (src_b + (((dst_b - src_b) * mix_w) >> 9)).clamp(0, 255),
                    )
                } else {
                    (src_r, src_g, src_b)
                };

                let inv_a = 255 - alpha;
                let out_a = (alpha + ((dst_a * inv_a + 127) / 255)).clamp(1, 255);
                let denom = out_a * 255;
                let half = denom >> 1;
                let out_r = ((eff_r * alpha * 255 + dst_r * dst_a * inv_a + half) / denom).clamp(0, 255);
                let out_g = ((eff_g * alpha * 255 + dst_g * dst_a * inv_a + half) / denom).clamp(0, 255);
                let out_b = ((eff_b * alpha * 255 + dst_b * dst_a * inv_a + half) / denom).clamp(0, 255);

                canvas_rgba[off] = out_r as u8;
                canvas_rgba[off + 1] = out_g as u8;
                canvas_rgba[off + 2] = out_b as u8;
                canvas_rgba[off + 3] = out_a as u8;
                total_blended += 1;
            }
        }

        // 브러시 저장조 색상 픽업 갱신
        if sample_w > 0 && pickup_q8 > 0 {
            let avg_r_q8 = ((sample_r * 256) / sample_w) as i32;
            let avg_g_q8 = ((sample_g * 256) / sample_w) as i32;
            let avg_b_q8 = ((sample_b * 256) / sample_w) as i32;
            load_r_q8 += ((avg_r_q8 - load_r_q8) * mix_w) >> 8;
            load_g_q8 += ((avg_g_q8 - load_g_q8) * mix_w) >> 8;
            load_b_q8 += ((avg_b_q8 - load_b_q8) * mix_w) >> 8;
        }

        // 스탬프당 습도 감쇠
        wet_q8 = (wet_q8 * decay_q8) >> 8;
    }

    Ok(total_blended)
}
