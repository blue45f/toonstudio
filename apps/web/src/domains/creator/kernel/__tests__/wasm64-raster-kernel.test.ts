import { describe, expect, it } from "vitest";

import {
  STUDIO_WASM_PAGE_BYTES,
  STUDIO_WEB_MEMORY64_ADDRESS_LIMIT_BYTES,
} from "../../studio-wasm64-memory-governor";
import { WASM_MEMORY64_ACCELERATOR_POLICY } from "../WasmMemory64Capability";
import {
  buildWasm64RasterModuleBytes,
  encodeSleb128_64,
  encodeUleb128_64,
  WASM_MEMORY64_LIMITS_FLAG,
} from "../wasm64-raster-binary-builder";
import {
  buildWebtoonTonalLut256x3,
  createWasm64RasterEngine,
  WASM64_WEB_MAX_PAGES,
} from "../wasm64-raster-kernel";

function makeNonMemory64Host(): typeof WebAssembly {
  return {
    ...WebAssembly,
    Module: WebAssembly.Module,
    Instance: WebAssembly.Instance,
    Memory: WebAssembly.Memory,
    validate(bytes: BufferSource): boolean {
      const view = ArrayBuffer.isView(bytes)
        ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        : new Uint8Array(bytes);
      // Memory64 probe (section 0x05) or imported memory64 flag 0x05
      for (let i = 8; i < Math.min(view.length, 48); i += 1) {
        if (view[i] === WASM_MEMORY64_LIMITS_FLAG) return false;
      }
      return WebAssembly.validate(bytes);
    },
  } as typeof WebAssembly;
}

describe("WebAssembly Memory64 (i64) 래스터 바이너리 커널", () => {
  it("정식 Memory64 flag(0x05) + LEB128 64비트 한계로 모듈을 생성하고 Node 24 V8에서 validate·instantiate를 통과한다", () => {
    const bytes = buildWasm64RasterModuleBytes({
      initialPages: BigInt(1),
      maximumPages: WASM64_WEB_MAX_PAGES,
    });

    // Wasm magic + version header
    expect(Array.from(bytes.slice(0, 8))).toEqual([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ]);
    // 16 GiB = 262,144 pages -> LEB128 [0x80, 0x80, 0x10]
    expect(encodeUleb128_64(BigInt(262_144))).toEqual([0x80, 0x80, 0x10]);
    expect(encodeSleb128_64(BigInt(-1))).toEqual([0x7f]);
    // Import section must contain memory kind 0x02 followed by memory64 limits flag 0x05
    let foundMemory64ImportFlag = false;
    for (let i = 8; i < bytes.length - 4; i += 1) {
      if (
        bytes[i] === 0x02
        && bytes[i + 1] === WASM_MEMORY64_LIMITS_FLAG
        && bytes[i + 2] === 0x01
        && bytes[i + 3] === 0x80
      ) {
        foundMemory64ImportFlag = true;
        break;
      }
    }
    expect(foundMemory64ImportFlag).toBe(true);
    expect(WebAssembly.validate(bytes as BufferSource)).toBe(true);

    const engine = createWasm64RasterEngine();
    expect(engine.backend).toBe("wasm64-native");
    expect(engine.addressType).toBe("i64");
    expect(engine.moduleValidated).toBe(true);
    expect(engine.wasmExports).not.toBeNull();
    expect(engine.exceeds4GiBAddressSpace).toBe(true);
    expect(engine.reservedAddressSpaceBytes).toBe(
      BigInt(131_072) * STUDIO_WASM_PAGE_BYTES,
    );
    expect(engine.policy).toBe(WASM_MEMORY64_ACCELERATOR_POLICY);
    expect(engine.policy.canonicalWritesAllowed).toBe(false);
    expect(engine.policy.persistenceWritesAllowed).toBe(false);
    engine.dispose();
  });

  it("4개 네이티브 Wasm64 익스포트 커널이 정확한 픽셀 출력을 생성한다", () => {
    const engine = createWasm64RasterEngine({ initialPages: BigInt(16) });
    expect(engine.backend).toBe("wasm64-native");

    // 1) applyTonalLut64: 반전 LUT 검증 + 알파 보존
    const pixelPtr = BigInt(0);
    const lutPtr = BigInt(4096);
    const pixels = engine.getScratchView(pixelPtr, 8);
    pixels.set([10, 128, 250, 200, 0, 255, 64, 77]);
    const lut = engine.getScratchView(lutPtr, 256 * 3);
    for (let i = 0; i < 256; i += 1) {
      lut[i * 3] = 255 - i;
      lut[i * 3 + 1] = i;
      lut[i * 3 + 2] = Math.min(255, i + 10);
    }
    engine.applyTonalLut64(pixelPtr, BigInt(2), lutPtr);
    expect(Array.from(engine.getScratchView(pixelPtr, 8))).toEqual([
      245, 128, 255, 200,
      255, 255, 74, 77,
    ]);

    // 2) compositeLayerSourceOver64: 불투명·반투명·투명 스킵 검증
    const dstPtr = BigInt(8192);
    const srcPtr = BigInt(12288);
    engine.getScratchView(dstPtr, 12).set([
      100, 100, 100, 255, // pixel 0: backdrop
      20, 40, 60, 255,    // pixel 1: backdrop
      50, 60, 70, 255,    // pixel 2: backdrop
    ]);
    engine.getScratchView(srcPtr, 12).set([
      200, 50, 0, 255,    // pixel 0: full alpha -> 50% opacity blend with 128
      10, 20, 30, 0,      // pixel 1: transparent -> untouched
      255, 255, 255, 255, // pixel 2: full alpha -> 50% opacity
    ]);
    engine.compositeLayerSourceOver64(dstPtr, srcPtr, BigInt(3), 128);
    const overOut = Array.from(engine.getScratchView(dstPtr, 12));
    // sa = (255*128 + 127)/255 = 128; daScaled = (255*127 + 127)/255 = 127; outA = 255
    // R0 = (200*128 + 100*127 + 127)/255 = 150
    expect(overOut.slice(0, 4)).toEqual([150, 75, 50, 255]);
    expect(overOut.slice(4, 8)).toEqual([20, 40, 60, 255]);
    expect(overOut.slice(8, 12)).toEqual([153, 158, 163, 255]);

    // 3) compositeLayerMultiply64: 흰색 항등, 검정 0, 중간 회색 곱하기 검증
    const mulDst = BigInt(16384);
    const mulSrc = BigInt(20480);
    engine.getScratchView(mulDst, 12).set([
      200, 160, 80, 255,
      200, 160, 80, 255,
      200, 160, 80, 255,
    ]);
    engine.getScratchView(mulSrc, 12).set([
      255, 255, 255, 255, // white multiply = identity
      0, 0, 0, 255,       // black multiply = 0
      128, 128, 128, 255, // ~50% darken
    ]);
    engine.compositeLayerMultiply64(mulDst, mulSrc, BigInt(3), 255);
    const mulOut = Array.from(engine.getScratchView(mulDst, 12));
    expect(mulOut.slice(0, 4)).toEqual([200, 160, 80, 255]);
    expect(mulOut.slice(4, 8)).toEqual([0, 0, 0, 255]);
    expect(mulOut.slice(8, 12)).toEqual([100, 80, 40, 255]);

    // 4) stampSoftBrushDab64: 중심은 최대 불투명도, 반경 외부는 무변경, 가장자리는 부드러운 감쇠
    const canvasPtr = BigInt(32768);
    const canvasW = 32;
    const canvasH = 32;
    engine.getScratchView(canvasPtr, canvasW * canvasH * 4).fill(0);
    const touched = engine.stampSoftBrushDab64(
      canvasPtr, BigInt(canvasW), BigInt(canvasH),
      16.0, 16.0, 6.0, 240, 80, 40, 220, 128,
    );
    expect(touched).toBeGreaterThan(80);
    const canvas = engine.getScratchView(canvasPtr, canvasW * canvasH * 4);
    const centerIdx = (16 * canvasW + 16) * 4;
    const midEdgeIdx = (16 * canvasW + 20) * 4; // dist ≈ 4.5 / 6 = 0.75 (between inner 0.5 and 1.0)
    const outsideIdx = (0 * canvasW + 0) * 4;
    expect(canvas[centerIdx]).toBe(240);
    expect(canvas[centerIdx + 1]).toBe(80);
    expect(canvas[centerIdx + 2]).toBe(40);
    expect(canvas[centerIdx + 3]).toBe(220);
    expect(canvas[midEdgeIdx + 3]).toBeGreaterThan(0);
    expect(canvas[midEdgeIdx + 3]).toBeLessThan(220);
    expect(canvas[outsideIdx + 3]).toBe(0);

    engine.dispose();
  });

  it("네이티브 Wasm64 커널과 구형 런타임 JS 폴백의 512×512 파이프라인 출력이 비트 단위로 100% 일치하고 실측 ms를 보고한다", () => {
    const wasmEngine = createWasm64RasterEngine();
    const fallbackEngine = createWasm64RasterEngine({
      webAssembly: makeNonMemory64Host(),
      allowFallback: true,
    });

    expect(wasmEngine.backend).toBe("wasm64-native");
    expect(fallbackEngine.backend).toBe("js-fallback");
    expect(fallbackEngine.fallbackReason).toBe("memory64-runtime-unsupported");

    const wasmReport = wasmEngine.runBenchmark({ width: 512, height: 512, brushDabs: 12 });
    const jsReport = fallbackEngine.runBenchmark({ width: 512, height: 512, brushDabs: 12 });

    expect(wasmReport.backend).toBe("wasm64-native");
    expect(wasmReport.addressMode).toBe("i64");
    expect(wasmReport.pixelCount).toBe(262_144);
    expect(wasmReport.totalTouchedBrushPixels).toBeGreaterThan(10_000);
    expect(wasmReport.totalElapsedMs).toBeGreaterThan(0);
    expect(wasmReport.throughputMegaPixelsPerSec).toBeGreaterThan(0);
    expect(wasmReport.stages).toHaveLength(4);
    expect(wasmReport.exceeds4GiBAddressSpace).toBe(true);

    // Wasm64 네이티브 출력 체크섬 === JS 폴백 출력 체크섬 (비트 단위 100% 동일!)
    expect(wasmReport.outputChecksum32).toBe(jsReport.outputChecksum32);
    expect(wasmReport.totalTouchedBrushPixels).toBe(jsReport.totalTouchedBrushPixels);

    wasmEngine.dispose();
    fallbackEngine.dispose();
  });

  it("메모리 압박으로 큰 i64 예약이 거부되면 안전 축소 재시도로 Memory64 할당에 성공한다", () => {
    let calls = 0;
    const PressuredMemory = new Proxy(WebAssembly.Memory, {
      construct(target, args, newTarget) {
        calls += 1;
        const desc = args[0] as { readonly maximum?: bigint; readonly address?: string };
        // 처음 2번(8 GiB, 4 GiB)은 메모리 압박을 흉내 내 RangeError 발생, 2 GiB 이하 허용
        if (desc.address === "i64" && desc.maximum !== undefined && desc.maximum > BigInt(32_768)) {
          throw new RangeError("Simulated browser virtual address pressure");
        }
        return Reflect.construct(target, args, newTarget);
      },
    });
    const pressuredHost = {
      ...WebAssembly,
      Module: WebAssembly.Module,
      Instance: WebAssembly.Instance,
      Memory: PressuredMemory,
      validate: WebAssembly.validate,
    } as typeof WebAssembly;

    const engine = createWasm64RasterEngine({
      webAssembly: pressuredHost,
      initialPages: BigInt(64),
      maximumPages: BigInt(131_072), // 8 GiB -> 4 GiB -> 2 GiB (32768 pages)
      minimumPages: BigInt(16),
    });

    expect(engine.backend).toBe("wasm64-native");
    expect(engine.allocationAttempts).toBe(3);
    expect(engine.maximumPages).toBe(BigInt(32_768));
    expect(calls).toBeGreaterThanOrEqual(3);
    engine.dispose();
  });

  it("allowFallback: false일 때 Memory64 미지원 런타임은 조용히 폴백하지 않고 명시 오류를 던진다", () => {
    expect(() =>
      createWasm64RasterEngine({
        webAssembly: makeNonMemory64Host(),
        allowFallback: false,
      }),
    ).toThrow(/Memory64 engine unavailable/u);
  });

  it("16 GiB 한도를 초과 요청해도 Chrome 웹 Memory64 상한(16 GiB)으로 안전 클램핑하고 톤 LUT 빌더가 유효 바이트를 반환한다", () => {
    const engine = createWasm64RasterEngine({
      initialPages: BigInt(16),
      maximumPages: WASM64_WEB_MAX_PAGES + BigInt(1000),
    });
    expect(engine.backend).toBe("wasm64-native");
    expect(engine.reservedAddressSpaceBytes).toBe(STUDIO_WEB_MEMORY64_ADDRESS_LIMIT_BYTES);
    const lut = buildWebtoonTonalLut256x3({ contrast: 1.2, warmShift: 12, shadowLift: 4 });
    expect(lut.byteLength).toBe(768);
    expect(lut[0]).toBeGreaterThanOrEqual(0);
    expect(lut[767]).toBeLessThanOrEqual(255);
    engine.dispose();
  });
});
