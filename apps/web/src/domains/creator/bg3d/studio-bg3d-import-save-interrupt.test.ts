import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_BG3D_IMPORT_SAVE_TIMEOUT_MS,
  StudioBg3dImportSaveInterrupted,
  createStudioBg3dImportSaveScope,
  raceStudioBg3dImportSave,
} from "./studio-bg3d-import-save-interrupt";

afterEach(() => {
  vi.useRealTimers();
});

describe("가져오기 저장의 취소·시간 한도", () => {
  it("기본 한도는 15초다", () => {
    expect(STUDIO_BG3D_IMPORT_SAVE_TIMEOUT_MS).toBe(15_000);
  });

  it("바깥 취소 신호가 이미 서 있으면 처음부터 cancelled 로 서 있다", () => {
    const controller = new AbortController();
    controller.abort();
    const scope = createStudioBg3dImportSaveScope(controller.signal, 1_000);
    expect(scope.signal.aborted).toBe(true);
    expect(scope.reason()).toBe("cancelled");
    scope.dispose();
  });

  it("바깥 신호가 서면 cancelled 로 서고 한도가 지나도 이유를 바꾸지 않는다", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const scope = createStudioBg3dImportSaveScope(controller.signal, 1_000);
    expect(scope.signal.aborted).toBe(false);
    controller.abort();
    expect(scope.reason()).toBe("cancelled");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(scope.reason()).toBe("cancelled");
    scope.dispose();
  });

  it("한도가 지나면 timeout 으로 선다(그 전에는 서지 않는다)", async () => {
    vi.useFakeTimers();
    const scope = createStudioBg3dImportSaveScope(undefined, 1_000);
    await vi.advanceTimersByTimeAsync(999);
    expect(scope.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(scope.signal.aborted).toBe(true);
    expect(scope.reason()).toBe("timeout");
    scope.dispose();
  });

  it("dispose 는 타이머와 바깥 신호 구독을 풀어, 이후의 취소·한도가 아무것도 바꾸지 않는다", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const scope = createStudioBg3dImportSaveScope(controller.signal, 1_000);
    scope.dispose();
    expect(vi.getTimerCount()).toBe(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(scope.signal.aborted).toBe(false);
    expect(scope.reason()).toBeNull();
  });

  it("작업이 먼저 끝나면 그 값(또는 그 거절)을 그대로 전한다", async () => {
    const scope = createStudioBg3dImportSaveScope(undefined, 1_000);
    await expect(raceStudioBg3dImportSave(Promise.resolve(7), scope)).resolves.toBe(7);
    await expect(raceStudioBg3dImportSave(Promise.reject(new Error("boom")), scope)).rejects.toThrow("boom");
    scope.dispose();
  });

  it("작업이 끝나기 전에 서면 기다림을 멈추고 이유를 담아 거절한다", async () => {
    const controller = new AbortController();
    const scope = createStudioBg3dImportSaveScope(controller.signal, 1_000);
    const pending = raceStudioBg3dImportSave(new Promise<number>(() => undefined), scope);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "StudioBg3dImportSaveInterrupted", reason: "cancelled" });
    await expect(pending).rejects.toBeInstanceOf(StudioBg3dImportSaveInterrupted);
    scope.dispose();
  });

  it("이미 선 범위에는 작업을 기다리지 않고 바로 거절한다", async () => {
    vi.useFakeTimers();
    const scope = createStudioBg3dImportSaveScope(undefined, 10);
    await vi.advanceTimersByTimeAsync(10);
    await expect(raceStudioBg3dImportSave(Promise.resolve(1), scope)).rejects.toMatchObject({ reason: "timeout" });
    scope.dispose();
  });
});
