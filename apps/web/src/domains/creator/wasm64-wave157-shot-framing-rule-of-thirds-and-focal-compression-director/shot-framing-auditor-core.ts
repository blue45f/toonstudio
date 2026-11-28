/**
 * Wave 157 — 인체 관절 컷 절단(Tangent Joint Cropping)·헤드룸·리드룸·삼분할/황금비
 * 5대 프레이밍 결함 정량 감지기 코어.
 *
 * - 순수 결정론 계산(랜덤·시간·전역 상태 미사용)
 * - FIPS 180-4 SHA-256 매니페스트 지문(`framingManifestSha256Hex`) 생성
 */

import { computeShotFramingManifestSha256Hex } from "./shot-framing-sha256";
import {
  CROP_EDGE_LABELS_KO,
  JOINT_LABELS_KO,
  SAFE_CUT_ZONE_LABELS_KO,
  type CompositionGridMode,
  type CompositionPowerPoint,
  type CropBoundaryEdge,
  type GazeDirection,
  type JointLandmarkKind,
  type JointLandmarkSet,
  type NormalizedCropRect,
  type NormalizedPoint2D,
  type SafeCutZoneKind,
  type ShotFramingAuditOptions,
  type ShotFramingAuditResult,
  type ShotFramingDefect,
  type ShotFramingGrade,
  type ShotFramingPanelInput,
  type ShotScaleKind,
  type SubjectBodyLandmarks,
  type TangentJointCropDetail,
} from "./shot-framing-types";

/** 황금비 φ = (1 + √5) / 2. */
export const GOLDEN_RATIO_PHI = (1 + Math.sqrt(5)) / 2;
/** 황금비 분할 소선분 `1 - 1/φ ≈ 0.381966`. */
export const GOLDEN_RATIO_MINOR = 1 - 1 / GOLDEN_RATIO_PHI;
/** 황금비 분할 대선분 `1/φ ≈ 0.618034`. */
export const GOLDEN_RATIO_MAJOR = 1 / GOLDEN_RATIO_PHI;
/** 삼분할 소선분 `1/3`. */
export const RULE_OF_THIRDS_MINOR = 1 / 3;
/** 삼분할 대선분 `2/3`. */
export const RULE_OF_THIRDS_MAJOR = 2 / 3;

export const DEFAULT_JOINT_EXCLUSION_MARGIN_NORM = 0.04;
export const DEFAULT_MIN_HEADROOM_RATIO = 0.04;
export const DEFAULT_MAX_HEADROOM_RATIO = 0.35;
export const DEFAULT_MAX_POWER_POINT_DISTANCE_NORM = 0.15;

const RULE_OF_THIRDS_POINTS: readonly CompositionPowerPoint[] = [
  { grid: "rule-of-thirds", id: "thirds-tl", x: RULE_OF_THIRDS_MINOR, y: RULE_OF_THIRDS_MINOR },
  { grid: "rule-of-thirds", id: "thirds-tr", x: RULE_OF_THIRDS_MAJOR, y: RULE_OF_THIRDS_MINOR },
  { grid: "rule-of-thirds", id: "thirds-bl", x: RULE_OF_THIRDS_MINOR, y: RULE_OF_THIRDS_MAJOR },
  { grid: "rule-of-thirds", id: "thirds-br", x: RULE_OF_THIRDS_MAJOR, y: RULE_OF_THIRDS_MAJOR },
];

const GOLDEN_RATIO_POINTS: readonly CompositionPowerPoint[] = [
  { grid: "golden-ratio", id: "golden-tl", x: GOLDEN_RATIO_MINOR, y: GOLDEN_RATIO_MINOR },
  { grid: "golden-ratio", id: "golden-tr", x: GOLDEN_RATIO_MAJOR, y: GOLDEN_RATIO_MINOR },
  { grid: "golden-ratio", id: "golden-bl", x: GOLDEN_RATIO_MINOR, y: GOLDEN_RATIO_MAJOR },
  { grid: "golden-ratio", id: "golden-br", x: GOLDEN_RATIO_MAJOR, y: GOLDEN_RATIO_MAJOR },
];

const ALL_POWER_POINTS: readonly CompositionPowerPoint[] = [
  ...RULE_OF_THIRDS_POINTS,
  ...GOLDEN_RATIO_POINTS,
];

export function clampFramingValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function roundFramingValue(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, digits);
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * 구도 격자 모드에 따른 삼분할/황금비 교점 목록을 반환한다.
 */
export function listCompositionPowerPoints(
  grid: CompositionGridMode,
): readonly CompositionPowerPoint[] {
  if (grid === "rule-of-thirds") return RULE_OF_THIRDS_POINTS;
  if (grid === "golden-ratio") return GOLDEN_RATIO_POINTS;
  return ALL_POWER_POINTS;
}

/**
 * 크롭 사각형을 마스터 정규 범위 `[0, 1] x [0, 1]` 안으로 안전하게 정규화한다.
 */
export function normalizeCropRect(crop?: NormalizedCropRect): NormalizedCropRect {
  if (!crop) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  const width = clampFramingValue(crop.width, 0.05, 1);
  const height = clampFramingValue(crop.height, 0.05, 1);
  const x = clampFramingValue(crop.x, 0, Math.max(0, 1 - width));
  const y = clampFramingValue(crop.y, 0, Math.max(0, 1 - height));
  return {
    x: roundFramingValue(x, 6),
    y: roundFramingValue(y, 6),
    width: roundFramingValue(width, 6),
    height: roundFramingValue(height, 6),
  };
}

/**
 * 8등신 표준 인물 인체 랜드마크를 결정론적으로 생성한다(시뮬레이션·프리뷰·테스트용).
 */
export function createStandingSubjectLandmarks(params: {
  readonly subjectId?: string;
  readonly labelKo?: string;
  readonly centerX: number;
  readonly crownY: number;
  readonly bodyHeight: number;
  readonly gazeDirection: GazeDirection;
  readonly shoulderHalfWidth?: number;
}): SubjectBodyLandmarks {
  const cx = clampFramingValue(params.centerX, 0.05, 0.95);
  const crownY = clampFramingValue(params.crownY, 0, 0.85);
  const h = clampFramingValue(params.bodyHeight, 0.15, 1.0 - crownY);
  const sw = clampFramingValue(params.shoulderHalfWidth ?? h * 0.14, 0.03, 0.3);
  const eyeOffsetX =
    params.gazeDirection === "right" ? sw * 0.12 : params.gazeDirection === "left" ? -sw * 0.12 : 0;

  return {
    subjectId: params.subjectId ?? "subject-main",
    labelKo: params.labelKo ?? "주인공",
    crownY: roundFramingValue(crownY, 5),
    eyeCenter: {
      x: roundFramingValue(clampFramingValue(cx + eyeOffsetX, 0.01, 0.99), 5),
      y: roundFramingValue(crownY + h * 0.065, 5),
    },
    gazeDirection: params.gazeDirection,
    bodyBoundsX: {
      minX: roundFramingValue(clampFramingValue(cx - sw * 1.15, 0, 1), 5),
      maxX: roundFramingValue(clampFramingValue(cx + sw * 1.15, 0, 1), 5),
    },
    footY: roundFramingValue(crownY + h, 5),
    joints: {
      neck: { x: roundFramingValue(cx, 5), y: roundFramingValue(crownY + h * 0.155, 5) },
      elbows: [
        {
          x: roundFramingValue(clampFramingValue(cx - sw * 1.05, 0, 1), 5),
          y: roundFramingValue(crownY + h * 0.355, 5),
        },
        {
          x: roundFramingValue(clampFramingValue(cx + sw * 1.05, 0, 1), 5),
          y: roundFramingValue(crownY + h * 0.355, 5),
        },
      ],
      wrists: [
        {
          x: roundFramingValue(clampFramingValue(cx - sw * 1.12, 0, 1), 5),
          y: roundFramingValue(crownY + h * 0.495, 5),
        },
        {
          x: roundFramingValue(clampFramingValue(cx + sw * 1.12, 0, 1), 5),
          y: roundFramingValue(crownY + h * 0.495, 5),
        },
      ],
      knees: [
        {
          x: roundFramingValue(clampFramingValue(cx - sw * 0.42, 0, 1), 5),
          y: roundFramingValue(crownY + h * 0.725, 5),
        },
        {
          x: roundFramingValue(clampFramingValue(cx + sw * 0.42, 0, 1), 5),
          y: roundFramingValue(crownY + h * 0.725, 5),
        },
      ],
      ankles: [
        {
          x: roundFramingValue(clampFramingValue(cx - sw * 0.38, 0, 1), 5),
          y: roundFramingValue(crownY + h * 0.945, 5),
        },
        {
          x: roundFramingValue(clampFramingValue(cx + sw * 0.38, 0, 1), 5),
          y: roundFramingValue(crownY + h * 0.945, 5),
        },
      ],
    },
    safeCutZones: {
      chest: roundFramingValue(crownY + h * 0.255, 5),
      waist: roundFramingValue(crownY + h * 0.425, 5),
      midThigh: roundFramingValue(crownY + h * 0.61, 5),
      midShin: roundFramingValue(crownY + h * 0.835, 5),
    },
  };
}

export interface FlattenedJoint {
  readonly kind: JointLandmarkKind;
  readonly index: number;
  readonly point: NormalizedPoint2D;
}

/**
 * 금지 절단 관절 묶음을 결정론적 순서로 평탄화한다.
 */
export function flattenJointLandmarks(joints: JointLandmarkSet): readonly FlattenedJoint[] {
  const list: FlattenedJoint[] = [];
  if (joints.neck) {
    list.push({ kind: "neck", index: 0, point: joints.neck });
  }
  const arrayKinds: readonly ("elbows" | "wrists" | "knees" | "ankles")[] = [
    "elbows",
    "wrists",
    "knees",
    "ankles",
  ];
  for (let k = 0; k < arrayKinds.length; k += 1) {
    const kind = arrayKinds[k];
    if (!kind) continue;
    const pts = joints[kind];
    if (!pts) continue;
    for (let i = 0; i < pts.length; i += 1) {
      const pt = pts[i];
      if (!pt) continue;
      list.push({ kind, index: i, point: pt });
    }
  }
  return list;
}

function averageY(points?: readonly NormalizedPoint2D[]): number | null {
  if (!points || points.length === 0) return null;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i];
    if (pt && Number.isFinite(pt.y)) {
      sum += pt.y;
      count += 1;
    }
  }
  return count > 0 ? sum / count : null;
}

/**
 * 피사체 랜드마크로부터 4대 안전 절단 중간대(가슴·허리·허벅지 중간·정강이 중간) Y 좌표를 산출한다.
 */
export function resolveSafeCutZones(
  subject: SubjectBodyLandmarks,
): Readonly<Record<SafeCutZoneKind, number>> {
  const crownY = clampFramingValue(subject.crownY, 0, 0.95);
  const neckY = subject.joints.neck ? subject.joints.neck.y : crownY + 0.12;
  const elbowY = averageY(subject.joints.elbows) ?? neckY + 0.16;
  const wristY = averageY(subject.joints.wrists) ?? elbowY + 0.12;
  const kneeY = averageY(subject.joints.knees) ?? wristY + 0.18;
  const ankleY = averageY(subject.joints.ankles) ?? kneeY + 0.18;

  const chest = subject.safeCutZones?.chest ?? (neckY + elbowY) * 0.5;
  const waist = subject.safeCutZones?.waist ?? (elbowY + wristY) * 0.5;
  const midThigh = subject.safeCutZones?.midThigh ?? (wristY + kneeY) * 0.5;
  const midShin = subject.safeCutZones?.midShin ?? (kneeY + ankleY) * 0.5;

  return {
    chest: roundFramingValue(clampFramingValue(chest, 0, 1), 5),
    waist: roundFramingValue(clampFramingValue(waist, 0, 1), 5),
    "mid-thigh": roundFramingValue(clampFramingValue(midThigh, 0, 1), 5),
    "mid-shin": roundFramingValue(clampFramingValue(midShin, 0, 1), 5),
  };
}

export function findNearestSafeCutZone(
  masterY: number,
  safeZones: Readonly<Record<SafeCutZoneKind, number>>,
): { readonly zone: SafeCutZoneKind; readonly y: number } {
  const keys: readonly SafeCutZoneKind[] = ["chest", "waist", "mid-thigh", "mid-shin"];
  let bestZone: SafeCutZoneKind = "waist";
  let bestY = safeZones.waist;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (!key) continue;
    const zY = safeZones[key];
    const diff = Math.abs(zY - masterY);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestZone = key;
      bestY = zY;
    }
  }
  return { zone: bestZone, y: bestY };
}

function toLocalPoint(point: NormalizedPoint2D, crop: NormalizedCropRect): NormalizedPoint2D {
  return {
    x: (point.x - crop.x) / crop.width,
    y: (point.y - crop.y) / crop.height,
  };
}

function findNearestPowerPoint(
  eyeLocal: NormalizedPoint2D,
  grid: CompositionGridMode,
): { readonly point: CompositionPowerPoint; readonly distance: number } {
  const candidates = listCompositionPowerPoints(grid);
  let bestPoint = candidates[0] ?? {
    grid: "rule-of-thirds" as const,
    id: "thirds-tl",
    x: RULE_OF_THIRDS_MINOR,
    y: RULE_OF_THIRDS_MINOR,
  };
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < candidates.length; i += 1) {
    const pt = candidates[i];
    if (!pt) continue;
    const dx = eyeLocal.x - pt.x;
    const dy = eyeLocal.y - pt.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      bestPoint = pt;
    }
  }
  return { point: bestPoint, distance: bestDist };
}

function gradeFromScore(score: number, blockerCount: number): ShotFramingGrade {
  if (blockerCount > 0 || score < 45) return "F";
  if (score >= 92) return "S";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  return "C";
}

/**
 * 단일 웹툰·일러스트 컷의 5대 샷 프레이밍 결함(관절 절단·헤드룸 과소/과다·시선 리드룸 부족·
 * 삼분할/황금비 교점 이탈)을 정량 감사하고 FIPS 180-4 SHA-256 지문을 반환한다.
 */
export function auditPanelShotFraming(
  panel: ShotFramingPanelInput,
  options: ShotFramingAuditOptions = {},
): ShotFramingAuditResult {
  const crop = normalizeCropRect(panel.crop);
  const shotScale: ShotScaleKind = panel.shotScale ?? "medium-shot";
  const compositionGrid: CompositionGridMode = panel.compositionGrid ?? "either";

  const jointMargin = clampFramingValue(
    options.jointExclusionMarginNorm ?? DEFAULT_JOINT_EXCLUSION_MARGIN_NORM,
    0.005,
    0.2,
  );
  const minHeadroom = clampFramingValue(options.minHeadroomRatio ?? DEFAULT_MIN_HEADROOM_RATIO, 0, 0.25);
  const maxHeadroom = clampFramingValue(options.maxHeadroomRatio ?? DEFAULT_MAX_HEADROOM_RATIO, 0.1, 0.8);
  const maxPowerDist = clampFramingValue(
    options.maxPowerPointDistanceNorm ?? DEFAULT_MAX_POWER_POINT_DISTANCE_NORM,
    0.02,
    0.5,
  );

  const eyeLocal = toLocalPoint(panel.subject.eyeCenter, crop);
  const crownLocalY = (panel.subject.crownY - crop.y) / crop.height;
  const headroomRatio = crownLocalY;

  let leadRoomRatio: number;
  let backRoomRatio: number;
  if (panel.subject.gazeDirection === "right") {
    leadRoomRatio = 1 - eyeLocal.x;
    backRoomRatio = eyeLocal.x;
  } else if (panel.subject.gazeDirection === "left") {
    leadRoomRatio = eyeLocal.x;
    backRoomRatio = 1 - eyeLocal.x;
  } else {
    leadRoomRatio = Math.min(eyeLocal.x, 1 - eyeLocal.x);
    backRoomRatio = Math.max(eyeLocal.x, 1 - eyeLocal.x);
  }
  const leadRoomDelta = leadRoomRatio - backRoomRatio;

  const nearest = findNearestPowerPoint(eyeLocal, compositionGrid);
  const powerPointDistanceNorm = nearest.distance;
  const powerPointAlignmentScore = clampFramingValue((1 - powerPointDistanceNorm / 0.35) * 100, 0, 100);

  const resolvedSafeCutZones = resolveSafeCutZones(panel.subject);
  const joints = flattenJointLandmarks(panel.subject.joints);

  const jointCropViolations: TangentJointCropDetail[] = [];
  const defects: ShotFramingDefect[] = [];
  const exemptionsApplied: string[] = [];

  for (let i = 0; i < joints.length; i += 1) {
    const joint = joints[i];
    if (!joint) continue;
    const local = toLocalPoint(joint.point, crop);
    const insideHorizontalBand = local.x >= -jointMargin && local.x <= 1 + jointMargin;
    const insideVerticalBand = local.y >= -jointMargin && local.y <= 1 + jointMargin;

    const edgeChecks: readonly {
      readonly edge: CropBoundaryEdge;
      readonly active: boolean;
      readonly dist: number;
    }[] = [
      { edge: "bottom", active: insideHorizontalBand, dist: Math.abs(local.y - 1) },
      { edge: "top", active: insideHorizontalBand, dist: Math.abs(local.y) },
      { edge: "left", active: insideVerticalBand, dist: Math.abs(local.x) },
      { edge: "right", active: insideVerticalBand, dist: Math.abs(local.x - 1) },
    ];

    for (let e = 0; e < edgeChecks.length; e += 1) {
      const check = edgeChecks[e];
      if (!check || !check.active || check.dist > jointMargin) continue;

      const isHorizontalEdge = check.edge === "bottom" || check.edge === "top";
      const safeRec = isHorizontalEdge
        ? findNearestSafeCutZone(joint.point.y, resolvedSafeCutZones)
        : null;

      const detail: TangentJointCropDetail = {
        jointKind: joint.kind,
        jointIndex: joint.index,
        edge: check.edge,
        masterPoint: {
          x: roundFramingValue(joint.point.x, 5),
          y: roundFramingValue(joint.point.y, 5),
        },
        localPoint: { x: roundFramingValue(local.x, 5), y: roundFramingValue(local.y, 5) },
        distanceToEdgeNorm: roundFramingValue(check.dist, 5),
        recommendedSafeZone: safeRec ? safeRec.zone : null,
        recommendedSafeY: safeRec ? safeRec.y : null,
      };
      jointCropViolations.push(detail);

      const jointKo = JOINT_LABELS_KO[joint.kind];
      const edgeKo = CROP_EDGE_LABELS_KO[check.edge];
      const recKo = safeRec
        ? `${SAFE_CUT_ZONE_LABELS_KO[safeRec.zone]}(Y=${roundFramingValue(safeRec.y, 2)}) 위치로 크롭을 옮기세요.`
        : "좌우 크롭 폭을 넓히거나 이동해 관절 여유를 확보하세요.";

      defects.push({
        code: "tangent-joint-crop",
        severity: "blocker",
        messageKo: `${edgeKo}가 ${jointKo} 중심(거리 ${roundFramingValue(check.dist * 100, 1)}%)을 정면 절단했습니다. ${recKo}`,
        metricValue: roundFramingValue(check.dist, 5),
        thresholdValue: roundFramingValue(jointMargin, 5),
        jointDetail: detail,
      });
    }
  }

  if (shotScale === "extreme-close-up") {
    exemptionsApplied.push("익스트림 클로즈업(ECU) 정수리 절단 허용");
  } else if (headroomRatio < minHeadroom) {
    const isClipped = headroomRatio < 0;
    defects.push({
      code: "cramped-headroom",
      severity: isClipped ? "blocker" : "warning",
      messageKo: isClipped
        ? `정수리가 컷 상단 밖으로 잘렸습니다(헤드룸 ${roundFramingValue(headroomRatio * 100, 1)}%). 상단 크롭을 올려 최소 ${roundFramingValue(minHeadroom * 100, 1)}% 여유를 확보하세요.`
        : `정수리가 컷 상단에 지나치게 붙어 답답합니다(헤드룸 ${roundFramingValue(headroomRatio * 100, 1)}% < ${roundFramingValue(minHeadroom * 100, 1)}%).`,
      metricValue: roundFramingValue(headroomRatio, 5),
      thresholdValue: roundFramingValue(minHeadroom, 5),
    });
  }

  if (panel.intentionalNegativeSpace === true) {
    exemptionsApplied.push("의도된 고독·부감 여백 허용");
  } else if (headroomRatio > maxHeadroom) {
    defects.push({
      code: "excessive-dead-headroom",
      severity: "warning",
      messageKo: `머리 위 빈 여백이 지나치게 넓어 시선이 흩어집니다(헤드룸 ${roundFramingValue(headroomRatio * 100, 1)}% > ${roundFramingValue(maxHeadroom * 100, 1)}%).`,
      metricValue: roundFramingValue(headroomRatio, 5),
      thresholdValue: roundFramingValue(maxHeadroom, 5),
    });
  }

  if (
    (panel.subject.gazeDirection === "left" || panel.subject.gazeDirection === "right") &&
    leadRoomRatio < backRoomRatio
  ) {
    const dirKo = panel.subject.gazeDirection === "right" ? "오른쪽" : "왼쪽";
    defects.push({
      code: "insufficient-lead-room",
      severity: "warning",
      messageKo: `인물이 ${dirKo}을 보지만 앞쪽 리드룸(${roundFramingValue(leadRoomRatio * 100, 1)}%)이 뒤쪽 여백(${roundFramingValue(backRoomRatio * 100, 1)}%)보다 좁아 시선이 컷 벽에 막혔습니다.`,
      metricValue: roundFramingValue(leadRoomRatio, 5),
      thresholdValue: roundFramingValue(backRoomRatio, 5),
    });
  }

  if (powerPointDistanceNorm > maxPowerDist) {
    defects.push({
      code: "weak-power-point-alignment",
      severity: "warning",
      messageKo: `주요 눈 초점이 가장 가까운 구도 교점(${nearest.point.id})에서 ${roundFramingValue(powerPointDistanceNorm * 100, 1)}% 이탈했습니다(허용 ${roundFramingValue(maxPowerDist * 100, 1)}%).`,
      metricValue: roundFramingValue(powerPointDistanceNorm, 5),
      thresholdValue: roundFramingValue(maxPowerDist, 5),
    });
  }

  let score = 100;
  let jointPenalty = 0;
  for (let i = 0; i < defects.length; i += 1) {
    const defect = defects[i];
    if (!defect) continue;
    if (defect.code === "tangent-joint-crop") {
      jointPenalty = Math.min(60, jointPenalty + 30);
    } else if (defect.code === "cramped-headroom") {
      score -= headroomRatio < 0 ? 22 : 16;
    } else if (defect.code === "excessive-dead-headroom") {
      score -= Math.min(22, 15 + (headroomRatio - maxHeadroom) * 20);
    } else if (defect.code === "insufficient-lead-room") {
      score -= Math.min(25, 18 + Math.abs(leadRoomDelta) * 15);
    } else if (defect.code === "weak-power-point-alignment") {
      score -= Math.min(18, 12 + (powerPointDistanceNorm - maxPowerDist) * 20);
    }
  }
  score -= jointPenalty;
  score -= (100 - powerPointAlignmentScore) * 0.12;

  const framingScore = roundFramingValue(clampFramingValue(score, 0, 100), 2);
  let blockerCount = 0;
  let warningCount = 0;
  for (let i = 0; i < defects.length; i += 1) {
    const defect = defects[i];
    if (!defect) continue;
    if (defect.severity === "blocker") blockerCount += 1;
    else if (defect.severity === "warning") warningCount += 1;
  }

  const grade = gradeFromScore(framingScore, blockerCount);
  const passed = blockerCount === 0 && defects.length === 0 && framingScore >= 75;
  const eyeLocalRounded: NormalizedPoint2D = {
    x: roundFramingValue(eyeLocal.x, 5),
    y: roundFramingValue(eyeLocal.y, 5),
  };

  const framingManifestSha256Hex = computeShotFramingManifestSha256Hex({
    panelId: panel.panelId,
    shotScale,
    compositionGrid,
    crop,
    eyeLocal: eyeLocalRounded,
    headroomRatio: roundFramingValue(headroomRatio, 5),
    leadRoomRatio: roundFramingValue(leadRoomRatio, 5),
    backRoomRatio: roundFramingValue(backRoomRatio, 5),
    nearestPowerPoint: nearest.point,
    powerPointDistanceNorm: roundFramingValue(powerPointDistanceNorm, 5),
    defects,
    framingScore,
  });

  return {
    panelId: panel.panelId,
    titleKo: panel.titleKo,
    shotScale,
    compositionGrid,
    crop,
    eyeLocal: eyeLocalRounded,
    crownLocalY: roundFramingValue(crownLocalY, 5),
    headroomRatio: roundFramingValue(headroomRatio, 5),
    leadRoomRatio: roundFramingValue(leadRoomRatio, 5),
    backRoomRatio: roundFramingValue(backRoomRatio, 5),
    leadRoomDelta: roundFramingValue(leadRoomDelta, 5),
    nearestPowerPoint: nearest.point,
    powerPointDistanceNorm: roundFramingValue(powerPointDistanceNorm, 5),
    powerPointAlignmentScore: roundFramingValue(powerPointAlignmentScore, 2),
    resolvedSafeCutZones,
    jointCropViolations,
    defects,
    blockerCount,
    warningCount,
    framingScore,
    grade,
    passed,
    exemptionsApplied,
    framingManifestSha256Hex,
  };
}
