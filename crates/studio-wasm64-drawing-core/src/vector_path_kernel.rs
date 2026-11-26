//! Wave-3 순수 안전 Rust 무한 캔버스 벡터 기하 커널 (`vector_path_kernel`).
//!
//! - 스택 기반 Ramer-Douglas-Peucker 폴리라인 단순화 (`simplify_polyline_rdp`)
//! - 개방/폐합 경로 Chaikin 코너 스무딩 (`smooth_polyline_chaikin`)
//! - 3차 베지어 곡선 적응형 평탄화 + 누적 호 길이(Arc-Length) 테이블 및 균일 재샘플링
//! - 가변 폭 캘리그라피·잉크 스트로크 외곽선 확장 (Miter / Bevel 조인 + Miter-Limit 폴백)
//! - 2D Non-Zero / Even-Odd 와인딩 다각형 히트 테스트 (단일 및 AABB 조기 종료 일괄 쿼리)

use crate::DrawingCoreError;

/// Chaikin 스무딩 최대 허용 반복 횟수(메모리 폭증 방지).
pub const MAX_CHAIKIN_ITERATIONS: u32 = 8;

/// 3차 베지어 적응형 세분화 최대 깊이(세그먼트 최대 `2^12 = 4096`).
pub const MAX_BEZIER_SUBDIV_DEPTH: u32 = 12;

/// 스트로크 외곽선 조인(Join) 스타일.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum StrokeJoinStyle {
    /// 베벨(Bevel) 깎임 조인.
    Bevel,
    /// 마이터(Miter) 뾰족 조인 (`miter_limit >= 1.0`, 초과 시 베벨로 안전 폴백).
    Miter { miter_limit: f32 },
}

/// 2D 다각형 채움 판정 규칙.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum WindingFillRule {
    NonZero = 0,
    EvenOdd = 1,
}

impl WindingFillRule {
    #[must_use]
    pub const fn from_u32(value: u32) -> Option<Self> {
        match value {
            0 => Some(Self::NonZero),
            1 => Some(Self::EvenOdd),
            _ => None,
        }
    }
}

#[inline]
fn validate_xy_slice(xy: &[f32]) -> Result<usize, DrawingCoreError> {
    if !xy.len().is_multiple_of(2) {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: (xy.len() / 2) * 2,
            actual: xy.len(),
        });
    }
    Ok(xy.len() / 2)
}

#[inline]
fn point_segment_dist_sq(px: f32, py: f32, ax: f32, ay: f32, bx: f32, by: f32) -> f32 {
    let abx = bx - ax;
    let aby = by - ay;
    let apx = px - ax;
    let apy = py - ay;
    let ab_len_sq = abx * abx + aby * aby;
    if ab_len_sq <= 1e-12 {
        return apx * apx + apy * apy;
    }
    let t = ((apx * abx + apy * aby) / ab_len_sq).clamp(0.0, 1.0);
    let dx = px - (ax + t * abx);
    let dy = py - (ay + t * aby);
    dx * dx + dy * dy
}

/// 비재귀 Ramer-Douglas-Peucker 폴리라인 단순화에서 유지할 정점 인덱스 목록을 계산한다.
pub fn simplify_polyline_rdp_indices(
    xy: &[f32],
    epsilon: f32,
) -> Result<Vec<usize>, DrawingCoreError> {
    let n = validate_xy_slice(xy)?;
    if !epsilon.is_finite() || epsilon < 0.0 {
        return Err(DrawingCoreError::InvalidParameter { name: "epsilon" });
    }
    if n <= 2 || epsilon == 0.0 {
        return Ok((0..n).collect());
    }

    let eps_sq = epsilon * epsilon;
    let mut keep = vec![false; n];
    keep[0] = true;
    keep[n - 1] = true;

    let mut stack = vec![(0usize, n - 1)];
    while let Some((start, end)) = stack.pop() {
        if end <= start + 1 {
            continue;
        }
        let ax = xy[start * 2];
        let ay = xy[start * 2 + 1];
        let bx = xy[end * 2];
        let by = xy[end * 2 + 1];

        let mut max_d2 = -1.0_f32;
        let mut split = start;
        for idx in (start + 1)..end {
            let d2 = point_segment_dist_sq(xy[idx * 2], xy[idx * 2 + 1], ax, ay, bx, by);
            if d2 > max_d2 {
                max_d2 = d2;
                split = idx;
            }
        }
        if max_d2 > eps_sq && split > start && split < end {
            keep[split] = true;
            stack.push((start, split));
            stack.push((split, end));
        }
    }

    Ok(keep
        .into_iter()
        .enumerate()
        .filter_map(|(i, kept)| if kept { Some(i) } else { None })
        .collect())
}

/// 평면 `[x0, y0, x1, y1, ...]` 폴리라인에 Ramer-Douglas-Peucker 단순화를 적용한다.
pub fn simplify_polyline_rdp(xy: &[f32], epsilon: f32) -> Result<Vec<f32>, DrawingCoreError> {
    let indices = simplify_polyline_rdp_indices(xy, epsilon)?;
    let mut out = Vec::with_capacity(indices.len() * 2);
    for idx in indices {
        out.push(xy[idx * 2]);
        out.push(xy[idx * 2 + 1]);
    }
    Ok(out)
}

/// Chaikin 코너 컷팅 알고리즘으로 개방 또는 폐합 폴리라인을 부드럽게 다듬는다.
///
/// - `ratio`: 코너 절단 비율 (`0.05..=0.45`, 표준값 `0.25`).
/// - `closed == false`이면 시작점과 끝점을 정확히 보존한다.
pub fn smooth_polyline_chaikin(
    xy: &[f32],
    iterations: u32,
    closed: bool,
    ratio: f32,
) -> Result<Vec<f32>, DrawingCoreError> {
    let n = validate_xy_slice(xy)?;
    if iterations > MAX_CHAIKIN_ITERATIONS {
        return Err(DrawingCoreError::InvalidParameter { name: "iterations" });
    }
    if !ratio.is_finite() || !(0.05..=0.45).contains(&ratio) {
        return Err(DrawingCoreError::InvalidParameter { name: "ratio" });
    }
    if n < 2 || iterations == 0 || (closed && n < 3) {
        return Ok(xy.to_vec());
    }

    let one_minus = 1.0 - ratio;
    let mut cur = xy.to_vec();
    for _ in 0..iterations {
        let count = cur.len() / 2;
        let segs = if closed { count } else { count - 1 };
        let next_points = if closed { segs * 2 } else { segs * 2 + 2 };
        let mut next = Vec::with_capacity(next_points * 2);
        if !closed {
            next.push(cur[0]);
            next.push(cur[1]);
        }
        for i in 0..segs {
            let j = if closed && i + 1 == count { 0 } else { i + 1 };
            let x0 = cur[i * 2];
            let y0 = cur[i * 2 + 1];
            let x1 = cur[j * 2];
            let y1 = cur[j * 2 + 1];
            next.push(one_minus * x0 + ratio * x1);
            next.push(one_minus * y0 + ratio * y1);
            next.push(ratio * x0 + one_minus * x1);
            next.push(ratio * y0 + one_minus * y1);
        }
        if !closed {
            next.push(cur[(count - 1) * 2]);
            next.push(cur[(count - 1) * 2 + 1]);
        }
        cur = next;
    }
    Ok(cur)
}

/// 3차 베지어 곡선 평탄화 및 누적 호 길이 테이블 결과.
#[derive(Debug, Clone, PartialEq)]
pub struct FlattenedBezierCurve {
    /// `[x0, y0, x1, y1, ...]` 평탄화 정점.
    pub points_xy: Vec<f32>,
    /// 각 정점까지의 누적 호 길이 (`arc_lengths[0] == 0.0`).
    pub arc_lengths: Vec<f32>,
    pub total_length: f32,
}

#[inline]
fn cubic_flatness_sq(p0: [f32; 2], c1: [f32; 2], c2: [f32; 2], p3: [f32; 2]) -> f32 {
    // 16 * max_error^2 상계: max(|3*c1 - 2*p0 - p3|^2, |3*c2 - p0 - 2*p3|^2)
    let ux = 3.0 * c1[0] - 2.0 * p0[0] - p3[0];
    let uy = 3.0 * c1[1] - 2.0 * p0[1] - p3[1];
    let vx = 3.0 * c2[0] - p0[0] - 2.0 * p3[0];
    let vy = 3.0 * c2[1] - p0[1] - 2.0 * p3[1];
    (ux * ux + uy * uy).max(vx * vx + vy * vy)
}

#[inline]
fn mid2(a: [f32; 2], b: [f32; 2]) -> [f32; 2] {
    [0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1])]
}

/// de Casteljau 적응형 세분화로 3차 베지어 곡선을 평탄화하고 누적 호 길이 테이블을 생성한다.
pub fn flatten_cubic_bezier_adaptive(
    p0: [f32; 2],
    c1: [f32; 2],
    c2: [f32; 2],
    p3: [f32; 2],
    tolerance: f32,
) -> Result<FlattenedBezierCurve, DrawingCoreError> {
    if !tolerance.is_finite() || tolerance <= 0.0 {
        return Err(DrawingCoreError::InvalidParameter { name: "tolerance" });
    }
    for v in [p0[0], p0[1], c1[0], c1[1], c2[0], c2[1], p3[0], p3[1]] {
        if !v.is_finite() {
            return Err(DrawingCoreError::InvalidParameter {
                name: "control_points",
            });
        }
    }

    let flat_limit = 16.0 * tolerance * tolerance;
    let mut points_xy = Vec::with_capacity(64);
    points_xy.push(p0[0]);
    points_xy.push(p0[1]);

    // LIFO 스택으로 좌측 먼저 방출하도록 우측을 먼저 push한다.
    let mut stack = Vec::with_capacity(32);
    stack.push((p0, c1, c2, p3, 0u32));

    while let Some((a, b, c, d, depth)) = stack.pop() {
        if depth >= MAX_BEZIER_SUBDIV_DEPTH || cubic_flatness_sq(a, b, c, d) <= flat_limit {
            points_xy.push(d[0]);
            points_xy.push(d[1]);
        } else {
            let ab = mid2(a, b);
            let bc = mid2(b, c);
            let cd = mid2(c, d);
            let abc = mid2(ab, bc);
            let bcd = mid2(bc, cd);
            let abcd = mid2(abc, bcd);
            stack.push((abcd, bcd, cd, d, depth + 1));
            stack.push((a, ab, abc, abcd, depth + 1));
        }
    }

    let arc_lengths = build_arc_length_table(&points_xy)?;
    let total_length = arc_lengths.last().copied().unwrap_or(0.0);
    Ok(FlattenedBezierCurve {
        points_xy,
        arc_lengths,
        total_length,
    })
}

/// 평면 `[x0, y0, ...]` 폴리라인의 누적 호 길이 테이블을 계산한다.
pub fn build_arc_length_table(xy: &[f32]) -> Result<Vec<f32>, DrawingCoreError> {
    let n = validate_xy_slice(xy)?;
    let mut table = Vec::with_capacity(n);
    if n == 0 {
        return Ok(table);
    }
    table.push(0.0);
    let mut acc = 0.0_f32;
    for i in 1..n {
        let dx = xy[i * 2] - xy[(i - 1) * 2];
        let dy = xy[i * 2 + 1] - xy[(i - 1) * 2 + 1];
        acc += dx.hypot(dy);
        table.push(acc);
    }
    Ok(table)
}

/// 누적 호 길이 테이블에서 지정 거리 `distance`의 보간 좌표 `[x, y]`를 이진 탐색으로 샘플링한다.
pub fn sample_polyline_at_arc_length(
    xy: &[f32],
    arc_lengths: &[f32],
    distance: f32,
) -> Result<[f32; 2], DrawingCoreError> {
    let n = validate_xy_slice(xy)?;
    if n == 0 || arc_lengths.len() != n {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: n,
            actual: arc_lengths.len(),
        });
    }
    if !distance.is_finite() {
        return Err(DrawingCoreError::InvalidParameter { name: "distance" });
    }
    if n == 1 || distance <= 0.0 {
        return Ok([xy[0], xy[1]]);
    }
    let total = arc_lengths[n - 1];
    if distance >= total || total <= 1e-12 {
        return Ok([xy[(n - 1) * 2], xy[(n - 1) * 2 + 1]]);
    }

    let idx = arc_lengths
        .partition_point(|&s| s < distance)
        .clamp(1, n - 1);
    let s0 = arc_lengths[idx - 1];
    let s1 = arc_lengths[idx];
    let denom = s1 - s0;
    let t = if denom > 1e-12 {
        ((distance - s0) / denom).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let x0 = xy[(idx - 1) * 2];
    let y0 = xy[(idx - 1) * 2 + 1];
    let x1 = xy[idx * 2];
    let y1 = xy[idx * 2 + 1];
    Ok([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t])
}

/// 가변 폭 스트로크 외곽선 확장 결과(폐합 다각형 `[x0, y0, ...]`).
#[derive(Debug, Clone, PartialEq)]
pub struct ExpandedStrokeOutline {
    pub polygon_xy: Vec<f32>,
    pub left_vertex_count: usize,
    pub right_vertex_count: usize,
}

#[inline]
fn normalize_or_zero(dx: f32, dy: f32) -> [f32; 2] {
    let len = dx.hypot(dy);
    if len <= 1e-9 {
        [0.0, 0.0]
    } else {
        [dx / len, dy / len]
    }
}

/// `[x, y, half_width]` 스트라이드 3 가변 폭 스트로크 중심선을 폐합 외곽선 다각형으로 확장한다.
///
/// - 연속 중복점을 안전하게 병합해 NaN 법선을 방지한다.
/// - Miter 조인은 내적 및 `miter_limit`를 검사해 예각 스파이크 발생 시 Bevel로 자동 폴백한다.
/// - 결과 다각형은 `[좌측 엣지 정순 ..., 우측 엣지 역순 ...]`의 단일 폐합 루프다.
pub fn expand_variable_width_stroke(
    spine_xyw: &[f32],
    join: StrokeJoinStyle,
) -> Result<ExpandedStrokeOutline, DrawingCoreError> {
    if !spine_xyw.len().is_multiple_of(3) {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: (spine_xyw.len() / 3) * 3,
            actual: spine_xyw.len(),
        });
    }
    let miter_limit = match join {
        StrokeJoinStyle::Bevel => 1.0,
        StrokeJoinStyle::Miter { miter_limit } => {
            if !miter_limit.is_finite() || !(1.0..=32.0).contains(&miter_limit) {
                return Err(DrawingCoreError::InvalidParameter {
                    name: "miter_limit",
                });
            }
            miter_limit
        }
    };

    let raw_count = spine_xyw.len() / 3;
    let mut spine: Vec<[f32; 3]> = Vec::with_capacity(raw_count);
    for &[x, y, hw] in spine_xyw.as_chunks::<3>().0 {
        if !x.is_finite() || !y.is_finite() || !hw.is_finite() || hw < 0.0 {
            return Err(DrawingCoreError::InvalidParameter { name: "spine_xyw" });
        }
        if let Some(prev) = spine.last_mut() {
            if (x - prev[0]).hypot(y - prev[1]) <= 1e-6 {
                prev[2] = prev[2].max(hw);
                continue;
            }
        }
        spine.push([x, y, hw]);
    }

    let n = spine.len();
    if n < 2 {
        return Ok(ExpandedStrokeOutline {
            polygon_xy: Vec::new(),
            left_vertex_count: 0,
            right_vertex_count: 0,
        });
    }

    // 각 세그먼트의 단위 좌측 법선 (-ty, tx) 계산
    let mut seg_normals: Vec<[f32; 2]> = Vec::with_capacity(n - 1);
    for i in 0..(n - 1) {
        let t = normalize_or_zero(spine[i + 1][0] - spine[i][0], spine[i + 1][1] - spine[i][1]);
        seg_normals.push([-t[1], t[0]]);
    }

    let mut left_pts: Vec<[f32; 2]> = Vec::with_capacity(n * 2);
    let mut right_pts: Vec<[f32; 2]> = Vec::with_capacity(n * 2);

    // 시작 캡
    let n0 = seg_normals[0];
    let hw0 = spine[0][2];
    left_pts.push([spine[0][0] + n0[0] * hw0, spine[0][1] + n0[1] * hw0]);
    right_pts.push([spine[0][0] - n0[0] * hw0, spine[0][1] - n0[1] * hw0]);

    // 내부 조인 정점 처리
    for i in 1..(n - 1) {
        let px = spine[i][0];
        let py = spine[i][1];
        let hw = spine[i][2];
        let na = seg_normals[i - 1];
        let nb = seg_normals[i];
        let cross = na[0] * nb[1] - na[1] * nb[0];
        let bx = na[0] + nb[0];
        let by = na[1] + nb[1];
        let b_len = bx.hypot(by);
        let use_miter = matches!(join, StrokeJoinStyle::Miter { .. }) && b_len > 1e-5;

        if use_miter {
            let mnx = bx / b_len;
            let mny = by / b_len;
            let cos_half = (mnx * na[0] + mny * na[1]).abs();
            let miter_scale = if cos_half > 1e-4 {
                1.0 / cos_half
            } else {
                miter_limit + 1.0
            };
            if miter_scale <= miter_limit {
                let d = hw * miter_scale;
                left_pts.push([px + mnx * d, py + mny * d]);
                right_pts.push([px - mnx * d, py - mny * d]);
                continue;
            }
        }

        // Bevel 조인(또는 miter_limit 초과 폴백): 외곽 쪽 2점, 내측 쪽 1점(평균)
        if cross < 0.0 {
            // 좌측이 외곽
            left_pts.push([px + na[0] * hw, py + na[1] * hw]);
            left_pts.push([px + nb[0] * hw, py + nb[1] * hw]);
            let avg = normalize_or_zero(bx, by);
            let rx = if avg == [0.0, 0.0] { nb[0] } else { avg[0] };
            let ry = if avg == [0.0, 0.0] { nb[1] } else { avg[1] };
            right_pts.push([px - rx * hw, py - ry * hw]);
        } else if cross > 0.0 {
            // 우측이 외곽
            let avg = normalize_or_zero(bx, by);
            let lx = if avg == [0.0, 0.0] { nb[0] } else { avg[0] };
            let ly = if avg == [0.0, 0.0] { nb[1] } else { avg[1] };
            left_pts.push([px + lx * hw, py + ly * hw]);
            right_pts.push([px - na[0] * hw, py - na[1] * hw]);
            right_pts.push([px - nb[0] * hw, py - nb[1] * hw]);
        } else {
            left_pts.push([px + nb[0] * hw, py + nb[1] * hw]);
            right_pts.push([px - nb[0] * hw, py - nb[1] * hw]);
        }
    }

    // 종료 캡
    let nl = seg_normals[n - 2];
    let hwl = spine[n - 1][2];
    left_pts.push([
        spine[n - 1][0] + nl[0] * hwl,
        spine[n - 1][1] + nl[1] * hwl,
    ]);
    right_pts.push([
        spine[n - 1][0] - nl[0] * hwl,
        spine[n - 1][1] - nl[1] * hwl,
    ]);

    let left_vertex_count = left_pts.len();
    let right_vertex_count = right_pts.len();
    let mut polygon_xy = Vec::with_capacity((left_vertex_count + right_vertex_count) * 2);
    for p in &left_pts {
        polygon_xy.push(p[0]);
        polygon_xy.push(p[1]);
    }
    for p in right_pts.iter().rev() {
        polygon_xy.push(p[0]);
        polygon_xy.push(p[1]);
    }

    Ok(ExpandedStrokeOutline {
        polygon_xy,
        left_vertex_count,
        right_vertex_count,
    })
}

#[inline]
fn is_left_2d(ax: f32, ay: f32, bx: f32, by: f32, px: f32, py: f32) -> f32 {
    (bx - ax) * (py - ay) - (px - ax) * (by - ay)
}

/// Dan Sunday 정밀 와인딩 넘버 계산(폐합 다각형 `[x0, y0, ...]`).
#[must_use]
pub fn polygon_winding_number_2d(polygon_xy: &[f32], qx: f32, qy: f32) -> i32 {
    let n = polygon_xy.len() / 2;
    if n < 3 || !qx.is_finite() || !qy.is_finite() {
        return 0;
    }
    let mut wn = 0i32;
    for i in 0..n {
        let j = if i + 1 == n { 0 } else { i + 1 };
        let ax = polygon_xy[i * 2];
        let ay = polygon_xy[i * 2 + 1];
        let bx = polygon_xy[j * 2];
        let by = polygon_xy[j * 2 + 1];
        if ay <= qy {
            if by > qy && is_left_2d(ax, ay, bx, by, qx, qy) > 0.0 {
                wn += 1;
            }
        } else if by <= qy && is_left_2d(ax, ay, bx, by, qx, qy) < 0.0 {
            wn -= 1;
        }
    }
    wn
}

/// 단일 점 `(qx, qy)`에 대해 Non-Zero 또는 Even-Odd 규칙으로 다각형 내부 여부를 판정한다.
#[must_use]
pub fn hit_test_polygon_2d(
    polygon_xy: &[f32],
    qx: f32,
    qy: f32,
    rule: WindingFillRule,
) -> bool {
    let wn = polygon_winding_number_2d(polygon_xy, qx, qy);
    match rule {
        WindingFillRule::NonZero => wn != 0,
        WindingFillRule::EvenOdd => (wn & 1) != 0,
    }
}

/// 다수의 쿼리 점(`[qx0, qy0, ...]`)에 대해 AABB 조기 종료 + 와인딩 히트 테스트를 일괄 수행한다.
pub fn hit_test_polygon_batch_2d(
    polygon_xy: &[f32],
    queries_xy: &[f32],
    rule: WindingFillRule,
    out_hits: &mut [u8],
) -> Result<usize, DrawingCoreError> {
    let n_poly = validate_xy_slice(polygon_xy)?;
    let n_queries = validate_xy_slice(queries_xy)?;
    if out_hits.len() != n_queries {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected: n_queries,
            actual: out_hits.len(),
        });
    }
    if n_poly < 3 || n_queries == 0 {
        out_hits.fill(0);
        return Ok(0);
    }

    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for &[x, y] in polygon_xy.as_chunks::<2>().0 {
        if x < min_x {
            min_x = x;
        }
        if x > max_x {
            max_x = x;
        }
        if y < min_y {
            min_y = y;
        }
        if y > max_y {
            max_y = y;
        }
    }

    let mut hit_count = 0usize;
    for (dst, &[qx, qy]) in out_hits.iter_mut().zip(queries_xy.as_chunks::<2>().0) {
        if qx < min_x || qx > max_x || qy < min_y || qy > max_y {
            *dst = 0;
            continue;
        }
        let hit = hit_test_polygon_2d(polygon_xy, qx, qy, rule);
        *dst = u8::from(hit);
        if hit {
            hit_count += 1;
        }
    }
    Ok(hit_count)
}
