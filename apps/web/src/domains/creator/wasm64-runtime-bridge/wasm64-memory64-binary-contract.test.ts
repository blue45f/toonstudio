// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { createStudioWave3RuntimeFromBytes } from "../wasm64-native-wave3";
import {
  ALL_WASM64_ASSET_URLS,
  DEFAULT_WASM64_MEMORY64_ASSET_URLS,
  PwaBaseAssetPinner,
  createInMemoryCacheStorage,
} from "../wasm64-offline-pwa";
import {
  STUDIO_WASM64_CORE_MEMORY64_URL,
  STUDIO_WASM64_CORE_RELAXED_SIMD_URL,
  STUDIO_WASM64_CORE_SIMD_URL,
  STUDIO_WASM64_CORE_URL,
  STUDIO_WASM64_EXTENDED_SUITE_MEMORY64_URL,
  STUDIO_WASM64_EXTENDED_SUITE_URL,
  StudioWasm64HotpathPanel,
  type StudioWasm64HotpathPanelProps,
  WASM_MEMORY64_FLAG,
  WASM_MEMORY64_PROBE_BYTES,
  WASM_RELAXED_SIMD_PROBE_BYTES,
  WASM_SCALAR_PROBE_BYTES,
  WASM_SIMD128_PROBE_BYTES,
  createDualAddressWidthWasmAdapter,
  createHotpathBenchmarkFixtures,
  createStudioWasm64HotpathFromBytes,
  detectWasmMemory64Support,
  inspectWasmBinaryMemorySection,
  loadStudioWasm64ExtendedSuite,
  loadStudioWasm64Memory64Hotpath,
  probeWasmCpuTierCapabilities,
  type TileBlendModeCode,
} from "./index";
import { createStudioWasm64ExtendedSuiteFromBytes } from "./wasm64-extended-suite-loader";

const REPO_ROOT = path.resolve(process.cwd());
const PUBLIC_WASM_DIR = path.join(REPO_ROOT, "apps/web/public/wasm");
const BRIDGE_DIR = path.join(REPO_ROOT, "apps/web/src/domains/creator/wasm64-runtime-bridge");

function readWasmFile(fileName: string): Uint8Array {
  const fullPath = path.join(PUBLIC_WASM_DIR, fileName);
  expect(existsSync(fullPath)).toBe(true);
  const raw = readFileSync(fullPath);
  return new Uint8Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
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

function buildSyntheticPsbBytes(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(46);
  const dv = new DataView(buf.buffer);
  buf.set([0x38, 0x42, 0x50, 0x53], 0);
  dv.setUint16(4, 2, false);
  dv.setUint16(12, 4, false);
  dv.setUint32(14, height, false);
  dv.setUint32(18, width, false);
  dv.setUint16(22, 8, false);
  dv.setUint16(24, 3, false);
  dv.setUint32(26, 0, false);
  dv.setUint32(30, 4, false);
  buf.set([1, 2, 3, 4], 34);
  dv.setBigUint64(38, BigInt(128), false);
  return buf;
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

describe("실물 wasm64-unknown-unknown (memory64, flags=0x04) 바이너리 계약 및 듀얼 ABI 검증", () => {
  it("Section 5(Memory) 바이트 검사에서 신규 2종은 flags & 0x04 === 0x04(i64), 기존 폴백 4종은 0x00(i32)임을 증명한다", () => {
    const memory64Files = [
      "studio-wasm64-drawing-core-memory64.wasm",
      "studio-wasm64-extended-suite-memory64.wasm",
    ] as const;
    for (const fileName of memory64Files) {
      const bytes = readWasmFile(fileName);
      const section = inspectWasmBinaryMemorySection(bytes);
      expect(section.validWasmHeader).toBe(true);
      expect(section.hasMemorySection).toBe(true);
      expect(section.flags).not.toBeNull();
      expect((section.flags ?? 0) & WASM_MEMORY64_FLAG).toBe(WASM_MEMORY64_FLAG);
      expect(section.isMemory64).toBe(true);
      expect(section.addressBits).toBe(64);
      expect(section.initialPages).not.toBeNull();
      const latin1 = Buffer.from(bytes).toString("latin1");
      expect(latin1).not.toContain("/Users/");
      expect(latin1).not.toContain("/home/");
    }

    const wasm32FallbackFiles = [
      "studio-wasm64-drawing-core.wasm",
      "studio-wasm64-drawing-core-simd.wasm",
      "studio-wasm64-drawing-core-relaxed-simd.wasm",
      "studio-wasm64-extended-suite.wasm",
    ] as const;
    for (const fileName of wasm32FallbackFiles) {
      const bytes = readWasmFile(fileName);
      const section = inspectWasmBinaryMemorySection(bytes);
      expect(section.validWasmHeader).toBe(true);
      expect(section.hasMemorySection).toBe(true);
      expect((section.flags ?? 0) & WASM_MEMORY64_FLAG).toBe(0);
      expect(section.isMemory64).toBe(false);
      expect(section.addressBits).toBe(32);
    }
  });

  it("Node 24 V8에서 core-memory64 바이너리를 실물 인스턴스화해 BigInt(i64) 포인터 할당 및 전 핫패스 0-diff 일치를 검증한다", async () => {
    const coreMem64Bytes = readWasmFile("studio-wasm64-drawing-core-memory64.wasm");
    const coreWasm32Bytes = readWasmFile("studio-wasm64-drawing-core-relaxed-simd.wasm");

    // 1) 원시 WebAssembly.instantiate + BigInt(i64) 포인터 직접 검증
    const { instance } = await WebAssembly.instantiate(coreMem64Bytes.slice().buffer, {});
    expect(Object.keys(instance.exports).length).toBe(16);
    const dual = createDualAddressWidthWasmAdapter<Record<string, unknown>>(instance.exports, {
      binaryBytes: coreMem64Bytes,
    });
    expect(dual.addressBits).toBe(64);
    expect(dual.memory64Active).toBe(true);

    const rawPtr = dual.allocBigInt(256);
    expect(typeof rawPtr).toBe("bigint");
    expect(rawPtr > BigInt(0)).toBe(true);
    const mem = instance.exports.memory as WebAssembly.Memory;
    const view = new Uint8Array(mem.buffer, dual.toSafeOffset(rawPtr), 256);
    view.fill(0xa5);
    expect(dual.callKernel("wasm_fnv1a_checksum", rawPtr, 256) >>> 0).toBeGreaterThan(0);
    dual.freeBigInt(rawPtr, 256);

    // 2) Hotpath 런타임: memory64 vs wasm32 vs JS 폴백 0-diff 완전 일치
    const rt64 = await createStudioWasm64HotpathFromBytes(coreMem64Bytes);
    const rt32 = await createStudioWasm64HotpathFromBytes(coreWasm32Bytes);
    try {
      expect(rt64.getTelemetry().addressBits).toBe(64);
      expect(rt64.getTelemetry().memory64Active).toBe(true);
      expect(rt32.getTelemetry().addressBits).toBe(32);
      expect(rt32.getTelemetry().memory64Active).toBe(false);

      const fixtures = createHotpathBenchmarkFixtures(64, 512);
      const km64 = rt64.mixPigmentsKm16Strip(fixtures.kmDstRgba, fixtures.kmSrcRgba, 0.5, "rust-wasm");
      const km32 = rt32.mixPigmentsKm16Strip(fixtures.kmDstRgba, fixtures.kmSrcRgba, 0.5, "rust-wasm");
      const kmJs = rt64.mixPigmentsKm16Strip(fixtures.kmDstRgba, fixtures.kmSrcRgba, 0.5, "js-fallback");
      expect(Array.from(km64.output)).toEqual(Array.from(km32.output));
      expect(Array.from(km64.output)).toEqual(Array.from(kmJs.output));

      const mask = Uint8Array.from({ length: 64 * 64 }, (_, i) => (i % 64 < 32 ? 255 : 0));
      const blur64 = rt64.gaussianBlurRgba(fixtures.rgba, 64, 64, { sigma: 1.8, selectionMask: mask });
      const blur32 = rt32.gaussianBlurRgba(fixtures.rgba, 64, 64, { sigma: 1.8, selectionMask: mask });
      const blurJs = rt64.gaussianBlurRgba(fixtures.rgba, 64, 64, {
        sigma: 1.8,
        selectionMask: mask,
        forceBackend: "js-fallback",
      });
      expect(Array.from(blur64.output)).toEqual(Array.from(blur32.output));
      expect(Array.from(blur64.output)).toEqual(Array.from(blurJs.output));

      const usm64 = rt64.unsharpMaskRgba(fixtures.rgba, 64, 64, { sigma: 1.4, amount: 1.25, threshold: 2 });
      const usm32 = rt32.unsharpMaskRgba(fixtures.rgba, 64, 64, { sigma: 1.4, amount: 1.25, threshold: 2 });
      const usmJs = rt64.unsharpMaskRgba(fixtures.rgba, 64, 64, {
        sigma: 1.4,
        amount: 1.25,
        threshold: 2,
        forceBackend: "js-fallback",
      });
      expect(usm64.modifiedPixels).toBe(usm32.modifiedPixels);
      expect(Array.from(usm64.output)).toEqual(Array.from(usm32.output));
      expect(Array.from(usm64.output)).toEqual(Array.from(usmJs.output));

      const dirtyRect = { x: 8, y: 8, width: 48, height: 48 };
      for (let mode = 0 as TileBlendModeCode; mode <= 11; mode = (mode + 1) as TileBlendModeCode) {
        const comp64 = rt64.compositeTileDirtyRect(fixtures.rgba, fixtures.nextTileRgba, 64, 64, {
          dirtyRect,
          blendMode: mode,
          opacityU8: 204,
        });
        const comp32 = rt32.compositeTileDirtyRect(fixtures.rgba, fixtures.nextTileRgba, 64, 64, {
          dirtyRect,
          blendMode: mode,
          opacityU8: 204,
        });
        const compJs = rt64.compositeTileDirtyRect(fixtures.rgba, fixtures.nextTileRgba, 64, 64, {
          dirtyRect,
          blendMode: mode,
          opacityU8: 204,
          forceBackend: "js-fallback",
        });
        expect(Array.from(comp64.output)).toEqual(Array.from(comp32.output));
        expect(Array.from(comp64.output)).toEqual(Array.from(compJs.output));
      }

      const imp64 = rt64.applyImpastoLightingRgba(fixtures.rgba, fixtures.heightMap, 64, 64);
      const imp32 = rt32.applyImpastoLightingRgba(fixtures.rgba, fixtures.heightMap, 64, 64);
      expect(Array.from(imp64.output)).toEqual(Array.from(imp32.output));

      const xor64 = rt64.xorTileDeltaBytes(fixtures.rgba, fixtures.nextTileRgba, "rust-wasm");
      const xor32 = rt32.xorTileDeltaBytes(fixtures.rgba, fixtures.nextTileRgba, "rust-wasm");
      expect(xor64.checksumDelta).toBe(xor32.checksumDelta);
      expect(Array.from(xor64.delta)).toEqual(Array.from(xor32.delta));
    } finally {
      rt64.dispose();
      rt32.dispose();
    }
  });

  it("extended-suite-memory64 (62 exports)의 Pro Raster · 3D/물리 · Wave-2 · Wave-3 커널이 wasm32와 0-diff로 일치하고 누수가 0건이다", async () => {
    const extMem64Bytes = readWasmFile("studio-wasm64-extended-suite-memory64.wasm");
    const extWasm32Bytes = readWasmFile("studio-wasm64-extended-suite.wasm");

    const { instance: rawInst64 } = await WebAssembly.instantiate(extMem64Bytes.slice().buffer, {});
    expect(Object.keys(rawInst64.exports).length).toBe(62);
    const rawDual64 = createDualAddressWidthWasmAdapter<Record<string, unknown>>(rawInst64.exports, {
      binaryBytes: extMem64Bytes,
    });

    // Wave-2 PackBits RLE 왕복 검증 (i64 포인터 경계 직접 실행)
    const rleSrc = Uint8Array.from({ length: 256 }, (_, i) => (i < 128 ? 77 : i & 0xff));
    const srcPtr = rawDual64.allocBigInt(rleSrc.length);
    const maxCap = rawDual64.callKernel("wasm_packbits_rle_encode", srcPtr, rleSrc.length, BigInt(0), 0);
    const encPtr = rawDual64.allocBigInt(maxCap);
    const decPtr = rawDual64.allocBigInt(rleSrc.length);
    try {
      const memBuf = (rawInst64.exports.memory as WebAssembly.Memory).buffer;
      new Uint8Array(memBuf, rawDual64.toSafeOffset(srcPtr), rleSrc.length).set(rleSrc);
      const encLen = rawDual64.callKernel("wasm_packbits_rle_encode", srcPtr, rleSrc.length, encPtr, maxCap);
      expect(encLen).toBeGreaterThan(0);
      const decLen = rawDual64.callKernel("wasm_packbits_rle_decode", encPtr, encLen, decPtr, rleSrc.length);
      expect(decLen).toBe(rleSrc.length);
      const decoded = new Uint8Array(
        (rawInst64.exports.memory as WebAssembly.Memory).buffer,
        rawDual64.toSafeOffset(decPtr),
        rleSrc.length,
      );
      expect(Array.from(decoded)).toEqual(Array.from(rleSrc));
    } finally {
      rawDual64.freeBigInt(decPtr, rleSrc.length);
      rawDual64.freeBigInt(encPtr, maxCap);
      rawDual64.freeBigInt(srcPtr, rleSrc.length);
    }

    const suite64 = await createStudioWasm64ExtendedSuiteFromBytes(extMem64Bytes);
    const suite32 = await createStudioWasm64ExtendedSuiteFromBytes(extWasm32Bytes);
    const wave3_64 = await createStudioWave3RuntimeFromBytes(extMem64Bytes);
    const wave3_32 = await createStudioWave3RuntimeFromBytes(extWasm32Bytes);
    try {
      expect(suite64.getMetadata().addressBits).toBe(64);
      expect(suite64.getMetadata().memory64Active).toBe(true);
      expect(suite32.getMetadata().addressBits).toBe(32);
      expect(suite32.getMetadata().memory64Active).toBe(false);

      const canvas = new Uint8Array(32 * 32 * 4).fill(255);
      const f64 = suite64.floodFillRgba(canvas, 32, 32, { seedX: 8, seedY: 8, fillRgba: [40, 120, 220, 255] });
      const f32 = suite32.floodFillRgba(canvas, 32, 32, { seedX: 8, seedY: 8, fillRgba: [40, 120, 220, 255] });
      expect(f64.filledPixels).toBe(32 * 32);
      expect(Array.from(f64.output)).toEqual(Array.from(f32.output));

      const ht64 = suite64.renderHalftoneScreentone(32, 32, { sourceRgba: f64.output, pattern: "dot" });
      const ht32 = suite32.renderHalftoneScreentone(32, 32, { sourceRgba: f32.output, pattern: "dot" });
      expect(Array.from(ht64.output)).toEqual(Array.from(ht32.output));

      const psb64 = suite64.parsePsdHeader(buildSyntheticPsbBytes(40_000, 30_000));
      const psb32 = suite32.parsePsdHeader(buildSyntheticPsbBytes(40_000, 30_000));
      expect(psb64).toEqual(psb32);
      expect(psb64.requiresMemory64).toBe(true);

      const verlet64 = suite64.stepVerletSpringChainsSoa({
        posXyz: new Float32Array([0, 1, 0]),
        prevXyz: new Float32Array([0, 1, 0]),
        invMass: new Float32Array([1]),
        restLen: new Float32Array([0]),
      });
      const verlet32 = suite32.stepVerletSpringChainsSoa({
        posXyz: new Float32Array([0, 1, 0]),
        prevXyz: new Float32Array([0, 1, 0]),
        invMass: new Float32Array([1]),
        restLen: new Float32Array([0]),
      });
      expect(Array.from(verlet64.posXyz)).toEqual(Array.from(verlet32.posXyz));

      // Wave-3 벡터·색상·오디오 DSP 0-diff 검증
      const rdp64 = wave3_64.simplifyPolylineRdp(new Float32Array([0, 0, 5, 0.01, 10, 0, 10, 10]), 0.2);
      const rdp32 = wave3_32.simplifyPolylineRdp(new Float32Array([0, 0, 5, 0.01, 10, 0, 10, 10]), 0.2);
      expect(Array.from(rdp64)).toEqual(Array.from(rdp32));

      const cmyk64 = wave3_64.rgbaToCmykTac(f64.output.subarray(0, 64), { tacLimitPct: 260 });
      const cmyk32 = wave3_32.rgbaToCmykTac(f32.output.subarray(0, 64), { tacLimitPct: 260 });
      expect(Array.from(cmyk64.cmyk)).toEqual(Array.from(cmyk32.cmyk));

      const stats64 = suite64.getArenaStats();
      expect(stats64.activeAllocations).toBe(0);
      expect(stats64.liveAllocatedBytes).toBe(0);
      expect(stats64.totalAllocations).toBe(stats64.totalFrees);
    } finally {
      suite64.dispose();
      suite32.dispose();
      wave3_64.dispose();
      wave3_32.dispose();
    }
  });

  it("detectWasmMemory64Support · preferMemory64 우선 로드 · 404/Safari wasm32 폴백 · PWA 피닝 · UI 배지를 검증한다", async () => {
    expect(detectWasmMemory64Support()).toBe(true);
    expect(probeWasmCpuTierCapabilities().memory64Supported).toBe(true);
    expect(detectWasmMemory64Support((b) => b === WASM_SCALAR_PROBE_BYTES)).toBe(false);
    expect(
      detectWasmMemory64Support((b) => b === WASM_MEMORY64_PROBE_BYTES || b === WASM_SIMD128_PROBE_BYTES),
    ).toBe(true);

    const coreMem64 = readWasmFile("studio-wasm64-drawing-core-memory64.wasm");
    const coreRelaxed32 = readWasmFile("studio-wasm64-drawing-core-relaxed-simd.wasm");
    const extMem64 = readWasmFile("studio-wasm64-extended-suite-memory64.wasm");
    const extWasm32 = readWasmFile("studio-wasm64-extended-suite.wasm");

    // 1) memory64 가용 시 우선 로드 -> addressBits: 64, memory64Active: true
    const seenUrls: string[] = [];
    const rtPrimary = await loadStudioWasm64Memory64Hotpath({
      fetchFn: async (input) => {
        const url = String(input);
        seenUrls.push(url);
        return url === STUDIO_WASM64_CORE_MEMORY64_URL
          ? makeWasmResponse(coreMem64)
          : new Response(null, { status: 404 });
      },
    });
    expect(seenUrls).toEqual([STUDIO_WASM64_CORE_MEMORY64_URL]);
    expect(rtPrimary.getTelemetry().addressBits).toBe(64);
    expect(rtPrimary.getTelemetry().memory64Active).toBe(true);

    // 2) memory64 404 또는 Safari(memory64 미지원) -> wasm32(relaxed-simd) 즉시 무중단 폴백
    const fallbackUrls: string[] = [];
    const rtFallback32 = await loadStudioWasm64Memory64Hotpath({
      fetchFn: async (input) => {
        const url = String(input);
        fallbackUrls.push(url);
        if (url === STUDIO_WASM64_CORE_MEMORY64_URL) return new Response(null, { status: 404 });
        return url === STUDIO_WASM64_CORE_RELAXED_SIMD_URL
          ? makeWasmResponse(coreRelaxed32)
          : new Response(null, { status: 404 });
      },
    });
    expect(fallbackUrls).toEqual([STUDIO_WASM64_CORE_MEMORY64_URL, STUDIO_WASM64_CORE_RELAXED_SIMD_URL]);
    expect(rtFallback32.getTelemetry().addressBits).toBe(32);
    expect(rtFallback32.getTelemetry().memory64Active).toBe(false);

    const safariUrls: string[] = [];
    const rtSafari = await loadStudioWasm64Memory64Hotpath({
      validateFn: (b) =>
        b === WASM_SCALAR_PROBE_BYTES ||
        b === WASM_SIMD128_PROBE_BYTES ||
        b === WASM_RELAXED_SIMD_PROBE_BYTES,
      fetchFn: async (input) => {
        const url = String(input);
        safariUrls.push(url);
        return makeWasmResponse(coreRelaxed32);
      },
    });
    expect(safariUrls).toEqual([STUDIO_WASM64_CORE_RELAXED_SIMD_URL]);
    expect(rtSafari.getTelemetry().addressBits).toBe(32);
    rtSafari.dispose();

    // 3) Extended Suite preferMemory64 우선 로드 및 404 폴백
    const extPrimary = await loadStudioWasm64ExtendedSuite({
      preferMemory64: true,
      fetchFn: async (input) =>
        String(input) === STUDIO_WASM64_EXTENDED_SUITE_MEMORY64_URL
          ? makeWasmResponse(extMem64)
          : new Response(null, { status: 404 }),
    });
    expect(extPrimary.getMetadata().addressBits).toBe(64);
    expect(extPrimary.getMetadata().memory64Active).toBe(true);
    extPrimary.dispose();

    const extFallback = await loadStudioWasm64ExtendedSuite({
      preferMemory64: true,
      fetchFn: async (input) =>
        String(input) === STUDIO_WASM64_EXTENDED_SUITE_URL
          ? makeWasmResponse(extWasm32)
          : new Response(null, { status: 404 }),
    });
    expect(extFallback.getMetadata().addressBits).toBe(32);
    expect(extFallback.getMetadata().memory64Active).toBe(false);
    extFallback.dispose();

    // 4) UI 배지 정직 표기 검증: WASM64 (memory64 · i64) vs WASM32 폴백 (i32)
    const view64 = render(createElement<StudioWasm64HotpathPanelProps>(StudioWasm64HotpathPanel, { preloadedRuntime: rtPrimary }));
    expect(screen.getByTestId("wasm64-hotpath-backend-badge").textContent).toContain("WASM64 (memory64 · i64)");
    expect(screen.getByTestId("wasm64-hotpath-address-mode").textContent).toContain("WASM64 (memory64 · i64)");
    view64.unmount();

    const view32 = render(createElement<StudioWasm64HotpathPanelProps>(StudioWasm64HotpathPanel, { preloadedRuntime: rtFallback32 }));
    expect(screen.getByTestId("wasm64-hotpath-backend-badge").textContent).toContain("WASM32 폴백 (i32)");
    expect(screen.getByTestId("wasm64-hotpath-address-mode").textContent).toContain("WASM32 폴백 (i32)");
    view32.unmount();

    rtPrimary.dispose();
    rtFallback32.dispose();

    // 5) PWA 피너 6종 전체 에셋 피닝 호환 검증
    expect(DEFAULT_WASM64_MEMORY64_ASSET_URLS).toHaveLength(2);
    expect(ALL_WASM64_ASSET_URLS).toHaveLength(6);
    const wasmByUrl = new Map<string, Uint8Array>([
      [STUDIO_WASM64_CORE_URL, readWasmFile("studio-wasm64-drawing-core.wasm")],
      [STUDIO_WASM64_CORE_SIMD_URL, readWasmFile("studio-wasm64-drawing-core-simd.wasm")],
      [STUDIO_WASM64_CORE_RELAXED_SIMD_URL, coreRelaxed32],
      [STUDIO_WASM64_EXTENDED_SUITE_URL, extWasm32],
      [STUDIO_WASM64_CORE_MEMORY64_URL, coreMem64],
      [STUDIO_WASM64_EXTENDED_SUITE_MEMORY64_URL, extMem64],
    ]);
    const pinner = new PwaBaseAssetPinner({
      versionHash: "wasm64-dual-abi-pin",
      includeDefaultCoreAssets: false,
      includeMemory64Assets: true,
      extraAssets: ALL_WASM64_ASSET_URLS.map((url) => ({ url, kind: "wasm" as const, minBytes: 8 })),
      cacheStorage: createInMemoryCacheStorage(),
      fetchFn: async (input) => {
        const bytes = wasmByUrl.get(String(input));
        return bytes ? makeWasmResponse(bytes) : new Response(null, { status: 404 });
      },
    });
    const pinRes = await pinner.pinAll();
    expect(pinRes.ok).toBe(true);
    expect(pinRes.pinnedAssets).toHaveLength(6);

    // 6) 신규 파일 500줄 상한 검증
    const newFiles = [
      path.join(REPO_ROOT, "scripts/lib/wasm64-memory64-abi-adapter.mjs"),
      path.join(REPO_ROOT, "scripts/build-wasm64-memory64.mjs"),
      path.join(BRIDGE_DIR, "wasm64-memory64-abi-adapter.ts"),
      path.join(BRIDGE_DIR, "wasm64-memory64-binary-contract.test.ts"),
    ];
    for (const filePath of newFiles) {
      const lineCount = readFileSync(filePath, "utf8").split("\n").length;
      expect(lineCount).toBeLessThanOrEqual(500);
    }
  });
});
