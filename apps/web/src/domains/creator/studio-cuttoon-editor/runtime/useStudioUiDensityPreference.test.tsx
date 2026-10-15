// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { defaultStudioAppSettings, type StudioAppSettings } from "../../studio-app-settings";
import { useStudioUiDensityPreference } from "./useStudioUiDensityPreference";

function setup(initial: StudioAppSettings = defaultStudioAppSettings()) {
  const appSettingsRef = { current: initial };
  // 부모 런타임이 소유한 쓰기 경로: ref 와 state 를 함께 바꾼다.
  const replaceAppSettings = vi.fn((next: StudioAppSettings) => {
    appSettingsRef.current = next;
  });
  const persistAppSettings = vi.fn();
  const closeRightPanel = vi.fn();
  const closeRightPanelForFocusModeRef = { current: closeRightPanel };
  const hook = renderHook(() =>
    useStudioUiDensityPreference({
      launchDensity: null,
      appSettingsRef,
      replaceAppSettings,
      persistAppSettings,
      closeRightPanelForFocusModeRef,
    }),
  );
  return { ...hook, appSettingsRef, replaceAppSettings, persistAppSettings, closeRightPanel };
}

describe("useStudioUiDensityPreference 설정 쓰기 경로", () => {
  it("밀도를 바꾸면 부모의 쓰기 경로로 새 설정을 한 번 넘기고 같은 값을 저장한다", () => {
    const initial = defaultStudioAppSettings();
    const { result, replaceAppSettings, persistAppSettings, appSettingsRef } = setup(initial);
    expect(initial.general.densityMode).not.toBe("focus");

    act(() => result.current.setStudioUiDensity("focus"));

    expect(replaceAppSettings).toHaveBeenCalledTimes(1);
    const next = replaceAppSettings.mock.calls[0]?.[0];
    expect(next).toEqual({ ...initial, general: { ...initial.general, densityMode: "focus" } });
    expect(persistAppSettings).toHaveBeenCalledTimes(1);
    expect(persistAppSettings).toHaveBeenCalledWith(next);
    expect(appSettingsRef.current).toBe(next);
    expect(result.current.uiDensityMode).toBe("focus");
  });

  it("같은 밀도를 다시 고르면 설정 객체를 바꾸지 않고 저장만 다시 요청한다", () => {
    const initial = defaultStudioAppSettings();
    const { result, replaceAppSettings, persistAppSettings } = setup(initial);

    act(() => result.current.setStudioUiDensity(initial.general.densityMode));

    expect(replaceAppSettings).not.toHaveBeenCalled();
    expect(persistAppSettings).toHaveBeenCalledTimes(1);
    expect(persistAppSettings).toHaveBeenCalledWith(initial);
  });

  it("집중 모드로 들어가면 고정되지 않은 오른쪽 패널을 닫는다", () => {
    const { result, closeRightPanel } = setup();

    act(() => result.current.setStudioUiDensity("focus"));

    expect(closeRightPanel).toHaveBeenCalledTimes(1);
  });

  it("색 패널이 고정돼 있으면 집중 모드로 들어가도 오른쪽 패널을 닫지 않는다", () => {
    const base = defaultStudioAppSettings();
    const pinned: StudioAppSettings = { ...base, general: { ...base.general, colorPanelPinned: true } };
    const { result, closeRightPanel } = setup(pinned);

    act(() => result.current.setStudioUiDensity("focus"));

    expect(closeRightPanel).not.toHaveBeenCalled();
  });
});
