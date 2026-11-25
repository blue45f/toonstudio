use super::*;

/// 결정론적 3D 정수 셀 해시(플랫폼·엔디언 독립).
#[inline]
#[must_use]
pub const fn hash_cell_3d(cx: i32, cy: i32, cz: i32) -> u32 {
    let x = (cx as u32).wrapping_mul(73_856_093);
    let y = (cy as u32).wrapping_mul(19_349_663);
    let z = (cz as u32).wrapping_mul(83_492_791);
    let mut h = x ^ y ^ z;
    h ^= h >> 16;
    h = h.wrapping_mul(0x7feb_352d);
    h ^= h >> 15;
    h
}

#[derive(Debug, Clone, Copy)]
struct SpatialEntry3D {
    id: u32,
    pos: [f32; 3],
    radius: f32,
    cell: [i32; 3],
    next: u32,
}

/// 아바타·소품 침투 밀어내기용 구체 바디(`inv_mass == 0.0`이면 정적 소품).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AtelierSphereBody {
    pub id: u32,
    pub pos: [f32; 3],
    pub radius: f32,
    pub inv_mass: f32,
}

impl AtelierSphereBody {
    #[inline]
    #[must_use]
    pub const fn new(id: u32, pos: [f32; 3], radius: f32, inv_mass: f32) -> Self {
        Self {
            id,
            pos,
            radius,
            inv_mass,
        }
    }
}

/// 구체 침투 밀어내기 실행 통계.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct SphereOverlapStats {
    pub resolved_pairs: usize,
    pub iterations_run: u32,
    pub max_initial_penetration: f32,
    pub max_residual_penetration: f32,
}

/// 고정 셀 크기 기반 O(1) 삽입·반경 쿼리 및 침투 해소용 3D 공간 해시 그리드.
#[derive(Debug, Clone)]
pub struct SpatialHashGrid3D {
    cell_size: f32,
    inv_cell_size: f32,
    bucket_mask: usize,
    bucket_heads: Vec<u32>,
    entries: Vec<SpatialEntry3D>,
    large_entries: Vec<u32>,
    max_grid_radius: f32,
}

impl SpatialHashGrid3D {
    /// 지정 셀 크기(예: `0.25m`)와 2의 거듭제곱 버킷 수로 빈 3D 공간 해시 그리드를 생성한다.
    pub fn new(cell_size: f32, min_bucket_count: usize) -> Result<Self, DrawingCoreError> {
        if !cell_size.is_finite() || !(1e-3..=1.0e4).contains(&cell_size) {
            return Err(DrawingCoreError::InvalidParameter { name: "cell_size" });
        }
        let buckets = min_bucket_count.clamp(64, 1 << 20).next_power_of_two();
        Ok(Self {
            cell_size,
            inv_cell_size: 1.0 / cell_size,
            bucket_mask: buckets - 1,
            bucket_heads: vec![u32::MAX; buckets],
            entries: Vec::new(),
            large_entries: Vec::new(),
            max_grid_radius: 0.0,
        })
    }

    #[inline]
    #[must_use]
    pub fn cell_size(&self) -> f32 {
        self.cell_size
    }

    #[inline]
    #[must_use]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    #[inline]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    #[inline]
    #[must_use]
    pub fn cell_coords(&self, pos: [f32; 3]) -> [i32; 3] {
        [
            (pos[0] * self.inv_cell_size).floor() as i32,
            (pos[1] * self.inv_cell_size).floor() as i32,
            (pos[2] * self.inv_cell_size).floor() as i32,
        ]
    }

    /// 할당 버퍼를 유지한 채 그리드를 초기화한다.
    pub fn clear(&mut self) {
        self.bucket_heads.fill(u32::MAX);
        self.entries.clear();
        self.large_entries.clear();
        self.max_grid_radius = 0.0;
    }

    /// 반경 0인 점(브러시 제어점·소품 중심)을 O(1)으로 삽입한다.
    pub fn insert(&mut self, id: u32, pos: [f32; 3]) -> Result<(), DrawingCoreError> {
        self.insert_sphere(id, pos, 0.0)
    }

    /// 반경 `radius >= 0`인 구체를 O(1)으로 삽입한다.
    pub fn insert_sphere(
        &mut self,
        id: u32,
        pos: [f32; 3],
        radius: f32,
    ) -> Result<(), DrawingCoreError> {
        if !bounded_vec3(pos) {
            return Err(DrawingCoreError::InvalidParameter { name: "pos" });
        }
        if !radius.is_finite() || radius < 0.0 || radius > MAX_STAGE_COORD {
            return Err(DrawingCoreError::InvalidParameter { name: "radius" });
        }
        if self.entries.len() >= MAX_STAGE_OBJECTS {
            return Err(DrawingCoreError::InvalidParameter {
                name: "grid_capacity",
            });
        }
        let idx = self.entries.len() as u32;
        let cell = self.cell_coords(pos);
        if radius > 2.0 * self.cell_size {
            self.entries.push(SpatialEntry3D {
                id,
                pos,
                radius,
                cell,
                next: u32::MAX,
            });
            self.large_entries.push(idx);
        } else {
            let bucket = (hash_cell_3d(cell[0], cell[1], cell[2]) as usize) & self.bucket_mask;
            let prev_head = self.bucket_heads[bucket];
            self.entries.push(SpatialEntry3D {
                id,
                pos,
                radius,
                cell,
                next: prev_head,
            });
            self.bucket_heads[bucket] = idx;
            if radius > self.max_grid_radius {
                self.max_grid_radius = radius;
            }
        }
        Ok(())
    }

    /// 중심 `center`로부터 `dist <= radius + entry.radius`인 모든 항목의 ID를 중복 없이 반환한다.
    pub fn query_radius(
        &self,
        center: [f32; 3],
        radius: f32,
        out_ids: &mut Vec<u32>,
    ) -> Result<usize, DrawingCoreError> {
        if !bounded_vec3(center) {
            return Err(DrawingCoreError::InvalidParameter { name: "center" });
        }
        if !radius.is_finite() || radius < 0.0 || radius > MAX_STAGE_COORD {
            return Err(DrawingCoreError::InvalidParameter { name: "radius" });
        }
        out_ids.clear();
        if self.entries.is_empty() {
            return Ok(0);
        }
        let search_r = radius + self.max_grid_radius + self.cell_size * 1e-4;
        let min_c = self.cell_coords([
            center[0] - search_r,
            center[1] - search_r,
            center[2] - search_r,
        ]);
        let max_c = self.cell_coords([
            center[0] + search_r,
            center[1] + search_r,
            center[2] + search_r,
        ]);
        let nx = (i64::from(max_c[0]) - i64::from(min_c[0]) + 1).max(0) as usize;
        let ny = (i64::from(max_c[1]) - i64::from(min_c[1]) + 1).max(0) as usize;
        let nz = (i64::from(max_c[2]) - i64::from(min_c[2]) + 1).max(0) as usize;
        let cell_vol = nx.saturating_mul(ny).saturating_mul(nz);

        if cell_vol > MAX_SPATIAL_GRID_CELLS_PER_QUERY
            || cell_vol > self.entries.len().saturating_mul(2)
        {
            for e in &self.entries {
                if sphere_within(center, radius, e.pos, e.radius) {
                    out_ids.push(e.id);
                }
            }
            return Ok(out_ids.len());
        }

        for cz in min_c[2]..=max_c[2] {
            for cy in min_c[1]..=max_c[1] {
                for cx in min_c[0]..=max_c[0] {
                    let bucket = (hash_cell_3d(cx, cy, cz) as usize) & self.bucket_mask;
                    let mut cursor = self.bucket_heads[bucket];
                    while cursor != u32::MAX {
                        let e = self.entries[cursor as usize];
                        if e.cell == [cx, cy, cz] && sphere_within(center, radius, e.pos, e.radius)
                        {
                            out_ids.push(e.id);
                        }
                        cursor = e.next;
                    }
                }
            }
        }
        for &large_idx in &self.large_entries {
            let e = self.entries[large_idx as usize];
            if sphere_within(center, radius, e.pos, e.radius) {
                out_ids.push(e.id);
            }
        }
        Ok(out_ids.len())
    }

    /// 공간 해시 그리드로 겹치는 아바타·소품 구체를 탐색해 질량 역수 비례로 침투를 해소한다.
    pub fn resolve_sphere_overlaps(
        &mut self,
        bodies: &mut [AtelierSphereBody],
        iterations: u32,
        relaxation: f32,
    ) -> Result<SphereOverlapStats, DrawingCoreError> {
        if iterations == 0 || iterations > 32 {
            return Err(DrawingCoreError::InvalidParameter { name: "iterations" });
        }
        if !relaxation.is_finite() || !(0.05..=1.0).contains(&relaxation) {
            return Err(DrawingCoreError::InvalidParameter { name: "relaxation" });
        }
        if bodies.len() > MAX_STAGE_OBJECTS {
            return Err(DrawingCoreError::InvalidParameter {
                name: "sphere_count",
            });
        }
        for b in bodies.iter() {
            if !bounded_vec3(b.pos)
                || !b.radius.is_finite()
                || b.radius < 0.0
                || b.radius > MAX_STAGE_COORD
                || !b.inv_mass.is_finite()
                || b.inv_mass < 0.0
            {
                return Err(DrawingCoreError::InvalidParameter {
                    name: "sphere_body",
                });
            }
        }

        let mut stats = SphereOverlapStats {
            iterations_run: iterations,
            ..SphereOverlapStats::default()
        };
        if bodies.len() < 2 {
            return Ok(stats);
        }

        let mut candidates = Vec::new();
        for iter in 0..iterations {
            self.clear();
            for (idx, b) in bodies.iter().enumerate() {
                self.insert_sphere(idx as u32, b.pos, b.radius)?;
            }
            for i in 0..bodies.len() {
                let (ri, wi) = (bodies[i].radius, bodies[i].inv_mass);
                self.query_radius(bodies[i].pos, ri, &mut candidates)?;
                for &j_u32 in &candidates {
                    let j = j_u32 as usize;
                    if j <= i {
                        continue;
                    }
                    let pi = bodies[i].pos;
                    let (pj, rj, wj) = (bodies[j].pos, bodies[j].radius, bodies[j].inv_mass);
                    let w_sum = wi + wj;
                    if w_sum <= 0.0 {
                        continue;
                    }
                    let (dx, dy, dz) = (pj[0] - pi[0], pj[1] - pi[1], pj[2] - pi[2]);
                    let min_dist = ri + rj;
                    let dist_sq = dx * dx + dy * dy + dz * dz;
                    if dist_sq >= min_dist * min_dist {
                        continue;
                    }
                    let (nx, ny, nz, pen) = if dist_sq > 1e-12 {
                        let dist = dist_sq.sqrt();
                        (dx / dist, dy / dist, dz / dist, min_dist - dist)
                    } else {
                        let angle = ((i ^ (j.wrapping_mul(2_654_435_761))) as f32) * 0.618_034;
                        let (s, c) = angle.sin_cos();
                        (c, 0.0, s, min_dist)
                    };
                    if iter == 0 && pen > stats.max_initial_penetration {
                        stats.max_initial_penetration = pen;
                    }
                    let corr = (pen * relaxation) / w_sum;
                    bodies[i].pos[0] -= nx * corr * wi;
                    bodies[i].pos[1] -= ny * corr * wi;
                    bodies[i].pos[2] -= nz * corr * wi;
                    bodies[j].pos[0] += nx * corr * wj;
                    bodies[j].pos[1] += ny * corr * wj;
                    bodies[j].pos[2] += nz * corr * wj;
                    stats.resolved_pairs += 1;
                }
            }
        }

        self.clear();
        for (idx, b) in bodies.iter().enumerate() {
            self.insert_sphere(idx as u32, b.pos, b.radius)?;
        }
        for i in 0..bodies.len() {
            let (pi, ri, wi) = (bodies[i].pos, bodies[i].radius, bodies[i].inv_mass);
            self.query_radius(pi, ri, &mut candidates)?;
            for &j_u32 in &candidates {
                let j = j_u32 as usize;
                if j <= i || wi + bodies[j].inv_mass <= 0.0 {
                    continue;
                }
                let pj = bodies[j].pos;
                let dist =
                    ((pj[0] - pi[0]).powi(2) + (pj[1] - pi[1]).powi(2) + (pj[2] - pi[2]).powi(2))
                        .sqrt();
                let pen = (ri + bodies[j].radius) - dist;
                if pen > stats.max_residual_penetration {
                    stats.max_residual_penetration = pen;
                }
            }
        }
        Ok(stats)
    }
}

#[inline]
fn sphere_within(center: [f32; 3], query_r: f32, pos: [f32; 3], entry_r: f32) -> bool {
    let (dx, dy, dz) = (pos[0] - center[0], pos[1] - center[1], pos[2] - center[2]);
    let limit = query_r + entry_r;
    dx * dx + dy * dy + dz * dz <= limit * limit
}

/// 지정 셀 크기의 `SpatialHashGrid3D`를 구성해 아바타·소품 구체 침투를 밀어낸다.
pub fn resolve_sphere_overlaps(
    bodies: &mut [AtelierSphereBody],
    cell_size: f32,
    iterations: u32,
    relaxation: f32,
) -> Result<SphereOverlapStats, DrawingCoreError> {
    let buckets = bodies
        .len()
        .saturating_mul(2)
        .clamp(64, DEFAULT_SPATIAL_BUCKET_COUNT);
    let mut grid = SpatialHashGrid3D::new(cell_size, buckets)?;
    grid.resolve_sphere_overlaps(bodies, iterations, relaxation)
}
