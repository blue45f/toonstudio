// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode, useCallback, useEffect, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startAdminVisiblePolling, useAdminReadTask } from "./admin-visible-polling";

let visibility: DocumentVisibilityState;
const stops: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});
afterEach(() => {
  cleanup();
  for (const stop of stops.splice(0)) stop();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function show(value: DocumentVisibilityState) {
  visibility = value;
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("관리자 가시성 폴링", () => {
  it("숨겨진 탭에서는 타이머도 요청도 시작하지 않고 복귀에서 한 번 갱신한다", async () => {
    visibility = "hidden";
    const task = vi.fn();
    stops.push(startAdminVisiblePolling(task, 15_000));
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(task).not.toHaveBeenCalled();
    show("visible");
    show("visible");
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(task).toHaveBeenCalledTimes(2);
    show("hidden");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(task).toHaveBeenCalledTimes(2);
    show("visible");
    expect(task).toHaveBeenCalledTimes(3);
  });

  it("자동 갱신이 없으면 첫 가시 조회만 수행하고 종료 후에는 복귀하지 않는다", async () => {
    visibility = "hidden";
    const task = vi.fn();
    const stop = startAdminVisiblePolling(task, null);
    stops.push(stop);
    show("visible");
    show("hidden");
    show("visible");
    await vi.advanceTimersByTimeAsync(300_000);
    expect(task).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    stop();
    show("hidden");
    show("visible");
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("초기 조회와 분리된 주기는 시작 시 중복 호출하지 않고 복귀에서는 갱신한다", async () => {
    const task = vi.fn();
    stops.push(startAdminVisiblePolling(task, 60_000, false));
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(task).toHaveBeenCalledTimes(1);
    show("hidden");
    show("visible");
    expect(task).toHaveBeenCalledTimes(2);
  });
});

describe("관리자 읽기 수명주기", () => {
  it("조회가 진행 중이면 수동·주기 호출을 합치고 완료 후 다음 요청을 허용한다", async () => {
    let finish: () => void = () => undefined;
    const task = vi.fn((_signal: AbortSignal) => new Promise<void>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useAdminReadTask(task));
    const first = result.current();
    expect(result.current()).toBe(first);
    await act(async () => { await Promise.resolve(); });
    expect(task).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); await first; });
    const next = result.current();
    await act(async () => { await Promise.resolve(); });
    expect(task).toHaveBeenCalledTimes(2);
    await act(async () => { finish(); await next; });
  });

  it("조회 조건 변경과 종료는 각각 이전 요청의 신호를 취소한다", async () => {
    const requests: Array<{ signal: AbortSignal; finish: () => void }> = [];
    const task = vi.fn((signal: AbortSignal, _key: string) => new Promise<void>((resolve) => {
      requests.push({ signal, finish: resolve });
    }));
    const { result, rerender, unmount } = renderHook(({ query }) => useAdminReadTask(
      useCallback((signal: AbortSignal) => task(signal, query), [query]),
    ), { initialProps: { query: "user-a:7" } });
    const first = result.current();
    await act(async () => { await Promise.resolve(); });
    rerender({ query: "user-a:30" });
    expect(requests[0]?.signal.aborted).toBe(true);
    const next = result.current();
    await act(async () => { await Promise.resolve(); });
    expect(requests[1]?.signal.aborted).toBe(false);
    unmount();
    expect(requests[1]?.signal.aborted).toBe(true);
    for (const request of requests) request.finish();
    await Promise.all([first, next]);
  });

  it("StrictMode 재설정 뒤에도 취소된 읽기를 재사용하지 않는다", async () => {
    const signals: AbortSignal[] = [];
    const task = vi.fn(async (signal: AbortSignal) => { signals.push(signal); });
    const { unmount } = renderHook(() => {
      const run = useAdminReadTask(task);
      useEffect(() => { void run(); }, [run]);
    }, {
      wrapper: ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>,
    });
    await act(async () => { await Promise.resolve(); });
    expect(task).toHaveBeenCalledTimes(1);
    expect(signals[0]?.aborted).toBe(false);
    unmount();
  });
});
