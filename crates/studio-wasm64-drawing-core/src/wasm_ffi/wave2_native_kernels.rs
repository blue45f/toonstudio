//! Wave-2 순수 Rust 네이티브 커널 C-ABI 선형 메모리 FFI 진입점 모듈.
//!
//! - PackBits RLE 스트리밍 인코더/디코더 (`pro-raster-tools`)
//! - 3D SAH 삼각형 BVH 레이캐스트 (`extended-3d`)
//! - 해석적 2-Bone 팔/다리 IK 및 감쇠 다관절 척추 CCD IK (`extended-3d`)
//!
//! 모든 포인터는 null·정렬·오버플로·비중첩 검증을 거치며 panic 없이 음수 오류 코드를 반환한다.

use super::*;

#[cfg(feature = "extended-3d")]
use crate::bvh3d_sah_raycast_kernel::{
    build_sah_bvh_3d, raycast_sah_bvh_3d, Ray3D, SahBvhConfig,
};
#[cfg(feature = "extended-3d")]
use crate::humanoid_body_ik_kernel::{
    solve_ccd_chain_3d, solve_two_bone_ik_3d, CcdChainConfig, TwoBoneIkConfig,
    MAX_CCD_CHAIN_JOINTS, MIN_CCD_CHAIN_JOINTS,
};
#[cfg(feature = "pro-raster-tools")]
use crate::psd_psb_codec_kernel::{
    decode_packbits_rle_into, encode_packbits_rle_into, packbits_max_encoded_len,
};

/// Wave-2 네이티브 커널 통합 기능 비트마스크.
///
/// - `bit 0` (`0x01`): PackBits RLE 스트리밍 인코딩/디코딩 (`pro-raster-tools`)
/// - `bit 1` (`0x02`): PSD(v1)/PSB(v2, 64비트) 다중 레이어 스트리밍 코덱 (`pro-raster-tools`)
/// - `bit 2` (`0x04`): 3D SAH 삼각형 BVH 레이캐스트 및 구체 겹침 쿼리 (`extended-3d`)
/// - `bit 3` (`0x08`): 해석적 2-Bone 팔/다리 IK + 소프트 과신전 클램프 (`extended-3d`)
/// - `bit 4` (`0x10`): 감쇠 다관절 척추 CCD IK + 바닥 접지 클램프 (`extended-3d`)
pub const WASM_WAVE2_CAPABILITIES: u32 = {
    let mut mask = 0u32;
    if cfg!(feature = "pro-raster-tools") {
        mask |= 0x03;
    }
    if cfg!(feature = "extended-3d") {
        mask |= 0x1C;
    }
    mask
};

/// `wasm_raycast_mesh_sah_bvh_3d` `ray_params_ptr` `f32` 길이:
/// `[ox, oy, oz, dx, dy, dz, t_min, t_max]`.
#[cfg(feature = "extended-3d")]
pub const SAH_BVH_RAY_FFI_LEN: usize = 8;

/// `wasm_raycast_mesh_sah_bvh_3d` `out_hit_ptr` `f32` 길이:
/// `[tri_index, distance, u, v, px, py, pz, nx, ny, nz, nodes_visited, triangles_tested]`.
#[cfg(feature = "extended-3d")]
pub const SAH_BVH_HIT_FFI_LEN: usize = 12;

/// `wasm_solve_two_bone_ik_3d` `params_ptr` `f32` 길이:
/// `[root_x, root_y, root_z, pole_x, pole_y, pole_z, target_x, target_y, target_z,
///   upper_len, lower_len, soft_extension_ratio, min_bend_angle_rad, floor_y, foot_sole_offset]`.
#[cfg(feature = "extended-3d")]
pub const TWO_BONE_IK_FFI_PARAM_LEN: usize = 15;

/// `wasm_solve_two_bone_ik_3d` `out_result_ptr` `f32` 길이:
/// `[mid_x, mid_y, mid_z, end_x, end_y, end_z,
///   clamped_tx, clamped_ty, clamped_tz, bend_angle_rad, target_error, status_bits]`.
#[cfg(feature = "extended-3d")]
pub const TWO_BONE_IK_FFI_OUT_LEN: usize = 12;

/// `wasm_solve_ccd_spine_ik_3d` `params_ptr` `f32` 길이:
/// `[tolerance, max_step_angle_rad, damping, max_joint_bend_rad, floor_y, floor_clearance]`.
#[cfg(feature = "extended-3d")]
pub const CCD_SPINE_IK_FFI_PARAM_LEN: usize = 6;

#[cfg(feature = "extended-3d")]
const MAX_SAH_BVH_VERTICES: usize = 2_000_000;
#[cfg(feature = "extended-3d")]
const MAX_SAH_BVH_TRIANGLES: usize = 1_000_000;

#[inline]
#[cfg(feature = "extended-3d")]
fn aligned_non_null<T>(ptr_addr: usize) -> bool {
    ptr_addr != 0 && ptr_addr.is_multiple_of(mem::align_of::<T>())
}

#[inline]
#[cfg(feature = "extended-3d")]
fn checked_byte_len(count: usize, elem_size: usize) -> Result<usize, i32> {
    let bytes = count.checked_mul(elem_size).ok_or(FFI_ERR_OVERFLOW)?;
    if bytes > isize::MAX as usize {
        return Err(FFI_ERR_OVERFLOW);
    }
    Ok(bytes)
}

fn wave2_error_to_ffi_code(err: &DrawingCoreError) -> i32 {
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

/// Wave-2 네이티브 커널 활성 기능 비트마스크를 반환한다(`full-suite` 기준 `0x1F`).
#[no_mangle]
#[must_use]
pub extern "C" fn wasm_wave2_capabilities() -> u32 {
    WASM_WAVE2_CAPABILITIES
}

/// 선형 메모리 제로카피 PackBits RLE 스트리밍 인코더 (`pro-raster-tools` 피처 전용).
///
/// `dst_ptr == null && dst_capacity == 0`이면 `src_len`에 필요한 최악 출력 용량을 반환한다.
///
/// # Safety
/// `src_ptr`은 `src_len`바이트, `dst_ptr`은 `dst_capacity`바이트의 비중첩 유효 선형 메모리여야 한다.
#[cfg(feature = "pro-raster-tools")]
#[no_mangle]
pub unsafe extern "C" fn wasm_packbits_rle_encode(
    src_ptr: *const u8,
    src_len: u32,
    dst_ptr: *mut u8,
    dst_capacity: u32,
) -> i32 {
    let slen = src_len as usize;
    let dcap = dst_capacity as usize;
    if slen > isize::MAX as usize || dcap > isize::MAX as usize {
        return FFI_ERR_OVERFLOW;
    }
    if dst_ptr.is_null() && dcap == 0 {
        return match packbits_max_encoded_len(slen) {
            Ok(need) => i32::try_from(need).unwrap_or(FFI_ERR_OVERFLOW),
            Err(_) => FFI_ERR_OVERFLOW,
        };
    }
    if slen == 0 {
        return 0;
    }
    if src_ptr.is_null() || dst_ptr.is_null() {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    if ranges_overlap(src_ptr as usize, slen, dst_ptr as usize, dcap) {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·길이·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (src, dst) = unsafe {
        (
            slice::from_raw_parts(src_ptr, slen),
            slice::from_raw_parts_mut(dst_ptr, dcap),
        )
    };

    match encode_packbits_rle_into(src, dst) {
        Ok(written) => count_to_i32(written),
        Err(ref err) => wave2_error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 PackBits RLE 스트리밍 디코더 (`pro-raster-tools` 피처 전용).
///
/// 반환값: 0 이상은 실제 디코딩된 바이트 수, 음수는 `FFI_ERR_*` 오류 코드(오버런·잘린 입력 차단).
///
/// # Safety
/// `src_ptr`은 `src_len`바이트, `dst_ptr`은 `dst_capacity`바이트의 비중첩 유효 선형 메모리여야 한다.
#[cfg(feature = "pro-raster-tools")]
#[no_mangle]
pub unsafe extern "C" fn wasm_packbits_rle_decode(
    src_ptr: *const u8,
    src_len: u32,
    dst_ptr: *mut u8,
    dst_capacity: u32,
) -> i32 {
    let slen = src_len as usize;
    let dcap = dst_capacity as usize;
    if slen == 0 {
        return 0;
    }
    if slen > isize::MAX as usize || dcap > isize::MAX as usize {
        return FFI_ERR_OVERFLOW;
    }
    if src_ptr.is_null() || dst_ptr.is_null() {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    if ranges_overlap(src_ptr as usize, slen, dst_ptr as usize, dcap) {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·길이·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (src, dst) = unsafe {
        (
            slice::from_raw_parts(src_ptr, slen),
            slice::from_raw_parts_mut(dst_ptr, dcap),
        )
    };

    match decode_packbits_rle_into(src, dst) {
        Ok(decoded) => count_to_i32(decoded),
        Err(ref err) => wave2_error_to_ffi_code(err),
    }
}

/// 선형 메모리 3D 메쉬 SAH BVH 구축 + Slab+Möller-Trumbore 레이캐스트 C-ABI 진입점 (`extended-3d` 피처 전용).
///
/// 반환값: `1` = 삼각형 적중(`out_hit_ptr[0..12]` 기록), `0` = 미적중, 음수 = `FFI_ERR_*`.
///
/// # Safety
/// 모든 비-null 포인터는 타입 정렬과 명시 길이를 만족하는 유효 선형 메모리여야 하며 `out_hit_ptr`은 입력과 겹치지 않아야 한다.
#[cfg(feature = "extended-3d")]
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn wasm_raycast_mesh_sah_bvh_3d(
    positions_xyz_ptr: *const f32,
    vertex_count: u32,
    indices_ptr: *const u32,
    triangle_count: u32,
    ray_params_ptr: *const f32,
    backface_cull: u32,
    out_hit_ptr: *mut f32,
) -> i32 {
    if backface_cull > 1 {
        return FFI_ERR_INVALID_PARAMETER;
    }
    let nv = vertex_count as usize;
    let nt = triangle_count as usize;
    if nv > MAX_SAH_BVH_VERTICES || nt > MAX_SAH_BVH_TRIANGLES {
        return FFI_ERR_INVALID_PARAMETER;
    }
    if ray_params_ptr.is_null()
        || out_hit_ptr.is_null()
        || !aligned_non_null::<f32>(ray_params_ptr as usize)
        || !aligned_non_null::<f32>(out_hit_ptr as usize)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    if nv > 0 && (positions_xyz_ptr.is_null() || !aligned_non_null::<f32>(positions_xyz_ptr as usize)) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    if nt > 0 && (indices_ptr.is_null() || !aligned_non_null::<u32>(indices_ptr as usize)) {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    let (Some(pos_len), Some(idx_len)) = (nv.checked_mul(3), nt.checked_mul(3)) else {
        return FFI_ERR_OVERFLOW;
    };
    let (pos_bytes, idx_bytes) = match (
        checked_byte_len(pos_len, mem::size_of::<f32>()),
        checked_byte_len(idx_len, mem::size_of::<u32>()),
    ) {
        (Ok(a), Ok(b)) => (a, b),
        _ => return FFI_ERR_OVERFLOW,
    };
    let ray_bytes = SAH_BVH_RAY_FFI_LEN * mem::size_of::<f32>();
    let out_bytes = SAH_BVH_HIT_FFI_LEN * mem::size_of::<f32>();
    let out_addr = out_hit_ptr as usize;
    if ranges_overlap(out_addr, out_bytes, ray_params_ptr as usize, ray_bytes)
        || (pos_bytes > 0 && ranges_overlap(out_addr, out_bytes, positions_xyz_ptr as usize, pos_bytes))
        || (idx_bytes > 0 && ranges_overlap(out_addr, out_bytes, indices_ptr as usize, idx_bytes))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (positions, indices, ray_arr, out_hit) = unsafe {
        (
            if nv == 0 {
                &[][..]
            } else {
                slice::from_raw_parts(positions_xyz_ptr, pos_len)
            },
            if nt == 0 {
                &[][..]
            } else {
                slice::from_raw_parts(indices_ptr, idx_len)
            },
            slice::from_raw_parts(ray_params_ptr, SAH_BVH_RAY_FFI_LEN),
            slice::from_raw_parts_mut(out_hit_ptr, SAH_BVH_HIT_FFI_LEN),
        )
    };

    let ray = Ray3D {
        origin: [ray_arr[0], ray_arr[1], ray_arr[2]],
        direction: [ray_arr[3], ray_arr[4], ray_arr[5]],
        t_min: ray_arr[6],
        t_max: ray_arr[7],
    };

    let bvh = match build_sah_bvh_3d(positions, indices, &SahBvhConfig::default()) {
        Ok(tree) => tree,
        Err(ref err) => return wave2_error_to_ffi_code(err),
    };

    match raycast_sah_bvh_3d(&bvh, positions, indices, &ray, backface_cull != 0) {
        Ok(Some(hit)) => {
            out_hit[0] = hit.triangle_index as f32;
            out_hit[1] = hit.distance;
            out_hit[2] = hit.u;
            out_hit[3] = hit.v;
            out_hit[4] = hit.point[0];
            out_hit[5] = hit.point[1];
            out_hit[6] = hit.point[2];
            out_hit[7] = hit.normal[0];
            out_hit[8] = hit.normal[1];
            out_hit[9] = hit.normal[2];
            out_hit[10] = hit.nodes_visited as f32;
            out_hit[11] = hit.triangles_tested as f32;
            1
        }
        Ok(None) => {
            out_hit.fill(0.0);
            0
        }
        Err(ref err) => wave2_error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 해석적 2-Bone 팔/다리 IK C-ABI 진입점 (`extended-3d` 피처 전용).
///
/// 반환값: `0..=3` 상태 비트마스크(`bit0 = floor_clamped`, `bit1 = soft_clamped`), 음수 = `FFI_ERR_*`.
///
/// # Safety
/// `params_ptr`은 4바이트 정렬된 15개 `f32`, `out_result_ptr`은 4바이트 정렬된 12개 `f32`의 비중첩 유효 선형 메모리여야 한다.
#[cfg(feature = "extended-3d")]
#[no_mangle]
pub unsafe extern "C" fn wasm_solve_two_bone_ik_3d(
    params_ptr: *const f32,
    flags: u32,
    out_result_ptr: *mut f32,
) -> i32 {
    if flags > 1 {
        return FFI_ERR_INVALID_PARAMETER;
    }
    if params_ptr.is_null()
        || out_result_ptr.is_null()
        || !aligned_non_null::<f32>(params_ptr as usize)
        || !aligned_non_null::<f32>(out_result_ptr as usize)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let param_bytes = TWO_BONE_IK_FFI_PARAM_LEN * mem::size_of::<f32>();
    let out_bytes = TWO_BONE_IK_FFI_OUT_LEN * mem::size_of::<f32>();
    if ranges_overlap(
        params_ptr as usize,
        param_bytes,
        out_result_ptr as usize,
        out_bytes,
    ) {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (p, out) = unsafe {
        (
            slice::from_raw_parts(params_ptr, TWO_BONE_IK_FFI_PARAM_LEN),
            slice::from_raw_parts_mut(out_result_ptr, TWO_BONE_IK_FFI_OUT_LEN),
        )
    };

    let cfg = TwoBoneIkConfig {
        upper_length: p[9],
        lower_length: p[10],
        soft_extension_ratio: p[11],
        min_bend_angle_rad: p[12],
        floor_y: if (flags & 1) != 0 { Some(p[13]) } else { None },
        foot_sole_offset: p[14],
    };

    match solve_two_bone_ik_3d(
        [p[0], p[1], p[2]],
        [p[3], p[4], p[5]],
        [p[6], p[7], p[8]],
        &cfg,
    ) {
        Ok(res) => {
            let status_bits = (u32::from(res.floor_clamped)) | (u32::from(res.soft_clamped) << 1);
            out[0] = res.mid[0];
            out[1] = res.mid[1];
            out[2] = res.mid[2];
            out[3] = res.end[0];
            out[4] = res.end[1];
            out[5] = res.end[2];
            out[6] = res.clamped_target[0];
            out[7] = res.clamped_target[1];
            out[8] = res.clamped_target[2];
            out[9] = res.bend_angle_rad;
            out[10] = res.target_error;
            out[11] = status_bits as f32;
            status_bits as i32
        }
        Err(ref err) => wave2_error_to_ffi_code(err),
    }
}

/// 선형 메모리 제자리(in-place) 감쇠 다관절 척추 CCD IK C-ABI 진입점 (`extended-3d` 피처 전용).
///
/// 반환값: 0 이상은 수행된 CCD 반복 횟수, 음수는 `FFI_ERR_*` 오류 코드.
///
/// # Safety
/// `joints_xyz_ptr`은 4바이트 정렬된 `joint_count * 3`개 `f32`, `target_xyz_ptr`은 4바이트 정렬된 3개 `f32`,
/// `params_ptr`은 null 또는 4바이트 정렬된 6개 `f32`이며 출력 버퍼는 입력과 겹치지 않아야 한다.
#[cfg(feature = "extended-3d")]
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn wasm_solve_ccd_spine_ik_3d(
    joints_xyz_ptr: *mut f32,
    joint_count: u32,
    target_xyz_ptr: *const f32,
    max_iterations: u32,
    flags: u32,
    params_ptr: *const f32,
) -> i32 {
    let n = joint_count as usize;
    if !(MIN_CCD_CHAIN_JOINTS..=MAX_CCD_CHAIN_JOINTS).contains(&n) || flags > 1 {
        return FFI_ERR_INVALID_PARAMETER;
    }
    if joints_xyz_ptr.is_null()
        || target_xyz_ptr.is_null()
        || !aligned_non_null::<f32>(joints_xyz_ptr as usize)
        || !aligned_non_null::<f32>(target_xyz_ptr as usize)
        || (!params_ptr.is_null() && !aligned_non_null::<f32>(params_ptr as usize))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let joints_len = n * 3;
    let joints_bytes = joints_len * mem::size_of::<f32>();
    let target_bytes = 3 * mem::size_of::<f32>();
    let params_bytes = CCD_SPINE_IK_FFI_PARAM_LEN * mem::size_of::<f32>();
    if ranges_overlap(
        joints_xyz_ptr as usize,
        joints_bytes,
        target_xyz_ptr as usize,
        target_bytes,
    ) || (!params_ptr.is_null()
        && ranges_overlap(
            joints_xyz_ptr as usize,
            joints_bytes,
            params_ptr as usize,
            params_bytes,
        ))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·길이·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (joints_raw, target, cfg) = unsafe {
        let j_slice = slice::from_raw_parts_mut(joints_xyz_ptr, joints_len);
        let t_slice = slice::from_raw_parts(target_xyz_ptr, 3);
        let t = [t_slice[0], t_slice[1], t_slice[2]];
        let mut cfg = if params_ptr.is_null() {
            CcdChainConfig {
                floor_y: if (flags & 1) != 0 { Some(0.0) } else { None },
                ..CcdChainConfig::default()
            }
        } else {
            let p = slice::from_raw_parts(params_ptr, CCD_SPINE_IK_FFI_PARAM_LEN);
            CcdChainConfig {
                max_iterations,
                tolerance: p[0],
                max_step_angle_rad: p[1],
                damping: p[2],
                max_joint_bend_rad: p[3],
                floor_y: if (flags & 1) != 0 { Some(p[4]) } else { None },
                floor_clearance: p[5],
            }
        };
        cfg.max_iterations = max_iterations;
        (j_slice, t, cfg)
    };

    let mut stack_joints = [[0.0_f32; 3]; MAX_CCD_CHAIN_JOINTS];
    for i in 0..n {
        stack_joints[i] = [
            joints_raw[i * 3],
            joints_raw[i * 3 + 1],
            joints_raw[i * 3 + 2],
        ];
    }

    match solve_ccd_chain_3d(&mut stack_joints[..n], target, &cfg) {
        Ok(res) => {
            for (i, pos) in stack_joints[..n].iter().enumerate() {
                joints_raw[i * 3] = pos[0];
                joints_raw[i * 3 + 1] = pos[1];
                joints_raw[i * 3 + 2] = pos[2];
            }
            res.iterations as i32
        }
        Err(ref err) => wave2_error_to_ffi_code(err),
    }
}
