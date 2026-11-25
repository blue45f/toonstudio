use super::*;

/// 64×36 보수적 소프트웨어 Hi-Z 깊이 버퍼 및 5단계 Max-Depth 피라미드.
pub(super) struct AtelierHiZPyramid {
    cells: [f32; HIZ_TOTAL_CELLS],
}

impl AtelierHiZPyramid {
    pub(super) fn new_clear() -> Self {
        Self {
            cells: [1.0; HIZ_TOTAL_CELLS],
        }
    }

    pub(super) fn rasterize_occluder_aabb(
        &mut self,
        aabb: &StageObjectAabb,
        view_proj: &[f32; 16],
        cam_pos: [f32; 3],
        depth_range: StageDepthRange,
    ) -> bool {
        let (mn, mx) = (aabb.min, aabb.max);
        let c = [
            [mn[0], mn[1], mn[2]],
            [mx[0], mn[1], mn[2]],
            [mx[0], mx[1], mn[2]],
            [mn[0], mx[1], mn[2]],
            [mn[0], mn[1], mx[2]],
            [mx[0], mn[1], mx[2]],
            [mx[0], mx[1], mx[2]],
            [mn[0], mx[1], mx[2]],
        ];
        let faces: [([usize; 4], bool); 6] = [
            ([4, 5, 6, 7], cam_pos[2] > mx[2]),
            ([1, 0, 3, 2], cam_pos[2] < mn[2]),
            ([5, 1, 2, 6], cam_pos[0] > mx[0]),
            ([0, 4, 7, 3], cam_pos[0] < mn[0]),
            ([7, 6, 2, 3], cam_pos[1] > mx[1]),
            ([0, 1, 5, 4], cam_pos[1] < mn[1]),
        ];
        let mut wrote_any = false;
        for (idx, front) in faces {
            if !front {
                continue;
            }
            let quad = [
                mul_mat4_point(view_proj, c[idx[0]]),
                mul_mat4_point(view_proj, c[idx[1]]),
                mul_mat4_point(view_proj, c[idx[2]]),
                mul_mat4_point(view_proj, c[idx[3]]),
            ];
            if self.rasterize_convex_quad(&quad, depth_range) {
                wrote_any = true;
            }
        }
        wrote_any
    }

    fn rasterize_convex_quad(
        &mut self,
        quad: &[[f32; 4]; 4],
        depth_range: StageDepthRange,
    ) -> bool {
        let mut buf_a = [[0.0_f32; 4]; 8];
        let mut buf_b = [[0.0_f32; 4]; 8];
        buf_a[..4].copy_from_slice(quad);
        let n1 = clip_poly_plane(&buf_a[..4], &mut buf_b, |v| match depth_range {
            StageDepthRange::NegOneToOne => v[3] + v[2],
            StageDepthRange::ZeroToOne => v[2],
        });
        if n1 < 3 {
            return false;
        }
        let n = clip_poly_plane(&buf_b[..n1], &mut buf_a, |v| v[3] - NEAR_W_EPS);
        if n < 3 {
            return false;
        }

        let mut pts = [[0.0_f32; 3]; 8];
        let (mut min_sx, mut max_sx) = (f32::INFINITY, f32::NEG_INFINITY);
        let (mut min_sy, mut max_sy) = (f32::INFINITY, f32::NEG_INFINITY);
        for i in 0..n {
            let v = buf_a[i];
            let inv_w = 1.0 / v[3];
            let sx = (v[0] * inv_w * 0.5 + 0.5) * HIZ_WIDTH as f32;
            let sy = (v[1] * inv_w * 0.5 + 0.5) * HIZ_HEIGHT as f32;
            let raw_z = v[2] * inv_w;
            let d = match depth_range {
                StageDepthRange::NegOneToOne => (raw_z * 0.5 + 0.5).clamp(0.0, 1.0),
                StageDepthRange::ZeroToOne => raw_z.clamp(0.0, 1.0),
            };
            if !sx.is_finite() || !sy.is_finite() || !d.is_finite() {
                return false;
            }
            pts[i] = [sx, sy, d];
            min_sx = min_sx.min(sx);
            max_sx = max_sx.max(sx);
            min_sy = min_sy.min(sy);
            max_sy = max_sy.max(sy);
        }

        if max_sx <= 0.0
            || min_sx >= HIZ_WIDTH as f32
            || max_sy <= 0.0
            || min_sy >= HIZ_HEIGHT as f32
        {
            return false;
        }

        let mut area2 = 0.0_f32;
        for i in 0..n {
            let j = (i + 1) % n;
            area2 += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
        }
        if area2.abs() < 1e-3 {
            return false;
        }
        if area2 < 0.0 {
            pts[..n].reverse();
        }

        // 최대 면적 삼각형으로 평면 스크린 깊이 기울기(dz/dx, dz/dy) 산출
        let (mut best_det, mut bi, mut bj) = (0.0_f32, 1usize, 2usize);
        for i in 1..n - 1 {
            let det = (pts[i][0] - pts[0][0]) * (pts[i + 1][1] - pts[0][1])
                - (pts[i + 1][0] - pts[0][0]) * (pts[i][1] - pts[0][1]);
            if det.abs() > best_det.abs() {
                best_det = det;
                bi = i;
                bj = i + 1;
            }
        }
        if best_det.abs() < 1e-4 {
            return false;
        }
        let (du1, dv1, dd1) = (
            pts[bi][0] - pts[0][0],
            pts[bi][1] - pts[0][1],
            pts[bi][2] - pts[0][2],
        );
        let (du2, dv2, dd2) = (
            pts[bj][0] - pts[0][0],
            pts[bj][1] - pts[0][1],
            pts[bj][2] - pts[0][2],
        );
        let inv_det = 1.0 / best_det;
        let dz_dx = (dd1 * dv2 - dd2 * dv1) * inv_det;
        let dz_dy = (du1 * dd2 - du2 * dd1) * inv_det;
        let half_slope_pad = 0.5 * (dz_dx.abs() + dz_dy.abs()) + HIZ_DEPTH_BIAS;

        // 각 변의 보수적 내부 검사 계수 (셀 4꼭짓점이 모두 내부일 때만 기록)
        let mut edges = [[0.0_f32; 5]; 8];
        for i in 0..n {
            let j = (i + 1) % n;
            let ex = pts[j][0] - pts[i][0];
            let ey = pts[j][1] - pts[i][1];
            let elen = (ex * ex + ey * ey).sqrt();
            edges[i] = [pts[i][0], pts[i][1], ex, ey, elen * HIZ_EDGE_TOL];
        }

        let x0 = (min_sx.floor() as isize).clamp(0, HIZ_WIDTH as isize - 1) as usize;
        let x1 = (max_sx.ceil() as isize - 1).clamp(0, HIZ_WIDTH as isize - 1) as usize;
        let y0 = (min_sy.floor() as isize).clamp(0, HIZ_HEIGHT as isize - 1) as usize;
        let y1 = (max_sy.ceil() as isize - 1).clamp(0, HIZ_HEIGHT as isize - 1) as usize;
        if x0 > x1 || y0 > y1 {
            return false;
        }

        let mut wrote = false;
        for y in y0..=y1 {
            let fy = y as f32;
            let cy = fy + 0.5;
            let row_off = y * HIZ_WIDTH;
            for x in x0..=x1 {
                let fx = x as f32;
                let mut fully_inside = true;
                for e in &edges[..n] {
                    let min_px = if e[3] > 0.0 { fx + 1.0 } else { fx };
                    let min_py = if e[2] >= 0.0 { fy } else { fy + 1.0 };
                    let cross = e[2] * (min_py - e[1]) - e[3] * (min_px - e[0]);
                    if cross < e[4] {
                        fully_inside = false;
                        break;
                    }
                }
                if fully_inside {
                    let cx = fx + 0.5;
                    let d_cell = (pts[0][2]
                        + dz_dx * (cx - pts[0][0])
                        + dz_dy * (cy - pts[0][1])
                        + half_slope_pad)
                        .clamp(0.0, 1.0);
                    let cell = &mut self.cells[row_off + x];
                    if d_cell < *cell {
                        *cell = d_cell;
                        wrote = true;
                    }
                }
            }
        }
        wrote
    }

    pub(super) fn build_mip_pyramid(&mut self) {
        for lvl in 1..HIZ_LEVELS {
            let (pw, ph) = HIZ_LEVEL_DIMS[lvl - 1];
            let (cw, ch) = HIZ_LEVEL_DIMS[lvl];
            let prev_off = HIZ_LEVEL_OFFSETS[lvl - 1];
            let curr_off = HIZ_LEVEL_OFFSETS[lvl];
            for y in 0..ch {
                let sy0 = 2 * y;
                let sy1 = (sy0 + 1).min(ph - 1);
                for x in 0..cw {
                    let sx0 = 2 * x;
                    let sx1 = (sx0 + 1).min(pw - 1);
                    let d00 = self.cells[prev_off + sy0 * pw + sx0];
                    let d10 = self.cells[prev_off + sy0 * pw + sx1];
                    let d01 = self.cells[prev_off + sy1 * pw + sx0];
                    let d11 = self.cells[prev_off + sy1 * pw + sx1];
                    self.cells[curr_off + y * cw + x] = d00.max(d10).max(d01).max(d11);
                }
            }
        }
    }

    /// 보수적 Hi-Z 차폐 판정: AABB가 완전히 가려졌음이 수학적으로 증명된 경우에만 `true` 반환.
    pub(super) fn is_aabb_occluded(
        &self,
        aabb: &StageObjectAabb,
        view_proj: &[f32; 16],
        depth_range: StageDepthRange,
    ) -> bool {
        let (mn, mx) = (aabb.min, aabb.max);
        let (mut min_sx, mut max_sx) = (f32::INFINITY, f32::NEG_INFINITY);
        let (mut min_sy, mut max_sy) = (f32::INFINITY, f32::NEG_INFINITY);
        let mut obj_min_depth = f32::INFINITY;

        for mask in 0..8usize {
            let px = if (mask & 1) == 0 { mn[0] } else { mx[0] };
            let py = if (mask & 2) == 0 { mn[1] } else { mx[1] };
            let pz = if (mask & 4) == 0 { mn[2] } else { mx[2] };
            let clip = mul_mat4_point(view_proj, [px, py, pz]);
            if !clip[3].is_finite() || clip[3] <= NEAR_W_EPS {
                return false;
            }
            let inv_w = 1.0 / clip[3];
            let raw_z = clip[2] * inv_w;
            let d = match depth_range {
                StageDepthRange::NegOneToOne => raw_z * 0.5 + 0.5,
                StageDepthRange::ZeroToOne => raw_z,
            };
            if !d.is_finite() || d <= 0.0 {
                return false;
            }
            let sx = (clip[0] * inv_w * 0.5 + 0.5) * HIZ_WIDTH as f32;
            let sy = (clip[1] * inv_w * 0.5 + 0.5) * HIZ_HEIGHT as f32;
            min_sx = min_sx.min(sx);
            max_sx = max_sx.max(sx);
            min_sy = min_sy.min(sy);
            max_sy = max_sy.max(sy);
            obj_min_depth = obj_min_depth.min(d);
        }

        if max_sx <= 0.0
            || min_sx >= HIZ_WIDTH as f32
            || max_sy <= 0.0
            || min_sy >= HIZ_HEIGHT as f32
        {
            return false;
        }
        let x0 = (min_sx.floor() as isize).clamp(0, HIZ_WIDTH as isize - 1) as usize;
        let x1 = (max_sx.ceil() as isize - 1).clamp(x0 as isize, HIZ_WIDTH as isize - 1) as usize;
        let y0 = (min_sy.floor() as isize).clamp(0, HIZ_HEIGHT as isize - 1) as usize;
        let y1 = (max_sy.ceil() as isize - 1).clamp(y0 as isize, HIZ_HEIGHT as isize - 1) as usize;

        let mut lvl = 0usize;
        while lvl + 1 < HIZ_LEVELS
            && (((x1 >> lvl) - (x0 >> lvl)) > 1 || ((y1 >> lvl) - (y0 >> lvl)) > 1)
        {
            lvl += 1;
        }
        let (lw, lh) = HIZ_LEVEL_DIMS[lvl];
        let loff = HIZ_LEVEL_OFFSETS[lvl];
        let (bx0, bx1) = ((x0 >> lvl).min(lw - 1), (x1 >> lvl).min(lw - 1));
        let (by0, by1) = ((y0 >> lvl).min(lh - 1), (y1 >> lvl).min(lh - 1));
        let mut coarse_max = 0.0_f32;
        for by in by0..=by1 {
            for bx in bx0..=bx1 {
                coarse_max = coarse_max.max(self.cells[loff + by * lw + bx]);
            }
        }
        if obj_min_depth > coarse_max + HIZ_TEST_EPS {
            return true;
        }

        if lvl > 0 && (x1 - x0 + 1) * (y1 - y0 + 1) <= 64 {
            let mut exact_max = 0.0_f32;
            for y in y0..=y1 {
                let row = y * HIZ_WIDTH;
                for x in x0..=x1 {
                    exact_max = exact_max.max(self.cells[row + x]);
                }
            }
            return obj_min_depth > exact_max + HIZ_TEST_EPS;
        }
        false
    }
}

fn clip_poly_plane<F>(input: &[[f32; 4]], output: &mut [[f32; 4]; 8], dist: F) -> usize
where
    F: Fn([f32; 4]) -> f32,
{
    let n = input.len();
    if n < 3 {
        return 0;
    }
    let mut out_len = 0usize;
    let mut prev = input[n - 1];
    let mut prev_d = dist(prev);
    for &curr in input {
        let curr_d = dist(curr);
        let prev_in = prev_d >= 0.0;
        let curr_in = curr_d >= 0.0;
        if prev_in != curr_in && out_len < 8 {
            let t = (prev_d / (prev_d - curr_d)).clamp(0.0, 1.0);
            output[out_len] = [
                prev[0] + t * (curr[0] - prev[0]),
                prev[1] + t * (curr[1] - prev[1]),
                prev[2] + t * (curr[2] - prev[2]),
                prev[3] + t * (curr[3] - prev[3]),
            ];
            out_len += 1;
        }
        if curr_in && out_len < 8 {
            output[out_len] = curr;
            out_len += 1;
        }
        prev = curr;
        prev_d = curr_d;
    }
    out_len
}
