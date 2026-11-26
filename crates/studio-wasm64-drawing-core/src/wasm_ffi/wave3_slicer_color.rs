//! Wave-3 순수 안전 Rust 확장 스위트 커널 C-ABI (Webtoon Slicer/Dedup + Display-P3/CMYK-TAC/Palette, `extended-suite`).

use super::wave3_native_kernels::{checked_bytes, is_aligned_non_null, is_aligned_opt};
use super::*;
use crate::color_cmyk_oklch_kernel::{
    display_p3_to_srgb_rgba_batch, extract_palette_median_cut, rgba_to_cmyk_tac_batch,
    srgb_rgba_to_display_p3_batch, CmykTacConfig, MAX_MEDIAN_CUT_COLORS,
};
use crate::webtoon_slicer_dedup_kernel::{
    classify_and_dedup_tiles, plan_webtoon_smart_slices, WebtoonSliceConfig,
};

pub const WAVE3_SLICE_PARAM_LEN: usize = 6;
pub const WAVE3_SLICE_SPAN_STRIDE: usize = 5;
pub const WAVE3_DEDUP_SUMMARY_LEN: usize = 8;
pub const WAVE3_DEDUP_ENTRY_U64_STRIDE: usize = 2;
pub const WAVE3_CMYK_TAC_PARAM_LEN: usize = 4;
pub const WAVE3_CMYK_TAC_STATS_LEN: usize = 2;
pub const WAVE3_PALETTE_SWATCH_U32_STRIDE: usize = 2;

/// 세로 스크롤 웹툰 스마트 슬라이싱 (`out_spans`: 스트라이드 5 `f32`, 2패스 용량 조회 지원).
///
/// # Safety
/// 포인터는 타입 정렬·명시 길이·비중첩 유효 선형 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_webtoon_plan_smart_slices(
    rgba_ptr: *const u8,
    width: u32,
    height: u32,
    params_ptr: *const f32,
    out_spans_ptr: *mut f32,
    out_span_capacity: u32,
) -> i32 {
    if rgba_ptr.is_null() || !is_aligned_opt::<f32>(params_ptr as usize) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let rgba_len = match checked_rgba_len(width, height) {
        Ok(n) if n <= isize::MAX as usize => n,
        Ok(_) => return FFI_ERR_OVERFLOW,
        Err(ref e) => return error_to_ffi_code(e),
    };
    // SAFETY: null·정렬·길이 검증 완료.
    let (rgba, cfg) = unsafe {
        let img = slice::from_raw_parts(rgba_ptr, rgba_len);
        let cfg = if params_ptr.is_null() {
            WebtoonSliceConfig::default()
        } else {
            let p = *params_ptr.cast::<[f32; WAVE3_SLICE_PARAM_LEN]>();
            if p.iter().any(|v| !v.is_finite())
                || p[0] < 1.0
                || p[1] < 1.0
                || p[2] < 1.0
                || p[3] < 0.0
                || p[4] < 0.0
            {
                return FFI_ERR_INVALID_PARAMETER;
            }
            WebtoonSliceConfig {
                target_height: p[0].round() as u32,
                min_height: p[1].round() as u32,
                max_height: p[2].round() as u32,
                search_window: p[3].round() as u32,
                ink_l1_threshold: p[4].round() as u32,
                continuity_weight: p[5],
            }
        };
        (img, cfg)
    };
    let spans = match plan_webtoon_smart_slices(rgba, width, height, &cfg) {
        Ok(s) => s,
        Err(ref e) => return error_to_ffi_code(e),
    };
    if out_spans_ptr.is_null() && out_span_capacity == 0 {
        return count_to_i32(spans.len());
    }
    if (out_span_capacity as usize) < spans.len() {
        return FFI_ERR_BUFFER_LENGTH;
    }
    if !is_aligned_non_null::<f32>(out_spans_ptr as usize) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let Some(out_len) = spans.len().checked_mul(WAVE3_SLICE_SPAN_STRIDE) else {
        return FFI_ERR_OVERFLOW;
    };
    let Ok(out_bytes) = checked_bytes(out_len, mem::size_of::<f32>()) else {
        return FFI_ERR_OVERFLOW;
    };
    if ranges_overlap(out_spans_ptr as usize, out_bytes, rgba_ptr as usize, rgba_len) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    // SAFETY: 정렬·길이·비중첩 검증 완료.
    let out = unsafe { slice::from_raw_parts_mut(out_spans_ptr, out_len) };
    for (i, sp) in spans.iter().enumerate() {
        let base = i * WAVE3_SLICE_SPAN_STRIDE;
        out[base] = sp.start_y as f32;
        out[base + 1] = sp.end_y as f32;
        out[base + 2] = sp.height as f32;
        out[base + 3] = sp.cut_cost;
        out[base + 4] = if sp.is_clean_gutter { 1.0 } else { 0.0 };
    }
    count_to_i32(spans.len())
}

/// 64비트 FNV-1a 타일 중복 제거 및 빈/단색 타일 분류 (`out_summary`: `u32[8]`, `out_entries_u64`: 스트라이드 2 `u64`).
///
/// # Safety
/// 포인터는 타입 정렬·명시 길이·비중첩 유효 선형 메모리여야 한다.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn wasm_webtoon_dedup_tiles_fnv64(
    rgba_ptr: *const u8,
    width: u32,
    height: u32,
    tile_size: u32,
    out_summary_ptr: *mut u32,
    out_entries_u64_ptr: *mut u64,
    out_entry_capacity: u32,
) -> i32 {
    if rgba_ptr.is_null()
        || !is_aligned_opt::<u32>(out_summary_ptr as usize)
        || !is_aligned_opt::<u64>(out_entries_u64_ptr as usize)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let rgba_len = match checked_rgba_len(width, height) {
        Ok(n) if n <= isize::MAX as usize => n,
        Ok(_) => return FFI_ERR_OVERFLOW,
        Err(ref e) => return error_to_ffi_code(e),
    };
    // SAFETY: null·길이 검증 완료.
    let rgba = unsafe { slice::from_raw_parts(rgba_ptr, rgba_len) };
    let report = match classify_and_dedup_tiles(rgba, width, height, tile_size) {
        Ok(r) => r,
        Err(ref e) => return error_to_ffi_code(e),
    };
    if !out_summary_ptr.is_null() {
        let sum_bytes = WAVE3_DEDUP_SUMMARY_LEN * mem::size_of::<u32>();
        if ranges_overlap(out_summary_ptr as usize, sum_bytes, rgba_ptr as usize, rgba_len) {
            return FFI_ERR_NULL_OR_ALIAS;
        }
        // SAFETY: 정렬·길이·비중첩 검증 완료.
        let sum = unsafe { slice::from_raw_parts_mut(out_summary_ptr, WAVE3_DEDUP_SUMMARY_LEN) };
        sum[0] = report.tiles_x;
        sum[1] = report.tiles_y;
        sum[2] = report.total_tiles;
        sum[3] = report.unique_tiles;
        sum[4] = report.duplicate_tiles;
        sum[5] = report.empty_transparent_tiles;
        sum[6] = report.solid_color_tiles;
        sum[7] = report.content_tiles;
    }
    if !out_entries_u64_ptr.is_null() {
        let n = report.entries.len();
        if (out_entry_capacity as usize) < n {
            return FFI_ERR_BUFFER_LENGTH;
        }
        let Some(u64_len) = n.checked_mul(WAVE3_DEDUP_ENTRY_U64_STRIDE) else {
            return FFI_ERR_OVERFLOW;
        };
        let Ok(u64_bytes) = checked_bytes(u64_len, mem::size_of::<u64>()) else {
            return FFI_ERR_OVERFLOW;
        };
        if ranges_overlap(out_entries_u64_ptr as usize, u64_bytes, rgba_ptr as usize, rgba_len) {
            return FFI_ERR_NULL_OR_ALIAS;
        }
        // SAFETY: 정렬·길이·비중첩 검증 완료.
        let out = unsafe { slice::from_raw_parts_mut(out_entries_u64_ptr, u64_len) };
        for (i, e) in report.entries.iter().enumerate() {
            out[i * 2] = e.fnv1a_64;
            out[i * 2 + 1] = u64::from(e.canonical_tile_index)
                | (u64::from(e.class as u8) << 32)
                | (u64::from(e.tile_width & 0x0FFF) << 40)
                | (u64::from(e.tile_height & 0x0FFF) << 52);
        }
    }
    count_to_i32(report.total_tiles as usize)
}

/// sRGB RGBA8 → Display-P3 `f32[4]` 일괄 변환.
///
/// # Safety
/// 포인터는 타입 정렬·명시 길이·비중첩 유효 선형 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_color_srgb_to_p3_batch(
    srgb_rgba_ptr: *const u8,
    out_p3_f32_ptr: *mut f32,
    pixel_count: u32,
) -> i32 {
    let n = pixel_count as usize;
    if n == 0 {
        return 0;
    }
    let Some(quads) = n.checked_mul(4) else {
        return FFI_ERR_OVERFLOW;
    };
    let Ok(out_bytes) = checked_bytes(quads, mem::size_of::<f32>()) else {
        return FFI_ERR_OVERFLOW;
    };
    if srgb_rgba_ptr.is_null()
        || !is_aligned_non_null::<f32>(out_p3_f32_ptr as usize)
        || ranges_overlap(srgb_rgba_ptr as usize, quads, out_p3_f32_ptr as usize, out_bytes)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    // SAFETY: null·정렬·길이·비중첩 검증 완료.
    let (src, dst) = unsafe {
        (
            slice::from_raw_parts(srgb_rgba_ptr, quads),
            slice::from_raw_parts_mut(out_p3_f32_ptr, quads),
        )
    };
    match srgb_rgba_to_display_p3_batch(src, dst) {
        Ok(px) => count_to_i32(px),
        Err(ref e) => error_to_ffi_code(e),
    }
}

/// Display-P3 `f32[4]` → sRGB RGBA8 일괄 변환.
///
/// # Safety
/// 포인터는 타입 정렬·명시 길이·비중첩 유효 선형 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_color_p3_to_srgb_batch(
    p3_f32_ptr: *const f32,
    out_srgb_rgba_ptr: *mut u8,
    pixel_count: u32,
) -> i32 {
    let n = pixel_count as usize;
    if n == 0 {
        return 0;
    }
    let Some(quads) = n.checked_mul(4) else {
        return FFI_ERR_OVERFLOW;
    };
    let Ok(in_bytes) = checked_bytes(quads, mem::size_of::<f32>()) else {
        return FFI_ERR_OVERFLOW;
    };
    if !is_aligned_non_null::<f32>(p3_f32_ptr as usize)
        || out_srgb_rgba_ptr.is_null()
        || ranges_overlap(p3_f32_ptr as usize, in_bytes, out_srgb_rgba_ptr as usize, quads)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    // SAFETY: null·정렬·길이·비중첩 검증 완료.
    let (src, dst) = unsafe {
        (
            slice::from_raw_parts(p3_f32_ptr, quads),
            slice::from_raw_parts_mut(out_srgb_rgba_ptr, quads),
        )
    };
    match display_p3_to_srgb_rgba_batch(src, dst) {
        Ok(px) => count_to_i32(px),
        Err(ref e) => error_to_ffi_code(e),
    }
}

/// sRGB RGBA8 → UCR/GCR + TAC 총 잉크량 제한 인쇄 CMYK8 일괄 변환 (`params = [gcr, ucr_start, max_k, tac_limit_pct]`).
///
/// # Safety
/// 포인터는 타입 정렬·명시 길이·비중첩 유효 선형 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_color_rgba_to_cmyk_tac_batch(
    rgba_ptr: *const u8,
    out_cmyk_ptr: *mut u8,
    pixel_count: u32,
    params_ptr: *const f32,
    out_stats_ptr: *mut f32,
) -> i32 {
    let n = pixel_count as usize;
    if !is_aligned_opt::<f32>(params_ptr as usize) || !is_aligned_opt::<f32>(out_stats_ptr as usize) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let Some(bytes) = n.checked_mul(4) else {
        return FFI_ERR_OVERFLOW;
    };
    if bytes > isize::MAX as usize {
        return FFI_ERR_OVERFLOW;
    }
    if n > 0
        && (rgba_ptr.is_null()
            || out_cmyk_ptr.is_null()
            || ranges_overlap(rgba_ptr as usize, bytes, out_cmyk_ptr as usize, bytes))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    // SAFETY: null·정렬·길이·비중첩 검증 완료.
    let (src, dst, cfg, stats_opt) = unsafe {
        let cfg = if params_ptr.is_null() {
            CmykTacConfig::default()
        } else {
            let p = *params_ptr.cast::<[f32; WAVE3_CMYK_TAC_PARAM_LEN]>();
            CmykTacConfig { gcr_strength: p[0], ucr_start: p[1], max_k: p[2], tac_limit_pct: p[3] }
        };
        let so = if out_stats_ptr.is_null() {
            None
        } else {
            Some(slice::from_raw_parts_mut(out_stats_ptr, WAVE3_CMYK_TAC_STATS_LEN))
        };
        (
            if n == 0 { &[][..] } else { slice::from_raw_parts(rgba_ptr, bytes) },
            if n == 0 { &mut [][..] } else { slice::from_raw_parts_mut(out_cmyk_ptr, bytes) },
            cfg,
            so,
        )
    };
    match rgba_to_cmyk_tac_batch(src, dst, &cfg) {
        Ok(st) => {
            if let Some(s) = stats_opt {
                s[0] = st.clamped_pixels as f32;
                s[1] = st.max_tac_pct;
            }
            count_to_i32(st.pixel_count)
        }
        Err(ref e) => error_to_ffi_code(e),
    }
}

/// 고속 결정적 Median-Cut 팔레트 추출기 (`out_swatches`: `u32[max_colors * 2] = [packed_rgba_le, count]`).
///
/// # Safety
/// 포인터는 타입 정렬·명시 길이·비중첩 유효 선형 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_color_extract_palette_median_cut(
    rgba_ptr: *const u8,
    pixel_count: u32,
    max_colors: u32,
    alpha_threshold: u32,
    out_swatches_ptr: *mut u32,
) -> i32 {
    let mc = max_colors as usize;
    if mc == 0 || mc > MAX_MEDIAN_CUT_COLORS || alpha_threshold > 255 {
        return FFI_ERR_INVALID_PARAMETER;
    }
    let n = pixel_count as usize;
    let Some(bytes) = n.checked_mul(4) else {
        return FFI_ERR_OVERFLOW;
    };
    if bytes > isize::MAX as usize {
        return FFI_ERR_OVERFLOW;
    }
    let out_len = mc * WAVE3_PALETTE_SWATCH_U32_STRIDE;
    let out_bytes = out_len * mem::size_of::<u32>();
    if (n > 0 && rgba_ptr.is_null())
        || !is_aligned_non_null::<u32>(out_swatches_ptr as usize)
        || (n > 0 && ranges_overlap(rgba_ptr as usize, bytes, out_swatches_ptr as usize, out_bytes))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    // SAFETY: null·정렬·길이·비중첩 검증 완료.
    let (src, dst) = unsafe {
        (
            if n == 0 { &[][..] } else { slice::from_raw_parts(rgba_ptr, bytes) },
            slice::from_raw_parts_mut(out_swatches_ptr, out_len),
        )
    };
    match extract_palette_median_cut(src, mc, alpha_threshold as u8) {
        Ok(swatches) => {
            dst.fill(0);
            for (i, sw) in swatches.iter().enumerate() {
                dst[i * 2] = u32::from_le_bytes([sw.r, sw.g, sw.b, 255]);
                dst[i * 2 + 1] = sw.count;
            }
            count_to_i32(swatches.len())
        }
        Err(ref e) => error_to_ffi_code(e),
    }
}
