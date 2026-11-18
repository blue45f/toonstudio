// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createAdminWorkspace } from "@toonstudio/contracts/admin-workspace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceImportDialog } from "./WorkspaceBackup";

const backup = vi.hoisted(() => vi.fn());
vi.mock("./workspace-ui", async importOriginal => ({ ...await importOriginal<typeof import("./workspace-ui")>(), downloadWorkspace: backup }));
beforeEach(() => { backup.mockReset(); });
afterEach(cleanup);
function file(text: string): File {
  const value = new File([text], "synthetic-workspace.json", { type: "application/json" });
  Object.defineProperty(value, "text", { value: async () => text });
  return value;
}

describe("작업실 JSON 가져오기", () => {
  it("미리보기에서는 저장하지 않으며 적용 직전에 현재 기록을 먼저 백업한다", async () => {
    const current = createAdminWorkspace();
    const incoming = createAdminWorkspace();
    incoming.records[0].notes = "합성 가져오기 검토";
    const order: string[] = [];
    backup.mockImplementation(() => { order.push("backup"); });
    const save = vi.fn(async () => { order.push("save"); return null; });
    render(<WorkspaceImportDialog state={current} editable busy={false} onSave={save} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("백업 JSON 파일"), { target: { files: [file(JSON.stringify(incoming))] } });
    await screen.findByRole("region", { name: "가져오기 미리보기" });
    expect(save).not.toHaveBeenCalled();
    expect(backup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "현재 기록 백업 후 가져오기" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["backup", "save"]);
    expect(backup).toHaveBeenCalledWith(current, "before-import");
  });

  it("현재 편집의 백업이 실패하면 가져오기를 저장하지 않는다", async () => {
    backup.mockImplementation(() => { throw new Error("다운로드 차단"); });
    const save = vi.fn();
    render(<WorkspaceImportDialog state={createAdminWorkspace()} editable busy={false} onSave={save} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("백업 JSON 파일"), { target: { files: [file(JSON.stringify(createAdminWorkspace()))] } });
    await screen.findByRole("region", { name: "가져오기 미리보기" });
    fireEvent.click(screen.getByRole("button", { name: "현재 기록 백업 후 가져오기" }));
    expect((await screen.findByRole("alert")).textContent).toContain("백업 파일을 만들지 못했습니다");
    expect(save).not.toHaveBeenCalled();
  });

  it("손상된 JSON은 현재 화면과 저장본을 바꾸지 않고 오류를 알린다", async () => {
    const save = vi.fn();
    render(<WorkspaceImportDialog state={createAdminWorkspace()} editable busy={false} onSave={save} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("백업 JSON 파일"), { target: { files: [file('{"broken":')] } });
    expect((await screen.findByRole("alert")).textContent).toContain("JSON 파일을 읽을 수 없습니다");
    expect(screen.queryByRole("region", { name: "가져오기 미리보기" })).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(backup).not.toHaveBeenCalled();
  });
});
