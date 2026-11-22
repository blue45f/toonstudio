import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_ERGONOMICS_MIN_CANVAS_OCCUPANCY_RATIO,
  STUDIO_ERGONOMICS_STORAGE_KEY,
  applyStudioHandednessToElement,
  clearStudioHandednessFromElement,
  defaultStudioErgonomicsPreferences,
  getServerStudioErgonomicsPreferences,
  getStudioErgonomicsPreferences,
  loadStudioErgonomicsPreferences,
  normalizeStudioErgonomicsPreferences,
  resetStudioErgonomicsPreferences,
  resetStudioErgonomicsStoreForTests,
  resolveStudioHandednessLayoutTokens,
  saveStudioErgonomicsPreferences,
  setStudioHandednessPreference,
  subscribeStudioErgonomicsPreferences,
  toggleStudioHandedness,
  toggleStudioHandednessPreference,
  updateStudioErgonomicsPreferences,
  type StudioErgonomicsStorage,
} from "./studio-ergonomics-preferences";

function createMemoryStorage(): StudioErgonomicsStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const ergonomicsCss = readFileSync(new URL("./studio-ergonomics.css", import.meta.url), "utf8");

describe("studio-ergonomics-preferences", () => {
  afterEach(() => {
    resetStudioErgonomicsStoreForTests();
    vi.unstubAllGlobals();
  });

  it("손상된 입력과 범위를 벗어난 숫자를 안전한 기본값으로 정규화한다", () => {
    expect(normalizeStudioErgonomicsPreferences(null)).toEqual(
      defaultStudioErgonomicsPreferences(),
    );
    expect(
      normalizeStudioErgonomicsPreferences({
        handedness: "ambidextrous",
        nightComfortPreset: "neon",
        autoPauseNightComfortForColorCritical: "yes",
        restNudgeEnabled: 1,
        restNudgeIntervalMinutes: 999,
        restBreakDurationSeconds: 2,
        restSnoozeMinutes: -10,
      }),
    ).toEqual({
      handedness: "right-handed",
      nightComfortPreset: "off",
      autoPauseNightComfortForColorCritical: true,
      restNudgeEnabled: true,
      restNudgeIntervalMinutes: 180,
      restBreakDurationSeconds: 30,
      restSnoozeMinutes: 5,
    });
  });

  it("저장소 추상화로 저장·복원하고 SSR 및 예외 저장소에서도 안전하게 동작한다", () => {
    const storage = createMemoryStorage();
    const saved = saveStudioErgonomicsPreferences(storage, {
      ...defaultStudioErgonomicsPreferences(),
      handedness: "left-handed",
      nightComfortPreset: "gentle",
      restNudgeIntervalMinutes: 45,
    });
    expect(saved).toBe(true);
    expect(loadStudioErgonomicsPreferences(storage)).toMatchObject({
      handedness: "left-handed",
      nightComfortPreset: "gentle",
      restNudgeIntervalMinutes: 45,
    });

    // SSR(저장소 없음) 및 깨진 JSON/예외 발생 저장소에서도 실패하지 않는다.
    expect(loadStudioErgonomicsPreferences(null)).toEqual(defaultStudioErgonomicsPreferences());
    expect(saveStudioErgonomicsPreferences(null, defaultStudioErgonomicsPreferences())).toBe(false);
    expect(getServerStudioErgonomicsPreferences().handedness).toBe("right-handed");

    storage.setItem(STUDIO_ERGONOMICS_STORAGE_KEY, "{broken-json");
    expect(loadStudioErgonomicsPreferences(storage)).toEqual(defaultStudioErgonomicsPreferences());

    const throwingStorage: StudioErgonomicsStorage = {
      getItem: () => {
        throw new Error("quota-blocked");
      },
      setItem: () => {
        throw new Error("quota-blocked");
      },
    };
    expect(loadStudioErgonomicsPreferences(throwingStorage)).toEqual(
      defaultStudioErgonomicsPreferences(),
    );
    expect(
      saveStudioErgonomicsPreferences(throwingStorage, defaultStudioErgonomicsPreferences()),
    ).toBe(false);
  });

  it("오른손·왼손잡이 미러 레이아웃 토큰이 82%+ 캔버스 점유 불변식을 유지한다", () => {
    expect(toggleStudioHandedness("right-handed")).toBe("left-handed");
    expect(toggleStudioHandedness("left-handed")).toBe("right-handed");

    const rightTokens = resolveStudioHandednessLayoutTokens("right-handed");
    expect(rightTokens).toMatchObject({
      dataAttribute: "right-handed",
      toolRailSide: "left",
      inspectorDockSide: "right",
      edgeQuickSliderSide: "left",
      restNudgeAnchor: "bottom-left",
      canvasMinOccupancyRatio: STUDIO_ERGONOMICS_MIN_CANVAS_OCCUPANCY_RATIO,
    });
    expect(rightTokens.canvasMinOccupancyRatio).toBeGreaterThanOrEqual(0.82);

    const leftTokens = resolveStudioHandednessLayoutTokens("left-handed");
    expect(leftTokens).toMatchObject({
      dataAttribute: "left-handed",
      toolRailSide: "right",
      inspectorDockSide: "left",
      edgeQuickSliderSide: "right",
      restNudgeAnchor: "bottom-right",
      canvasMinOccupancyRatio: STUDIO_ERGONOMICS_MIN_CANVAS_OCCUPANCY_RATIO,
    });
    expect(leftTokens.cssCustomProperties["--studio-ergonomics-tool-rail-side"]).toBe("right");
    expect(leftTokens.cssCustomProperties["--studio-ergonomics-active-rail-inset"]).toBe("-2px");
  });

  it("DOM 대상에 data-studio-handedness 속성과 CSS 변수를 적용하고 정리한다", () => {
    const attrs = new Map<string, string>();
    const styles = new Map<string, string>();
    const target = {
      setAttribute: (name: string, value: string) => attrs.set(name, value),
      removeAttribute: (name: string) => attrs.delete(name),
      style: {
        setProperty: (name: string, value: string) => styles.set(name, value),
        removeProperty: (name: string) => styles.delete(name),
      },
    };

    applyStudioHandednessToElement(target, "left-handed");
    expect(attrs.get("data-studio-handedness")).toBe("left-handed");
    expect(styles.get("--studio-ergonomics-tool-rail-side")).toBe("right");
    expect(styles.get("--studio-ergonomics-inspector-side")).toBe("left");

    clearStudioHandednessFromElement(target);
    expect(attrs.has("data-studio-handedness")).toBe(false);
    expect(styles.has("--studio-ergonomics-tool-rail-side")).toBe(false);
  });

  it("외부 스토어 구독·원터치 토글·초기화를 일관되게 알린다", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStudioErgonomicsPreferences(listener);

    expect(getStudioErgonomicsPreferences().handedness).toBe("right-handed");

    const toggled = toggleStudioHandednessPreference();
    expect(toggled.handedness).toBe("left-handed");
    expect(listener).toHaveBeenCalledTimes(1);

    setStudioHandednessPreference("left-handed");
    expect(listener).toHaveBeenCalledTimes(1);

    updateStudioErgonomicsPreferences({ nightComfortPreset: "amber", restNudgeIntervalMinutes: 90 });
    expect(getStudioErgonomicsPreferences()).toMatchObject({
      handedness: "left-handed",
      nightComfortPreset: "amber",
      restNudgeIntervalMinutes: 90,
    });
    expect(listener).toHaveBeenCalledTimes(2);

    const reset = resetStudioErgonomicsPreferences();
    expect(reset).toEqual(defaultStudioErgonomicsPreferences());
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
  });

  it("독립 CSS가 미러링·캔버스 색 보호·44px 터치·모션 감소·고대비 계약을 지킨다", () => {
    expect(ergonomicsCss).toContain('[data-studio-editor="true"][data-studio-handedness="left-handed"] #studio-workspace');
    expect(ergonomicsCss).toContain("flex-direction: row-reverse;");
    expect(ergonomicsCss).toContain('[data-studio-editor="true"][data-studio-night-comfort="active"]');
    expect(ergonomicsCss).toContain('[data-studio-editor="true"][data-studio-night-comfort="paused-color-critical"]');
    expect(ergonomicsCss).toContain("[data-studio-canvas-viewport]");
    expect(ergonomicsCss).toContain("filter: none !important;");
    expect(ergonomicsCss).toContain("min-height: 2.75rem;");
    expect(ergonomicsCss).toContain("min-width: 2.75rem;");
    expect(ergonomicsCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(ergonomicsCss).toContain("@media (forced-colors: active)");
  });
});
