use crate::DrawingCoreError;

/// 리프 노드당 최대 프리미티브 수 (4-와이드 SIMD 교차 판정에 맞춘 크기).
pub const MORTON_BVH_LEAF_CAPACITY: usize = 4;

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
    #[inline]
    #[must_use]
    pub const fn new(min_x: f32, min_y: f32, max_x: f32, max_y: f32) -> Self {
        Self {
            min_x,
            min_y,
            max_x,
            max_y,
        }
    }
    #[inline]
    #[must_use]
    pub fn is_valid(&self) -> bool {
        self.min_x.is_finite()
            && self.min_y.is_finite()
            && self.max_x.is_finite()
            && self.max_y.is_finite()
            && self.min_x <= self.max_x
            && self.min_y <= self.max_y
    }
    #[inline]
    #[must_use]
    pub fn union(self, o: Self) -> Self {
        Self {
            min_x: self.min_x.min(o.min_x),
            min_y: self.min_y.min(o.min_y),
            max_x: self.max_x.max(o.max_x),
            max_y: self.max_y.max(o.max_y),
        }
    }
    #[inline]
    #[must_use]
    pub fn intersects(&self, o: &Self) -> bool {
        self.min_x <= o.max_x
            && self.max_x >= o.min_x
            && self.min_y <= o.max_y
            && self.max_y >= o.min_y
    }
    #[inline]
    #[must_use]
    pub fn center(&self) -> [f32; 2] {
        [
            0.5 * (self.min_x + self.max_x),
            0.5 * (self.min_y + self.max_y),
        ]
    }
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
    #[inline]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.ordered_indices.is_empty()
    }
    #[inline]
    #[must_use]
    pub fn primitive_count(&self) -> usize {
        self.ordered_indices.len()
    }
}

/// 4-패스 8비트 LSD 기수 정렬로 `(morton_code, orig_index)` 쌍을 O(N) 안정 정렬한다.
fn radix_sort_morton_pairs(pairs: &mut Vec<(u32, u32)>) {
    let n = pairs.len();
    if n <= 1 {
        return;
    }
    let mut scratch = vec![(0u32, 0u32); n];
    for shift in (0..32).step_by(8) {
        let mut counts = [0usize; 256];
        for &(code, _) in pairs.iter() {
            counts[((code >> shift) & 0xFF) as usize] += 1;
        }
        let mut offset = 0usize;
        for c in &mut counts {
            let cnt = *c;
            *c = offset;
            offset += cnt;
        }
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
    if first_code == last_code {
        return start + (end - start) / 2;
    }
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
        let bounds = leaf_bounds[start + 1..end]
            .iter()
            .fold(leaf_bounds[start], |a, b| a.union(*b));
        nodes.push(MortonBvhNode2D {
            bounds,
            left_or_first: start as u32,
            right_child: 0,
            primitive_count: count as u32,
        });
        return node_idx;
    }
    nodes.push(MortonBvhNode2D {
        bounds: leaf_bounds[start],
        left_or_first: 0,
        right_child: 0,
        primitive_count: 0,
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
            nodes: Vec::new(),
            ordered_indices: Vec::new(),
            morton_codes: Vec::new(),
            leaf_bounds: Vec::new(),
            scene_bounds: None,
        });
    }
    if aabbs.len() > u32::MAX as usize || !aabbs[0].is_valid() {
        return Err(DrawingCoreError::InvalidParameter { name: "aabbs" });
    }
    let mut scene = aabbs[0];
    let fc = scene.center();
    let (mut cmin_x, mut cmin_y, mut cmax_x, mut cmax_y) = (fc[0], fc[1], fc[0], fc[1]);
    for b in &aabbs[1..] {
        if !b.is_valid() {
            return Err(DrawingCoreError::InvalidParameter { name: "aabbs" });
        }
        scene = scene.union(*b);
        let c = b.center();
        cmin_x = cmin_x.min(c[0]);
        cmin_y = cmin_y.min(c[1]);
        cmax_x = cmax_x.max(c[0]);
        cmax_y = cmax_y.max(c[1]);
    }
    let inv_x = if cmax_x - cmin_x > 1e-12 {
        65_535.0 / (cmax_x - cmin_x)
    } else {
        0.0
    };
    let inv_y = if cmax_y - cmin_y > 1e-12 {
        65_535.0 / (cmax_y - cmin_y)
    } else {
        0.0
    };

    let mut pairs = Vec::with_capacity(aabbs.len());
    for (idx, b) in aabbs.iter().enumerate() {
        let c = b.center();
        let qx = ((c[0] - cmin_x) * inv_x).clamp(0.0, 65_535.0).round() as u16;
        let qy = ((c[1] - cmin_y) * inv_y).clamp(0.0, 65_535.0).round() as u16;
        pairs.push((encode_morton_2d_u32(qx, qy), idx as u32));
    }
    radix_sort_morton_pairs(&mut pairs);

    let (mut morton_codes, mut ordered_indices, mut leaf_bounds) = (
        Vec::with_capacity(aabbs.len()),
        Vec::with_capacity(aabbs.len()),
        Vec::with_capacity(aabbs.len()),
    );
    for (code, orig_idx) in pairs {
        morton_codes.push(code);
        ordered_indices.push(orig_idx);
        leaf_bounds.push(aabbs[orig_idx as usize]);
    }
    let mut nodes = Vec::with_capacity(aabbs.len().saturating_mul(2));
    build_node_recursive(&mut nodes, &morton_codes, &leaf_bounds, 0, aabbs.len());
    Ok(MortonBvh2D {
        nodes,
        ordered_indices,
        morton_codes,
        leaf_bounds,
        scene_bounds: Some(scene),
    })
}

/// Morton BVH에서 질의 AABB와 교차하는 모든 원본 프리미티브 인덱스를 반환한다.
pub fn query_morton_bvh_aabb(
    bvh: &MortonBvh2D,
    query: Aabb2D,
) -> Result<Vec<u32>, DrawingCoreError> {
    if !query.is_valid() {
        return Err(DrawingCoreError::InvalidParameter { name: "query" });
    }
    let invalid = || DrawingCoreError::InvalidParameter { name: "bvh" };
    let count = bvh.ordered_indices.len();
    if count == 0 {
        if !bvh.nodes.is_empty()
            || !bvh.leaf_bounds.is_empty()
            || !bvh.morton_codes.is_empty()
            || bvh.scene_bounds.is_some()
        {
            return Err(invalid());
        }
        return Ok(Vec::new());
    }
    if bvh.nodes.is_empty()
        || !bvh.nodes[0].bounds.is_valid()
        || bvh.leaf_bounds.len() != count
        || bvh.morton_codes.len() != count
        || !bvh.scene_bounds.is_some_and(|bounds| bounds.is_valid())
    {
        return Err(invalid());
    }
    if !bvh.nodes[0].bounds.intersects(&query) {
        return Ok(Vec::new());
    }
    let mut hits = Vec::new();
    let mut stack = Vec::with_capacity(64);
    stack.push(0usize);
    let mut remaining = bvh.nodes.len();
    while let Some(node_idx) = stack.pop() {
        remaining = remaining.checked_sub(1).ok_or_else(invalid)?;
        let node = *bvh.nodes.get(node_idx).ok_or_else(invalid)?;
        if !node.bounds.is_valid() {
            return Err(invalid());
        }
        if !node.bounds.intersects(&query) {
            continue;
        }
        if node.primitive_count > 0 {
            let (start, count) = (node.left_or_first as usize, node.primitive_count as usize);
            let end = start.checked_add(count).ok_or_else(invalid)?;
            if count > MORTON_BVH_LEAF_CAPACITY
                || end > bvh.leaf_bounds.len()
                || bvh.ordered_indices[start..end]
                    .iter()
                    .any(|&index| index as usize >= bvh.ordered_indices.len())
                || bvh.leaf_bounds[start..end]
                    .iter()
                    .any(|bounds| !bounds.is_valid())
            {
                return Err(invalid());
            }
            if count == 4 {
                let b = &bvh.leaf_bounds[start..start + 4];
                let mask = [
                    b[0].intersects(&query),
                    b[1].intersects(&query),
                    b[2].intersects(&query),
                    b[3].intersects(&query),
                ];
                for (lane, &hit) in mask.iter().enumerate() {
                    if hit {
                        hits.push(bvh.ordered_indices[start + lane]);
                    }
                }
            } else {
                for i in start..start + count {
                    if bvh.leaf_bounds[i].intersects(&query) {
                        hits.push(bvh.ordered_indices[i]);
                    }
                }
            }
        } else {
            let (left, right) = (node.left_or_first as usize, node.right_child as usize);
            if left <= node_idx
                || right <= node_idx
                || left == right
                || left >= bvh.nodes.len()
                || right >= bvh.nodes.len()
            {
                return Err(invalid());
            }
            if right < bvh.nodes.len() && bvh.nodes[right].bounds.intersects(&query) {
                stack.push(right);
            }
            if left < bvh.nodes.len() && bvh.nodes[left].bounds.intersects(&query) {
                stack.push(left);
            }
        }
    }
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn internal_radix_sort_and_karras_split_invariants_hold() {
        let mut pairs = vec![(900, 0), (12, 1), (900, 2), (0xDEAD_BEEF, 3), (12, 4)];
        radix_sort_morton_pairs(&mut pairs);
        assert_eq!(
            pairs,
            vec![(12, 1), (12, 4), (900, 0), (900, 2), (0xDEAD_BEEF, 3)]
        );
        assert_eq!(find_morton_split(&[42u32; 8], 0, 8), 4);
        assert_eq!(find_morton_split(&[0, 0, 0, 1, 1, 1], 0, 6), 3);
    }
}
