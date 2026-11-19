// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerStudioServiceWorker } from "./studio-service-worker-registration";

const UPDATE_INTERVAL = 30 * 60 * 1_000;

function transition(type: "pagehide" | "pageshow", persisted: boolean): void {
  window.dispatchEvent(new PageTransitionEvent(type, { persisted }));
}

async function registerMonitor(update = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)) {
  const registration = Object.assign(new EventTarget(), { update, waiting: null });
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: {},
    register: vi.fn().mockResolvedValue(registration),
  });
  vi.stubGlobal("navigator", { serviceWorker });
  registerStudioServiceWorker();
  await Promise.resolve();
  return update;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});

afterEach(() => {
  transition("pagehide", false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("작업 화면 복귀 후 업데이트 확인", () => {
  it("보존 중에는 멈추고 뒤로 돌아오면 한 번 확인한 뒤 감시를 한 벌만 다시 설치한다", async () => {
    const update = await registerMonitor();
    for (let cycle = 0; cycle < 2; cycle++) {
      update.mockClear();
      transition("pagehide", true);
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(UPDATE_INTERVAL);
      expect(update).not.toHaveBeenCalled();
      transition("pageshow", true);
      await Promise.resolve();
      transition("pageshow", true);
      expect(update).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(1);
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(UPDATE_INTERVAL);
      expect(update).toHaveBeenCalledTimes(5);
    }
    transition("pagehide", false);
    transition("pageshow", true);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(UPDATE_INTERVAL);
    expect(update).toHaveBeenCalledTimes(5);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("이탈 전 진행 중이던 확인이 실패해도 복귀 확인을 한 번 이어서 실행한다", async () => {
    const pending = Promise.withResolvers<void>();
    const update = await registerMonitor(vi.fn<() => Promise<void>>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(undefined));
    window.dispatchEvent(new Event("focus"));
    transition("pagehide", true);
    transition("pageshow", true);
    transition("pageshow", true);
    expect(update).toHaveBeenCalledTimes(1);
    pending.reject(new Error("offline"));
    await vi.advanceTimersByTimeAsync(0);
    expect(update).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event("online"));
    expect(update).toHaveBeenCalledTimes(3);
  });

  it("다시 숨긴 문서에는 앞선 복귀가 예약한 갱신을 실행하지 않는다", async () => {
    const pending = Promise.withResolvers<void>();
    const update = await registerMonitor(vi.fn<() => Promise<void>>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(undefined));
    window.dispatchEvent(new Event("focus"));
    transition("pagehide", true);
    transition("pageshow", true);
    transition("pagehide", false);
    pending.resolve();
    await vi.advanceTimersByTimeAsync(UPDATE_INTERVAL);
    expect(update).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
