import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  inspectWasmMemorySection,
  isFastAnythingDisabled,
  loadFastKernelsRuntime,
  supportsWasmMemory64,
  type FastKernelsRuntime,
  type OilBristleConfig,
} from "./index";

const REPO_ROOT = resolve(import.meta.dirname, "../../../../../..");
const WASM64_PATH = resolve(
  REPO_ROOT,
  "apps/web/public/wasm/studio-wasm64-fast-kernels-memory64.wasm",
);
const WASM32_PATH = resolve(REPO_ROOT, "apps/web/public/wasm/studio-wasm64-fast-kernels.wasm");

function createDeterministicRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function buildPanelLineartWithGaps(
  width: number,
  height: number,
  margin: number,
  gapHalfWidth: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const left = margin;
  const right = width - 1 - margin;
  const top = margin;
  const bottom = height - 1 - margin;
  const midX = width >> 1;
  const midY = height >> 1;

  for (let x = left; x <= right; x += 1) {
    mask[top * width + x] = 255;
    if (Math.abs(x - midX) > gapHalfWidth) {
      mask[bottom * width + x] = 255;
    }
  }
  for (let y = top; y <= bottom; y += 1) {
    mask[y * width + left] = 255;
    if (Math.abs(y - midY) > gapHalfWidth) {
      mask[y * width + right] = 255;
    }
  }
  // 내부 대각선 장식선 (틈새 포함)
  for (let t = left + 10; t < right - 10; t += 1) {
    const y = Math.min(bottom - 1, top + Math.trunc(((t - left) * (bottom - top)) / (right - left)));
    if (Math.abs(t - midX) > gapHalfWidth + 4) {
      mask[y * width + t] = 255;
    }
  }
  return mask;
}

function buildRichRgbaTile(width: number, height: number, seed: number): Uint8Array {
  const rng = createDeterministicRng(seed);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const off = (y * width + x) * 4;
      const band = ((x >> 4) + (y >> 4)) & 3;
      const noise = Math.trunc(rng() * 32) - 16;
      const r = Math.min(255, Math.max(0, Math.trunc((x * 255) / width) + band * 18 + noise));
      const g = Math.min(255, Math.max(0, Math.trunc((y * 255) / height) + (3 - band) * 14 - noise));
      const b = Math.min(
        255,
        Math.max(0, Math.trunc((((x ^ y) & 255) * 3) / 4) + band * 12 + Math.trunc(noise / 2)),
      );
      rgba[off] = r;
      rgba[off + 1] = g;
      rgba[off + 2] = b;
      rgba[off + 3] = 255;
    }
  }
  return rgba;
}

function buildOilStrokeStamps(
  width: number,
  height: number,
  count: number,
  baseRadius: number,
  seed: number,
): Float32Array {
  const rng = createDeterministicRng(seed);
  const stamps = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const t = count <= 1 ? 0 : i / (count - 1);
    const cx = width * (0.12 + 0.76 * t) + Math.sin(t * Math.PI * 5) * (width * 0.04);
    const cy = height * (0.25 + 0.5 * Math.sin(t * Math.PI * 2.5) * 0.5 + 0.25);
    const radius = baseRadius * (0.75 + 0.5 * Math.sin(t * Math.PI)) + (rng() - 0.5) * 1.5;
    const pressure = 0.45 + 0.5 * Math.sin(t * Math.PI) + (rng() - 0.5) * 0.08;
    stamps[i * 4] = Math.fround(cx);
    stamps[i * 4 + 1] = Math.fround(cy);
    stamps[i * 4 + 2] = Math.fround(Math.max(1.5, radius));
    stamps[i * 4 + 3] = Math.fround(Math.min(1, Math.max(0.15, pressure)));
  }
  return stamps;
}

function countFloat32BitDiffs(a: Float32Array, b: Float32Array): number {
  expect(a.length).toBe(b.length);
  const viewA = new Uint32Array(a.buffer, a.byteOffset, a.length);
  const viewB = new Uint32Array(b.buffer, b.byteOffset, b.length);
  let diffs = 0;
  for (let i = 0; i < viewA.length; i += 1) {
    if (viewA[i] !== viewB[i]) diffs += 1;
  }
  return diffs;
}

function countByteDiffs(a: Uint8Array, b: Uint8Array): number {
  expect(a.length).toBe(b.length);
  let diffs = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) diffs += 1;
  }
  return diffs;
}

describe("Wave-54 fast-anything Real WASM64 (memory64, flags=0x04) 0-diff & Benchmark Suite", () => {
  let wasm64Bytes: Uint8Array;
  let wasm32Bytes: Uint8Array;
  let rtWasm64: FastKernelsRuntime;
  let rtWasm32: FastKernelsRuntime;
  let rtJs: FastKernelsRuntime;

  beforeAll(async () => {
    wasm64Bytes = new Uint8Array(readFileSync(WASM64_PATH));
    wasm32Bytes = new Uint8Array(readFileSync(WASM32_PATH));

    rtWasm64 = await loadFastKernelsRuntime({
      forceBackend: "wasm64",
      wasm64Bytes,
      wasm32Bytes,
    });
    rtWasm32 = await loadFastKernelsRuntime({
      forceBackend: "wasm32",
      wasm64Bytes,
      wasm32Bytes,
    });
    rtJs = await loadFastKernelsRuntime({
      forceJsFallback: true,
      wasm64Bytes,
      wasm32Bytes,
    });
  });

  afterAll(() => {
    rtWasm64.dispose();
    rtWasm32.dispose();
    rtJs.dispose();
  });

  it("Section 5(Memory) 바이트 검증: memory64 flags&0x04===0x04, wasm32 flags===0x00, 로컬 경로 누출 0건", async () => {
    const mem64 = inspectWasmMemorySection(wasm64Bytes);
    const mem32 = inspectWasmMemorySection(wasm32Bytes);

    expect(mem64.flags & 0x04).toBe(0x04);
    expect(mem64.isMemory64).toBe(true);
    expect(mem32.flags).toBe(0x00);
    expect(mem32.isMemory64).toBe(false);

    // 바이너리에 로컬 파일 시스템 경로 문자열이 남아있지 않아야 한다.
    const latin64 = Buffer.from(wasm64Bytes).toString("latin1");
    const latin32 = Buffer.from(wasm32Bytes).toString("latin1");
    for (const marker of ["/Users/", "/home/", "\\Users\\"]) {
      expect(latin64.includes(marker)).toBe(false);
      expect(latin32.includes(marker)).toBe(false);
    }

    // auto 로더는 memory64 지원 런타임에서 자동으로 wasm64를 선택해야 한다.
    expect(supportsWasmMemory64()).toBe(true);
    const autoRt = await loadFastKernelsRuntime({ wasm64Bytes, wasm32Bytes });
    try {
      expect(autoRt.backend).toBe("wasm64");
      expect(autoRt.pointerWidthBits).toBe(64);
      expect((autoRt.memoryFlags ?? 0) & 0x04).toBe(0x04);
      expect(autoRt.capabilities).toBe(0x0f);
    } finally {
      autoRt.dispose();
    }

    // wasm32 폴백 런타임 검증
    expect(rtWasm32.backend).toBe("wasm32");
    expect(rtWasm32.pointerWidthBits).toBe(32);
    expect(rtWasm32.memoryFlags).toBe(0x00);

    // 즉시 롤백 토글 2종 검증 (forceJsFallback + FAST_ANYTHING_DISABLE)
    expect(rtJs.backend).toBe("js");
    expect(rtJs.rollbackReason).toBe("forceJsFallback");
    expect(isFastAnythingDisabled({ FAST_ANYTHING_DISABLE: "1" })).toBe(true);
    expect(isFastAnythingDisabled({ FAST_ANYTHING_DISABLE: "0" })).toBe(false);

    const disabledRt = await loadFastKernelsRuntime({
      wasm64Bytes,
      wasm32Bytes,
      env: { FAST_ANYTHING_DISABLE: "1" },
    });
    expect(disabledRt.backend).toBe("js");
    expect(disabledRt.rollbackReason).toBe("FAST_ANYTHING_DISABLE");
  });

  it("Recorded Calls 리플레이 0-diff 동등성 검증: 4종 커널 × 다중 케이스 (JS vs WASM64 vs WASM32 100% 일치)", () => {
    const rng = createDeterministicRng(20261127);

    // 1) meijster_edt2d_sq_f32 녹화 호출 6종 (빈 마스크·단일 점·불규칙 캔버스·선화 패턴)
    const edtCases: ReadonlyArray<{ width: number; height: number; mask: Uint8Array }> = [
      { width: 17, height: 13, mask: new Uint8Array(17 * 13) },
      {
        width: 33,
        height: 29,
        mask: (() => {
          const m = new Uint8Array(33 * 29);
          m[0] = 1;
          m[33 * 29 - 1] = 255;
          m[14 * 33 + 19] = 128;
          return m;
        })(),
      },
      { width: 64, height: 64, mask: buildPanelLineartWithGaps(64, 64, 8, 3) },
      { width: 96, height: 48, mask: buildPanelLineartWithGaps(96, 48, 6, 2) },
      {
        width: 80,
        height: 80,
        mask: Uint8Array.from({ length: 80 * 80 }, () => (rng() < 0.04 ? 255 : 0)),
      },
      { width: 128, height: 128, mask: buildPanelLineartWithGaps(128, 128, 16, 4) },
    ];

    for (const c of edtCases) {
      const len = c.width * c.height;
      const outJs = new Float32Array(len);
      const out64 = new Float32Array(len);
      const out32 = new Float32Array(len);
      const rJs = rtJs.meijsterEdt2dSqF32(c.mask, c.width, c.height, outJs);
      const r64 = rtWasm64.meijsterEdt2dSqF32(c.mask, c.width, c.height, out64);
      const r32 = rtWasm32.meijsterEdt2dSqF32(c.mask, c.width, c.height, out32);
      expect(r64).toBe(rJs);
      expect(r32).toBe(rJs);
      expect(countFloat32BitDiffs(outJs, out64)).toBe(0);
      expect(countFloat32BitDiffs(outJs, out32)).toBe(0);
    }

    // 2) sdf_gap_close_flood_fill_u8 녹화 호출 5종 (틈새 봉합 vs 틈새 미봉합, 시드 경계, 1px 트래핑)
    const sdfCases: ReadonlyArray<{
      width: number;
      height: number;
      margin: number;
      gapHalf: number;
      seedX: number;
      seedY: number;
      radius: number;
      expectSealed: boolean;
    }> = [
      { width: 64, height: 64, margin: 10, gapHalf: 2, seedX: 30, seedY: 20, radius: 4.0, expectSealed: true },
      { width: 64, height: 64, margin: 10, gapHalf: 2, seedX: 30, seedY: 20, radius: 0.0, expectSealed: false },
      { width: 96, height: 96, margin: 14, gapHalf: 3, seedX: 40, seedY: 28, radius: 5.5, expectSealed: true },
      { width: 80, height: 64, margin: 12, gapHalf: 2, seedX: 12, seedY: 12, radius: 3.0, expectSealed: false },
      { width: 128, height: 128, margin: 18, gapHalf: 3, seedX: 54, seedY: 36, radius: 5.0, expectSealed: true },
    ];

    for (const c of sdfCases) {
      const len = c.width * c.height;
      const lineart = buildPanelLineartWithGaps(c.width, c.height, c.margin, c.gapHalf);
      const distSq = new Float32Array(len);
      rtWasm64.meijsterEdt2dSqF32(lineart, c.width, c.height, distSq);

      const fillJs = new Uint8Array(len);
      const fill64 = new Uint8Array(len);
      const fill32 = new Uint8Array(len);
      const rJs = rtJs.sdfGapCloseFloodFillU8(
        lineart,
        distSq,
        c.width,
        c.height,
        c.seedX,
        c.seedY,
        c.radius,
        fillJs,
      );
      const r64 = rtWasm64.sdfGapCloseFloodFillU8(
        lineart,
        distSq,
        c.width,
        c.height,
        c.seedX,
        c.seedY,
        c.radius,
        fill64,
      );
      const r32 = rtWasm32.sdfGapCloseFloodFillU8(
        lineart,
        distSq,
        c.width,
        c.height,
        c.seedX,
        c.seedY,
        c.radius,
        fill32,
      );

      expect(r64).toBe(rJs);
      expect(r32).toBe(rJs);
      expect(countByteDiffs(fillJs, fill64)).toBe(0);
      expect(countByteDiffs(fillJs, fill32)).toBe(0);

      if (c.expectSealed) {
        // 외부 구석(1, 1)으로 누출되지 않고, 선화 경계에 1px Halo-Free 트래핑(2)이 생성되어야 한다.
        expect(fill64[c.width + 1]).toBe(0);
        expect(fill64.some((v) => v === 2)).toBe(true);
      }
    }

    // 3) pack_bc1_tile_rgba_to_64bit 녹화 호출 5종 (단색, 4x4, 32x32, 128x64, 256x256)
    const bc1Cases: ReadonlyArray<{ width: number; height: number; rgba: Uint8Array }> = [
      { width: 4, height: 4, rgba: new Uint8Array(4 * 4 * 4).fill(180) },
      { width: 16, height: 16, rgba: buildRichRgbaTile(16, 16, 101) },
      { width: 32, height: 32, rgba: buildRichRgbaTile(32, 32, 202) },
      { width: 128, height: 64, rgba: buildRichRgbaTile(128, 64, 303) },
      { width: 256, height: 256, rgba: buildRichRgbaTile(256, 256, 404) },
    ];

    for (const c of bc1Cases) {
      const bc1Len = (c.width / 4) * (c.height / 4) * 8;
      const outJs = new Uint8Array(bc1Len);
      const out64 = new Uint8Array(bc1Len);
      const out32 = new Uint8Array(bc1Len);
      const rJs = rtJs.packBc1TileRgbaTo64Bit(c.rgba, c.width, c.height, outJs);
      const r64 = rtWasm64.packBc1TileRgbaTo64Bit(c.rgba, c.width, c.height, out64);
      const r32 = rtWasm32.packBc1TileRgbaTo64Bit(c.rgba, c.width, c.height, out32);
      expect(r64).toBe(rJs);
      expect(r32).toBe(rJs);
      expect(countByteDiffs(outJs, out64)).toBe(0);
      expect(countByteDiffs(outJs, out32)).toBe(0);
    }

    // 4) oil_bristle_stamp_accumulate_rgba 녹화 호출 5종 (빈 캔버스, 밑색 위 습윤 픽업, 건조 감쇠, 경계 클리핑)
    const oilConfigs: ReadonlyArray<{
      width: number;
      height: number;
      seed: number;
      stamps: number;
      radius: number;
      prefill: boolean;
      config: OilBristleConfig;
    }> = [
      {
        width: 64,
        height: 64,
        seed: 11,
        stamps: 18,
        radius: 7,
        prefill: false,
        config: {
          brushR: 215,
          brushG: 62,
          brushB: 48,
          brushA: 230,
          pickupQ8: 128,
          wetnessQ8: 245,
          decayQ8: 242,
          hardnessQ8: 160,
          bristleCount: 8,
        },
      },
      {
        width: 96,
        height: 96,
        seed: 22,
        stamps: 36,
        radius: 10,
        prefill: true,
        config: {
          brushR: 32,
          brushG: 94,
          brushB: 224,
          brushA: 210,
          pickupQ8: 180,
          wetnessQ8: 256,
          decayQ8: 246,
          hardnessQ8: 96,
          bristleCount: 12,
        },
      },
      {
        width: 128,
        height: 96,
        seed: 33,
        stamps: 48,
        radius: 12,
        prefill: true,
        config: {
          brushR: 244,
          brushG: 196,
          brushB: 52,
          brushA: 255,
          pickupQ8: 200,
          wetnessQ8: 230,
          decayQ8: 220,
          hardnessQ8: 220,
          bristleCount: 5,
        },
      },
      {
        width: 64,
        height: 64,
        seed: 44,
        stamps: 0,
        radius: 6,
        prefill: true,
        config: {
          brushR: 20,
          brushG: 20,
          brushB: 20,
          brushA: 255,
          pickupQ8: 100,
          wetnessQ8: 200,
          decayQ8: 240,
          hardnessQ8: 128,
          bristleCount: 4,
        },
      },
      {
        width: 80,
        height: 80,
        seed: 55,
        stamps: 24,
        radius: 15,
        prefill: true,
        config: {
          brushR: 48,
          brushG: 170,
          brushB: 120,
          brushA: 190,
          pickupQ8: 0,
          wetnessQ8: 256,
          decayQ8: 250,
          hardnessQ8: 40,
          bristleCount: 16,
        },
      },
    ];

    for (const c of oilConfigs) {
      const baseCanvas = c.prefill
        ? buildRichRgbaTile(c.width, c.height, c.seed + 500)
        : new Uint8Array(c.width * c.height * 4);
      const stamps = buildOilStrokeStamps(c.width, c.height, c.stamps, c.radius, c.seed);

      const canvasJs = new Uint8Array(baseCanvas);
      const canvas64 = new Uint8Array(baseCanvas);
      const canvas32 = new Uint8Array(baseCanvas);
      const rJs = rtJs.oilBristleStampAccumulateRgba(canvasJs, c.width, c.height, stamps, c.config);
      const r64 = rtWasm64.oilBristleStampAccumulateRgba(
        canvas64,
        c.width,
        c.height,
        stamps,
        c.config,
      );
      const r32 = rtWasm32.oilBristleStampAccumulateRgba(
        canvas32,
        c.width,
        c.height,
        stamps,
        c.config,
      );
      expect(r64).toBe(rJs);
      expect(r32).toBe(rJs);
      expect(countByteDiffs(canvasJs, canvas64)).toBe(0);
      expect(countByteDiffs(canvasJs, canvas32)).toBe(0);
    }

    // 선형 메모리 프리리스트 재사용 검증 (동일 크기 반복 호출 시 선형 메모리 무한 증가 없음)
    const beforeMem = rtWasm64.getLinearMemoryBytes();
    const probeTile = buildRichRgbaTile(64, 64, 999);
    const probeOut = new Uint8Array((64 / 4) * (64 / 4) * 8);
    for (let i = 0; i < 40; i += 1) {
      rtWasm64.packBc1TileRgbaTo64Bit(probeTile, 64, 64, probeOut);
    }
    expect(rtWasm64.getLinearMemoryBytes()).toBe(beforeMem);
  });

  it("Release Benchmark 실측: 4종 외곽 루프 JS vs Rust WASM64 실행 시간(ms) 및 가속 배율(Nx) 검증", () => {
    interface BenchRow {
      readonly kernel: string;
      readonly workload: string;
      readonly iterations: number;
      readonly jsMs: number;
      readonly wasm64Ms: number;
      readonly speedup: number;
    }

    const measure = (fn: () => void, warmup: number, iterations: number): number => {
      for (let i = 0; i < warmup; i += 1) fn();
      const start = performance.now();
      for (let i = 0; i < iterations; i += 1) fn();
      return performance.now() - start;
    };

    const rows: BenchRow[] = [];

    // 1. meijster_edt2d_sq_f32 (512x512, 12회)
    {
      const w = 512;
      const h = 512;
      const mask = buildPanelLineartWithGaps(w, h, 48, 3);
      const outJs = new Float32Array(w * h);
      const out64 = new Float32Array(w * h);
      const iters = 12;
      const jsMs = measure(() => {
        rtJs.meijsterEdt2dSqF32(mask, w, h, outJs);
      }, 3, iters);
      const wasm64Ms = measure(() => {
        rtWasm64.meijsterEdt2dSqF32(mask, w, h, out64);
      }, 3, iters);
      expect(countFloat32BitDiffs(outJs, out64)).toBe(0);
      rows.push({
        kernel: "meijster_edt2d_sq_f32",
        workload: "512x512",
        iterations: iters,
        jsMs,
        wasm64Ms,
        speedup: jsMs / wasm64Ms,
      });
    }

    // 2. sdf_gap_close_flood_fill_u8 (512x512, 12회)
    {
      const w = 512;
      const h = 512;
      const lineart = buildPanelLineartWithGaps(w, h, 48, 3);
      const distSq = new Float32Array(w * h);
      rtWasm64.meijsterEdt2dSqF32(lineart, w, h, distSq);
      const fillJs = new Uint8Array(w * h);
      const fill64 = new Uint8Array(w * h);
      const iters = 12;
      const jsMs = measure(() => {
        rtJs.sdfGapCloseFloodFillU8(lineart, distSq, w, h, 200, 140, 5.0, fillJs);
      }, 3, iters);
      const wasm64Ms = measure(() => {
        rtWasm64.sdfGapCloseFloodFillU8(lineart, distSq, w, h, 200, 140, 5.0, fill64);
      }, 3, iters);
      expect(countByteDiffs(fillJs, fill64)).toBe(0);
      rows.push({
        kernel: "sdf_gap_close_flood_fill_u8",
        workload: "512x512",
        iterations: iters,
        jsMs,
        wasm64Ms,
        speedup: jsMs / wasm64Ms,
      });
    }

    // 3. pack_bc1_tile_rgba_to_64bit (256x256, 24회)
    {
      const w = 256;
      const h = 256;
      const rgba = buildRichRgbaTile(w, h, 2026);
      const outJs = new Uint8Array((w / 4) * (h / 4) * 8);
      const out64 = new Uint8Array((w / 4) * (h / 4) * 8);
      const iters = 24;
      const jsMs = measure(() => {
        rtJs.packBc1TileRgbaTo64Bit(rgba, w, h, outJs);
      }, 4, iters);
      const wasm64Ms = measure(() => {
        rtWasm64.packBc1TileRgbaTo64Bit(rgba, w, h, out64);
      }, 4, iters);
      expect(countByteDiffs(outJs, out64)).toBe(0);
      rows.push({
        kernel: "pack_bc1_tile_rgba_to_64bit",
        workload: "256x256 (4096 blocks)",
        iterations: iters,
        jsMs,
        wasm64Ms,
        speedup: jsMs / wasm64Ms,
      });
    }

    // 4. oil_bristle_stamp_accumulate_rgba (512x512, 240 stamps, 8회)
    {
      const w = 512;
      const h = 512;
      const baseCanvas = buildRichRgbaTile(w, h, 7777);
      const stamps = buildOilStrokeStamps(w, h, 240, 14, 8888);
      const config: OilBristleConfig = {
        brushR: 228,
        brushG: 72,
        brushB: 54,
        brushA: 235,
        pickupQ8: 168,
        wetnessQ8: 250,
        decayQ8: 254,
        hardnessQ8: 140,
        bristleCount: 10,
      };
      const canvasJs = new Uint8Array(baseCanvas.length);
      const canvas64 = new Uint8Array(baseCanvas.length);
      const iters = 8;
      const jsMs = measure(() => {
        canvasJs.set(baseCanvas);
        rtJs.oilBristleStampAccumulateRgba(canvasJs, w, h, stamps, config);
      }, 2, iters);
      const wasm64Ms = measure(() => {
        canvas64.set(baseCanvas);
        rtWasm64.oilBristleStampAccumulateRgba(canvas64, w, h, stamps, config);
      }, 2, iters);
      expect(countByteDiffs(canvasJs, canvas64)).toBe(0);
      rows.push({
        kernel: "oil_bristle_stamp_accumulate_rgba",
        workload: "512x512 x 240 stamps",
        iterations: iters,
        jsMs,
        wasm64Ms,
        speedup: jsMs / wasm64Ms,
      });
    }

    console.log(
      "\n[Wave-54 fast-anything Real WASM64 Benchmark]\n" +
        rows
          .map(
            (r) =>
              `  - ${r.kernel} (${r.workload}, x${r.iterations}): JS=${r.jsMs.toFixed(2)}ms | WASM64=${r.wasm64Ms.toFixed(2)}ms | Speedup=${r.speedup.toFixed(2)}x`,
          )
          .join("\n"),
    );

    for (const r of rows) {
      expect(r.jsMs).toBeGreaterThan(0);
      expect(r.wasm64Ms).toBeGreaterThan(0);
      expect(Number.isFinite(r.speedup)).toBe(true);
    }
  });
});
