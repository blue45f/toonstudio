// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { blankTask, emptyBoard } from "@toonstudio/contracts/admin-cloud-workboard";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CloudWorkEditor } from "./CloudWorkEditor";
import { CloudWorkImportDialog } from "./CloudWorkImportDialog";

import type { Board } from "@toonstudio/contracts/admin-cloud-workboard";

afterEach(cleanup);
const task = () => ({ ...blankTask(), id: "TEST-EDITOR", title: "검토할 작업" });
const editorProps = () => ({ initial: task(), projects: ["ToonStudio"], openedRevision: 0, revision: 0, saving: false, unavailable: false, conflict: false, error: "", onSave: vi.fn().mockResolvedValue(false), onClose: vi.fn(), onReload: vi.fn(), onBackup: vi.fn() });

describe("클라우드 작업 편집·가져오기", () => {
  it("실행 조치는 승인 대기로 고정하고 확인하지 않은 시각을 자동 작성하지 않는다", async () => {
    const props = editorProps();
    render(<CloudWorkEditor {...props} />);
    fireEvent.change(screen.getByLabelText("담당 조치 유형"), { target: { value: "외부 배포" } });
    const status = screen.getByLabelText(/현재 상태/u) as HTMLSelectElement;
    expect(status.value).toBe("승인 대기");
    expect(Array.from(status.options).map(option => option.value)).toEqual(["승인 대기"]);
    fireEvent.click(screen.getByRole("button", { name: "작업 기록 저장" }));
    await waitFor(() => expect(props.onSave).toHaveBeenCalledOnce());
    expect(props.onSave.mock.calls[0]?.[0]).toMatchObject({ action: "외부 배포", stage: "승인 대기", verifiedAt: "", mergedAt: "" });
    expect(props.onClose).not.toHaveBeenCalled();
  });
  it("증빙 없는 검증 완료 입력은 저장하지 않고 이유를 표시한다", async () => {
    const props = editorProps();
    render(<CloudWorkEditor {...props} />);
    fireEvent.change(screen.getByLabelText("현재 상태"), { target: { value: "검증 완료" } });
    fireEvent.click(screen.getByRole("button", { name: "작업 기록 저장" }));
    expect((await screen.findByRole("alert")).textContent).toContain("모든 필수 검증 통과 또는 적용 제외 사유");
    expect(props.onSave).not.toHaveBeenCalled();
  });
  it("409 편집본을 보존하고 최신 작업과 명시적으로 비교한 후 재저장한다", async () => {
    const props = editorProps();
    const mounted = render(<CloudWorkEditor {...props} />);
    fireEvent.change(screen.getByLabelText("다음 조치"), { target: { value: "내 편집본" } });
    mounted.rerender(<CloudWorkEditor {...props} conflict error="다른 기기의 기록 변경" />);
    expect((screen.getByLabelText("다음 조치") as HTMLTextAreaElement).value).toBe("내 편집본");
    expect((screen.getByRole("button", { name: "작업 기록 저장" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "편집본 JSON" }));
    expect(props.onBackup.mock.calls[0]?.[0].nextAction).toBe("내 편집본");
    fireEvent.click(screen.getByRole("button", { name: "최신 기록 불러오기" }));
    expect(props.onReload).toHaveBeenCalledOnce();
    mounted.rerender(<CloudWorkEditor {...props} revision={1} latest={{ ...props.initial, nextAction: "최신 서버 내용" }} />);
    expect((screen.getByRole("button", { name: "작업 기록 저장" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "최신 기록과 편집본을 비교했습니다" }));
    fireEvent.click(screen.getByRole("button", { name: "작업 기록 저장" }));
    await waitFor(() => expect(props.onSave).toHaveBeenCalledOnce());
    expect(props.onSave.mock.calls[0]?.[0].nextAction).toBe("내 편집본");
  });
  it("편집한 내용은 닫기나 Escape만 반복해서 누른다고 버려지지 않는다", () => {
    const props = editorProps();
    render(<CloudWorkEditor {...props} />);
    fireEvent.change(screen.getByLabelText("다음 조치"), { target: { value: "보존 대상" } });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "편집 취소하고 닫기" }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });
  it("가져오기 미리보기 후 서버 버전이 바뀌면 재확인이 필요하며 기존 감사 이력을 유지한다", async () => {
    const initial = task();
    const current: Board = { ...emptyBoard(), tasks: [initial], audit: [{ id: "server-audit", at: "2026-11-17T00:00:00.000Z", taskId: initial.id, title: "기존 서버 기록", detail: "보존" }] };
    const incoming: Board = { ...emptyBoard(), tasks: [{ ...initial, title: "가져온 작업" }], audit: [{ ...current.audit[0], id: "incoming-audit" }] };
    const props = { current, incoming, openedRevision: 0, revision: 0, saving: false, unavailable: false, conflict: false, error: "", onSave: vi.fn().mockResolvedValue(false), onClose: vi.fn(), onReload: vi.fn() };
    const mounted = render(<CloudWorkImportDialog {...props} />);
    const confirm = () => screen.getByRole("checkbox", { name: "추가·교체 범위와 최신 기록을 확인했습니다" });
    const save = () => screen.getByRole("button", { name: "확인한 내용 병합 저장" }) as HTMLButtonElement;
    expect(save().disabled).toBe(true);
    fireEvent.click(confirm());
    expect(save().disabled).toBe(false);
    mounted.rerender(<CloudWorkImportDialog {...props} revision={1} />);
    expect(save().disabled).toBe(true);
    fireEvent.click(confirm());
    fireEvent.click(save());
    await waitFor(() => expect(props.onSave).toHaveBeenCalledOnce());
    const saved = props.onSave.mock.calls[0]?.[0] as Board;
    expect(saved.tasks[0].title).toBe("가져온 작업");
    expect(saved.audit).toEqual(current.audit);
  });
});
