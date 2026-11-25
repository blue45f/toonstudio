//! ToonStudio 순수 Rust 드로잉 코어 엔진 (`studio-wasm64-drawing-core`).
//!
//! - 크레이트 전역 `#![deny(unsafe_code)]`로 모든 핵심 연산 커널을 100% 안전 Rust로 유지하며,
//!   선형 메모리 C-ABI 포인터 경계만 `wasm_ffi` 모듈에 최소 범위로 격리한다.
//! - 외부 `crates.io` 의존성 없이 표준 라이브러리(`std`)만으로 동작하여 오프라인·재현 가능 빌드를 보장한다.
//! - 모든 공개 함수는 panic 대신 `Result<T, DrawingCoreError>` 또는 안정적인 FFI 오류 코드를 반환한다.

#![deny(unsafe_code)]

use std::error::Error;
use std::fmt;

pub mod brush_kernel;
pub mod filter_warp_kernel;
pub mod simd_bvh_skinning_kernel;
pub mod spectral_km_kernel;
pub mod tactile_texture_kernel;
pub mod tile_compositor_kernel;
pub mod tile_delta_kernel;
pub mod vector_psd_tile_kernel;
pub mod wasm_ffi;

pub use brush_kernel::{
    apply_impasto_lighting_rgba, mix_pigments_km, mix_pigments_km_strip, sample_world_paper_height,
    ImpastoLightConfig, ImpastoShadingStats, PaperGrainConfig,
};
pub use filter_warp_kernel::{
    gaussian_blur_rgba_into, gaussian_blur_rgba_masked, unsharp_mask_rgba, unsharp_mask_rgba_into,
    warp_mesh_rigid_mls, WarpPin,
};
pub use simd_bvh_skinning_kernel::{
    build_morton_bvh_2d, encode_morton_2d_u32, encode_morton_3d_u32,
    extract_lt_lineart_from_gbuffer, query_morton_bvh_aabb, skin_vrm_mesh_4bone_soa, Aabb2D,
    LtLineArtConfig, LtLineArtStats, MortonBvh2D, MortonBvhNode2D, SkinningStats, VrmMeshSoaInput,
    VrmMeshSoaOutput, IDENTITY_MAT4, MORTON_BVH_LEAF_CAPACITY,
};
pub use spectral_km_kernel::{mix_pigments_km16, mix_pigments_km16_strip, KM_SPECTRAL_BANDS};
pub use tactile_texture_kernel::{
    generate_paper_tile_lut, stamp_tactile_bristle_rgba, PaperKind, PaperLutStats, PaperTileLut,
    TactileBrushParams, TactileStampStats, MAX_BRISTLE_COUNT, MIN_BRISTLE_COUNT, PAPER_TILE_DIM,
    PAPER_TILE_LEN,
};
pub use tile_compositor_kernel::{
    composite_tile_dirty_rect, AddressSpaceMode, DirtyRect, SparseTileArenaConfig,
    SparseTileArenaPlan, TileBlendMode, COMPOSITOR_TILE_DIM, COMPOSITOR_TILE_RGBA_BYTES,
    WASM32_ADDRESS_LIMIT_BYTES, WASM64_DEFAULT_BUDGET_BYTES,
};
pub use tile_delta_kernel::{
    apply_xor_tile_delta_in_place, fnv1a_checksum_32, xor_tile_delta_bytes,
};
pub use vector_psd_tile_kernel::{
    parse_psd_header_streaming, vectorize_stroke_to_cubic_beziers, CubicBezierSegment,
    PsdColorMode, PsdHeaderInfo, StrokePoint2D, SwapperStats, TileKey, TileResidencyState,
    VectorizedStroke, VirtualTileSwapper64, TILE_DIM, TILE_RGBA_BYTES,
};
pub use wasm_ffi::{
    wasm_alloc, wasm_apply_impasto_lighting_rgba, wasm_composite_tile_dirty_rect,
    wasm_drawing_core_abi_version, wasm_fnv1a_checksum, wasm_free, wasm_gaussian_blur_rgba,
    wasm_hotpath_capabilities, wasm_mix_pigments_km16_packed, wasm_mix_pigments_km16_strip,
    wasm_mix_pigments_km_packed, wasm_sample_world_paper_height, wasm_stamp_tactile_bristle,
    wasm_unsharp_mask_rgba, wasm_xor_tile_delta_bytes, TACTILE_BRUSH_FFI_PARAM_COUNT,
    WASM_HOTPATH_CAPABILITIES,
};
#[cfg(feature = "extended-3d")]
pub use wasm_ffi::{
    wasm_encode_morton_2d_u32, wasm_encode_morton_3d_u32, wasm_extended_3d_capabilities,
    wasm_extract_lt_lineart_from_gbuffer, wasm_skin_vrm_mesh_4bone_soa, LT_LINEART_FFI_PARAM_COUNT,
    WASM_EXTENDED_3D_CAPABILITIES,
};

/// 코어 드로잉 엔진의 모든 연산이 공유하는 panic 없는 오류 모델.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DrawingCoreError {
    /// 가로 또는 세로 해상도가 0이거나 크기 계산이 오버플로된 경우.
    InvalidDimensions { width: u32, height: u32 },
    /// RGBA 또는 마스크 버퍼 길이가 예상 크기와 다른 경우.
    BufferLengthMismatch { expected: usize, actual: usize },
    /// NaN, 무한대, 음수 반경 등 허용 범위를 벗어난 파라미터.
    InvalidParameter { name: &'static str },
    /// PSD/PSB 바이너리 시그니처(`8BPS`)가 일치하지 않는 경우.
    InvalidPsdSignature,
    /// PSD 버전이 1(PSD) 또는 2(PSB)가 아닌 경우.
    UnsupportedPsdVersion(u16),
    /// 바이너리 스트림이 필수 헤더 길이보다 짧은 경우.
    TruncatedInput { expected_min: usize, actual: usize },
    /// 256x256 RGBA 타일 바이트 길이가 규격과 다른 경우.
    TileSizeMismatch { expected: usize, actual: usize },
    /// 가상 타일 스와퍼의 상주 예산이 타일 1개 크기보다 작은 경우.
    TileMemoryBudgetTooSmall { min_bytes: u64, requested: u64 },
    /// 모든 상주 타일이 고정(pin)되어 LRU 퇴거가 불가능한 경우.
    AllResidentTilesPinned,
    /// 64비트 글로벌 가상 주소가 표현 범위를 초과한 경우.
    VirtualAddressSpaceExhausted,
}

impl fmt::Display for DrawingCoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidDimensions { width, height } => {
                write!(f, "잘못된 캔버스 크기입니다: {width}x{height}")
            }
            Self::BufferLengthMismatch { expected, actual } => {
                write!(
                    f,
                    "버퍼 길이 불일치: 예상 {expected}바이트, 실제 {actual}바이트"
                )
            }
            Self::InvalidParameter { name } => {
                write!(f, "유효하지 않은 파라미터 값입니다: {name}")
            }
            Self::InvalidPsdSignature => write!(f, "유효한 PSD/PSB 시그니처(8BPS)가 아닙니다"),
            Self::UnsupportedPsdVersion(ver) => {
                write!(f, "지원하지 않는 PSD 버전입니다: {ver}")
            }
            Self::TruncatedInput {
                expected_min,
                actual,
            } => write!(
                f,
                "입력 바이너리가 잘렸습니다: 최소 {expected_min}바이트 필요, 실제 {actual}바이트"
            ),
            Self::TileSizeMismatch { expected, actual } => {
                write!(f, "타일 바이트 크기 불일치: 예상 {expected}, 실제 {actual}")
            }
            Self::TileMemoryBudgetTooSmall {
                min_bytes,
                requested,
            } => write!(
                f,
                "상주 메모리 예산이 너무 작습니다: 최소 {min_bytes}바이트, 요청 {requested}바이트"
            ),
            Self::AllResidentTilesPinned => {
                write!(
                    f,
                    "모든 상주 타일이 고정되어 있어 LRU 스왑아웃을 수행할 수 없습니다"
                )
            }
            Self::VirtualAddressSpaceExhausted => {
                write!(f, "64비트 가상 타일 주소 공간이 고갈되었습니다")
            }
        }
    }
}

impl Error for DrawingCoreError {}

/// 버퍼 크기 계산 시 오버플로를 방지하는 내부 공용 도우미.
pub(crate) fn checked_pixel_count(width: u32, height: u32) -> Result<usize, DrawingCoreError> {
    if width == 0 || height == 0 {
        return Err(DrawingCoreError::InvalidDimensions { width, height });
    }
    let w = usize::try_from(width)
        .map_err(|_| DrawingCoreError::InvalidDimensions { width, height })?;
    let h = usize::try_from(height)
        .map_err(|_| DrawingCoreError::InvalidDimensions { width, height })?;
    w.checked_mul(h)
        .ok_or(DrawingCoreError::InvalidDimensions { width, height })
}

/// RGBA 버퍼의 예상 바이트 길이를 오버플로 없이 계산한다.
pub(crate) fn checked_rgba_len(width: u32, height: u32) -> Result<usize, DrawingCoreError> {
    let pixels = checked_pixel_count(width, height)?;
    pixels
        .checked_mul(4)
        .ok_or(DrawingCoreError::InvalidDimensions { width, height })
}
