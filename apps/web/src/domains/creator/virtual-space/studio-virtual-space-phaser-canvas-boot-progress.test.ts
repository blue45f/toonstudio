import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_BOOT_MAX_MS, STUDIO_BOOT_STALL_MS } from "./experience/studio-visible-boot-deadline";
import {
  STUDIO_SLOW_LOAD_NOTICE_MS,
  createStudioBootProgress,
  type StudioBootLoaderLike,
} from "./studio-virtual-space-phaser-canvas-boot-progress";

class Visibility extends EventTarget {
  hidden = false;
}

class FakeLoader implements StudioBootLoaderLike {
  totalToLoad = 0;
  totalComplete = 0;
  totalFailed = 0;
  readonly inflight: { entries: { percentComplete?: number }[] } = { entries: [] };
  private readonly listeners = new Map<string, Array<() => void>>();
  on(event: string, listener: () => void): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }
  emit(event: string): void {
    for (const listener of this.listeners.get(event) ?? []) listener();
  }
}

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }));
afterEach(() => vi.useRealTimers());

function start() {
  const callbacks = { onTimeout: vi.fn(), onProgress: vi.fn(), onSlow: vi.fn() };
  const boot = createStudioBootProgress({ visibility: new Visibility(), ...callbacks });
  return { boot, ...callbacks };
}

describe("월드 부팅의 진행 신호 묶음", () => {
  it("진행 신호가 없으면 멈춤 예산 뒤에 한 번만 시간 초과를 알린다", () => {
    const { onTimeout } = start();
    vi.advanceTimersByTime(STUDIO_BOOT_STALL_MS - 1);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it("내려받기 진행 이벤트마다 멈춤 예산이 되돌아가 총 시간이 길어도 실패하지 않는다", () => {
    const { boot, onTimeout } = start();
    const loader = new FakeLoader();
    loader.totalToLoad = 10;
    boot.watchLoader(loader);
    for (const event of ["fileprogress", "filecomplete", "progress"]) {
      vi.advanceTimersByTime(STUDIO_BOOT_STALL_MS - 1_000);
      loader.emit(event);
    }
    vi.advanceTimersByTime(STUDIO_BOOT_STALL_MS - 1);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it("진행 신호가 아무리 이어져도 전체 상한을 넘으면 실패한다", () => {
    const { boot, onTimeout } = start();
    const loader = new FakeLoader();
    loader.totalToLoad = 10;
    boot.watchLoader(loader);
    for (let elapsed = 0; elapsed < STUDIO_BOOT_MAX_MS; elapsed += 20_000) {
      vi.advanceTimersByTime(20_000);
      loader.emit("fileprogress");
    }
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it("진행률은 끝난 파일에 받는 중인 파일의 진행을 더해 0~100으로 알린다", () => {
    const { boot, onProgress } = start();
    const loader = new FakeLoader();
    loader.totalToLoad = 4;
    boot.watchLoader(loader);
    loader.totalComplete = 1;
    loader.totalFailed = 1;
    loader.inflight.entries = [{ percentComplete: 0.5 }, { percentComplete: 7 }, { percentComplete: -2 }, {}];
    loader.emit("progress");
    // (완료 1 + 실패 1 + 받는 중 0.5 + 1(상한) + 0 + 0) / 4 = 0.875
    expect(onProgress).toHaveBeenLastCalledWith(88);
    loader.totalComplete = 4;
    loader.totalFailed = 0;
    loader.inflight.entries = [];
    loader.emit("filecomplete");
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });

  it("받을 파일이 아직 없으면 진행률을 알리지 않되 제한은 늘린다", () => {
    const { boot, onProgress, onTimeout } = start();
    const loader = new FakeLoader();
    boot.watchLoader(loader);
    vi.advanceTimersByTime(STUDIO_BOOT_STALL_MS - 1_000);
    loader.emit("progress");
    expect(onProgress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(STUDIO_BOOT_STALL_MS - 1);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("타일 청크·텍스처가 늘 때만 제한을 늘리고, 같은 수치가 반복되면 늘리지 않는다", () => {
    const { boot, onTimeout } = start();
    boot.noteTiles({ chunks: 1, textures: 2 });
    vi.advanceTimersByTime(STUDIO_BOOT_STALL_MS - 1_000);
    boot.noteTiles({ chunks: 1, textures: 2 });
    vi.advanceTimersByTime(1_000);
    expect(onTimeout, "수치가 그대로면 예산이 되돌아가지 않아 마지막 늘림부터 예산이 지난다").toHaveBeenCalledOnce();
  });

  it("타일 수치가 바뀌면 멈춤 예산이 되돌아간다", () => {
    const { boot, onTimeout } = start();
    boot.noteTiles({ chunks: 1, textures: 2 });
    vi.advanceTimersByTime(STUDIO_BOOT_STALL_MS - 1_000);
    boot.noteTiles({ chunks: 2, textures: 2 });
    vi.advanceTimersByTime(STUDIO_BOOT_STALL_MS - 1);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("느린 연결 안내는 정해진 시간 뒤에 한 번 알린다", () => {
    const { onSlow } = start();
    vi.advanceTimersByTime(STUDIO_SLOW_LOAD_NOTICE_MS - 1);
    expect(onSlow).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSlow).toHaveBeenCalledOnce();
  });

  it("월드가 열리면(settle) 부팅 제한만 끝나고, 해제(dispose)는 안내 타이머까지 끝낸다", () => {
    const { boot, onTimeout, onSlow } = start();
    boot.settle();
    vi.advanceTimersByTime(STUDIO_SLOW_LOAD_NOTICE_MS);
    expect(onSlow, "settle은 안내 타이머를 건드리지 않는다(예전 동작 그대로)").toHaveBeenCalledOnce();
    vi.advanceTimersByTime(STUDIO_BOOT_STALL_MS * 2);
    expect(onTimeout).not.toHaveBeenCalled();

    const second = start();
    second.boot.dispose();
    second.boot.dispose();
    vi.advanceTimersByTime(STUDIO_BOOT_MAX_MS);
    expect(second.onSlow).not.toHaveBeenCalled();
    expect(second.onTimeout).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
