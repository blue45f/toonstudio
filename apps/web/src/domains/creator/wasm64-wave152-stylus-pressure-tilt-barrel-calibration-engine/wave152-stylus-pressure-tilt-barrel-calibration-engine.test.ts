import { describe, expect, it } from "vitest";
import {
  auditPressureCurveMonotonicity,
  buildMonotonePressureCurve,
  buildPresetPressureCurve,
  buildStylusCalibrationBundle,
  buildSyntheticBenchmarkStylusStroke,
  compareFixedEmaVsOneEuroStylus,
  computeCalibrationManifestSha256Hex,
  computeChiselNibStampGeometry,
  escapeStylusCalibrationXml,
  evaluatePressureCurve,
  filterStylusStrokeOneEuro,
  forceGfToNormalizedPressure,
  getStylusHardwareProfile,
  listStylusHardwareProfiles,
  measureDeviceRoundTripAccuracy,
  normalizedPressureToForceGf,
  quantizeStylusPressure,
  renderStylusCalibrationAuditSvg,
  resolveEffectiveNibRotationDeg,
  resolveStylusHardwareProfile,
  sha256StylusUtf8Hex,
  STYLUS_HARDWARE_IDS,
  STYLUS_PRESSURE_CURVE_PRESETS,
  summarizeStylusCalibrationKo,
  tiltXYToAltitudeAzimuthDeg,
  translateStylusPressureAcrossDevices,
  unwrapBarrelRollAnglesDeg,
  type PressureCurvePresetId,
  type StylusRawStrokeSample,
} from "./index";

describe("Wave 152 — 스타일러스 필압·기울기·배럴 롤 캘리브레이션 & 기기 호환 변환기", () => {
  describe("1. 4종 스타일러스 정본 하드웨어 프로파일", () => {
    it("Wacom Pro Pen 3 프로파일이 8192단계·1g 초저초기활성하중 기준을 충족한다", () => {
      const wacom = getStylusHardwareProfile("wacom-pro-pen-3");
      expect(wacom.pressureLevels).toBe(8192);
      expect(wacom.initialActivationForceGf).toBe(1);
      expect(wacom.maxForceGf).toBe(500);
      expect(wacom.nativeForceGamma).toBe(1.0);
      expect(wacom.supportsBarrelRoll).toBe(false);
      expect(wacom.pollingHz).toBeGreaterThanOrEqual(240);
    });

    it("Apple Pencil Pro 프로파일이 배럴 롤과 스퀴즈를 모두 지원하고 65° 최대 기울기를 가진다", () => {
      const pencil = getStylusHardwareProfile("apple-pencil-pro");
      expect(pencil.supportsBarrelRoll).toBe(true);
      expect(pencil.supportsSqueeze).toBe(true);
      expect(pencil.initialActivationForceGf).toBeGreaterThan(1);
      expect(pencil.maxTiltDeg).toBe(65);
      expect(pencil.pressureLevels).toBe(4096);
    });

    it("4종 프로파일 목록이 고정 순서로 반환되고 Samsung S-Pen(4096)과 Huion PW550(8192) 특성이 유효하다", () => {
      const all = listStylusHardwareProfiles();
      expect(all.map((p) => p.id)).toEqual(STYLUS_HARDWARE_IDS);
      const spen = getStylusHardwareProfile("samsung-s-pen");
      const huion = getStylusHardwareProfile("huion-pw550");
      expect(spen.pressureLevels).toBe(4096);
      expect(spen.supportsBarrelRoll).toBe(false);
      expect(huion.pressureLevels).toBe(8192);
      expect(huion.pollingHz).toBe(300);
    });

    it("사용자 정의 프로파일에 비정상 NaN·음수·역전 하중이 들어와도 안전하게 정규화한다", () => {
      const resolved = resolveStylusHardwareProfile({
        id: "wacom-pro-pen-3",
        displayName: "Custom Pen",
        displayNameKo: "커스텀 펜",
        manufacturer: "Custom",
        initialActivationForceGf: Number.NaN,
        maxForceGf: -50,
        pressureLevels: Number.POSITIVE_INFINITY,
        nativeForceGamma: -2,
        maxTiltDeg: 999,
        supportsBarrelRoll: true,
        supportsSqueeze: false,
        pollingHz: 0,
        typicalHoverHeightMm: -10,
        studioNotesKo: "테스트",
      });
      expect(resolved.initialActivationForceGf).toBeGreaterThan(0);
      expect(resolved.maxForceGf).toBeGreaterThan(resolved.initialActivationForceGf);
      expect(resolved.nativeForceGamma).toBeGreaterThan(0);
      expect(resolved.maxTiltDeg).toBeLessThanOrEqual(85);
      expect(resolved.pollingHz).toBeGreaterThanOrEqual(30);
    });
  });

  describe("2. Fritsch-Carlson 단조 3차 에르미트 필압 전송 곡선", () => {
    it("가파른 G-Pen 스냅 S-커브에서 1000-샘플 전역 단조 비감소 및 오버슈트 0건을 보장한다", () => {
      const curve = buildMonotonePressureCurve(STYLUS_PRESSURE_CURVE_PRESETS["g-pen-ink-snap"], {
        name: "g-pen-snap",
      });
      const audit = auditPressureCurveMonotonicity(curve, 1000);
      expect(audit.sampleCount).toBe(1000);
      expect(audit.isGloballyMonotoneNonDecreasing).toBe(true);
      expect(audit.violationCount).toBe(0);
      expect(audit.overshootCount).toBe(0);
      expect(audit.minOutput).toBeGreaterThanOrEqual(0);
      expect(audit.maxOutput).toBeLessThanOrEqual(1);
    });

    it("평탄 구간(plateau)과 급경사가 공존하는 계단형 제어점에서도 오버슈트 없이 평탄을 유지한다", () => {
      const curve = buildMonotonePressureCurve([
        { x: 0, y: 0 },
        { x: 0.2, y: 0.05 },
        { x: 0.35, y: 0.5 },
        { x: 0.65, y: 0.5 },
        { x: 0.72, y: 0.96 },
        { x: 1, y: 1 },
      ]);
      const audit = auditPressureCurveMonotonicity(curve, 1000);
      expect(audit.isGloballyMonotoneNonDecreasing).toBe(true);
      expect(audit.violationCount).toBe(0);
      expect(audit.overshootCount).toBe(0);
      // 평탄 구간 [0.35, 0.65] 내부는 정확히 0.5를 유지해야 함
      expect(evaluatePressureCurve(curve, 0.45)).toBeCloseTo(0.5, 10);
      expect(evaluatePressureCurve(curve, 0.55)).toBeCloseTo(0.5, 10);
    });

    it("비균등 제어점 간격에서도 제어점을 정확히 통과하며 전역 단조성을 지킨다", () => {
      const pts = [
        { x: 0, y: 0 },
        { x: 0.05, y: 0.25 },
        { x: 0.12, y: 0.35 },
        { x: 0.88, y: 0.72 },
        { x: 0.96, y: 0.98 },
        { x: 1, y: 1 },
      ];
      const curve = buildMonotonePressureCurve(pts);
      for (const pt of pts) {
        expect(evaluatePressureCurve(curve, pt.x)).toBeCloseTo(pt.y, 10);
      }
      expect(auditPressureCurveMonotonicity(curve, 1000).isGloballyMonotoneNonDecreasing).toBe(
        true,
      );
    });

    it("내장 5종 프리셋 곡선 모두가 1000-샘플 단조성 감사를 통과한다", () => {
      const presetIds: readonly PressureCurvePresetId[] = [
        "linear",
        "soft-light-hand",
        "firm-heavy-hand",
        "g-pen-ink-snap",
        "pencil-shading-s-curve",
      ];
      for (const id of presetIds) {
        const curve = buildPresetPressureCurve(id);
        const audit = auditPressureCurveMonotonicity(curve, 1000);
        expect(audit.isGloballyMonotoneNonDecreasing).toBe(true);
        expect(audit.violationCount).toBe(0);
        expect(audit.overshootCount).toBe(0);
      }
    });

    it("비단조(하락)·비정렬·중복 x·NaN 포함 제어점이 들어와도 단조 곡선으로 안전 보정한다", () => {
      const curve = buildMonotonePressureCurve([
        { x: 0.7, y: 0.4 },
        { x: 0.3, y: 0.6 },
        { x: 0.3, y: 0.55 },
        { x: Number.NaN, y: 0.2 },
        { x: 1.5, y: 1.8 },
      ]);
      expect(curve.sanitizedInputCount).toBeGreaterThanOrEqual(2);
      expect(curve.enforcedMonotonicityCount).toBeGreaterThanOrEqual(1);
      const audit = auditPressureCurveMonotonicity(curve, 1000);
      expect(audit.isGloballyMonotoneNonDecreasing).toBe(true);
      expect(audit.overshootCount).toBe(0);
    });

    it("evaluatePressureCurve가 NaN, Infinity, 음수, 1 초과 입력을 안전하게 방어한다", () => {
      const curve = buildPresetPressureCurve("soft-light-hand");
      expect(evaluatePressureCurve(curve, Number.NaN)).toBe(0);
      expect(evaluatePressureCurve(curve, Number.POSITIVE_INFINITY)).toBe(0);
      expect(evaluatePressureCurve(curve, Number.NEGATIVE_INFINITY)).toBe(0);
      expect(evaluatePressureCurve(curve, -0.5)).toBe(0);
      expect(evaluatePressureCurve(curve, 2.5)).toBe(1);
    });
  });

  describe("3. 기기 간 물리 하중(gf) 기반 필압 일관성 변환기", () => {
    it("Wacom Pro Pen 3 ↔ Apple Pencil Pro 공유 하중 범위 왕복(A → B → A) 오차가 1e-4 미만이다", () => {
      const report = measureDeviceRoundTripAccuracy("wacom-pro-pen-3", "apple-pencil-pro", 250);
      expect(report.sharedForceMinGf).toBe(8);
      expect(report.sharedForceMaxGf).toBe(420);
      expect(report.maxRoundTripError).toBeLessThan(1e-4);
      expect(report.passesStrictThreshold).toBe(true);

      const reverse = measureDeviceRoundTripAccuracy("apple-pencil-pro", "wacom-pro-pen-3", 250);
      expect(reverse.maxRoundTripError).toBeLessThan(1e-4);
      expect(reverse.passesStrictThreshold).toBe(true);
    });

    it("Apple Pencil Pro ↔ Samsung S-Pen 공유 하중 구간 왕복 오차가 1e-4 미만이다", () => {
      const report = measureDeviceRoundTripAccuracy("apple-pencil-pro", "samsung-s-pen", 200);
      expect(report.sharedForceMinGf).toBe(8);
      expect(report.sharedForceMaxGf).toBe(380);
      expect(report.maxRoundTripError).toBeLessThan(1e-4);
      expect(report.passesStrictThreshold).toBe(true);
    });

    it("Wacom Pro Pen 3 ↔ Huion PW550 공유 하중 구간 왕복 오차가 1e-4 미만이다", () => {
      const report = measureDeviceRoundTripAccuracy("wacom-pro-pen-3", "huion-pw550", 200);
      expect(report.sharedForceMinGf).toBe(2);
      expect(report.sharedForceMaxGf).toBe(500);
      expect(report.maxRoundTripError).toBeLessThan(1e-4);
      expect(report.passesStrictThreshold).toBe(true);
    });

    it("Samsung S-Pen ↔ Huion PW550 공유 하중 구간 왕복 오차가 1e-4 미만이다", () => {
      const report = measureDeviceRoundTripAccuracy("samsung-s-pen", "huion-pw550", 200);
      expect(report.maxRoundTripError).toBeLessThan(1e-4);
      expect(report.passesStrictThreshold).toBe(true);
    });

    it("Wacom 초저하중(3gf)을 Apple Pencil Pro(IAF 8gf)로 매핑하면 하한 데드존 클램핑을 명시한다", () => {
      const wacomLowP = forceGfToNormalizedPressure(3, "wacom-pro-pen-3");
      const translated = translateStylusPressureAcrossDevices({
        sourceDevice: "wacom-pro-pen-3",
        targetDevice: "apple-pencil-pro",
        sourcePressure: wacomLowP,
      });
      expect(translated.physicalForceGf).toBeCloseTo(3, 6);
      expect(translated.targetPressure).toBe(0);
      expect(translated.clampedBelowIaf).toBe(true);
      expect(translated.inSharedForceRange).toBe(false);
      expect(translated.deadZoneDeficitGf).toBeCloseTo(5, 6);
    });

    it("Wacom 고하중(480gf)을 Apple Pencil Pro(최대 420gf)로 매핑하면 상한 포화를 명시한다", () => {
      const wacomHighP = forceGfToNormalizedPressure(480, "wacom-pro-pen-3");
      const translated = translateStylusPressureAcrossDevices({
        sourceDevice: "wacom-pro-pen-3",
        targetDevice: "apple-pencil-pro",
        sourcePressure: wacomHighP,
      });
      expect(translated.physicalForceGf).toBeCloseTo(480, 6);
      expect(translated.targetPressure).toBe(1);
      expect(translated.clampedAboveMaxForce).toBe(true);
      expect(translated.inSharedForceRange).toBe(false);
    });

    it("하드웨어 단계 양자화 및 작가 커스텀 필압 곡선 결합(effectiveBrushPressure)이 정확히 동작한다", () => {
      const softCurve = buildPresetPressureCurve("soft-light-hand");
      const translated = translateStylusPressureAcrossDevices({
        sourceDevice: "wacom-pro-pen-3",
        targetDevice: "apple-pencil-pro",
        sourcePressure: 0.4,
        artistCurve: softCurve,
      });
      expect(translated.targetPressureStep).toBeGreaterThan(0);
      expect(translated.targetPressureStep).toBeLessThan(4096);
      expect(Math.abs(translated.targetPressureQuantized - translated.targetPressure)).toBeLessThan(
        1 / 4095,
      );
      expect(translated.effectiveBrushPressure).toBeGreaterThan(translated.targetPressure);
      expect(quantizeStylusPressure(1, 8192).discreteStep).toBe(8191);
    });

    it("물리 하중 복원 및 역매핑이 0, 1, NaN, 음수 입력을 안전하게 처리한다", () => {
      expect(normalizedPressureToForceGf(0, "wacom-pro-pen-3")).toBe(0);
      expect(normalizedPressureToForceGf(Number.NaN, "wacom-pro-pen-3")).toBe(0);
      expect(normalizedPressureToForceGf(-1, "wacom-pro-pen-3")).toBe(0);
      expect(normalizedPressureToForceGf(1, "wacom-pro-pen-3")).toBe(500);
      expect(forceGfToNormalizedPressure(Number.NaN, "apple-pencil-pro")).toBe(0);
      expect(forceGfToNormalizedPressure(Number.NEGATIVE_INFINITY, "apple-pencil-pro")).toBe(0);
      expect(forceGfToNormalizedPressure(9999, "apple-pencil-pro")).toBe(1);
    });
  });

  describe("4. 배럴 롤 최단각 연속 언랩(360° 플립 0건) 및 미지원 기기 폴백", () => {
    it("359° → 1° 정방향 경계 통과 시 359° → 361°로 연속 언랩하고 360° 플립 0건을 보장한다", () => {
      const res = unwrapBarrelRollAnglesDeg([355, 359, 1, 5]);
      expect(res.unwrappedAnglesDeg).toEqual([355, 359, 361, 365]);
      expect(res.stepDeltasDeg).toEqual([4, 2, 4]);
      expect(res.rawWrapJumpCount).toBe(1);
      expect(res.flipGlitchCount).toBe(0);
      expect(res.maxAbsStepDeg).toBe(4);
    });

    it("1° → 359° 역방향 경계 통과 시 1° → -1°로 연속 언랩하고 360° 플립 0건을 보장한다", () => {
      const res = unwrapBarrelRollAnglesDeg([4, 1, 359, 356]);
      expect(res.unwrappedAnglesDeg).toEqual([4, 1, -1, -4]);
      expect(res.stepDeltasDeg).toEqual([-3, -2, -3]);
      expect(res.rawWrapJumpCount).toBe(1);
      expect(res.flipGlitchCount).toBe(0);
      expect(res.maxAbsStepDeg).toBe(3);
    });

    it("358° → 2° 경계 왕복 및 720° 다회전 스핀에서 스텝 변화 <= 180°와 플립 0건을 유지한다", () => {
      const spin = [0, 90, 180, 270, 358, 2, 95, 185, 275, 359, 1, 359, 356];
      const res = unwrapBarrelRollAnglesDeg(spin);
      expect(res.flipGlitchCount).toBe(0);
      expect(res.maxAbsStepDeg).toBeLessThanOrEqual(180);
      expect(res.rawWrapJumpCount).toBeGreaterThanOrEqual(3);
      expect(res.totalRotationDeg).toBeCloseTo(716, 6);
    });

    it("빈 배열·단일 각도·NaN/Infinity 포함 시퀀스에서도 결정론적으로 안전 언랩한다", () => {
      expect(unwrapBarrelRollAnglesDeg([]).unwrappedAnglesDeg).toEqual([]);
      expect(unwrapBarrelRollAnglesDeg([42]).unwrappedAnglesDeg).toEqual([42]);
      const dirty = unwrapBarrelRollAnglesDeg([358, Number.NaN, 2, Number.POSITIVE_INFINITY, 5]);
      expect(dirty.sanitizedSampleCount).toBe(2);
      expect(dirty.flipGlitchCount).toBe(0);
      expect(dirty.unwrappedAnglesDeg).toEqual([358, 358, 362, 362, 365]);
    });

    it("Apple Pencil Pro는 하드웨어 배럴 롤 각도를 직접 사용한다", () => {
      const rot = resolveEffectiveNibRotationDeg({
        device: "apple-pencil-pro",
        barrelRollDeg: 132,
        tiltAzimuthDeg: 45,
        altitudeDeg: 50,
        strokeTangentDeg: 10,
      });
      expect(rot.rotationSource).toBe("hardware-barrel-roll");
      expect(rot.usedFallback).toBe(false);
      expect(rot.effectiveNibRotationDeg).toBe(132);
    });

    it("배럴 롤 미지원 기기(S-Pen·Huion·Wacom Pro Pen 3)는 기울기 방위각으로 결정론적 폴백한다", () => {
      for (const id of ["samsung-s-pen", "huion-pw550", "wacom-pro-pen-3"] as const) {
        const rot = resolveEffectiveNibRotationDeg({
          device: id,
          barrelRollDeg: 210,
          tiltAzimuthDeg: 64,
          altitudeDeg: 48,
          strokeTangentDeg: 15,
        });
        expect(rot.rotationSource).toBe("tilt-azimuth-fallback");
        expect(rot.usedFallback).toBe(true);
        expect(rot.effectiveNibRotationDeg).toBe(64);
      }
    });

    it("수직 펜(90°)으로 방위각이 무의미하거나 누락되면 스트로크 접선→고정 각도 순으로 폴백한다", () => {
      const tangentFallback = resolveEffectiveNibRotationDeg({
        device: "samsung-s-pen",
        altitudeDeg: 90,
        tiltAzimuthDeg: 140,
        strokeTangentDeg: 28,
      });
      expect(tangentFallback.rotationSource).toBe("stroke-tangent-fallback");
      expect(tangentFallback.effectiveNibRotationDeg).toBe(28);

      const fixedFallback = resolveEffectiveNibRotationDeg({
        device: "huion-pw550",
        altitudeDeg: 90,
        fixedNibAngleDeg: 35,
      });
      expect(fixedFallback.rotationSource).toBe("fixed-angle-fallback");
      expect(fixedFallback.effectiveNibRotationDeg).toBe(35);
    });
  });

  describe("5. 기울기-치즐 닙 이방성 및 PointerEvent tiltXY 변환", () => {
    it("수직(altitudeDeg = 90°)에서는 원형 스탬프(aspectRatio = 1.0)를 산출한다", () => {
      const stamp = computeChiselNibStampGeometry({
        device: "apple-pencil-pro",
        baseBrushSizePx: 16,
        pressure: 0.7,
        altitudeDeg: 90,
        azimuthDeg: 40,
        barrelRollDeg: 120,
        nibStyle: "flat-chisel",
      });
      expect(stamp.aspectRatio).toBeCloseTo(1.0, 6);
      expect(stamp.majorWidthPx).toBeCloseTo(stamp.minorWidthPx, 6);
      expect(stamp.isNearCircular).toBe(true);
      expect(stamp.tiltFactor).toBeCloseTo(0, 6);
    });

    it("저고도(altitudeDeg = 22°)로 기울이면 넓은 납작 셰이딩 스탬프(aspectRatio > 3)를 산출한다", () => {
      const stamp = computeChiselNibStampGeometry({
        device: "apple-pencil-pro",
        baseBrushSizePx: 16,
        pressure: 0.7,
        altitudeDeg: 22,
        azimuthDeg: 40,
        barrelRollDeg: 120,
        nibStyle: "flat-chisel",
      });
      expect(stamp.majorWidthPx).toBeGreaterThan(stamp.minorWidthPx * 3);
      expect(stamp.aspectRatio).toBeGreaterThan(3);
      expect(stamp.isNearCircular).toBe(false);
      expect(stamp.stampRotationDeg).toBe(120);
      expect(stamp.shadingCoverageFactor).toBeGreaterThan(0.6);
    });

    it("고도각이 90° → 60° → 35° → 15°로 낮아질수록 장축 폭과 종횡비가 단조 증가한다", () => {
      const altitudes = [90, 60, 35, 15];
      const stamps = altitudes.map((altitudeDeg) =>
        computeChiselNibStampGeometry({
          device: "samsung-s-pen",
          baseBrushSizePx: 14,
          pressure: 0.6,
          altitudeDeg,
          azimuthDeg: 50,
        }),
      );
      for (let i = 1; i < stamps.length; i += 1) {
        const prev = stamps[i - 1];
        const curr = stamps[i];
        expect(prev).toBeDefined();
        expect(curr).toBeDefined();
        if (prev !== undefined && curr !== undefined) {
          expect(curr.majorWidthPx).toBeGreaterThan(prev.majorWidthPx);
          expect(curr.aspectRatio).toBeGreaterThan(prev.aspectRatio);
          expect(curr.shadingCoverageFactor).toBeGreaterThan(prev.shadingCoverageFactor);
        }
      }
    });

    it("필압이 높아질수록 치즐 닙 스탬프 폭과 접촉 면적이 단조 증가한다", () => {
      const light = computeChiselNibStampGeometry({
        baseBrushSizePx: 20,
        pressure: 0.2,
        altitudeDeg: 45,
        azimuthDeg: 30,
      });
      const heavy = computeChiselNibStampGeometry({
        baseBrushSizePx: 20,
        pressure: 0.9,
        altitudeDeg: 45,
        azimuthDeg: 30,
      });
      expect(heavy.majorWidthPx).toBeGreaterThan(light.majorWidthPx);
      expect(heavy.contactAreaPx2).toBeGreaterThan(light.contactAreaPx2);
    });

    it("calligraphy-broad 스타일과 tiltXYToAltitudeAzimuthDeg 구면 변환이 정확히 계산된다", () => {
      const broadVertical = computeChiselNibStampGeometry({
        baseBrushSizePx: 16,
        pressure: 0.6,
        altitudeDeg: 90,
        azimuthDeg: 25,
        nibStyle: "calligraphy-broad",
      });
      expect(broadVertical.aspectRatio).toBeGreaterThan(2.5);

      const upright = tiltXYToAltitudeAzimuthDeg(0, 0);
      expect(upright.altitudeDeg).toBe(90);
      expect(upright.tiltFromVerticalDeg).toBe(0);

      const tiltedX = tiltXYToAltitudeAzimuthDeg(60, 0);
      expect(tiltedX.altitudeDeg).toBeCloseTo(30, 4);
      expect(tiltedX.azimuthDeg).toBeCloseTo(0, 4);

      const tiltedY = tiltXYToAltitudeAzimuthDeg(0, 45);
      expect(tiltedY.altitudeDeg).toBeCloseTo(45, 4);
      expect(tiltedY.azimuthDeg).toBeCloseTo(90, 4);
    });

    it("치즐 닙 기하 계산이 NaN·음수·극단 고도각 입력에도 유한 양수 치수를 보장한다", () => {
      const stamp = computeChiselNibStampGeometry({
        baseBrushSizePx: Number.NaN,
        pressure: Number.POSITIVE_INFINITY,
        altitudeDeg: -45,
        azimuthDeg: Number.NaN,
        barrelRollDeg: Number.NEGATIVE_INFINITY,
      });
      expect(Number.isFinite(stamp.majorWidthPx)).toBe(true);
      expect(stamp.majorWidthPx).toBeGreaterThan(0);
      expect(Number.isFinite(stamp.minorWidthPx)).toBe(true);
      expect(stamp.minorWidthPx).toBeGreaterThan(0);
      expect(stamp.clampedAltitudeDeg).toBe(0);
    });
  });

  describe("6. 속도 적응 One-Euro 지터 필터 및 고정 EMA 대조", () => {
    it("저속 정밀 선화 구간에서 손떨림 지터 RMS를 50% 이상 크게 억제한다", () => {
      const slowSamples: StylusRawStrokeSample[] = [];
      const hz = 240;
      for (let i = 0; i < 140; i += 1) {
        slowSamples.push({
          x: 10 + (i * 55) / hz + Math.sin(i * 2.1) * 1.6,
          y: 50 + (i * 10) / hz + Math.cos(i * 2.5) * 2.2,
          timestampMs: (i * 1000) / hz,
          pressure: 0.45,
        });
      }
      const res = filterStylusStrokeOneEuro(slowSamples);
      expect(res.jitterReductionPercent).toBeGreaterThan(50);
      expect(res.lowSpeedJitterReductionPercent).toBeGreaterThan(60);
      expect(res.filteredJitterRmsPx).toBeLessThan(res.rawJitterRmsPx * 0.4);
    });

    it("고속 휘두름 구간에서 컷오프 주파수를 높여 펜끝 지연(highSpeedLagPx)을 낮게 유지한다", () => {
      const stroke = buildSyntheticBenchmarkStylusStroke(240);
      const res = filterStylusStrokeOneEuro(stroke);
      const slowSample = res.filteredSamples[50];
      const fastSample = res.filteredSamples[res.filteredSamples.length - 5];
      expect(slowSample).toBeDefined();
      expect(fastSample).toBeDefined();
      if (slowSample !== undefined && fastSample !== undefined) {
        expect(fastSample.effectiveCutoffHz).toBeGreaterThan(slowSample.effectiveCutoffHz * 5);
      }
      expect(res.highSpeedLagPx).toBeLessThan(10);
    });

    it("단순 고정 EMA 대비 One-Euro가 저속 안정성을 지키며 고속 지연을 크게 단축한다", () => {
      const stroke = buildSyntheticBenchmarkStylusStroke(240);
      const cmp = compareFixedEmaVsOneEuroStylus(stroke, { fixedEmaAlpha: 0.08 });
      expect(cmp.oneEuroOutperformsFixedEma).toBe(true);
      expect(cmp.oneEuro.lowSpeedJitterReductionPercent).toBeGreaterThan(50);
      expect(cmp.oneEuro.highSpeedLagPx).toBeLessThan(cmp.fixedEma.highSpeedLagPx * 0.3);
      expect(cmp.highSpeedLagRatio).toBeGreaterThan(3);
    });

    it("One-Euro 필터가 배럴 롤 358° → 2° 경계를 플립 없이 언랩하고 필압을 [0, 1]로 유지한다", () => {
      const samples: StylusRawStrokeSample[] = [
        { x: 0, y: 0, timestampMs: 0, pressure: 0.2, barrelRollDeg: 356 },
        { x: 5, y: 1, timestampMs: 4, pressure: 0.5, barrelRollDeg: 358 },
        { x: 10, y: 2, timestampMs: 8, pressure: 0.9, barrelRollDeg: 2 },
        { x: 15, y: 3, timestampMs: 12, pressure: 1.4, barrelRollDeg: 6 },
      ];
      const res = filterStylusStrokeOneEuro(samples);
      const unwrapped = res.filteredSamples.map((s) => s.unwrappedBarrelRollDeg);
      expect(unwrapped).toEqual([356, 358, 362, 366]);
      for (const s of res.filteredSamples) {
        expect(s.pressure).toBeGreaterThanOrEqual(0);
        expect(s.pressure).toBeLessThanOrEqual(1);
      }
    });

    it("빈 스트로크·단일 포인트·비단조 타임스탬프·NaN 좌표를 예외 없이 방어한다", () => {
      expect(filterStylusStrokeOneEuro([]).filteredSamples).toEqual([]);
      expect(
        filterStylusStrokeOneEuro([{ x: 10, y: 20, timestampMs: 0 }]).filteredSamples,
      ).toHaveLength(1);

      const dirty: StylusRawStrokeSample[] = [
        { x: 10, y: 20, timestampMs: 100, pressure: 0.5 },
        { x: Number.NaN, y: Number.POSITIVE_INFINITY, timestampMs: 100, pressure: Number.NaN },
        { x: 15, y: 22, timestampMs: 80, pressure: 0.6 },
        { x: 20, y: 25, timestampMs: Number.NaN, pressure: 0.7 },
      ];
      const res = filterStylusStrokeOneEuro(dirty);
      expect(res.sanitizedFieldCount).toBeGreaterThanOrEqual(4);
      expect(res.nonMonotonicTimestampCount).toBeGreaterThanOrEqual(2);
      for (const s of res.filteredSamples) {
        expect(Number.isFinite(s.x)).toBe(true);
        expect(Number.isFinite(s.y)).toBe(true);
        expect(Number.isFinite(s.timestampMs)).toBe(true);
      }
    });
  });

  describe("7. FIPS 180-4 SHA-256 결정론 및 매니페스트 지문", () => {
    it("표준 NIST FIPS 180-4 테스트 벡터(빈 문자열·'abc')와 정확히 일치한다", () => {
      expect(sha256StylusUtf8Hex("")).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
      expect(sha256StylusUtf8Hex("abc")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
      expect(sha256StylusUtf8Hex("와콤-애플펜슬-보정")).toMatch(/^[0-9a-f]{64}$/);
    });

    it("키 삽입 순서가 다른 동일 매니페스트에 동일한 SHA-256 지문을 생성하고 값 변경 시 지문이 바뀐다", () => {
      const a = computeCalibrationManifestSha256Hex({
        target: "apple-pencil-pro",
        source: "wacom-pro-pen-3",
        meta: { beta: 0.035, minCutoff: 1.0 },
      });
      const b = computeCalibrationManifestSha256Hex({
        meta: { minCutoff: 1.0, beta: 0.035 },
        source: "wacom-pro-pen-3",
        target: "apple-pencil-pro",
      });
      const c = computeCalibrationManifestSha256Hex({
        meta: { minCutoff: 1.2, beta: 0.035 },
        source: "wacom-pro-pen-3",
        target: "apple-pencil-pro",
      });
      expect(a).toBe(b);
      expect(a).not.toBe(c);
      expect(a).toMatch(/^[0-9a-f]{64}$/);

      const bundle1 = buildStylusCalibrationBundle({
        sourceDevice: "wacom-pro-pen-3",
        targetDevice: "apple-pencil-pro",
      });
      const bundle2 = buildStylusCalibrationBundle({
        sourceDevice: "wacom-pro-pen-3",
        targetDevice: "apple-pencil-pro",
      });
      expect(bundle1.calibrationManifestSha256Hex).toBe(bundle2.calibrationManifestSha256Hex);
      expect(bundle1.calibrationManifestSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("8. 순수 OKLCH 감사 SVG, XML/XSS 이스케이프 및 한국어 QA 브리프", () => {
    it("SVG 출력이 순수 oklch(...)만 사용하고 원시 hex/rgb/hsl 및 NaN/Infinity가 0건이다", () => {
      const bundle = buildStylusCalibrationBundle({
        sourceDevice: "wacom-pro-pen-3",
        targetDevice: "apple-pencil-pro",
      });
      const svg = renderStylusCalibrationAuditSvg(bundle);
      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain("oklch(");
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(svg).not.toMatch(/\brgba?\s*\(/i);
      expect(svg).not.toMatch(/\bhsla?\s*\(/i);
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("Infinity");
      expect(svg).toContain("Wacom Pro Pen 3");
      expect(svg).toContain("Apple Pencil Pro");
      expect(svg).toContain("360° 플립 0건");
    });

    it("SVG 제목·곡선명에 스크립트/XML 특수문자가 들어가도 안전하게 이스케이프하고 한국어 QA 브리프에 번역투가 없다", () => {
      const malicious = `<script>alert("xss"&'1')</script>`;
      expect(escapeStylusCalibrationXml(malicious)).toBe(
        "&lt;script&gt;alert(&quot;xss&quot;&amp;&apos;1&apos;)&lt;/script&gt;",
      );

      const bundle = buildStylusCalibrationBundle({
        sourceDevice: "wacom-pro-pen-3",
        targetDevice: "samsung-s-pen",
        pressureCurveName: malicious,
      });
      const svg = renderStylusCalibrationAuditSvg(bundle, { title: malicious });
      expect(svg).not.toContain("<script>");
      expect(svg).toContain("&lt;script&gt;");

      const report = summarizeStylusCalibrationKo(bundle);
      expect(report.manifestSha256Hex).toBe(bundle.calibrationManifestSha256Hex);
      expect(report.headlineKo).toContain("와콤 프로 펜 3");
      expect(report.headlineKo).toContain("삼성 S펜");
      expect(report.barrelAndTiltNoteKo).toContain("기울기 방위각 폴백");
      expect(report.actionItemsKo.length).toBeGreaterThanOrEqual(1);
      expect(report.fullBriefTextKo).toContain(bundle.calibrationManifestSha256Hex);
      // 번역투 금지 표현 검증
      expect(report.fullBriefTextKo).not.toContain("가능하게 합니다");
      expect(report.fullBriefTextKo).not.toContain("직관적인 경험을 제공");
      expect(report.fullBriefTextKo).not.toContain("원활한 워크플로우를 보장");
    });
  });
});
