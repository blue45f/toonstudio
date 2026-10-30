import { LoadingManager } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioBg3dTrackedLoadingManager } from "./studio-bg3d-import-loading-manager";
import { importError, StudioBg3dModelImportError } from "./studio-bg3d-model-import-shared";

/** 실제 대기 함수의 microtask 경계를 지나며 조기 완료 여부를 관찰한다. */
async function passMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function failureOf(pending: Promise<void>): Promise<StudioBg3dModelImportError> {
  try {
    await pending;
  } catch (error) {
    if (error instanceof StudioBg3dModelImportError) return error;
    throw error;
  }
  throw new Error("실패해야 하는 로딩 대기가 성공했습니다.");
}

describe("모델 가져오기 리소스 로딩 추적", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("itemStart 전 URL 해석에서 던진 실제 오류를 대기에서도 동일하게 전달한다", async () => {
    const original = importError("invalid-image");
    const resolver = vi.fn((_uri: string): string => { throw original; });
    const { manager, waitForIdle } = await createStudioBg3dTrackedLoadingManager({ urlForUri: resolver });
    const started = vi.spyOn(manager, "itemStart");

    expect(() => manager.resolveURL("texture.png")).toThrow(original);
    expect(resolver).toHaveBeenCalledExactlyOnceWith("texture.png");
    expect(started).not.toHaveBeenCalled();
    await expect(waitForIdle()).rejects.toBe(original);
  });

  it("두 번째 URL 해석 오류와 후속 완료가 처음 실패 원인을 덮지 않는다", async () => {
    const first = importError("unsafe-resource-uri");
    const second = importError("missing-resource");
    const { manager, waitForIdle } = await createStudioBg3dTrackedLoadingManager({
      urlForUri: (uri) => { throw uri === "first.png" ? first : second; },
    });

    expect(() => manager.resolveURL("first.png")).toThrow(first);
    expect(() => manager.resolveURL("second.png")).toThrow(second);
    manager.itemStart("later.png");
    manager.itemError("later.png");
    manager.itemEnd("later.png");

    await expect(waitForIdle()).rejects.toBe(first);
    await expect(waitForIdle()).rejects.toBe(first);
  });

  it("실제 Three 관리자를 반환하고 로딩이 없는 정상 상태는 즉시 완료한다", async () => {
    const resolver = vi.fn((uri: string) => `data:image/png;base64,${uri}`);
    const { manager, waitForIdle } = await createStudioBg3dTrackedLoadingManager({ urlForUri: resolver });

    expect(manager).toBeInstanceOf(LoadingManager);
    expect(manager.resolveURL("selected-image")).toBe("data:image/png;base64,selected-image");
    expect(resolver).toHaveBeenCalledExactlyOnceWith("selected-image");
    await expect(waitForIdle()).resolves.toBeUndefined();
  });

  it("진행 중인 모든 itemEnd를 기다리고 정상 완료 시 취소 리스너를 제거한다", async () => {
    const { manager, waitForIdle } = await createStudioBg3dTrackedLoadingManager({ urlForUri: (uri) => uri });
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, "addEventListener");
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    const states: string[] = [];
    manager.itemStart("one.png");
    manager.itemStart("two.png");
    const pending = waitForIdle(controller.signal);
    void pending.then(() => states.push("idle"), () => states.push("failed"));
    await passMicrotasks();

    expect(added).toHaveBeenCalledTimes(1);
    expect(states).toEqual([]);
    manager.itemEnd("one.png");
    await passMicrotasks();
    expect(states).toEqual([]);
    expect(removed).not.toHaveBeenCalled();

    manager.itemEnd("two.png");
    await pending;
    expect(states).toEqual(["idle"]);
    const registration = added.mock.calls[0];
    if (!registration) throw new Error("대기 중 취소 리스너가 등록되지 않았습니다.");
    expect(removed).toHaveBeenCalledExactlyOnceWith("abort", registration[1]);
    controller.abort();
    expect(states).toEqual(["idle"]);
  });

  it("첫 로딩 완료 뒤 시작한 두 번째 로딩도 이전 idle 결과를 재사용하지 않고 기다린다", async () => {
    const { manager, waitForIdle } = await createStudioBg3dTrackedLoadingManager({ urlForUri: (uri) => uri });
    for (const uri of ["first.png", "second.png"]) {
      manager.itemStart(uri);
      const states: string[] = [];
      const pending = waitForIdle();
      void pending.then(() => states.push("idle"), () => states.push("failed"));
      await passMicrotasks();

      expect(states).toEqual([]);
      manager.itemEnd(uri);
      await pending;
      expect(states).toEqual(["idle"]);
      await expect(waitForIdle()).resolves.toBeUndefined();
    }
  });

  it("실제 itemError를 실패로 전달하고 onLoad 이후에도 같은 오류를 보존한다", async () => {
    const { manager, waitForIdle } = await createStudioBg3dTrackedLoadingManager({ urlForUri: (uri) => uri });
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, "addEventListener");
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    manager.itemStart("missing.png");
    const observed = failureOf(waitForIdle(controller.signal));
    await passMicrotasks();
    expect(added).toHaveBeenCalledTimes(1);

    manager.itemError("missing.png");
    const failure = await observed;
    expect(failure.code).toBe("missing-resource");
    const registration = added.mock.calls[0];
    if (!registration) throw new Error("실패를 기다리는 취소 리스너가 없습니다.");
    expect(removed).toHaveBeenCalledExactlyOnceWith("abort", registration[1]);

    manager.itemEnd("missing.png");
    await expect(waitForIdle()).rejects.toBe(failure);
  });

  it("이미 취소된 요청은 정확한 오류 코드로 거부하고 리스너를 만들지 않는다", async () => {
    const { manager, waitForIdle } = await createStudioBg3dTrackedLoadingManager({ urlForUri: (uri) => uri });
    const controller = new AbortController();
    controller.abort();
    const added = vi.spyOn(controller.signal, "addEventListener");
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    manager.itemStart("pending.png");

    const failure = await failureOf(waitForIdle(controller.signal));
    expect(failure.code).toBe("aborted");
    expect(added).not.toHaveBeenCalled();
    expect(removed).not.toHaveBeenCalled();
    manager.itemEnd("pending.png");
    await expect(waitForIdle()).resolves.toBeUndefined();
  });

  it("진행 중 취소는 대기만 중단하며 리스너 제거 후 다른 대기의 정상 완료를 허용한다", async () => {
    const { manager, waitForIdle } = await createStudioBg3dTrackedLoadingManager({ urlForUri: (uri) => uri });
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, "addEventListener");
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    manager.itemStart("pending.png");
    const observed = failureOf(waitForIdle(controller.signal));
    const continuing = waitForIdle();
    await passMicrotasks();
    expect(added).toHaveBeenCalledTimes(1);

    controller.abort();
    const failure = await observed;
    expect(failure.code).toBe("aborted");
    const registration = added.mock.calls[0];
    if (!registration) throw new Error("취소할 대기의 리스너가 없습니다.");
    expect(removed).toHaveBeenCalledWith("abort", registration[1]);

    manager.itemEnd("pending.png");
    await expect(continuing).resolves.toBeUndefined();
    await expect(waitForIdle()).resolves.toBeUndefined();
    expect(removed.mock.calls.every(([type, listener]) => type === "abort" && listener === registration[1])).toBe(true);
  });
});
