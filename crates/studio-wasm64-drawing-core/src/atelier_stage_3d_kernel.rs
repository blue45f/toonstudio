//! ToonCore 순수 Rust SIMD128 친화 `AtelierStage` & `AtelierCast` 3D 씬 컬링 · 공간 해시 그리드 · 가상 스튜디오 공간 음향/광원 커널.
//!
//! 1. 계층적 6평면 프러스텀 + 64×36 소프트웨어 Hi-Z 보수적 차폐 컬링 (`cull_scene_frustum_and_hiz`):
//!    4-와이드 프러스텀 p-정점 검사, 대형 차폐물 전면 쿼드 근평면 클리핑·내부 보수적 래스터화,
//!    5단계 Hi-Z Max-Depth 피라미드 차폐 컬링(가려지지 않은 오브젝트 false-negative 0건 보장), LOD 0..3 자동 선택.
//! 2. 3D 공간 해시 그리드 충돌·근접 탐색 (`SpatialHashGrid3D`, `resolve_sphere_overlaps`):
//!    결정론적 3D 정수 해시 + 침입형 연결 버킷으로 O(1) 삽입·반경 쿼리(`query_radius`) 및 아바타/소품 침투 밀어내기.
//! 3. `AtelierStage` 실시간 공간 음향 HRTF 감쇠 + 물리 광원 조도/림라이트 평가 (`evaluate_stage_acoustics_and_lighting`):
//!    역제곱 거리 감쇠, 청취자 전방/좌우 기저 Constant-Power HRTF 팬·핀나/차폐 로우패스 차단율,
//!    다중 점광원·방향광원 역제곱 조도 및 `AtelierCast` 실루엣 림라이트를 4-와이드 SIMD 친화 루프로 일괄 계산한다.
//!
//! 외부 크레이트 의존성 0개, `no_std`-친화 설계, `unsafe` 0건, 모든 공개 함수는 panic 없이 `Result`를 반환한다.

use core::f32::consts::FRAC_PI_2;

use crate::DrawingCoreError;

/// 소프트웨어 Hi-Z 깊이 버퍼 해상도(64×36) 및 5단계 피라미드 레이아웃 상수.
pub const HIZ_WIDTH: usize = 64;
pub const HIZ_HEIGHT: usize = 36;
pub const HIZ_CELLS: usize = HIZ_WIDTH * HIZ_HEIGHT;
pub const HIZ_LEVELS: usize = 5;
const HIZ_LEVEL_DIMS: [(usize, usize); HIZ_LEVELS] = [(64, 36), (32, 18), (16, 9), (8, 5), (4, 3)];
const HIZ_LEVEL_OFFSETS: [usize; HIZ_LEVELS] = [0, 2304, 2880, 3024, 3064];
const HIZ_TOTAL_CELLS: usize = 3076;

/// 단일 호출당 최대 처리 오브젝트·차폐물·공간 음향/광원 예산 상한.
pub const MAX_STAGE_OBJECTS: usize = 262_144;
pub const MAX_STAGE_OCCLUDERS: usize = 64;
pub const MAX_STAGE_LIGHTS: usize = 256;
pub const MAX_STAGE_AUDIO_SOURCES: usize = 65_536;
pub const MAX_STAGE_CAST_SAMPLES: usize = 65_536;
pub const DEFAULT_SPATIAL_CELL_SIZE: f32 = 0.25;
pub const DEFAULT_SPATIAL_BUCKET_COUNT: usize = 4096;

const MAX_STAGE_COORD: f32 = 1.0e6;
const FRUSTUM_EPS: f32 = 1e-4;
const NEAR_W_EPS: f32 = 1e-4;
const HIZ_EDGE_TOL: f32 = 1e-4;
const HIZ_DEPTH_BIAS: f32 = 5e-4;
const HIZ_TEST_EPS: f32 = 1e-4;
const VEC_EPS: f32 = 1e-6;
const OPEN_AIR_LPF_HZ: f32 = 20_000.0;
const MAX_SPATIAL_GRID_CELLS_PER_QUERY: usize = 32_768;

#[inline]
fn bounded_vec3(v: [f32; 3]) -> bool {
    v[0].is_finite()
        && v[1].is_finite()
        && v[2].is_finite()
        && v[0].abs() <= MAX_STAGE_COORD
        && v[1].abs() <= MAX_STAGE_COORD
        && v[2].abs() <= MAX_STAGE_COORD
}

#[inline]
fn dot3(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

#[inline]
fn cross3(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

#[inline]
fn normalize3(v: [f32; 3]) -> Option<[f32; 3]> {
    let len_sq = dot3(v, v);
    if len_sq.is_finite() && len_sq > VEC_EPS * VEC_EPS {
        let inv = 1.0 / len_sq.sqrt();
        Some([v[0] * inv, v[1] * inv, v[2] * inv])
    } else {
        None
    }
}

#[inline]
fn mul_mat4_point(m: &[f32; 16], p: [f32; 3]) -> [f32; 4] {
    [
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
        m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15],
    ]
}

mod acoustics_lighting;
mod culling;
mod hiz;
mod spatial_hash;

pub use acoustics_lighting::*;
pub use culling::*;
pub use spatial_hash::*;
