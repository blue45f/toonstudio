// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AMBIENT_THERMAL_LEVELS,
  COMPUTE_PRESSURE_STATES,
  DEGRADATION_LADDER_SPECS,
  PID_SIMULATION_STEP_COUNT,
  POWER_SOURCE_MODES,
  QUANTIZATION_MODES,
  SILICON_NPU_TARGETS,
  StudioWebNnNpuThermalPanel,
  WEBNN_NPU_THERMAL_MEASUREMENT_BASIS,
  WEBNN_NPU_THERMAL_MODEL_KIND,
  WEBNN_NPU_THERMAL_SCHEMA_VERSION,
  WEBTOON_AI_WORKLOADS,
  buildWebNnNpuThermalPlan,
  compileWebNnSiliconGraph,
  exportWebNnThermalPlanJson,
  formatOklch,
  getSiliconNpuTarget,
  getWebtoonAiWorkload,
  isVioletSlopHue,
  sanitizeNonVioletHue,
  simulateThermalPidControlLoop,
  type SiliconNpuTargetId,
  type WebtoonAiWorkloadId,
} from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function assertZeroVioletAndRawColors(svgMarkup: string): void {
  expect(svgMarkup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  expect(svgMarkup).not.toMatch(/\brgba?\s*\(/iu);
  expect(svgMarkup).not.toMatch(/\bhsla?\s*\(/iu);
  for (const match of svgMarkup.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
    expect(isVioletSlopHue(Number(match[1]))).toBe(false);
  }
}

describe("1. 5대 실리콘 NPU · 5대 웹툰 AI 워크로드 카탈로그 & 탈-바이올렛 OKLCH", () => {
  it("5대 실리콘 NPU 아키텍처 ID와 실행 공급자(EP)·타일 구조를 정확히 포함한다", () => {
    expect(SILICON_NPU_TARGETS.map((t) => t.id)).toEqual([
      "apple-ane-coreml",
      "intel-core-ultra-npu",
      "amd-ryzen-ai-xdna2",
      "qualcomm-hexagon-htp",
      "samsung-exynos-npu",
    ]);
    expect(getSiliconNpuTarget("apple-ane-coreml").executionProvider).toBe("CoreML EP");
    expect(getSiliconNpuTarget("intel-core-ultra-npu").staticShapePaddingRequired).toBe(true);
    expect(getSiliconNpuTarget("intel-core-ultra-npu").shapeTileAlignment).toBe(64);
    expect(getSiliconNpuTarget("amd-ryzen-ai-xdna2").spatialTileGrid).toMatchObject({ rows: 4, cols: 8, totalTiles: 32 });
    expect(getSiliconNpuTarget("qualcomm-hexagon-htp").executionProvider).toBe("QNN EP");
    expect(getSiliconNpuTarget("samsung-exynos-npu").executionProvider).toContain("NNAPI");
  });

  it("5대 웹툰 AI 추론 워크로드 ID와 유효한 4D 입력 Shape·융합 패턴을 제공한다", () => {
    expect(WEBTOON_AI_WORKLOADS.map((w) => w.id)).toEqual([
      "lineart-cleanup-vector",
      "flat-color-segmentation",
      "normal-depth-relight",
      "character-consistency-embed",
      "stroke-trajectory-denoise",
    ]);
    for (const wl of WEBTOON_AI_WORKLOADS) {
      expect(wl.inputShape).toHaveLength(4);
      expect(wl.rawOpCount).toBeGreaterThanOrEqual(20);
      expect(wl.fusionPatterns.length).toBeGreaterThanOrEqual(3);
      expect(wl.maxAllowedAccuracyLossPct).toBeGreaterThan(0);
    }
  });

  it("4단 그레이스풀 강등 사다리와 제어 열거 상수가 단조 증가 임계치로 정의되어 있다", () => {
    expect(DEGRADATION_LADDER_SPECS).toHaveLength(5);
    expect(COMPUTE_PRESSURE_STATES).toEqual(["nominal", "fair", "serious", "critical"]);
    expect(QUANTIZATION_MODES).toEqual(["auto", "fp16", "int8", "int4"]);
    expect(POWER_SOURCE_MODES).toHaveLength(3);
    expect(AMBIENT_THERMAL_LEVELS).toHaveLength(3);
    for (let i = 1; i < DEGRADATION_LADDER_SPECS.length; i += 1) {
      expect(DEGRADATION_LADDER_SPECS[i].controlThreshold01).toBeGreaterThan(DEGRADATION_LADDER_SPECS[i - 1].controlThreshold01);
      expect(DEGRADATION_LADDER_SPECS[i].heatMultiplier).toBeLessThan(DEGRADATION_LADDER_SPECS[i - 1].heatMultiplier);
    }
  });

  it("실리콘·워크로드 조회 헬퍼가 미등록 ID에 대해 안전하게 기본값으로 폴백한다", () => {
    expect(getSiliconNpuTarget("unknown-chip" as SiliconNpuTargetId).id).toBe("apple-ane-coreml");
    expect(getWebtoonAiWorkload("unknown-model" as WebtoonAiWorkloadId).id).toBe("lineart-cleanup-vector");
  });

  it("isVioletSlopHue와 sanitizeNonVioletHue가 270~320° 바이올렛 휴를 100% 배제한다", () => {
    expect(isVioletSlopHue(270)).toBe(true);
    expect(isVioletSlopHue(295)).toBe(true);
    expect(isVioletSlopHue(320)).toBe(true);
    expect(isVioletSlopHue(185)).toBe(false);
    expect(isVioletSlopHue(228)).toBe(false);
    for (let h = 270; h <= 320; h += 5) {
      expect(isVioletSlopHue(sanitizeNonVioletHue(h))).toBe(false);
    }
  });

  it("formatOklch가 원시 색 없이 탈-바이올렛 OKLCH 문자열을 생성하고 모든 프로파일 색상이 안전하다", () => {
    expect(formatOklch({ l: 0.56, c: 0.14, h: 185 })).toBe("oklch(0.56 0.14 185)");
    expect(formatOklch({ l: 0.54, c: 0.14, h: 290 }, 0.5)).toBe("oklch(0.54 0.14 248 / 0.50)");
    for (const target of SILICON_NPU_TARGETS) expect(isVioletSlopHue(target.accentOklch.h)).toBe(false);
    for (const wl of WEBTOON_AI_WORKLOADS) expect(isVioletSlopHue(wl.accentOklch.h)).toBe(false);
  });

  it("모델 정직성 메타데이터(modelKind)를 명시하고 허위 TOPS·실기기 °C 주장을 포함하지 않는다", () => {
    const { plan, json } = exportWebNnThermalPlanJson();
    expect(plan.modelKind).toBe(WEBNN_NPU_THERMAL_MODEL_KIND);
    expect(plan.modelKind).toBe("silicon-graph-compiler-and-pid-thermal-model");
    expect(plan.measurementBasis).toBe(WEBNN_NPU_THERMAL_MEASUREMENT_BASIS);
    expect(json).not.toMatch(/\b\d+\s*TOPS\b/iu);
    expect(json).not.toMatch(/°C/u);
    expect(plan.honestyNoticeKo).toContain("thermalHeadroom01");
  });
});

describe("2. 실리콘 맞춤형 WebNN NPU 그래프 컴파일러 (compileWebNnSiliconGraph)", () => {
  it("5대 실리콘 × 5대 워크로드 25조합 모두 연산자 융합으로 연산 수와 메모리 왕복을 줄인다", () => {
    for (const target of SILICON_NPU_TARGETS) {
      for (const wl of WEBTOON_AI_WORKLOADS) {
        const res = compileWebNnSiliconGraph({ siliconId: target.id, workloadId: wl.id });
        expect(res.modelKind).toBe(WEBNN_NPU_THERMAL_MODEL_KIND);
        expect(res.fusionPass.fusedOpCount).toBeLessThan(res.fusionPass.rawOpCount);
        expect(res.fusionPass.eliminatedOps).toBe(res.fusionPass.rawOpCount - res.fusionPass.fusedOpCount);
        expect(res.fusionPass.memoryRoundTripReductionPct).toBeGreaterThanOrEqual(22);
        expect(res.irNodes.length).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it("Intel Core Ultra NPU는 비정렬 입력에 64-정렬 정적 Shape 타일 패딩을 적용하고 Apple ANE는 패딩하지 않는다", () => {
    const intel = compileWebNnSiliconGraph({ siliconId: "intel-core-ultra-npu", workloadId: "normal-depth-relight" });
    const apple = compileWebNnSiliconGraph({ siliconId: "apple-ane-coreml", workloadId: "normal-depth-relight" });
    expect(intel.fusionPass.staticShapePaddingApplied).toBe(true);
    expect(intel.fusionPass.originalShape).toEqual([1, 3, 360, 360]);
    expect(intel.fusionPass.compiledShape).toEqual([1, 3, 384, 384]);
    expect(intel.fusionPass.paddingOverheadPct).toBeGreaterThan(0);

    expect(apple.fusionPass.staticShapePaddingApplied).toBe(false);
    expect(apple.fusionPass.compiledShape).toEqual([1, 3, 360, 360]);
    expect(apple.fusionPass.paddingOverheadPct).toBe(0);
  });

  it("Intel NPU에서 1D 스트로크 궤적([1,6,96,1])의 길이 축도 64-정렬([1,6,128,1])로 패딩된다", () => {
    const intelStroke = compileWebNnSiliconGraph({ siliconId: "intel-core-ultra-npu", workloadId: "stroke-trajectory-denoise" });
    expect(intelStroke.fusionPass.staticShapePaddingApplied).toBe(true);
    expect(intelStroke.fusionPass.compiledShape).toEqual([1, 6, 128, 1]);
  });

  it("AMD Ryzen AI XDNA2는 Block-FP16+INT4 포맷과 4×8 공간 타일 배열 메타데이터를 컴파일한다", () => {
    const amd = compileWebNnSiliconGraph({ siliconId: "amd-ryzen-ai-xdna2", workloadId: "flat-color-segmentation" });
    expect(amd.quantizationPass.effectiveFormat).toBe("block-fp16-int4");
    expect(amd.siliconTarget.spatialTileGrid.totalTiles).toBe(32);
    expect(amd.fusionPass.fusedBlocks[0]?.siliconPassTag).toContain("4x8");
  });

  it("민감한 2D→3D 노멀/깊이맵 워크로드에서 Qualcomm Auto 모드는 혼합 정밀도 정확도 가드를 자동 적용한다", () => {
    const autoQnn = compileWebNnSiliconGraph({
      siliconId: "qualcomm-hexagon-htp",
      workloadId: "normal-depth-relight",
      quantizationMode: "auto",
    });
    expect(autoQnn.quantizationPass.mixedPrecisionGuardApplied).toBe(true);
    expect(autoQnn.quantizationPass.withinAccuracyBudget).toBe(true);
    expect(autoQnn.quantizationPass.effectiveFormat).toBe("int8-fp16-mixed");

    const forcedInt4 = compileWebNnSiliconGraph({
      siliconId: "qualcomm-hexagon-htp",
      workloadId: "normal-depth-relight",
      quantizationMode: "int4",
    });
    expect(forcedInt4.quantizationPass.effectiveFormat).toBe("w4a8-int4");
    expect(forcedInt4.quantizationPass.withinAccuracyBudget).toBe(false);
    expect(forcedInt4.quantizationPass.estimatedAccuracyLossPct).toBeGreaterThan(forcedInt4.quantizationPass.maxAllowedAccuracyLossPct);
  });

  it("Apple ANE FP16·INT8·INT4(4-bit Palettized) 양자화 전환이 가중치 압축률과 추론 시간을 단조 개선한다", () => {
    const fp16 = compileWebNnSiliconGraph({ siliconId: "apple-ane-coreml", workloadId: "lineart-cleanup-vector", quantizationMode: "fp16" });
    const int8 = compileWebNnSiliconGraph({ siliconId: "apple-ane-coreml", workloadId: "lineart-cleanup-vector", quantizationMode: "int8" });
    const int4 = compileWebNnSiliconGraph({ siliconId: "apple-ane-coreml", workloadId: "lineart-cleanup-vector", quantizationMode: "int4" });

    expect(fp16.quantizationPass.effectiveFormat).toBe("fp16");
    expect(int8.quantizationPass.effectiveFormat).toBe("int8");
    expect(int4.quantizationPass.effectiveFormat).toBe("int4-palettized");
    expect(int4.quantizationPass.weightCompressionRatio).toBeGreaterThan(int8.quantizationPass.weightCompressionRatio);
    expect(int8.quantizationPass.weightCompressionRatio).toBeGreaterThan(fp16.quantizationPass.weightCompressionRatio);
    expect(int4.modeledInferenceMs).toBeLessThan(fp16.modeledInferenceMs);
  });

  it("WebGPU↔WebNN MLTensor Zero-Copy 경로는 Apple/Intel/AMD/Qualcomm에서 Readback 0회, Exynos NNAPI는 Fallback 2회로 판별한다", () => {
    for (const id of ["apple-ane-coreml", "intel-core-ultra-npu", "amd-ryzen-ai-xdna2", "qualcomm-hexagon-htp"] as const) {
      const res = compileWebNnSiliconGraph({ siliconId: id, zeroCopyMlTensorEnabled: true });
      expect(res.zeroCopyPass.zeroCopyActive).toBe(true);
      expect(res.zeroCopyPass.cpuReadbackCount).toBe(0);
      expect(res.zeroCopyPass.copyOverheadMs).toBe(0);
    }
    const exynos = compileWebNnSiliconGraph({ siliconId: "samsung-exynos-npu", zeroCopyMlTensorEnabled: true });
    expect(exynos.zeroCopyPass.zeroCopyActive).toBe(false);
    expect(exynos.zeroCopyPass.cpuReadbackCount).toBe(2);
    expect(exynos.zeroCopyPass.copyOverheadMs).toBeGreaterThan(0);
  });

  it("zeroCopyMlTensorEnabled=false로 끄면 Apple ANE도 CPU Readback 2회 폴백과 복사 지연이 발생한다", () => {
    const zcOn = compileWebNnSiliconGraph({ siliconId: "apple-ane-coreml", zeroCopyMlTensorEnabled: true });
    const zcOff = compileWebNnSiliconGraph({ siliconId: "apple-ane-coreml", zeroCopyMlTensorEnabled: false });
    expect(zcOff.zeroCopyPass.zeroCopyActive).toBe(false);
    expect(zcOff.zeroCopyPass.cpuReadbackCount).toBe(2);
    expect(zcOff.zeroCopyPass.copyOverheadMs).toBeGreaterThan(0);
    expect(zcOff.modeledInferenceMs).toBeGreaterThan(zcOn.modeledInferenceMs);
  });

  it("펜 호버 투기적 NPU 워밍업이 켜지면 첫 스트로크 지연 절감량과 4단계 예열 스케줄을 산출한다", () => {
    const warmOn = compileWebNnSiliconGraph({ siliconId: "apple-ane-coreml", workloadId: "stroke-trajectory-denoise", penHoverWarmupEnabled: true });
    const warmOff = compileWebNnSiliconGraph({ siliconId: "apple-ane-coreml", workloadId: "stroke-trajectory-denoise", penHoverWarmupEnabled: false });
    expect(warmOn.hoverWarmupPass.triggerEvent).toBe("pointermove-stylus-hover");
    expect(warmOn.hoverWarmupPass.phases).toHaveLength(4);
    expect(warmOn.hoverWarmupPass.firstStrokeLatencySavedMs).toBeGreaterThan(10);
    expect(warmOn.hoverWarmupPass.warmStartLatencyMs).toBeLessThan(warmOn.hoverWarmupPass.coldStartLatencyMs);
    expect(warmOff.hoverWarmupPass.firstStrokeLatencySavedMs).toBe(0);
    expect(warmOff.hoverWarmupPass.warmStartLatencyMs).toBe(warmOff.hoverWarmupPass.coldStartLatencyMs);
  });

  it("PID 강등 단계 오버라이드(Tier 2·Tier 4)가 MLContextOptions 전력 선호도와 장치 폴백에 반영된다", () => {
    const tier0 = compileWebNnSiliconGraph({ siliconId: "apple-ane-coreml", thermalOverrideTier: 0, targetFrameRateHz: 120 });
    const tier2 = compileWebNnSiliconGraph({ siliconId: "apple-ane-coreml", thermalOverrideTier: 2, targetFrameRateHz: 120 });
    const tier4 = compileWebNnSiliconGraph({ siliconId: "apple-ane-coreml", thermalOverrideTier: 4, targetFrameRateHz: 120 });
    expect(tier0.mlContextOptions).toMatchObject({ deviceType: "npu", powerPreference: "high-performance" });
    expect(tier2.mlContextOptions).toMatchObject({ deviceType: "npu", powerPreference: "low-power" });
    expect(tier4.mlContextOptions).toMatchObject({ deviceType: "gpu", powerPreference: "low-power" });
  });
});

describe("3. 폐루프 이산 시간 PID + Anti-Windup 적응형 열 제어기 (simulateThermalPidControlLoop)", () => {
  it("정확히 60스텝 열 궤적과 유효한 정규화 열 지수(0..100)·thermalHeadroom01(0..1)을 생성한다", () => {
    const sim = simulateThermalPidControlLoop({ siliconId: "apple-ane-coreml", sustainedMinutes: 30 });
    expect(sim.stepCount).toBe(PID_SIMULATION_STEP_COUNT);
    expect(sim.trajectory).toHaveLength(60);
    expect(sim.trajectory[0]?.step).toBe(1);
    expect(sim.trajectory[59]?.step).toBe(60);
    expect(sim.trajectory[59]?.elapsedMinutes).toBeCloseTo(30, 1);
    for (const pt of sim.trajectory) {
      expect(pt.pidThermalIndex).toBeGreaterThanOrEqual(0);
      expect(pt.pidThermalIndex).toBeLessThanOrEqual(100);
      expect(pt.pidThermalHeadroom01).toBeGreaterThanOrEqual(0);
      expect(pt.pidThermalHeadroom01).toBeLessThanOrEqual(1);
      expect(pt.controlEffort01).toBeGreaterThanOrEqual(0);
      expect(pt.controlEffort01).toBeLessThanOrEqual(1);
    }
  });

  it("고부하 연속 작업에서 미제어 기준선은 15fps 서멀 클리프에 추락하지만 PID 루프는 클리프를 차단하고 프레임을 방어한다", () => {
    const stress = simulateThermalPidControlLoop({
      siliconId: "qualcomm-hexagon-htp",
      workloadId: "normal-depth-relight",
      ambientLoadLevel: "warm",
      pressureState: "serious",
      sustainedMinutes: 45,
      targetFrameRateHz: 120,
    });
    expect(stress.uncontrolledCliffSteps).toBeGreaterThan(0);
    expect(stress.minUncontrolledEffectiveFps).toBe(15);
    expect(stress.pidCliffAvoided).toBe(true);
    expect(stress.minPidEffectiveFps).toBeGreaterThanOrEqual(72);
    expect(stress.peakPidThermalIndex).toBeLessThan(stress.cliffThresholdIndex);
    expect(stress.maxDegradationTier).toBeGreaterThanOrEqual(2);
  });

  it("5대 실리콘 최악 스트레스(warm·critical·battery-saver·60분·120Hz)에서도 PID가 서멀 클리프를 모두 회피한다", () => {
    for (const target of SILICON_NPU_TARGETS) {
      const worst = simulateThermalPidControlLoop({
        siliconId: target.id,
        workloadId: "normal-depth-relight",
        quantizationMode: "fp16",
        zeroCopyMlTensorEnabled: false,
        ambientLoadLevel: "warm",
        batteryMode: "battery-saver",
        pressureState: "critical",
        sustainedMinutes: 60,
        targetFrameRateHz: 120,
      });
      expect(worst.pidCliffAvoided).toBe(true);
      expect(worst.peakPidThermalIndex).toBeLessThan(worst.cliffThresholdIndex);
      expect(worst.minPidEffectiveFps).toBeGreaterThanOrEqual(72);
      expect(worst.finalThermalHeadroom01).toBeGreaterThan(0.15);
    }
  });

  it("모바일 엄격 열 봉투(Qualcomm Hexagon)가 Apple ANE보다 낮은 설정점을 갖고 더 이른 강등 단계를 발동한다", () => {
    const apple = simulateThermalPidControlLoop({ siliconId: "apple-ane-coreml", workloadId: "flat-color-segmentation", sustainedMinutes: 40 });
    const qnn = simulateThermalPidControlLoop({ siliconId: "qualcomm-hexagon-htp", workloadId: "flat-color-segmentation", sustainedMinutes: 40 });
    expect(qnn.setpointThermalIndex).toBeLessThan(apple.setpointThermalIndex);
    expect(qnn.maxDegradationTier).toBeGreaterThanOrEqual(apple.maxDegradationTier);
  });

  it("Compute Pressure(nominal→fair→serious→critical) 악화 시 강등 하한과 최대 강등 단계가 상승한다", () => {
    const nominal = simulateThermalPidControlLoop({ siliconId: "intel-core-ultra-npu", pressureState: "nominal", sustainedMinutes: 30 });
    const serious = simulateThermalPidControlLoop({ siliconId: "intel-core-ultra-npu", pressureState: "serious", sustainedMinutes: 30 });
    const critical = simulateThermalPidControlLoop({ siliconId: "intel-core-ultra-npu", pressureState: "critical", sustainedMinutes: 30 });
    expect(serious.maxDegradationTier).toBeGreaterThanOrEqual(nominal.maxDegradationTier);
    expect(critical.maxDegradationTier).toBeGreaterThanOrEqual(serious.maxDegradationTier);
    expect(critical.trajectory[0]?.degradationTier).toBeGreaterThanOrEqual(2);
  });

  it("배터리 절전 모드가 AC 전원 대비 열 설정점을 낮추고 주변 열 부하(warm)가 초기 열 지수를 높인다", () => {
    const ac = simulateThermalPidControlLoop({ batteryMode: "ac-plugged", ambientLoadLevel: "cool" });
    const saver = simulateThermalPidControlLoop({ batteryMode: "battery-saver", ambientLoadLevel: "warm" });
    expect(saver.setpointThermalIndex).toBeLessThan(ac.setpointThermalIndex);
    expect(saver.trajectory[0]?.pidThermalIndex).toBeGreaterThan(ac.trajectory[0]?.pidThermalIndex ?? 0);
  });

  it("Anti-Windup 클램핑이 모든 스텝에서 |integralState| <= integralClamp 불변식을 강제한다", () => {
    const sim = simulateThermalPidControlLoop({
      siliconId: "samsung-exynos-npu",
      workloadId: "normal-depth-relight",
      pressureState: "critical",
      sustainedMinutes: 60,
      pidGains: { kp: 0.08, ki: 0.05, kd: 0.02, integralClamp: 8 },
    });
    expect(sim.antiWindupClampCount).toBeGreaterThan(0);
    for (const pt of sim.trajectory) {
      expect(Math.abs(pt.integralState)).toBeLessThanOrEqual(8 + 1e-6);
    }
  });

  it("Zero-Copy 비활성화(CPU Readback 복사)가 동일 실리콘에서 미제어 피크 열 부하를 높인다", () => {
    const zcOn = simulateThermalPidControlLoop({ siliconId: "apple-ane-coreml", workloadId: "flat-color-segmentation", zeroCopyMlTensorEnabled: true, sustainedMinutes: 25 });
    const zcOff = simulateThermalPidControlLoop({ siliconId: "apple-ane-coreml", workloadId: "flat-color-segmentation", zeroCopyMlTensorEnabled: false, sustainedMinutes: 25 });
    expect(zcOff.peakUncontrolledThermalIndex).toBeGreaterThan(zcOn.peakUncontrolledThermalIndex);
  });

  it("연속 작업 시간(1~60분) 및 PID 게인의 비정상 입력이 안전 범위로 클램프된다", () => {
    const low = simulateThermalPidControlLoop({ sustainedMinutes: -50, pidGains: { kp: -2, integralClamp: 1 } });
    const high = simulateThermalPidControlLoop({ sustainedMinutes: 999, pidGains: { kp: 9, ki: 9, integralClamp: 500 } });
    expect(low.sustainedMinutes).toBe(1);
    expect(low.gains.kp).toBe(0.005);
    expect(low.gains.integralClamp).toBe(5);
    expect(high.sustainedMinutes).toBe(60);
    expect(high.gains.kp).toBe(0.25);
    expect(high.gains.integralClamp).toBe(60);
  });

  it("60Hz 목표 프레임률이 120Hz 대비 발열 부하를 낮추고 최저 PID FPS 바닥을 준수한다", () => {
    const hz60 = simulateThermalPidControlLoop({ siliconId: "amd-ryzen-ai-xdna2", workloadId: "lineart-cleanup-vector", targetFrameRateHz: 60 });
    const hz120 = simulateThermalPidControlLoop({ siliconId: "amd-ryzen-ai-xdna2", workloadId: "lineart-cleanup-vector", targetFrameRateHz: 120 });
    expect(hz60.peakUncontrolledThermalIndex).toBeLessThan(hz120.peakUncontrolledThermalIndex);
    expect(hz60.minPidEffectiveFps).toBeGreaterThanOrEqual(42);
    expect(hz60.minPidEffectiveFps).toBeLessThanOrEqual(60);
  });
});

describe("4. 통합 실행 계획 & JSON 매니페스트 내보내기", () => {
  it("exportWebNnThermalPlanJson이 MLContextOptions · 그래프 IR · PID 정책을 완전 직렬화한다", () => {
    const { plan, json } = exportWebNnThermalPlanJson({
      siliconId: "amd-ryzen-ai-xdna2",
      workloadId: "flat-color-segmentation",
      pressureState: "serious",
      sustainedMinutes: 45,
    });
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.schemaVersion).toBe(WEBNN_NPU_THERMAL_SCHEMA_VERSION);
    expect(parsed.modelKind).toBe(WEBNN_NPU_THERMAL_MODEL_KIND);
    expect(parsed.mlContextOptions).toEqual({ powerPreference: plan.compiledGraph.mlContextOptions.powerPreference, accelerated: true });
    expect(parsed.plannerHints).toEqual(plan.compiledGraph.mlContextOptions);
    expect(parsed).toHaveProperty("graphCompilerIr.fusionPass.fusedBlocks");
    expect(parsed).toHaveProperty("graphCompilerIr.zeroCopyMlTensor.cpuReadbackCount");
    expect(parsed).toHaveProperty("pidThermalPolicy.gains");
    expect(parsed).toHaveProperty("pidThermalPolicy.finalThermalHeadroom01");
  });

  it("동일 입력으로 반복 호출 시 완전히 결정론적인 JSON 문자열을 반환한다", () => {
    const input = { siliconId: "intel-core-ultra-npu" as const, workloadId: "normal-depth-relight" as const, sustainedMinutes: 35 };
    const a = exportWebNnThermalPlanJson(input);
    const b = exportWebNnThermalPlanJson(input);
    expect(a.json).toBe(b.json);
    expect(buildWebNnNpuThermalPlan(input)).toEqual(a.plan);
  });
});

describe("5. StudioWebNnNpuThermalPanel UI 상호작용 · 2단 SVG · 콜백", () => {
  it("props 없이 기본 렌더링되고 5대 실리콘 카드·5대 워크로드·2단 시맨틱 SVG를 표시한다", () => {
    render(<StudioWebNnNpuThermalPanel />);
    expect(screen.getByTestId("webnn-npu-thermal-panel")).toBeTruthy();
    for (const target of SILICON_NPU_TARGETS) {
      expect(screen.getByTestId(`silicon-card-${target.id}`)).toBeTruthy();
    }
    for (const wl of WEBTOON_AI_WORKLOADS) {
      expect(screen.getByTestId(`workload-btn-${wl.id}`)).toBeTruthy();
    }
    const pipelineSvg = screen.getByTestId("webnn-pipeline-svg");
    const pidSvg = screen.getByTestId("thermal-pid-curve-svg");
    expect(pipelineSvg.getAttribute("data-silicon-id")).toBe("apple-ane-coreml");
    expect(pipelineSvg.getAttribute("data-zero-copy")).toBe("true");
    expect(pidSvg.getAttribute("data-steps")).toBe("60");
  });

  it("Samsung Exynos NPU 선택 시 Fallback 복사(Readback 2회) 배지와 SVG 속성이 즉시 갱신된다", () => {
    const onPlanChange = vi.fn();
    render(<StudioWebNnNpuThermalPanel onPlanChange={onPlanChange} />);
    fireEvent.click(screen.getByTestId("silicon-card-samsung-exynos-npu"));
    expect(onPlanChange).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("webnn-pipeline-svg").getAttribute("data-silicon-id")).toBe("samsung-exynos-npu");
    expect(screen.getByTestId("webnn-pipeline-svg").getAttribute("data-zero-copy")).toBe("false");
    expect(screen.getByTestId("webnn-pipeline-svg").getAttribute("data-cpu-readback")).toBe("2");
    expect(screen.getByTestId("webnn-zero-copy-badge").textContent).toContain("Readback 2회");
  });

  it("워크로드와 양자화 모드(FP16/INT8/INT4) 전환 시 KPI와 정확도 가드 안내가 갱신된다", () => {
    render(<StudioWebNnNpuThermalPanel initialSiliconId="qualcomm-hexagon-htp" />);
    fireEvent.click(screen.getByTestId("workload-btn-normal-depth-relight"));
    expect(screen.getByTestId("kpi-quant-format").textContent).toContain("INT8/FP16 Mixed");
    fireEvent.click(screen.getByTestId("quant-btn-int4"));
    expect(screen.getByTestId("kpi-quant-format").textContent).toContain("INT4 W4A8");
    expect(screen.getByTestId("quant-guard-note").textContent).toContain("초과");
  });

  it("Zero-Copy MLTensor 스위치와 펜 호버 워밍업 스위치가 정상 토글된다", () => {
    render(<StudioWebNnNpuThermalPanel />);
    const zcSwitch = screen.getByTestId("zero-copy-switch");
    const warmSwitch = screen.getByTestId("hover-warmup-switch");
    expect(zcSwitch.getAttribute("aria-checked")).toBe("true");
    expect(warmSwitch.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(zcSwitch);
    expect(zcSwitch.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("webnn-pipeline-svg").getAttribute("data-cpu-readback")).toBe("2");

    fireEvent.click(warmSwitch);
    expect(warmSwitch.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("kpi-warmup-saved").textContent).toBe("-0 ms");
  });

  it("Compute Pressure·배터리·주변 열 부하·목표 Hz·연속 작업 슬라이더 변경이 PID 그래프에 반영된다", () => {
    render(<StudioWebNnNpuThermalPanel initialSiliconId="qualcomm-hexagon-htp" initialWorkloadId="normal-depth-relight" />);
    fireEvent.click(screen.getByTestId("pressure-btn-critical"));
    fireEvent.click(screen.getByTestId("battery-btn-battery-saver"));
    fireEvent.click(screen.getByTestId("ambient-btn-warm"));
    fireEvent.change(screen.getByTestId("sustained-minutes-slider"), { target: { value: "60" } });

    expect(screen.getByTestId("sustained-minutes-readout").textContent).toBe("60분");
    const pidSvg = screen.getByTestId("thermal-pid-curve-svg");
    expect(pidSvg.getAttribute("data-pressure")).toBe("critical");
    expect(pidSvg.getAttribute("data-cliff-avoided")).toBe("true");
    expect(Number(pidSvg.getAttribute("data-max-tier"))).toBeGreaterThanOrEqual(3);

    fireEvent.click(screen.getByTestId("hz-btn-60"));
    expect(screen.getByTestId("webnn-status-message").textContent).toContain("60Hz");
  });

  it("정책 JSON 복사·미리보기 토글·초기화 버튼과 onExportJson 콜백이 정상 동작한다", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const onExportJson = vi.fn();
    render(<StudioWebNnNpuThermalPanel onExportJson={onExportJson} />);
    expect(screen.queryByTestId("webnn-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("webnn-export-json-btn"));
    await waitFor(() => expect(onExportJson).toHaveBeenCalledTimes(1));
    expect(onExportJson.mock.calls[0]?.[0]).toContain("mlContextOptions");
    expect(screen.getByTestId("webnn-json-preview").textContent).toContain("pidThermalPolicy");

    fireEvent.click(screen.getByTestId("webnn-toggle-json-btn"));
    expect(screen.queryByTestId("webnn-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("silicon-card-amd-ryzen-ai-xdna2"));
    fireEvent.click(screen.getByTestId("webnn-reset-btn"));
    expect(screen.getByTestId("webnn-pipeline-svg").getAttribute("data-silicon-id")).toBe("apple-ane-coreml");
  });

  it("영문 로케일(locale='en')과 초기 실리콘·워크로드 props가 올바르게 렌더링된다", () => {
    render(<StudioWebNnNpuThermalPanel locale="en" initialSiliconId="amd-ryzen-ai-xdna2" initialWorkloadId="stroke-trajectory-denoise" />);
    expect(screen.getByTestId("webnn-pipeline-svg").getAttribute("data-silicon-id")).toBe("amd-ryzen-ai-xdna2");
    expect(screen.getByTestId("webnn-pipeline-svg").getAttribute("data-workload-id")).toBe("stroke-trajectory-denoise");
    expect(screen.getByTestId("webnn-zero-copy-badge").textContent).toContain("0 Readbacks");
    expect(screen.getByTestId("honesty-notice").textContent).toContain("thermalHeadroom01");
  });

  it("4단 그레이스풀 강등 사다리 항목(1~4단)이 모두 렌더되고 고압 조건에서 진입 스텝을 표시한다", () => {
    render(<StudioWebNnNpuThermalPanel initialSiliconId="qualcomm-hexagon-htp" initialWorkloadId="normal-depth-relight" />);
    fireEvent.click(screen.getByTestId("pressure-btn-critical"));
    fireEvent.change(screen.getByTestId("sustained-minutes-slider"), { target: { value: "60" } });
    for (const tier of [1, 2, 3, 4] as const) {
      expect(screen.getByTestId(`degradation-tier-${tier}`)).toBeTruthy();
    }
    expect(screen.getByTestId("degradation-tier-2").textContent).toContain("스텝 #");
  });
});

describe("6. 엄격 품질·하네스 계약 및 Calm Atelier 자가 검증", () => {
  it("소유 파일 7종 존재, 줄 수 상한(engine<=750, panel<=680, all<=800) 및 금지 패턴 0건", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "webnn-npu-thermal-engine.ts",
      "StudioWebNnNpuThermalPanel.tsx",
      "index.ts",
      "webnn-npu-thermal.test.tsx",
      "webnn-planner-boundaries.test.tsx",
      "webnn-planner-export.ts",
      "use-planner-operations.ts",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles.sort()).toEqual([...required].sort());

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "webnn-npu-thermal-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioWebNnNpuThermalPanel.tsx") expect(lines).toBeLessThanOrEqual(680);

      if (file !== "webnn-npu-thermal.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공");
        expect(src).not.toContain("원활한 워크플로우를 보장");
      }

      if (file === "StudioWebNnNpuThermalPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("렌더된 모든 버튼이 min-h-11을 준수하고 5대 실리콘 전체에서 2단 SVG 모두 원시 색·바이올렛 휴가 0건이다", () => {
    for (const target of SILICON_NPU_TARGETS) {
      const { container } = render(<StudioWebNnNpuThermalPanel initialSiliconId={target.id} />);
      const buttons = container.querySelectorAll("button");
      expect(buttons.length).toBeGreaterThanOrEqual(25);
      for (const btn of buttons) {
        expect(btn.className).toContain("min-h-11");
      }
      const svgs = container.querySelectorAll("svg");
      expect(svgs.length).toBeGreaterThanOrEqual(2);
      for (const svg of svgs) {
        assertZeroVioletAndRawColors(svg.outerHTML);
      }
      cleanup();
    }
  });
});
