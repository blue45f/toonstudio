// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import { STUDIO_DAY_NIGHT_CYCLE_MS } from "./studio-virtual-space-day-night-cycle";
import {
  DEFAULT_STUDIO_SPACE_LIGHTING_PREFERENCE,
  STUDIO_SPACE_LIGHTING_STORAGE_KEY,
  readStudioSpaceLightingPreference,
  useStudioSpaceLighting,
} from "./use-studio-space-lighting";

function createMockBridge(): StudioVirtualSpaceEngineBridge {
  return {
    focusWorld: vi.fn(),
    setDayNightCycle: vi.fn(),
    setLightFixtures: vi.fn(),
    setLocalPose: vi.fn(),
    setGhostMode: vi.fn(),
    setMoveDestination: vi.fn(),
  } as unknown as StudioVirtualSpaceEngineBridge;
}

describe("useStudioSpaceLighting", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("기본 조명 설정을 반환하고 변경 시 localStorage에 저장·복원한다", () => {
    const bridge = createMockBridge();
    const { result, unmount } = renderHook(() => useStudioSpaceLighting(bridge));

    expect(result.current.dayNightEnabled).toBe(false);
    expect(result.current.dayNightSpeedMs).toBe(STUDIO_DAY_NIGHT_CYCLE_MS);
    expect(result.current.lightHourOverride).toBeNull();
    expect(result.current.lightAutoMode).toBe(true);

    act(() => {
      result.current.toggleDayNight();
      result.current.changeDayNightSpeed(3_600_000);
      result.current.setLightHourOverride(21);
      result.current.setLightAutoMode(false);
    });

    expect(JSON.parse(localStorage.getItem(STUDIO_SPACE_LIGHTING_STORAGE_KEY)!)).toEqual({
      dayNightEnabled: true,
      dayNightSpeedMs: 3_600_000,
      lightHourOverride: 21,
      lightAutoMode: false,
    });

    unmount();

    const restored = renderHook(() => useStudioSpaceLighting(bridge));
    expect(restored.result.current.dayNightEnabled).toBe(true);
    expect(restored.result.current.dayNightSpeedMs).toBe(3_600_000);
    expect(restored.result.current.lightHourOverride).toBe(21);
    expect(restored.result.current.lightAutoMode).toBe(false);
    expect(bridge.setDayNightCycle).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      cycleMs: 3_600_000,
    }));
    restored.unmount();
  });

  it("깨진 JSON이나 범위 밖 값은 안전한 기본값으로 복원한다", () => {
    localStorage.setItem(STUDIO_SPACE_LIGHTING_STORAGE_KEY, "{broken");
    expect(readStudioSpaceLightingPreference()).toEqual(DEFAULT_STUDIO_SPACE_LIGHTING_PREFERENCE);

    localStorage.setItem(STUDIO_SPACE_LIGHTING_STORAGE_KEY, JSON.stringify({
      dayNightEnabled: "yes",
      dayNightSpeedMs: -100,
      lightHourOverride: 99,
      lightAutoMode: "no",
    }));
    expect(readStudioSpaceLightingPreference()).toEqual(DEFAULT_STUDIO_SPACE_LIGHTING_PREFERENCE);
  });

  it("조명 프리셋이나 수동 기구 조작으로 lightAutoMode가 꺼지면 저장소에 반영된다", () => {
    const bridge = createMockBridge();
    const { result, unmount } = renderHook(() => useStudioSpaceLighting(bridge));

    act(() => {
      result.current.applyLightPreset("cozy-evening");
    });

    expect(result.current.lightAutoMode).toBe(false);
    expect(readStudioSpaceLightingPreference().lightAutoMode).toBe(false);
    unmount();
  });
});
