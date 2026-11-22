import { describe, expect, it } from "vitest";

import {
  ADAPTIVE_FLOATING_CHROME_MIN_TOUCH_TARGET_PX,
  ADAPTIVE_FLOATING_CHROME_TOGGLE_LABEL,
  createAdaptiveFloatingChromeState,
  evaluateAdaptiveChromeViewport,
  readAdaptiveFloatingChromeEnabled,
  reduceAdaptiveFloatingChromeState,
  resolveAdaptiveChromeSurfacePresentation,
  writeAdaptiveFloatingChromeEnabled,
} from "./studio-adaptive-floating-chrome";

describe("어댑티브 플로팅 크롬 상태머신 (CLS 0 · >= 82% 캔버스 가드)", () => {
  it("활성 획 시작 시 비필수 플로팅 크롬을 CLS 0으로 후퇴시키고 획 종료 시 즉시 복원한다", () => {
    const initial = createAdaptiveFloatingChromeState({ enabled: true, reducedMotion: false });
    expect(initial.phase).toBe("visible");
    expect(ADAPTIVE_FLOATING_CHROME_TOGGLE_LABEL).toBe("그리는 중 패널 자동 숨김");
    expect(ADAPTIVE_FLOATING_CHROME_MIN_TOUCH_TARGET_PX).toBeGreaterThanOrEqual(44);

    const drawing = reduceAdaptiveFloatingChromeState(initial, {
      type: "stroke-start",
      pointerId: 7,
    });
    expect(drawing.phase).toBe("receded");
    expect(drawing.reason).toBe("active-stroke");

    const floatingStyle = resolveAdaptiveChromeSurfacePresentation(drawing, "floating");
    expect(floatingStyle.opacity).toBeLessThan(0.3);
    expect(floatingStyle.pointerEvents).toBe("none");
    expect(floatingStyle.layoutShiftRisk).toBe("zero");
    expect(floatingStyle.transition).toContain("opacity");

    // 필수 표면(저장 오류·VRAM 경고 등)은 활성 획 중에도 절대 후퇴하지 않는다.
    const essentialStyle = resolveAdaptiveChromeSurfacePresentation(drawing, "essential");
    expect(essentialStyle.opacity).toBe(1);
    expect(essentialStyle.pointerEvents).toBe("auto");
    expect(essentialStyle.ariaHidden).toBe(false);

    // 다른 포인터 ID의 종료 신호는 현재 활성 획을 끊지 않는다.
    const ignoredOtherPointer = reduceAdaptiveFloatingChromeState(drawing, {
      type: "stroke-end",
      pointerId: 99,
    });
    expect(ignoredOtherPointer.phase).toBe("receded");

    // 활성 포인터 종료 시 즉시 복원한다.
    const restored = reduceAdaptiveFloatingChromeState(drawing, {
      type: "stroke-end",
      pointerId: 7,
    });
    expect(restored.phase).toBe("visible");
    expect(restored.reason).toBe("idle");
    const restoredStyle = resolveAdaptiveChromeSurfacePresentation(restored, "floating");
    expect(restoredStyle.opacity).toBe(1);
    expect(restoredStyle.pointerEvents).toBe("auto");
    expect(restoredStyle.transform).toBe("none");
  });

  it("크롬 호버·키보드 포커스·필수 경고·창 이탈 시 즉시 복원한다", () => {
    const drawing = reduceAdaptiveFloatingChromeState(
      createAdaptiveFloatingChromeState({ enabled: true }),
      { type: "stroke-start", pointerId: 1 },
    );
    expect(drawing.phase).toBe("receded");

    const hovered = reduceAdaptiveFloatingChromeState(drawing, { type: "chrome-hover-enter" });
    expect(hovered.phase).toBe("visible");
    expect(hovered.reason).toBe("chrome-hover");

    const unhovered = reduceAdaptiveFloatingChromeState(hovered, { type: "chrome-hover-leave" });
    expect(unhovered.phase).toBe("receded");

    const focused = reduceAdaptiveFloatingChromeState(unhovered, { type: "chrome-focus-in" });
    expect(focused.phase).toBe("visible");
    expect(focused.reason).toBe("chrome-focus");

    const blurredFocus = reduceAdaptiveFloatingChromeState(focused, { type: "chrome-focus-out" });
    expect(blurredFocus.phase).toBe("receded");

    const alertVisible = reduceAdaptiveFloatingChromeState(blurredFocus, {
      type: "set-essential-alert",
      active: true,
    });
    expect(alertVisible.phase).toBe("visible");
    expect(alertVisible.reason).toBe("essential-alert");

    const windowBlurred = reduceAdaptiveFloatingChromeState(drawing, { type: "window-blur" });
    expect(windowBlurred.phase).toBe("visible");
    expect(windowBlurred.reason).toBe("window-blur");
  });

  it("prefers-reduced-motion과 사용자 토글 해제를 정확히 존중한다", () => {
    const reducedDrawing = reduceAdaptiveFloatingChromeState(
      createAdaptiveFloatingChromeState({ enabled: true, reducedMotion: true }),
      { type: "stroke-start", pointerId: 2 },
    );
    const presentation = resolveAdaptiveChromeSurfacePresentation(reducedDrawing, "floating");
    expect(presentation.transition).toBe("none");
    expect(presentation.transform).toBe("none");
    expect(presentation.opacity).toBeLessThan(0.3);

    const toggledOff = reduceAdaptiveFloatingChromeState(reducedDrawing, {
      type: "toggle-enabled",
    });
    expect(toggledOff.enabled).toBe(false);
    expect(toggledOff.phase).toBe("visible");
    expect(toggledOff.reason).toBe("disabled");
  });

  it("데스크톱 >= 82% 및 모바일 >= 88% 캔버스 뷰포트 가드를 후퇴 상태에서 보장한다", () => {
    // 1280×720에서 280px 플로팅 패널이 떠 있으면 캔버스가 82% 밑으로 내려갈 수 있으나,
    // 그리는 중 후퇴(receded)하면 즉시 90%+ 캔버스 시야가 확보된다.
    const visibleCheck = evaluateAdaptiveChromeViewport({
      viewportWidthPx: 1280,
      viewportHeightPx: 720,
      floatingOverlayWidthPx: 280,
      phase: "visible",
    });
    expect(visibleCheck.ratio).toBeLessThan(0.82);

    const recededCheck = evaluateAdaptiveChromeViewport({
      viewportWidthPx: 1280,
      viewportHeightPx: 720,
      floatingOverlayWidthPx: 280,
      phase: "receded",
    });
    expect(recededCheck.passed).toBe(true);
    expect(recededCheck.ratio).toBeGreaterThanOrEqual(0.82);
    expect(recededCheck.effectiveRightOcclusionPx).toBe(0);

    const mobileCheck = evaluateAdaptiveChromeViewport({
      viewportWidthPx: 390,
      viewportHeightPx: 844,
      floatingOverlayWidthPx: 120,
      phase: "receded",
    });
    expect(mobileCheck.passed).toBe(true);
    expect(mobileCheck.ratio).toBeGreaterThanOrEqual(0.88);
  });

  it("저장소 읽기·쓰기 예외가 나도 기본값으로 안전 동작한다", () => {
    const brokenStorage = {
      getItem: () => {
        throw new Error("quota");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(readAdaptiveFloatingChromeEnabled(brokenStorage, true)).toBe(true);
    expect(writeAdaptiveFloatingChromeEnabled(brokenStorage, false)).toBe(false);

    const mem = new Map<string, string>();
    const storage = {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
    };
    expect(writeAdaptiveFloatingChromeEnabled(storage, false)).toBe(true);
    expect(readAdaptiveFloatingChromeEnabled(storage, true)).toBe(false);
  });
});
