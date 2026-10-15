// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCutPoseCatalog } from "./use-cut-pose-catalog";

import type { CutPoseCandidate } from "./webtoon-cut-pose-suggestion";

const ENTRIES: readonly CutPoseCandidate[] = [{ id: "xp_kick", label: "킥", tone: "발차기" }];

afterEach(() => {
  cleanup();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

describe("useCutPoseCatalog", () => {
  it("starts loading, then becomes ready with the entries", async () => {
    const pending = deferred<readonly CutPoseCandidate[]>();
    const load = vi.fn(() => pending.promise);
    const { result } = renderHook(() => useCutPoseCatalog(load));
    expect(result.current.state).toEqual({ status: "loading" });
    await act(async () => {
      pending.resolve(ENTRIES);
    });
    expect(result.current.state).toEqual({ status: "ready", entries: ENTRIES });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reports a failure as error, and retry requests again and recovers", async () => {
    const load = vi
      .fn<() => Promise<readonly CutPoseCandidate[]>>()
      .mockRejectedValueOnce(new Error("chunk failed"))
      .mockResolvedValueOnce(ENTRIES);
    const { result } = renderHook(() => useCutPoseCatalog(load));
    await waitFor(() => expect(result.current.state.status).toBe("error"));

    act(() => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.state).toEqual({ status: "ready", entries: ENTRIES }));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shows loading again while a retry is in flight", async () => {
    const second = deferred<readonly CutPoseCandidate[]>();
    const load = vi
      .fn<() => Promise<readonly CutPoseCandidate[]>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useCutPoseCatalog(load));
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    act(() => {
      result.current.retry();
    });
    expect(result.current.state).toEqual({ status: "loading" });
    await act(async () => {
      second.resolve(ENTRIES);
    });
    expect(result.current.state.status).toBe("ready");
  });

  it("requests once even when the loader is a new function on every render", async () => {
    const pending = deferred<readonly CutPoseCandidate[]>();
    const spy = vi.fn(() => pending.promise);
    const { result, rerender } = renderHook(() => useCutPoseCatalog(() => spy()));
    rerender();
    rerender();
    expect(spy).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(ENTRIES);
    });
    rerender();
    expect(result.current.state.status).toBe("ready");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("ignores a result that arrives after unmount instead of updating state", async () => {
    const pending = deferred<readonly CutPoseCandidate[]>();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const load = () => pending.promise;
    const { unmount } = renderHook(() => useCutPoseCatalog(load));
    unmount();
    await act(async () => {
      pending.resolve(ENTRIES);
    });
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("drops a stale result when a newer request supersedes it", async () => {
    const first = deferred<readonly CutPoseCandidate[]>();
    const second = deferred<readonly CutPoseCandidate[]>();
    const load = vi
      .fn<() => Promise<readonly CutPoseCandidate[]>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useCutPoseCatalog(load));
    act(() => {
      result.current.retry();
    });
    await act(async () => {
      second.resolve([{ id: "xp_dance", label: "댄스", tone: "춤" }]);
    });
    await act(async () => {
      first.resolve(ENTRIES);
    });
    expect(result.current.state).toEqual({
      status: "ready",
      entries: [{ id: "xp_dance", label: "댄스", tone: "춤" }],
    });
  });
});
