import { describe, expect, it, vi } from "vitest";

import {
  notifyStudioBg3dAssetRightsChanged,
  subscribeStudioBg3dAssetRightsChanged,
} from "./studio-bg3d-asset-rights-refresh";

describe("권리 기록 변경 신호", () => {
  it("구독자에게 알리고, 해제한 구독자에게는 알리지 않는다", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStudioBg3dAssetRightsChanged(listener);
    notifyStudioBg3dAssetRightsChanged();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    notifyStudioBg3dAssetRightsChanged();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("한 구독자가 던져도 나머지 구독자는 알림을 받는다", () => {
    const failing = vi.fn(() => {
      throw new Error("구독자 오류");
    });
    const healthy = vi.fn();
    const stopFailing = subscribeStudioBg3dAssetRightsChanged(failing);
    const stopHealthy = subscribeStudioBg3dAssetRightsChanged(healthy);
    expect(() => notifyStudioBg3dAssetRightsChanged()).not.toThrow();
    expect(failing).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
    stopFailing();
    stopHealthy();
  });

  it("알리는 도중에 구독을 해제해도 그 알림 순회는 안전하다", () => {
    const calls: string[] = [];
    const stopSecond = subscribeStudioBg3dAssetRightsChanged(() => calls.push("second"));
    const stopFirst = subscribeStudioBg3dAssetRightsChanged(() => {
      calls.push("first");
      stopSecond();
    });
    notifyStudioBg3dAssetRightsChanged();
    expect(calls).toEqual(["second", "first"]);
    notifyStudioBg3dAssetRightsChanged();
    expect(calls).toEqual(["second", "first", "first"]);
    stopFirst();
  });
});
