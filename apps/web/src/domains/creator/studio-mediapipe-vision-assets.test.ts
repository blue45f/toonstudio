import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { resolveStudioMediaPipeVisionWasmFileset } from "./studio-mediapipe-vision-assets";

const SIMD = { wasmLoaderPath: "/assets/vision-simd.js", wasmBinaryPath: "/assets/vision-simd.wasm" };
const NO_SIMD = { wasmLoaderPath: "/assets/vision-nosimd.js", wasmBinaryPath: "/assets/vision-nosimd.wasm" };

describe("Studio 공용 MediaPipe Vision 자산", () => {
  it("SIMD 지원 환경에서는 package-matched same-origin SIMD 자산을 선택한다", async () => {
    const loadNoSimd = vi.fn(async () => NO_SIMD);
    await expect(resolveStudioMediaPipeVisionWasmFileset({
      isSimdSupported: async () => true,
      loadSimd: async () => SIMD,
      loadNoSimd,
    })).resolves.toEqual({
      variant: "simd",
      providerVersion: "1.2.3",
      fileset: SIMD,
      selectionSource: "simd-capability-probe",
      attemptedVariants: ["simd"],
    });
    expect(loadNoSimd).not.toHaveBeenCalled();
  });

  it("does not load non-SIMD after the selected SIMD asset fails", async () => {
    const loadNoSimd = vi.fn(async () => NO_SIMD);
    await expect(resolveStudioMediaPipeVisionWasmFileset({
      isSimdSupported: async () => true,
      loadSimd: async () => { throw new Error("missing SIMD chunk"); },
      loadNoSimd,
    })).rejects.toMatchObject({ name: "StudioMediaPipeVisionWasmLoadError" });
    expect(loadNoSimd).not.toHaveBeenCalled();
  });

  it("fails closed when the capability probe fails and loads neither variant", async () => {
    const loadSimd = vi.fn(async () => SIMD);
    const loadNoSimd = vi.fn(async () => NO_SIMD);
    await expect(resolveStudioMediaPipeVisionWasmFileset({
      isSimdSupported: async () => { throw new Error("probe failed"); },
      loadSimd,
      loadNoSimd,
    })).rejects.toMatchObject({ name: "StudioMediaPipeVisionWasmLoadError" });
    expect(loadSimd).not.toHaveBeenCalled();
    expect(loadNoSimd).not.toHaveBeenCalled();
  });

  it("selects non-SIMD only from a successful negative probe and never loads SIMD", async () => {
    const loadSimd = vi.fn(async () => SIMD);
    await expect(resolveStudioMediaPipeVisionWasmFileset({
      isSimdSupported: async () => false,
      loadSimd,
      loadNoSimd: async () => NO_SIMD,
    })).resolves.toEqual({
      variant: "nosimd",
      providerVersion: "0.10.35",
      fileset: NO_SIMD,
      selectionSource: "simd-capability-probe",
      attemptedVariants: ["nosimd"],
    });
    expect(loadSimd).not.toHaveBeenCalled();
  });

  it("SDK가 지원 API를 제거해도 실제 capability 검사로 non-SIMD를 선택한다", async () => {
    const validate = vi.spyOn(WebAssembly, "validate").mockReturnValue(false);
    const loadSimd = vi.fn(async () => SIMD);
    try {
      await expect(resolveStudioMediaPipeVisionWasmFileset({
        loadSimd,
        loadNoSimd: async () => NO_SIMD,
      })).resolves.toMatchObject({
        variant: "nosimd",
        providerVersion: "0.10.35",
        fileset: NO_SIMD,
        attemptedVariants: ["nosimd"],
      });
      expect(validate).toHaveBeenCalledOnce();
      expect(validate).toHaveBeenCalledWith(new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3,
        2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
      ]));
      expect(loadSimd).not.toHaveBeenCalled();
    } finally {
      validate.mockRestore();
    }
  });

  it("마네킹·VRM 얼굴/손/포즈·전경 분리가 모두 공용 로컬 자산 권위를 사용한다", () => {
    const consumers = [
      "./scene-3d/studio-mannequin-webcam-tracking.ts",
      "./vrm/studio-vrm-webcam-tracking.ts",
      "./studio-bg-remove.ts",
    ].map((fileName) => readFileSync(new URL(fileName, import.meta.url), "utf8"));

    for (const source of consumers) {
      expect(source).toContain("resolveStudioMediaPipeVisionWasmFileset");
      expect(source).not.toMatch(/cdn\.jsdelivr\.net|unpkg\.com|forVisionTasks\(/i);
    }
  });
});
