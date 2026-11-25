// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as BarrelExports from "./index";
import {
  FALLBACK_TIER_ORDER,
  HONESTY_DISCLOSURE_KO,
  SILICON_DEVICE_PROFILES,
  TOONSTUDIO_HETEROGENEOUS_WORKLOADS,
  buildHeterogeneousRuntimeManifest,
  buildOrtWebSessionOptions,
  exportHeterogeneousManifestJson,
  getSiliconDeviceProfile,
  normalizeRuntimeCapabilityFlags,
  probeHostAcceleratorHints,
  scheduleHeterogeneousWorkloads,
  type SiliconDeviceId,
} from "./heterogeneous-npu-engine";
import { StudioHeterogeneousSiliconPanel } from "./StudioHeterogeneousSiliconPanel";

afterEach(() => {
  cleanup();
});

describe("1. 5대 실리콘 프로파일 및 호스트 가속기 힌트 프로브", () => {
  it("Apple·Intel·AMD·Galaxy Snapdragon·Galaxy Exynos 5대 실리콘 프로파일을 고유 스택으로 정의한다", () => {
    expect(SILICON_DEVICE_PROFILES).toHaveLength(5);
    const ids = SILICON_DEVICE_PROFILES.map((p) => p.id);
    expect(ids).toEqual([
      "apple-m-series",
      "intel-core-ultra",
      "amd-ryzen-ai",
      "galaxy-snapdragon",
      "galaxy-exynos",
    ]);
    expect(getSiliconDeviceProfile("apple-m-series").npuBackendKo).toContain("Apple Neural Engine");
    expect(getSiliconDeviceProfile("intel-core-ultra").npuBackendKo).toContain("Intel NPU");
    expect(getSiliconDeviceProfile("amd-ryzen-ai").npuBackendKo).toContain("XDNA");
    expect(getSiliconDeviceProfile("galaxy-snapdragon").npuBackendKo).toContain("Hexagon");
    expect(getSiliconDeviceProfile("galaxy-exynos").webgpuBackendKo).toContain("Xclipse");
  });

  it("4대 실리콘 벤더 그룹(apple · intel · amd · samsung-galaxy)을 모두 포함한다", () => {
    const vendors = new Set(SILICON_DEVICE_PROFILES.map((p) => p.vendorGroup));
    expect(vendors).toEqual(new Set(["apple", "intel", "amd", "samsung-galaxy"]));
  });

  it("알 수 없는 실리콘 ID 조회 시 예외 없이 Apple Silicon 기본 프로파일로 안전 폴백한다", () => {
    const fallback = getSiliconDeviceProfile("unknown-silicon-chip");
    expect(fallback.id).toBe("apple-m-series");
  });

  it("probeHostAcceleratorHints는 macOS Chromium WebNN+WebGPU 환경을 Apple Silicon으로 감지한다", () => {
    const res = probeHostAcceleratorHints({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) Chrome/134.0.0.0 Safari/537.36",
      deviceMemory: 16,
      ml: { createContext: () => Promise.resolve({}) },
      gpu: { requestAdapter: () => Promise.resolve({}) },
    });
    expect(res.detectedSiliconId).toBe("apple-m-series");
    expect(res.hasNavigatorMl).toBe(true);
    expect(res.hasNavigatorGpu).toBe(true);
    expect(res.isSafariWebKitLikely).toBe(false);
    expect(res.recommendedFlags.webnnAvailable).toBe(true);
  });

  it("probeHostAcceleratorHints는 Safari WebKit 환경에서 WebNN 미노출을 감지해 Metal WebGPU 자동 폴백을 준비한다", () => {
    const res = probeHostAcceleratorHints({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 Version/18.2 Safari/605.1.15",
      ml: null,
      gpu: { requestAdapter: () => Promise.resolve({}) },
    });
    expect(res.detectedSiliconId).toBe("apple-m-series");
    expect(res.isSafariWebKitLikely).toBe(true);
    expect(res.recommendedFlags.webnnAvailable).toBe(false);
    expect(res.recommendedFlags.webgpuAvailable).toBe(true);
    expect(res.summaryKo).toContain("Safari/WebKit");
  });

  it("probeHostAcceleratorHints는 Samsung Galaxy Android(Snapdragon/Exynos)와 Windows(Intel/AMD) UA를 구분한다", () => {
    const snap = probeHostAcceleratorHints({ userAgent: "Mozilla/5.0 (Linux; Android 15; SM-S928N) Chrome/133.0" });
    const exynos = probeHostAcceleratorHints({ userAgent: "Mozilla/5.0 (Linux; Android 15; Galaxy Exynos Xclipse) Chrome/133.0" });
    const intel = probeHostAcceleratorHints({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/134.0" });
    const amd = probeHostAcceleratorHints({ userAgent: "Mozilla/5.0 (Windows NT 10.0; AMD Ryzen AI) Chrome/134.0" });

    expect(snap.detectedSiliconId).toBe("galaxy-snapdragon");
    expect(exynos.detectedSiliconId).toBe("galaxy-exynos");
    expect(intel.detectedSiliconId).toBe("intel-core-ultra");
    expect(amd.detectedSiliconId).toBe("amd-ryzen-ai");
  });

  it("probeHostAcceleratorHints는 navigator=null(SSR/헤드리스)에서도 안전하게 폴백 플래그를 반환한다", () => {
    const res = probeHostAcceleratorHints(null);
    expect(res.detectedSiliconId).toBe("apple-m-series");
    expect(res.hasNavigatorMl).toBe(false);
    expect(res.hasNavigatorGpu).toBe(false);
    expect(res.recommendedFlags.webnnAvailable).toBe(false);
    expect(res.recommendedFlags.webgpuAvailable).toBe(false);
  });
});

describe("2. ToonStudio 6대 워크로드 3레인 분산 스케줄러 및 4단 무중단 폴백", () => {
  it("ToonStudio 6대 워크로드 카탈로그가 1~6 순서와 이상 레인을 정확히 정의한다", () => {
    expect(TOONSTUDIO_HETEROGENEOUS_WORKLOADS).toHaveLength(6);
    expect(TOONSTUDIO_HETEROGENEOUS_WORKLOADS.map((w) => w.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(FALLBACK_TIER_ORDER).toEqual(["webnn-npu", "webgpu-f16", "wasm-relaxed-simd128", "wasm-scalar"]);
  });

  it("Apple Silicon 기본 설정에서 ①②③은 NPU, ④는 WebGPU f16, ⑤⑥은 WASM SIMD/CPU 워커로 3레인 분리된다", () => {
    const plan = scheduleHeterogeneousWorkloads({ siliconId: "apple-m-series" });
    expect(plan.lanes.npu.workloads.map((w) => w.workloadId)).toEqual([
      "face-eye-protection",
      "dialogue-emotion-viseme",
      "continuity-drift-vision",
    ]);
    expect(plan.lanes.webgpu.workloads.map((w) => w.workloadId)).toEqual(["brush-km7-impasto-bvh"]);
    expect(plan.lanes["wasm-simd"].workloads.map((w) => w.workloadId)).toEqual([
      "vrm-skinning-psd-clip",
      "rhythm-offline-crdt",
    ]);
    expect(plan.assignments.every((a) => !a.isFallback)).toBe(true);
    expect(plan.contentionScore.activeLaneCount).toBe(3);
  });

  it("Intel Core Ultra에서 DirectML Intel NPU + Arc Subgroups + x86 AVX2/AVX-512 로워링이 반영된다", () => {
    const plan = scheduleHeterogeneousWorkloads({ siliconId: "intel-core-ultra" });
    const face = plan.assignments.find((a) => a.workloadId === "face-eye-protection");
    const brush = plan.assignments.find((a) => a.workloadId === "brush-km7-impasto-bvh");
    const vrm = plan.assignments.find((a) => a.workloadId === "vrm-skinning-psd-clip");
    expect(face?.executionDetailKo).toContain("Intel NPU");
    expect(brush?.executionDetailKo).toContain("Arc WebGPU");
    expect(brush?.executionDetailKo).toContain("+Subgroups");
    expect(vrm?.executionDetailKo).toContain("AVX2 / AVX-512");
  });

  it("AMD Ryzen AI에서 XDNA/XDNA2 NPU + RDNA WebGPU f16 + AVX-512 로워링이 반영된다", () => {
    const plan = scheduleHeterogeneousWorkloads({ siliconId: "amd-ryzen-ai" });
    const drift = plan.assignments.find((a) => a.workloadId === "continuity-drift-vision");
    const brush = plan.assignments.find((a) => a.workloadId === "brush-km7-impasto-bvh");
    const vrm = plan.assignments.find((a) => a.workloadId === "vrm-skinning-psd-clip");
    expect(drift?.executionDetailKo).toContain("XDNA");
    expect(brush?.executionDetailKo).toContain("RDNA WebGPU");
    expect(vrm?.executionDetailKo).toContain("AVX-512");
  });

  it("Galaxy Snapdragon은 기본 Subgroups 미활성 시 표준 워크그룹 경로와 WASM32 SIMD를 적용한다", () => {
    const plan = scheduleHeterogeneousWorkloads({ siliconId: "galaxy-snapdragon" });
    const brush = plan.assignments.find((a) => a.workloadId === "brush-km7-impasto-bvh");
    const vrm = plan.assignments.find((a) => a.workloadId === "vrm-skinning-psd-clip");
    expect(plan.lanes.npu.workloads).toHaveLength(3);
    expect(brush?.executionDetailKo).toContain("표준워크그룹");
    expect(vrm?.executionDetailKo).toContain("+WASM32");
    expect(plan.warnings.some((w) => w.code === "WEBGPU_SUBGROUPS_UNAVAILABLE")).toBe(true);
  });

  it("Galaxy Exynos는 Exynos NPU + Xclipse RDNA WebGPU(f16+Subgroups) + ARMv9 NEON/SVE2로 배치된다", () => {
    const plan = scheduleHeterogeneousWorkloads({ siliconId: "galaxy-exynos" });
    const face = plan.assignments.find((a) => a.workloadId === "face-eye-protection");
    const brush = plan.assignments.find((a) => a.workloadId === "brush-km7-impasto-bvh");
    const vrm = plan.assignments.find((a) => a.workloadId === "vrm-skinning-psd-clip");
    expect(face?.executionDetailKo).toContain("Exynos NPU");
    expect(brush?.executionDetailKo).toContain("Xclipse RDNA");
    expect(brush?.executionDetailKo).toContain("+Subgroups");
    expect(vrm?.executionDetailKo).toContain("SVE2");
  });

  it("4단 폴백 1→2단계: WebNN 비활성 시 ①②③이 WebGPU f16으로 자동 폴백하고 GPU 경합 경보를 기록한다", () => {
    const plan = scheduleHeterogeneousWorkloads({
      siliconId: "apple-m-series",
      flags: { webnnAvailable: false },
    });
    expect(plan.lanes.npu.workloads).toHaveLength(0);
    expect(plan.lanes.webgpu.workloads).toHaveLength(4);
    expect(plan.lanes.webgpu.isContended).toBe(true);
    const face = plan.assignments.find((a) => a.workloadId === "face-eye-protection");
    expect(face?.resolvedTier).toBe("webgpu-f16");
    expect(face?.isFallback).toBe(true);
    expect(face?.fallbackDepth).toBe(1);
    expect(face?.fallbackReasonKo).toContain("WebGPU f16 자동 폴백");
    expect(plan.warnings.some((w) => w.code === "WEBNN_UNAVAILABLE_FALLBACK")).toBe(true);
    expect(plan.warnings.some((w) => w.code === "GPU_LANE_AI_CONTENTION")).toBe(true);
  });

  it("4단 폴백 2→3단계: WebNN·WebGPU 모두 비활성 시 ①②③④가 Rust WASM Relaxed-SIMD128로 자동 폴백한다", () => {
    const plan = scheduleHeterogeneousWorkloads({
      siliconId: "intel-core-ultra",
      flags: { webnnAvailable: false, webgpuAvailable: false, wasmRelaxedSimdAvailable: true },
    });
    expect(plan.lanes.npu.workloads).toHaveLength(0);
    expect(plan.lanes.webgpu.workloads).toHaveLength(0);
    expect(plan.lanes["wasm-simd"].workloads).toHaveLength(6);
    expect(plan.assignments.find((a) => a.workloadId === "face-eye-protection")?.resolvedTier).toBe("wasm-relaxed-simd128");
    expect(plan.assignments.find((a) => a.workloadId === "brush-km7-impasto-bvh")?.resolvedTier).toBe("wasm-relaxed-simd128");
    expect(plan.warnings.some((w) => w.code === "WEBGPU_UNAVAILABLE_CPU_FALLBACK")).toBe(true);
  });

  it("4단 폴백 3→4단계: WebNN·WebGPU·Relaxed-SIMD 모두 비활성 시 ①~⑤가 WASM Scalar로 안전 폴백한다", () => {
    const plan = scheduleHeterogeneousWorkloads({
      siliconId: "galaxy-snapdragon",
      flags: { webnnAvailable: false, webgpuAvailable: false, wasmRelaxedSimdAvailable: false },
    });
    for (const item of plan.assignments) {
      expect(item.resolvedTier).toBe("wasm-scalar");
      expect(item.assignedLane).toBe("wasm-simd");
    }
    expect(plan.contentionScore.scalarFallbackCount).toBe(5);
    expect(plan.activeFallbackLadder).toEqual(["wasm-scalar"]);
    expect(plan.warnings.some((w) => w.code === "WASM_RELAXED_SIMD_UNAVAILABLE_SCALAR")).toBe(true);
  });
});

describe("3. 정밀도 옵션 · 배터리 절전 · 정직한 열·배터리 경합 회피 모델", () => {
  it("webgpuF16Available=false 시 WebGPU 레인은 유지하되 FP32 정밀도 강등과 안내 경보를 표시한다", () => {
    const plan = scheduleHeterogeneousWorkloads({
      siliconId: "apple-m-series",
      flags: { webgpuF16Available: false },
    });
    const brush = plan.assignments.find((a) => a.workloadId === "brush-km7-impasto-bvh");
    expect(brush?.resolvedTier).toBe("webgpu-f16");
    expect(brush?.effectivePrecision).toBe("fp32");
    expect(brush?.fallbackReasonKo).toContain("FP32");
    expect(plan.warnings.some((w) => w.code === "WEBGPU_F16_UNAVAILABLE_FP32")).toBe(true);
  });

  it("batterySaverMode=true 시 60컷 드리프트 스캔이 throttled-batch로 전환되고 열/배터리 회피 점수가 향상된다", () => {
    const normal = scheduleHeterogeneousWorkloads({
      siliconId: "intel-core-ultra",
      flags: { webnnAvailable: false, batterySaverMode: false },
    });
    const saver = scheduleHeterogeneousWorkloads({
      siliconId: "intel-core-ultra",
      flags: { webnnAvailable: false, batterySaverMode: true },
    });
    const drift = saver.assignments.find((a) => a.workloadId === "continuity-drift-vision");
    expect(drift?.batchPacingMode).toBe("throttled-batch");
    expect(saver.contentionScore.thermalAvoidanceScore).toBeGreaterThan(normal.contentionScore.thermalAvoidanceScore);
    expect(saver.contentionScore.batteryAvoidanceScore).toBeGreaterThan(normal.contentionScore.batteryAvoidanceScore);
    expect(saver.warnings.some((w) => w.code === "BATTERY_SAVER_BATCH_PACED")).toBe(true);
  });

  it("3레인 최적 분산 > GPU 폴백 경합 > CPU 전면 집중 순으로 경합 회피 종합 점수가 단조 감소한다", () => {
    const optimal = scheduleHeterogeneousWorkloads({ siliconId: "apple-m-series" });
    const gpuSpill = scheduleHeterogeneousWorkloads({ siliconId: "apple-m-series", flags: { webnnAvailable: false } });
    const cpuOnly = scheduleHeterogeneousWorkloads({
      siliconId: "apple-m-series",
      flags: { webnnAvailable: false, webgpuAvailable: false, wasmRelaxedSimdAvailable: false },
    });

    expect(optimal.contentionScore.overallAvoidanceScore).toBeGreaterThan(gpuSpill.contentionScore.overallAvoidanceScore);
    expect(gpuSpill.contentionScore.overallAvoidanceScore).toBeGreaterThan(cpuOnly.contentionScore.overallAvoidanceScore);
    expect(optimal.contentionScore.avoidanceGrade).toBe("optimal");
    expect(cpuOnly.contentionScore.avoidanceGrade).toBe("contended");
  });

  it("경합 회피 모델은 아키텍처 분산 계획 모델임을 명시하고 결정론적 0.4/0.3/0.3 가중치 합과 일치한다", () => {
    const plan = scheduleHeterogeneousWorkloads({ siliconId: "amd-ryzen-ai" });
    const s = plan.contentionScore;
    expect(s.modelKind).toBe("architecture-distribution-plan-model");
    expect(s.honestyDisclosureKo).toContain("아키텍처 분산 계획 모델");
    expect(s.honestyDisclosureKo).toContain("실측값이 아니라");
    const recomputed = Math.round(
      s.laneSeparationScore * s.formulaWeights.laneSeparationWeight +
        s.thermalAvoidanceScore * s.formulaWeights.thermalWeight +
        s.batteryAvoidanceScore * s.formulaWeights.batteryWeight,
    );
    expect(s.overallAvoidanceScore).toBe(recomputed);
  });

  it("3레인 부하 점유율 합계가 항상 100%이며 peakLaneSharePct가 세 레인의 최댓값과 일치한다", () => {
    const ids: readonly SiliconDeviceId[] = ["apple-m-series", "intel-core-ultra", "amd-ryzen-ai", "galaxy-snapdragon", "galaxy-exynos"];
    for (const siliconId of ids) {
      const plan = scheduleHeterogeneousWorkloads({ siliconId });
      const sum = plan.lanes.npu.loadSharePct + plan.lanes.webgpu.loadSharePct + plan.lanes["wasm-simd"].loadSharePct;
      expect(sum).toBe(100);
      expect(plan.contentionScore.peakLaneSharePct).toBe(
        Math.max(plan.lanes.npu.loadSharePct, plan.lanes.webgpu.loadSharePct, plan.lanes["wasm-simd"].loadSharePct),
      );
    }
  });

  it("⑥ 로컬 작업 리듬·오프라인 CRDT는 어떤 플래그 조합에서도 NPU/WebGPU 레인을 침범하지 않는다", () => {
    const full = scheduleHeterogeneousWorkloads({ siliconId: "apple-m-series" });
    const degraded = scheduleHeterogeneousWorkloads({
      siliconId: "galaxy-exynos",
      flags: { webnnAvailable: false, webgpuAvailable: false, wasmRelaxedSimdAvailable: false },
    });
    for (const plan of [full, degraded]) {
      const crdt = plan.assignments.find((a) => a.workloadId === "rhythm-offline-crdt");
      expect(crdt?.assignedLane).toBe("wasm-simd");
      expect(crdt?.batchPacingMode).toBe("background-worker");
      expect(crdt?.isFallback).toBe(false);
    }
  });

  it("normalizeRuntimeCapabilityFlags는 지정한 오버라이드만 덮어쓰고 나머지 실리콘 기본값을 유지한다", () => {
    const normalized = normalizeRuntimeCapabilityFlags("galaxy-snapdragon", { batterySaverMode: true });
    expect(normalized.batterySaverMode).toBe(true);
    expect(normalized.webgpuSubgroupsAvailable).toBe(false);
    expect(normalized.wasmMemory64Available).toBe(false);
    expect(normalized.webnnAvailable).toBe(true);
  });
});

describe("4. ONNX Runtime Web EP 설정 생성기(buildOrtWebSessionOptions) 및 JSON 매니페스트", () => {
  it("WebNN·WebGPU·SIMD 모두 활성 시 executionProviders가 webnn(npu) → webgpu → wasm 순으로 생성된다", () => {
    const flags = normalizeRuntimeCapabilityFlags("apple-m-series");
    const ort = buildOrtWebSessionOptions({ siliconId: "apple-m-series", flags, workloadId: "face-eye-protection" });
    expect(ort.primaryProvider).toBe("webnn");
    expect(ort.fallbackChain).toEqual(["webnn", "webgpu", "wasm"]);
    const first = ort.sessionOptions.executionProviders[0];
    expect(first).toEqual({ name: "webnn", deviceType: "npu", powerPreference: "default" });
    expect(ort.wasmEnvFlags.relaxedSimd).toBe(true);
  });

  it("WebNN 비활성(Safari/모바일 미지원) 시 webnn EP를 제외하고 webgpu → wasm 체인을 생성한다", () => {
    const flags = normalizeRuntimeCapabilityFlags("apple-m-series", { webnnAvailable: false });
    const ort = buildOrtWebSessionOptions({ siliconId: "apple-m-series", flags, workloadId: "dialogue-emotion-viseme" });
    expect(ort.primaryProvider).toBe("webgpu");
    expect(ort.fallbackChain).toEqual(["webgpu", "wasm"]);
    expect(ort.sessionOptions.preferredOutputLocation).toBe("gpu-buffer");
  });

  it("WebNN·WebGPU 비활성 + Relaxed-SIMD 활성 시 wasm(simd: true) 단일 EP 체인을 생성한다", () => {
    const flags = normalizeRuntimeCapabilityFlags("amd-ryzen-ai", { webnnAvailable: false, webgpuAvailable: false, wasmRelaxedSimdAvailable: true });
    const ort = buildOrtWebSessionOptions({ siliconId: "amd-ryzen-ai", flags, workloadId: "continuity-drift-vision" });
    expect(ort.primaryProvider).toBe("wasm");
    expect(ort.fallbackChain).toEqual(["wasm"]);
    expect(ort.wasmEnvFlags.simd).toBe(true);
    expect(ort.wasmEnvFlags.relaxedSimd).toBe(true);
  });

  it("전면 폴백(Relaxed-SIMD 포함 비활성) 시 wasm EP의 simd/relaxedSimd가 false로 안전 강등된다", () => {
    const flags = normalizeRuntimeCapabilityFlags("galaxy-snapdragon", {
      webnnAvailable: false,
      webgpuAvailable: false,
      wasmRelaxedSimdAvailable: false,
    });
    const ort = buildOrtWebSessionOptions({ siliconId: "galaxy-snapdragon", flags, workloadId: "vrm-skinning-psd-clip" });
    expect(ort.primaryProvider).toBe("wasm");
    expect(ort.wasmEnvFlags.simd).toBe(false);
    expect(ort.wasmEnvFlags.relaxedSimd).toBe(false);
    expect(ort.sessionOptions.executionProviders[0]).toMatchObject({ name: "wasm", simd: false });
  });

  it("배터리 절전 모드 시 webnn/webgpu EP powerPreference가 low-power로 전환되고 그래프 최적화가 basic으로 완화된다", () => {
    const flags = normalizeRuntimeCapabilityFlags("intel-core-ultra", { batterySaverMode: true });
    const ort = buildOrtWebSessionOptions({ siliconId: "intel-core-ultra", flags, workloadId: "face-eye-protection" });
    expect(ort.sessionOptions.executionProviders[0]).toMatchObject({ name: "webnn", powerPreference: "low-power" });
    expect(ort.sessionOptions.executionProviders[1]).toMatchObject({ name: "webgpu", powerPreference: "low-power" });
    expect(ort.sessionOptions.graphOptimizationLevel).toBe("basic");
    expect(ort.sessionOptions.executionMode).toBe("sequential");
  });

  it("exportHeterogeneousManifestJson은 스키마 버전·6대 워크로드 ORT EP·정직성 고지가 포함된 유효한 JSON을 반환한다", () => {
    const schedule = scheduleHeterogeneousWorkloads({ siliconId: "galaxy-exynos" });
    const directManifest = buildHeterogeneousRuntimeManifest(schedule);
    const { json, manifest } = exportHeterogeneousManifestJson(schedule);
    expect(manifest).toEqual(directManifest);
    const parsed = JSON.parse(json) as { schemaVersion: string; siliconId: string; assignments: unknown[]; honestyDisclosureKo: string };
    expect(parsed.schemaVersion).toBe("toonstudio.heterogeneous-silicon-router-manifest.v1");
    expect(parsed.siliconId).toBe("galaxy-exynos");
    expect(parsed.assignments).toHaveLength(6);
    expect(parsed.honestyDisclosureKo).toBe(HONESTY_DISCLOSURE_KO);
  });
});

describe("5. StudioHeterogeneousSiliconPanel UI · 순수 시맨틱 SVG · 로케일 인터랙션", () => {
  it("props 없이 기본 렌더 시 5대 실리콘 카드, 6개 토글, 3레인 SVG, 6대 워크로드 표, ORT EP 미리보기를 표시한다", () => {
    render(<StudioHeterogeneousSiliconPanel />);
    expect(screen.getByTestId("studio-heterogeneous-silicon-panel")).toBeTruthy();
    for (const profile of SILICON_DEVICE_PROFILES) {
      expect(screen.getByTestId(`silicon-card-${profile.id}`)).toBeTruthy();
    }
    const svg = screen.getByTestId("heterogeneous-three-lane-svg");
    expect(svg.getAttribute("data-silicon-id")).toBe("apple-m-series");
    expect(svg.getAttribute("data-npu-count")).toBe("3");
    expect(svg.getAttribute("data-webgpu-count")).toBe("1");
    expect(svg.getAttribute("data-wasm-count")).toBe("2");
    expect(screen.getByTestId("architecture-plan-disclosure").textContent).toContain("아키텍처 분산 계획 모델");
    expect(screen.getByTestId("ort-ep-preview").textContent).toContain('"name": "webnn"');
  });

  it("5대 실리콘 카드 클릭 시 활성 실리콘과 SVG가 즉시 바뀌고 onScheduleChange 콜백이 호출된다", () => {
    const onScheduleChange = vi.fn();
    render(<StudioHeterogeneousSiliconPanel onScheduleChange={onScheduleChange} />);

    fireEvent.click(screen.getByTestId("silicon-card-amd-ryzen-ai"));
    expect(screen.getByTestId("heterogeneous-three-lane-svg").getAttribute("data-silicon-id")).toBe("amd-ryzen-ai");
    expect(screen.getByTestId("active-silicon-note").textContent).toContain("XDNA");

    fireEvent.click(screen.getByTestId("silicon-card-galaxy-snapdragon"));
    expect(screen.getByTestId("heterogeneous-three-lane-svg").getAttribute("data-silicon-id")).toBe("galaxy-snapdragon");
    expect(screen.getByTestId("toggle-webgpuSubgroupsAvailable").getAttribute("aria-checked")).toBe("false");
    expect(onScheduleChange).toHaveBeenCalledTimes(2);
  });

  it("WebNN · WebGPU · WASM Relaxed-SIMD 스위치를 순서대로 끄면 SVG 3레인 카운트가 4단 폴백대로 이동한다", () => {
    render(<StudioHeterogeneousSiliconPanel initialSiliconId="intel-core-ultra" />);
    const svg = screen.getByTestId("heterogeneous-three-lane-svg");

    fireEvent.click(screen.getByTestId("toggle-webnnAvailable"));
    expect(screen.getByTestId("toggle-webnnAvailable").getAttribute("aria-checked")).toBe("false");
    expect(svg.getAttribute("data-npu-count")).toBe("0");
    expect(svg.getAttribute("data-webgpu-count")).toBe("4");
    expect(screen.getByTestId("workload-row-face-eye-protection").getAttribute("data-resolved-tier")).toBe("webgpu-f16");

    fireEvent.click(screen.getByTestId("toggle-webgpuAvailable"));
    expect(svg.getAttribute("data-webgpu-count")).toBe("0");
    expect(svg.getAttribute("data-wasm-count")).toBe("6");
    expect(screen.getByTestId("workload-row-brush-km7-impasto-bvh").getAttribute("data-resolved-tier")).toBe("wasm-relaxed-simd128");

    fireEvent.click(screen.getByTestId("toggle-wasmRelaxedSimdAvailable"));
    expect(screen.getByTestId("workload-row-vrm-skinning-psd-clip").getAttribute("data-resolved-tier")).toBe("wasm-scalar");
  });

  it("워크로드 선택 버튼 클릭 시 ONNX Runtime Web EP 미리보기가 해당 워크로드 설정으로 갱신된다", () => {
    render(<StudioHeterogeneousSiliconPanel />);
    fireEvent.click(screen.getByTestId("ort-workload-btn-brush-km7-impasto-bvh"));
    expect(screen.getByTestId("ort-ep-preview").textContent).toContain('"workloadId": "brush-km7-impasto-bvh"');
    expect(screen.getByTestId("ort-ep-preview").textContent).toContain('"primaryProvider": "webgpu"');

    fireEvent.click(screen.getByTestId("ort-workload-btn-rhythm-offline-crdt"));
    expect(screen.getByTestId("ort-ep-preview").textContent).toContain('"primaryProvider": "wasm"');
  });

  it("JSON 매니페스트 복사/내보내기 버튼이 onExportJson을 호출하고 미리보기 토글 및 초기값 복원이 동작한다", () => {
    const onExportJson = vi.fn();
    render(<StudioHeterogeneousSiliconPanel initialSiliconId="apple-m-series" onExportJson={onExportJson} />);

    expect(screen.queryByTestId("manifest-json-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("export-manifest-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    const [jsonArg, manifestArg] = onExportJson.mock.calls[0] as [string, { schemaVersion: string }];
    expect(jsonArg).toContain("toonstudio.heterogeneous-silicon-router-manifest.v1");
    expect(manifestArg.schemaVersion).toBe("toonstudio.heterogeneous-silicon-router-manifest.v1");
    expect(screen.getByTestId("manifest-json-preview").textContent).toContain("apple-m-series");

    fireEvent.click(screen.getByTestId("toggle-manifest-preview-btn"));
    expect(screen.queryByTestId("manifest-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("silicon-card-galaxy-exynos"));
    expect(screen.getByTestId("heterogeneous-three-lane-svg").getAttribute("data-silicon-id")).toBe("galaxy-exynos");
    fireEvent.click(screen.getByTestId("reset-silicon-router-btn"));
    expect(screen.getByTestId("heterogeneous-three-lane-svg").getAttribute("data-silicon-id")).toBe("apple-m-series");
  });

  it("배터리 절전 토글과 ORT EP 복사 버튼이 상태 알림(aria-live)과 EP 옵션을 갱신한다", () => {
    render(<StudioHeterogeneousSiliconPanel />);
    fireEvent.click(screen.getByTestId("toggle-batterySaverMode"));
    expect(screen.getByTestId("toggle-batterySaverMode").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("ort-ep-preview").textContent).toContain('"powerPreference": "low-power"');

    fireEvent.click(screen.getByTestId("copy-ort-ep-btn"));
    expect(screen.getByTestId("router-status-message").textContent).toContain("ONNX Runtime Web EP");
  });

  it("영문 로케일(locale='en')이 헤더·SVG·정직성 고지·테이블에 일관되게 반영된다", () => {
    render(<StudioHeterogeneousSiliconPanel locale="en" initialSiliconId="intel-core-ultra" />);
    expect(screen.getByTestId("heterogeneous-three-lane-svg").textContent).toContain("3-LANE HETEROGENEOUS PIPELINE");
    expect(screen.getByTestId("architecture-plan-disclosure").textContent).toContain("Architecture Distribution Plan Model");
    expect(screen.getByTestId("workload-routing-table").textContent).toContain("1. Face & Eye Protection Masking");
  });

  it("렌더된 패널의 모든 버튼이 min-h-11 터치 타깃을 충족한다", () => {
    const { container } = render(<StudioHeterogeneousSiliconPanel />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThanOrEqual(20);
    for (const button of buttons) {
      expect(button.className).toContain("min-h-11");
    }
  });
});

describe("6. 엄격 품질·하네스 계약 자가 감사", () => {
  it("소유 4개 파일 줄 수 제한(engine<=750, panel<=700, 전체<=800) 및 금지 패턴 0건을 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const expectedFiles = [
      "heterogeneous-npu-engine.ts",
      "StudioHeterogeneousSiliconPanel.tsx",
      "index.ts",
      "heterogeneous-npu.test.tsx",
    ];
    for (const file of expectedFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }
    const actualFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(actualFiles.sort()).toEqual([...expectedFiles].sort());

    for (const file of actualFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "heterogeneous-npu-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioHeterogeneousSiliconPanel.tsx") expect(lines).toBeLessThanOrEqual(700);

      if (file !== "heterogeneous-npu.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("Sparkles");
        expect(src).not.toContain("하는 것을 가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공합니다");
        expect(src).not.toContain("원활한 워크플로우를 보장합니다");
      }

      if (file === "StudioHeterogeneousSiliconPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("패널 내 모든 oklch() 색상이 바이올렛 휴 대역(270~320도)을 0% 배제한다", () => {
    const panelSrc = readFileSync(
      path.resolve(import.meta.dirname, "StudioHeterogeneousSiliconPanel.tsx"),
      "utf8",
    );
    const matches = [...panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s*\)/gu)];
    expect(matches.length).toBeGreaterThanOrEqual(5);
    for (const match of matches) {
      const hue = Number(match[1]);
      expect(hue < 270 || hue > 320).toBe(true);
    }
  });

  it("index.ts 공개 배럴이 엔진 핵심 심볼과 StudioHeterogeneousSiliconPanel을 누락 없이 재수출한다", () => {
    expect(BarrelExports.SILICON_DEVICE_PROFILES).toBe(SILICON_DEVICE_PROFILES);
    expect(BarrelExports.TOONSTUDIO_HETEROGENEOUS_WORKLOADS).toBe(TOONSTUDIO_HETEROGENEOUS_WORKLOADS);
    expect(BarrelExports.scheduleHeterogeneousWorkloads).toBe(scheduleHeterogeneousWorkloads);
    expect(BarrelExports.buildOrtWebSessionOptions).toBe(buildOrtWebSessionOptions);
    expect(BarrelExports.exportHeterogeneousManifestJson).toBe(exportHeterogeneousManifestJson);
    expect(BarrelExports.StudioHeterogeneousSiliconPanel).toBe(StudioHeterogeneousSiliconPanel);
  });
});
