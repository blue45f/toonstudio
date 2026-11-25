//! 가상 스튜디오 순수 Rust CPU 3D 스프링 물리 · 15관절 손 FABRIK IK · 공간 음향 Foley DSP 커널.
//!
//! 1. 2.5D/3D 스프링 머리카락·의상 베를레(Verlet) 물리 (`step_verlet_spring_chains_soa`):
//!    SoA 4개 묶음 스칼라 적분(SIMD 명령·실기기 성능은 별도 검증 대상) + 대칭 Gauss-Seidel PBD 거리 제약(`1..=8`) + 구체 충돌체 + 바닥 반발 + NaN/Inf 가드.
//! 2. 15관절 3D 손가락 FABRIK IK (`solve_finger_fabrik_chain`, `solve_hand_fabrik_15joints`):
//!    3관절(MCP→PIP→DIP→Tip) × 5손가락(15관절) 해부학적 굽힘·외전 제한(과신전 방지) + 변 길이(`<= 1e-4`) 불변 보존.
//! 3. 공간 음향 Foley 2차 Biquad IIR + 피크 리미터·비가중 에너지 추정 DSP (`render_foley_biquad_block`):
//!    128프레임 크기로 호출할 수 있는 CPU Direct Form II Transposed 필터 + Constant-Power 패닝 + Soft-Knee 리미터(`<= 0.95`).
//!
//! 외부 의존성 0개, 힙 할당 0건(`no_std`-친화), `unsafe` 0건.

use core::f32::consts::{FRAC_PI_2, PI};

use crate::DrawingCoreError;

/// AudioWorklet 기본 렌더 퀀텀(128 프레임), 피크 리미터 상한(0.95), 비가중 Foley 에너지 목표(-24 dB 근사).
pub const AUDIOWORKLET_BLOCK_FRAMES: usize = 128;
pub const FOLEY_PEAK_CEILING: f32 = 0.95;
pub const FOLEY_TARGET_LUFS: f32 = -24.0;
/// 손가락 1개의 관절 수(3)·좌표점 수(4) 및 한 손의 손가락 수(5)·총 관절 수(15).
pub const FINGER_JOINT_COUNT: usize = 3;
pub const FINGER_POINT_COUNT: usize = 4;
pub const HAND_FINGER_COUNT: usize = 5;
pub const HAND_TOTAL_JOINTS: usize = FINGER_JOINT_COUNT * HAND_FINGER_COUNT;

const VEC_EPS: f32 = 1e-7;
const DENORMAL_FLOOR: f32 = 1e-30;
const MIN_LUFS_DB: f32 = -120.0;
const MAX_VERLET_ITERATIONS: u32 = 8;
/// CPU 커널의 명시적 작업량·수치 지원 상한. 실제 장치 처리량을 보증하지 않는다.
pub(crate) const MAX_PHYSICS_PARTICLES: usize = 65_536;
pub(crate) const MAX_PHYSICS_COLLIDERS: usize = 4096;
pub(crate) const MAX_PHYSICS_INTERACTIONS: usize = 4_194_304;
pub(crate) const MAX_AUDIO_FRAMES: usize = 65_536;
const MAX_SCENE_MAGNITUDE: f32 = 1.0e6;
fn bounded_scene(v: f32) -> bool {
    v.is_finite() && v.abs() <= MAX_SCENE_MAGNITUDE
}

#[inline]
fn validate_len(expected: usize, actual: usize) -> Result<(), DrawingCoreError> {
    if actual != expected {
        Err(DrawingCoreError::BufferLengthMismatch { expected, actual })
    } else {
        Ok(())
    }
}
#[inline]
fn flush_denormal(v: f32) -> f32 {
    if v.abs() < DENORMAL_FLOOR {
        0.0
    } else {
        v
    }
}
#[inline]
fn sanitize_pos_f32(w: f32) -> f32 {
    if w.is_finite() && w > 0.0 {
        w
    } else {
        0.0
    }
}
#[inline]
fn wrap_angle_pi(mut a: f32) -> f32 {
    while a > PI {
        a -= 2.0 * PI;
    }
    while a < -PI {
        a += 2.0 * PI;
    }
    a
}

// ============================================================================
// 1. 가상 스튜디오 2.5D/3D 스프링 머리카락·의상 베를레(Verlet) 물리 커널
// ============================================================================

mod fabrik;
mod foley;
mod verlet;

pub use fabrik::*;
pub use foley::*;
pub use verlet::*;
