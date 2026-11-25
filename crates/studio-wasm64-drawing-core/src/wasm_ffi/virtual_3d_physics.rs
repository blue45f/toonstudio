use super::extended_3d::checked_byte_len;
use super::*;

/// 선형 메모리 제로카피 SoA 베를레(Verlet) 스프링 체인 물리 C-ABI 진입점 (`virtual-3d-physics` 피처 전용).
///
/// `params_ptr`은 null(기본값) 또는 10개 `f32` 배열
/// `[dt, stiffness, damping, wind_x, wind_y, wind_z, gravity_y, floor_y, floor_restitution, particle_radius]`이다.
///
/// # Safety
/// 모든 비-null 포인터는 4바이트 정렬된 유효 선형 메모리여야 하며 `pos_xyz_ptr`과 `prev_xyz_ptr`은 서로 및 모든 입력과 겹치지 않아야 한다.
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
    if collider_count as usize > crate::virtual_3d_physics_kernel::MAX_PHYSICS_COLLIDERS
        || particle_count as usize > crate::virtual_3d_physics_kernel::MAX_PHYSICS_PARTICLES
        || (particle_count as usize)
            .saturating_mul(collider_count as usize)
            .saturating_mul(iterations as usize)
            > crate::virtual_3d_physics_kernel::MAX_PHYSICS_INTERACTIONS
    {
        return FFI_ERR_INVALID_PARAMETER;
    }
    let n = particle_count as usize;
    let c = collider_count as usize;
    let f32_align = mem::align_of::<f32>();
    if (!params_ptr.is_null() && !(params_ptr as usize).is_multiple_of(f32_align))
        || (c > 0
            && (colliders_ptr.is_null() || !(colliders_ptr as usize).is_multiple_of(f32_align)))
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
            pos_x: &mut [],
            pos_y: &mut [],
            pos_z: &mut [],
            prev_x: &mut [],
            prev_y: &mut [],
            prev_z: &mut [],
            inv_mass: &[],
            rest_len: &[],
        };
        return match crate::virtual_3d_physics_kernel::step_verlet_spring_chains_soa(
            &mut empty,
            &[],
            &cfg,
        ) {
            Ok(_) => 0,
            Err(ref err) => error_to_ffi_code(err),
        };
    }

    let required = [
        pos_xyz_ptr as usize,
        prev_xyz_ptr as usize,
        inv_mass_ptr as usize,
        rest_len_ptr as usize,
    ];
    if required
        .iter()
        .any(|&p| p == 0 || !p.is_multiple_of(f32_align))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let Some(xyz_len) = n.checked_mul(3) else {
        return FFI_ERR_OVERFLOW;
    };
    let Some(col_len) = c.checked_mul(4) else {
        return FFI_ERR_OVERFLOW;
    };
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
        (
            params_ptr as usize,
            if params_ptr.is_null() {
                0
            } else {
                params_bytes
            },
        ),
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
            if c == 0 {
                &[]
            } else {
                slice::from_raw_parts(colliders_ptr, col_len)
            },
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
        pos_x: px,
        pos_y: py,
        pos_z: pz,
        prev_x: ox,
        prev_y: oy,
        prev_z: oz,
        inv_mass,
        rest_len,
    };
    match crate::virtual_3d_physics_kernel::step_verlet_spring_chains_soa(
        &mut chains,
        &colliders,
        &cfg,
    ) {
        Ok(stats) => count_to_i32(stats.particle_count),
        Err(ref err) => error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 3관절(MCP→PIP→DIP→Tip) 손가락 FABRIK IK C-ABI 진입점 (`virtual-3d-physics` 피처 전용).
///
/// `params_ptr`은 null(기본 해부학 제한) 또는 12개 `f32` 배열
/// `[palm_fx, palm_fy, palm_fz, flex_nx, flex_ny, flex_nz, mcp_max_flex, mcp_max_ext, mcp_max_splay, pip_max_flex, dip_max_flex, tolerance]`이다.
///
/// # Safety
/// 각 포인터는 4바이트 정렬된 유효 선형 메모리여야 하며 `joints_xyz_ptr`(12 `f32`)은 입력 버퍼들과 겹치지 않아야 한다.
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
    match crate::virtual_3d_physics_kernel::solve_finger_fabrik_chain(
        &mut joints,
        bone_lengths,
        target,
        &cfg,
    ) {
        Ok(res) => {
            let flat = [
                joints[0][0],
                joints[0][1],
                joints[0][2],
                joints[1][0],
                joints[1][1],
                joints[1][2],
                joints[2][0],
                joints[2][1],
                joints[2][2],
                joints[3][0],
                joints[3][1],
                joints[3][2],
            ];
            // SAFETY: `joints_xyz_ptr`는 검증된 4바이트 정렬 12 `f32` 쓰기 가능 버퍼다.
            unsafe {
                *joints_xyz_ptr.cast::<[f32; 12]>() = flat;
            }
            count_to_i32(res.iterations as usize)
        }
        Err(ref err) => error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 Foley CPU Biquad·피크 제한·비가중 에너지 추정 C-ABI 진입점 (`virtual-3d-physics` 피처 전용).
///
/// `state_ptr`은 5개 `f32` 배열 `[z1, z2, limiter_env, lufs_energy_ewma, lufs_gain]`,
/// `params_ptr`은 null(기본 설정) 또는 9개 `f32` 배열
/// `[sample_rate, cutoff_hz, q_factor, pan, gain_db, limiter_ceiling, limiter_release_ms, target_lufs, enable_lufs_leveling]`이다.
///
/// # Safety
/// 모든 비-null 포인터는 4바이트 정렬된 유효 선형 메모리여야 하며 `out_left_ptr`, `out_right_ptr`, `state_ptr`은 서로 및 입력과 겹치지 않아야 한다.
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
    if frame_count as usize > crate::virtual_3d_physics_kernel::MAX_AUDIO_FRAMES {
        return FFI_ERR_INVALID_PARAMETER;
    }
    let Some(mode) = crate::virtual_3d_physics_kernel::FoleyFilterMode::from_u32(filter_mode)
    else {
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
    let params_bytes = if params_ptr.is_null() {
        0
    } else {
        FOLEY_DSP_FFI_PARAM_COUNT * mem::size_of::<f32>()
    };
    if ranges_overlap(
        state_ptr as usize,
        state_bytes,
        params_ptr as usize,
        params_bytes,
    ) {
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
        if !p[8].is_finite() || (p[8] != 0.0 && p[8] != 1.0) {
            return FFI_ERR_INVALID_PARAMETER;
        }
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
        return match crate::virtual_3d_physics_kernel::render_foley_biquad_block(
            &[],
            &mut [],
            &mut [],
            &cfg,
            &mut state,
        ) {
            Ok(_) => {
                // SAFETY: `state_ptr`는 검증된 쓰기 가능 상태 버퍼다.
                unsafe {
                    *state_ptr.cast::<[f32; FOLEY_DSP_FFI_STATE_LEN]>() = [
                        state.z1,
                        state.z2,
                        state.limiter_env,
                        state.lufs_energy_ewma,
                        state.lufs_gain,
                    ];
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
        mono_in_ptr as usize,
        out_left_ptr as usize,
        out_right_ptr as usize,
        state_ptr as usize,
        params_ptr as usize,
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
    match crate::virtual_3d_physics_kernel::render_foley_biquad_block(
        mono_in, out_l, out_r, &cfg, &mut state,
    ) {
        Ok(stats) => {
            // SAFETY: `state_ptr`는 검증된 쓰기 가능 비중첩 상태 버퍼다.
            unsafe {
                *state_ptr.cast::<[f32; FOLEY_DSP_FFI_STATE_LEN]>() = [
                    state.z1,
                    state.z2,
                    state.limiter_env,
                    state.lufs_energy_ewma,
                    state.lufs_gain,
                ];
            }
            count_to_i32(stats.rendered_frames)
        }
        Err(ref err) => error_to_ffi_code(err),
    }
}
