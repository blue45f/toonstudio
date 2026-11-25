use super::*;

/// SoA 배치 스프링 체인 버퍼 (`inv_mass == 0.0`: 고정 루트 핀, `rest_len[i] > 0.0`: 간선 `(i-1, i)`).
#[derive(Debug)]
pub struct VerletSpringChainsSoa<'a> {
    pub pos_x: &'a mut [f32],
    pub pos_y: &'a mut [f32],
    pub pos_z: &'a mut [f32],
    pub prev_x: &'a mut [f32],
    pub prev_y: &'a mut [f32],
    pub prev_z: &'a mut [f32],
    pub inv_mass: &'a [f32],
    pub rest_len: &'a [f32],
}

/// 아바타 머리·어깨 구체 충돌체.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SphereCollider {
    pub center_x: f32,
    pub center_y: f32,
    pub center_z: f32,
    pub radius: f32,
}

impl SphereCollider {
    #[inline]
    #[must_use]
    pub const fn new(center_x: f32, center_y: f32, center_z: f32, radius: f32) -> Self {
        Self {
            center_x,
            center_y,
            center_z,
            radius,
        }
    }
    #[inline]
    #[must_use]
    pub fn is_valid(&self) -> bool {
        self.center_x.is_finite()
            && self.center_y.is_finite()
            && self.center_z.is_finite()
            && self.radius.is_finite()
            && self.radius > 0.0
    }
}

/// 베를레(Verlet) 스프링 체인 시뮬레이션 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct VerletSpringConfig {
    pub dt: f32,
    pub stiffness: f32,
    pub damping: f32,
    pub wind_xyz: [f32; 3],
    pub gravity_y: f32,
    pub iterations: u32,
    pub floor_y: f32,
    pub floor_restitution: f32,
    pub particle_radius: f32,
}

impl Default for VerletSpringConfig {
    fn default() -> Self {
        Self {
            dt: 1.0 / 60.0,
            stiffness: 0.92,
            damping: 0.04,
            wind_xyz: [0.0; 3],
            gravity_y: -9.81,
            iterations: 4,
            floor_y: 0.0,
            floor_restitution: 0.2,
            particle_radius: 0.0,
        }
    }
}

/// 베를레 스프링 1스텝 실행 통계.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct VerletStepStats {
    pub particle_count: usize,
    pub active_constraints: usize,
    pub sphere_collisions: usize,
    pub floor_collisions: usize,
    pub sanitized_particles: usize,
    pub max_constraint_error: f32,
    pub total_kinetic_energy: f32,
}

#[inline]
fn validate_verlet_config(c: &VerletSpringConfig) -> Result<(), DrawingCoreError> {
    if !c.dt.is_finite() || c.dt < 1.0e-6 || c.dt > 0.25 {
        return Err(DrawingCoreError::InvalidParameter { name: "dt" });
    }
    if !c.stiffness.is_finite() || !(0.0..=1.0).contains(&c.stiffness) {
        return Err(DrawingCoreError::InvalidParameter { name: "stiffness" });
    }
    if !c.damping.is_finite() || !(0.0..=1.0).contains(&c.damping) {
        return Err(DrawingCoreError::InvalidParameter { name: "damping" });
    }
    if !c.wind_xyz.iter().copied().all(bounded_scene) {
        return Err(DrawingCoreError::InvalidParameter { name: "wind_xyz" });
    }
    if !bounded_scene(c.gravity_y) {
        return Err(DrawingCoreError::InvalidParameter { name: "gravity_y" });
    }
    if c.iterations == 0 || c.iterations > MAX_VERLET_ITERATIONS {
        return Err(DrawingCoreError::InvalidParameter { name: "iterations" });
    }
    if !bounded_scene(c.floor_y) {
        return Err(DrawingCoreError::InvalidParameter { name: "floor_y" });
    }
    if !c.floor_restitution.is_finite() || !(0.0..=1.0).contains(&c.floor_restitution) {
        return Err(DrawingCoreError::InvalidParameter {
            name: "floor_restitution",
        });
    }
    if !bounded_scene(c.particle_radius) || c.particle_radius < 0.0 {
        return Err(DrawingCoreError::InvalidParameter {
            name: "particle_radius",
        });
    }
    Ok(())
}

/// 4개 묶음 스칼라 베를레 적분기. SIMD 명령 생성을 보증하지 않는다.
#[inline]
#[allow(clippy::too_many_arguments)]
fn integrate_verlet_4wide(
    px: &mut [f32; 4],
    py: &mut [f32; 4],
    pz: &mut [f32; 4],
    ox: &mut [f32; 4],
    oy: &mut [f32; 4],
    oz: &mut [f32; 4],
    free_mask: &[f32; 4],
    vel_scale: f32,
    accel_dt2: [f32; 3],
) {
    for l in 0..4 {
        let m = free_mask[l];
        let (cx, cy, cz) = (px[l], py[l], pz[l]);
        let (vx, vy, vz) = (
            (cx - ox[l]) * vel_scale,
            (cy - oy[l]) * vel_scale,
            (cz - oz[l]) * vel_scale,
        );
        ox[l] = cx;
        oy[l] = cy;
        oz[l] = cz;
        px[l] = cx + (vx + accel_dt2[0]) * m;
        py[l] = cy + (vy + accel_dt2[1]) * m;
        pz[l] = cz + (vz + accel_dt2[2]) * m;
    }
}

#[inline]
fn project_distance_edge(c: &mut VerletSpringChainsSoa<'_>, i: usize, stiffness: f32) {
    let rest = sanitize_pos_f32(c.rest_len[i]);
    if rest <= 0.0 {
        return;
    }
    let (wa, wb) = (
        sanitize_pos_f32(c.inv_mass[i - 1]),
        sanitize_pos_f32(c.inv_mass[i]),
    );
    let w_sum = wa + wb;
    if w_sum <= 0.0 {
        return;
    }
    let (dx, dy, dz) = (
        c.pos_x[i] - c.pos_x[i - 1],
        c.pos_y[i] - c.pos_y[i - 1],
        c.pos_z[i] - c.pos_z[i - 1],
    );
    let dist = (dx * dx + dy * dy + dz * dz).sqrt();
    let (nx, ny, nz, err) = if dist > VEC_EPS {
        (dx / dist, dy / dist, dz / dist, dist - rest)
    } else {
        (0.0, -1.0, 0.0, -rest)
    };
    let corr = stiffness * err / w_sum;
    if wa > 0.0 {
        let s = corr * wa;
        c.pos_x[i - 1] += nx * s;
        c.pos_y[i - 1] += ny * s;
        c.pos_z[i - 1] += nz * s;
    }
    if wb > 0.0 {
        let s = corr * wb;
        c.pos_x[i] -= nx * s;
        c.pos_y[i] -= ny * s;
        c.pos_z[i] -= nz * s;
    }
}

/// SoA 베를레 스프링 CPU 연산. dt는 1e-6..=0.25초, 좌표·힘·반지름 절대값은 1e6 이하,
/// 양수 역질량은 1e-6..=1e6, 입자는 65,536개·충돌체는 4,096개까지 지원한다.
/// 입자×충돌체×반복은 4,194,304 이하로 제한하고 범위 오류는 버퍼 변경 전에 반환한다.
/// 비유한 좌표 복구는 유지하며 운동에너지 통계는 f32::MAX에서 포화한다. 힙 할당은 없다.
pub fn step_verlet_spring_chains_soa(
    chains: &mut VerletSpringChainsSoa<'_>,
    colliders: &[SphereCollider],
    config: &VerletSpringConfig,
) -> Result<VerletStepStats, DrawingCoreError> {
    validate_verlet_config(config)?;
    let n = chains.pos_x.len();
    for len in [
        chains.pos_y.len(),
        chains.pos_z.len(),
        chains.prev_x.len(),
        chains.prev_y.len(),
        chains.prev_z.len(),
        chains.inv_mass.len(),
        chains.rest_len.len(),
    ] {
        validate_len(n, len)?;
    }

    if n > MAX_PHYSICS_PARTICLES
        || colliders.len() > MAX_PHYSICS_COLLIDERS
        || n.saturating_mul(colliders.len())
            .saturating_mul(config.iterations as usize)
            > MAX_PHYSICS_INTERACTIONS
    {
        return Err(DrawingCoreError::InvalidParameter {
            name: "physics_work_budget",
        });
    }
    // 비유한 좌표는 기존 복구 계약을 유지하며, 유한하지만 표현 범위를 벗어나는 입력은 쓰기 전에 거절한다.
    if [
        &*chains.pos_x,
        &*chains.pos_y,
        &*chains.pos_z,
        &*chains.prev_x,
        &*chains.prev_y,
        &*chains.prev_z,
        chains.rest_len,
        chains.inv_mass,
    ]
    .iter()
    .any(|values| {
        values
            .iter()
            .any(|&v| v.is_finite() && v.abs() > MAX_SCENE_MAGNITUDE)
    }) || chains.inv_mass.iter().any(|&v| v > 0.0 && v < 1.0e-6)
        || colliders.iter().any(|c| {
            [c.center_x, c.center_y, c.center_z, c.radius]
                .iter()
                .any(|&v| v.is_finite() && !bounded_scene(v))
        })
    {
        return Err(DrawingCoreError::InvalidParameter {
            name: "physics_numeric_range",
        });
    }
    let mut stats = VerletStepStats {
        particle_count: n,
        ..VerletStepStats::default()
    };
    if n == 0 {
        return Ok(stats);
    }

    // 1) NaN/Inf 입력 방어 정제
    for i in 0..n {
        let mut bad = false;
        let mut cp = |v: f32, pv: f32| {
            if v.is_finite() {
                v
            } else {
                bad = true;
                if pv.is_finite() {
                    pv
                } else {
                    0.0
                }
            }
        };
        chains.pos_x[i] = cp(chains.pos_x[i], chains.prev_x[i]);
        chains.pos_y[i] = cp(chains.pos_y[i], chains.prev_y[i]);
        chains.pos_z[i] = cp(chains.pos_z[i], chains.prev_z[i]);
        let mut co = |v: f32, p: f32| {
            if v.is_finite() {
                v
            } else {
                bad = true;
                p
            }
        };
        chains.prev_x[i] = co(chains.prev_x[i], chains.pos_x[i]);
        chains.prev_y[i] = co(chains.prev_y[i], chains.pos_y[i]);
        chains.prev_z[i] = co(chains.prev_z[i], chains.pos_z[i]);
        if !chains.inv_mass[i].is_finite()
            || chains.inv_mass[i] < 0.0
            || !chains.rest_len[i].is_finite()
            || chains.rest_len[i] < 0.0
        {
            bad = true;
        }
        if bad {
            stats.sanitized_particles += 1;
        }
    }

    // 2) 4개 묶음 스칼라 베를레 위치 적분
    let (vel_scale, dt_sq) = (1.0 - config.damping, config.dt * config.dt);
    let accel_dt2 = [
        config.wind_xyz[0] * dt_sq,
        (config.wind_xyz[1] + config.gravity_y) * dt_sq,
        config.wind_xyz[2] * dt_sq,
    ];
    let mut base = 0usize;
    while base < n {
        let count = (n - base).min(4);
        let (mut px, mut py, mut pz, mut ox, mut oy, mut oz, mut mask) = (
            [0.0_f32; 4],
            [0.0; 4],
            [0.0; 4],
            [0.0; 4],
            [0.0; 4],
            [0.0; 4],
            [0.0; 4],
        );
        for l in 0..count {
            let idx = base + l;
            px[l] = chains.pos_x[idx];
            py[l] = chains.pos_y[idx];
            pz[l] = chains.pos_z[idx];
            ox[l] = chains.prev_x[idx];
            oy[l] = chains.prev_y[idx];
            oz[l] = chains.prev_z[idx];
            mask[l] = if sanitize_pos_f32(chains.inv_mass[idx]) > 0.0 {
                1.0
            } else {
                0.0
            };
        }
        integrate_verlet_4wide(
            &mut px, &mut py, &mut pz, &mut ox, &mut oy, &mut oz, &mask, vel_scale, accel_dt2,
        );
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
        for i in (1..n).rev() {
            project_distance_edge(chains, i, config.stiffness);
        }
        for i in 1..n {
            project_distance_edge(chains, i, config.stiffness);
        }
        for col in colliders.iter().filter(|c| c.is_valid()) {
            let eff_r = col.radius + config.particle_radius;
            let eff_r_sq = eff_r * eff_r;
            for i in 0..n {
                if sanitize_pos_f32(chains.inv_mass[i]) <= 0.0 {
                    continue;
                }
                let (dx, dy, dz) = (
                    chains.pos_x[i] - col.center_x,
                    chains.pos_y[i] - col.center_y,
                    chains.pos_z[i] - col.center_z,
                );
                let d_sq = dx * dx + dy * dy + dz * dz;
                if d_sq < eff_r_sq {
                    if iter == 0 {
                        stats.sphere_collisions += 1;
                    }
                    let (nx, ny, nz) = if d_sq > VEC_EPS * VEC_EPS {
                        let id = 1.0 / d_sq.sqrt();
                        (dx * id, dy * id, dz * id)
                    } else {
                        (0.0, 1.0, 0.0)
                    };
                    let (nxp, nyp, nzp) = (
                        col.center_x + nx * eff_r,
                        col.center_y + ny * eff_r,
                        col.center_z + nz * eff_r,
                    );
                    chains.prev_x[i] += nxp - chains.pos_x[i];
                    chains.prev_y[i] += nyp - chains.pos_y[i];
                    chains.prev_z[i] += nzp - chains.pos_z[i];
                    chains.pos_x[i] = nxp;
                    chains.pos_y[i] = nyp;
                    chains.pos_z[i] = nzp;
                }
            }
        }
        for i in 0..n {
            if sanitize_pos_f32(chains.inv_mass[i]) <= 0.0 || chains.pos_y[i] >= min_y {
                continue;
            }
            let vy_pre = chains.pos_y[i] - chains.prev_y[i];
            chains.pos_y[i] = min_y;
            if vy_pre < 0.0 {
                stats.floor_collisions += 1;
                chains.prev_y[i] = min_y + vy_pre * config.floor_restitution;
                chains.prev_x[i] =
                    chains.pos_x[i] - (chains.pos_x[i] - chains.prev_x[i]) * vel_scale;
                chains.prev_z[i] =
                    chains.pos_z[i] - (chains.pos_z[i] - chains.prev_z[i]) * vel_scale;
            }
        }
    }

    // 4) 구체 표면 접선 슬라이딩 보정 + 운동에너지·잔여 제약 오차 집계
    let inv_dt_sq = 1.0 / dt_sq;
    for i in 0..n {
        let w = sanitize_pos_f32(chains.inv_mass[i]);
        if w <= 0.0 {
            continue;
        }
        for col in colliders.iter().filter(|c| c.is_valid()) {
            let eff_r = col.radius + config.particle_radius;
            let (dx, dy, dz) = (
                chains.pos_x[i] - col.center_x,
                chains.pos_y[i] - col.center_y,
                chains.pos_z[i] - col.center_z,
            );
            let d = (dx * dx + dy * dy + dz * dz).sqrt();
            if d <= eff_r + 1e-4 && d > VEC_EPS {
                let (nx, ny, nz) = (dx / d, dy / d, dz / d);
                let (vx, vy, vz) = (
                    chains.pos_x[i] - chains.prev_x[i],
                    chains.pos_y[i] - chains.prev_y[i],
                    chains.pos_z[i] - chains.prev_z[i],
                );
                let vn = vx * nx + vy * ny + vz * nz;
                if vn < 0.0 {
                    chains.prev_x[i] = chains.pos_x[i] - (vx - vn * nx) * vel_scale;
                    chains.prev_y[i] = chains.pos_y[i] - (vy - vn * ny) * vel_scale;
                    chains.prev_z[i] = chains.pos_z[i] - (vz - vn * nz) * vel_scale;
                }
            }
        }
        let (vx, vy, vz) = (
            chains.pos_x[i] - chains.prev_x[i],
            chains.pos_y[i] - chains.prev_y[i],
            chains.pos_z[i] - chains.prev_z[i],
        );
        let energy = 0.5
            * ((vx as f64).powi(2) + (vy as f64).powi(2) + (vz as f64).powi(2))
            * inv_dt_sq as f64
            / w as f64;
        // 진단값은 f32 표현 상한에서 포화시켜 통계 overflow를 방지한다.
        stats.total_kinetic_energy =
            (stats.total_kinetic_energy as f64 + energy).min(f32::MAX as f64) as f32;
    }
    for i in 1..n {
        let rest = sanitize_pos_f32(chains.rest_len[i]);
        if rest <= 0.0
            || sanitize_pos_f32(chains.inv_mass[i - 1]) + sanitize_pos_f32(chains.inv_mass[i])
                <= 0.0
        {
            continue;
        }
        stats.active_constraints += 1;
        let (dx, dy, dz) = (
            chains.pos_x[i] - chains.pos_x[i - 1],
            chains.pos_y[i] - chains.pos_y[i - 1],
            chains.pos_z[i] - chains.pos_z[i - 1],
        );
        stats.max_constraint_error = stats
            .max_constraint_error
            .max(((dx * dx + dy * dy + dz * dz).sqrt() - rest).abs());
    }
    Ok(stats)
}

// ============================================================================
// 2. 15관절 3D 손가락 FABRIK(Forward And Backward Reaching IK) 솔버
// ============================================================================
