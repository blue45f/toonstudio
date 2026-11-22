// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioMobileThreeModeShell } from "./StudioMobileThreeModeShell";
import { StudioZeroBarrierUxPanel } from "./StudioZeroBarrierUxPanel";
import {
  IOS_KEYBOARD_OPEN_THRESHOLD_PX,
  MOBILE_FPS_CAP_POWER_SAVER,
  MOBILE_FPS_CAP_STANDARD,
  MOBILE_THREE_MODE_CHROME_SLOTS,
  MOBILE_THREE_MODE_PROFILES,
  MOBILE_THREE_MODE_REFERENCE_VIEWPORT,
  computeIosSafariKeyboardToolbarOffset,
  createMobileThreeModeShellState,
  evaluateMobileThreeModeViewport,
  reduceMobileThreeModeShellState,
  resolveMobileBatterySaverContract,
  shouldRenderMobileFrame,
  subscribeVisualViewportKeyboardOffset,
} from "./mobile-three-mode-shell";

const BANNED_TRANSLATIONESE =
  /(하는 것을 가능하게 합니다|직관적인 경험을 제공합니다|원활한 워크플로우를 보장)/u;

class MockVisualViewport extends EventTarget {
  height: number;
  offsetTop: number;
  width: number;

  constructor(width: number, height: number, offsetTop = 0) {
    super();
    this.width = width;
    this.height = height;
    this.offsetTop = offsetTop;
  }
}

function mockMatchMedia(reduced = false): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "visualViewport");
});

describe("모바일 3-모드 초집중 셸 순수 컨트롤러 (#051–#055)", () => {
  it("스케치 · 대사 식자 · 컷 검수 3개 모드와 각 5개 엄지 독 핵심 버튼 계약을 지킨다", () => {
    expect(MOBILE_THREE_MODE_PROFILES).toHaveLength(3);
    expect(MOBILE_THREE_MODE_PROFILES.map((profile) => profile.labelKo)).toEqual([
      "스케치",
      "대사 식자",
      "컷 검수",
    ]);
    expect(MOBILE_THREE_MODE_CHROME_SLOTS.thumbDockButtonCount).toBe(5);
    expect(MOBILE_THREE_MODE_CHROME_SLOTS.minTouchTargetPx).toBeGreaterThanOrEqual(44);

    for (const profile of MOBILE_THREE_MODE_PROFILES) {
      expect(profile.dockActions).toHaveLength(5);
      expect(BANNED_TRANSLATIONESE.test(profile.summaryKo)).toBe(false);
      for (const action of profile.dockActions) {
        expect(action.labelKo.trim().length).toBeGreaterThan(0);
        expect(BANNED_TRANSLATIONESE.test(action.labelKo)).toBe(false);
      }
    }
  });

  it("390×844 기준 >= 82% 캔버스 점유(기본 88.2%)를 보장한다", () => {
    const check = evaluateMobileThreeModeViewport({
      viewportWidthPx: MOBILE_THREE_MODE_REFERENCE_VIEWPORT.widthPx,
      viewportHeightPx: MOBILE_THREE_MODE_REFERENCE_VIEWPORT.heightPx,
    });
    expect(check.viewportWidthPx).toBe(390);
    expect(check.viewportHeightPx).toBe(844);
    expect(check.canvasHeightPx).toBe(744);
    expect(check.ratio).toBeGreaterThanOrEqual(0.82);
    expect(check.passed).toBe(true);
    expect(check.strictMobileV2Passed).toBe(true);
  });

  it("저전력 배터리 절약 FPS 캡(30fps vs 60fps) 토글 계약과 프레임 게이트가 정확히 동작한다", () => {
    const standard = resolveMobileBatterySaverContract(false);
    expect(standard.enabled).toBe(false);
    expect(standard.targetFps).toBe(MOBILE_FPS_CAP_STANDARD);
    expect(standard.frameIntervalMs).toBeCloseTo(16.67, 1);
    expect(shouldRenderMobileFrame(100, 117, standard)).toBe(true);

    const powerSaver = resolveMobileBatterySaverContract(true);
    expect(powerSaver.enabled).toBe(true);
    expect(powerSaver.targetFps).toBe(MOBILE_FPS_CAP_POWER_SAVER);
    expect(powerSaver.frameIntervalMs).toBeCloseTo(33.33, 1);
    expect(powerSaver.reduceEffects).toBe(true);
    expect(powerSaver.throttleLivePreview).toBe(true);

    // 30fps 절전 모드에서는 16ms 경과 프레임은 스킵하고 34ms 경과 프레임만 렌더한다.
    expect(shouldRenderMobileFrame(null, 100, powerSaver)).toBe(true);
    expect(shouldRenderMobileFrame(100, 116, powerSaver)).toBe(false);
    expect(shouldRenderMobileFrame(100, 134, powerSaver)).toBe(true);

    const initial = createMobileThreeModeShellState();
    const toggledOn = reduceMobileThreeModeShellState(initial, { type: "toggle-battery-saver" });
    expect(toggledOn.batterySaver.enabled).toBe(true);
    expect(toggledOn.batterySaver.targetFps).toBe(30);
    const toggledOff = reduceMobileThreeModeShellState(toggledOn, { type: "toggle-battery-saver" });
    expect(toggledOff.batterySaver.enabled).toBe(false);
    expect(toggledOff.batterySaver.targetFps).toBe(60);
  });

  it("iOS Safari 가상 키보드 visualViewport.height + offsetTop 오프셋을 정확히 보정한다 (#055)", () => {
    // 1) 키보드 닫힘(390×844 전체 가시)
    const closed = computeIosSafariKeyboardToolbarOffset({
      layoutViewportHeightPx: 844,
      visualViewportHeightPx: 844,
      visualViewportOffsetTopPx: 0,
      safeAreaBottomPx: 34,
    });
    expect(closed.keyboardOpen).toBe(false);
    expect(closed.toolbarBottomOffsetPx).toBe(0);
    expect(closed.bottomSafePaddingPx).toBe(34);
    expect(closed.dockTransform).toBe("none");
    expect(closed.layoutShiftRisk).toBe("zero");

    // 2) 주소창 축소 등 미세 변동(< 120px)은 가상 키보드로 오탐하지 않는다.
    const minorChromeDelta = computeIosSafariKeyboardToolbarOffset({
      layoutViewportHeightPx: 844,
      visualViewportHeightPx: 844 - (IOS_KEYBOARD_OPEN_THRESHOLD_PX - 20),
      visualViewportOffsetTopPx: 0,
    });
    expect(minorChromeDelta.keyboardOpen).toBe(false);
    expect(minorChromeDelta.toolbarBottomOffsetPx).toBe(0);

    // 3) 가상 키보드 열림(height=508, offsetTop=0) -> 336px 위로 정확히 밀착
    const keyboardNoScroll = computeIosSafariKeyboardToolbarOffset({
      layoutViewportHeightPx: 844,
      visualViewportHeightPx: 508,
      visualViewportOffsetTopPx: 0,
      safeAreaBottomPx: 34,
    });
    expect(keyboardNoScroll.keyboardOpen).toBe(true);
    expect(keyboardNoScroll.keyboardHeightPx).toBe(336);
    expect(keyboardNoScroll.toolbarBottomOffsetPx).toBe(336);
    expect(keyboardNoScroll.bottomSafePaddingPx).toBe(0);
    expect(keyboardNoScroll.dockTransform).toBe("translate3d(0, -336px, 0)");

    // 4) iOS Safari 입력칸 자동 스크롤(height=508, offsetTop=48) -> 844 - (508 + 48) = 288px 보정
    const keyboardScrolled = computeIosSafariKeyboardToolbarOffset({
      layoutViewportHeightPx: 844,
      visualViewportHeightPx: 508,
      visualViewportOffsetTopPx: 48,
    });
    expect(keyboardScrolled.keyboardOpen).toBe(true);
    expect(keyboardScrolled.toolbarBottomOffsetPx).toBe(288);
    expect(keyboardScrolled.dockTransform).toBe("translate3d(0, -288px, 0)");

    // 5) 러버밴드 바운스(음수 offsetTop / 초과 합산)도 음수 오프셋 없이 안전 클램프
    const overscrolled = computeIosSafariKeyboardToolbarOffset({
      layoutViewportHeightPx: 844,
      visualViewportHeightPx: 508,
      visualViewportOffsetTopPx: 420,
    });
    expect(overscrolled.toolbarBottomOffsetPx).toBe(0);
    expect(overscrolled.dockTransform).toBe("none");
  });

  it("subscribeVisualViewportKeyboardOffset이 resize·scroll 이벤트를 실시간 전달하고 해제한다", () => {
    const vv = new MockVisualViewport(390, 844, 0);
    const mockWin = {
      innerWidth: 390,
      innerHeight: 844,
      visualViewport: vv,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const received: number[] = [];
    const unsubscribe = subscribeVisualViewportKeyboardOffset(mockWin, (offset) => {
      received.push(offset.toolbarBottomOffsetPx);
    });

    expect(received).toEqual([0]);

    vv.height = 508;
    vv.offsetTop = 40;
    vv.dispatchEvent(new Event("resize"));
    expect(received[received.length - 1]).toBe(296);

    vv.offsetTop = 88;
    vv.dispatchEvent(new Event("scroll"));
    expect(received[received.length - 1]).toBe(248);

    unsubscribe();
    vv.offsetTop = 0;
    vv.dispatchEvent(new Event("scroll"));
    expect(received[received.length - 1]).toBe(248);
  });
});

describe("StudioMobileThreeModeShell 컴포넌트 · visualViewport 보정 · Zero-Barrier 연결", () => {
  it("3-모드 전환·5버튼 엄지 독(44×44px · keep-all)·30fps 절전 토글·Escape 포커스 복귀가 동작한다", () => {
    mockMatchMedia(false);
    const onBatterySaverChange = vi.fn();
    render(<StudioMobileThreeModeShell onBatterySaverChange={onBatterySaverChange} />);

    const dock = screen.getByTestId("mobile-thumb-dock");
    expect(dock.querySelectorAll("button")).toHaveLength(5);

    // 모든 엄지 독 버튼이 44×44px 터치 타깃 + keep-all + reduced-motion 클래스를 유지한다.
    for (const btn of dock.querySelectorAll("button")) {
      expect(btn.className).toContain("min-h-11");
      expect(btn.className).toContain("min-w-11");
      expect(btn.className).toContain("[word-break:keep-all]");
      expect(btn.className).toContain("motion-reduce:transition-none");
    }

    // 저전력 30fps 토글
    const batteryToggle = screen.getByTestId("mobile-battery-saver-toggle");
    expect(batteryToggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(batteryToggle);
    expect(batteryToggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("studio-mobile-three-mode-shell").getAttribute("data-fps-cap")).toBe(
      "30",
    );
    expect(onBatterySaverChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, targetFps: 30, frameIntervalMs: 33.33 }),
    );

    // 대사 식자 모드 전환 -> 대사 입력 열기 -> Escape 시 트리거 버튼으로 포커스 복귀
    fireEvent.click(screen.getByTestId("mobile-mode-tab-lettering"));
    expect(dock.querySelectorAll("button")).toHaveLength(5);
    const dialogueBtn = screen.getByTestId("mobile-dock-btn-dialogue-edit");
    fireEvent.click(dialogueBtn);
    const dialogueInput = screen.getByTestId("mobile-dialogue-input");
    expect(document.activeElement).toBe(dialogueInput);

    fireEvent.keyDown(dialogueInput, { key: "Escape" });
    expect(screen.queryByTestId("mobile-dialogue-composer")).toBeNull();
    expect(document.activeElement).toBe(dialogueBtn);

    // 컷 검수 모드 전환 -> 검수 통과 표시
    fireEvent.click(screen.getByTestId("mobile-mode-tab-review"));
    expect(dock.querySelectorAll("button")).toHaveLength(5);
    fireEvent.click(screen.getByTestId("mobile-dock-btn-approve-cut"));
    expect(screen.getByTestId("mobile-cut-approved-badge")).toBeTruthy();
  });

  it("실시간 visualViewport resize·scroll 이벤트에 맞춰 하단 엄지 독 transform을 즉시 보정한다 (#055)", () => {
    mockMatchMedia(false);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    const vv = new MockVisualViewport(390, 844, 0);
    Object.defineProperty(window, "visualViewport", { configurable: true, value: vv });

    render(<StudioMobileThreeModeShell />);
    const dock = screen.getByTestId("mobile-thumb-dock");
    expect(dock.getAttribute("data-keyboard-open")).toBe("false");
    expect(dock.style.transform).toBe("none");

    // iOS Safari 키보드 열림 + 입력칸 스크롤(offsetTop=48)
    act(() => {
      vv.height = 508;
      vv.offsetTop = 48;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(dock.getAttribute("data-keyboard-open")).toBe("true");
    expect(dock.getAttribute("data-keyboard-offset-px")).toBe("288");
    expect(dock.style.transform).toBe("translate3d(0, -288px, 0)");

    // 키보드 닫힘 시 원위치 복귀
    act(() => {
      vv.height = 844;
      vv.offsetTop = 0;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(dock.getAttribute("data-keyboard-open")).toBe("false");
    expect(dock.getAttribute("data-keyboard-offset-px")).toBe("0");
    expect(dock.style.transform).toBe("none");
  });

  it("StudioZeroBarrierUxPanel에 모바일 3-모드 셸과 5-모드 집중 크롬이 실제 연결되어 렌더링된다", () => {
    mockMatchMedia(false);
    render(<StudioZeroBarrierUxPanel />);

    expect(screen.getByTestId("studio-mobile-three-mode-shell")).toBeTruthy();
    expect(screen.getByTestId("studio-adaptive-mode-chrome-bar")).toBeTruthy();
  });
});
