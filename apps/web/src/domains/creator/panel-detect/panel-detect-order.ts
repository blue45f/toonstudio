/**
 * 읽기 순서 — 사각형 목록을 만화(우→좌·상→하)·코믹(좌→우·상→하)·웹툰(상→하) 순서로 정렬한다.
 *
 * 감지 결과와 사용자 편집 결과가 같은 규칙을 쓰도록 컷 사각형만 보고 정한다(재귀 XY 순서).
 * 1) 어떤 가로선도 가로지르지 않는 틈이 있으면 위 묶음 → 아래 묶음 순으로 나눈다.
 * 2) 가로로 못 나누면 세로 틈으로 나눈다(만화는 오른쪽 묶음이 먼저).
 * 3) 둘 다 안 되면(서로 겹친 배치) 위쪽 가장자리 → 가로 방향 순으로 정렬한다.
 * 같은 입력은 항상 같은 순서를 낸다(정렬은 안정적이며 입력 순서를 마지막 기준으로 쓴다).
 */

import type { PanelReadingOrder, PanelRect } from "./panel-detect-types";

interface Indexed<T extends PanelRect> {
  readonly item: T;
  readonly index: number;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** 시작점 순으로 훑으며, 앞선 묶음의 끝(reach)을 넘어서 시작하는 항목에서 묶음을 끊는다. */
function sweepGroups<T extends PanelRect>(
  items: readonly Indexed<T>[],
  start: (rect: PanelRect) => number,
  end: (rect: PanelRect) => number,
  tolerance: number,
): Indexed<T>[][] {
  const sorted = [...items].sort(
    (a, b) => start(a.item) - start(b.item) || end(a.item) - end(b.item) || a.index - b.index,
  );
  const groups: Indexed<T>[][] = [];
  let current: Indexed<T>[] = [];
  let reach = Number.NEGATIVE_INFINITY;
  for (const entry of sorted) {
    if (current.length > 0 && start(entry.item) >= reach - tolerance) {
      groups.push(current);
      current = [];
      reach = Number.NEGATIVE_INFINITY;
    }
    current.push(entry);
    reach = Math.max(reach, end(entry.item));
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

const rectTop = (rect: PanelRect): number => rect.y;
const rectBottom = (rect: PanelRect): number => rect.y + rect.height;
const rectLeft = (rect: PanelRect): number => rect.x;
const rectRight = (rect: PanelRect): number => rect.x + rect.width;

function orderRecursive<T extends PanelRect>(items: readonly Indexed<T>[], mode: PanelReadingOrder): Indexed<T>[] {
  if (items.length <= 1) return [...items];
  // 가로 틈 허용치: 중앙값 높이의 1.5% (모서리 반올림으로 생긴 한두 픽셀 겹침을 같은 줄로 보지 않는다).
  const rowTolerance = Math.max(1, Math.round(median(items.map((entry) => entry.item.height)) * 0.015));
  const rows = sweepGroups(items, rectTop, rectBottom, rowTolerance);
  if (rows.length > 1) return rows.flatMap((group) => orderRecursive(group, mode));
  const columnTolerance = Math.max(1, Math.round(median(items.map((entry) => entry.item.width)) * 0.015));
  const columns = sweepGroups(items, rectLeft, rectRight, columnTolerance);
  if (columns.length > 1) {
    const ordered = mode === "manga" ? [...columns].reverse() : columns;
    return ordered.flatMap((group) => orderRecursive(group, mode));
  }
  return [...items].sort(
    (a, b) => a.item.y - b.item.y
      || (mode === "manga" ? b.item.x - a.item.x : a.item.x - b.item.x)
      || a.index - b.index,
  );
}

/** 웹툰: 위→아래. 세로로 겹치는 컷끼리 한 줄로 묶고 줄 안에서만 좌→우. */
function orderWebtoon<T extends PanelRect>(items: readonly Indexed<T>[]): Indexed<T>[] {
  if (items.length <= 1) return [...items];
  const tolerance = Math.max(1, Math.round(median(items.map((entry) => entry.item.height)) * 0.015));
  const bands = sweepGroups(items, rectTop, rectBottom, tolerance);
  return bands.flatMap((band) => [...band].sort((a, b) => a.item.x - b.item.x || a.item.y - b.item.y || a.index - b.index));
}

export function sortPanelsByReadingOrder<T extends PanelRect>(
  panels: readonly T[],
  mode: PanelReadingOrder,
): T[] {
  const indexed = panels.map((item, index): Indexed<T> => ({ item, index }));
  const ordered = mode === "webtoon" ? orderWebtoon(indexed) : orderRecursive(indexed, mode);
  return ordered.map((entry) => entry.item);
}
