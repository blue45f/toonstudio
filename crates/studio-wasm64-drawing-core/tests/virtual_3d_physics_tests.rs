//! Wave 58A 순수 Rust SIMD128 가상 스튜디오 스프링 물리 · 15관절 손 FABRIK IK · 공간 음향 Foley DSP 통합 테스트.
#![cfg(feature = "virtual-3d-physics")]

use std::f32::consts::PI;

use studio_wasm64_drawing_core::{
    render_foley_biquad_block, solve_finger_fabrik_chain, solve_hand_fabrik_15joints,
    step_verlet_spring_chains_soa, wasm_alloc, wasm_extended_3d_capabilities, wasm_free,
    wasm_render_foley_biquad_block, wasm_solve_finger_fabrik_chain,
    wasm_step_verlet_spring_chains_soa, DrawingCoreError, FingerAngleLimits, FingerFabrikConfig,
    FoleyBiquadState, FoleyDspConfig, FoleyFilterMode, SphereCollider, VerletSpringChainsSoa,
    VerletSpringConfig, AUDIOWORKLET_BLOCK_FRAMES, FABRIK_FINGER_FFI_PARAM_COUNT,
    FOLEY_DSP_FFI_PARAM_COUNT, FOLEY_DSP_FFI_STATE_LEN, FOLEY_PEAK_CEILING, FOLEY_TARGET_LUFS,
    HAND_FINGER_COUNT, HAND_TOTAL_JOINTS, VERLET_SPRING_FFI_PARAM_COUNT,
    WASM_EXTENDED_3D_CAPABILITIES,
};

fn dist3(a: [f32; 3], b: [f32; 3]) -> f32 {
    let (dx, dy, dz) = (a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    (dx * dx + dy * dy + dz * dz).sqrt()
}

fn make_sine(sr: f32, freq_hz: f32, amp: f32, frames: usize) -> Vec<f32> {
    (0..frames)
        .map(|i| amp * (2.0 * PI * freq_hz * i as f32 / sr).sin())
        .collect()
}

fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        0.0
    } else {
        (samples.iter().map(|&s| s * s).sum::<f32>() / samples.len() as f32).sqrt()
    }
}

// ============================================================================
// 1. 가상 스튜디오 2.5D/3D 스프링 머리카락·의상 베를레(Verlet) 물리 테스트 (9건)
// ============================================================================

#[path = "virtual_3d_physics_tests/fabrik.rs"]
mod fabrik;
#[path = "virtual_3d_physics_tests/ffi.rs"]
mod ffi;
#[path = "virtual_3d_physics_tests/foley.rs"]
mod foley;
#[path = "virtual_3d_physics_tests/verlet.rs"]
mod verlet;
