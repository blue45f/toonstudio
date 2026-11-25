//! Wave 60B ToonCore 순수 Rust SIMD128 `AtelierStage` & `AtelierCast` 3D 컬링·공간 해시·공간 음향/광원 통합 테스트.
#![cfg(feature = "extended-3d")]

use std::collections::BTreeSet;
use std::f32::consts::{FRAC_PI_3, PI};

use studio_wasm64_drawing_core::{
    build_stage_view_proj_rh, cull_scene_frustum_and_hiz, cull_scene_frustum_and_hiz_into,
    evaluate_stage_acoustics_and_lighting, hash_cell_3d, resolve_sphere_overlaps, wasm_alloc,
    wasm_atelier_stage_3d_capabilities, wasm_cull_stage_frustum_hiz,
    wasm_evaluate_stage_acoustics_and_lighting, wasm_free, wasm_resolve_stage_sphere_overlaps,
    AtelierAudioEval, AtelierAudioSource, AtelierCastSample, AtelierLightKind, AtelierLightingEval,
    AtelierListenerPose, AtelierSphereBody, AtelierStageLight, DrawingCoreError, SpatialHashGrid3D,
    StageCullingConfig, StageDepthRange, StageObjectAabb, DEFAULT_SPATIAL_CELL_SIZE,
    STAGE_AUDIO_OUT_STRIDE, STAGE_AUDIO_SOURCE_STRIDE, STAGE_CAST_SAMPLE_STRIDE,
    STAGE_CULL_AABB_STRIDE, STAGE_CULL_CAMERA_FFI_LEN, STAGE_CULL_STATS_FFI_LEN,
    STAGE_LIGHTING_OUT_STRIDE, STAGE_LIGHT_STRIDE, STAGE_LISTENER_FFI_LEN,
    STAGE_SPHERE_BODY_STRIDE, WASM_ATELIER_STAGE_3D_CAPABILITIES,
};

fn lcg_f32(state: &mut u64) -> f32 {
    *state = state
        .wrapping_mul(6_364_136_223_846_793_005)
        .wrapping_add(1_442_695_040_888_963_407);
    ((*state >> 40) as u32) as f32 / ((u32::MAX >> 8) as f32)
}

fn box_at(cx: f32, cy: f32, cz: f32, hx: f32, hy: f32, hz: f32, occ: bool) -> StageObjectAabb {
    StageObjectAabb::new(
        [cx - hx, cy - hy, cz - hz],
        [cx + hx, cy + hy, cz + hz],
        occ,
    )
}

fn std_camera_cfg(depth_range: StageDepthRange) -> StageCullingConfig {
    let eye = [0.0, 1.6, 0.0];
    let vp = build_stage_view_proj_rh(
        eye,
        [0.0, 1.6, -10.0],
        [0.0, 1.0, 0.0],
        FRAC_PI_3,
        16.0 / 9.0,
        0.5,
        120.0,
        depth_range,
    )
    .expect("valid view_proj");
    StageCullingConfig {
        view_proj: vp,
        camera_pos: eye,
        lod_distances: [10.0, 25.0, 60.0],
        depth_range,
        max_occluders: 64,
    }
}

fn dist3(a: [f32; 3], b: [f32; 3]) -> f32 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
}

#[path = "atelier_stage_3d_tests/acoustics_lighting.rs"]
mod acoustics_lighting;
#[path = "atelier_stage_3d_tests/culling.rs"]
mod culling;
#[path = "atelier_stage_3d_tests/ffi.rs"]
mod ffi;
#[path = "atelier_stage_3d_tests/spatial_hash.rs"]
mod spatial_hash;
