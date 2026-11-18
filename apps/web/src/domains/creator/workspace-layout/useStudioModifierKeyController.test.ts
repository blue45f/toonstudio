// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_MODIFIER_KEY_CONFIG } from "./studio-modifier-key-map";
import { useStudioModifierKeyController } from "./useStudioModifierKeyController";

import type { ReactElement } from "react";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Harness({
  onActiveToolChange,
}: {
  readonly onActiveToolChange?: (toolId: string) => void;
}): ReactElement {
  const controller = useStudioModifierKeyController({
    config: DEFAULT_MODIFIER_KEY_CONFIG,
    initialToolId: "pen",
    onActiveToolChange,
  });
  return createElement(
    "div",
    null,
    createElement("output", { "data-testid": "active-tool" }, controller.state.activeToolId),
    createElement("output", { "data-testid": "active-label" }, controller.activeToolLabel),
    createElement("output", { "data-testid": "spring-flag" }, String(controller.state.isSpringActive)),
    createElement(
      "button",
      {
        type: "button",
        onClick: () => controller.cycleRotationForRule("mod-b-rotation"),
      },
      "수동 순환",
    ),
  );
}

describe("useStudioModifierKeyController — 실시간 window 보조키 컨트롤러", () => {
  it("길게 누름 타이머 경과 시 일시 전환하고 keyup 및 blur에서 직전 도구를 복원하며 짧은 탭으로 순환한다", () => {
    vi.useFakeTimers();
    let fakeNow = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => fakeNow);
    const onToolChange = vi.fn();

    render(createElement(Harness, { onActiveToolChange: onToolChange }));
    expect(screen.getByTestId("active-tool").textContent).toBe("pen");

    act(() => {
      fireEvent.keyDown(window, { key: " ", code: "Space" });
      fakeNow += 210;
      vi.advanceTimersByTime(210);
    });
    expect(screen.getByTestId("active-tool").textContent).toBe("pan");
    expect(screen.getByTestId("spring-flag").textContent).toBe("true");

    act(() => {
      fakeNow += 40;
      fireEvent.keyUp(window, { key: " ", code: "Space" });
    });
    expect(screen.getByTestId("active-tool").textContent).toBe("pen");
    expect(screen.getByTestId("spring-flag").textContent).toBe("false");

    act(() => {
      fireEvent.keyDown(window, { key: "b" });
      fakeNow += 50;
      fireEvent.keyUp(window, { key: "b" });
    });
    expect(screen.getByTestId("active-tool").textContent).toBe("pencil");

    act(() => {
      fireEvent.keyDown(window, { key: "Alt" });
      fakeNow += 220;
      vi.advanceTimersByTime(220);
    });
    expect(screen.getByTestId("active-tool").textContent).toBe("eyedropper");

    act(() => {
      fireEvent.blur(window);
    });
    expect(screen.getByTestId("active-tool").textContent).toBe("pencil");

    fireEvent.click(screen.getByRole("button", { name: "수동 순환" }));
    expect(screen.getByTestId("active-tool").textContent).toBe("brush");
    expect(onToolChange).toHaveBeenCalled();
  });
});
