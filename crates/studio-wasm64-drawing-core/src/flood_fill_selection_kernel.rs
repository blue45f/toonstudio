//! 비재귀 스캔라인 플러드 필 · 매직 완드 영역 선택 · 마칭 앤츠 윤곽선 추출 커널.
//!
//! 1. `flood_fill_rgba_scanline`: 허용 오차(`tolerance`), 선화 틈새 닫기(`gap_closing_radius`),
//!    외부 경계 마스크(`boundary_mask`)를 지원하는 0-재귀 스캔라인 채우기 커널.
//! 2. `magic_wand_select_mask` / `magic_wand_select_mask_into`: 연속 영역 8비트 선택 마스크
//!    (`0 | 255` 또는 경계 안티앨리어싱)와 갱신 사각형(`DirtyRect`) 산출 커널.
//! 3. `extract_marching_ants_segments`: 선택 마스크에서 동일 선상 인접 변을 병합한
//!    방향성 마칭 앤츠 선분 `(x0, y0, x1, y1)` 추출 커널.

use crate::{checked_pixel_count, checked_rgba_len, DirtyRect, DrawingCoreError};

/// 형태학적 틈새 닫기(Close Gap) 최대 반경(px).
pub const MAX_GAP_CLOSING_RADIUS: u8 = 8;

/// 빈 갱신 영역을 나타내는 `DirtyRect`.
pub const EMPTY_DIRTY_RECT: DirtyRect = DirtyRect {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
};

/// 스캔라인 플러드 필 설정.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FloodFillConfig {
    /// 시드 픽셀과의 채널별(R, G, B, A) 최대 허용 오차(`0..=255`).
    pub tolerance: u8,
    /// 선화 틈새 닫기 반경(`0..=8` px). `0`이면 형태학적 닫기를 건너뛴다.
    pub gap_closing_radius: u8,
}

impl Default for FloodFillConfig {
    fn default() -> Self {
        Self {
            tolerance: 16,
            gap_closing_radius: 0,
        }
    }
}

/// 스캔라인 플러드 필 실행 결과.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FloodFillResult {
    /// 실제로 채워진 픽셀 수.
    pub filled_pixels: usize,
    /// 채워진 영역을 감싸는 최소 경계 사각형.
    pub dirty_rect: DirtyRect,
}

/// 매직 완드 연속 영역 선택 설정.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MagicWandConfig {
    /// 시드 픽셀과의 채널별 최대 허용 오차(`0..=255`).
    pub tolerance: u8,
    /// 선화 틈새 닫기 반경(`0..=8` px).
    pub gap_closing_radius: u8,
    /// `true`이면 선택 경계 1px 구간에 3×3 텐트 안티앨리어싱을 적용한다.
    pub anti_alias: bool,
}

impl Default for MagicWandConfig {
    fn default() -> Self {
        Self {
            tolerance: 16,
            gap_closing_radius: 0,
            anti_alias: false,
        }
    }
}

/// 매직 완드 선택 결과 (소유 마스크 버퍼 포함).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MagicWandSelection {
    pub mask: Vec<u8>,
    pub selected_pixels: usize,
    pub dirty_rect: DirtyRect,
}

/// 제로-할당 `_into` 호출용 매직 완드 통계.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MagicWandStats {
    pub selected_pixels: usize,
    pub dirty_rect: DirtyRect,
}

/// 마칭 앤츠(Marching Ants) 선택 윤곽선 1개 선분 (픽셀 격자 꼭짓점 좌표).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct MarchingAntSegment {
    pub x0: u32,
    pub y0: u32,
    pub x1: u32,
    pub y1: u32,
}

#[inline]
fn color_within_tolerance(px: [u8; 4], seed: [u8; 4], tolerance: u8) -> bool {
    let dr = px[0].abs_diff(seed[0]);
    let dg = px[1].abs_diff(seed[1]);
    let db = px[2].abs_diff(seed[2]);
    let da = px[3].abs_diff(seed[3]);
    dr.max(dg).max(db).max(da) <= tolerance
}

fn box_pass_horizontal(src: &[u8], dst: &mut [u8], w: usize, h: usize, r: usize, erode: bool) {
    let mut prefix = vec![0u32; w + 1];
    for y in 0..h {
        let row = y * w;
        prefix[0] = 0;
        for x in 0..w {
            prefix[x + 1] = prefix[x] + u32::from(src[row + x] != 0);
        }
        let out_row = &mut dst[row..row + w];
        for (x, slot) in out_row.iter_mut().enumerate() {
            let lo = x.saturating_sub(r);
            let hi = x.saturating_add(r).min(w - 1);
            let sum = prefix[hi + 1] - prefix[lo];
            let win_len = (hi - lo + 1) as u32;
            *slot = if erode {
                u8::from(sum == win_len)
            } else {
                u8::from(sum > 0)
            };
        }
    }
}

fn box_pass_vertical(src: &[u8], dst: &mut [u8], w: usize, h: usize, r: usize, erode: bool) {
    let mut col_sums = vec![0u32; w];
    let init_end = r.min(h - 1);
    for row_y in 0..=init_end {
        let row_off = row_y * w;
        for x in 0..w {
            col_sums[x] += u32::from(src[row_off + x] != 0);
        }
    }

    for y in 0..h {
        let lo = y.saturating_sub(r);
        let hi = y.saturating_add(r).min(h - 1);
        let win_len = (hi - lo + 1) as u32;
        let out_row = &mut dst[y * w..(y + 1) * w];
        if erode {
            for (slot, &sum) in out_row.iter_mut().zip(col_sums.iter()) {
                *slot = u8::from(sum == win_len);
            }
        } else {
            for (slot, &sum) in out_row.iter_mut().zip(col_sums.iter()) {
                *slot = u8::from(sum > 0);
            }
        }

        let next_y = y + 1;
        if next_y < h {
            let new_lo = next_y.saturating_sub(r);
            let new_hi = next_y.saturating_add(r).min(h - 1);
            if new_lo > lo {
                let drop_off = lo * w;
                for x in 0..w {
                    col_sums[x] -= u32::from(src[drop_off + x] != 0);
                }
            }
            if new_hi > hi {
                let add_off = new_hi * w;
                for x in 0..w {
                    col_sums[x] += u32::from(src[add_off + x] != 0);
                }
            }
        }
    }
}

/// 분리형 형태학적 닫기(`dilate(r)` → `erode(r)`)로 `<= 2*r` 폭의 선화 틈새를 외곽선 팽창 없이 봉합한다.
fn build_closed_barrier_map(
    rgba_px: &[[u8; 4]],
    boundary_mask: Option<&[u8]>,
    seed_color: [u8; 4],
    tolerance: u8,
    w: usize,
    h: usize,
    radius: usize,
) -> Vec<u8> {
    let n = w * h;
    let mut barrier = vec![0u8; n];
    if let Some(mask) = boundary_mask {
        for i in 0..n {
            if mask[i] != 0 || !color_within_tolerance(rgba_px[i], seed_color, tolerance) {
                barrier[i] = 1;
            }
        }
    } else {
        for i in 0..n {
            if !color_within_tolerance(rgba_px[i], seed_color, tolerance) {
                barrier[i] = 1;
            }
        }
    }

    let mut scratch = vec![0u8; n];
    let mut dilated = vec![0u8; n];
    // 1) 팽창(Dilate): 최대 2*r 폭의 틈새를 이어 붙인다.
    box_pass_horizontal(&barrier, &mut scratch, w, h, radius, false);
    box_pass_vertical(&scratch, &mut dilated, w, h, radius, false);
    // 2) 침식(Erode): 이어진 다리는 유지하면서 기존 선화 외곽의 불필요한 여백을 원복한다.
    box_pass_horizontal(&dilated, &mut scratch, w, h, radius, true);
    box_pass_vertical(&scratch, &mut dilated, w, h, radius, true);
    dilated
}

fn validate_common_inputs(
    rgba_len: usize,
    boundary_mask: Option<&[u8]>,
    width: u32,
    height: u32,
    seed_x: u32,
    seed_y: u32,
    gap_closing_radius: u8,
) -> Result<(usize, usize), DrawingCoreError> {
    let pixel_count = checked_pixel_count(width, height)?;
    let expected_rgba = checked_rgba_len(width, height)?;
    if rgba_len != expected_rgba {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: expected_rgba,
            actual: rgba_len,
        });
    }
    if let Some(mask) = boundary_mask {
        if mask.len() != pixel_count {
            return Err(DrawingCoreError::BufferLengthMismatch {
                expected: pixel_count,
                actual: mask.len(),
            });
        }
    }
    if seed_x >= width || seed_y >= height {
        return Err(DrawingCoreError::InvalidParameter { name: "seed" });
    }
    if gap_closing_radius > MAX_GAP_CLOSING_RADIUS {
        return Err(DrawingCoreError::InvalidParameter {
            name: "gap_closing_radius",
        });
    }
    Ok((pixel_count, expected_rgba))
}

fn scanline_fill_mask<F>(
    w: usize,
    h: usize,
    sx: usize,
    sy: usize,
    out_mask: &mut [u8],
    can_fill: F,
) -> (usize, DirtyRect)
where
    F: Fn(usize) -> bool,
{
    let seed_idx = sy * w + sx;
    if !can_fill(seed_idx) {
        return (0, EMPTY_DIRTY_RECT);
    }

    let mut stack: Vec<(usize, usize)> = Vec::with_capacity(256);
    stack.push((sx, sy));

    let mut count = 0usize;
    let mut min_x = sx;
    let mut max_x = sx;
    let mut min_y = sy;
    let mut max_y = sy;

    while let Some((px, y)) = stack.pop() {
        let row_off = y * w;
        if out_mask[row_off + px] != 0 || !can_fill(row_off + px) {
            continue;
        }

        let mut lx = px;
        while lx > 0 && out_mask[row_off + lx - 1] == 0 && can_fill(row_off + lx - 1) {
            lx -= 1;
        }
        let mut rx = px;
        while rx + 1 < w && out_mask[row_off + rx + 1] == 0 && can_fill(row_off + rx + 1) {
            rx += 1;
        }

        out_mask[row_off + lx..=row_off + rx].fill(255);
        count += rx - lx + 1;
        if lx < min_x {
            min_x = lx;
        }
        if rx > max_x {
            max_x = rx;
        }
        if y < min_y {
            min_y = y;
        }
        if y > max_y {
            max_y = y;
        }

        if y > 0 {
            let up_row = (y - 1) * w;
            let mut in_run = false;
            for x in lx..=rx {
                let idx = up_row + x;
                if out_mask[idx] == 0 && can_fill(idx) {
                    if !in_run {
                        stack.push((x, y - 1));
                        in_run = true;
                    }
                } else {
                    in_run = false;
                }
            }
        }
        if y + 1 < h {
            let dn_row = (y + 1) * w;
            let mut in_run = false;
            for x in lx..=rx {
                let idx = dn_row + x;
                if out_mask[idx] == 0 && can_fill(idx) {
                    if !in_run {
                        stack.push((x, y + 1));
                        in_run = true;
                    }
                } else {
                    in_run = false;
                }
            }
        }
    }

    if count == 0 {
        return (0, EMPTY_DIRTY_RECT);
    }
    let dirty_rect = DirtyRect {
        x: min_x as u32,
        y: min_y as u32,
        width: (max_x - min_x + 1) as u32,
        height: (max_y - min_y + 1) as u32,
    };
    (count, dirty_rect)
}

/// 비재귀 스캔라인 RGBA8 플러드 필 커널.
///
/// - `tolerance`: 시드 색상과의 채널별 최대 차이(`0..=255`).
/// - `gap_closing_radius`: `1..=8` 지정 시 형태학적 닫기(팽창 후 침식)로 선화 틈새를 봉합한다.
/// - `boundary_mask`: 선택적 8비트 경계 마스크(`0` 이외의 픽셀은 통과 불가 벽으로 취급).
#[allow(clippy::too_many_arguments)]
pub fn flood_fill_rgba_scanline(
    rgba: &mut [u8],
    width: u32,
    height: u32,
    seed_x: u32,
    seed_y: u32,
    fill_rgba: [u8; 4],
    config: &FloodFillConfig,
    boundary_mask: Option<&[u8]>,
) -> Result<FloodFillResult, DrawingCoreError> {
    let (pixel_count, _) = validate_common_inputs(
        rgba.len(),
        boundary_mask,
        width,
        height,
        seed_x,
        seed_y,
        config.gap_closing_radius,
    )?;

    let w = width as usize;
    let h = height as usize;
    let sx = seed_x as usize;
    let sy = seed_y as usize;
    let seed_idx = sy * w + sx;

    if let Some(mask) = boundary_mask {
        if mask[seed_idx] != 0 {
            return Ok(FloodFillResult {
                filled_pixels: 0,
                dirty_rect: EMPTY_DIRTY_RECT,
            });
        }
    }

    let seed_off = seed_idx * 4;
    let seed_color = [
        rgba[seed_off],
        rgba[seed_off + 1],
        rgba[seed_off + 2],
        rgba[seed_off + 3],
    ];
    if config.tolerance == 0 && seed_color == fill_rgba {
        return Ok(FloodFillResult {
            filled_pixels: 0,
            dirty_rect: EMPTY_DIRTY_RECT,
        });
    }

    let mut filled_mask = vec![0u8; pixel_count];
    let (count, dirty_rect) = {
        let (rgba_px, _) = rgba.as_chunks::<4>();
        if config.gap_closing_radius > 0 {
            let barrier = build_closed_barrier_map(
                rgba_px,
                boundary_mask,
                seed_color,
                config.tolerance,
                w,
                h,
                usize::from(config.gap_closing_radius),
            );
            scanline_fill_mask(w, h, sx, sy, &mut filled_mask, |idx| barrier[idx] == 0)
        } else if let Some(mask) = boundary_mask {
            scanline_fill_mask(w, h, sx, sy, &mut filled_mask, |idx| {
                mask[idx] == 0 && color_within_tolerance(rgba_px[idx], seed_color, config.tolerance)
            })
        } else {
            scanline_fill_mask(w, h, sx, sy, &mut filled_mask, |idx| {
                color_within_tolerance(rgba_px[idx], seed_color, config.tolerance)
            })
        }
    };

    if count == 0 {
        return Ok(FloodFillResult {
            filled_pixels: 0,
            dirty_rect: EMPTY_DIRTY_RECT,
        });
    }

    let (rgba_mut_px, _) = rgba.as_chunks_mut::<4>();
    let x0 = dirty_rect.x as usize;
    let y0 = dirty_rect.y as usize;
    let x1 = x0 + dirty_rect.width as usize;
    let y1 = y0 + dirty_rect.height as usize;
    for y in y0..y1 {
        let row_off = y * w;
        for x in x0..x1 {
            let idx = row_off + x;
            if filled_mask[idx] != 0 {
                rgba_mut_px[idx] = fill_rgba;
            }
        }
    }

    Ok(FloodFillResult {
        filled_pixels: count,
        dirty_rect,
    })
}

/// 매직 완드 연속 영역 선택 마스크를 호출자 버퍼 `out_mask`에 기록한다.
#[allow(clippy::too_many_arguments)]
pub fn magic_wand_select_mask_into(
    rgba: &[u8],
    width: u32,
    height: u32,
    seed_x: u32,
    seed_y: u32,
    config: &MagicWandConfig,
    boundary_mask: Option<&[u8]>,
    out_mask: &mut [u8],
) -> Result<MagicWandStats, DrawingCoreError> {
    let (pixel_count, _) = validate_common_inputs(
        rgba.len(),
        boundary_mask,
        width,
        height,
        seed_x,
        seed_y,
        config.gap_closing_radius,
    )?;
    if out_mask.len() != pixel_count {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: pixel_count,
            actual: out_mask.len(),
        });
    }

    out_mask.fill(0);
    let w = width as usize;
    let h = height as usize;
    let sx = seed_x as usize;
    let sy = seed_y as usize;
    let seed_idx = sy * w + sx;

    if let Some(mask) = boundary_mask {
        if mask[seed_idx] != 0 {
            return Ok(MagicWandStats {
                selected_pixels: 0,
                dirty_rect: EMPTY_DIRTY_RECT,
            });
        }
    }

    let (rgba_px, _) = rgba.as_chunks::<4>();
    let seed_color = rgba_px[seed_idx];
    let (mut selected_pixels, mut dirty_rect) = if config.gap_closing_radius > 0 {
        let barrier = build_closed_barrier_map(
            rgba_px,
            boundary_mask,
            seed_color,
            config.tolerance,
            w,
            h,
            usize::from(config.gap_closing_radius),
        );
        scanline_fill_mask(w, h, sx, sy, out_mask, |idx| barrier[idx] == 0)
    } else if let Some(mask) = boundary_mask {
        scanline_fill_mask(w, h, sx, sy, out_mask, |idx| {
            mask[idx] == 0 && color_within_tolerance(rgba_px[idx], seed_color, config.tolerance)
        })
    } else {
        scanline_fill_mask(w, h, sx, sy, out_mask, |idx| {
            color_within_tolerance(rgba_px[idx], seed_color, config.tolerance)
        })
    };

    if config.anti_alias && selected_pixels > 0 {
        let hard = out_mask.to_vec();
        let rx0 = (dirty_rect.x as usize).saturating_sub(1);
        let ry0 = (dirty_rect.y as usize).saturating_sub(1);
        let rx1 = ((dirty_rect.x as usize) + (dirty_rect.width as usize) + 1).min(w);
        let ry1 = ((dirty_rect.y as usize) + (dirty_rect.height as usize) + 1).min(h);

        let mut new_min_x = w;
        let mut new_max_x = 0usize;
        let mut new_min_y = h;
        let mut new_max_y = 0usize;
        let mut new_count = 0usize;

        for y in ry0..ry1 {
            for x in rx0..rx1 {
                let idx = y * w + x;
                let center = hard[idx];
                if center == 0 && boundary_mask.is_some_and(|m| m[idx] != 0) {
                    continue;
                }
                let mut has_diff_neighbor = false;
                let mut weighted_sum = 0u32;
                let mut weight_total = 0u32;
                for dy in -1isize..=1isize {
                    let ny = y as isize + dy;
                    if ny < 0 || ny >= h as isize {
                        continue;
                    }
                    let wy = if dy == 0 { 2u32 } else { 1u32 };
                    let row_off = (ny as usize) * w;
                    for dx in -1isize..=1isize {
                        let nx = x as isize + dx;
                        if nx < 0 || nx >= w as isize {
                            continue;
                        }
                        let wx = if dx == 0 { 2u32 } else { 1u32 };
                        let weight = wx * wy;
                        let nv = hard[row_off + (nx as usize)];
                        if nv != center {
                            has_diff_neighbor = true;
                        }
                        weighted_sum += u32::from(nv) * weight;
                        weight_total += weight;
                    }
                }

                let final_val = if has_diff_neighbor && weight_total > 0 {
                    ((weighted_sum + (weight_total / 2)) / weight_total).min(255) as u8
                } else {
                    center
                };
                out_mask[idx] = final_val;
                if final_val > 0 {
                    new_count += 1;
                    if x < new_min_x {
                        new_min_x = x;
                    }
                    if x > new_max_x {
                        new_max_x = x;
                    }
                    if y < new_min_y {
                        new_min_y = y;
                    }
                    if y > new_max_y {
                        new_max_y = y;
                    }
                }
            }
        }

        selected_pixels = new_count;
        dirty_rect = if new_count > 0 {
            DirtyRect {
                x: new_min_x as u32,
                y: new_min_y as u32,
                width: (new_max_x - new_min_x + 1) as u32,
                height: (new_max_y - new_min_y + 1) as u32,
            }
        } else {
            EMPTY_DIRTY_RECT
        };
    }

    Ok(MagicWandStats {
        selected_pixels,
        dirty_rect,
    })
}

/// 매직 완드 연속 영역 선택 커널 (`0 | 255` 또는 경계 안티앨리어싱 마스크와 경계 사각형 반환).
pub fn magic_wand_select_mask(
    rgba: &[u8],
    width: u32,
    height: u32,
    seed_x: u32,
    seed_y: u32,
    config: &MagicWandConfig,
    boundary_mask: Option<&[u8]>,
) -> Result<MagicWandSelection, DrawingCoreError> {
    let pixel_count = checked_pixel_count(width, height)?;
    let mut mask = vec![0u8; pixel_count];
    let stats = magic_wand_select_mask_into(
        rgba,
        width,
        height,
        seed_x,
        seed_y,
        config,
        boundary_mask,
        &mut mask,
    )?;
    Ok(MagicWandSelection {
        mask,
        selected_pixels: stats.selected_pixels,
        dirty_rect: stats.dirty_rect,
    })
}

/// 임계값(`threshold >= 1`)을 기준으로 선택 마스크에서 병합된 마칭 앤츠 경계 선분 목록을 추출한다.
///
/// 화면 좌표계(+X 오른쪽, +Y 아래) 기준으로 선택 영역을 항상 오른쪽에 두는 시계 방향(외곽) /
/// 반시계 방향(내부 구멍) 방향성을 유지하며, 동일 선상의 연속 단위 변을 단일 선분으로 병합한다.
pub fn extract_marching_ants_segments_with_threshold(
    mask: &[u8],
    width: u32,
    height: u32,
    threshold: u8,
) -> Result<Vec<MarchingAntSegment>, DrawingCoreError> {
    if threshold == 0 {
        return Err(DrawingCoreError::InvalidParameter { name: "threshold" });
    }
    let pixel_count = checked_pixel_count(width, height)?;
    if mask.len() != pixel_count {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: pixel_count,
            actual: mask.len(),
        });
    }

    let w = width as usize;
    let h = height as usize;
    let is_sel = |x: usize, y: usize| -> bool { mask[y * w + x] >= threshold };
    let mut segments = Vec::new();

    // 1) 수평 경계선 (위쪽 변: 왼쪽→오른쪽, 아래쪽 변: 오른쪽→왼쪽)
    for y in 0..=h {
        let mut x = 0usize;
        while x < w {
            if y < h && is_sel(x, y) && (y == 0 || !is_sel(x, y - 1)) {
                let start = x;
                x += 1;
                while x < w && is_sel(x, y) && (y == 0 || !is_sel(x, y - 1)) {
                    x += 1;
                }
                segments.push(MarchingAntSegment {
                    x0: start as u32,
                    y0: y as u32,
                    x1: x as u32,
                    y1: y as u32,
                });
            } else {
                x += 1;
            }
        }

        let mut x = 0usize;
        while x < w {
            if y > 0 && is_sel(x, y - 1) && (y == h || !is_sel(x, y)) {
                let start = x;
                x += 1;
                while x < w && is_sel(x, y - 1) && (y == h || !is_sel(x, y)) {
                    x += 1;
                }
                segments.push(MarchingAntSegment {
                    x0: x as u32,
                    y0: y as u32,
                    x1: start as u32,
                    y1: y as u32,
                });
            } else {
                x += 1;
            }
        }
    }

    // 2) 수직 경계선 (오른쪽 변: 위→아래, 왼쪽 변: 아래→위)
    for x in 0..=w {
        let mut y = 0usize;
        while y < h {
            if x > 0 && is_sel(x - 1, y) && (x == w || !is_sel(x, y)) {
                let start = y;
                y += 1;
                while y < h && is_sel(x - 1, y) && (x == w || !is_sel(x, y)) {
                    y += 1;
                }
                segments.push(MarchingAntSegment {
                    x0: x as u32,
                    y0: start as u32,
                    x1: x as u32,
                    y1: y as u32,
                });
            } else {
                y += 1;
            }
        }

        let mut y = 0usize;
        while y < h {
            if x < w && is_sel(x, y) && (x == 0 || !is_sel(x - 1, y)) {
                let start = y;
                y += 1;
                while y < h && is_sel(x, y) && (x == 0 || !is_sel(x - 1, y)) {
                    y += 1;
                }
                segments.push(MarchingAntSegment {
                    x0: x as u32,
                    y0: y as u32,
                    x1: x as u32,
                    y1: start as u32,
                });
            } else {
                y += 1;
            }
        }
    }

    Ok(segments)
}

/// 이진 선택 마스크(`> 0`)에서 0-GC 캔버스 렌더링용 마칭 앤츠 경계 선분 목록을 추출한다.
pub fn extract_marching_ants_segments(
    mask: &[u8],
    width: u32,
    height: u32,
) -> Result<Vec<MarchingAntSegment>, DrawingCoreError> {
    extract_marching_ants_segments_with_threshold(mask, width, height, 1)
}
