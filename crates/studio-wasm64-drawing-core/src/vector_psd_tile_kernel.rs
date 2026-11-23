//! 실시간 벡터라이저 · 스트리밍 PSD/PSB 헤더 파서 · 64비트 256×256 타일 가상 메모리 스와퍼.

use std::collections::{HashMap, HashSet};

use crate::DrawingCoreError;

/// 기본 캔버스 타일 한 변 크기(px).
pub const TILE_DIM: u32 = 256;
/// 256×256 RGBA8 타일 1개의 비압축 바이트 크기(256 KiB).
pub const TILE_RGBA_BYTES: u64 = (TILE_DIM as u64) * (TILE_DIM as u64) * 4;
/// WebAssembly 32비트 주소 공간 경계(4 GiB).
const WASM32_LIMIT_BYTES: u64 = 1u64 << 32;

// ---------------------------------------------------------------------------
// 1. 실시간 Ramer-Douglas-Peucker + 3차 베지어 곡선 피팅 벡터라이저
// ---------------------------------------------------------------------------

/// 필압이 포함된 2D 입력 스트로크 샘플.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StrokePoint2D {
    pub x: f32,
    pub y: f32,
    pub pressure: f32,
}

/// 피팅된 3차 베지어 곡선 세그먼트.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CubicBezierSegment {
    pub p0: [f32; 2],
    pub c1: [f32; 2],
    pub c2: [f32; 2],
    pub p3: [f32; 2],
    pub width_start: f32,
    pub width_end: f32,
}

impl CubicBezierSegment {
    /// 매개변수 `t ∈ [0, 1]`에서 3차 베지어 곡선 좌표를 평가한다.
    #[must_use]
    pub fn eval(&self, t: f32) -> [f32; 2] {
        let u = 1.0 - t;
        let b0 = u * u * u;
        let b1 = 3.0 * u * u * t;
        let b2 = 3.0 * u * t * t;
        let b3 = t * t * t;
        [
            b0 * self.p0[0] + b1 * self.c1[0] + b2 * self.c2[0] + b3 * self.p3[0],
            b0 * self.p0[1] + b1 * self.c1[1] + b2 * self.c2[1] + b3 * self.p3[1],
        ]
    }
}

/// 벡터라이징 완료 결과.
#[derive(Debug, Clone, PartialEq)]
pub struct VectorizedStroke {
    pub simplified_points: Vec<StrokePoint2D>,
    pub segments: Vec<CubicBezierSegment>,
    pub max_fit_error: f32,
    pub compression_ratio: f32,
}

#[inline]
fn point_segment_distance(pt: StrokePoint2D, a: StrokePoint2D, b: StrokePoint2D) -> f32 {
    let abx = b.x - a.x;
    let aby = b.y - a.y;
    let apx = pt.x - a.x;
    let apy = pt.y - a.y;
    let ab_len_sq = abx * abx + aby * aby;
    if ab_len_sq <= 1e-12 {
        return apx.hypot(apy);
    }
    let t = ((apx * abx + apy * aby) / ab_len_sq).clamp(0.0, 1.0);
    let proj_x = a.x + t * abx;
    let proj_y = a.y + t * aby;
    (pt.x - proj_x).hypot(pt.y - proj_y)
}

/// 스택 기반 비재귀 Ramer-Douglas-Peucker 폴리라인 단순화.
fn simplify_rdp(points: &[StrokePoint2D], epsilon: f32) -> Vec<StrokePoint2D> {
    let n = points.len();
    if n <= 2 || epsilon <= 0.0 {
        return points.to_vec();
    }

    let mut keep = vec![false; n];
    keep[0] = true;
    keep[n - 1] = true;

    let mut stack = vec![(0usize, n - 1)];
    while let Some((start, end)) = stack.pop() {
        if end <= start + 1 {
            continue;
        }
        let mut max_dist = -1.0_f32;
        let mut split_idx = start;
        let a = points[start];
        let b = points[end];
        for (idx, &pt) in points.iter().enumerate().take(end).skip(start + 1) {
            let d = point_segment_distance(pt, a, b);
            if d > max_dist {
                max_dist = d;
                split_idx = idx;
            }
        }
        if max_dist > epsilon && split_idx > start && split_idx < end {
            keep[split_idx] = true;
            stack.push((start, split_idx));
            stack.push((split_idx, end));
        }
    }

    points
        .iter()
        .enumerate()
        .filter_map(|(i, &p)| if keep[i] { Some(p) } else { None })
        .collect()
}

#[inline]
fn normalize_vec2(dx: f32, dy: f32) -> [f32; 2] {
    let len = dx.hypot(dy);
    if len > 1e-6 {
        [dx / len, dy / len]
    } else {
        [1.0, 0.0]
    }
}

/// Schneider 최소제곱 3차 베지어 단일 세그먼트 피팅.
fn fit_single_cubic(
    pts: &[StrokePoint2D],
    tan_left: [f32; 2],
    tan_right: [f32; 2],
) -> (CubicBezierSegment, Vec<f32>) {
    let first = pts[0];
    let last = pts[pts.len() - 1];
    let n = pts.len();

    // 현 길이(chord-length) 매개변수화
    let mut u = vec![0.0_f32; n];
    let mut total_len = 0.0_f32;
    for i in 1..n {
        total_len += (pts[i].x - pts[i - 1].x).hypot(pts[i].y - pts[i - 1].y);
        u[i] = total_len;
    }
    if total_len > 1e-6 {
        for v in &mut u {
            *v /= total_len;
        }
    } else {
        for (i, v) in u.iter_mut().enumerate() {
            *v = i as f32 / (n.saturating_sub(1).max(1) as f32);
        }
    }

    let chord = (last.x - first.x).hypot(last.y - first.y);
    let default_alpha = (chord / 3.0).max(1e-3);

    if n <= 2 {
        let seg = CubicBezierSegment {
            p0: [first.x, first.y],
            c1: [
                first.x + tan_left[0] * default_alpha,
                first.y + tan_left[1] * default_alpha,
            ],
            c2: [
                last.x + tan_right[0] * default_alpha,
                last.y + tan_right[1] * default_alpha,
            ],
            p3: [last.x, last.y],
            width_start: first.pressure.clamp(0.0, 1.0),
            width_end: last.pressure.clamp(0.0, 1.0),
        };
        return (seg, u);
    }

    let mut c00 = 0.0_f64;
    let mut c01 = 0.0_f64;
    let mut c11 = 0.0_f64;
    let mut x0 = 0.0_f64;
    let mut x1 = 0.0_f64;

    for (i, &pt) in pts.iter().enumerate() {
        let t = f64::from(u[i]);
        let inv = 1.0 - t;
        let b0 = inv * inv * inv;
        let b1 = 3.0 * inv * inv * t;
        let b2 = 3.0 * inv * t * t;
        let b3 = t * t * t;

        let a1x = f64::from(tan_left[0]) * b1;
        let a1y = f64::from(tan_left[1]) * b1;
        let a2x = f64::from(tan_right[0]) * b2;
        let a2y = f64::from(tan_right[1]) * b2;

        c00 += a1x * a1x + a1y * a1y;
        c01 += a1x * a2x + a1y * a2y;
        c11 += a2x * a2x + a2y * a2y;

        let base_x = (b0 + b1) * f64::from(first.x) + (b2 + b3) * f64::from(last.x);
        let base_y = (b0 + b1) * f64::from(first.y) + (b2 + b3) * f64::from(last.y);
        let rx = f64::from(pt.x) - base_x;
        let ry = f64::from(pt.y) - base_y;

        x0 += a1x * rx + a1y * ry;
        x1 += a2x * rx + a2y * ry;
    }

    let det = c00 * c11 - c01 * c01;
    let (mut alpha_l, mut alpha_r) = if det.abs() > 1e-12 {
        (
            ((x0 * c11 - x1 * c01) / det) as f32,
            ((c00 * x1 - c01 * x0) / det) as f32,
        )
    } else {
        (default_alpha, default_alpha)
    };

    let seg_eps = 1e-6 * chord;
    if !alpha_l.is_finite()
        || !alpha_r.is_finite()
        || alpha_l < seg_eps
        || alpha_r < seg_eps
        || alpha_l > chord * 2.0
        || alpha_r > chord * 2.0
    {
        alpha_l = default_alpha;
        alpha_r = default_alpha;
    }

    let seg = CubicBezierSegment {
        p0: [first.x, first.y],
        c1: [
            first.x + tan_left[0] * alpha_l,
            first.y + tan_left[1] * alpha_l,
        ],
        c2: [
            last.x + tan_right[0] * alpha_r,
            last.y + tan_right[1] * alpha_r,
        ],
        p3: [last.x, last.y],
        width_start: first.pressure.clamp(0.0, 1.0),
        width_end: last.pressure.clamp(0.0, 1.0),
    };
    (seg, u)
}

fn max_cubic_fit_error(pts: &[StrokePoint2D], seg: &CubicBezierSegment, u: &[f32]) -> (f32, usize) {
    let mut max_err = 0.0_f32;
    let mut split_idx = pts.len() / 2;
    for (i, (&pt, &t)) in pts.iter().zip(u.iter()).enumerate() {
        let eval = seg.eval(t);
        let err = (pt.x - eval[0]).hypot(pt.y - eval[1]);
        if err > max_err {
            max_err = err;
            split_idx = i;
        }
    }
    (max_err, split_idx)
}

/// Ramer-Douglas-Peucker 단순화 후 최소제곱 3차 베지어 곡선으로 선화를 실시간 벡터라이징한다.
pub fn vectorize_stroke_to_cubic_beziers(
    points: &[StrokePoint2D],
    rdp_epsilon: f32,
    bezier_error_tolerance: f32,
) -> Result<VectorizedStroke, DrawingCoreError> {
    if !rdp_epsilon.is_finite() || rdp_epsilon < 0.0 {
        return Err(DrawingCoreError::InvalidParameter {
            name: "rdp_epsilon",
        });
    }
    if !bezier_error_tolerance.is_finite() || bezier_error_tolerance <= 0.0 {
        return Err(DrawingCoreError::InvalidParameter {
            name: "bezier_error_tolerance",
        });
    }
    for pt in points {
        if !pt.x.is_finite() || !pt.y.is_finite() || !pt.pressure.is_finite() {
            return Err(DrawingCoreError::InvalidParameter {
                name: "stroke_point",
            });
        }
    }

    if points.len() < 2 {
        return Ok(VectorizedStroke {
            simplified_points: points.to_vec(),
            segments: Vec::new(),
            max_fit_error: 0.0,
            compression_ratio: 1.0,
        });
    }

    let simplified = simplify_rdp(points, rdp_epsilon);
    if simplified.len() < 2 {
        return Ok(VectorizedStroke {
            simplified_points: simplified,
            segments: Vec::new(),
            max_fit_error: 0.0,
            compression_ratio: 1.0,
        });
    }

    // 스택 기반 분할 정복 3차 베지어 피팅 (재귀 오버플로 방지)
    let mut segments = Vec::new();
    let mut max_error = 0.0_f32;
    let init_tan_l = normalize_vec2(
        simplified[1].x - simplified[0].x,
        simplified[1].y - simplified[0].y,
    );
    let last_i = simplified.len() - 1;
    let init_tan_r = normalize_vec2(
        simplified[last_i - 1].x - simplified[last_i].x,
        simplified[last_i - 1].y - simplified[last_i].y,
    );

    let mut stack = vec![(0usize, last_i, init_tan_l, init_tan_r, 0u8)];
    while let Some((start, end, tan_l, tan_r, depth)) = stack.pop() {
        let slice = &simplified[start..=end];
        let (seg, u) = fit_single_cubic(slice, tan_l, tan_r);
        let (err, local_split) = max_cubic_fit_error(slice, &seg, &u);
        let global_split = start + local_split;

        if err <= bezier_error_tolerance
            || end <= start + 2
            || depth >= 10
            || global_split <= start
            || global_split >= end
        {
            if err > max_error {
                max_error = err;
            }
            segments.push(seg);
        } else {
            let prev = simplified[global_split - 1];
            let next = simplified[global_split + 1];
            let tan_center_right = normalize_vec2(prev.x - next.x, prev.y - next.y);
            let tan_center_left = [-tan_center_right[0], -tan_center_right[1]];
            // 오른쪽을 먼저 push해야 왼쪽 세그먼트가 순서대로 출력된다.
            stack.push((global_split, end, tan_center_left, tan_r, depth + 1));
            stack.push((start, global_split, tan_l, tan_center_right, depth + 1));
        }
    }

    let compression_ratio = if segments.is_empty() {
        1.0
    } else {
        points.len() as f32 / segments.len() as f32
    };

    Ok(VectorizedStroke {
        simplified_points: simplified,
        segments,
        max_fit_error: max_error,
        compression_ratio,
    })
}

// ---------------------------------------------------------------------------
// 2. 스트리밍 대용량 PSD/PSB 바이너리 헤더 고속 파서
// ---------------------------------------------------------------------------

/// Adobe PSD/PSB 컬러 모드 식별자.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PsdColorMode {
    Bitmap,
    Grayscale,
    Indexed,
    Rgb,
    Cmyk,
    Multichannel,
    Duotone,
    Lab,
    Unknown(u16),
}

impl PsdColorMode {
    fn from_u16(code: u16) -> Self {
        match code {
            0 => Self::Bitmap,
            1 => Self::Grayscale,
            2 => Self::Indexed,
            3 => Self::Rgb,
            4 => Self::Cmyk,
            7 => Self::Multichannel,
            8 => Self::Duotone,
            9 => Self::Lab,
            other => Self::Unknown(other),
        }
    }
}

/// 스트리밍 파싱된 PSD/PSB 헤더 및 섹션 64비트 오프셋 메타데이터.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PsdHeaderInfo {
    pub version: u16,
    pub is_psb: bool,
    pub channels: u16,
    pub height: u32,
    pub width: u32,
    pub depth_bits: u16,
    pub color_mode: PsdColorMode,
    pub color_mode_data_offset: u64,
    pub color_mode_data_length: u64,
    pub image_resources_offset: u64,
    pub image_resources_length: u64,
    pub layer_and_mask_offset: u64,
    pub layer_and_mask_length: u64,
    pub image_data_offset: u64,
    pub estimated_uncompressed_rgba_bytes: u64,
    pub requires_memory64: bool,
}

fn read_be_u16(bytes: &[u8], offset: usize) -> Result<u16, DrawingCoreError> {
    let slice = bytes
        .get(offset..offset + 2)
        .ok_or(DrawingCoreError::TruncatedInput {
            expected_min: offset + 2,
            actual: bytes.len(),
        })?;
    Ok(u16::from_be_bytes([slice[0], slice[1]]))
}

fn read_be_u32(bytes: &[u8], offset: usize) -> Result<u32, DrawingCoreError> {
    let slice = bytes
        .get(offset..offset + 4)
        .ok_or(DrawingCoreError::TruncatedInput {
            expected_min: offset + 4,
            actual: bytes.len(),
        })?;
    Ok(u32::from_be_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn read_be_u64(bytes: &[u8], offset: usize) -> Result<u64, DrawingCoreError> {
    let slice = bytes
        .get(offset..offset + 8)
        .ok_or(DrawingCoreError::TruncatedInput {
            expected_min: offset + 8,
            actual: bytes.len(),
        })?;
    Ok(u64::from_be_bytes([
        slice[0], slice[1], slice[2], slice[3], slice[4], slice[5], slice[6], slice[7],
    ]))
}

/// Adobe PSD(`version=1`) 및 PSB 대용량 문서(`version=2`)의 26바이트 헤더와 섹션 오프셋을
/// 전체 파일 복사 없이 64비트 오프셋 산술로 스트리밍 파싱한다.
pub fn parse_psd_header_streaming(bytes: &[u8]) -> Result<PsdHeaderInfo, DrawingCoreError> {
    if bytes.len() < 26 {
        return Err(DrawingCoreError::TruncatedInput {
            expected_min: 26,
            actual: bytes.len(),
        });
    }
    if &bytes[0..4] != b"8BPS" {
        return Err(DrawingCoreError::InvalidPsdSignature);
    }

    let version = read_be_u16(bytes, 4)?;
    if version != 1 && version != 2 {
        return Err(DrawingCoreError::UnsupportedPsdVersion(version));
    }
    let is_psb = version == 2;

    let channels = read_be_u16(bytes, 12)?;
    let height = read_be_u32(bytes, 14)?;
    let width = read_be_u32(bytes, 18)?;
    let depth_bits = read_be_u16(bytes, 22)?;
    let color_mode_raw = read_be_u16(bytes, 24)?;

    if channels == 0 || channels > 56 {
        return Err(DrawingCoreError::InvalidParameter { name: "channels" });
    }
    let max_dim = if is_psb { 300_000 } else { 30_000 };
    if width == 0 || height == 0 || width > max_dim || height > max_dim {
        return Err(DrawingCoreError::InvalidDimensions { width, height });
    }
    if !matches!(depth_bits, 1 | 8 | 16 | 32) {
        return Err(DrawingCoreError::InvalidParameter { name: "depth_bits" });
    }

    // 섹션 2: Color Mode Data (offset 26)
    let color_mode_data_offset = 26u64;
    let color_mode_data_length = u64::from(read_be_u32(bytes, 26)?);
    let image_resources_offset = color_mode_data_offset
        .checked_add(4)
        .and_then(|v| v.checked_add(color_mode_data_length))
        .ok_or(DrawingCoreError::InvalidParameter {
            name: "color_mode_data_length",
        })?;

    // 섹션 3: Image Resources
    let ir_off_usize =
        usize::try_from(image_resources_offset).map_err(|_| DrawingCoreError::TruncatedInput {
            expected_min: usize::MAX,
            actual: bytes.len(),
        })?;
    let image_resources_length = u64::from(read_be_u32(bytes, ir_off_usize)?);
    let layer_and_mask_offset = image_resources_offset
        .checked_add(4)
        .and_then(|v| v.checked_add(image_resources_length))
        .ok_or(DrawingCoreError::InvalidParameter {
            name: "image_resources_length",
        })?;

    // 섹션 4: Layer and Mask Information (PSD: u32 길이, PSB: u64 길이)
    let lm_off_usize =
        usize::try_from(layer_and_mask_offset).map_err(|_| DrawingCoreError::TruncatedInput {
            expected_min: usize::MAX,
            actual: bytes.len(),
        })?;
    let (lm_len_field_size, layer_and_mask_length) = if is_psb {
        (8u64, read_be_u64(bytes, lm_off_usize)?)
    } else {
        (4u64, u64::from(read_be_u32(bytes, lm_off_usize)?))
    };

    let image_data_offset = layer_and_mask_offset
        .checked_add(lm_len_field_size)
        .and_then(|v| v.checked_add(layer_and_mask_length))
        .ok_or(DrawingCoreError::InvalidParameter {
            name: "layer_and_mask_length",
        })?;

    let estimated_uncompressed_rgba_bytes = u64::from(width)
        .saturating_mul(u64::from(height))
        .saturating_mul(4);
    let requires_memory64 = is_psb || estimated_uncompressed_rgba_bytes >= WASM32_LIMIT_BYTES;

    Ok(PsdHeaderInfo {
        version,
        is_psb,
        channels,
        height,
        width,
        depth_bits,
        color_mode: PsdColorMode::from_u16(color_mode_raw),
        color_mode_data_offset,
        color_mode_data_length,
        image_resources_offset,
        image_resources_length,
        layer_and_mask_offset,
        layer_and_mask_length,
        image_data_offset,
        estimated_uncompressed_rgba_bytes,
        requires_memory64,
    })
}

// ---------------------------------------------------------------------------
// 3. 256×256 캔버스 타일 64비트 LRU 가상 메모리 스와퍼
// ---------------------------------------------------------------------------

/// 레이어·격자 좌표 기준 캔버스 타일 키.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TileKey {
    pub layer_id: u32,
    pub tile_x: u32,
    pub tile_y: u32,
}

/// 타일의 현재 상주 상태.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TileResidencyState {
    Resident {
        virtual_addr: u64,
        last_access_tick: u64,
    },
    SwappedOut {
        virtual_addr: u64,
        compressed_bytes: usize,
    },
}

/// 가상 타일 스와퍼 계측 통계.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SwapperStats {
    pub resident_tiles: usize,
    pub swapped_out_tiles: usize,
    pub resident_bytes: u64,
    pub budget_bytes: u64,
    pub next_virtual_addr: u64,
    pub swap_outs: u64,
    pub swap_ins: u64,
    pub cache_hits: u64,
    pub cache_misses: u64,
}

struct ResidentTileEntry {
    virtual_addr: u64,
    last_access_tick: u64,
    pixels: Vec<u8>,
}

struct SwappedTileEntry {
    virtual_addr: u64,
    compressed_rle: Vec<u8>,
}

/// RGBA 4바이트 단위 무손실 RLE 압축(스왑 백킹 스토어 시뮬레이션).
fn compress_tile_rle(raw: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(raw.len() / 4);
    let (px_chunks, _) = raw.as_chunks::<4>();
    let mut chunks = px_chunks.iter().peekable();
    while let Some(&px) = chunks.next() {
        let mut run: u16 = 1;
        while run < u16::MAX {
            match chunks.peek() {
                Some(&&next_px) if next_px == px => {
                    let _ = chunks.next();
                    run += 1;
                }
                _ => break,
            }
        }
        out.extend_from_slice(&run.to_le_bytes());
        out.extend_from_slice(&px);
    }
    out
}

/// RGBA 4바이트 단위 무손실 RLE 복원.
fn decompress_tile_rle(
    compressed: &[u8],
    expected_len: usize,
) -> Result<Vec<u8>, DrawingCoreError> {
    if !compressed.len().is_multiple_of(6) {
        return Err(DrawingCoreError::TruncatedInput {
            expected_min: compressed.len() + (6 - compressed.len() % 6),
            actual: compressed.len(),
        });
    }
    let mut out = Vec::with_capacity(expected_len);
    let (entries, _) = compressed.as_chunks::<6>();
    for entry in entries {
        let run = usize::from(u16::from_le_bytes([entry[0], entry[1]]));
        let px = &entry[2..6];
        for _ in 0..run {
            if out.len() + 4 > expected_len {
                return Err(DrawingCoreError::TileSizeMismatch {
                    expected: expected_len,
                    actual: out.len() + 4,
                });
            }
            out.extend_from_slice(px);
        }
    }
    if out.len() != expected_len {
        return Err(DrawingCoreError::TileSizeMismatch {
            expected: expected_len,
            actual: out.len(),
        });
    }
    Ok(out)
}

/// 64비트 글로벌 주소 공간(`u64`)과 상주 메모리 예산 상한을 갖춘 256×256 타일 LRU 가상 스와퍼.
pub struct VirtualTileSwapper64 {
    tile_bytes: usize,
    budget_bytes: u64,
    next_virtual_addr: u64,
    tick: u64,
    resident: HashMap<TileKey, ResidentTileEntry>,
    swapped: HashMap<TileKey, SwappedTileEntry>,
    pinned: HashSet<TileKey>,
    swap_outs: u64,
    swap_ins: u64,
    cache_hits: u64,
    cache_misses: u64,
}

impl VirtualTileSwapper64 {
    /// 기본 256×256 RGBA 타일(256 KiB) 크기로 스와퍼를 생성한다.
    pub fn new(budget_bytes: u64, base_virtual_addr: u64) -> Result<Self, DrawingCoreError> {
        Self::with_tile_bytes(TILE_RGBA_BYTES as usize, budget_bytes, base_virtual_addr)
    }

    /// 테스트 또는 커스텀 타일 크기용 생성자.
    pub fn with_tile_bytes(
        tile_bytes: usize,
        budget_bytes: u64,
        base_virtual_addr: u64,
    ) -> Result<Self, DrawingCoreError> {
        if tile_bytes == 0 || !tile_bytes.is_multiple_of(4) {
            return Err(DrawingCoreError::InvalidParameter { name: "tile_bytes" });
        }
        let min_bytes = tile_bytes as u64;
        if budget_bytes < min_bytes {
            return Err(DrawingCoreError::TileMemoryBudgetTooSmall {
                min_bytes,
                requested: budget_bytes,
            });
        }
        Ok(Self {
            tile_bytes,
            budget_bytes,
            next_virtual_addr: base_virtual_addr,
            tick: 0,
            resident: HashMap::new(),
            swapped: HashMap::new(),
            pinned: HashSet::new(),
            swap_outs: 0,
            swap_ins: 0,
            cache_hits: 0,
            cache_misses: 0,
        })
    }

    fn resident_bytes(&self) -> u64 {
        (self.resident.len() as u64).saturating_mul(self.tile_bytes as u64)
    }

    fn evict_one_lru(&mut self) -> Result<TileKey, DrawingCoreError> {
        let victim = self
            .resident
            .iter()
            .filter(|(key, _)| !self.pinned.contains(*key))
            .min_by_key(|(key, entry)| (entry.last_access_tick, *key))
            .map(|(key, _)| *key)
            .ok_or(DrawingCoreError::AllResidentTilesPinned)?;

        if let Some(entry) = self.resident.remove(&victim) {
            let compressed_rle = compress_tile_rle(&entry.pixels);
            self.swapped.insert(
                victim,
                SwappedTileEntry {
                    virtual_addr: entry.virtual_addr,
                    compressed_rle,
                },
            );
            self.swap_outs += 1;
        }
        Ok(victim)
    }

    fn ensure_room_for_one_more(&mut self) -> Result<(), DrawingCoreError> {
        let step = self.tile_bytes as u64;
        while self.resident_bytes().saturating_add(step) > self.budget_bytes {
            let _ = self.evict_one_lru()?;
        }
        Ok(())
    }

    /// 타일을 상주 메모리에 고정(pin)해 LRU 퇴거에서 제외한다.
    pub fn pin_tile(&mut self, key: TileKey) {
        self.pinned.insert(key);
    }

    /// 타일 고정을 해제한다.
    pub fn unpin_tile(&mut self, key: TileKey) {
        self.pinned.remove(&key);
    }

    /// 타일 RGBA 데이터를 기록하고 할당된 64비트 글로벌 가상 주소를 반환한다.
    pub fn write_tile(&mut self, key: TileKey, pixels: &[u8]) -> Result<u64, DrawingCoreError> {
        if pixels.len() != self.tile_bytes {
            return Err(DrawingCoreError::TileSizeMismatch {
                expected: self.tile_bytes,
                actual: pixels.len(),
            });
        }
        self.tick = self.tick.saturating_add(1);

        if let Some(entry) = self.resident.get_mut(&key) {
            entry.pixels.copy_from_slice(pixels);
            entry.last_access_tick = self.tick;
            self.cache_hits += 1;
            return Ok(entry.virtual_addr);
        }

        let virtual_addr = if let Some(swapped_entry) = self.swapped.remove(&key) {
            swapped_entry.virtual_addr
        } else {
            let addr = self.next_virtual_addr;
            self.next_virtual_addr = addr
                .checked_add(self.tile_bytes as u64)
                .ok_or(DrawingCoreError::VirtualAddressSpaceExhausted)?;
            addr
        };

        self.ensure_room_for_one_more()?;
        self.resident.insert(
            key,
            ResidentTileEntry {
                virtual_addr,
                last_access_tick: self.tick,
                pixels: pixels.to_vec(),
            },
        );
        Ok(virtual_addr)
    }

    /// 타일 RGBA 데이터를 조회한다. 스왑아웃된 타일은 무손실 복원하여 자동 스왑인한다.
    pub fn read_tile(&mut self, key: TileKey) -> Result<Option<&[u8]>, DrawingCoreError> {
        self.tick = self.tick.saturating_add(1);
        if let Some(entry) = self.resident.get_mut(&key) {
            self.cache_hits += 1;
            entry.last_access_tick = self.tick;
            return Ok(self.resident.get(&key).map(|e| e.pixels.as_slice()));
        }

        if let Some(swapped_entry) = self.swapped.remove(&key) {
            self.cache_misses += 1;
            let pixels = decompress_tile_rle(&swapped_entry.compressed_rle, self.tile_bytes)?;
            if let Err(err) = self.ensure_room_for_one_more() {
                // 롤백: 스왑인 실패 시 스왑 백킹 엔트리 복원
                self.swapped.insert(key, swapped_entry);
                return Err(err);
            }
            self.swap_ins += 1;
            self.resident.insert(
                key,
                ResidentTileEntry {
                    virtual_addr: swapped_entry.virtual_addr,
                    last_access_tick: self.tick,
                    pixels,
                },
            );
            return Ok(self.resident.get(&key).map(|e| e.pixels.as_slice()));
        }

        self.cache_misses += 1;
        Ok(None)
    }

    /// 특정 타일의 현재 상주 상태를 조회한다.
    #[must_use]
    pub fn tile_state(&self, key: TileKey) -> Option<TileResidencyState> {
        if let Some(e) = self.resident.get(&key) {
            return Some(TileResidencyState::Resident {
                virtual_addr: e.virtual_addr,
                last_access_tick: e.last_access_tick,
            });
        }
        self.swapped
            .get(&key)
            .map(|e| TileResidencyState::SwappedOut {
                virtual_addr: e.virtual_addr,
                compressed_bytes: e.compressed_rle.len(),
            })
    }

    /// 현재 스와퍼 통계 스냅샷을 반환한다.
    #[must_use]
    pub fn stats(&self) -> SwapperStats {
        SwapperStats {
            resident_tiles: self.resident.len(),
            swapped_out_tiles: self.swapped.len(),
            resident_bytes: self.resident_bytes(),
            budget_bytes: self.budget_bytes,
            next_virtual_addr: self.next_virtual_addr,
            swap_outs: self.swap_outs,
            swap_ins: self.swap_ins,
            cache_hits: self.cache_hits,
            cache_misses: self.cache_misses,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct SyntheticPsdSpec {
        version: u16,
        channels: u16,
        width: u32,
        height: u32,
        depth: u16,
        color_mode: u16,
        color_len: u32,
        res_len: u32,
        layer_len: u64,
    }

    fn build_synthetic_psd_header(spec: &SyntheticPsdSpec) -> Vec<u8> {
        let mut buf = Vec::new();
        buf.extend_from_slice(b"8BPS");
        buf.extend_from_slice(&spec.version.to_be_bytes());
        buf.extend_from_slice(&[0u8; 6]);
        buf.extend_from_slice(&spec.channels.to_be_bytes());
        buf.extend_from_slice(&spec.height.to_be_bytes());
        buf.extend_from_slice(&spec.width.to_be_bytes());
        buf.extend_from_slice(&spec.depth.to_be_bytes());
        buf.extend_from_slice(&spec.color_mode.to_be_bytes());

        buf.extend_from_slice(&spec.color_len.to_be_bytes());
        buf.resize(buf.len() + spec.color_len as usize, 0);

        buf.extend_from_slice(&spec.res_len.to_be_bytes());
        buf.resize(buf.len() + spec.res_len as usize, 0);

        if spec.version == 2 {
            buf.extend_from_slice(&spec.layer_len.to_be_bytes());
        } else {
            buf.extend_from_slice(&(spec.layer_len as u32).to_be_bytes());
        }
        buf
    }

    #[test]
    fn stroke_vectorizer_simplifies_and_fits_cubic_beziers_within_tolerance() {
        let mut pts = Vec::new();
        for i in 0..=80 {
            let t = i as f32 / 80.0;
            let x = t * 240.0;
            let y = 60.0 + (t * std::f32::consts::TAU).sin() * 32.0;
            let pressure = 0.2 + 0.8 * (t * std::f32::consts::PI).sin();
            pts.push(StrokePoint2D { x, y, pressure });
        }

        let result = vectorize_stroke_to_cubic_beziers(&pts, 0.4, 1.25).expect("vectorize ok");
        assert!(!result.segments.is_empty());
        assert!(result.segments.len() < pts.len() / 4);
        assert!(result.max_fit_error <= 1.25);
        assert!(result.compression_ratio > 4.0);
        // 시작/끝점 일치 검증
        let first_seg = result.segments.first().expect("first seg");
        let last_seg = result.segments.last().expect("last seg");
        assert!((first_seg.p0[0] - pts[0].x).abs() < 1e-4);
        assert!((last_seg.p3[0] - pts[pts.len() - 1].x).abs() < 1e-4);
    }

    #[test]
    fn stroke_vectorizer_handles_collinear_and_invalid_inputs() {
        let line: Vec<StrokePoint2D> = (0..30)
            .map(|i| StrokePoint2D {
                x: i as f32 * 5.0,
                y: i as f32 * 2.0,
                pressure: 0.5,
            })
            .collect();
        let res = vectorize_stroke_to_cubic_beziers(&line, 0.5, 0.5).expect("line ok");
        assert_eq!(res.simplified_points.len(), 2);
        assert_eq!(res.segments.len(), 1);
        assert!(res.max_fit_error < 1e-3);

        assert!(vectorize_stroke_to_cubic_beziers(&line, -1.0, 1.0).is_err());
        assert!(vectorize_stroke_to_cubic_beziers(&line, 0.5, 0.0).is_err());
    }

    #[test]
    fn streaming_psd_parser_handles_psd_v1_and_large_psb_v2() {
        let psd = build_synthetic_psd_header(&SyntheticPsdSpec {
            version: 1,
            channels: 4,
            width: 4096,
            height: 8192,
            depth: 8,
            color_mode: 3,
            color_len: 0,
            res_len: 128,
            layer_len: 65536,
        });
        let info = parse_psd_header_streaming(&psd).expect("psd v1 ok");
        assert_eq!(info.version, 1);
        assert!(!info.is_psb);
        assert_eq!(info.width, 4096);
        assert_eq!(info.height, 8192);
        assert_eq!(info.channels, 4);
        assert_eq!(info.depth_bits, 8);
        assert_eq!(info.color_mode, PsdColorMode::Rgb);
        assert_eq!(info.image_resources_offset, 30);
        assert_eq!(info.layer_and_mask_offset, 30 + 4 + 128);
        assert_eq!(info.image_data_offset, 30 + 4 + 128 + 4 + 65536);
        assert!(!info.requires_memory64);

        // 대용량 PSB v2 (40000 x 30000 -> 비압축 RGBA 약 4.8GB, > 4GiB memory64 필수)
        let psb_layer_len = 5_000_000_000u64;
        let psb = build_synthetic_psd_header(&SyntheticPsdSpec {
            version: 2,
            channels: 4,
            width: 40_000,
            height: 30_000,
            depth: 16,
            color_mode: 4,
            color_len: 16,
            res_len: 64,
            layer_len: psb_layer_len,
        });
        let psb_info = parse_psd_header_streaming(&psb).expect("psb v2 ok");
        assert!(psb_info.is_psb);
        assert_eq!(psb_info.color_mode, PsdColorMode::Cmyk);
        assert_eq!(psb_info.layer_and_mask_length, psb_layer_len);
        assert!(psb_info.requires_memory64);
        assert!(psb_info.image_data_offset > WASM32_LIMIT_BYTES);
    }

    #[test]
    fn streaming_psd_parser_rejects_bad_signature_version_and_truncation() {
        assert_eq!(
            parse_psd_header_streaming(b"PNG\r\n"),
            Err(DrawingCoreError::TruncatedInput {
                expected_min: 26,
                actual: 5
            })
        );
        let mut bad_sig = vec![0u8; 40];
        bad_sig[0..4].copy_from_slice(b"XXXX");
        assert_eq!(
            parse_psd_header_streaming(&bad_sig),
            Err(DrawingCoreError::InvalidPsdSignature)
        );
        let mut bad_ver = vec![0u8; 40];
        bad_ver[0..4].copy_from_slice(b"8BPS");
        bad_ver[4..6].copy_from_slice(&3u16.to_be_bytes());
        assert_eq!(
            parse_psd_header_streaming(&bad_ver),
            Err(DrawingCoreError::UnsupportedPsdVersion(3))
        );
    }

    #[test]
    fn virtual_tile_swapper64_enforces_budget_and_roundtrips_above_4gib() {
        // 4 GiB 경계를 넘는 64비트 가상 주소 공간에서 256×256 타일 2개 상한(512 KiB)으로 검증
        let base_addr = WASM32_LIMIT_BYTES + 0x10_0000;
        let budget = TILE_RGBA_BYTES * 2;
        let mut swapper = VirtualTileSwapper64::new(budget, base_addr).expect("swapper init");

        let make_tile = |seed: u8| -> Vec<u8> {
            let mut v = vec![0u8; TILE_RGBA_BYTES as usize];
            let (chunks, _) = v.as_chunks_mut::<4>();
            for (i, px) in chunks.iter_mut().enumerate() {
                px[0] = seed;
                px[1] = (i % 251) as u8;
                px[2] = ((i / 256) % 255) as u8;
                px[3] = 255;
            }
            v
        };

        let k0 = TileKey {
            layer_id: 1,
            tile_x: 0,
            tile_y: 0,
        };
        let k1 = TileKey {
            layer_id: 1,
            tile_x: 1,
            tile_y: 0,
        };
        let k2 = TileKey {
            layer_id: 1,
            tile_x: 2,
            tile_y: 0,
        };

        let t0 = make_tile(17);
        let t1 = make_tile(89);
        let t2 = make_tile(203);

        let a0 = swapper.write_tile(k0, &t0).expect("write k0");
        let a1 = swapper.write_tile(k1, &t1).expect("write k1");
        let a2 = swapper.write_tile(k2, &t2).expect("write k2");

        assert!(a0 >= WASM32_LIMIT_BYTES);
        assert_eq!(a1, a0 + TILE_RGBA_BYTES);
        assert_eq!(a2, a1 + TILE_RGBA_BYTES);

        // 예산 상한 엄수: k0이 LRU로 자동 스왑아웃되어야 한다.
        let stats = swapper.stats();
        assert!(stats.resident_bytes <= stats.budget_bytes);
        assert_eq!(stats.resident_tiles, 2);
        assert_eq!(stats.swapped_out_tiles, 1);
        assert_eq!(stats.swap_outs, 1);
        assert!(matches!(
            swapper.tile_state(k0),
            Some(TileResidencyState::SwappedOut { .. })
        ));

        // k0 재조회 시 무손실 복원 + 스왑인 확인
        let restored = swapper.read_tile(k0).expect("read k0").expect("k0 exists");
        assert_eq!(restored, t0.as_slice());
        assert_eq!(swapper.stats().swap_ins, 1);
        assert!(swapper.stats().resident_bytes <= budget);
    }

    #[test]
    fn virtual_tile_swapper64_respects_pinned_tiles_and_rejects_bad_budget() {
        assert!(VirtualTileSwapper64::new(TILE_RGBA_BYTES - 1, 0).is_err());

        let mut swapper =
            VirtualTileSwapper64::with_tile_bytes(64, 128, 0x2_0000_0000).expect("small swapper");
        let k0 = TileKey {
            layer_id: 0,
            tile_x: 0,
            tile_y: 0,
        };
        let k1 = TileKey {
            layer_id: 0,
            tile_x: 1,
            tile_y: 0,
        };
        let k2 = TileKey {
            layer_id: 0,
            tile_x: 2,
            tile_y: 0,
        };
        let tile = vec![42u8; 64];

        swapper.write_tile(k0, &tile).expect("k0");
        swapper.pin_tile(k0);
        swapper.write_tile(k1, &tile).expect("k1");
        // k0이 핀 고정되어 있으므로 k1이 퇴거되어야 한다.
        swapper.write_tile(k2, &tile).expect("k2");
        assert!(matches!(
            swapper.tile_state(k0),
            Some(TileResidencyState::Resident { .. })
        ));
        assert!(matches!(
            swapper.tile_state(k1),
            Some(TileResidencyState::SwappedOut { .. })
        ));

        // 모든 상주 타일 고정 시 안전 오류 반환
        swapper.pin_tile(k2);
        let k3 = TileKey {
            layer_id: 0,
            tile_x: 3,
            tile_y: 0,
        };
        assert_eq!(
            swapper.write_tile(k3, &tile),
            Err(DrawingCoreError::AllResidentTilesPinned)
        );
    }
}
