//! Wave-3 순수 안전 Rust 확장 스위트 커널 C-ABI (Audio DSP + Vector Path, `extended-suite`).

use super::*;
use crate::audio_dsp_mixer_kernel::{
    mix_and_master_stereo, process_biquad_stereo_in_place, process_schroeder_reverb_stereo,
    resample_mono, BiquadCoeffs, BiquadFilterKind, BiquadState, DynamicsConfig, MixTrackParams,
    ResampleInterpolation, SchroederReverbConfig,
};
use crate::vector_path_kernel::{
    expand_variable_width_stroke, flatten_cubic_bezier_adaptive, hit_test_polygon_batch_2d,
    simplify_polyline_rdp, smooth_polyline_chaikin, StrokeJoinStyle, WindingFillRule,
};

/// Wave-3 확장 스위트 커널 기능 비트마스크 (`0x0F` = Audio + Vector + Webtoon Slicer + Color/CMYK).
pub const WASM_WAVE3_CAPABILITIES: u32 = 0x0F;

pub const WAVE3_BIQUAD_PARAM_LEN: usize = 4;
pub const WAVE3_BIQUAD_STATE_LEN: usize = 4;
pub const WAVE3_MIX_TRACK_STRIDE: usize = 3;
pub const WAVE3_DYNAMICS_PARAM_LEN: usize = 8;
pub const WAVE3_MIX_METRICS_LEN: usize = 6;
pub const WAVE3_REVERB_PARAM_LEN: usize = 5;
pub const WAVE3_BEZIER_CTRL_LEN: usize = 8;

#[inline]
pub(super) fn is_aligned_non_null<T>(addr: usize) -> bool {
    addr != 0 && addr.is_multiple_of(mem::align_of::<T>())
}

#[inline]
pub(super) fn is_aligned_opt<T>(addr: usize) -> bool {
    addr == 0 || addr.is_multiple_of(mem::align_of::<T>())
}

#[inline]
pub(super) fn checked_bytes(count: usize, elem_size: usize) -> Result<usize, i32> {
    let bytes = count.checked_mul(elem_size).ok_or(FFI_ERR_OVERFLOW)?;
    if bytes > isize::MAX as usize {
        return Err(FFI_ERR_OVERFLOW);
    }
    Ok(bytes)
}

fn write_xy_output(
    src_xy: &[f32],
    out_xy_ptr: *mut f32,
    out_point_capacity: u32,
    in_addr: usize,
    in_bytes: usize,
) -> i32 {
    let needed_pts = src_xy.len() / 2;
    if out_xy_ptr.is_null() && out_point_capacity == 0 {
        return count_to_i32(needed_pts);
    }
    if (out_point_capacity as usize) < needed_pts {
        return FFI_ERR_BUFFER_LENGTH;
    }
    if needed_pts == 0 {
        return 0;
    }
    if !is_aligned_non_null::<f32>(out_xy_ptr as usize) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let Ok(out_bytes) = checked_bytes(src_xy.len(), mem::size_of::<f32>()) else {
        return FFI_ERR_OVERFLOW;
    };
    if ranges_overlap(in_addr, in_bytes, out_xy_ptr as usize, out_bytes) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    // SAFETY: 정렬·길이·비중첩 검증 완료, 호출자가 유효 출력 메모리를 보장한다.
    let dst = unsafe { slice::from_raw_parts_mut(out_xy_ptr, src_xy.len()) };
    dst.copy_from_slice(src_xy);
    count_to_i32(needed_pts)
}

/// Wave-3 확장 스위트 활성 기능 비트마스크를 반환한다 (`0x0F`).
#[no_mangle]
#[must_use]
pub extern "C" fn wasm_wave3_capabilities() -> u32 {
    WASM_WAVE3_CAPABILITIES
}

/// 스테레오 RBJ Biquad 파라메트릭 EQ 제자리 처리 (`params = [sr, freq, q, gain_db]`, `state = [lz1, lz2, rz1, rz2]`).
///
/// # Safety
/// 모든 포인터는 4바이트 정렬·명시 길이 이상의 유효 선형 메모리이며 `left_ptr`·`right_ptr`은 겹치지 않아야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_audio_biquad_eq_stereo(
    left_ptr: *mut f32,
    right_ptr: *mut f32,
    frames: u32,
    filter_kind: u32,
    params_ptr: *const f32,
    state_ptr: *mut f32,
) -> i32 {
    let Some(kind) = BiquadFilterKind::from_u32(filter_kind) else {
        return FFI_ERR_INVALID_PARAMETER;
    };
    if !is_aligned_non_null::<f32>(params_ptr as usize) || !is_aligned_opt::<f32>(state_ptr as usize) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    let n = frames as usize;
    let Ok(buf_bytes) = checked_bytes(n, mem::size_of::<f32>()) else {
        return FFI_ERR_OVERFLOW;
    };
    if n > 0 && (!is_aligned_non_null::<f32>(left_ptr as usize) || !is_aligned_non_null::<f32>(right_ptr as usize)) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    if ranges_overlap(left_ptr as usize, buf_bytes, right_ptr as usize, buf_bytes) {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: 정렬·길이·비중첩 검증 완료.
    let (p, left, right, st_opt) = unsafe {
        let p = *params_ptr.cast::<[f32; WAVE3_BIQUAD_PARAM_LEN]>();
        let l = if n == 0 { &mut [][..] } else { slice::from_raw_parts_mut(left_ptr, n) };
        let r = if n == 0 { &mut [][..] } else { slice::from_raw_parts_mut(right_ptr, n) };
        let st = if state_ptr.is_null() {
            None
        } else {
            Some(slice::from_raw_parts_mut(state_ptr, WAVE3_BIQUAD_STATE_LEN))
        };
        (p, l, r, st)
    };
    let coeffs = match BiquadCoeffs::design(kind, p[0], p[1], p[2], p[3]) {
        Ok(c) => c,
        Err(ref e) => return error_to_ffi_code(e),
    };
    let (mut sl, mut sr) = match st_opt.as_deref() {
        Some(s) => (BiquadState { z1: s[0], z2: s[1] }, BiquadState { z1: s[2], z2: s[3] }),
        None => (BiquadState::default(), BiquadState::default()),
    };
    match process_biquad_stereo_in_place(left, right, &coeffs, &mut sl, &mut sr) {
        Ok(done) => {
            if let Some(s) = st_opt {
                s[0] = sl.z1;
                s[1] = sl.z2;
                s[2] = sr.z1;
                s[3] = sr.z2;
            }
            count_to_i32(done)
        }
        Err(ref e) => error_to_ffi_code(e),
    }
}

/// 다중 모노 트랙 스테레오 믹서 + 소프트-니 컴프레서/브릭월 리미터 + K-가중 LUFS/True-Peak 측정.
///
/// # Safety
/// 모든 포인터는 4바이트 정렬·명시 길이 이상의 유효 선형 메모리이며 출력 버퍼는 입력과 겹치지 않아야 한다.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn wasm_audio_mix_master_stereo(
    tracks_ptr: *const f32,
    track_count: u32,
    frames: u32,
    track_params_ptr: *const f32,
    dynamics_params_ptr: *const f32,
    out_left_ptr: *mut f32,
    out_right_ptr: *mut f32,
    out_metrics_ptr: *mut f32,
) -> i32 {
    let (tc, n) = (track_count as usize, frames as usize);
    let (Some(total_samples), Some(param_len)) = (tc.checked_mul(n), tc.checked_mul(WAVE3_MIX_TRACK_STRIDE)) else {
        return FFI_ERR_OVERFLOW;
    };
    let (Ok(tr_bytes), Ok(out_bytes)) = (
        checked_bytes(total_samples, mem::size_of::<f32>()),
        checked_bytes(n, mem::size_of::<f32>()),
    ) else {
        return FFI_ERR_OVERFLOW;
    };
    if (total_samples > 0 && !is_aligned_non_null::<f32>(tracks_ptr as usize))
        || (param_len > 0 && !is_aligned_non_null::<f32>(track_params_ptr as usize))
        || !is_aligned_opt::<f32>(dynamics_params_ptr as usize)
        || (n > 0 && (!is_aligned_non_null::<f32>(out_left_ptr as usize) || !is_aligned_non_null::<f32>(out_right_ptr as usize)))
        || !is_aligned_opt::<f32>(out_metrics_ptr as usize)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    if ranges_overlap(out_left_ptr as usize, out_bytes, out_right_ptr as usize, out_bytes)
        || ranges_overlap(tracks_ptr as usize, tr_bytes, out_left_ptr as usize, out_bytes)
        || ranges_overlap(tracks_ptr as usize, tr_bytes, out_right_ptr as usize, out_bytes)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·오버플로·비중첩 검증 완료.
    let (tracks, raw_tp, dyn_cfg, out_l, out_r, metrics_opt) = unsafe {
        let tr = if total_samples == 0 { &[][..] } else { slice::from_raw_parts(tracks_ptr, total_samples) };
        let tp = if param_len == 0 { &[][..] } else { slice::from_raw_parts(track_params_ptr, param_len) };
        let dc = if dynamics_params_ptr.is_null() {
            DynamicsConfig::default()
        } else {
            let d = *dynamics_params_ptr.cast::<[f32; WAVE3_DYNAMICS_PARAM_LEN]>();
            DynamicsConfig {
                sample_rate: d[0], threshold_db: d[1], ratio: d[2], knee_db: d[3],
                attack_ms: d[4], release_ms: d[5], makeup_db: d[6], limiter_ceiling_db: d[7],
            }
        };
        let ol = if n == 0 { &mut [][..] } else { slice::from_raw_parts_mut(out_left_ptr, n) };
        let or = if n == 0 { &mut [][..] } else { slice::from_raw_parts_mut(out_right_ptr, n) };
        let mo = if out_metrics_ptr.is_null() {
            None
        } else {
            Some(slice::from_raw_parts_mut(out_metrics_ptr, WAVE3_MIX_METRICS_LEN))
        };
        (tr, tp, dc, ol, or, mo)
    };

    let mut params = Vec::with_capacity(tc);
    for &[gain, pan, mute_flag] in raw_tp.as_chunks::<WAVE3_MIX_TRACK_STRIDE>().0 {
        params.push(MixTrackParams { gain, pan, mute: mute_flag >= 0.5 });
    }
    match mix_and_master_stereo(tracks, tc, n, &params, &dyn_cfg, out_l, out_r) {
        Ok(rep) => {
            if let Some(m) = metrics_opt {
                m[0] = rep.loudness.integrated_lufs;
                m[1] = rep.loudness.true_peak_linear;
                m[2] = rep.loudness.true_peak_dbfs;
                m[3] = rep.loudness.sample_peak_linear;
                m[4] = rep.dynamics.max_gain_reduction_db;
                m[5] = rep.active_tracks as f32;
            }
            count_to_i32(rep.frames)
        }
        Err(ref e) => error_to_ffi_code(e),
    }
}

/// Schroeder 알고리즘 스테레오 리버브 (`params = [sr, room_size, damping, wet, dry]`).
///
/// # Safety
/// 입출력 버퍼는 4바이트 정렬·`frames` 길이이며 출력 버퍼는 입력 및 서로와 겹치지 않아야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_audio_schroeder_reverb_stereo(
    in_left_ptr: *const f32,
    in_right_ptr: *const f32,
    out_left_ptr: *mut f32,
    out_right_ptr: *mut f32,
    frames: u32,
    params_ptr: *const f32,
) -> i32 {
    let n = frames as usize;
    let Ok(bytes) = checked_bytes(n, mem::size_of::<f32>()) else {
        return FFI_ERR_OVERFLOW;
    };
    if !is_aligned_opt::<f32>(params_ptr as usize)
        || (n > 0
            && (!is_aligned_non_null::<f32>(in_left_ptr as usize)
                || !is_aligned_non_null::<f32>(in_right_ptr as usize)
                || !is_aligned_non_null::<f32>(out_left_ptr as usize)
                || !is_aligned_non_null::<f32>(out_right_ptr as usize)))
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    if ranges_overlap(out_left_ptr as usize, bytes, out_right_ptr as usize, bytes)
        || ranges_overlap(out_left_ptr as usize, bytes, in_left_ptr as usize, bytes)
        || ranges_overlap(out_left_ptr as usize, bytes, in_right_ptr as usize, bytes)
        || ranges_overlap(out_right_ptr as usize, bytes, in_left_ptr as usize, bytes)
        || ranges_overlap(out_right_ptr as usize, bytes, in_right_ptr as usize, bytes)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }

    // SAFETY: null·정렬·길이·비중첩 검증 완료.
    let (il, ir, ol, or, cfg) = unsafe {
        let cfg = if params_ptr.is_null() {
            SchroederReverbConfig::default()
        } else {
            let p = *params_ptr.cast::<[f32; WAVE3_REVERB_PARAM_LEN]>();
            SchroederReverbConfig { sample_rate: p[0], room_size: p[1], damping: p[2], wet: p[3], dry: p[4] }
        };
        (
            if n == 0 { &[][..] } else { slice::from_raw_parts(in_left_ptr, n) },
            if n == 0 { &[][..] } else { slice::from_raw_parts(in_right_ptr, n) },
            if n == 0 { &mut [][..] } else { slice::from_raw_parts_mut(out_left_ptr, n) },
            if n == 0 { &mut [][..] } else { slice::from_raw_parts_mut(out_right_ptr, n) },
            cfg,
        )
    };
    match process_schroeder_reverb_stereo(il, ir, ol, or, &cfg) {
        Ok(done) => count_to_i32(done),
        Err(ref e) => error_to_ffi_code(e),
    }
}

/// 선형/큐빅 에르미트 모노 피치-타임 리샘플러 (`interp_mode`: `0=Linear`, `1=CubicHermite`).
///
/// # Safety
/// 입출력 포인터는 4바이트 정렬·비중첩 유효 선형 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_audio_resample_mono(
    in_ptr: *const f32,
    in_len: u32,
    out_ptr: *mut f32,
    out_len: u32,
    rate_ratio: f32,
    interp_mode: u32,
) -> i32 {
    let Some(mode) = ResampleInterpolation::from_u32(interp_mode) else {
        return FFI_ERR_INVALID_PARAMETER;
    };
    let (ni, no) = (in_len as usize, out_len as usize);
    let (Ok(ib), Ok(ob)) = (
        checked_bytes(ni, mem::size_of::<f32>()),
        checked_bytes(no, mem::size_of::<f32>()),
    ) else {
        return FFI_ERR_OVERFLOW;
    };
    if (ni > 0 && !is_aligned_non_null::<f32>(in_ptr as usize))
        || (no > 0 && !is_aligned_non_null::<f32>(out_ptr as usize))
        || ranges_overlap(in_ptr as usize, ib, out_ptr as usize, ob)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    // SAFETY: null·정렬·길이·비중첩 검증 완료.
    let (inp, out) = unsafe {
        (
            if ni == 0 { &[][..] } else { slice::from_raw_parts(in_ptr, ni) },
            if no == 0 { &mut [][..] } else { slice::from_raw_parts_mut(out_ptr, no) },
        )
    };
    match resample_mono(inp, out, rate_ratio, mode) {
        Ok(done) => count_to_i32(done),
        Err(ref e) => error_to_ffi_code(e),
    }
}

/// Ramer-Douglas-Peucker 폴리라인 단순화 (`out_xy_ptr == null && out_point_capacity == 0` 시 필요 정점 수 반환).
///
/// # Safety
/// 포인터는 4바이트 정렬·명시 길이·비중첩 유효 선형 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_vector_simplify_rdp(
    in_xy_ptr: *const f32,
    point_count: u32,
    epsilon: f32,
    out_xy_ptr: *mut f32,
    out_point_capacity: u32,
) -> i32 {
    let n = point_count as usize;
    let Some(in_len) = n.checked_mul(2) else {
        return FFI_ERR_OVERFLOW;
    };
    let Ok(in_bytes) = checked_bytes(in_len, mem::size_of::<f32>()) else {
        return FFI_ERR_OVERFLOW;
    };
    if n > 0 && !is_aligned_non_null::<f32>(in_xy_ptr as usize) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    // SAFETY: 정렬·길이 검증 완료.
    let inp = unsafe { if n == 0 { &[][..] } else { slice::from_raw_parts(in_xy_ptr, in_len) } };
    match simplify_polyline_rdp(inp, epsilon) {
        Ok(simplified) => write_xy_output(&simplified, out_xy_ptr, out_point_capacity, in_xy_ptr as usize, in_bytes),
        Err(ref e) => error_to_ffi_code(e),
    }
}

/// Chaikin 코너 스무딩 (`closed`: `0=open`, `1=closed`, 2패스 용량 조회 지원).
///
/// # Safety
/// 포인터는 4바이트 정렬·명시 길이·비중첩 유효 선형 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_vector_smooth_chaikin(
    in_xy_ptr: *const f32,
    point_count: u32,
    iterations: u32,
    closed: u32,
    ratio: f32,
    out_xy_ptr: *mut f32,
    out_point_capacity: u32,
) -> i32 {
    if closed > 1 {
        return FFI_ERR_INVALID_PARAMETER;
    }
    let n = point_count as usize;
    let Some(in_len) = n.checked_mul(2) else {
        return FFI_ERR_OVERFLOW;
    };
    let Ok(in_bytes) = checked_bytes(in_len, mem::size_of::<f32>()) else {
        return FFI_ERR_OVERFLOW;
    };
    if n > 0 && !is_aligned_non_null::<f32>(in_xy_ptr as usize) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    // SAFETY: 정렬·길이 검증 완료.
    let inp = unsafe { if n == 0 { &[][..] } else { slice::from_raw_parts(in_xy_ptr, in_len) } };
    match smooth_polyline_chaikin(inp, iterations, closed != 0, ratio) {
        Ok(smoothed) => write_xy_output(&smoothed, out_xy_ptr, out_point_capacity, in_xy_ptr as usize, in_bytes),
        Err(ref e) => error_to_ffi_code(e),
    }
}

/// 3차 베지어 적응형 평탄화 + 누적 호 길이 테이블 (`ctrl_xy_ptr`: `f32[8]`, 2패스 용량 조회 지원).
///
/// # Safety
/// 포인터는 4바이트 정렬·비중첩 유효 선형 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_vector_flatten_bezier_arc_len(
    ctrl_xy_ptr: *const f32,
    tolerance: f32,
    out_xy_ptr: *mut f32,
    out_arclen_ptr: *mut f32,
    out_point_capacity: u32,
) -> i32 {
    if !is_aligned_non_null::<f32>(ctrl_xy_ptr as usize) || !is_aligned_opt::<f32>(out_arclen_ptr as usize) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    // SAFETY: 정렬·비null 검증 완료.
    let c = unsafe { *ctrl_xy_ptr.cast::<[f32; WAVE3_BEZIER_CTRL_LEN]>() };
    let flat = match flatten_cubic_bezier_adaptive([c[0], c[1]], [c[2], c[3]], [c[4], c[5]], [c[6], c[7]], tolerance) {
        Ok(f) => f,
        Err(ref e) => return error_to_ffi_code(e),
    };
    let pts = flat.arc_lengths.len();
    if out_xy_ptr.is_null() && out_point_capacity == 0 {
        return count_to_i32(pts);
    }
    let ctrl_bytes = WAVE3_BEZIER_CTRL_LEN * mem::size_of::<f32>();
    let written = write_xy_output(&flat.points_xy, out_xy_ptr, out_point_capacity, ctrl_xy_ptr as usize, ctrl_bytes);
    if written < 0 {
        return written;
    }
    if !out_arclen_ptr.is_null() {
        let Ok(arc_bytes) = checked_bytes(pts, mem::size_of::<f32>()) else {
            return FFI_ERR_OVERFLOW;
        };
        let xy_bytes = arc_bytes.saturating_mul(2);
        if ranges_overlap(out_arclen_ptr as usize, arc_bytes, out_xy_ptr as usize, xy_bytes)
            || ranges_overlap(out_arclen_ptr as usize, arc_bytes, ctrl_xy_ptr as usize, ctrl_bytes)
        {
            return FFI_ERR_NULL_OR_ALIAS;
        }
        // SAFETY: 정렬·길이·비중첩 검증 완료.
        let dst = unsafe { slice::from_raw_parts_mut(out_arclen_ptr, pts) };
        dst.copy_from_slice(&flat.arc_lengths);
    }
    written
}

/// 가변 폭 스트로크 외곽선 확장 (`spine_xyw`: 스트라이드 3, `join_style`: `0=Bevel`, `1=Miter`, 2패스 용량 조회 지원).
///
/// # Safety
/// 포인터는 4바이트 정렬·명시 길이·비중첩 유효 선형 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_vector_expand_stroke_outline(
    spine_xyw_ptr: *const f32,
    point_count: u32,
    join_style: u32,
    miter_limit: f32,
    out_poly_xy_ptr: *mut f32,
    out_vertex_capacity: u32,
) -> i32 {
    let join = match join_style {
        0 => StrokeJoinStyle::Bevel,
        1 => StrokeJoinStyle::Miter { miter_limit },
        _ => return FFI_ERR_INVALID_PARAMETER,
    };
    let n = point_count as usize;
    let Some(in_len) = n.checked_mul(3) else {
        return FFI_ERR_OVERFLOW;
    };
    let Ok(in_bytes) = checked_bytes(in_len, mem::size_of::<f32>()) else {
        return FFI_ERR_OVERFLOW;
    };
    if n > 0 && !is_aligned_non_null::<f32>(spine_xyw_ptr as usize) {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    // SAFETY: 정렬·길이 검증 완료.
    let spine = unsafe { if n == 0 { &[][..] } else { slice::from_raw_parts(spine_xyw_ptr, in_len) } };
    match expand_variable_width_stroke(spine, join) {
        Ok(outline) => write_xy_output(&outline.polygon_xy, out_poly_xy_ptr, out_vertex_capacity, spine_xyw_ptr as usize, in_bytes),
        Err(ref e) => error_to_ffi_code(e),
    }
}

/// 2D Non-Zero / Even-Odd 와인딩 일괄 히트 테스트 (`fill_rule`: `0=NonZero`, `1=EvenOdd`).
///
/// # Safety
/// 포인터는 타입 정렬·명시 길이·비중첩 유효 선형 메모리여야 한다.
#[no_mangle]
pub unsafe extern "C" fn wasm_vector_hit_test_batch(
    poly_xy_ptr: *const f32,
    poly_vertex_count: u32,
    queries_xy_ptr: *const f32,
    query_count: u32,
    fill_rule: u32,
    out_hits_ptr: *mut u8,
) -> i32 {
    let Some(rule) = WindingFillRule::from_u32(fill_rule) else {
        return FFI_ERR_INVALID_PARAMETER;
    };
    let (np, nq) = (poly_vertex_count as usize, query_count as usize);
    let (Some(plen), Some(qlen)) = (np.checked_mul(2), nq.checked_mul(2)) else {
        return FFI_ERR_OVERFLOW;
    };
    let (Ok(pb), Ok(qb)) = (
        checked_bytes(plen, mem::size_of::<f32>()),
        checked_bytes(qlen, mem::size_of::<f32>()),
    ) else {
        return FFI_ERR_OVERFLOW;
    };
    if (np > 0 && !is_aligned_non_null::<f32>(poly_xy_ptr as usize))
        || (nq > 0 && (!is_aligned_non_null::<f32>(queries_xy_ptr as usize) || out_hits_ptr.is_null()))
        || ranges_overlap(out_hits_ptr as usize, nq, poly_xy_ptr as usize, pb)
        || ranges_overlap(out_hits_ptr as usize, nq, queries_xy_ptr as usize, qb)
    {
        return FFI_ERR_NULL_OR_ALIAS;
    }
    // SAFETY: null·정렬·길이·비중첩 검증 완료.
    let (poly, queries, out) = unsafe {
        (
            if np == 0 { &[][..] } else { slice::from_raw_parts(poly_xy_ptr, plen) },
            if nq == 0 { &[][..] } else { slice::from_raw_parts(queries_xy_ptr, qlen) },
            if nq == 0 { &mut [][..] } else { slice::from_raw_parts_mut(out_hits_ptr, nq) },
        )
    };
    match hit_test_polygon_batch_2d(poly, queries, rule, out) {
        Ok(hits) => count_to_i32(hits),
        Err(ref e) => error_to_ffi_code(e),
    }
}
