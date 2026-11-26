//! Wave-3 순수 안전 Rust 웹툰 세로 스크롤 스마트 슬라이서 & 64비트 타일 중복 제거 커널
//! (`webtoon_slicer_dedup_kernel`).
//!
//! - 수평 행 에너지(수평·수직 휘도 기울기 + 배경 편차) 분석
//! - 말풍선·얼굴·잉크 연속성 회피 페널티(좌우 외곽선 쌍 + 수직 전경 폭 연속성)
//! - 목표 높이 ± 탐색 창 내 최소 비용 안전 절단선 자동 계획 (`plan_webtoon_smart_slices`)
//! - 64비트 FNV-1a 타일 해싱·중복 제거(충돌 검증 포함) 및 투명/단색/콘텐츠 타일 분류기

use crate::{checked_rgba_len, DrawingCoreError};

/// 64비트 FNV-1a 표준 오프셋 베이시스.
pub const FNV1A_64_OFFSET_BASIS: u64 = 0xcbf2_9ce4_8422_2325;
/// 64비트 FNV-1a 표준 소수.
pub const FNV1A_64_PRIME: u64 = 0x0000_0100_0000_01b3;

/// 바이트 슬라이스에 대한 64비트 FNV-1a 해시를 계산한다.
#[inline]
#[must_use]
pub fn fnv1a_hash_64(bytes: &[u8]) -> u64 {
    let mut hash = FNV1A_64_OFFSET_BASIS;
    for &b in bytes {
        hash ^= u64::from(b);
        hash = hash.wrapping_mul(FNV1A_64_PRIME);
    }
    hash
}

/// 세로 스크롤 웹툰 스마트 슬라이싱 설정.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WebtoonSliceConfig {
    /// 권장 슬라이스 높이(px, 예: 1280).
    pub target_height: u32,
    /// 허용 최소 슬라이스 높이(px).
    pub min_height: u32,
    /// 허용 최대 슬라이스 높이(px).
    pub max_height: u32,
    /// 목표 절단선 주변 탐색 반경(px).
    pub search_window: u32,
    /// 배경 대비 잉크/전경 판정 L1 색상 임계값(0..=765, 기본 28).
    pub ink_l1_threshold: u32,
    /// 말풍선·잉크 연속성 회피 페널티 가중치(기본 4.0).
    pub continuity_weight: f32,
}

impl Default for WebtoonSliceConfig {
    fn default() -> Self {
        Self {
            target_height: 1280,
            min_height: 640,
            max_height: 2000,
            search_window: 240,
            ink_l1_threshold: 28,
            continuity_weight: 4.0,
        }
    }
}

/// 행별 에너지 및 말풍선·잉크 연속성 분석 지표.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RowCutMetrics {
    /// 수평·수직 에지 기울기 + 배경 편차 에너지 (`>= 0.0`).
    pub row_energy: f32,
    /// 배경 대비 비배경(전경/잉크) 픽셀 비율 (`0.0..=1.0`).
    pub ink_coverage: f32,
    /// 말풍선 내부·얼굴·연속 패널 절단 방지 페널티 (`>= 0.0`).
    pub continuity_penalty: f32,
    /// 최종 절단 비용 (`row_energy + continuity_weight * continuity_penalty`).
    pub combined_cost: f32,
}

/// 계획된 단일 웹툰 세로 슬라이스 구간 `[start_y, end_y)`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WebtoonSliceSpan {
    pub start_y: u32,
    pub end_y: u32,
    pub height: u32,
    pub cut_cost: f32,
    pub is_clean_gutter: bool,
}

#[inline]
fn rgb_luma_f32(r: u8, g: u8, b: u8) -> f32 {
    0.299 * f32::from(r) + 0.587 * f32::from(g) + 0.114 * f32::from(b)
}

#[inline]
fn rgba_l1_dist(a: [u8; 4], b: [u8; 4]) -> u32 {
    u32::from(a[0].abs_diff(b[0]))
        + u32::from(a[1].abs_diff(b[1]))
        + u32::from(a[2].abs_diff(b[2]))
        + u32::from(a[3].abs_diff(b[3]))
}

#[inline]
fn estimate_row_bg(row: &[u8], width: usize) -> [u8; 4] {
    // 좌우 여백 가장자리 픽셀을 기준으로 해당 행의 여백 배경색을 추정한다.
    let left = [row[0], row[1], row[2], row[3]];
    if width <= 1 {
        return left;
    }
    let off = (width - 1) * 4;
    let right = [row[off], row[off + 1], row[off + 2], row[off + 3]];
    [
        ((u16::from(left[0]) + u16::from(right[0])) / 2) as u8,
        ((u16::from(left[1]) + u16::from(right[1])) / 2) as u8,
        ((u16::from(left[2]) + u16::from(right[2])) / 2) as u8,
        ((u16::from(left[3]) + u16::from(right[3])) / 2) as u8,
    ]
}

/// RGBA8 세로 스트립의 각 행에 대해 수평 에너지, 잉크 점유율, 말풍선·전경 연속성 페널티를 분석한다.
pub fn analyze_webtoon_row_energies(
    rgba: &[u8],
    width: u32,
    height: u32,
    ink_l1_threshold: u32,
    continuity_weight: f32,
) -> Result<Vec<RowCutMetrics>, DrawingCoreError> {
    let expected = checked_rgba_len(width, height)?;
    if rgba.len() != expected {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected,
            actual: rgba.len(),
        });
    }
    if ink_l1_threshold > 1020 {
        return Err(DrawingCoreError::InvalidParameter {
            name: "ink_l1_threshold",
        });
    }
    if !continuity_weight.is_finite() || continuity_weight < 0.0 || continuity_weight > 100.0 {
        return Err(DrawingCoreError::InvalidParameter {
            name: "continuity_weight",
        });
    }

    let w = width as usize;
    let h = height as usize;
    let row_bytes = w * 4;
    let inv_w = 1.0 / (w as f32);

    let mut row_energy = vec![0.0_f32; h];
    let mut ink_cov = vec![0.0_f32; h];
    let mut span_min_x = vec![w; h];
    let mut span_max_x = vec![0usize; h];
    let mut edge_transitions = vec![0u32; h];

    for y in 0..h {
        let row = &rgba[y * row_bytes..(y + 1) * row_bytes];
        let prev_row = if y > 0 {
            Some(&rgba[(y - 1) * row_bytes..y * row_bytes])
        } else {
            None
        };
        let bg = estimate_row_bg(row, w);

        let mut h_grad_sum = 0.0_f32;
        let mut v_grad_sum = 0.0_f32;
        let mut bg_dev_sum = 0.0_f32;
        let mut ink_pixels = 0u32;
        let mut transitions = 0u32;
        let mut prev_luma = rgb_luma_f32(row[0], row[1], row[2]);
        let mut prev_is_ink = false;
        let mut min_x = w;
        let mut max_x = 0usize;

        for x in 0..w {
            let off = x * 4;
            let px = [row[off], row[off + 1], row[off + 2], row[off + 3]];
            let luma = rgb_luma_f32(px[0], px[1], px[2]);
            if x > 0 {
                h_grad_sum += (luma - prev_luma).abs();
            }
            if let Some(pr) = prev_row {
                let p_luma = rgb_luma_f32(pr[off], pr[off + 1], pr[off + 2]);
                v_grad_sum += (luma - p_luma).abs();
            }
            prev_luma = luma;

            let dist = rgba_l1_dist(px, bg);
            bg_dev_sum += dist as f32;
            let is_ink = dist > ink_l1_threshold;
            if is_ink {
                ink_pixels += 1;
                if x < min_x {
                    min_x = x;
                }
                if x > max_x {
                    max_x = x;
                }
            }
            if x > 0 && is_ink != prev_is_ink {
                transitions += 1;
            }
            prev_is_ink = is_ink;
        }

        // 정규화된 행 에너지: 수평/수직 기울기 + 배경 편차
        let norm_h = (h_grad_sum * inv_w) / 255.0;
        let norm_v = (v_grad_sum * inv_w) / 255.0;
        let norm_bg = (bg_dev_sum * inv_w) / 1020.0;
        row_energy[y] = norm_h * 0.50 + norm_v * 0.30 + norm_bg * 0.20;
        ink_cov[y] = (ink_pixels as f32) * inv_w;
        span_min_x[y] = min_x;
        span_max_x[y] = max_x;
        edge_transitions[y] = transitions;
    }

    let mut metrics = Vec::with_capacity(h);
    for y in 0..h {
        let mut penalty = 0.0_f32;
        // 1) 좌우 윤곽선 전이 >= 2 (말풍선 외곽선·내부 글자 스트로크가 행을 가로지름)
        if edge_transitions[y] >= 2 {
            let span_ratio = if span_max_x[y] > span_min_x[y] {
                ((span_max_x[y] - span_min_x[y]) as f32) * inv_w
            } else {
                0.0
            };
            let trans_factor = ((edge_transitions[y] as f32) * 0.25).min(2.0);
            penalty += 0.35 * trans_factor + 0.40 * span_ratio;
        }
        // 2) 상하 인접 행과 전경 X-스팬이 겹치는 수직 연속 객체(말풍선·얼굴·캐릭터 몸체)
        if y > 0 && y + 1 < h {
            let above_has = span_min_x[y - 1] < span_max_x[y - 1];
            let below_has = span_min_x[y + 1] < span_max_x[y + 1];
            if above_has && below_has {
                let ov_l = span_min_x[y - 1].max(span_min_x[y + 1]);
                let ov_r = span_max_x[y - 1].min(span_max_x[y + 1]);
                if ov_r > ov_l {
                    let overlap_ratio = ((ov_r - ov_l) as f32) * inv_w;
                    penalty += 0.75 * overlap_ratio + 0.5 * (ink_cov[y - 1] + ink_cov[y + 1]);
                }
            }
        }
        // 3) 현재 행 자체의 전경 점유율 페널티
        penalty += ink_cov[y];

        let combined_cost = row_energy[y] + continuity_weight * penalty;
        metrics.push(RowCutMetrics {
            row_energy: row_energy[y],
            ink_coverage: ink_cov[y],
            continuity_penalty: penalty,
            combined_cost,
        });
    }

    Ok(metrics)
}

/// 말풍선·얼굴·잉크 연속 영역을 회피해 세로 스크롤 웹툰의 최적 슬라이스 구간을 계획한다.
pub fn plan_webtoon_smart_slices(
    rgba: &[u8],
    width: u32,
    height: u32,
    cfg: &WebtoonSliceConfig,
) -> Result<Vec<WebtoonSliceSpan>, DrawingCoreError> {
    if cfg.min_height == 0 || cfg.target_height < cfg.min_height || cfg.max_height < cfg.target_height
    {
        return Err(DrawingCoreError::InvalidParameter {
            name: "slice_heights",
        });
    }

    let metrics = analyze_webtoon_row_energies(
        rgba,
        width,
        height,
        cfg.ink_l1_threshold,
        cfg.continuity_weight,
    )?;

    if height <= cfg.max_height {
        return Ok(vec![WebtoonSliceSpan {
            start_y: 0,
            end_y: height,
            height,
            cut_cost: 0.0,
            is_clean_gutter: true,
        }]);
    }

    let mut spans = Vec::new();
    let mut cursor = 0u32;

    while cursor < height {
        let remaining = height - cursor;
        if remaining <= cfg.max_height {
            spans.push(WebtoonSliceSpan {
                start_y: cursor,
                end_y: height,
                height: remaining,
                cut_cost: 0.0,
                is_clean_gutter: true,
            });
            break;
        }

        let ideal_y = cursor.saturating_add(cfg.target_height);
        let lo = cursor
            .saturating_add(cfg.min_height)
            .max(ideal_y.saturating_sub(cfg.search_window))
            .min(height - 1);
        let hi = cursor
            .saturating_add(cfg.max_height)
            .min(ideal_y.saturating_add(cfg.search_window))
            .min(height - 1);

        let win_denom = (cfg.search_window.max(1)) as f32;
        let mut best_y = ideal_y.clamp(lo, hi);
        let mut best_score = f32::INFINITY;
        let mut best_raw_cost = f32::INFINITY;

        for y in lo..=hi {
            // 3행 이동 평균으로 1px 잡음을 억제하면서 깨끗한 여백 중심을 선호한다.
            let m = metrics[y as usize].combined_cost;
            let m_prev = metrics[y.saturating_sub(1) as usize].combined_cost;
            let m_next = metrics[(y + 1).min(height - 1) as usize].combined_cost;
            let local_cost = 0.5 * m + 0.25 * (m_prev + m_next);
            let dist_bias = ((y.abs_diff(ideal_y) as f32) / win_denom) * 0.02;
            let score = local_cost + dist_bias;
            if score < best_score {
                best_score = score;
                best_raw_cost = local_cost;
                best_y = y;
            }
        }

        let is_clean_gutter =
            best_raw_cost <= 0.015 && metrics[best_y as usize].ink_coverage <= 0.002;
        spans.push(WebtoonSliceSpan {
            start_y: cursor,
            end_y: best_y,
            height: best_y - cursor,
            cut_cost: best_raw_cost,
            is_clean_gutter,
        });
        cursor = best_y;
    }

    Ok(spans)
}

/// 타일 내용 분류기 열거형.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum TileClass {
    /// 모든 픽셀의 알파 채널이 0인 완전 투명 타일.
    EmptyTransparent = 0,
    /// 모든 픽셀의 RGBA가 동일한 단색(배경/여백) 타일.
    SolidColor = 1,
    /// 이질적인 콘텐츠(선화·채색·텍스트)가 포함된 일반 타일.
    Content = 2,
}

/// 단일 타일의 64비트 FNV-1a 해시 및 중복 제거 메타데이터.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TileDedupEntry {
    pub tile_index: u32,
    pub tile_x: u32,
    pub tile_y: u32,
    pub tile_width: u32,
    pub tile_height: u32,
    pub class: TileClass,
    pub fnv1a_64: u64,
    pub canonical_tile_index: u32,
    pub solid_rgba: [u8; 4],
}

/// 전체 타일 그리드 중복 제거·빈 타일 분류 보고서.
#[derive(Debug, Clone, PartialEq)]
pub struct TileDedupReport {
    pub tiles_x: u32,
    pub tiles_y: u32,
    pub total_tiles: u32,
    pub unique_tiles: u32,
    pub duplicate_tiles: u32,
    pub empty_transparent_tiles: u32,
    pub solid_color_tiles: u32,
    pub content_tiles: u32,
    pub dedup_ratio: f32,
    pub entries: Vec<TileDedupEntry>,
}

/// RGBA8 이미지를 `tile_size × tile_size` 타일로 분할해 64비트 FNV-1a 중복 제거와 빈 타일 분류를 수행한다.
pub fn classify_and_dedup_tiles(
    rgba: &[u8],
    width: u32,
    height: u32,
    tile_size: u32,
) -> Result<TileDedupReport, DrawingCoreError> {
    let expected = checked_rgba_len(width, height)?;
    if rgba.len() != expected {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected,
            actual: rgba.len(),
        });
    }
    if tile_size == 0 || tile_size > 2048 {
        return Err(DrawingCoreError::InvalidParameter { name: "tile_size" });
    }

    let tiles_x = width.div_ceil(tile_size);
    let tiles_y = height.div_ceil(tile_size);
    let total_tiles = tiles_x
        .checked_mul(tiles_y)
        .ok_or(DrawingCoreError::InvalidDimensions { width, height })?;

    struct DedupSlot {
        tw: u32,
        th: u32,
        hash64: u64,
        canonical_idx: u32,
        bytes: Vec<u8>,
    }

    let img_w = width as usize;
    let ts = tile_size as usize;
    let mut entries = Vec::with_capacity(total_tiles as usize);
    // wasm32-unknown-unknown 안전(RandomState 미사용) 결정적 O(1) FNV-64 버킷 테이블 (충돌 오탐 0%)
    let bucket_count = (total_tiles as usize).max(16).next_power_of_two();
    let bucket_mask = bucket_count - 1;
    let mut buckets: Vec<Vec<DedupSlot>> = (0..bucket_count).map(|_| Vec::new()).collect();

    let mut unique_tiles = 0u32;
    let mut duplicate_tiles = 0u32;
    let mut empty_transparent_tiles = 0u32;
    let mut solid_color_tiles = 0u32;
    let mut content_tiles = 0u32;
    let mut tile_buf = Vec::with_capacity(ts * ts * 4);

    for ty in 0..tiles_y {
        let y0 = (ty as usize) * ts;
        let th = ((height as usize) - y0).min(ts);
        for tx in 0..tiles_x {
            let x0 = (tx as usize) * ts;
            let tw = (img_w - x0).min(ts);
            let tile_index = ty * tiles_x + tx;

            tile_buf.clear();
            let mut all_transparent = true;
            let mut all_same = true;
            let first_off = (y0 * img_w + x0) * 4;
            let first_px = [
                rgba[first_off],
                rgba[first_off + 1],
                rgba[first_off + 2],
                rgba[first_off + 3],
            ];

            for dy in 0..th {
                let row_off = ((y0 + dy) * img_w + x0) * 4;
                let row_slice = &rgba[row_off..row_off + tw * 4];
                tile_buf.extend_from_slice(row_slice);
                if all_transparent || all_same {
                    for &px in row_slice.as_chunks::<4>().0 {
                        if px[3] != 0 {
                            all_transparent = false;
                        }
                        if px != first_px {
                            all_same = false;
                        }
                    }
                }
            }

            let class = if all_transparent {
                empty_transparent_tiles += 1;
                TileClass::EmptyTransparent
            } else if all_same {
                solid_color_tiles += 1;
                TileClass::SolidColor
            } else {
                content_tiles += 1;
                TileClass::Content
            };

            let hash64 = fnv1a_hash_64(&tile_buf);
            let b_idx = ((hash64 ^ (hash64 >> 32)) as usize) & bucket_mask;
            let bucket = &mut buckets[b_idx];
            let canonical_tile_index = if let Some(slot) = bucket.iter().find(|s| {
                s.hash64 == hash64
                    && s.tw == tw as u32
                    && s.th == th as u32
                    && s.bytes.as_slice() == tile_buf.as_slice()
            }) {
                duplicate_tiles += 1;
                slot.canonical_idx
            } else {
                unique_tiles += 1;
                bucket.push(DedupSlot {
                    tw: tw as u32,
                    th: th as u32,
                    hash64,
                    canonical_idx: tile_index,
                    bytes: tile_buf.clone(),
                });
                tile_index
            };

            entries.push(TileDedupEntry {
                tile_index,
                tile_x: tx,
                tile_y: ty,
                tile_width: tw as u32,
                tile_height: th as u32,
                class,
                fnv1a_64: hash64,
                canonical_tile_index,
                solid_rgba: if class == TileClass::Content {
                    [0, 0, 0, 0]
                } else {
                    first_px
                },
            });
        }
    }

    let dedup_ratio = if total_tiles > 0 {
        (duplicate_tiles as f32) / (total_tiles as f32)
    } else {
        0.0
    };

    Ok(TileDedupReport {
        tiles_x,
        tiles_y,
        total_tiles,
        unique_tiles,
        duplicate_tiles,
        empty_transparent_tiles,
        solid_color_tiles,
        content_tiles,
        dedup_ratio,
        entries,
    })
}
