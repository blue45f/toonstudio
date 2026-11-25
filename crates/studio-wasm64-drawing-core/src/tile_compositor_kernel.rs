//! 256×256 희소 타일 Dirty-Rect 12종 블렌드 합성기 및 64비트 주소공간 아레나 계획기.
//!
//! 1. 12종 웹툰·일러스트 핵심 블렌드 모드(`TileBlendMode`) + `opacity_u8` + Dirty-Rect 경계 클램프
//!    + 자동 벡터화 친화 고정 청크 슬라이스 루프(`composite_tile_dirty_rect`)
//! 2. `u64` 타일 바이트 오프셋 기반 희소 타일 아레나 계획기(`SparseTileArenaPlan`):
//!    `wasm32` 4 GiB 상한 vs `wasm64` 16 GiB+ 확장 타일 수·OPFS 스필 워터마크 산출.

use crate::{checked_rgba_len, DrawingCoreError, TILE_DIM, TILE_RGBA_BYTES};

/// 표준 희소 타일 크기(256px · 256 KiB) 및 주소공간 기준 상수.
pub const COMPOSITOR_TILE_DIM: u32 = TILE_DIM;
pub const COMPOSITOR_TILE_RGBA_BYTES: u64 = TILE_RGBA_BYTES;
pub const WASM32_ADDRESS_LIMIT_BYTES: u64 = 1u64 << 32;
pub const WASM64_DEFAULT_BUDGET_BYTES: u64 = 16 * 1024 * 1024 * 1024;

/// 웹툰·일러스트 핵심 12종 레이어 블렌드 모드.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TileBlendMode {
    Normal = 0,
    Multiply = 1,
    Screen = 2,
    Overlay = 3,
    SoftLight = 4,
    HardLight = 5,
    ColorDodge = 6,
    ColorBurn = 7,
    Darken = 8,
    Lighten = 9,
    LinearBurn = 10,
    Add = 11,
}

impl TileBlendMode {
    pub const ALL: [Self; 12] = [
        Self::Normal,
        Self::Multiply,
        Self::Screen,
        Self::Overlay,
        Self::SoftLight,
        Self::HardLight,
        Self::ColorDodge,
        Self::ColorBurn,
        Self::Darken,
        Self::Lighten,
        Self::LinearBurn,
        Self::Add,
    ];

    #[must_use]
    pub const fn from_u32(code: u32) -> Option<Self> {
        match code {
            0 => Some(Self::Normal),
            1 => Some(Self::Multiply),
            2 => Some(Self::Screen),
            3 => Some(Self::Overlay),
            4 => Some(Self::SoftLight),
            5 => Some(Self::HardLight),
            6 => Some(Self::ColorDodge),
            7 => Some(Self::ColorBurn),
            8 => Some(Self::Darken),
            9 => Some(Self::Lighten),
            10 => Some(Self::LinearBurn),
            11 => Some(Self::Add),
            _ => None,
        }
    }
}

/// 타일 로컬 좌표계 기준 갱신 사각형(Dirty-Rect).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DirtyRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

impl DirtyRect {
    #[inline]
    #[must_use]
    pub fn clamp_to_bounds(
        self,
        tile_width: u32,
        tile_height: u32,
    ) -> Option<(usize, usize, usize, usize)> {
        if self.width == 0 || self.height == 0 || self.x >= tile_width || self.y >= tile_height {
            return None;
        }
        let x1 = self.x.saturating_add(self.width).min(tile_width);
        let y1 = self.y.saturating_add(self.height).min(tile_height);
        (x1 > self.x && y1 > self.y).then_some((
            self.x as usize,
            self.y as usize,
            x1 as usize,
            y1 as usize,
        ))
    }
}

#[inline(never)]
fn to_u8_clamped(v: f32) -> u8 {
    (v.clamp(0.0, 1.0) * 255.0).round() as u8
}

#[inline]
fn blend_overlay(base: f32, top: f32) -> f32 {
    if base <= 0.5 {
        2.0 * base * top
    } else {
        1.0 - 2.0 * (1.0 - base) * (1.0 - top)
    }
}

/// 12종 웹툰·일러스트 블렌드 수식(W3C Compositing & Blending Level 1 기준).
#[inline(never)]
fn blend_channel(mode: TileBlendMode, b: f32, s: f32) -> f32 {
    match mode {
        TileBlendMode::Normal => s,
        TileBlendMode::Multiply => b * s,
        TileBlendMode::Screen => b + s - b * s,
        TileBlendMode::Overlay => blend_overlay(b, s),
        TileBlendMode::SoftLight => {
            if s <= 0.5 {
                b - (1.0 - 2.0 * s) * b * (1.0 - b)
            } else {
                let d = if b <= 0.25 {
                    ((16.0 * b - 12.0) * b + 4.0) * b
                } else {
                    b.sqrt()
                };
                b + (2.0 * s - 1.0) * (d - b)
            }
        }
        TileBlendMode::HardLight => blend_overlay(s, b),
        TileBlendMode::ColorDodge => {
            if b <= 0.0 {
                0.0
            } else if s >= 1.0 {
                1.0
            } else {
                (b / (1.0 - s)).min(1.0)
            }
        }
        TileBlendMode::ColorBurn => {
            if b >= 1.0 {
                1.0
            } else if s <= 0.0 {
                0.0
            } else {
                1.0 - ((1.0 - b) / s).min(1.0)
            }
        }
        TileBlendMode::Darken => b.min(s),
        TileBlendMode::Lighten => b.max(s),
        TileBlendMode::LinearBurn => (b + s - 1.0).max(0.0),
        TileBlendMode::Add => (b + s).min(1.0),
    }
}

#[inline(never)]
fn compose_channel(
    cb: u8,
    cs: u8,
    mode: TileBlendMode,
    ab: f32,
    as_eff: f32,
    inv_out_a: f32,
) -> u8 {
    let inv_255 = 1.0_f32 / 255.0;
    let (b, s) = (f32::from(cb) * inv_255, f32::from(cs) * inv_255);
    let b_val = blend_channel(mode, b, s);
    let c_mix = (1.0 - ab) * s + ab * b_val;
    to_u8_clamped((as_eff * c_mix + ab * (1.0 - as_eff) * b) * inv_out_a)
}

/// 256×256(또는 임의 규격) 희소 타일의 Dirty-Rect 구간만 12종 블렌드 모드로 RGBA8 합성한다.
pub fn composite_tile_dirty_rect(
    dst_rgba: &mut [u8],
    src_rgba: &[u8],
    tile_width: u32,
    tile_height: u32,
    dirty: DirtyRect,
    blend_mode: TileBlendMode,
    opacity_u8: u8,
) -> Result<usize, DrawingCoreError> {
    let expected = checked_rgba_len(tile_width, tile_height)?;
    if dst_rgba.len() != expected {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected,
            actual: dst_rgba.len(),
        });
    }
    if src_rgba.len() != expected {
        return Err(DrawingCoreError::BufferLengthMismatch {
            expected,
            actual: src_rgba.len(),
        });
    }
    if opacity_u8 == 0 {
        return Ok(0);
    }
    let Some((x0, y0, x1, y1)) = dirty.clamp_to_bounds(tile_width, tile_height) else {
        return Ok(0);
    };

    let (row_bytes, span_start, span_end) = ((tile_width as usize) * 4, x0 * 4, x1 * 4);
    let inv_255 = 1.0_f32 / 255.0;
    let opacity_f = f32::from(opacity_u8) * inv_255;
    let mut processed = 0usize;

    for y in y0..y1 {
        let row_off = y * row_bytes;
        let (Some(dst_span), Some(src_span)) = (
            dst_rgba.get_mut(row_off + span_start..row_off + span_end),
            src_rgba.get(row_off + span_start..row_off + span_end),
        ) else {
            break;
        };
        let (dst_px, _) = dst_span.as_chunks_mut::<4>();
        let (src_px, _) = src_span.as_chunks::<4>();
        for (d, &s) in dst_px.iter_mut().zip(src_px.iter()) {
            processed += 1;
            if s[3] == 0 {
                continue;
            }
            let as_eff = f32::from(s[3]) * inv_255 * opacity_f;
            let ab = f32::from(d[3]) * inv_255;
            let inv_as = 1.0 - as_eff;
            let out_a = as_eff + ab * inv_as;
            if out_a <= 1e-6 {
                *d = [0, 0, 0, 0];
                continue;
            }
            let inv_out_a = 1.0 / out_a;
            for c in 0..3 {
                d[c] = compose_channel(d[c], s[c], blend_mode, ab, as_eff, inv_out_a);
            }
            d[3] = to_u8_clamped(out_a);
        }
    }
    Ok(processed)
}

/// WebAssembly 선형 주소공간 모드.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AddressSpaceMode {
    Wasm32 = 0,
    Wasm64 = 1,
}

/// 희소 타일 아레나 예산·OPFS 스필 워터마크 입력 설정.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SparseTileArenaConfig {
    pub mode: AddressSpaceMode,
    pub canvas_width: u32,
    pub canvas_height: u32,
    pub layer_count: u32,
    pub tile_dim: u32,
    pub bytes_per_pixel: u32,
    pub budget_bytes: u64,
    pub opfs_spill_high_watermark_pct: u8,
    pub opfs_spill_low_watermark_pct: u8,
    pub base_offset_bytes: u64,
}

/// 64비트(`u64`) 주소공간 호환 희소 타일 아레나·OPFS 스필 계획.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SparseTileArenaPlan {
    pub mode: AddressSpaceMode,
    pub tile_dim: u32,
    pub tile_bytes: u64,
    pub tiles_x: u32,
    pub tiles_y: u32,
    pub layer_count: u32,
    pub tiles_per_layer: u64,
    pub total_logical_tiles: u64,
    pub total_logical_bytes: u64,
    pub effective_budget_bytes: u64,
    pub max_resident_tiles: u64,
    pub opfs_spill_high_watermark_bytes: u64,
    pub opfs_spill_high_watermark_tiles: u64,
    pub opfs_spill_low_watermark_bytes: u64,
    pub opfs_spill_low_watermark_tiles: u64,
    pub exceeds_wasm32_4gib: bool,
    pub requires_opfs_spill: bool,
    pub base_offset_bytes: u64,
}

impl SparseTileArenaPlan {
    /// `wasm32`(4 GiB 상한) vs `wasm64`(16 GiB+ 확장) 상주 타일 수 및 OPFS 스필 워터마크를 계산한다.
    pub fn compute(cfg: &SparseTileArenaConfig) -> Result<Self, DrawingCoreError> {
        if cfg.canvas_width == 0 || cfg.canvas_height == 0 {
            return Err(DrawingCoreError::InvalidDimensions {
                width: cfg.canvas_width,
                height: cfg.canvas_height,
            });
        }
        if cfg.layer_count == 0 {
            return Err(DrawingCoreError::InvalidParameter {
                name: "layer_count",
            });
        }
        if cfg.tile_dim == 0 {
            return Err(DrawingCoreError::InvalidParameter { name: "tile_dim" });
        }
        if cfg.bytes_per_pixel == 0 || cfg.bytes_per_pixel > 32 {
            return Err(DrawingCoreError::InvalidParameter {
                name: "bytes_per_pixel",
            });
        }
        if cfg.opfs_spill_high_watermark_pct == 0
            || cfg.opfs_spill_high_watermark_pct > 99
            || cfg.opfs_spill_low_watermark_pct == 0
            || cfg.opfs_spill_low_watermark_pct >= cfg.opfs_spill_high_watermark_pct
        {
            return Err(DrawingCoreError::InvalidParameter {
                name: "opfs_spill_watermark",
            });
        }

        let tile_bytes = u64::from(cfg.tile_dim)
            .checked_mul(u64::from(cfg.tile_dim))
            .and_then(|px| px.checked_mul(u64::from(cfg.bytes_per_pixel)))
            .ok_or(DrawingCoreError::VirtualAddressSpaceExhausted)?;
        let effective_budget_bytes = match cfg.mode {
            AddressSpaceMode::Wasm32 => cfg.budget_bytes.min(WASM32_ADDRESS_LIMIT_BYTES),
            AddressSpaceMode::Wasm64 => cfg.budget_bytes,
        };
        if effective_budget_bytes < tile_bytes {
            return Err(DrawingCoreError::TileMemoryBudgetTooSmall {
                min_bytes: tile_bytes,
                requested: effective_budget_bytes,
            });
        }

        let (tiles_x, tiles_y) = (
            cfg.canvas_width.div_ceil(cfg.tile_dim),
            cfg.canvas_height.div_ceil(cfg.tile_dim),
        );
        let tiles_per_layer = u64::from(tiles_x)
            .checked_mul(u64::from(tiles_y))
            .ok_or(DrawingCoreError::VirtualAddressSpaceExhausted)?;
        let total_logical_tiles = tiles_per_layer
            .checked_mul(u64::from(cfg.layer_count))
            .ok_or(DrawingCoreError::VirtualAddressSpaceExhausted)?;
        let total_logical_bytes = total_logical_tiles
            .checked_mul(tile_bytes)
            .ok_or(DrawingCoreError::VirtualAddressSpaceExhausted)?;
        let max_resident_tiles = effective_budget_bytes / tile_bytes;
        let high_tiles = ((u128::from(max_resident_tiles)
            * u128::from(cfg.opfs_spill_high_watermark_pct))
            / 100)
            .max(1) as u64;
        let low_tiles = (((u128::from(max_resident_tiles)
            * u128::from(cfg.opfs_spill_low_watermark_pct))
            / 100) as u64)
            .min(high_tiles.saturating_sub(1));

        Ok(Self {
            mode: cfg.mode,
            tile_dim: cfg.tile_dim,
            tile_bytes,
            tiles_x,
            tiles_y,
            layer_count: cfg.layer_count,
            tiles_per_layer,
            total_logical_tiles,
            total_logical_bytes,
            effective_budget_bytes,
            max_resident_tiles,
            opfs_spill_high_watermark_bytes: high_tiles.saturating_mul(tile_bytes),
            opfs_spill_high_watermark_tiles: high_tiles,
            opfs_spill_low_watermark_bytes: low_tiles.saturating_mul(tile_bytes),
            opfs_spill_low_watermark_tiles: low_tiles,
            exceeds_wasm32_4gib: total_logical_bytes > WASM32_ADDRESS_LIMIT_BYTES
                || effective_budget_bytes > WASM32_ADDRESS_LIMIT_BYTES,
            requires_opfs_spill: total_logical_tiles > max_resident_tiles,
            base_offset_bytes: cfg.base_offset_bytes,
        })
    }

    /// `(layer_idx, tile_x, tile_y)` 타일의 64비트 선형 바이트 오프셋을 오버플로 검사 후 반환한다.
    pub fn tile_byte_offset(
        &self,
        layer_idx: u32,
        tile_x: u32,
        tile_y: u32,
    ) -> Result<u64, DrawingCoreError> {
        if layer_idx >= self.layer_count || tile_x >= self.tiles_x || tile_y >= self.tiles_y {
            return Err(DrawingCoreError::InvalidParameter { name: "tile_coord" });
        }
        let linear = u64::from(layer_idx)
            .checked_mul(self.tiles_per_layer)
            .and_then(|l| {
                u64::from(tile_y)
                    .checked_mul(u64::from(self.tiles_x))
                    .and_then(|r| l.checked_add(r))
            })
            .and_then(|v| v.checked_add(u64::from(tile_x)))
            .ok_or(DrawingCoreError::VirtualAddressSpaceExhausted)?;
        linear
            .checked_mul(self.tile_bytes)
            .and_then(|b| self.base_offset_bytes.checked_add(b))
            .ok_or(DrawingCoreError::VirtualAddressSpaceExhausted)
    }

    #[must_use]
    pub const fn should_spill_to_opfs(&self, current_resident_tiles: u64) -> bool {
        current_resident_tiles >= self.opfs_spill_high_watermark_tiles
    }

    #[must_use]
    pub const fn tiles_to_evict_on_spill(&self, current_resident_tiles: u64) -> u64 {
        if current_resident_tiles >= self.opfs_spill_high_watermark_tiles {
            current_resident_tiles.saturating_sub(self.opfs_spill_low_watermark_tiles)
        } else {
            0
        }
    }

    /// 동일 캔버스의 `wasm32`(4 GiB) vs `wasm64`(16 GiB+ 예산) 아레나 계획을 나란히 생성한다.
    pub fn compare_wasm32_vs_wasm64(
        canvas_width: u32,
        canvas_height: u32,
        layer_count: u32,
        wasm64_budget_bytes: u64,
    ) -> Result<(Self, Self), DrawingCoreError> {
        let base = SparseTileArenaConfig {
            mode: AddressSpaceMode::Wasm32,
            canvas_width,
            canvas_height,
            layer_count,
            tile_dim: COMPOSITOR_TILE_DIM,
            bytes_per_pixel: 4,
            budget_bytes: wasm64_budget_bytes,
            opfs_spill_high_watermark_pct: 80,
            opfs_spill_low_watermark_pct: 60,
            base_offset_bytes: 0,
        };
        let p32 = Self::compute(&base)?;
        let p64 = Self::compute(&SparseTileArenaConfig {
            mode: AddressSpaceMode::Wasm64,
            base_offset_bytes: WASM32_ADDRESS_LIMIT_BYTES,
            ..base
        })?;
        Ok((p32, p64))
    }
}

#[cfg(test)]
mod tests;
