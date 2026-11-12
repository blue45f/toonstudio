import { describe, expect, it, vi } from "vitest";

import { waitForStudioCaptureDownload } from "../../e2e/helpers/studio-capture-download";

import type { Download, Locator, Page } from "@playwright/test";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture({ delayAbort = false } = {}) {
  const calls: string[] = [], active = new Set<string>(), aborts: (() => void)[] = [];
  const download = deferred<Download>(), marker = deferred<void>(), markerStarted = deferred<void>();
  const abortRequested = deferred<void>(), downloadSettled = deferred<void>();
  const abortError = new Error("대기 취소");
  const watch = <T>(name: string, value: ReturnType<typeof deferred<T>>, signal: AbortSignal) => {
    calls.push(name + "-start"); active.add(name);
    const abort = () => {
      calls.push(name + "-abort");
      abortRequested.resolve();
      const finish = () => value.reject(abortError);
      if (delayAbort) aborts.push(finish); else finish();
    };
    signal.addEventListener("abort", abort, { once: true });
    return value.promise.finally(() => {
      calls.push(name + "-settled"); active.delete(name); signal.removeEventListener("abort", abort);
      if (name === "download") downloadSettled.resolve();
    });
  };
  const waitForEvent = vi.fn((event: string, options: { signal: AbortSignal; timeout?: number }) => {
    expect(event).toBe("download"); expect(options.timeout).toBeUndefined();
    return watch("download", download, options.signal);
  });
  const waitFor = vi.fn((options: { state: string; timeout: number; signal: AbortSignal }) => {
    expect(options.state).toBe("visible"); expect(options.timeout).toBe(180_000);
    const result = watch("marker", marker, options.signal); markerStarted.resolve(); return result;
  });
  return { page: { waitForEvent } as unknown as Page, marker: { waitFor } as unknown as Locator,
    download, failure: marker, markerStarted, abortRequested, downloadSettled, calls, active, aborts, waitFor, waitForEvent, abortError };
}

describe("실제 PNG 대기의 수명", () => {
  it("다운로드는 클릭 전부터 기다리고 성공 뒤 남은 DOM 감시를 종료 전에 취소한다", async () => {
    const f = fixture(), actual = {} as Download;
    const trigger = vi.fn(async () => { expect(f.calls).toEqual(["download-start"]); f.calls.push("click"); });
    const result = waitForStudioCaptureDownload(f.page, trigger, f.marker);
    await f.markerStarted.promise; f.download.resolve(actual);
    await expect(result).resolves.toBe(actual);
    expect(f.active.size).toBe(0); expect(f.calls).toContain("marker-abort");
    expect(f.calls.indexOf("click")).toBeLessThan(f.calls.indexOf("marker-start"));
    expect(f.waitForEvent).toHaveBeenCalledOnce(); expect(trigger).toHaveBeenCalledOnce();
  });

  it("실제 render-timeout 표시는 실패시키고 남은 다운로드 대기를 정리한다", async () => {
    const f = fixture(); const result = waitForStudioCaptureDownload(f.page, async () => {}, f.marker);
    const rejected = expect(result).rejects.toThrow("실제 PNG 내보내기가 render-timeout 오류를 표시했습니다.");
    await f.markerStarted.promise; f.failure.resolve(); await rejected;
    expect(f.active.size).toBe(0); expect(f.calls).toContain("download-abort");
  });

  it("실제 UI 클릭 실패를 취소 오류로 덮지 않고 시작한 대기만 정리한다", async () => {
    const f = fixture(), error = new Error("내보내기 클릭 실패");
    await expect(waitForStudioCaptureDownload(f.page, async () => { throw error; }, f.marker)).rejects.toBe(error);
    expect(f.waitFor).not.toHaveBeenCalled(); expect(f.active.size).toBe(0);
    expect(f.calls).toContain("download-abort");
  });

  it("다운로드 원래 실패·기본 timeout을 유지하며 DOM 감시를 취소한다", async () => {
    const f = fixture(), error = new Error("기존 다운로드 timeout");
    const result = waitForStudioCaptureDownload(f.page, async () => {}, f.marker);
    const rejected = expect(result).rejects.toBe(error);
    await f.markerStarted.promise; f.download.reject(error); await rejected;
    expect(f.active.size).toBe(0); expect(f.calls).toContain("marker-abort");
  });

  it("180초 오류 감시 자체의 실패도 원문으로 전파하고 다운로드 대기를 정리한다", async () => {
    const f = fixture(), error = new Error("기존 렌더 오류 감시 timeout");
    const result = waitForStudioCaptureDownload(f.page, async () => {}, f.marker);
    const rejected = expect(result).rejects.toBe(error);
    await f.markerStarted.promise; f.failure.reject(error); await rejected;
    expect(f.active.size).toBe(0); expect(f.calls).toContain("download-abort");
  });

  it("클릭 도중 먼저 거부된 다운로드도 즉시 처리하고 클릭 완료 뒤 원래 실패를 전파한다", async () => {
    const f = fixture(), click = deferred<void>(), error = new Error("클릭 중 다운로드 실패");
    const result = waitForStudioCaptureDownload(f.page, () => click.promise, f.marker);
    const rejected = expect(result).rejects.toBe(error);
    f.download.reject(error); await f.downloadSettled.promise;
    expect(f.waitFor).not.toHaveBeenCalled(); click.resolve(); await rejected;
    expect(f.active.size).toBe(0);
  });

  it("취소 요청만 보내고 끝내지 않고 실제 남은 대기의 종료까지 기다린다", async () => {
    const f = fixture({ delayAbort: true }), actual = {} as Download;
    let finished = false;
    const result = waitForStudioCaptureDownload(f.page, async () => {}, f.marker).then(value => { finished = true; return value; });
    await f.markerStarted.promise; f.download.resolve(actual);
    await f.abortRequested.promise;
    expect(finished).toBe(false); expect(f.active).toEqual(new Set(["marker"]));
    for (const abort of f.aborts) abort();
    await expect(result).resolves.toBe(actual); expect(f.active.size).toBe(0);
  });
});
