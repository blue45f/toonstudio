// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useEffect, useRef } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudioPageHistorySnapshots } from "./useStudioPageHistorySnapshots";
import type { DrawEl } from "../../studio-element-model";

// 전체 Host를 마운트하지 않는다. 실제 이력 훅과 React 배치, 가짜 내구 포트를 사용한다.
// Host의 실제 의존성에서 history 구독을 결정하므로 제품 배선이 빠지면 동작 검사도 실패한다.
const host = readFileSync(resolve(process.cwd(), "apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx"), "utf8");
const autosaveStart = host.indexOf("// 오토세이브 임시저장 리스너");
const autosaveEnd = host.indexOf("// 서버 자동저장", autosaveStart);
const autosave = host.slice(autosaveStart, autosaveEnd);
const dependencyMatch = autosave.match(/ {2}\}, \[\n([\s\S]*?)\n {2}\]\);/u);
const dependencies = new Set((dependencyMatch?.[1] ?? "").split(",").map((entry) => entry.trim()));
const hostSubscribesHistory = dependencies.has("pagesHistory");

const stroke: DrawEl = {
  id: "pointerup-stroke", type: "draw", mode: "pen", kind: "freehand", brush: "pen",
  points: [10, 10, 30, 30], stroke: "#000000", strokeWidth: 6,
};
type DurableState =
  | { readonly state: "snapshot"; readonly strokeIds: readonly string[] }
  | { readonly state: "cleared" };

function renderAutosaveHistory(subscribeHistory: boolean) {
  const disk: { current: DurableState } = { current: { state: "cleared" } };
  const clear = vi.fn(() => { disk.current = { state: "cleared" }; });
  const markChanged = vi.fn(() => true);
  const view = renderHook(() => {
    const edited = useRef(false);
    const history = useStudioPageHistorySnapshots({
      effectiveWorkId: "autosave-batch-regression",
      workId: null,
      markStudioDocumentChanged: () => {
        edited.current = true;
        return markChanged();
      },
    });
    const historyDependency = subscribeHistory ? history.pagesHistory : null;
    useEffect(() => {
      // 최초 빈 원고는 쓰지 않는다. pointerup의 첫 snapshot은 이 effect와 독립적이다.
      if (!edited.current || history.pages.some((page) => page.elements.length > 0)) return;
      const timer = setTimeout(clear, 1500);
      return () => clearTimeout(timer);
    }, [history.pages, historyDependency]);
    return history;
  });
  const initialPages = view.result.current.pages;
  const initialHistory = view.result.current.pagesHistory;
  const page = initialPages[0];
  if (!page) throw new Error("초기 원고가 없습니다.");
  const inkPages = [{ ...page, elements: [stroke] }];

  // 첫 pointerup의 내구 기록은 있으나 아직 React 페이지 이력에는 획이 들어가지 않았다.
  disk.current = { state: "snapshot", strokeIds: [stroke.id] };
  const flushThenUndo = () => act(() => {
    // 실제 일반 Undo와 같이 한 이벤트에서 pending flush를 예약하고 즉시 index 0으로 돌아간다.
    view.result.current.pagesHistoryRef.current = [initialPages, inkPages];
    view.result.current.pagesHiRef.current = 1;
    view.result.current.setPagesHistory(view.result.current.pagesHistoryRef.current);
    view.result.current.setPagesHi(1);
    view.result.current.pagesHiRef.current = 0;
    view.result.current.setPagesHi(0);
  });
  return { ...view, disk, clear, markChanged, initialPages, initialHistory, flushThenUndo };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("첫 대기 획을 flush와 함께 Undo한 원고의 자동저장 예약", () => {
  it("실제 Host의 자동저장 effect가 현재 페이지와 이력 배열을 함께 구독한다", () => {
    expect(autosaveStart).toBeGreaterThan(-1);
    expect(autosaveEnd).toBeGreaterThan(autosaveStart);
    expect(dependencyMatch).not.toBeNull();
    expect(dependencies.has("pages")).toBe(true);
    expect(hostSubscribesHistory).toBe(true);
  });

  it("페이지 참조와 index가 원래 값이어도 실제 이력 변경을 구독해 1500ms 뒤 tombstone을 쓴다", async () => {
    const view = renderAutosaveHistory(hostSubscribesHistory);
    view.flushThenUndo();
    expect(view.result.current.pages).toBe(view.initialPages);
    expect(view.result.current.pagesHi).toBe(0);
    expect(view.result.current.pagesHistory).not.toBe(view.initialHistory);
    expect(view.result.current.pagesHistory).toHaveLength(2);
    expect(view.result.current.pages[0]?.elements).toEqual([]);
    expect(view.markChanged).toHaveBeenCalledTimes(3);
    expect(view.disk.current).toEqual({ state: "snapshot", strokeIds: [stroke.id] });

    await act(async () => { vi.advanceTimersByTime(1499); });
    expect(view.clear).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(view.clear).toHaveBeenCalledOnce();
    expect(view.disk.current).toEqual({ state: "cleared" });
  });

  it("이전 pages-only 구독은 같은 배치를 놓쳐 첫 획 snapshot을 계속 남긴다", async () => {
    const view = renderAutosaveHistory(false);
    view.flushThenUndo();
    expect(view.result.current.pages).toBe(view.initialPages);
    expect(view.result.current.pagesHi).toBe(0);
    expect(view.result.current.pagesHistory).not.toBe(view.initialHistory);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(view.clear).not.toHaveBeenCalled();
    expect(view.disk.current).toEqual({ state: "snapshot", strokeIds: [stroke.id] });
  });
});
