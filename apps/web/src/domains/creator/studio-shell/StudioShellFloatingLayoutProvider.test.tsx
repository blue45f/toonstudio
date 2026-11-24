// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioShellFloatingLayoutProvider } from "./StudioShellFloatingLayoutProvider";
import {
  STUDIO_SHELL_DRAWING_AUTO_HIDE_RELEASE_MS,
  isStudioShellDrawingSurfaceTarget,
} from "./studio-shell-drawing-auto-hide";
import { useStudioShellFloatingLayout } from "./studio-shell-floating-layout-context";
import { resetStudioStrokeFocusActivityForTests, setStudioStrokeFocusActivity, STUDIO_STROKE_FOCUS_SETTLE_MS } from "../studio-stroke-focus-activity";
import { setStudioWorkspaceArranging } from "../studio-workspace-arrangement";

vi.mock("./studio-shell-floating-visibility-sqlite", () => ({
  acquireProductStudioShellFloatingVisibilityRepository: async () => ({
    load: async () => ({
      state: { version: 1, hidden: [], autoHideWhileDrawing: true },
      persisted: false,
      failure: null,
    }),
    save: async (state: unknown) => ({ state, status: "persisted", failure: null }),
    flush: async () => undefined,
  }),
}));
function Probe() {
  const shell = useStudioShellFloatingLayout();
  return (
    <>
      <output
        data-testid="floating-runtime"
        data-auto-hide={String(shell.autoHideWhileDrawing)}
        data-active={String(shell.drawingAutoHideActive)}
        data-focus={String(shell.focusModeActive)}
        data-workspace-visible={String(shell.isVisible("workspace-switcher"))}
        data-collaboration-visible={String(shell.isVisible("collaboration"))}
        data-collaboration-configured={String(shell.isConfiguredVisible("collaboration"))}
        data-collaboration-mounted={String(shell.isSurfaceMounted("collaboration"))}
      />
      <button type="button" onClick={() => shell.setAutoHideWhileDrawing(!shell.autoHideWhileDrawing)}>
        작화 중 자동 숨김 전환
      </button>
      <button type="button" onClick={shell.enterFocusMode}>집중 보기</button>
      <button type="button" onClick={shell.exitFocusMode}>집중 보기 해제</button>
      <button
        type="button"
        onClick={() => shell.setSurfaceMounted("collaboration", true)}
      >
        협업 표시 가능
      </button>
      <button
        type="button"
        onClick={() => shell.setVisible("collaboration", false)}
      >
        협업 숨김
      </button>
    </>
  );
}
function dispatchPen(
  target: Element,
  type: "pointerdown" | "pointerup" | "pointercancel",
  pointerId = 7,
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerType: { value: "pen" },
    pointerId: { value: pointerId },
    button: { value: 0 },
    isPrimary: { value: true },
  });
  target.dispatchEvent(event);
}
beforeEach(() => {
  vi.useFakeTimers();
  setStudioWorkspaceArranging(false);
  sessionStorage.setItem(
    "toonspectrum:studio:shell-floating-visibility:v1",
    JSON.stringify({ version: 1, hidden: [], autoHideWhileDrawing: true }),
  );
});

afterEach(() => {
  setStudioWorkspaceArranging(false);
  cleanup();
  resetStudioStrokeFocusActivityForTests();
  sessionStorage.clear();
  vi.useRealTimers();
});

describe("Studio shell drawing auto-hide", () => {
  it("recognizes drawing pixels but ignores controls and outside content", () => {
    document.body.innerHTML = `
      <div data-studio-canvas-viewport>
        <canvas id="drawing"></canvas>
        <button id="control" data-studio-canvas-control>도구</button>
      </div>
      <canvas id="outside"></canvas>
    `;
    expect(isStudioShellDrawingSurfaceTarget(document.querySelector("#drawing"))).toBe(true);
    expect(isStudioShellDrawingSurfaceTarget(document.querySelector("#control"))).toBe(false);
    expect(isStudioShellDrawingSurfaceTarget(document.querySelector("#outside"))).toBe(false);
  });

  it.each([false, true])("자동 숨김 %s에서 획 사이에는 가시성이 바뀔 때만 커밋한다", async (enabled) => {
    if (!enabled) sessionStorage.clear();
    const onRender = vi.fn();
    render(
      <Profiler id="floating-layout" onRender={onRender}>
        <StudioShellFloatingLayoutProvider><Probe /></StudioShellFloatingLayoutProvider>
      </Profiler>,
    );
    await act(async () => {});
    const runtime = screen.getByTestId("floating-runtime");
    expect(runtime.dataset.autoHide).toBe(String(enabled));
    const commits: number[] = [];
    for (const pressed of [true, false, true, false]) {
      onRender.mockClear();
      act(() => setStudioStrokeFocusActivity("canvas-stroke", pressed));
      expect(runtime.dataset.active).toBe(String(enabled));
      commits.push(onRender.mock.calls.length);
    }
    onRender.mockClear();
    act(() => vi.advanceTimersByTime(STUDIO_STROKE_FOCUS_SETTLE_MS));
    expect(runtime.dataset.active).toBe("false");
    commits.push(onRender.mock.calls.length);
    expect(commits).toEqual(enabled ? [1, 0, 0, 0, 1] : [0, 0, 0, 0, 0]);
  });

  it("획이 진행되는 동안 자동 숨김 설정이나 배치 모드를 바꾸면 현재 상태를 반영한다", async () => {
    sessionStorage.clear();
    act(() => setStudioStrokeFocusActivity("canvas-stroke", true));
    await act(async () => {
      render(<StudioShellFloatingLayoutProvider><Probe /></StudioShellFloatingLayoutProvider>);
    });
    const runtime = screen.getByTestId("floating-runtime");
    const toggle = screen.getByRole("button", { name: "작화 중 자동 숨김 전환" });
    expect(runtime.dataset.active).toBe("false");
    await act(async () => { fireEvent.click(toggle); });
    expect(runtime.dataset.active).toBe("true");
    act(() => setStudioWorkspaceArranging(true));
    expect(runtime.dataset.active).toBe("false");
    act(() => setStudioStrokeFocusActivity("canvas-stroke", false));
    act(() => setStudioWorkspaceArranging(false));
    expect(runtime.dataset.active).toBe("true");
    await act(async () => { fireEvent.click(toggle); });
    expect(runtime.dataset.active).toBe("false");
  });

  it("hides during pen strokes and restores after the continuation delay", () => {
    render(
      <StudioShellFloatingLayoutProvider>
        <div data-studio-canvas-viewport>
          <canvas data-testid="drawing-canvas" />
          <button data-testid="canvas-control" data-studio-canvas-control>도구</button>
        </div>
        <Probe />
      </StudioShellFloatingLayoutProvider>,
    );

    const runtime = screen.getByTestId("floating-runtime");
    const canvas = screen.getByTestId("drawing-canvas");
    expect(runtime.getAttribute("data-auto-hide")).toBe("true");
    expect(runtime.getAttribute("data-active")).toBe("false");
    act(() => dispatchPen(canvas, "pointerdown"));
    expect(runtime.getAttribute("data-active")).toBe("true");

    act(() => dispatchPen(canvas, "pointerup"));
    expect(runtime.getAttribute("data-active")).toBe("true");

    act(() => vi.advanceTimersByTime(STUDIO_SHELL_DRAWING_AUTO_HIDE_RELEASE_MS - 1));
    expect(runtime.getAttribute("data-active")).toBe("true");

    act(() => vi.advanceTimersByTime(1));
    expect(runtime.getAttribute("data-active")).toBe("false");

    act(() => dispatchPen(screen.getByTestId("canvas-control"), "pointerdown", 9));
    expect(runtime.getAttribute("data-active")).toBe("false");
  });

  it("preserves configured visibility through temporary focus mode and reports mounted surfaces", () => {
    render(
      <StudioShellFloatingLayoutProvider>
        <Probe />
      </StudioShellFloatingLayoutProvider>,
    );

    const runtime = screen.getByTestId("floating-runtime");
    expect(runtime.getAttribute("data-focus")).toBe("false");
    expect(runtime.getAttribute("data-collaboration-visible")).toBe("true");
    expect(runtime.getAttribute("data-collaboration-configured")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /^집중 보기$/u }));
    expect(runtime.getAttribute("data-focus")).toBe("true");
    expect(runtime.getAttribute("data-workspace-visible")).toBe("true");
    expect(runtime.getAttribute("data-collaboration-visible")).toBe("false");
    expect(runtime.getAttribute("data-collaboration-configured")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "집중 보기 해제" }));
    expect(runtime.getAttribute("data-focus")).toBe("false");
    expect(runtime.getAttribute("data-collaboration-visible")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "협업 표시 가능" }));
    expect(runtime.getAttribute("data-collaboration-mounted")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /^집중 보기$/u }));
    fireEvent.click(screen.getByRole("button", { name: "협업 숨김" }));
    expect(runtime.getAttribute("data-focus")).toBe("false");
    expect(runtime.getAttribute("data-collaboration-configured")).toBe("false");
  });

  it("keeps floating controls visible while workspace arrangement is active", () => {
    render(
      <StudioShellFloatingLayoutProvider>
        <div data-studio-canvas-viewport>
          <canvas data-testid="arrangement-canvas" />
        </div>
        <Probe />
      </StudioShellFloatingLayoutProvider>,
    );

    const runtime = screen.getByTestId("floating-runtime");
    const canvas = screen.getByTestId("arrangement-canvas");
    act(() => setStudioWorkspaceArranging(true));
    act(() => dispatchPen(canvas, "pointerdown", 21));
    expect(runtime.getAttribute("data-active")).toBe("false");

    act(() => setStudioWorkspaceArranging(false));
    act(() => dispatchPen(canvas, "pointerdown", 22));
    expect(runtime.getAttribute("data-active")).toBe("true");
  });
});
