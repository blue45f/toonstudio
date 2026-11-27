/**
 * Wave 60: 실시간 펜촉 탄성·슬릿(Tine) 벌어짐·비대칭 편마모 및 적응형 보정 물리 커널.
 *
 * - G펜·마루펜·연필(2B/HB)·붓펜·마커 6종 필기구의 탄성 계수, 좌우 슬릿 벌어짐(`tineSplitMm`),
 *   기울기 기반 접촉 면적, 점탄성 복원 이력(hysteresis)을 실시간 연산한다.
 * - 누적 필기 거리·수직 하중·기울기·방위각·종이 연마도에 따른 Archard 비대칭 편마모(`NibWearState`)를
 *   추적하며, 과도한 편마모 자동 보정(`auto-heal`), '길들여진 펜촉' 프리셋 잠금(`lock-broken-in`),
 *   새 펜촉 교체(`factory-reset`)를 `compensateAdaptiveNibWear`로 제공한다.
 */

export const MM_PER_METER = 1_000 as const;
export const MAX_STYLUS_NORMAL_FORCE_N = 4.2 as const;
export const DEFAULT_OVER_WEAR_ASYMMETRY_THRESHOLD = 0.24 as const;
export const DEFAULT_OVER_WEAR_SEVERITY_THRESHOLD = 0.42 as const;
export const SWEET_SPOT_BREAK_IN_PROGRESS = 0.48 as const;

export type NibPresetId =
  | "g-pen"
  | "maru-pen"
  | "pencil-2b"
  | "pencil-hb"
  | "brush-pen"
  | "marker";

export type NibWearCompensationMode =
  | "auto-heal"
  | "lock-broken-in"
  | "factory-reset";

export interface NibMechanicalSpec {
  readonly id: NibPresetId;
  readonly labelKo: string;
  readonly hasSplitTines: boolean;
  readonly baseTipWidthMm: number;
  readonly maxTineSplitMm: number;
  readonly splitPreloadPressure: number;
  readonly splitHillExponent: number;
  readonly splitHalfPressure: number;
  readonly maxBodySplayMm: number;
  readonly springStiffnessNPerMm: number;
  readonly viscoelasticRelaxMs: number;
  readonly baseWearRateUmPerMeter: number;
  readonly sweetSpotWearUm: number;
  readonly maxServiceWearUm: number;
  readonly tiltFootprintGain: number;
  readonly pushSnagSensitivity: number;
}

export interface NibWearState {
  readonly nibId: NibPresetId;
  readonly cumulativeDistanceMm: number;
  readonly cumulativeWearWorkJ: number;
  readonly leftTineWearUm: number;
  readonly rightTineWearUm: number;
  readonly centerTipWearUm: number;
  readonly flatSpotMm: number;
  readonly asymmetryBias: number;
  readonly dominantWearAzimuthDeg: number;
  readonly breakInProgress: number;
  readonly overWearSeverity: number;
  readonly wearProfilePresetLocked: boolean;
  readonly lockedSnapshotId: string | null;
}

export interface BrokenInNibPreset {
  readonly presetId: string;
  readonly labelKo: string;
  readonly nibId: NibPresetId;
  readonly lockedState: NibWearState;
  readonly targetSweetSpotBreakIn: number;
  readonly preserveAsymmetryRatio: number;
}

export interface NibMechanicsInput {
  readonly wearState: NibWearState;
  /** 정규화 스타일러스 필압 (`0..1`). */
  readonly pressure: number;
  /** 수직축 기준 펜 기울기 각도 (`0°` 직립 .. `80°` 눕힘, 기본 `28°`). */
  readonly tiltDeg?: number;
  /** 펜대 기울임 방위각 (`0..360°`, 기본 `45°`). */
  readonly azimuthDeg?: number;
  /** 캔버스 상 스트로크 진행 방향 (`0..360°`). */
  readonly strokeDirectionDeg?: number;
  /** 현재 시뮬레이션 스텝 이동 거리 (`mm`, `>= 0`). */
  readonly stepDistanceMm: number;
  /** 프레임 시간 간격 (`ms`, 기본 `8`). */
  readonly dtMs?: number;
  /** 종이 표면 연마 계수 (`0.2..2.6`, 기본 `1.0`). */
  readonly paperAbrasiveness?: number;
  readonly previousTineSplitMm?: number;
  readonly previousBodySplayMm?: number;
  /** 적용 중인 '길들여진 펜촉' 고정 프리셋 (지정 시 마모 드리프트 완전 차단). */
  readonly lockedPreset?: BrokenInNibPreset | null;
}

export interface NibMechanicsStepResult {
  readonly nextWearState: NibWearState;
  readonly tineSplitMm: number;
  readonly leftTineDeflectionMm: number;
  readonly rightTineDeflectionMm: number;
  readonly bodySplayMm: number;
  readonly effectiveStrokeWidthMm: number;
  readonly elasticRestoringForceN: number;
  readonly contactAreaMm2: number;
  readonly railroadingRisk: number;
  readonly scratchSnagFactor: number;
  readonly effectiveWearDeltaUm: number;
  readonly springHysteresisLagMm: number;
}

export interface AdaptiveNibCompensationOptions {
  readonly mode: NibWearCompensationMode;
  readonly presetId?: string;
  readonly presetLabelKo?: string;
  readonly maxAllowedAsymmetry?: number;
  readonly maxAllowedOverWearSeverity?: number;
  readonly preserveAsymmetryRatio?: number;
  readonly forceCompensate?: boolean;
}

export interface AdaptiveNibCompensationResult {
  readonly mode: NibWearCompensationMode;
  readonly compensatedState: NibWearState;
  readonly compensationApplied: boolean;
  readonly asymmetryReducedBy: number;
  readonly flatSpotRecoveredMm: number;
  readonly overWearReducedBy: number;
  readonly widthCorrectionFactor: number;
  readonly tineBalanceOffset: number;
  readonly lockedPreset: BrokenInNibPreset | null;
  readonly actionSummaryKo: string;
}

const DEG_TO_RAD = Math.PI / 180;

const NIB_MECHANICAL_SPECS: Readonly<Record<NibPresetId, NibMechanicalSpec>> = {
  "g-pen": {
    id: "g-pen",
    labelKo: "G펜 (고탄성 강철 슬릿)",
    hasSplitTines: true,
    baseTipWidthMm: 0.1,
    maxTineSplitMm: 1.32,
    splitPreloadPressure: 0.12,
    splitHillExponent: 2.35,
    splitHalfPressure: 0.52,
    maxBodySplayMm: 0.08,
    springStiffnessNPerMm: 3.1,
    viscoelasticRelaxMs: 4.5,
    baseWearRateUmPerMeter: 0.52,
    sweetSpotWearUm: 14,
    maxServiceWearUm: 46,
    tiltFootprintGain: 0.22,
    pushSnagSensitivity: 0.82,
  },
  "maru-pen": {
    id: "maru-pen",
    labelKo: "마루펜 (초세선 정밀 슬릿)",
    hasSplitTines: true,
    baseTipWidthMm: 0.05,
    maxTineSplitMm: 0.58,
    splitPreloadPressure: 0.17,
    splitHillExponent: 2.55,
    splitHalfPressure: 0.56,
    maxBodySplayMm: 0.04,
    springStiffnessNPerMm: 4.4,
    viscoelasticRelaxMs: 3.5,
    baseWearRateUmPerMeter: 0.68,
    sweetSpotWearUm: 11,
    maxServiceWearUm: 36,
    tiltFootprintGain: 0.14,
    pushSnagSensitivity: 0.94,
  },
  "pencil-2b": {
    id: "pencil-2b",
    labelKo: "2B 연필 (연질 흑연심)",
    hasSplitTines: false,
    baseTipWidthMm: 0.34,
    maxTineSplitMm: 0,
    splitPreloadPressure: 1,
    splitHillExponent: 1,
    splitHalfPressure: 1,
    maxBodySplayMm: 0.48,
    springStiffnessNPerMm: 7.5,
    viscoelasticRelaxMs: 2.0,
    baseWearRateUmPerMeter: 3.8,
    sweetSpotWearUm: 65,
    maxServiceWearUm: 220,
    tiltFootprintGain: 1.95,
    pushSnagSensitivity: 0.26,
  },
  "pencil-hb": {
    id: "pencil-hb",
    labelKo: "HB 연필 (경질 스케치심)",
    hasSplitTines: false,
    baseTipWidthMm: 0.24,
    maxTineSplitMm: 0,
    splitPreloadPressure: 1,
    splitHillExponent: 1,
    splitHalfPressure: 1,
    maxBodySplayMm: 0.24,
    springStiffnessNPerMm: 9.8,
    viscoelasticRelaxMs: 1.8,
    baseWearRateUmPerMeter: 1.85,
    sweetSpotWearUm: 45,
    maxServiceWearUm: 165,
    tiltFootprintGain: 1.25,
    pushSnagSensitivity: 0.38,
  },
  "brush-pen": {
    id: "brush-pen",
    labelKo: "붓펜 (탄성 모필 다발)",
    hasSplitTines: false,
    baseTipWidthMm: 0.16,
    maxTineSplitMm: 0,
    splitPreloadPressure: 0.05,
    splitHillExponent: 1.65,
    splitHalfPressure: 0.44,
    maxBodySplayMm: 3.6,
    springStiffnessNPerMm: 0.95,
    viscoelasticRelaxMs: 28.0,
    baseWearRateUmPerMeter: 0.34,
    sweetSpotWearUm: 16,
    maxServiceWearUm: 68,
    tiltFootprintGain: 1.15,
    pushSnagSensitivity: 0.12,
  },
  marker: {
    id: "marker",
    labelKo: "마커 (펠트 치즐/불릿 팁)",
    hasSplitTines: false,
    baseTipWidthMm: 1.65,
    maxTineSplitMm: 0,
    splitPreloadPressure: 1,
    splitHillExponent: 1,
    splitHalfPressure: 1,
    maxBodySplayMm: 0.65,
    springStiffnessNPerMm: 5.2,
    viscoelasticRelaxMs: 9.0,
    baseWearRateUmPerMeter: 0.95,
    sweetSpotWearUm: 28,
    maxServiceWearUm: 105,
    tiltFootprintGain: 1.6,
    pushSnagSensitivity: 0.08,
  },
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function normalizeAngleDeg(angleDeg: number): number {
  if (!Number.isFinite(angleDeg)) return 0;
  const wrapped = angleDeg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function deriveWearMetrics(
  spec: NibMechanicalSpec,
  leftWearUm: number,
  rightWearUm: number,
  centerWearUm: number,
): {
  readonly flatSpotMm: number;
  readonly asymmetryBias: number;
  readonly breakInProgress: number;
  readonly overWearSeverity: number;
} {
  const meanSideWearUm = (leftWearUm + rightWearUm) * 0.5;
  const effectiveWearUm = Math.max(centerWearUm, meanSideWearUm);
  const totalSideWear = leftWearUm + rightWearUm;

  // 소량 마모 노이즈로 편향값이 튀지 않도록 분모에 완충 상수(1.2 um)를 둔다.
  const rawAsymmetry =
    totalSideWear > 0 ? (rightWearUm - leftWearUm) / (totalSideWear + 1.2) : 0;
  const asymmetryBias = normalizeZero(clamp(rawAsymmetry, -1, 1));

  // 평탄면(flatSpotMm)은 팁 원뿔 단면 마모 기하(sqrt 성장)로 계산한다.
  const normalizedWear = effectiveWearUm / Math.max(spec.maxServiceWearUm, 1);
  const flatSpotScale = spec.hasSplitTines
    ? 0.24
    : spec.id === "pencil-2b" || spec.id === "pencil-hb"
      ? 0.92
      : spec.id === "marker"
        ? 0.72
        : 0.34;
  const flatSpotMm = clamp(Math.sqrt(Math.max(0, normalizedWear)) * flatSpotScale, 0, 1.8);
  const breakInProgress = clamp(effectiveWearUm / Math.max(spec.sweetSpotWearUm * 2.1, 1), 0, 1);

  const excessDepthRatio = clamp(
    (effectiveWearUm - spec.sweetSpotWearUm) / Math.max(spec.maxServiceWearUm - spec.sweetSpotWearUm, 1),
    0,
    1,
  );
  const asymmetryPenalty = clamp(Math.abs(asymmetryBias) * 0.65, 0, 0.65);
  const overWearSeverity = clamp(
    excessDepthRatio * 0.72 +
      asymmetryPenalty * excessDepthRatio +
      Math.max(0, Math.abs(asymmetryBias) - 0.22) * 0.55,
    0,
    1,
  );

  return { flatSpotMm, asymmetryBias, breakInProgress, overWearSeverity };
}

/** 등록된 6종 필기구 프리셋의 물리 사양을 반환한다. */
export function getNibMechanicalSpec(nibId: NibPresetId): NibMechanicalSpec {
  return NIB_MECHANICAL_SPECS[nibId];
}

/** 등록된 전체 필기구 프리셋 식별자 목록을 반환한다. */
export function listNibPresetIds(): readonly NibPresetId[] {
  return ["g-pen", "maru-pen", "pencil-2b", "pencil-hb", "brush-pen", "marker"];
}

/** 새 펜촉 기준 초기 마모 상태(`NibWearState`)를 생성한다. */
export function createInitialNibWearState(nibId: NibPresetId): NibWearState {
  return {
    nibId,
    cumulativeDistanceMm: 0,
    cumulativeWearWorkJ: 0,
    leftTineWearUm: 0,
    rightTineWearUm: 0,
    centerTipWearUm: 0,
    flatSpotMm: 0,
    asymmetryBias: 0,
    dominantWearAzimuthDeg: 45,
    breakInProgress: 0,
    overWearSeverity: 0,
    wearProfilePresetLocked: false,
    lockedSnapshotId: null,
  };
}

/**
 * 현재 펜촉 상태를 작가 전용 '길들여진 펜촉' 프리셋으로 잠근다.
 * 잠긴 상태는 후속 `stepNibMechanics` 호출에서 마모가 더 이상 진행되지 않도록 고정된다.
 */
export function lockBrokenInNibPreset(
  wearState: NibWearState,
  presetId: string,
  labelKo: string,
  preserveAsymmetryRatio = 1,
): BrokenInNibPreset {
  const safePresetId = presetId.trim() || `broken-in-${wearState.nibId}`;
  const safeLabelKo =
    labelKo.trim() || `${NIB_MECHANICAL_SPECS[wearState.nibId].labelKo} 길들임 프리셋`;
  const ratio = clamp(preserveAsymmetryRatio, 0, 1);
  const spec = NIB_MECHANICAL_SPECS[wearState.nibId];

  const meanSide = (wearState.leftTineWearUm + wearState.rightTineWearUm) * 0.5;
  const leftTineWearUm = meanSide + (wearState.leftTineWearUm - meanSide) * ratio;
  const rightTineWearUm = meanSide + (wearState.rightTineWearUm - meanSide) * ratio;
  const metrics = deriveWearMetrics(spec, leftTineWearUm, rightTineWearUm, wearState.centerTipWearUm);

  const lockedState: NibWearState = {
    ...wearState,
    leftTineWearUm,
    rightTineWearUm,
    flatSpotMm: metrics.flatSpotMm,
    asymmetryBias: metrics.asymmetryBias,
    breakInProgress: metrics.breakInProgress,
    overWearSeverity: metrics.overWearSeverity,
    wearProfilePresetLocked: true,
    lockedSnapshotId: safePresetId,
  };

  return {
    presetId: safePresetId,
    labelKo: safeLabelKo,
    nibId: wearState.nibId,
    lockedState,
    targetSweetSpotBreakIn: lockedState.breakInProgress,
    preserveAsymmetryRatio: ratio,
  };
}

/** 단일 스트로크 스텝의 펜촉 탄성, 좌우 슬릿 벌어짐, 비대칭 편마모 누적을 계산한다. */
export function stepNibMechanics(input: NibMechanicsInput): NibMechanicsStepResult {
  const activeWearState =
    input.lockedPreset && input.lockedPreset.nibId === input.wearState.nibId
      ? input.lockedPreset.lockedState
      : input.wearState;

  const spec = NIB_MECHANICAL_SPECS[activeWearState.nibId];
  const pressure = clamp(input.pressure, 0, 1);
  const tiltDeg = clamp(input.tiltDeg ?? 28, 0, 80);
  const azimuthDeg = normalizeAngleDeg(input.azimuthDeg ?? 45);
  const strokeDirectionDeg = normalizeAngleDeg(input.strokeDirectionDeg ?? azimuthDeg + 180);
  const stepDistanceMm = Math.max(0, Number.isFinite(input.stepDistanceMm) ? input.stepDistanceMm : 0);
  const dtMs = clamp(input.dtMs ?? 8, 0.5, 120);
  const paperAbrasiveness = clamp(input.paperAbrasiveness ?? 1.0, 0.2, 2.6);

  const tiltRad = tiltDeg * DEG_TO_RAD;
  const azimuthRad = azimuthDeg * DEG_TO_RAD;
  const normalForceN = pressure > 0 ? Math.pow(pressure, 1.15) * MAX_STYLUS_NORMAL_FORCE_N : 0;

  // 1. Archard 비대칭 편마모 누적 (프리셋 잠금 상태에서는 마모 드리프트 0 보장)
  const isLocked =
    activeWearState.wearProfilePresetLocked ||
    (input.lockedPreset != null && input.lockedPreset.nibId === activeWearState.nibId);

  let nextWearState: NibWearState = activeWearState;
  let effectiveWearDeltaUm = 0;

  if (!isLocked && stepDistanceMm > 0 && pressure > 0) {
    const distanceM = stepDistanceMm / MM_PER_METER;
    const tiltWearMultiplier = 1 + 0.42 * Math.sin(tiltRad);
    const baseDeltaUm =
      spec.baseWearRateUmPerMeter *
      distanceM *
      Math.pow(pressure / 0.5, 1.2) *
      paperAbrasiveness *
      tiltWearMultiplier;

    const lateralTiltFactor = clamp(Math.sin(tiltRad) * Math.cos(azimuthRad), -1, 1);
    const rightShare = clamp(0.5 + 0.38 * lateralTiltFactor, 0.12, 0.88);
    const leftShare = 1 - rightShare;

    const leftTineWearUm = activeWearState.leftTineWearUm + baseDeltaUm * (leftShare * 2);
    const rightTineWearUm = activeWearState.rightTineWearUm + baseDeltaUm * (rightShare * 2);
    const centerTipWearUm = activeWearState.centerTipWearUm + baseDeltaUm * (0.85 + 0.15 * Math.cos(tiltRad));

    const emaAlpha = clamp(distanceM / (distanceM + 2.5), 0.01, 0.5);
    const prevRad = activeWearState.dominantWearAzimuthDeg * DEG_TO_RAD;
    const dominantWearAzimuthDeg =
      tiltDeg < 1e-3
        ? activeWearState.dominantWearAzimuthDeg
        : normalizeAngleDeg(
            Math.atan2(
              (1 - emaAlpha) * Math.sin(prevRad) + emaAlpha * Math.sin(azimuthRad),
              (1 - emaAlpha) * Math.cos(prevRad) + emaAlpha * Math.cos(azimuthRad),
            ) / DEG_TO_RAD,
          );

    const metrics = deriveWearMetrics(spec, leftTineWearUm, rightTineWearUm, centerTipWearUm);
    effectiveWearDeltaUm = baseDeltaUm;
    nextWearState = {
      nibId: activeWearState.nibId,
      cumulativeDistanceMm: activeWearState.cumulativeDistanceMm + stepDistanceMm,
      cumulativeWearWorkJ: activeWearState.cumulativeWearWorkJ + normalForceN * distanceM,
      leftTineWearUm,
      rightTineWearUm,
      centerTipWearUm,
      flatSpotMm: metrics.flatSpotMm,
      asymmetryBias: metrics.asymmetryBias,
      dominantWearAzimuthDeg,
      breakInProgress: metrics.breakInProgress,
      overWearSeverity: metrics.overWearSeverity,
      wearProfilePresetLocked: false,
      lockedSnapshotId: null,
    };
  }

  // 2. 좌우 슬릿(tine) 비선형 Hill 곡선 벌어짐 계산
  let targetTineSplitMm = 0;
  if (spec.hasSplitTines && pressure > 0) {
    const breakInCompliance =
      1 +
      0.06 * Math.sin(Math.PI * clamp(nextWearState.breakInProgress, 0, 1)) +
      0.05 * nextWearState.overWearSeverity;

    if (pressure <= spec.splitPreloadPressure) {
      const preloadRatio = pressure / Math.max(spec.splitPreloadPressure, 0.01);
      targetTineSplitMm = spec.maxTineSplitMm * 0.018 * preloadRatio * preloadRatio;
    } else {
      const pEff = clamp(
        (pressure - spec.splitPreloadPressure) / Math.max(1 - spec.splitPreloadPressure, 0.01),
        0,
        1,
      );
      const pPow = Math.pow(pEff, spec.splitHillExponent);
      const halfPow = Math.pow(spec.splitHalfPressure, spec.splitHillExponent);
      const normalizedHill = (pPow / (pPow + halfPow)) * (1 + halfPow);
      const splitRatio = 0.018 + 0.982 * normalizedHill;
      const tiltOpeningScale = 0.65 + 0.35 * Math.cos(tiltRad);
      targetTineSplitMm = clamp(
        spec.maxTineSplitMm * splitRatio * breakInCompliance * tiltOpeningScale,
        0,
        spec.maxTineSplitMm * 1.12,
      );
    }
  }

  // 3. 비슬릿 필기구 바디 확산 및 1차 지수 점탄성 복원 필터
  const targetBodySplayMm =
    pressure > 0
      ? spec.maxBodySplayMm *
        Math.pow(pressure, spec.id === "brush-pen" ? 1.45 : 1.1) *
        (1 + spec.tiltFootprintGain * Math.pow(Math.sin(tiltRad), 1.25))
      : 0;

  const relaxAlpha = 1 - Math.exp(-dtMs / Math.max(spec.viscoelasticRelaxMs, 0.5));
  const prevSplit =
    input.previousTineSplitMm !== undefined && Number.isFinite(input.previousTineSplitMm)
      ? Math.max(0, input.previousTineSplitMm)
      : targetTineSplitMm;
  const prevBody =
    input.previousBodySplayMm !== undefined && Number.isFinite(input.previousBodySplayMm)
      ? Math.max(0, input.previousBodySplayMm)
      : targetBodySplayMm;

  const tineSplitMm = spec.hasSplitTines ? prevSplit + (targetTineSplitMm - prevSplit) * relaxAlpha : 0;
  const bodySplayMm = prevBody + (targetBodySplayMm - prevBody) * relaxAlpha;
  const springHysteresisLagMm = spec.hasSplitTines
    ? Math.abs(targetTineSplitMm - tineSplitMm)
    : Math.abs(targetBodySplayMm - bodySplayMm);

  const tiltLateral = Math.sin(tiltRad) * Math.cos(azimuthRad);
  const tineBalanceShift = clamp(nextWearState.asymmetryBias * 0.32 + tiltLateral * 0.14, -0.42, 0.42);
  const leftTineDeflectionMm = tineSplitMm * (0.5 - tineBalanceShift);
  const rightTineDeflectionMm = tineSplitMm * (0.5 + tineBalanceShift);

  const tiltBaseExpansion = spec.baseTipWidthMm * (1 + spec.tiltFootprintGain * 0.45 * Math.sin(tiltRad));
  const effectiveStrokeWidthMm =
    pressure <= 0 ? 0 : tiltBaseExpansion + tineSplitMm + bodySplayMm + nextWearState.flatSpotMm * 0.85;

  const elasticRestoringForceN =
    (spec.hasSplitTines ? tineSplitMm : bodySplayMm) *
    spec.springStiffnessNPerMm *
    (1 - 0.12 * nextWearState.overWearSeverity);

  const contactLengthMm =
    pressure <= 0
      ? 0
      : Math.max(spec.baseTipWidthMm, effectiveStrokeWidthMm * (0.55 + 0.9 * Math.sin(tiltRad)));
  const contactAreaMm2 = pressure <= 0 ? 0 : Math.PI * 0.25 * effectiveStrokeWidthMm * contactLengthMm;

  const splitLoadRatio =
    spec.hasSplitTines && spec.maxTineSplitMm > 0 ? clamp(tineSplitMm / spec.maxTineSplitMm, 0, 1) : 0;
  const railroadingRisk = spec.hasSplitTines
    ? clamp(
        Math.pow(splitLoadRatio, 2.2) * 0.65 +
          Math.abs(nextWearState.asymmetryBias) * splitLoadRatio * 0.48 +
          nextWearState.overWearSeverity * 0.22,
        0,
        1,
      )
    : 0;

  // 밀어 긋기(push stroke) 시 새 펜촉·과편마모 버(burr)의 종이 걸림 지수 산출
  const nibPointingDeg = normalizeAngleDeg(azimuthDeg + 180);
  const pushFactor = clamp((Math.cos((strokeDirectionDeg - nibPointingDeg) * DEG_TO_RAD) + 1) * 0.5, 0, 1);
  const roughnessFromWear =
    0.45 * Math.max(0, 1 - nextWearState.breakInProgress * 2.1) +
    0.85 * nextWearState.overWearSeverity +
    0.5 * Math.abs(nextWearState.asymmetryBias);
  const scratchSnagFactor =
    pressure <= 0
      ? 0
      : clamp(
          spec.pushSnagSensitivity *
            (0.25 + 0.75 * pushFactor) *
            (0.2 + 0.8 * roughnessFromWear) *
            (0.4 + 0.6 * pressure),
          0,
          1,
        );

  return {
    nextWearState,
    tineSplitMm: normalizeZero(tineSplitMm),
    leftTineDeflectionMm: normalizeZero(leftTineDeflectionMm),
    rightTineDeflectionMm: normalizeZero(rightTineDeflectionMm),
    bodySplayMm: normalizeZero(bodySplayMm),
    effectiveStrokeWidthMm: normalizeZero(effectiveStrokeWidthMm),
    elasticRestoringForceN: normalizeZero(elasticRestoringForceN),
    contactAreaMm2: normalizeZero(contactAreaMm2),
    railroadingRisk: normalizeZero(railroadingRisk),
    scratchSnagFactor: normalizeZero(scratchSnagFactor),
    effectiveWearDeltaUm: normalizeZero(effectiveWearDeltaUm),
    springHysteresisLagMm: normalizeZero(springHysteresisLagMm),
  };
}

/** 과도한 편마모를 자동 보정하거나 작가 취향의 '길들여진 펜촉' 상태를 프리셋으로 잠근다. */
export function compensateAdaptiveNibWear(
  wearState: NibWearState,
  options: AdaptiveNibCompensationOptions,
): AdaptiveNibCompensationResult {
  const spec = NIB_MECHANICAL_SPECS[wearState.nibId];

  if (options.mode === "factory-reset") {
    return {
      mode: "factory-reset",
      compensatedState: createInitialNibWearState(wearState.nibId),
      compensationApplied: true,
      asymmetryReducedBy: Math.abs(wearState.asymmetryBias),
      flatSpotRecoveredMm: wearState.flatSpotMm,
      overWearReducedBy: wearState.overWearSeverity,
      widthCorrectionFactor: 1,
      tineBalanceOffset: 0,
      lockedPreset: null,
      actionSummaryKo: `${spec.labelKo}을(를) 새 펜촉 기준 상태로 교체했습니다.`,
    };
  }

  if (options.mode === "lock-broken-in") {
    const preset = lockBrokenInNibPreset(
      wearState,
      options.presetId ?? `broken-in-${wearState.nibId}`,
      options.presetLabelKo ?? `${spec.labelKo} 내 손 길들임`,
      options.preserveAsymmetryRatio ?? 1,
    );
    return {
      mode: "lock-broken-in",
      compensatedState: preset.lockedState,
      compensationApplied: true,
      asymmetryReducedBy: Math.max(
        0,
        Math.abs(wearState.asymmetryBias) - Math.abs(preset.lockedState.asymmetryBias),
      ),
      flatSpotRecoveredMm: Math.max(0, wearState.flatSpotMm - preset.lockedState.flatSpotMm),
      overWearReducedBy: Math.max(0, wearState.overWearSeverity - preset.lockedState.overWearSeverity),
      widthCorrectionFactor: 1,
      tineBalanceOffset: normalizeZero(-preset.lockedState.asymmetryBias * 0.25),
      lockedPreset: preset,
      actionSummaryKo: `'${preset.labelKo}' 상태로 펜촉 마모 프로파일을 잠갔습니다.`,
    };
  }

  // mode === "auto-heal": 과도 편마모·평탄화를 황금 길들임 구간으로 자동 복원
  const maxAsymmetry = clamp(options.maxAllowedAsymmetry ?? DEFAULT_OVER_WEAR_ASYMMETRY_THRESHOLD, 0.05, 0.85);
  const maxOverWear = clamp(options.maxAllowedOverWearSeverity ?? DEFAULT_OVER_WEAR_SEVERITY_THRESHOLD, 0.1, 0.95);
  const preserveRatio = clamp(options.preserveAsymmetryRatio ?? 0.15, 0, 0.4);

  const needsHeal =
    Boolean(options.forceCompensate) ||
    Math.abs(wearState.asymmetryBias) > maxAsymmetry ||
    wearState.overWearSeverity > maxOverWear;

  if (!needsHeal) {
    return {
      mode: "auto-heal",
      compensatedState: wearState,
      compensationApplied: false,
      asymmetryReducedBy: 0,
      flatSpotRecoveredMm: 0,
      overWearReducedBy: 0,
      widthCorrectionFactor: 1,
      tineBalanceOffset: normalizeZero(-wearState.asymmetryBias * 0.2),
      lockedPreset: null,
      actionSummaryKo: "편마모가 허용 범위 안이어서 현재 필기감을 유지합니다.",
    };
  }

  // 황금 구간(sweetSpotWearUm)으로 깊이를 회복하고, 기존 비대칭 비율의 preserveRatio만 미세 보존한다.
  const currentMeanSide = (wearState.leftTineWearUm + wearState.rightTineWearUm) * 0.5;
  const targetDepthUm = Math.min(currentMeanSide, spec.sweetSpotWearUm * 0.96);
  const healedHalfDiffUm = clamp(
    targetDepthUm * wearState.asymmetryBias * preserveRatio,
    -targetDepthUm * 0.16,
    targetDepthUm * 0.16,
  );
  const healedLeftUm = Math.max(0, targetDepthUm - healedHalfDiffUm);
  const healedRightUm = Math.max(0, targetDepthUm + healedHalfDiffUm);
  const healedCenterUm = Math.min(wearState.centerTipWearUm, spec.sweetSpotWearUm * 0.94);

  const metrics = deriveWearMetrics(spec, healedLeftUm, healedRightUm, healedCenterUm);
  const compensatedState: NibWearState = {
    ...wearState,
    leftTineWearUm: healedLeftUm,
    rightTineWearUm: healedRightUm,
    centerTipWearUm: healedCenterUm,
    flatSpotMm: metrics.flatSpotMm,
    asymmetryBias: metrics.asymmetryBias,
    breakInProgress: metrics.breakInProgress,
    overWearSeverity: metrics.overWearSeverity,
    wearProfilePresetLocked: false,
    lockedSnapshotId: null,
  };

  return {
    mode: "auto-heal",
    compensatedState,
    compensationApplied: true,
    asymmetryReducedBy: normalizeZero(
      Math.max(0, Math.abs(wearState.asymmetryBias) - Math.abs(metrics.asymmetryBias)),
    ),
    flatSpotRecoveredMm: normalizeZero(Math.max(0, wearState.flatSpotMm - metrics.flatSpotMm)),
    overWearReducedBy: normalizeZero(Math.max(0, wearState.overWearSeverity - metrics.overWearSeverity)),
    widthCorrectionFactor: normalizeZero(clamp(1 - (wearState.flatSpotMm - metrics.flatSpotMm) * 0.45, 0.72, 1.15)),
    tineBalanceOffset: normalizeZero(-wearState.asymmetryBias * 0.35),
    lockedPreset: null,
    actionSummaryKo: `${spec.labelKo}의 과도 편마모를 자동 보정해 길들여진 탄성 상태로 복원했습니다.`,
  };
}
