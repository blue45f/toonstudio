// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVisualShortcutHud } from "./StudioVisualShortcutHud";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("StudioVisualShortcutHud", () => {
  it("단축키 큐를 표시하고 1.4초 후 자동으로 숨긴다", () => {
    vi.useFakeTimers();

    render(
      <StudioVisualShortcutHud
        cue={{ id: 1, keycap: "Q", label: "방사형 휠", value: "열림" }}
      />,
    );

    const hud = screen.getByRole("status");
    expect(hud.textContent).toContain("Q");
    expect(hud.textContent).toContain("방사형 휠");
    expect(hud.textContent).toContain("열림");

    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("좌하단 줌 캡슐과 우하단 유틸리티 클러스터 액션을 호출한다", () => {
    const onResetZoom = vi.fn();
    const onToggleFlipHorizontal = vi.fn();
    const onOpenQuickWheel = vi.fn();
    const onToggleShortcutHints = vi.fn();

    render(
      <StudioVisualShortcutHud
        cue={null}
        zoomPercent={150}
        onResetZoom={onResetZoom}
        flipHorizontal={false}
        onToggleFlipHorizontal={onToggleFlipHorizontal}
        onOpenQuickWheel={onOpenQuickWheel}
        onToggleShortcutHints={onToggleShortcutHints}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /현재 배율 150%/ }));
    expect(onResetZoom).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "캔버스 좌우 반전" }));
    expect(onToggleFlipHorizontal).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /방사형 퀵 휠 열기/ }));
    expect(onOpenQuickWheel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "단축키 안내 보기" }));
    expect(onToggleShortcutHints).toHaveBeenCalledTimes(1);
  });
});
