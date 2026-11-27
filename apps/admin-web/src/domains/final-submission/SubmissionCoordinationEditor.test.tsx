// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createCoordinationItem, type CoordinationItem } from "@toonstudio/contracts/final-submission";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SubmissionCoordinationEditor } from "./SubmissionCoordinationEditor";

afterEach(cleanup);

const at = "2025-01-02T12:00:00+09:00";
const change = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

function setup(item: CoordinationItem) {
  const save = vi.fn((_next: CoordinationItem): string | null => null);
  const close = vi.fn();
  const props = { item, onSave: save, onClose: close,
    operationOptions: [{ id: "op-a", title: "운영 원장 비공개 제목" }],
    taskOptions: [{ id: "task-a", title: "제출 원장 비공개 제목" }],
    relatedOptions: [{ id: "other-a", title: "다른 프로젝트 확인 건" }] };
  const view = render(<SubmissionCoordinationEditor {...props} />);
  return { save, close, view, props };
}

function example(): CoordinationItem {
  return { ...createCoordinationItem("coord-a", "첨부 버전 대조"), project: "제출 조정" };
}

describe("증빙 조정 항목 편집", () => {
  it("연결한 원본의 ID만 기록하고 다음 조치와 승인 대기 작업을 남긴다", () => {
    const { save } = setup(example());
    change("관리자 운영 원장 항목", "op-a");
    change("1R 제출 원장 항목", "task-a");
    fireEvent.click(screen.getByRole("checkbox", { name: "다른 프로젝트 확인 건" }));
    change("다음 조치", "운영 캡처의 변경 커밋 대조");
    click("확인·승인");
    change("승인 대기 작업", "배포");
    change("기록할 진행 상태", "진행 중");
    expect(screen.getByText("미확인", { selector: ".fs-badge" })).toBeTruthy();
    click("조정 기록 반영");
    const record = save.mock.calls[0]?.[0];
    expect(record).toMatchObject({ operationId: "op-a", sourceTaskId: "task-a", related: ["other-a"], status: "진행 중", action: "배포" });
    expect(JSON.stringify(record)).not.toContain("비공개 제목");
  });

  it("후보의 변경이 기존 근거 대조와 최종 확인 시점을 무효화한다", () => {
    const { save } = setup({ ...example(), version: "r1", refs: [{ label: "검증 기록", url: "https://example.com/record" }], latestVerified: true, status: "최종 확인", checkedAt: at, evidenceAt: at });
    click("개발·제출 대조"); change("후보 버전", "r2");
    click("확인·승인");
    expect((screen.getByLabelText("현재 항목과 최신 증빙을 직접 대조함") as HTMLInputElement).checked).toBe(false);
    click("조정 기록 반영");
    expect(save.mock.calls[0]?.[0]).toMatchObject({ version: "r2", checkedAt: "", evidenceAt: "", latestVerified: false });
  });

  it("첨부 링크가 안전한 주소일 때만 기록하고 서버 오류를 입력창에 유지한다", () => {
    const { save, close } = setup(example());
    click("근거·첨부");
    click("첨부 증빙 추가");
    change("첨부 증빙 1 이름", "캡처");
    const input = screen.getByRole("textbox", { name: /첨부 증빙 1.*(주소|URL|링크)/u });
    fireEvent.change(input, { target: { value: "javascript:void(0)" } });
    click("조정 기록 반영"); expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("주소");
    fireEvent.change(input, { target: { value: "https://example.com/capture" } });
    save.mockReturnValue("저장 버전 충돌");
    click("조정 기록 반영");
    expect(save.mock.calls[0]?.[0].attachments).toEqual([{ label: "캡처", url: "https://example.com/capture" }]);
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("버전 충돌");
  });
});
