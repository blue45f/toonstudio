/**
 * 내용 연결 요소 — 행 런(run) 기반 union-find.
 *
 * 행/열 투영으로 더 나눌 수 없는 영역에 "서로 이어지지 않은 큰 덩어리"가 둘 이상 있으면, 컷 사이 여백이
 * 축에 평행하지 않거나(사선 여백·기울어진 컷) 컷이 서로 겹쳐 있다는 뜻이다. 이때 알고리즘은 컷을 지어내지 않고
 * 해당 영역을 "검출 불가"로 보고한다. 연결 요소는 그 판정에만 쓴다.
 */

import { regionHeight, regionWidth, type PanelRegion } from "./panel-detect-profile";

import type { InkMask } from "./panel-detect-raster";

export interface InkComponent {
  /** 내용 픽셀 수. */
  readonly area: number;
  /** 경계 상자(배타 끝). */
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** 런 개수 상한. 바둑판처럼 런이 폭증하는 입력은 분석하지 않고 null 로 돌려준다. */
const MAX_RUNS = 1_500_000;

class IntBuffer {
  data = new Int32Array(1 << 12);
  length = 0;

  push(value: number): void {
    if (this.length === this.data.length) {
      const grown = new Int32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    this.data[this.length] = value;
    this.length += 1;
  }
}

function findRoot(parent: Int32Array, index: number): number {
  let root = index;
  while (parent[root] !== root) root = parent[root];
  let cursor = index;
  while (parent[cursor] !== root) {
    const next = parent[cursor];
    parent[cursor] = root;
    cursor = next;
  }
  return root;
}

function union(parent: Int32Array, a: number, b: number): void {
  const rootA = findRoot(parent, a);
  const rootB = findRoot(parent, b);
  if (rootA === rootB) return;
  if (rootA < rootB) parent[rootB] = rootA;
  else parent[rootA] = rootB;
}

/**
 * 영역 안의 4-연결 내용 덩어리를 찾는다. 면적 내림차순으로 정렬해 돌려준다.
 * 런이 너무 많으면 null.
 */
export function labelInkComponents(mask: InkMask, region: PanelRegion): InkComponent[] | null {
  const width = regionWidth(region);
  const height = regionHeight(region);
  const runX0 = new IntBuffer();
  const runX1 = new IntBuffer();
  const runY = new IntBuffer();
  let previousStart = 0;
  let previousEnd = 0;
  const parentList = new IntBuffer();

  for (let y = 0; y < height; y += 1) {
    const rowStart = (region.y0 + y) * mask.width + region.x0;
    const currentStart = runX0.length;
    let x = 0;
    while (x < width) {
      if (mask.data[rowStart + x] === 0) {
        x += 1;
        continue;
      }
      const begin = x;
      while (x < width && mask.data[rowStart + x] === 1) x += 1;
      if (runX0.length >= MAX_RUNS) return null;
      parentList.push(runX0.length);
      runX0.push(begin);
      runX1.push(x);
      runY.push(y);
    }
    const currentEnd = runX0.length;
    // 바로 윗 행의 런과 가로 구간이 한 칸이라도 겹치면 같은 덩어리다.
    let i = previousStart;
    let j = currentStart;
    while (i < previousEnd && j < currentEnd) {
      if (runX0.data[i] < runX1.data[j] && runX0.data[j] < runX1.data[i]) union(parentList.data, i, j);
      if (runX1.data[i] < runX1.data[j]) i += 1;
      else j += 1;
    }
    previousStart = currentStart;
    previousEnd = currentEnd;
  }

  const total = runX0.length;
  const roots = new Map<number, { area: number; x0: number; y0: number; x1: number; y1: number }>();
  for (let index = 0; index < total; index += 1) {
    const root = findRoot(parentList.data, index);
    const left = runX0.data[index];
    const right = runX1.data[index];
    const row = runY.data[index];
    const found = roots.get(root);
    if (found) {
      found.area += right - left;
      if (left < found.x0) found.x0 = left;
      if (right > found.x1) found.x1 = right;
      if (row < found.y0) found.y0 = row;
      if (row + 1 > found.y1) found.y1 = row + 1;
    } else {
      roots.set(root, { area: right - left, x0: left, y0: row, x1: right, y1: row + 1 });
    }
  }
  return [...roots.values()]
    .map((component): InkComponent => ({
      area: component.area,
      x0: region.x0 + component.x0,
      y0: region.y0 + component.y0,
      x1: region.x0 + component.x1,
      y1: region.y0 + component.y1,
    }))
    .sort((a, b) => b.area - a.area || a.y0 - b.y0 || a.x0 - b.x0);
}
