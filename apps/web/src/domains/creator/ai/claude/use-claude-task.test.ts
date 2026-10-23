// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useClaudeTask } from "./use-claude-task";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useClaudeTask", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("성공하면 값을 돌려주고 idle로 돌아온다", async () => {
    const { result } = renderHook(() => useClaudeTask());
    let value: string | undefined;

    await act(async () => {
      value = await result.current.start(async () => "ok");
    });

    expect(value).toBe("ok");
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("실행 중에는 running이고 실패하면 사유를 남긴다", async () => {
    const { result } = renderHook(() => useClaudeTask());
    const gate = deferred<string>();
    let pending: Promise<string | undefined> = Promise.resolve(undefined);

    act(() => { pending = result.current.start(() => gate.promise); });
    expect(result.current.running).toBe(true);

    await act(async () => {
      gate.reject(new Error("키를 확인해 주세요."));
      expect(await pending).toBeUndefined();
    });

    expect(result.current.state).toEqual({ status: "error", message: "키를 확인해 주세요." });
    expect(result.current.running).toBe(false);
  });

  it("중단하면 요청 신호를 취소하고 오류가 아니라 중단함으로 표시한다", async () => {
    const { result } = renderHook(() => useClaudeTask());
    let signal: AbortSignal | undefined;
    let pending: Promise<unknown> = Promise.resolve();

    act(() => {
      pending = result.current.start((next) => {
        signal = next;
        return new Promise((_resolve, reject) => next.addEventListener("abort", () => reject(new Error("aborted"))));
      });
    });
    act(() => result.current.stop());
    await act(async () => { await pending; });

    expect(signal?.aborted).toBe(true);
    expect(result.current.state).toEqual({ status: "stopped" });
  });

  it("중단했더라도 이미 도착한 성공 값은 올리지 않는다", async () => {
    const { result } = renderHook(() => useClaudeTask());
    const gate = deferred<string>();
    let pending: Promise<string | undefined> = Promise.resolve(undefined);

    act(() => { pending = result.current.start(() => gate.promise); });
    act(() => result.current.stop());
    let value: string | undefined = "unset";
    await act(async () => {
      gate.resolve("late");
      value = await pending;
    });

    expect(value).toBeUndefined();
    expect(result.current.state).toEqual({ status: "stopped" });
  });

  it("새로 시작하면 앞선 요청을 취소하고 앞선 결과가 상태를 덮어쓰지 못한다", async () => {
    const { result } = renderHook(() => useClaudeTask());
    const first = deferred<string>();
    const second = deferred<string>();
    const signals: AbortSignal[] = [];
    let firstPending: Promise<string | undefined> = Promise.resolve(undefined);
    let secondPending: Promise<string | undefined> = Promise.resolve(undefined);

    act(() => { firstPending = result.current.start((signal) => { signals.push(signal); return first.promise; }); });
    act(() => { secondPending = result.current.start((signal) => { signals.push(signal); return second.promise; }); });
    expect(signals[0]?.aborted).toBe(true);

    await act(async () => {
      first.reject(new Error("first failed"));
      await firstPending;
    });
    expect(result.current.state).toEqual({ status: "running" });

    await act(async () => {
      second.resolve("second");
      expect(await secondPending).toBe("second");
    });
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("화면이 사라지면 진행 중인 요청을 취소한다", () => {
    const { result, unmount } = renderHook(() => useClaudeTask());
    let signal: AbortSignal | undefined;
    act(() => { void result.current.start((next) => { signal = next; return new Promise(() => undefined); }); });

    unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("진행 중에만 경과 초를 센다", async () => {
    const { result } = renderHook(() => useClaudeTask());
    const gate = deferred<string>();
    let pending: Promise<string | undefined> = Promise.resolve(undefined);

    act(() => { pending = result.current.start(() => gate.promise); });
    act(() => { vi.advanceTimersByTime(3_100); });
    expect(result.current.elapsedSeconds).toBe(3);

    await act(async () => {
      gate.resolve("done");
      await pending;
    });
    expect(result.current.elapsedSeconds).toBe(0);
  });

  it("reset은 오류와 중단 표시를 지운다", async () => {
    const { result } = renderHook(() => useClaudeTask());
    await act(async () => {
      await result.current.start(async () => { throw new Error("boom"); });
    });
    expect(result.current.state.status).toBe("error");

    act(() => result.current.reset());

    expect(result.current.state).toEqual({ status: "idle" });
  });
});
