//! WebAssembly C-ABI 선형 메모리 제로카피 FFI 진입점 모듈.
//!
//! 크레이트 루트 `#![deny(unsafe_code)]` 정책 아래 모든 핵심 연산 커널은 100% 안전 Rust로 유지하며,
//! JS 호스트와 Wasm 선형 메모리 간 포인터 경계 변환만 이 모듈의 최소 `unsafe` 블록에 격리한다.
//! 모든 FFI 함수는 panic 없이 음수 오류 코드를 반환한다.

#![allow(unsafe_code)]

use std::alloc::{self, Layout};
use std::mem;
use std::ptr;
use std::slice;

use crate::brush_kernel::{
    apply_impasto_lighting_rgba, mix_pigments_km, sample_world_paper_height, ImpastoLightConfig,
    PaperGrainConfig,
};
use crate::filter_warp_kernel::{gaussian_blur_rgba_into, unsharp_mask_rgba_into};
use crate::spectral_km_kernel::{mix_pigments_km16, mix_pigments_km16_strip};
use crate::tactile_texture_kernel::{
    generate_paper_tile_lut, stamp_tactile_bristle_rgba, PaperKind, TactileBrushParams,
};
use crate::tile_compositor_kernel::{composite_tile_dirty_rect, DirtyRect, TileBlendMode};
use crate::tile_delta_kernel::{fnv1a_checksum_32, xor_tile_delta_bytes};
use crate::{checked_pixel_count, checked_rgba_len, DrawingCoreError};

/// `wasm_stamp_tactile_bristle`의 `params_ptr` 배열 길이(`f32` 13개).
pub const TACTILE_BRUSH_FFI_PARAM_COUNT: usize = 13;

/// 모든 선형 메모리 할당을 16바이트 경계로 정렬해 `Uint8Array`·`Float32Array` 제로카피 뷰를 보장한다.
const WASM_ALLOC_ALIGN: usize = 16;

/// FFI 오류 코드 규약 (음수는 실패, 0 이상은 처리된 픽셀/바이트 수).
pub const FFI_ERR_NULL_OR_ALIAS: i32 = -1;
pub const FFI_ERR_INVALID_DIMENSIONS: i32 = -2;
pub const FFI_ERR_INVALID_PARAMETER: i32 = -3;
pub const FFI_ERR_BUFFER_LENGTH: i32 = -4;
pub const FFI_ERR_OVERFLOW: i32 = -5;

/// 익스포트된 Wasm 핫패스 커널 기능 비트마스크 (`0x7F` = 7종 커널 활성).
pub const WASM_HOTPATH_CAPABILITIES: u32 = 0x7F;

fn error_to_ffi_code(err: &DrawingCoreError) -> i32 {
    match err {
        DrawingCoreError::InvalidDimensions { .. } => FFI_ERR_INVALID_DIMENSIONS,
        DrawingCoreError::InvalidParameter { .. } => FFI_ERR_INVALID_PARAMETER,
        DrawingCoreError::BufferLengthMismatch { .. }
        | DrawingCoreError::TileSizeMismatch { .. } => FFI_ERR_BUFFER_LENGTH,
        _ => FFI_ERR_OVERFLOW,
    }
}

#[inline(never)]
fn ranges_overlap(a_start: usize, a_len: usize, b_start: usize, b_len: usize) -> bool {
    if a_len == 0 || b_len == 0 {
        return false;
    }
    let a_end = a_start.saturating_add(a_len);
    let b_end = b_start.saturating_add(b_len);
    a_start < b_end && b_start < a_end
}

#[inline(never)]
fn count_to_i32(count: usize) -> i32 {
    i32::try_from(count).unwrap_or(i32::MAX)
}

/// 코어 ABI 버전 번호를 반환한다.
#[no_mangle]
#[must_use]
pub extern "C" fn wasm_drawing_core_abi_version() -> u32 {
    1
}

/// 컴파일된 `.wasm` 모듈이 노출하는 핫패스 커널 기능 비트마스크를 반환한다.
#[no_mangle]
#[must_use]
pub extern "C" fn wasm_hotpath_capabilities() -> u32 {
    WASM_HOTPATH_CAPABILITIES
}

/// 선형 메모리에서 16바이트 정렬된 작업 버퍼를 할당한다. 실패 또는 0바이트 요청 시 null 반환.
#[no_mangle]
#[must_use]
pub extern "C" fn wasm_alloc(byte_len: usize) -> *mut u8 {
    if byte_len == 0 {
        return ptr::null_mut();
    }
    let Ok(layout) = Layout::from_size_align(byte_len, WASM_ALLOC_ALIGN) else {
        return ptr::null_mut();
    };
    // SAFETY: `byte_len > 0`이고 `Layout::from_size_align`이 크기·정렬 불변식을 검증했다.
    unsafe { alloc::alloc(layout) }
}

/// `wasm_alloc`으로 할당한 선형 메모리 버퍼를 해제한다.
///
/// # Safety
/// `ptr`은 반드시 동일한 `byte_len`으로 `wasm_alloc`이 반환한 포인터이거나 null이어야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_free(ptr: *mut u8, byte_len: usize) {
    if ptr.is_null() || byte_len == 0 {
        return;
    }
    let Ok(layout) = Layout::from_size_align(byte_len, WASM_ALLOC_ALIGN) else {
        return;
    };
    // SAFETY: 호출자가 `wasm_alloc(byte_len)`이 반환한 유효 포인터와 동일 레이아웃을 전달했다.
    unsafe { alloc::dealloc(ptr, layout) };
}

/// 패킹된 RGBA8 두 색상을 3채널 Kubelka-Munk 감산 혼색하는 스칼라 진입점.
#[no_mangle]
#[must_use]
pub extern "C" fn wasm_mix_pigments_km_packed(rgba_a: u32, rgba_b: u32, ratio: f32) -> u32 {
    let a = rgba_a.to_le_bytes();
    let b = rgba_b.to_le_bytes();
    match mix_pigments_km(a, b, ratio) {
        Ok(mixed) => u32::from_le_bytes(mixed),
        Err(_) => rgba_a,
    }
}

/// 패킹된 RGBA8 두 색상을 16파장(400~700nm) 5안료 Kubelka-Munk 분광 모델로 혼색하는 스칼라 진입점.
#[no_mangle]
#[must_use]
pub extern "C" fn wasm_mix_pigments_km16_packed(rgba_a: u32, rgba_b: u32, ratio: f32) -> u32 {
    let a = rgba_a.to_le_bytes();
    let b = rgba_b.to_le_bytes();
    match mix_pigments_km16(a, b, ratio) {
        Ok(mixed) => u32::from_le_bytes(mixed),
        Err(_) => rgba_a,
    }
}

/// 선형 메모리 RGBA8 버퍼 구간에 16파장 Kubelka-Munk 분광 혼색을 제자리 일괄 수행한다.
///
/// # Safety
/// `dst_ptr`과 `src_ptr`은 각각 `pixel_count * 4`바이트 이상의 유효하고 비중첩된 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_mix_pigments_km16_strip(
    dst_ptr: *mut u8,
    src_ptr: *const u8,
    pixel_count: u32,
    ratio: f32,
) -> i32 {
    if dst_ptr.is_null() || src_ptr.is_null() {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let Some(byte_len) = (pixel_count as usize).checked_mul(4) else {
        return FFI_ERR_OVERFLOW;
    };
    if byte_len == 0 {
        return 0;
    }
    if byte_len > isize::MAX as usize
        || ranges_overlap(dst_ptr as usize, byte_len, src_ptr as usize, byte_len)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    // SAFETY: null·오버플로·비중첩 검증 완료, 호출자가 `byte_len` 유효 범위를 보장한다.
    let (dst, src) = unsafe {
        (
            slice::from_raw_parts_mut(dst_ptr, byte_len),
            slice::from_raw_parts(src_ptr, byte_len),
        )
    };
    match mix_pigments_km16_strip(dst, src, ratio) {
        Ok(processed) => count_to_i32(processed),
        Err(ref err) => error_to_ffi_code(err),
    }
}

/// 월드 좌표 고정 2층 종이 높이장을 샘플링하는 스칼라 진입점.
#[no_mangle]
#[must_use]
pub extern "C" fn wasm_sample_world_paper_height(
    world_x: f32,
    world_y: f32,
    grain_scale: f32,
    seed: u32,
) -> f32 {
    let config = PaperGrainConfig {
        macro_scale: grain_scale,
        micro_scale: grain_scale * 4.0,
        macro_weight: 0.65,
        micro_weight: 0.35,
        seed,
    };
    sample_world_paper_height(world_x, world_y, &config).unwrap_or(-1.0)
}

/// 선형 메모리 제로카피 분리형 가우시안 블러 커널 (`mask_ptr == null`이면 전체 고속 경로).
///
/// # Safety
/// `src_ptr`·`dst_ptr`은 `width * height * 4`바이트 비중첩 유효 버퍼, `mask_ptr`은 null 또는 `width * height`바이트 유효 버퍼여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_gaussian_blur_rgba(
    src_ptr: *const u8,
    mask_ptr: *const u8,
    dst_ptr: *mut u8,
    width: u32,
    height: u32,
    sigma: f32,
) -> i32 {
    let rgba_len = match validate_rgba_pair(dst_ptr as usize, src_ptr as usize, width, height) {
        Ok(n) => n,
        Err(code) => return code,
    };
    let pixel_count = rgba_len / 4;
    if !mask_ptr.is_null()
        && ranges_overlap(mask_ptr as usize, pixel_count, dst_ptr as usize, rgba_len)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: 크기 오버플로·null·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (src, dst, mask) = unsafe {
        let src_slice = slice::from_raw_parts(src_ptr, rgba_len);
        let dst_slice = slice::from_raw_parts_mut(dst_ptr, rgba_len);
        let mask_opt = if mask_ptr.is_null() {
            None
        } else {
            Some(slice::from_raw_parts(mask_ptr, pixel_count))
        };
        (src_slice, dst_slice, mask_opt)
    };

    match gaussian_blur_rgba_into(src, mask, dst, width, height, sigma) {
        Ok(processed) => count_to_i32(processed),
        Err(ref err) => error_to_ffi_code(err),
    }
}

#[inline(never)]
fn validate_rgba_pair(
    dst_addr: usize,
    src_addr: usize,
    width: u32,
    height: u32,
) -> Result<usize, i32> {
    if dst_addr == 0 || src_addr == 0 {
        return Err(FFI_ERR_NULL_OR_ALIAS);
    }
    let rgba_len = checked_rgba_len(width, height).map_err(|e| error_to_ffi_code(&e))?;
    if rgba_len > isize::MAX as usize || ranges_overlap(src_addr, rgba_len, dst_addr, rgba_len) {
        return Err(FFI_ERR_NULL_OR_ALIAS);
    }
    Ok(rgba_len)
}

/// 선형 메모리 제로카피 512² 호환 언샤프 마스크 커널. 변경된 픽셀 수를 반환한다.
///
/// # Safety
/// `src_ptr`과 `dst_ptr`은 `width * height * 4`바이트 이상의 비중첩 유효 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_unsharp_mask_rgba(
    src_ptr: *const u8,
    dst_ptr: *mut u8,
    width: u32,
    height: u32,
    sigma: f32,
    amount: f32,
    threshold: u8,
) -> i32 {
    let rgba_len = match validate_rgba_pair(dst_ptr as usize, src_ptr as usize, width, height) {
        Ok(n) => n,
        Err(code) => return code,
    };

    // SAFETY: null·크기·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (src, dst) = unsafe {
        (
            slice::from_raw_parts(src_ptr, rgba_len),
            slice::from_raw_parts_mut(dst_ptr, rgba_len),
        )
    };

    match unsharp_mask_rgba_into(src, dst, width, height, sigma, amount, threshold) {
        Ok(modified) => count_to_i32(modified),
        Err(ref err) => error_to_ffi_code(err),
    }
}

#[inline(never)]
fn validate_rgba_height_ptrs(
    rgba_addr: usize,
    height_addr: usize,
    params_addr: usize,
    width: u32,
    height: u32,
    params_f32_count: usize,
) -> Result<(usize, usize), i32> {
    if rgba_addr == 0 || height_addr == 0 {
        return Err(FFI_ERR_NULL_OR_ALIAS);
    }
    let f32_align = mem::align_of::<f32>();
    if !height_addr.is_multiple_of(f32_align)
        || (params_addr != 0 && !params_addr.is_multiple_of(f32_align))
    {
        return Err(FFI_ERR_NULL_OR_ALIAS);
    }
    let pixel_count = checked_pixel_count(width, height).map_err(|e| error_to_ffi_code(&e))?;
    // RGBA8 한 픽셀과 f32 높이 한 칸은 모두 4바이트다. 기존 RGBA 오버플로 오류를 유지한다.
    let rgba_len = pixel_count
        .checked_mul(4)
        .ok_or(FFI_ERR_INVALID_DIMENSIONS)?;
    let height_bytes = rgba_len;
    let params_bytes = params_f32_count * mem::size_of::<f32>();
    if rgba_len > isize::MAX as usize
        || ranges_overlap(rgba_addr, rgba_len, height_addr, height_bytes)
        || (params_addr != 0
            && (ranges_overlap(rgba_addr, rgba_len, params_addr, params_bytes)
                || ranges_overlap(height_addr, height_bytes, params_addr, params_bytes)))
    {
        return Err(FFI_ERR_NULL_OR_ALIAS);
    }
    Ok((pixel_count, rgba_len))
}

/// 선형 메모리 제로카피 2.5D 임파스토 Sobel 법선 Blinn-Phong 셰이딩 커널.
///
/// `light_params_ptr`은 null(기본 설정) 또는 7개 `f32` 배열
/// `[azimuth_rad, elevation_rad, relief_strength, ambient, diffuse_strength, specular_strength, shininess]`를 가리킨다.
///
/// # Safety
/// `rgba_ptr`은 `width * height * 4`바이트, `height_ptr`은 4바이트 정렬된 `width * height`개의 `f32`,
/// `light_params_ptr`은 null 또는 4바이트 정렬된 7개의 `f32` 유효 메모리이며 서로 겹치지 않아야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_apply_impasto_lighting_rgba(
    rgba_ptr: *mut u8,
    height_ptr: *const f32,
    width: u32,
    height: u32,
    light_params_ptr: *const f32,
) -> i32 {
    let (pixel_count, rgba_len) = match validate_rgba_height_ptrs(
        rgba_ptr as usize,
        height_ptr as usize,
        light_params_ptr as usize,
        width,
        height,
        7,
    ) {
        Ok(lens) => lens,
        Err(code) => return code,
    };

    // SAFETY: null·정렬·크기·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (rgba, height_map, light) = unsafe {
        let rgba_slice = slice::from_raw_parts_mut(rgba_ptr, rgba_len);
        let height_slice = slice::from_raw_parts(height_ptr, pixel_count);
        let cfg = if light_params_ptr.is_null() {
            ImpastoLightConfig::default()
        } else {
            let p = *light_params_ptr.cast::<[f32; 7]>();
            ImpastoLightConfig {
                azimuth_rad: p[0],
                elevation_rad: p[1],
                relief_strength: p[2],
                ambient: p[3],
                diffuse_strength: p[4],
                specular_strength: p[5],
                shininess: p[6],
            }
        };
        (rgba_slice, height_slice, cfg)
    };

    match apply_impasto_lighting_rgba(rgba, height_map, width, height, &light) {
        Ok(stats) => count_to_i32(stats.shaded_pixels),
        Err(ref err) => error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 타일 XOR 델타 인코딩 커널. 변경된 바이트 수를 반환한다.
///
/// # Safety
/// `prev_ptr`, `next_ptr`, `out_ptr`은 `byte_len`바이트 유효 메모리이며 `out_ptr`은 입력들과 겹치지 않아야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_xor_tile_delta_bytes(
    prev_ptr: *const u8,
    next_ptr: *const u8,
    out_ptr: *mut u8,
    byte_len: u32,
) -> i32 {
    if prev_ptr.is_null() || next_ptr.is_null() || out_ptr.is_null() {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let len = byte_len as usize;
    if len == 0 {
        return 0;
    }
    if len > isize::MAX as usize
        || ranges_overlap(prev_ptr as usize, len, out_ptr as usize, len)
        || ranges_overlap(next_ptr as usize, len, out_ptr as usize, len)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    // SAFETY: null·크기·출력 비중첩 검증 완료, 호출자가 유효 범위를 보장한다.
    let (prev, next, out) = unsafe {
        (
            slice::from_raw_parts(prev_ptr, len),
            slice::from_raw_parts(next_ptr, len),
            slice::from_raw_parts_mut(out_ptr, len),
        )
    };
    match xor_tile_delta_bytes(prev, next, out) {
        Ok(changed) => count_to_i32(changed),
        Err(ref err) => error_to_ffi_code(err),
    }
}

/// 선형 메모리 구간에 대한 32비트 FNV-1a 체크섬을 반환한다.
///
/// # Safety
/// `ptr`은 null이거나 `byte_len`바이트 이상의 유효 메모리여야 한다.
#[no_mangle]
#[must_use]
pub unsafe extern "C" fn wasm_fnv1a_checksum(ptr: *const u8, byte_len: u32) -> u32 {
    let len = byte_len as usize;
    if ptr.is_null() || len == 0 || len > isize::MAX as usize {
        return fnv1a_checksum_32(&[]);
    }
    // SAFETY: null·길이 검증 완료, 호출자가 유효 범위를 보장한다.
    let bytes = unsafe { slice::from_raw_parts(ptr, len) };
    fnv1a_checksum_32(bytes)
}

/// 선형 메모리 제로카피 5층 물리 브러시 질감 스탬퍼.
///
/// `params_ptr`은 null(기본값) 또는 4바이트 정렬된 13개 `f32` 배열
/// `[cx, cy, radius, pressure, speed, tilt_x, tilt_y, direction_rad, dryness,
///   paper_tooth_strength, paper_scale, wet_edge_strength, impasto_height]`를 가리킨다.
/// 반환값: 0 이상은 영향을 받은 픽셀 수, 음수는 `FFI_ERR_*` 오류 코드.
///
/// # Safety
/// `rgba_ptr`은 `width * height * 4`바이트, `height_ptr`은 4바이트 정렬된 `width * height`개의 `f32`,
/// `params_ptr`은 null 또는 4바이트 정렬된 13개의 `f32` 유효 메모리이며 서로 겹치지 않아야 한다.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn wasm_stamp_tactile_bristle(
    rgba_ptr: *mut u8,
    height_ptr: *mut f32,
    width: u32,
    height: u32,
    paper_kind: u32,
    color_rgba_packed: u32,
    bristle_count: u32,
    seed: u32,
    params_ptr: *const f32,
) -> i32 {
    let Some(kind) = PaperKind::from_u32(paper_kind) else {
        return FFI_ERR_INVALID_PARAMETER;
    };
    let (pixel_count, rgba_len) = match validate_rgba_height_ptrs(
        rgba_ptr as usize,
        height_ptr as usize,
        params_ptr as usize,
        width,
        height,
        TACTILE_BRUSH_FFI_PARAM_COUNT,
    ) {
        Ok(lens) => lens,
        Err(code) => return code,
    };

    // SAFETY: null·정렬·길이 오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (rgba, height_buf, params) = unsafe {
        let rgba_slice = slice::from_raw_parts_mut(rgba_ptr, rgba_len);
        let height_slice = slice::from_raw_parts_mut(height_ptr, pixel_count);
        let p = if params_ptr.is_null() {
            [
                32.0, 32.0, 12.0, 0.72, 0.35, 0.15, 0.0, 0.0, 0.25, 0.65, 1.0, 0.4, 0.55,
            ]
        } else {
            *params_ptr.cast::<[f32; TACTILE_BRUSH_FFI_PARAM_COUNT]>()
        };
        let cfg = TactileBrushParams {
            cx: p[0],
            cy: p[1],
            radius: p[2],
            color_rgba: color_rgba_packed.to_le_bytes(),
            pressure: p[3],
            speed: p[4],
            tilt_x: p[5],
            tilt_y: p[6],
            direction_rad: p[7],
            dryness: p[8],
            bristle_count: bristle_count.min(u32::from(u8::MAX)) as u8,
            paper_tooth_strength: p[9],
            paper_scale: p[10],
            wet_edge_strength: p[11],
            impasto_height: p[12],
            seed,
        };
        (rgba_slice, height_slice, cfg)
    };

    let paper_lut = generate_paper_tile_lut(kind, seed);
    match stamp_tactile_bristle_rgba(rgba, height_buf, width, height, &paper_lut, &params) {
        Ok(stats) => count_to_i32(stats.touched_pixels),
        Err(ref err) => error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 희소 타일 Dirty-Rect 12종 블렌드 합성기.
///
/// 반환값: 0 이상은 Dirty-Rect 내에서 처리된 픽셀 수, 음수는 `FFI_ERR_*` 오류 코드.
///
/// # Safety
/// `dst_ptr`과 `src_ptr`은 각각 `tile_width * tile_height * 4`바이트 이상의 비중첩 유효 메모리여야 한다.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn wasm_composite_tile_dirty_rect(
    dst_ptr: *mut u8,
    src_ptr: *const u8,
    tile_width: u32,
    tile_height: u32,
    dirty_x: u32,
    dirty_y: u32,
    dirty_width: u32,
    dirty_height: u32,
    blend_mode: u32,
    opacity_u8: u32,
) -> i32 {
    let Some(mode) = TileBlendMode::from_u32(blend_mode) else {
        return FFI_ERR_INVALID_PARAMETER;
    };
    if opacity_u8 > 255 {
        return FFI_ERR_INVALID_PARAMETER;
    }
    let rgba_len =
        match validate_rgba_pair(dst_ptr as usize, src_ptr as usize, tile_width, tile_height) {
            Ok(n) => n,
            Err(code) => return code,
        };

    // SAFETY: null·길이 오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (dst, src) = unsafe {
        (
            slice::from_raw_parts_mut(dst_ptr, rgba_len),
            slice::from_raw_parts(src_ptr, rgba_len),
        )
    };

    let dirty = DirtyRect {
        x: dirty_x,
        y: dirty_y,
        width: dirty_width,
        height: dirty_height,
    };
    match composite_tile_dirty_rect(
        dst,
        src,
        tile_width,
        tile_height,
        dirty,
        mode,
        opacity_u8 as u8,
    ) {
        Ok(processed) => count_to_i32(processed),
        Err(ref err) => error_to_ffi_code(err),
    }
}

#[cfg(feature = "extended-3d")]
mod atelier_stage_3d;
#[cfg(feature = "extended-3d")]
pub use atelier_stage_3d::{
    wasm_atelier_stage_3d_capabilities, wasm_cull_stage_frustum_hiz,
    wasm_evaluate_stage_acoustics_and_lighting, wasm_resolve_stage_sphere_overlaps,
    STAGE_AUDIO_OUT_STRIDE, STAGE_AUDIO_SOURCE_STRIDE, STAGE_CAST_SAMPLE_STRIDE,
    STAGE_CULL_AABB_STRIDE, STAGE_CULL_CAMERA_FFI_LEN, STAGE_CULL_STATS_FFI_LEN,
    STAGE_LIGHTING_OUT_STRIDE, STAGE_LIGHT_STRIDE, STAGE_LISTENER_FFI_LEN,
    STAGE_SPHERE_BODY_STRIDE, WASM_ATELIER_STAGE_3D_CAPABILITIES,
};

#[cfg(feature = "extended-3d")]
mod extended_3d;
#[cfg(feature = "extended-3d")]
pub use extended_3d::{
    wasm_encode_morton_2d_u32, wasm_encode_morton_3d_u32, wasm_extended_3d_capabilities,
    wasm_extract_lt_lineart_from_gbuffer, wasm_skin_vrm_mesh_4bone_soa, LT_LINEART_FFI_PARAM_COUNT,
    WASM_EXTENDED_3D_CAPABILITIES,
};

#[cfg(feature = "virtual-3d-physics")]
mod virtual_3d_physics;
#[cfg(feature = "virtual-3d-physics")]
pub use virtual_3d_physics::{
    wasm_render_foley_biquad_block, wasm_solve_finger_fabrik_chain,
    wasm_step_verlet_spring_chains_soa,
};
#[cfg(feature = "virtual-3d-physics")]
pub const VERLET_SPRING_FFI_PARAM_COUNT: usize = 10;
#[cfg(feature = "virtual-3d-physics")]
pub const FABRIK_FINGER_FFI_PARAM_COUNT: usize = 12;
#[cfg(feature = "virtual-3d-physics")]
pub const FOLEY_DSP_FFI_PARAM_COUNT: usize = 9;
#[cfg(feature = "virtual-3d-physics")]
pub const FOLEY_DSP_FFI_STATE_LEN: usize = 5;

#[cfg(feature = "pro-raster-tools")]
mod pro_raster_tools;
#[cfg(feature = "pro-raster-tools")]
pub use pro_raster_tools::{
    wasm_extract_marching_ants_segments, wasm_flood_fill_rgba, wasm_liquify_displace_rgba,
    wasm_magic_wand_mask, wasm_oklch_to_rgba_batch, wasm_parse_psd_header,
    wasm_render_halftone_screentone, wasm_rgba_to_cmyk_batch, wasm_rgba_to_oklch_batch,
    wasm_vectorize_stroke_cubic, wasm_warp_mesh_rigid_mls, DIRTY_RECT_FFI_U32_LEN,
    HALFTONE_FFI_PARAM_COUNT, LIQUIFY_FFI_PARAM_COUNT, MARCHING_ANT_SEGMENT_STRIDE,
    MLS_WARP_PIN_STRIDE, PSD_HEADER_FFI_U64_LEN, VECTORIZE_POINT_STRIDE,
    VECTORIZE_SEGMENT_STRIDE, VECTORIZE_STATS_LEN,
};

/// 확장 스위트(`extended-3d` / `virtual-3d-physics` / `pro-raster-tools`) 통합 기능 비트마스크.
///
/// - `bits 0..=5`  (`0x0000_003F`): `extended-3d` (VRM 4-본 스키닝, Morton 2D/3D, LT 선화, Hi-Z 컬링, 공간 해시 구체, 공간 음향·광원)
/// - `bits 6..=8`  (`0x0000_01C0`): `virtual-3d-physics` (Verlet 스프링, 손가락 FABRIK IK, Foley Biquad DSP)
/// - `bits 9..=18` (`0x0007_FE00`): `pro-raster-tools` (MLS 워프, 3차 베지어 벡터라이저, PSD 파서, 플러드 필, 매직 완드, 마칭 앤츠, OKLCH, CMYK, 하프톤, 리퀴파이)
#[cfg(any(
    feature = "extended-3d",
    feature = "virtual-3d-physics",
    feature = "pro-raster-tools"
))]
pub const WASM_EXTENDED_CAPABILITIES: u32 = {
    let mut mask = 0u32;
    if cfg!(feature = "extended-3d") {
        mask |= 0x0000_003F;
    }
    if cfg!(feature = "virtual-3d-physics") {
        mask |= 0x0000_01C0;
    }
    if cfg!(feature = "pro-raster-tools") {
        mask |= 0x0007_FE00;
    }
    mask
};

/// 컴파일된 확장 `.wasm` 모듈이 활성화한 통합 확장 기능 비트마스크를 반환한다.
#[cfg(any(
    feature = "extended-3d",
    feature = "virtual-3d-physics",
    feature = "pro-raster-tools"
))]
#[no_mangle]
#[must_use]
pub extern "C" fn wasm_extended_capabilities() -> u32 {
    WASM_EXTENDED_CAPABILITIES
}

#[cfg(any(feature = "pro-raster-tools", feature = "extended-3d"))]
mod wave2_native_kernels;
#[cfg(any(feature = "pro-raster-tools", feature = "extended-3d"))]
pub use wave2_native_kernels::{wasm_wave2_capabilities, WASM_WAVE2_CAPABILITIES};
#[cfg(feature = "pro-raster-tools")]
pub use wave2_native_kernels::{wasm_packbits_rle_decode, wasm_packbits_rle_encode};
#[cfg(feature = "extended-3d")]
pub use wave2_native_kernels::{
    wasm_raycast_mesh_sah_bvh_3d, wasm_solve_ccd_spine_ik_3d, wasm_solve_two_bone_ik_3d,
    CCD_SPINE_IK_FFI_PARAM_LEN, SAH_BVH_HIT_FFI_LEN, SAH_BVH_RAY_FFI_LEN,
    TWO_BONE_IK_FFI_OUT_LEN, TWO_BONE_IK_FFI_PARAM_LEN,
};

#[cfg(feature = "extended-suite")]
mod wave3_native_kernels;
#[cfg(feature = "extended-suite")]
mod wave3_slicer_color;
#[cfg(feature = "extended-suite")]
pub use wave3_native_kernels::{
    wasm_audio_biquad_eq_stereo, wasm_audio_mix_master_stereo, wasm_audio_resample_mono,
    wasm_audio_schroeder_reverb_stereo, wasm_vector_expand_stroke_outline,
    wasm_vector_flatten_bezier_arc_len, wasm_vector_hit_test_batch, wasm_vector_simplify_rdp,
    wasm_vector_smooth_chaikin, wasm_wave3_capabilities, WASM_WAVE3_CAPABILITIES,
    WAVE3_BEZIER_CTRL_LEN, WAVE3_BIQUAD_PARAM_LEN, WAVE3_BIQUAD_STATE_LEN,
    WAVE3_DYNAMICS_PARAM_LEN, WAVE3_MIX_METRICS_LEN, WAVE3_MIX_TRACK_STRIDE,
    WAVE3_REVERB_PARAM_LEN,
};
#[cfg(feature = "extended-suite")]
pub use wave3_slicer_color::{
    wasm_color_extract_palette_median_cut, wasm_color_p3_to_srgb_batch,
    wasm_color_rgba_to_cmyk_tac_batch, wasm_color_srgb_to_p3_batch, wasm_webtoon_dedup_tiles_fnv64,
    wasm_webtoon_plan_smart_slices, WAVE3_CMYK_TAC_PARAM_LEN, WAVE3_CMYK_TAC_STATS_LEN,
    WAVE3_DEDUP_ENTRY_U64_STRIDE, WAVE3_DEDUP_SUMMARY_LEN, WAVE3_PALETTE_SWATCH_U32_STRIDE,
    WAVE3_SLICE_PARAM_LEN, WAVE3_SLICE_SPAN_STRIDE,
};
