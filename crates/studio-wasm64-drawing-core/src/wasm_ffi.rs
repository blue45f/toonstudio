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

#[inline]
fn ranges_overlap(a_start: usize, a_len: usize, b_start: usize, b_len: usize) -> bool {
    if a_len == 0 || b_len == 0 {
        return false;
    }
    let a_end = a_start.saturating_add(a_len);
    let b_end = b_start.saturating_add(b_len);
    a_start < b_end && b_start < a_end
}

#[inline]
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
    let rgba_len = checked_rgba_len(width, height).map_err(|e| error_to_ffi_code(&e))?;
    let height_bytes = pixel_count
        .checked_mul(mem::size_of::<f32>())
        .ok_or(FFI_ERR_OVERFLOW)?;
    let params_bytes = params_f32_count * mem::size_of::<f32>();
    if rgba_len > isize::MAX as usize
        || height_bytes > isize::MAX as usize
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
            [32.0, 32.0, 12.0, 0.72, 0.35, 0.15, 0.0, 0.0, 0.25, 0.65, 1.0, 0.4, 0.55]
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
    let rgba_len = match validate_rgba_pair(dst_ptr as usize, src_ptr as usize, tile_width, tile_height) {
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
    match composite_tile_dirty_rect(dst, src, tile_width, tile_height, dirty, mode, opacity_u8 as u8) {
        Ok(processed) => count_to_i32(processed),
        Err(ref err) => error_to_ffi_code(err),
    }
}

/// 확장 3D 커널 기능 비트마스크
/// (`bit0`: VRM 4-본 스키닝, `bit1`: Morton 코드, `bit2`: G-Buffer LT 선화,
///  `bit3`: 베를레 스프링 물리, `bit4`: 15관절 손 FABRIK IK, `bit5`: 공간 음향 Foley DSP).
#[cfg(feature = "extended-3d")]
pub const WASM_EXTENDED_3D_CAPABILITIES: u32 = 0x3F;

/// `wasm_extract_lt_lineart_from_gbuffer`의 `params_ptr` 배열 길이(`f32` 6개).
#[cfg(feature = "extended-3d")]
pub const LT_LINEART_FFI_PARAM_COUNT: usize = 6;

/// `wasm_step_verlet_spring_chains_soa`의 `params_ptr` 배열 길이(`f32` 10개).
#[cfg(feature = "extended-3d")]
pub const VERLET_SPRING_FFI_PARAM_COUNT: usize = 10;

/// `wasm_solve_finger_fabrik_chain`의 `params_ptr` 배열 길이(`f32` 12개).
#[cfg(feature = "extended-3d")]
pub const FABRIK_FINGER_FFI_PARAM_COUNT: usize = 12;

/// `wasm_render_foley_biquad_block`의 `params_ptr` 배열 길이(`f32` 9개).
#[cfg(feature = "extended-3d")]
pub const FOLEY_DSP_FFI_PARAM_COUNT: usize = 9;

/// `wasm_render_foley_biquad_block`의 `state_ptr` 배열 길이(`f32` 5개).
#[cfg(feature = "extended-3d")]
pub const FOLEY_DSP_FFI_STATE_LEN: usize = 5;

/// `extended-3d` 피처 활성 시 확장 3D 커널 기능 비트마스크를 반환한다.
#[cfg(feature = "extended-3d")]
#[no_mangle]
#[must_use]
pub extern "C" fn wasm_extended_3d_capabilities() -> u32 { WASM_EXTENDED_3D_CAPABILITIES }

/// 2D 16비트 좌표를 32비트 Morton Z-Order 코드로 인코딩하는 C-ABI 진입점.
#[cfg(feature = "extended-3d")]
#[no_mangle]
#[must_use]
pub extern "C" fn wasm_encode_morton_2d_u32(x: u32, y: u32) -> u32 {
    crate::simd_bvh_skinning_kernel::encode_morton_2d_u32(
        x.min(u32::from(u16::MAX)) as u16,
        y.min(u32::from(u16::MAX)) as u16,
    )
}

/// 3D 10비트 좌표를 30비트 유효 Morton Z-Order 코드로 인코딩하는 C-ABI 진입점.
#[cfg(feature = "extended-3d")]
#[no_mangle]
#[must_use]
pub extern "C" fn wasm_encode_morton_3d_u32(x: u32, y: u32, z: u32) -> u32 {
    crate::simd_bvh_skinning_kernel::encode_morton_3d_u32(
        x.min(u32::from(u16::MAX)) as u16,
        y.min(u32::from(u16::MAX)) as u16,
        z.min(u32::from(u16::MAX)) as u16,
    )
}

#[cfg(feature = "extended-3d")]
#[inline]
fn checked_byte_len(count: usize, elem_size: usize) -> Result<usize, i32> {
    let bytes = count.checked_mul(elem_size).ok_or(FFI_ERR_OVERFLOW)?;
    if bytes > isize::MAX as usize { return Err(FFI_ERR_OVERFLOW); }
    Ok(bytes)
}

/// 선형 메모리 제로카피 SoA 4-본 VRM 스키닝 C-ABI 진입점 (`extended-3d` 피처 전용).
///
/// # Safety
/// 각 포인터는 명시된 길이·정렬 조건을 만족하는 유효 선형 메모리여야 하며, 출력 버퍼는 서로 및 모든 입력과 겹치지 않아야 한다.
#[cfg(feature = "extended-3d")]
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn wasm_skin_vrm_mesh_4bone_soa(
    in_pos_xyz_ptr: *const f32,
    in_norm_xyz_ptr: *const f32,
    joints_ptr: *const u16,
    weights_ptr: *const f32,
    bone_matrices_ptr: *const f32,
    out_pos_xyz_ptr: *mut f32,
    out_norm_xyz_ptr: *mut f32,
    vertex_count: u32,
    bone_count: u32,
) -> i32 {
    if bone_count == 0 { return FFI_ERR_INVALID_PARAMETER; }
    let n = vertex_count as usize;
    if n == 0 { return 0; }
    let f32_ptrs = [
        in_pos_xyz_ptr as usize, in_norm_xyz_ptr as usize, weights_ptr as usize,
        bone_matrices_ptr as usize, out_pos_xyz_ptr as usize, out_norm_xyz_ptr as usize,
    ];
    let f32_align = mem::align_of::<f32>();
    if f32_ptrs.iter().any(|&p| p == 0 || !p.is_multiple_of(f32_align))
        || joints_ptr.is_null() || !(joints_ptr as usize).is_multiple_of(mem::align_of::<u16>())
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let (Some(xyz_len), Some(w4_len)) = (n.checked_mul(3), n.checked_mul(4)) else { return FFI_ERR_OVERFLOW; };
    let (xyz_bytes, j4_bytes, w4_bytes, bone_bytes) = match (
        checked_byte_len(xyz_len, mem::size_of::<f32>()),
        checked_byte_len(w4_len, mem::size_of::<u16>()),
        checked_byte_len(w4_len, mem::size_of::<f32>()),
        checked_byte_len(bone_count as usize, mem::size_of::<[f32; 16]>()),
    ) {
        (Ok(a), Ok(b), Ok(c), Ok(d)) => (a, b, c, d),
        _ => return FFI_ERR_OVERFLOW,
    };
    let (out_pos, out_norm) = (out_pos_xyz_ptr as usize, out_norm_xyz_ptr as usize);
    let inputs = [
        (in_pos_xyz_ptr as usize, xyz_bytes), (in_norm_xyz_ptr as usize, xyz_bytes),
        (joints_ptr as usize, j4_bytes), (weights_ptr as usize, w4_bytes),
        (bone_matrices_ptr as usize, bone_bytes),
    ];
    if ranges_overlap(out_pos, xyz_bytes, out_norm, xyz_bytes)
        || inputs.iter().any(|&(a, l)| ranges_overlap(out_pos, xyz_bytes, a, l) || ranges_overlap(out_norm, xyz_bytes, a, l))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (in_pos, in_norm, joints, weights, bones, out_pos_s, out_norm_s) = unsafe {
        (
            slice::from_raw_parts(in_pos_xyz_ptr, xyz_len),
            slice::from_raw_parts(in_norm_xyz_ptr, xyz_len),
            slice::from_raw_parts(joints_ptr, w4_len),
            slice::from_raw_parts(weights_ptr, w4_len),
            slice::from_raw_parts(bone_matrices_ptr.cast::<[f32; 16]>(), bone_count as usize),
            slice::from_raw_parts_mut(out_pos_xyz_ptr, xyz_len),
            slice::from_raw_parts_mut(out_norm_xyz_ptr, xyz_len),
        )
    };
    let (opx, op_rest) = out_pos_s.split_at_mut(n);
    let (opy, opz) = op_rest.split_at_mut(n);
    let (onx, on_rest) = out_norm_s.split_at_mut(n);
    let (ony, onz) = on_rest.split_at_mut(n);
    let input = crate::simd_bvh_skinning_kernel::VrmMeshSoaInput {
        pos_x: &in_pos[0..n], pos_y: &in_pos[n..2 * n], pos_z: &in_pos[2 * n..3 * n],
        norm_x: &in_norm[0..n], norm_y: &in_norm[n..2 * n], norm_z: &in_norm[2 * n..3 * n],
        joints: [&joints[0..n], &joints[n..2 * n], &joints[2 * n..3 * n], &joints[3 * n..4 * n]],
        weights: [&weights[0..n], &weights[n..2 * n], &weights[2 * n..3 * n], &weights[3 * n..4 * n]],
    };
    let mut output = crate::simd_bvh_skinning_kernel::VrmMeshSoaOutput {
        pos_x: opx, pos_y: opy, pos_z: opz, norm_x: onx, norm_y: ony, norm_z: onz,
    };
    match crate::simd_bvh_skinning_kernel::skin_vrm_mesh_4bone_soa(&input, bones, &mut output) {
        Ok(stats) => count_to_i32(stats.skinned_vertices),
        Err(ref err) => error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 3D G-Buffer → 웹툰 LT 잉크 선화 추출 C-ABI 진입점 (`extended-3d` 피처 전용).
///
/// # Safety
/// 각 포인터는 명시된 길이·정렬 조건을 만족하는 유효 선형 메모리여야 하며, `out_alpha_ptr`은 입력 버퍼들과 겹치지 않아야 한다.
#[cfg(feature = "extended-3d")]
#[no_mangle]
pub unsafe extern "C" fn wasm_extract_lt_lineart_from_gbuffer(
    normal_xyz_ptr: *const f32,
    depth_ptr: *const f32,
    out_alpha_ptr: *mut u8,
    width: u32,
    height: u32,
    params_ptr: *const f32,
) -> i32 {
    let f32_align = mem::align_of::<f32>();
    if normal_xyz_ptr.is_null() || depth_ptr.is_null() || out_alpha_ptr.is_null()
        || !(normal_xyz_ptr as usize).is_multiple_of(f32_align)
        || !(depth_ptr as usize).is_multiple_of(f32_align)
        || (!params_ptr.is_null() && !(params_ptr as usize).is_multiple_of(f32_align))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let pixel_count = match checked_pixel_count(width, height) {
        Ok(p) => p,
        Err(ref err) => return error_to_ffi_code(err),
    };
    let Some(norm_len) = pixel_count.checked_mul(3) else { return FFI_ERR_OVERFLOW; };
    let (norm_bytes, depth_bytes) = match (
        checked_byte_len(norm_len, mem::size_of::<f32>()),
        checked_byte_len(pixel_count, mem::size_of::<f32>()),
    ) {
        (Ok(a), Ok(b)) => (a, b),
        _ => return FFI_ERR_OVERFLOW,
    };
    let out_addr = out_alpha_ptr as usize;
    let params_bytes = LT_LINEART_FFI_PARAM_COUNT * mem::size_of::<f32>();
    if ranges_overlap(out_addr, pixel_count, normal_xyz_ptr as usize, norm_bytes)
        || ranges_overlap(out_addr, pixel_count, depth_ptr as usize, depth_bytes)
        || (!params_ptr.is_null() && ranges_overlap(out_addr, pixel_count, params_ptr as usize, params_bytes))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (norm, depth, out_alpha, cfg) = unsafe {
        let cfg = if params_ptr.is_null() {
            crate::simd_bvh_skinning_kernel::LtLineArtConfig::default()
        } else {
            let p = *params_ptr.cast::<[f32; LT_LINEART_FFI_PARAM_COUNT]>();
            crate::simd_bvh_skinning_kernel::LtLineArtConfig {
                depth_threshold: p[0], normal_edge_threshold: p[1], depth_weight: p[2],
                normal_weight: p[3], edge_softness: p[4],
                min_ink_alpha: if p[5].is_finite() { p[5].clamp(0.0, 255.0).round() as u8 } else { 0 },
            }
        };
        (
            slice::from_raw_parts(normal_xyz_ptr, norm_len),
            slice::from_raw_parts(depth_ptr, pixel_count),
            slice::from_raw_parts_mut(out_alpha_ptr, pixel_count),
            cfg,
        )
    };
    match crate::simd_bvh_skinning_kernel::extract_lt_lineart_from_gbuffer(
        &norm[0..pixel_count], &norm[pixel_count..2 * pixel_count], &norm[2 * pixel_count..3 * pixel_count],
        depth, width, height, &cfg, out_alpha,
    ) {
        Ok(stats) => count_to_i32(stats.ink_pixels),
        Err(ref err) => error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 SoA 베를레(Verlet) 스프링 체인 물리 C-ABI 진입점 (`extended-3d` 피처 전용).
///
/// `params_ptr`은 null(기본값) 또는 10개 `f32` 배열
/// `[dt, stiffness, damping, wind_x, wind_y, wind_z, gravity_y, floor_y, floor_restitution, particle_radius]`이다.
///
/// # Safety
/// 모든 비-null 포인터는 4바이트 정렬된 유효 선형 메모리여야 하며 `pos_xyz_ptr`과 `prev_xyz_ptr`은 서로 및 모든 입력과 겹치지 않아야 한다.
#[cfg(feature = "extended-3d")]
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn wasm_step_verlet_spring_chains_soa(
    pos_xyz_ptr: *mut f32,
    prev_xyz_ptr: *mut f32,
    inv_mass_ptr: *const f32,
    rest_len_ptr: *const f32,
    colliders_ptr: *const f32,
    particle_count: u32,
    collider_count: u32,
    iterations: u32,
    params_ptr: *const f32,
) -> i32 {
    if collider_count > 4096 {
        return FFI_ERR_INVALID_PARAMETER;
    }
    let n = particle_count as usize;
    let c = collider_count as usize;
    let f32_align = mem::align_of::<f32>();
    if (!params_ptr.is_null() && !(params_ptr as usize).is_multiple_of(f32_align))
        || (c > 0 && (colliders_ptr.is_null() || !(colliders_ptr as usize).is_multiple_of(f32_align)))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let cfg = if params_ptr.is_null() {
        crate::virtual_3d_physics_kernel::VerletSpringConfig {
            iterations,
            ..crate::virtual_3d_physics_kernel::VerletSpringConfig::default()
        }
    } else {
        // SAFETY: `params_ptr`는 비-null이며 4바이트 정렬과 `VERLET_SPRING_FFI_PARAM_COUNT` 길이가 보장된다.
        let p = unsafe { *params_ptr.cast::<[f32; VERLET_SPRING_FFI_PARAM_COUNT]>() };
        crate::virtual_3d_physics_kernel::VerletSpringConfig {
            dt: p[0],
            stiffness: p[1],
            damping: p[2],
            wind_xyz: [p[3], p[4], p[5]],
            gravity_y: p[6],
            iterations,
            floor_y: p[7],
            floor_restitution: p[8],
            particle_radius: p[9],
        }
    };
    if n == 0 {
        let mut empty = crate::virtual_3d_physics_kernel::VerletSpringChainsSoa {
            pos_x: &mut [], pos_y: &mut [], pos_z: &mut [],
            prev_x: &mut [], prev_y: &mut [], prev_z: &mut [],
            inv_mass: &[], rest_len: &[],
        };
        return match crate::virtual_3d_physics_kernel::step_verlet_spring_chains_soa(&mut empty, &[], &cfg) {
            Ok(_) => 0,
            Err(ref err) => error_to_ffi_code(err),
        };
    }

    let required = [pos_xyz_ptr as usize, prev_xyz_ptr as usize, inv_mass_ptr as usize, rest_len_ptr as usize];
    if required.iter().any(|&p| p == 0 || !p.is_multiple_of(f32_align)) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let Some(xyz_len) = n.checked_mul(3) else { return FFI_ERR_OVERFLOW; };
    let Some(col_len) = c.checked_mul(4) else { return FFI_ERR_OVERFLOW; };
    let (xyz_bytes, n_bytes, col_bytes) = match (
        checked_byte_len(xyz_len, mem::size_of::<f32>()),
        checked_byte_len(n, mem::size_of::<f32>()),
        checked_byte_len(col_len, mem::size_of::<f32>()),
    ) {
        (Ok(a), Ok(b), Ok(cb)) => (a, b, cb),
        _ => return FFI_ERR_OVERFLOW,
    };
    let (pos_addr, prev_addr) = (pos_xyz_ptr as usize, prev_xyz_ptr as usize);
    let params_bytes = VERLET_SPRING_FFI_PARAM_COUNT * mem::size_of::<f32>();
    let ro_ranges = [
        (inv_mass_ptr as usize, n_bytes),
        (rest_len_ptr as usize, n_bytes),
        (colliders_ptr as usize, col_bytes),
        (params_ptr as usize, if params_ptr.is_null() { 0 } else { params_bytes }),
    ];
    if ranges_overlap(pos_addr, xyz_bytes, prev_addr, xyz_bytes)
        || ro_ranges.iter().any(|&(a, l)| {
            ranges_overlap(pos_addr, xyz_bytes, a, l) || ranges_overlap(prev_addr, xyz_bytes, a, l)
        })
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (pos_s, prev_s, inv_mass, rest_len, col_raw) = unsafe {
        (
            slice::from_raw_parts_mut(pos_xyz_ptr, xyz_len),
            slice::from_raw_parts_mut(prev_xyz_ptr, xyz_len),
            slice::from_raw_parts(inv_mass_ptr, n),
            slice::from_raw_parts(rest_len_ptr, n),
            if c == 0 { &[] } else { slice::from_raw_parts(colliders_ptr, col_len) },
        )
    };
    let mut colliders = Vec::with_capacity(c);
    for chunk in col_raw.as_chunks::<4>().0 {
        colliders.push(crate::virtual_3d_physics_kernel::SphereCollider::new(
            chunk[0], chunk[1], chunk[2], chunk[3],
        ));
    }
    let (px, p_rest) = pos_s.split_at_mut(n);
    let (py, pz) = p_rest.split_at_mut(n);
    let (ox, o_rest) = prev_s.split_at_mut(n);
    let (oy, oz) = o_rest.split_at_mut(n);
    let mut chains = crate::virtual_3d_physics_kernel::VerletSpringChainsSoa {
        pos_x: px, pos_y: py, pos_z: pz, prev_x: ox, prev_y: oy, prev_z: oz, inv_mass, rest_len,
    };
    match crate::virtual_3d_physics_kernel::step_verlet_spring_chains_soa(&mut chains, &colliders, &cfg) {
        Ok(stats) => count_to_i32(stats.particle_count),
        Err(ref err) => error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 3관절(MCP→PIP→DIP→Tip) 손가락 FABRIK IK C-ABI 진입점 (`extended-3d` 피처 전용).
///
/// `params_ptr`은 null(기본 해부학 제한) 또는 12개 `f32` 배열
/// `[palm_fx, palm_fy, palm_fz, flex_nx, flex_ny, flex_nz, mcp_max_flex, mcp_max_ext, mcp_max_splay, pip_max_flex, dip_max_flex, tolerance]`이다.
///
/// # Safety
/// 각 포인터는 4바이트 정렬된 유효 선형 메모리여야 하며 `joints_xyz_ptr`(12 `f32`)은 입력 버퍼들과 겹치지 않아야 한다.
#[cfg(feature = "extended-3d")]
#[no_mangle]
pub unsafe extern "C" fn wasm_solve_finger_fabrik_chain(
    joints_xyz_ptr: *mut f32,
    bone_lengths_ptr: *const f32,
    target_xyz_ptr: *const f32,
    max_iterations: u32,
    params_ptr: *const f32,
) -> i32 {
    let f32_align = mem::align_of::<f32>();
    if joints_xyz_ptr.is_null()
        || bone_lengths_ptr.is_null()
        || target_xyz_ptr.is_null()
        || !(joints_xyz_ptr as usize).is_multiple_of(f32_align)
        || !(bone_lengths_ptr as usize).is_multiple_of(f32_align)
        || !(target_xyz_ptr as usize).is_multiple_of(f32_align)
        || (!params_ptr.is_null() && !(params_ptr as usize).is_multiple_of(f32_align))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let j_bytes = 12 * mem::size_of::<f32>();
    let v3_bytes = 3 * mem::size_of::<f32>();
    let p_bytes = FABRIK_FINGER_FFI_PARAM_COUNT * mem::size_of::<f32>();
    let j_addr = joints_xyz_ptr as usize;
    if ranges_overlap(j_addr, j_bytes, bone_lengths_ptr as usize, v3_bytes)
        || ranges_overlap(j_addr, j_bytes, target_xyz_ptr as usize, v3_bytes)
        || (!params_ptr.is_null() && ranges_overlap(j_addr, j_bytes, params_ptr as usize, p_bytes))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·비중첩 검증 완료, 호출자가 유효 고정 크기 선형 메모리 버퍼를 보장한다.
    let (raw_j, bone_lengths, target, cfg) = unsafe {
        let cfg = if params_ptr.is_null() {
            crate::virtual_3d_physics_kernel::FingerFabrikConfig {
                max_iterations,
                ..crate::virtual_3d_physics_kernel::FingerFabrikConfig::default()
            }
        } else {
            let p = *params_ptr.cast::<[f32; FABRIK_FINGER_FFI_PARAM_COUNT]>();
            crate::virtual_3d_physics_kernel::FingerFabrikConfig {
                palm_forward: [p[0], p[1], p[2]],
                flexion_normal: [p[3], p[4], p[5]],
                limits: crate::virtual_3d_physics_kernel::FingerAngleLimits {
                    mcp_max_flexion_rad: p[6],
                    mcp_max_extension_rad: p[7],
                    mcp_max_splay_rad: p[8],
                    pip_max_flexion_rad: p[9],
                    dip_max_flexion_rad: p[10],
                },
                tolerance: p[11],
                max_iterations,
            }
        };
        (
            *joints_xyz_ptr.cast::<[f32; 12]>(),
            *bone_lengths_ptr.cast::<[f32; 3]>(),
            *target_xyz_ptr.cast::<[f32; 3]>(),
            cfg,
        )
    };
    let mut joints = [
        [raw_j[0], raw_j[1], raw_j[2]],
        [raw_j[3], raw_j[4], raw_j[5]],
        [raw_j[6], raw_j[7], raw_j[8]],
        [raw_j[9], raw_j[10], raw_j[11]],
    ];
    match crate::virtual_3d_physics_kernel::solve_finger_fabrik_chain(&mut joints, bone_lengths, target, &cfg) {
        Ok(res) => {
            let flat = [
                joints[0][0], joints[0][1], joints[0][2],
                joints[1][0], joints[1][1], joints[1][2],
                joints[2][0], joints[2][1], joints[2][2],
                joints[3][0], joints[3][1], joints[3][2],
            ];
            // SAFETY: `joints_xyz_ptr`는 검증된 4바이트 정렬 12 `f32` 쓰기 가능 버퍼다.
            unsafe { *joints_xyz_ptr.cast::<[f32; 12]>() = flat; }
            count_to_i32(res.iterations as usize)
        }
        Err(ref err) => error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 128-샘플 AudioWorklet 공간 음향 Foley Biquad + -24 LUFS 피크 리미터 C-ABI 진입점 (`extended-3d` 피처 전용).
///
/// `state_ptr`은 5개 `f32` 배열 `[z1, z2, limiter_env, lufs_energy_ewma, lufs_gain]`,
/// `params_ptr`은 null(기본 설정) 또는 9개 `f32` 배열
/// `[sample_rate, cutoff_hz, q_factor, pan, gain_db, limiter_ceiling, limiter_release_ms, target_lufs, enable_lufs_leveling]`이다.
///
/// # Safety
/// 모든 비-null 포인터는 4바이트 정렬된 유효 선형 메모리여야 하며 `out_left_ptr`, `out_right_ptr`, `state_ptr`은 서로 및 입력과 겹치지 않아야 한다.
#[cfg(feature = "extended-3d")]
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn wasm_render_foley_biquad_block(
    mono_in_ptr: *const f32,
    out_left_ptr: *mut f32,
    out_right_ptr: *mut f32,
    state_ptr: *mut f32,
    frame_count: u32,
    filter_mode: u32,
    params_ptr: *const f32,
) -> i32 {
    let Some(mode) = crate::virtual_3d_physics_kernel::FoleyFilterMode::from_u32(filter_mode) else {
        return FFI_ERR_INVALID_PARAMETER;
    };
    let f32_align = mem::align_of::<f32>();
    if state_ptr.is_null()
        || !(state_ptr as usize).is_multiple_of(f32_align)
        || (!params_ptr.is_null() && !(params_ptr as usize).is_multiple_of(f32_align))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let frames = frame_count as usize;
    let state_bytes = FOLEY_DSP_FFI_STATE_LEN * mem::size_of::<f32>();
    let params_bytes = if params_ptr.is_null() { 0 } else { FOLEY_DSP_FFI_PARAM_COUNT * mem::size_of::<f32>() };
    if ranges_overlap(state_ptr as usize, state_bytes, params_ptr as usize, params_bytes) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let cfg = if params_ptr.is_null() {
        crate::virtual_3d_physics_kernel::FoleyDspConfig {
            mode,
            ..crate::virtual_3d_physics_kernel::FoleyDspConfig::default()
        }
    } else {
        // SAFETY: `params_ptr`는 비-null이며 4바이트 정렬과 `FOLEY_DSP_FFI_PARAM_COUNT` 길이가 검증됐다.
        let p = unsafe { *params_ptr.cast::<[f32; FOLEY_DSP_FFI_PARAM_COUNT]>() };
        crate::virtual_3d_physics_kernel::FoleyDspConfig {
            sample_rate: p[0],
            mode,
            cutoff_hz: p[1],
            q_factor: p[2],
            pan: p[3],
            gain_db: p[4],
            limiter_ceiling: p[5],
            limiter_release_ms: p[6],
            target_lufs: p[7],
            enable_lufs_leveling: p[8] >= 0.5,
        }
    };

    // SAFETY: `state_ptr`는 비-null·4바이트 정렬·`FOLEY_DSP_FFI_STATE_LEN` 유효 버퍼다.
    let raw_s = unsafe { *state_ptr.cast::<[f32; FOLEY_DSP_FFI_STATE_LEN]>() };
    let mut state = crate::virtual_3d_physics_kernel::FoleyBiquadState {
        z1: raw_s[0],
        z2: raw_s[1],
        limiter_env: raw_s[2],
        lufs_energy_ewma: raw_s[3],
        lufs_gain: raw_s[4],
    };

    if frames == 0 {
        return match crate::virtual_3d_physics_kernel::render_foley_biquad_block(&[], &mut [], &mut [], &cfg, &mut state) {
            Ok(_) => {
                // SAFETY: `state_ptr`는 검증된 쓰기 가능 상태 버퍼다.
                unsafe {
                    *state_ptr.cast::<[f32; FOLEY_DSP_FFI_STATE_LEN]>() =
                        [state.z1, state.z2, state.limiter_env, state.lufs_energy_ewma, state.lufs_gain];
                }
                0
            }
            Err(ref err) => error_to_ffi_code(err),
        };
    }

    if mono_in_ptr.is_null()
        || out_left_ptr.is_null()
        || out_right_ptr.is_null()
        || !(mono_in_ptr as usize).is_multiple_of(f32_align)
        || !(out_left_ptr as usize).is_multiple_of(f32_align)
        || !(out_right_ptr as usize).is_multiple_of(f32_align)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let frame_bytes = match checked_byte_len(frames, mem::size_of::<f32>()) {
        Ok(b) => b,
        Err(code) => return code,
    };
    let (in_a, l_a, r_a, s_a, p_a) = (
        mono_in_ptr as usize, out_left_ptr as usize, out_right_ptr as usize,
        state_ptr as usize, params_ptr as usize,
    );
    if ranges_overlap(l_a, frame_bytes, r_a, frame_bytes)
        || ranges_overlap(l_a, frame_bytes, in_a, frame_bytes)
        || ranges_overlap(r_a, frame_bytes, in_a, frame_bytes)
        || ranges_overlap(l_a, frame_bytes, s_a, state_bytes)
        || ranges_overlap(r_a, frame_bytes, s_a, state_bytes)
        || ranges_overlap(in_a, frame_bytes, s_a, state_bytes)
        || ranges_overlap(l_a, frame_bytes, p_a, params_bytes)
        || ranges_overlap(r_a, frame_bytes, p_a, params_bytes)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료, 호출자가 `frames` 길이 유효 버퍼를 보장한다.
    let (mono_in, out_l, out_r) = unsafe {
        (
            slice::from_raw_parts(mono_in_ptr, frames),
            slice::from_raw_parts_mut(out_left_ptr, frames),
            slice::from_raw_parts_mut(out_right_ptr, frames),
        )
    };
    match crate::virtual_3d_physics_kernel::render_foley_biquad_block(mono_in, out_l, out_r, &cfg, &mut state) {
        Ok(stats) => {
            // SAFETY: `state_ptr`는 검증된 쓰기 가능 비중첩 상태 버퍼다.
            unsafe {
                *state_ptr.cast::<[f32; FOLEY_DSP_FFI_STATE_LEN]>() =
                    [state.z1, state.z2, state.limiter_env, state.lufs_energy_ewma, state.lufs_gain];
            }
            count_to_i32(stats.rendered_frames)
        }
        Err(ref err) => error_to_ffi_code(err),
    }
}
