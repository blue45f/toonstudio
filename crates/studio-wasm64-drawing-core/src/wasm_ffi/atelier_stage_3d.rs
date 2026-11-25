use super::extended_3d::checked_byte_len;
use super::*;

use crate::atelier_stage_3d_kernel::{
    cull_scene_frustum_and_hiz_into, evaluate_stage_acoustics_and_lighting,
    resolve_sphere_overlaps, AtelierAudioEval, AtelierAudioSource, AtelierCastSample,
    AtelierLightKind, AtelierLightingEval, AtelierListenerPose, AtelierSphereBody,
    AtelierStageLight, StageCullingConfig, StageDepthRange, StageObjectAabb,
    DEFAULT_SPATIAL_CELL_SIZE, MAX_STAGE_AUDIO_SOURCES, MAX_STAGE_CAST_SAMPLES, MAX_STAGE_LIGHTS,
    MAX_STAGE_OBJECTS, MAX_STAGE_OCCLUDERS,
};

/// `AtelierStage` 확장 3D 커널 기능 비트마스크 (`bit0`: 프러스텀+Hi-Z, `bit1`: 공간 해시 구체 해소, `bit2`: 공간 음향·광원).
pub const WASM_ATELIER_STAGE_3D_CAPABILITIES: u32 = 0x07;
pub const STAGE_CULL_CAMERA_FFI_LEN: usize = 7;
pub const STAGE_CULL_AABB_STRIDE: usize = 7;
pub const STAGE_CULL_STATS_FFI_LEN: usize = 4;
pub const STAGE_SPHERE_BODY_STRIDE: usize = 5;
pub const STAGE_LISTENER_FFI_LEN: usize = 11;
pub const STAGE_AUDIO_SOURCE_STRIDE: usize = 7;
pub const STAGE_AUDIO_OUT_STRIDE: usize = 6;
pub const STAGE_LIGHT_STRIDE: usize = 9;
pub const STAGE_CAST_SAMPLE_STRIDE: usize = 8;
pub const STAGE_LIGHTING_OUT_STRIDE: usize = 8;

/// `extended-3d` 피처 활성 시 `AtelierStage` 3D 커널 기능 비트마스크를 반환한다.
#[no_mangle]
#[must_use]
pub extern "C" fn wasm_atelier_stage_3d_capabilities() -> u32 {
    WASM_ATELIER_STAGE_3D_CAPABILITIES
}

#[inline]
fn aligned_non_null<T>(ptr_addr: usize) -> bool {
    ptr_addr != 0 && ptr_addr.is_multiple_of(mem::align_of::<T>())
}

/// 선형 메모리 제로카피 6평면 프러스텀 + 64×36 Hi-Z 차폐 컬링 C-ABI 진입점 (`extended-3d` 피처 전용).
///
/// 반환값: 0 이상은 가시 오브젝트 수, 음수는 `FFI_ERR_*` 오류 코드.
///
/// # Safety
/// 모든 비-null 포인터는 타입 정렬과 명시 길이를 만족하는 유효 선형 메모리여야 하며,
/// 출력 버퍼(`out_visible_indices_ptr`, `out_visible_lods_ptr`, `out_stats_ptr`)는 서로 및 모든 입력과 겹치지 않아야 한다.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn wasm_cull_stage_frustum_hiz(
    view_proj_ptr: *const f32,
    camera_and_lod_ptr: *const f32,
    aabbs_ptr: *const f32,
    object_count: u32,
    out_visible_indices_ptr: *mut u32,
    out_visible_lods_ptr: *mut u8,
    out_stats_ptr: *mut u32,
) -> i32 {
    let n = object_count as usize;
    if n > MAX_STAGE_OBJECTS {
        return FFI_ERR_INVALID_PARAMETER;
    }
    if !aligned_non_null::<f32>(view_proj_ptr as usize)
        || !aligned_non_null::<f32>(camera_and_lod_ptr as usize)
        || (!out_stats_ptr.is_null() && !aligned_non_null::<u32>(out_stats_ptr as usize))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    if n > 0
        && (!aligned_non_null::<f32>(aabbs_ptr as usize)
            || !aligned_non_null::<u32>(out_visible_indices_ptr as usize)
            || out_visible_lods_ptr.is_null())
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let Some(aabb_f32_len) = n.checked_mul(STAGE_CULL_AABB_STRIDE) else {
        return FFI_ERR_OVERFLOW;
    };
    let (vp_b, cam_b, aabb_b, idx_b, lod_b, stat_b) = match (
        checked_byte_len(16, mem::size_of::<f32>()),
        checked_byte_len(STAGE_CULL_CAMERA_FFI_LEN, mem::size_of::<f32>()),
        checked_byte_len(aabb_f32_len, mem::size_of::<f32>()),
        checked_byte_len(n, mem::size_of::<u32>()),
        checked_byte_len(n, mem::size_of::<u8>()),
        checked_byte_len(STAGE_CULL_STATS_FFI_LEN, mem::size_of::<u32>()),
    ) {
        (Ok(a), Ok(b), Ok(c), Ok(d), Ok(e), Ok(f)) => (a, b, c, d, e, f),
        _ => return FFI_ERR_OVERFLOW,
    };

    let outs = [
        (
            out_visible_indices_ptr as usize,
            if n > 0 { idx_b } else { 0 },
        ),
        (out_visible_lods_ptr as usize, if n > 0 { lod_b } else { 0 }),
        (
            out_stats_ptr as usize,
            if out_stats_ptr.is_null() { 0 } else { stat_b },
        ),
    ];
    let ins = [
        (view_proj_ptr as usize, vp_b),
        (camera_and_lod_ptr as usize, cam_b),
        (aabbs_ptr as usize, if n > 0 { aabb_b } else { 0 }),
    ];
    for a in 0..outs.len() {
        for b in (a + 1)..outs.len() {
            if ranges_overlap(outs[a].0, outs[a].1, outs[b].0, outs[b].1) {
                return FFI_ERR_NULL_OR_ALIAS;
            }
        }
        if ins
            .iter()
            .any(|&(ia, il)| ranges_overlap(outs[a].0, outs[a].1, ia, il))
        {
            return FFI_ERR_NULL_OR_ALIAS;
        }
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (vp, cam_p, aabb_raw, out_idx, out_lod) = unsafe {
        (
            *view_proj_ptr.cast::<[f32; 16]>(),
            *camera_and_lod_ptr.cast::<[f32; STAGE_CULL_CAMERA_FFI_LEN]>(),
            if n == 0 {
                &[][..]
            } else {
                slice::from_raw_parts(aabbs_ptr, aabb_f32_len)
            },
            if n == 0 {
                &mut [][..]
            } else {
                slice::from_raw_parts_mut(out_visible_indices_ptr, n)
            },
            if n == 0 {
                &mut [][..]
            } else {
                slice::from_raw_parts_mut(out_visible_lods_ptr, n)
            },
        )
    };
    if !cam_p[6].is_finite() || (cam_p[6] != 0.0 && cam_p[6] != 1.0) {
        return FFI_ERR_INVALID_PARAMETER;
    }
    let Some(depth_range) = StageDepthRange::from_u32(cam_p[6] as u32) else {
        return FFI_ERR_INVALID_PARAMETER;
    };
    let cfg = StageCullingConfig {
        view_proj: vp,
        camera_pos: [cam_p[0], cam_p[1], cam_p[2]],
        lod_distances: [cam_p[3], cam_p[4], cam_p[5]],
        depth_range,
        max_occluders: MAX_STAGE_OCCLUDERS,
    };
    let mut objs = Vec::with_capacity(n);
    for chunk in aabb_raw.as_chunks::<STAGE_CULL_AABB_STRIDE>().0 {
        if !chunk[6].is_finite() {
            return FFI_ERR_INVALID_PARAMETER;
        }
        objs.push(StageObjectAabb::new(
            [chunk[0], chunk[1], chunk[2]],
            [chunk[3], chunk[4], chunk[5]],
            chunk[6] > 0.5,
        ));
    }
    match cull_scene_frustum_and_hiz_into(&objs, &cfg, out_idx, out_lod) {
        Ok(stats) => {
            if !out_stats_ptr.is_null() {
                // SAFETY: `out_stats_ptr`은 정렬·비중첩 검증 완료된 `u32[4]` 출력 버퍼다.
                unsafe {
                    let s = slice::from_raw_parts_mut(out_stats_ptr, STAGE_CULL_STATS_FFI_LEN);
                    s[0] = stats.visible_count as u32;
                    s[1] = stats.frustum_culled_count as u32;
                    s[2] = stats.occlusion_culled_count as u32;
                    s[3] = stats.occluders_rasterized as u32;
                }
            }
            count_to_i32(stats.visible_count)
        }
        Err(ref err) => error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 3D 공간 해시 구체 침투 해소 C-ABI 진입점 (`extended-3d` 피처 전용).
///
/// `spheres_ptr`은 `sphere_count * 5`개의 `f32` (`[x, y, z, radius, inv_mass]`) 배열이며 제자리 갱신된다.
/// 반환값: 0 이상은 해소된 침투 쌍 수, 음수는 `FFI_ERR_*` 오류 코드.
///
/// # Safety
/// `spheres_ptr`은 `sphere_count > 0`일 때 4바이트 정렬된 유효 선형 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_resolve_stage_sphere_overlaps(
    spheres_ptr: *mut f32,
    sphere_count: u32,
    cell_size: f32,
    iterations: u32,
    relaxation: f32,
) -> i32 {
    let n = sphere_count as usize;
    if n > MAX_STAGE_OBJECTS {
        return FFI_ERR_INVALID_PARAMETER;
    }
    let effective_cell = if cell_size == 0.0 {
        DEFAULT_SPATIAL_CELL_SIZE
    } else {
        cell_size
    };
    if n == 0 {
        return match resolve_sphere_overlaps(&mut [], effective_cell, iterations, relaxation) {
            Ok(_) => 0,
            Err(ref err) => error_to_ffi_code(err),
        };
    }
    if !aligned_non_null::<f32>(spheres_ptr as usize) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let Some(f32_len) = n.checked_mul(STAGE_SPHERE_BODY_STRIDE) else {
        return FFI_ERR_OVERFLOW;
    };
    if checked_byte_len(f32_len, mem::size_of::<f32>()).is_err() {
        return FFI_ERR_OVERFLOW;
    }
    // SAFETY: null·정렬·오버플로 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let raw = unsafe { slice::from_raw_parts_mut(spheres_ptr, f32_len) };
    let mut bodies = Vec::with_capacity(n);
    for (idx, c) in raw
        .as_chunks::<STAGE_SPHERE_BODY_STRIDE>()
        .0
        .iter()
        .enumerate()
    {
        bodies.push(AtelierSphereBody::new(
            idx as u32,
            [c[0], c[1], c[2]],
            c[3],
            c[4],
        ));
    }
    match resolve_sphere_overlaps(&mut bodies, effective_cell, iterations, relaxation) {
        Ok(stats) => {
            for (dst, b) in raw
                .as_chunks_mut::<STAGE_SPHERE_BODY_STRIDE>()
                .0
                .iter_mut()
                .zip(bodies.iter())
            {
                dst[0] = b.pos[0];
                dst[1] = b.pos[1];
                dst[2] = b.pos[2];
            }
            count_to_i32(stats.resolved_pairs)
        }
        Err(ref err) => error_to_ffi_code(err),
    }
}

/// 선형 메모리 제로카피 `AtelierStage` 공간 음향 HRTF + 물리 광원 조도/림라이트 C-ABI 진입점 (`extended-3d` 피처 전용).
///
/// 반환값: 0 이상은 평가된 `source_count + sample_count` 합계, 음수는 `FFI_ERR_*` 오류 코드.
///
/// # Safety
/// 모든 비-null 포인터는 4바이트 정렬과 명시 길이를 만족하는 유효 선형 메모리여야 하며,
/// 출력 버퍼(`out_audio_ptr`, `out_lighting_ptr`)는 서로 및 모든 입력 버퍼와 겹치지 않아야 한다.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn wasm_evaluate_stage_acoustics_and_lighting(
    listener_ptr: *const f32,
    sources_ptr: *const f32,
    lights_ptr: *const f32,
    samples_ptr: *const f32,
    source_count: u32,
    light_count: u32,
    sample_count: u32,
    out_audio_ptr: *mut f32,
    out_lighting_ptr: *mut f32,
) -> i32 {
    let (ns, nl, nc) = (
        source_count as usize,
        light_count as usize,
        sample_count as usize,
    );
    if ns > MAX_STAGE_AUDIO_SOURCES || nl > MAX_STAGE_LIGHTS || nc > MAX_STAGE_CAST_SAMPLES {
        return FFI_ERR_INVALID_PARAMETER;
    }
    if !aligned_non_null::<f32>(listener_ptr as usize)
        || (ns > 0
            && (!aligned_non_null::<f32>(sources_ptr as usize)
                || !aligned_non_null::<f32>(out_audio_ptr as usize)))
        || (nl > 0 && !aligned_non_null::<f32>(lights_ptr as usize))
        || (nc > 0
            && (!aligned_non_null::<f32>(samples_ptr as usize)
                || !aligned_non_null::<f32>(out_lighting_ptr as usize)))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let (Some(src_len), Some(lgt_len), Some(smp_len), Some(oa_len), Some(ol_len)) = (
        ns.checked_mul(STAGE_AUDIO_SOURCE_STRIDE),
        nl.checked_mul(STAGE_LIGHT_STRIDE),
        nc.checked_mul(STAGE_CAST_SAMPLE_STRIDE),
        ns.checked_mul(STAGE_AUDIO_OUT_STRIDE),
        nc.checked_mul(STAGE_LIGHTING_OUT_STRIDE),
    ) else {
        return FFI_ERR_OVERFLOW;
    };
    let (lis_b, src_b, lgt_b, smp_b, oa_b, ol_b) = match (
        checked_byte_len(STAGE_LISTENER_FFI_LEN, mem::size_of::<f32>()),
        checked_byte_len(src_len, mem::size_of::<f32>()),
        checked_byte_len(lgt_len, mem::size_of::<f32>()),
        checked_byte_len(smp_len, mem::size_of::<f32>()),
        checked_byte_len(oa_len, mem::size_of::<f32>()),
        checked_byte_len(ol_len, mem::size_of::<f32>()),
    ) {
        (Ok(a), Ok(b), Ok(c), Ok(d), Ok(e), Ok(f)) => (a, b, c, d, e, f),
        _ => return FFI_ERR_OVERFLOW,
    };

    let (oa_addr, ol_addr) = (out_audio_ptr as usize, out_lighting_ptr as usize);
    let ins = [
        (listener_ptr as usize, lis_b),
        (sources_ptr as usize, src_b),
        (lights_ptr as usize, lgt_b),
        (samples_ptr as usize, smp_b),
    ];
    if ranges_overlap(oa_addr, oa_b, ol_addr, ol_b)
        || ins.iter().any(|&(ia, il)| {
            ranges_overlap(oa_addr, oa_b, ia, il) || ranges_overlap(ol_addr, ol_b, ia, il)
        })
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료, 호출자가 유효 선형 메모리 범위를 보장한다.
    let (lp, src_raw, lgt_raw, smp_raw, oa_raw, ol_raw) = unsafe {
        (
            *listener_ptr.cast::<[f32; STAGE_LISTENER_FFI_LEN]>(),
            if ns == 0 {
                &[][..]
            } else {
                slice::from_raw_parts(sources_ptr, src_len)
            },
            if nl == 0 {
                &[][..]
            } else {
                slice::from_raw_parts(lights_ptr, lgt_len)
            },
            if nc == 0 {
                &[][..]
            } else {
                slice::from_raw_parts(samples_ptr, smp_len)
            },
            if ns == 0 {
                &mut [][..]
            } else {
                slice::from_raw_parts_mut(out_audio_ptr, oa_len)
            },
            if nc == 0 {
                &mut [][..]
            } else {
                slice::from_raw_parts_mut(out_lighting_ptr, ol_len)
            },
        )
    };
    let listener = AtelierListenerPose {
        position: [lp[0], lp[1], lp[2]],
        forward: [lp[3], lp[4], lp[5]],
        up: [lp[6], lp[7], lp[8]],
        head_shadow_lpf_hz: lp[9],
        air_absorption_per_m: lp[10],
    };
    let mut sources = Vec::with_capacity(ns);
    for c in src_raw.as_chunks::<STAGE_AUDIO_SOURCE_STRIDE>().0 {
        sources.push(AtelierAudioSource {
            position: [c[0], c[1], c[2]],
            base_gain: c[3],
            ref_distance: c[4],
            max_distance: c[5],
            occlusion_factor: c[6],
        });
    }
    let mut lights = Vec::with_capacity(nl);
    for c in lgt_raw.as_chunks::<STAGE_LIGHT_STRIDE>().0 {
        if !c[0].is_finite() || (c[0] != 0.0 && c[0] != 1.0) {
            return FFI_ERR_INVALID_PARAMETER;
        }
        let Some(kind) = AtelierLightKind::from_u32(c[0] as u32) else {
            return FFI_ERR_INVALID_PARAMETER;
        };
        lights.push(AtelierStageLight {
            kind,
            position_or_dir: [c[1], c[2], c[3]],
            color_rgb: [c[4], c[5], c[6]],
            intensity: c[7],
            radius: c[8],
        });
    }
    let mut samples = Vec::with_capacity(nc);
    for c in smp_raw.as_chunks::<STAGE_CAST_SAMPLE_STRIDE>().0 {
        samples.push(AtelierCastSample {
            position: [c[0], c[1], c[2]],
            normal: [c[3], c[4], c[5]],
            rim_power: c[6],
            rim_strength: c[7],
        });
    }
    let mut out_audio = vec![AtelierAudioEval::default(); ns];
    let mut out_lighting = vec![AtelierLightingEval::default(); nc];
    match evaluate_stage_acoustics_and_lighting(
        &listener,
        &sources,
        &lights,
        &samples,
        &mut out_audio,
        &mut out_lighting,
    ) {
        Ok(stats) => {
            for (dst, a) in oa_raw
                .as_chunks_mut::<STAGE_AUDIO_OUT_STRIDE>()
                .0
                .iter_mut()
                .zip(out_audio.iter())
            {
                dst[0] = a.left_gain;
                dst[1] = a.right_gain;
                dst[2] = a.distance_attenuation;
                dst[3] = a.pan;
                dst[4] = a.lowpass_cutoff_hz;
                dst[5] = a.lowpass_damping;
            }
            for (dst, g) in ol_raw
                .as_chunks_mut::<STAGE_LIGHTING_OUT_STRIDE>()
                .0
                .iter_mut()
                .zip(out_lighting.iter())
            {
                dst[0] = g.irradiance_rgb[0];
                dst[1] = g.irradiance_rgb[1];
                dst[2] = g.irradiance_rgb[2];
                dst[3] = g.rim_rgb[0];
                dst[4] = g.rim_rgb[1];
                dst[5] = g.rim_rgb[2];
                dst[6] = g.total_illuminance;
                dst[7] = g.rim_intensity;
            }
            count_to_i32(
                stats
                    .evaluated_sources
                    .saturating_add(stats.evaluated_samples),
            )
        }
        Err(ref err) => error_to_ffi_code(err),
    }
}
