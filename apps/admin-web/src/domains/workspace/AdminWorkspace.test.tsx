// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createOperationsWorkspace, createWorkspaceRecord } from "@toonstudio/contracts/admin-workspace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminWorkspace } from "./AdminWorkspace";

import type { AdminWorkspaceView } from "@toonstudio/contracts/admin-workspace";

const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), export: vi.fn() }));
vi.mock("../../platform/http/workspace-api", () => ({ loadAdminWorkspace: api.load, saveAdminWorkspace: api.save, exportAdminWorkspace: api.export }));
function view(): AdminWorkspaceView {
  const state = createOperationsWorkspace();
  state.records.push({ ...createWorkspaceRecord("synthetic-review", "coordination", "operation"), title: "합성 검토 작업" });
  return { boardId: "toonstudio", scope: "operations", revision: 1, state, updatedAt: "2026-11-18T00:00:00Z", canEdit: true,
    access: { operations: { canRead: true, canWrite: true, canExport: true, canManageAccess: false }, business: { canRead: false, canWrite: false, canExport: false, canManageAccess: false } } };
}
beforeEach(() => { vi.clearAllMocks(); api.load.mockResolvedValue(view()); api.export.mockResolvedValue(view()); });
afterEach(cleanup);

describe("관리자 작업실 화면 경계", () => {
  it("운영자는 여섯 모듈과 근거를 읽을 수 있고 편집·가져오기를 실행할 수 없다", async () => {
    api.load.mockResolvedValueOnce({ ...view(), canEdit: false });
    render(<AdminWorkspace actor={{ id: "synthetic-operator", role: "operator" }} />);
    await screen.findByRole("heading", { name: "사업계획·운영 작업실" });
    expect(within(screen.getByRole("navigation", { name: "업무 모듈" })).getAllByRole("button")).toHaveLength(6);
    expect(screen.getByText("읽기 전용")).toBeTruthy();
    expect(screen.getByRole("link", { name: "증빙·승인 조정" }).getAttribute("href")).toBe("/admin/growth/business-plan/?view=evidence-coordination");
    expect(screen.queryByRole("button", { name: "JSON 가져오기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "기록 추가" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "합성 검토 작업 상세 보기" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("담당자").matches(":disabled")).toBe(true);
    expect(within(dialog).queryByRole("button", { name: "기록 저장" })).toBeNull();
    expect(api.save).not.toHaveBeenCalled();
  });

  it("사용자가 확인 상태를 골라도 근거가 없으면 요청을 보내지 않는다", async () => {
    render(<AdminWorkspace actor={{ id: "synthetic-admin", role: "admin" }} />);
    fireEvent.click(await screen.findByRole("button", { name: "합성 검토 작업 상세 보기" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("사실 확인 상태"), { target: { value: "확인" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "기록 저장" }));
    const error = await within(dialog).findByRole("alert");
    expect(error.textContent).toContain("근거");
    expect(api.save).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(error));
  });

  it("계정 전환 후 늦게 도착한 이전 계정 응답과 편집 상태를 표시하지 않는다", async () => {
    let resolvePrevious: (value: AdminWorkspaceView) => void = () => {};
    api.load.mockImplementationOnce(() => new Promise<AdminWorkspaceView>(resolve => { resolvePrevious = resolve; }));
    const previous = view();
    previous.state!.records[0].title = "이전 계정의 합성 작업";
    const current = view();
    current.state!.records[0].title = "현재 계정의 합성 작업";
    api.load.mockResolvedValueOnce(current);
    const component = render(<AdminWorkspace actor={{ id: "previous-admin", role: "admin" }} />);
    component.rerender(<AdminWorkspace actor={{ id: "current-admin", role: "admin" }} />);
    await screen.findByRole("button", { name: "현재 계정의 합성 작업" });
    await act(async () => { resolvePrevious(previous); });
    expect(screen.queryByRole("button", { name: "이전 계정의 합성 작업" })).toBeNull();
    expect(screen.getByRole("button", { name: "현재 계정의 합성 작업" })).toBeTruthy();
  });

  it("가져온 HTML 문장을 텍스트로 표시하고 Escape로 닫은 뒤 초점을 돌려준다", async () => {
    const data = view();
    const title = '<img src="x" onerror="alert(1)"> 합성 원문';
    data.state!.records[0].title = title;
    api.load.mockResolvedValueOnce(data);
    render(<AdminWorkspace actor={{ id: "synthetic-admin", role: "admin" }} />);
    const trigger = await screen.findByRole("button", { name: title });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
