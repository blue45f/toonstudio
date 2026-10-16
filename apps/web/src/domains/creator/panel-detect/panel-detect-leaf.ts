/**
 * 잎 영역 판정 — 행/열 투영으로 더 나눌 수 없게 된 영역을 컷으로 받을지 가린다.
 *
 * 결과는 셋 중 하나다.
 * - panel: 컷으로 채택. 겹침 의심이면 경고를 붙인다(컷은 유지).
 * - ignored: 너무 작거나 내용이 거의 없는 조각. 사용자가 직접 컷으로 채택할 수 있게 목록으로 남긴다.
 * - undetectable: 서로 이어지지 않은 큰 덩어리가 둘 이상이고 그 경계 상자가 가로·세로 모두 겹친다.
 *   여백이 축에 평행하지 않거나(사선·기울어진 컷) 컷이 서로 겹친 경우라 자동으로 나눌 수 없다. 컷을 지어내지 않는다.
 *   컷 테두리 같은 얇은 고리는 큰 덩어리로 세지 않는다(테두리 속에 떠 있는 인물을 겹침으로 오인하지 않는다).
 *
 * 컷으로 받은 영역 안에 서로 이어지지 않은 컷 후보가 둘 이상 남아 있으면(여백이 최소 두께보다 얇거나 스캔이 기운 경우)
 * 여러 컷이 합쳐졌을 수 있다고 경고한다. 컷을 쪼개서 지어내지는 않는다.
 */

import { labelInkComponents, type InkComponent } from "./panel-detect-components";
import { componentBoxArea, createSeparatorClassifier, hasSeparatePanelCandidates, isFrameLikeComponent } from "./panel-detect-frames";
import {
  colInkCounts,
  gutterRuns,
  regionHeight,
  regionInkTotal,
  regionWidth,
  rowInkCounts,
  type PanelRegion,
} from "./panel-detect-profile";

import type { PanelDetectBudget } from "./panel-detect-runtime";
import type { InkMask } from "./panel-detect-raster";
import type { IgnoredFragmentReason, PanelWarningCode } from "./panel-detect-types";

export interface LeafContext {
  readonly mask: InkMask;
  readonly minGap: number;
  readonly minSide: number;
  readonly minArea: number;
  /** 이 면적 이상인 잎만 연결 요소 검사를 한다(분석 픽셀). */
  readonly componentCheckMinArea: number;
  readonly budget: PanelDetectBudget;
}

/** 컷 안에서 여백이 얇은 장애물에 막혔다고 의심되는 자리. at 은 분석 좌표(절대). */
export interface BridgeSuggestion {
  readonly axis: "rows" | "cols";
  readonly at: number;
}

export type LeafVerdict =
  | {
      readonly kind: "panel";
      readonly ink: number;
      readonly density: number;
      readonly warnings: readonly PanelWarningCode[];
      readonly bridges: readonly BridgeSuggestion[];
    }
  | { readonly kind: "ignored"; readonly reason: IgnoredFragmentReason }
  | { readonly kind: "undetectable"; readonly componentCount: number };

/** 내용 밀도가 이 값 미만이면 컷이 아니라 티끌로 본다. */
const MIN_CONTENT_DENSITY = 0.0015;
/** 덩어리가 "크다"고 보는 기준: 경계 상자가 잎 면적의 20% 이상, 내용 픽셀이 2% 이상. */
const LARGE_BBOX_SHARE = 0.2;
const LARGE_INK_SHARE = 0.02;
/** 두 큰 덩어리의 경계 상자가 서로 겹친 정도(작은 쪽 변 대비)가 이 값 이상이면 축 분리가 불가능한 배치로 본다. */
const OVERLAP_SHARE = 0.15;
/** 겹침 의심 검사 대상: 이미지 면적의 6% 이상인 컷. */
const INNER_EDGE_MIN_AREA_SHARE = 0.06;
/** 여백 가로막힘 검사: 줄이 "거의 비었다"고 보는 내용 비율 상한. 말풍선 테두리·효과음 글자 정도는 이 안에 든다. */
const BRIDGE_ROW_SHARE = 0.35;
/** 막고 있는 장애물이 차지하는 폭(줄 길이 대비) 상한. 이보다 넓으면 여백이 아니라 그림의 빈 부분으로 본다. */
const BRIDGE_SPREAD_SHARE = 0.4;
/**
 * 비어 있는 구간 바로 위·아래(각 3줄 중 가장 빽빽한 줄)가 채워야 하는 비율. 두 컷의 테두리·그림이 맞닿아 있다는 뜻이다.
 * 말풍선이 테두리 일부를 덮어도 통과하도록 50% 로 둔다.
 */
const BRIDGE_NEIGHBOR_SHARE = 0.5;
const BRIDGE_NEIGHBOR_ROWS = 3;
const BRIDGE_MAX_PER_AXIS = 4;

function overlapsOnBothAxes(a: InkComponent, b: InkComponent): boolean {
  const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (overlapX <= 0 || overlapY <= 0) return false;
  const smallerWidth = Math.min(a.x1 - a.x0, b.x1 - b.x0);
  const smallerHeight = Math.min(a.y1 - a.y0, b.y1 - b.y0);
  return overlapX >= OVERLAP_SHARE * smallerWidth && overlapY >= OVERLAP_SHARE * smallerHeight;
}

export function largeOverlappingComponents(
  components: readonly InkComponent[],
  area: number,
): InkComponent[] {
  const large = components.filter(
    (component) => componentBoxArea(component) >= LARGE_BBOX_SHARE * area
      && component.area >= LARGE_INK_SHARE * area
      && !isFrameLikeComponent(component),
  );
  for (let i = 0; i < large.length; i += 1) {
    for (let j = i + 1; j < large.length; j += 1) {
      if (overlapsOnBothAxes(large[i], large[j])) return large;
    }
  }
  return [];
}

/**
 * 중앙부(바깥 12% 제외)에 가장자리 테두리와 무관한 "얇고 긴 선"이 있는지.
 * 선 = 줄 길이의 85% 이상이 내용이고, 두께가 maxThickness 이하이며, 두 칸 바깥 줄은 60% 미만인 연속 줄.
 * 빽빽한 전면 삽화는 이웃 줄도 모두 높아 선으로 보지 않는다.
 */
function hasThinLine(counts: Int32Array, crossLength: number, maxThickness: number): boolean {
  const high = crossLength * 0.85;
  const low = crossLength * 0.6;
  const from = Math.floor(counts.length * 0.12);
  const to = Math.ceil(counts.length * 0.88);
  let i = from;
  while (i < to) {
    if (counts[i] < high) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < to && counts[j] >= high) j += 1;
    const before = i - 2 >= 0 ? counts[i - 2] : 0;
    const after = j + 1 < counts.length ? counts[j + 1] : 0;
    if (j - i <= maxThickness && before < low && after < low) return true;
    i = j;
  }
  return false;
}

export function innerEdgesSuspected(mask: InkMask, region: PanelRegion, minGap: number): boolean {
  const maxThickness = Math.max(6, minGap * 2);
  return hasThinLine(rowInkCounts(mask, region), regionWidth(region), maxThickness)
    || hasThinLine(colInkCounts(mask, region), regionHeight(region), maxThickness);
}

/** from 부터 direction 방향으로 최대 BRIDGE_NEIGHBOR_ROWS 줄 중 내용이 가장 많은 줄의 값. */
function densestNear(counts: Int32Array, from: number, direction: 1 | -1): number {
  let best = 0;
  for (let k = 0; k < BRIDGE_NEIGHBOR_ROWS; k += 1) {
    const index = from + direction * k;
    if (index < 0 || index >= counts.length) break;
    best = Math.max(best, counts[index]);
  }
  return best;
}

function bridgedGuttersAlong(
  mask: InkMask,
  region: PanelRegion,
  axis: "rows" | "cols",
  minGap: number,
): BridgeSuggestion[] {
  const counts = axis === "rows" ? rowInkCounts(mask, region) : colInkCounts(mask, region);
  const cross = axis === "rows" ? regionWidth(region) : regionHeight(region);
  const origin = axis === "rows" ? region.y0 : region.x0;
  const found: BridgeSuggestion[] = [];
  const classify = createSeparatorClassifier(mask, region, axis, minGap);
  for (const run of gutterRuns(counts, Math.floor(cross * BRIDGE_ROW_SHARE))) {
    if (found.length >= BRIDGE_MAX_PER_AXIS) break;
    if (run.start < 2 || run.end > counts.length - 2 || run.end - run.start < minGap) continue;
    if (
      densestNear(counts, run.start - 1, -1) < cross * BRIDGE_NEIGHBOR_SHARE
      || densestNear(counts, run.end, 1) < cross * BRIDGE_NEIGHBOR_SHARE
    ) continue;
    // 양끝이 끊김 없는 선으로 막힌 빈 줄은 컷 사이 여백이 아니라 테두리 안쪽이다(성긴 그림이 든 컷).
    if (classify(run) === "enclosed") continue;
    const touched = new Uint8Array(cross);
    for (let i = run.start; i < run.end; i += 1) {
      for (let k = 0; k < cross; k += 1) {
        const value = axis === "rows"
          ? mask.data[(region.y0 + i) * mask.width + region.x0 + k]
          : mask.data[(region.y0 + k) * mask.width + region.x0 + i];
        if (value === 1) touched[k] = 1;
      }
    }
    let spread = 0;
    for (let k = 0; k < cross; k += 1) spread += touched[k];
    if (spread > cross * BRIDGE_SPREAD_SHARE) continue;
    found.push({ axis, at: origin + Math.floor((run.start + run.end) / 2) });
  }
  return found;
}

/**
 * 더 나뉘지 않은 컷 안에서, 두 컷 사이 여백이었을 법한 자리를 찾는다.
 * 조건: 내용이 35% 이하인 줄이 최소 여백 두께 이상 이어지고, 그 위·아래 줄은 70% 이상 빽빽하며,
 * 그 구간의 내용이 폭의 40% 이하에 몰려 있다(말풍선·효과음처럼 여백을 가로질러 놓인 물체).
 * 흰 하늘처럼 폭 전체에 걸친 큰 빈 면은 몰림 조건에서 걸러진다.
 */
export function findBridgedGutters(mask: InkMask, region: PanelRegion, minGap: number): BridgeSuggestion[] {
  return [
    ...bridgedGuttersAlong(mask, region, "rows", minGap),
    ...bridgedGuttersAlong(mask, region, "cols", minGap),
  ];
}

export function* evaluateLeaf(
  context: LeafContext,
  region: PanelRegion,
  imageArea: number,
  inherited: readonly PanelWarningCode[],
): Generator<void, LeafVerdict, void> {
  const width = regionWidth(region);
  const height = regionHeight(region);
  const area = width * height;
  if (width < context.minSide || height < context.minSide || area < context.minArea) {
    return { kind: "ignored", reason: "too-small" };
  }
  const ink = regionInkTotal(context.mask, region);
  if (context.budget.consume(area)) yield;
  const density = ink / area;
  if (density < MIN_CONTENT_DENSITY) return { kind: "ignored", reason: "low-content" };

  let mergedSuspected = false;
  if (area >= context.componentCheckMinArea) {
    const components = labelInkComponents(context.mask, region);
    if (context.budget.consume(area * 3)) yield;
    if (components !== null) {
      const large = largeOverlappingComponents(components, area);
      if (large.length >= 2) return { kind: "undetectable", componentCount: large.length };
      mergedSuspected = hasSeparatePanelCandidates(components, area);
    }
  }

  const warnings = [...inherited];
  if (area >= INNER_EDGE_MIN_AREA_SHARE * imageArea && innerEdgesSuspected(context.mask, region, context.minGap)) {
    warnings.push("overlap-suspected");
  }
  if (context.budget.consume(area * 2)) yield;
  const bridges = Math.min(width, height) >= 4 * context.minGap
    ? findBridgedGutters(context.mask, region, context.minGap)
    : [];
  if (context.budget.consume(area * 2)) yield;
  if (bridges.length > 0) {
    warnings.push("bridged-gutter-suspected");
  } else if (mergedSuspected) {
    // 말풍선·효과음이 여백을 가로막은 경우는 위 경고(분할 제안 포함)가 더 구체적이라 겹쳐서 감점하지 않는다.
    warnings.push("merged-panels-suspected");
  }
  return { kind: "panel", ink, density, warnings, bridges };
}
