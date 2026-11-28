/**
 * Wave 141 — 연속 컷 다중 광원·그림자 일관성 감사 및 자동 교정 솔버.
 *
 * - 야외 태양광(`outdoor-solar`), 야외 달빛(`outdoor-lunar`), 실내 창문광(`indoor-window`),
 *   실내 인공·네온 조명(`indoor-practical`)을 단일 물리·카메라 투영 프레임으로 감사한다.
 * - 4종 조광 사고(`shadow-direction-flip`, `shadow-length-anachronism`, `rim-light-side-conflict`,
 *   `unexplained-time-jump`)를 탐지하고 자동 교정 후 위반 0건·연속성 100점을 검증한다.
 */

import { computeLightingManifestSha256Hex } from "./lighting-manifest-sha256";
import {
  angularDistanceDeg,
  clampFiniteNumber,
  computeSolarEphemeris,
  degToRad,
  normalizeDegrees360,
  projectWorldLightToCutScreen,
  type CutLightScreenProjectionResult,
  type LightSourceType,
  type RimLightSide,
  type SolarEphemerisResult,
  type TimeOfDayBand,
} from "./solar-ephemeris-and-shadow-math";

export type ShadowViolationKind =
  | "shadow-direction-flip"
  | "shadow-length-anachronism"
  | "rim-light-side-conflict"
  | "unexplained-time-jump";

export type ShadowViolationSeverity = "blocker" | "warning";

export const LIGHT_SOURCE_LABELS_KO: Readonly<Record<LightSourceType, string>> = {
  "outdoor-solar": "야외 태양광",
  "outdoor-lunar": "야외 달빛",
  "indoor-window": "실내 창문광",
  "indoor-practical": "실내 포인트 조명",
};

export const RIM_SIDE_LABELS_KO: Readonly<Record<RimLightSide, string>> = {
  left: "좌측 림라이트",
  right: "우측 림라이트",
  top: "상단 림라이트",
  back: "역광 림라이트",
};

export const VIOLATION_KIND_LABELS_KO: Readonly<Record<ShadowViolationKind, string>> = {
  "shadow-direction-flip": "그림자 방향 이탈·역전",
  "shadow-length-anachronism": "시간대 대비 그림자 길이 불일치",
  "rim-light-side-conflict": "림라이트 방향 모순",
  "unexplained-time-jump": "미표기 시간대·색온도 급변",
};

export interface SceneLightingBible {
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly latitudeDeg: number;
  readonly dayOfYear: number;
  readonly defaultLocalSolarHour: number;
  readonly defaultLightSourceType?: LightSourceType;
  readonly lunarPhaseDay?: number;
  readonly defaultWindowFacingAzimuthDeg?: number;
  readonly defaultWindowElevationDeg?: number;
  readonly defaultPracticalLightAzimuthDeg?: number;
  readonly defaultPracticalLightElevationDeg?: number;
  readonly defaultPracticalColorTemperatureK?: number;
}

export interface CutLightingInput {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly cutLabel?: string;
  readonly localSolarHour?: number;
  readonly lightSourceType?: LightSourceType;
  readonly cameraYawDeg: number;
  readonly cameraPitchDeg?: number;
  readonly objectHeightM?: number;
  readonly isTimeJumpCut?: boolean;
  readonly windowFacingAzimuthDeg?: number;
  readonly windowElevationDeg?: number;
  readonly practicalLightAzimuthDeg?: number;
  readonly practicalLightElevationDeg?: number;
  readonly practicalColorTemperatureK?: number;
  readonly drawnShadowAngleDeg: number;
  readonly drawnShadowLengthRatio: number;
  readonly drawnRimSide: RimLightSide;
}

export interface ShadowAuditOptions {
  readonly angleToleranceDeg?: number;
  readonly blockerFlipAngleDeg?: number;
  readonly lengthRatioToleranceFactor?: number;
  readonly maxElevationJumpDeg?: number;
  readonly maxColorTempJumpK?: number;
}

export interface ResolvedShadowAuditOptions {
  readonly angleToleranceDeg: number;
  readonly blockerFlipAngleDeg: number;
  readonly lengthRatioToleranceFactor: number;
  readonly maxElevationJumpDeg: number;
  readonly maxColorTempJumpK: number;
}

export interface ShadowAuditViolation {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly kind: ShadowViolationKind;
  readonly severity: ShadowViolationSeverity;
  readonly expectedValue: string;
  readonly drawnValue: string;
  readonly deltaMagnitude: number;
  readonly messageKo: string;
  readonly fixHintKo: string;
}

export interface CutLightingEvaluation {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly cutLabel: string;
  readonly lightSourceType: LightSourceType;
  readonly localSolarHour: number;
  readonly isTimeJumpCut: boolean;
  readonly cameraYawDeg: number;
  readonly cameraPitchDeg: number;
  readonly objectHeightM: number;
  readonly lightAzimuthDeg: number;
  readonly lightElevationDeg: number;
  readonly worldShadowAzimuthDeg: number;
  readonly worldShadowLengthRatio: number;
  readonly worldShadowLengthM: number;
  readonly colorTemperatureK: number;
  readonly timeOfDayBand: TimeOfDayBand;
  readonly ephemeris: SolarEphemerisResult;
  readonly projection: CutLightScreenProjectionResult;
  readonly drawnShadowAngleDeg: number;
  readonly drawnShadowLengthRatio: number;
  readonly drawnRimSide: RimLightSide;
  readonly shadowAngleErrorDeg: number;
  readonly shadowLengthRelativeError: number;
  readonly violationCount: number;
  readonly blockerCount: number;
}

export interface SceneLightingAuditReport {
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly latitudeDeg: number;
  readonly dayOfYear: number;
  readonly defaultLocalSolarHour: number;
  readonly defaultLightSourceType: LightSourceType;
  readonly options: ResolvedShadowAuditOptions;
  readonly cutEvaluations: readonly CutLightingEvaluation[];
  readonly violations: readonly ShadowAuditViolation[];
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly passed: boolean;
  readonly continuityScore: number;
  readonly lightingManifestSha256Hex: string;
}

export interface CutShadowCorrectionPatch {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly previousLocalSolarHour: number;
  readonly correctedLocalSolarHour: number;
  readonly previousShadowAngleDeg: number;
  readonly correctedShadowAngleDeg: number;
  readonly previousShadowLengthRatio: number;
  readonly correctedShadowLengthRatio: number;
  readonly previousRimSide: RimLightSide;
  readonly correctedRimSide: RimLightSide;
  readonly changedFields: readonly string[];
}

export interface ShadowAutoCorrectionResult {
  readonly originalReport: SceneLightingAuditReport;
  readonly correctedCuts: readonly CutLightingInput[];
  readonly correctedReport: SceneLightingAuditReport;
  readonly patches: readonly CutShadowCorrectionPatch[];
  readonly resolvedViolationCount: number;
  readonly lightingManifestSha256Hex: string;
}

function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function round1(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** 감사 옵션의 기본값과 안전 범위를 정규화한다. */
export function resolveShadowAuditOptions(
  options: ShadowAuditOptions = {},
): ResolvedShadowAuditOptions {
  const angleToleranceDeg = clampFiniteNumber(options.angleToleranceDeg ?? 25, 2, 90, 25);
  const blockerFlipAngleDeg = clampFiniteNumber(
    options.blockerFlipAngleDeg ?? 120,
    Math.max(45, angleToleranceDeg + 10),
    179,
    120,
  );
  return {
    angleToleranceDeg,
    blockerFlipAngleDeg,
    lengthRatioToleranceFactor: clampFiniteNumber(
      options.lengthRatioToleranceFactor ?? 0.45,
      0.05,
      2.5,
      0.45,
    ),
    maxElevationJumpDeg: clampFiniteNumber(options.maxElevationJumpDeg ?? 12, 2, 60, 12),
    maxColorTempJumpK: clampFiniteNumber(options.maxColorTempJumpK ?? 900, 150, 4500, 900),
  };
}

function isNaturalLightMode(mode: LightSourceType): boolean {
  return mode === "outdoor-solar" || mode === "outdoor-lunar" || mode === "indoor-window";
}

interface ResolvedCutPhysicalLight {
  readonly lightSourceType: LightSourceType;
  readonly localSolarHour: number;
  readonly lightAzimuthDeg: number;
  readonly lightElevationDeg: number;
  readonly worldShadowAzimuthDeg: number;
  readonly worldShadowLengthRatio: number;
  readonly worldShadowLengthM: number;
  readonly colorTemperatureK: number;
  readonly timeOfDayBand: TimeOfDayBand;
  readonly ephemeris: SolarEphemerisResult;
  readonly projection: CutLightScreenProjectionResult;
  readonly cameraYawDeg: number;
  readonly cameraPitchDeg: number;
  readonly objectHeightM: number;
}

function resolveCutPhysicalLight(
  scene: SceneLightingBible,
  cut: CutLightingInput,
  overrideSolarHour?: number,
  overrideLightSourceType?: LightSourceType,
): ResolvedCutPhysicalLight {
  const lightSourceType: LightSourceType =
    overrideLightSourceType ?? cut.lightSourceType ?? scene.defaultLightSourceType ?? "outdoor-solar";
  const rawHour = overrideSolarHour ?? cut.localSolarHour ?? scene.defaultLocalSolarHour;
  const localSolarHour = Number.isFinite(rawHour) ? ((rawHour % 24) + 24) % 24 : 12;
  const cameraYawDeg = normalizeDegrees360(cut.cameraYawDeg);
  const cameraPitchDeg = clampFiniteNumber(cut.cameraPitchDeg ?? -10, -85, 85, -10);
  const objectHeightM = clampFiniteNumber(cut.objectHeightM ?? 1.7, 0.05, 500, 1.7);

  const ephemeris = computeSolarEphemeris({
    latitudeDeg: scene.latitudeDeg,
    dayOfYear: scene.dayOfYear,
    localSolarHour,
    celestialBody: lightSourceType === "outdoor-lunar" ? "moon" : "sun",
    lunarPhaseDay: scene.lunarPhaseDay,
    objectHeightM,
  });

  let lightAzimuthDeg = ephemeris.azimuthDeg;
  let lightElevationDeg = ephemeris.elevationDeg;
  let worldShadowAzimuthDeg = ephemeris.worldShadowAzimuthDeg;
  let worldShadowLengthRatio = ephemeris.shadowLengthRatio;
  let worldShadowLengthM = ephemeris.shadowLengthM;
  let colorTemperatureK = ephemeris.colorTemperatureK;
  let timeOfDayBand: TimeOfDayBand = ephemeris.timeOfDayBand;

  if (lightSourceType === "indoor-window") {
    const windowAz = normalizeDegrees360(
      cut.windowFacingAzimuthDeg ?? scene.defaultWindowFacingAzimuthDeg ?? 180,
    );
    const fallbackElev = clampFiniteNumber(
      ephemeris.isAboveHorizon ? ephemeris.elevationDeg : 28,
      14,
      58,
      32,
    );
    const windowElev = clampFiniteNumber(
      cut.windowElevationDeg ?? scene.defaultWindowElevationDeg ?? fallbackElev,
      8,
      78,
      32,
    );
    lightAzimuthDeg = windowAz;
    lightElevationDeg = windowElev;
    worldShadowAzimuthDeg = normalizeDegrees360(windowAz + 180);
    worldShadowLengthRatio = clampFiniteNumber(1 / Math.tan(degToRad(windowElev)), 0.08, 10, 1.6);
    worldShadowLengthM = objectHeightM * worldShadowLengthRatio;
  } else if (lightSourceType === "indoor-practical") {
    const practicalAz = normalizeDegrees360(
      cut.practicalLightAzimuthDeg ?? scene.defaultPracticalLightAzimuthDeg ?? 45,
    );
    const practicalElev = clampFiniteNumber(
      cut.practicalLightElevationDeg ?? scene.defaultPracticalLightElevationDeg ?? 55,
      8,
      86,
      55,
    );
    lightAzimuthDeg = practicalAz;
    lightElevationDeg = practicalElev;
    worldShadowAzimuthDeg = normalizeDegrees360(practicalAz + 180);
    worldShadowLengthRatio = clampFiniteNumber(1 / Math.tan(degToRad(practicalElev)), 0.05, 8, 0.7);
    worldShadowLengthM = objectHeightM * worldShadowLengthRatio;
    colorTemperatureK = Math.round(
      clampFiniteNumber(
        cut.practicalColorTemperatureK ?? scene.defaultPracticalColorTemperatureK ?? 3200,
        1800,
        12000,
        3200,
      ),
    );
    timeOfDayBand = colorTemperatureK <= 3800 ? "golden-hour" : "midday";
  }

  const projection = projectWorldLightToCutScreen({
    lightAzimuthDeg,
    lightElevationDeg,
    worldShadowLengthRatio,
    cameraYawDeg,
    cameraPitchDeg,
  });

  return {
    lightSourceType,
    localSolarHour,
    lightAzimuthDeg,
    lightElevationDeg,
    worldShadowAzimuthDeg,
    worldShadowLengthRatio,
    worldShadowLengthM,
    colorTemperatureK,
    timeOfDayBand,
    ephemeris,
    projection,
    cameraYawDeg,
    cameraPitchDeg,
    objectHeightM,
  };
}

function isOppositeHorizontalRim(expected: RimLightSide, drawn: RimLightSide): boolean {
  return (expected === "left" && drawn === "right") || (expected === "right" && drawn === "left");
}

/**
 * 씬 조광 바이블과 연속 컷 작화 데이터를 비교해 4종 그림자·조광 위반을 감사한다.
 */
export function auditSceneLightingConsistency(
  scene: SceneLightingBible,
  cuts: readonly CutLightingInput[],
  options: ShadowAuditOptions = {},
): SceneLightingAuditReport {
  const resolvedOptions = resolveShadowAuditOptions(options);
  const defaultLightSourceType: LightSourceType = scene.defaultLightSourceType ?? "outdoor-solar";
  const latitudeDeg = clampFiniteNumber(scene.latitudeDeg, -89.9, 89.9, 37.5665);
  const dayOfYear = Math.round(clampFiniteNumber(scene.dayOfYear, 1, 365, 172));
  const defaultLocalSolarHour = Number.isFinite(scene.defaultLocalSolarHour)
    ? ((scene.defaultLocalSolarHour % 24) + 24) % 24
    : 12;

  const evaluations: CutLightingEvaluation[] = [];
  const allViolations: ShadowAuditViolation[] = [];

  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i];
    if (!cut) continue;

    const resolved = resolveCutPhysicalLight(scene, cut);
    const drawnShadowAngleDeg = normalizeDegrees360(cut.drawnShadowAngleDeg);
    const drawnShadowLengthRatio = clampFiniteNumber(cut.drawnShadowLengthRatio, 0.01, 40, 1);
    const drawnRimSide: RimLightSide = cut.drawnRimSide;

    const angleErrorDeg = angularDistanceDeg(
      drawnShadowAngleDeg,
      resolved.projection.expectedScreenShadowAngleDeg,
    );
    const expectedLen = resolved.projection.expectedScreenShadowLengthRatio;
    const absLengthError = Math.abs(drawnShadowLengthRatio - expectedLen);
    const relLengthError = absLengthError / Math.max(0.25, expectedLen);
    const cutViolations: ShadowAuditViolation[] = [];

    if (angleErrorDeg > resolvedOptions.angleToleranceDeg) {
      const isReverseFlip = angleErrorDeg > resolvedOptions.blockerFlipAngleDeg;
      cutViolations.push({
        cutId: cut.cutId,
        cutNumber: cut.cutNumber,
        kind: "shadow-direction-flip",
        severity: isReverseFlip ? "blocker" : "warning",
        expectedValue: `${round1(resolved.projection.expectedScreenShadowAngleDeg)}°`,
        drawnValue: `${round1(drawnShadowAngleDeg)}°`,
        deltaMagnitude: round1(angleErrorDeg),
        messageKo: isReverseFlip
          ? `${cut.cutNumber}컷 그림자 방향이 기대 투영(${round1(resolved.projection.expectedScreenShadowAngleDeg)}°)과 ${round1(angleErrorDeg)}° 어긋나 반대로 뒤집혔습니다.`
          : `${cut.cutNumber}컷 그림자 방향이 기대 투영(${round1(resolved.projection.expectedScreenShadowAngleDeg)}°)보다 ${round1(angleErrorDeg)}° 벗어났습니다.`,
        fixHintKo: `카메라 방위 ${round1(resolved.cameraYawDeg)}° 기준 바닥 그림자 각도를 ${round1(resolved.projection.expectedScreenShadowAngleDeg)}°로 돌려 맞추세요.`,
      });
    }

    if (relLengthError > resolvedOptions.lengthRatioToleranceFactor && absLengthError > 0.2) {
      const ratioFactor = drawnShadowLengthRatio / Math.max(0.05, expectedLen);
      const isSevere = relLengthError >= 1.1 || ratioFactor >= 2.4 || ratioFactor <= 0.35;
      const directionDesc = drawnShadowLengthRatio > expectedLen ? "과도하게 길게" : "지나치게 짧게";
      cutViolations.push({
        cutId: cut.cutId,
        cutNumber: cut.cutNumber,
        kind: "shadow-length-anachronism",
        severity: isSevere ? "blocker" : "warning",
        expectedValue: `${round1(expectedLen)}x`,
        drawnValue: `${round1(drawnShadowLengthRatio)}x`,
        deltaMagnitude: round1(relLengthError * 100),
        messageKo: `${cut.cutNumber}컷 광원 고도(${round1(resolved.lightElevationDeg)}°) 기준 기대 그림자 길이(${round1(expectedLen)}x)보다 ${directionDesc}(${round1(drawnShadowLengthRatio)}x) 그려졌습니다.`,
        fixHintKo: `캐릭터 신장 대비 그림자 길이를 약 ${round1(expectedLen)}배(${round1(expectedLen * resolved.objectHeightM)}m) 수준으로 조절하세요.`,
      });
    }

    if (drawnRimSide !== resolved.projection.expectedRimSide) {
      const strongHorizontal =
        isOppositeHorizontalRim(resolved.projection.expectedRimSide, drawnRimSide) &&
        Math.abs(resolved.projection.lightRightComponent) >= 0.25;
      cutViolations.push({
        cutId: cut.cutId,
        cutNumber: cut.cutNumber,
        kind: "rim-light-side-conflict",
        severity: strongHorizontal ? "blocker" : "warning",
        expectedValue: RIM_SIDE_LABELS_KO[resolved.projection.expectedRimSide],
        drawnValue: RIM_SIDE_LABELS_KO[drawnRimSide],
        deltaMagnitude: strongHorizontal ? 180 : 90,
        messageKo: `${cut.cutNumber}컷 광원 방향은 ${RIM_SIDE_LABELS_KO[resolved.projection.expectedRimSide]}인데 작화에서는 ${RIM_SIDE_LABELS_KO[drawnRimSide]}로 찍혀 모순됩니다.`,
        fixHintKo: `외곽 하이라이트 레이어를 ${RIM_SIDE_LABELS_KO[resolved.projection.expectedRimSide]} 쪽 윤곽선으로 옮기세요.`,
      });
    }

    const prevEval = evaluations[evaluations.length - 1];
    if (prevEval && !cut.isTimeJumpCut) {
      const comparableNatural =
        isNaturalLightMode(prevEval.lightSourceType) &&
        isNaturalLightMode(resolved.lightSourceType);
      if (comparableNatural || prevEval.lightSourceType === resolved.lightSourceType) {
        const elevJumpDeg = Math.abs(resolved.lightElevationDeg - prevEval.lightElevationDeg);
        const kelvinJumpK = Math.abs(resolved.colorTemperatureK - prevEval.colorTemperatureK);
        if (
          elevJumpDeg > resolvedOptions.maxElevationJumpDeg ||
          kelvinJumpK > resolvedOptions.maxColorTempJumpK
        ) {
          const isBlocker =
            elevJumpDeg > resolvedOptions.maxElevationJumpDeg * 2 ||
            kelvinJumpK > resolvedOptions.maxColorTempJumpK * 1.8;
          cutViolations.push({
            cutId: cut.cutId,
            cutNumber: cut.cutNumber,
            kind: "unexplained-time-jump",
            severity: isBlocker ? "blocker" : "warning",
            expectedValue: `고도 ${round1(prevEval.lightElevationDeg)}° / ${prevEval.colorTemperatureK}K`,
            drawnValue: `고도 ${round1(resolved.lightElevationDeg)}° / ${resolved.colorTemperatureK}K`,
            deltaMagnitude: round1(Math.max(elevJumpDeg, kelvinJumpK / 50)),
            messageKo: `${prevEval.cutNumber}컷→${cut.cutNumber}컷 사이에 시간 경과 표기 없이 태양 고도(${round1(elevJumpDeg)}° 변화) 또는 색온도(${kelvinJumpK}K 변화)가 급변했습니다.`,
            fixHintKo: `시간 경과 컷이면 isTimeJumpCut을 표시하고, 연속 시간대라면 직전 컷(${round1(prevEval.localSolarHour)}시)과 동일한 광원 시간대로 통일하세요.`,
          });
        }
      }
    }

    let cutBlockers = 0;
    for (let v = 0; v < cutViolations.length; v += 1) {
      const item = cutViolations[v];
      if (!item) continue;
      if (item.severity === "blocker") cutBlockers += 1;
      allViolations.push(item);
    }

    evaluations.push({
      cutId: cut.cutId,
      cutNumber: cut.cutNumber,
      cutLabel: cut.cutLabel ?? `${cut.cutNumber}컷`,
      lightSourceType: resolved.lightSourceType,
      localSolarHour: resolved.localSolarHour,
      isTimeJumpCut: Boolean(cut.isTimeJumpCut),
      cameraYawDeg: resolved.cameraYawDeg,
      cameraPitchDeg: resolved.cameraPitchDeg,
      objectHeightM: resolved.objectHeightM,
      lightAzimuthDeg: resolved.lightAzimuthDeg,
      lightElevationDeg: resolved.lightElevationDeg,
      worldShadowAzimuthDeg: resolved.worldShadowAzimuthDeg,
      worldShadowLengthRatio: resolved.worldShadowLengthRatio,
      worldShadowLengthM: resolved.worldShadowLengthM,
      colorTemperatureK: resolved.colorTemperatureK,
      timeOfDayBand: resolved.timeOfDayBand,
      ephemeris: resolved.ephemeris,
      projection: resolved.projection,
      drawnShadowAngleDeg,
      drawnShadowLengthRatio,
      drawnRimSide,
      shadowAngleErrorDeg: angleErrorDeg,
      shadowLengthRelativeError: relLengthError,
      violationCount: cutViolations.length,
      blockerCount: cutBlockers,
    });
  }

  let blockerCount = 0;
  let warningCount = 0;
  for (let i = 0; i < allViolations.length; i += 1) {
    const v = allViolations[i];
    if (!v) continue;
    if (v.severity === "blocker") blockerCount += 1;
    else warningCount += 1;
  }

  const continuityScore = Math.max(0, Math.min(100, 100 - blockerCount * 22 - warningCount * 10));
  const lightingManifestSha256Hex = computeLightingManifestSha256Hex({
    schemaVersion: "wave141-lighting-bible-v1",
    sceneId: scene.sceneId,
    sceneTitle: scene.sceneTitle,
    latitudeDeg: round4(latitudeDeg),
    dayOfYear,
    defaultLocalSolarHour: round4(defaultLocalSolarHour),
    defaultLightSourceType,
    cuts: evaluations.map((ev) => ({
      cutId: ev.cutId,
      cutNumber: ev.cutNumber,
      lightSourceType: ev.lightSourceType,
      localSolarHour: round4(ev.localSolarHour),
      cameraYawDeg: round4(ev.cameraYawDeg),
      cameraPitchDeg: round4(ev.cameraPitchDeg),
      lightAzimuthDeg: round4(ev.lightAzimuthDeg),
      lightElevationDeg: round4(ev.lightElevationDeg),
      colorTemperatureK: ev.colorTemperatureK,
      expectedScreenShadowAngleDeg: round4(ev.projection.expectedScreenShadowAngleDeg),
      expectedScreenShadowLengthRatio: round4(ev.projection.expectedScreenShadowLengthRatio),
      expectedRimSide: ev.projection.expectedRimSide,
      drawnShadowAngleDeg: round4(ev.drawnShadowAngleDeg),
      drawnShadowLengthRatio: round4(ev.drawnShadowLengthRatio),
      drawnRimSide: ev.drawnRimSide,
    })),
    violations: allViolations.map((v) => ({
      cutId: v.cutId,
      kind: v.kind,
      severity: v.severity,
    })),
  });

  return {
    sceneId: scene.sceneId,
    sceneTitle: scene.sceneTitle,
    latitudeDeg,
    dayOfYear,
    defaultLocalSolarHour,
    defaultLightSourceType,
    options: resolvedOptions,
    cutEvaluations: evaluations,
    violations: allViolations,
    blockerCount,
    warningCount,
    passed: allViolations.length === 0,
    continuityScore,
    lightingManifestSha256Hex,
  };
}

/**
 * 위반 컷의 그림자 각도·길이·림라이트 방향 및 무표기 시간대 이탈을 천문·카메라 투영 기준으로
 * 자동 교정하고, 재감사 결과(위반 0건·연속성 100점)와 매니페스트 해시를 반환한다.
 */
export function correctCutShadowDirections(
  scene: SceneLightingBible,
  cuts: readonly CutLightingInput[],
  options: ShadowAuditOptions = {},
): ShadowAutoCorrectionResult {
  const resolvedOptions = resolveShadowAuditOptions(options);
  const originalReport = auditSceneLightingConsistency(scene, cuts, resolvedOptions);
  const correctedCuts: CutLightingInput[] = [];
  const patches: CutShadowCorrectionPatch[] = [];
  let prevResolved: ResolvedCutPhysicalLight | null = null;

  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i];
    if (!cut) continue;

    let targetSolarHour = cut.localSolarHour ?? scene.defaultLocalSolarHour;
    let targetLightType = cut.lightSourceType ?? scene.defaultLightSourceType ?? "outdoor-solar";
    const probe = resolveCutPhysicalLight(scene, cut, targetSolarHour, targetLightType);

    if (prevResolved && !cut.isTimeJumpCut) {
      const comparableNatural =
        isNaturalLightMode(prevResolved.lightSourceType) &&
        isNaturalLightMode(probe.lightSourceType);
      if (comparableNatural || prevResolved.lightSourceType === probe.lightSourceType) {
        const elevJump = Math.abs(probe.lightElevationDeg - prevResolved.lightElevationDeg);
        const kelvinJump = Math.abs(probe.colorTemperatureK - prevResolved.colorTemperatureK);
        if (
          elevJump > resolvedOptions.maxElevationJumpDeg ||
          kelvinJump > resolvedOptions.maxColorTempJumpK
        ) {
          targetSolarHour = prevResolved.localSolarHour;
          if (prevResolved.lightSourceType !== probe.lightSourceType) {
            targetLightType = prevResolved.lightSourceType;
          }
        }
      }
    }

    const finalResolved = resolveCutPhysicalLight(scene, cut, targetSolarHour, targetLightType);
    const correctedAngle = round4(finalResolved.projection.expectedScreenShadowAngleDeg);
    const correctedLengthRatio = round4(finalResolved.projection.expectedScreenShadowLengthRatio);
    const correctedRimSide = finalResolved.projection.expectedRimSide;
    const prevAngle = normalizeDegrees360(cut.drawnShadowAngleDeg);
    const prevLengthRatio = clampFiniteNumber(cut.drawnShadowLengthRatio, 0.01, 40, 1);

    const changedFields: string[] = [];
    if (Math.abs(probe.localSolarHour - finalResolved.localSolarHour) > 1e-3) {
      changedFields.push("localSolarHour");
    }
    if (angularDistanceDeg(prevAngle, correctedAngle) > 1e-2) {
      changedFields.push("drawnShadowAngleDeg");
    }
    if (Math.abs(prevLengthRatio - correctedLengthRatio) > 1e-2) {
      changedFields.push("drawnShadowLengthRatio");
    }
    if (cut.drawnRimSide !== correctedRimSide) {
      changedFields.push("drawnRimSide");
    }

    correctedCuts.push({
      ...cut,
      localSolarHour: round4(finalResolved.localSolarHour),
      lightSourceType: finalResolved.lightSourceType,
      drawnShadowAngleDeg: correctedAngle,
      drawnShadowLengthRatio: correctedLengthRatio,
      drawnRimSide: correctedRimSide,
    });
    patches.push({
      cutId: cut.cutId,
      cutNumber: cut.cutNumber,
      previousLocalSolarHour: round4(probe.localSolarHour),
      correctedLocalSolarHour: round4(finalResolved.localSolarHour),
      previousShadowAngleDeg: round4(prevAngle),
      correctedShadowAngleDeg: correctedAngle,
      previousShadowLengthRatio: round4(prevLengthRatio),
      correctedShadowLengthRatio: correctedLengthRatio,
      previousRimSide: cut.drawnRimSide,
      correctedRimSide,
      changedFields,
    });
    prevResolved = finalResolved;
  }

  const correctedReport = auditSceneLightingConsistency(scene, correctedCuts, resolvedOptions);
  return {
    originalReport,
    correctedCuts,
    correctedReport,
    patches,
    resolvedViolationCount: Math.max(
      0,
      originalReport.violations.length - correctedReport.violations.length,
    ),
    lightingManifestSha256Hex: correctedReport.lightingManifestSha256Hex,
  };
}
