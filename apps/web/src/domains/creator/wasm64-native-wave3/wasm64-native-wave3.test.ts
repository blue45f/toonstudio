import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  createStudioWave3JsFallbackRuntime,
  createStudioWave3RuntimeFromBytes,
  jsBiquadEqStereo,
  jsDedupTilesFnv64,
  jsDisplayP3ToSrgb,
  jsExpandVariableWidthStroke,
  jsExtractPaletteMedianCut,
  jsFlattenCubicBezier,
  jsFnv1a64,
  jsHitTestPolygonBatch,
  jsMixAndMasterStereo,
  jsPlanWebtoonSmartSlices,
  jsResampleMono,
  jsRgbaToCmykTac,
  jsSchroederReverbStereo,
  jsSimplifyPolylineRdp,
  jsSmoothPolylineChaikin,
  jsSrgbToDisplayP3,
  loadStudioWave3Runtime,
  STUDIO_WASM64_WAVE3_URL,
  WAVE3_EXPECTED_ABI_VERSION,
  WAVE3_EXPECTED_CAPABILITIES,
} from "./index";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const EXTENDED_WASM_PATH = join(REPO_ROOT, "apps/web/public/wasm/studio-wasm64-extended-suite.wasm");

function readExtendedSuiteBytes(): Uint8Array {
  return new Uint8Array(readFileSync(EXTENDED_WASM_PATH));
}

function maxFloatDiff(a: Float32Array, b: Float32Array): number {
  expect(a.length).toBe(b.length);
  let maxD = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    if (d > maxD) maxD = d;
  }
  return maxD;
}

function makeSine(frames: number, freqHz: number, sr: number, amp: number): Float32Array {
  const buf = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    buf[i] = Math.sin((2 * Math.PI * freqHz * i) / sr) * amp;
  }
  return buf;
}

function makeBalloonStrip(width: number, height: number): Uint8Array {
  const img = new Uint8Array(width * height * 4).fill(255);
  for (let y = 20; y < 105; y += 1) {
    for (let x = 8; x < width - 8; x += 1) {
      const off = (y * width + x) * 4;
      img[off] = (x * 5) & 255;
      img[off + 1] = 110;
      img[off + 2] = (y * 3) & 255;
    }
  }
  // Speech balloon spanning y=130..190 directly across target=160
  for (let y = 130; y <= 190; y += 1) {
    for (let x = 10; x <= width - 10; x += 1) {
      const border = y <= 132 || y >= 188 || x <= 12 || x >= width - 12;
      const text = (y % 14 === 5 || y % 14 === 6) && x >= 18 && x <= width - 18 && x % 5 < 3;
      if (border || text) {
        const off = (y * width + x) * 4;
        img[off] = 18;
        img[off + 1] = 18;
        img[off + 2] = 24;
      }
    }
  }
  // Panel 2 art y=240..305
  for (let y = 240; y < 305; y += 1) {
    for (let x = 10; x < width - 10; x += 1) {
      const off = (y * width + x) * 4;
      img[off] = 60;
      img[off + 1] = 95;
      img[off + 2] = 175;
    }
  }
  return img;
}

describe("Wave-3 Pure-Safe Rust WASM64 확장 스위트 지연 래퍼 & 0-diff 파리티 검증", () => {
  it("실물 studio-wasm64-extended-suite.wasm을 지연 fetch 로드하고 메타데이터·능력 비트마스크를 검증한다", async () => {
    const bytes = readExtendedSuiteBytes();
    const rt = await loadStudioWave3Runtime({
      fetchFn: async (input) => {
        expect(String(input)).toBe(STUDIO_WASM64_WAVE3_URL);
        return new Response(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, {
          status: 200,
          headers: { "content-type": "application/wasm" },
        });
      },
    });
    try {
      const meta = rt.getMetadata();
      expect(meta.backend).toBe("wasm-relaxed-simd");
      expect(meta.abiVersion).toBe(WAVE3_EXPECTED_ABI_VERSION);
      expect(meta.wave3CapabilitiesMask).toBe(WAVE3_EXPECTED_CAPABILITIES);
      expect(meta.wasmByteLength).toBe(bytes.byteLength);
      expect(meta.linearMemoryBytes).toBeGreaterThan(0);
    } finally {
      rt.dispose();
    }
    expect(rt.getMetadata().linearMemoryBytes).toBe(0);
  });

  it("Audio DSP (Biquad EQ · 다중 트랙 믹스/컴프레서/브릭월 리미터/LUFS/True-Peak · Schroeder 리버브 · Hermite 리샘플러) 파리티를 검증한다", async () => {
    const rt = await createStudioWave3RuntimeFromBytes(readExtendedSuiteBytes());
    try {
      const sr = 48_000;
      const frames = 1024;
      const t0 = makeSine(frames, 330, sr, 0.7);
      const t1 = makeSine(frames, 1200, sr, 0.5);
      const t2 = makeSine(frames, 5000, sr, 0.8);

      // 1) Biquad Peaking EQ + chunk continuity
      const eqWasm = rt.biquadEqStereo(t0, t1, { kind: "peaking", sampleRate: sr, freqHz: 1000, q: 1.2, gainDb: 4.5 });
      const eqJs = jsBiquadEqStereo(t0, t1, { kind: "peaking", sampleRate: sr, freqHz: 1000, q: 1.2, gainDb: 4.5 });
      expect(maxFloatDiff(eqWasm.left, eqJs.left)).toBeLessThan(1e-5);
      expect(maxFloatDiff(eqWasm.right, eqJs.right)).toBeLessThan(1e-5);
      expect(maxFloatDiff(eqWasm.nextState, eqJs.nextState)).toBeLessThan(1e-5);

      // 2) Multi-track stereo mixer + soft-knee dynamics + brickwall limiter + LUFS / True-Peak
      const planar = new Float32Array(frames * 3);
      planar.set(t0, 0);
      planar.set(t1, frames);
      planar.set(t2, frames * 2);
      const trackParams = [
        { gain: 1.2, pan: -0.6, mute: false },
        { gain: 1.1, pan: 0.5, mute: false },
        { gain: 1.0, pan: 0.0, mute: true },
      ];
      const dyn = {
        sampleRate: sr,
        thresholdDb: -14,
        ratio: 4,
        kneeDb: 6,
        attackMs: 3,
        releaseMs: 60,
        makeupDb: 2,
        limiterCeilingDb: -1,
      };
      const mixWasm = rt.mixAndMasterStereo(planar, 3, frames, trackParams, dyn);
      const mixJs = jsMixAndMasterStereo(planar, 3, frames, trackParams, dyn);
      expect(mixWasm.activeTracks).toBe(2);
      expect(mixWasm.activeTracks).toBe(mixJs.activeTracks);
      expect(maxFloatDiff(mixWasm.left, mixJs.left)).toBeLessThan(2e-4);
      expect(maxFloatDiff(mixWasm.right, mixJs.right)).toBeLessThan(2e-4);
      expect(Math.abs(mixWasm.integratedLufs - mixJs.integratedLufs)).toBeLessThan(0.02);
      expect(Math.abs(mixWasm.truePeakLinear - mixJs.truePeakLinear)).toBeLessThan(5e-4);
      const ceiling = 10 ** (-1 / 20);
      expect(mixWasm.samplePeakLinear).toBeLessThanOrEqual(ceiling + 1e-5);

      // 3) Schroeder algorithmic reverb
      const revWasm = rt.schroederReverbStereo(mixWasm.left, mixWasm.right, {
        sampleRate: sr,
        roomSize: 0.7,
        damping: 0.3,
        wet: 0.35,
        dry: 0.8,
      });
      const revJs = jsSchroederReverbStereo(mixWasm.left, mixWasm.right, {
        sampleRate: sr,
        roomSize: 0.7,
        damping: 0.3,
        wet: 0.35,
        dry: 0.8,
      });
      expect(maxFloatDiff(revWasm.left, revJs.left)).toBeLessThan(2e-4);
      expect(maxFloatDiff(revWasm.right, revJs.right)).toBeLessThan(2e-4);

      // 4) Cubic-Hermite & Linear resampler
      const rsWasm = rt.resampleMono(t0, 512, 1.37, "cubic-hermite");
      const rsJs = jsResampleMono(t0, 512, 1.37, "cubic-hermite");
      expect(maxFloatDiff(rsWasm.samples, rsJs.samples)).toBeLessThan(1e-5);
      const rsLinWasm = rt.resampleMono(t0, 512, 1.37, "linear");
      const rsLinJs = jsResampleMono(t0, 512, 1.37, "linear");
      expect(maxFloatDiff(rsLinWasm.samples, rsLinJs.samples)).toBeLessThan(1e-5);

      expect(rt.getArenaStats().activeAllocations).toBe(0);
    } finally {
      rt.dispose();
    }
  });

  it("Vector Path (RDP · Chaikin · Bezier 평탄화+호길이 · 가변 폭 외곽선 · Non-Zero/Even-Odd 히트 테스트) 0-diff 파리티를 검증한다", async () => {
    const rt = await createStudioWave3RuntimeFromBytes(readExtendedSuiteBytes());
    try {
      const rawPoly = new Float32Array([0, 0, 3, 0.04, 6, -0.02, 10, 0, 10, 6, 10.03, 12, 20, 18]);
      const rdpWasm = rt.simplifyPolylineRdp(rawPoly, 0.2);
      const rdpJs = jsSimplifyPolylineRdp(rawPoly, 0.2);
      expect(maxFloatDiff(rdpWasm, rdpJs)).toBe(0);

      const chWasm = rt.smoothPolylineChaikin(rdpWasm, 2, false, 0.25);
      const chJs = jsSmoothPolylineChaikin(rdpJs, 2, false, 0.25);
      expect(maxFloatDiff(chWasm, chJs)).toBeLessThan(1e-5);

      const bez = new Float32Array([0, 0, 10, 35, 30, 35, 40, 0]);
      const bzWasm = rt.flattenCubicBezier(bez, 0.25);
      const bzJs = jsFlattenCubicBezier(bez, 0.25);
      expect(bzWasm.pointCount).toBe(bzJs.pointCount);
      expect(maxFloatDiff(bzWasm.pointsXy, bzJs.pointsXy)).toBeLessThan(1e-5);
      expect(maxFloatDiff(bzWasm.arcLengths, bzJs.arcLengths)).toBeLessThan(1e-4);

      const spine = new Float32Array([0, 0, 2.5, 22, 0, 6.0, 22, 24, 3.0, 5, 25, 4.5]);
      for (const join of ["miter", "bevel"] as const) {
        const outWasm = rt.expandVariableWidthStroke(spine, join, 3.5);
        const outJs = jsExpandVariableWidthStroke(spine, join, 3.5);
        expect(outWasm.vertexCount).toBe(outJs.vertexCount);
        expect(maxFloatDiff(outWasm.polygonXy, outJs.polygonXy)).toBeLessThan(1e-4);
      }

      // 5-pointed self-intersecting star: Non-Zero center=1, Even-Odd center=0
      const star = new Float32Array(10);
      [0, 2, 4, 1, 3].forEach((idx, k) => {
        const ang = (idx * 2 * Math.PI) / 5 - Math.PI * 0.5;
        star[k * 2] = Math.cos(ang) * 12;
        star[k * 2 + 1] = Math.sin(ang) * 12;
      });
      const queries = new Float32Array([0, 0, 0, -9, 30, 30, 3, -3]);
      for (const rule of ["nonzero", "evenodd"] as const) {
        const hWasm = rt.hitTestPolygonBatch(star, queries, rule);
        const hJs = jsHitTestPolygonBatch(star, queries, rule);
        expect(hWasm.hitCount).toBe(hJs.hitCount);
        expect(Array.from(hWasm.hits)).toEqual(Array.from(hJs.hits));
      }
      expect(rt.hitTestPolygonBatch(star, queries, "nonzero").hits[0]).toBe(1);
      expect(rt.hitTestPolygonBatch(star, queries, "evenodd").hits[0]).toBe(0);
    } finally {
      rt.dispose();
    }
  });

  it("Webtoon Smart Slicer(말풍선 회피) & 64비트 FNV-1a 타일 중복 제거·분류기 0-diff 파리티를 검증한다", async () => {
    expect(jsFnv1a64(new Uint8Array(0))).toBe(BigInt("0xcbf29ce484222325"));
    expect(jsFnv1a64(new TextEncoder().encode("foobar"))).toBe(BigInt("0x85944171f73967e8"));

    const rt = await createStudioWave3RuntimeFromBytes(readExtendedSuiteBytes());
    try {
      const w = 64;
      const h = 320;
      const strip = makeBalloonStrip(w, h);
      const cfg = { targetHeight: 160, minHeight: 96, maxHeight: 240, searchWindow: 64, inkL1Threshold: 28, continuityWeight: 4.0 };
      const sWasm = rt.planWebtoonSmartSlices(strip, w, h, cfg);
      const sJs = jsPlanWebtoonSmartSlices(strip, w, h, cfg);

      expect(sWasm.spans.length).toBe(2);
      expect(sWasm.spans.map((s) => [s.startY, s.endY, s.isCleanGutter])).toEqual(
        sJs.spans.map((s) => [s.startY, s.endY, s.isCleanGutter]),
      );
      // Cut must NEVER bisect speech balloon y=130..190
      const cutY = sWasm.spans[0]?.endY ?? 0;
      expect(cutY < 130 || cutY > 190).toBe(true);
      expect(sWasm.spans[0]?.isCleanGutter).toBe(true);

      // 64-bit FNV-1a tile dedup 0-diff parity (hashes, classes, canonical indices)
      const dWasm = rt.dedupTilesFnv64(strip, w, h, 32);
      const dJs = jsDedupTilesFnv64(strip, w, h, 32);
      expect(dWasm.totalTiles).toBe(dJs.totalTiles);
      expect(dWasm.uniqueTiles).toBe(dJs.uniqueTiles);
      expect(dWasm.duplicateTiles).toBe(dJs.duplicateTiles);
      expect(dWasm.solidColorTiles).toBe(dJs.solidColorTiles);
      expect(dWasm.contentTiles).toBe(dJs.contentTiles);
      expect(dWasm.entries).toEqual(dJs.entries);
    } finally {
      rt.dispose();
    }
  });

  it("Color Management (sRGB↔Display-P3 · CMYK UCR/GCR TAC 300%/250% · Median-Cut 16색 팔레트) 0-diff 파리티와 0-누수를 검증한다", async () => {
    const rt = await createStudioWave3RuntimeFromBytes(readExtendedSuiteBytes());
    try {
      const rgba = new Uint8Array(256 * 4);
      for (let i = 0; i < 256; i += 1) {
        const o = i * 4;
        if (i < 96) rgba.set([31, 68, 53, 255], o);
        else if (i < 160) rgba.set([0, 0, 0, 255], o);
        else if (i < 208) rgba.set([232, 184, 62, 255], o);
        else if (i < 240) rgba.set([195, 52, 74, 255], o);
        else rgba.set([40, 80, 240, 0], o); // transparent ignored in palette
      }

      // sRGB <-> Display-P3 parity & roundtrip
      const p3Wasm = rt.srgbToDisplayP3(rgba);
      const p3Js = jsSrgbToDisplayP3(rgba);
      expect(maxFloatDiff(p3Wasm, p3Js)).toBeLessThan(1e-5);
      const backWasm = rt.displayP3ToSrgb(p3Wasm);
      const backJs = jsDisplayP3ToSrgb(p3Js);
      expect(Buffer.compare(backWasm, backJs)).toBe(0);

      // CMYK UCR/GCR + TAC=250% 0-diff byte parity
      const tacOpts = { gcrStrength: 0.3, ucrStart: 0.0, maxK: 0.9, tacLimitPct: 250 };
      const cmykWasm = rt.rgbaToCmykTac(rgba, tacOpts);
      const cmykJs = jsRgbaToCmykTac(rgba, tacOpts);
      expect(cmykWasm.clampedPixels).toBe(cmykJs.clampedPixels);
      expect(cmykWasm.maxTacPct).toBeLessThanOrEqual(250.01);
      expect(Buffer.compare(cmykWasm.cmyk, cmykJs.cmyk)).toBe(0);

      // Median-Cut 16-color palette 0-diff parity
      const palWasm = rt.extractPaletteMedianCut(rgba, 16, 128);
      const palJs = jsExtractPaletteMedianCut(rgba, 16, 128);
      expect(palWasm.swatches.length).toBe(4);
      expect(palWasm.swatches).toEqual(palJs.swatches);

      // Deliberate error path still leaks 0 bytes in arena
      expect(() => rt.flattenCubicBezier(new Float32Array([0, 0]), 0.5)).toThrow();
      const stats = rt.getArenaStats();
      expect(stats.activeAllocations).toBe(0);
      expect(stats.liveAllocatedBytes).toBe(0);
      expect(stats.totalAllocations).toBeGreaterThan(0);
      expect(stats.totalAllocations).toBe(stats.totalFrees);
    } finally {
      rt.dispose();
    }
  });

  it("WASM 로드 실패 시 JS 레퍼런스 폴백으로 안전 전환한다", async () => {
    const rt = await loadStudioWave3Runtime({
      fetchFn: async () => new Response("missing", { status: 404 }),
    });
    expect(rt.getMetadata().backend).toBe("js-fallback");
    const directFallback = createStudioWave3JsFallbackRuntime();
    const res = rt.extractPaletteMedianCut(new Uint8Array([10, 20, 30, 255, 10, 20, 30, 255]), 4, 128);
    expect(res).toEqual(directFallback.extractPaletteMedianCut(new Uint8Array([10, 20, 30, 255, 10, 20, 30, 255]), 4, 128));
  });
});
