//! Surface Area Heuristic(SAH) 3D 삼각형 BVH 빌더 · 고속 Slab+Möller-Trumbore 레이캐스트 ·
//! 최근접 구체 겹침 쿼리 커널(`three-mesh-bvh` 대체 순수 안전 Rust 구현).
//!
//! - 캐시 정렬된 32바이트 평면 노드 배열(`SahBvhNode3D`)과 비재귀 스택 순회로 스택 오버플로를 차단한다.
//! - 외부 크레이트 0개(`std` 전용), `#![deny(unsafe_code)]`, NaN/Inf/인덱스 범위 검증을 강제한다.

use crate::DrawingCoreError;

/// Binned SAH 분할 후보 버킷 수(Wald 2007 기준 최적 속도/품질 균형).
pub const SAH_BIN_COUNT: usize = 12;
/// 기본 리프 최대 삼각형 개수.
pub const BVH3D_DEFAULT_LEAF_TRIANGLES: u32 = 4;
/// 비재귀 빌드/순회 최대 트리 깊이.
pub const BVH3D_MAX_DEPTH: usize = 64;

const RAY_EPS: f32 = 1e-7;
const AXIS_ZERO_EPS: f32 = 1e-12;

#[inline]
fn v3_sub(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

#[inline]
fn v3_add(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

#[inline]
fn v3_scale(a: [f32; 3], s: f32) -> [f32; 3] {
    [a[0] * s, a[1] * s, a[2] * s]
}

#[inline]
fn v3_dot(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

#[inline]
fn v3_cross(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

#[inline]
fn v3_len_sq(a: [f32; 3]) -> f32 {
    v3_dot(a, a)
}

#[inline]
fn v3_normalize_or(a: [f32; 3], fallback: [f32; 3]) -> [f32; 3] {
    let l2 = v3_len_sq(a);
    if l2.is_finite() && l2 > AXIS_ZERO_EPS * AXIS_ZERO_EPS {
        v3_scale(a, 1.0 / l2.sqrt())
    } else {
        fallback
    }
}

#[inline]
fn all_finite3(v: [f32; 3]) -> bool {
    v[0].is_finite() && v[1].is_finite() && v[2].is_finite()
}

/// 3D 축 정렬 바운딩 박스(AABB).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Aabb3D {
    pub min: [f32; 3],
    pub max: [f32; 3],
}

impl Aabb3D {
    /// 병합 항등원 역할을 하는 빈 AABB.
    #[inline]
    #[must_use]
    pub const fn empty() -> Self {
        Self {
            min: [f32::INFINITY; 3],
            max: [f32::NEG_INFINITY; 3],
        }
    }

    /// 3개 정점으로 삼각형 AABB를 생성한다.
    #[inline]
    #[must_use]
    pub fn from_triangle(v0: [f32; 3], v1: [f32; 3], v2: [f32; 3]) -> Self {
        Self {
            min: [
                v0[0].min(v1[0]).min(v2[0]),
                v0[1].min(v1[1]).min(v2[1]),
                v0[2].min(v1[2]).min(v2[2]),
            ],
            max: [
                v0[0].max(v1[0]).max(v2[0]),
                v0[1].max(v1[1]).max(v2[1]),
                v0[2].max(v1[2]).max(v2[2]),
            ],
        }
    }

    #[inline]
    #[must_use]
    pub fn expand_point(self, p: [f32; 3]) -> Self {
        Self {
            min: [
                self.min[0].min(p[0]),
                self.min[1].min(p[1]),
                self.min[2].min(p[2]),
            ],
            max: [
                self.max[0].max(p[0]),
                self.max[1].max(p[1]),
                self.max[2].max(p[2]),
            ],
        }
    }

    #[inline]
    #[must_use]
    pub fn union(self, other: Self) -> Self {
        Self {
            min: [
                self.min[0].min(other.min[0]),
                self.min[1].min(other.min[1]),
                self.min[2].min(other.min[2]),
            ],
            max: [
                self.max[0].max(other.max[0]),
                self.max[1].max(other.max[1]),
                self.max[2].max(other.max[2]),
            ],
        }
    }

    /// SAH 비용 계산용 반표면적(surface area = `2 * half_area`). 빈 박스면 0.0.
    #[inline]
    #[must_use]
    pub fn surface_area(self) -> f32 {
        let dx = self.max[0] - self.min[0];
        let dy = self.max[1] - self.min[1];
        let dz = self.max[2] - self.min[2];
        if dx < 0.0 || dy < 0.0 || dz < 0.0 {
            return 0.0;
        }
        2.0 * (dx * dy + dy * dz + dz * dx)
    }

    #[inline]
    #[must_use]
    pub fn centroid(self) -> [f32; 3] {
        [
            0.5 * (self.min[0] + self.max[0]),
            0.5 * (self.min[1] + self.max[1]),
            0.5 * (self.min[2] + self.max[2]),
        ]
    }

    /// 3D 점 `p`에서 AABB 표면/내부까지의 제곱 거리를 반환한다(내부 점이면 0.0).
    #[inline]
    #[must_use]
    pub fn distance_sq_to_point(self, p: [f32; 3]) -> f32 {
        let mut d2 = 0.0_f32;
        for (axis, &coord) in p.iter().enumerate() {
            if coord < self.min[axis] {
                let d = self.min[axis] - coord;
                d2 += d * d;
            } else if coord > self.max[axis] {
                let d = coord - self.max[axis];
                d2 += d * d;
            }
        }
        d2
    }

    /// 고속 Slab 광선-AABB 교차 판정(축 평행 0-성분 광선에서도 NaN 안전).
    /// 교차 시 진입 거리 `t_enter >= t_min`을 반환한다.
    #[inline]
    #[must_use]
    pub fn intersects_ray_slab(
        self,
        origin: [f32; 3],
        dir: [f32; 3],
        inv_dir: [f32; 3],
        mut t_min: f32,
        mut t_max: f32,
    ) -> Option<f32> {
        for axis in 0..3 {
            if dir[axis].abs() < AXIS_ZERO_EPS {
                if origin[axis] < self.min[axis] || origin[axis] > self.max[axis] {
                    return None;
                }
            } else {
                let t0 = (self.min[axis] - origin[axis]) * inv_dir[axis];
                let t1 = (self.max[axis] - origin[axis]) * inv_dir[axis];
                let (near, far) = if t0 <= t1 { (t0, t1) } else { (t1, t0) };
                t_min = t_min.max(near);
                t_max = t_max.min(far);
                if t_max < t_min {
                    return None;
                }
            }
        }
        Some(t_min)
    }
}

/// 캐시 라인 정렬된 32바이트 평면 SAH BVH 노드(64바이트 캐시 라인당 2노드 배치).
#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(C, align(32))]
pub struct SahBvhNode3D {
    pub bounds_min: [f32; 3],
    /// 리프(`tri_count > 0`)이면 `prim_indices` 시작 인덱스, 내부 노드(`tri_count == 0`)이면 왼쪽 자식 인덱스(오른쪽 자식은 `+ 1`).
    pub left_or_first: u32,
    pub bounds_max: [f32; 3],
    /// 리프 삼각형 개수(`0`이면 내부 노드).
    pub tri_count: u32,
}

impl SahBvhNode3D {
    #[inline]
    #[must_use]
    pub const fn is_leaf(&self) -> bool {
        self.tri_count > 0
    }

    #[inline]
    #[must_use]
    pub const fn aabb(&self) -> Aabb3D {
        Aabb3D {
            min: self.bounds_min,
            max: self.bounds_max,
        }
    }
}

/// SAH BVH 빌드 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SahBvhConfig {
    pub max_leaf_triangles: u32,
    pub traversal_cost: f32,
    pub intersection_cost: f32,
}

impl Default for SahBvhConfig {
    fn default() -> Self {
        Self {
            max_leaf_triangles: BVH3D_DEFAULT_LEAF_TRIANGLES,
            traversal_cost: 1.0,
            intersection_cost: 1.25,
        }
    }
}

/// 평면 배열 기반 3D SAH 삼각형 BVH.
#[derive(Debug, Clone, PartialEq)]
pub struct SahBvh3D {
    pub nodes: Vec<SahBvhNode3D>,
    pub prim_indices: Vec<u32>,
    pub tri_count: usize,
    pub leaf_count: usize,
    pub max_depth: usize,
}

/// 3D 광선 입력(방향 벡터는 내부에서 단위 벡터로 정규화하여 월드 거리 `t`를 계산한다).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Ray3D {
    pub origin: [f32; 3],
    pub direction: [f32; 3],
    pub t_min: f32,
    pub t_max: f32,
}

/// SAH BVH 레이캐스트 적중 결과.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RaycastHit3D {
    pub triangle_index: u32,
    pub distance: f32,
    pub u: f32,
    pub v: f32,
    pub point: [f32; 3],
    pub normal: [f32; 3],
    pub nodes_visited: u32,
    pub triangles_tested: u32,
}

/// 구체 겹침 쿼리의 단일 삼각형 최근접 적중 정보.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SphereOverlapHit3D {
    pub triangle_index: u32,
    pub distance: f32,
    pub closest_point: [f32; 3],
    pub normal: [f32; 3],
}

/// 구체 겹침 쿼리 전체 결과.
#[derive(Debug, Clone, PartialEq)]
pub struct SphereQueryResult3D {
    pub hits: Vec<SphereOverlapHit3D>,
    pub closest: Option<SphereOverlapHit3D>,
    pub nodes_visited: u32,
    pub triangles_tested: u32,
}

fn validate_mesh_buffers(
    positions_xyz: &[f32],
    indices: &[u32],
) -> Result<(usize, usize), DrawingCoreError> {
    if !positions_xyz.len().is_multiple_of(3) {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: positions_xyz.len() + (3 - positions_xyz.len() % 3),
            actual: positions_xyz.len(),
        });
    }
    if !indices.len().is_multiple_of(3) {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: indices.len() + (3 - indices.len() % 3),
            actual: indices.len(),
        });
    }
    if !positions_xyz.iter().all(|v| v.is_finite()) {
        return Err(DrawingCoreError::InvalidParameter {
            name: "positions_xyz",
        });
    }
    let vertex_count = positions_xyz.len() / 3;
    let tri_count = indices.len() / 3;
    for &idx in indices {
        if (idx as usize) >= vertex_count {
            return Err(DrawingCoreError::InvalidParameter { name: "indices" });
        }
    }
    Ok((vertex_count, tri_count))
}

#[inline]
fn fetch_triangle(
    positions_xyz: &[f32],
    indices: &[u32],
    tri_idx: usize,
) -> ([f32; 3], [f32; 3], [f32; 3]) {
    let base = tri_idx * 3;
    let i0 = (indices[base] as usize) * 3;
    let i1 = (indices[base + 1] as usize) * 3;
    let i2 = (indices[base + 2] as usize) * 3;
    (
        [
            positions_xyz[i0],
            positions_xyz[i0 + 1],
            positions_xyz[i0 + 2],
        ],
        [
            positions_xyz[i1],
            positions_xyz[i1 + 1],
            positions_xyz[i1 + 2],
        ],
        [
            positions_xyz[i2],
            positions_xyz[i2 + 1],
            positions_xyz[i2 + 2],
        ],
    )
}

#[derive(Clone, Copy)]
struct SahBin {
    bounds: Aabb3D,
    count: u32,
}

impl SahBin {
    const fn empty() -> Self {
        Self {
            bounds: Aabb3D::empty(),
            count: 0,
        }
    }
}

/// Binned Surface Area Heuristic(SAH) 기반 3D 삼각형 BVH를 비재귀로 구축한다.
pub fn build_sah_bvh_3d(
    positions_xyz: &[f32],
    indices: &[u32],
    config: &SahBvhConfig,
) -> Result<SahBvh3D, DrawingCoreError> {
    if config.max_leaf_triangles == 0 {
        return Err(DrawingCoreError::InvalidParameter {
            name: "max_leaf_triangles",
        });
    }
    if !config.traversal_cost.is_finite() || config.traversal_cost <= 0.0 {
        return Err(DrawingCoreError::InvalidParameter {
            name: "traversal_cost",
        });
    }
    if !config.intersection_cost.is_finite() || config.intersection_cost <= 0.0 {
        return Err(DrawingCoreError::InvalidParameter {
            name: "intersection_cost",
        });
    }

    let (_, tri_count) = validate_mesh_buffers(positions_xyz, indices)?;
    if tri_count == 0 {
        return Ok(SahBvh3D {
            nodes: Vec::new(),
            prim_indices: Vec::new(),
            tri_count: 0,
            leaf_count: 0,
            max_depth: 0,
        });
    }

    let mut tri_aabbs = Vec::with_capacity(tri_count);
    let mut tri_centroids = Vec::with_capacity(tri_count);
    let mut prim_indices = Vec::with_capacity(tri_count);
    for t in 0..tri_count {
        let (v0, v1, v2) = fetch_triangle(positions_xyz, indices, t);
        let aabb = Aabb3D::from_triangle(v0, v1, v2);
        tri_centroids.push(aabb.centroid());
        tri_aabbs.push(aabb);
        prim_indices.push(t as u32);
    }

    let max_leaf = config.max_leaf_triangles as usize;
    let mut nodes = Vec::with_capacity(tri_count.saturating_mul(2).max(1));
    nodes.push(SahBvhNode3D {
        bounds_min: [0.0; 3],
        left_or_first: 0,
        bounds_max: [0.0; 3],
        tri_count: tri_count as u32,
    });

    let mut stack: Vec<(usize, usize, usize, usize)> = Vec::with_capacity(BVH3D_MAX_DEPTH);
    stack.push((0, 0, tri_count, 0));

    let mut leaf_count = 0usize;
    let mut max_depth = 0usize;

    while let Some((node_idx, start, count, depth)) = stack.pop() {
        max_depth = max_depth.max(depth);
        let mut bounds = Aabb3D::empty();
        let mut centroid_bounds = Aabb3D::empty();
        for &p in &prim_indices[start..start + count] {
            let ti = p as usize;
            bounds = bounds.union(tri_aabbs[ti]);
            centroid_bounds = centroid_bounds.expand_point(tri_centroids[ti]);
        }

        nodes[node_idx].bounds_min = bounds.min;
        nodes[node_idx].bounds_max = bounds.max;

        if count <= max_leaf || depth + 1 >= BVH3D_MAX_DEPTH {
            nodes[node_idx].left_or_first = start as u32;
            nodes[node_idx].tri_count = count as u32;
            leaf_count += 1;
            continue;
        }

        let parent_area = bounds.surface_area();
        let leaf_cost = config.intersection_cost * (count as f32);
        let mut best_cost = f32::INFINITY;
        let mut best_axis: Option<usize> = None;
        let mut best_split_bin: usize = 1;
        let mut best_scale = 0.0_f32;
        let mut best_min_c = 0.0_f32;

        if parent_area > AXIS_ZERO_EPS {
            let inv_parent_area = 1.0 / parent_area;
            for (axis, (&c_min, &c_max)) in centroid_bounds
                .min
                .iter()
                .zip(centroid_bounds.max.iter())
                .enumerate()
            {
                let extent = c_max - c_min;
                if extent <= RAY_EPS {
                    continue;
                }
                let scale = (SAH_BIN_COUNT as f32) / extent;
                let mut bins = [SahBin::empty(); SAH_BIN_COUNT];

                for &p in &prim_indices[start..start + count] {
                    let ti = p as usize;
                    let raw_bin = ((tri_centroids[ti][axis] - c_min) * scale) as usize;
                    let b = raw_bin.min(SAH_BIN_COUNT - 1);
                    bins[b].count += 1;
                    bins[b].bounds = bins[b].bounds.union(tri_aabbs[ti]);
                }

                let mut left_areas = [0.0_f32; SAH_BIN_COUNT - 1];
                let mut left_counts = [0u32; SAH_BIN_COUNT - 1];
                let mut acc_box = Aabb3D::empty();
                let mut acc_cnt = 0u32;
                for i in 0..(SAH_BIN_COUNT - 1) {
                    acc_cnt += bins[i].count;
                    if bins[i].count > 0 {
                        acc_box = acc_box.union(bins[i].bounds);
                    }
                    left_counts[i] = acc_cnt;
                    left_areas[i] = acc_box.surface_area();
                }

                let mut right_box = Aabb3D::empty();
                let mut right_cnt = 0u32;
                for i in (1..SAH_BIN_COUNT).rev() {
                    right_cnt += bins[i].count;
                    if bins[i].count > 0 {
                        right_box = right_box.union(bins[i].bounds);
                    }
                    let l_cnt = left_counts[i - 1];
                    if l_cnt == 0 || right_cnt == 0 {
                        continue;
                    }
                    let right_area = right_box.surface_area();
                    let cost = config.traversal_cost
                        + config.intersection_cost
                            * ((l_cnt as f32) * left_areas[i - 1]
                                + (right_cnt as f32) * right_area)
                            * inv_parent_area;
                    if cost < best_cost {
                        best_cost = cost;
                        best_axis = Some(axis);
                        best_split_bin = i;
                        best_scale = scale;
                        best_min_c = c_min;
                    }
                }
            }
        }

        // 리프 비용이 SAH 분할보다 유리하고 삼각형 수가 충분히 작으면 조기 리프 확정
        let mid = if let Some(axis) = best_axis {
            if best_cost >= leaf_cost && count <= max_leaf.saturating_mul(4) {
                nodes[node_idx].left_or_first = start as u32;
                nodes[node_idx].tri_count = count as u32;
                leaf_count += 1;
                continue;
            }
            let slice = &mut prim_indices[start..start + count];
            let mut i = 0usize;
            let mut j = count;
            while i < j {
                let ti = slice[i] as usize;
                let b = (((tri_centroids[ti][axis] - best_min_c) * best_scale) as usize)
                    .min(SAH_BIN_COUNT - 1);
                if b < best_split_bin {
                    i += 1;
                } else {
                    j -= 1;
                    slice.swap(i, j);
                }
            }
            if i == 0 || i == count {
                start + count / 2
            } else {
                start + i
            }
        } else {
            // 모든 중심이 일치하는 퇴화 메쉬는 객체 중앙 분할로 리프 크기를 안전하게 제한
            start + count / 2
        };

        let left_count = mid - start;
        let right_count = count - left_count;
        let left_child = nodes.len();
        let right_child = left_child + 1;
        nodes.push(SahBvhNode3D {
            bounds_min: [0.0; 3],
            left_or_first: 0,
            bounds_max: [0.0; 3],
            tri_count: 0,
        });
        nodes.push(SahBvhNode3D {
            bounds_min: [0.0; 3],
            left_or_first: 0,
            bounds_max: [0.0; 3],
            tri_count: 0,
        });

        nodes[node_idx].left_or_first = left_child as u32;
        nodes[node_idx].tri_count = 0;

        stack.push((right_child, mid, right_count, depth + 1));
        stack.push((left_child, start, left_count, depth + 1));
    }

    Ok(SahBvh3D {
        nodes,
        prim_indices,
        tri_count,
        leaf_count,
        max_depth,
    })
}

/// Möller-Trumbore 3D 광선-삼각형 교차 테스트. 적중 시 `(t, u, v, normal)` 반환.
#[inline]
fn intersect_triangle_moller_trumbore(
    origin: [f32; 3],
    dir: [f32; 3],
    tri: ([f32; 3], [f32; 3], [f32; 3]),
    t_range: (f32, f32),
    backface_cull: bool,
) -> Option<(f32, f32, f32, [f32; 3])> {
    let (v0, v1, v2) = tri;
    let (t_min, t_max) = t_range;
    let e1 = v3_sub(v1, v0);
    let e2 = v3_sub(v2, v0);
    let pvec = v3_cross(dir, e2);
    let det = v3_dot(e1, pvec);

    if backface_cull {
        if det <= RAY_EPS {
            return None;
        }
    } else if det.abs() <= RAY_EPS {
        return None;
    }

    let inv_det = 1.0 / det;
    let tvec = v3_sub(origin, v0);
    let u = v3_dot(tvec, pvec) * inv_det;
    if !(0.0..=1.0).contains(&u) {
        return None;
    }

    let qvec = v3_cross(tvec, e1);
    let v = v3_dot(dir, qvec) * inv_det;
    if v < 0.0 || (u + v) > 1.0 {
        return None;
    }

    let t = v3_dot(e2, qvec) * inv_det;
    if t < t_min || t > t_max {
        return None;
    }

    let raw_n = v3_cross(e1, e2);
    let n = v3_normalize_or(raw_n, [0.0, 1.0, 0.0]);
    Some((t, u, v, n))
}

/// 구축된 SAH BVH에 대해 근거리 우선(front-to-back) Slab AABB + Möller-Trumbore 레이캐스트를 수행한다.
pub fn raycast_sah_bvh_3d(
    bvh: &SahBvh3D,
    positions_xyz: &[f32],
    indices: &[u32],
    ray: &Ray3D,
    backface_cull: bool,
) -> Result<Option<RaycastHit3D>, DrawingCoreError> {
    if !all_finite3(ray.origin) || !all_finite3(ray.direction) {
        return Err(DrawingCoreError::InvalidParameter { name: "ray" });
    }
    let dir_len_sq = v3_len_sq(ray.direction);
    if !dir_len_sq.is_finite() || dir_len_sq <= AXIS_ZERO_EPS * AXIS_ZERO_EPS {
        return Err(DrawingCoreError::InvalidParameter {
            name: "ray_direction",
        });
    }
    if !ray.t_min.is_finite()
        || !ray.t_max.is_finite()
        || ray.t_min < 0.0
        || ray.t_max <= ray.t_min
    {
        return Err(DrawingCoreError::InvalidParameter { name: "ray_range" });
    }

    let (_, tri_count) = validate_mesh_buffers(positions_xyz, indices)?;
    if bvh.nodes.is_empty() || tri_count == 0 {
        return Ok(None);
    }
    if bvh.tri_count != tri_count {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: bvh.tri_count,
            actual: tri_count,
        });
    }

    let inv_len = 1.0 / dir_len_sq.sqrt();
    let dir = v3_scale(ray.direction, inv_len);
    let inv_dir = [
        if dir[0].abs() < AXIS_ZERO_EPS {
            0.0
        } else {
            1.0 / dir[0]
        },
        if dir[1].abs() < AXIS_ZERO_EPS {
            0.0
        } else {
            1.0 / dir[1]
        },
        if dir[2].abs() < AXIS_ZERO_EPS {
            0.0
        } else {
            1.0 / dir[2]
        },
    ];

    let mut best_t = ray.t_max;
    let mut best_hit: Option<RaycastHit3D> = None;
    let mut nodes_visited = 0u32;
    let mut triangles_tested = 0u32;

    let Some(root_t) = bvh.nodes[0]
        .aabb()
        .intersects_ray_slab(ray.origin, dir, inv_dir, ray.t_min, best_t)
    else {
        return Ok(None);
    };

    let mut stack = [(0usize, 0.0_f32); BVH3D_MAX_DEPTH * 2];
    let mut sp = 1usize;
    stack[0] = (0, root_t);

    while sp > 0 {
        sp -= 1;
        let (node_idx, node_t) = stack[sp];
        if node_t > best_t {
            continue;
        }
        nodes_visited = nodes_visited.saturating_add(1);
        let node = bvh.nodes[node_idx];

        if node.is_leaf() {
            let first = node.left_or_first as usize;
            let count = node.tri_count as usize;
            let end = first.saturating_add(count).min(bvh.prim_indices.len());
            for &tri_u32 in &bvh.prim_indices[first..end] {
                triangles_tested = triangles_tested.saturating_add(1);
                let tri = fetch_triangle(positions_xyz, indices, tri_u32 as usize);
                if let Some((t, u, v, normal)) = intersect_triangle_moller_trumbore(
                    ray.origin,
                    dir,
                    tri,
                    (ray.t_min, best_t),
                    backface_cull,
                ) {
                    best_t = t;
                    best_hit = Some(RaycastHit3D {
                        triangle_index: tri_u32,
                        distance: t,
                        u,
                        v,
                        point: v3_add(ray.origin, v3_scale(dir, t)),
                        normal,
                        nodes_visited,
                        triangles_tested,
                    });
                }
            }
        } else {
            let left = node.left_or_first as usize;
            let right = left + 1;
            if right >= bvh.nodes.len() {
                continue;
            }
            let hit_l = bvh.nodes[left]
                .aabb()
                .intersects_ray_slab(ray.origin, dir, inv_dir, ray.t_min, best_t);
            let hit_r = bvh.nodes[right]
                .aabb()
                .intersects_ray_slab(ray.origin, dir, inv_dir, ray.t_min, best_t);

            match (hit_l, hit_r) {
                (Some(tl), Some(tr)) => {
                    // 가까운 자식을 스택 위에 올려 먼저 방문함으로써 `best_t`를 조기 축소한다.
                    if sp + 2 <= stack.len() {
                        if tl <= tr {
                            stack[sp] = (right, tr);
                            stack[sp + 1] = (left, tl);
                        } else {
                            stack[sp] = (left, tl);
                            stack[sp + 1] = (right, tr);
                        }
                        sp += 2;
                    }
                }
                (Some(tl), None) => {
                    if sp < stack.len() {
                        stack[sp] = (left, tl);
                        sp += 1;
                    }
                }
                (None, Some(tr)) => {
                    if sp < stack.len() {
                        stack[sp] = (right, tr);
                        sp += 1;
                    }
                }
                (None, None) => {}
            }
        }
    }

    if let Some(ref mut hit) = best_hit {
        hit.nodes_visited = nodes_visited;
        hit.triangles_tested = triangles_tested;
    }
    Ok(best_hit)
}

/// Christer Ericson(Real-Time Collision Detection §5.1.5) Voronoi 영역 분할 기반
/// 3D 점 `p`에서 삼각형 `(a, b, c)` 위의 정확 최근접점을 계산한다.
#[must_use]
pub fn closest_point_on_triangle_3d(
    p: [f32; 3],
    a: [f32; 3],
    b: [f32; 3],
    c: [f32; 3],
) -> [f32; 3] {
    let ab = v3_sub(b, a);
    let ac = v3_sub(c, a);
    let ap = v3_sub(p, a);

    let d1 = v3_dot(ab, ap);
    let d2 = v3_dot(ac, ap);
    if d1 <= 0.0 && d2 <= 0.0 {
        return a;
    }

    let bp = v3_sub(p, b);
    let d3 = v3_dot(ab, bp);
    let d4 = v3_dot(ac, bp);
    if d3 >= 0.0 && d4 <= d3 {
        return b;
    }

    let vc = d1 * d4 - d3 * d2;
    if vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0 {
        let denom = d1 - d3;
        let v = if denom.abs() > AXIS_ZERO_EPS {
            d1 / denom
        } else {
            0.0
        };
        return v3_add(a, v3_scale(ab, v));
    }

    let cp = v3_sub(p, c);
    let d5 = v3_dot(ab, cp);
    let d6 = v3_dot(ac, cp);
    if d6 >= 0.0 && d5 <= d6 {
        return c;
    }

    let vb = d5 * d2 - d1 * d6;
    if vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0 {
        let denom = d2 - d6;
        let w = if denom.abs() > AXIS_ZERO_EPS {
            d2 / denom
        } else {
            0.0
        };
        return v3_add(a, v3_scale(ac, w));
    }

    let va = d3 * d6 - d5 * d4;
    if va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0 {
        let denom = (d4 - d3) + (d5 - d6);
        let w = if denom.abs() > AXIS_ZERO_EPS {
            (d4 - d3) / denom
        } else {
            0.0
        };
        return v3_add(b, v3_scale(v3_sub(c, b), w));
    }

    let denom = va + vb + vc;
    if denom.abs() <= AXIS_ZERO_EPS {
        return a;
    }
    let inv = 1.0 / denom;
    let v = vb * inv;
    let w = vc * inv;
    v3_add(a, v3_add(v3_scale(ab, v), v3_scale(ac, w)))
}

/// SAH BVH에서 중심 `center`, 반경 `radius` 구체와 겹치는 모든 삼각형과 최단 접촉 삼각형을 조회한다.
pub fn query_sphere_sah_bvh_3d(
    bvh: &SahBvh3D,
    positions_xyz: &[f32],
    indices: &[u32],
    center: [f32; 3],
    radius: f32,
) -> Result<SphereQueryResult3D, DrawingCoreError> {
    if !all_finite3(center) {
        return Err(DrawingCoreError::InvalidParameter { name: "center" });
    }
    if !radius.is_finite() || radius < 0.0 {
        return Err(DrawingCoreError::InvalidParameter { name: "radius" });
    }

    let (_, tri_count) = validate_mesh_buffers(positions_xyz, indices)?;
    if bvh.nodes.is_empty() || tri_count == 0 {
        return Ok(SphereQueryResult3D {
            hits: Vec::new(),
            closest: None,
            nodes_visited: 0,
            triangles_tested: 0,
        });
    }
    if bvh.tri_count != tri_count {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: bvh.tri_count,
            actual: tri_count,
        });
    }

    let radius_sq = radius * radius;
    let mut hits = Vec::new();
    let mut nodes_visited = 0u32;
    let mut triangles_tested = 0u32;

    if bvh.nodes[0].aabb().distance_sq_to_point(center) > radius_sq {
        return Ok(SphereQueryResult3D {
            hits,
            closest: None,
            nodes_visited: 1,
            triangles_tested: 0,
        });
    }

    let mut stack = [0usize; BVH3D_MAX_DEPTH * 2];
    let mut sp = 1usize;
    stack[0] = 0;

    while sp > 0 {
        sp -= 1;
        let node_idx = stack[sp];
        nodes_visited = nodes_visited.saturating_add(1);
        let node = bvh.nodes[node_idx];

        if node.is_leaf() {
            let first = node.left_or_first as usize;
            let count = node.tri_count as usize;
            let end = first.saturating_add(count).min(bvh.prim_indices.len());
            for &tri_u32 in &bvh.prim_indices[first..end] {
                triangles_tested = triangles_tested.saturating_add(1);
                let (v0, v1, v2) = fetch_triangle(positions_xyz, indices, tri_u32 as usize);
                let cp = closest_point_on_triangle_3d(center, v0, v1, v2);
                let d2 = v3_len_sq(v3_sub(cp, center));
                if d2 <= radius_sq {
                    let normal = v3_normalize_or(
                        v3_cross(v3_sub(v1, v0), v3_sub(v2, v0)),
                        [0.0, 1.0, 0.0],
                    );
                    hits.push(SphereOverlapHit3D {
                        triangle_index: tri_u32,
                        distance: d2.sqrt(),
                        closest_point: cp,
                        normal,
                    });
                }
            }
        } else {
            let left = node.left_or_first as usize;
            let right = left + 1;
            if right >= bvh.nodes.len() {
                continue;
            }
            if bvh.nodes[right].aabb().distance_sq_to_point(center) <= radius_sq
                && sp < stack.len()
            {
                stack[sp] = right;
                sp += 1;
            }
            if bvh.nodes[left].aabb().distance_sq_to_point(center) <= radius_sq
                && sp < stack.len()
            {
                stack[sp] = left;
                sp += 1;
            }
        }
    }

    hits.sort_by(|a, b| {
        a.distance
            .total_cmp(&b.distance)
            .then_with(|| a.triangle_index.cmp(&b.triangle_index))
    });
    let closest = hits.first().copied();

    Ok(SphereQueryResult3D {
        hits,
        closest,
        nodes_visited,
        triangles_tested,
    })
}
