import assert from "node:assert/strict";

export const EXPECTED_WAVE3_CAPABILITIES = 0x0f;

/**
 * Wave-3 확장 스위트 16개 C-ABI 진입점 V8 라이브 스모크 검증.
 * (`arena` 할당기는 호출자 `finally`에서 누수 0건으로 일괄 해제된다.)
 */
export function runWave3Smoke(e, arena, measure) {
  const timings = {};

  assert.equal(Number(e.wasm_wave3_capabilities()), EXPECTED_WAVE3_CAPABILITIES);

  // 22) Wave-3: Audio DSP (Biquad EQ + Multi-Track Mix/Dynamics/LUFS + Schroeder Reverb + Hermite Resampler)
  const frames = 512;
  const sr = 48_000;
  const t0 = new Float32Array(frames);
  const t1 = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    t0[i] = Math.sin((2 * Math.PI * 440 * i) / sr) * 0.65;
    t1[i] = Math.sin((2 * Math.PI * 1200 * i) / sr) * 0.45;
  }
  const eqLPtr = arena.f32(t0);
  const eqRPtr = arena.f32(t1);
  const eqParamsPtr = arena.f32(new Float32Array([sr, 1000, 0.707, 3.0]));
  const eqStatePtr = arena.f32(new Float32Array(4));
  timings.wave3_audio_biquad_512f_ms = measure("wave3_biquad", () => {
    assert.equal(e.wasm_audio_biquad_eq_stereo(eqLPtr, eqRPtr, frames, 2, eqParamsPtr, eqStatePtr), frames);
  }).ms;

  const planar = new Float32Array(frames * 2);
  planar.set(t0, 0);
  planar.set(t1, frames);
  const tracksPtr = arena.f32(planar);
  const trackParamsPtr = arena.f32(new Float32Array([0.9, -0.4, 0, 0.8, 0.5, 0]));
  const dynParamsPtr = arena.f32(new Float32Array([sr, -16, 4, 6, 3, 60, 2, -1]));
  const mixLPtr = arena.f32(new Float32Array(frames));
  const mixRPtr = arena.f32(new Float32Array(frames));
  const mixMetPtr = arena.f32(new Float32Array(6));
  timings.wave3_audio_mix_master_512f_ms = measure("wave3_mix_master", () => {
    assert.equal(
      e.wasm_audio_mix_master_stereo(tracksPtr, 2, frames, trackParamsPtr, dynParamsPtr, mixLPtr, mixRPtr, mixMetPtr),
      frames,
    );
    const met = new Float32Array(e.memory.buffer, mixMetPtr, 6);
    assert.ok(met[0] > -40 && met[0] < 0); // integrated LUFS
    assert.ok(met[1] > 0 && met[1] <= 0.96); // true peak linear
    assert.equal(Math.round(met[5]), 2); // active tracks
  }).ms;

  const revLPtr = arena.f32(new Float32Array(frames));
  const revRPtr = arena.f32(new Float32Array(frames));
  const revParamsPtr = arena.f32(new Float32Array([sr, 0.65, 0.35, 0.3, 0.85]));
  timings.wave3_audio_reverb_512f_ms = measure("wave3_reverb", () => {
    assert.equal(e.wasm_audio_schroeder_reverb_stereo(mixLPtr, mixRPtr, revLPtr, revRPtr, frames, revParamsPtr), frames);
  }).ms;

  const resOutPtr = arena.f32(new Float32Array(256));
  timings.wave3_audio_resample_hermite_ms = measure("wave3_resample", () => {
    assert.equal(e.wasm_audio_resample_mono(mixLPtr, frames, resOutPtr, 256, 1.5, 1), 256);
  }).ms;

  // 23) Wave-3: Vector Path (RDP + Chaikin + Bezier Flatten/ArcLen + Variable-Width Stroke + Winding Hit-Test)
  const polyPtr = arena.f32(new Float32Array([0, 0, 5, 0.02, 10, 0, 10, 10]));
  const rdpNeed = e.wasm_vector_simplify_rdp(polyPtr, 4, 0.25, 0, 0);
  assert.equal(rdpNeed, 3);
  const rdpOutPtr = arena.f32(new Float32Array(rdpNeed * 2));
  assert.equal(e.wasm_vector_simplify_rdp(polyPtr, 4, 0.25, rdpOutPtr, rdpNeed), 3);

  const chNeed = e.wasm_vector_smooth_chaikin(rdpOutPtr, 3, 2, 0, 0.25, 0, 0);
  assert.ok(chNeed >= 6);
  const chOutPtr = arena.f32(new Float32Array(chNeed * 2));
  assert.equal(e.wasm_vector_smooth_chaikin(rdpOutPtr, 3, 2, 0, 0.25, chOutPtr, chNeed), chNeed);

  const bezPtr = arena.f32(new Float32Array([0, 0, 10, 30, 30, 30, 40, 0]));
  const bzNeed = e.wasm_vector_flatten_bezier_arc_len(bezPtr, 0.25, 0, 0, 0);
  assert.ok(bzNeed >= 4);
  const bzXyPtr = arena.f32(new Float32Array(bzNeed * 2));
  const bzArcPtr = arena.f32(new Float32Array(bzNeed));
  assert.equal(e.wasm_vector_flatten_bezier_arc_len(bezPtr, 0.25, bzXyPtr, bzArcPtr, bzNeed), bzNeed);
  const arcView = new Float32Array(e.memory.buffer, bzArcPtr, bzNeed);
  assert.ok(arcView[bzNeed - 1] > 40);

  const spinePtr = arena.f32(new Float32Array([0, 0, 3, 25, 0, 6, 25, 25, 3]));
  const stNeed = e.wasm_vector_expand_stroke_outline(spinePtr, 3, 1, 4.0, 0, 0);
  assert.ok(stNeed >= 6);
  const stPolyPtr = arena.f32(new Float32Array(stNeed * 2));
  timings.wave3_vector_stroke_and_hit_ms = measure("wave3_vector", () => {
    assert.equal(e.wasm_vector_expand_stroke_outline(spinePtr, 3, 1, 4.0, stPolyPtr, stNeed), stNeed);
    const qPtr = arena.f32(new Float32Array([12.5, 0, 12.5, -20]));
    const hitsPtr = arena.u8Zero(2);
    assert.equal(e.wasm_vector_hit_test_batch(stPolyPtr, stNeed, qPtr, 2, 0, hitsPtr), 1);
    const hits = new Uint8Array(e.memory.buffer, hitsPtr, 2);
    assert.deepEqual(Array.from(hits), [1, 0]);
  }).ms;

  // 24) Wave-3: Webtoon Smart Slicer & 64-bit FNV-1a Tile Dedup
  const sw = 64;
  const sh = 320;
  const strip = new Uint8Array(sw * sh * 4).fill(255);
  // Balloon spanning y=130..190 across target=160; clean gutter at y=200..230
  for (let y = 130; y <= 190; y++) {
    for (let x = 10; x <= 54; x++) {
      if (y <= 132 || y >= 188 || x <= 12 || x >= 52 || (y % 14 === 4 && x > 18 && x < 46)) {
        const off = (y * sw + x) * 4;
        strip[off] = 20;
        strip[off + 1] = 20;
        strip[off + 2] = 24;
      }
    }
  }
  const stripPtr = arena.u8(strip);
  const sliceParamsPtr = arena.f32(new Float32Array([160, 96, 240, 64, 28, 4.0]));
  timings.wave3_webtoon_slicer_dedup_ms = measure("wave3_slicer_dedup", () => {
    const nSpans = e.wasm_webtoon_plan_smart_slices(stripPtr, sw, sh, sliceParamsPtr, 0, 0);
    assert.equal(nSpans, 2);
    const spansPtr = arena.f32(new Float32Array(nSpans * 5));
    assert.equal(e.wasm_webtoon_plan_smart_slices(stripPtr, sw, sh, sliceParamsPtr, spansPtr, nSpans), 2);
    const spans = new Float32Array(e.memory.buffer, spansPtr, nSpans * 5);
    assert.ok(spans[1] < 130 || spans[1] > 190, `cut inside balloon at y=${spans[1]}`);

    const summaryPtr = arena.u32(new Uint32Array(8));
    const entriesPtr = arena.u64Zero(20 * 2);
    const totalTiles = e.wasm_webtoon_dedup_tiles_fnv64(stripPtr, sw, sh, 32, summaryPtr, entriesPtr, 20);
    assert.equal(totalTiles, 20);
    const sum = new Uint32Array(e.memory.buffer, summaryPtr, 8);
    assert.ok(sum[3] < sum[2]); // unique < total due to identical white gutter tiles
    assert.ok(sum[4] > 0); // duplicate_tiles > 0
  }).ms;

  // 25) Wave-3: Color Management (Display-P3 roundtrip + CMYK TAC-300% + Median-Cut 16-Color Palette)
  const cCount = 64;
  const cRgba = new Uint8Array(cCount * 4);
  for (let i = 0; i < cCount; i++) {
    const off = i * 4;
    if (i < 32) {
      cRgba.set([20, 68, 53, 255], off);
    } else if (i < 48) {
      cRgba.set([0, 0, 0, 255], off);
    } else {
      cRgba.set([225, 180, 60, 255], off);
    }
  }
  const cInPtr = arena.u8(cRgba);
  const p3Ptr = arena.f32(new Float32Array(cCount * 4));
  const cBackPtr = arena.u8Zero(cCount * 4);
  const cmykTacPtr = arena.u8Zero(cCount * 4);
  const tacParamsPtr = arena.f32(new Float32Array([0.3, 0.0, 0.9, 260.0]));
  const tacStatsPtr = arena.f32(new Float32Array(2));
  const swatchesPtr = arena.u32(new Uint32Array(16 * 2));
  timings.wave3_color_p3_cmyk_palette_ms = measure("wave3_color", () => {
    assert.equal(e.wasm_color_srgb_to_p3_batch(cInPtr, p3Ptr, cCount), cCount);
    assert.equal(e.wasm_color_p3_to_srgb_batch(p3Ptr, cBackPtr, cCount), cCount);
    const backView = new Uint8Array(e.memory.buffer, cBackPtr, 12);
    for (let i = 0; i < 12; i++) assert.ok(Math.abs(backView[i] - cRgba[i]) <= 1);

    assert.equal(e.wasm_color_rgba_to_cmyk_tac_batch(cInPtr, cmykTacPtr, cCount, tacParamsPtr, tacStatsPtr), cCount);
    const tStats = new Float32Array(e.memory.buffer, tacStatsPtr, 2);
    assert.ok(tStats[0] >= 16); // black pixels clamped to 260% TAC
    assert.ok(tStats[1] <= 260.05);

    const nSw = e.wasm_color_extract_palette_median_cut(cInPtr, cCount, 16, 128, swatchesPtr);
    assert.equal(nSw, 3);
    const swView = new Uint32Array(e.memory.buffer, swatchesPtr, nSw * 2);
    assert.equal(swView[1], 32); // dominant swatch count
  }).ms;

  return timings;
}
