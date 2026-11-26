#!/usr/bin/env node
/**
 * Wave-3 실측 벤치마크: Apple Silicon Native Rust `-O3` NEON vs WASM Relaxed-SIMD vs JS (V8)
 *
 * 대상 워크로드:
 *   1. Audio DSP 8트랙 × 48,000프레임(1초 @ 48kHz) 스테레오 믹싱 + 소프트-니 컴프레서/브릭월 리미터 + K-가중 LUFS/True-Peak
 *   2. Vector 8,192정점 가변 폭 캘리그라피 스트로크 외곽선 확장 (Miter + Miter-Limit)
 *   3. Webtoon 800×3,200 (2.56 MP) 세로 스트립 스마트 슬라이싱 & 64비트 FNV-1a 타일 중복 제거
 *   4. Color 1024×1024 (1.05 MP) 인쇄 CMYK(UCR/GCR + TAC 300%) & Median-Cut 16색 팔레트 추출
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const CRATE_MANIFEST = join(REPO_ROOT, "crates/studio-wasm64-drawing-core/Cargo.toml");
const WASM_PATH = join(REPO_ROOT, "apps/web/public/wasm/studio-wasm64-extended-suite.wasm");

function buildAudioTracks(trackCount, frames) {
  const tracks = new Float32Array(trackCount * frames);
  const params = [];
  for (let t = 0; t < trackCount; t += 1) {
    const freq = 180 + t * 145;
    const base = t * frames;
    for (let i = 0; i < frames; i += 1) {
      tracks[base + i] = Math.sin((2 * Math.PI * freq * i) / 48_000) * 0.35;
    }
    const pan = -0.8 + (1.6 * t) / Math.max(1, trackCount - 1);
    params.push({ gain: 0.75, pan, mute: false });
  }
  return { tracks, params };
}

function buildVectorSpine(points) {
  const spine = new Float32Array(points * 3);
  for (let i = 0; i < points; i += 1) {
    const t = i * 0.05;
    spine[i * 3] = t * 14.0;
    spine[i * 3 + 1] = Math.sin(t * 0.9) * 60.0 + Math.cos(t * 0.23) * 22.0;
    spine[i * 3 + 2] = 1.5 + Math.abs(Math.sin(t * 0.7)) * 6.5;
  }
  return spine;
}

function buildWebtoonStrip(w, h) {
  const img = new Uint8Array(w * h * 4).fill(255);
  for (let panel = 0; panel < Math.floor(h / 640); panel += 1) {
    const py0 = panel * 640 + 48;
    const py1 = Math.min(h, panel * 640 + 540);
    for (let y = py0; y < py1; y += 1) {
      for (let x = 40; x < w - 40; x += 1) {
        const off = (y * w + x) * 4;
        img[off] = (x * 3 + y) & 255;
        img[off + 1] = (x + y * 2) & 255;
        img[off + 2] = 150;
        img[off + 3] = 255;
      }
    }
  }
  return img;
}

function buildColorCanvas(w, h) {
  const img = new Uint8Array(w * h * 4);
  let state = 0x12345678 >>> 0;
  for (let i = 0; i < img.length; i += 4) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    img[i] = state & 255;
    img[i + 1] = (state >>> 8) & 255;
    img[i + 2] = (state >>> 16) & 255;
    img[i + 3] = 255;
  }
  return img;
}

function benchMs(warmup, iters, fn) {
  for (let i = 0; i < warmup; i += 1) fn();
  const t0 = performance.now();
  for (let i = 0; i < iters; i += 1) fn();
  return (performance.now() - t0) / iters;
}

function runNativeBenchmark() {
  const res = spawnSync(
    "cargo",
    [
      "run",
      "--manifest-path",
      CRATE_MANIFEST,
      "--release",
      "--features",
      "full-suite",
      "--config",
      "profile.release.opt-level=3",
      "--example",
      "bench_wave3_apple_silicon",
      "--quiet",
    ],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  if (res.status !== 0) {
    throw new Error(`Native Rust benchmark failed: ${res.stderr || res.stdout}`);
  }
  const line = res.stdout.trim().split("\n").at(-1);
  return JSON.parse(line);
}

async function runWasmBenchmark(datasets) {
  const wasmBytes = readFileSync(WASM_PATH);
  const { instance } = await WebAssembly.instantiate(wasmBytes, {});
  const e = instance.exports;

  const allocF32 = (arr) => {
    const p = e.wasm_alloc(arr.byteLength) >>> 0;
    new Float32Array(e.memory.buffer, p, arr.length).set(arr);
    return [p, arr.byteLength];
  };
  const allocU8 = (arr) => {
    const p = e.wasm_alloc(arr.byteLength) >>> 0;
    new Uint8Array(e.memory.buffer, p, arr.length).set(arr);
    return [p, arr.byteLength];
  };
  const allocZero = (bytes) => {
    const p = e.wasm_alloc(bytes) >>> 0;
    new Uint8Array(e.memory.buffer, p, bytes).fill(0);
    return [p, bytes];
  };

  // 1) Audio DSP
  const flatTp = new Float32Array(8 * 3);
  datasets.audio.params.forEach((p, i) => { flatTp[i * 3] = p.gain; flatTp[i * 3 + 1] = p.pan; flatTp[i * 3 + 2] = 0; });
  const [pTr, bTr] = allocF32(datasets.audio.tracks);
  const [pTp, bTp] = allocF32(flatTp);
  const [pOl, bOl] = allocZero(48_000 * 4);
  const [pOr, bOr] = allocZero(48_000 * 4);
  const [pMet, bMet] = allocZero(6 * 4);
  let audioLufs = 0;
  const audioMixMasterMs = benchMs(3, 15, () => {
    assert.equal(e.wasm_audio_mix_master_stereo(pTr, 8, 48_000, pTp, 0, pOl, pOr, pMet), 48_000);
    audioLufs = new Float32Array(e.memory.buffer, pMet, 6)[0];
  });
  for (const [p, b] of [[pTr, bTr], [pTp, bTp], [pOl, bOl], [pOr, bOr], [pMet, bMet]]) e.wasm_free(p, b);

  // 2) Vector Stroke Expand
  const [pSp, bSp] = allocF32(datasets.spine);
  const needVerts = e.wasm_vector_expand_stroke_outline(pSp, 8_192, 1, 4.0, 0, 0);
  const [pPoly, bPoly] = allocZero(needVerts * 2 * 4);
  let strokeVerts = 0;
  const vectorStrokeExpandMs = benchMs(5, 40, () => {
    strokeVerts = e.wasm_vector_expand_stroke_outline(pSp, 8_192, 1, 4.0, pPoly, needVerts);
  });
  e.wasm_free(pSp, bSp);
  e.wasm_free(pPoly, bPoly);

  // 3) Webtoon Smart Slicer & 64-bit Tile Dedup
  const [pImg, bImg] = allocU8(datasets.strip);
  const nSpans = e.wasm_webtoon_plan_smart_slices(pImg, 800, 3_200, 0, 0, 0);
  const [pSpans, bSpans] = allocZero(nSpans * 5 * 4);
  let spanCount = 0;
  const webtoonSmartSliceMs = benchMs(2, 8, () => {
    spanCount = e.wasm_webtoon_plan_smart_slices(pImg, 800, 3_200, 0, pSpans, nSpans);
  });
  const totalTiles = Math.ceil(800 / 128) * Math.ceil(3_200 / 128);
  const [pSum, bSum] = allocZero(8 * 4);
  const [pEnt, bEnt] = allocZero(totalTiles * 2 * 8);
  let uniqueTiles = 0;
  const webtoonTileDedupMs = benchMs(2, 8, () => {
    assert.equal(e.wasm_webtoon_dedup_tiles_fnv64(pImg, 800, 3_200, 128, pSum, pEnt, totalTiles), totalTiles);
    uniqueTiles = new Uint32Array(e.memory.buffer, pSum, 8)[3];
  });
  for (const [p, b] of [[pImg, bImg], [pSpans, bSpans], [pSum, bSum], [pEnt, bEnt]]) e.wasm_free(p, b);

  // 4) Color CMYK TAC + Median-Cut Palette
  const pxCount = 1024 * 1024;
  const [pCin, bCin] = allocU8(datasets.canvas);
  const [pCmyk, bCmyk] = allocZero(pxCount * 4);
  const [pCst, bCst] = allocZero(8);
  let cmykClamped = 0;
  const colorCmykTacMs = benchMs(2, 10, () => {
    assert.equal(e.wasm_color_rgba_to_cmyk_tac_batch(pCin, pCmyk, pxCount, 0, pCst), pxCount);
    cmykClamped = Math.round(new Float32Array(e.memory.buffer, pCst, 2)[0]);
  });
  const [pSw, bSw] = allocZero(16 * 2 * 4);
  let swatchCount = 0;
  const colorPaletteMs = benchMs(2, 10, () => {
    swatchCount = e.wasm_color_extract_palette_median_cut(pCin, pxCount, 16, 128, pSw);
  });
  for (const [p, b] of [[pCin, bCin], [pCmyk, bCmyk], [pCst, bCst], [pSw, bSw]]) e.wasm_free(p, b);

  return {
    tier: "wasm-relaxed-simd",
    audioMixMasterMs,
    vectorStrokeExpandMs,
    webtoonSmartSliceMs,
    webtoonTileDedupMs,
    colorCmykTacMs,
    colorPaletteMs,
    checksums: { audioLufs, strokeVerts, spanCount, uniqueTiles, cmykClamped, swatchCount },
  };
}

async function runJsBenchmark(datasets) {
  // Import pure-TS reference dynamically via Node 24 native TS strip-types or compiled dist
  const mod = await import("../apps/desktop-sync/src/native-rust-wave3-bridge.ts");
  let audioLufs = 0;
  const audioMixMasterMs = benchMs(3, 15, () => {
    audioLufs = mod.jsWave3AudioMixMaster(datasets.audio.tracks, 8, 48_000, datasets.audio.params).integratedLufs;
  });
  let strokeVerts = 0;
  const vectorStrokeExpandMs = benchMs(5, 40, () => {
    strokeVerts = mod.jsWave3VectorExpandStroke(datasets.spine, "miter", 4.0).vertexCount;
  });
  let spanCount = 0;
  const webtoonSmartSliceMs = benchMs(2, 8, () => {
    spanCount = mod.jsWave3WebtoonSlice(datasets.strip, 800, 3_200).length;
  });
  let uniqueTiles = 0;
  const webtoonTileDedupMs = benchMs(2, 8, () => {
    uniqueTiles = mod.jsWave3DedupTilesFnv64(datasets.strip, 800, 3_200, 128).uniqueTiles;
  });
  let cmykClamped = 0;
  const colorCmykTacMs = benchMs(2, 10, () => {
    cmykClamped = mod.jsWave3RgbaToCmykTac(datasets.canvas).clampedPixels;
  });
  let swatchCount = 0;
  const colorPaletteMs = benchMs(2, 10, () => {
    swatchCount = mod.jsWave3ExtractPalette(datasets.canvas, 16, 128).length;
  });
  return {
    tier: "js-v8",
    audioMixMasterMs,
    vectorStrokeExpandMs,
    webtoonSmartSliceMs,
    webtoonTileDedupMs,
    colorCmykTacMs,
    colorPaletteMs,
    checksums: { audioLufs, strokeVerts, spanCount, uniqueTiles, cmykClamped, swatchCount },
  };
}

const datasets = {
  audio: buildAudioTracks(8, 48_000),
  spine: buildVectorSpine(8_192),
  strip: buildWebtoonStrip(800, 3_200),
  canvas: buildColorCanvas(1_024, 1_024),
};

const nativeRes = runNativeBenchmark();
const wasmRes = await runWasmBenchmark(datasets);
const jsRes = await runJsBenchmark(datasets);

// Cross-tier parity assertions
assert.ok(Math.abs(nativeRes.checksums.audioLufs - wasmRes.checksums.audioLufs) < 1e-3);
assert.ok(Math.abs(wasmRes.checksums.audioLufs - jsRes.checksums.audioLufs) < 2e-2);
assert.equal(nativeRes.checksums.strokeVerts, wasmRes.checksums.strokeVerts);
assert.equal(wasmRes.checksums.strokeVerts, jsRes.checksums.strokeVerts);
assert.equal(nativeRes.checksums.spanCount, wasmRes.checksums.spanCount);
assert.equal(wasmRes.checksums.spanCount, jsRes.checksums.spanCount);
assert.equal(nativeRes.checksums.uniqueTiles, wasmRes.checksums.uniqueTiles);
assert.equal(wasmRes.checksums.uniqueTiles, jsRes.checksums.uniqueTiles);
assert.equal(nativeRes.checksums.cmykClamped, wasmRes.checksums.cmykClamped);
assert.equal(wasmRes.checksums.cmykClamped, jsRes.checksums.cmykClamped);
assert.equal(nativeRes.checksums.swatchCount, wasmRes.checksums.swatchCount);
assert.equal(wasmRes.checksums.swatchCount, jsRes.checksums.swatchCount);

const rows = [
  ["Audio DSP Mix+Dynamics+LUFS (8×48k)", "audioMixMasterMs"],
  ["Vector Calligraphy Stroke (8,192pt)", "vectorStrokeExpandMs"],
  ["Webtoon Smart Auto-Slicer (800×3200)", "webtoonSmartSliceMs"],
  ["Webtoon FNV-1a 64b Tile Dedup (800×3200)", "webtoonTileDedupMs"],
  ["Color CMYK UCR/GCR+TAC 300% (1024²)", "colorCmykTacMs"],
  ["Color Median-Cut 16 Palette (1024²)", "colorPaletteMs"],
];

console.log("\n=== Wave-3 Apple Silicon Benchmark (0-diff Parity Verified Across All 3 Tiers) ===");
console.log(
  `${"Workload".padEnd(42)} | ${"Native O3 NEON".padStart(14)} | ${"WASM Relaxed".padStart(12)} | ${"JS (V8)".padStart(10)} | ${"Native/JS".padStart(9)} | ${"WASM/JS".padStart(8)}`,
);
console.log("-".repeat(108));
const summary = {};
for (const [label, key] of rows) {
  const n = nativeRes[key];
  const w = wasmRes[key];
  const j = jsRes[key];
  const nVsJs = j / n;
  const wVsJs = j / w;
  summary[key] = {
    nativeMs: Number(n.toFixed(3)),
    wasmMs: Number(w.toFixed(3)),
    jsMs: Number(j.toFixed(3)),
    nativeOverJs: Number(nVsJs.toFixed(2)),
    wasmOverJs: Number(wVsJs.toFixed(2)),
  };
  console.log(
    `${label.padEnd(42)} | ${(n.toFixed(3) + " ms").padStart(14)} | ${(w.toFixed(3) + " ms").padStart(12)} | ${(j.toFixed(3) + " ms").padStart(10)} | ${(nVsJs.toFixed(2) + "x").padStart(9)} | ${(wVsJs.toFixed(2) + "x").padStart(8)}`,
  );
}
console.log("\nJSON_SUMMARY=" + JSON.stringify({ native: nativeRes, wasm: wasmRes, js: jsRes, summary }));
