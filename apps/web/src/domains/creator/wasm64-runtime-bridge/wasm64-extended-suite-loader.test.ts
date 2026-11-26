import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createHotpathBenchmarkFixtures,
  createStudioWasm64HotpathFromBytes,
  detectWasmCpuTier,
  inferWasmBinaryCpuTier,
  loadStudioWasm64HotpathRuntime,
  probeWasmCpuTierCapabilities,
  STUDIO_WASM64_CORE_RELAXED_SIMD_URL,
  STUDIO_WASM64_CORE_SIMD_URL,
  STUDIO_WASM64_CORE_URL,
  STUDIO_WASM64_EXTENDED_SUITE_URL,
  WASM_RELAXED_SIMD_PROBE_BYTES,
  WASM_SCALAR_PROBE_BYTES,
  WASM_SIMD128_PROBE_BYTES,
  type TileBlendModeCode,
  type Wasm64ExecutableTier,
} from "./index";
import {
  createStudioWasm64ExtendedSuiteFromBytes,
  loadStudioWasm64ExtendedSuiteRuntime,
  WASM64_EXTENDED_SUITE_EXPECTED_3D_CAPS,
  WASM64_EXTENDED_SUITE_EXPECTED_ABI,
  WASM64_EXTENDED_SUITE_EXPECTED_CAPS,
  WASM64_EXTENDED_SUITE_EXPECTED_HOTPATH_CAPS,
  WASM64_EXTENDED_SUITE_EXPECTED_STAGE_CAPS,
} from "./wasm64-extended-suite-loader";

const REPO_ROOT = path.resolve(process.cwd());
const PUBLIC_WASM_DIR = path.join(REPO_ROOT, "apps/web/public/wasm");
const BRIDGE_DIR = path.join(REPO_ROOT, "apps/web/src/domains/creator/wasm64-runtime-bridge");

function readPublicWasm(fileName: string): Uint8Array {
  const fullPath = path.join(PUBLIC_WASM_DIR, fileName);
  expect(existsSync(fullPath)).toBe(true);
  const raw = readFileSync(fullPath);
  return new Uint8Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

function packRgbaLe(r: number, g: number, b: number, a: number): number {
  return ((r & 0xff) | ((g & 0xff) << 8) | ((b & 0xff) << 16) | ((a & 0xff) << 24)) >>> 0;
}

function maxChannelDiff(a: Uint8Array, b: Uint8Array): number {
  expect(a.length).toBe(b.length);
  let maxDiff = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    if (diff > maxDiff) maxDiff = diff;
  }
  return maxDiff;
}

function buildSyntheticPsbBytes(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(46);
  const dv = new DataView(buf.buffer);
  buf.set([0x38, 0x42, 0x50, 0x53], 0); // "8BPS"
  dv.setUint16(4, 2, false); // PSB v2
  dv.setUint16(12, 4, false); // 4 channels
  dv.setUint32(14, height, false);
  dv.setUint32(18, width, false);
  dv.setUint16(22, 8, false); // 8-bit
  dv.setUint16(24, 3, false); // RGB
  dv.setUint32(26, 0, false); // Color mode data len
  dv.setUint32(30, 4, false); // Image resources len
  buf.set([1, 2, 3, 4], 34);
  dv.setBigUint64(38, 128n, false); // Layer & mask len
  return buf;
}

function makeWasmResponse(bytes: Uint8Array): Response {
  return new Response(bytes.slice().buffer, {
    status: 200,
    headers: {
      "content-type": "application/wasm",
      "content-length": String(bytes.byteLength),
    },
  });
}

describe("WebAssembly CPU 계층 프로브 및 3종 코어 바이너리 자동 티어 선택", () => {
  it("실제 V8에서 WebAssembly.validate() 프로브로 relaxed-simd 계층을 판정하고 강등 시뮬레이션을 정확히 분기한다", () => {
    const liveProbe = probeWasmCpuTierCapabilities();
    expect(liveProbe.webAssemblySupported).toBe(true);
    expect(liveProbe.simd128Supported).toBe(true);
    expect(liveProbe.relaxedSimdSupported).toBe(true);
    expect(liveProbe.tier).toBe("wasm-relaxed-simd");
    expect(detectWasmCpuTier()).toBe("wasm-relaxed-simd");
    expect(WebAssembly.validate(WASM_SCALAR_PROBE_BYTES as BufferSource)).toBe(true);
    expect(WebAssembly.validate(WASM_SIMD128_PROBE_BYTES as BufferSource)).toBe(true);
    expect(WebAssembly.validate(WASM_RELAXED_SIMD_PROBE_BYTES as BufferSource)).toBe(true);

    // Relaxed-SIMD 전체 허용 호스트 시뮬레이션
    expect(
      detectWasmCpuTier(
        (b) =>
          b === WASM_SCALAR_PROBE_BYTES ||
          b === WASM_SIMD128_PROBE_BYTES ||
          b === WASM_RELAXED_SIMD_PROBE_BYTES,
      ),
    ).toBe("wasm-relaxed-simd");

    // SIMD128 전용 호스트 시뮬레이션 (relaxed-simd 프로브만 거부)
    expect(
      detectWasmCpuTier(
        (b) => b === WASM_SCALAR_PROBE_BYTES || b === WASM_SIMD128_PROBE_BYTES,
      ),
    ).toBe("wasm-simd128");

    // 스칼라 전용 호스트 시뮬레이션
    expect(detectWasmCpuTier((b) => b === WASM_SCALAR_PROBE_BYTES)).toBe("wasm-scalar");

    // WebAssembly 미지원 호스트 시뮬레이션
    expect(detectWasmCpuTier(() => false)).toBe("js-fallback");
  });

  it("실물 3종 코어 .wasm 파일에 대해 relaxed-simd → simd128 → scalar → js-fallback 자동 강등이 동작한다", async () => {
    const scalarBytes = readPublicWasm("studio-wasm64-drawing-core.wasm");
    const simdBytes = readPublicWasm("studio-wasm64-drawing-core-simd.wasm");
    const relaxedBytes = readPublicWasm("studio-wasm64-drawing-core-relaxed-simd.wasm");

    expect(inferWasmBinaryCpuTier(scalarBytes)).toBe("wasm-scalar");
    expect(inferWasmBinaryCpuTier(simdBytes)).toBe("wasm-simd128");
    expect(inferWasmBinaryCpuTier(relaxedBytes)).toBe("wasm-relaxed-simd");

    const fileByUrl = new Map<string, Uint8Array>([
      [STUDIO_WASM64_CORE_RELAXED_SIMD_URL, relaxedBytes],
      [STUDIO_WASM64_CORE_SIMD_URL, simdBytes],
      [STUDIO_WASM64_CORE_URL, scalarBytes],
    ]);

    // 1) 전체 가용 → relaxed-simd 자동 선택
    const requestedAll: string[] = [];
    const rtRelaxed = await loadStudioWasm64HotpathRuntime({
      fetchFn: async (input) => {
        const url = String(input);
        requestedAll.push(url);
        const bytes = fileByUrl.get(url);
        return bytes ? makeWasmResponse(bytes) : new Response(null, { status: 404 });
      },
    });
    try {
      expect(requestedAll).toEqual([STUDIO_WASM64_CORE_RELAXED_SIMD_URL]);
      expect(rtRelaxed.getMetadata().cpuTier).toBe("wasm-relaxed-simd");
      expect(rtRelaxed.getMetadata().resolvedUrl).toBe(STUDIO_WASM64_CORE_RELAXED_SIMD_URL);
      expect(rtRelaxed.getMetadata().wasmByteLength).toBe(relaxedBytes.byteLength);
    } finally {
      rtRelaxed.dispose();
    }

    // 2) relaxed-simd 404 → simd128 자동 강등
    const requestedSimd: string[] = [];
    const rtSimd = await loadStudioWasm64HotpathRuntime({
      fetchFn: async (input) => {
        const url = String(input);
        requestedSimd.push(url);
        if (url === STUDIO_WASM64_CORE_RELAXED_SIMD_URL) {
          return new Response(null, { status: 404 });
        }
        const bytes = fileByUrl.get(url);
        return bytes ? makeWasmResponse(bytes) : new Response(null, { status: 404 });
      },
    });
    try {
      expect(requestedSimd).toEqual([
        STUDIO_WASM64_CORE_RELAXED_SIMD_URL,
        STUDIO_WASM64_CORE_SIMD_URL,
      ]);
      expect(rtSimd.getMetadata().cpuTier).toBe("wasm-simd128");
      expect(rtSimd.getMetadata().resolvedUrl).toBe(STUDIO_WASM64_CORE_SIMD_URL);
    } finally {
      rtSimd.dispose();
    }

    // 3) relaxed-simd·simd128 모두 실패 → scalar 자동 강등
    const requestedScalar: string[] = [];
    const rtScalar = await loadStudioWasm64HotpathRuntime({
      fetchFn: async (input) => {
        const url = String(input);
        requestedScalar.push(url);
        if (url !== STUDIO_WASM64_CORE_URL) return new Response(null, { status: 404 });
        return makeWasmResponse(scalarBytes);
      },
    });
    try {
      expect(requestedScalar).toEqual([
        STUDIO_WASM64_CORE_RELAXED_SIMD_URL,
        STUDIO_WASM64_CORE_SIMD_URL,
        STUDIO_WASM64_CORE_URL,
      ]);
      expect(rtScalar.getMetadata().cpuTier).toBe("wasm-scalar");
      expect(rtScalar.getMetadata().resolvedUrl).toBe(STUDIO_WASM64_CORE_URL);
    } finally {
      rtScalar.dispose();
    }

    // 4) 모든 티어 실패 → js-fallback 안전 강등
    const rtFallback = await loadStudioWasm64HotpathRuntime({
      fetchFn: async () => new Response(null, { status: 503 }),
    });
    expect(rtFallback.getMetadata().backendMode).toBe("js-fallback");
    expect(rtFallback.getMetadata().cpuTier).toBe("js-fallback");
    expect(rtFallback.getMetadata().resolvedUrl).toBeNull();
    expect(rtFallback.getMetadata().fallbackReason).toContain("503");
  });
});

describe("실물 3종 코어 바이너리(scalar · simd · relaxed-simd) vs JS 폴백 0-diff 완전 정합", () => {
  const CORE_VARIANTS: readonly {
    readonly fileName: string;
    readonly expectedTier: Wasm64ExecutableTier;
  }[] = [
    { fileName: "studio-wasm64-drawing-core.wasm", expectedTier: "wasm-scalar" },
    { fileName: "studio-wasm64-drawing-core-simd.wasm", expectedTier: "wasm-simd128" },
    {
      fileName: "studio-wasm64-drawing-core-relaxed-simd.wasm",
      expectedTier: "wasm-relaxed-simd",
    },
  ];

  for (const variant of CORE_VARIANTS) {
    it(`${variant.fileName} (${variant.expectedTier})의 7종 핫패스 커널이 JS 폴백과 0-diff로 일치한다`, async () => {
      const wasmBytes = readPublicWasm(variant.fileName);
      const runtime = await createStudioWasm64HotpathFromBytes(wasmBytes);
      try {
        const meta = runtime.getMetadata();
        expect(meta.backendMode).toBe("rust-wasm");
        expect(meta.cpuTier).toBe(variant.expectedTier);
        expect(meta.abiVersion).toBe(1);
        expect(meta.capabilitiesMask).toBe(0x7f);

        // 1) km (3채널 Kubelka-Munk 감산 혼색)
        const kmPairs: readonly [number, number, number][] = [
          [packRgbaLe(24, 92, 214, 255), packRgbaLe(245, 212, 28, 255), 0.5],
          [packRgbaLe(220, 40, 60, 200), packRgbaLe(30, 180, 210, 255), 0.35],
          [packRgbaLe(10, 20, 30, 128), packRgbaLe(250, 240, 230, 255), 0.75],
        ];
        for (const [a, b, ratio] of kmPairs) {
          expect(runtime.mixPigmentsKmPacked(a, b, ratio, "rust-wasm")).toBe(
            runtime.mixPigmentsKmPacked(a, b, ratio, "js-fallback"),
          );
        }

        // 2) km16 (16파장 분광 혼색 스칼라 + 스트립)
        const fixtures = createHotpathBenchmarkFixtures(64, 256);
        const blue = packRgbaLe(24, 92, 214, 255);
        const yellow = packRgbaLe(245, 212, 28, 255);
        expect(runtime.mixPigmentsKm16Packed(blue, yellow, 0.5, "rust-wasm")).toBe(
          runtime.mixPigmentsKm16Packed(blue, yellow, 0.5, "js-fallback"),
        );
        const km16Wasm = runtime.mixPigmentsKm16Strip(
          fixtures.kmDstRgba,
          fixtures.kmSrcRgba,
          0.5,
          "rust-wasm",
        );
        const km16Js = runtime.mixPigmentsKm16Strip(
          fixtures.kmDstRgba,
          fixtures.kmSrcRgba,
          0.5,
          "js-fallback",
        );
        expect(km16Wasm.processedPixels).toBe(256);
        expect(maxChannelDiff(km16Wasm.output, km16Js.output)).toBe(0);

        // 3) gaussianBlur (비마스크 + 마스크 0-diff)
        const blurWasm = runtime.gaussianBlurRgba(fixtures.rgba, 64, 64, {
          sigma: 1.8,
          forceBackend: "rust-wasm",
        });
        const blurJs = runtime.gaussianBlurRgba(fixtures.rgba, 64, 64, {
          sigma: 1.8,
          forceBackend: "js-fallback",
        });
        expect(blurWasm.processedPixels).toBe(64 * 64);
        expect(maxChannelDiff(blurWasm.output, blurJs.output)).toBe(0);

        // 4) unsharpMask (0-diff)
        const usmWasm = runtime.unsharpMaskRgba(fixtures.rgba, 64, 64, {
          sigma: 1.4,
          amount: 1.25,
          threshold: 2,
          forceBackend: "rust-wasm",
        });
        const usmJs = runtime.unsharpMaskRgba(fixtures.rgba, 64, 64, {
          sigma: 1.4,
          amount: 1.25,
          threshold: 2,
          forceBackend: "js-fallback",
        });
        expect(usmWasm.modifiedPixels).toBe(usmJs.modifiedPixels);
        expect(maxChannelDiff(usmWasm.output, usmJs.output)).toBe(0);

        // 5) tileComposite (12종 전 블렌드 모드 0-diff!)
        const dirtyRect = { x: 8, y: 8, width: 48, height: 48 };
        for (let mode = 0 as TileBlendModeCode; mode <= 11; mode = (mode + 1) as TileBlendModeCode) {
          const compWasm = runtime.compositeTileDirtyRect(
            fixtures.rgba,
            fixtures.nextTileRgba,
            64,
            64,
            { dirtyRect, blendMode: mode, opacityU8: 204, forceBackend: "rust-wasm" },
          );
          const compJs = runtime.compositeTileDirtyRect(
            fixtures.rgba,
            fixtures.nextTileRgba,
            64,
            64,
            { dirtyRect, blendMode: mode, opacityU8: 204, forceBackend: "js-fallback" },
          );
          expect(compWasm.processedPixels).toBe(48 * 48);
          expect(compWasm.processedPixels).toBe(compJs.processedPixels);
          expect(maxChannelDiff(compWasm.output, compJs.output)).toBe(0);
        }

        // 6) xorDelta + 7) fnv1a (0-diff)
        const xorWasm = runtime.xorTileDeltaBytes(
          fixtures.rgba,
          fixtures.nextTileRgba,
          "rust-wasm",
        );
        const xorJs = runtime.xorTileDeltaBytes(
          fixtures.rgba,
          fixtures.nextTileRgba,
          "js-fallback",
        );
        expect(xorWasm.changedBytes).toBe(xorJs.changedBytes);
        expect(xorWasm.checksumPrev).toBe(xorJs.checksumPrev);
        expect(xorWasm.checksumNext).toBe(xorJs.checksumNext);
        expect(xorWasm.checksumDelta).toBe(xorJs.checksumDelta);
        expect(maxChannelDiff(xorWasm.delta, xorJs.delta)).toBe(0);
        expect(runtime.fnv1aChecksum(fixtures.rgba, "rust-wasm")).toBe(
          runtime.fnv1aChecksum(fixtures.rgba, "js-fallback"),
        );
      } finally {
        runtime.dispose();
      }
    });
  }
});

describe("실물 studio-wasm64-extended-suite.wasm 전체 21종 확장 C-ABI 래퍼 & 0-누수 검증", () => {
  it("확장 스위트 메타데이터·지연 fetch 로드·Pro Raster 11종 C-ABI와 0-메모리 누수를 검증한다", async () => {
    const suiteBytes = readPublicWasm("studio-wasm64-extended-suite.wasm");

    // 지연 fetch 경로 검증
    const fetchedSuite = await loadStudioWasm64ExtendedSuiteRuntime({
      fetchFn: async (input) => {
        expect(String(input)).toBe(STUDIO_WASM64_EXTENDED_SUITE_URL);
        return makeWasmResponse(suiteBytes);
      },
    });
    const fetchMeta = fetchedSuite.getMetadata();
    expect(fetchMeta.abiVersion).toBe(WASM64_EXTENDED_SUITE_EXPECTED_ABI);
    expect(fetchMeta.hotpathCapabilitiesMask).toBe(WASM64_EXTENDED_SUITE_EXPECTED_HOTPATH_CAPS);
    expect(fetchMeta.extended3dCapabilitiesMask).toBe(WASM64_EXTENDED_SUITE_EXPECTED_3D_CAPS);
    expect(fetchMeta.atelierStageCapabilitiesMask).toBe(WASM64_EXTENDED_SUITE_EXPECTED_STAGE_CAPS);
    expect(fetchMeta.extendedCapabilitiesMask).toBe(WASM64_EXTENDED_SUITE_EXPECTED_CAPS);
    expect(fetchMeta.cpuTier).toBe("wasm-relaxed-simd");
    expect(fetchMeta.wasmByteLength).toBe(suiteBytes.byteLength);
    fetchedSuite.dispose();

    // 바이트 직접 로드 후 Pro Raster 11종 실행
    const suite = await createStudioWasm64ExtendedSuiteFromBytes(suiteBytes);
    try {
      // 1) floodFillRgba (2px 선화 틈새 닫기 포함) + 2) magicWandMask + 3) extractMarchingAnts
      const cw = 64;
      const ch = 64;
      const canvas = new Uint8Array(cw * ch * 4).fill(255);
      for (let x = 8; x <= 55; x += 1) {
        for (const y of [8, 55]) {
          const off = (y * cw + x) * 4;
          canvas[off] = 0;
          canvas[off + 1] = 0;
          canvas[off + 2] = 0;
        }
      }
      for (let y = 8; y <= 55; y += 1) {
        for (const x of [8, 55]) {
          if (x === 55 && (y === 30 || y === 31)) continue; // 2px gap
          const off = (y * cw + x) * 4;
          canvas[off] = 0;
          canvas[off + 1] = 0;
          canvas[off + 2] = 0;
        }
      }

      const filled = suite.floodFillRgba(canvas, cw, ch, {
        seedX: 32,
        seedY: 32,
        fillRgba: [20, 140, 250, 255],
        tolerance: 0,
        gapClosingRadius: 1,
      });
      expect(filled.filledPixels).toBe(46 * 46);
      expect(filled.dirtyRect).toEqual({ x: 9, y: 9, width: 46, height: 46 });
      // 외부 픽셀 (0,0)은 틈새 닫기로 인해 흰색 보존
      expect(Array.from(filled.output.subarray(0, 4))).toEqual([255, 255, 255, 255]);

      const wand = suite.magicWandMask(filled.output, cw, ch, {
        seedX: 32,
        seedY: 32,
        tolerance: 0,
        gapClosingRadius: 0,
        antiAlias: false,
      });
      expect(wand.selectedPixels).toBe(46 * 46);
      expect(wand.dirtyRect).toEqual({ x: 9, y: 9, width: 46, height: 46 });

      const ants = suite.extractMarchingAnts(wand.mask, cw, ch, { threshold: 1 });
      expect(ants.segmentCount).toBe(4);
      expect(ants.segments.length).toBe(16);

      // 4) rgbaToOklch ↔ 5) oklchToRgba 왕복 정밀도
      const sampleRgba = new Uint8Array([
        255, 255, 255, 255,
        24, 92, 214, 255,
        245, 212, 28, 255,
        32, 160, 110, 180,
      ]);
      const oklchRes = suite.rgbaToOklch(sampleRgba);
      expect(oklchRes.pixelCount).toBe(4);
      expect(oklchRes.oklch[0]).toBeCloseTo(1.0, 4);
      expect(oklchRes.oklch[1]).toBeCloseTo(0.0, 4);
      const backRgba = suite.oklchToRgba(oklchRes.oklch);
      expect(backRgba.pixelCount).toBe(4);
      expect(maxChannelDiff(sampleRgba, backRgba.rgba)).toBeLessThanOrEqual(1);

      // 6) rgbaToCmyk
      const cmykRes = suite.rgbaToCmyk(sampleRgba, 0.75);
      expect(cmykRes.pixelCount).toBe(4);
      expect(Array.from(cmykRes.cmyk.subarray(0, 4))).toEqual([0, 0, 0, 0]);
      expect(cmykRes.cmyk[4]).toBeGreaterThan(100); // 파랑 픽셀 C 채널

      // 7) renderHalftoneScreentone (원형 도트 & 크로스해치)
      const halftone = suite.renderHalftoneScreentone(cw, ch, {
        sourceRgba: filled.output,
        pattern: "dot",
        cellPitchPx: 8.0,
        angleDeg: 45.0,
        toneDensity: 0.4,
        softness: 0.06,
      });
      expect(halftone.processedPixels).toBe(cw * ch);
      expect(halftone.output.length).toBe(cw * ch * 4);

      // 8) liquifyDisplaceRgba
      const liq = suite.liquifyDisplaceRgba(filled.output, cw, ch, {
        mode: "push",
        cx: 32,
        cy: 32,
        radius: 16,
        strength: 0.85,
        dx: 5,
        dy: -3,
      });
      expect(liq.affectedPixels).toBeGreaterThan(700);
      expect(liq.dirtyRect.width).toBeGreaterThan(0);
      expect(liq.dirtyRect.height).toBeGreaterThan(0);

      // 9) warpMeshRigidMls (90° 강체 회전 정확성)
      const mls = suite.warpMeshRigidMls(
        new Float32Array([0, 0, 10, 0, 10, 10]),
        new Float32Array([0, 0, 0, 0, 1, 10, 0, 0, 10, 1]),
        1.0,
      );
      expect(mls.vertexCount).toBe(3);
      expect(mls.verticesXy[4]).toBeCloseTo(-10, 2);
      expect(mls.verticesXy[5]).toBeCloseTo(10, 2);

      // 10) vectorizeStrokeCubic (32점 사인 아크 → 3차 베지어 압축)
      const strokePts = new Float32Array(32 * 3);
      for (let i = 0; i < 32; i += 1) {
        const t = i / 31;
        strokePts[i * 3] = t * 120;
        strokePts[i * 3 + 1] = Math.sin(t * Math.PI) * 30;
        strokePts[i * 3 + 2] = 0.6;
      }
      const vec = suite.vectorizeStrokeCubic(strokePts, {
        rdpEpsilon: 0.3,
        bezierErrorTolerance: 1.0,
      });
      expect(vec.segmentCount).toBeGreaterThanOrEqual(1);
      expect(vec.segments.length).toBe(vec.segmentCount * 10);
      expect(vec.compressionRatio).toBeGreaterThan(1);

      // 11) parsePsdHeader (PSB 40,000 × 30,000 초대형 캔버스 + Memory64 판별)
      const psbInfo = suite.parsePsdHeader(buildSyntheticPsbBytes(40_000, 30_000));
      expect(psbInfo.version).toBe(2);
      expect(psbInfo.isPsb).toBe(true);
      expect(psbInfo.channels).toBe(4);
      expect(psbInfo.width).toBe(40_000);
      expect(psbInfo.height).toBe(30_000);
      expect(psbInfo.depthBits).toBe(8);
      expect(psbInfo.colorModeName).toBe("rgb");
      expect(psbInfo.estimatedUncompressedRgbaBytes).toBe(4_800_000_000n);
      expect(psbInfo.requiresMemory64).toBe(true);

      // 오류 경로(잘못된 PSD 서명)에서도 선형 메모리 누수 0건 검증
      expect(() => suite.parsePsdHeader(new Uint8Array([0, 1, 2, 3]))).toThrow();
      const stats = suite.getArenaStats();
      expect(stats.activeAllocations).toBe(0);
      expect(stats.liveAllocatedBytes).toBe(0);
      expect(stats.totalAllocations).toBeGreaterThan(0);
      expect(stats.totalAllocations).toBe(stats.totalFrees);
    } finally {
      suite.dispose();
    }
  });

  it("3D · Virtual Studio · 물리 · Foley DSP 10종 C-ABI와 0-메모리 누수를 검증한다", async () => {
    const suiteBytes = readPublicWasm("studio-wasm64-extended-suite.wasm");
    const suite = await createStudioWasm64ExtendedSuiteFromBytes(suiteBytes);
    try {
      // 12) encodeMorton2d & 13) encodeMorton3d
      expect(suite.encodeMorton2d(3, 5)).toBe(0b100111);
      expect(suite.encodeMorton3d(1, 2, 4)).toBe(0b100010001);

      // 14) skinVrmMesh4BoneSoa (항등 + 평행이동 본 행렬로 정점 변환 검증)
      const vCount = 8;
      const inPosXyz = new Float32Array(vCount * 3);
      const inNormXyz = new Float32Array(vCount * 3);
      for (let i = 0; i < vCount; i += 1) {
        inPosXyz[i] = i + 1;
        inPosXyz[vCount + i] = 2;
        inPosXyz[2 * vCount + i] = 3;
        inNormXyz[2 * vCount + i] = 1;
      }
      const joints = new Uint16Array(vCount * 4);
      const weights = new Float32Array(vCount * 4);
      for (let i = 0; i < vCount; i += 1) weights[i] = 1;
      // 열 우선(column-major) 4×4 평행이동 행렬 (+10, -5, +2)
      const boneMat = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        10, -5, 2, 1,
      ]);
      const skinned = suite.skinVrmMesh4BoneSoa({
        inPosXyz,
        inNormXyz,
        joints,
        weights,
        boneMatrices: boneMat,
        vertexCount: vCount,
        boneCount: 1,
      });
      expect(skinned.skinnedVertices).toBe(vCount);
      expect(skinned.outPosXyz[0]).toBeCloseTo(11, 4);
      expect(skinned.outPosXyz[vCount]).toBeCloseTo(-3, 4);
      expect(skinned.outPosXyz[2 * vCount]).toBeCloseTo(5, 4);
      expect(skinned.outNormXyz[2 * vCount]).toBeCloseTo(1, 4);

      // 15) extractLtLineart (깊이 불연속 경계선 잉크 추출)
      const ltW = 16;
      const ltH = 16;
      const ltN = ltW * ltH;
      const normalXyz = new Float32Array(ltN * 3);
      const depth = new Float32Array(ltN).fill(1.0);
      for (let y = 0; y < ltH; y += 1) {
        for (let x = 0; x < ltW; x += 1) {
          const idx = y * ltW + x;
          normalXyz[2 * ltN + idx] = 1.0;
          if (x >= 4 && x <= 11 && y >= 4 && y <= 11) depth[idx] = 0.2;
        }
      }
      const lt = suite.extractLtLineart(normalXyz, depth, ltW, ltH);
      expect(lt.inkPixels).toBeGreaterThan(0);
      expect(lt.alpha.length).toBe(ltN);

      // 16) cullStageFrustumHiz (가시 1개 + 프러스텀 외부 1개 컬링)
      const idMat = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      const cull = suite.cullStageFrustumHiz({
        viewProj: idMat,
        cameraPos: [0, 0, 2],
        lodDistances: [10, 25, 50],
        depthRange: "neg-one-to-one",
        aabbs: new Float32Array([
          -0.2, -0.2, -0.2, 0.2, 0.2, 0.2, 0, // 가시
          5.0, 5.0, 5.0, 6.0, 6.0, 6.0, 0, // 프러스텀 밖
        ]),
      });
      expect(cull.visibleCount).toBe(1);
      expect(cull.frustumCulledCount).toBe(1);
      expect(Array.from(cull.visibleIndices)).toEqual([0]);

      // 17) resolveStageSphereOverlaps (겹친 두 구체 분리)
      const overlap = suite.resolveStageSphereOverlaps(
        new Float32Array([0, 0, 0, 1, 1, 0.5, 0, 0, 1, 1]),
        { cellSize: 2.0, iterations: 6, relaxation: 0.85 },
      );
      expect(overlap.resolvedPairs).toBeGreaterThanOrEqual(1);
      const distAfter = Math.abs((overlap.spheres[5] ?? 0) - (overlap.spheres[0] ?? 0));
      expect(distAfter).toBeGreaterThan(1.5);

      // 18) evaluateStageAcousticsAndLighting
      const stageEval = suite.evaluateStageAcousticsAndLighting({
        listener: new Float32Array([0, 0, 0, 0, 0, -1, 0, 1, 0, 1800, 0.02]),
        sources: new Float32Array([2, 0, -3, 1.0, 1.0, 30.0, 0.0]),
        lights: new Float32Array([0, 0, 5, 5, 1, 1, 1, 2.0, 10.0]),
        samples: new Float32Array([0, 0, 0, 0, 1, 0, 2.0, 0.5]),
      });
      expect(stageEval.evaluatedTotal).toBe(2);
      expect(stageEval.audioOut.length).toBe(6);
      expect(stageEval.lightingOut.length).toBe(8);
      // 우측(+X=2) 음원은 right_gain > left_gain
      expect(stageEval.audioOut[1]).toBeGreaterThan(stageEval.audioOut[0] ?? 0);
      expect(stageEval.lightingOut[6]).toBeGreaterThan(0);

      // 19) stepVerletSpringChainsSoa (중력 하강 검증)
      const verlet = suite.stepVerletSpringChainsSoa({
        posXyz: new Float32Array([0, 1.0, 0]),
        prevXyz: new Float32Array([0, 1.0, 0]),
        invMass: new Float32Array([1.0]),
        restLen: new Float32Array([0.0]),
        iterations: 4,
      });
      expect(verlet.particleCount).toBe(1);
      expect(verlet.posXyz[1]).toBeLessThan(1.0);

      // 20) solveFingerFabrikChain (3관절 손가락 목표 도달 수렴)
      const fabrik = suite.solveFingerFabrikChain({
        jointsXyz: new Float32Array([0, 0, 0, 0, 0, 0.04, 0, 0, 0.07, 0, 0, 0.09]),
        boneLengths: new Float32Array([0.04, 0.03, 0.02]),
        targetXyz: new Float32Array([0, -0.04, 0.05]),
        maxIterations: 24,
      });
      expect(fabrik.iterations).toBeGreaterThanOrEqual(0);
      expect(fabrik.jointsXyz.length).toBe(12);
      expect(Number.isFinite(fabrik.jointsXyz[10])).toBe(true);

      // 21) renderFoleyBiquadBlock (128-프레임 AudioWorklet 블록 + 상태 연속성)
      const monoIn = Float32Array.from({ length: 128 }, (_, i) => Math.sin((2 * Math.PI * i) / 32) * 0.5);
      const dsp = suite.renderFoleyBiquadBlock({
        monoIn,
        filterMode: "lowpass",
        params: { pan: 0.4, cutoffHz: 2200, limiterCeiling: 0.95 },
      });
      expect(dsp.renderedFrames).toBe(128);
      expect(dsp.outLeft.length).toBe(128);
      expect(dsp.outRight.length).toBe(128);
      let energyR = 0;
      let energyL = 0;
      for (let i = 0; i < 128; i += 1) {
        energyL += (dsp.outLeft[i] ?? 0) ** 2;
        energyR += (dsp.outRight[i] ?? 0) ** 2;
      }
      expect(energyR).toBeGreaterThan(energyL);

      // 전체 호출 후 선형 메모리 누수 0건 최종 검증
      const stats = suite.getArenaStats();
      expect(stats.activeAllocations).toBe(0);
      expect(stats.liveAllocatedBytes).toBe(0);
      expect(stats.totalAllocations).toBe(stats.totalFrees);
    } finally {
      suite.dispose();
    }
  });

  it("신규 확장 브리지 소스 파일은 800줄 이하이며 웹 스토리지·원시 색상을 사용하지 않는다", () => {
    const newFiles = [
      "wasm64-cpu-tier.ts",
      "wasm64-hotpath-js-compositor.ts",
      "wasm64-extended-suite-types.ts",
      "wasm64-extended-suite-arena.ts",
      "wasm64-extended-suite-raster.ts",
      "wasm64-extended-suite-3d.ts",
      "wasm64-extended-suite-loader.ts",
    ];
    for (const fileName of newFiles) {
      const src = readFileSync(path.join(BRIDGE_DIR, fileName), "utf8");
      expect(src.split("\n").length).toBeLessThanOrEqual(800);
      expect(src).not.toMatch(/\b(?:localStorage|sessionStorage)\b/u);
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    }
  });
});
