//! 순수 Rust SIMD128 친화 3D·VRM 스키닝 · Morton BVH · LT 선화 추출 커널.
//!
//! 1. SoA 4-본 VRM 스키닝 (`skin_vrm_mesh_4bone_soa`): 4-와이드 고정 레인 루프,
//!    가중치 정규화·법선 재정규화·NaN/OOB 방어. SIMD 코드 생성과 실기기 성능은 별도 검증 대상이다.
//! 2. Morton Z-Order Curve 및 2D 고속 BVH (`encode_morton_2d_u32`, `encode_morton_3d_u32`,
//!    `build_morton_bvh_2d`, `query_morton_bvh_aabb`): 4-패스 기수 정렬 + Karras 접두 분할 트리.
//! 3. 3D G-Buffer(법선·깊이) → 2D 웹툰 LT(Line & Tone) 잉크 선화 추출 (`extract_lt_lineart_from_gbuffer`):
//!    3행 링 버퍼 기반 4-와이드 3×3 Sobel 깊이 불연속 + 법선 내적 엣지 검출.

use crate::{checked_pixel_count, DrawingCoreError};

mod bvh;
pub use bvh::{
    build_morton_bvh_2d, encode_morton_2d_u32, encode_morton_3d_u32, query_morton_bvh_aabb, Aabb2D,
    MortonBvh2D, MortonBvhNode2D, MORTON_BVH_LEAF_CAPACITY,
};

/// 4×4 열 우선(column-major, glTF/VRM 표준) 항등 행렬.
pub const IDENTITY_MAT4: [f32; 16] = [
    1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
];

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
    if actual != expected {
        Err(DrawingCoreError::BufferLengthMismatch { expected, actual })
    } else {
        Ok(())
    }
}

#[inline]
fn sanitize_weight(w: f32, had_non_finite: &mut bool) -> f32 {
    if !w.is_finite() {
        *had_non_finite = true;
        0.0
    } else {
        w.max(0.0)
    }
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
        let inv = if len_sq > NORMAL_LEN_SQ_EPS {
            1.0 / len_sq.sqrt()
        } else {
            0.0
        };
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
    let mut f_or = |v: f32, fb: f32| {
        if v.is_finite() {
            v
        } else {
            bad = true;
            fb
        }
    };
    let p = [
        f_or(input.pos_x[i], 0.0),
        f_or(input.pos_y[i], 0.0),
        f_or(input.pos_z[i], 0.0),
    ];
    let nrm = if input.norm_x[i].is_finite()
        && input.norm_y[i].is_finite()
        && input.norm_z[i].is_finite()
    {
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
    if bad {
        stats.sanitized_nan_vertices += 1;
    }

    let w_sum = w[0] + w[1] + w[2] + w[3];
    if w_sum <= WEIGHT_SUM_EPS || !w_sum.is_finite() {
        stats.zero_weight_fallbacks += 1;
        return (p, nrm, IDENTITY_AFFINE_3X4);
    }
    let inv_w = 1.0 / w_sum;
    for wk in &mut w {
        *wk *= inv_w;
    }

    let mut blended = [0.0_f32; 12];
    for (k, &wk) in w.iter().enumerate() {
        if wk <= 0.0 {
            continue;
        }
        let j = usize::from(input.joints[k][i]);
        let m = if j < bone_matrices.len() {
            if bone_finite[j] {
                &bone_matrices[j]
            } else {
                &IDENTITY_MAT4
            }
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

fn skin_vertex_block(
    base: usize,
    input: &VrmMeshSoaInput<'_>,
    bone_matrices: &[[f32; 16]],
    bone_finite: &[bool],
    stats: &mut SkinningStats,
) -> ([[f32; 4]; 3], [[f32; 4]; 3]) {
    let count = (input.pos_x.len() - base).min(4);
    let (mut pos_blk, mut nrm_blk) = ([[0.0_f32; 4]; 3], [[0.0_f32; 4]; 3]);
    let mut bm = [[0.0_f32; 4]; 12];
    for l in 0..count {
        let (p, nrm, mat) = prepare_vertex_lane(base + l, input, bone_matrices, bone_finite, stats);
        for a in 0..3 {
            pos_blk[a][l] = p[a];
            nrm_blk[a][l] = nrm[a];
        }
        for r in 0..12 {
            bm[r][l] = mat[r];
        }
    }
    for l in count..4 {
        nrm_blk[2][l] = 1.0;
        for r in 0..12 {
            bm[r][l] = IDENTITY_AFFINE_3X4[r];
        }
    }
    skin_4wide_lanes(&pos_blk, &nrm_blk, &bm)
}

/// SoA 배치 4-본 VRM 선형 블렌드 스키닝(LBS) 커널.
///
/// `bone_matrices`는 glTF/VRM 표준 열 우선 4×4 행렬(`[f32; 16]`) 배열이며,
/// 가중치 정규화·법선 재정규화·OOB 본 인덱스 및 비유한(NaN/Inf) 방어를 panic 없이 수행한다.
/// 계산 결과가 유한 범위를 넘으면 출력 버퍼를 바꾸지 않고 오류를 반환한다.
pub fn skin_vrm_mesh_4bone_soa(
    input: &VrmMeshSoaInput<'_>,
    bone_matrices: &[[f32; 16]],
    output: &mut VrmMeshSoaOutput<'_>,
) -> Result<SkinningStats, DrawingCoreError> {
    if bone_matrices.is_empty() {
        return Err(DrawingCoreError::InvalidParameter {
            name: "bone_matrices",
        });
    }
    let n = input.pos_x.len();
    for s in [
        input.pos_y,
        input.pos_z,
        input.norm_x,
        input.norm_y,
        input.norm_z,
        input.weights[0],
        input.weights[1],
        input.weights[2],
        input.weights[3],
        output.pos_x,
        output.pos_y,
        output.pos_z,
        output.norm_x,
        output.norm_y,
        output.norm_z,
    ] {
        validate_slice_len(n, s.len())?;
    }
    for j in input.joints {
        validate_slice_len(n, j.len())?;
    }

    let mut stats = SkinningStats {
        skinned_vertices: n,
        ..SkinningStats::default()
    };
    if n == 0 {
        return Ok(stats);
    }

    let bone_finite: Vec<bool> = bone_matrices
        .iter()
        .map(|m| m.iter().all(|v| v.is_finite()))
        .collect();
    // 출력 전체가 유한한지 먼저 검사해 뒤쪽 정점의 실패도 호출자 버퍼를 바꾸지 않는다.
    for base in (0..n).step_by(4) {
        let (positions, normals) =
            skin_vertex_block(base, input, bone_matrices, &bone_finite, &mut stats);
        if positions
            .iter()
            .chain(normals.iter())
            .flatten()
            .any(|value| !value.is_finite())
        {
            return Err(DrawingCoreError::InvalidParameter {
                name: "skinning_result",
            });
        }
    }
    let mut ignored_stats = SkinningStats::default();
    for base in (0..n).step_by(4) {
        let count = (n - base).min(4);
        let (out_p, out_n) =
            skin_vertex_block(base, input, bone_matrices, &bone_finite, &mut ignored_stats);
        output.pos_x[base..base + count].copy_from_slice(&out_p[0][..count]);
        output.pos_y[base..base + count].copy_from_slice(&out_p[1][..count]);
        output.pos_z[base..base + count].copy_from_slice(&out_p[2][..count]);
        output.norm_x[base..base + count].copy_from_slice(&out_n[0][..count]);
        output.norm_y[base..base + count].copy_from_slice(&out_n[1][..count]);
        output.norm_z[base..base + count].copy_from_slice(&out_n[2][..count]);
    }
    Ok(stats)
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
            depth_threshold: 0.15,
            normal_edge_threshold: 0.25,
            depth_weight: 1.0,
            normal_weight: 1.0,
            edge_softness: 0.15,
            min_ink_alpha: 0,
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

struct SanitizedRow {
    nx: Vec<f32>,
    ny: Vec<f32>,
    nz: Vec<f32>,
    d: Vec<f32>,
}

impl SanitizedRow {
    fn new(w: usize) -> Self {
        Self {
            nx: vec![0.0; w],
            ny: vec![0.0; w],
            nz: vec![1.0; w],
            d: vec![0.0; w],
        }
    }

    fn fill(
        &mut self,
        y: usize,
        w: usize,
        nx: &[f32],
        ny: &[f32],
        nz: &[f32],
        depth: &[f32],
    ) -> usize {
        let off = y * w;
        let mut sanitized = 0usize;
        for x in 0..w {
            let i = off + x;
            let mut bad = false;
            let d = if depth[i].is_finite() {
                depth[i]
            } else {
                bad = true;
                0.0
            };
            let (rx, ry, rz) = if nx[i].is_finite() && ny[i].is_finite() && nz[i].is_finite() {
                (nx[i], ny[i], nz[i])
            } else {
                bad = true;
                (DEFAULT_NORMAL[0], DEFAULT_NORMAL[1], DEFAULT_NORMAL[2])
            };
            if bad {
                sanitized += 1;
            }
            let u = normalize_normal_xyz(rx, ry, rz);
            self.nx[x] = u[0];
            self.ny[x] = u[1];
            self.nz[x] = u[2];
            self.d[x] = d;
        }
        sanitized
    }
}

#[inline]
fn lt_smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    if x <= edge0 {
        return 0.0;
    }
    let span = edge1 - edge0;
    if span <= 1e-6 {
        return 1.0;
    }
    let t = ((x - edge0) / span).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

#[inline]
fn lt_alpha_from_metrics(
    depth_grad: f32,
    normal_diff: f32,
    cfg: &LtLineArtConfig,
) -> (u8, bool, bool) {
    let dr = lt_smoothstep(
        cfg.depth_threshold,
        cfg.depth_threshold + cfg.edge_softness,
        depth_grad,
    );
    let nr = lt_smoothstep(
        cfg.normal_edge_threshold,
        cfg.normal_edge_threshold + cfg.edge_softness,
        normal_diff,
    );
    let combined = (dr * cfg.depth_weight)
        .max(nr * cfg.normal_weight)
        .clamp(0.0, 1.0);
    let raw = (combined * 255.0).round() as u8;
    (
        if raw < cfg.min_ink_alpha { 0 } else { raw },
        dr > 0.0,
        nr > 0.0,
    )
}

#[inline]
fn eval_lt_stencil(
    top: &SanitizedRow,
    mid: &SanitizedRow,
    bot: &SanitizedRow,
    xm: usize,
    x: usize,
    xp: usize,
) -> (f32, f32) {
    let gx = (-top.d[xm] + top.d[xp]) + 2.0 * (-mid.d[xm] + mid.d[xp]) + (-bot.d[xm] + bot.d[xp]);
    let gy = (-top.d[xm] - 2.0 * top.d[x] - top.d[xp]) + (bot.d[xm] + 2.0 * bot.d[x] + bot.d[xp]);
    let depth_grad = (gx * gx + gy * gy).sqrt() * 0.25;
    let (cx, cy, cz) = (mid.nx[x], mid.ny[x], mid.nz[x]);
    let dl = (cx * mid.nx[xm] + cy * mid.ny[xm] + cz * mid.nz[xm]).clamp(-1.0, 1.0);
    let dr = (cx * mid.nx[xp] + cy * mid.ny[xp] + cz * mid.nz[xp]).clamp(-1.0, 1.0);
    let du = (cx * top.nx[x] + cy * top.ny[x] + cz * top.nz[x]).clamp(-1.0, 1.0);
    let dd = (cx * bot.nx[x] + cy * bot.ny[x] + cz * bot.nz[x]).clamp(-1.0, 1.0);
    (
        depth_grad,
        (1.0 - dl).max(1.0 - dr).max(1.0 - du).max(1.0 - dd),
    )
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
    for s in [normal_x, normal_y, normal_z, depth] {
        validate_slice_len(pixel_count, s.len())?;
    }
    validate_slice_len(pixel_count, out_alpha_mask.len())?;
    if !config.depth_threshold.is_finite()
        || config.depth_threshold < 0.0
        || !config.normal_edge_threshold.is_finite()
        || !(0.0..=2.0).contains(&config.normal_edge_threshold)
        || !config.depth_weight.is_finite()
        || config.depth_weight < 0.0
        || !config.normal_weight.is_finite()
        || config.normal_weight < 0.0
        || !config.edge_softness.is_finite()
        || config.edge_softness < 0.0
    {
        return Err(DrawingCoreError::InvalidParameter { name: "config" });
    }

    let (w, h) = (width as usize, height as usize);
    let mut stats = LtLineArtStats {
        total_pixels: pixel_count,
        ..LtLineArtStats::default()
    };
    let mut ring = [
        SanitizedRow::new(w),
        SanitizedRow::new(w),
        SanitizedRow::new(w),
    ];
    stats.sanitized_nan_pixels += ring[0].fill(0, w, normal_x, normal_y, normal_z, depth);
    if h > 1 {
        stats.sanitized_nan_pixels += ring[1].fill(1, w, normal_x, normal_y, normal_z, depth);
    }

    for y in 0..h {
        if y + 1 < h && y >= 1 {
            stats.sanitized_nan_pixels +=
                ring[(y + 1) % 3].fill(y + 1, w, normal_x, normal_y, normal_z, depth);
        }
        let (top, mid, bot) = (
            &ring[y.saturating_sub(1) % 3],
            &ring[y % 3],
            &ring[(y + 1).min(h - 1) % 3],
        );
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
                for l in 0..4 {
                    (dg[l], nd[l]) = eval_lt_stencil(top, mid, bot, x + l - 1, x + l, x + l + 1);
                }
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
            let (dg, nd) =
                eval_lt_stencil(top, mid, bot, x.saturating_sub(1), x, (x + 1).min(w - 1));
            let (a, de, ne) = lt_alpha_from_metrics(dg, nd, config);
            out_row[x] = a;
            stats.record(a, de, ne);
            x += 1;
        }
    }
    Ok(stats)
}
