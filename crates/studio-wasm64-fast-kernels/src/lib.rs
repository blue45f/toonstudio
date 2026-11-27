//! ToonStudio Wave-54 `fast-anything` 외곽 루프 4종 Rust WASM64(memory64) + WASM32 가속 크레이트.
//!
//! - `target_family = "wasm"` 빌드에서는 `#![no_std]` + `extern crate alloc`로 컴파일되어
//!   `-Z build-std=core,alloc`로 실제 `wasm64-unknown-unknown` (`memory64`, Section 5 `flags = 0x04`)과
//!   `wasm32-unknown-unknown` (`flags = 0x00`) 바이너리를 모두 생성한다.
//! - 모든 핵심 알고리즘(`kernels` 모듈)은 `#![forbid(unsafe_code)]` 순수 안전 Rust이며,
//!   C-ABI 선형 메모리 포인터 경계만 이 파일의 최소 `unsafe` 블록에 격리한다.

#![cfg_attr(target_family = "wasm", no_std)]
#![cfg_attr(target_arch = "wasm64", feature(simd_wasm64))]
#![deny(unsafe_code)]

extern crate alloc;

#[cfg(target_family = "wasm")]
mod allocator;

pub mod kernels;

pub use kernels::{
    meijster_edt2d_sq_f32, oil_bristle_stamp_accumulate_rgba, pack_bc1_tile_rgba_to_64bit,
    sdf_gap_close_flood_fill_u8, FastKernelError, OilBristleConfig,
};

/// FFI ABI 버전 번호.
pub const FAST_KERNELS_ABI_VERSION: u32 = 1;
/// 4종 외곽 루프 커널 기능 비트마스크 (`0b1111 = 0x0F`).
pub const FAST_KERNELS_CAPABILITIES: u32 = 0x0F;

/// 선형 메모리 할당 정렬(16바이트).
const WASM_ALLOC_ALIGN: usize = 16;

/// FFI 오류 코드 규약 (음수는 오류, 0 이상은 처리된 픽셀/블록 수).
pub const FFI_ERR_NULL_OR_ALIAS: i32 = -1;
pub const FFI_ERR_INVALID_DIMENSIONS: i32 = -2;
pub const FFI_ERR_INVALID_PARAMETER: i32 = -3;
pub const FFI_ERR_BUFFER_LENGTH: i32 = -4;
pub const FFI_ERR_OUT_OF_BOUNDS: i32 = -5;

fn map_kernel_error(err: FastKernelError) -> i32 {
    match err {
        FastKernelError::InvalidDimensions => FFI_ERR_INVALID_DIMENSIONS,
        FastKernelError::BufferLengthMismatch => FFI_ERR_BUFFER_LENGTH,
        FastKernelError::InvalidParameter => FFI_ERR_INVALID_PARAMETER,
        FastKernelError::OutOfBoundsSeed => FFI_ERR_OUT_OF_BOUNDS,
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

/// FFI 경계 모듈 (선형 메모리 포인터 검증 및 슬라이스 변환 전용 최소 `unsafe` 격리).
#[allow(unsafe_code)]
pub mod wasm_ffi {
    use ::alloc::alloc::{alloc as raw_alloc, dealloc as raw_dealloc, Layout};
    use core::mem;
    use core::ptr;
    use core::slice;

    use crate::{
        count_to_i32, map_kernel_error, meijster_edt2d_sq_f32, oil_bristle_stamp_accumulate_rgba,
        pack_bc1_tile_rgba_to_64bit, ranges_overlap, sdf_gap_close_flood_fill_u8, OilBristleConfig,
        FAST_KERNELS_ABI_VERSION, FAST_KERNELS_CAPABILITIES, FFI_ERR_INVALID_DIMENSIONS,
        FFI_ERR_NULL_OR_ALIAS, WASM_ALLOC_ALIGN,
    };

    /// ABI 버전(`1`)을 반환한다.
    #[no_mangle]
    pub extern "C" fn wasm_fast_kernels_abi_version() -> u32 {
        FAST_KERNELS_ABI_VERSION
    }

    /// 4종 커널 기능 비트마스크(`0x0F`)를 반환한다.
    #[no_mangle]
    pub extern "C" fn wasm_fast_kernels_capabilities() -> u32 {
        FAST_KERNELS_CAPABILITIES
    }

    /// 컴파일된 타깃의 선형 메모리 포인터 비트폭(`wasm64` = 64, `wasm32` = 32)을 반환한다.
    #[no_mangle]
    pub extern "C" fn wasm_pointer_width_bits() -> u32 {
        usize::BITS
    }

    /// 16바이트 정렬 선형 메모리 버퍼를 할당한다 (`wasm64`에서는 `i64` 길이/포인터).
    #[no_mangle]
    pub extern "C" fn wasm_alloc(byte_len: usize) -> *mut u8 {
        if byte_len == 0 {
            return ptr::null_mut();
        }
        let Ok(layout) = Layout::from_size_align(byte_len, WASM_ALLOC_ALIGN) else {
            return ptr::null_mut();
        };
        // SAFETY: `byte_len > 0`이고 `Layout::from_size_align`이 유효성을 검증했다.
        unsafe { raw_alloc(layout) }
    }

    /// `wasm_alloc`으로 할당한 선형 메모리 버퍼를 해제한다.
    ///
    /// # Safety
    /// `ptr`은 동일 `byte_len`으로 `wasm_alloc`이 반환한 포인터이거나 null이어야 한다.
    #[no_mangle]
    pub unsafe extern "C" fn wasm_free(ptr: *mut u8, byte_len: usize) {
        if ptr.is_null() || byte_len == 0 {
            return;
        }
        let Ok(layout) = Layout::from_size_align(byte_len, WASM_ALLOC_ALIGN) else {
            return;
        };
        // SAFETY: 호출자가 `wasm_alloc(byte_len)`에서 받은 포인터와 동일 레이아웃을 전달했다.
        unsafe { raw_dealloc(ptr, layout) };
    }

    /// 1. Meijster 2-Pass 정확 2D 유클리드 제곱 거리 변환 FFI 진입점.
    ///
    /// # Safety
    /// - `mask_ptr`는 `width * height` 바이트 이상의 읽기 가능 선형 메모리여야 한다.
    /// - `out_dist_sq_ptr`는 `width * height` 개의 `f32`(4바이트 정렬) 쓰기 가능 비중첩 메모리여야 한다.
    #[no_mangle]
    pub unsafe extern "C" fn wasm_meijster_edt2d_sq_f32(
        mask_ptr: *const u8,
        width: u32,
        height: u32,
        out_dist_sq_ptr: *mut f32,
    ) -> i32 {
        if mask_ptr.is_null() || out_dist_sq_ptr.is_null() {
            return FFI_ERR_NULL_OR_ALIAS;
        }
        if !(out_dist_sq_ptr as usize).is_multiple_of(mem::align_of::<f32>()) {
            return FFI_ERR_NULL_OR_ALIAS;
        }
        let Some(pixels) = (width as usize).checked_mul(height as usize) else {
            return FFI_ERR_INVALID_DIMENSIONS;
        };
        let Some(out_bytes) = pixels.checked_mul(mem::size_of::<f32>()) else {
            return FFI_ERR_INVALID_DIMENSIONS;
        };
        if pixels == 0 {
            return FFI_ERR_INVALID_DIMENSIONS;
        }
        if ranges_overlap(mask_ptr as usize, pixels, out_dist_sq_ptr as usize, out_bytes) {
            return FFI_ERR_NULL_OR_ALIAS;
        }
        // SAFETY: null/정렬/오버플로/비중첩을 위에서 검증했다.
        let (mask, out_dist) = unsafe {
            (
                slice::from_raw_parts(mask_ptr, pixels),
                slice::from_raw_parts_mut(out_dist_sq_ptr, pixels),
            )
        };
        match meijster_edt2d_sq_f32(mask, width, height, out_dist) {
            Ok(n) => count_to_i32(n),
            Err(err) => map_kernel_error(err),
        }
    }

    /// 2. SDF 거리장 기반 틈새 봉합 4-연결 시드 채색 + `1px` Halo-Free 트래핑 FFI 진입점.
    ///
    /// # Safety
    /// `lineart_ptr`, `dist_sq_ptr`, `out_fill_ptr`는 각각 `width * height` 길이의 유효 메모리여야 하며
    /// `out_fill_ptr`는 입력 버퍼들과 겹치지 않아야 한다.
    #[no_mangle]
    #[allow(clippy::too_many_arguments)]
    pub unsafe extern "C" fn wasm_sdf_gap_close_flood_fill_u8(
        lineart_ptr: *const u8,
        dist_sq_ptr: *const f32,
        width: u32,
        height: u32,
        seed_x: u32,
        seed_y: u32,
        gap_close_radius_px: f32,
        out_fill_ptr: *mut u8,
    ) -> i32 {
        if lineart_ptr.is_null() || dist_sq_ptr.is_null() || out_fill_ptr.is_null() {
            return FFI_ERR_NULL_OR_ALIAS;
        }
        if !(dist_sq_ptr as usize).is_multiple_of(mem::align_of::<f32>()) {
            return FFI_ERR_NULL_OR_ALIAS;
        }
        let Some(pixels) = (width as usize).checked_mul(height as usize) else {
            return FFI_ERR_INVALID_DIMENSIONS;
        };
        let Some(dist_bytes) = pixels.checked_mul(mem::size_of::<f32>()) else {
            return FFI_ERR_INVALID_DIMENSIONS;
        };
        if pixels == 0 {
            return FFI_ERR_INVALID_DIMENSIONS;
        }
        if ranges_overlap(lineart_ptr as usize, pixels, out_fill_ptr as usize, pixels)
            || ranges_overlap(dist_sq_ptr as usize, dist_bytes, out_fill_ptr as usize, pixels)
        {
            return FFI_ERR_NULL_OR_ALIAS;
        }
        // SAFETY: null/정렬/오버플로/비중첩을 검증했다.
        let (lineart, dist_sq, out_fill) = unsafe {
            (
                slice::from_raw_parts(lineart_ptr, pixels),
                slice::from_raw_parts(dist_sq_ptr, pixels),
                slice::from_raw_parts_mut(out_fill_ptr, pixels),
            )
        };
        match sdf_gap_close_flood_fill_u8(
            lineart,
            dist_sq,
            width,
            height,
            seed_x,
            seed_y,
            gap_close_radius_px,
            out_fill,
        ) {
            Ok(filled) => count_to_i32(filled),
            Err(err) => map_kernel_error(err),
        }
    }

    /// 3. RGBA8 타일 -> BC1 64비트 블록 스트림 패킹 FFI 진입점.
    ///
    /// # Safety
    /// `rgba_ptr`는 `width * height * 4`바이트, `out_bc1_ptr`는 `(width/4) * (height/4) * 8`바이트의
    /// 유효 비중첩 메모리여야 한다.
    #[no_mangle]
    pub unsafe extern "C" fn wasm_pack_bc1_tile_rgba_to_64bit(
        rgba_ptr: *const u8,
        width: u32,
        height: u32,
        out_bc1_ptr: *mut u8,
    ) -> i32 {
        if rgba_ptr.is_null() || out_bc1_ptr.is_null() {
            return FFI_ERR_NULL_OR_ALIAS;
        }
        if width == 0 || height == 0 || (width & 3) != 0 || (height & 3) != 0 {
            return FFI_ERR_INVALID_DIMENSIONS;
        }
        let Some(rgba_len) = (width as usize)
            .checked_mul(height as usize)
            .and_then(|p| p.checked_mul(4))
        else {
            return FFI_ERR_INVALID_DIMENSIONS;
        };
        let Some(bc1_len) = ((width / 4) as usize)
            .checked_mul((height / 4) as usize)
            .and_then(|b| b.checked_mul(8))
        else {
            return FFI_ERR_INVALID_DIMENSIONS;
        };
        if ranges_overlap(rgba_ptr as usize, rgba_len, out_bc1_ptr as usize, bc1_len) {
            return FFI_ERR_NULL_OR_ALIAS;
        }
        // SAFETY: null/4배수 크기/오버플로/비중첩을 검증했다.
        let (rgba, out_bc1) = unsafe {
            (
                slice::from_raw_parts(rgba_ptr, rgba_len),
                slice::from_raw_parts_mut(out_bc1_ptr, bc1_len),
            )
        };
        match pack_bc1_tile_rgba_to_64bit(rgba, width, height, out_bc1) {
            Ok(blocks) => count_to_i32(blocks),
            Err(err) => map_kernel_error(err),
        }
    }

    /// 4. 오일·수채 브러시 스탬프 외곽 누적 블렌딩 FFI 진입점.
    ///
    /// # Safety
    /// `canvas_ptr`는 `width * height * 4`바이트, `stamps_ptr`는 `stamp_count * 4`개의 `f32`(4바이트 정렬)
    /// 유효 비중첩 메모리여야 한다.
    #[no_mangle]
    #[allow(clippy::too_many_arguments)]
    pub unsafe extern "C" fn wasm_oil_bristle_stamp_accumulate_rgba(
        canvas_ptr: *mut u8,
        width: u32,
        height: u32,
        stamps_ptr: *const f32,
        stamp_count: u32,
        brush_rgba_packed: u32,
        pickup_q8: u32,
        wetness_q8: u32,
        decay_q8: u32,
        hardness_q8: u32,
        bristle_count: u32,
    ) -> i32 {
        if canvas_ptr.is_null() {
            return FFI_ERR_NULL_OR_ALIAS;
        }
        let Some(canvas_len) = (width as usize)
            .checked_mul(height as usize)
            .and_then(|p| p.checked_mul(4))
        else {
            return FFI_ERR_INVALID_DIMENSIONS;
        };
        if canvas_len == 0 {
            return FFI_ERR_INVALID_DIMENSIONS;
        }
        let Some(stamps_f32_len) = (stamp_count as usize).checked_mul(4) else {
            return FFI_ERR_INVALID_DIMENSIONS;
        };
        let Some(stamps_bytes) = stamps_f32_len.checked_mul(mem::size_of::<f32>()) else {
            return FFI_ERR_INVALID_DIMENSIONS;
        };
        if stamps_f32_len > 0 {
            if stamps_ptr.is_null()
                || !(stamps_ptr as usize).is_multiple_of(mem::align_of::<f32>())
            {
                return FFI_ERR_NULL_OR_ALIAS;
            }
            if ranges_overlap(canvas_ptr as usize, canvas_len, stamps_ptr as usize, stamps_bytes) {
                return FFI_ERR_NULL_OR_ALIAS;
            }
        }
        // SAFETY: null/정렬/오버플로/비중첩을 검증했다.
        let canvas = unsafe { slice::from_raw_parts_mut(canvas_ptr, canvas_len) };
        let stamps = if stamps_f32_len == 0 {
            &[]
        } else {
            // SAFETY: `stamps_f32_len > 0`일 때 `stamps_ptr`의 null/정렬/비중첩을 위에서 검증했다.
            unsafe { slice::from_raw_parts(stamps_ptr, stamps_f32_len) }
        };

        let rgba_bytes = brush_rgba_packed.to_le_bytes();
        let config = OilBristleConfig {
            brush_r: rgba_bytes[0],
            brush_g: rgba_bytes[1],
            brush_b: rgba_bytes[2],
            brush_a: rgba_bytes[3],
            pickup_q8,
            wetness_q8,
            decay_q8,
            hardness_q8,
            bristle_count,
        };

        match oil_bristle_stamp_accumulate_rgba(canvas, width, height, stamps, config) {
            Ok(blended) => count_to_i32(blended),
            Err(err) => map_kernel_error(err),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloc::vec;

    #[test]
    fn meijster_edt2d_matches_brute_force_exact_sq_dist() {
        let w = 19u32;
        let h = 15u32;
        let mut mask = vec![0u8; (w * h) as usize];
        mask[3 * (w as usize) + 4] = 1;
        mask[11 * (w as usize) + 14] = 255;
        mask[7 * (w as usize) + 2] = 1;

        let mut edt = vec![0.0f32; (w * h) as usize];
        let count = meijster_edt2d_sq_f32(&mask, w, h, &mut edt).expect("edt ok");
        assert_eq!(count, (w * h) as usize);

        for y in 0..h as i32 {
            for x in 0..w as i32 {
                let mut best = i32::MAX;
                for oy in 0..h as i32 {
                    for ox in 0..w as i32 {
                        if mask[(oy * (w as i32) + ox) as usize] != 0 {
                            let d2 = (x - ox) * (x - ox) + (y - oy) * (y - oy);
                            if d2 < best {
                                best = d2;
                            }
                        }
                    }
                }
                assert_eq!(edt[(y * (w as i32) + x) as usize], best as f32);
            }
        }
    }

    #[test]
    fn sdf_gap_close_seals_gap_and_traps_1px_halo() {
        let w = 64u32;
        let h = 64u32;
        let mut lineart = vec![0u8; (w * h) as usize];
        // (12..=51, 12..=51) 사각 테두리 + 오른쪽 변 중앙에 6px 틈새(y=29..34)
        for x in 12..=51 {
            lineart[12 * 64 + x] = 255;
            lineart[51 * 64 + x] = 255;
        }
        for y in 12..=51 {
            lineart[y * 64 + 12] = 255;
            if !(29..=34).contains(&y) {
                lineart[y * 64 + 51] = 255;
            }
        }

        let mut dist_sq = vec![0.0f32; (w * h) as usize];
        meijster_edt2d_sq_f32(&lineart, w, h, &mut dist_sq).expect("edt ok");

        let mut out_closed = vec![0u8; (w * h) as usize];
        let filled = sdf_gap_close_flood_fill_u8(&lineart, &dist_sq, w, h, 30, 30, 4.0, &mut out_closed)
            .expect("sdf fill ok");
        assert!(filled > 1000);
        // 외부 코너(2, 2)로 누출되지 않아야 한다.
        assert_eq!(out_closed[2 * 64 + 2], 0);
        // 내부(30, 30)는 본체 채색(1), 내벽 선화(12, 30)는 1px 트래핑(2)이어야 한다.
        assert_eq!(out_closed[30 * 64 + 30], 1);
        assert_eq!(out_closed[30 * 64 + 12], 2);
    }

    #[test]
    fn pack_bc1_tile_packs_exact_64bit_blocks() {
        let w = 16u32;
        let h = 16u32;
        let mut rgba = vec![0u8; (w * h * 4) as usize];
        for y in 0..h {
            for x in 0..w {
                let off = ((y * w + x) * 4) as usize;
                rgba[off] = (x * 16) as u8;
                rgba[off + 1] = (y * 16) as u8;
                rgba[off + 2] = ((x + y) * 8) as u8;
                rgba[off + 3] = 255;
            }
        }
        let mut bc1 = vec![0u8; ((w / 4) * (h / 4) * 8) as usize];
        let blocks = pack_bc1_tile_rgba_to_64bit(&rgba, w, h, &mut bc1).expect("bc1 ok");
        assert_eq!(blocks, 16);
        assert!(bc1.iter().any(|&b| b != 0));
    }

    #[test]
    fn oil_bristle_stamp_accumulates_pickup_and_decay() {
        let w = 64u32;
        let h = 64u32;
        let mut canvas = vec![0u8; (w * h * 4) as usize];
        // 좌측 절반에 노란 밑색 배치
        for y in 0..h {
            for x in 0..32 {
                let off = ((y * w + x) * 4) as usize;
                canvas[off] = 240;
                canvas[off + 1] = 200;
                canvas[off + 2] = 40;
                canvas[off + 3] = 255;
            }
        }
        let stamps = [
            16.0f32, 32.0, 8.0, 0.9,
            24.0, 32.0, 8.0, 0.9,
            36.0, 32.0, 8.0, 0.9,
            46.0, 32.0, 8.0, 0.9,
        ];
        let blended = oil_bristle_stamp_accumulate_rgba(
            &mut canvas,
            w,
            h,
            &stamps,
            OilBristleConfig {
                brush_r: 30,
                brush_g: 80,
                brush_b: 220,
                brush_a: 220,
                pickup_q8: 160,
                wetness_q8: 240,
                decay_q8: 230,
                hardness_q8: 140,
                bristle_count: 6,
            },
        )
        .expect("oil ok");
        assert!(blended > 200);
        // 우측 빈 영역(46, 32)에 노란색 픽업이 섞여 R/G가 원색(30, 80)보다 올라가 있어야 한다.
        let probe = (32 * 64 + 46) * 4;
        assert!(canvas[probe + 3] > 0);
        assert!(canvas[probe] > 35);
    }
}
