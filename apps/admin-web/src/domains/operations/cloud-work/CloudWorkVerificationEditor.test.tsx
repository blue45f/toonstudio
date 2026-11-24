// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { blankCheck, blankTask, CHECK_PHASES } from "@toonstudio/contracts/admin-cloud-workboard";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CloudWorkEditor } from "./CloudWorkEditor";

import type { Task } from "@toonstudio/contracts/admin-cloud-workboard";

afterEach(cleanup);
const SHA = "a".repeat(40);
const MAIN_SHA = "b".repeat(40);
const observedAt = () => new Date(Date.now() - 60_000).toISOString();
const propsFor = (patch: Partial<Task> = {}) => ({
  initial: { ...blankTask(), id: "EDITOR-VERIFICATION", title: "검증 조정 작업", ...patch },
  projects: ["ToonStudio"], openedRevision: 0, revision: 0, saving: false, unavailable: false, conflict: false, error: "",
  onSave: vi.fn<(task: Task) => Promise<boolean>>().mockResolvedValue(false), onClose: vi.fn(), onReload: vi.fn(), onBackup: vi.fn(),
});
const enter = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));
const save = () => fireEvent.click(screen.getByRole("button", { name: "작업 기록 저장" }));

describe("클라우드 작업 검증·보존 편집", () => {
  it("Sites의 비교·운영·보존 필드를 편집해 저장하며 증빙 확인 시각을 만들지 않는다", async () => {
    const props = propsFor();
    render(<CloudWorkEditor {...props} />);
    enter("기존 관리자 운영 보드 URL", "https://example.com/admin/operations");
    enter("정본 작업 Page URL", "https://example.com/work/item");
    tab("소스·CI");
    enter("PR 대상 브랜치", "integration/runtime");
    enter("PR 초안 여부", "초안");
    enter("병합 커밋 전체 SHA", MAIN_SHA);
    tab("운영·신호");
    enter("배포 설정 식별값", "web-static-v1");
    enter("마이그레이션 대상 DB", "isolated-test-db");
    enter("마이그레이션 식별자", "0125_admin_cloud_workboard\n");
    expect((screen.getByLabelText("마이그레이션 식별자") as HTMLTextAreaElement).value).toBe("0125_admin_cloud_workboard\n");
    enter("마이그레이션 식별자", "0125_admin_cloud_workboard\n0126_followup");
    tab("검증·정리");
    fireEvent.click(screen.getByRole("button", { name: "기본 단계 추가" }));
    enter("등록 워킹트리 수", "2");
    enter("미병합 브랜치 수", "1");
    enter("stash 수", "0");
    enter("원본 보존·정리 범위", "원본 ref와 미푸시 변경 보존 여부 확인 필요");
    enter("보존 확인 근거 URL", "https://example.com/preservation");
    save();
    await waitFor(() => expect(props.onSave).toHaveBeenCalledOnce());
    const saved = props.onSave.mock.calls[0]?.[0];
    expect(saved).toMatchObject({
      adminBoardUrl: "https://example.com/admin/operations", sourcePageUrl: "https://example.com/work/item",
      baseBranch: "integration/runtime", prDraft: true, mergeSha: MAIN_SHA,
      deployConfigKey: "web-static-v1", migrationTarget: "isolated-test-db", migrationIds: ["0125_admin_cloud_workboard", "0126_followup"],
      worktreeCount: 2, unmergedBranchCount: 1, stashCount: 0, preservationLink: "https://example.com/preservation",
      verifiedAt: "", mergedAt: "", cleanupStatus: "미확인",
    });
    expect(saved?.verificationChecks.map(check => check.phase)).toEqual(CHECK_PHASES);
    expect(saved?.verificationChecks.every(check => check.state === "미확인" && check.required && !check.observedAt)).toBe(true);
  });

  it("병합 전 통과 근거가 있어도 미확인 필수 병합 후 검증을 남긴 완료 저장은 차단한다", async () => {
    const at = observedAt();
    const props = propsFor({
      remoteSha: SHA, mainSha: MAIN_SHA, verifiedAt: at,
      verificationChecks: [
        { ...blankCheck("pre"), state: "통과", subjectSha: SHA, evidenceUrl: "https://example.com/checks/pre", observedAt: at, reason: "현재 PR SHA의 필수 테스트 통과" },
        blankCheck("post"),
      ],
    });
    render(<CloudWorkEditor {...props} />);
    enter("현재 상태", "검증 완료");
    tab("검증·정리");
    const post = screen.getByRole("region", { name: "병합 후 테스트" });
    expect(within(post).getByText("현재 판정: 미확인")).toBeTruthy();
    save();
    expect((await screen.findByRole("alert")).textContent).toContain("필수 검증");
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it.each(["브랜치 삭제", "변경 사항 폐기"] as const)("%s 작업은 승인 대기 기록으로만 저장한다", async action => {
    const props = propsFor();
    render(<CloudWorkEditor {...props} />);
    enter("담당 조치 유형", action);
    const status = screen.getByLabelText("현재 상태") as HTMLSelectElement;
    expect(Array.from(status.options).map(option => option.value)).toEqual(["승인 대기"]);
    save();
    await waitFor(() => expect(props.onSave).toHaveBeenCalledOnce());
    expect(props.onSave.mock.calls[0]?.[0]).toMatchObject({ action, stage: "승인 대기", verifiedAt: "" });
  });

  it("선택한 충돌 근거의 ID를 저장하고 다른 위험 신호에는 복사하지 않는다", async () => {
    const props = propsFor({ remoteSha: SHA, evidence: [{ id: "CONFLICT-PROOF", title: "동일 SHA 충돌 확인", kind: "GitHub", url: "https://example.com/pull/1", summary: "관측 시점에 병합 충돌 확인", subjectSha: SHA, observedAt: observedAt(), occurredAt: "" }] });
    render(<CloudWorkEditor {...props} />);
    tab("운영·신호");
    enter("충돌 신호", "감지");
    fireEvent.click(screen.getByRole("checkbox", { name: "충돌 근거: 동일 SHA 충돌 확인" }));
    save();
    await waitFor(() => expect(props.onSave).toHaveBeenCalledOnce());
    expect(props.onSave.mock.calls[0]?.[0]).toMatchObject({
      risks: { conflict: "감지", regression: "미확인", ciFailure: "미확인", deployBlock: "미확인" },
      riskEvidenceIds: { conflict: ["CONFLICT-PROOF"], regression: [], ciFailure: [], deployBlock: [] },
      verifiedAt: "",
    });
  });
});
