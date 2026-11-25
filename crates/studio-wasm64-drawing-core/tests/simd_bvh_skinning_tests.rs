//! Wave 52A 순수 Rust SIMD128 친화 VRM 4-본 스키닝 · Morton BVH · 3D LT 선화 통합 테스트.

use std::f32::consts::FRAC_PI_2;

use studio_wasm64_drawing_core::{
    build_morton_bvh_2d, encode_morton_2d_u32, encode_morton_3d_u32,
    extract_lt_lineart_from_gbuffer, query_morton_bvh_aabb, skin_vrm_mesh_4bone_soa, Aabb2D,
    DrawingCoreError, LtLineArtConfig, VrmMeshSoaInput, VrmMeshSoaOutput, IDENTITY_MAT4,
};

fn mat4_translation(tx: f32, ty: f32, tz: f32) -> [f32; 16] {
    [
        1.0, 0.0, 0.0, 0.0, // col 0
        0.0, 1.0, 0.0, 0.0, // col 1
        0.0, 0.0, 1.0, 0.0, // col 2
        tx, ty, tz, 1.0, // col 3
    ]
}

fn mat4_rot_z(rad: f32) -> [f32; 16] {
    let (s, c) = rad.sin_cos();
    [
        c, s, 0.0, 0.0, // col 0
        -s, c, 0.0, 0.0, // col 1
        0.0, 0.0, 1.0, 0.0, // col 2
        0.0, 0.0, 0.0, 1.0, // col 3
    ]
}

fn mat4_rot_y(rad: f32) -> [f32; 16] {
    let (s, c) = rad.sin_cos();
    [
        c, 0.0, -s, 0.0, // col 0
        0.0, 1.0, 0.0, 0.0, // col 1
        s, 0.0, c, 0.0, // col 2
        0.0, 0.0, 0.0, 1.0, // col 3
    ]
}

fn mat4_uniform_scale(s: f32) -> [f32; 16] {
    [
        s, 0.0, 0.0, 0.0, 0.0, s, 0.0, 0.0, 0.0, 0.0, s, 0.0, 0.0, 0.0, 0.0, 1.0,
    ]
}

fn lcg_next(state: &mut u64) -> f32 {
    *state = state
        .wrapping_mul(6_364_136_223_846_793_005)
        .wrapping_add(1_442_695_040_888_963_407);
    ((*state >> 40) as u32) as f32 / (u32::MAX >> 8) as f32
}

#[path = "simd_bvh_skinning_tests/boundaries.rs"]
mod boundaries;
#[path = "simd_bvh_skinning_tests/bvh.rs"]
mod bvh;
#[cfg(feature = "extended-3d")]
#[path = "simd_bvh_skinning_tests/ffi.rs"]
mod ffi;
#[path = "simd_bvh_skinning_tests/lineart.rs"]
mod lineart;
#[path = "simd_bvh_skinning_tests/pipeline.rs"]
mod pipeline;
#[path = "simd_bvh_skinning_tests/skinning.rs"]
mod skinning;
