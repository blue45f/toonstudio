/**
 * 감지 결과 조립 — 분석 좌표의 잎·조각을 원본 좌표로 옮기고, 읽기 순서·신뢰도·경고를 붙인다.
 *
 * 분석 래스터가 원본보다 작을 때(step>1)는 정수 배율로 되돌린 뒤, 경계 주변 몇 픽셀만 원본 해상도로 다시 훑어
 * 내용의 정확한 경계에 맞춘다. 컷 사각형은 항상 원본 이미지 안에 있고 너비·높이는 1 이상이다.
 */

import { scoreOverallConfidence, scorePanelConfidence, type PanelSides } from "./panel-detect-confidence";
import type { BridgeSuggestion } from "./panel-detect-leaf";
import { sortPanelsByReadingOrder } from "./panel-detect-order";
import {
  PANEL_DETECT_INK_TOLERANCE,
  type ResolvedPanelDetectOptions,
} from "./panel-detect-runtime";
import { allowedInk, regionHeight, regionWidth, type PanelRegion } from "./panel-detect-profile";
import { createInkTest } from "./panel-detect-raster";
import {
  PANEL_DETECT_VERSION,
  type DetectedPanel,
  type GutterInfo,
  type IgnoredFragment,
  type IgnoredFragmentReason,
  type PanelDetectRaster,
  type PanelDetectResult,
  type PanelDetectWarningCode,
  type PanelRect,
  type PanelWarningCode,
  type SplitSuggestion,
  type UndetectableRegion,
} from "./panel-detect-types";

export interface LeafRecord {
  readonly region: PanelRegion;
  readonly sides: PanelSides;
  readonly density: number;
  readonly warnings: readonly PanelWarningCode[];
  readonly bridges: readonly BridgeSuggestion[];
}

export interface FragmentRecord {
  readonly region: PanelRegion;
  readonly reason: IgnoredFragmentReason;
}

export interface UndetectableRecord {
  readonly region: PanelRegion;
  readonly componentCount: number;
}

export interface AssembleInput {
  readonly raster: PanelDetectRaster;
  readonly options: ResolvedPanelDetectOptions;
  readonly gutter: GutterInfo;
  readonly step: number;
  readonly analysisWidth: number;
  readonly analysisHeight: number;
  readonly minGap: number;
  readonly leaves: readonly LeafRecord[];
  readonly ignored: readonly FragmentRecord[];
  readonly undetectable: readonly UndetectableRecord[];
  readonly blank: boolean;
}

function toSourceRect(region: PanelRegion, step: number, width: number, height: number): PanelRect {
  const x0 = Math.min(width - 1, region.x0 * step);
  const y0 = Math.min(height - 1, region.y0 * step);
  const x1 = Math.max(x0 + 1, Math.min(width, region.x1 * step));
  const y1 = Math.max(y0 + 1, Math.min(height, region.y1 * step));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** 원본 해상도에서 rect 둘레 step 픽셀 안의 실제 내용 경계를 찾는다. 못 찾으면 rect 그대로. */
function refineRectAtSource(
  raster: PanelDetectRaster,
  gutter: GutterInfo,
  rect: PanelRect,
  step: number,
): PanelRect {
  const { width, height, data } = raster;
  const isInk = createInkTest(gutter);
  const wx0 = Math.max(0, rect.x - step);
  const wx1 = Math.min(width, rect.x + rect.width + step);
  const wy0 = Math.max(0, rect.y - step);
  const wy1 = Math.min(height, rect.y + rect.height + step);
  const rowAllowed = allowedInk(wx1 - wx0, PANEL_DETECT_INK_TOLERANCE);
  const inkInRow = (y: number): number => {
    let count = 0;
    for (let x = wx0; x < wx1; x += 1) if (isInk(data, (y * width + x) * 4)) count += 1;
    return count;
  };
  let top = -1;
  for (let y = wy0; y < wy1; y += 1) {
    if (inkInRow(y) > rowAllowed) {
      top = y;
      break;
    }
  }
  if (top < 0) return rect;
  let bottom = top;
  for (let y = wy1 - 1; y >= top; y -= 1) {
    if (inkInRow(y) > rowAllowed) {
      bottom = y;
      break;
    }
  }
  const colAllowed = allowedInk(bottom - top + 1, PANEL_DETECT_INK_TOLERANCE);
  const inkInCol = (x: number): number => {
    let count = 0;
    for (let y = top; y <= bottom; y += 1) if (isInk(data, (y * width + x) * 4)) count += 1;
    return count;
  };
  let left = -1;
  for (let x = wx0; x < wx1; x += 1) {
    if (inkInCol(x) > colAllowed) {
      left = x;
      break;
    }
  }
  if (left < 0) return rect;
  let right = left;
  for (let x = wx1 - 1; x >= left; x -= 1) {
    if (inkInCol(x) > colAllowed) {
      right = x;
      break;
    }
  }
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function regionArea(region: PanelRegion): number {
  return regionWidth(region) * regionHeight(region);
}

function hasBleed(sides: PanelSides): boolean {
  return sides.top.kind === "bleed" || sides.bottom.kind === "bleed"
    || sides.left.kind === "bleed" || sides.right.kind === "bleed";
}

export function assemblePanelDetectResult(input: AssembleInput): PanelDetectResult {
  const { raster, options, gutter, step, leaves } = input;
  const { width, height } = raster;
  const imageArea = input.analysisWidth * input.analysisHeight;
  const source = (region: PanelRegion): PanelRect => {
    const rect = toSourceRect(region, step, width, height);
    return step > 1 ? refineRectAtSource(raster, gutter, rect, step) : rect;
  };

  const mapped = leaves.map((leaf) => ({ ...source(leaf.region), leaf }));
  const ordered = sortPanelsByReadingOrder(mapped, options.readingOrder);
  const panels: DetectedPanel[] = ordered.map((entry, index) => {
    const warnings: PanelWarningCode[] = [...entry.leaf.warnings];
    if (hasBleed(entry.leaf.sides)) warnings.push("touches-image-edge");
    const score = scorePanelConfidence({
      sides: entry.leaf.sides,
      area: regionArea(entry.leaf.region),
      imageArea,
      inkDensity: entry.leaf.density,
      minGap: input.minGap,
      warnings,
    });
    return {
      id: `panel-${index + 1}`,
      order: index + 1,
      x: entry.x,
      y: entry.y,
      width: entry.width,
      height: entry.height,
      confidence: score.confidence,
      level: score.level,
      warnings,
    };
  });

  const suggestions: SplitSuggestion[] = [];
  ordered.forEach((entry, index) => {
    for (const bridge of entry.leaf.bridges) {
      suggestions.push({
        id: `suggestion-${suggestions.length + 1}`,
        panelId: panels[index].id,
        orientation: bridge.axis === "rows" ? "horizontal" : "vertical",
        position: Math.min(bridge.axis === "rows" ? height - 1 : width - 1, bridge.at * step),
        reason: "bridged-gutter",
      });
    }
  });

  const byPosition = <T extends PanelRect>(a: T, b: T): number => a.y - b.y || a.x - b.x;
  const undetectable: UndetectableRegion[] = input.undetectable
    .map((record) => ({ ...toSourceRect(record.region, step, width, height), componentCount: record.componentCount }))
    .sort(byPosition)
    .map((record, index) => ({ id: `undetectable-${index + 1}`, reason: "non-separable", ...record }));
  const ignored: IgnoredFragment[] = input.ignored
    .map((record) => ({ ...toSourceRect(record.region, step, width, height), reason: record.reason }))
    .sort(byPosition)
    .map((record, index) => ({ id: `ignored-${index + 1}`, ...record }));

  const overall = scoreOverallConfidence({
    panelAreas: ordered.map((entry) => regionArea(entry.leaf.region)),
    panelConfidences: panels.map((panel) => panel.confidence),
    undetectableArea: input.undetectable.reduce((sum, record) => sum + regionArea(record.region), 0),
  });

  const warnings: PanelDetectWarningCode[] = [];
  if (input.blank) warnings.push("blank-image");
  if (gutter.kind === "none") warnings.push("no-gutter-found");
  if (step > 1) warnings.push("downsampled");
  if (!input.blank && panels.length === 0) warnings.push("no-panel-found");
  if (undetectable.length > 0) warnings.push("undetectable-regions");
  if (ignored.length > 0) warnings.push("ignored-fragments");
  if (panels.some((panel) => panel.warnings.includes("max-depth-reached"))) warnings.push("max-depth-reached");
  if (panels.length > 0 && overall.level === "low") warnings.push("low-overall-confidence");

  return {
    version: PANEL_DETECT_VERSION,
    width,
    height,
    analysis: { width: input.analysisWidth, height: input.analysisHeight, step },
    gutter,
    readingOrder: options.readingOrder,
    panels,
    undetectable,
    ignored,
    suggestions,
    confidence: overall.confidence,
    level: overall.level,
    warnings,
  };
}
