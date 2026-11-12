// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { DrawingClarityContext, type DrawingClarityState } from "../studio-cuttoon-editor/StudioDrawingClarityContext";
import { setStudioWorkspaceArranging } from "../studio-workspace-arrangement";
import { StudioShellFloatingLayoutManager } from "./StudioShellFloatingLayoutManager";
import { StudioShellFloatingLayoutContext, useStudioShellFloatingLayout } from "./studio-shell-floating-layout-context";
import { requestStudioShellFloatingLayoutManagerOpen } from "./studio-shell-floating-layout-events";

vi.mock("@/shared/hooks/use-media-query", () => ({ useMediaQuery: () => false }));
vi.mock("./StudioShellFloatingTarget", () => ({ StudioShellFloatingTarget: ({ children }: { children: ReactNode }) => children }));
const clarity: DrawingClarityState = { active: true, available: true, panel: null, open: vi.fn(), reveal: vi.fn(), close: vi.fn(), chooseSimple: vi.fn(), showSavedLayout: vi.fn() };
afterEach(() => { cleanup(); setStudioWorkspaceArranging(false); });
function Surface({ active = true, failure = false }: { readonly active?: boolean; readonly failure?: boolean }) {
  const runtime = useStudioShellFloatingLayout();
  return <DrawingClarityContext.Provider value={{ ...clarity, active }}><StudioShellFloatingLayoutContext.Provider value={{ ...runtime, failure: failure ? "storage-unavailable" : null }}>
    <div data-studio-editor="true"><button data-studio-clarity-more-trigger="true" onClick={event => requestStudioShellFloatingLayoutManagerOpen(event.currentTarget)}>더보기</button><StudioShellFloatingLayoutManager /></div>
  </StudioShellFloatingLayoutContext.Provider></DrawingClarityContext.Provider>;
}
describe("화면과 작업 환경의 목적별 진입", () => {
  it("정상 기본 화면의 상시 보기 설정을 접고 같은 More에서 열어 Escape 뒤 실제 진입점으로 복귀한다", () => {
    render(<Surface />); const trigger = screen.getByRole("button", { name: "더보기" });
    expect(document.querySelector("[data-studio-shell-view-options]")?.hasAttribute("hidden")).toBe(true);
    fireEvent.click(trigger);
    expect(screen.getByRole("heading", { name: "화면과 작업 환경" })).toBeTruthy();
    const close = screen.getByRole("button", { name: "보기 설정 닫기" }); expect(document.activeElement).toBe(close);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(trigger);
  });
  it("기존 무인수 요청과 비Clarity launcher는 그대로 지원한다", () => {
    render(<Surface active={false} />); expect(screen.getByRole("button", { name: /보기 설정/ })).toBeTruthy();
    act(() => requestStudioShellFloatingLayoutManagerOpen()); expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "보기 설정 닫기" }));
    expect(screen.getByRole("button", { name: /보기 설정/ })).toBe(document.activeElement);
  });
  it("배치 편집 중이거나 설정 저장 실패이면 원래 즉시 접근을 유지한다", () => {
    const view = render(<Surface failure />);
    expect(document.querySelector("[data-studio-shell-view-options]")?.hasAttribute("hidden")).toBe(false);
    view.rerender(<Surface />); act(() => setStudioWorkspaceArranging(true));
    expect(document.querySelector("[data-studio-shell-view-options]")?.hasAttribute("hidden")).toBe(false);
    expect(screen.getByRole("button", { name: /배치 편집 중/ })).toBeTruthy();
  });
});
