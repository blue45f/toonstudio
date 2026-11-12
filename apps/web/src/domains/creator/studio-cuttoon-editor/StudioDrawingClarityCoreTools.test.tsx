// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioDrawingClarityCoreTools, type StudioDrawingClarityCoreSession } from "./StudioDrawingClarityCoreTools";

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
    const value = session(), search = vi.fn();
    render(<StudioDrawingClarityCoreTools session={value} onSearch={search} />);
    fireEvent.click(screen.getByRole("button", { name: "펜" }));
    fireEvent.click(screen.getByRole("button", { name: "지우개" }));
    expect(value.activatePrimaryCanvasTool).toHaveBeenNthCalledWith(1, "draw", "pen");
    expect(value.activatePrimaryCanvasTool).toHaveBeenNthCalledWith(2, "draw", "eraser");
    fireEvent.click(screen.getByRole("button", { name: "되돌리기 · 실행취소" }));
    fireEvent.click(screen.getByRole("button", { name: "다시 · 다시실행" }));
    expect(value.studioMenubarContentHandlers.undo).toHaveBeenCalledOnce();
    expect(value.studioMenubarContentHandlers.redo).toHaveBeenCalledOnce();
    const trigger = screen.getByRole("button", { name: "도구 찾기" });
    fireEvent.click(trigger); expect(search).toHaveBeenCalledWith(trigger);
  });
  it("기존 비활성 권한과 기록 상태를 우회하지 않고 검색은 유지한다", () => {
    const value = { ...session(), canvasInteractionBlocked: true, menuEditUndoDisabled: true, menuEditRedoDisabled: true }, search = vi.fn();
    render(<StudioDrawingClarityCoreTools session={value} onSearch={search} />);
    for (const name of ["펜", "지우개", "색상", "되돌리기 · 실행취소", "다시 · 다시실행"]) {
      const button = screen.getByRole("button", { name }); expect(button.matches(":disabled")).toBe(true); fireEvent.click(button);
    }
    expect(value.activatePrimaryCanvasTool).not.toHaveBeenCalled();
    expect(value.studioMenubarContentHandlers.undo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "도구 찾기" })); expect(search).toHaveBeenCalledOnce();
  });
  it("제한된 담당 획이 허용되는 경우에도 기존 tool 전환을 사용한다", () => {
    const value = { ...session(), canvasInteractionBlocked: true, scopedCanvasDrawingAvailable: true };
    render(<StudioDrawingClarityCoreTools session={value} onSearch={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "펜" }));
    expect(value.activatePrimaryCanvasTool).toHaveBeenCalledWith("draw", "pen");
  });
  it("별도 번역된 보이는 이름도 음성 조작 이름에 연속으로 포함한다", () => {
    copy.labels = { "되돌리기": "Undo caption", "실행취소": "Undo purpose", "다시": "Redo caption", "다시실행": "Redo purpose" };
    render(<StudioDrawingClarityCoreTools session={session()} onSearch={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Undo caption · Undo purpose" }).textContent).toBe("Undo caption");
    expect(screen.getByRole("button", { name: "Redo caption · Redo purpose" }).textContent).toBe("Redo caption");
  });
});
