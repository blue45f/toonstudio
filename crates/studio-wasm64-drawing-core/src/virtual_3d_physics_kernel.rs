//! 가상 스튜디오 순수 Rust SIMD128 친화 3D 스프링 물리 · 15관절 손 FABRIK IK · 공간 음향 Foley DSP 커널.
//!
//! 1. 2.5D/3D 스프링 머리카락·의상 베를레(Verlet) 물리 (`step_verlet_spring_chains_soa`):
//!    SoA 4-와이드 SIMD128 적분 + 대칭 Gauss-Seidel PBD 거리 제약(`1..=8`) + 구체 충돌체 + 바닥 반발 + NaN/Inf 가드.
//! 2. 15관절 3D 손가락 FABRIK IK (`solve_finger_fabrik_chain`, `solve_hand_fabrik_15joints`):
//!    3관절(MCP→PIP→DIP→Tip) × 5손가락(15관절) 해부학적 굽힘·외전 제한(과신전 방지) + 변 길이(`<= 1e-4`) 불변 보존.
//! 3. 공간 음향 Foley 2차 Biquad IIR + -24 LUFS 피크 리미터 DSP (`render_foley_biquad_block`):
//!    AudioWorklet `128-sample` Direct Form II Transposed 필터 + Constant-Power 패닝 + Soft-Knee 리미터(`<= 0.95`).
//!
//! 외부 의존성 0개, 힙 할당 0건(`no_std`-친화), `unsafe` 0건.

use core::f32::consts::{FRAC_PI_2, PI};

use crate::DrawingCoreError;

/// AudioWorklet 기본 렌더 퀀텀(128 프레임), 피크 리미터 상한(0.95), Foley 라우드니스 목표(-24 LUFS).
pub const AUDIOWORKLET_BLOCK_FRAMES: usize = 128;
pub const FOLEY_PEAK_CEILING: f32 = 0.95;
pub const FOLEY_TARGET_LUFS: f32 = -24.0;
/// 손가락 1개의 관절 수(3)·좌표점 수(4) 및 한 손의 손가락 수(5)·총 관절 수(15).
pub const FINGER_JOINT_COUNT: usize = 3;
pub const FINGER_POINT_COUNT: usize = 4;
pub const HAND_FINGER_COUNT: usize = 5;
pub const HAND_TOTAL_JOINTS: usize = FINGER_JOINT_COUNT * HAND_FINGER_COUNT;

const VEC_EPS: f32 = 1e-7;
const DENORMAL_FLOOR: f32 = 1e-30;
const MIN_LUFS_DB: f32 = -120.0;
const MAX_VERLET_ITERATIONS: u32 = 8;

#[inline]
fn validate_len(expected: usize, actual: usize) -> Result<(), DrawingCoreError> {
    if actual != expected { Err(DrawingCoreError::BufferLengthMismatch { expected, actual }) } else { Ok(()) }
}
#[inline]
fn flush_denormal(v: f32) -> f32 { if v.abs() < DENORMAL_FLOOR { 0.0 } else { v } }
#[inline]
fn sanitize_pos_f32(w: f32) -> f32 { if w.is_finite() && w > 0.0 { w } else { 0.0 } }
#[inline]
fn wrap_angle_pi(mut a: f32) -> f32 {
    while a > PI { a -= 2.0 * PI; }
    while a < -PI { a += 2.0 * PI; }
    a
}

// ============================================================================
// 1. 가상 스튜디오 2.5D/3D 스프링 머리카락·의상 베를레(Verlet) 물리 커널
// ============================================================================

/// SoA 배치 스프링 체인 버퍼 (`inv_mass == 0.0`: 고정 루트 핀, `rest_len[i] > 0.0`: 간선 `(i-1, i)`).
#[derive(Debug)]
pub struct VerletSpringChainsSoa<'a> {
    pub pos_x: &'a mut [f32], pub pos_y: &'a mut [f32], pub pos_z: &'a mut [f32],
    pub prev_x: &'a mut [f32], pub prev_y: &'a mut [f32], pub prev_z: &'a mut [f32],
    pub inv_mass: &'a [f32], pub rest_len: &'a [f32],
}

/// 아바타 머리·어깨 구체 충돌체.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SphereCollider { pub center_x: f32, pub center_y: f32, pub center_z: f32, pub radius: f32 }

impl SphereCollider {
    #[inline] #[must_use]
    pub const fn new(center_x: f32, center_y: f32, center_z: f32, radius: f32) -> Self {
        Self { center_x, center_y, center_z, radius }
    }
    #[inline] #[must_use]
    pub fn is_valid(&self) -> bool {
        self.center_x.is_finite() && self.center_y.is_finite() && self.center_z.is_finite()
            && self.radius.is_finite() && self.radius > 0.0
    }
}

/// 베를레(Verlet) 스프링 체인 시뮬레이션 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct VerletSpringConfig {
    pub dt: f32, pub stiffness: f32, pub damping: f32, pub wind_xyz: [f32; 3], pub gravity_y: f32,
    pub iterations: u32, pub floor_y: f32, pub floor_restitution: f32, pub particle_radius: f32,
}

impl Default for VerletSpringConfig {
    fn default() -> Self {
        Self {
            dt: 1.0 / 60.0, stiffness: 0.92, damping: 0.04, wind_xyz: [0.0; 3],
            gravity_y: -9.81, iterations: 4, floor_y: 0.0, floor_restitution: 0.2, particle_radius: 0.0,
        }
    }
}

/// 베를레 스프링 1스텝 실행 통계.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct VerletStepStats {
    pub particle_count: usize, pub active_constraints: usize, pub sphere_collisions: usize,
    pub floor_collisions: usize, pub sanitized_particles: usize,
    pub max_constraint_error: f32, pub total_kinetic_energy: f32,
}

#[inline]
fn validate_verlet_config(c: &VerletSpringConfig) -> Result<(), DrawingCoreError> {
    if !c.dt.is_finite() || c.dt <= 0.0 || c.dt > 0.25 { return Err(DrawingCoreError::InvalidParameter { name: "dt" }); }
    if !c.stiffness.is_finite() || !(0.0..=1.0).contains(&c.stiffness) { return Err(DrawingCoreError::InvalidParameter { name: "stiffness" }); }
    if !c.damping.is_finite() || !(0.0..=1.0).contains(&c.damping) { return Err(DrawingCoreError::InvalidParameter { name: "damping" }); }
    if !c.wind_xyz.iter().all(|v| v.is_finite()) { return Err(DrawingCoreError::InvalidParameter { name: "wind_xyz" }); }
    if !c.gravity_y.is_finite() { return Err(DrawingCoreError::InvalidParameter { name: "gravity_y" }); }
    if c.iterations == 0 || c.iterations > MAX_VERLET_ITERATIONS { return Err(DrawingCoreError::InvalidParameter { name: "iterations" }); }
    if !c.floor_y.is_finite() { return Err(DrawingCoreError::InvalidParameter { name: "floor_y" }); }
    if !c.floor_restitution.is_finite() || !(0.0..=1.0).contains(&c.floor_restitution) {
        return Err(DrawingCoreError::InvalidParameter { name: "floor_restitution" });
    }
    if !c.particle_radius.is_finite() || c.particle_radius < 0.0 {
        return Err(DrawingCoreError::InvalidParameter { name: "particle_radius" });
    }
    Ok(())
}

/// 4-와이드 고정 레인 베를레 적분기(WASM SIMD128 `f32x4` 자동 벡터화, 분기 없는 핀 마스크).
#[inline]
#[allow(clippy::too_many_arguments)]
fn integrate_verlet_4wide(
    px: &mut [f32; 4], py: &mut [f32; 4], pz: &mut [f32; 4],
    ox: &mut [f32; 4], oy: &mut [f32; 4], oz: &mut [f32; 4],
    free_mask: &[f32; 4], vel_scale: f32, accel_dt2: [f32; 3],
) {
    for l in 0..4 {
        let m = free_mask[l];
        let (cx, cy, cz) = (px[l], py[l], pz[l]);
        let (vx, vy, vz) = ((cx - ox[l]) * vel_scale, (cy - oy[l]) * vel_scale, (cz - oz[l]) * vel_scale);
        ox[l] = cx; oy[l] = cy; oz[l] = cz;
        px[l] = cx + (vx + accel_dt2[0]) * m;
        py[l] = cy + (vy + accel_dt2[1]) * m;
        pz[l] = cz + (vz + accel_dt2[2]) * m;
    }
}

#[inline]
fn project_distance_edge(c: &mut VerletSpringChainsSoa<'_>, i: usize, stiffness: f32) {
    let rest = sanitize_pos_f32(c.rest_len[i]);
    if rest <= 0.0 { return; }
    let (wa, wb) = (sanitize_pos_f32(c.inv_mass[i - 1]), sanitize_pos_f32(c.inv_mass[i]));
    let w_sum = wa + wb;
    if w_sum <= 0.0 { return; }
    let (dx, dy, dz) = (c.pos_x[i] - c.pos_x[i - 1], c.pos_y[i] - c.pos_y[i - 1], c.pos_z[i] - c.pos_z[i - 1]);
    let dist = (dx * dx + dy * dy + dz * dz).sqrt();
    let (nx, ny, nz, err) = if dist > VEC_EPS { (dx / dist, dy / dist, dz / dist, dist - rest) } else { (0.0, -1.0, 0.0, -rest) };
    let corr = stiffness * err / w_sum;
    if wa > 0.0 {
        let s = corr * wa;
        c.pos_x[i - 1] += nx * s; c.pos_y[i - 1] += ny * s; c.pos_z[i - 1] += nz * s;
    }
    if wb > 0.0 {
        let s = corr * wb;
        c.pos_x[i] -= nx * s; c.pos_y[i] -= ny * s; c.pos_z[i] -= nz * s;
    }
}

/// SoA 베를레(Verlet) 스프링 체인 1스텝을 수행한다(머리카락·의상 물리, 힙 할당 0건).
pub fn step_verlet_spring_chains_soa(
    chains: &mut VerletSpringChainsSoa<'_>,
    colliders: &[SphereCollider],
    config: &VerletSpringConfig,
) -> Result<VerletStepStats, DrawingCoreError> {
    validate_verlet_config(config)?;
    let n = chains.pos_x.len();
    for len in [
        chains.pos_y.len(), chains.pos_z.len(), chains.prev_x.len(), chains.prev_y.len(),
        chains.prev_z.len(), chains.inv_mass.len(), chains.rest_len.len(),
    ] { validate_len(n, len)?; }

    let mut stats = VerletStepStats { particle_count: n, ..VerletStepStats::default() };
    if n == 0 { return Ok(stats); }

    // 1) NaN/Inf 입력 방어 정제
    for i in 0..n {
        let mut bad = false;
        let mut cp = |v: f32, pv: f32| if v.is_finite() { v } else { bad = true; if pv.is_finite() { pv } else { 0.0 } };
        chains.pos_x[i] = cp(chains.pos_x[i], chains.prev_x[i]);
        chains.pos_y[i] = cp(chains.pos_y[i], chains.prev_y[i]);
        chains.pos_z[i] = cp(chains.pos_z[i], chains.prev_z[i]);
        let mut co = |v: f32, p: f32| if v.is_finite() { v } else { bad = true; p };
        chains.prev_x[i] = co(chains.prev_x[i], chains.pos_x[i]);
        chains.prev_y[i] = co(chains.prev_y[i], chains.pos_y[i]);
        chains.prev_z[i] = co(chains.prev_z[i], chains.pos_z[i]);
        if !chains.inv_mass[i].is_finite() || chains.inv_mass[i] < 0.0
            || !chains.rest_len[i].is_finite() || chains.rest_len[i] < 0.0 { bad = true; }
        if bad { stats.sanitized_particles += 1; }
    }

    // 2) 4-와이드 SIMD128 친화 베를레 위치 적분
    let (vel_scale, dt_sq) = (1.0 - config.damping, config.dt * config.dt);
    let accel_dt2 = [config.wind_xyz[0] * dt_sq, (config.wind_xyz[1] + config.gravity_y) * dt_sq, config.wind_xyz[2] * dt_sq];
    let mut base = 0usize;
    while base < n {
        let count = (n - base).min(4);
        let (mut px, mut py, mut pz, mut ox, mut oy, mut oz, mut mask) =
            ([0.0_f32; 4], [0.0; 4], [0.0; 4], [0.0; 4], [0.0; 4], [0.0; 4], [0.0; 4]);
        for l in 0..count {
            let idx = base + l;
            px[l] = chains.pos_x[idx]; py[l] = chains.pos_y[idx]; pz[l] = chains.pos_z[idx];
            ox[l] = chains.prev_x[idx]; oy[l] = chains.prev_y[idx]; oz[l] = chains.prev_z[idx];
            mask[l] = if sanitize_pos_f32(chains.inv_mass[idx]) > 0.0 { 1.0 } else { 0.0 };
        }
        integrate_verlet_4wide(&mut px, &mut py, &mut pz, &mut ox, &mut oy, &mut oz, &mask, vel_scale, accel_dt2);
        chains.pos_x[base..base + count].copy_from_slice(&px[..count]);
        chains.pos_y[base..base + count].copy_from_slice(&py[..count]);
        chains.pos_z[base..base + count].copy_from_slice(&pz[..count]);
        chains.prev_x[base..base + count].copy_from_slice(&ox[..count]);
        chains.prev_y[base..base + count].copy_from_slice(&oy[..count]);
        chains.prev_z[base..base + count].copy_from_slice(&oz[..count]);
        base += count;
    }

    // 3) 대칭 Gauss-Seidel PBD 거리 제약(역방향→정방향 쌍) + 구체 충돌체 + 바닥 평면 반발
    let min_y = config.floor_y + config.particle_radius;
    for iter in 0..config.iterations {
        for i in (1..n).rev() { project_distance_edge(chains, i, config.stiffness); }
        for i in 1..n { project_distance_edge(chains, i, config.stiffness); }
        for col in colliders.iter().filter(|c| c.is_valid()) {
            let eff_r = col.radius + config.particle_radius;
            let eff_r_sq = eff_r * eff_r;
            for i in 0..n {
                if sanitize_pos_f32(chains.inv_mass[i]) <= 0.0 { continue; }
                let (dx, dy, dz) = (chains.pos_x[i] - col.center_x, chains.pos_y[i] - col.center_y, chains.pos_z[i] - col.center_z);
                let d_sq = dx * dx + dy * dy + dz * dz;
                if d_sq < eff_r_sq {
                    if iter == 0 { stats.sphere_collisions += 1; }
                    let (nx, ny, nz) = if d_sq > VEC_EPS * VEC_EPS { let id = 1.0 / d_sq.sqrt(); (dx * id, dy * id, dz * id) } else { (0.0, 1.0, 0.0) };
                    let (nxp, nyp, nzp) = (col.center_x + nx * eff_r, col.center_y + ny * eff_r, col.center_z + nz * eff_r);
                    chains.prev_x[i] += nxp - chains.pos_x[i];
                    chains.prev_y[i] += nyp - chains.pos_y[i];
                    chains.prev_z[i] += nzp - chains.pos_z[i];
                    chains.pos_x[i] = nxp; chains.pos_y[i] = nyp; chains.pos_z[i] = nzp;
                }
            }
        }
        for i in 0..n {
            if sanitize_pos_f32(chains.inv_mass[i]) <= 0.0 || chains.pos_y[i] >= min_y { continue; }
            let vy_pre = chains.pos_y[i] - chains.prev_y[i];
            chains.pos_y[i] = min_y;
            if vy_pre < 0.0 {
                stats.floor_collisions += 1;
                chains.prev_y[i] = min_y + vy_pre * config.floor_restitution;
                chains.prev_x[i] = chains.pos_x[i] - (chains.pos_x[i] - chains.prev_x[i]) * vel_scale;
                chains.prev_z[i] = chains.pos_z[i] - (chains.pos_z[i] - chains.prev_z[i]) * vel_scale;
            }
        }
    }

    // 4) 구체 표면 접선 슬라이딩 보정 + 운동에너지·잔여 제약 오차 집계
    let inv_dt_sq = 1.0 / dt_sq;
    for i in 0..n {
        let w = sanitize_pos_f32(chains.inv_mass[i]);
        if w <= 0.0 { continue; }
        for col in colliders.iter().filter(|c| c.is_valid()) {
            let eff_r = col.radius + config.particle_radius;
            let (dx, dy, dz) = (chains.pos_x[i] - col.center_x, chains.pos_y[i] - col.center_y, chains.pos_z[i] - col.center_z);
            let d = (dx * dx + dy * dy + dz * dz).sqrt();
            if d <= eff_r + 1e-4 && d > VEC_EPS {
                let (nx, ny, nz) = (dx / d, dy / d, dz / d);
                let (vx, vy, vz) = (chains.pos_x[i] - chains.prev_x[i], chains.pos_y[i] - chains.prev_y[i], chains.pos_z[i] - chains.prev_z[i]);
                let vn = vx * nx + vy * ny + vz * nz;
                if vn < 0.0 {
                    chains.prev_x[i] = chains.pos_x[i] - (vx - vn * nx) * vel_scale;
                    chains.prev_y[i] = chains.pos_y[i] - (vy - vn * ny) * vel_scale;
                    chains.prev_z[i] = chains.pos_z[i] - (vz - vn * nz) * vel_scale;
                }
            }
        }
        let (vx, vy, vz) = (chains.pos_x[i] - chains.prev_x[i], chains.pos_y[i] - chains.prev_y[i], chains.pos_z[i] - chains.prev_z[i]);
        stats.total_kinetic_energy += 0.5 * (vx * vx + vy * vy + vz * vz) * inv_dt_sq / w;
    }
    for i in 1..n {
        let rest = sanitize_pos_f32(chains.rest_len[i]);
        if rest <= 0.0 || sanitize_pos_f32(chains.inv_mass[i - 1]) + sanitize_pos_f32(chains.inv_mass[i]) <= 0.0 { continue; }
        stats.active_constraints += 1;
        let (dx, dy, dz) = (chains.pos_x[i] - chains.pos_x[i - 1], chains.pos_y[i] - chains.pos_y[i - 1], chains.pos_z[i] - chains.pos_z[i - 1]);
        stats.max_constraint_error = stats.max_constraint_error.max(((dx * dx + dy * dy + dz * dz).sqrt() - rest).abs());
    }
    Ok(stats)
}

// ============================================================================
// 2. 15관절 3D 손가락 FABRIK(Forward And Backward Reaching IK) 솔버
// ============================================================================

#[inline] fn v3_add(a: [f32; 3], b: [f32; 3]) -> [f32; 3] { [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
#[inline] fn v3_sub(a: [f32; 3], b: [f32; 3]) -> [f32; 3] { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
#[inline] fn v3_scale(a: [f32; 3], s: f32) -> [f32; 3] { [a[0] * s, a[1] * s, a[2] * s] }
#[inline] fn v3_dot(a: [f32; 3], b: [f32; 3]) -> f32 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
#[inline] fn v3_cross(a: [f32; 3], b: [f32; 3]) -> [f32; 3] { [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
#[inline] fn v3_len(a: [f32; 3]) -> f32 { v3_dot(a, a).sqrt() }
#[inline] fn v3_finite(a: [f32; 3]) -> bool { a[0].is_finite() && a[1].is_finite() && a[2].is_finite() }
#[inline] fn v3_norm_or(a: [f32; 3], fb: [f32; 3]) -> [f32; 3] { let l = v3_len(a); if l.is_finite() && l > VEC_EPS { v3_scale(a, 1.0 / l) } else { fb } }

/// 해부학적 손가락 관절 각도 제한(라디안, PIP/DIP 과신전 0 rad 차단).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FingerAngleLimits {
    pub mcp_max_flexion_rad: f32, pub mcp_max_extension_rad: f32, pub mcp_max_splay_rad: f32,
    pub pip_max_flexion_rad: f32, pub dip_max_flexion_rad: f32,
}

impl Default for FingerAngleLimits {
    fn default() -> Self {
        Self {
            mcp_max_flexion_rad: 90.0_f32.to_radians(), mcp_max_extension_rad: 15.0_f32.to_radians(),
            mcp_max_splay_rad: 20.0_f32.to_radians(), pip_max_flexion_rad: 105.0_f32.to_radians(),
            dip_max_flexion_rad: 80.0_f32.to_radians(),
        }
    }
}

/// 3관절 손가락 FABRIK 솔버 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FingerFabrikConfig {
    pub palm_forward: [f32; 3], pub flexion_normal: [f32; 3],
    pub limits: FingerAngleLimits, pub tolerance: f32, pub max_iterations: u32,
}

impl Default for FingerFabrikConfig {
    fn default() -> Self {
        Self {
            palm_forward: [0.0, 0.0, 1.0], flexion_normal: [0.0, -1.0, 0.0],
            limits: FingerAngleLimits::default(), tolerance: 1e-4, max_iterations: 24,
        }
    }
}

/// 단일 3관절 손가락 FABRIK 수렴 결과.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct FingerIkResult {
    pub iterations: u32, pub target_distance: f32, pub reachable: bool, pub converged: bool,
    pub max_bone_length_error: f32, pub joint_flexion_rad: [f32; FINGER_JOINT_COUNT], pub mcp_splay_rad: f32,
}

/// 5손가락 × 3관절(총 15관절) 3D 손 FABRIK 통합 결과.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct HandIkResult {
    pub solved_joints: usize, pub fingers: [FingerIkResult; HAND_FINGER_COUNT],
    pub max_bone_length_error: f32, pub max_target_distance: f32,
}

type FingerBasis = ([f32; 3], [f32; 3], [f32; 3]);

#[inline]
fn validate_finger_config(cfg: &FingerFabrikConfig) -> Result<FingerBasis, DrawingCoreError> {
    if !v3_finite(cfg.palm_forward) || v3_len(cfg.palm_forward) <= VEC_EPS {
        return Err(DrawingCoreError::InvalidParameter { name: "palm_forward" });
    }
    if !v3_finite(cfg.flexion_normal) || v3_len(cfg.flexion_normal) <= VEC_EPS {
        return Err(DrawingCoreError::InvalidParameter { name: "flexion_normal" });
    }
    let fwd = v3_norm_or(cfg.palm_forward, [0.0, 0.0, 1.0]);
    let flex_proj = v3_sub(cfg.flexion_normal, v3_scale(fwd, v3_dot(cfg.flexion_normal, fwd)));
    if v3_len(flex_proj) <= VEC_EPS { return Err(DrawingCoreError::InvalidParameter { name: "flexion_normal" }); }
    let flex = v3_norm_or(flex_proj, [0.0, -1.0, 0.0]);
    let side = v3_norm_or(v3_cross(fwd, flex), [1.0, 0.0, 0.0]);
    let l = &cfg.limits;
    let ok = |v: f32, hi: f32| v.is_finite() && v >= 0.0 && v <= hi;
    if !ok(l.mcp_max_flexion_rad, PI) || !ok(l.mcp_max_extension_rad, FRAC_PI_2)
        || !ok(l.mcp_max_splay_rad, FRAC_PI_2 - 0.01) || !ok(l.pip_max_flexion_rad, PI) || !ok(l.dip_max_flexion_rad, PI)
    { return Err(DrawingCoreError::InvalidParameter { name: "limits" }); }
    if !cfg.tolerance.is_finite() || cfg.tolerance <= 0.0 { return Err(DrawingCoreError::InvalidParameter { name: "tolerance" }); }
    if cfg.max_iterations == 0 || cfg.max_iterations > 128 { return Err(DrawingCoreError::InvalidParameter { name: "max_iterations" }); }
    Ok((fwd, flex, side))
}

#[inline]
fn fk_2d(angles: [f32; 3], bones: [f32; 3]) -> [[f32; 2]; 4] {
    let (s0, c0) = angles[0].sin_cos();
    let p1 = [bones[0] * c0, bones[0] * s0];
    let a1 = angles[0] + angles[1];
    let (s1, c1) = a1.sin_cos();
    let p2 = [p1[0] + bones[1] * c1, p1[1] + bones[1] * s1];
    let (s2, c2) = (a1 + angles[2]).sin_cos();
    [ [0.0, 0.0], p1, p2, [p2[0] + bones[2] * c2, p2[1] + bones[2] * s2] ]
}

#[inline]
fn backward_2d_constrained(pts: &mut [[f32; 2]; 4], bones: [f32; 3], lim: &FingerAngleLimits) -> [f32; 3] {
    let t0 = if pts[1][0].abs() > VEC_EPS || pts[1][1].abs() > VEC_EPS { pts[1][1].atan2(pts[1][0]) } else { 0.0 }
        .clamp(-lim.mcp_max_extension_rad, lim.mcp_max_flexion_rad);
    let p1 = [bones[0] * t0.cos(), bones[0] * t0.sin()];
    let (d1u, d1v) = (pts[2][0] - p1[0], pts[2][1] - p1[1]);
    let t1 = if d1u.abs() > VEC_EPS || d1v.abs() > VEC_EPS { wrap_angle_pi(d1v.atan2(d1u) - t0).clamp(0.0, lim.pip_max_flexion_rad) } else { 0.0 };
    let phi1 = t0 + t1;
    let p2 = [p1[0] + bones[1] * phi1.cos(), p1[1] + bones[1] * phi1.sin()];
    let (d2u, d2v) = (pts[3][0] - p2[0], pts[3][1] - p2[1]);
    let t2 = if d2u.abs() > VEC_EPS || d2v.abs() > VEC_EPS { wrap_angle_pi(d2v.atan2(d2u) - phi1).clamp(0.0, lim.dip_max_flexion_rad) } else { 0.0 };
    let angles = [t0, t1, t2];
    *pts = fk_2d(angles, bones);
    angles
}

/// 관절 한계(DIP/PIP 포화) 교착을 해소하는 1-패스 해부학 제약 CCD 각도 보정.
#[inline]
fn polish_ccd_2d(angles: &mut [f32; 3], bones: [f32; 3], target: [f32; 2], lim: &FingerAngleLimits) -> [[f32; 2]; 4] {
    let mins = [-lim.mcp_max_extension_rad, 0.0, 0.0];
    let maxs = [lim.mcp_max_flexion_rad, lim.pip_max_flexion_rad, lim.dip_max_flexion_rad];
    let mut pts = fk_2d(*angles, bones);
    for j in (0..3).rev() {
        let (eu, ev) = (pts[3][0] - pts[j][0], pts[3][1] - pts[j][1]);
        let (tu, tv) = (target[0] - pts[j][0], target[1] - pts[j][1]);
        if eu.hypot(ev) > VEC_EPS && tu.hypot(tv) > VEC_EPS {
            angles[j] = (angles[j] + wrap_angle_pi(tv.atan2(tu) - ev.atan2(eu))).clamp(mins[j], maxs[j]);
            pts = fk_2d(*angles, bones);
        }
    }
    pts
}

#[inline]
fn rebuild_3d_finger(joints: &mut [[f32; 3]; 4], root: [f32; 3], fwd_s: [f32; 3], flex: [f32; 3], pts: &[[f32; 2]; 4], bones: [f32; 3]) -> f32 {
    for i in 0..4 { joints[i] = v3_add(root, v3_add(v3_scale(fwd_s, pts[i][0]), v3_scale(flex, pts[i][1]))); }
    (0..3).map(|i| (v3_len(v3_sub(joints[i + 1], joints[i])) - bones[i]).abs()).fold(0.0_f32, f32::max)
}

/// 3관절(MCP→PIP→DIP→Tip) 단일 손가락 3D FABRIK IK 솔버.
pub fn solve_finger_fabrik_chain(
    joints: &mut [[f32; 3]; FINGER_POINT_COUNT],
    bone_lengths: [f32; FINGER_JOINT_COUNT],
    target: [f32; 3],
    config: &FingerFabrikConfig,
) -> Result<FingerIkResult, DrawingCoreError> {
    let (fwd, flex, side) = validate_finger_config(config)?;
    if !v3_finite(joints[0]) { return Err(DrawingCoreError::InvalidParameter { name: "joints" }); }
    if !v3_finite(target) { return Err(DrawingCoreError::InvalidParameter { name: "target" }); }
    if !bone_lengths.iter().all(|&l| l.is_finite() && l > 0.0) {
        return Err(DrawingCoreError::InvalidParameter { name: "bone_lengths" });
    }

    let root = joints[0];
    let total_len = bone_lengths[0] + bone_lengths[1] + bone_lengths[2];
    let to_target = v3_sub(target, root);
    let dist_3d = v3_len(to_target);

    // MCP 외전 평면 `span(fwd_splayed, flex)` 정렬
    let (tf, ts) = (v3_dot(to_target, fwd), v3_dot(to_target, side));
    let raw_splay = if tf.abs() > VEC_EPS || ts.abs() > VEC_EPS {
        if tf >= 0.0 { ts.atan2(tf) } else { (-ts).atan2(-tf) }
    } else { 0.0 };
    let splay = raw_splay.clamp(-config.limits.mcp_max_splay_rad, config.limits.mcp_max_splay_rad);
    let (sin_s, cos_s) = splay.sin_cos();
    let fwd_s = v3_norm_or(v3_add(v3_scale(fwd, cos_s), v3_scale(side, sin_s)), fwd);
    let (tu, tv) = (v3_dot(to_target, fwd_s), v3_dot(to_target, flex));
    let dist_2d = tu.hypot(tv);

    // 도달 불가능 원거리 목표: 해부학적 제한 내 완전 신전 방향 매끄러운 수렴
    if dist_3d >= total_len || dist_2d >= total_len {
        let t0 = if dist_2d > VEC_EPS { tv.atan2(tu) } else { 0.0 }
            .clamp(-config.limits.mcp_max_extension_rad, config.limits.mcp_max_flexion_rad);
        let p1 = [bone_lengths[0] * t0.cos(), bone_lengths[0] * t0.sin()];
        let t1 = wrap_angle_pi((tv - p1[1]).atan2(tu - p1[0]) - t0).clamp(0.0, config.limits.pip_max_flexion_rad);
        let p2 = [p1[0] + bone_lengths[1] * (t0 + t1).cos(), p1[1] + bone_lengths[1] * (t0 + t1).sin()];
        let t2 = wrap_angle_pi((tv - p2[1]).atan2(tu - p2[0]) - (t0 + t1)).clamp(0.0, config.limits.dip_max_flexion_rad);
        let angles = [t0, t1, t2];
        let pts = fk_2d(angles, bone_lengths);
        let max_err = rebuild_3d_finger(joints, root, fwd_s, flex, &pts, bone_lengths);
        let tip_dist = v3_len(v3_sub(target, joints[3]));
        return Ok(FingerIkResult {
            iterations: 1, target_distance: tip_dist, reachable: false,
            converged: tip_dist <= config.tolerance, max_bone_length_error: max_err,
            joint_flexion_rad: angles, mcp_splay_rad: splay,
        });
    }

    // 도달 가능 영역: 등쪽 아치(Dorsal Arch) 시드 + FABRIK Forward/Backward + 제약 CCD 보정
    let (cu, cv) = if dist_2d > VEC_EPS { (tu / dist_2d, tv / dist_2d) } else { (1.0, 0.0) };
    let dorsal = [cv, -cu];
    let base_angle = if dist_2d > VEC_EPS { tv.atan2(tu) } else { 0.3 };
    let mut angles = [
        (base_angle - 0.35).clamp(-config.limits.mcp_max_extension_rad, config.limits.mcp_max_flexion_rad),
        (0.55_f32).min(config.limits.pip_max_flexion_rad),
        (0.35_f32).min(config.limits.dip_max_flexion_rad),
    ];
    let mut pts = fk_2d(angles, bone_lengths);

    let mut iterations = 0u32;
    for iter in 0..config.max_iterations {
        if (pts[3][0] - tu).hypot(pts[3][1] - tv) <= config.tolerance { break; }
        iterations = iter + 1;

        // Forward Reaching (Tip → Root) + 등쪽 반평면 보존 반사
        pts[3] = [tu, tv];
        for idx in (0..FINGER_JOINT_COUNT).rev() {
            let (du, dv) = (pts[idx][0] - pts[idx + 1][0], pts[idx][1] - pts[idx + 1][1]);
            let d = du.hypot(dv);
            let (ru, rv) = if d > VEC_EPS { (du / d, dv / d) } else { (-cu + 0.25 * dorsal[0], -cv + 0.25 * dorsal[1]) };
            let rlen = ru.hypot(rv).max(VEC_EPS);
            let mut p = [pts[idx + 1][0] + (ru / rlen) * bone_lengths[idx], pts[idx + 1][1] + (rv / rlen) * bone_lengths[idx]];
            if (idx == 1 || idx == 2) && dist_2d > VEC_EPS {
                let side_d = p[0] * dorsal[0] + p[1] * dorsal[1];
                if side_d < 0.0 { p[0] -= 2.0 * side_d * dorsal[0]; p[1] -= 2.0 * side_d * dorsal[1]; }
            }
            pts[idx] = p;
        }
        // Backward Reaching (Root → Tip) + 제약 CCD 1-패스로 관절 한계 교착 해소
        angles = backward_2d_constrained(&mut pts, bone_lengths, &config.limits);
        pts = polish_ccd_2d(&mut angles, bone_lengths, [tu, tv], &config.limits);
    }

    let max_err = rebuild_3d_finger(joints, root, fwd_s, flex, &pts, bone_lengths);
    let tip_dist = v3_len(v3_sub(target, joints[3]));
    Ok(FingerIkResult {
        iterations, target_distance: tip_dist, reachable: true,
        converged: tip_dist <= config.tolerance, max_bone_length_error: max_err,
        joint_flexion_rad: angles, mcp_splay_rad: splay,
    })
}

/// 5손가락 × 3관절(총 15관절) 3D 손 FABRIK 일괄 소품 그립 솔버.
pub fn solve_hand_fabrik_15joints(
    hand_joints: &mut [[[f32; 3]; FINGER_POINT_COUNT]; HAND_FINGER_COUNT],
    bone_lengths: &[[f32; FINGER_JOINT_COUNT]; HAND_FINGER_COUNT],
    targets: &[[f32; 3]; HAND_FINGER_COUNT],
    configs: &[FingerFabrikConfig; HAND_FINGER_COUNT],
) -> Result<HandIkResult, DrawingCoreError> {
    let mut out = HandIkResult { solved_joints: HAND_TOTAL_JOINTS, ..HandIkResult::default() };
    for f in 0..HAND_FINGER_COUNT {
        let res = solve_finger_fabrik_chain(&mut hand_joints[f], bone_lengths[f], targets[f], &configs[f])?;
        out.max_bone_length_error = out.max_bone_length_error.max(res.max_bone_length_error);
        out.max_target_distance = out.max_target_distance.max(res.target_distance);
        out.fingers[f] = res;
    }
    Ok(out)
}

// ============================================================================
// 3. 가상 스튜디오 공간 음향 Foley 2차 Biquad IIR + -24 LUFS 피크 리미터 DSP
// ============================================================================

/// 2차 Biquad IIR 필터 모드.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum FoleyFilterMode { Lowpass = 0, Bandpass = 1 }

impl FoleyFilterMode {
    #[inline] #[must_use]
    pub const fn from_u32(v: u32) -> Option<Self> {
        match v { 0 => Some(Self::Lowpass), 1 => Some(Self::Bandpass), _ => None }
    }
}

/// 공간 음향 Foley Biquad + 스테레오 패닝 + -24 LUFS 피크 리미터 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FoleyDspConfig {
    pub sample_rate: f32, pub mode: FoleyFilterMode, pub cutoff_hz: f32, pub q_factor: f32,
    pub pan: f32, pub gain_db: f32, pub limiter_ceiling: f32, pub limiter_release_ms: f32,
    pub target_lufs: f32, pub enable_lufs_leveling: bool,
}

impl Default for FoleyDspConfig {
    fn default() -> Self {
        Self {
            sample_rate: 48_000.0, mode: FoleyFilterMode::Lowpass, cutoff_hz: 2_400.0,
            q_factor: core::f32::consts::FRAC_1_SQRT_2, pan: 0.0, gain_db: 0.0,
            limiter_ceiling: FOLEY_PEAK_CEILING, limiter_release_ms: 50.0,
            target_lufs: FOLEY_TARGET_LUFS, enable_lufs_leveling: false,
        }
    }
}

/// AudioWorklet 블록 경계를 가로질러 결정론적 연속성을 유지하는 Foley DSP 상태.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FoleyBiquadState {
    pub z1: f32, pub z2: f32, pub limiter_env: f32, pub lufs_energy_ewma: f32, pub lufs_gain: f32,
}

impl FoleyBiquadState {
    #[inline] #[must_use]
    pub const fn new() -> Self {
        Self { z1: 0.0, z2: 0.0, limiter_env: 0.0, lufs_energy_ewma: 0.0, lufs_gain: 1.0 }
    }
}

impl Default for FoleyBiquadState { fn default() -> Self { Self::new() } }

/// Foley DSP 블록 렌더 실행 통계.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct FoleyBlockStats {
    pub rendered_frames: usize, pub peak_abs: f32, pub limited_frames: usize,
    pub sanitized_samples: usize, pub momentary_lufs: f32, pub gain_reduction_db: f32,
}

#[derive(Debug, Clone, Copy)]
struct BiquadCoeffs { b0: f32, b1: f32, b2: f32, a1: f32, a2: f32 }

#[inline]
fn validate_and_design_biquad(c: &FoleyDspConfig) -> Result<BiquadCoeffs, DrawingCoreError> {
    if !c.sample_rate.is_finite() || !(8_000.0..=192_000.0).contains(&c.sample_rate) {
        return Err(DrawingCoreError::InvalidParameter { name: "sample_rate" });
    }
    if !c.cutoff_hz.is_finite() || c.cutoff_hz <= 0.0 || c.cutoff_hz >= 0.49 * c.sample_rate {
        return Err(DrawingCoreError::InvalidParameter { name: "cutoff_hz" });
    }
    if !c.q_factor.is_finite() || !(0.1..=20.0).contains(&c.q_factor) {
        return Err(DrawingCoreError::InvalidParameter { name: "q_factor" });
    }
    if !c.pan.is_finite() || !(-1.0..=1.0).contains(&c.pan) {
        return Err(DrawingCoreError::InvalidParameter { name: "pan" });
    }
    if !c.gain_db.is_finite() || !(-60.0..=36.0).contains(&c.gain_db) {
        return Err(DrawingCoreError::InvalidParameter { name: "gain_db" });
    }
    if !c.limiter_ceiling.is_finite() || !(0.05..=FOLEY_PEAK_CEILING).contains(&c.limiter_ceiling) {
        return Err(DrawingCoreError::InvalidParameter { name: "limiter_ceiling" });
    }
    if !c.limiter_release_ms.is_finite() || !(1.0..=1_000.0).contains(&c.limiter_release_ms) {
        return Err(DrawingCoreError::InvalidParameter { name: "limiter_release_ms" });
    }
    if !c.target_lufs.is_finite() || !(-60.0..=-6.0).contains(&c.target_lufs) {
        return Err(DrawingCoreError::InvalidParameter { name: "target_lufs" });
    }
    let (sin_w0, cos_w0) = (2.0 * PI * c.cutoff_hz / c.sample_rate).sin_cos();
    let alpha = sin_w0 / (2.0 * c.q_factor);
    let inv_a0 = 1.0 / (1.0 + alpha);
    let (b0, b1, b2) = match c.mode {
        FoleyFilterMode::Lowpass => (0.5 * (1.0 - cos_w0), 1.0 - cos_w0, 0.5 * (1.0 - cos_w0)),
        FoleyFilterMode::Bandpass => (alpha, 0.0, -alpha),
    };
    Ok(BiquadCoeffs {
        b0: b0 * inv_a0, b1: b1 * inv_a0, b2: b2 * inv_a0,
        a1: (-2.0 * cos_w0) * inv_a0, a2: (1.0 - alpha) * inv_a0,
    })
}

/// 128-샘플 AudioWorklet 블록 단위 공간 음향 Foley 2차 Biquad + -24 LUFS Soft-Knee 리미터 DSP 커널.
pub fn render_foley_biquad_block(
    mono_in: &[f32],
    out_left: &mut [f32],
    out_right: &mut [f32],
    config: &FoleyDspConfig,
    state: &mut FoleyBiquadState,
) -> Result<FoleyBlockStats, DrawingCoreError> {
    let frames = mono_in.len();
    validate_len(frames, out_left.len())?;
    validate_len(frames, out_right.len())?;
    let coeffs = validate_and_design_biquad(config)?;

    if !state.z1.is_finite() { state.z1 = 0.0; }
    if !state.z2.is_finite() { state.z2 = 0.0; }
    if !state.limiter_env.is_finite() || state.limiter_env < 0.0 { state.limiter_env = 0.0; }
    if !state.lufs_energy_ewma.is_finite() || state.lufs_energy_ewma < 0.0 { state.lufs_energy_ewma = 0.0; }
    if !state.lufs_gain.is_finite() || state.lufs_gain <= 0.0 { state.lufs_gain = 1.0; }

    let mut stats = FoleyBlockStats { rendered_frames: frames, momentary_lufs: MIN_LUFS_DB, ..FoleyBlockStats::default() };
    if frames == 0 { return Ok(stats); }

    let (pan_r, pan_l) = (0.5 * (config.pan + 1.0) * FRAC_PI_2).sin_cos();
    let pre_gain = 10.0_f32.powf(config.gain_db / 20.0);
    let release_coeff = (-1.0 / (0.001 * config.limiter_release_ms * config.sample_rate)).exp();
    let alpha_lufs = 1.0 - (-1.0 / (0.4 * config.sample_rate)).exp();
    let alpha_lufs_gain = 1.0 - (-1.0 / (0.05 * config.sample_rate)).exp();
    let target_energy = 10.0_f32.powf((config.target_lufs + 0.691) / 10.0);
    let (ceiling, knee_start) = (config.limiter_ceiling, config.limiter_ceiling * 0.75);
    let knee_headroom = ceiling - knee_start;

    let (mut out_energy_sum, mut min_lim_gain) = (0.0_f32, 1.0_f32);
    for i in 0..frames {
        let raw = mono_in[i];
        let x = if raw.is_finite() { raw * pre_gain } else { stats.sanitized_samples += 1; 0.0 };

        // Direct Form II Transposed 2차 Biquad IIR
        let y = coeffs.b0 * x + state.z1;
        state.z1 = flush_denormal(coeffs.b1 * x - coeffs.a1 * y + state.z2);
        state.z2 = flush_denormal(coeffs.b2 * x - coeffs.a2 * y);

        let (mut l, mut r) = (y * pan_l, y * pan_r);
        let pre_energy = l * l + r * r;
        state.lufs_energy_ewma = flush_denormal(state.lufs_energy_ewma + alpha_lufs * (pre_energy - state.lufs_energy_ewma));
        if config.enable_lufs_leveling {
            if state.lufs_energy_ewma > 1e-8 {
                let desired = (target_energy / state.lufs_energy_ewma).sqrt().clamp(0.0625, 4.0);
                state.lufs_gain += alpha_lufs_gain * (desired - state.lufs_gain);
            }
            l *= state.lufs_gain; r *= state.lufs_gain;
        }

        // 스테레오 연동 Soft-Knee 피크 리미터 (C1 tanh 곡선, 절대 상한 <= 0.95)
        let peak = l.abs().max(r.abs());
        state.limiter_env = if peak > state.limiter_env { peak } else { flush_denormal(peak + release_coeff * (state.limiter_env - peak)) };
        let lim_gain = if state.limiter_env > knee_start {
            stats.limited_frames += 1;
            let shaped = knee_start + knee_headroom * ((state.limiter_env - knee_start) / knee_headroom).min(20.0).tanh();
            (shaped / state.limiter_env).clamp(0.0, 1.0)
        } else { 1.0 };
        min_lim_gain = min_lim_gain.min(lim_gain);

        let (ol, or) = ((l * lim_gain).clamp(-ceiling, ceiling), (r * lim_gain).clamp(-ceiling, ceiling));
        out_left[i] = ol; out_right[i] = or;
        stats.peak_abs = stats.peak_abs.max(ol.abs().max(or.abs()));
        out_energy_sum += ol * ol + or * or;
    }

    let mean_energy = out_energy_sum / frames as f32;
    stats.momentary_lufs = if mean_energy > 1e-12 { (-0.691 + 10.0 * mean_energy.log10()).max(MIN_LUFS_DB) } else { MIN_LUFS_DB };
    stats.gain_reduction_db = if min_lim_gain < 1.0 { 20.0 * min_lim_gain.max(1e-6).log10() } else { 0.0 };
    Ok(stats)
}
