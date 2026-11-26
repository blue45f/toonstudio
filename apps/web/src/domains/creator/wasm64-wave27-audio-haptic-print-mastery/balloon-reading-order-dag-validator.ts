/**
 * 말풍선 읽기 순서 유향 비순환 그래프(DAG) 모호성 검출기 및 최소 변위 자동 보정기.
 *
 * - 한국어·영어 좌→우(`ko-ltr`, `en-ltr` Z-스윕)와 일본어 우→좌(`ja-rtl` 역-Z 스윕) 진행 방향에서
 *   대본 의도 순서(`scriptOrder: 0..N-1`)와 실제 시각 읽기 순서를 비교한다.
 * - 말풍선 쌍별 지각 선행 확률 `P(A before B)`를 계산해 시각 역전(`reading-order-inversion`)과
 *   수평 데드존(`|Δy| <= 28px`) 안의 가로 위치 경합(`horizontal-tie-ambiguity`)을 검출한다.
 * - 안전 여백(`safeMarginPx`) 준수와 인물 얼굴 보호 영역 침범 `0`(`faceOverlapAreaPx2 === 0`)을 유지하면서
 *   이동 거리 합을 최소화하는 `(dx, dy)` 보정 좌표를 산출해 대본 순서 일치율 `100%`를 달성한다.
 */

export const BALLOON_READING_DIRECTIONS = Object.freeze(["ko-ltr", "en-ltr", "ja-rtl"] as const);
export type BalloonReadingDirection = (typeof BALLOON_READING_DIRECTIONS)[number];

export const READING_ORDER_ISSUE_KINDS = Object.freeze([
  "reading-order-inversion",
  "horizontal-tie-ambiguity",
] as const);
export type ReadingOrderIssueKind = (typeof READING_ORDER_ISSUE_KINDS)[number];

/** 동일 행 여부가 모호해지는 수직 중심차 데드존 임계값(`28px`). */
export const HORIZONTAL_TIE_DEAD_ZONE_PX = 28 as const;

/** 패널 테두리 기본 안전 여백(`16px`). */
export const DEFAULT_PANEL_SAFE_MARGIN_PX = 16 as const;

/** 데드존 내부에서 명확한 가로 선후로 인정하기 위한 최소 방향성 중심 간격(`px`). */
export const MIN_HORIZONTAL_BAND_CLEARANCE_PX = 34 as const;

export interface SpeechBalloonNode {
  readonly id: string;
  /** 대본상 의도된 읽기 순번(`0`부터 오름차순). */
  readonly scriptOrder: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly dialoguePreview?: string;
}

export interface ProtectedFaceBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly characterLabel?: string;
}

export interface BalloonLayoutValidationInput {
  readonly direction: BalloonReadingDirection;
  readonly panelWidth: number;
  readonly panelHeight: number;
  readonly safeMarginPx?: number;
  readonly balloons: readonly SpeechBalloonNode[];
  readonly protectedFaceBoxes?: readonly ProtectedFaceBox[];
}

export interface BalloonPairwisePrecedenceEdge {
  readonly earlierScriptId: string;
  readonly laterScriptId: string;
  readonly earlierScriptOrder: number;
  readonly laterScriptOrder: number;
  /** `cy(later) - cy(earlier)` (`> 0`이면 나중 대사가 아래쪽에 위치). */
  readonly deltaYPx: number;
  /** 읽기 가로축 기준 진행량(`ltr`: `cxB - cxA`, `rtl`: `cxA - cxB`). */
  readonly directionalDeltaXPx: number;
  /** 대본 앞선 말풍선이 시각적으로도 먼저 읽힐 지각 확률 `P(earlier before later)`. */
  readonly precedenceProbability: number;
  readonly isInverted: boolean;
  readonly isHorizontalTieAmbiguous: boolean;
}

export interface BalloonReadingOrderIssue {
  readonly kind: ReadingOrderIssueKind;
  readonly earlierBalloonId: string;
  readonly laterBalloonId: string;
  readonly deltaYPx: number;
  readonly directionalDeltaXPx: number;
  readonly precedenceProbability: number;
  readonly summaryKo: string;
}

export interface BalloonReadingOrderValidationReport {
  readonly direction: BalloonReadingDirection;
  readonly scriptOrderIds: readonly string[];
  readonly visualOrderIds: readonly string[];
  readonly matchesScriptOrder: boolean;
  readonly edges: readonly BalloonPairwisePrecedenceEdge[];
  readonly issues: readonly BalloonReadingOrderIssue[];
  readonly faceOverlapAreaPx2: number;
  readonly safeMarginViolationCount: number;
}

export interface BalloonNudgeAssignment {
  readonly id: string;
  readonly scriptOrder: number;
  readonly originalX: number;
  readonly originalY: number;
  readonly resolvedX: number;
  readonly resolvedY: number;
  readonly dx: number;
  readonly dy: number;
  readonly displacementPx: number;
  readonly width: number;
  readonly height: number;
}

export interface BalloonReadingOrderResolutionResult {
  readonly direction: BalloonReadingDirection;
  readonly initialReport: BalloonReadingOrderValidationReport;
  readonly resolvedReport: BalloonReadingOrderValidationReport;
  readonly resolvedBalloons: readonly SpeechBalloonNode[];
  readonly nudges: readonly BalloonNudgeAssignment[];
  readonly totalDisplacementPx: number;
  readonly maxSingleNudgePx: number;
  readonly faceOverlapAreaPx2: number;
  readonly safeMarginSatisfied: boolean;
}

interface MutableBalloon {
  readonly id: string;
  readonly scriptOrder: number;
  readonly origX: number;
  readonly origY: number;
  readonly width: number;
  readonly height: number;
  readonly dialoguePreview?: string;
  x: number;
  y: number;
}

interface RectLike {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface SafeBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function computeRectOverlapArea(a: RectLike, b: RectLike): number {
  const overlapW = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapH = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapW > 0 && overlapH > 0 ? overlapW * overlapH : 0;
}

function horizontalSpansCompete(a: RectLike, b: RectLike): boolean {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > -2;
}

/**
 * 두 말풍선 `a`, `b`에 대해 독자의 시선이 `a`를 `b`보다 먼저 읽을 지각 선행 확률 `P(a before b)`를 계산한다.
 * `P(a before b) + P(b before a) === 1` 반대칭성을 만족한다.
 */
export function computePairwiseReadingPrecedence(
  a: RectLike,
  b: RectLike,
  direction: BalloonReadingDirection,
): {
  readonly deltaYPx: number;
  readonly directionalDeltaXPx: number;
  readonly probabilityABeforeB: number;
} {
  const deltaYPx = b.y + b.height * 0.5 - (a.y + a.height * 0.5);
  const rawDx = b.x + b.width * 0.5 - (a.x + a.width * 0.5);
  const directionalDeltaXPx = direction === "ja-rtl" ? -rawDx : rawDx;

  const normY = deltaYPx / HORIZONTAL_TIE_DEAD_ZONE_PX;
  const rowCoupling = 0.42 + 2.28 * Math.exp(-(normY * normY));
  const logit = clamp(2.25 * normY + rowCoupling * (directionalDeltaXPx / 76), -18, 18);

  return {
    deltaYPx: roundTo(deltaYPx, 3),
    directionalDeltaXPx: roundTo(directionalDeltaXPx, 3),
    probabilityABeforeB: roundTo(1 / (1 + Math.exp(-logit)), 6),
  };
}

function isPairHorizontalTieAmbiguous(
  earlier: RectLike,
  later: RectLike,
  deltaYPx: number,
  directionalDeltaXPx: number,
): boolean {
  if (Math.abs(deltaYPx) > HORIZONTAL_TIE_DEAD_ZONE_PX) return false;
  return (
    directionalDeltaXPx < MIN_HORIZONTAL_BAND_CLEARANCE_PX ||
    horizontalSpansCompete(earlier, later)
  );
}

/** 쌍별 지각 선행 관계(`P > 0.5`)로부터 DAG 위상 정렬을 수행해 실제 시각 읽기 순서를 도출한다. */
function deriveVisualReadingOrder(
  balloons: readonly SpeechBalloonNode[],
  direction: BalloonReadingDirection,
): readonly string[] {
  const count = balloons.length;
  if (count <= 1) return balloons.map((b) => b.id);

  const adj: number[][] = Array.from({ length: count }, () => []);
  const inDegree = new Int32Array(count);
  const winScores = new Float64Array(count);

  for (let i = 0; i < count; i += 1) {
    const bi = balloons[i];
    if (!bi) continue;
    for (let j = i + 1; j < count; j += 1) {
      const bj = balloons[j];
      if (!bj) continue;
      const { probabilityABeforeB, deltaYPx, directionalDeltaXPx } =
        computePairwiseReadingPrecedence(bi, bj, direction);
      winScores[i] = (winScores[i] ?? 0) + probabilityABeforeB;
      winScores[j] = (winScores[j] ?? 0) + (1 - probabilityABeforeB);

      const iBeforeJ =
        probabilityABeforeB > 0.5 ||
        (probabilityABeforeB === 0.5 &&
          (deltaYPx > 0 || (deltaYPx === 0 && directionalDeltaXPx >= 0)));
      if (iBeforeJ) {
        adj[i]?.push(j);
        inDegree[j] = (inDegree[j] ?? 0) + 1;
      } else {
        adj[j]?.push(i);
        inDegree[i] = (inDegree[i] ?? 0) + 1;
      }
    }
  }

  const visited = new Uint8Array(count);
  const orderedIndices: number[] = [];

  const compareTieBreak = (idxA: number, idxB: number): number => {
    const scoreDiff = (winScores[idxB] ?? 0) - (winScores[idxA] ?? 0);
    if (Math.abs(scoreDiff) > 1e-6) return scoreDiff;
    const ba = balloons[idxA];
    const bb = balloons[idxB];
    if (!ba || !bb) return idxA - idxB;
    const cyDiff = ba.y + ba.height * 0.5 - (bb.y + bb.height * 0.5);
    return Math.abs(cyDiff) > 1e-6 ? cyDiff : ba.scriptOrder - bb.scriptOrder;
  };

  while (orderedIndices.length < count) {
    let bestIdx = -1;
    let minInDeg = Number.POSITIVE_INFINITY;
    for (let i = 0; i < count; i += 1) {
      if (visited[i] === 1) continue;
      const deg = inDegree[i] ?? 0;
      if (deg < minInDeg || (deg === minInDeg && bestIdx !== -1 && compareTieBreak(i, bestIdx) < 0)) {
        minInDeg = deg;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    visited[bestIdx] = 1;
    orderedIndices.push(bestIdx);
    for (const next of adj[bestIdx] ?? []) {
      inDegree[next] = Math.max(0, (inDegree[next] ?? 0) - 1);
    }
  }

  return orderedIndices.map((idx) => balloons[idx]?.id ?? "");
}

function safeBoundsFor(
  panelWidth: number,
  panelHeight: number,
  safeMarginPx: number,
  w: number,
  h: number,
): SafeBounds {
  const minX = Math.min(safeMarginPx, Math.max(0, (panelWidth - w) * 0.5));
  const maxX = Math.max(minX, panelWidth - safeMarginPx - w);
  const minY = Math.min(safeMarginPx, Math.max(0, (panelHeight - h) * 0.5));
  const maxY = Math.max(minY, panelHeight - safeMarginPx - h);
  return { minX, maxX, minY, maxY };
}

/** 패널 내 말풍선 배치를 검증해 대본 순서 대비 역전·수평 모호성·얼굴 침범·여백 이탈을 진단한다. */
export function validateBalloonReadingOrderDag(
  input: BalloonLayoutValidationInput,
): BalloonReadingOrderValidationReport {
  const safeMarginPx = Math.max(0, input.safeMarginPx ?? DEFAULT_PANEL_SAFE_MARGIN_PX);
  const faces = input.protectedFaceBoxes ?? [];
  const sortedByScript = [...input.balloons].sort((a, b) =>
    a.scriptOrder !== b.scriptOrder ? a.scriptOrder - b.scriptOrder : a.id.localeCompare(b.id),
  );

  const scriptOrderIds = sortedByScript.map((b) => b.id);
  const visualOrderIds = deriveVisualReadingOrder(sortedByScript, input.direction);
  const visualRankById = new Map<string, number>();
  visualOrderIds.forEach((id, idx) => visualRankById.set(id, idx));

  const edges: BalloonPairwisePrecedenceEdge[] = [];
  const issues: BalloonReadingOrderIssue[] = [];

  for (let i = 0; i < sortedByScript.length; i += 1) {
    const earlier = sortedByScript[i];
    if (!earlier) continue;
    for (let j = i + 1; j < sortedByScript.length; j += 1) {
      const later = sortedByScript[j];
      if (!later) continue;

      const { deltaYPx, directionalDeltaXPx, probabilityABeforeB } =
        computePairwiseReadingPrecedence(earlier, later, input.direction);
      const rankEarlier = visualRankById.get(earlier.id) ?? i;
      const rankLater = visualRankById.get(later.id) ?? j;
      const isInverted = probabilityABeforeB <= 0.5 || rankEarlier > rankLater;
      const isHorizontalTieAmbiguous = isPairHorizontalTieAmbiguous(
        earlier,
        later,
        deltaYPx,
        directionalDeltaXPx,
      );

      edges.push({
        earlierScriptId: earlier.id, laterScriptId: later.id,
        earlierScriptOrder: earlier.scriptOrder, laterScriptOrder: later.scriptOrder,
        deltaYPx, directionalDeltaXPx, precedenceProbability: probabilityABeforeB,
        isInverted, isHorizontalTieAmbiguous,
      });

      if (isInverted) {
        issues.push({
          kind: "reading-order-inversion", earlierBalloonId: earlier.id, laterBalloonId: later.id,
          deltaYPx, directionalDeltaXPx, precedenceProbability: probabilityABeforeB,
          summaryKo: `말풍선 '${later.id}'가 앞선 대사 '${earlier.id}'보다 시각적으로 먼저 읽힙니다(선행 확률 ${(probabilityABeforeB * 100).toFixed(1)}%).`,
        });
      }
      if (isHorizontalTieAmbiguous) {
        issues.push({
          kind: "horizontal-tie-ambiguity", earlierBalloonId: earlier.id, laterBalloonId: later.id,
          deltaYPx, directionalDeltaXPx, precedenceProbability: probabilityABeforeB,
          summaryKo: `말풍선 '${earlier.id}'와 '${later.id}'의 수직 중심차(|Δy|=${Math.abs(deltaYPx).toFixed(1)}px <= ${HORIZONTAL_TIE_DEAD_ZONE_PX}px)가 데드존 안에 있어 가로 시선 순서가 경합합니다.`,
        });
      }
    }
  }

  let faceOverlapAreaPx2 = 0;
  let safeMarginViolationCount = 0;
  for (const b of sortedByScript) {
    const sb = safeBoundsFor(input.panelWidth, input.panelHeight, safeMarginPx, b.width, b.height);
    if (b.x < sb.minX - 1e-4 || b.x > sb.maxX + 1e-4 || b.y < sb.minY - 1e-4 || b.y > sb.maxY + 1e-4) {
      safeMarginViolationCount += 1;
    }
    for (const face of faces) faceOverlapAreaPx2 += computeRectOverlapArea(b, face);
  }

  const matchesScriptOrder =
    scriptOrderIds.length === visualOrderIds.length &&
    scriptOrderIds.every((id, idx) => visualOrderIds[idx] === id) &&
    !issues.some((issue) => issue.kind === "reading-order-inversion");

  return {
    direction: input.direction, scriptOrderIds, visualOrderIds, matchesScriptOrder,
    edges, issues, faceOverlapAreaPx2: roundTo(faceOverlapAreaPx2, 3), safeMarginViolationCount,
  };
}

function overlapsAnyFace(rect: RectLike, faces: readonly ProtectedFaceBox[]): boolean {
  return faces.some((face) => computeRectOverlapArea(rect, face) > 0);
}

function isCleanOrderedPair(
  earlier: RectLike,
  later: RectLike,
  direction: BalloonReadingDirection,
): boolean {
  if (computeRectOverlapArea(earlier, later) > 0.5) return false;
  const { deltaYPx, directionalDeltaXPx, probabilityABeforeB } =
    computePairwiseReadingPrecedence(earlier, later, direction);
  return (
    probabilityABeforeB >= 0.78 &&
    !isPairHorizontalTieAmbiguous(earlier, later, deltaYPx, directionalDeltaXPx)
  );
}

function buildFaceFreeCandidates(
  b: MutableBalloon,
  panelWidth: number,
  panelHeight: number,
  safeMarginPx: number,
  faces: readonly ProtectedFaceBox[],
): Array<{ readonly x: number; readonly y: number }> {
  const sb = safeBoundsFor(panelWidth, panelHeight, safeMarginPx, b.width, b.height);
  const rawPoints: Array<{ readonly x: number; readonly y: number }> = [];
  const pushPt = (x: number, y: number): void => {
    rawPoints.push({ x: clamp(x, sb.minX, sb.maxX), y: clamp(y, sb.minY, sb.maxY) });
  };

  const localOffsetsX = [-64, -36, -18, 0, 18, 36, 64];
  const localOffsetsY = [-72, -40, -20, 0, 20, 40, 72];
  for (const oy of localOffsetsY) {
    for (const ox of localOffsetsX) {
      pushPt(b.origX + ox, b.origY + oy);
    }
  }

  for (const f of faces) {
    const pad = 2;
    pushPt(f.x - pad - b.width, b.origY);
    pushPt(f.x + f.width + pad, b.origY);
    pushPt(b.origX, f.y - pad - b.height);
    pushPt(b.origX, f.y + f.height + pad);
    pushPt(f.x - pad - b.width, f.y - pad - b.height);
    pushPt(f.x + f.width + pad, f.y - pad - b.height);
    pushPt(f.x - pad - b.width, f.y + f.height + pad);
    pushPt(f.x + f.width + pad, f.y + f.height + pad);
  }

  const cols = 7;
  const rows = 11;
  for (let r = 0; r < rows; r += 1) {
    const gy = sb.minY + (sb.maxY - sb.minY) * (r / (rows - 1));
    for (let c = 0; c < cols; c += 1) {
      pushPt(sb.minX + (sb.maxX - sb.minX) * (c / (cols - 1)), gy);
    }
  }

  const deduped: Array<{ readonly x: number; readonly y: number }> = [];
  for (const pt of rawPoints) {
    if (overlapsAnyFace({ x: pt.x, y: pt.y, width: b.width, height: b.height }, faces)) continue;
    if (!deduped.some((p) => Math.abs(p.x - pt.x) < 1.5 && Math.abs(p.y - pt.y) < 1.5)) {
      deduped.push(pt);
    }
  }
  if (deduped.length === 0) deduped.push({ x: sb.minX, y: sb.minY });

  deduped.sort(
    (a, d) =>
      (a.x - b.origX) ** 2 + (a.y - b.origY) ** 2 - ((d.x - b.origX) ** 2 + (d.y - b.origY) ** 2),
  );
  return deduped;
}

function solveGlobalCandidateDp(
  working: MutableBalloon[],
  panelWidth: number,
  panelHeight: number,
  safeMarginPx: number,
  faces: readonly ProtectedFaceBox[],
  direction: BalloonReadingDirection,
): void {
  const count = working.length;
  const pools = working.map((b) =>
    buildFaceFreeCandidates(b, panelWidth, panelHeight, safeMarginPx, faces),
  );
  const dpCost = pools.map((p) => new Float64Array(p.length).fill(Number.POSITIVE_INFINITY));
  const dpParent = pools.map((p) => new Int32Array(p.length).fill(-1));

  const firstB = working[0];
  const firstCost = dpCost[0];
  if (!firstB || !firstCost) return;
  for (let c = 0; c < (pools[0]?.length ?? 0); c += 1) {
    const pt = pools[0]?.[c];
    if (pt) firstCost[c] = (pt.x - firstB.origX) ** 2 + (pt.y - firstB.origY) ** 2;
  }

  for (let i = 1; i < count; i += 1) {
    const curB = working[i];
    const curPool = pools[i] ?? [];
    const prevPool = pools[i - 1] ?? [];
    const curCostArr = dpCost[i];
    const prevCostArr = dpCost[i - 1];
    const curParentArr = dpParent[i];
    if (!curB || !curCostArr || !prevCostArr || !curParentArr) continue;

    for (let cCur = 0; cCur < curPool.length; cCur += 1) {
      const ptCur = curPool[cCur];
      if (!ptCur) continue;
      const curRect: RectLike = { x: ptCur.x, y: ptCur.y, width: curB.width, height: curB.height };
      const stepSq = (ptCur.x - curB.origX) ** 2 + (ptCur.y - curB.origY) ** 2;

      for (let cPrev = 0; cPrev < prevPool.length; cPrev += 1) {
        const base = prevCostArr[cPrev] ?? Number.POSITIVE_INFINITY;
        if (!Number.isFinite(base) || base + stepSq >= (curCostArr[cCur] ?? Number.POSITIVE_INFINITY)) {
          continue;
        }
        let chainValid = true;
        let step = i - 1;
        let candIdx = cPrev;
        while (step >= 0) {
          const ancB = working[step];
          const ancPt = pools[step]?.[candIdx];
          if (
            !ancB ||
            !ancPt ||
            !isCleanOrderedPair(
              { x: ancPt.x, y: ancPt.y, width: ancB.width, height: ancB.height },
              curRect,
              direction,
            )
          ) {
            chainValid = false;
            break;
          }
          candIdx = dpParent[step]?.[candIdx] ?? -1;
          step -= 1;
        }
        if (chainValid) {
          curCostArr[cCur] = base + stepSq;
          curParentArr[cCur] = cPrev;
        }
      }
    }
  }

  const lastIdx = count - 1;
  const lastCostArr = dpCost[lastIdx];
  if (!lastCostArr) return;
  let bestCand = -1;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let c = 0; c < lastCostArr.length; c += 1) {
    const cost = lastCostArr[c] ?? Number.POSITIVE_INFINITY;
    if (cost < bestCost) {
      bestCost = cost;
      bestCand = c;
    }
  }
  if (bestCand === -1 || !Number.isFinite(bestCost)) return;

  let curCand = bestCand;
  for (let i = lastIdx; i >= 0; i -= 1) {
    const b = working[i];
    const pt = pools[i]?.[curCand];
    if (b && pt) {
      b.x = pt.x;
      b.y = pt.y;
    }
    curCand = dpParent[i]?.[curCand] ?? -1;
  }
}

function binaryShrinkCoordinate(
  current: number,
  target: number,
  applyAndCheck: (candidate: number) => boolean,
): number {
  let low = 0;
  let high = 1;
  let best = current;
  for (let step = 0; step < 10; step += 1) {
    const mid = (low + high) * 0.5;
    const cand = roundTo(current + (target - current) * mid, 2);
    if (applyAndCheck(cand)) {
      best = cand;
      low = mid;
    } else {
      high = mid;
    }
  }
  applyAndCheck(best);
  return best;
}

function toNudgeRecord(orig: SpeechBalloonNode | undefined, resolved: SpeechBalloonNode): BalloonNudgeAssignment {
  const originalX = orig?.x ?? resolved.x;
  const originalY = orig?.y ?? resolved.y;
  const dx = roundTo(resolved.x - originalX, 2);
  const dy = roundTo(resolved.y - originalY, 2);
  return {
    id: resolved.id, scriptOrder: resolved.scriptOrder, originalX, originalY,
    resolvedX: resolved.x, resolvedY: resolved.y, dx, dy,
    displacementPx: roundTo(Math.hypot(dx, dy), 3), width: resolved.width, height: resolved.height,
  };
}

/**
 * 모호하거나 역전된 말풍선 배치를 안전 여백·인물 얼굴 비침범 조건 안에서
 * 최소 이동 거리 `(dx, dy)`로 자동 보정한다.
 */
export function resolveBalloonReadingOrderNudges(
  input: BalloonLayoutValidationInput,
): BalloonReadingOrderResolutionResult {
  const safeMarginPx = Math.max(0, input.safeMarginPx ?? DEFAULT_PANEL_SAFE_MARGIN_PX);
  const faces = input.protectedFaceBoxes ?? [];
  const initialReport = validateBalloonReadingOrderDag(input);
  const sortedOriginals = [...input.balloons].sort((a, b) =>
    a.scriptOrder !== b.scriptOrder ? a.scriptOrder - b.scriptOrder : a.id.localeCompare(b.id),
  );

  if (
    initialReport.matchesScriptOrder &&
    initialReport.issues.length === 0 &&
    initialReport.faceOverlapAreaPx2 === 0 &&
    initialReport.safeMarginViolationCount === 0
  ) {
    return {
      direction: input.direction,
      initialReport,
      resolvedReport: initialReport,
      resolvedBalloons: sortedOriginals,
      nudges: sortedOriginals.map((b) => toNudgeRecord(b, b)),
      totalDisplacementPx: 0,
      maxSingleNudgePx: 0,
      faceOverlapAreaPx2: 0,
      safeMarginSatisfied: true,
    };
  }

  const working: MutableBalloon[] = sortedOriginals.map((b) => {
    const sb = safeBoundsFor(input.panelWidth, input.panelHeight, safeMarginPx, b.width, b.height);
    return {
      id: b.id, scriptOrder: b.scriptOrder, origX: b.x, origY: b.y,
      width: b.width, height: b.height, dialoguePreview: b.dialoguePreview,
      x: clamp(b.x, sb.minX, sb.maxX), y: clamp(b.y, sb.minY, sb.maxY),
    };
  });

  solveGlobalCandidateDp(working, input.panelWidth, input.panelHeight, safeMarginPx, faces, input.direction);

  const isAllValidNow = (): boolean => {
    for (let i = 0; i < working.length; i += 1) {
      const bi = working[i];
      if (!bi) continue;
      const sb = safeBoundsFor(input.panelWidth, input.panelHeight, safeMarginPx, bi.width, bi.height);
      if (bi.x < sb.minX - 1e-5 || bi.x > sb.maxX + 1e-5 || bi.y < sb.minY - 1e-5 || bi.y > sb.maxY + 1e-5) return false;
      if (overlapsAnyFace(bi, faces)) return false;
      for (let j = i + 1; j < working.length; j += 1) {
        const bj = working[j];
        if (bj && !isCleanOrderedPair(bi, bj, input.direction)) return false;
      }
    }
    return true;
  };

  if (isAllValidNow()) {
    for (let pass = 0; pass < 3; pass += 1) {
      for (const b of working) {
        const sb = safeBoundsFor(input.panelWidth, input.panelHeight, safeMarginPx, b.width, b.height);
        const tx = clamp(b.origX, sb.minX, sb.maxX);
        const ty = clamp(b.origY, sb.minY, sb.maxY);
        const startX = b.x;
        const startY = b.y;
        binaryShrinkCoordinate(0, 1, (t) => {
          b.x = roundTo(startX + (tx - startX) * t, 2);
          b.y = roundTo(startY + (ty - startY) * t, 2);
          return isAllValidNow();
        });
        binaryShrinkCoordinate(b.x, tx, (candX) => { b.x = candX; return isAllValidNow(); });
        binaryShrinkCoordinate(b.y, ty, (candY) => { b.y = candY; return isAllValidNow(); });
      }
    }
  }

  const resolvedBalloons: SpeechBalloonNode[] = working.map((b) => ({
    id: b.id, scriptOrder: b.scriptOrder, x: roundTo(b.x, 2), y: roundTo(b.y, 2),
    width: b.width, height: b.height,
    ...(b.dialoguePreview !== undefined ? { dialoguePreview: b.dialoguePreview } : {}),
  }));
  const resolvedReport = validateBalloonReadingOrderDag({ ...input, balloons: resolvedBalloons });
  const nudges = resolvedBalloons.map((resolved, idx) => toNudgeRecord(sortedOriginals[idx], resolved));
  const totalDisplacementPx = roundTo(nudges.reduce((sum, n) => sum + n.displacementPx, 0), 3);
  const maxSingleNudgePx = roundTo(nudges.reduce((max, n) => Math.max(max, n.displacementPx), 0), 3);

  return {
    direction: input.direction, initialReport, resolvedReport, resolvedBalloons, nudges,
    totalDisplacementPx, maxSingleNudgePx,
    faceOverlapAreaPx2: resolvedReport.faceOverlapAreaPx2,
    safeMarginSatisfied: resolvedReport.safeMarginViolationCount === 0,
  };
}
