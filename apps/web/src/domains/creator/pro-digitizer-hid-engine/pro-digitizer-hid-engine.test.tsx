// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DIGITIZER_CONFIG_SCHEMA_VERSION,
  PRESSURE_CURVE_PRESETS,
  PRESSURE_CURVE_PRESET_IDS,
  PRO_DIGITIZER_IDS,
  PRO_DIGITIZER_PROFILES,
  StudioProDigitizerCalibratorPanel,
  USB_HID_DEFAULT_PRESSURE_MAX,
  USB_HID_STANDARD_PEN_REPORT_ID,
  USB_HID_USAGE_PAGE_DIGITIZER,
  buildHardwareCapabilityMatrix,
  createDefaultShortcutBindings,
  createPressureCurveFromPreset,
  createSimulatedTestStroke,
  encodeStandardHidDigitizerReport,
  evaluatePressureCurve,
  exportDigitizerConfigJson,
  getProDigitizerProfile,
  hidReportToRawPointerSample,
  importDigitizerConfigJson,
  isTriggerSupportedByProfile,
  normalizeAngleDeg,
  normalizePointerSampleBatch,
  parseStandardHidDigitizerReport,
  samplePressureCurvePoints,
  tiltDegreesToSpherical,
  updateShortcutBinding,
  type RawPointerSample,
} from "./index";

afterEach(cleanup);

describe("1. 7대 하드웨어 프로필 카탈로그 및 지원 매트릭스", () => {
  it("7대 프로 디지타이저 프로필이 정확한 ID와 4,096~16,384 필압 단계 스펙을 제공한다", () => {
    expect(PRO_DIGITIZER_IDS).toEqual([
      "wacom-pro-pen-3",
      "wacom-art-pen-barrel",
      "apple-pencil-pro",
      "galaxy-spen-ble",
      "huion-pw600",
      "xppen-x3-pro",
      "macbook-force-trackpad",
    ]);
    expect(PRO_DIGITIZER_PROFILES).toHaveLength(7);
    for (const profile of PRO_DIGITIZER_PROFILES) {
      expect(profile.pressureLevels).toBeGreaterThanOrEqual(4096);
      expect(profile.pressureLevels).toBeLessThanOrEqual(16384);
      expect(profile.nominalReportRateHz).toBeGreaterThanOrEqual(240);
      expect(profile.nominalReportRateHz).toBeLessThanOrEqual(500);
      expect(profile.openStandards.length).toBeGreaterThan(0);
    }
  });

  it("Wacom Art Pen과 Apple Pencil Pro는 배럴 회전(360°)을 지원하며 에어브러시 휠·스퀴즈 차이를 구분한다", () => {
    const artPen = getProDigitizerProfile("wacom-art-pen-barrel");
    const pencilPro = getProDigitizerProfile("apple-pencil-pro");
    expect(artPen.capabilities.barrelRoll).toBe(true);
    expect(artPen.capabilities.tangentialPressure).toBe(true);
    expect(artPen.capabilities.squeeze).toBe(false);
    expect(pencilPro.capabilities.barrelRoll).toBe(true);
    expect(pencilPro.capabilities.squeeze).toBe(true);
    expect(pencilPro.capabilities.hover).toBe(true);
    expect(pencilPro.hoverHeightMm).toBe(12);
  });

  it("Galaxy S-Pen BLE, Huion PW600, XP-Pen X3 Pro의 에어액션·16,384 필압·500Hz 스펙이 정확하다", () => {
    const spen = getProDigitizerProfile("galaxy-spen-ble");
    const huion = getProDigitizerProfile("huion-pw600");
    const xppen = getProDigitizerProfile("xppen-x3-pro");
    expect(spen.capabilities.airAction).toBe(true);
    expect(spen.hoverHeightMm).toBe(14);
    expect(huion.pressureLevels).toBe(16384);
    expect(huion.capabilities.expressKeys).toBe(true);
    expect(xppen.pressureLevels).toBe(16384);
    expect(xppen.nominalReportRateHz).toBe(500);
  });

  it("MacBook Force Touch 트랙패드는 멀티터치 제스처와 감압을 지원하되 기울기·호버는 0으로 구분한다", () => {
    const trackpad = getProDigitizerProfile("macbook-force-trackpad");
    expect(trackpad.formFactor).toBe("force-trackpad");
    expect(trackpad.capabilities.trackpadGestures).toBe(true);
    expect(trackpad.capabilities.altitudeAzimuth).toBe(false);
    expect(trackpad.maxTiltDeg).toBe(0);
    expect(trackpad.hoverHeightMm).toBe(0);
  });

  it("buildHardwareCapabilityMatrix는 7대 기기 전체의 독립된 매트릭스 행을 반환한다", () => {
    const matrix = buildHardwareCapabilityMatrix();
    expect(matrix).toHaveLength(7);
    expect(matrix.map((row) => row.profileId)).toEqual([...PRO_DIGITIZER_IDS]);
  });
});

describe("2. 3차 베지어 필압 곡선 캘리브레이터 (5종 프리셋)", () => {
  it("5종 필압 곡선 프리셋이 모두 등록되어 있다", () => {
    expect(PRESSURE_CURVE_PRESET_IDS).toEqual([
      "soft-sketch", "linear-reference", "firm-gpen-ink", "heavy-calligraphy", "custom-bezier",
    ]);
    expect(PRESSURE_CURVE_PRESETS).toHaveLength(5);
  });

  it("linear-reference 프리셋은 0~1 전 구간에서 1:1 선형 응답을 반환한다", () => {
    const linear = createPressureCurveFromPreset("linear-reference");
    for (const p of [0, 0.15, 0.35, 0.5, 0.75, 0.92, 1]) {
      expect(evaluatePressureCurve(p, linear)).toBeCloseTo(p, 3);
    }
  });

  it("중간 필압(0.5)에서 soft-sketch > linear > firm-gpen-ink > heavy-calligraphy 순서로 출력이 형성된다", () => {
    const soft = evaluatePressureCurve(0.5, createPressureCurveFromPreset("soft-sketch"));
    const linear = evaluatePressureCurve(0.5, createPressureCurveFromPreset("linear-reference"));
    const firm = evaluatePressureCurve(0.5, createPressureCurveFromPreset("firm-gpen-ink"));
    const heavy = evaluatePressureCurve(0.5, createPressureCurveFromPreset("heavy-calligraphy"));
    expect(soft).toBeGreaterThan(linear);
    expect(linear).toBeGreaterThan(firm);
    expect(firm).toBeGreaterThan(heavy);
  });

  it("데드존·포화점·출력 하한/상한 및 비정상 입력(NaN, -1, 2)을 안전하게 클램핑한다", () => {
    const curve = createPressureCurveFromPreset("custom-bezier", {
      deadzoneMin: 0.1, saturationMax: 0.9, outputMin: 0.05, outputMax: 0.95,
    });
    expect(evaluatePressureCurve(0.05, curve)).toBeCloseTo(0.05, 5);
    expect(evaluatePressureCurve(0.95, curve)).toBeCloseTo(0.95, 5);
    expect(evaluatePressureCurve(-0.5, curve)).toBeCloseTo(0.05, 5);
    expect(evaluatePressureCurve(1.8, curve)).toBeCloseTo(0.95, 5);
    expect(evaluatePressureCurve(Number.NaN, curve)).toBeCloseTo(0.05, 5);
  });

  it("custom-bezier 임의 제어점에서도 필압 곡선이 단조 증가(non-decreasing)를 보장한다", () => {
    const curve = createPressureCurveFromPreset("custom-bezier", {
      p1: { x: 0.15, y: 0.72 }, p2: { x: 0.85, y: 0.25 }, deadzoneMin: 0, saturationMax: 1,
    });
    let prev = -1;
    for (let i = 0; i <= 50; i += 1) {
      const val = evaluatePressureCurve(i / 50, curve);
      expect(val).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = val;
    }
  });

  it("samplePressureCurvePoints는 SVG 렌더링용 샘플 좌표를 0→1 구간으로 생성한다", () => {
    const pts = samplePressureCurvePoints(createPressureCurveFromPreset("firm-gpen-ink"), 20);
    expect(pts).toHaveLength(21);
    expect(pts[0]?.x).toBe(0);
    expect(pts[20]?.x).toBe(1);
  });
});

describe("3. 240~500Hz Coalesced / Predicted 포인터 샘플 정규화", () => {
  it("500Hz(2ms 간격) Coalesced 배치에서 실효 리포트율을 정확히 500Hz로 산출한다", () => {
    const linear = createPressureCurveFromPreset("linear-reference");
    const samples: RawPointerSample[] = Array.from({ length: 12 }, (_, i) => ({
      x: 10 + i * 6, y: 50 + i * 2, timestampMs: 1000 + i * 2, pressure: 0.5,
    }));
    const res = normalizePointerSampleBatch(samples, { profileId: "xppen-x3-pro", curve: linear, smoothingStrength: 0 });
    expect(res.metrics.effectiveReportRateHz).toBe(500);
    expect(res.metrics.coalescedCount).toBe(12);
    expect(res.metrics.jitterReductionPct).toBe(0);
  });

  it("고주파 지터가 포함된 스트로크에서 smoothingStrength 적용 시 지터가 유의미하게 감소한다", () => {
    const linear = createPressureCurveFromPreset("linear-reference");
    const noisy: RawPointerSample[] = Array.from({ length: 16 }, (_, i) => ({
      x: 20 + i * 4 + (i % 2 === 0 ? 3 : -3),
      y: 60 + (i % 2 === 0 ? -2.5 : 2.5),
      timestampMs: 2000 + i * 4,
      pressure: 0.6,
    }));
    const rawRes = normalizePointerSampleBatch(noisy, { profileId: "wacom-pro-pen-3", curve: linear, smoothingStrength: 0 });
    const smoothRes = normalizePointerSampleBatch(noisy, { profileId: "wacom-pro-pen-3", curve: linear, smoothingStrength: 0.65 });
    expect(rawRes.metrics.jitterReductionPct).toBe(0);
    expect(smoothRes.metrics.jitterReductionPct).toBeGreaterThan(25);
  });

  it("tiltX/tiltY를 구면 altitude/azimuth로 변환하고 틸트 셰이딩 계수를 계산한다(트랙패드는 0 고정)", () => {
    const upright = tiltDegreesToSpherical(0, 0);
    expect(upright.altitudeRad).toBeCloseTo(Math.PI / 2, 4);
    const tilted = tiltDegreesToSpherical(45, 0);
    expect(tilted.altitudeRad).toBeCloseTo(Math.PI / 4, 3);
    expect(tilted.azimuthRad).toBeCloseTo(0, 3);

    const linear = createPressureCurveFromPreset("linear-reference");
    const tiltedBatch = normalizePointerSampleBatch(
      [{ x: 50, y: 50, timestampMs: 100, pressure: 0.7, tiltX: 48, tiltY: 12 }],
      { profileId: "wacom-pro-pen-3", curve: linear },
    );
    const trackpadBatch = normalizePointerSampleBatch(
      [{ x: 50, y: 50, timestampMs: 100, pressure: 0.7, tiltX: 48, tiltY: 12 }],
      { profileId: "macbook-force-trackpad", curve: linear },
    );
    expect(tiltedBatch.samples[0]?.tiltShadingFactor).toBeGreaterThan(0.6);
    expect(trackpadBatch.samples[0]?.tiltShadingFactor).toBe(0);
  });

  it("W3C Level 3 altitudeAngle/azimuthAngle 직접 입력과 배럴 회전(twist) 0~360° 정규화를 정확히 처리한다", () => {
    const linear = createPressureCurveFromPreset("linear-reference");
    expect(normalizeAngleDeg(-45)).toBe(315);
    expect(normalizeAngleDeg(405)).toBe(45);
    expect(normalizeAngleDeg(360)).toBe(0);

    const res = normalizePointerSampleBatch(
      [{ x: 100, y: 80, timestampMs: 500, pressure: 0.8, altitudeAngle: 0.6, azimuthAngle: 1.25, twist: -30, tangentialPressure: 0.6 }],
      { profileId: "wacom-art-pen-barrel", curve: linear },
    );
    expect(res.samples[0]?.altitudeRad).toBeCloseTo(0.6, 4);
    expect(res.samples[0]?.azimuthRad).toBeCloseTo(1.25, 4);
    expect(res.samples[0]?.barrelRollDeg).toBe(330);
    expect(res.samples[0]?.barrelRollNative).toBe(true);
    expect(res.samples[0]?.tangentialPressure).toBe(0.6);
  });

  it("enablePrediction 토글에 따라 예측 샘플 포함/제외 및 predictedLatencyGainMs가 계산된다", () => {
    const stroke = createSimulatedTestStroke("apple-pencil-pro");
    const curve = createPressureCurveFromPreset("soft-sketch");
    const withPred = normalizePointerSampleBatch(stroke, { profileId: "apple-pencil-pro", curve, enablePrediction: true });
    const withoutPred = normalizePointerSampleBatch(stroke, { profileId: "apple-pencil-pro", curve, enablePrediction: false });
    expect(withPred.metrics.predictedCount).toBe(2);
    expect(withPred.metrics.predictedLatencyGainMs).toBeGreaterThan(0);
    expect(withoutPred.metrics.predictedCount).toBe(0);
    expect(withoutPred.metrics.droppedPredictedCount).toBe(2);
    expect(withoutPred.metrics.predictedLatencyGainMs).toBe(0);
  });

  it("빈 샘플 배열 입력 시 오류 없이 0 메트릭을 반환한다", () => {
    const res = normalizePointerSampleBatch([], { profileId: "wacom-pro-pen-3", curve: createPressureCurveFromPreset("linear-reference") });
    expect(res.samples).toHaveLength(0);
    expect(res.metrics.effectiveReportRateHz).toBe(0);
    expect(res.metrics.inputCount).toBe(0);
  });
});

describe("4. 클린룸 USB HID Digitizer (Usage Page 0x0D) 표준 리포트 파서", () => {
  it("표준 16바이트 HID 0x0D 패킷을 인코딩·디코딩해 스위치·좌표·필압·기울기·배럴회전·다이얼·익스프레스키를 복원한다", () => {
    const packet = encodeStandardHidDigitizerReport({
      tipSwitch: true, barrelSwitch: true, secondaryBarrelSwitch: false,
      eraser: false, invert: false, inRange: true,
      x: 24576, y: 8192, tipPressure: 12288, logicalPressureMax: 16383,
      tiltXDeg: -35, tiltYDeg: 42, twistDeg: 215, dialDelta: -4, expressKeyMask: 0b0000_1011,
    });
    const decoded = parseStandardHidDigitizerReport(packet);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.report.usagePage).toBe(USB_HID_USAGE_PAGE_DIGITIZER);
    expect(decoded.report.reportId).toBe(USB_HID_STANDARD_PEN_REPORT_ID);
    expect(decoded.report.flags.tipSwitch).toBe(true);
    expect(decoded.report.flags.barrelSwitch).toBe(true);
    expect(decoded.report.flags.eraser).toBe(false);
    expect(decoded.report.flags.inRange).toBe(true);
    expect(decoded.report.x).toBe(24576);
    expect(decoded.report.y).toBe(8192);
    expect(decoded.report.tipPressure).toBe(12288);
    expect(decoded.report.tiltXDeg).toBe(-35);
    expect(decoded.report.tiltYDeg).toBe(42);
    expect(decoded.report.twistDeg).toBe(215);
    expect(decoded.report.dialDelta).toBe(-4);
    expect(decoded.report.activeExpressKeys).toEqual([1, 2, 4]);
  });

  it("twist=360은 0°로 정규화하고 logicalPressureMax=0이면 표준 16,383을 기본값으로 사용한다", () => {
    const packet = encodeStandardHidDigitizerReport({
      tipSwitch: true, eraser: true, invert: true, inRange: true,
      x: 1000, y: 2000, tipPressure: 4096, logicalPressureMax: 0, twistDeg: 360, dialDelta: 3,
    });
    const decoded = parseStandardHidDigitizerReport(packet);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.report.twistDeg).toBe(0);
    expect(decoded.report.logicalPressureMax).toBe(USB_HID_DEFAULT_PRESSURE_MAX);
    expect(decoded.report.flags.eraser).toBe(true);
    expect(decoded.report.flags.invert).toBe(true);
    expect(decoded.report.dialDelta).toBe(3);
  });

  it("hidReportToRawPointerSample은 호버 상태(tipSwitch=false)에서 필압을 0으로 정규화한다", () => {
    const hoverPacket = encodeStandardHidDigitizerReport({
      tipSwitch: false, inRange: true, x: 16383, y: 16383, tipPressure: 500, tiltXDeg: 20, tiltYDeg: -10, twistDeg: 90,
    });
    const decoded = parseStandardHidDigitizerReport(hoverPacket);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const raw = hidReportToRawPointerSample(decoded.report, 320, 160, 1234);
    expect(raw.pressure).toBe(0);
    expect(raw.x).toBeCloseTo(160, 0);
    expect(raw.y).toBeCloseTo(80, 0);
    expect(raw.twist).toBe(90);
  });

  it("Fail-closed: Uint8Array가 아닌 입력은 INVALID_BUFFER_TYPE을 반환한다", () => {
    const res1 = parseStandardHidDigitizerReport(null);
    const res2 = parseStandardHidDigitizerReport([2, 1, 0, 0]);
    expect(res1.ok).toBe(false);
    expect(res2.ok).toBe(false);
    if (!res1.ok) expect(res1.errorCode).toBe("INVALID_BUFFER_TYPE");
    if (!res2.ok) expect(res2.errorCode).toBe("INVALID_BUFFER_TYPE");
  });

  it("Fail-closed: 16바이트 미만 버퍼(0B, 15B)는 BUFFER_TOO_SHORT를 반환한다", () => {
    const empty = parseStandardHidDigitizerReport(new Uint8Array(0));
    const short15 = parseStandardHidDigitizerReport(new Uint8Array(15));
    expect(empty.ok).toBe(false);
    expect(short15.ok).toBe(false);
    if (!empty.ok) expect(empty.errorCode).toBe("BUFFER_TOO_SHORT");
    if (!short15.ok) expect(short15.errorCode).toBe("BUFFER_TOO_SHORT");
  });

  it("Fail-closed: Report ID가 0x02가 아니면 UNSUPPORTED_REPORT_ID를 반환한다", () => {
    const wrongId = encodeStandardHidDigitizerReport({ reportId: 0x09, x: 100, y: 100, tipPressure: 100 });
    const res = parseStandardHidDigitizerReport(wrongId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorCode).toBe("UNSUPPORTED_REPORT_ID");
  });

  it("Fail-closed: 좌표·필압·기울기·트위스트가 규격 범위를 벗어나면 각각 명시적 오류 코드를 반환한다", () => {
    const badCoord = encodeStandardHidDigitizerReport({ x: 40000, y: 100, tipPressure: 100 });
    const badPressure = encodeStandardHidDigitizerReport({ x: 100, y: 100, tipPressure: 9000, logicalPressureMax: 8191 });
    const badTilt = encodeStandardHidDigitizerReport({ x: 100, y: 100, tipPressure: 100, tiltXDeg: 110 });
    const badTwist = encodeStandardHidDigitizerReport({ x: 100, y: 100, tipPressure: 100, twistDeg: 400 });

    const rCoord = parseStandardHidDigitizerReport(badCoord);
    const rPress = parseStandardHidDigitizerReport(badPressure);
    const rTilt = parseStandardHidDigitizerReport(badTilt);
    const rTwist = parseStandardHidDigitizerReport(badTwist);

    expect(rCoord.ok).toBe(false);
    expect(rPress.ok).toBe(false);
    expect(rTilt.ok).toBe(false);
    expect(rTwist.ok).toBe(false);
    if (!rCoord.ok) expect(rCoord.errorCode).toBe("COORDINATE_OUT_OF_RANGE");
    if (!rPress.ok) expect(rPress.errorCode).toBe("PRESSURE_OUT_OF_RANGE");
    if (!rTilt.ok) expect(rTilt.errorCode).toBe("INVALID_TILT_RANGE");
    if (!rTwist.ok) expect(rTwist.errorCode).toBe("INVALID_TWIST_RANGE");
  });
});

describe("5. 하드웨어 단축키 바인딩 테이블 및 JSON 내보내기/불러오기", () => {
  it("기기별 기본 바인딩은 해당 하드웨어가 지원하는 트리거만 활성화한다", () => {
    expect(isTriggerSupportedByProfile("apple-pencil-pro", "squeeze")).toBe(true);
    expect(isTriggerSupportedByProfile("apple-pencil-pro", "express-key")).toBe(false);
    expect(isTriggerSupportedByProfile("galaxy-spen-ble", "air-action")).toBe(true);
    expect(isTriggerSupportedByProfile("macbook-force-trackpad", "trackpad-gesture")).toBe(true);

    const pencilBindings = createDefaultShortcutBindings("apple-pencil-pro");
    expect(pencilBindings.find((b) => b.triggerKind === "squeeze")?.enabled).toBe(true);
    expect(pencilBindings.find((b) => b.triggerKind === "express-key")?.enabled).toBe(false);
  });

  it("updateShortcutBinding은 원본 배열을 변형하지 않고 대상 항목만 갱신한다", () => {
    const initial = createDefaultShortcutBindings("wacom-pro-pen-3");
    const updated = updateShortcutBinding(initial, "bind-ek1", { actionId: "redo", enabled: false });
    expect(initial.find((b) => b.id === "bind-ek1")?.actionId).toBe("undo");
    expect(updated.find((b) => b.id === "bind-ek1")?.actionId).toBe("redo");
    expect(updated.find((b) => b.id === "bind-ek1")?.enabled).toBe(false);
  });

  it("exportDigitizerConfigJson -> importDigitizerConfigJson 무손실 왕복을 보장한다", () => {
    const snapshot = {
      profileId: "huion-pw600" as const,
      curve: createPressureCurveFromPreset("custom-bezier", { p1: { x: 0.22, y: 0.45 }, p2: { x: 0.74, y: 0.88 } }),
      smoothingStrength: 0.45,
      enablePrediction: false,
      bindings: updateShortcutBinding(createDefaultShortcutBindings("huion-pw600"), "bind-dial-cw", { actionId: "zoom-in" }),
    };
    const json = exportDigitizerConfigJson(snapshot);
    expect(json).toContain(DIGITIZER_CONFIG_SCHEMA_VERSION);
    const imported = importDigitizerConfigJson(json);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.config).toEqual(snapshot);
  });

  it("Fail-closed JSON import: 깨진 문법·잘못된 스키마·알 수 없는 기기 ID를 거부한다", () => {
    const badJson = importDigitizerConfigJson("{invalid");
    const badSchema = importDigitizerConfigJson(JSON.stringify({ schema: "unknown.v0" }));
    const badProfile = importDigitizerConfigJson(JSON.stringify({
      schema: DIGITIZER_CONFIG_SCHEMA_VERSION, profileId: "unknown-tablet",
    }));
    expect(badJson.ok ? "" : badJson.errorCode).toBe("INVALID_JSON");
    expect(badSchema.ok ? "" : badSchema.errorCode).toBe("INVALID_SCHEMA");
    expect(badProfile.ok ? "" : badProfile.errorCode).toBe("INVALID_PROFILE_ID");
  });

  it("Fail-closed JSON import: 잘못된 베지어 제어점·스무딩·바인딩 항목을 거부한다", () => {
    const base = JSON.parse(exportDigitizerConfigJson({
      profileId: "wacom-pro-pen-3",
      curve: createPressureCurveFromPreset("linear-reference"),
      smoothingStrength: 0.3,
      enablePrediction: true,
      bindings: createDefaultShortcutBindings("wacom-pro-pen-3"),
    })) as Record<string, unknown>;

    const badCurve = importDigitizerConfigJson(JSON.stringify({
      ...base, curve: { presetId: "linear-reference", p1: { x: 1.5, y: 0.3 }, p2: { x: 0.7, y: 0.7 }, deadzoneMin: 0, saturationMax: 1, outputMin: 0, outputMax: 1 },
    }));
    const badSettings = importDigitizerConfigJson(JSON.stringify({ ...base, smoothingStrength: 2.5 }));
    const badBindings = importDigitizerConfigJson(JSON.stringify({ ...base, bindings: [{ id: "x", actionId: "nope" }] }));

    expect(badCurve.ok ? "" : badCurve.errorCode).toBe("INVALID_CURVE");
    expect(badSettings.ok ? "" : badSettings.errorCode).toBe("INVALID_SETTINGS");
    expect(badBindings.ok ? "" : badBindings.errorCode).toBe("INVALID_BINDINGS");
  });
});

describe("6. StudioProDigitizerCalibratorPanel UI 인터랙션 및 단독 렌더 검증", () => {
  it("Props 없이 단독 렌더되며 초기 프로필 뱃지, SVG 베지어 곡선, 실시간 텔레메트리가 표시된다", () => {
    render(<StudioProDigitizerCalibratorPanel />);
    expect(screen.getByTestId("pro-digitizer-calibrator-panel")).toBeTruthy();
    expect(screen.getByTestId("digitizer-active-profile-badge").textContent).toContain("8,192 LV");
    expect(screen.getByTestId("digitizer-bezier-svg").getAttribute("data-preset")).toBe("firm-gpen-ink");
    expect(screen.getByTestId("digitizer-metric-pressure").textContent).toContain("%");
    expect(screen.getByTestId("digitizer-metric-latency").textContent).toContain("ms");
  });

  it("7대 기기 프로필 전환 시 지원 매트릭스와 뱃지가 즉시 갱신된다", () => {
    render(<StudioProDigitizerCalibratorPanel />);

    fireEvent.click(screen.getByTestId("digitizer-profile-apple-pencil-pro"));
    expect(screen.getByTestId("digitizer-cap-barrel").getAttribute("data-supported")).toBe("true");
    expect(screen.getByTestId("digitizer-cap-squeeze").getAttribute("data-supported")).toBe("true");
    expect(screen.getByTestId("digitizer-cap-ek").getAttribute("data-supported")).toBe("false");

    fireEvent.click(screen.getByTestId("digitizer-profile-galaxy-spen-ble"));
    expect(screen.getByTestId("digitizer-cap-air").getAttribute("data-supported")).toBe("true");

    fireEvent.click(screen.getByTestId("digitizer-profile-macbook-force-trackpad"));
    expect(screen.getByTestId("digitizer-cap-trackpad").getAttribute("data-supported")).toBe("true");
    expect(screen.getByTestId("digitizer-cap-tilt").getAttribute("data-supported")).toBe("false");

    fireEvent.click(screen.getByTestId("digitizer-profile-xppen-x3-pro"));
    expect(screen.getByTestId("digitizer-active-profile-badge").textContent).toContain("16,384 LV · 500Hz");
  });

  it("베지어 프리셋 전환과 P1/P2 슬라이더 조작이 커스텀 베지어 곡선으로 즉시 반영된다", () => {
    render(<StudioProDigitizerCalibratorPanel />);
    fireEvent.click(screen.getByTestId("digitizer-preset-heavy-calligraphy"));
    expect(screen.getByTestId("digitizer-bezier-svg").getAttribute("data-preset")).toBe("heavy-calligraphy");

    fireEvent.change(screen.getByTestId("digitizer-slider-p1x"), { target: { value: "0.24" } });
    expect(screen.getByTestId("digitizer-bezier-svg").getAttribute("data-preset")).toBe("custom-bezier");
    expect(screen.getByTestId("digitizer-curve-readout").textContent).toContain("P1(0.24,");

    fireEvent.click(screen.getByTestId("digitizer-toggle-prediction"));
    expect(screen.getByTestId("digitizer-metric-latency").textContent).toBe("0.0ms");
  });

  it("실시간 포인터 패드 입력, 시뮬레이션 스트로크, HID 0x0D 디코드, 패드 비우기가 정상 동작한다", () => {
    render(<StudioProDigitizerCalibratorPanel initialProfileId="wacom-art-pen-barrel" />);
    const pad = screen.getByTestId("digitizer-pointer-pad");

    fireEvent.pointerDown(pad, { pointerId: 1, clientX: 40, clientY: 60, pressure: 0.4, buttons: 1 });
    fireEvent.pointerMove(pad, { pointerId: 1, clientX: 120, clientY: 85, pressure: 0.75, buttons: 1 });
    fireEvent.pointerUp(pad, { pointerId: 1, clientX: 120, clientY: 85, pressure: 0, buttons: 0 });
    expect(screen.getByTestId("digitizer-metric-pressure").textContent).toContain("%");

    fireEvent.click(screen.getByTestId("digitizer-hid-test-btn"));
    expect(screen.getByTestId("digitizer-hid-readout").textContent).toContain("HID Page 0x0D");
    expect(screen.getByTestId("digitizer-hid-readout").textContent).toContain("142°");

    fireEvent.click(screen.getByTestId("digitizer-clear-pad-btn"));
    expect(screen.queryByTestId("digitizer-hid-readout")).toBeNull();

    fireEvent.click(screen.getByTestId("digitizer-sim-stroke-btn"));
    expect(screen.getByTestId("digitizer-status-banner").textContent).toContain("240Hz");
  });

  it("단축키 매핑 편집·토글·기본 매핑 복원·전체 초기화가 일관되게 동작한다", () => {
    render(<StudioProDigitizerCalibratorPanel />);
    const ek1Select = screen.getByTestId("digitizer-binding-select-bind-ek1") as HTMLSelectElement;
    fireEvent.change(ek1Select, { target: { value: "eyedropper" } });
    expect(ek1Select.value).toBe("eyedropper");

    const toggleBtn = screen.getByTestId("digitizer-binding-toggle-bind-ek1");
    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByTestId("digitizer-reset-bindings-btn"));
    expect(ek1Select.value).toBe("undo");

    fireEvent.click(screen.getByTestId("digitizer-reset-btn"));
    expect(screen.getByTestId("digitizer-status-banner").textContent).toContain("복원");
  });

  it("JSON 복사 콜백, 유효한 JSON 불러오기, 깨진 JSON fail-closed 경고 및 영문 로케일이 동작한다", () => {
    const onExportJson = vi.fn();
    const onConfigChange = vi.fn();
    render(
      <StudioProDigitizerCalibratorPanel
        locale="en"
        initialProfileId="huion-pw600"
        onExportJson={onExportJson}
        onConfigChange={onConfigChange}
      />,
    );

    expect(onConfigChange).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("digitizer-copy-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toContain(DIGITIZER_CONFIG_SCHEMA_VERSION);

    const textarea = screen.getByTestId("digitizer-json-textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "{broken" } });
    fireEvent.click(screen.getByTestId("digitizer-apply-json-btn"));
    expect(screen.getByTestId("digitizer-error-banner").textContent).toContain("Malformed JSON");

    const validAppleJson = exportDigitizerConfigJson({
      profileId: "apple-pencil-pro",
      curve: createPressureCurveFromPreset("soft-sketch"),
      smoothingStrength: 0.25,
      enablePrediction: true,
      bindings: createDefaultShortcutBindings("apple-pencil-pro"),
    });
    fireEvent.change(textarea, { target: { value: validAppleJson } });
    fireEvent.click(screen.getByTestId("digitizer-apply-json-btn"));
    expect(screen.queryByTestId("digitizer-error-banner")).toBeNull();
    expect(screen.getByTestId("digitizer-cap-squeeze").getAttribute("data-supported")).toBe("true");
  });
});

describe("7. 코드 위생 및 Calm Atelier 자가 검증", () => {
  it("4개 모듈 파일 모두 800줄 이하이며 금지 패턴(원시 색·transition-all·= {}·Storage·private Map·BigInt·Sparkles)이 0건이다", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "pro-digitizer-engine.ts",
      "StudioProDigitizerCalibratorPanel.tsx",
      "index.ts",
      "pro-digitizer-hid-engine.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles).toHaveLength(4);

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lineCount = src.split(/\r?\n/).length;
      expect(lineCount).toBeLessThanOrEqual(800);
      expect(src).not.toMatch(/:\s*any\b/u);
      expect(src).not.toMatch(/\bas\s+any\b/u);

      if (file !== "pro-digitizer-hid-engine.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      }

      if (file === "StudioProDigitizerCalibratorPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
      }
    }
  });
});
