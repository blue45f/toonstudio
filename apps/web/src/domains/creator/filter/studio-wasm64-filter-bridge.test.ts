import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  renderStudioFinishingEffectPixels,
  renderStudioFinishingUnsharpPass,
} from "./studio-finishing-effects";
import {
  deriveStudioImpastoHeightMapFromRgba,
  executeStudioFilterWithWasmAcceleration,
  getStudioWasmFilterTelemetry,
  isStudioWasmFilterAccelerationEnabled,
  resetStudioWasmFilterBridge,
  setStudioWasmFilterAccelerationEnabled,
  warmStudioWasmFilterRuntime,
} from "./studio-wasm64-filter-bridge";

const REPO_ROOT = path.resolve(process.cwd());
const PUBLIC_WASM_PATH = path.join(
  REPO_ROOT,
  "apps/web/public/wasm/studio-wasm64-drawing-core.wasm",
);

function loadRealWasmBytes(): Uint8Array {
  expect(existsSync(PUBLIC_WASM_PATH)).toBe(true);
  const raw = readFileSync(PUBLIC_WASM_PATH);
  return new Uint8Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

function createSyntheticRgbaClamped(width: number, height: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const off = (y * width + x) * 4;
      const checker = ((x >> 2) + (y >> 2)) % 2 === 0;
      buf[off] = checker ? (x * 7 + 40) % 256 : (y * 5 + 15) % 256;
      buf[off + 1] = (x * 3 + y * 9 + 30) % 256;
      buf[off + 2] = checker ? 210 : (x * 11 + 80) % 256;
      buf[off + 3] = x === 0 && y === 0 ? 0 : 255;
    }
  }
  return buf;
}

function maxChannelDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  expect(a.length).toBe(b.length);
  let maxDiff = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    if (diff > maxDiff) maxDiff = diff;
  }
  return maxDiff;
}

afterEach(() => {
  resetStudioWasmFilterBridge();
});

describe("실물 Rust .wasm 필터 가속 브리지 (studio-wasm64-filter-bridge)", () => {
  it("WASM 미예열 초기 상태에서는 바이트 동등 JS 폴백으로 동작하고 텔레메트리를 정확히 기록한다", () => {
    const width = 24;
    const height = 24;
    const rgba = createSyntheticRgbaClamped(width, height);

    const before = getStudioWasmFilterTelemetry();
    expect(before.enabled).toBe(true);
    expect(before.wasmReady).toBe(false);
    expect(before.wasmExecCount).toBe(0);
    expect(before.jsFallbackCount).toBe(0);
    expect(before.lastEngine).toBeNull();
    expect(before.estimatedSpeedupRatio).toBe(1);

    const res = executeStudioFilterWithWasmAcceleration({
      filter: "unsharp-mask",
      rgba,
      width,
      height,
      sigma: 1.4,
      amount: 1.25,
      threshold: 2,
      autoWarm: false,
    });

    expect(res.engine).toBe("js-fallback");
    expect(res.accelerated).toBe(false);
    expect(res.wasmReady).toBe(false);
    expect(res.output).toBeInstanceOf(Uint8ClampedArray);
    expect(res.output.length).toBe(rgba.length);
    expect(res.affectedPixels).toBeGreaterThan(0);

    const after = getStudioWasmFilterTelemetry();
    expect(after.wasmExecCount).toBe(0);
    expect(after.jsFallbackCount).toBe(1);
    expect(after.lastEngine).toBe("js-fallback");
    expect(after.lastFilter).toBe("unsharp-mask");
    expect(after.lastDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("실물 studio-wasm64-drawing-core.wasm 로드 후 3종 필터(unsharp-mask·gaussian-blur·impasto-relief)가 JS 폴백과 0 diff로 일치한다", async () => {
    const wasmBytes = loadRealWasmBytes();
    const warmed = await warmStudioWasmFilterRuntime({ wasmBytes });
    expect(warmed.wasmReady).toBe(true);
    expect(warmed.wasmByteLength).toBe(wasmBytes.byteLength);
    expect(warmed.fallbackReason).toBeNull();

    const width = 48;
    const height = 48;
    const rgba = createSyntheticRgbaClamped(width, height);

    // 1) unsharp-mask: WASM vs JS 0 diff
    const wasmUnsharp = executeStudioFilterWithWasmAcceleration({
      filter: "unsharp-mask",
      rgba,
      width,
      height,
      sigma: 1.4,
      amount: 1.35,
      threshold: 2,
    });
    expect(wasmUnsharp.engine).toBe("rust-wasm");
    expect(wasmUnsharp.accelerated).toBe(true);
    expect(wasmUnsharp.affectedPixels).toBeGreaterThan(0);

    setStudioWasmFilterAccelerationEnabled(false);
    expect(isStudioWasmFilterAccelerationEnabled()).toBe(false);

    const jsUnsharp = executeStudioFilterWithWasmAcceleration({
      filter: "unsharp-mask",
      rgba,
      width,
      height,
      sigma: 1.4,
      amount: 1.35,
      threshold: 2,
    });
    expect(jsUnsharp.engine).toBe("js-fallback");
    expect(jsUnsharp.accelerated).toBe(false);
    expect(maxChannelDiff(wasmUnsharp.output, jsUnsharp.output)).toBe(0);
    expect(wasmUnsharp.affectedPixels).toBe(jsUnsharp.affectedPixels);

    // 다시 가속 켜기
    setStudioWasmFilterAccelerationEnabled(true);
    expect(isStudioWasmFilterAccelerationEnabled()).toBe(true);

    // 2) gaussian-blur (선택 마스크 포함): WASM vs JS 0 diff + 선택 외부 무손실
    const selectionMask = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        selectionMask[y * width + x] = x < width / 2 ? 255 : 0;
      }
    }
    const wasmBlur = executeStudioFilterWithWasmAcceleration({
      filter: "gaussian-blur",
      rgba,
      width,
      height,
      sigma: 1.8,
      selectionMask,
    });
    setStudioWasmFilterAccelerationEnabled(false);
    const jsBlur = executeStudioFilterWithWasmAcceleration({
      filter: "gaussian-blur",
      rgba,
      width,
      height,
      sigma: 1.8,
      selectionMask,
    });
    setStudioWasmFilterAccelerationEnabled(true);

    expect(wasmBlur.engine).toBe("rust-wasm");
    expect(jsBlur.engine).toBe("js-fallback");
    expect(maxChannelDiff(wasmBlur.output, jsBlur.output)).toBe(0);
    // 선택 마스크 외부(x >= width/2)는 원본과 100% 일치해야 한다.
    for (let y = 0; y < height; y += 1) {
      const off = (y * width + (width - 1)) * 4;
      expect(Array.from(wasmBlur.output.subarray(off, off + 4))).toEqual(
        Array.from(rgba.subarray(off, off + 4)),
      );
    }

    // 3) impasto-relief (자동 휘도 높이장 + 명시 높이장 모두 0 diff)
    const wasmImpastoAuto = executeStudioFilterWithWasmAcceleration({
      filter: "impasto-relief",
      rgba,
      width,
      height,
      light: { reliefStrength: 2.1, specularStrength: 0.3 },
    });
    setStudioWasmFilterAccelerationEnabled(false);
    const jsImpastoAuto = executeStudioFilterWithWasmAcceleration({
      filter: "impasto-relief",
      rgba,
      width,
      height,
      light: { reliefStrength: 2.1, specularStrength: 0.3 },
    });
    setStudioWasmFilterAccelerationEnabled(true);

    expect(wasmImpastoAuto.engine).toBe("rust-wasm");
    expect(jsImpastoAuto.engine).toBe("js-fallback");
    expect(maxChannelDiff(wasmImpastoAuto.output, jsImpastoAuto.output)).toBe(0);

    const customHeight = deriveStudioImpastoHeightMapFromRgba(rgba, width, height);
    const wasmImpastoExplicit = executeStudioFilterWithWasmAcceleration({
      filter: "impasto-relief",
      rgba,
      width,
      height,
      heightMap: customHeight,
    });
    expect(wasmImpastoExplicit.engine).toBe("rust-wasm");
    expect(wasmImpastoExplicit.affectedPixels).toBe(width * height - 1);

    // 4) 텔레메트리 누적 카운트 및 가속 배율 검증
    const telemetry = getStudioWasmFilterTelemetry();
    expect(telemetry.enabled).toBe(true);
    expect(telemetry.wasmReady).toBe(true);
    expect(telemetry.wasmExecCount).toBe(4);
    expect(telemetry.jsFallbackCount).toBe(3);
    expect(telemetry.lastEngine).toBe("rust-wasm");
    expect(telemetry.lastFilter).toBe("impasto-relief");
    expect(telemetry.lastDurationMs).toBeGreaterThanOrEqual(0);
    expect(telemetry.estimatedSpeedupRatio).toBeGreaterThan(0);
  });

  it("실제 마감 효과 파이프라인(studio-finishing-effects)이 WASM 가속과 JS 폴백 간 0 diff로 연동된다", async () => {
    const wasmBytes = loadRealWasmBytes();
    await warmStudioWasmFilterRuntime({ wasmBytes });

    const width = 32;
    const height = 32;
    const rgba = createSyntheticRgbaClamped(width, height);

    for (const effectId of ["glow", "drop-shadow", "inflate"] as const) {
      setStudioWasmFilterAccelerationEnabled(true);
      const wasmRes = renderStudioFinishingEffectPixels({
        rgba,
        width,
        height,
        effectId,
      });
      setStudioWasmFilterAccelerationEnabled(false);
      const jsRes = renderStudioFinishingEffectPixels({
        rgba,
        width,
        height,
        effectId,
      });

      expect(wasmRes.engine).toBe("rust-wasm");
      expect(wasmRes.accelerated).toBe(true);
      expect(jsRes.engine).toBe("js-fallback");
      expect(jsRes.accelerated).toBe(false);
      expect(maxChannelDiff(wasmRes.output, jsRes.output)).toBe(0);
    }

    setStudioWasmFilterAccelerationEnabled(true);
    const sharpenWasm = renderStudioFinishingUnsharpPass({ rgba, width, height, sigma: 1.2, amount: 1.4 });
    setStudioWasmFilterAccelerationEnabled(false);
    const sharpenJs = renderStudioFinishingUnsharpPass({ rgba, width, height, sigma: 1.2, amount: 1.4 });
    expect(sharpenWasm.engine).toBe("rust-wasm");
    expect(sharpenJs.engine).toBe("js-fallback");
    expect(maxChannelDiff(sharpenWasm.output, sharpenJs.output)).toBe(0);
  });

  it("오프라인/로드 실패 시 예외 없이 JS 폴백으로 안전 강등하고 mutateInPlace·입력 검증을 지킨다", async () => {
    const failedTelemetry = await warmStudioWasmFilterRuntime({
      fetchFn: async () => new Response(null, { status: 503 }),
    });
    expect(failedTelemetry.wasmReady).toBe(false);
    expect(failedTelemetry.fallbackReason).toContain("503");

    const rgba = createSyntheticRgbaClamped(16, 16);
    const originalCopy = new Uint8ClampedArray(rgba);
    const inPlace = executeStudioFilterWithWasmAcceleration({
      filter: "gaussian-blur",
      rgba,
      width: 16,
      height: 16,
      sigma: 1.5,
      mutateInPlace: true,
      autoWarm: false,
    });
    expect(inPlace.output).toBe(rgba);
    expect(inPlace.engine).toBe("js-fallback");
    expect(maxChannelDiff(rgba, originalCopy)).toBeGreaterThan(0);

    expect(() =>
      executeStudioFilterWithWasmAcceleration({
        filter: "unsharp-mask",
        rgba: new Uint8ClampedArray(8),
        width: 4,
        height: 4,
        autoWarm: false,
      }),
    ).toThrow(RangeError);
  });

  it("자동 CPU 티어 선택으로 relaxed-simd 실물 바이너리를 예열하고 텔레메트리 cpuTier와 0 diff 정합을 보고한다", async () => {
    const relaxedPath = path.join(
      REPO_ROOT,
      "apps/web/public/wasm/studio-wasm64-drawing-core-relaxed-simd.wasm",
    );
    expect(existsSync(relaxedPath)).toBe(true);
    const raw = readFileSync(relaxedPath);
    const relaxedBytes = new Uint8Array(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    );
    const requestedUrls: string[] = [];

    const telemetry = await warmStudioWasmFilterRuntime({
      fetchFn: async (input) => {
        const url = String(input);
        requestedUrls.push(url);
        return new Response(relaxedBytes.slice().buffer, {
          status: 200,
          headers: {
            "content-type": "application/wasm",
            "content-length": String(relaxedBytes.byteLength),
          },
        });
      },
    });

    expect(requestedUrls).toEqual(["/wasm/studio-wasm64-drawing-core-relaxed-simd.wasm"]);
    expect(telemetry.wasmReady).toBe(true);
    expect(telemetry.cpuTier).toBe("wasm-relaxed-simd");
    expect(telemetry.resolvedWasmUrl).toBe("/wasm/studio-wasm64-drawing-core-relaxed-simd.wasm");

    const rgba = createSyntheticRgbaClamped(32, 32);
    const wasmRes = executeStudioFilterWithWasmAcceleration({
      filter: "unsharp-mask",
      rgba,
      width: 32,
      height: 32,
      sigma: 1.4,
      amount: 1.25,
      threshold: 2,
    });
    setStudioWasmFilterAccelerationEnabled(false);
    const jsRes = executeStudioFilterWithWasmAcceleration({
      filter: "unsharp-mask",
      rgba,
      width: 32,
      height: 32,
      sigma: 1.4,
      amount: 1.25,
      threshold: 2,
    });

    expect(wasmRes.engine).toBe("rust-wasm");
    expect(wasmRes.cpuTier).toBe("wasm-relaxed-simd");
    expect(jsRes.cpuTier).toBe("js-fallback");
    expect(maxChannelDiff(wasmRes.output, jsRes.output)).toBe(0);
  });

  it("신규 브리지 소스 파일은 800줄 이하이며 웹 스토리지·금지 패턴을 사용하지 않는다", () => {
    const src = readFileSync(
      path.join(REPO_ROOT, "apps/web/src/domains/creator/filter/studio-wasm64-filter-bridge.ts"),
      "utf8",
    );
    expect(src.split("\n").length).toBeLessThanOrEqual(800);
    expect(src).not.toMatch(/\b(?:localStorage|sessionStorage)\b/u);
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  });
});
