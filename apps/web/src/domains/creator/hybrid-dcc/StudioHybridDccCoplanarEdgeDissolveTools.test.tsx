// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioHybridDccCoplanarEdgeDissolveTools, type StudioHybridDccCoplanarEdgeDissolveToolsProps } from "./StudioHybridDccCoplanarEdgeDissolveTools";

type Model = StudioHybridDccCoplanarEdgeDissolveToolsProps["model"];
function model(overrides: Partial<Model> = {}): Model {
  return { status: "empty", engaged: false, pending: false, applying: false, canPrepare: true, canApply: false,
    preview: null, error: "", notice: "", prepare: vi.fn(), apply: vi.fn(), cancel: vi.fn(), ...overrides };
}
afterEach(cleanup);

describe("공유 모서리 치유의 실제 조작 안내", () => {
  it("준비된 선택만 미리보기를 요청하며 확정 전 적용은 잠근다", () => {
    const state = model(); render(<StudioHybridDccCoplanarEdgeDissolveTools model={state} unavailable={null} busy={false} />);
    expect(screen.getByRole("heading", { name: "공유 모서리 치유" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "선택 모서리 미리보기" }));
    expect(state.prepare).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "치유 적용" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "치유 취소" }).hasAttribute("disabled")).toBe(true);
    expect(state.apply).not.toHaveBeenCalled();
  });

  it("선택이 없거나 다른 편집이 진행 중이면 미리보기와 적용을 막는다", () => {
    const state = model({ canPrepare: false });
    const view = render(<StudioHybridDccCoplanarEdgeDissolveTools model={state} unavailable="현재 오브젝트의 모서리를 선택하세요." busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "선택 모서리 미리보기" }));
    expect(state.prepare).not.toHaveBeenCalled();
    view.rerender(<StudioHybridDccCoplanarEdgeDissolveTools model={model({ canApply: true })} unavailable={null} busy />);
    expect(screen.getByRole("button", { name: "선택 모서리 미리보기" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "치유 적용" }).hasAttribute("disabled")).toBe(true);
  });

  it("계산 중과 확정 대기 중에도 취소는 가능하다", () => {
    const pending = model({ engaged: true, pending: true, status: "pending" });
    const view = render(<StudioHybridDccCoplanarEdgeDissolveTools model={pending} unavailable={null} busy={false} />);
    expect(screen.getByRole("region", { name: "공유 모서리 치유" }).getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("계산하는 중");
    fireEvent.click(screen.getByRole("button", { name: "치유 취소" })); expect(pending.cancel).toHaveBeenCalledTimes(1);
    const applying = model({ engaged: true, status: "ready", applying: true, canApply: true });
    view.rerender(<StudioHybridDccCoplanarEdgeDissolveTools model={applying} unavailable="다른 편집 대기" busy />);
    fireEvent.click(screen.getByRole("button", { name: "치유 취소" })); expect(applying.cancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "치유 적용" })); expect(applying.apply).not.toHaveBeenCalled();
  });

  it("적용 가능한 미리보기만 확정하고 실패와 안내를 접근 가능한 상태로 표시한다", () => {
    const state = model({ status: "ready", engaged: true, canApply: true });
    const view = render(<StudioHybridDccCoplanarEdgeDissolveTools model={state} unavailable={null} busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "치유 적용" })); expect(state.apply).toHaveBeenCalledTimes(1);
    const failed = model({ status: "failed", engaged: true, error: "두 면이 같은 평면에 있지 않습니다.", notice: "원본은 유지했습니다." });
    view.rerender(<StudioHybridDccCoplanarEdgeDissolveTools model={failed} unavailable={null} busy={false} />);
    expect(screen.getByRole("alert").textContent).toBe(failed.error);
    expect(screen.getByRole("status").textContent).toBe(failed.notice);
    expect(screen.getByRole("button", { name: "치유 적용" }).hasAttribute("disabled")).toBe(true);
  });
});
