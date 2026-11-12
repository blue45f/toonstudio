// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioReliabilityStatusRail } from "../StudioReliabilityStatusRail";
import { enterStudioSafeMode, reportStudioReliabilitySignal, resetStudioReliabilityStatus } from "../studio-reliability-status-store";
import { disposeStudioSafeModeRuntime } from "../studio-safe-mode-runtime";
import { DrawingClarityContext, type DrawingClarityState } from "./StudioDrawingClarityContext";
import { requestStudioDrawingReliability } from "./studio-drawing-assistance-channel";

const state: DrawingClarityState = { active: true, available: true, panel: null, open: vi.fn(), reveal: vi.fn(), close: vi.fn(), chooseSimple: vi.fn(), showSavedLayout: vi.fn() };
afterEach(() => { cleanup(); disposeStudioSafeModeRuntime(); resetStudioReliabilityStatus(); });
function surface() { return render(<DrawingClarityContext.Provider value={state}><div data-studio-editor="true">
  <button data-studio-clarity-more-trigger="true" onClick={event => requestStudioDrawingReliability(event.currentTarget)}>더보기</button><StudioReliabilityStatusRail />
</div></DrawingClarityContext.Provider>); }

describe("그리기 문제 해결의 실제 상태와 재접근", () => {
  it("정상 상태 점 대신 같은 편집기의 명명된 진입으로 실제 상태를 읽고 Escape 뒤 돌아간다", () => {
    surface(); const trigger = screen.getByRole("button", { name: "더보기" });
    expect(document.querySelector("[data-studio-reliability-chip]")).toBeNull();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "저장·화면 문제 해결" });
    expect(dialog.querySelector('[data-studio-reliability-detail-channel="save"]')?.textContent).toBe("이상 없음");
    expect(screen.getByText("화면 표시")).toBeTruthy(); expect(screen.getByText("저장 공간")).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(trigger);
  });
  it("다른 편집기의 요청은 이 편집기의 진단을 열지 않는다", () => {
    surface(); const outside = document.createElement("button"); document.body.append(outside);
    try { act(() => requestStudioDrawingReliability(outside)); expect(screen.queryByRole("dialog")).toBeNull(); }
    finally { outside.remove(); }
  });
  it("실제 저장 실패와 안전 모드는 More로 감추지 않고 원래 복구 행동을 유지한다", () => {
    surface(); act(() => {
      reportStudioReliabilitySignal({ channel: "save", level: "failed", title: "저장에 실패했습니다", at: 1 });
      enterStudioSafeMode("gpu-device-lost", 1);
    });
    expect(screen.getByText("저장에 실패했습니다")).toBeTruthy();
    expect(screen.getByRole("button", { name: "안전 모드 해제" })).toBeTruthy();
    const chip = document.querySelector<HTMLButtonElement>("[data-studio-reliability-chip]");
    expect(chip?.className).toContain("size-12"); fireEvent.click(chip!);
    expect(screen.getByRole("dialog", { name: "저장·화면 문제 해결" }).textContent).toContain("저장에 실패했습니다");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" }); expect(document.activeElement).toBe(chip);
  });
});
