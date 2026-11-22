/**
 * 시선 동선(Eye-Flow) Z-패턴 분석기 및 말풍선 꼬리 얼굴/눈 가림 오케스트레이션 엔진.
 *
 * 2D 기하 원시 함수(`studio-eyeflow-primitives.ts`)를 조합해:
 * - 한국어/글로벌 좌→우·상→하 Z-패턴(및 일본 만화 우→좌 모드) 시선 경로·역주행 판정
 * - 말풍선 본체·꼬리 선분의 캐릭터 얼굴/눈 가림(occlusion) 검출 및 보정 좌표 산출
 * - 가독성 점수(0..100) 및 요약 진단 생성
 * 을 순수·결정적으로 수행한다.
 */

import {
  clamp,
  computeBalloonTailBase,
  computeRecommendedTailTip,
  deriveDefaultEyeBounds,
  distanceBetween,
  intersectAabb,
  intersectSegmentAabb,
  intersectSegments,
  isFinitePoint,
  isValidRect,
  pointInsideRect,
  rectCenter,
  round2,
} from "./studio-eyeflow-primitives";
import { detectMobileViewportSpoilerRisks } from "./studio-eyeflow-rhythm-solver";
import type {
  EyeFlowAnalysisConfig,
  EyeFlowAnalysisInput,
  EyeFlowAnalysisResult,
  EyeFlowBalloonInput,
  EyeFlowCutBounds,
  EyeFlowHealthStatus,
  EyeFlowNode,
  EyeFlowPatternKind,
  EyeFlowPatternMode,
  EyeFlowPoint,
  EyeFlowReadingDirection,
  EyeFlowResolvedTail,
  EyeFlowSegment,
  EyeFlowTransitionReason,
  EyeFlowTransitionSeverity,
  ResolvedEyeFlowFaceRegion,
  TailCrossingWarning,
  TailOcclusionKind,
  TailOcclusionSeverity,
  TailOcclusionWarning,
} from "./studio-eyeflow-types";

export {
  computeBalloonTailBase,
  computeRecommendedTailTip,
  deriveDefaultEyeBounds,
  intersectAabb,
  intersectSegmentAabb,
  intersectSegments,
} from "./studio-eyeflow-primitives";

export const DEFAULT_EYEFLOW_ANALYSIS_CONFIG: EyeFlowAnalysisConfig = Object.freeze({
  upwardBacktrackThresholdPx: 24,
  horizontalBacktrackThresholdPx: 80,
  rowBandTolerancePx: 36,
  tailClearanceMarginPx: 10,
  faceBodyOverlapRatioThreshold: 0.05,
});

const SHALLOW_BACKWARD_SLOPE_LIMIT = 0.18;

/**
 * 말풍선 배열을 자연스러운 Z-패턴(행 밴딩 상→하, 행 내 좌→우 또는 우→좌) 읽기 순서로 정렬한
 * ID 목록을 제안한다.
 */
export function suggestZPatternReadingOrder(
  balloons: readonly EyeFlowBalloonInput[],
  direction: EyeFlowReadingDirection = "ltr-ttb",
  rowBandTolerancePx: number = DEFAULT_EYEFLOW_ANALYSIS_CONFIG.rowBandTolerancePx,
): readonly string[] {
  const valid = balloons
    .filter((balloon) => isValidRect(balloon.bounds))
    .map((balloon, index) => ({
      id: balloon.id,
      index,
      center: rectCenter(balloon.bounds),
    }));

  if (valid.length <= 1) {
    return Object.freeze(valid.map((item) => item.id));
  }

  const byY = valid.slice().sort((a, b) => a.center.y - b.center.y || a.index - b.index);
  const rows: Array<{ anchorY: number; items: typeof byY }> = [];

  for (const item of byY) {
    const currentRow = rows[rows.length - 1];
    if (currentRow && item.center.y - currentRow.anchorY <= rowBandTolerancePx) {
      currentRow.items.push(item);
    } else {
      rows.push({ anchorY: item.center.y, items: [item] });
    }
  }

  const orderedIds: string[] = [];
  for (const row of rows) {
    row.items.sort((a, b) => {
      const horiz = direction === "rtl-ttb" ? b.center.x - a.center.x : a.center.x - b.center.x;
      return horiz !== 0 ? horiz : a.center.y - b.center.y || a.index - b.index;
    });
    for (const item of row.items) {
      orderedIds.push(item.id);
    }
  }

  return Object.freeze(orderedIds);
}

function resolveCutIdForPoint(
  explicitCutId: string | null | undefined,
  point: EyeFlowPoint,
  cuts: readonly EyeFlowCutBounds[],
): string | null {
  if (explicitCutId) return explicitCutId;
  for (const cut of cuts) {
    if (isValidRect(cut.bounds) && pointInsideRect(point, cut.bounds)) {
      return cut.id;
    }
  }
  return null;
}

function buildTextPreview(text: string | undefined): string {
  const trimmed = (text ?? "").replace(/\s+/gu, " ").trim();
  if (!trimmed) return "";
  return trimmed.length > 18 ? `${trimmed.slice(0, 18)}…` : trimmed;
}

function evaluateTransition(params: {
  readonly prev: EyeFlowNode;
  readonly next: EyeFlowNode;
  readonly direction: EyeFlowReadingDirection;
  readonly patternMode: EyeFlowPatternMode;
  readonly rowIndex: number;
  readonly canvasWidth: number;
  readonly config: EyeFlowAnalysisConfig;
  readonly cutOrderIndex: ReadonlyMap<string, number>;
}): EyeFlowSegment {
  const { prev, next, direction, patternMode, rowIndex, canvasWidth, config, cutOrderIndex } =
    params;
  const dx = round2(next.center.x - prev.center.x);
  const dy = round2(next.center.y - prev.center.y);
  const distancePx = round2(Math.hypot(dx, dy));
  const angleDeg = round2((Math.atan2(dy, dx) * 180) / Math.PI);

  const isSerpentineReversedRow = patternMode === "s-pattern" && rowIndex % 2 === 1;
  const effectiveDirection: EyeFlowReadingDirection = isSerpentineReversedRow
    ? direction === "rtl-ttb"
      ? "ltr-ttb"
      : "rtl-ttb"
    : direction;
  const forwardDx = effectiveDirection === "rtl-ttb" ? -dx : dx;
  const reverseSideLabel = effectiveDirection === "rtl-ttb" ? "오른쪽 위" : "왼쪽 위";
  const reverseHorizontalLabel =
    effectiveDirection === "rtl-ttb" ? "왼쪽→오른쪽" : "오른쪽→왼쪽";

  const prevCutIdx = prev.cutId ? cutOrderIndex.get(prev.cutId) : undefined;
  const nextCutIdx = next.cutId ? cutOrderIndex.get(next.cutId) : undefined;
  const movedToEarlierCut =
    prevCutIdx !== undefined && nextCutIdx !== undefined && nextCutIdx < prevCutIdx;
  const movedToLaterCut =
    prevCutIdx !== undefined && nextCutIdx !== undefined && nextCutIdx > prevCutIdx;

  let isReversal = false;
  let reason: EyeFlowTransitionReason = "natural-vertical";
  let severity: EyeFlowTransitionSeverity = "ok";
  let messageKo = `${prev.sequenceNumber}→${next.sequenceNumber}번 시선 흐름 양호`;
  let detailKo = "세로 스크롤 흐름에 맞춰 시선이 자연스럽게 내려갑니다.";

  if (movedToEarlierCut || dy < -config.upwardBacktrackThresholdPx) {
    isReversal = true;
    if (forwardDx < -config.horizontalBacktrackThresholdPx * 0.5) {
      reason = "upward-left-jump";
      severity = "critical";
      messageKo = `${prev.sequenceNumber}→${next.sequenceNumber}번 시선 ${reverseSideLabel} 급격한 역주행`;
      detailKo = `다음 말풍선이 이전보다 ${Math.round(Math.abs(dy))}px 위쪽·${reverseSideLabel}에 있어 독자 시선이 거슬러 올라갑니다. 말풍선 순번 또는 배치를 아래쪽 정방향으로 조정하세요.`;
    } else {
      reason = "upward-reversal";
      severity =
        movedToEarlierCut || dy < -config.upwardBacktrackThresholdPx * 2 ? "critical" : "warning";
      messageKo = `${prev.sequenceNumber}→${next.sequenceNumber}번 시선 상향 역주행`;
      detailKo = `다음 말풍선이 이전보다 ${Math.round(Math.abs(dy))}px 위쪽에 놓였습니다. 읽기 순번을 바꾸거나 아래쪽으로 내려 시선 역행을 해소하세요.`;
    }
  } else if (
    !movedToLaterCut &&
    forwardDx < -config.horizontalBacktrackThresholdPx &&
    (Math.abs(dy) <= config.rowBandTolerancePx ||
      (Math.abs(forwardDx) >= canvasWidth * 0.55 &&
        dy >= 0 &&
        dy / Math.max(1, Math.abs(forwardDx)) < SHALLOW_BACKWARD_SLOPE_LIMIT))
  ) {
    isReversal = true;
    reason = patternMode === "s-pattern" ? "s-pattern-backtrack" : "same-row-backtrack";
    severity = "warning";
    messageKo =
      patternMode === "s-pattern"
        ? `${prev.sequenceNumber}→${next.sequenceNumber}번 S-패턴 시선 역행`
        : `${prev.sequenceNumber}→${next.sequenceNumber}번 같은 행 시선 역행`;
    detailKo = `비슷한 높이에서 ${reverseHorizontalLabel}으로 ${Math.round(Math.abs(forwardDx))}px 되돌아갑니다. 행 내 읽기 방향을 맞추거나 두 번째 말풍선을 ${config.rowBandTolerancePx + 24}px 이상 아래로 내려 시선을 분리하세요.`;
  } else if (Math.abs(dy) <= config.rowBandTolerancePx && forwardDx > 0) {
    reason = isSerpentineReversedRow ? "natural-s-serpentine" : "natural-z-right";
    detailKo = isSerpentineReversedRow
      ? "S-패턴 꺾임 행에서 반대 방향으로 자연스럽게 이어집니다."
      : "같은 행에서 정방향으로 자연스럽게 이어집니다.";
  } else if (dy > config.rowBandTolerancePx && forwardDx < -config.horizontalBacktrackThresholdPx * 0.5) {
    reason = patternMode === "s-pattern" ? "natural-s-serpentine" : "natural-z-sweep";
    detailKo =
      patternMode === "s-pattern"
        ? "위 행 끝에서 아래 행으로 부드럽게 꺾이는 S-패턴 사행 전환입니다."
        : "위 행에서 아래 행 시작 지점으로 이어지는 표준 Z-패턴 전환입니다.";
  } else if (patternMode === "s-pattern" && dy > config.rowBandTolerancePx && Math.abs(dx) <= config.horizontalBacktrackThresholdPx) {
    reason = "natural-s-serpentine";
    detailKo = "S-패턴 아래 행으로 이어지는 수직 꺾임 전환입니다.";
  }

  return {
    id: `seg-${prev.balloonId}-${next.balloonId}`,
    fromBalloonId: prev.balloonId,
    toBalloonId: next.balloonId,
    fromSequence: prev.sequenceNumber,
    toSequence: next.sequenceNumber,
    from: prev.center,
    to: next.center,
    dx,
    dy,
    distancePx,
    angleDeg,
    isReversal,
    reason,
    severity,
    messageKo,
    detailKo,
  };
}

/**
 * 서로 다른 말풍선의 꼬리 선분이 X자로 교차하는 화자 혼선 구간을 검출한다.
 */
export function detectBalloonTailCrossings(
  nodes: readonly EyeFlowNode[],
): readonly TailCrossingWarning[] {
  const crossings: TailCrossingWarning[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const first = nodes[i]!;
    if (first.tails.length === 0) continue;
    for (let j = i + 1; j < nodes.length; j += 1) {
      const second = nodes[j]!;
      if (second.tails.length === 0) continue;
      if (first.cutId && second.cutId && first.cutId !== second.cutId) continue;

      for (const tailA of first.tails) {
        for (const tailB of second.tails) {
          const hit = intersectSegments(tailA.base, tailA.tip, tailB.base, tailB.tip);
          if (!hit) continue;
          const isConsecutive = Math.abs(second.sequenceNumber - first.sequenceNumber) === 1;
          const severity: TailOcclusionSeverity = isConsecutive ? "critical" : "warning";
          crossings.push({
            id: `cross-${first.balloonId}-${tailA.tailIndex}-${second.balloonId}-${tailB.tailIndex}`,
            firstBalloonId: first.balloonId,
            secondBalloonId: second.balloonId,
            firstSequence: first.sequenceNumber,
            secondSequence: second.sequenceNumber,
            firstTailIndex: tailA.tailIndex,
            secondTailIndex: tailB.tailIndex,
            intersectionPoint: hit.point,
            severity,
            messageKo: `${first.sequenceNumber}·${second.sequenceNumber}번 말풍선 꼬리가 교차합니다`,
            detailKo: `(${Math.round(hit.point.x)}, ${Math.round(hit.point.y)}) 지점에서 두 말풍선 꼬리가 X자로 겹쳐 화자 구분이 흐려집니다. 두 말풍선의 좌우 위치를 바꾸거나 꼬리 길이를 줄여 교차를 해소하세요.`,
          });
        }
      }
    }
  }
  return Object.freeze(crossings);
}

function classifyEyeFlowPattern(
  segments: readonly EyeFlowSegment[],
  patternMode: EyeFlowPatternMode,
): EyeFlowPatternKind {
  if (segments.length === 0) return "vertical-scroll";
  if (patternMode === "s-pattern") return "s-pattern";
  const horizontalSigns: number[] = [];
  let zSweepCount = 0;
  for (const seg of segments) {
    if (seg.reason === "natural-z-sweep") zSweepCount += 1;
    if (Math.abs(seg.dx) >= 60 && Math.abs(seg.dy) <= 48) {
      horizontalSigns.push(seg.dx > 0 ? 1 : -1);
    }
  }
  let alternations = 0;
  for (let i = 1; i < horizontalSigns.length; i += 1) {
    if (horizontalSigns[i] !== horizontalSigns[i - 1]) alternations += 1;
  }
  if (alternations >= 1 && zSweepCount === 0) return "s-pattern";
  if (zSweepCount >= 1 || horizontalSigns.length > 0) return "z-pattern";
  return "vertical-scroll";
}

/**
 * 컷 내 말풍선과 캐릭터 얼굴/눈 바운딩 박스를 입력받아:
 * - Z-패턴 시선 경로 및 역주행 구간
 * - 말풍선 본체·꼬리의 캐릭터 얼굴/눈 가림(occlusion) 및 권장 꼬리 보정 좌표
 * - 가독성 점수(0..100) 및 요약 진단
 * 을 계산하는 핵심 순수 엔진.
 */
export function analyzeEyeFlowAndTailGuard(input: EyeFlowAnalysisInput): EyeFlowAnalysisResult {
  const canvasWidth = Math.max(1, Number.isFinite(input.canvasWidth) ? input.canvasWidth : 720);
  const canvasHeight = Math.max(1, Number.isFinite(input.canvasHeight) ? input.canvasHeight : 1_280);
  const direction: EyeFlowReadingDirection = input.direction ?? "ltr-ttb";
  const patternMode: EyeFlowPatternMode = input.patternMode ?? "z-pattern";

  const config: EyeFlowAnalysisConfig = {
    upwardBacktrackThresholdPx:
      input.config?.upwardBacktrackThresholdPx ??
      DEFAULT_EYEFLOW_ANALYSIS_CONFIG.upwardBacktrackThresholdPx,
    horizontalBacktrackThresholdPx:
      input.config?.horizontalBacktrackThresholdPx ??
      DEFAULT_EYEFLOW_ANALYSIS_CONFIG.horizontalBacktrackThresholdPx,
    rowBandTolerancePx:
      input.config?.rowBandTolerancePx ?? DEFAULT_EYEFLOW_ANALYSIS_CONFIG.rowBandTolerancePx,
    tailClearanceMarginPx:
      input.config?.tailClearanceMarginPx ?? DEFAULT_EYEFLOW_ANALYSIS_CONFIG.tailClearanceMarginPx,
    faceBodyOverlapRatioThreshold:
      input.config?.faceBodyOverlapRatioThreshold ??
      DEFAULT_EYEFLOW_ANALYSIS_CONFIG.faceBodyOverlapRatioThreshold,
  };

  const validCuts = (input.cuts ?? [])
    .filter((cut) => isValidRect(cut.bounds))
    .slice()
    .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
  const cutOrderIndex = new Map<string, number>(validCuts.map((cut, index) => [cut.id, index]));

  const resolvedFaces: ResolvedEyeFlowFaceRegion[] = input.faces
    .filter((face) => isValidRect(face.faceBounds))
    .map((face, index) => {
      const center = rectCenter(face.faceBounds);
      const resolvedEyeBounds = isValidRect(face.eyeBounds)
        ? face.eyeBounds
        : deriveDefaultEyeBounds(face.faceBounds);
      return {
        ...face,
        label: face.label?.trim() || `캐릭터 ${index + 1}`,
        cutId: resolveCutIdForPoint(face.cutId, center, validCuts),
        resolvedEyeBounds,
      };
    });

  const validBalloons = input.balloons
    .filter((balloon) => isValidRect(balloon.bounds))
    .map((balloon, index) => ({
      balloon,
      index,
      effectiveOrder:
        typeof balloon.readingOrder === "number" && Number.isFinite(balloon.readingOrder)
          ? balloon.readingOrder
          : index + 1,
    }))
    .sort(
      (a, b) =>
        a.effectiveOrder - b.effectiveOrder ||
        a.balloon.bounds.y - b.balloon.bounds.y ||
        a.index - b.index,
    );

  const nodes: EyeFlowNode[] = validBalloons.map(({ balloon, effectiveOrder }, orderIndex) => {
    const center = rectCenter(balloon.bounds);
    const cutId = resolveCutIdForPoint(balloon.cutId, center, validCuts);
    const tails: EyeFlowResolvedTail[] = [];

    if (isFinitePoint(balloon.tailTip)) {
      const base = isFinitePoint(balloon.tailBase)
        ? balloon.tailBase
        : computeBalloonTailBase(balloon.bounds, balloon.tailTip);
      tails.push({ base, tip: balloon.tailTip, tailIndex: 0 });
    }
    if (balloon.extraTailTips) {
      balloon.extraTailTips.forEach((tip, extraIndex) => {
        if (!isFinitePoint(tip)) return;
        const base = computeBalloonTailBase(balloon.bounds, tip);
        tails.push({ base, tip, tailIndex: extraIndex + 1 });
      });
    }

    return {
      balloonId: balloon.id,
      sequenceNumber: orderIndex + 1,
      readingOrder: effectiveOrder,
      center,
      bounds: balloon.bounds,
      textPreview: buildTextPreview(balloon.text),
      primaryTail: tails[0] ?? null,
      tails: Object.freeze(tails),
      cutId,
    };
  });

  const segments: EyeFlowSegment[] = [];
  let currentRowIndex = 0;
  let currentRowAnchorY = nodes[0]?.center.y ?? 0;
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const prevNode = nodes[i]!;
    const nextNode = nodes[i + 1]!;
    if (nextNode.center.y - currentRowAnchorY > config.rowBandTolerancePx) {
      currentRowIndex += 1;
      currentRowAnchorY = nextNode.center.y;
    }
    const rowForSegment =
      Math.abs(nextNode.center.y - prevNode.center.y) <= config.rowBandTolerancePx
        ? currentRowIndex
        : Math.max(0, currentRowIndex - 1);
    segments.push(
      evaluateTransition({
        prev: prevNode,
        next: nextNode,
        direction,
        patternMode,
        rowIndex: rowForSegment,
        canvasWidth,
        config,
        cutOrderIndex,
      }),
    );
  }
  const reversals = segments.filter((segment) => segment.isReversal);
  const tailCrossings = detectBalloonTailCrossings(nodes);
  const spoilerRisks = detectMobileViewportSpoilerRisks({
    canvasWidth,
    nodes,
    cuts: validCuts,
    config: input.mobileSpoilerGuard,
  });
  const detectedPattern = classifyEyeFlowPattern(segments, patternMode);

  const occlusions: TailOcclusionWarning[] = [];

  for (const node of nodes) {
    const candidateFaces = resolvedFaces.filter(
      (face) => !node.cutId || !face.cutId || node.cutId === face.cutId,
    );

    for (const face of candidateFaces) {
      const bodyEyeOverlap = intersectAabb(node.bounds, face.resolvedEyeBounds);
      if (bodyEyeOverlap) {
        occlusions.push({
          id: `occ-body-eyes-${node.balloonId}-${face.id}`,
          balloonId: node.balloonId,
          sequenceNumber: node.sequenceNumber,
          faceId: face.id,
          faceLabel: face.label,
          kind: "body-covers-eyes",
          severity: "critical",
          intersectionPoint: rectCenter(bodyEyeOverlap.rect),
          tailBase: node.primaryTail?.base ?? null,
          originalTailTip: node.primaryTail?.tip ?? null,
          recommendedTailTip: null,
          overlapRatio: bodyEyeOverlap.targetCoverageRatio,
          messageKo: `${node.sequenceNumber}번 말풍선이 ${face.label}의 눈을 가립니다`,
          detailKo: `말풍선 본체가 캐릭터 눈 영역의 ${Math.round(bodyEyeOverlap.targetCoverageRatio * 100)}%를 덮고 있습니다. 말풍선을 이마 위나 여백으로 옮기세요.`,
        });
      } else {
        const bodyFaceOverlap = intersectAabb(node.bounds, face.faceBounds);
        if (
          bodyFaceOverlap &&
          bodyFaceOverlap.targetCoverageRatio >= config.faceBodyOverlapRatioThreshold
        ) {
          const severity: TailOcclusionSeverity =
            bodyFaceOverlap.targetCoverageRatio >= 0.35 ? "critical" : "warning";
          occlusions.push({
            id: `occ-body-face-${node.balloonId}-${face.id}`,
            balloonId: node.balloonId,
            sequenceNumber: node.sequenceNumber,
            faceId: face.id,
            faceLabel: face.label,
            kind: "body-covers-face",
            severity,
            intersectionPoint: rectCenter(bodyFaceOverlap.rect),
            tailBase: node.primaryTail?.base ?? null,
            originalTailTip: node.primaryTail?.tip ?? null,
            recommendedTailTip: null,
            overlapRatio: bodyFaceOverlap.targetCoverageRatio,
            messageKo: `${node.sequenceNumber}번 말풍선이 ${face.label}의 얼굴을 가립니다`,
            detailKo: `말풍선 본체가 얼굴 영역의 ${Math.round(bodyFaceOverlap.targetCoverageRatio * 100)}%와 겹칩니다. 표정이 살아나도록 말풍선을 바깥 여백으로 이동하세요.`,
          });
        }
      }

      for (const tail of node.tails) {
        const eyeHit = intersectSegmentAabb(tail.base, tail.tip, face.resolvedEyeBounds);
        const faceHit = eyeHit ?? intersectSegmentAabb(tail.base, tail.tip, face.faceBounds);
        if (!faceHit) continue;

        const kind: TailOcclusionKind = eyeHit ? "tail-crosses-eyes" : "tail-crosses-face";
        const severity: TailOcclusionSeverity = eyeHit ? "critical" : "warning";
        const recommendedTailTip = computeRecommendedTailTip({
          tailBase: tail.base,
          originalTailTip: tail.tip,
          targetFace: face,
          allFaces: candidateFaces,
          canvasWidth,
          canvasHeight,
          clearanceMarginPx: config.tailClearanceMarginPx,
        });

        const totalTailLen = Math.max(1, distanceBetween(tail.base, tail.tip));
        const penetrationRatio = round2(clamp(faceHit.clippedLength / totalTailLen, 0, 1));
        const tipHint = recommendedTailTip
          ? ` 권장 꼬리 끝 좌표: (${Math.round(recommendedTailTip.x)}, ${Math.round(recommendedTailTip.y)})`
          : "";

        occlusions.push({
          id: `occ-${kind}-${node.balloonId}-${face.id}-${tail.tailIndex}`,
          balloonId: node.balloonId,
          sequenceNumber: node.sequenceNumber,
          faceId: face.id,
          faceLabel: face.label,
          kind,
          severity,
          intersectionPoint: faceHit.midpoint,
          tailBase: tail.base,
          originalTailTip: tail.tip,
          recommendedTailTip,
          overlapRatio: penetrationRatio,
          messageKo: eyeHit
            ? `${node.sequenceNumber}번 말풍선 꼬리가 ${face.label}의 눈을 가로지릅니다`
            : `${node.sequenceNumber}번 말풍선 꼬리가 ${face.label}의 얼굴에 닿습니다`,
          detailKo: eyeHit
            ? `꼬리 선분이 눈 영역을 관통해 시선 집중을 방해합니다. 턱선이나 얼굴 바깥 여백으로 꼬리 끝을 짧게 당기세요.${tipHint}`
            : `꼬리 선분이 얼굴 윤곽 안쪽으로 들어왔습니다. 화자 방향을 유지한 채 얼굴 경계 바깥으로 꼬리를 줄이세요.${tipHint}`,
        });
      }
    }
  }

  let criticalCount = 0;
  let warningCount = 0;
  let penalty = 0;

  for (const rev of reversals) {
    if (rev.severity === "critical") {
      criticalCount += 1;
      penalty += 22;
    } else if (rev.severity === "warning") {
      warningCount += 1;
      penalty += 10;
    }
  }

  for (const occ of occlusions) {
    if (occ.severity === "critical") {
      criticalCount += 1;
      penalty += 25;
    } else {
      warningCount += 1;
      penalty += 12;
    }
  }

  for (const cross of tailCrossings) {
    if (cross.severity === "critical") {
      criticalCount += 1;
      penalty += 20;
    } else {
      warningCount += 1;
      penalty += 10;
    }
  }

  const score = clamp(100 - penalty, 0, 100);
  const status: EyeFlowHealthStatus =
    criticalCount > 0 ? "blocked" : warningCount > 0 ? "caution" : "clear";

  const suggestedOrderIds = suggestZPatternReadingOrder(
    validBalloons.map((entry) => entry.balloon),
    direction,
    config.rowBandTolerancePx,
  );

  let summaryKo: string;
  if (nodes.length === 0) {
    summaryKo = "분석할 말풍선이 없습니다.";
  } else if (reversals.length === 0 && occlusions.length === 0 && tailCrossings.length === 0) {
    summaryKo = `말풍선 ${nodes.length}개의 시선 동선과 꼬리 배치가 자연스럽습니다.`;
  } else {
    const parts: string[] = [];
    if (reversals.length > 0) parts.push(`시선 역주행 ${reversals.length}건`);
    if (occlusions.length > 0) parts.push(`얼굴·눈 가림 ${occlusions.length}건`);
    if (tailCrossings.length > 0) parts.push(`말풍선 꼬리 교차 ${tailCrossings.length}건`);
    summaryKo = `${parts.join(", ")}이 감지되었습니다.`;
  }

  return {
    canvasWidth,
    canvasHeight,
    direction,
    detectedPattern,
    nodes: Object.freeze(nodes),
    segments: Object.freeze(segments),
    reversals: Object.freeze(reversals),
    occlusions: Object.freeze(occlusions),
    tailCrossings,
    spoilerRisks,
    faces: Object.freeze(resolvedFaces),
    suggestedOrderIds,
    score,
    status,
    warningCount,
    criticalCount,
    summaryKo,
  };
}
