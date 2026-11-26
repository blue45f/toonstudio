// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EXECUTION_ENVIRONMENTS,
  MEMORY_ADDRESS_MODES,
  MODERN_SILICON_IDS,
  MODERN_SILICON_PROFILES,
  StudioToonSiliconPanel,
  TOONSTUDIO_COMPUTE_WORKLOADS,
  TOONSTUDIO_WORKLOAD_IDS,
  TOON_SILICON_BRAND_STACK,
  TOON_SILICON_MEASUREMENT_BASIS,
  TOON_SILICON_MODEL_KIND,
  TOON_SILICON_SCHEMA_VERSION,
  alignTensorShape,
  buildSiliconFullPowerPlan,
  exportToonSiliconPlanJson,
  formatOklch,
  getModernSiliconProfile,
  getToonStudioWorkload,
  isVioletSlopHue,
  resolveRuntimeBoundary,
  sanitizeNonVioletHue,
  type ModernSiliconId,
  type ToonStudioWorkloadId,
} from "./index";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("프로파일 계획과 실제 장치 실행의 경계", () => {
  it("48가지 계획 모두 실제 가속 기능 활성화나 장치 실행을 주장하지 않는다", () => {
    for (const siliconId of MODERN_SILICON_IDS) {
      for (const environment of EXECUTION_ENVIRONMENTS) {
        for (const memoryMode of MEMORY_ADDRESS_MODES) {
          const { plan, json } = exportToonSiliconPlanJson({ siliconId, environment, memoryMode });
          expect(plan.runtimeState).toMatchObject({ hardwareProbed: false, gpuExecuted: false, nativeBridgeExecuted: false, workersStarted: false, persisted: false });
          expect(plan.runtimeBoundary.activeStandardLayers).toEqual([]);
          expect(plan.runtimeBoundary.nativeFfiBridgeLayers).toEqual([]);
          expect(plan.runtimeBoundary.plannedStandardLayers.length).toBeGreaterThan(0);
          expect(plan.computeUnits.cpu.memory64Active).toBe(false);
          expect(plan.computeUnits.cpu.sharedArrayBufferThreads).toBe(false);
          expect(plan.computeUnits.gpu.f16ShaderEnabled).toBe(false);
          expect(plan.computeUnits.npuTpu.zeroCopyMlTensorActive).toBe(false);
          expect(JSON.parse(json).runtimeState.hardwareProbed).toBe(false);
        }
      }
    }
  });

  it("네이티브 환경을 골라도 브리지가 활성화됐다고 표시하지 않는다", () => {
    render(<StudioToonSiliconPanel />);
    fireEvent.click(screen.getByTestId("toon-silicon-env-desktop-native-bridge"));
    expect(screen.getByTestId("toon-silicon-panel").textContent).not.toContain("브리지 활성");
    expect(screen.getByTestId("toon-silicon-honesty-notice").textContent).toContain("장치 미검증");
  });
});

const RAW_HEX_PATTERN = new RegExp("#[0-9a-fA-F]{3,8}\\b", "u");
const RAW_RGB_PATTERN = new RegExp("\\b" + "rgb" + "a?\\s*\\(", "iu");
const RAW_HSL_PATTERN = new RegExp("\\b" + "hsl" + "a?\\s*\\(", "iu");

function assertZeroVioletAndRawColors(markup: string): void {
  expect(markup).not.toMatch(RAW_HEX_PATTERN);
  expect(markup).not.toMatch(RAW_RGB_PATTERN);
  expect(markup).not.toMatch(RAW_HSL_PATTERN);
  for (const match of markup.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
    expect(isVioletSlopHue(Number(match[1]))).toBe(false);
  }
}

describe("1. 8대 모던 실리콘 & Google Tensor TPU 카탈로그", () => {
  it("8대 모던 실리콘 ID와 Android 4종 + Desktop/Apple 4종 분류를 정확히 포함한다", () => {
    expect(MODERN_SILICON_PROFILES).toHaveLength(8);
    expect(MODERN_SILICON_PROFILES.map((item) => item.id)).toEqual([...MODERN_SILICON_IDS]);
    expect(MODERN_SILICON_PROFILES.filter((item) => item.platformGroup === "android-mobile")).toHaveLength(4);
    expect(MODERN_SILICON_PROFILES.filter((item) => item.platformGroup === "desktop-apple")).toHaveLength(4);
  });

  it("google-tensor-tpu가 Edge TPU Systolic Array·INT8/BF16·64-정렬·ARMv9 NEON/SVE2·Vulkan WebGPU를 제공한다", () => {
    const tensor = getModernSiliconProfile("google-tensor-tpu");
    expect(tensor.platformGroup).toBe("android-mobile");
    expect(tensor.npuTpu.acceleratorLabel).toContain("Edge TPU Systolic Array");
    expect(tensor.npuTpu.precisionLabel).toBe("INT8 / BF16");
    expect(tensor.npuTpu.staticShapeCompileRequired).toBe(true);
    expect(tensor.npuTpu.staticTensorPaddingAlign).toBe(64);
    expect(tensor.npuTpu.browserDelegate).toContain("LiteRT-Web TPU Delegate");
    expect(tensor.cpu.architectureLabel).toContain("ARMv9 NEON / SVE2");
    expect(tensor.gpu.graphicsBackend).toBe("Vulkan");
  });

  it("qualcomm-snapdragon-hexagon이 Hexagon HTP W4A8/INT8·Adreno Subgroups 64·Oryon ARM64 SIMD128을 제공한다", () => {
    const qcom = getModernSiliconProfile("qualcomm-snapdragon-hexagon");
    expect(qcom.npuTpu.acceleratorLabel).toContain("Hexagon HTP");
    expect(qcom.npuTpu.precisionLabel).toBe("W4A8 / INT8");
    expect(qcom.gpu.gpuFamilyLabel).toContain("Adreno");
    expect(qcom.gpu.subgroupSize).toBe(64);
    expect(qcom.cpu.architectureLabel).toContain("Oryon ARM64 SIMD128");
  });

  it("mediatek-dimensity-apu가 APU NeuroPilot·Immortalis GPU·All-Big-Core 8코어 Work-Stealing을 제공한다", () => {
    const mtk = getModernSiliconProfile("mediatek-dimensity-apu");
    expect(mtk.npuTpu.acceleratorLabel).toContain("NeuroPilot");
    expect(mtk.gpu.gpuFamilyLabel).toContain("Immortalis");
    expect(mtk.cpu.schedulingPolicy).toBe("all-big-work-stealing");
    expect(mtk.cpu.nativePerformanceWorkers).toBe(8);
    expect(mtk.cpu.nativeEfficiencyWorkers).toBe(0);
  });

  it("samsung-exynos-xclipse가 Exynos NPU·Xclipse RDNA WebGPU Wave32·ARMv9 SIMD128을 제공한다", () => {
    const exynos = getModernSiliconProfile("samsung-exynos-xclipse");
    expect(exynos.npuTpu.acceleratorLabel).toBe("Exynos NPU");
    expect(exynos.gpu.gpuFamilyLabel).toContain("Xclipse RDNA");
    expect(exynos.gpu.subgroupSize).toBe(32);
    expect(exynos.cpu.architectureLabel).toContain("ARMv9 SIMD128");
    expect(exynos.npuTpu.zeroCopyMlTensorSupported).toBe(false);
  });

  it("apple-silicon-ane가 Apple Neural Engine CoreML FP16/4-bit Palettized·Metal UMA·AMX/NEON을 제공한다", () => {
    const apple = getModernSiliconProfile("apple-silicon-ane");
    expect(apple.platformGroup).toBe("desktop-apple");
    expect(apple.npuTpu.acceleratorLabel).toContain("Apple Neural Engine");
    expect(apple.npuTpu.browserDelegate).toContain("CoreML");
    expect(apple.npuTpu.precisionLabel).toContain("4-bit Palettized");
    expect(apple.gpu.graphicsBackend).toBe("Metal");
    expect(apple.gpu.unifiedMemoryZeroCopy).toBe(true);
    expect(apple.cpu.architectureLabel).toContain("AMX / NEON");
  });

  it("intel-core-ultra-xe2가 OpenVINO/DirectML NPU·Arc Xe2 f16·P/E 하이브리드·AVX-VNNI를 제공한다", () => {
    const intel = getModernSiliconProfile("intel-core-ultra-xe2");
    expect(intel.npuTpu.browserDelegate).toContain("OpenVINO");
    expect(intel.npuTpu.staticTensorPaddingAlign).toBe(64);
    expect(intel.gpu.gpuFamilyLabel).toContain("Arc Xe2");
    expect(intel.gpu.f16ShaderSupported).toBe(true);
    expect(intel.cpu.schedulingPolicy).toBe("p-core-e-core-hybrid");
    expect(intel.cpu.architectureLabel).toContain("AVX-VNNI");
  });

  it("amd-ryzen-ai-xdna2가 XDNA2 4×8 공간 타일 Block-FP16/INT4·RDNA 3.5·Zen5 AVX-512/WASM64를 제공한다", () => {
    const amd = getModernSiliconProfile("amd-ryzen-ai-xdna2");
    expect(amd.npuTpu.systolicOrTileLayout).toContain("4×8");
    expect(amd.npuTpu.precisionLabel).toBe("Block-FP16 / INT4");
    expect(amd.gpu.gpuFamilyLabel).toContain("RDNA 3.5");
    expect(amd.cpu.architectureLabel).toContain("Zen5 AVX-512 / WASM64");
    expect(amd.cpu.nativeSimdWidthBits).toBe(512);
  });

  it("nvidia-rtx-grace가 Tensor Cores FP16/INT4·Warp-32 WebGPU Subgroups·4096 MiB VRAM 아틀라스를 제공한다", () => {
    const nvidia = getModernSiliconProfile("nvidia-rtx-grace");
    expect(nvidia.npuTpu.acceleratorLabel).toContain("Tensor Cores");
    expect(nvidia.npuTpu.precisionLabel).toBe("FP16 / INT4");
    expect(nvidia.gpu.gpuFamilyLabel).toContain("Warp-32");
    expect(nvidia.gpu.subgroupSize).toBe(32);
    expect(nvidia.gpu.baseAtlasBudgetMb).toBe(4096);
  });

  it("미등록 실리콘·워크로드 ID 조회 시 기본값으로 안전하게 폴백한다", () => {
    expect(getModernSiliconProfile("unknown-chip" as ModernSiliconId).id).toBe("google-tensor-tpu");
    expect(getToonStudioWorkload("unknown-workload" as ToonStudioWorkloadId).id).toBe("lineart-color-ai");
  });
});

describe("2. 6대 워크로드 · 정적 텐서 정렬 · 탈-바이올렛 OKLCH · 모델 정직성", () => {
  it("6대 ToonStudio 워크로드 ID와 ToonCore/SpectrumCompute/ToonSilicon 서브시스템을 정확히 매핑한다", () => {
    expect(TOONSTUDIO_COMPUTE_WORKLOADS).toHaveLength(6);
    expect(TOONSTUDIO_COMPUTE_WORKLOADS.map((w) => w.id)).toEqual([...TOONSTUDIO_WORKLOAD_IDS]);
    const brands = new Set(TOONSTUDIO_COMPUTE_WORKLOADS.map((w) => w.subsystem));
    expect([...brands].sort()).toEqual(["SpectrumCompute", "ToonCore", "ToonSilicon"]);
  });

  it("alignTensorShape가 정적 패딩 필수 실리콘에서는 H·W를 올림 정렬하고 동적 실리콘은 원본을 유지한다", () => {
    expect(alignTensorShape([1, 4, 720, 1280], 64, true)).toEqual([1, 4, 768, 1280]);
    expect(alignTensorShape([1, 3, 518, 518], 32, true)).toEqual([1, 3, 544, 544]);
    expect(alignTensorShape([1, 3, 518, 518], 16, false)).toEqual([1, 3, 518, 518]);
  });

  it("isVioletSlopHue와 sanitizeNonVioletHue가 270~320도 바이올렛 구간을 100% 배제한다", () => {
    expect(isVioletSlopHue(270)).toBe(true);
    expect(isVioletSlopHue(295)).toBe(true);
    expect(isVioletSlopHue(320)).toBe(true);
    expect(isVioletSlopHue(185)).toBe(false);
    expect(isVioletSlopHue(228)).toBe(false);
    for (let h = 270; h <= 320; h += 5) {
      expect(isVioletSlopHue(sanitizeNonVioletHue(h))).toBe(false);
    }
  });

  it("formatOklch가 안전한 OKLCH 문자열을 만들고 모든 실리콘·워크로드 색상이 탈-바이올렛이다", () => {
    expect(formatOklch({ l: 0.54, c: 0.13, h: 185 })).toBe("oklch(0.54 0.13 185)");
    expect(formatOklch({ l: 0.54, c: 0.13, h: 292 }, 0.4)).toBe("oklch(0.54 0.13 228 / 0.40)");
    for (const silicon of MODERN_SILICON_PROFILES) {
      expect(isVioletSlopHue(silicon.accentOklch.h)).toBe(false);
    }
    for (const workload of TOONSTUDIO_COMPUTE_WORKLOADS) {
      expect(isVioletSlopHue(workload.accentOklch.h)).toBe(false);
    }
  });

  it("modelKind가 silicon-capability-and-dispatch-architecture이며 스키마·브랜드 메타데이터가 일치한다", () => {
    const plan = buildSiliconFullPowerPlan();
    expect(plan.schemaVersion).toBe(TOON_SILICON_SCHEMA_VERSION);
    expect(plan.modelKind).toBe(TOON_SILICON_MODEL_KIND);
    expect(plan.modelKind).toBe("silicon-capability-and-dispatch-architecture");
    expect(plan.measurementBasis).toBe(TOON_SILICON_MEASUREMENT_BASIS);
    expect(plan.brandStack).toBe(TOON_SILICON_BRAND_STACK);
  });

  it("8대 실리콘 전체 JSON 출력에 허위 TOPS·허위 실측 FPS·온도(°C) 주장이 0건이다", () => {
    for (const siliconId of MODERN_SILICON_IDS) {
      const { json } = exportToonSiliconPlanJson({ siliconId });
      expect(json).not.toMatch(/\b\d+\s*TOPS\b/iu);
      expect(json).not.toMatch(/\b\d+\s*FPS\b/iu);
      expect(json).not.toMatch(/°C/u);
    }
  });
});

describe("3. 브라우저 표준 API vs 데스크톱·모바일 네이티브 FFI 브리지 경계", () => {
  it("browser-web-standard는 샌드박스를 명시하고 CUDA·Metal·ROCm·NNAPI 직접 호출 차단을 보고한다", () => {
    const silicon = getModernSiliconProfile("google-tensor-tpu");
    const boundary = resolveRuntimeBoundary(silicon, "browser-web-standard", "wasm64-memory64");
    expect(boundary.sandboxedBrowserTab).toBe(true);
    expect(boundary.directNativeDriverBlocked).toBe(true);
    expect(boundary.blockedDirectApis).toEqual(["CUDA", "Metal", "ROCm", "NNAPI"]);
    expect(boundary.nativeFfiBridgeLayers).toEqual([]);
    expect(boundary.plannedStandardLayers.join(" ")).toContain("WASM64");
    expect(boundary.plannedStandardLayers.join(" ")).toContain("WebGPU");
    expect(boundary.plannedStandardLayers.join(" ")).toContain("LiteRT-Web TPU Delegate");
  });

  it("mobile-pwa-android-ios는 브라우저 샌드박스를 유지하면서 모바일 워커·아틀라스 한도를 적용한다", () => {
    const plan = buildSiliconFullPowerPlan({
      siliconId: "nvidia-rtx-grace",
      environment: "mobile-pwa-android-ios",
      memoryMode: "wasm32-simd-safe",
    });
    expect(plan.runtimeBoundary.sandboxedBrowserTab).toBe(true);
    expect(plan.runtimeBoundary.directNativeDriverBlocked).toBe(true);
    expect(plan.computeUnits.cpu.performanceWorkers).toBeLessThanOrEqual(4);
    expect(plan.computeUnits.gpu.atlasBudgetMb).toBeLessThanOrEqual(512);
  });

  it("desktop-native-bridge는 네이티브 FFI 브리지와 플랫폼 Delegate 연결 계획을 반환하되 실제 활성화하지 않는다", () => {
    const silicon = getModernSiliconProfile("google-tensor-tpu");
    const boundary = resolveRuntimeBoundary(silicon, "desktop-native-bridge", "wasm64-memory64");
    expect(boundary.sandboxedBrowserTab).toBe(true);
    expect(boundary.directNativeDriverBlocked).toBe(true);
    expect(boundary.plannedDirectNativeDriverBlocked).toBe(false);
    expect(boundary.blockedDirectApis).toEqual(["CUDA", "Metal", "ROCm", "NNAPI"]);
    expect(boundary.plannedNativeFfiBridgeLayers.join(" ")).toContain("Tauri / Electron Native FFI Bridge");
    expect(boundary.plannedNativeFfiBridgeLayers.join(" ")).toContain("Android NNAPI / LiteRT C++ TPU Delegate");
  });

  it("wasm64-memory64와 wasm32-simd-safe 전환 시 주소 비트(64 vs 32)와 표준 계층 표기가 정확히 바뀐다", () => {
    const p64 = buildSiliconFullPowerPlan({ siliconId: "intel-core-ultra-xe2", memoryMode: "wasm64-memory64" });
    const p32 = buildSiliconFullPowerPlan({ siliconId: "intel-core-ultra-xe2", memoryMode: "wasm32-simd-safe" });
    expect(p64.computeUnits.cpu.memory64Active).toBe(false);
    expect(p64.computeUnits.cpu.plannedMemory64).toBe(true);
    expect(p64.computeUnits.cpu.addressSpaceBits).toBe(64);
    expect(p32.computeUnits.cpu.memory64Active).toBe(false);
    expect(p32.computeUnits.cpu.addressSpaceBits).toBe(32);
    expect(p32.runtimeBoundary.plannedStandardLayers[0]).toContain("WASM32");
  });

  it("브라우저 탭은 128-bit WASM SIMD를, 네이티브 브리지는 SVE2(256)·Zen5 AVX-512(512)를 정직하게 분리한다", () => {
    const browserAmd = buildSiliconFullPowerPlan({ siliconId: "amd-ryzen-ai-xdna2", environment: "browser-web-standard" });
    const nativeAmd = buildSiliconFullPowerPlan({ siliconId: "amd-ryzen-ai-xdna2", environment: "desktop-native-bridge" });
    const nativeTensor = buildSiliconFullPowerPlan({ siliconId: "google-tensor-tpu", environment: "desktop-native-bridge" });
    expect(browserAmd.computeUnits.cpu.simdWidthBits).toBe(128);
    expect(nativeAmd.computeUnits.cpu.simdWidthBits).toBe(512);
    expect(nativeTensor.computeUnits.cpu.simdWidthBits).toBe(256);
  });
});

describe("4. 실리콘 맞춤형 동적 커널 배정기 (buildSiliconFullPowerPlan) & JSON 매니페스트", () => {
  it("8대 실리콘 × 3환경 × 2메모리모드(48조합) 모두 6대 워크로드와 CPU+GPU+NPU=100% 불변식을 만족한다", () => {
    for (const siliconId of MODERN_SILICON_IDS) {
      for (const environment of EXECUTION_ENVIRONMENTS) {
        for (const memoryMode of MEMORY_ADDRESS_MODES) {
          const plan = buildSiliconFullPowerPlan({ siliconId, environment, memoryMode });
          expect(plan.workloadRoutes).toHaveLength(6);
          const unitSum =
            plan.computeUnits.cpu.loadSharePct +
            plan.computeUnits.gpu.loadSharePct +
            plan.computeUnits.npuTpu.loadSharePct;
          expect(unitSum).toBe(100);
          for (const route of plan.workloadRoutes) {
            expect(route.cpuSharePct + route.gpuSharePct + route.npuTpuSharePct).toBe(100);
          }
        }
      }
    }
  });

  it("wasm32-simd-safe 모드는 4 GiB 상한 보호를 위해 wasm64-memory64 대비 아틀라스 용량을 축소한다", () => {
    const plan64 = buildSiliconFullPowerPlan({ siliconId: "nvidia-rtx-grace", memoryMode: "wasm64-memory64" });
    const plan32 = buildSiliconFullPowerPlan({ siliconId: "nvidia-rtx-grace", memoryMode: "wasm32-simd-safe" });
    expect(plan64.computeUnits.gpu.atlasBudgetMb).toBe(4096);
    expect(plan32.computeUnits.gpu.atlasBudgetMb).toBe(1024);
    expect(plan32.computeUnits.gpu.atlasBudgetMb).toBeLessThan(plan64.computeUnits.gpu.atlasBudgetMb);
  });

  it("Google Tensor TPU에서 선화·채색 AI 선택 시 64-정렬 정적 텐서와 Zero-Copy MLTensor(Readback 가정 0회)를 계획한다", () => {
    const plan = buildSiliconFullPowerPlan({
      siliconId: "google-tensor-tpu",
      focusWorkloadId: "lineart-color-ai",
    });
    expect(plan.computeUnits.npuTpu.paddedFocusShape).toEqual([1, 4, 768, 1280]);
    expect(plan.computeUnits.npuTpu.zeroCopyMlTensorActive).toBe(false);
    expect(plan.computeUnits.npuTpu.plannedZeroCopyMlTensor).toBe(true);
    expect(plan.computeUnits.npuTpu.cpuStagingReadbacks).toBe(0);
    expect(plan.activeWorkloadRoute.primaryUnit).toBe("npu-tpu");
  });

  it("Exynos Xclipse는 브라우저 모드에서 스테이징 복사(Readback 가정 2회)를 계획하고 네이티브 모드에서 Zero-Copy를 계획한다", () => {
    const browserPlan = buildSiliconFullPowerPlan({
      siliconId: "samsung-exynos-xclipse",
      environment: "browser-web-standard",
      focusWorkloadId: "lineart-color-ai",
    });
    const nativePlan = buildSiliconFullPowerPlan({
      siliconId: "samsung-exynos-xclipse",
      environment: "desktop-native-bridge",
      focusWorkloadId: "lineart-color-ai",
    });
    expect(browserPlan.computeUnits.npuTpu.zeroCopyMlTensorActive).toBe(false);
    expect(browserPlan.computeUnits.npuTpu.cpuStagingReadbacks).toBe(0);
    expect(browserPlan.computeUnits.npuTpu.plannedCpuStagingReadbacks).toBe(2);
    expect(browserPlan.activeWorkloadRoute.memoryPathLabel).toContain("CPU Staging (2 Readbacks)");
    expect(nativePlan.computeUnits.npuTpu.zeroCopyMlTensorActive).toBe(false);
    expect(nativePlan.computeUnits.npuTpu.plannedZeroCopyMlTensor).toBe(true);
    expect(nativePlan.computeUnits.npuTpu.cpuStagingReadbacks).toBe(0);
  });

  it("AMD Ryzen AI XDNA2에서 2.5D 깊이 추정(518×518)이 32-정렬(544×544)로 패딩된다", () => {
    const plan = buildSiliconFullPowerPlan({
      siliconId: "amd-ryzen-ai-xdna2",
      focusWorkloadId: "depth-estimation-25d",
    });
    expect(plan.computeUnits.npuTpu.paddedFocusShape).toEqual([1, 3, 544, 544]);
    expect(plan.activeWorkloadRoute.staticTensorShapeLabel).toBe("[1×3×544×544]");
  });

  it("MediaTek Dimensity APU는 All-Big-Core 정책으로 가상 작업실 물리·음향 워크로드에서 CPU 주력을 유지한다", () => {
    const plan = buildSiliconFullPowerPlan({
      siliconId: "mediatek-dimensity-apu",
      focusWorkloadId: "virtual-studio-physics-audio",
    });
    expect(plan.computeUnits.cpu.efficiencyWorkers).toBe(0);
    expect(plan.computeUnits.cpu.schedulingPolicy).toBe("all-big-work-stealing");
    expect(plan.activeWorkloadRoute.primaryUnit).toBe("cpu");
  });

  it("exportToonSiliconPlanJson이 유효한 JSON 매니페스트를 생성하고 plan과 완전 동치이다", () => {
    const { plan, json } = exportToonSiliconPlanJson({
      siliconId: "apple-silicon-ane",
      environment: "browser-web-standard",
      memoryMode: "wasm64-memory64",
      focusWorkloadId: "character-skinning-culling-3d",
    });
    const parsed = JSON.parse(json) as typeof plan;
    expect(parsed).toEqual(plan);
    expect(parsed.computeUnits.gpu.graphicsBackend).toBe("Metal");
  });
});

describe("5. StudioToonSiliconPanel 제어판 UI · 3유닛 SVG 도해 · 인터랙션", () => {
  it("props 없이 기본 렌더 시 Google Tensor TPU·8대 실리콘 카드·6대 워크로드 경로표가 모두 표시된다", () => {
    render(<StudioToonSiliconPanel />);
    const svg = screen.getByTestId("toon-silicon-architecture-svg");
    expect(svg.getAttribute("data-silicon-id")).toBe("google-tensor-tpu");
    expect(svg.getAttribute("data-environment")).toBe("browser-web-standard");
    expect(svg.getAttribute("data-memory-mode")).toBe("wasm64-memory64");
    for (const id of MODERN_SILICON_IDS) {
      expect(screen.getByTestId(`toon-silicon-card-${id}`)).toBeTruthy();
    }
    for (const wl of TOONSTUDIO_WORKLOAD_IDS) {
      expect(screen.getByTestId(`toon-silicon-workload-${wl}`)).toBeTruthy();
    }
  });

  it("8대 실리콘 카드 전환 시 SVG·3유닛 KPI·onPlanChange 콜백이 즉시 갱신된다", () => {
    const onPlanChange = vi.fn();
    render(<StudioToonSiliconPanel onPlanChange={onPlanChange} />);

    fireEvent.click(screen.getByTestId("toon-silicon-card-nvidia-rtx-grace"));
    expect(screen.getByTestId("toon-silicon-architecture-svg").getAttribute("data-silicon-id")).toBe("nvidia-rtx-grace");
    expect(screen.getByTestId("toon-silicon-unit-gpu").textContent).toContain("4096 MiB");
    expect(onPlanChange).toHaveBeenCalledTimes(1);
    expect(onPlanChange.mock.calls[0]?.[0]?.siliconId).toBe("nvidia-rtx-grace");

    fireEvent.click(screen.getByTestId("toon-silicon-card-apple-silicon-ane"));
    expect(screen.getByTestId("toon-silicon-unit-npu").textContent).toContain("Apple Neural Engine");
    expect(onPlanChange).toHaveBeenCalledTimes(2);
  });

  it("실행 환경 3종 버튼 전환 시 브라우저 샌드박스 차단 배지와 네이티브 FFI 브리지 표시가 바뀐다", () => {
    render(<StudioToonSiliconPanel />);
    expect(screen.getByTestId("toon-silicon-boundary-badge").textContent).toContain("브라우저 샌드박스");
    expect(screen.getByTestId("toon-silicon-boundary-panel").textContent).toContain("CUDA · Metal · ROCm · NNAPI");

    fireEvent.click(screen.getByTestId("toon-silicon-env-desktop-native-bridge"));
    expect(screen.getByTestId("toon-silicon-boundary-badge").textContent).toContain("네이티브 셸 FFI");
    expect(screen.getByTestId("toon-silicon-boundary-panel").textContent).toContain("Tauri / Electron Native FFI Bridge");

    fireEvent.click(screen.getByTestId("toon-silicon-env-mobile-pwa-android-ios"));
    expect(screen.getByTestId("toon-silicon-architecture-svg").getAttribute("data-environment")).toBe("mobile-pwa-android-ios");
  });

  it("WASM64/WASM32 토글 전환 시 메모리 배지·SVG 속성·아틀라스 용량이 즉시 반영된다", () => {
    render(<StudioToonSiliconPanel initialSiliconId="apple-silicon-ane" />);
    expect(screen.getByTestId("toon-silicon-memory-badge").textContent).toContain("WASM64 · i64");
    expect(screen.getByTestId("toon-silicon-unit-gpu").textContent).toContain("2048 MiB");

    fireEvent.click(screen.getByTestId("toon-silicon-memory-wasm32-simd-safe"));
    expect(screen.getByTestId("toon-silicon-memory-badge").textContent).toContain("WASM32 · i32");
    expect(screen.getByTestId("toon-silicon-architecture-svg").getAttribute("data-memory-mode")).toBe("wasm32-simd-safe");
    expect(screen.getByTestId("toon-silicon-unit-gpu").textContent).toContain("1024 MiB");
  });

  it("6대 워크로드 행 클릭 시 상단 3유닛 SVG 도해의 초점 워크로드가 즉시 바뀐다", () => {
    render(<StudioToonSiliconPanel />);
    fireEvent.click(screen.getByTestId("toon-silicon-workload-character-skinning-culling-3d"));
    const svg = screen.getByTestId("toon-silicon-architecture-svg");
    expect(svg.getAttribute("data-focus-workload")).toBe("character-skinning-culling-3d");
    expect(screen.getByTestId("toon-silicon-workload-character-skinning-culling-3d").getAttribute("aria-pressed")).toBe("true");
  });

  it("매니페스트 JSON 복사 버튼이 클립보드 쓰기·onExportJson·미리보기 노출을 정상 처리한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onExportJson = vi.fn();

    render(<StudioToonSiliconPanel onExportJson={onExportJson} />);
    expect(screen.queryByTestId("toon-silicon-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("toon-silicon-copy-json-btn"));
    await waitFor(() => expect(onExportJson).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toContain("silicon-capability-and-dispatch-architecture");
    expect(screen.getByTestId("toon-silicon-json-preview").textContent).toContain("google-tensor-tpu");
    expect(screen.getByTestId("toon-silicon-status-message").textContent).toContain("복사했습니다");
  });

  it("클립보드 접근이 실패해도 오류 없이 JSON 미리보기 폴백 안내를 표시한다", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(<StudioToonSiliconPanel />);
    fireEvent.click(screen.getByTestId("toon-silicon-copy-json-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("toon-silicon-status-message").textContent).toContain("미리보기를 열었습니다");
    });
    expect(screen.getByTestId("toon-silicon-json-preview")).toBeTruthy();
  });

  it("JSON 미리보기 토글과 초기화 버튼이 상태를 안전하게 복원하고 onPlanChange를 알린다", () => {
    const onPlanChange = vi.fn();
    render(<StudioToonSiliconPanel initialSiliconId="intel-core-ultra-xe2" onPlanChange={onPlanChange} />);

    fireEvent.click(screen.getByTestId("toon-silicon-toggle-json-btn"));
    expect(screen.getByTestId("toon-silicon-json-preview")).toBeTruthy();

    fireEvent.click(screen.getByTestId("toon-silicon-card-qualcomm-snapdragon-hexagon"));
    fireEvent.click(screen.getByTestId("toon-silicon-memory-wasm32-simd-safe"));
    fireEvent.click(screen.getByTestId("toon-silicon-reset-btn"));

    expect(screen.queryByTestId("toon-silicon-json-preview")).toBeNull();
    expect(screen.getByTestId("toon-silicon-architecture-svg").getAttribute("data-silicon-id")).toBe("intel-core-ultra-xe2");
    expect(screen.getByTestId("toon-silicon-architecture-svg").getAttribute("data-memory-mode")).toBe("wasm64-memory64");
    expect(onPlanChange).toHaveBeenCalledTimes(3);
  });

  it("영문 로케일(locale='en')과 initialSiliconId·className props가 정확히 반영된다", () => {
    render(
      <StudioToonSiliconPanel
        locale="en"
        initialSiliconId="amd-ryzen-ai-xdna2"
        className="custom-toon-silicon-shell"
      />,
    );
    expect(screen.getByTestId("toon-silicon-panel").className).toContain("custom-toon-silicon-shell");
    expect(screen.getByTestId("toon-silicon-boundary-badge").textContent).toContain("Browser Sandbox Standard API");
    expect(screen.getByTestId("toon-silicon-architecture-svg").getAttribute("data-silicon-id")).toBe("amd-ryzen-ai-xdna2");
    expect(screen.getByTestId("toon-silicon-honesty-notice").textContent).toContain("No fabricated TOPS");
  });

  it("8대 실리콘 전체 렌더 시 모든 버튼이 min-h-11을 지키고 SVG에 원시 색·바이올렛 휴가 0건이다", () => {
    for (const siliconId of MODERN_SILICON_IDS) {
      const { container } = render(<StudioToonSiliconPanel initialSiliconId={siliconId} />);
      const buttons = container.querySelectorAll("button");
      expect(buttons.length).toBeGreaterThanOrEqual(22);
      for (const btn of buttons) {
        expect(btn.className).toContain("min-h-11");
      }
      const svg = screen.getByTestId("toon-silicon-architecture-svg");
      expect(svg.getAttribute("data-violet-free")).toBe("true");
      assertZeroVioletAndRawColors(svg.outerHTML);
      cleanup();
    }
  });
});

describe("6. 엄격 품질·하네스·브랜드 정적 계약 자가 검증", () => {
  it("소유 디렉터리에 정의된 7개 파일만 존재하고 줄 수 상한(engine<=750, panel<=680, all<=800)을 지킨다", () => {
    const dir = path.resolve(import.meta.dirname);
    const expectedFiles = [
      "StudioToonSiliconPanel.tsx",
      "index.ts",
      "studio-hardware-accelerator-probe.test.ts",
      "studio-hardware-accelerator-probe.ts",
      "studio-onnx-session-cascade.ts",
      "toon-silicon-engine.ts",
      "toon-silicon.test.tsx",
    ];
    for (const file of expectedFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }
    const actualFiles = readdirSync(dir)
      .filter((f) => /\.(?:ts|tsx)$/u.test(f))
      .sort();
    expect(actualFiles).toEqual(expectedFiles);

    for (const file of actualFiles) {
      const lines = readFileSync(path.join(dir, file), "utf8").split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "toon-silicon-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioToonSiliconPanel.tsx") expect(lines).toBeLessThanOrEqual(680);
    }
  });

  it("4개 파일 전체에 금지 패턴(원시 색·WebStorage·BigInt 리터럴·private Map store·금지 아이콘·= {}·번역투)이 0건이다", () => {
    const dir = path.resolve(import.meta.dirname);
    const files = ["toon-silicon-engine.ts", "StudioToonSiliconPanel.tsx", "index.ts", "toon-silicon.test.tsx"];

    const bannedStorageA = new RegExp("\\b" + "local" + "Storage\\b", "u");
    const bannedStorageB = new RegExp("\\b" + "session" + "Storage\\b", "u");
    const bannedTransition = new RegExp("transition" + "-all", "u");
    const bannedIcon = new RegExp("Spar" + "kles", "u");
    const bannedBigIntHex = new RegExp("0x[0-9a-fA-F]+" + "n\\b", "u");
    const bannedBigIntDec = new RegExp("\\b\\d+" + "n\\b", "u");
    const bannedStoreMap = new RegExp("private\\s+(?:readonly\\s+)?" + "store\\s*[:=]\\s*new\\s+Map", "u");
    const bannedDefaultProps = new RegExp("Props\\s*=\\s*\\{\\}", "u");
    const bannedTranslationA = "가능하게 " + "합니다";
    const bannedTranslationB = "직관적인 " + "경험을 제공";
    const bannedTranslationC = "원활한 워크" + "플로우를 보장";

    for (const file of files) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src).not.toMatch(RAW_HEX_PATTERN);
      expect(src).not.toMatch(RAW_RGB_PATTERN);
      expect(src).not.toMatch(RAW_HSL_PATTERN);
      expect(src).not.toMatch(bannedStorageA);
      expect(src).not.toMatch(bannedStorageB);
      expect(src).not.toMatch(bannedTransition);
      expect(src).not.toMatch(bannedIcon);
      expect(src).not.toMatch(bannedBigIntHex);
      expect(src).not.toMatch(bannedBigIntDec);
      expect(src).not.toMatch(bannedStoreMap);
      expect(src).not.toMatch(bannedDefaultProps);
      expect(src).not.toContain(bannedTranslationA);
      expect(src).not.toContain(bannedTranslationB);
      expect(src).not.toContain(bannedTranslationC);
    }

    const panelSrc = readFileSync(path.join(dir, "StudioToonSiliconPanel.tsx"), "utf8");
    expect(panelSrc).toContain("min-h-11");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("motion-reduce:transition-none");
  });

  it("4개 파일 전체에 외부 드로잉 라이브러리·경쟁사 앱명이 0건이며 고유 브랜드(ToonSilicon·ToonCore·SpectrumCompute)만 사용한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const files = ["toon-silicon-engine.ts", "StudioToonSiliconPanel.tsx", "index.ts", "toon-silicon.test.tsx"];
    const forbiddenExternalNames = [
      ["Ski", "a"].join(""),
      ["Pix", "iJS"].join(""),
      ["Pro", "create"].join(""),
      ["Clip ", "Studio"].join(""),
      ["Photo", "shop"].join(""),
      ["Kri", "ta"].join(""),
      ["Blen", "der"].join(""),
      ["Kon", "va"].join(""),
      ["Fabric", ".js"].join(""),
      ["ibis", "Paint"].join(""),
      ["Medi", "Bang"].join(""),
      ["Affin", "ity"].join(""),
    ];

    let combined = "";
    for (const file of files) {
      const src = readFileSync(path.join(dir, file), "utf8");
      combined += `\n${src}`;
      for (const forbidden of forbiddenExternalNames) {
        expect(src.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
    }
    expect(combined).toContain("ToonSilicon");
    expect(combined).toContain("ToonCore");
    expect(combined).toContain("SpectrumCompute");
  });
});
