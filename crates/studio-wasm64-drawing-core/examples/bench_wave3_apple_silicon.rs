//! Apple Silicon ARM64 NEON (`-O3`) Wave-3 네이티브 벤치마크 바이너리.
//!
//! 실행:
//! `cargo run --manifest-path crates/studio-wasm64-drawing-core/Cargo.toml --release --features full-suite --config profile.release.opt-level=3 --example bench_wave3_apple_silicon`

use std::f32::consts::PI;
use std::hint::black_box;
use std::time::Instant;

use studio_wasm64_drawing_core::{
    classify_and_dedup_tiles, expand_variable_width_stroke, extract_palette_median_cut,
    mix_and_master_stereo, plan_webtoon_smart_slices, rgba_to_cmyk_tac_batch, CmykTacConfig,
    DynamicsConfig, MixTrackParams, StrokeJoinStyle, WebtoonSliceConfig,
};

fn build_audio_tracks(track_count: usize, frames: usize) -> (Vec<f32>, Vec<MixTrackParams>) {
    let mut tracks = vec![0.0_f32; track_count * frames];
    let mut params = Vec::with_capacity(track_count);
    for t in 0..track_count {
        let freq = 180.0 + (t as f32) * 145.0;
        let base = t * frames;
        for i in 0..frames {
            tracks[base + i] = (2.0 * PI * freq * (i as f32) / 48_000.0).sin() * 0.35;
        }
        let pan = -0.8 + 1.6 * (t as f32) / ((track_count - 1).max(1) as f32);
        params.push(MixTrackParams { gain: 0.75, pan, mute: false });
    }
    (tracks, params)
}

fn build_vector_spine(points: usize) -> Vec<f32> {
    let mut spine = Vec::with_capacity(points * 3);
    for i in 0..points {
        let t = (i as f32) * 0.05;
        spine.push(t * 14.0);
        spine.push((t * 0.9).sin() * 60.0 + (t * 0.23).cos() * 22.0);
        spine.push(1.5 + ((t * 0.7).sin().abs()) * 6.5);
    }
    spine
}

fn build_webtoon_strip(width: u32, height: u32) -> Vec<u8> {
    let w = width as usize;
    let h = height as usize;
    let mut img = vec![255u8; w * h * 4];
    for panel in 0..(h / 640) {
        let py0 = panel * 640 + 48;
        let py1 = (panel * 640 + 540).min(h);
        for y in py0..py1 {
            for x in 40..(w - 40) {
                let off = (y * w + x) * 4;
                img[off] = ((x * 3 + y) & 255) as u8;
                img[off + 1] = ((x + y * 2) & 255) as u8;
                img[off + 2] = 150;
                img[off + 3] = 255;
            }
        }
    }
    img
}

fn build_color_canvas(width: u32, height: u32) -> Vec<u8> {
    let n = (width * height) as usize;
    let mut img = vec![0u8; n * 4];
    let mut state = 0x1234_5678_u32;
    for px in img.as_chunks_mut::<4>().0 {
        state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        px[0] = (state & 255) as u8;
        px[1] = ((state >> 8) & 255) as u8;
        px[2] = ((state >> 16) & 255) as u8;
        px[3] = 255;
    }
    img
}

fn bench_ms<F: FnMut()>(warmup: usize, iters: usize, mut f: F) -> f64 {
    for _ in 0..warmup {
        f();
    }
    let t0 = Instant::now();
    for _ in 0..iters {
        f();
    }
    t0.elapsed().as_secs_f64() * 1000.0 / (iters as f64)
}

fn main() {
    // 1) Audio DSP: 8 tracks x 48,000 frames (1s stereo @ 48 kHz)
    let (tracks, params) = build_audio_tracks(8, 48_000);
    let dyn_cfg = DynamicsConfig::default();
    let (mut out_l, mut out_r) = (vec![0.0_f32; 48_000], vec![0.0_f32; 48_000]);
    let mut audio_lufs = 0.0_f32;
    let audio_ms = bench_ms(3, 15, || {
        let rep = mix_and_master_stereo(
            black_box(&tracks),
            8,
            48_000,
            black_box(&params),
            &dyn_cfg,
            &mut out_l,
            &mut out_r,
        )
        .unwrap();
        audio_lufs = black_box(rep.loudness.integrated_lufs);
    });

    // 2) Vector Calligraphy Stroke Expansion: 8,192 points (Miter join)
    let spine = build_vector_spine(8_192);
    let mut stroke_verts = 0usize;
    let vector_ms = bench_ms(5, 40, || {
        let out = expand_variable_width_stroke(
            black_box(&spine),
            StrokeJoinStyle::Miter { miter_limit: 4.0 },
        )
        .unwrap();
        stroke_verts = black_box(out.polygon_xy.len() / 2);
    });

    // 3) Webtoon Smart Auto-Slicer + 64-bit FNV-1a Tile Dedup: 800 x 3,200 (2.56 MP)
    let strip = build_webtoon_strip(800, 3_200);
    let slice_cfg = WebtoonSliceConfig::default();
    let mut span_count = 0usize;
    let slicer_ms = bench_ms(2, 8, || {
        let spans = plan_webtoon_smart_slices(black_box(&strip), 800, 3_200, &slice_cfg).unwrap();
        span_count = black_box(spans.len());
    });
    let mut unique_tiles = 0u32;
    let dedup_ms = bench_ms(2, 8, || {
        let rep = classify_and_dedup_tiles(black_box(&strip), 800, 3_200, 128).unwrap();
        unique_tiles = black_box(rep.unique_tiles);
    });

    // 4) Color CMYK TAC-300% + Median-Cut 16-Color Palette: 1024 x 1024 (1.05 MP)
    let canvas = build_color_canvas(1_024, 1_024);
    let mut cmyk = vec![0u8; canvas.len()];
    let cmyk_cfg = CmykTacConfig::default();
    let mut cmyk_clamped = 0usize;
    let cmyk_ms = bench_ms(2, 10, || {
        let st = rgba_to_cmyk_tac_batch(black_box(&canvas), &mut cmyk, &cmyk_cfg).unwrap();
        cmyk_clamped = black_box(st.clamped_pixels);
    });
    let mut swatch_cnt = 0usize;
    let palette_ms = bench_ms(2, 10, || {
        let sw = extract_palette_median_cut(black_box(&canvas), 16, 128).unwrap();
        swatch_cnt = black_box(sw.len());
    });

    println!(
        "{{\"tier\":\"native-rust-o3-neon\",\"audioMixMasterMs\":{audio_ms:.4},\"vectorStrokeExpandMs\":{vector_ms:.4},\"webtoonSmartSliceMs\":{slicer_ms:.4},\"webtoonTileDedupMs\":{dedup_ms:.4},\"colorCmykTacMs\":{cmyk_ms:.4},\"colorPaletteMs\":{palette_ms:.4},\"checksums\":{{\"audioLufs\":{audio_lufs:.4},\"strokeVerts\":{stroke_verts},\"spanCount\":{span_count},\"uniqueTiles\":{unique_tiles},\"cmykClamped\":{cmyk_clamped},\"swatchCount\":{swatch_cnt}}}}}"
    );
}
