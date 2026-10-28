import { afterEach, describe, expect, it, vi } from "vitest";

import { Office2dSpriteStore, type Office2dImageSource } from "./office2d-sprite-catalog";

afterEach(() => vi.useRealTimers());

function deferredImage() {
  let complete: ((image: Office2dImageSource) => void) | undefined;
  const promise = new Promise<Office2dImageSource>((resolve) => { complete = resolve; });
  return { promise, resolve(image: Office2dImageSource) {
    if (!complete) throw new Error("이미지 promise가 준비되지 않았습니다.");
    complete(image);
  } };
}

describe("2D 시트와 배경의 개별 이미지 도착", () => {
  it("기존 두 인자 API와 URL 중복 제거를 유지하고 완료된 타이머를 정리한다", async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => ({ width: 128, height: 192 }));
    const store = new Office2dSpriteStore(load);
    expect(await store.loadAll(["a", "a", "b"], 100)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("초기 6초 제한 뒤 도착한 원본도 저장하고 캐시 갱신 알림을 한 번 보낸다", async () => {
    vi.useFakeTimers();
    const image = { width: 1536, height: 1024 };
    const pending = deferredImage();
    const store = new Office2dSpriteStore(() => pending.promise);
    const arrival = vi.fn();
    const ready = store.loadAll(["late-background", "late-background"], 6000, arrival);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await ready).toBe(0);
    expect(arrival).not.toHaveBeenCalled();
    pending.resolve(image);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.get("late-background")).toBe(image);
    expect(arrival).toHaveBeenCalledExactlyOnceWith("late-background", image);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("후속 12초 제한 뒤의 성공은 알리고 실패·비어 있는 이미지는 알리지 않는다", async () => {
    vi.useFakeTimers();
    const pending = deferredImage();
    const store = new Office2dSpriteStore((url) => url === "room-art" ? pending.promise
      : url === "invalid" ? Promise.resolve({ width: 0, height: 0 }) : Promise.reject(new Error("로딩 실패")));
    const arrival = vi.fn();
    const ready = store.loadAll(["room-art", "invalid", "failed"], 12000, arrival);
    await vi.advanceTimersByTimeAsync(12000);
    expect(await ready).toBe(0);
    expect(arrival).not.toHaveBeenCalled();
    const image = { width: 1182, height: 1330 };
    pending.resolve(image);
    await vi.advanceTimersByTimeAsync(0);
    expect(arrival).toHaveBeenCalledExactlyOnceWith("room-art", image);
    expect(store.get("invalid")).toBeNull();
    expect(store.get("failed")).toBeNull();
  });
});
