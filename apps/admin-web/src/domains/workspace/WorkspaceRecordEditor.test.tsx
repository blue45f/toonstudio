// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createAdminWorkspace, createWorkspaceRecord, workspaceNumeric } from "@toonstudio/contracts/admin-workspace";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceRecordEditor } from "./WorkspaceRecordEditor";

import type { WorkspaceRecord } from "@toonstudio/contracts/admin-workspace";

afterEach(cleanup);
function editor(value: WorkspaceRecord["value"] = null) {
  const record = { ...createWorkspaceRecord("synthetic-number", "business", "claim"), kind: "숫자" as const, value };
  const save = vi.fn(async (_record: WorkspaceRecord) => null);
  render(<WorkspaceRecordEditor state={createAdminWorkspace()} record={record} editable busy={false} isNew={false} onSave={save} onClose={vi.fn()} />);
  return save;
}

describe("수치 원문 보존", () => {
  it.each(["9007199254740993", "0.123456789012345678900", "9,007,199,254,740,993"])("입력값 %s를 반올림하거나 정규화하지 않는다", async value => {
    const save = editor();
    fireEvent.change(screen.getByLabelText("수치"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].value).toBe(value);
    expect(workspaceNumeric(save.mock.calls[0][0].value)).toBe(true);
  });

  it.each([123.45, "9007199254740993", "0.123456789012345678900"])("다른 항목만 편집하면 기존 값 %s와 타입을 유지한다", async value => {
    const save = editor(value);
    fireEvent.change(screen.getByLabelText("검토 메모"), { target: { value: "합성 검토 기록" } });
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].value).toBe(value);
  });

  it("잘못된 수치는 거부하고 공백만 미확인 null로 처리한다", async () => {
    const save = editor("100");
    fireEvent.change(screen.getByLabelText("수치"), { target: { value: "알 수 없음" } });
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));
    expect((await screen.findByRole("alert")).textContent).toContain("유효한 숫자");
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("수치"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].value).toBeNull();
  });
});
