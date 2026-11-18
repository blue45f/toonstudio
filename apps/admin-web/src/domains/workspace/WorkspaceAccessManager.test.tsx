// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../../platform/http/admin-api";

import { WorkspaceAccessManager } from "./WorkspaceAccessManager";

import type { WorkspaceAccessList } from "../../platform/http/workspace-api";

const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("../../platform/http/workspace-api", () => ({ loadWorkspaceAccess: api.load, saveWorkspaceAccess: api.save }));

const access: WorkspaceAccessList = {
  ownerUserId: "synthetic-owner",
  grants: [{ userId: "synthetic-editor", canRead: true, canWrite: true, canExport: true, updatedAt: "2026-11-17T00:00:00Z" }],
};
beforeEach(() => { vi.resetAllMocks(); api.load.mockResolvedValue(access); api.save.mockResolvedValue(undefined); });
afterEach(cleanup);
function open() {
  const denied = vi.fn(), close = vi.fn();
  const component = render(<WorkspaceAccessManager onClose={close} onDenied={denied} />);
  return { ...component, denied, close };
}

describe("비공개 이전 자료 접근 권한", () => {
  it("계정·권한 선택만으로 변경하지 않고 명시적 적용 후 서버 목록을 다시 읽는다", async () => {
    open();
    const input = await screen.findByLabelText("사용자 ID");
    expect(screen.getByText("소유자: synthetic-owner")).toBeTruthy();
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "  synthetic-reader  " } });
    expect((screen.getByLabelText("자료 읽기 허용") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("이전 자료 가져오기 허용") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("JSON 내보내기 허용") as HTMLInputElement).checked).toBe(false);
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "접근 권한 적용" }));
    await screen.findByText("비공개 이전 자료의 접근 권한을 저장했습니다.");
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save.mock.calls[0][0]).toMatchObject({ userId: "synthetic-reader", canRead: true, canWrite: false, canExport: false, mutationId: expect.any(String) });
    expect(api.load).toHaveBeenCalledTimes(2);
  });

  it("읽기 권한 회수는 가져오기·내보내기도 끄고 적용 전까지 서버를 변경하지 않는다", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "synthetic-editor" }));
    fireEvent.click(screen.getByLabelText("자료 읽기 허용"));
    for (const label of ["이전 자료 가져오기 허용", "JSON 내보내기 허용"]) {
      const checkbox = screen.getByLabelText(label) as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
      expect(checkbox.disabled).toBe(true);
    }
    expect(screen.getByText(/synthetic-editor의 비공개 이전 자료 접근을 회수합니다/u)).toBeTruthy();
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "접근 권한 적용" }));
    await waitFor(() => expect(api.load).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[0][0]).toMatchObject({ userId: "synthetic-editor", canRead: false, canWrite: false, canExport: false });
  });

  it.each([401, 403])("목록 조회가 %s이면 소유자 권한을 추정하지 않고 상위 화면에 접근 거부를 알린다", async status => {
    api.load.mockRejectedValueOnce(new AdminApiError(status, "합성 접근 거부"));
    const { denied } = open();
    await waitFor(() => expect(denied).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("사용자 ID")).toBeNull();
    expect(screen.getByRole("button", { name: "접근 권한 적용" }).matches(":disabled")).toBe(true);
    expect(api.save).not.toHaveBeenCalled();
  });

  it("열린 뒤 소유자 권한이 회수돼 저장이 거부되면 목록과 성공 표시를 남기지 않는다", async () => {
    api.save.mockRejectedValueOnce(new AdminApiError(403, "합성 소유자 권한 회수"));
    const { denied } = open();
    fireEvent.change(await screen.findByLabelText("사용자 ID"), { target: { value: "synthetic-reader" } });
    fireEvent.click(screen.getByRole("button", { name: "접근 권한 적용" }));
    await waitFor(() => expect(denied).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("사용자 ID")).toBeNull();
    expect(screen.queryByRole("button", { name: "synthetic-editor" })).toBeNull();
    expect(screen.queryByText("비공개 이전 자료의 접근 권한을 저장했습니다.")).toBeNull();
    expect(api.load).toHaveBeenCalledTimes(1);
  });

  it("현재 소유자의 접근을 자기 권한 관리 폼으로 회수하지 않는다", async () => {
    open();
    fireEvent.change(await screen.findByLabelText("사용자 ID"), { target: { value: "synthetic-owner" } });
    fireEvent.click(screen.getByLabelText("자료 읽기 허용"));
    const apply = screen.getByRole("button", { name: "접근 권한 적용" });
    expect(apply.matches(":disabled")).toBe(true);
    fireEvent.click(apply);
    expect(api.save).not.toHaveBeenCalled();
  });

  it("통신 실패 후 같은 변경을 재시도하면 같은 변경 식별자를 유지한다", async () => {
    api.save.mockRejectedValueOnce(new AdminApiError(503, "합성 저장 실패"));
    open();
    fireEvent.change(await screen.findByLabelText("사용자 ID"), { target: { value: "synthetic-reader" } });
    fireEvent.click(screen.getByRole("button", { name: "접근 권한 적용" }));
    expect((await screen.findByRole("alert")).textContent).toContain("합성 저장 실패");
    expect(screen.queryByText("비공개 이전 자료의 접근 권한을 저장했습니다.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "접근 권한 적용" }));
    await screen.findByText("비공개 이전 자료의 접근 권한을 저장했습니다.");
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save.mock.calls[1][0]).toEqual(api.save.mock.calls[0][0]);
  });
});
