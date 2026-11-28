/**
 * 작가가 그린 2D 러프·선화의 실제 랜드마크와 투영된 원근 캐논 가이드 간의 편차를 정량 비교해
 * 부위별 과대·과소 원근 왜곡률(%)을 진단하고 캔버스 보정 화살표 벡터(`correctionArrows`)를 생성한다.
 */

import type { ProjectedPerspectiveRigResult } from "./camera-perspective-rig-projector";
import type {
  CanonLandmarkId,
  CharacterProportionCanon,
  ProportionMetricId,
  Vec2,
} from "./character-proportion-canon-extractor";

export type DriftSeverity = "ok" | "warning" | "critical";
export type DriftDirection = "aligned" | "oversized" | "undersized";
export type DriftAlignmentMode = "locked-canvas" | "fit-total-height";

export interface ArtistDrawingLandmarksInput {
  readonly crown: Vec2;
  readonly chin: Vec2;
  readonly shoulderLeft: Vec2;
  readonly shoulderRight: Vec2;
  readonly pelvisLeft: Vec2;
  readonly pelvisRight: Vec2;
  readonly footSole: Vec2;
  readonly kneeLeft?: Vec2;
  readonly kneeRight?: Vec2;
  readonly ankleLeft?: Vec2;
  readonly ankleRight?: Vec2;
}

export interface DriftValidationOptions {
  /** 기본 `"locked-canvas"`: 투영 가이드 좌표와 1:1 비교. `"fit-total-height"`: 전체 신장 맞춤 후 순수 상대 비율 비교 */
  readonly alignmentMode?: DriftAlignmentMode;
  /** 이 거리(px) 미만의 미세 오차는 보정 화살표 생성에서 제외(기본 2px) */
  readonly minArrowThresholdPx?: number;
}

export interface RegionDriftDiagnosis {
  readonly metricId: ProportionMetricId;
  readonly labelKo: string;
  readonly expectedValue: number;
  readonly actualValue: number;
  /** 양수 = 과대(%), 음수 = 과소(%) */
  readonly driftPercent: number;
  readonly direction: DriftDirection;
  readonly severity: DriftSeverity;
  readonly warningThresholdPercent: number;
  readonly criticalThresholdPercent: number;
  readonly messageKo: string;
}

export interface CorrectionArrowGuide {
  readonly landmarkId: CanonLandmarkId;
  readonly labelKo: string;
  readonly from: Vec2;
  readonly to: Vec2;
  readonly delta: Vec2;
  readonly magnitudePx: number;
  readonly normalizedDirection: Vec2;
  readonly angleDeg: number;
  readonly severity: DriftSeverity;
  readonly instructionKo: string;
}

export interface AlignmentTransform2D {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface ProportionDriftValidationReport {
  readonly overallStatus: DriftSeverity;
  /** 0~100점. 모든 부위가 허용 편차 이내일수록 100에 수렴 */
  readonly proportionScore: number;
  readonly alignmentMode: DriftAlignmentMode;
  readonly alignmentTransform: AlignmentTransform2D;
  readonly regionDiagnoses: readonly RegionDriftDiagnosis[];
  readonly diagnosisMap: Readonly<Record<ProportionMetricId, RegionDriftDiagnosis>>;
  readonly worstRegion: RegionDriftDiagnosis | null;
  readonly correctionArrows: readonly CorrectionArrowGuide[];
  readonly summaryKo: string;
}

function roundTo(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function assertVec2(point: Vec2, name: string): Vec2 {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${name} 좌표는 유한한 숫자여야 합니다.`);
  }
  return point;
}

function midpoint2D(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}

function dist2D(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function severityRank(severity: DriftSeverity): number {
  if (severity === "critical") return 2;
  if (severity === "warning") return 1;
  return 0;
}

function describeCardinalDirectionKo(delta: Vec2): string {
  const absX = Math.abs(delta.x);
  const absY = Math.abs(delta.y);
  const horizontal = delta.x > 0 ? "오른쪽" : "왼쪽";
  const vertical = delta.y < 0 ? "위쪽" : "아래쪽";
  if (absX > absY * 2.2) return horizontal;
  if (absY > absX * 2.2) return vertical;
  return `${horizontal} ${vertical}`;
}

function buildRegionDiagnosis(
  canon: CharacterProportionCanon,
  metricId: ProportionMetricId,
  expectedValue: number,
  actualValue: number,
  angleClassification: ProjectedPerspectiveRigResult["metrics"]["angleClassification"],
): RegionDriftDiagnosis {
  const rule = canon.toleranceTable[metricId];
  const safeExpected = Math.max(expectedValue, 1e-4);
  const driftPercent = roundTo(((actualValue - expectedValue) / safeExpected) * 100, 2);
  const absDrift = Math.abs(driftPercent);

  const severity: DriftSeverity =
    absDrift > rule.criticalPercent
      ? "critical"
      : absDrift > rule.warningPercent
        ? "warning"
        : "ok";

  const direction: DriftDirection =
    absDrift <= rule.warningPercent
      ? "aligned"
      : driftPercent > 0
        ? "oversized"
        : "undersized";

  let messageKo: string;
  if (severity === "ok") {
    messageKo = `${rule.labelKo}가 원근 가이드 허용 범위(±${rule.warningPercent}%) 안에 있습니다.`;
  } else {
    const magnitudeText = `${Math.abs(driftPercent).toFixed(1)}%`;
    const directionText = direction === "oversized" ? "과대" : "과소";
    const angleHint =
      metricId === "lowerBodyLength" && angleClassification === "high-angle" && direction === "oversized"
        ? " 하이앵글 다리 단축을 더 강하게 적용하세요."
        : metricId === "headHeight" && angleClassification === "high-angle" && direction === "undersized"
          ? " 하이앵글 근경 머리를 더 크게 확보하세요."
          : metricId === "lowerBodyLength" && angleClassification === "low-angle" && direction === "undersized"
            ? " 로우앵글 하체 원근 강조를 더 키우세요."
            : "";
    messageKo = `${rule.labelKo}가 투영 기준보다 ${magnitudeText} ${directionText} 왜곡되었습니다.${angleHint}`;
  }

  return {
    metricId,
    labelKo: rule.labelKo,
    expectedValue: roundTo(expectedValue, 4),
    actualValue: roundTo(actualValue, 4),
    driftPercent,
    direction,
    severity,
    warningThresholdPercent: rule.warningPercent,
    criticalThresholdPercent: rule.criticalPercent,
    messageKo,
  };
}

function computeAlignmentTransform(
  rig: ProjectedPerspectiveRigResult,
  drawn: ArtistDrawingLandmarksInput,
  mode: DriftAlignmentMode,
): AlignmentTransform2D {
  if (mode === "locked-canvas") {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const expectedCrown = rig.landmarkMap.crown.canvas;
  const expectedFoot = rig.landmarkMap.footSole.canvas;
  const expectedSpan = Math.max(dist2D(expectedCrown, expectedFoot), 1e-4);
  const drawnSpan = Math.max(dist2D(drawn.crown, drawn.footSole), 1e-4);
  const scale = drawnSpan / expectedSpan;
  const expectedCenter = midpoint2D(expectedCrown, expectedFoot);
  const drawnCenter = midpoint2D(drawn.crown, drawn.footSole);

  return {
    scale: roundTo(scale, 5),
    offsetX: roundTo(drawnCenter.x - expectedCenter.x * scale, 3),
    offsetY: roundTo(drawnCenter.y - expectedCenter.y * scale, 3),
  };
}

function applyAlignment(point: Vec2, transform: AlignmentTransform2D): Vec2 {
  return {
    x: roundTo(point.x * transform.scale + transform.offsetX, 3),
    y: roundTo(point.y * transform.scale + transform.offsetY, 3),
  };
}

/**
 * 작가의 2D 러프·선화 랜드마크를 투영된 3D 원근 캐논 가이드와 비교해
 * 부위별 왜곡률(%)과 캔버스 보정 화살표 벡터를 산출한다.
 */
export function validateArtistProportionDrift(
  canon: CharacterProportionCanon,
  rig: ProjectedPerspectiveRigResult,
  drawn: ArtistDrawingLandmarksInput,
  options: DriftValidationOptions = {},
): ProportionDriftValidationReport {
  assertVec2(drawn.crown, "drawn.crown");
  assertVec2(drawn.chin, "drawn.chin");
  assertVec2(drawn.shoulderLeft, "drawn.shoulderLeft");
  assertVec2(drawn.shoulderRight, "drawn.shoulderRight");
  assertVec2(drawn.pelvisLeft, "drawn.pelvisLeft");
  assertVec2(drawn.pelvisRight, "drawn.pelvisRight");
  assertVec2(drawn.footSole, "drawn.footSole");
  if (drawn.kneeLeft) assertVec2(drawn.kneeLeft, "drawn.kneeLeft");
  if (drawn.kneeRight) assertVec2(drawn.kneeRight, "drawn.kneeRight");
  if (drawn.ankleLeft) assertVec2(drawn.ankleLeft, "drawn.ankleLeft");
  if (drawn.ankleRight) assertVec2(drawn.ankleRight, "drawn.ankleRight");

  const alignmentMode = options.alignmentMode ?? "locked-canvas";
  const minArrowThresholdPx = Math.max(0, options.minArrowThresholdPx ?? 2.0);
  const alignmentTransform = computeAlignmentTransform(rig, drawn, alignmentMode);

  const alignedExpected = (id: CanonLandmarkId): Vec2 =>
    applyAlignment(rig.landmarkMap[id].canvas, alignmentTransform);

  const drawnShoulderCenter = midpoint2D(drawn.shoulderLeft, drawn.shoulderRight);
  const drawnPelvisCenter = midpoint2D(drawn.pelvisLeft, drawn.pelvisRight);

  const expectedHeadPx = dist2D(alignedExpected("crown"), alignedExpected("chin"));
  const expectedShoulderPx = dist2D(
    alignedExpected("shoulderLeft"),
    alignedExpected("shoulderRight"),
  );
  const expectedTorsoPx = dist2D(
    alignedExpected("shoulderCenter"),
    alignedExpected("pelvisCenter"),
  );
  const expectedPelvisPx = dist2D(alignedExpected("pelvisLeft"), alignedExpected("pelvisRight"));
  const expectedLowerPx = dist2D(alignedExpected("pelvisCenter"), alignedExpected("footSole"));
  const expectedTotalPx = Math.max(
    dist2D(alignedExpected("crown"), alignedExpected("footSole")),
    1e-4,
  );

  const actualHeadPx = dist2D(drawn.crown, drawn.chin);
  const actualShoulderPx = dist2D(drawn.shoulderLeft, drawn.shoulderRight);
  const actualTorsoPx = dist2D(drawnShoulderCenter, drawnPelvisCenter);
  const actualPelvisPx = dist2D(drawn.pelvisLeft, drawn.pelvisRight);
  const actualLowerPx = dist2D(drawnPelvisCenter, drawn.footSole);
  const actualTotalPx = Math.max(dist2D(drawn.crown, drawn.footSole), 1e-4);

  const angleKind = rig.metrics.angleClassification;
  const regionDiagnoses: RegionDriftDiagnosis[] = [
    buildRegionDiagnosis(canon, "headHeight", expectedHeadPx, actualHeadPx, angleKind),
    buildRegionDiagnosis(canon, "shoulderWidth", expectedShoulderPx, actualShoulderPx, angleKind),
    buildRegionDiagnosis(canon, "torsoLength", expectedTorsoPx, actualTorsoPx, angleKind),
    buildRegionDiagnosis(canon, "pelvisWidth", expectedPelvisPx, actualPelvisPx, angleKind),
    buildRegionDiagnosis(canon, "lowerBodyLength", expectedLowerPx, actualLowerPx, angleKind),
    buildRegionDiagnosis(
      canon,
      "apparentHeadShare",
      expectedHeadPx / expectedTotalPx,
      actualHeadPx / actualTotalPx,
      angleKind,
    ),
  ];

  const diagnosisMap = Object.fromEntries(
    regionDiagnoses.map((item) => [item.metricId, item]),
  ) as Readonly<Record<ProportionMetricId, RegionDriftDiagnosis>>;

  const landmarkPairs: Array<readonly [CanonLandmarkId, Vec2]> = [
    ["crown", drawn.crown],
    ["chin", drawn.chin],
    ["shoulderLeft", drawn.shoulderLeft],
    ["shoulderRight", drawn.shoulderRight],
    ["pelvisLeft", drawn.pelvisLeft],
    ["pelvisRight", drawn.pelvisRight],
    ["footSole", drawn.footSole],
  ];
  if (drawn.kneeLeft) landmarkPairs.push(["kneeLeft", drawn.kneeLeft]);
  if (drawn.kneeRight) landmarkPairs.push(["kneeRight", drawn.kneeRight]);
  if (drawn.ankleLeft) landmarkPairs.push(["ankleLeft", drawn.ankleLeft]);
  if (drawn.ankleRight) landmarkPairs.push(["ankleRight", drawn.ankleRight]);

  const headScaleRefPx = Math.max(expectedHeadPx, 10);
  const correctionArrows: CorrectionArrowGuide[] = [];

  for (const [landmarkId, fromPoint] of landmarkPairs) {
    const targetPoint = alignedExpected(landmarkId);
    const dx = targetPoint.x - fromPoint.x;
    const dy = targetPoint.y - fromPoint.y;
    const magnitudePx = Math.hypot(dx, dy);
    if (magnitudePx < minArrowThresholdPx) {
      continue;
    }

    const relativeToHead = magnitudePx / headScaleRefPx;
    const severity: DriftSeverity =
      relativeToHead > 0.22 ? "critical" : relativeToHead > 0.1 ? "warning" : "ok";
    const labelKo = rig.landmarkMap[landmarkId].labelKo;
    const dirKo = describeCardinalDirectionKo({ x: dx, y: dy });

    correctionArrows.push({
      landmarkId,
      labelKo,
      from: { x: roundTo(fromPoint.x, 3), y: roundTo(fromPoint.y, 3) },
      to: targetPoint,
      delta: { x: roundTo(dx, 3), y: roundTo(dy, 3) },
      magnitudePx: roundTo(magnitudePx, 3),
      normalizedDirection: {
        x: roundTo(dx / magnitudePx, 5),
        y: roundTo(dy / magnitudePx, 5),
      },
      angleDeg: roundTo((Math.atan2(dy, dx) * 180) / Math.PI, 2),
      severity,
      instructionKo: `${labelKo} 위치를 ${dirKo}으로 ${Math.round(magnitudePx)}px 옮겨 원근 가이드에 맞추세요.`,
    });
  }

  correctionArrows.sort((a, b) => b.magnitudePx - a.magnitudePx);

  let overallStatus: DriftSeverity = "ok";
  let worstRegion: RegionDriftDiagnosis | null = null;
  let penaltySum = 0;

  for (const diag of regionDiagnoses) {
    if (severityRank(diag.severity) > severityRank(overallStatus)) {
      overallStatus = diag.severity;
    }
    if (
      worstRegion === null ||
      Math.abs(diag.driftPercent) > Math.abs(worstRegion.driftPercent)
    ) {
      worstRegion = diag;
    }
    const excess = Math.max(0, Math.abs(diag.driftPercent) - diag.warningThresholdPercent);
    penaltySum += excess * 1.4;
  }

  for (const arrow of correctionArrows) {
    if (severityRank(arrow.severity) > severityRank(overallStatus)) {
      overallStatus = arrow.severity;
    }
  }

  const proportionScore = roundTo(Math.max(0, Math.min(100, 100 - penaltySum)), 1);

  const summaryKo =
    overallStatus === "ok"
      ? "주요 부위가 카메라 원근 등신대 허용 편차 안에 들어왔습니다."
      : worstRegion !== null
        ? `${worstRegion.messageKo} (보정 화살표 ${correctionArrows.length}건)`
        : `원근 보정이 필요한 지점이 ${correctionArrows.length}건 감지되었습니다.`;

  return {
    overallStatus,
    proportionScore,
    alignmentMode,
    alignmentTransform,
    regionDiagnoses,
    diagnosisMap,
    worstRegion,
    correctionArrows,
    summaryKo,
  };
}
