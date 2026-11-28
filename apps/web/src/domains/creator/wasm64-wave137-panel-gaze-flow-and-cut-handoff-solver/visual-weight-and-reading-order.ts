/**
 * Wave 137 — 컷 내부 요소 정규화, 시각적 무게중심(Visual Weight / Center of Visual Mass),
 * 3종 읽기 방향 결정론적 시각 읽기 순서 추정, 말풍선 역독 및 2D 시선 경로 교차 탐지 모듈.
 */

import {
  DEFAULT_ELEMENT_CONTRAST,
  DEFAULT_ROW_BAND_TOLERANCE_Y,
  ELEMENT_VISUAL_WEIGHT_MULTIPLIER,
  GAZE_ELEMENT_LABELS_KO,
  type GazeElementKind,
  type GazePanelElementInput,
  type GazePanelInput,
  type GazePathIntersection,
  type GazePathNode,
  type GazePoint2D,
  type GazeReadingDirection,
  type GazeVector2D,
  type NormalizedGazeElement,
  type NormalizedGazePanel,
  type ReadingOrderReversalPair,
  type VisualMassSummary,
  type VisualReadingOrderEntry,
  type VisualWeightBreakdown,
} from "./gaze-flow-types";

const EPSILON = 1e-9;

export interface RectBox2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function sanitizeFinite(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const clamped = Math.max(min, Math.min(max, value));
  return Object.is(clamped, -0) ? 0 : clamped;
}

export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeVector2D(vec: GazeVector2D | undefined | null): GazeVector2D | null {
  if (!vec) return null;
  if (!Number.isFinite(vec.dx) || !Number.isFinite(vec.dy)) return null;
  const len = Math.hypot(vec.dx, vec.dy);
  if (len <= EPSILON) return null;
  return {
    dx: round4(vec.dx / len),
    dy: round4(vec.dy / len),
  };
}

/**
 * 컷 내부 요소를 유한 범위 `[0, 1]` 정규화 좌표와 결정론적 기본값으로 정규화한다.
 */
export function normalizeGazeElement(
  input: GazePanelElementInput,
  fallbackIndex: number,
): NormalizedGazeElement {
  const kind: GazeElementKind = input.kind;
  const elementId =
    input.elementId.trim().length > 0 ? input.elementId.trim() : `el-${fallbackIndex + 1}`;
  const labelKo =
    input.labelKo && input.labelKo.trim().length > 0
      ? input.labelKo.trim()
      : `${GAZE_ELEMENT_LABELS_KO[kind]} ${fallbackIndex + 1}`;

  const width = sanitizeFinite(input.width, 0.2, 0.01, 1);
  const height = sanitizeFinite(input.height, 0.14, 0.01, 1);
  const x = sanitizeFinite(input.x, 0.1, 0, Math.max(0, 1 - width));
  const y = sanitizeFinite(input.y, 0.1, 0, Math.max(0, 1 - height));
  const contrast = sanitizeFinite(input.contrast, DEFAULT_ELEMENT_CONTRAST[kind], 0.05, 1);
  const prominence = sanitizeFinite(input.prominence, 1, 0.5, 2);
  const scriptOrder =
    typeof input.scriptOrder === "number" && Number.isFinite(input.scriptOrder)
      ? Math.round(input.scriptOrder)
      : null;
  const gazeDir = normalizeVector2D(input.gazeDir);
  const locked = Boolean(input.locked);

  return {
    elementId,
    kind,
    labelKo,
    x: round4(x),
    y: round4(y),
    width: round4(width),
    height: round4(height),
    cx: round4(x + width / 2),
    cy: round4(y + height / 2),
    contrast: round4(contrast),
    scriptOrder,
    gazeDir,
    prominence: round4(prominence),
    locked,
  };
}

/**
 * 컷 단위 입력을 정규화하고 고유 ID 중복이 있으면 결정론적으로 보정한다.
 */
export function normalizeGazePanel(
  input: GazePanelInput,
  fallbackIndex: number,
): NormalizedGazePanel {
  const panelId =
    input.panelId.trim().length > 0 ? input.panelId.trim() : `panel-${fallbackIndex + 1}`;
  const titleKo =
    input.titleKo && input.titleKo.trim().length > 0
      ? input.titleKo.trim()
      : `컷 ${fallbackIndex + 1}`;
  const widthPx = Math.round(sanitizeFinite(input.widthPx, 800, 120, 12000));
  const heightPx = Math.round(sanitizeFinite(input.heightPx, 1100, 120, 24000));
  const gutterAfterPx = Math.round(sanitizeFinite(input.gutterAfterPx, 120, 0, 4000));
  const pageRow =
    typeof input.pageRow === "number" && Number.isFinite(input.pageRow)
      ? Math.round(input.pageRow)
      : null;
  const pageCol =
    typeof input.pageCol === "number" && Number.isFinite(input.pageCol)
      ? Math.round(input.pageCol)
      : null;

  const seenIds = new Set<string>();
  const elements: NormalizedGazeElement[] = [];
  for (let i = 0; i < input.elements.length; i += 1) {
    const raw = input.elements[i];
    if (!raw) continue;
    const normalized = normalizeGazeElement(raw, i);
    let uniqueId = normalized.elementId;
    let suffix = 2;
    while (seenIds.has(uniqueId)) {
      uniqueId = `${normalized.elementId}-${suffix}`;
      suffix += 1;
    }
    seenIds.add(uniqueId);
    elements.push(uniqueId === normalized.elementId ? normalized : { ...normalized, elementId: uniqueId });
  }

  return {
    panelId,
    titleKo,
    widthPx,
    heightPx,
    aspectRatio: round4(widthPx / heightPx),
    gutterAfterPx,
    pageRow,
    pageCol,
    elements,
  };
}

/**
 * 단일 요소의 시각적 무게(`면적 × 대비 × 유형 가중치 × 강조 배수`)를 계산한다.
 */
export function computeVisualWeight(
  element: NormalizedGazeElement | GazePanelElementInput,
): VisualWeightBreakdown {
  const normalized =
    "cx" in element ? element : normalizeGazeElement(element, 0);
  const areaNorm = normalized.width * normalized.height;
  const kindWeight = ELEMENT_VISUAL_WEIGHT_MULTIPLIER[normalized.kind];
  const weight = areaNorm * normalized.contrast * kindWeight * normalized.prominence;

  return {
    elementId: normalized.elementId,
    kind: normalized.kind,
    areaNorm: round4(areaNorm),
    contrast: normalized.contrast,
    kindWeight,
    prominence: normalized.prominence,
    weight: round4(weight),
    normalizedShare: 0,
  };
}

/**
 * 컷 전체 요소들의 시각적 무게중심(Center of Visual Mass)과
 * 좌우 균형 편향 및 균형 점수(0~100)를 계산한다.
 */
export function computePanelVisualMass(
  elements: readonly NormalizedGazeElement[],
): VisualMassSummary {
  if (elements.length === 0) {
    return {
      totalWeight: 0,
      centerOfVisualMass: { x: 0.5, y: 0.5 },
      horizontalBias: 0,
      verticalBias: 0,
      leftWeightRatio: 0.5,
      rightWeightRatio: 0.5,
      visualBalanceScore: 100,
      elementWeights: [],
    };
  }

  const rawBreakdowns: VisualWeightBreakdown[] = [];
  let totalWeight = 0;
  let weightedX = 0;
  let weightedY = 0;
  let leftWeight = 0;
  let rightWeight = 0;

  for (let i = 0; i < elements.length; i += 1) {
    const el = elements[i];
    if (!el) continue;
    const areaNorm = el.width * el.height;
    const kindWeight = ELEMENT_VISUAL_WEIGHT_MULTIPLIER[el.kind];
    const exactWeight = areaNorm * el.contrast * kindWeight * el.prominence;

    totalWeight += exactWeight;
    weightedX += exactWeight * el.cx;
    weightedY += exactWeight * el.cy;

    // 중앙선(x = 0.5)에 걸친 요소는 좌·우 점유 면적 비율로 무게를 정확히 분할한다.
    const xLeft = el.x;
    const xRight = el.x + el.width;
    let leftFraction = 0.5;
    if (xRight <= 0.5) {
      leftFraction = 1;
    } else if (xLeft >= 0.5) {
      leftFraction = 0;
    } else if (el.width > EPSILON) {
      leftFraction = (0.5 - xLeft) / el.width;
    }
    leftWeight += exactWeight * leftFraction;
    rightWeight += exactWeight * (1 - leftFraction);

    rawBreakdowns.push({
      elementId: el.elementId,
      kind: el.kind,
      areaNorm: round4(areaNorm),
      contrast: el.contrast,
      kindWeight,
      prominence: el.prominence,
      weight: round4(exactWeight),
      normalizedShare: 0,
    });
  }

  if (totalWeight <= EPSILON) {
    return {
      totalWeight: 0,
      centerOfVisualMass: { x: 0.5, y: 0.5 },
      horizontalBias: 0,
      verticalBias: 0,
      leftWeightRatio: 0.5,
      rightWeightRatio: 0.5,
      visualBalanceScore: 100,
      elementWeights: rawBreakdowns,
    };
  }

  const comX = weightedX / totalWeight;
  const comY = weightedY / totalWeight;
  const horizontalBias = (comX - 0.5) * 2;
  const verticalBias = (comY - 0.5) * 2;
  const leftWeightRatio = leftWeight / totalWeight;
  const rightWeightRatio = rightWeight / totalWeight;

  const torqueImbalance = Math.min(1, Math.abs(horizontalBias));
  const splitImbalance = Math.abs(leftWeightRatio - rightWeightRatio);
  const combinedImbalance = torqueImbalance * 0.75 + splitImbalance * 0.25;
  const visualBalanceScore = round2(Math.max(0, Math.min(100, 100 * (1 - combinedImbalance))));

  const elementWeights: VisualWeightBreakdown[] = rawBreakdowns.map((item) => ({
    ...item,
    normalizedShare: round4(item.weight / totalWeight),
  }));

  return {
    totalWeight: round4(totalWeight),
    centerOfVisualMass: { x: round4(comX), y: round4(comY) },
    horizontalBias: round4(horizontalBias),
    verticalBias: round4(verticalBias),
    leftWeightRatio: round4(leftWeightRatio),
    rightWeightRatio: round4(rightWeightRatio),
    visualBalanceScore,
    elementWeights,
  };
}

function horizontalReadingKey(cx: number, readingDirection: GazeReadingDirection): number {
  return readingDirection === "manga-rtl" ? -cx : cx;
}

/**
 * 읽기 방향(`vertical-webtoon-ltr`, `page-comic-ltr`, `manga-rtl`)에 따라
 * 2-패스 행 밴드 스위프(전순서 보장)로 물리적 시각 읽기 순서를 결정론적으로 추정한다.
 */
export function estimateVisualReadingOrder(
  elements: readonly NormalizedGazeElement[],
  readingDirection: GazeReadingDirection,
  rowBandToleranceY?: number,
): readonly VisualReadingOrderEntry[] {
  if (elements.length === 0) return [];

  const tolY = sanitizeFinite(
    rowBandToleranceY,
    DEFAULT_ROW_BAND_TOLERANCE_Y[readingDirection],
    0.01,
    0.35,
  );

  const enriched = elements.map((el) => ({
    element: el,
    weight: computeVisualWeight(el).weight,
    hKey: horizontalReadingKey(el.cx, readingDirection),
  }));

  // 1단계: 입력 배열 순서와 무관하도록 완전한 전순서(cy -> hKey -> weight desc -> elementId)로 정렬
  enriched.sort((a, b) => {
    if (a.element.cy !== b.element.cy) return a.element.cy - b.element.cy;
    if (a.hKey !== b.hKey) return a.hKey - b.hKey;
    if (a.weight !== b.weight) return b.weight - a.weight;
    return a.element.elementId.localeCompare(b.element.elementId);
  });

  // 2단계: 밴드 최상단 기준점(bandAnchorY)으로 연쇄 드리프트 없는 행 밴드 분할
  const bands: Array<typeof enriched> = [];
  for (let i = 0; i < enriched.length; i += 1) {
    const item = enriched[i];
    if (!item) continue;
    const currentBand = bands[bands.length - 1];
    if (!currentBand || currentBand.length === 0) {
      bands.push([item]);
      continue;
    }
    const anchor = currentBand[0];
    if (anchor && item.element.cy - anchor.element.cy <= tolY + EPSILON) {
      currentBand.push(item);
    } else {
      bands.push([item]);
    }
  }

  // 3단계: 각 행 밴드 내부를 읽기 방향 수평 순서(LTR 좌→우, RTL 우→좌)로 정렬
  const ordered: VisualReadingOrderEntry[] = [];
  let rank = 0;
  for (let bandIdx = 0; bandIdx < bands.length; bandIdx += 1) {
    const band = bands[bandIdx];
    if (!band) continue;
    band.sort((a, b) => {
      if (Math.abs(a.hKey - b.hKey) > 0.012) return a.hKey - b.hKey;
      if (a.element.cy !== b.element.cy) return a.element.cy - b.element.cy;
      if (a.weight !== b.weight) return b.weight - a.weight;
      return a.element.elementId.localeCompare(b.element.elementId);
    });
    for (let j = 0; j < band.length; j += 1) {
      const item = band[j];
      if (!item) continue;
      ordered.push({
        elementId: item.element.elementId,
        kind: item.element.kind,
        visualRank: rank,
        rowBandIndex: bandIdx,
        scriptOrder: item.element.scriptOrder,
        center: { x: item.element.cx, y: item.element.cy },
      });
      rank += 1;
    }
  }

  return ordered;
}

/**
 * 시각 읽기 순서와 작가 의도 대본 순서(`scriptOrder`)를 비교해 말풍선 역독 쌍을 탐지한다.
 */
export function detectBalloonReadingOrderReversals(
  visualReadingOrder: readonly VisualReadingOrderEntry[],
): readonly ReadingOrderReversalPair[] {
  const scriptedBalloons = visualReadingOrder.filter(
    (entry) => entry.kind === "dialogue-balloon" && entry.scriptOrder !== null,
  );
  if (scriptedBalloons.length < 2) return [];

  const reversals: ReadingOrderReversalPair[] = [];
  for (let i = 0; i < scriptedBalloons.length; i += 1) {
    const earlier = scriptedBalloons[i];
    if (!earlier || earlier.scriptOrder === null) continue;
    for (let j = i + 1; j < scriptedBalloons.length; j += 1) {
      const later = scriptedBalloons[j];
      if (!later || later.scriptOrder === null) continue;
      if (earlier.scriptOrder > later.scriptOrder) {
        reversals.push({
          earlierVisualId: earlier.elementId,
          laterVisualId: later.elementId,
          earlierScriptOrder: earlier.scriptOrder,
          laterScriptOrder: later.scriptOrder,
          earlierVisualRank: earlier.visualRank,
          laterVisualRank: later.visualRank,
        });
      }
    }
  }
  return reversals;
}

/**
 * 시각 읽기 순서를 기반으로 대본 순서(`scriptOrder`)가 지정된 말풍선/요소의
 * 서사적 시선 궤적(Gaze Path)을 구성한다.
 *
 * - 역독이 없으면 물리적 시각 읽기 순서와 100% 일치한다.
 * - 역독이나 엇갈린 발화 배치가 있으면 독자가 대본을 따라 되짚을 때 발생하는
 *   실제 시선 교차·역주행 궤적을 드러낸다.
 */
export function buildPanelGazePath(
  elements: readonly NormalizedGazeElement[],
  visualReadingOrder: readonly VisualReadingOrderEntry[],
): readonly GazePathNode[] {
  if (visualReadingOrder.length === 0) return [];

  const elementById = new Map<string, NormalizedGazeElement>();
  for (let i = 0; i < elements.length; i += 1) {
    const el = elements[i];
    if (el) elementById.set(el.elementId, el);
  }

  const scriptedSlotIndices: number[] = [];
  const scriptedEntries: VisualReadingOrderEntry[] = [];
  for (let i = 0; i < visualReadingOrder.length; i += 1) {
    const entry = visualReadingOrder[i];
    if (entry && entry.scriptOrder !== null) {
      scriptedSlotIndices.push(i);
      scriptedEntries.push(entry);
    }
  }

  scriptedEntries.sort((a, b) => {
    const ao = a.scriptOrder ?? 0;
    const bo = b.scriptOrder ?? 0;
    if (ao !== bo) return ao - bo;
    if (a.visualRank !== b.visualRank) return a.visualRank - b.visualRank;
    return a.elementId.localeCompare(b.elementId);
  });

  const merged: VisualReadingOrderEntry[] = visualReadingOrder.slice();
  for (let k = 0; k < scriptedSlotIndices.length; k += 1) {
    const slotIdx = scriptedSlotIndices[k];
    const entry = scriptedEntries[k];
    if (slotIdx !== undefined && entry) {
      merged[slotIdx] = entry;
    }
  }

  const path: GazePathNode[] = [];
  for (let stepIndex = 0; stepIndex < merged.length; stepIndex += 1) {
    const entry = merged[stepIndex];
    if (!entry) continue;
    const el = elementById.get(entry.elementId);
    path.push({
      stepIndex,
      elementId: entry.elementId,
      kind: entry.kind,
      labelKo: el ? el.labelKo : entry.elementId,
      center: entry.center,
      visualRank: entry.visualRank,
      scriptOrder: entry.scriptOrder,
    });
  }
  return path;
}

/**
 * 2D 선분 `(a1→a2)`와 `(b1→b2)`의 정확한 교차점(정교차 및 공선 중첩 포함)을 판정한다.
 */
export function findSegmentIntersection2D(
  a1: GazePoint2D,
  a2: GazePoint2D,
  b1: GazePoint2D,
  b2: GazePoint2D,
): GazePoint2D | null {
  const rx = a2.x - a1.x;
  const ry = a2.y - a1.y;
  const sx = b2.x - b1.x;
  const sy = b2.y - b1.y;

  const rxs = rx * sy - ry * sx;
  const qpx = b1.x - a1.x;
  const qpy = b1.y - a1.y;
  const qpxr = qpx * ry - qpy * rx;

  if (Math.abs(rxs) > EPSILON) {
    const t = (qpx * sy - qpy * sx) / rxs;
    const u = qpxr / rxs;
    if (t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) {
      const clampedT = Math.max(0, Math.min(1, t));
      return {
        x: round4(a1.x + clampedT * rx),
        y: round4(a1.y + clampedT * ry),
      };
    }
    return null;
  }

  // 평행하면서 공선(collinear)인 경우 구간 중첩 여부 확인
  if (Math.abs(qpxr) <= EPSILON) {
    const rLenSq = rx * rx + ry * ry;
    if (rLenSq <= EPSILON) return null;
    const t0 = ((b1.x - a1.x) * rx + (b1.y - a1.y) * ry) / rLenSq;
    const t1 = ((b2.x - a1.x) * rx + (b2.y - a1.y) * ry) / rLenSq;
    const lo = Math.max(0, Math.min(t0, t1));
    const hi = Math.min(1, Math.max(t0, t1));
    if (hi >= lo - EPSILON) {
      const mid = Math.max(0, Math.min(1, (lo + hi) / 2));
      return {
        x: round4(a1.x + mid * rx),
        y: round4(a1.y + mid * ry),
      };
    }
  }

  return null;
}

/**
 * 시선 궤적 폴리라인에서 인접하지 않은 선분 쌍의 2D 교차(시선 엉킴)를 모두 탐지한다.
 */
export function detectGazePathIntersections(
  gazePath: readonly GazePathNode[],
): readonly GazePathIntersection[] {
  if (gazePath.length < 4) return [];

  const intersections: GazePathIntersection[] = [];
  const segCount = gazePath.length - 1;
  for (let i = 0; i < segCount; i += 1) {
    const a1 = gazePath[i];
    const a2 = gazePath[i + 1];
    if (!a1 || !a2) continue;
    for (let j = i + 2; j < segCount; j += 1) {
      const b1 = gazePath[j];
      const b2 = gazePath[j + 1];
      if (!b1 || !b2) continue;
      const point = findSegmentIntersection2D(a1.center, a2.center, b1.center, b2.center);
      if (point) {
        intersections.push({
          firstSegmentIndex: i,
          secondSegmentIndex: j,
          firstEdgeElementIds: [a1.elementId, a2.elementId],
          secondEdgeElementIds: [b1.elementId, b2.elementId],
          point,
        });
      }
    }
  }
  return intersections;
}

/**
 * 두 사각형이 `gap` 여유 간격을 포함해 겹치는지 판정한다.
 */
export function rectsOverlapWithGap(a: RectBox2D, b: RectBox2D, gap: number): boolean {
  const safeGap = Math.max(0, gap);
  return (
    a.x < b.x + b.width + safeGap - EPSILON &&
    a.x + a.width + safeGap > b.x + EPSILON &&
    a.y < b.y + b.height + safeGap - EPSILON &&
    a.y + a.height + safeGap > b.y + EPSILON
  );
}

/**
 * 두 사각형의 교집합 면적을 계산한다.
 */
export function computeRectOverlapArea(a: RectBox2D, b: RectBox2D): number {
  const ox = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return ox * oy;
}
