/**
 * 테두리(프레임) 인식 — 컷 테두리가 둘러싼 안쪽의 빈 칸을 "컷 사이 여백"으로 오인하지 않게 가르는 순수 판정.
 *
 * 행/열 투영만으로는 컷 사이 여백과 테두리 속 빈 줄을 가를 수 없다. 얇은 테두리는 안쪽 줄마다 양 끝의 한두 픽셀뿐이라
 * 내용 허용치(줄 길이의 1.2%) 이하의 잉크만 남기 때문이다. 둘의 차이는 여백 묶음의 "양끝이 열려 있는가"다.
 * - 컷 사이 여백: 영역의 양쪽 가장자리로 열려 있다. 그 자리를 가로지르는 것이 없다.
 * - 테두리 속 빈 칸: 양쪽 끝이 모두 끊김 없는 선(테두리)이나 꽉 찬 그림으로 막혀 있다.
 * - 한쪽만 막힌 칸: 다른 컷의 테두리 선이 한쪽 끝을 가로지르는 경우라 여백이 아니다(그 컷이 이 자리를 지나간다).
 *
 * 판정은 영역의 네 가장자리를 따라 두께 몇 줄의 띠를 훑어, 띠 안에 내용이 하나라도 있는 위치를 표시한 배열(coverage)로 한다.
 * 띠를 쓰는 이유는 살짝 기운 테두리 선도 한 띠 안에서 이어져 보이게 하기 위해서다. 모든 함수는 DOM 에 의존하지 않는다.
 */

import { regionHeight, regionWidth, type IndexRun, type PanelRegion } from "./panel-detect-profile";

import type { InkComponent } from "./panel-detect-components";
import type { InkMask } from "./panel-detect-raster";

export type RegionEdge = "top" | "bottom" | "left" | "right";

const EDGES: readonly RegionEdge[] = ["top", "bottom", "left", "right"];

/** 가장자리 띠의 두께(분석 픽셀): 긴 변의 3%(최소 3줄)이며 짧은 변의 1/3 을 넘지 않는다. */
export function edgeBandThickness(region: PanelRegion): number {
  const width = regionWidth(region);
  const height = regionHeight(region);
  const wanted = Math.max(3, Math.ceil(0.03 * Math.max(width, height)));
  return Math.max(1, Math.min(Math.floor(Math.min(width, height) / 3), wanted));
}

/**
 * 한 가장자리의 띠 안에 내용이 하나라도 있는 위치를 1 로 표시한다.
 * 위·아래 띠는 가로 위치(영역 너비), 왼쪽·오른쪽 띠는 세로 위치(영역 높이)가 배열의 색인이다.
 */
export function edgeBandCoverage(mask: InkMask, region: PanelRegion, edge: RegionEdge): Uint8Array {
  const width = regionWidth(region);
  const height = regionHeight(region);
  const band = edgeBandThickness(region);
  if (edge === "top" || edge === "bottom") {
    const coverage = new Uint8Array(width);
    const first = edge === "top" ? region.y0 : region.y1 - band;
    for (let y = first; y < first + band; y += 1) {
      const row = y * mask.width + region.x0;
      for (let x = 0; x < width; x += 1) if (mask.data[row + x] === 1) coverage[x] = 1;
    }
    return coverage;
  }
  const coverage = new Uint8Array(height);
  const first = edge === "left" ? region.x0 : region.x1 - band;
  for (let y = 0; y < height; y += 1) {
    const row = (region.y0 + y) * mask.width + first;
    for (let x = 0; x < band; x += 1) {
      if (mask.data[row + x] === 1) {
        coverage[y] = 1;
        break;
      }
    }
  }
  return coverage;
}

/** coverage[from, to) 안에서 비어 있는(0) 구간 중 가장 긴 것의 길이. */
export function longestBlankRun(coverage: Uint8Array, from: number, to: number): number {
  const end = Math.min(coverage.length, to);
  let best = 0;
  let run = 0;
  for (let index = Math.max(0, from); index < end; index += 1) {
    if (coverage[index] === 0) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

/** 가장자리 띠가 "열려 있다"고 보려면 필요한 빈 구간 길이: 최소 여백 두께의 절반(최소 2). */
export function openingLength(minGap: number): number {
  return Math.max(2, Math.ceil(minGap / 2));
}

/**
 * 여백 묶음의 양끝 상태.
 * - open: 양끝이 모두 열려 있다 → 컷 사이 여백.
 * - enclosed: 양끝이 모두 막혀 있다 → 테두리 속 빈 칸(컷 한 장의 안쪽이거나 페이지 테두리 안쪽).
 * - crossed: 한쪽만 막혀 있다 → 다른 컷의 선이 가로지르므로 여백으로 쓰지 않는다.
 */
export type SeparatorKind = "open" | "enclosed" | "crossed";

export type SeparatorClassifier = (run: IndexRun) => SeparatorKind;

/**
 * 한 축(rows: 가로 여백 줄 묶음, cols: 세로 여백 줄 묶음)의 여백 묶음을 분류하는 판정기를 만든다.
 * 열 묶음이면 위·아래 띠가, 행 묶음이면 왼쪽·오른쪽 띠가 그 구간에서 열려 있는지(비어 있는 구간이 충분히 긴지)를 본다.
 * 가장자리 띠는 처음 물을 때 한 번만 계산한다.
 */
export function createSeparatorClassifier(
  mask: InkMask,
  region: PanelRegion,
  axis: "rows" | "cols",
  minGap: number,
): SeparatorClassifier {
  const edges: readonly [RegionEdge, RegionEdge] = axis === "cols" ? ["top", "bottom"] : ["left", "right"];
  const need = openingLength(minGap);
  let coverage: readonly [Uint8Array, Uint8Array] | null = null;
  return (run) => {
    if (coverage === null) coverage = [edgeBandCoverage(mask, region, edges[0]), edgeBandCoverage(mask, region, edges[1])];
    const first = longestBlankRun(coverage[0], run.start, run.end) >= need;
    const second = longestBlankRun(coverage[1], run.start, run.end) >= need;
    if (first && second) return "open";
    return !first && !second ? "enclosed" : "crossed";
  };
}

/**
 * 영역의 네 변이 모두 끊김 없는 선(컷 테두리)이나 꽉 찬 그림으로 막힌 직사각형인지.
 * 말풍선 윤곽이나 인물 덩어리처럼 변 일부만 닿는 모양은 직사각형이 아니다.
 */
export function isRectangularRegion(mask: InkMask, region: PanelRegion, minGap: number): boolean {
  const need = openingLength(minGap);
  for (const edge of EDGES) {
    const coverage = edgeBandCoverage(mask, region, edge);
    if (longestBlankRun(coverage, 0, coverage.length) >= need) return false;
  }
  return true;
}

/** 얇은 선이라고 볼 두께: 짧은 변의 3%(최소 6 분석 픽셀). */
function frameThicknessLimit(component: InkComponent): number {
  return Math.max(6, Math.round(0.03 * Math.min(component.x1 - component.x0, component.y1 - component.y0)));
}

/**
 * 컷 테두리 같은 얇은 고리인지: 내용 면적이 경계 상자 둘레 × 얇은 두께 한도의 75% 이하다.
 * 꽉 찬 그림이나 두꺼운 띠는 이 값을 훨씬 넘는다.
 */
export function isFrameLikeComponent(component: InkComponent): boolean {
  const width = component.x1 - component.x0;
  const height = component.y1 - component.y0;
  return component.area <= 2 * (width + height) * frameThicknessLimit(component) * 0.75;
}

export function componentBoxArea(component: InkComponent): number {
  return (component.x1 - component.x0) * (component.y1 - component.y0);
}

function containsBox(outer: InkComponent, inner: InkComponent): boolean {
  return outer.x0 <= inner.x0 && outer.y0 <= inner.y0 && outer.x1 >= inner.x1 && outer.y1 >= inner.y1;
}

/** 컷으로 볼 만한 덩어리: 얇은 테두리 고리는 경계 상자 10% 이상, 그 밖은 경계 상자 5%·내용 1% 이상. */
const FRAME_BOX_SHARE = 0.1;
const BLOB_BOX_SHARE = 0.05;
const BLOB_INK_SHARE = 0.01;

/**
 * 투영으로 나뉘지 않은 영역 안에 서로 이어지지 않은 컷 후보가 둘 이상 있는지.
 * 다른 후보의 경계 상자 안에 통째로 든 덩어리(테두리 속 인물·말풍선)는 그 컷의 일부로 보고 세지 않는다.
 * 여백이 최소 두께보다 얇거나 스캔이 기울어 투영으로 못 나눈 경우가 여기에 걸린다.
 */
export function hasSeparatePanelCandidates(components: readonly InkComponent[], area: number): boolean {
  const candidates = components.filter((component) => (isFrameLikeComponent(component)
    ? componentBoxArea(component) >= FRAME_BOX_SHARE * area
    : componentBoxArea(component) >= BLOB_BOX_SHARE * area && component.area >= BLOB_INK_SHARE * area));
  const topLevel = candidates.filter((component) => !candidates.some((other) => other !== component && containsBox(other, component)));
  return topLevel.length >= 2;
}
