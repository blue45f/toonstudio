//! 순수 Rust SIMD128 친화 3D·VRM 스키닝 · Morton BVH · LT 선화 추출 커널.
//!
//! 1. SoA 4-본 VRM 스키닝 (`skin_vrm_mesh_4bone_soa`): 4-와이드 고정 레인 루프 기반 LLVM 자동 벡터화
//!    (WASM SIMD128 → x86 AVX2/AVX-512 · ARM NEON/SVE2 하강), 가중치 정규화·법선 재정규화·NaN/OOB 방어.
//! 2. Morton Z-Order Curve 및 2D 고속 BVH (`encode_morton_2d_u32`, `encode_morton_3d_u32`,
//!    `build_morton_bvh_2d`, `query_morton_bvh_aabb`): 4-패스 기수 정렬 + Karras 접두 분할 트리.
//! 3. 3D G-Buffer(법선·깊이) → 2D 웹툰 LT(Line & Tone) 잉크 선화 추출 (`extract_lt_lineart_from_gbuffer`):
//!    3행 링 버퍼 기반 4-와이드 3×3 Sobel 깊이 불연속 + 법선 내적 엣지 검출.

use crate::{checked_pixel_count, DrawingCoreError};

/// 4×4 열 우선(column-major, glTF/VRM 표준) 항등 행렬.
pub const IDENTITY_MAT4: [f32; 16] = [
    1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
];

/// 리프 노드당 최대 프리미티브 수 (4-와이드 SIMD 교차 판정에 맞춘 크기).
pub const MORTON_BVH_LEAF_CAPACITY: usize = 4;

const WEIGHT_SUM_EPS: f32 = 1e-6;
const NORMAL_LEN_SQ_EPS: f32 = 1e-12;
const DEFAULT_NORMAL: [f32; 3] = [0.0, 0.0, 1.0];
const IDENTITY_AFFINE_3X4: [f32; 12] = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0];

// ============================================================================
// 1. SoA 4-본 VRM 스키닝 커널
// ============================================================================

/// SoA(Structure of Arrays) 배치 4-본 VRM 메쉬 스키닝 입력 뷰.
#[derive(Debug, Clone, Copy)]
pub struct VrmMeshSoaInput<'a> {
    pub pos_x: &'a [f32],
    pub pos_y: &'a [f32],
    pub pos_z: &'a [f32],
    pub norm_x: &'a [f32],
    pub norm_y: &'a [f32],
    pub norm_z: &'a [f32],
    pub joints: [&'a [u16]; 4],
    pub weights: [&'a [f32]; 4],
}

/// SoA 배치 4-본 VRM 메쉬 스키닝 출력 뷰.
#[derive(Debug)]
pub struct VrmMeshSoaOutput<'a> {
    pub pos_x: &'a mut [f32],
    pub pos_y: &'a mut [f32],
    pub pos_z: &'a mut [f32],
    pub norm_x: &'a mut [f32],
    pub norm_y: &'a mut [f32],
    pub norm_z: &'a mut [f32],
}

/// VRM 4-본 스키닝 실행 통계.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SkinningStats {
    pub skinned_vertices: usize,
    pub clamped_oob_joints: usize,
    pub sanitized_nan_vertices: usize,
    pub zero_weight_fallbacks: usize,
}

#[inline]
fn validate_slice_len(expected: usize, actual: usize) -> Result<(), DrawingCoreError> {
    if actual != expected { Err(DrawingCoreError::BufferLengthMismatch { expected, actual }) } else { Ok(()) }
}

#[inline]
fn sanitize_weight(w: f32, had_non_finite: &mut bool) -> f32 {
    if !w.is_finite() { *had_non_finite = true; 0.0 } else { w.max(0.0) }
}

#[inline]
fn normalize_normal_xyz(nx: f32, ny: f32, nz: f32) -> [f32; 3] {
    let len_sq = nx * nx + ny * ny + nz * nz;
    if len_sq.is_finite() && len_sq > NORMAL_LEN_SQ_EPS {
        let inv = 1.0 / len_sq.sqrt();
        [nx * inv, ny * inv, nz * inv]
    } else {
        DEFAULT_NORMAL
    }
}

/// 4개 정점 레인(`0..4`)을 고정 길이 `[f32; 4]` 배열로 처리해 WASM SIMD128(`f32x4`) 자동 벡터화를 유도한다.
#[inline]
fn skin_4wide_lanes(
    pos: &[[f32; 4]; 3],
    nrm: &[[f32; 4]; 3],
    bm: &[[f32; 4]; 12],
) -> ([[f32; 4]; 3], [[f32; 4]; 3]) {
    let mut out_p = [[0.0_f32; 4]; 3];
    let mut out_n = [[0.0_f32; 4]; 3];
    for l in 0..4 {
        let (px, py, pz) = (pos[0][l], pos[1][l], pos[2][l]);
        let (nx, ny, nz) = (nrm[0][l], nrm[1][l], nrm[2][l]);
        out_p[0][l] = bm[0][l] * px + bm[3][l] * py + bm[6][l] * pz + bm[9][l];
        out_p[1][l] = bm[1][l] * px + bm[4][l] * py + bm[7][l] * pz + bm[10][l];
        out_p[2][l] = bm[2][l] * px + bm[5][l] * py + bm[8][l] * pz + bm[11][l];
        let rnx = bm[0][l] * nx + bm[3][l] * ny + bm[6][l] * nz;
        let rny = bm[1][l] * nx + bm[4][l] * ny + bm[7][l] * nz;
        let rnz = bm[2][l] * nx + bm[5][l] * ny + bm[8][l] * nz;
        let len_sq = rnx * rnx + rny * rny + rnz * rnz;
        let inv = if len_sq > NORMAL_LEN_SQ_EPS { 1.0 / len_sq.sqrt() } else { 0.0 };
        out_n[0][l] = rnx * inv;
        out_n[1][l] = rny * inv;
        out_n[2][l] = if inv > 0.0 { rnz * inv } else { 1.0 };
    }
    (out_p, out_n)
}

#[inline]
fn prepare_vertex_lane(
    i: usize,
    input: &VrmMeshSoaInput<'_>,
    bone_matrices: &[[f32; 16]],
    bone_finite: &[bool],
    stats: &mut SkinningStats,
) -> ([f32; 3], [f32; 3], [f32; 12]) {
    let mut bad = false;
    let mut f_or = |v: f32, fb: f32| if v.is_finite() { v } else { bad = true; fb };
    let p = [f_or(input.pos_x[i], 0.0), f_or(input.pos_y[i], 0.0), f_or(input.pos_z[i], 0.0)];
    let nrm = if input.norm_x[i].is_finite() && input.norm_y[i].is_finite() && input.norm_z[i].is_finite() {
        [input.norm_x[i], input.norm_y[i], input.norm_z[i]]
    } else {
        bad = true;
        DEFAULT_NORMAL
    };
    let mut w = [
        sanitize_weight(input.weights[0][i], &mut bad),
        sanitize_weight(input.weights[1][i], &mut bad),
        sanitize_weight(input.weights[2][i], &mut bad),
        sanitize_weight(input.weights[3][i], &mut bad),
    ];
    if bad { stats.sanitized_nan_vertices += 1; }

    let w_sum = w[0] + w[1] + w[2] + w[3];
    if w_sum <= WEIGHT_SUM_EPS || !w_sum.is_finite() {
        stats.zero_weight_fallbacks += 1;
        return (p, nrm, IDENTITY_AFFINE_3X4);
    }
    let inv_w = 1.0 / w_sum;
    for wk in &mut w { *wk *= inv_w; }

    let mut blended = [0.0_f32; 12];
    for (k, &wk) in w.iter().enumerate() {
        if wk <= 0.0 { continue; }
        let j = usize::from(input.joints[k][i]);
        let m = if j < bone_matrices.len() {
            if bone_finite[j] { &bone_matrices[j] } else { &IDENTITY_MAT4 }
        } else {
            stats.clamped_oob_joints += 1;
            &IDENTITY_MAT4
        };
        for col in 0..4 {
            let (src, dst) = (col * 4, col * 3);
            blended[dst] += wk * m[src];
            blended[dst + 1] += wk * m[src + 1];
            blended[dst + 2] += wk * m[src + 2];
        }
    }
    (p, nrm, blended)
}

/// SoA 배치 4-본 VRM 선형 블렌드 스키닝(LBS) 커널.
///
/// `bone_matrices`는 glTF/VRM 표준 열 우선 4×4 행렬(`[f32; 16]`) 배열이며,
/// 가중치 정규화·법선 재정규화·OOB 본 인덱스 및 비유한(NaN/Inf) 방어를 panic 없이 수행한다.
pub fn skin_vrm_mesh_4bone_soa(
    input: &VrmMeshSoaInput<'_>,
    bone_matrices: &[[f32; 16]],
    output: &mut VrmMeshSoaOutput<'_>,
) -> Result<SkinningStats, DrawingCoreError> {
    if bone_matrices.is_empty() {
        return Err(DrawingCoreError::InvalidParameter { name: "bone_matrices" });
    }
    let n = input.pos_x.len();
    for s in [
        input.pos_y, input.pos_z, input.norm_x, input.norm_y, input.norm_z,
        input.weights[0], input.weights[1], input.weights[2], input.weights[3],
        output.pos_x, output.pos_y, output.pos_z, output.norm_x, output.norm_y, output.norm_z,
    ] {
        validate_slice_len(n, s.len())?;
    }
    for j in input.joints { validate_slice_len(n, j.len())?; }

    let mut stats = SkinningStats { skinned_vertices: n, ..SkinningStats::default() };
    if n == 0 { return Ok(stats); }

    let bone_finite: Vec<bool> = bone_matrices.iter().map(|m| m.iter().all(|v| v.is_finite())).collect();
    let mut base = 0usize;
    while base < n {
        let count = (n - base).min(4);
        let (mut pos_blk, mut nrm_blk) = ([[0.0_f32; 4]; 3], [[0.0_f32; 4]; 3]);
        let mut bm = [[0.0_f32; 4]; 12];
        for l in 0..count {
            let (p, nrm, mat) = prepare_vertex_lane(base + l, input, bone_matrices, &bone_finite, &mut stats);
            for a in 0..3 { pos_blk[a][l] = p[a]; nrm_blk[a][l] = nrm[a]; }
            for r in 0..12 { bm[r][l] = mat[r]; }
        }
        for l in count..4 {
            nrm_blk[2][l] = 1.0;
            for r in 0..12 { bm[r][l] = IDENTITY_AFFINE_3X4[r]; }
        }
        let (out_p, out_n) = skin_4wide_lanes(&pos_blk, &nrm_blk, &bm);
        output.pos_x[base..base + count].copy_from_slice(&out_p[0][..count]);
        output.pos_y[base..base + count].copy_from_slice(&out_p[1][..count]);
        output.pos_z[base..base + count].copy_from_slice(&out_p[2][..count]);
        output.norm_x[base..base + count].copy_from_slice(&out_n[0][..count]);
        output.norm_y[base..base + count].copy_from_slice(&out_n[1][..count]);
        output.norm_z[base..base + count].copy_from_slice(&out_n[2][..count]);
        base += count;
    }
    Ok(stats)
}

// ============================================================================
// 2. Morton Z-Order Curve 및 2D 고속 BVH 구축/쿼리 커널
// ============================================================================

#[inline]
const fn spread_bits_2d(v: u16) -> u32 {
    let mut x = v as u32;
    x = (x | (x << 8)) & 0x00FF_00FF;
    x = (x | (x << 4)) & 0x0F0F_0F0F;
    x = (x | (x << 2)) & 0x3333_3333;
    (x | (x << 1)) & 0x5555_5555
}

#[inline]
const fn spread_bits_3d(v: u16) -> u32 {
    let mut x = if v > 1023 { 1023 } else { v as u32 };
    x = (x | (x << 16)) & 0x0300_00FF;
    x = (x | (x << 8)) & 0x0300_F00F;
    x = (x | (x << 4)) & 0x030C_30C3;
    (x | (x << 2)) & 0x0924_9249
}

/// 16비트 2D 정수 좌표 `(x, y)`를 32비트 Morton Z-Order 코드로 비트 인터리빙한다.
#[inline]
#[must_use]
pub const fn encode_morton_2d_u32(x: u16, y: u16) -> u32 {
    spread_bits_2d(x) | (spread_bits_2d(y) << 1)
}

/// 10비트(`0..=1023`, 초과분 포화 클램프) 3D 정수 좌표 `(x, y, z)`를 30비트 Morton 코드로 인터리빙한다.
#[inline]
#[must_use]
pub const fn encode_morton_3d_u32(x: u16, y: u16, z: u16) -> u32 {
    spread_bits_3d(x) | (spread_bits_3d(y) << 1) | (spread_bits_3d(z) << 2)
}

/// 2D 축 정렬 경계 상자(AABB).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Aabb2D {
    pub min_x: f32,
    pub min_y: f32,
    pub max_x: f32,
    pub max_y: f32,
}

impl Aabb2D {
    #[inline] #[must_use]
    pub const fn new(min_x: f32, min_y: f32, max_x: f32, max_y: f32) -> Self { Self { min_x, min_y, max_x, max_y } }
    #[inline] #[must_use]
    pub fn is_valid(&self) -> bool {
        self.min_x.is_finite() && self.min_y.is_finite() && self.max_x.is_finite() && self.max_y.is_finite()
            && self.min_x <= self.max_x && self.min_y <= self.max_y
    }
    #[inline] #[must_use]
    pub fn union(self, o: Self) -> Self {
        Self { min_x: self.min_x.min(o.min_x), min_y: self.min_y.min(o.min_y), max_x: self.max_x.max(o.max_x), max_y: self.max_y.max(o.max_y) }
    }
    #[inline] #[must_use]
    pub fn intersects(&self, o: &Self) -> bool {
        self.min_x <= o.max_x && self.max_x >= o.min_x && self.min_y <= o.max_y && self.max_y >= o.min_y
    }
    #[inline] #[must_use]
    pub fn center(&self) -> [f32; 2] { [0.5 * (self.min_x + self.max_x), 0.5 * (self.min_y + self.max_y)] }
}

/// 평탄화 Morton BVH 트리 노드 (전위 순회 배치).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MortonBvhNode2D {
    pub bounds: Aabb2D,
    pub left_or_first: u32,
    pub right_child: u32,
    pub primitive_count: u32,
}

/// Morton Z-Order 기수 정렬 기반 2D 고속 BVH 구조체.
#[derive(Debug, Clone, PartialEq)]
pub struct MortonBvh2D {
    pub nodes: Vec<MortonBvhNode2D>,
    pub ordered_indices: Vec<u32>,
    pub morton_codes: Vec<u32>,
    pub leaf_bounds: Vec<Aabb2D>,
    pub scene_bounds: Option<Aabb2D>,
}

impl MortonBvh2D {
    #[inline] #[must_use] pub fn is_empty(&self) -> bool { self.ordered_indices.is_empty() }
    #[inline] #[must_use] pub fn primitive_count(&self) -> usize { self.ordered_indices.len() }
}

/// 4-패스 8비트 LSD 기수 정렬로 `(morton_code, orig_index)` 쌍을 O(N) 안정 정렬한다.
fn radix_sort_morton_pairs(pairs: &mut Vec<(u32, u32)>) {
    let n = pairs.len();
    if n <= 1 { return; }
    let mut scratch = vec![(0u32, 0u32); n];
    for shift in (0..32).step_by(8) {
        let mut counts = [0usize; 256];
        for &(code, _) in pairs.iter() { counts[((code >> shift) & 0xFF) as usize] += 1; }
        let mut offset = 0usize;
        for c in &mut counts { let cnt = *c; *c = offset; offset += cnt; }
        for &pair in pairs.iter() {
            let b = ((pair.0 >> shift) & 0xFF) as usize;
            scratch[counts[b]] = pair;
            counts[b] += 1;
        }
        std::mem::swap(pairs, &mut scratch);
    }
}

fn find_morton_split(codes: &[u32], start: usize, end: usize) -> usize {
    let (first_code, last_code) = (codes[start], codes[end - 1]);
    if first_code == last_code { return start + (end - start) / 2; }
    let prefix = (first_code ^ last_code).leading_zeros();
    let rel = codes[start..end].partition_point(|&c| (first_code ^ c).leading_zeros() > prefix);
    (start + rel).clamp(start + 1, end - 1)
}

fn build_node_recursive(
    nodes: &mut Vec<MortonBvhNode2D>,
    codes: &[u32],
    leaf_bounds: &[Aabb2D],
    start: usize,
    end: usize,
) -> usize {
    let node_idx = nodes.len();
    let count = end - start;
    if count <= MORTON_BVH_LEAF_CAPACITY {
        let bounds = leaf_bounds[start + 1..end].iter().fold(leaf_bounds[start], |a, b| a.union(*b));
        nodes.push(MortonBvhNode2D {
            bounds, left_or_first: start as u32, right_child: 0, primitive_count: count as u32,
        });
        return node_idx;
    }
    nodes.push(MortonBvhNode2D {
        bounds: leaf_bounds[start], left_or_first: 0, right_child: 0, primitive_count: 0,
    });
    let mid = find_morton_split(codes, start, end);
    let left_idx = build_node_recursive(nodes, codes, leaf_bounds, start, mid);
    let right_idx = build_node_recursive(nodes, codes, leaf_bounds, mid, end);
    nodes[node_idx] = MortonBvhNode2D {
        bounds: nodes[left_idx].bounds.union(nodes[right_idx].bounds),
        left_or_first: left_idx as u32,
        right_child: right_idx as u32,
        primitive_count: 0,
    };
    node_idx
}

/// Morton Z-Order 코드 기수 정렬을 이용해 2D AABB 목록으로부터 공간 지역성 BVH를 구축한다.
pub fn build_morton_bvh_2d(aabbs: &[Aabb2D]) -> Result<MortonBvh2D, DrawingCoreError> {
    if aabbs.is_empty() {
        return Ok(MortonBvh2D {
            nodes: Vec::new(), ordered_indices: Vec::new(), morton_codes: Vec::new(),
            leaf_bounds: Vec::new(), scene_bounds: None,
        });
    }
    if aabbs.len() > u32::MAX as usize || !aabbs[0].is_valid() {
        return Err(DrawingCoreError::InvalidParameter { name: "aabbs" });
    }
    let mut scene = aabbs[0];
    let fc = scene.center();
    let (mut cmin_x, mut cmin_y, mut cmax_x, mut cmax_y) = (fc[0], fc[1], fc[0], fc[1]);
    for b in &aabbs[1..] {
        if !b.is_valid() { return Err(DrawingCoreError::InvalidParameter { name: "aabbs" }); }
        scene = scene.union(*b);
        let c = b.center();
        cmin_x = cmin_x.min(c[0]); cmin_y = cmin_y.min(c[1]);
        cmax_x = cmax_x.max(c[0]); cmax_y = cmax_y.max(c[1]);
    }
    let inv_x = if cmax_x - cmin_x > 1e-12 { 65_535.0 / (cmax_x - cmin_x) } else { 0.0 };
    let inv_y = if cmax_y - cmin_y > 1e-12 { 65_535.0 / (cmax_y - cmin_y) } else { 0.0 };

    let mut pairs = Vec::with_capacity(aabbs.len());
    for (idx, b) in aabbs.iter().enumerate() {
        let c = b.center();
        let qx = ((c[0] - cmin_x) * inv_x).clamp(0.0, 65_535.0).round() as u16;
        let qy = ((c[1] - cmin_y) * inv_y).clamp(0.0, 65_535.0).round() as u16;
        pairs.push((encode_morton_2d_u32(qx, qy), idx as u32));
    }
    radix_sort_morton_pairs(&mut pairs);

    let (mut morton_codes, mut ordered_indices, mut leaf_bounds) =
        (Vec::with_capacity(aabbs.len()), Vec::with_capacity(aabbs.len()), Vec::with_capacity(aabbs.len()));
    for (code, orig_idx) in pairs {
        morton_codes.push(code);
        ordered_indices.push(orig_idx);
        leaf_bounds.push(aabbs[orig_idx as usize]);
    }
    let mut nodes = Vec::with_capacity(aabbs.len().saturating_mul(2));
    build_node_recursive(&mut nodes, &morton_codes, &leaf_bounds, 0, aabbs.len());
    Ok(MortonBvh2D { nodes, ordered_indices, morton_codes, leaf_bounds, scene_bounds: Some(scene) })
}

/// Morton BVH에서 질의 AABB와 교차하는 모든 원본 프리미티브 인덱스를 반환한다.
pub fn query_morton_bvh_aabb(bvh: &MortonBvh2D, query: Aabb2D) -> Result<Vec<u32>, DrawingCoreError> {
    if !query.is_valid() { return Err(DrawingCoreError::InvalidParameter { name: "query" }); }
    if bvh.nodes.is_empty() || !bvh.nodes[0].bounds.intersects(&query) { return Ok(Vec::new()); }
    let mut hits = Vec::new();
    let mut stack = Vec::with_capacity(64);
    stack.push(0usize);
    while let Some(node_idx) = stack.pop() {
        let node = bvh.nodes[node_idx];
        if !node.bounds.intersects(&query) { continue; }
        if node.primitive_count > 0 {
            let (start, count) = (node.left_or_first as usize, node.primitive_count as usize);
            if count == 4 {
                let b = &bvh.leaf_bounds[start..start + 4];
                let mask = [
                    b[0].intersects(&query), b[1].intersects(&query),
                    b[2].intersects(&query), b[3].intersects(&query),
                ];
                for (lane, &hit) in mask.iter().enumerate() {
                    if hit { hits.push(bvh.ordered_indices[start + lane]); }
                }
            } else {
                for i in start..start + count {
                    if bvh.leaf_bounds[i].intersects(&query) { hits.push(bvh.ordered_indices[i]); }
                }
            }
        } else {
            let (left, right) = (node.left_or_first as usize, node.right_child as usize);
            if right < bvh.nodes.len() && bvh.nodes[right].bounds.intersects(&query) { stack.push(right); }
            if left < bvh.nodes.len() && bvh.nodes[left].bounds.intersects(&query) { stack.push(left); }
        }
    }
    Ok(hits)
}

// ============================================================================
// 3. 3D G-Buffer(법선·깊이) → 2D 웹툰 LT(Line & Tone) 선화 추출 커널
// ============================================================================

/// 3D G-Buffer → 웹툰 LT 잉크 선화 추출 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LtLineArtConfig {
    pub depth_threshold: f32,
    pub normal_edge_threshold: f32,
    pub depth_weight: f32,
    pub normal_weight: f32,
    pub edge_softness: f32,
    pub min_ink_alpha: u8,
}

impl Default for LtLineArtConfig {
    fn default() -> Self {
        Self {
            depth_threshold: 0.15, normal_edge_threshold: 0.25,
            depth_weight: 1.0, normal_weight: 1.0, edge_softness: 0.15, min_ink_alpha: 0,
        }
    }
}

/// LT 선화 추출 실행 통계.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct LtLineArtStats {
    pub total_pixels: usize,
    pub ink_pixels: usize,
    pub depth_edge_pixels: usize,
    pub normal_edge_pixels: usize,
    pub sanitized_nan_pixels: usize,
}

impl LtLineArtStats {
    #[inline]
    fn record(&mut self, alpha: u8, depth_edge: bool, normal_edge: bool) {
        self.ink_pixels += usize::from(alpha > 0);
        self.depth_edge_pixels += usize::from(depth_edge);
        self.normal_edge_pixels += usize::from(normal_edge);
    }
}

struct SanitizedRow { nx: Vec<f32>, ny: Vec<f32>, nz: Vec<f32>, d: Vec<f32> }

impl SanitizedRow {
    fn new(w: usize) -> Self {
        Self { nx: vec![0.0; w], ny: vec![0.0; w], nz: vec![1.0; w], d: vec![0.0; w] }
    }

    fn fill(&mut self, y: usize, w: usize, nx: &[f32], ny: &[f32], nz: &[f32], depth: &[f32]) -> usize {
        let off = y * w;
        let mut sanitized = 0usize;
        for x in 0..w {
            let i = off + x;
            let mut bad = false;
            let d = if depth[i].is_finite() { depth[i] } else { bad = true; 0.0 };
            let (rx, ry, rz) = if nx[i].is_finite() && ny[i].is_finite() && nz[i].is_finite() {
                (nx[i], ny[i], nz[i])
            } else {
                bad = true;
                (DEFAULT_NORMAL[0], DEFAULT_NORMAL[1], DEFAULT_NORMAL[2])
            };
            if bad { sanitized += 1; }
            let u = normalize_normal_xyz(rx, ry, rz);
            self.nx[x] = u[0]; self.ny[x] = u[1]; self.nz[x] = u[2]; self.d[x] = d;
        }
        sanitized
    }
}

#[inline]
fn lt_smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    if x <= edge0 { return 0.0; }
    let span = edge1 - edge0;
    if span <= 1e-6 { return 1.0; }
    let t = ((x - edge0) / span).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

#[inline]
fn lt_alpha_from_metrics(depth_grad: f32, normal_diff: f32, cfg: &LtLineArtConfig) -> (u8, bool, bool) {
    let dr = lt_smoothstep(cfg.depth_threshold, cfg.depth_threshold + cfg.edge_softness, depth_grad);
    let nr = lt_smoothstep(cfg.normal_edge_threshold, cfg.normal_edge_threshold + cfg.edge_softness, normal_diff);
    let combined = (dr * cfg.depth_weight).max(nr * cfg.normal_weight).clamp(0.0, 1.0);
    let raw = (combined * 255.0).round() as u8;
    (if raw < cfg.min_ink_alpha { 0 } else { raw }, dr > 0.0, nr > 0.0)
}

#[inline]
fn eval_lt_stencil(top: &SanitizedRow, mid: &SanitizedRow, bot: &SanitizedRow, xm: usize, x: usize, xp: usize) -> (f32, f32) {
    let gx = (-top.d[xm] + top.d[xp]) + 2.0 * (-mid.d[xm] + mid.d[xp]) + (-bot.d[xm] + bot.d[xp]);
    let gy = (-top.d[xm] - 2.0 * top.d[x] - top.d[xp]) + (bot.d[xm] + 2.0 * bot.d[x] + bot.d[xp]);
    let depth_grad = (gx * gx + gy * gy).sqrt() * 0.25;
    let (cx, cy, cz) = (mid.nx[x], mid.ny[x], mid.nz[x]);
    let dl = (cx * mid.nx[xm] + cy * mid.ny[xm] + cz * mid.nz[xm]).clamp(-1.0, 1.0);
    let dr = (cx * mid.nx[xp] + cy * mid.ny[xp] + cz * mid.nz[xp]).clamp(-1.0, 1.0);
    let du = (cx * top.nx[x] + cy * top.ny[x] + cz * top.nz[x]).clamp(-1.0, 1.0);
    let dd = (cx * bot.nx[x] + cy * bot.ny[x] + cz * bot.nz[x]).clamp(-1.0, 1.0);
    (depth_grad, (1.0 - dl).max(1.0 - dr).max(1.0 - du).max(1.0 - dd))
}

/// 3D G-Buffer(SoA 법선·깊이)에서 3×3 Sobel 깊이 불연속과 법선 내적 엣지를 결합해
/// 2D 웹툰 잉크 선화 알파 마스크(`0..=255`)를 생성한다.
#[allow(clippy::too_many_arguments)]
pub fn extract_lt_lineart_from_gbuffer(
    normal_x: &[f32],
    normal_y: &[f32],
    normal_z: &[f32],
    depth: &[f32],
    width: u32,
    height: u32,
    config: &LtLineArtConfig,
    out_alpha_mask: &mut [u8],
) -> Result<LtLineArtStats, DrawingCoreError> {
    let pixel_count = checked_pixel_count(width, height)?;
    for s in [normal_x, normal_y, normal_z, depth] { validate_slice_len(pixel_count, s.len())?; }
    validate_slice_len(pixel_count, out_alpha_mask.len())?;
    if !config.depth_threshold.is_finite() || config.depth_threshold < 0.0
        || !config.normal_edge_threshold.is_finite() || !(0.0..=2.0).contains(&config.normal_edge_threshold)
        || !config.depth_weight.is_finite() || config.depth_weight < 0.0
        || !config.normal_weight.is_finite() || config.normal_weight < 0.0
        || !config.edge_softness.is_finite() || config.edge_softness < 0.0
    {
        return Err(DrawingCoreError::InvalidParameter { name: "config" });
    }

    let (w, h) = (width as usize, height as usize);
    let mut stats = LtLineArtStats { total_pixels: pixel_count, ..LtLineArtStats::default() };
    let mut ring = [SanitizedRow::new(w), SanitizedRow::new(w), SanitizedRow::new(w)];
    stats.sanitized_nan_pixels += ring[0].fill(0, w, normal_x, normal_y, normal_z, depth);
    if h > 1 {
        stats.sanitized_nan_pixels += ring[1].fill(1, w, normal_x, normal_y, normal_z, depth);
    }

    for y in 0..h {
        if y + 1 < h && y >= 1 {
            stats.sanitized_nan_pixels += ring[(y + 1) % 3].fill(y + 1, w, normal_x, normal_y, normal_z, depth);
        }
        let (top, mid, bot) = (&ring[y.saturating_sub(1) % 3], &ring[y % 3], &ring[(y + 1).min(h - 1) % 3]);
        let out_row = &mut out_alpha_mask[y * w..(y + 1) * w];
        let mut x = 0usize;

        if w >= 6 {
            let (dg0, nd0) = eval_lt_stencil(top, mid, bot, 0, 0, 1);
            let (a0, de0, ne0) = lt_alpha_from_metrics(dg0, nd0, config);
            out_row[0] = a0;
            stats.record(a0, de0, ne0);
            x = 1;
            while x + 4 < w {
                let (mut dg, mut nd) = ([0.0_f32; 4], [0.0_f32; 4]);
                for l in 0..4 { (dg[l], nd[l]) = eval_lt_stencil(top, mid, bot, x + l - 1, x + l, x + l + 1); }
                let mut alphas = [0u8; 4];
                for l in 0..4 {
                    let (a, de, ne) = lt_alpha_from_metrics(dg[l], nd[l], config);
                    alphas[l] = a;
                    stats.record(a, de, ne);
                }
                out_row[x..x + 4].copy_from_slice(&alphas);
                x += 4;
            }
        }
        while x < w {
            let (dg, nd) = eval_lt_stencil(top, mid, bot, x.saturating_sub(1), x, (x + 1).min(w - 1));
            let (a, de, ne) = lt_alpha_from_metrics(dg, nd, config);
            out_row[x] = a;
            stats.record(a, de, ne);
            x += 1;
        }
    }
    Ok(stats)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn internal_radix_sort_and_karras_split_invariants_hold() {
        let mut pairs = vec![(900, 0), (12, 1), (900, 2), (0xDEAD_BEEF, 3), (12, 4)];
        radix_sort_morton_pairs(&mut pairs);
        assert_eq!(pairs, vec![(12, 1), (12, 4), (900, 0), (900, 2), (0xDEAD_BEEF, 3)]);
        assert_eq!(find_morton_split(&[42u32; 8], 0, 8), 4);
        assert_eq!(find_morton_split(&[0, 0, 0, 1, 1, 1], 0, 6), 3);
    }
}
