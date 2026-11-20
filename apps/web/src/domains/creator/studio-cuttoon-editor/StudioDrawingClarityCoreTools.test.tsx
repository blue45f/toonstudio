// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioDrawingClarityCoreTools, StudioDrawingClarityHistory, type StudioDrawingClarityCoreSession } from "./StudioDrawingClarityCoreTools";

const copy = vi.hoisted(() => { const labels: Record<string, string> = {}; return { labels }; });
vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => copy.labels[ko] ?? ko }));
afterEach(() => { cleanup(); copy.labels = {}; });
function session(): StudioDrawingClarityCoreSession {
  return {
    activeSurfaceReviewLocked: false, pageEditLocked: false, canvasInteractionBlocked: false,
    scopedCanvasDrawingAvailable: false, tool: "draw", drawMode: "pen", color: "#7c5cfc", colorWheelOpen: false,
    activatePrimaryCanvasTool: vi.fn(), setColorWheelOpen: vi.fn(), menuEditUndoDisabled: false, menuEditRedoDisabled: false,
    studioMenubarContentHandlers: { undo: vi.fn(), redo: vi.fn() },
  };
}
describe("간단한 그리기의 실제 핵심 도구 연결", () => {
  it("펜·지우개는 기존 전환 명령, 되돌리기·다시는 기존 통합 기록 명령을 호출한다", () => {
    const value = session();
    render(<><StudioDrawingClarityCoreTools session={value} /><StudioDrawingClarityHistory session={value} /></>);
    fireEvent.click(screen.getByRole("button", { name: "펜" }));
    fireEvent.click(screen.getByRole("button", { name: "지우개" }));
    expect(value.activatePrimaryCanvasTool).toHaveBeenNthCalledWith(1, "draw", "pen");
    expect(value.activatePrimaryCanvasTool).toHaveBeenNthCalledWith(2, "draw", "eraser");
    fireEvent.click(screen.getByRole("button", { name: "되돌리기 · 실행취소" }));
    fireEvent.click(screen.getByRole("button", { name: "다시 · 다시실행" }));
    expect(value.studioMenubarContentHandlers.undo).toHaveBeenCalledOnce();
    expect(value.studioMenubarContentHandlers.redo).toHaveBeenCalledOnce();
    expect(document.getElementById("studio-drawing-clarity-desktop-more-slot")).not.toBeNull();
  });
  it("레이어 직접 접근은 실제 진입점을 기존 inspector 명령에 전달한다", () => {
    const open = vi.fn(); render(<StudioDrawingClarityCoreTools session={session()} onOpenLayers={open} />);
    const button = screen.getByRole("button", { name: "레이어" }); fireEvent.click(button);
    expect(open).toHaveBeenCalledExactlyOnceWith(button);
    expect(document.getElementById("studio-drawing-clarity-desktop-more-slot")).toBeTruthy();
  });
  it("현재 캔버스 동작만 선택 표시하고 열린 레이어와 색상 패널은 따로 알린다", () => {
    const actions = {
      onSelectTool: vi.fn(), onOpenFill: vi.fn(), onOpenCutSplit: vi.fn(), onOpenBubble: vi.fn(),
      onToggleBg3d: vi.fn(), onPlacePinComment: vi.fn(), onOpenAllTools: vi.fn(),
    };
    const base: StudioDrawingClarityCoreSession = { ...session(), clarityPanel: "layers", colorWheelOpen: true };
    const row = (state: StudioDrawingClarityCoreSession) =>
      <StudioDrawingClarityCoreTools session={state} onOpenLayers={vi.fn()} v4Actions={actions} />;
    const { rerender } = render(row(base));
    const selected = () => screen.queryAllByRole("button", { pressed: true });
    const byName = (name: string) => screen.getByRole("button", { name });
    expect(selected()).toEqual([byName("펜")]);
    expect(byName("색상").getAttribute("aria-expanded")).toBe("true");
    expect(byName("레이어").getAttribute("aria-expanded")).toBe("true");
    const stage = byName("3D 배경");
    expect(stage.dataset.studioRailToolId).toBe("bg3d");
    expect(stage.title).toContain("3D 배경");
    stage.focus();
    expect(document.activeElement).toBe(stage);
    fireEvent.click(stage);
    expect(actions.onToggleBg3d).toHaveBeenCalledOnce();
    const firstTools = screen.getAllByRole("button").slice(0, 5);
    expect(firstTools).toEqual(["선택", "펜", "지우개", "색상", "레이어"].map(byName));
    rerender(row({ ...base, tool: "select", advancedFillActive: true, advancedFillArmed: false }));
    expect(selected()).toEqual([byName("선택")]);
    rerender(row({ ...base, tool: "select", advancedFillActive: true, advancedFillArmed: true }));
    expect(selected()).toEqual([byName("채우기")]);
    rerender(row({ ...base, commentPinArmed: true }));
    expect(selected()).toEqual([byName("핀 댓글")]);
    rerender(row({ ...base, drawMode: "shape" }));
    expect(selected()).toHaveLength(0);
  });
  it("재지정한 키를 제목·접근성·키캡에 반영하고 해제된 키를 안내하지 않는다", () => {
    const state = { ...session(), appSettings: { shortcuts: { "tool-pen": "K", "tool-eraser": "", undo: "Mod+Shift+Y" } } };
    render(<><StudioDrawingClarityCoreTools session={state} /><StudioDrawingClarityHistory session={state} /></>);
    const pen = screen.getByRole("button", { name: "펜" });
    expect(pen.getAttribute("aria-keyshortcuts")).toBe("K");
    expect(pen.title).toBe("펜 · K");
    expect(pen.querySelector("kbd")?.textContent).toBe("K");
    const eraser = screen.getByRole("button", { name: "지우개" });
    expect(eraser.hasAttribute("aria-keyshortcuts")).toBe(false);
    expect(eraser.querySelector("kbd")).toBeNull();
    expect(eraser.title).toBe("지우개");
    expect(screen.getByRole("button", { name: /되돌리기/ }).getAttribute("aria-keyshortcuts")).toBe("Control+Shift+Y Meta+Shift+Y");
  });
  it("기존 비활성 권한과 기록 상태를 우회하지 않고 사유(title·aria-describedby)와 더보기 자리를 유지한다", () => {
    const value = { ...session(), canvasInteractionBlocked: true, menuEditUndoDisabled: true, menuEditRedoDisabled: true };
    render(<><StudioDrawingClarityCoreTools session={value} /><StudioDrawingClarityHistory session={value} /></>);
    for (const name of ["펜", "지우개", "색상", "되돌리기 · 실행취소", "다시 · 다시실행"]) {
      const button = screen.getByRole("button", { name });
      expect(button.matches(":disabled")).toBe(true);
      expect(button.getAttribute("title")).toBeTruthy();
      expect(button.getAttribute("data-studio-disabled-reason")).toBeTruthy();
      const descId = button.getAttribute("aria-describedby");
      expect(descId).toBeTruthy();
      expect(document.getElementById(descId!)?.textContent?.trim()).toBeTruthy();
      fireEvent.click(button);
    }
    expect(value.activatePrimaryCanvasTool).not.toHaveBeenCalled();
    expect(value.studioMenubarContentHandlers.undo).not.toHaveBeenCalled();
    expect(document.getElementById("studio-drawing-clarity-desktop-more-slot")).not.toBeNull();
  });
  it("9개 핵심 도구 그룹과 하단 유틸리티 구분선을 정확히 구성한다", () => {
    const actions = {
      onSelectTool: vi.fn(), onOpenFill: vi.fn(), onOpenCutSplit: vi.fn(), onOpenBubble: vi.fn(),
      onToggleBg3d: vi.fn(), onPlacePinComment: vi.fn(), onOpenAllTools: vi.fn(),
    };
    render(<StudioDrawingClarityCoreTools session={session()} onOpenLayers={vi.fn()} v4Actions={actions} />);
    const toolbar = screen.getByRole("toolbar", { name: "그리기 도구" });
    expect(toolbar.getAttribute("data-studio-rail-group-count")).toBe("9");
    expect(toolbar.querySelectorAll('[data-studio-rail-core-group="true"]')).toHaveLength(9);
  });
  it("제한된 담당 획이 허용되는 경우에도 기존 tool 전환을 사용한다", () => {
    const value = { ...session(), canvasInteractionBlocked: true, scopedCanvasDrawingAvailable: true };
    render(<StudioDrawingClarityCoreTools session={value} />);
    fireEvent.click(screen.getByRole("button", { name: "펜" }));
    expect(value.activatePrimaryCanvasTool).toHaveBeenCalledWith("draw", "pen");
  });
  it("별도 번역된 보이는 이름도 음성 조작 이름에 연속으로 포함한다", () => {
    copy.labels = { "되돌리기": "Undo caption", "실행취소": "Undo purpose", "다시": "Redo caption", "다시실행": "Redo purpose" };
    render(<StudioDrawingClarityHistory session={session()} />);
    expect(screen.getByRole("button", { name: "Undo caption · Undo purpose" }).textContent).toBe("Undo caption");
    expect(screen.getByRole("button", { name: "Redo caption · Redo purpose" }).textContent).toBe("Redo caption");
  });
});
