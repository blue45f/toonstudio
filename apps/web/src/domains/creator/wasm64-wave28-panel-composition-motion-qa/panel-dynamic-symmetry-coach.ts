/**
 * 웹툰 컷 구도용 Jay Hambidge 동적 대칭(Dynamic Symmetry) 아마추어·삼등분선·여백 비율 코치.
 *
 * - 임의 컷 해상도(`800×1280`, `800×2000`, `1536×1024` 등)에서 바로크(`baroque`, 좌하→우상) 및
 *   시니스터(`sinister`, 좌상→우하) 주대각선과 네 모서리에서 내린 수직 역수선(Reciprocal)의
 *   정밀 직교 교점을 산출한다.
 * - 인물 눈(`eyes`)·타격점(`action-impact`)·말풍선 기준점(`balloon-anchor`)과 전경 점유 마스크를
 *   함께 평가해 구도 균형 점수(`0..100`)를 계산하고, 여백 부족(`negativeSpaceRatio < 0.28`)을 경고한다.
 * - 모든 말풍선을 안전 여백 안에 유지한 채 핵심 시선 중심을 가장 강한 아마추어 교점으로 끌어당기는
 *   최소 카메라 팬·배율 보정치 `(dxPx, dyPx, scale)`를 도출한다.
 */

export const PANEL_FOCAL_POINT_KINDS = Object.freeze(["eyes", "action-impact", "balloon-anchor"] as const);
export type PanelFocalPointKind = (typeof PANEL_FOCAL_POINT_KINDS)[number];

export const DYNAMIC_SYMMETRY_DIAGONALS = Object.freeze(["baroque", "sinister"] as const);
export type DynamicSymmetryDiagonalKind = (typeof DYNAMIC_SYMMETRY_DIAGONALS)[number];

export const ARMATURE_NODE_FAMILIES = Object.freeze([
  "dynamic-symmetry", "rule-of-thirds", "diagonal-center",
] as const);
export type ArmatureNodeFamily = (typeof ARMATURE_NODE_FAMILIES)[number];

/** 답답함을 유발하는 여백 고갈 경계 비율 (`0.28` 미만이면 경고). */
export const MIN_HEALTHY_NEGATIVE_SPACE_RATIO = 0.28 as const;
export const IDEAL_NEGATIVE_SPACE_MIN_RATIO = 0.32 as const;
export const IDEAL_NEGATIVE_SPACE_MAX_RATIO = 0.74 as const;
export const DEFAULT_BALLOON_SAFE_MARGIN_RATIO = 0.035 as const;
export const MIN_RECOMMENDED_CAMERA_SCALE = 0.72 as const;
export const MAX_RECOMMENDED_CAMERA_SCALE = 1.15 as const;

export interface Point2D {
  readonly xPx: number;
  readonly yPx: number;
}

export interface UnitVector2D {
  readonly x: number;
  readonly y: number;
}

export interface ArmatureLineSegment {
  readonly id: string;
  readonly labelKo: string;
  readonly start: Point2D;
  readonly end: Point2D;
  readonly unitVector: UnitVector2D;
}

export interface ReciprocalArmatureSegment extends ArmatureLineSegment {
  readonly targetDiagonal: DynamicSymmetryDiagonalKind;
  readonly cornerOrigin: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  readonly intersection: Point2D;
  /** 주대각선 단위벡터와 역수선 단위벡터의 내적 (직교 시 `0`). */
  readonly orthogonalityDotProduct: number;
}

export interface ArmatureIntersectionNode {
  readonly id: string;
  readonly labelKo: string;
  readonly family: ArmatureNodeFamily;
  readonly diagonal: DynamicSymmetryDiagonalKind | null;
  readonly xPx: number;
  readonly yPx: number;
  readonly normalizedX: number;
  readonly normalizedY: number;
  /** 구도 흡인 가중치 (`0..1`, 동적 대칭 역수 교점이 가장 높음). */
  readonly salienceWeight: number;
  readonly orthogonalityDotProduct: number | null;
}

export interface DynamicSymmetryArmature {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly aspectRatio: number;
  readonly proportionLabelKo: string;
  readonly baroqueDiagonal: ArmatureLineSegment;
  readonly sinisterDiagonal: ArmatureLineSegment;
  readonly reciprocalSegments: readonly ReciprocalArmatureSegment[];
  readonly reciprocalNodes: readonly ArmatureIntersectionNode[];
  readonly ruleOfThirdsNodes: readonly ArmatureIntersectionNode[];
  readonly centerNode: ArmatureIntersectionNode;
  readonly allNodes: readonly ArmatureIntersectionNode[];
}

export interface PanelFocalPoint {
  readonly id: string;
  readonly kind: PanelFocalPointKind;
  readonly xPx: number;
  readonly yPx: number;
  readonly weight?: number;
  readonly preferredDiagonal?: DynamicSymmetryDiagonalKind;
}

export interface SpeechBalloonBox {
  readonly id: string;
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface ForegroundOccupancyMask {
  readonly cols: number;
  readonly rows: number;
  /** 각 격자 칸의 전경 점유도 (`0..1` 실수 배열 또는 `0..255` 바이트 마스크). */
  readonly cells: Float32Array | Uint8Array | readonly number[];
}

export interface PanelCompositionInput {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly focalPoints: readonly PanelFocalPoint[];
  readonly foregroundMask: ForegroundOccupancyMask;
  readonly speechBalloons?: readonly SpeechBalloonBox[];
  readonly safeMarginPx?: number;
}

export interface NegativeSpaceMetrics {
  readonly foregroundRatio: number;
  readonly negativeSpaceRatio: number;
  readonly isClaustrophobic: boolean;
  readonly foregroundCentroidPx: Point2D;
}

export interface FocalNodeAlignment {
  readonly focalId: string;
  readonly kind: PanelFocalPointKind;
  readonly nearestNodeId: string;
  readonly nearestNodeFamily: ArmatureNodeFamily;
  readonly distancePx: number;
  readonly normalizedDistance: number;
  readonly alignmentRatio: number;
}

export interface CompositionScoreBreakdown {
  readonly armatureAlignmentScore: number;
  readonly negativeSpaceScore: number;
  readonly visualEquilibriumScore: number;
  readonly balloonMarginScore: number;
  readonly overallScore: number;
}

export interface CameraCropPanAdjustment {
  readonly targetNodeId: string;
  readonly targetNodeLabelKo: string;
  readonly dxPx: number;
  readonly dyPx: number;
  readonly scale: number;
  readonly allBalloonsInsideSafeMargin: boolean;
  readonly projectedNegativeSpaceRatio: number;
  readonly projectedOverallScore: number;
  readonly summaryKo: string;
}

export interface PanelCompositionCoachReport {
  readonly armature: DynamicSymmetryArmature;
  readonly negativeSpace: NegativeSpaceMetrics;
  readonly focalAlignments: readonly FocalNodeAlignment[];
  readonly balloonViolationCount: number;
  readonly balloonOccludingFocalCount: number;
  readonly scoreBreakdown: CompositionScoreBreakdown;
  readonly warningsKo: readonly string[];
  readonly recommendedAdjustment: CameraCropPanAdjustment;
}

const INTRINSIC_FOCAL_WEIGHT: Readonly<Record<PanelFocalPointKind, number>> = Object.freeze({
  eyes: 1.0, "action-impact": 0.94, "balloon-anchor": 0.58,
});

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

function makeUnitVector(dx: number, dy: number): UnitVector2D {
  const length = Math.hypot(dx, dy);
  return length <= 1e-12 ? { x: 0, y: 0 } : { x: normalizeZero(dx / length), y: normalizeZero(dy / length) };
}

function dotUnitVectors(a: UnitVector2D, b: UnitVector2D): number {
  return normalizeZero(a.x * b.x + a.y * b.y);
}

/** 모서리 원점에서 교점을 지나는 반직선이 패널 경계 `[0, W] × [0, H]`와 만나는 끝점을 계산한다. */
function clipRayFromCornerToBounds(origin: Point2D, through: Point2D, widthPx: number, heightPx: number): Point2D {
  const vx = through.xPx - origin.xPx;
  const vy = through.yPx - origin.yPx;
  let bestT = Number.POSITIVE_INFINITY;
  if (vx > 1e-9) bestT = Math.min(bestT, (widthPx - origin.xPx) / vx);
  else if (vx < -1e-9) bestT = Math.min(bestT, -origin.xPx / vx);
  if (vy > 1e-9) bestT = Math.min(bestT, (heightPx - origin.yPx) / vy);
  else if (vy < -1e-9) bestT = Math.min(bestT, -origin.yPx / vy);

  if (!Number.isFinite(bestT) || bestT <= 0) return through;
  return { xPx: clamp(origin.xPx + vx * bestT, 0, widthPx), yPx: clamp(origin.yPx + vy * bestT, 0, heightPx) };
}

function classifyRootProportionLabel(widthPx: number, heightPx: number): string {
  const longOverShort = Math.max(widthPx, heightPx) / Math.min(widthPx, heightPx);
  const candidates = [
    { ratio: 1.0, label: "1:1 정방형 컷" },
    { ratio: Math.SQRT2, label: "√2 동적 비례 컷" },
    { ratio: 1.5, label: "3:2 와이드·단행본 비례 컷" },
    { ratio: 1.6, label: "8:5 표준 웹툰 컷 (800×1280 계열)" },
    { ratio: (1 + Math.sqrt(5)) / 2, label: "황금비(φ) 동적 대칭 컷" },
    { ratio: Math.sqrt(5), label: "√5 긴장 호흡 컷" },
    { ratio: 2.5, label: "1:2.5 세로 스크롤 장호흡 컷 (800×2000 계열)" },
  ] as const;

  let closestLabel = "자유 비례 웹툰 컷";
  let smallestDiff = 0.045;
  for (const item of candidates) {
    const diff = Math.abs(longOverShort - item.ratio);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closestLabel = item.label;
    }
  }
  return closestLabel;
}

/** 주어진 컷 크기(`widthPx × heightPx`)에 대한 Jay Hambidge 동적 대칭 아마추어와 삼등분 교점을 생성한다. */
export function buildDynamicSymmetryArmature(widthPx: number, heightPx: number): DynamicSymmetryArmature {
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0) {
    throw new RangeError("패널 가로·세로 해상도는 0보다 큰 유한 실수여야 합니다.");
  }

  const w2 = widthPx * widthPx;
  const h2 = heightPx * heightPx;
  const denom = w2 + h2;

  const baroqueDiagonal: ArmatureLineSegment = {
    id: "diagonal-baroque", labelKo: "바로크 주대각선 (좌하→우상)",
    start: { xPx: 0, yPx: heightPx }, end: { xPx: widthPx, yPx: 0 },
    unitVector: makeUnitVector(widthPx, -heightPx),
  };
  const sinisterDiagonal: ArmatureLineSegment = {
    id: "diagonal-sinister", labelKo: "시니스터 주대각선 (좌상→우하)",
    start: { xPx: 0, yPx: 0 }, end: { xPx: widthPx, yPx: heightPx },
    unitVector: makeUnitVector(widthPx, heightPx),
  };

  const rawReciprocals: readonly [
    string, string, string, string, DynamicSymmetryDiagonalKind,
    ReciprocalArmatureSegment["cornerOrigin"], Point2D, Point2D, UnitVector2D, number,
  ][] = [
    [
      "reciprocal-baroque-top-left", "baroque-top-left", "좌상단 바로크 수직 역수선", "바로크 좌상 역수 교점",
      "baroque", "top-left", { xPx: 0, yPx: 0 }, { xPx: (widthPx * h2) / denom, yPx: (w2 * heightPx) / denom },
      baroqueDiagonal.unitVector, 1.0,
    ],
    [
      "reciprocal-baroque-bottom-right", "baroque-bottom-right", "우하단 바로크 수직 역수선", "바로크 우하 역수 교점",
      "baroque", "bottom-right", { xPx: widthPx, yPx: heightPx }, { xPx: (w2 * widthPx) / denom, yPx: (h2 * heightPx) / denom },
      baroqueDiagonal.unitVector, 0.98,
    ],
    [
      "reciprocal-sinister-bottom-left", "sinister-bottom-left", "좌하단 시니스터 수직 역수선", "시니스터 좌하 역수 교점",
      "sinister", "bottom-left", { xPx: 0, yPx: heightPx }, { xPx: (widthPx * h2) / denom, yPx: (h2 * heightPx) / denom },
      sinisterDiagonal.unitVector, 0.97,
    ],
    [
      "reciprocal-sinister-top-right", "sinister-top-right", "우상단 시니스터 수직 역수선", "시니스터 우상 역수 교점",
      "sinister", "top-right", { xPx: widthPx, yPx: 0 }, { xPx: (w2 * widthPx) / denom, yPx: (w2 * heightPx) / denom },
      sinisterDiagonal.unitVector, 0.99,
    ],
  ];

  const reciprocalSegments: ReciprocalArmatureSegment[] = [];
  const reciprocalNodes: ArmatureIntersectionNode[] = [];
  for (const [segId, nodeId, segKo, nodeKo, diagKind, corner, origin, inter, diagUnit, weight] of rawReciprocals) {
    const end = clipRayFromCornerToBounds(origin, inter, widthPx, heightPx);
    const unitVector = makeUnitVector(end.xPx - origin.xPx, end.yPx - origin.yPx);
    const orthoDot = dotUnitVectors(diagUnit, unitVector);
    reciprocalSegments.push({
      id: segId, labelKo: segKo, start: origin, end, unitVector,
      targetDiagonal: diagKind, cornerOrigin: corner, intersection: inter, orthogonalityDotProduct: orthoDot,
    });
    reciprocalNodes.push({
      id: nodeId, labelKo: nodeKo, family: "dynamic-symmetry", diagonal: diagKind,
      xPx: inter.xPx, yPx: inter.yPx, normalizedX: inter.xPx / widthPx, normalizedY: inter.yPx / heightPx,
      salienceWeight: weight, orthogonalityDotProduct: orthoDot,
    });
  }

  const thirdsSpecs = [
    ["thirds-top-left", "삼등분 좌상 교점", 1 / 3, 1 / 3, 0.9],
    ["thirds-top-right", "삼등분 우상 교점", 2 / 3, 1 / 3, 0.9],
    ["thirds-bottom-left", "삼등분 좌하 교점", 1 / 3, 2 / 3, 0.86],
    ["thirds-bottom-right", "삼등분 우하 교점", 2 / 3, 2 / 3, 0.86],
  ] as const;

  const ruleOfThirdsNodes: ArmatureIntersectionNode[] = thirdsSpecs.map(([id, labelKo, nx, ny, salienceWeight]) => ({
    id, labelKo, family: "rule-of-thirds", diagonal: null,
    xPx: widthPx * nx, yPx: heightPx * ny, normalizedX: nx, normalizedY: ny,
    salienceWeight, orthogonalityDotProduct: null,
  }));

  const centerNode: ArmatureIntersectionNode = {
    id: "center-cross", labelKo: "양 대각선 중앙 교점", family: "diagonal-center", diagonal: null,
    xPx: widthPx * 0.5, yPx: heightPx * 0.5, normalizedX: 0.5, normalizedY: 0.5,
    salienceWeight: 0.76, orthogonalityDotProduct: null,
  };

  return {
    widthPx, heightPx, aspectRatio: widthPx / heightPx,
    proportionLabelKo: classifyRootProportionLabel(widthPx, heightPx),
    baroqueDiagonal, sinisterDiagonal, reciprocalSegments, reciprocalNodes, ruleOfThirdsNodes, centerNode,
    allNodes: [...reciprocalNodes, ...ruleOfThirdsNodes, centerNode],
  };
}

function normalizeMaskCells(mask: ForegroundOccupancyMask): Float64Array {
  const expectedLength = mask.cols * mask.rows;
  if (mask.cols <= 0 || mask.rows <= 0 || mask.cells.length < expectedLength) {
    throw new RangeError("전경 점유 마스크의 격자 크기와 셀 개수가 일치하지 않습니다.");
  }
  const normalized = new Float64Array(expectedLength);
  let maxObserved = 0;
  for (let i = 0; i < expectedLength; i += 1) {
    const raw = mask.cells[i] ?? 0;
    if (raw > maxObserved) maxObserved = raw;
  }
  const divisor = mask.cells instanceof Uint8Array && maxObserved > 1 ? 255 : 1;
  for (let i = 0; i < expectedLength; i += 1) {
    normalized[i] = clamp((mask.cells[i] ?? 0) / divisor, 0, 1);
  }
  return normalized;
}

/** 전경 점유 마스크에서 전경 밀도·여백 비율·무게중심 및 여백 부족 여부를 계산한다. */
export function computeNegativeSpaceMetrics(
  mask: ForegroundOccupancyMask, widthPx: number, heightPx: number,
): NegativeSpaceMetrics {
  const cells = normalizeMaskCells(mask);
  const totalCells = mask.cols * mask.rows;
  let sumOccupancy = 0;
  let weightedX = 0;
  let weightedY = 0;

  for (let row = 0; row < mask.rows; row += 1) {
    const cellCenterY = ((row + 0.5) / mask.rows) * heightPx;
    for (let col = 0; col < mask.cols; col += 1) {
      const occ = cells[row * mask.cols + col] ?? 0;
      sumOccupancy += occ;
      weightedX += occ * (((col + 0.5) / mask.cols) * widthPx);
      weightedY += occ * cellCenterY;
    }
  }

  const foregroundRatio = clamp(sumOccupancy / totalCells, 0, 1);
  const negativeSpaceRatio = clamp(1 - foregroundRatio, 0, 1);
  const foregroundCentroidPx: Point2D =
    sumOccupancy > 1e-6
      ? { xPx: weightedX / sumOccupancy, yPx: weightedY / sumOccupancy }
      : { xPx: widthPx * 0.5, yPx: heightPx * 0.5 };

  return {
    foregroundRatio, negativeSpaceRatio,
    isClaustrophobic: negativeSpaceRatio < MIN_HEALTHY_NEGATIVE_SPACE_RATIO,
    foregroundCentroidPx,
  };
}

function resampleMaskWithTransform(
  mask: ForegroundOccupancyMask, widthPx: number, heightPx: number, dxPx: number, dyPx: number, scale: number,
): ForegroundOccupancyMask {
  const source = normalizeMaskCells(mask);
  const resampled = new Float32Array(mask.cols * mask.rows);
  const cx = widthPx * 0.5;
  const cy = heightPx * 0.5;

  for (let row = 0; row < mask.rows; row += 1) {
    const srcY = cy + (((row + 0.5) / mask.rows) * heightPx - cy - dyPx) / scale;
    for (let col = 0; col < mask.cols; col += 1) {
      const srcX = cx + (((col + 0.5) / mask.cols) * widthPx - cx - dxPx) / scale;
      if (srcX < 0 || srcX >= widthPx || srcY < 0 || srcY >= heightPx) {
        resampled[row * mask.cols + col] = 0;
        continue;
      }
      const srcCol = clamp(Math.floor((srcX / widthPx) * mask.cols), 0, mask.cols - 1);
      const srcRow = clamp(Math.floor((srcY / heightPx) * mask.rows), 0, mask.rows - 1);
      resampled[row * mask.cols + col] = source[srcRow * mask.cols + srcCol] ?? 0;
    }
  }
  return { cols: mask.cols, rows: mask.rows, cells: resampled };
}

/** 도출된 카메라 팬·배율 보정치 `(dxPx, dyPx, scale)`를 컷 입력 데이터에 적용한 새 상태를 반환한다. */
export function applyCameraAdjustmentToPanel(
  input: PanelCompositionInput, adjustment: Pick<CameraCropPanAdjustment, "dxPx" | "dyPx" | "scale">,
): PanelCompositionInput {
  const cx = input.widthPx * 0.5;
  const cy = input.heightPx * 0.5;
  const { dxPx, dyPx, scale } = adjustment;

  const focalPoints: PanelFocalPoint[] = input.focalPoints.map((f) => ({
    ...f, xPx: cx + (f.xPx - cx) * scale + dxPx, yPx: cy + (f.yPx - cy) * scale + dyPx,
  }));
  const speechBalloons: SpeechBalloonBox[] | undefined = input.speechBalloons?.map((b) => ({
    ...b,
    xPx: cx + (b.xPx - cx) * scale + dxPx, yPx: cy + (b.yPx - cy) * scale + dyPx,
    widthPx: b.widthPx * scale, heightPx: b.heightPx * scale,
  }));

  return {
    ...input, focalPoints,
    foregroundMask: resampleMaskWithTransform(input.foregroundMask, input.widthPx, input.heightPx, dxPx, dyPx, scale),
    ...(speechBalloons !== undefined ? { speechBalloons } : {}),
  };
}

interface InternalScoreEvaluation {
  readonly negativeSpace: NegativeSpaceMetrics;
  readonly focalAlignments: readonly FocalNodeAlignment[];
  readonly balloonViolationCount: number;
  readonly balloonOccludingFocalCount: number;
  readonly scoreBreakdown: CompositionScoreBreakdown;
}

function scoreCompositionState(
  armature: DynamicSymmetryArmature, input: PanelCompositionInput, safeMarginPx: number,
): InternalScoreEvaluation {
  const { widthPx, heightPx } = input;
  const halfDiag = Math.max(1, 0.5 * Math.hypot(widthPx, heightPx));
  const negativeSpace = computeNegativeSpaceMetrics(input.foregroundMask, widthPx, heightPx);

  const focalAlignments: FocalNodeAlignment[] = [];
  let weightedAlignmentSum = 0;
  let totalFocalWeight = 0;
  let focalCentroidX = 0;
  let focalCentroidY = 0;

  for (const focal of input.focalPoints) {
    const baseWeight = INTRINSIC_FOCAL_WEIGHT[focal.kind] * Math.max(0.05, focal.weight ?? 1);
    let bestNode = armature.allNodes[0] ?? armature.centerNode;
    let bestEffectiveScore = -1;
    let bestDistPx = Number.POSITIVE_INFINITY;

    for (const node of armature.allNodes) {
      const distPx = Math.hypot(focal.xPx - node.xPx, focal.yPx - node.yPx);
      const radialAffinity = Math.exp(-Math.pow(distPx / halfDiag / 0.24, 2));
      const diagBonus = focal.preferredDiagonal !== undefined && node.diagonal === focal.preferredDiagonal ? 1.06 : 1.0;
      const candidateScore = radialAffinity * node.salienceWeight * diagBonus;
      if (candidateScore > bestEffectiveScore) {
        bestEffectiveScore = candidateScore;
        bestNode = node;
        bestDistPx = distPx;
      }
    }

    const alignmentRatio = clamp(bestEffectiveScore, 0, 1);
    focalAlignments.push({
      focalId: focal.id, kind: focal.kind, nearestNodeId: bestNode.id, nearestNodeFamily: bestNode.family,
      distancePx: bestDistPx, normalizedDistance: bestDistPx / halfDiag, alignmentRatio,
    });
    weightedAlignmentSum += alignmentRatio * baseWeight;
    totalFocalWeight += baseWeight;
    focalCentroidX += focal.xPx * baseWeight;
    focalCentroidY += focal.yPx * baseWeight;
  }

  const armatureAlignmentScore =
    totalFocalWeight > 0 ? clamp((weightedAlignmentSum / totalFocalWeight) * 45, 0, 45) : 22.5;

  let negativeSpaceScore = 30;
  const ns = negativeSpace.negativeSpaceRatio;
  if (ns < MIN_HEALTHY_NEGATIVE_SPACE_RATIO) {
    negativeSpaceScore = clamp(14 * (ns / MIN_HEALTHY_NEGATIVE_SPACE_RATIO), 0, 14);
  } else if (ns < IDEAL_NEGATIVE_SPACE_MIN_RATIO) {
    negativeSpaceScore = 20 + (10 * (ns - MIN_HEALTHY_NEGATIVE_SPACE_RATIO)) /
      (IDEAL_NEGATIVE_SPACE_MIN_RATIO - MIN_HEALTHY_NEGATIVE_SPACE_RATIO);
  } else if (ns > IDEAL_NEGATIVE_SPACE_MAX_RATIO) {
    negativeSpaceScore = clamp(
      30 - (14 * (ns - IDEAL_NEGATIVE_SPACE_MAX_RATIO)) / (1 - IDEAL_NEGATIVE_SPACE_MAX_RATIO), 14, 30,
    );
  }

  const fgCenter = negativeSpace.foregroundCentroidPx;
  const combinedX = totalFocalWeight > 0 ? 0.65 * (focalCentroidX / totalFocalWeight) + 0.35 * fgCenter.xPx : fgCenter.xPx;
  const combinedY = totalFocalWeight > 0 ? 0.65 * (focalCentroidY / totalFocalWeight) + 0.35 * fgCenter.yPx : fgCenter.yPx;
  const edgeClearX = Math.min(combinedX, widthPx - combinedX) / (widthPx * 0.5);
  const edgeClearY = Math.min(combinedY, heightPx - combinedY) / (heightPx * 0.5);
  const visualEquilibriumScore = clamp(15 * Math.min(1, clamp(Math.min(edgeClearX, edgeClearY), 0, 1) / 0.16), 0, 15);

  let balloonViolationCount = 0;
  let balloonOccludingFocalCount = 0;
  for (const b of input.speechBalloons ?? []) {
    if (
      b.xPx < safeMarginPx - 1e-6 || b.yPx < safeMarginPx - 1e-6 ||
      b.xPx + b.widthPx > widthPx - safeMarginPx + 1e-6 || b.yPx + b.heightPx > heightPx - safeMarginPx + 1e-6
    ) {
      balloonViolationCount += 1;
    }
    for (const f of input.focalPoints) {
      if (f.kind !== "balloon-anchor" && f.xPx >= b.xPx && f.xPx <= b.xPx + b.widthPx && f.yPx >= b.yPx && f.yPx <= b.yPx + b.heightPx) {
        balloonOccludingFocalCount += 1;
      }
    }
  }

  const balloonMarginScore = clamp(10 - balloonViolationCount * 5 - balloonOccludingFocalCount * 4, 0, 10);
  const overallScore = clamp(
    armatureAlignmentScore + negativeSpaceScore + visualEquilibriumScore + balloonMarginScore, 0, 100,
  );

  return {
    negativeSpace, focalAlignments, balloonViolationCount, balloonOccludingFocalCount,
    scoreBreakdown: { armatureAlignmentScore, negativeSpaceScore, visualEquilibriumScore, balloonMarginScore, overallScore },
  };
}

function computeFeasiblePanBox(
  balloons: readonly SpeechBalloonBox[], widthPx: number, heightPx: number, safeMarginPx: number, scale: number,
): { minDx: number; maxDx: number; minDy: number; maxDy: number; feasible: boolean } {
  const cx = widthPx * 0.5;
  const cy = heightPx * 0.5;
  let minDx = -widthPx * 0.65;
  let maxDx = widthPx * 0.65;
  let minDy = -heightPx * 0.65;
  let maxDy = heightPx * 0.65;
  for (const b of balloons) {
    minDx = Math.max(minDx, safeMarginPx - cx - (b.xPx - cx) * scale);
    maxDx = Math.min(maxDx, widthPx - safeMarginPx - cx - (b.xPx + b.widthPx - cx) * scale);
    minDy = Math.max(minDy, safeMarginPx - cy - (b.yPx - cy) * scale);
    maxDy = Math.min(maxDy, heightPx - safeMarginPx - cy - (b.yPx + b.heightPx - cy) * scale);
  }
  return { minDx, maxDx, minDy, maxDy, feasible: minDx <= maxDx + 1e-6 && minDy <= maxDy + 1e-6 };
}

function solveCameraCropPanAdjustment(
  armature: DynamicSymmetryArmature, input: PanelCompositionInput,
  baselineEval: InternalScoreEvaluation, safeMarginPx: number,
): CameraCropPanAdjustment {
  const { widthPx, heightPx } = input;
  const cx = widthPx * 0.5;
  const cy = heightPx * 0.5;
  const balloons = input.speechBalloons ?? [];

  let primaryPoint = baselineEval.negativeSpace.foregroundCentroidPx;
  let preferredDiagonal: DynamicSymmetryDiagonalKind | undefined;
  let bestPriority = -1;
  for (const focal of input.focalPoints) {
    const priority = (focal.kind === "eyes" ? 30 : focal.kind === "action-impact" ? 20 : 10) + Math.max(0.05, focal.weight ?? 1);
    if (priority > bestPriority) {
      bestPriority = priority;
      primaryPoint = { xPx: focal.xPx, yPx: focal.yPx };
      preferredDiagonal = focal.preferredDiagonal;
    }
  }

  const scaleCandidates: number[] = [1.0];
  if (baselineEval.negativeSpace.isClaustrophobic && baselineEval.negativeSpace.foregroundRatio > 0) {
    const needed = Math.sqrt((1 - IDEAL_NEGATIVE_SPACE_MIN_RATIO) / baselineEval.negativeSpace.foregroundRatio);
    scaleCandidates.push(clamp(needed, MIN_RECOMMENDED_CAMERA_SCALE, 0.96), clamp(needed * 0.94, MIN_RECOMMENDED_CAMERA_SCALE, 0.94));
  }
  if (baselineEval.balloonViolationCount > 0) scaleCandidates.push(0.92, 0.85, 0.78);

  const candidateNodes = [...armature.reciprocalNodes, ...armature.ruleOfThirdsNodes];
  let bestAdjustment: CameraCropPanAdjustment = {
    targetNodeId: candidateNodes[0]?.id ?? armature.centerNode.id,
    targetNodeLabelKo: candidateNodes[0]?.labelKo ?? armature.centerNode.labelKo,
    dxPx: 0, dyPx: 0, scale: 1,
    allBalloonsInsideSafeMargin: baselineEval.balloonViolationCount === 0,
    projectedNegativeSpaceRatio: baselineEval.negativeSpace.negativeSpaceRatio,
    projectedOverallScore: baselineEval.scoreBreakdown.overallScore,
    summaryKo: "현재 시선 중심과 말풍선 여백이 안정적이므로 추가 팬 보정이 필요 없습니다.",
  };
  let bestObjective = baselineEval.scoreBreakdown.overallScore - baselineEval.balloonViolationCount * 50;
  const diagPx = Math.hypot(widthPx, heightPx);

  for (const scale of scaleCandidates) {
    const panBox = computeFeasiblePanBox(balloons, widthPx, heightPx, safeMarginPx, scale);
    if (!panBox.feasible && balloons.length > 0) continue;

    for (const node of candidateNodes) {
      const idealDx = node.xPx - (cx + (primaryPoint.xPx - cx) * scale);
      const idealDy = node.yPx - (cy + (primaryPoint.yPx - cy) * scale);
      const dxPx = normalizeZero(panBox.feasible ? clamp(idealDx, panBox.minDx, panBox.maxDx) : idealDx);
      const dyPx = normalizeZero(panBox.feasible ? clamp(idealDy, panBox.minDy, panBox.maxDy) : idealDy);

      const candidateEval = scoreCompositionState(armature, applyCameraAdjustmentToPanel(input, { dxPx, dyPx, scale }), safeMarginPx);
      if (candidateEval.balloonViolationCount > 0) continue;

      const travelPenalty = (Math.hypot(dxPx, dyPx) / diagPx) * 4.5 + Math.abs(scale - 1) * 6.0;
      const bonus = (node.family === "dynamic-symmetry" ? 1.5 : 0) +
        (preferredDiagonal !== undefined && node.diagonal === preferredDiagonal ? 1.2 : 0);
      const objective = candidateEval.scoreBreakdown.overallScore + bonus - travelPenalty;

      if (objective > bestObjective + 1e-6) {
        bestObjective = objective;
        const scaleText = Math.abs(scale - 1) < 1e-3 ? "배율 유지(1.00x)" : `배율 ${scale.toFixed(2)}x 조정`;
        bestAdjustment = {
          targetNodeId: node.id, targetNodeLabelKo: node.labelKo, dxPx, dyPx, scale,
          allBalloonsInsideSafeMargin: true,
          projectedNegativeSpaceRatio: candidateEval.negativeSpace.negativeSpaceRatio,
          projectedOverallScore: candidateEval.scoreBreakdown.overallScore,
          summaryKo: `${node.labelKo}으로 시선 중심을 이동(가로 ${dxPx.toFixed(1)}px, 세로 ${dyPx.toFixed(1)}px, ${scaleText})하고 말풍선 안전 여백을 지킵니다.`,
        };
      }
    }
  }
  return bestAdjustment;
}

/** 웹툰 컷의 동적 대칭 아마추어 정렬·여백 비율·말풍선 안전 여백을 진단하고 최적 카메라 보정치를 제안한다. */
export function evaluatePanelComposition(input: PanelCompositionInput): PanelCompositionCoachReport {
  const armature = buildDynamicSymmetryArmature(input.widthPx, input.heightPx);
  const safeMarginPx = Math.max(
    0, input.safeMarginPx ?? Math.round(Math.min(input.widthPx, input.heightPx) * DEFAULT_BALLOON_SAFE_MARGIN_RATIO),
  );
  const baselineEval = scoreCompositionState(armature, input, safeMarginPx);
  const warningsKo: string[] = [];

  if (baselineEval.negativeSpace.isClaustrophobic) {
    const pct = (baselineEval.negativeSpace.negativeSpaceRatio * 100).toFixed(1);
    warningsKo.push(
      `여백 부족 경고: 현재 여백 비율이 ${pct}%로 기준치(28.0%)보다 낮아 컷이 답답해 보입니다. 카메라를 소폭 뒤로 물려 숨통을 틔우세요.`,
    );
  }
  if (baselineEval.balloonViolationCount > 0) {
    warningsKo.push(`말풍선 안전 여백 이탈: ${baselineEval.balloonViolationCount}개 말풍선이 컷 가장자리 안전선(${safeMarginPx}px) 밖으로 밀려났습니다.`);
  }
  if (baselineEval.balloonOccludingFocalCount > 0) {
    warningsKo.push(`시선 가림 주의: 말풍선이 인물 눈 또는 핵심 타격점 ${baselineEval.balloonOccludingFocalCount}곳과 겹칩니다.`);
  }

  return {
    armature,
    negativeSpace: baselineEval.negativeSpace,
    focalAlignments: baselineEval.focalAlignments,
    balloonViolationCount: baselineEval.balloonViolationCount,
    balloonOccludingFocalCount: baselineEval.balloonOccludingFocalCount,
    scoreBreakdown: baselineEval.scoreBreakdown,
    warningsKo,
    recommendedAdjustment: solveCameraCropPanAdjustment(armature, input, baselineEval, safeMarginPx),
  };
}
