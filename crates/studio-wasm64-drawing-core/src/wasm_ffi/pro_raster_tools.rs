use super::*;

use crate::color_halftone_kernel::{
    liquify_displace_rgba, oklch_to_rgba_batch, render_halftone_screentone_rgba,
    rgba_to_cmyk_u8_batch, rgba_to_oklch_batch, HalftoneConfig, HalftonePattern,
    LiquifyBrushConfig, LiquifyMode,
};
use crate::filter_warp_kernel::{warp_mesh_rigid_mls, WarpPin};
use crate::flood_fill_selection_kernel::{
    extract_marching_ants_segments_with_threshold, flood_fill_rgba_scanline,
    magic_wand_select_mask_into, FloodFillConfig, MagicWandConfig, MAX_GAP_CLOSING_RADIUS,
};
use crate::vector_psd_tile_kernel::{
    parse_psd_header_streaming, vectorize_stroke_to_cubic_beziers, PsdColorMode, StrokePoint2D,
};

/// `wasm_warp_mesh_rigid_mls` 핀 1개의 `f32` 요소 수(`[rest_x, rest_y, target_x, target_y, weight]`).
pub const MLS_WARP_PIN_STRIDE: usize = 5;
/// `wasm_vectorize_stroke_cubic` 입력 점 1개의 `f32` 요소 수(`[x, y, pressure]`).
pub const VECTORIZE_POINT_STRIDE: usize = 3;
/// `wasm_vectorize_stroke_cubic` 출력 세그먼트 1개의 `f32` 요소 수(`[p0x, p0y, c1x, c1y, c2x, c2y, p3x, p3y, w0, w1]`).
pub const VECTORIZE_SEGMENT_STRIDE: usize = 10;
/// `wasm_vectorize_stroke_cubic` 통계 출력 길이(`[total_segments, max_fit_error, compression_ratio]`).
pub const VECTORIZE_STATS_LEN: usize = 3;
/// `wasm_parse_psd_header` 메타데이터 출력 `u64` 길이.
pub const PSD_HEADER_FFI_U64_LEN: usize = 16;
/// `DirtyRect` 출력 `u32` 길이(`[x, y, width, height]`).
pub const DIRTY_RECT_FFI_U32_LEN: usize = 4;
/// `wasm_extract_marching_ants_segments` 선분 1개의 `u32` 요소 수(`[x0, y0, x1, y1]`).
pub const MARCHING_ANT_SEGMENT_STRIDE: usize = 4;
/// `wasm_render_halftone_screentone` `params_ptr` `f32` 길이(`[cell_pitch_px, angle_deg, tone_density, softness]`).
pub const HALFTONE_FFI_PARAM_COUNT: usize = 4;
/// `wasm_liquify_displace_rgba` `params_ptr` `f32` 길이(`[cx, cy, radius, strength, dx, dy]`).
pub const LIQUIFY_FFI_PARAM_COUNT: usize = 6;

const MAX_MLS_VERTICES: usize = 262_144;
const MAX_MLS_PINS: usize = 1024;
const MAX_VECTORIZE_POINTS: usize = 262_144;

#[inline]
fn checked_byte_len(count: usize, elem_size: usize) -> Result<usize, i32> {
    let bytes = count.checked_mul(elem_size).ok_or(FFI_ERR_OVERFLOW)?;
    if bytes > isize::MAX as usize {
        return Err(FFI_ERR_OVERFLOW);
    }
    Ok(bytes)
}

#[inline]
fn aligned_non_null<T>(ptr_addr: usize) -> bool {
    ptr_addr != 0 && ptr_addr.is_multiple_of(mem::align_of::<T>())
}

fn pro_error_to_ffi_code(err: &DrawingCoreError) -> i32 {
    match err {
        DrawingCoreError::InvalidDimensions { .. } => FFI_ERR_INVALID_DIMENSIONS,
        DrawingCoreError::InvalidParameter { .. }
        | DrawingCoreError::InvalidPsdSignature
        | DrawingCoreError::UnsupportedPsdVersion(_) => FFI_ERR_INVALID_PARAMETER,
        DrawingCoreError::BufferLengthMismatch { .. }
        | DrawingCoreError::TileSizeMismatch { .. }
        | DrawingCoreError::TruncatedInput { .. } => FFI_ERR_BUFFER_LENGTH,
        _ => FFI_ERR_OVERFLOW,
    }
}

fn psd_color_mode_to_u64(mode: PsdColorMode) -> u64 {
    match mode {
        PsdColorMode::Bitmap => 0,
        PsdColorMode::Grayscale => 1,
        PsdColorMode::Indexed => 2,
        PsdColorMode::Rgb => 3,
        PsdColorMode::Cmyk => 4,
        PsdColorMode::Multichannel => 7,
        PsdColorMode::Duotone => 8,
        PsdColorMode::Lab => 9,
        PsdColorMode::Unknown(code) => u64::from(code),
    }
}

/// 선형 메모리 제로카피 다중 핀 MLS 강체 2D 메쉬 워프 C-ABI 진입점 (`pro-raster-tools` 피처 전용).
///
/// # Safety
/// `vertices_xy_ptr`, `out_vertices_xy_ptr`은 `vertex_count > 0`일 때 4바이트 정렬된 `vertex_count * 2`개의 `f32`,
/// `pins_ptr`은 `pin_count > 0`일 때 4바이트 정렬된 `pin_count * 5`개의 `f32` 유효 선형 메모리이며 출력 버퍼는 입력과 겹치지 않아야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_warp_mesh_rigid_mls(
    vertices_xy_ptr: *const f32,
    vertex_count: u32,
    pins_ptr: *const f32,
    pin_count: u32,
    alpha: f32,
    out_vertices_xy_ptr: *mut f32,
) -> i32 {
    let nv = vertex_count as usize;
    let np = pin_count as usize;
    if nv > MAX_MLS_VERTICES || np > MAX_MLS_PINS {
        return FFI_ERR_INVALID_PARAMETER;
    }
    if nv > 0
        && (!aligned_non_null::<f32>(vertices_xy_ptr as usize)
            || !aligned_non_null::<f32>(out_vertices_xy_ptr as usize))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    if np > 0 && !aligned_non_null::<f32>(pins_ptr as usize) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let (Some(v_len), Some(p_len)) = (nv.checked_mul(2), np.checked_mul(MLS_WARP_PIN_STRIDE))
    else {
        return FFI_ERR_OVERFLOW;
    };
    let (v_bytes, p_bytes) = match (
        checked_byte_len(v_len, mem::size_of::<f32>()),
        checked_byte_len(p_len, mem::size_of::<f32>()),
    ) {
        (Ok(a), Ok(b)) => (a, b),
        _ => return FFI_ERR_OVERFLOW,
    };
    if ranges_overlap(
        out_vertices_xy_ptr as usize,
        v_bytes,
        vertices_xy_ptr as usize,
        v_bytes,
    ) || ranges_overlap(
        out_vertices_xy_ptr as usize,
        v_bytes,
        pins_ptr as usize,
        p_bytes,
    ) {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (verts_raw, pins_raw, out_raw) = unsafe {
        (
            if nv == 0 {
                &[][..]
            } else {
                slice::from_raw_parts(vertices_xy_ptr, v_len)
            },
            if np == 0 {
                &[][..]
            } else {
                slice::from_raw_parts(pins_ptr, p_len)
            },
            if nv == 0 {
                &mut [][..]
            } else {
                slice::from_raw_parts_mut(out_vertices_xy_ptr, v_len)
            },
        )
    };

    let mut vertices = Vec::with_capacity(nv);
    for c in verts_raw.as_chunks::<2>().0 {
        vertices.push([c[0], c[1]]);
    }
    let mut pins = Vec::with_capacity(np);
    for c in pins_raw.as_chunks::<MLS_WARP_PIN_STRIDE>().0 {
        pins.push(WarpPin {
            rest: [c[0], c[1]],
            target: [c[2], c[3]],
            weight: c[4],
        });
    }

    match warp_mesh_rigid_mls(&vertices, &pins, alpha) {
        Ok(deformed) => {
            for (dst, v) in out_raw.as_chunks_mut::<2>().0.iter_mut().zip(deformed.iter()) {
                dst[0] = v[0];
                dst[1] = v[1];
            }
            count_to_i32(deformed.len())
        }
        Err(ref err) => pro_error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 실시간 RDP + 3차 베지어 스트로크 벡터라이저 C-ABI 진입점 (`pro-raster-tools` 피처 전용).
///
/// `out_segments_ptr == null`이고 `max_segments == 0`이면 필요한 세그먼트 개수만 반환한다.
///
/// # Safety
/// 모든 비-null 포인터는 4바이트 정렬된 유효 선형 메모리여야 하며 출력 버퍼는 서로 및 입력과 겹치지 않아야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_vectorize_stroke_cubic(
    points_xyp_ptr: *const f32,
    point_count: u32,
    rdp_epsilon: f32,
    bezier_error_tolerance: f32,
    out_segments_ptr: *mut f32,
    max_segments: u32,
    out_stats_ptr: *mut f32,
) -> i32 {
    let np = point_count as usize;
    let cap = max_segments as usize;
    if np > MAX_VECTORIZE_POINTS {
        return FFI_ERR_INVALID_PARAMETER;
    }
    if np > 0 && !aligned_non_null::<f32>(points_xyp_ptr as usize) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    if out_segments_ptr.is_null() {
        if cap > 0 {
            return FFI_ERR_NULL_OR_ALIAS;
        }
    } else if !(out_segments_ptr as usize).is_multiple_of(mem::align_of::<f32>()) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    if !out_stats_ptr.is_null() && !aligned_non_null::<f32>(out_stats_ptr as usize) {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    let (Some(p_len), Some(seg_f32_len)) = (
        np.checked_mul(VECTORIZE_POINT_STRIDE),
        cap.checked_mul(VECTORIZE_SEGMENT_STRIDE),
    ) else {
        return FFI_ERR_OVERFLOW;
    };
    let (p_bytes, seg_bytes, stat_bytes) = match (
        checked_byte_len(p_len, mem::size_of::<f32>()),
        checked_byte_len(seg_f32_len, mem::size_of::<f32>()),
        checked_byte_len(VECTORIZE_STATS_LEN, mem::size_of::<f32>()),
    ) {
        (Ok(a), Ok(b), Ok(c)) => (a, b, c),
        _ => return FFI_ERR_OVERFLOW,
    };

    let seg_active_bytes = if out_segments_ptr.is_null() {
        0
    } else {
        seg_bytes
    };
    let stat_active_bytes = if out_stats_ptr.is_null() {
        0
    } else {
        stat_bytes
    };
    if ranges_overlap(
        out_segments_ptr as usize,
        seg_active_bytes,
        points_xyp_ptr as usize,
        p_bytes,
    ) || ranges_overlap(
        out_stats_ptr as usize,
        stat_active_bytes,
        points_xyp_ptr as usize,
        p_bytes,
    ) || ranges_overlap(
        out_segments_ptr as usize,
        seg_active_bytes,
        out_stats_ptr as usize,
        stat_active_bytes,
    ) {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let pts_raw = unsafe {
        if np == 0 {
            &[][..]
        } else {
            slice::from_raw_parts(points_xyp_ptr, p_len)
        }
    };
    let mut points = Vec::with_capacity(np);
    for c in pts_raw.as_chunks::<VECTORIZE_POINT_STRIDE>().0 {
        points.push(StrokePoint2D {
            x: c[0],
            y: c[1],
            pressure: c[2],
        });
    }

    match vectorize_stroke_to_cubic_beziers(&points, rdp_epsilon, bezier_error_tolerance) {
        Ok(vec_stroke) => {
            let total = vec_stroke.segments.len();
            if !out_stats_ptr.is_null() {
                // SAFETY: `out_stats_ptr`은 정렬·비중첩 검증 완료된 `f32[3]` 쓰기 가능 버퍼다.
                unsafe {
                    *out_stats_ptr.cast::<[f32; VECTORIZE_STATS_LEN]>() = [
                        total as f32,
                        vec_stroke.max_fit_error,
                        vec_stroke.compression_ratio,
                    ];
                }
            }
            if out_segments_ptr.is_null() {
                return count_to_i32(total);
            }
            if total > cap {
                return FFI_ERR_BUFFER_LENGTH;
            }
            if total > 0 {
                // SAFETY: `total <= cap`이고 `out_segments_ptr`은 검증된 쓰기 가능 버퍼다.
                let out_seg = unsafe {
                    slice::from_raw_parts_mut(out_segments_ptr, total * VECTORIZE_SEGMENT_STRIDE)
                };
                for (dst, s) in out_seg
                    .as_chunks_mut::<VECTORIZE_SEGMENT_STRIDE>()
                    .0
                    .iter_mut()
                    .zip(vec_stroke.segments.iter())
                {
                    dst[0] = s.p0[0];
                    dst[1] = s.p0[1];
                    dst[2] = s.c1[0];
                    dst[3] = s.c1[1];
                    dst[4] = s.c2[0];
                    dst[5] = s.c2[1];
                    dst[6] = s.p3[0];
                    dst[7] = s.p3[1];
                    dst[8] = s.width_start;
                    dst[9] = s.width_end;
                }
            }
            count_to_i32(total)
        }
        Err(ref err) => pro_error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 스트리밍 PSD/PSB 헤더 파서 C-ABI 진입점 (`pro-raster-tools` 피처 전용).
///
/// 성공 시 PSD 버전(`1` = PSD, `2` = PSB)을 반환하고 `out_meta_u64_ptr`에 16개 `u64` 메타데이터를 기록한다.
///
/// # Safety
/// `bytes_ptr`은 `byte_len > 0`일 때 유효 선형 메모리여야 하며,
/// `out_meta_u64_ptr`은 8바이트 정렬된 16개 `u64` 버퍼로서 입력과 겹치지 않아야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_parse_psd_header(
    bytes_ptr: *const u8,
    byte_len: u32,
    out_meta_u64_ptr: *mut u64,
) -> i32 {
    if !aligned_non_null::<u64>(out_meta_u64_ptr as usize) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let len = byte_len as usize;
    if len > 0 && bytes_ptr.is_null() {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let meta_bytes = PSD_HEADER_FFI_U64_LEN * mem::size_of::<u64>();
    if len > isize::MAX as usize
        || ranges_overlap(bytes_ptr as usize, len, out_meta_u64_ptr as usize, meta_bytes)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let bytes = unsafe {
        if len == 0 {
            &[][..]
        } else {
            slice::from_raw_parts(bytes_ptr, len)
        }
    };

    match parse_psd_header_streaming(bytes) {
        Ok(info) => {
            let meta: [u64; PSD_HEADER_FFI_U64_LEN] = [
                u64::from(info.version),
                u64::from(info.is_psb),
                u64::from(info.channels),
                u64::from(info.width),
                u64::from(info.height),
                u64::from(info.depth_bits),
                psd_color_mode_to_u64(info.color_mode),
                info.color_mode_data_offset,
                info.color_mode_data_length,
                info.image_resources_offset,
                info.image_resources_length,
                info.layer_and_mask_offset,
                info.layer_and_mask_length,
                info.image_data_offset,
                info.estimated_uncompressed_rgba_bytes,
                u64::from(info.requires_memory64),
            ];
            // SAFETY: `out_meta_u64_ptr`은 8바이트 정렬·비중첩 검증 완료된 `u64[16]` 버퍼다.
            unsafe {
                *out_meta_u64_ptr.cast::<[u64; PSD_HEADER_FFI_U64_LEN]>() = meta;
            }
            i32::from(info.version)
        }
        Err(ref err) => pro_error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 비재귀 스캔라인 RGBA8 플러드 필 C-ABI 진입점 (`pro-raster-tools` 피처 전용).
///
/// # Safety
/// `rgba_ptr`은 `width * height * 4`바이트, `boundary_mask_ptr`은 null 또는 `width * height`바이트,
/// `out_dirty_rect_ptr`은 null 또는 4바이트 정렬된 `u32[4]` 버퍼이며 서로 겹치지 않아야 한다.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn wasm_flood_fill_rgba(
    rgba_ptr: *mut u8,
    boundary_mask_ptr: *const u8,
    width: u32,
    height: u32,
    seed_x: u32,
    seed_y: u32,
    fill_rgba_packed: u32,
    tolerance: u32,
    gap_closing_radius: u32,
    out_dirty_rect_ptr: *mut u32,
) -> i32 {
    if tolerance > 255 || gap_closing_radius > u32::from(MAX_GAP_CLOSING_RADIUS) {
        return FFI_ERR_INVALID_PARAMETER;
    }
    if rgba_ptr.is_null()
        || (!out_dirty_rect_ptr.is_null() && !aligned_non_null::<u32>(out_dirty_rect_ptr as usize))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let pixel_count = match checked_pixel_count(width, height) {
        Ok(p) => p,
        Err(ref err) => return pro_error_to_ffi_code(err),
    };
    let rgba_len = match checked_rgba_len(width, height) {
        Ok(n) if n <= isize::MAX as usize => n,
        Ok(_) => return FFI_ERR_OVERFLOW,
        Err(ref err) => return pro_error_to_ffi_code(err),
    };
    let rect_bytes = if out_dirty_rect_ptr.is_null() {
        0
    } else {
        DIRTY_RECT_FFI_U32_LEN * mem::size_of::<u32>()
    };
    let mask_bytes = if boundary_mask_ptr.is_null() {
        0
    } else {
        pixel_count
    };
    if ranges_overlap(
        rgba_ptr as usize,
        rgba_len,
        boundary_mask_ptr as usize,
        mask_bytes,
    ) || ranges_overlap(
        rgba_ptr as usize,
        rgba_len,
        out_dirty_rect_ptr as usize,
        rect_bytes,
    ) || ranges_overlap(
        boundary_mask_ptr as usize,
        mask_bytes,
        out_dirty_rect_ptr as usize,
        rect_bytes,
    ) {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (rgba, mask_opt) = unsafe {
        (
            slice::from_raw_parts_mut(rgba_ptr, rgba_len),
            if boundary_mask_ptr.is_null() {
                None
            } else {
                Some(slice::from_raw_parts(boundary_mask_ptr, pixel_count))
            },
        )
    };
    let cfg = FloodFillConfig {
        tolerance: tolerance as u8,
        gap_closing_radius: gap_closing_radius as u8,
    };
    match flood_fill_rgba_scanline(
        rgba,
        width,
        height,
        seed_x,
        seed_y,
        fill_rgba_packed.to_le_bytes(),
        &cfg,
        mask_opt,
    ) {
        Ok(res) => {
            if !out_dirty_rect_ptr.is_null() {
                // SAFETY: `out_dirty_rect_ptr`은 정렬·비중첩 검증 완료된 `u32[4]` 버퍼다.
                unsafe {
                    *out_dirty_rect_ptr.cast::<[u32; DIRTY_RECT_FFI_U32_LEN]>() = [
                        res.dirty_rect.x,
                        res.dirty_rect.y,
                        res.dirty_rect.width,
                        res.dirty_rect.height,
                    ];
                }
            }
            count_to_i32(res.filled_pixels)
        }
        Err(ref err) => pro_error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 매직 완드 연속 영역 선택 마스크 C-ABI 진입점 (`pro-raster-tools` 피처 전용).
///
/// # Safety
/// `rgba_ptr`은 `width * height * 4`바이트, `out_mask_ptr`은 `width * height`바이트,
/// `boundary_mask_ptr`은 null 또는 `width * height`바이트, `out_dirty_rect_ptr`은 null 또는 4바이트 정렬된 `u32[4]` 버퍼이며 출력 버퍼는 입력 및 서로 겹치지 않아야 한다.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn wasm_magic_wand_mask(
    rgba_ptr: *const u8,
    boundary_mask_ptr: *const u8,
    out_mask_ptr: *mut u8,
    width: u32,
    height: u32,
    seed_x: u32,
    seed_y: u32,
    tolerance: u32,
    gap_closing_radius: u32,
    anti_alias: u32,
    out_dirty_rect_ptr: *mut u32,
) -> i32 {
    if tolerance > 255
        || gap_closing_radius > u32::from(MAX_GAP_CLOSING_RADIUS)
        || anti_alias > 1
    {
        return FFI_ERR_INVALID_PARAMETER;
    }
    if rgba_ptr.is_null()
        || out_mask_ptr.is_null()
        || (!out_dirty_rect_ptr.is_null() && !aligned_non_null::<u32>(out_dirty_rect_ptr as usize))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let pixel_count = match checked_pixel_count(width, height) {
        Ok(p) => p,
        Err(ref err) => return pro_error_to_ffi_code(err),
    };
    let rgba_len = match checked_rgba_len(width, height) {
        Ok(n) if n <= isize::MAX as usize => n,
        Ok(_) => return FFI_ERR_OVERFLOW,
        Err(ref err) => return pro_error_to_ffi_code(err),
    };
    let mask_in_bytes = if boundary_mask_ptr.is_null() {
        0
    } else {
        pixel_count
    };
    let rect_bytes = if out_dirty_rect_ptr.is_null() {
        0
    } else {
        DIRTY_RECT_FFI_U32_LEN * mem::size_of::<u32>()
    };
    let (om_a, dr_a) = (out_mask_ptr as usize, out_dirty_rect_ptr as usize);
    if ranges_overlap(om_a, pixel_count, rgba_ptr as usize, rgba_len)
        || ranges_overlap(om_a, pixel_count, boundary_mask_ptr as usize, mask_in_bytes)
        || ranges_overlap(om_a, pixel_count, dr_a, rect_bytes)
        || ranges_overlap(dr_a, rect_bytes, rgba_ptr as usize, rgba_len)
        || ranges_overlap(dr_a, rect_bytes, boundary_mask_ptr as usize, mask_in_bytes)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (rgba, bmask_opt, out_mask) = unsafe {
        (
            slice::from_raw_parts(rgba_ptr, rgba_len),
            if boundary_mask_ptr.is_null() {
                None
            } else {
                Some(slice::from_raw_parts(boundary_mask_ptr, pixel_count))
            },
            slice::from_raw_parts_mut(out_mask_ptr, pixel_count),
        )
    };
    let cfg = MagicWandConfig {
        tolerance: tolerance as u8,
        gap_closing_radius: gap_closing_radius as u8,
        anti_alias: anti_alias != 0,
    };
    match magic_wand_select_mask_into(
        rgba, width, height, seed_x, seed_y, &cfg, bmask_opt, out_mask,
    ) {
        Ok(stats) => {
            if !out_dirty_rect_ptr.is_null() {
                // SAFETY: `out_dirty_rect_ptr`은 정렬·비중첩 검증 완료된 `u32[4]` 버퍼다.
                unsafe {
                    *out_dirty_rect_ptr.cast::<[u32; DIRTY_RECT_FFI_U32_LEN]>() = [
                        stats.dirty_rect.x,
                        stats.dirty_rect.y,
                        stats.dirty_rect.width,
                        stats.dirty_rect.height,
                    ];
                }
            }
            count_to_i32(stats.selected_pixels)
        }
        Err(ref err) => pro_error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 마칭 앤츠(Marching Ants) 선택 윤곽선 추출 C-ABI 진입점 (`pro-raster-tools` 피처 전용).
///
/// `out_segments_ptr == null`이고 `max_segments == 0`이면 필요한 선분 개수만 반환한다.
///
/// # Safety
/// `mask_ptr`은 `width * height`바이트 유효 선형 메모리, `out_segments_ptr`은 null 또는
/// 4바이트 정렬된 `max_segments * 4`개의 `u32` 비중첩 유효 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_extract_marching_ants_segments(
    mask_ptr: *const u8,
    width: u32,
    height: u32,
    threshold: u32,
    out_segments_ptr: *mut u32,
    max_segments: u32,
) -> i32 {
    if threshold == 0 || threshold > 255 {
        return FFI_ERR_INVALID_PARAMETER;
    }
    if mask_ptr.is_null() {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let cap = max_segments as usize;
    if out_segments_ptr.is_null() {
        if cap > 0 {
            return FFI_ERR_NULL_OR_ALIAS;
        }
    } else if !(out_segments_ptr as usize).is_multiple_of(mem::align_of::<u32>()) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let pixel_count = match checked_pixel_count(width, height) {
        Ok(p) if p <= isize::MAX as usize => p,
        Ok(_) => return FFI_ERR_OVERFLOW,
        Err(ref err) => return pro_error_to_ffi_code(err),
    };
    let Some(seg_u32_len) = cap.checked_mul(MARCHING_ANT_SEGMENT_STRIDE) else {
        return FFI_ERR_OVERFLOW;
    };
    let seg_bytes = match checked_byte_len(seg_u32_len, mem::size_of::<u32>()) {
        Ok(b) => b,
        Err(code) => return code,
    };
    if !out_segments_ptr.is_null()
        && ranges_overlap(
            out_segments_ptr as usize,
            seg_bytes,
            mask_ptr as usize,
            pixel_count,
        )
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let mask = unsafe { slice::from_raw_parts(mask_ptr, pixel_count) };
    match extract_marching_ants_segments_with_threshold(mask, width, height, threshold as u8) {
        Ok(segments) => {
            if out_segments_ptr.is_null() {
                return count_to_i32(segments.len());
            }
            if segments.len() > cap {
                return FFI_ERR_BUFFER_LENGTH;
            }
            if !segments.is_empty() {
                // SAFETY: `segments.len() <= cap`이고 `out_segments_ptr`은 검증된 쓰기 가능 버퍼다.
                let out_seg = unsafe {
                    slice::from_raw_parts_mut(
                        out_segments_ptr,
                        segments.len() * MARCHING_ANT_SEGMENT_STRIDE,
                    )
                };
                for (dst, s) in out_seg
                    .as_chunks_mut::<MARCHING_ANT_SEGMENT_STRIDE>()
                    .0
                    .iter_mut()
                    .zip(segments.iter())
                {
                    dst[0] = s.x0;
                    dst[1] = s.y0;
                    dst[2] = s.x1;
                    dst[3] = s.y1;
                }
            }
            count_to_i32(segments.len())
        }
        Err(ref err) => pro_error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 RGBA8 → OKLCH(`f32[4]`) 일괄 변환 C-ABI 진입점 (`pro-raster-tools` 피처 전용).
///
/// # Safety
/// `rgba_ptr`은 `pixel_count * 4`바이트, `out_oklch_ptr`은 4바이트 정렬된 `pixel_count * 4`개의 `f32` 비중첩 유효 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_rgba_to_oklch_batch(
    rgba_ptr: *const u8,
    out_oklch_ptr: *mut f32,
    pixel_count: u32,
) -> i32 {
    let n = pixel_count as usize;
    if n == 0 {
        return 0;
    }
    if rgba_ptr.is_null() || !aligned_non_null::<f32>(out_oklch_ptr as usize) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let Some(elem_len) = n.checked_mul(4) else {
        return FFI_ERR_OVERFLOW;
    };
    let (rgba_bytes, oklch_bytes) = match (
        checked_byte_len(elem_len, 1),
        checked_byte_len(elem_len, mem::size_of::<f32>()),
    ) {
        (Ok(a), Ok(b)) => (a, b),
        _ => return FFI_ERR_OVERFLOW,
    };
    if ranges_overlap(
        rgba_ptr as usize,
        rgba_bytes,
        out_oklch_ptr as usize,
        oklch_bytes,
    ) {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (rgba, out_oklch) = unsafe {
        (
            slice::from_raw_parts(rgba_ptr, elem_len),
            slice::from_raw_parts_mut(out_oklch_ptr, elem_len),
        )
    };
    match rgba_to_oklch_batch(rgba, out_oklch) {
        Ok(processed) => count_to_i32(processed),
        Err(ref err) => pro_error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 OKLCH(`f32[4]`) → RGBA8 일괄 변환 C-ABI 진입점 (`pro-raster-tools` 피처 전용).
///
/// # Safety
/// `oklch_ptr`은 4바이트 정렬된 `pixel_count * 4`개의 `f32`, `out_rgba_ptr`은 `pixel_count * 4`바이트 비중첩 유효 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_oklch_to_rgba_batch(
    oklch_ptr: *const f32,
    out_rgba_ptr: *mut u8,
    pixel_count: u32,
) -> i32 {
    let n = pixel_count as usize;
    if n == 0 {
        return 0;
    }
    if !aligned_non_null::<f32>(oklch_ptr as usize) || out_rgba_ptr.is_null() {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let Some(elem_len) = n.checked_mul(4) else {
        return FFI_ERR_OVERFLOW;
    };
    let (oklch_bytes, rgba_bytes) = match (
        checked_byte_len(elem_len, mem::size_of::<f32>()),
        checked_byte_len(elem_len, 1),
    ) {
        (Ok(a), Ok(b)) => (a, b),
        _ => return FFI_ERR_OVERFLOW,
    };
    if ranges_overlap(
        oklch_ptr as usize,
        oklch_bytes,
        out_rgba_ptr as usize,
        rgba_bytes,
    ) {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (oklch, out_rgba) = unsafe {
        (
            slice::from_raw_parts(oklch_ptr, elem_len),
            slice::from_raw_parts_mut(out_rgba_ptr, elem_len),
        )
    };
    match oklch_to_rgba_batch(oklch, out_rgba) {
        Ok(processed) => count_to_i32(processed),
        Err(ref err) => pro_error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 인쇄 출판용 RGBA8 → CMYK8(UCR/GCR) 일괄 변환 C-ABI 진입점 (`pro-raster-tools` 피처 전용).
///
/// # Safety
/// `rgba_ptr`과 `out_cmyk_ptr`은 `pixel_count > 0`일 때 `pixel_count * 4`바이트 비중첩 유효 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_rgba_to_cmyk_batch(
    rgba_ptr: *const u8,
    out_cmyk_ptr: *mut u8,
    pixel_count: u32,
    gcr_factor: f32,
) -> i32 {
    let n = pixel_count as usize;
    if n == 0 {
        return match rgba_to_cmyk_u8_batch(&[], &mut [], gcr_factor) {
            Ok(_) => 0,
            Err(ref err) => pro_error_to_ffi_code(err),
        };
    }
    if rgba_ptr.is_null() || out_cmyk_ptr.is_null() {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let Some(byte_len) = n.checked_mul(4) else {
        return FFI_ERR_OVERFLOW;
    };
    if byte_len > isize::MAX as usize
        || ranges_overlap(rgba_ptr as usize, byte_len, out_cmyk_ptr as usize, byte_len)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (rgba, out_cmyk) = unsafe {
        (
            slice::from_raw_parts(rgba_ptr, byte_len),
            slice::from_raw_parts_mut(out_cmyk_ptr, byte_len),
        )
    };
    match rgba_to_cmyk_u8_batch(rgba, out_cmyk, gcr_factor) {
        Ok(processed) => count_to_i32(processed),
        Err(ref err) => pro_error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 절차적 하프톤/스크린톤 RGBA8 렌더링 C-ABI 진입점 (`pro-raster-tools` 피처 전용).
///
/// `params_ptr`은 null(기본값) 또는 4바이트 정렬된 4개 `f32` 배열
/// `[cell_pitch_px, angle_deg, tone_density, softness]`를 가리킨다.
///
/// # Safety
/// `out_rgba_ptr`은 `width * height * 4`바이트, `src_rgba_ptr`은 null 또는 `width * height * 4`바이트,
/// `params_ptr`은 null 또는 4바이트 정렬된 4개 `f32` 버퍼이며 출력은 입력과 겹치지 않아야 한다.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn wasm_render_halftone_screentone(
    src_rgba_ptr: *const u8,
    out_rgba_ptr: *mut u8,
    width: u32,
    height: u32,
    pattern: u32,
    ink_rgba_packed: u32,
    paper_rgba_packed: u32,
    params_ptr: *const f32,
) -> i32 {
    let Some(pat) = HalftonePattern::from_u32(pattern) else {
        return FFI_ERR_INVALID_PARAMETER;
    };
    if out_rgba_ptr.is_null()
        || (!params_ptr.is_null() && !aligned_non_null::<f32>(params_ptr as usize))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let rgba_len = match checked_rgba_len(width, height) {
        Ok(n) if n <= isize::MAX as usize => n,
        Ok(_) => return FFI_ERR_OVERFLOW,
        Err(ref err) => return pro_error_to_ffi_code(err),
    };
    let src_bytes = if src_rgba_ptr.is_null() { 0 } else { rgba_len };
    let params_bytes = if params_ptr.is_null() {
        0
    } else {
        HALFTONE_FFI_PARAM_COUNT * mem::size_of::<f32>()
    };
    if ranges_overlap(
        out_rgba_ptr as usize,
        rgba_len,
        src_rgba_ptr as usize,
        src_bytes,
    ) || ranges_overlap(
        out_rgba_ptr as usize,
        rgba_len,
        params_ptr as usize,
        params_bytes,
    ) {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (src_opt, out_rgba, cfg) = unsafe {
        let p = if params_ptr.is_null() {
            [8.0_f32, 45.0, 0.35, 0.06]
        } else {
            *params_ptr.cast::<[f32; HALFTONE_FFI_PARAM_COUNT]>()
        };
        let cfg = HalftoneConfig {
            pattern: pat,
            cell_pitch_px: p[0],
            angle_deg: p[1],
            tone_density: p[2],
            softness: p[3],
            ink_rgba: ink_rgba_packed.to_le_bytes(),
            paper_rgba: paper_rgba_packed.to_le_bytes(),
        };
        (
            if src_rgba_ptr.is_null() {
                None
            } else {
                Some(slice::from_raw_parts(src_rgba_ptr, rgba_len))
            },
            slice::from_raw_parts_mut(out_rgba_ptr, rgba_len),
            cfg,
        )
    };

    match render_halftone_screentone_rgba(src_opt, out_rgba, width, height, &cfg) {
        Ok(processed) => count_to_i32(processed),
        Err(ref err) => pro_error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 방사형 리퀴파이(Liquify) 브러시 변위 C-ABI 진입점 (`pro-raster-tools` 피처 전용).
///
/// `params_ptr`은 4바이트 정렬된 6개 `f32` 배열 `[cx, cy, radius, strength, dx, dy]`를 가리킨다.
///
/// # Safety
/// `src_rgba_ptr`, `dst_rgba_ptr`은 `width * height * 4`바이트, `params_ptr`은 4바이트 정렬된 6개 `f32`,
/// `out_dirty_rect_ptr`은 null 또는 4바이트 정렬된 `u32[4]` 버퍼이며 출력은 입력 및 서로 겹치지 않아야 한다.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn wasm_liquify_displace_rgba(
    src_rgba_ptr: *const u8,
    dst_rgba_ptr: *mut u8,
    width: u32,
    height: u32,
    mode: u32,
    params_ptr: *const f32,
    out_dirty_rect_ptr: *mut u32,
) -> i32 {
    let Some(liquify_mode) = LiquifyMode::from_u32(mode) else {
        return FFI_ERR_INVALID_PARAMETER;
    };
    if !aligned_non_null::<f32>(params_ptr as usize)
        || (!out_dirty_rect_ptr.is_null() && !aligned_non_null::<u32>(out_dirty_rect_ptr as usize))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let rgba_len = match validate_rgba_pair(
        dst_rgba_ptr as usize,
        src_rgba_ptr as usize,
        width,
        height,
    ) {
        Ok(n) => n,
        Err(code) => return code,
    };
    let params_bytes = LIQUIFY_FFI_PARAM_COUNT * mem::size_of::<f32>();
    let rect_bytes = if out_dirty_rect_ptr.is_null() {
        0
    } else {
        DIRTY_RECT_FFI_U32_LEN * mem::size_of::<u32>()
    };
    let (dst_a, dr_a) = (dst_rgba_ptr as usize, out_dirty_rect_ptr as usize);
    if ranges_overlap(dst_a, rgba_len, params_ptr as usize, params_bytes)
        || ranges_overlap(dst_a, rgba_len, dr_a, rect_bytes)
        || ranges_overlap(dr_a, rect_bytes, src_rgba_ptr as usize, rgba_len)
        || ranges_overlap(dr_a, rect_bytes, params_ptr as usize, params_bytes)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (src, dst, cfg) = unsafe {
        let p = *params_ptr.cast::<[f32; LIQUIFY_FFI_PARAM_COUNT]>();
        let cfg = LiquifyBrushConfig {
            mode: liquify_mode,
            cx: p[0],
            cy: p[1],
            radius: p[2],
            strength: p[3],
            dx: p[4],
            dy: p[5],
        };
        (
            slice::from_raw_parts(src_rgba_ptr, rgba_len),
            slice::from_raw_parts_mut(dst_rgba_ptr, rgba_len),
            cfg,
        )
    };

    match liquify_displace_rgba(src, dst, width, height, &cfg) {
        Ok(stats) => {
            if !out_dirty_rect_ptr.is_null() {
                // SAFETY: `out_dirty_rect_ptr`은 정렬·비중첩 검증 완료된 `u32[4]` 버퍼다.
                unsafe {
                    *out_dirty_rect_ptr.cast::<[u32; DIRTY_RECT_FFI_U32_LEN]>() = [
                        stats.dirty_rect.x,
                        stats.dirty_rect.y,
                        stats.dirty_rect.width,
                        stats.dirty_rect.height,
                    ];
                }
            }
            count_to_i32(stats.affected_pixels)
        }
        Err(ref err) => pro_error_to_ffi_code(err),
    }
}
