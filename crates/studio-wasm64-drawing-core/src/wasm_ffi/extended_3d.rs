use super::*;

/// 확장 3D 커널 기능 비트마스크 (`bit0`: VRM 4-본 스키닝, `bit1`: Morton 코드, `bit2`: G-Buffer LT 선화).
pub const WASM_EXTENDED_3D_CAPABILITIES: u32 = 0x07;

/// `wasm_extract_lt_lineart_from_gbuffer`의 `params_ptr` 배열 길이(`f32` 6개).
pub const LT_LINEART_FFI_PARAM_COUNT: usize = 6;

/// `extended-3d` 피처 활성 시 확장 3D 커널 기능 비트마스크를 반환한다.
#[no_mangle]
#[must_use]
pub extern "C" fn wasm_extended_3d_capabilities() -> u32 {
    WASM_EXTENDED_3D_CAPABILITIES
}

/// 2D 16비트 좌표를 32비트 Morton Z-Order 코드로 인코딩하는 C-ABI 진입점.
#[no_mangle]
#[must_use]
pub extern "C" fn wasm_encode_morton_2d_u32(x: u32, y: u32) -> u32 {
    crate::simd_bvh_skinning_kernel::encode_morton_2d_u32(
        x.min(u32::from(u16::MAX)) as u16,
        y.min(u32::from(u16::MAX)) as u16,
    )
}

/// 3D 10비트 좌표를 30비트 유효 Morton Z-Order 코드로 인코딩하는 C-ABI 진입점.
#[no_mangle]
#[must_use]
pub extern "C" fn wasm_encode_morton_3d_u32(x: u32, y: u32, z: u32) -> u32 {
    crate::simd_bvh_skinning_kernel::encode_morton_3d_u32(
        x.min(u32::from(u16::MAX)) as u16,
        y.min(u32::from(u16::MAX)) as u16,
        z.min(u32::from(u16::MAX)) as u16,
    )
}

#[inline]
fn checked_byte_len(count: usize, elem_size: usize) -> Result<usize, i32> {
    let bytes = count.checked_mul(elem_size).ok_or(FFI_ERR_OVERFLOW)?;
    if bytes > isize::MAX as usize {
        return Err(FFI_ERR_OVERFLOW);
    }
    Ok(bytes)
}

/// 선형 메모리 제로카피 SoA 4-본 VRM 스키닝 C-ABI 진입점 (`extended-3d` 피처 전용).
///
/// # Safety
/// 각 포인터는 명시된 길이·정렬 조건을 만족하는 유효 선형 메모리여야 하며, 출력 버퍼는 서로 및 모든 입력과 겹치지 않아야 한다.
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
    if bone_count == 0 {
        return FFI_ERR_INVALID_PARAMETER;
    }
    let n = vertex_count as usize;
    if n == 0 {
        return 0;
    }
    let f32_ptrs = [
        in_pos_xyz_ptr as usize,
        in_norm_xyz_ptr as usize,
        weights_ptr as usize,
        bone_matrices_ptr as usize,
        out_pos_xyz_ptr as usize,
        out_norm_xyz_ptr as usize,
    ];
    let f32_align = mem::align_of::<f32>();
    if f32_ptrs
        .iter()
        .any(|&p| p == 0 || !p.is_multiple_of(f32_align))
        || joints_ptr.is_null()
        || !(joints_ptr as usize).is_multiple_of(mem::align_of::<u16>())
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let (Some(xyz_len), Some(w4_len)) = (n.checked_mul(3), n.checked_mul(4)) else {
        return FFI_ERR_OVERFLOW;
    };
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
        (in_pos_xyz_ptr as usize, xyz_bytes),
        (in_norm_xyz_ptr as usize, xyz_bytes),
        (joints_ptr as usize, j4_bytes),
        (weights_ptr as usize, w4_bytes),
        (bone_matrices_ptr as usize, bone_bytes),
    ];
    if ranges_overlap(out_pos, xyz_bytes, out_norm, xyz_bytes)
        || inputs.iter().any(|&(a, l)| {
            ranges_overlap(out_pos, xyz_bytes, a, l) || ranges_overlap(out_norm, xyz_bytes, a, l)
        })
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
        pos_x: &in_pos[0..n],
        pos_y: &in_pos[n..2 * n],
        pos_z: &in_pos[2 * n..3 * n],
        norm_x: &in_norm[0..n],
        norm_y: &in_norm[n..2 * n],
        norm_z: &in_norm[2 * n..3 * n],
        joints: [
            &joints[0..n],
            &joints[n..2 * n],
            &joints[2 * n..3 * n],
            &joints[3 * n..4 * n],
        ],
        weights: [
            &weights[0..n],
            &weights[n..2 * n],
            &weights[2 * n..3 * n],
            &weights[3 * n..4 * n],
        ],
    };
    let mut output = crate::simd_bvh_skinning_kernel::VrmMeshSoaOutput {
        pos_x: opx,
        pos_y: opy,
        pos_z: opz,
        norm_x: onx,
        norm_y: ony,
        norm_z: onz,
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
    if normal_xyz_ptr.is_null()
        || depth_ptr.is_null()
        || out_alpha_ptr.is_null()
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
    let Some(norm_len) = pixel_count.checked_mul(3) else {
        return FFI_ERR_OVERFLOW;
    };
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
        || (!params_ptr.is_null()
            && ranges_overlap(out_addr, pixel_count, params_ptr as usize, params_bytes))
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
                depth_threshold: p[0],
                normal_edge_threshold: p[1],
                depth_weight: p[2],
                normal_weight: p[3],
                edge_softness: p[4],
                min_ink_alpha: if p[5].is_finite() {
                    p[5].clamp(0.0, 255.0).round() as u8
                } else {
                    0
                },
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
        &norm[0..pixel_count],
        &norm[pixel_count..2 * pixel_count],
        &norm[2 * pixel_count..3 * pixel_count],
        depth,
        width,
        height,
        &cfg,
        out_alpha,
    ) {
        Ok(stats) => count_to_i32(stats.ink_pixels),
        Err(ref err) => error_to_ffi_code(err),
    }
}
