// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CUSP_THRESHOLD_DEG,
  DIGITIZER_HARDWARE_PROFILES,
  MAX_LOOK_AHEAD_MS,
  MAX_PRESSURE_LEVEL_14BIT,
  MICRO_MLP_INFERENCE_KIND,
  MICRO_MLP_PARAMETER_COUNT,
  PRESSURE_CURVE_PRESETS,
  PRESSURE_LEVEL_COUNT_14BIT,
  STYLUS_COMPENSATION_SCHEMA_VERSION,
  StudioStylusNeuralCompensationPanel,
  auditPchipPressureCurve,
  benchmarkStrokeCompensation,
  clampNumber,
  compensateStylusStroke,
  computePchipTangents,
  createDefaultStylusCompensationConfig,
  evaluateDeterministicMicroMlp,
  evaluatePchipPressureCurve,
  exportStylusCompensationJson,
  formatOklch,
  generateSyntheticBenchmarkStroke,
  getDigitizerProfile,
  getPressureCurvePreset,
  isVioletHueDeg,
  normalizePchipControlPoints,
  roundDecimals,
  sanitizeNonVioletOklch,
  type DigitizerProfileId,
  type PressureCurvePresetId,
  type StylusRawSample,
} from "./index";

afterEach(cleanup);

const ALL_DIGITIZER_IDS: readonly DigitizerProfileId[] = [
  "wacom-pro-pen-3",
  "apple-pencil-pro",
  "galaxy-spen-emr",
  "huion-xppen-16k",
  "mouse-trackpad-pseudo",
];

const ALL_PRESET_IDS: readonly PressureCurvePresetId[] = [
  "gpen-crisp",
  "pencil-soft-tone",
  "ink-firm-line",
  "wrist-care-light",
  "linear-reference",
];

describe("1. 5종 디지타이저 물리 프로파일 · 5종 작가 프리셋 · OKLCH 탈-바이올렛 가드", () => {
  it("5종 디지타이저가 요구된 정확한 ID·사양(Wacom 1g/240Hz, Pencil Pro Roll+Tilt+Squeeze 등)으로 등록되어 있다", () => {
    expect(DIGITIZER_HARDWARE_PROFILES).toHaveLength(5);
    expect(DIGITIZER_HARDWARE_PROFILES.map((d) => d.id)).toEqual(ALL_DIGITIZER_IDS);

    const wacom = getDigitizerProfile("wacom-pro-pen-3");
    expect(wacom.pressureLevels).toBe(16384);
    expect(wacom.nativeHardwareLevels).toBe(8192);
    expect(wacom.reportRateHz).toBe(240);
    expect(wacom.iafGrams).toBe(1.0);

    const pencil = getDigitizerProfile("apple-pencil-pro");
    expect(pencil.supportsBarrelRoll).toBe(true);
    expect(pencil.supportsTilt).toBe(true);
    expect(pencil.supportsSqueeze).toBe(true);
    expect(pencil.reportRateHz).toBe(240);

    const spen = getDigitizerProfile("galaxy-spen-emr");
    expect(spen.pressureLevels).toBe(4096);
    expect(spen.reportRateHz).toBe(120);

    const huion = getDigitizerProfile("huion-xppen-16k");
    expect(huion.pressureLevels).toBe(16384);
    expect(huion.reportRateHz).toBe(266);

    const mouse = getDigitizerProfile("mouse-trackpad-pseudo");
    expect(mouse.supportsTilt).toBe(false);
    expect(mouse.nativeHardwareLevels).toBe(1);
  });

  it("5종 작가 압력 곡선 프리셋이 모두 5점 컨트롤 포인트와 (0,0)→(1,1) 엄격 단조 경계를 가진다", () => {
    expect(PRESSURE_CURVE_PRESETS).toHaveLength(5);
    expect(PRESSURE_CURVE_PRESETS.map((p) => p.id)).toEqual(ALL_PRESET_IDS);
    for (const preset of PRESSURE_CURVE_PRESETS) {
      expect(preset.controlPoints).toHaveLength(5);
      expect(preset.controlPoints[0]).toEqual({ x: 0, y: 0 });
      expect(preset.controlPoints[4]).toEqual({ x: 1, y: 1 });
      for (let i = 1; i < preset.controlPoints.length; i += 1) {
        expect(preset.controlPoints[i].x).toBeGreaterThan(preset.controlPoints[i - 1].x);
        expect(preset.controlPoints[i].y).toBeGreaterThanOrEqual(preset.controlPoints[i - 1].y);
      }
    }
  });

  it("createDefaultStylusCompensationConfig가 디지타이저와 프리셋 조합에 맞는 기본값을 생성한다", () => {
    const wacomGpen = createDefaultStylusCompensationConfig("wacom-pro-pen-3", "gpen-crisp");
    expect(wacomGpen.digitizerId).toBe("wacom-pro-pen-3");
    expect(wacomGpen.curvePresetId).toBe("gpen-crisp");
    expect(wacomGpen.cornerThresholdDeg).toBe(DEFAULT_CUSP_THRESHOLD_DEG);
    expect(wacomGpen.lookAheadMs).toBeGreaterThan(0);
    expect(wacomGpen.lookAheadMs).toBeLessThanOrEqual(MAX_LOOK_AHEAD_MS);

    const mouseLinear = createDefaultStylusCompensationConfig("mouse-trackpad-pseudo", "linear-reference");
    expect(mouseLinear.tiltAttenuationStrength).toBe(0);
    expect(mouseLinear.previewTiltDeg).toBe(0);
  });

  it("모든 디지타이저 OKLCH 강조색이 바이올렛 대역(270~320°)을 0% 배제하고 sanitizeNonVioletOklch가 방어한다", () => {
    for (const profile of DIGITIZER_HARDWARE_PROFILES) {
      expect(isVioletHueDeg(profile.accentOklch.h)).toBe(false);
    }
    expect(isVioletHueDeg(270)).toBe(true);
    expect(isVioletHueDeg(295)).toBe(true);
    expect(isVioletHueDeg(320)).toBe(true);
    expect(isVioletHueDeg(232)).toBe(false);

    const sanitized = sanitizeNonVioletOklch({ l: 0.6, c: 0.18, h: 292 });
    expect(isVioletHueDeg(sanitized.h)).toBe(false);
    expect(sanitized.h).toBe(232);
  });

  it("formatOklch가 알파 유무에 따라 유효한 OKLCH 문자열을 반환한다", () => {
    expect(formatOklch({ l: 0.52, c: 0.14, h: 228 })).toBe("oklch(0.52 0.14 228)");
    expect(formatOklch({ l: 0.52, c: 0.14, h: 228 }, 0.35)).toBe("oklch(0.52 0.14 228 / 0.35)");
  });

  it("clampNumber와 roundDecimals가 비정상 부동소수점(NaN·Infinity)을 안전하게 차단한다", () => {
    expect(clampNumber(Number.NaN, 0, 1)).toBe(0);
    expect(clampNumber(Number.POSITIVE_INFINITY, 0, 16)).toBe(0);
    expect(clampNumber(25, 0, 16)).toBe(16);
    expect(roundDecimals(3.1415926, 2)).toBe(3.14);
  });
});

describe("2. 16,384단계(14-bit) Fritsch-Carlson PCHIP 단조 압력 전달 곡선", () => {
  it("5종 프리셋 전체에 대해 0..16383 전 16,384단계 스윕 시 역전 0건·오버슈트 0건 엄격 단조 증가한다", () => {
    expect(PRESSURE_LEVEL_COUNT_14BIT).toBe(16384);
    expect(MAX_PRESSURE_LEVEL_14BIT).toBe(16383);

    for (const preset of PRESSURE_CURVE_PRESETS) {
      let prevOut = -1;
      let prevLevel = -1;
      for (let step = 0; step <= MAX_PRESSURE_LEVEL_14BIT; step += 1) {
        const res = evaluatePchipPressureCurve({
          rawPressure: step / MAX_PRESSURE_LEVEL_14BIT,
          controlPoints: preset.controlPoints,
          iafThreshold: 0.015,
          hysteresisAmount: 0.03,
          phase: "neutral",
          tiltDeg: 0,
          tiltAttenuationStrength: 0,
        });
        expect(res.normalizedOutput).toBeGreaterThanOrEqual(prevOut);
        expect(res.level14Bit).toBeGreaterThanOrEqual(prevLevel);
        expect(res.level14Bit).toBeGreaterThanOrEqual(0);
        expect(res.level14Bit).toBeLessThanOrEqual(MAX_PRESSURE_LEVEL_14BIT);
        prevOut = res.normalizedOutput;
        prevLevel = res.level14Bit;
      }
      expect(prevLevel).toBe(MAX_PRESSURE_LEVEL_14BIT);
    }
  });

  it("급격한 계단형 컨트롤 포인트와 비정렬 입력에도 PCHIP이 오버슈트 없이 [0,1] 단조성을 유지한다", () => {
    const steepPoints = normalizePchipControlPoints([
      { x: 1, y: 1 },
      { x: 0.45, y: 0.05 },
      { x: 0.55, y: 0.96 },
      { x: 0.72, y: 0.96 },
      { x: 0, y: 0 },
    ]);
    let prev = -1;
    for (let i = 0; i <= 512; i += 1) {
      const res = evaluatePchipPressureCurve({
        rawPressure: i / 512,
        controlPoints: steepPoints,
      });
      expect(res.curveOutput).toBeGreaterThanOrEqual(prev);
      expect(res.curveOutput).toBeGreaterThanOrEqual(0);
      expect(res.curveOutput).toBeLessThanOrEqual(1);
      prev = res.curveOutput;
    }
  });

  it("linear-reference 프리셋(IAF=0, 히스테리시스=0, 기울기=0°)은 14-bit 항등 사상(y=x)과 일치한다", () => {
    const linear = getPressureCurvePreset("linear-reference");
    for (const sample of [0, 0.25, 0.5, 0.75, 1]) {
      const res = evaluatePchipPressureCurve({
        rawPressure: sample,
        controlPoints: linear.controlPoints,
        iafThreshold: 0,
        hysteresisAmount: 0,
        tiltDeg: 0,
        tiltAttenuationStrength: 0,
      });
      expect(res.normalizedOutput).toBeCloseTo(sample, 5);
      expect(res.level14Bit).toBe(Math.round(sample * MAX_PRESSURE_LEVEL_14BIT));
    }
  });

  it("G펜 프리셋은 저필압에서 선형보다 가늘고, 손목 보호 프리셋은 70% 입력에서 90% 이상 출력을 낸다", () => {
    const gpen = getPressureCurvePreset("gpen-crisp");
    const wrist = getPressureCurvePreset("wrist-care-light");

    const gpenLow = evaluatePchipPressureCurve({ rawPressure: 0.28, controlPoints: gpen.controlPoints });
    expect(gpenLow.curveOutput).toBeLessThan(0.15);

    const wristMidHigh = evaluatePchipPressureCurve({ rawPressure: 0.7, controlPoints: wrist.controlPoints });
    expect(wristMidHigh.curveOutput).toBeGreaterThanOrEqual(0.9);
  });

  it("IAF 데드존 이하 필압은 정확히 0(level14Bit=0)을 출력하고 초과 즉시 부드럽게 시작한다", () => {
    const gpen = getPressureCurvePreset("gpen-crisp");
    const dead = evaluatePchipPressureCurve({
      rawPressure: 0.04,
      controlPoints: gpen.controlPoints,
      iafThreshold: 0.05,
    });
    expect(dead.inIafDeadzone).toBe(true);
    expect(dead.level14Bit).toBe(0);

    const active = evaluatePchipPressureCurve({
      rawPressure: 0.06,
      controlPoints: gpen.controlPoints,
      iafThreshold: 0.05,
    });
    expect(active.inIafDeadzone).toBe(false);
    expect(active.level14Bit).toBeGreaterThan(0);
  });

  it("가압(press) · 중립(neutral) · 감압(release) 히스테리시스가 끝점을 고정하고 중간 대역 밴드를 형성한다", () => {
    const ink = getPressureCurvePreset("ink-firm-line");
    const pressMid = evaluatePchipPressureCurve({
      rawPressure: 0.5,
      controlPoints: ink.controlPoints,
      hysteresisAmount: 0.06,
      phase: "press",
    });
    const neutralMid = evaluatePchipPressureCurve({
      rawPressure: 0.5,
      controlPoints: ink.controlPoints,
      hysteresisAmount: 0.06,
      phase: "neutral",
    });
    const releaseMid = evaluatePchipPressureCurve({
      rawPressure: 0.5,
      controlPoints: ink.controlPoints,
      hysteresisAmount: 0.06,
      phase: "release",
    });
    expect(pressMid.curveOutput).toBeLessThan(neutralMid.curveOutput);
    expect(neutralMid.curveOutput).toBeLessThan(releaseMid.curveOutput);

    // 최대 필압에서는 모든 위상이 1.0에 수렴
    const pressMax = evaluatePchipPressureCurve({
      rawPressure: 1,
      controlPoints: ink.controlPoints,
      hysteresisAmount: 0.06,
      phase: "press",
    });
    const releaseMax = evaluatePchipPressureCurve({
      rawPressure: 1,
      controlPoints: ink.controlPoints,
      hysteresisAmount: 0.06,
      phase: "release",
    });
    expect(pressMax.level14Bit).toBe(MAX_PRESSURE_LEVEL_14BIT);
    expect(releaseMax.level14Bit).toBe(MAX_PRESSURE_LEVEL_14BIT);
  });

  it("기울기 감쇠 cos(tilt)가 60°에서 정상 적용되며 기울기 미지원 장치는 감쇠를 적용하지 않는다", () => {
    const linear = getPressureCurvePreset("linear-reference");
    const vertical = evaluatePchipPressureCurve({
      rawPressure: 0.8,
      controlPoints: linear.controlPoints,
      tiltDeg: 0,
      tiltAttenuationStrength: 1.0,
      supportsTilt: true,
    });
    const tilted60 = evaluatePchipPressureCurve({
      rawPressure: 0.8,
      controlPoints: linear.controlPoints,
      tiltDeg: 60,
      tiltAttenuationStrength: 1.0,
      supportsTilt: true,
    });
    expect(vertical.tiltFactor).toBeCloseTo(1, 5);
    expect(tilted60.tiltFactor).toBeCloseTo(0.5, 4);
    expect(tilted60.normalizedOutput).toBeCloseTo(0.4, 4);

    const noTiltDevice = evaluatePchipPressureCurve({
      rawPressure: 0.8,
      controlPoints: linear.controlPoints,
      tiltDeg: 60,
      tiltAttenuationStrength: 1.0,
      supportsTilt: false,
    });
    expect(noTiltDevice.tiltFactor).toBe(1);
    expect(noTiltDevice.normalizedOutput).toBeCloseTo(0.8, 4);
  });

  it("auditPchipPressureCurve가 엄격 단조성, 0 오버슈트, 히스테리시스 피크 폭을 보고한다", () => {
    const cfg = createDefaultStylusCompensationConfig("apple-pencil-pro", "pencil-soft-tone");
    const audit = auditPchipPressureCurve(cfg, 65);
    expect(audit.samples).toHaveLength(65);
    expect(audit.isStrictlyMonotonic).toBe(true);
    expect(audit.inversionCount).toBe(0);
    expect(audit.maxOvershoot).toBe(0);
    expect(audit.hysteresisPeakDelta).toBeGreaterThan(0);
    expect(audit.tiltFactorAtPreviewDeg).toBeLessThan(1);
  });

  it("computePchipTangents가 평탄 구간(Δ_k = 0)에서 양끝 접선을 0으로 클램프한다", () => {
    const tangents = computePchipTangents([
      { x: 0, y: 0 },
      { x: 0.3, y: 0.5 },
      { x: 0.7, y: 0.5 },
      { x: 1, y: 1 },
    ]);
    expect(tangents[1]).toBe(0);
    expect(tangents[2]).toBe(0);
  });
});

describe("3. One-Euro 적응형 필터 · 결정론적 2-Layer Micro-MLP · 급꺾임(>55°) 및 삐침 보호기", () => {
  it("evaluateDeterministicMicroMlp가 deterministic-micro-mlp-cpu 표기와 결정론적 출력을 보장한다", () => {
    const input = {
      velocityPxPerSec: 900,
      accelPxPerSec2: 400,
      curvatureRadPerPx: 0.004,
      pressureRatePerSec: 0.1,
      angularVelocityRadPerSec: 0.5,
    };
    const first = evaluateDeterministicMicroMlp(input);
    const second = evaluateDeterministicMicroMlp(input);
    expect(first).toEqual(second);
    expect(first.inferenceKind).toBe(MICRO_MLP_INFERENCE_KIND);
    expect(MICRO_MLP_PARAMETER_COUNT).toBe(75);
  });

  it("Micro-MLP가 고속 완만 구간에서 lookAheadGain을 높이고 급꺾임·고각속도에서 smoothBlend·lookAheadGain을 감쇠한다", () => {
    const fastSmooth = evaluateDeterministicMicroMlp({
      velocityPxPerSec: 1200,
      accelPxPerSec2: 600,
      curvatureRadPerPx: 0.002,
      pressureRatePerSec: 0.2,
      angularVelocityRadPerSec: 0.4,
    });
    const sharpCusp = evaluateDeterministicMicroMlp({
      velocityPxPerSec: 450,
      accelPxPerSec2: -1800,
      curvatureRadPerPx: 0.25,
      pressureRatePerSec: -0.3,
      angularVelocityRadPerSec: 32,
    });
    expect(fastSmooth.lookAheadGain).toBeGreaterThan(sharpCusp.lookAheadGain + 0.2);
    expect(fastSmooth.smoothBlend).toBeGreaterThan(sharpCusp.smoothBlend);
  });

  it("compensateStylusStroke가 빈 배열 및 단일 샘플 입력을 오류 없이 처리한다", () => {
    const cfg = createDefaultStylusCompensationConfig();
    const empty = compensateStylusStroke([], cfg);
    expect(empty.samples).toHaveLength(0);
    expect(empty.inferenceKind).toBe(MICRO_MLP_INFERENCE_KIND);

    const single = compensateStylusStroke([{ x: 40, y: 60, timestampMs: 0, pressure: 0.5 }], cfg);
    expect(single.samples).toHaveLength(1);
    expect(single.samples[0].compensatedX).toBe(40);
    expect(single.samples[0].compensatedY).toBe(60);
    expect(single.samples[0].effectiveLeadMs).toBe(0);
  });

  it("저속 손떨림 지터 직선 입력에서 One-Euro+Micro-MLP가 원시 입력 대비 횡방향 지터 편차를 크게 줄인다", () => {
    const cfg = createDefaultStylusCompensationConfig("galaxy-spen-emr", "ink-firm-line");
    const samples: StylusRawSample[] = Array.from({ length: 40 }, (_, i) => ({
      x: 20 + i * 3.5,
      y: 100 + (i % 2 === 0 ? 2.4 : -2.4),
      timestampMs: i * 10,
      pressure: 0.5,
    }));
    const res = compensateStylusStroke(samples, cfg);
    const rawRmseY = Math.sqrt(samples.reduce((acc, s) => acc + Math.pow(s.y - 100, 2), 0) / samples.length);
    const compRmseY = Math.sqrt(
      res.samples.reduce((acc, s) => acc + Math.pow(s.compensatedY - 100, 2), 0) / res.samples.length,
    );
    expect(compRmseY).toBeLessThan(rawRmseY * 0.55);
  });

  it("급꺾임 V-코너(>55°)에서 Cusp 보호기가 발동해 정점 오차와 선행 예측 오버슈트를 즉시 감쇠한다", () => {
    const cfg = createDefaultStylusCompensationConfig("wacom-pro-pen-3", "gpen-crisp");
    const samples: StylusRawSample[] = [];
    for (let i = 0; i <= 20; i += 1) {
      const x = i <= 10 ? 20 + i * 10 : 120 + (i - 10) * 10;
      const y = i <= 10 ? 140 - i * 10 : 40 + (i - 10) * 10;
      samples.push({ x, y, timestampMs: i * 5, pressure: 0.65 });
    }
    const res = compensateStylusStroke(samples, cfg);
    expect(res.cuspIndices.length).toBeGreaterThanOrEqual(1);
    expect(res.maxTurningAngleDeg).toBeGreaterThan(75);
    const apex = res.samples[10];
    expect(apex.isCuspProtected).toBe(true);
    expect(Math.hypot(apex.compensatedX - 120, apex.compensatedY - 40)).toBeLessThan(2.5);
    expect(apex.effectiveLeadMs).toBeLessThan(1.5);
  });

  it("펜 떼기 삐침 구간(고속 + 급감압)에서 Release Taper 보호기가 자동 발동한다", () => {
    const cfg = createDefaultStylusCompensationConfig("wacom-pro-pen-3", "gpen-crisp");
    const synthetic = generateSyntheticBenchmarkStroke(cfg);
    const res = compensateStylusStroke(synthetic.noisyInput, cfg);
    expect(res.releaseTaperIndices.length).toBeGreaterThanOrEqual(4);
    const lastIdx = res.samples.length - 1;
    expect(res.samples[lastIdx].isReleaseTaperProtected).toBe(true);
  });

  it("lookAheadMs 증가에 따라 meanLookAheadMs가 상승하며 16ms 초과값은 MAX_LOOK_AHEAD_MS로 클램프된다", () => {
    const baseCfg = createDefaultStylusCompensationConfig();
    const synth = generateSyntheticBenchmarkStroke(baseCfg);
    const zeroLead = compensateStylusStroke(synth.noisyInput, { ...baseCfg, lookAheadMs: 0 });
    const midLead = compensateStylusStroke(synth.noisyInput, { ...baseCfg, lookAheadMs: 8 });
    const maxLead = compensateStylusStroke(synth.noisyInput, { ...baseCfg, lookAheadMs: 16 });
    const clampedLead = compensateStylusStroke(synth.noisyInput, { ...baseCfg, lookAheadMs: 42 });

    expect(zeroLead.meanLookAheadMs).toBe(0);
    expect(midLead.meanLookAheadMs).toBeGreaterThan(0);
    expect(maxLead.meanLookAheadMs).toBeGreaterThan(midLead.meanLookAheadMs);
    expect(clampedLead.meanLookAheadMs).toBeCloseTo(maxLead.meanLookAheadMs, 4);
  });

  it("보정 출력의 모든 샘플이 유효한 14-bit 필압(0..16383)과 MLP 파라미터 수(75)를 기록한다", () => {
    const cfg = createDefaultStylusCompensationConfig("huion-xppen-16k", "wrist-care-light");
    const synth = generateSyntheticBenchmarkStroke(cfg);
    const res = compensateStylusStroke(synth.noisyInput, cfg);
    expect(res.mlpParameterCount).toBe(75);
    for (const sample of res.samples) {
      expect(sample.pressure14Bit).toBeGreaterThanOrEqual(0);
      expect(sample.pressure14Bit).toBeLessThanOrEqual(MAX_PRESSURE_LEVEL_14BIT);
    }
  });
});

describe("4. 정량 비교 벤치마크(원시 vs 단순 EMA vs ToonStudio 하이브리드) & JSON 내보내기", () => {
  it("benchmarkStrokeCompensation이 3종 파이프라인의 실측 지표를 순서대로 산출한다", () => {
    const report = benchmarkStrokeCompensation(createDefaultStylusCompensationConfig());
    expect(report.inferenceKind).toBe(MICRO_MLP_INFERENCE_KIND);
    expect(report.metrics.map((m) => m.methodId)).toEqual(["raw", "simple-ema", "toonstudio-hybrid"]);
    for (const metric of report.metrics) {
      expect(Number.isFinite(metric.rmsePx)).toBe(true);
      expect(metric.cornerPreservationPct).toBeGreaterThanOrEqual(0);
      expect(metric.cornerPreservationPct).toBeLessThanOrEqual(100);
      expect(metric.releaseTaperSharpness).toBeGreaterThanOrEqual(0);
      expect(metric.releaseTaperSharpness).toBeLessThanOrEqual(100);
    }
  });

  it("기본 프로파일에서 ToonStudio 하이브리드가 원시 입력 및 단순 EMA 대비 더 낮은 RMSE(px)를 달성한다", () => {
    const report = benchmarkStrokeCompensation(createDefaultStylusCompensationConfig("wacom-pro-pen-3", "gpen-crisp"));
    const [raw, ema, hybrid] = report.metrics;
    expect(hybrid.rmsePx).toBeLessThan(raw.rmsePx);
    expect(hybrid.rmsePx).toBeLessThan(ema.rmsePx);
    expect(report.rmseReductionVsEmaPct).toBeGreaterThan(20);
  });

  it("ToonStudio 하이브리드가 급꺾임 코너 보존률(%)에서 단순 EMA를 크게 앞선다", () => {
    const report = benchmarkStrokeCompensation(createDefaultStylusCompensationConfig("wacom-pro-pen-3", "gpen-crisp"));
    const [, ema, hybrid] = report.metrics;
    expect(hybrid.cornerPreservationPct).toBeGreaterThan(ema.cornerPreservationPct + 10);
    expect(report.cornerGainVsEmaPct).toBeGreaterThan(10);
  });

  it("ToonStudio 하이브리드가 유효 지연 보정(ms) 및 삐침 선명도에서 단순 EMA보다 우수하다", () => {
    const report = benchmarkStrokeCompensation(createDefaultStylusCompensationConfig("apple-pencil-pro", "gpen-crisp"));
    const [, ema, hybrid] = report.metrics;
    expect(hybrid.effectiveLatencyCompMs).toBeGreaterThan(ema.effectiveLatencyCompMs);
    expect(hybrid.effectiveLatencyCompMs).toBeGreaterThan(0);
    expect(hybrid.releaseTaperSharpness).toBeGreaterThan(ema.releaseTaperSharpness);
  });

  it("5종 디지타이저 전 프로파일에서 ToonStudio 하이브리드가 EMA 대비 낮은 RMSE와 높은 코너 보존률을 유지한다", () => {
    for (const id of ALL_DIGITIZER_IDS) {
      const report = benchmarkStrokeCompensation(createDefaultStylusCompensationConfig(id, "gpen-crisp"));
      const [, ema, hybrid] = report.metrics;
      expect(hybrid.rmsePx).toBeLessThan(ema.rmsePx);
      expect(hybrid.cornerPreservationPct).toBeGreaterThan(ema.cornerPreservationPct);
    }
  });

  it("exportStylusCompensationJson이 유효 JSON·스키마 버전·정직한 추론 표기를 생성한다", () => {
    const cfg = createDefaultStylusCompensationConfig("huion-xppen-16k", "ink-firm-line");
    const bundle = exportStylusCompensationJson(cfg);
    const parsed = JSON.parse(bundle.json) as typeof bundle.manifest;
    expect(parsed.schemaVersion).toBe(STYLUS_COMPENSATION_SCHEMA_VERSION);
    expect(parsed.inferenceKind).toBe("deterministic-micro-mlp-cpu");
    expect(parsed.pressureResolutionLevels).toBe(16384);
    expect(parsed.curveAudit.isStrictlyMonotonic).toBe(true);
    expect(parsed.benchmarkSummary).toHaveLength(3);
    expect(parsed.honestyNoteKo).toContain("현재 구현(Current)");
    expect(parsed.honestyNoteEn).toContain("Current:");
  });
});

describe("5. StudioStylusNeuralCompensationPanel UI 렌더링 · 인터랙션 · 접근성", () => {
  it("props 없이 기본 마운트되어 5종 디지타이저·5종 프리셋·2단 SVG·정량 비교표를 모두 렌더링한다", () => {
    render(<StudioStylusNeuralCompensationPanel />);
    expect(screen.getByTestId("studio-stylus-neural-compensation-panel")).toBeTruthy();
    expect(screen.getByTestId("inference-kind-badge").textContent).toContain("deterministic-micro-mlp-cpu");
    expect(screen.getByTestId("monotonic-status-badge").textContent).toContain("16,384단계");
    for (const id of ALL_DIGITIZER_IDS) {
      expect(screen.getByTestId(`digitizer-btn-${id}`)).toBeTruthy();
    }
    for (const presetId of ALL_PRESET_IDS) {
      expect(screen.getByTestId(`curve-preset-btn-${presetId}`)).toBeTruthy();
    }
    expect(screen.getByTestId("svg-pressure-curve-preview")).toBeTruthy();
    expect(screen.getByTestId("svg-trajectory-preview")).toBeTruthy();
    expect(screen.getByTestId("benchmark-comparison-table")).toBeTruthy();
  });

  it("초기 선택 props·영문 locale·외부 className이 정확하게 반영된다", () => {
    render(
      <StudioStylusNeuralCompensationPanel
        initialDigitizerId="apple-pencil-pro"
        initialCurvePresetId="wrist-care-light"
        locale="en"
        className="custom-stylus-host"
      />,
    );
    const root = screen.getByTestId("studio-stylus-neural-compensation-panel");
    expect(root.className).toContain("custom-stylus-host");
    expect(screen.getByTestId("digitizer-btn-apple-pencil-pro").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("curve-preset-btn-wrist-care-light").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("stylus-honesty-note").textContent).toContain("Current:");
  });

  it("디지타이저 전환 시 onProfileChange가 호출되고 마우스 선택 시 기울기 슬라이더가 비활성화된다", () => {
    const onProfileChange = vi.fn();
    render(<StudioStylusNeuralCompensationPanel onProfileChange={onProfileChange} />);

    fireEvent.click(screen.getByTestId("digitizer-btn-apple-pencil-pro"));
    expect(screen.getByTestId("digitizer-btn-apple-pencil-pro").getAttribute("aria-pressed")).toBe("true");
    expect(onProfileChange).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("digitizer-btn-mouse-trackpad-pseudo"));
    const tiltSlider = screen.getByTestId("slider-tilt-deg") as HTMLInputElement;
    expect(tiltSlider.disabled).toBe(true);
    expect(screen.getByTestId("slider-tilt-deg-readout").textContent).toBe("미지원");
    expect(onProfileChange).toHaveBeenCalledTimes(2);
  });

  it("압력 곡선 프리셋 버튼 클릭 시 활성 상태와 SVG PCHIP 곡선이 갱신된다", () => {
    render(<StudioStylusNeuralCompensationPanel />);
    const beforePoints = screen.getByTestId("svg-pchip-main-curve").getAttribute("points");
    fireEvent.click(screen.getByTestId("curve-preset-btn-wrist-care-light"));
    expect(screen.getByTestId("curve-preset-btn-wrist-care-light").getAttribute("aria-pressed")).toBe("true");
    const afterPoints = screen.getByTestId("svg-pchip-main-curve").getAttribute("points");
    expect(afterPoints).not.toBe(beforePoints);
  });

  it("IAF·히스테리시스·지터·선행예측·코너보호·기울기 슬라이더 변경이 리드아웃과 벤치마크에 즉시 반영된다", () => {
    render(<StudioStylusNeuralCompensationPanel />);

    fireEvent.change(screen.getByTestId("slider-iaf"), { target: { value: "0.08" } });
    expect(screen.getByTestId("slider-iaf-readout").textContent).toBe("8.0%");

    fireEvent.change(screen.getByTestId("slider-hysteresis"), { target: { value: "0.072" } });
    expect(screen.getByTestId("slider-hysteresis-readout").textContent).toBe("7.2%");

    fireEvent.change(screen.getByTestId("slider-jitter"), { target: { value: "2.0" } });
    expect(screen.getByTestId("slider-jitter-readout").textContent).toBe("2.0×");

    fireEvent.change(screen.getByTestId("slider-lookahead"), { target: { value: "14" } });
    expect(screen.getByTestId("slider-lookahead-readout").textContent).toBe("14.0 ms");

    fireEvent.change(screen.getByTestId("slider-corner-protection"), { target: { value: "0.95" } });
    expect(screen.getByTestId("slider-corner-protection-readout").textContent).toBe("95%");

    fireEvent.change(screen.getByTestId("slider-tilt-deg"), { target: { value: "45" } });
    expect(screen.getByTestId("slider-tilt-deg-readout").textContent).toContain("45°");
  });

  it("기본값 복원 버튼 클릭 시 변경된 슬라이더와 디지타이저가 초기값으로 되돌아간다", () => {
    render(<StudioStylusNeuralCompensationPanel initialDigitizerId="wacom-pro-pen-3" />);
    fireEvent.click(screen.getByTestId("digitizer-btn-galaxy-spen-emr"));
    fireEvent.change(screen.getByTestId("slider-lookahead"), { target: { value: "15" } });
    expect(screen.getByTestId("slider-lookahead-readout").textContent).toBe("15.0 ms");

    fireEvent.click(screen.getByTestId("reset-stylus-config-btn"));
    expect(screen.getByTestId("digitizer-btn-wacom-pro-pen-3").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("slider-lookahead-readout").textContent).toBe("8.0 ms");
  });

  it("JSON 내보내기 버튼이 onExportJson을 호출하고 JSON 미리보기를 펼치며 토글 닫기를 지원한다", () => {
    const onExportJson = vi.fn();
    render(<StudioStylusNeuralCompensationPanel onExportJson={onExportJson} />);

    expect(screen.queryByTestId("stylus-json-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("export-stylus-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    const preview = screen.getByTestId("stylus-json-preview");
    expect(preview.textContent).toContain(STYLUS_COMPENSATION_SCHEMA_VERSION);
    expect(preview.textContent).toContain("deterministic-micro-mlp-cpu");

    fireEvent.click(screen.getByTestId("toggle-json-preview-btn"));
    expect(screen.queryByTestId("stylus-json-preview")).toBeNull();
  });

  it("2단 SVG 프리뷰에 PCHIP 5개 매듭·히스테리시스 밴드·IAF 영역·원시/EMA/하이브리드 궤적·코너·삐침 마커가 존재한다", () => {
    render(<StudioStylusNeuralCompensationPanel />);
    expect(screen.getByTestId("svg-iaf-deadzone-rect")).toBeTruthy();
    expect(screen.getByTestId("svg-hysteresis-band")).toBeTruthy();
    expect(screen.getByTestId("svg-tilt-attenuated-curve")).toBeTruthy();
    for (let i = 0; i < 5; i += 1) {
      expect(screen.getByTestId(`svg-pchip-knot-${i}`)).toBeTruthy();
    }
    expect(screen.getByTestId("svg-raw-trajectory")).toBeTruthy();
    expect(screen.getByTestId("svg-ema-trajectory")).toBeTruthy();
    expect(screen.getByTestId("svg-hybrid-trajectory")).toBeTruthy();
    expect(screen.getByTestId("svg-cusp-marker")).toBeTruthy();
    expect(screen.getByTestId("svg-taper-marker")).toBeTruthy();
    expect(screen.getByTestId("svg-lookahead-vector")).toBeTruthy();
  });

  it("렌더된 패널의 모든 버튼이 min-h-11 터치 타깃 접근성 계약을 충족한다", () => {
    const { container } = render(<StudioStylusNeuralCompensationPanel />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThanOrEqual(13);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
  });
});

describe("6. 코드 위생 · 파일 줄 수 · 탈-바이올렛 OKLCH · 하네스 계약 자가 감사", () => {
  it("4개 단독 소유 파일만 존재하고 줄 수 제한(engine<=750, panel<=680, 전체<=800) 및 금지 패턴 0건을 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "stylus-neural-compensation-engine.ts",
      "StudioStylusNeuralCompensationPanel.tsx",
      "index.ts",
      "stylus-neural-compensation.test.tsx",
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
      if (file === "stylus-neural-compensation-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioStylusNeuralCompensationPanel.tsx") expect(lines).toBeLessThanOrEqual(680);

      if (file !== "stylus-neural-compensation.test.tsx") {
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

      if (file === "StudioStylusNeuralCompensationPanel.tsx") {
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

  it("패널 내 모든 oklch() 리터럴이 바이올렛 휴 대역(270~320°)을 0% 배제한다", () => {
    const panelSrc = readFileSync(
      path.resolve(import.meta.dirname, "StudioStylusNeuralCompensationPanel.tsx"),
      "utf8",
    );
    const matches = [...panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/gu)];
    expect(matches.length).toBeGreaterThanOrEqual(8);
    for (const match of matches) {
      const hue = Number(match[1]);
      expect(hue < 270 || hue > 320).toBe(true);
    }
  });
});
