/**
 * Wave 106 — 5각 턴어라운드 모델 시트 합성기 및 작붕(Off-Model) 좌우 반전·비율 이탈 감사 엔진.
 *
 * - 5각 정규 턴어라운드(`[-90°, -45°, 0°, +45°, +180°]`)를 공통 수평 기준선(`정수리·눈썹·눈·코·턱`)에
 *   `< 1e-4 px` 수직 오차로 정렬해 모델 시트를 합성한다.
 * - 회차 패널의 관측 특징점·비율을 3D 캐논 투영과 대조해 좌우 반전 흉터(`mirrored-asymmetric-landmark`, blocker),
 *   반대편 가림 특징점 노출(`impossible-occluded-landmark`, warning), 눈 간격·두상 비율 이탈을 검출한다.
 */

import {
  computeCanonSheetFingerprints,
  computeFipsSha256Hex,
  computeFnv1a32Hex,
  type CanonSheetFingerprints,
} from "./canon-sheet-fingerprint-hash";
import {
  clampFinite,
  EXPRESSION_PRESET_TABLE,
  normalizeYawDeg,
  projectCharacterHeadAtView,
  type AnatomicalSide,
  type CharacterHeadCanonSheet,
  type ExpressionPresetId,
  type ProjectedCanonGuideRails,
  type ProjectedCharacterHeadView,
  type ScreenSide,
} from "./loomis-head-3d-turnaround-rig";

export {
  computeCanonSheetFingerprints,
  computeFipsSha256Hex,
  computeFnv1a32Hex,
  type CanonSheetFingerprints,
};

export const CANONICAL_FIVE_TURNAROUND_ANGLES_DEG: readonly number[] = [-90, -45, 0, 45, 180];

export type TurnaroundViewCode =
  | "left-profile"
  | "left-three-quarter"
  | "front"
  | "right-three-quarter"
  | "back";

export interface TurnaroundSheetBuildOptions {
  readonly panelWidthPx?: number;
  readonly panelHeightPx?: number;
  readonly headScalePx?: number;
  readonly sharedOriginY?: number;
  readonly panelGapPx?: number;
  readonly leftRailLabelMarginPx?: number;
  readonly pitchDeg?: number;
}

export interface TurnaroundSheetPanelBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TurnaroundSheetPanel {
  readonly panelIndex: number;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly viewCode: TurnaroundViewCode;
  readonly labelKo: string;
  readonly panelBounds: TurnaroundSheetPanelBounds;
  readonly projectedHead: ProjectedCharacterHeadView;
}

export interface TurnaroundRailAlignmentAudit {
  readonly crownDriftPx: number;
  readonly browDriftPx: number;
  readonly eyeDriftPx: number;
  readonly noseDriftPx: number;
  readonly chinDriftPx: number;
  readonly maxVerticalDriftPx: number;
  readonly withinTolerance: boolean;
  readonly tolerancePx: number;
}

export interface FiveAngleTurnaroundSheet {
  readonly canonSheet: CharacterHeadCanonSheet;
  readonly expressionPreset: ExpressionPresetId;
  readonly expressionLabelKo: string;
  readonly canonFingerprintSha256: string;
  readonly canonFingerprintFnv1a: string;
  readonly panelWidthPx: number;
  readonly panelHeightPx: number;
  readonly panelGapPx: number;
  readonly leftRailLabelMarginPx: number;
  readonly headScalePx: number;
  readonly sharedOriginY: number;
  readonly panels: readonly TurnaroundSheetPanel[];
  readonly sharedCanonRails: ProjectedCanonGuideRails;
  readonly railAlignmentAudit: TurnaroundRailAlignmentAudit;
}

export interface ObservedAsymmetricLandmark {
  readonly landmarkId: string;
  readonly observedScreenSide: "screen-left" | "screen-right";
  readonly observedVisible?: boolean;
}

export interface DrawnPanelFaceObservation {
  readonly panelId: string;
  readonly episodeLabel?: string;
  readonly estimatedYawDeg: number;
  readonly estimatedPitchDeg: number;
  readonly expressionPreset?: ExpressionPresetId;
  readonly observedEyeSpacingRatio?: number;
  readonly observedJawToHeadRatio?: number;
  readonly observedHeadWidthToHeightRatio?: number;
  readonly observedEyeLineVerticalRatio?: number;
  readonly observedLandmarks: readonly ObservedAsymmetricLandmark[];
  readonly flagMissingVisibleLandmarks?: boolean;
}

export interface OffModelAuditTolerances {
  readonly eyeSpacingToleranceRatio: number;
  readonly jawRatioTolerance: number;
  readonly headAspectTolerance: number;
  readonly eyeLineRatioTolerance: number;
}

export const DEFAULT_OFFMODEL_AUDIT_TOLERANCES: OffModelAuditTolerances = {
  eyeSpacingToleranceRatio: 0.18,
  jawRatioTolerance: 0.06,
  headAspectTolerance: 0.08,
  eyeLineRatioTolerance: 0.06,
};

export type OffModelFindingCode =
  | "mirrored-asymmetric-landmark"
  | "impossible-occluded-landmark"
  | "missing-visible-landmark"
  | "unknown-asymmetric-landmark"
  | "eye-spacing-drift"
  | "craniofacial-proportion-drift";

export type OffModelFindingSeverity = "blocker" | "warning" | "info";
export type OffModelPassStatus = "on-model" | "needs-revision" | "blocked";

export interface OffModelAuditFinding {
  readonly code: OffModelFindingCode;
  readonly severity: OffModelFindingSeverity;
  readonly landmarkId?: string;
  readonly metricName?: string;
  readonly expectedValue: string;
  readonly observedValue: string;
  readonly delta?: number;
  readonly penaltyPoints: number;
  readonly messageKo: string;
  readonly recommendedFixKo: string;
}

export interface LandmarkChiralityAuditEntry {
  readonly landmarkId: string;
  readonly labelKo: string;
  readonly anatomicalSide: AnatomicalSide;
  readonly expectedVisible: boolean;
  readonly expectedScreenSide: ScreenSide;
  readonly normalDotView: number;
  readonly observedVisible: boolean | null;
  readonly observedScreenSide: "screen-left" | "screen-right" | null;
  readonly status: "match" | "mirrored-blocker" | "occluded-warning" | "missing-warning" | "not-checked";
}

export interface ProportionDriftAuditEntry {
  readonly metricName: "eyeSpacingRatio" | "jawToHeadRatio" | "headWidthToHeightRatio" | "eyeLineVerticalRatio";
  readonly labelKo: string;
  readonly expectedValue: number;
  readonly observedValue: number;
  readonly delta: number;
  readonly tolerance: number;
  readonly withinTolerance: boolean;
}

export interface OffModelDriftAuditReport {
  readonly panelId: string;
  readonly episodeLabel: string;
  readonly characterId: string;
  readonly characterName: string;
  readonly estimatedYawDeg: number;
  readonly estimatedPitchDeg: number;
  readonly expressionPreset: ExpressionPresetId;
  readonly canonFingerprintSha256: string;
  readonly canonFingerprintFnv1a: string;
  readonly projectedCanonView: ProjectedCharacterHeadView;
  readonly findings: readonly OffModelAuditFinding[];
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly onModelConsistencyScore: number;
  readonly passStatus: OffModelPassStatus;
  readonly landmarkChecks: readonly LandmarkChiralityAuditEntry[];
  readonly proportionChecks: readonly ProportionDriftAuditEntry[];
}

function describeTurnaroundAngle(yawDeg: number): { readonly viewCode: TurnaroundViewCode; readonly labelKo: string } {
  const norm = normalizeYawDeg(yawDeg);
  if (norm === -90) return { viewCode: "left-profile", labelKo: "좌측면 (-90°)" };
  if (norm === -45) return { viewCode: "left-three-quarter", labelKo: "좌 3/4 (-45°)" };
  if (norm === 0) return { viewCode: "front", labelKo: "정면 (0°)" };
  if (norm === 45) return { viewCode: "right-three-quarter", labelKo: "우 3/4 (+45°)" };
  return { viewCode: "back", labelKo: "후면 (+180°)" };
}

function measureSpread(values: readonly number[]): number {
  if (values.length <= 1) return 0;
  let minVal = values[0];
  let maxVal = values[0];
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] < minVal) minVal = values[i];
    if (values[i] > maxVal) maxVal = values[i];
  }
  return maxVal - minVal;
}

/**
 * 5각 정규 턴어라운드(`[-90°, -45°, 0°, +45°, +180°]`) 모델 시트를 합성하고
 * 공통 수평 기준선(`정수리·눈썹·눈·코·턱`) 정렬 정밀도(`< 1e-4 px`)를 검증한다.
 */
export function buildFiveAngleTurnaroundSheet(
  canonSheet: CharacterHeadCanonSheet,
  expressionPreset: ExpressionPresetId = "neutral",
  options?: TurnaroundSheetBuildOptions,
): FiveAngleTurnaroundSheet {
  const panelWidthPx = clampFinite(options?.panelWidthPx ?? 230, 140, 480, 230);
  const panelHeightPx = clampFinite(options?.panelHeightPx ?? 270, 180, 560, 270);
  const headScalePx = clampFinite(options?.headScalePx ?? 180, 96, 360, 180);
  const panelGapPx = clampFinite(options?.panelGapPx ?? 14, 0, 48, 14);
  const leftRailLabelMarginPx = clampFinite(options?.leftRailLabelMarginPx ?? 76, 48, 140, 76);
  const sharedOriginY = clampFinite(options?.sharedOriginY ?? 220, 110, 600, 220);
  const pitchDeg = clampFinite(options?.pitchDeg ?? 0, -45, 45, 0);

  const fingerprints = computeCanonSheetFingerprints(canonSheet);
  const exprMeta = EXPRESSION_PRESET_TABLE[expressionPreset] ?? EXPRESSION_PRESET_TABLE.neutral;
  const panelTopY = sharedOriginY - panelHeightPx * 0.5;

  const panels: TurnaroundSheetPanel[] = CANONICAL_FIVE_TURNAROUND_ANGLES_DEG.map((yawDeg, idx) => {
    const panelX = leftRailLabelMarginPx + idx * (panelWidthPx + panelGapPx);
    const descriptor = describeTurnaroundAngle(yawDeg);
    const projectedHead = projectCharacterHeadAtView(
      canonSheet,
      { yawDeg, pitchDeg },
      exprMeta.presetId,
      { headScalePx, originPx: { x: panelX + panelWidthPx * 0.5, y: sharedOriginY } },
    );
    return {
      panelIndex: idx,
      yawDeg,
      pitchDeg,
      viewCode: descriptor.viewCode,
      labelKo: descriptor.labelKo,
      panelBounds: { x: panelX, y: panelTopY, width: panelWidthPx, height: panelHeightPx },
      projectedHead,
    };
  });

  const crownDriftPx = measureSpread(panels.map((p) => p.projectedHead.canonGuideRails.crownY));
  const browDriftPx = measureSpread(panels.map((p) => p.projectedHead.canonGuideRails.browY));
  const eyeDriftPx = measureSpread(panels.map((p) => p.projectedHead.canonGuideRails.eyeY));
  const noseDriftPx = measureSpread(panels.map((p) => p.projectedHead.canonGuideRails.noseY));
  const chinDriftPx = measureSpread(panels.map((p) => p.projectedHead.canonGuideRails.chinY));
  const maxVerticalDriftPx = Math.max(crownDriftPx, browDriftPx, eyeDriftPx, noseDriftPx, chinDriftPx);
  const tolerancePx = 1e-4;

  return {
    canonSheet,
    expressionPreset: exprMeta.presetId,
    expressionLabelKo: exprMeta.labelKo,
    canonFingerprintSha256: fingerprints.sha256Hex,
    canonFingerprintFnv1a: fingerprints.fnv1aHex,
    panelWidthPx,
    panelHeightPx,
    panelGapPx,
    leftRailLabelMarginPx,
    headScalePx,
    sharedOriginY,
    panels,
    sharedCanonRails: (panels[2] ?? panels[0]).projectedHead.canonGuideRails,
    railAlignmentAudit: {
      crownDriftPx,
      browDriftPx,
      eyeDriftPx,
      noseDriftPx,
      chinDriftPx,
      maxVerticalDriftPx,
      withinTolerance: maxVerticalDriftPx < tolerancePx,
      tolerancePx,
    },
  };
}

function screenSideLabelKo(side: ScreenSide): string {
  if (side === "screen-left") return "화면 왼쪽";
  if (side === "screen-right") return "화면 오른쪽";
  return "정중앙";
}

function anatomicalSideLabelKo(side: AnatomicalSide): string {
  return side === "anatomical-left" ? "해부학적 왼쪽" : "해부학적 오른쪽";
}

/**
 * 어시스턴트/회차 패널에서 관측한 캐릭터 얼굴을 3D 캐논 투영과 대조해 작붕(좌우 반전·가림 오류·비율 이탈)을 감사한다.
 */
export function auditDrawnPanelFaceAgainstCanon(
  canonSheet: CharacterHeadCanonSheet,
  drawnObservation: DrawnPanelFaceObservation,
  tolerances?: Partial<OffModelAuditTolerances>,
): OffModelDriftAuditReport {
  const tol: OffModelAuditTolerances = {
    eyeSpacingToleranceRatio: clampFinite(tolerances?.eyeSpacingToleranceRatio ?? DEFAULT_OFFMODEL_AUDIT_TOLERANCES.eyeSpacingToleranceRatio, 0.02, 1.0, 0.18),
    jawRatioTolerance: clampFinite(tolerances?.jawRatioTolerance ?? DEFAULT_OFFMODEL_AUDIT_TOLERANCES.jawRatioTolerance, 0.01, 0.4, 0.06),
    headAspectTolerance: clampFinite(tolerances?.headAspectTolerance ?? DEFAULT_OFFMODEL_AUDIT_TOLERANCES.headAspectTolerance, 0.01, 0.4, 0.08),
    eyeLineRatioTolerance: clampFinite(tolerances?.eyeLineRatioTolerance ?? DEFAULT_OFFMODEL_AUDIT_TOLERANCES.eyeLineRatioTolerance, 0.01, 0.4, 0.06),
  };

  const yawDeg = normalizeYawDeg(drawnObservation.estimatedYawDeg);
  const pitchDeg = clampFinite(drawnObservation.estimatedPitchDeg, -45, 45, 0);
  const exprPreset = drawnObservation.expressionPreset ?? "neutral";
  const projected = projectCharacterHeadAtView(canonSheet, { yawDeg, pitchDeg }, exprPreset);
  const fingerprints = computeCanonSheetFingerprints(canonSheet);

  const findings: OffModelAuditFinding[] = [];
  const landmarkChecks: LandmarkChiralityAuditEntry[] = [];
  const proportionChecks: ProportionDriftAuditEntry[] = [];

  const observedById = new Map<string, ObservedAsymmetricLandmark>();
  for (const obs of drawnObservation.observedLandmarks) {
    observedById.set(obs.landmarkId, obs);
  }

  const expectedIds = new Set<string>();
  for (const expected of projected.asymmetricLandmarks) {
    expectedIds.add(expected.landmarkId);
    const observed = observedById.get(expected.landmarkId);
    const obsVisible = observed ? observed.observedVisible ?? true : null;

    if (!observed) {
      if (drawnObservation.flagMissingVisibleLandmarks && expected.visible && expected.normalDotView >= 0.3) {
        findings.push({
          code: "missing-visible-landmark",
          severity: "warning",
          landmarkId: expected.landmarkId,
          expectedValue: `${expected.expectedScreenSide} (노출)`,
          observedValue: "미표기(누락)",
          penaltyPoints: 12,
          messageKo: `누락 의심: '${expected.labelKo}'(${anatomicalSideLabelKo(expected.anatomicalSide)})는 현재 각도(${yawDeg}°)에서 뚜렷이 보여야 하지만 패널에 빠졌습니다.`,
          recommendedFixKo: `설정 시트의 '${expected.labelKo}' 특징점을 ${screenSideLabelKo(expected.expectedScreenSide)} 위치에 복원하세요.`,
        });
        landmarkChecks.push({
          landmarkId: expected.landmarkId,
          labelKo: expected.labelKo,
          anatomicalSide: expected.anatomicalSide,
          expectedVisible: expected.visible,
          expectedScreenSide: expected.expectedScreenSide,
          normalDotView: expected.normalDotView,
          observedVisible: false,
          observedScreenSide: null,
          status: "missing-warning",
        });
      } else {
        landmarkChecks.push({
          landmarkId: expected.landmarkId,
          labelKo: expected.labelKo,
          anatomicalSide: expected.anatomicalSide,
          expectedVisible: expected.visible,
          expectedScreenSide: expected.expectedScreenSide,
          normalDotView: expected.normalDotView,
          observedVisible: null,
          observedScreenSide: null,
          status: "not-checked",
        });
      }
      continue;
    }

    if (obsVisible === false) {
      const missed = expected.visible && expected.normalDotView >= 0.3;
      if (missed) {
        findings.push({
          code: "missing-visible-landmark",
          severity: "warning",
          landmarkId: expected.landmarkId,
          expectedValue: `${expected.expectedScreenSide} (노출)`,
          observedValue: "비가시 처리",
          penaltyPoints: 12,
          messageKo: `특징점 누락: '${expected.labelKo}'는 ${yawDeg}° 시점에서 노출되어야 하지만 가려진 상태로 그려졌습니다.`,
          recommendedFixKo: `해당 컷에서 '${expected.labelKo}'를 ${screenSideLabelKo(expected.expectedScreenSide)}에 다시 그려 넣으세요.`,
        });
      }
      landmarkChecks.push({
        landmarkId: expected.landmarkId,
        labelKo: expected.labelKo,
        anatomicalSide: expected.anatomicalSide,
        expectedVisible: expected.visible,
        expectedScreenSide: expected.expectedScreenSide,
        normalDotView: expected.normalDotView,
        observedVisible: false,
        observedScreenSide: observed.observedScreenSide,
        status: missed ? "missing-warning" : "match",
      });
      continue;
    }

    if (!expected.visible) {
      findings.push({
        code: "impossible-occluded-landmark",
        severity: "warning",
        landmarkId: expected.landmarkId,
        expectedValue: "occluded (후면 가림)",
        observedValue: `${observed.observedScreenSide} (노출)`,
        penaltyPoints: expected.normalDotView < -0.35 ? 18 : 14,
        messageKo: `가림 오류: '${expected.labelKo}'(${anatomicalSideLabelKo(expected.anatomicalSide)})는 현재 회전각(${yawDeg}°)에서 두상 반대편으로 가려져야 하지만 화면에 그려졌습니다.`,
        recommendedFixKo: `측면/후면 각도에서는 반대편 뺨의 '${expected.labelKo}'를 숨기고 보이는 쪽 실루엣만 유지하세요.`,
      });
      landmarkChecks.push({
        landmarkId: expected.landmarkId,
        labelKo: expected.labelKo,
        anatomicalSide: expected.anatomicalSide,
        expectedVisible: false,
        expectedScreenSide: expected.expectedScreenSide,
        normalDotView: expected.normalDotView,
        observedVisible: true,
        observedScreenSide: observed.observedScreenSide,
        status: "occluded-warning",
      });
      continue;
    }

    if (expected.expectedScreenSide !== "center" && observed.observedScreenSide !== expected.expectedScreenSide) {
      findings.push({
        code: "mirrored-asymmetric-landmark",
        severity: "blocker",
        landmarkId: expected.landmarkId,
        expectedValue: expected.expectedScreenSide,
        observedValue: observed.observedScreenSide,
        penaltyPoints: 38,
        messageKo: `좌우 반전 작붕: '${expected.labelKo}'(${anatomicalSideLabelKo(expected.anatomicalSide)})는 ${yawDeg}° 시점에서 ${screenSideLabelKo(expected.expectedScreenSide)}에 위치해야 하지만 ${screenSideLabelKo(observed.observedScreenSide)}으로 뒤집혔습니다.`,
        recommendedFixKo: `캔버스 좌우 반전 작업 뒤 '${expected.labelKo}' 레이어를 ${screenSideLabelKo(expected.expectedScreenSide)}으로 즉시 교정하세요.`,
      });
      landmarkChecks.push({
        landmarkId: expected.landmarkId,
        labelKo: expected.labelKo,
        anatomicalSide: expected.anatomicalSide,
        expectedVisible: true,
        expectedScreenSide: expected.expectedScreenSide,
        normalDotView: expected.normalDotView,
        observedVisible: true,
        observedScreenSide: observed.observedScreenSide,
        status: "mirrored-blocker",
      });
      continue;
    }

    landmarkChecks.push({
      landmarkId: expected.landmarkId,
      labelKo: expected.labelKo,
      anatomicalSide: expected.anatomicalSide,
      expectedVisible: true,
      expectedScreenSide: expected.expectedScreenSide,
      normalDotView: expected.normalDotView,
      observedVisible: true,
      observedScreenSide: observed.observedScreenSide,
      status: "match",
    });
  }

  for (const obs of drawnObservation.observedLandmarks) {
    if (!expectedIds.has(obs.landmarkId)) {
      findings.push({
        code: "unknown-asymmetric-landmark",
        severity: "warning",
        landmarkId: obs.landmarkId,
        expectedValue: "캐논 시트 미등록",
        observedValue: `${obs.landmarkId} (${obs.observedScreenSide})`,
        penaltyPoints: 6,
        messageKo: `미등록 특징점: '${obs.landmarkId}'는 캐릭터 기준 시트에 없는 항목입니다.`,
        recommendedFixKo: "신규 상처·소품이라면 캐릭터 기준 시트에 먼저 등록한 뒤 회차 검수를 진행하세요.",
      });
    }
  }

  let microDriftPenalty = 0;
  const evaluateProportion = (
    metricName: ProportionDriftAuditEntry["metricName"],
    labelKo: string,
    expectedVal: number,
    observedVal: number | undefined,
    tolerance: number,
    code: "eye-spacing-drift" | "craniofacial-proportion-drift",
    fixKo: string,
  ): void => {
    if (observedVal === undefined || !Number.isFinite(observedVal)) return;
    const delta = observedVal - expectedVal;
    const absDelta = Math.abs(delta);
    const within = absDelta <= tolerance;
    proportionChecks.push({ metricName, labelKo, expectedValue: expectedVal, observedValue: observedVal, delta, tolerance, withinTolerance: within });
    if (within) {
      if (absDelta > tolerance * 0.45) microDriftPenalty += Math.min(1.5, (absDelta / tolerance) * 1.5);
      return;
    }
    const severity: OffModelFindingSeverity = absDelta > tolerance * 2.2 ? "blocker" : "warning";
    const excessRatio = (absDelta - tolerance) / Math.max(0.01, tolerance);
    const penaltyPoints = Math.min(24, Math.round((11 + excessRatio * 7) * 10) / 10);
    const directionKo = delta > 0 ? "과도하게 넓거나 길어졌습니다" : "과도하게 좁거나 짧아졌습니다";
    findings.push({
      code,
      severity,
      metricName,
      expectedValue: expectedVal.toFixed(3),
      observedValue: observedVal.toFixed(3),
      delta,
      penaltyPoints,
      messageKo: `${labelKo} 이탈: 기준 ${expectedVal.toFixed(2)} 대비 실측 ${observedVal.toFixed(2)}(오차 ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}, 허용 ±${tolerance.toFixed(2)})로 ${directionKo}.`,
      recommendedFixKo: fixKo,
    });
  };

  if (projected.facialFeatures.leftEye.visible && projected.facialFeatures.rightEye.visible) {
    evaluateProportion(
      "eyeSpacingRatio",
      "눈 사이 간격 비율",
      projected.facialFeatures.effectiveEyeSpacingRatio,
      drawnObservation.observedEyeSpacingRatio,
      tol.eyeSpacingToleranceRatio,
      "eye-spacing-drift",
      "눈 한 쪽 너비 기준(루미스 1:1:1 비율)에 맞춰 미간 폭을 조정하세요.",
    );
  }
  evaluateProportion(
    "jawToHeadRatio",
    "하악-두상 높이 비율",
    projected.facialFeatures.effectiveJawToHeadRatio,
    drawnObservation.observedJawToHeadRatio,
    tol.jawRatioTolerance,
    "craniofacial-proportion-drift",
    "코밑선에서 턱 끝까지의 하악 길이를 기준 턴어라운드 가이드선에 맞춰 재정렬하세요.",
  );
  evaluateProportion(
    "headWidthToHeightRatio",
    "두상 가로/세로 비율",
    projected.cranialBounds.widthToHeightRatio,
    drawnObservation.observedHeadWidthToHeightRatio,
    tol.headAspectTolerance,
    "craniofacial-proportion-drift",
    "두개골 폭과 광대 바깥 실루엣을 루미스 기준 타원에 맞춰 보정하세요.",
  );
  evaluateProportion(
    "eyeLineVerticalRatio",
    "눈 수평선 높이 비율",
    projected.facialFeatures.effectiveEyeLineVerticalRatio,
    drawnObservation.observedEyeLineVerticalRatio,
    tol.eyeLineRatioTolerance,
    "craniofacial-proportion-drift",
    "현재 고개 각도(pitch)의 눈 수평선 가이드에 맞춰 눈과 눈썹 높이를 이동하세요.",
  );

  const blockerCount = findings.filter((f) => f.severity === "blocker").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  const totalFindingPenalty = findings.reduce((acc, f) => acc + f.penaltyPoints, 0);
  const onModelConsistencyScore = Math.max(0, Math.min(100, Math.round((100 - totalFindingPenalty - Math.min(3, microDriftPenalty)) * 10) / 10));
  const passStatus: OffModelPassStatus =
    blockerCount > 0 ? "blocked" : warningCount > 0 || onModelConsistencyScore < 85 ? "needs-revision" : "on-model";

  return {
    panelId: drawnObservation.panelId,
    episodeLabel: drawnObservation.episodeLabel ?? "미지정 회차",
    characterId: canonSheet.characterId,
    characterName: canonSheet.characterName,
    estimatedYawDeg: yawDeg,
    estimatedPitchDeg: pitchDeg,
    expressionPreset: exprPreset,
    canonFingerprintSha256: fingerprints.sha256Hex,
    canonFingerprintFnv1a: fingerprints.fnv1aHex,
    projectedCanonView: projected,
    findings,
    blockerCount,
    warningCount,
    onModelConsistencyScore,
    passStatus,
    landmarkChecks,
    proportionChecks,
  };
}
