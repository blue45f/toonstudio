//! Apple Silicon 네이티브 Rust(`aarch64`) vs WebAssembly 1:1 실측 벤치마크 실행기.
//!
//! - 크레이트 루트 정책과 동일하게 `#![deny(unsafe_code)]` 및 순수 `std`만 사용한다.
//! - Node V8 `native-rust-core-bridge`와 완전히 동일한 결정론적 256×256 RGBA 타일(262,144 B)
//!   입력으로 FNV-1a 32비트 체크섬, XOR 타일 델타, 가우시안 블러(`sigma=1.5`),
//!   썸네일 해시 파이프라인(블러+FNV-1a)의 지연 시간·처리량·무결성 체크섬을 측정한다.

#![deny(unsafe_code)]

use std::hint::black_box;
use std::time::Instant;

use studio_wasm64_drawing_core::{
    fnv1a_checksum_32, gaussian_blur_rgba_into, xor_tile_delta_bytes,
};

const TILE_WIDTH: u32 = 256;
const TILE_HEIGHT: u32 = 256;
const TILE_BYTES: usize = (TILE_WIDTH as usize) * (TILE_HEIGHT as usize) * 4;
const BLUR_SIGMA: f32 = 1.5;

fn make_deterministic_tile(seed: u32) -> Vec<u8> {
    let mut bytes = vec![0u8; TILE_BYTES];
    let mut state = seed;
    let (chunks, _) = bytes.as_chunks_mut::<4>();
    for px in chunks {
        state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        px[0] = (state & 0xFF) as u8;
        px[1] = ((state >> 8) & 0xFF) as u8;
        px[2] = ((state >> 16) & 0xFF) as u8;
        px[3] = (200 + ((state >> 24) % 56)) as u8;
    }
    bytes
}

fn make_mutated_tile(prev: &[u8]) -> Vec<u8> {
    let mut next = prev.to_vec();
    for idx in (0..next.len()).step_by(8) {
        next[idx] ^= 0x5A;
    }
    next
}

fn bench_ms<F: FnMut() -> u64>(warmup: usize, iters: usize, mut f: F) -> (f64, u64) {
    let mut acc = 0u64;
    for _ in 0..warmup {
        acc ^= black_box(f());
    }
    let start = Instant::now();
    for _ in 0..iters {
        acc ^= black_box(f());
    }
    let elapsed_ms = start.elapsed().as_secs_f64() * 1_000.0;
    (elapsed_ms / (iters as f64), acc)
}

fn main() {
    let prev = make_deterministic_tile(0x1234_5678);
    let next = make_mutated_tile(&prev);
    let mut delta = vec![0u8; TILE_BYTES];
    let mut blurred = vec![0u8; TILE_BYTES];

    let expected_fnv1a = fnv1a_checksum_32(&prev);
    let expected_changed =
        xor_tile_delta_bytes(&prev, &next, &mut delta).expect("xor_tile_delta_bytes");
    let expected_pixels =
        gaussian_blur_rgba_into(&prev, None, &mut blurred, TILE_WIDTH, TILE_HEIGHT, BLUR_SIGMA)
            .expect("gaussian_blur_rgba_into");
    let expected_blur_hash = fnv1a_checksum_32(&blurred);

    let (fnv1a_ms, sink_a) = bench_ms(50, 500, || u64::from(fnv1a_checksum_32(black_box(&prev))));
    let (xor_ms, sink_b) = bench_ms(50, 500, || {
        xor_tile_delta_bytes(black_box(&prev), black_box(&next), black_box(&mut delta))
            .expect("xor") as u64
    });
    let (blur_ms, sink_c) = bench_ms(10, 80, || {
        gaussian_blur_rgba_into(
            black_box(&prev),
            None,
            black_box(&mut blurred),
            TILE_WIDTH,
            TILE_HEIGHT,
            BLUR_SIGMA,
        )
        .expect("blur") as u64
    });
    let (thumb_ms, sink_d) = bench_ms(10, 80, || {
        let _ = gaussian_blur_rgba_into(
            black_box(&prev),
            None,
            black_box(&mut blurred),
            TILE_WIDTH,
            TILE_HEIGHT,
            BLUR_SIGMA,
        )
        .expect("thumb blur");
        u64::from(fnv1a_checksum_32(black_box(&blurred)))
    });

    black_box(sink_a ^ sink_b ^ sink_c ^ sink_d);

    println!(
        "{{\"runtime\":\"native-rust\",\"arch\":\"{}\",\"os\":\"{}\",\"tile\":\"256x256\",\"tileBytes\":{},\"checksums\":{{\"prevFnv1a\":{},\"xorChangedBytes\":{},\"blurPixels\":{},\"blurFnv1a\":{}}},\"avgMs\":{{\"fnv1a\":{:.6},\"xorDelta\":{:.6},\"gaussianBlur\":{:.6},\"thumbnailHash\":{:.6}}}}}",
        std::env::consts::ARCH,
        std::env::consts::OS,
        TILE_BYTES,
        expected_fnv1a,
        expected_changed,
        expected_pixels,
        expected_blur_hash,
        fnv1a_ms,
        xor_ms,
        blur_ms,
        thumb_ms
    );
}
