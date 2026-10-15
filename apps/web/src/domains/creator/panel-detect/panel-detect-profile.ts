/**
 * 투영 프로파일 — 영역 안의 행/열별 내용 픽셀 수, 여백 줄 묶음(run), 여백 잘라내기.
 *
 * 영역은 [x0,x1)×[y0,y1) 배타 범위다. "여백 줄"은 내용 픽셀 수가 허용치 이하인 행(열)이며,
 * 허용치는 줄 길이의 1.2%(PANEL_DETECT_INK_TOLERANCE)라서 스캔 잡티나 바깥 테두리 한두 줄을 흡수한다.
 */

import type { InkMask } from "./panel-detect-raster";

export interface PanelRegion {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface IndexRun {
  /** 시작 인덱스(포함). */
  readonly start: number;
  /** 끝 인덱스(배타). */
  readonly end: number;
}

export function regionWidth(region: PanelRegion): number {
  return region.x1 - region.x0;
}

export function regionHeight(region: PanelRegion): number {
  return region.y1 - region.y0;
}

export function sameRegion(a: PanelRegion, b: PanelRegion): boolean {
  return a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;
}

export function rowInkCounts(mask: InkMask, region: PanelRegion): Int32Array {
  const width = regionWidth(region);
  const height = regionHeight(region);
  const counts = new Int32Array(height);
  for (let y = 0; y < height; y += 1) {
    const start = (region.y0 + y) * mask.width + region.x0;
    let sum = 0;
    for (let x = 0; x < width; x += 1) sum += mask.data[start + x];
    counts[y] = sum;
  }
  return counts;
}

export function colInkCounts(mask: InkMask, region: PanelRegion): Int32Array {
  const width = regionWidth(region);
  const height = regionHeight(region);
  const counts = new Int32Array(width);
  for (let y = 0; y < height; y += 1) {
    const start = (region.y0 + y) * mask.width + region.x0;
    for (let x = 0; x < width; x += 1) counts[x] += mask.data[start + x];
  }
  return counts;
}

export function regionInkTotal(mask: InkMask, region: PanelRegion): number {
  const width = regionWidth(region);
  const height = regionHeight(region);
  let total = 0;
  for (let y = 0; y < height; y += 1) {
    const start = (region.y0 + y) * mask.width + region.x0;
    for (let x = 0; x < width; x += 1) total += mask.data[start + x];
  }
  return total;
}

/** 줄 길이에 비례한 내용 허용치(이 값 이하면 여백 줄). */
export function allowedInk(crossLength: number, tolerance: number): number {
  return Math.floor(crossLength * tolerance);
}

/** counts[i] <= allowed 인 인덱스가 연속된 구간을 모두 찾는다. */
export function gutterRuns(counts: Int32Array, allowed: number): IndexRun[] {
  const runs: IndexRun[] = [];
  let start = -1;
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] <= allowed) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      runs.push({ start, end: i });
      start = -1;
    }
  }
  if (start >= 0) runs.push({ start, end: counts.length });
  return runs;
}

/**
 * 영역에서 바깥 여백을 잘라 낸다. 행과 열을 번갈아 두세 번 줄여 안정된 내용 경계를 얻는다.
 * 내용이 없으면 null.
 */
export function trimRegion(mask: InkMask, region: PanelRegion, tolerance: number): PanelRegion | null {
  let current = region;
  for (let pass = 0; pass < 3; pass += 1) {
    const rows = rowInkCounts(mask, current);
    const rowAllowed = allowedInk(regionWidth(current), tolerance);
    let firstRow = -1;
    let lastRow = -1;
    for (let i = 0; i < rows.length; i += 1) {
      if (rows[i] > rowAllowed) {
        if (firstRow < 0) firstRow = i;
        lastRow = i;
      }
    }
    if (firstRow < 0) return null;
    const rowTrimmed: PanelRegion = {
      x0: current.x0,
      x1: current.x1,
      y0: current.y0 + firstRow,
      y1: current.y0 + lastRow + 1,
    };
    const cols = colInkCounts(mask, rowTrimmed);
    const colAllowed = allowedInk(regionHeight(rowTrimmed), tolerance);
    let firstCol = -1;
    let lastCol = -1;
    for (let i = 0; i < cols.length; i += 1) {
      if (cols[i] > colAllowed) {
        if (firstCol < 0) firstCol = i;
        lastCol = i;
      }
    }
    if (firstCol < 0) return null;
    const next: PanelRegion = {
      x0: rowTrimmed.x0 + firstCol,
      x1: rowTrimmed.x0 + lastCol + 1,
      y0: rowTrimmed.y0,
      y1: rowTrimmed.y1,
    };
    if (sameRegion(next, current)) return next;
    current = next;
  }
  return current;
}

export interface SplitSegment {
  /** 축을 따른 시작 인덱스(포함), 영역 시작 기준 상대값. */
  readonly start: number;
  /** 끝 인덱스(배타). */
  readonly end: number;
  /** 앞쪽을 가른 여백 두께. 첫 조각이면 null. */
  readonly gapBefore: number | null;
  /** 뒤쪽을 가른 여백 두께. 마지막 조각이면 null. */
  readonly gapAfter: number | null;
}

/**
 * 한 축의 투영(counts)에서 내부 여백 줄 묶음 중 minGap 이상인 것을 경계로 조각을 나눈다.
 * 조각이 둘 미만이면 null. (영역은 이미 잘라 냈으므로 맨 앞·맨 뒤는 내용 줄이다.)
 */
export function findSplitSegments(counts: Int32Array, allowed: number, minGap: number): SplitSegment[] | null {
  const separators = gutterRuns(counts, allowed).filter(
    (run) => run.start > 0 && run.end < counts.length && run.end - run.start >= minGap,
  );
  if (separators.length === 0) return null;
  const segments: SplitSegment[] = [];
  let cursor = 0;
  let gapBefore: number | null = null;
  for (const separator of separators) {
    segments.push({
      start: cursor,
      end: separator.start,
      gapBefore,
      gapAfter: separator.end - separator.start,
    });
    cursor = separator.end;
    gapBefore = separator.end - separator.start;
  }
  segments.push({ start: cursor, end: counts.length, gapBefore, gapAfter: null });
  return segments;
}
