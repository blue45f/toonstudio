import { describe, expect, it } from "vitest";

import {
  applyStudioNightComfortToElement,
  clearStudioNightComfortFromElement,
  detectStudioColorCriticalReasons,
  evaluateStudioNightComfortGuard,
  studioColorCriticalReasonLabel,
  studioNightComfortPresetLabel,
} from "./studio-night-comfort-guard";

describe("studio-night-comfort-guard", () => {
  it("야간 모드가 꺼져 있으면 중립 색온도(6500K)와 필터 비활성 상태를 반환한다", () => {
    const result = evaluateStudioNightComfortGuard(
      {
        nightComfortPreset: "off",
        autoPauseNightComfortForColorCritical: true,
      },
      { workMode: "draw", tool: "draw", drawMode: "pen" },
    );

    expect(result).toMatchObject({
      mode: "off",
      chromeFilterActive: false,
      canvasNeutralGuaranteed: true,
      warmthStrength: 0,
      approxKelvin: 6500,
    });
    expect(result.domAttributes["data-studio-night-comfort"]).toBe("off");
  });

  it("선화·스케치 등 일반 작업에서는 UI 크롬에만 난색을 적용하고 캔버스 중립을 보장한다", () => {
    const gentle = evaluateStudioNightComfortGuard(
      {
        nightComfortPreset: "gentle",
        autoPauseNightComfortForColorCritical: true,
      },
      { workMode: "draw", tool: "draw", drawMode: "pen" },
    );
    expect(gentle).toMatchObject({
      mode: "active",
      chromeFilterActive: true,
      canvasNeutralGuaranteed: true,
      warmthStrength: 0.18,
      approxKelvin: 4800,
      primaryReason: null,
    });

    const amber = evaluateStudioNightComfortGuard(
      {
        nightComfortPreset: "amber",
        autoPauseNightComfortForColorCritical: true,
      },
      { workMode: "storyboard", tool: "select" },
    );
    expect(amber).toMatchObject({
      mode: "active",
      chromeFilterActive: true,
      canvasNeutralGuaranteed: true,
      warmthStrength: 0.34,
      approxKelvin: 3900,
    });
  });

  it("채색·스포이드·컬러 휠·색보정·내보내기 진입 시 색 왜곡 방지를 위해 즉시 중립 복귀한다", () => {
    const basePrefs = {
      nightComfortPreset: "amber" as const,
      autoPauseNightComfortForColorCritical: true,
    };

    const cases = [
      { context: { eyedropperActive: true }, expectedReason: "eyedropper" },
      { context: { workMode: "color" }, expectedReason: "color-work-mode" },
      { context: { colorWheelOpen: true }, expectedReason: "color-picker" },
      { context: { activeMenu: "palette" }, expectedReason: "color-picker" },
      { context: { activeMenu: "bgFill" }, expectedReason: "color-picker" },
      { context: { colorRangePickActive: true }, expectedReason: "color-grading" },
      { context: { pageGradePanelOpen: true }, expectedReason: "color-grading" },
      { context: { colorBlindPreview: "deuteranopia" }, expectedReason: "color-grading" },
      { context: { advancedFillActive: true }, expectedReason: "color-paint-tool" },
      { context: { wetMixActive: true }, expectedReason: "color-paint-tool" },
      { context: { dodgeBurnActive: true }, expectedReason: "color-paint-tool" },
      { context: { drawMode: "lasso-fill" }, expectedReason: "color-paint-tool" },
      { context: { exportMenuOpen: true }, expectedReason: "export" },
      { context: { isExporting: true, eyedropperActive: true }, expectedReason: "export" },
    ] as const;

    for (const testCase of cases) {
      const evaluation = evaluateStudioNightComfortGuard(basePrefs, testCase.context);
      expect(evaluation.mode).toBe("paused-color-critical");
      expect(evaluation.chromeFilterActive).toBe(false);
      expect(evaluation.canvasNeutralGuaranteed).toBe(true);
      expect(evaluation.warmthStrength).toBe(0);
      expect(evaluation.approxKelvin).toBe(6500);
      expect(evaluation.primaryReason).toBe(testCase.expectedReason);
      expect(evaluation.domAttributes).toEqual({
        "data-studio-night-comfort": "paused-color-critical",
        "data-studio-night-comfort-reason": testCase.expectedReason,
      });
    }
  });

  it("자동 일시 해제 옵션을 꺼도 캔버스 중립 보장은 항상 유지한다", () => {
    const evaluation = evaluateStudioNightComfortGuard(
      {
        nightComfortPreset: "gentle",
        autoPauseNightComfortForColorCritical: false,
      },
      { eyedropperActive: true },
    );

    expect(evaluation.mode).toBe("active");
    expect(evaluation.chromeFilterActive).toBe(true);
    expect(evaluation.canvasNeutralGuaranteed).toBe(true);
    expect(detectStudioColorCriticalReasons({ eyedropperActive: true })).toEqual(["eyedropper"]);
    expect(studioColorCriticalReasonLabel("eyedropper")).toBe("스포이드");
    expect(studioNightComfortPresetLabel("gentle")).toBe("은은한 난색");
  });

  it("DOM 속성과 강도 변수를 적용하고 해제 시 깔끔하게 정리한다", () => {
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

    const active = evaluateStudioNightComfortGuard(
      { nightComfortPreset: "gentle", autoPauseNightComfortForColorCritical: true },
      { workMode: "draw" },
    );
    applyStudioNightComfortToElement(target, active);
    expect(attrs.get("data-studio-night-comfort")).toBe("active");
    expect(attrs.get("data-studio-night-comfort-reason")).toBe("none");
    expect(styles.get("--studio-ergonomics-warmth")).toBe("0.18");

    const paused = evaluateStudioNightComfortGuard(
      { nightComfortPreset: "gentle", autoPauseNightComfortForColorCritical: true },
      { eyedropperActive: true },
    );
    applyStudioNightComfortToElement(target, paused);
    expect(attrs.get("data-studio-night-comfort")).toBe("paused-color-critical");
    expect(attrs.get("data-studio-night-comfort-reason")).toBe("eyedropper");
    expect(styles.has("--studio-ergonomics-warmth")).toBe(false);

    clearStudioNightComfortFromElement(target);
    expect(attrs.has("data-studio-night-comfort")).toBe(false);
    expect(attrs.has("data-studio-night-comfort-reason")).toBe(false);
  });
});
