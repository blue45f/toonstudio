import { createWorkspaceRecord } from "@toonstudio/contracts/admin-workspace";
import { createCoordinationItem, createEmptyFinalSubmissionBoard, createFinalSubmissionTask } from "@toonstudio/contracts/final-submission";
import { describe, expect, it } from "vitest";

import { coordinationOperationOptions, coordinationSourceDetail, coordinationSuggestions } from "./coordination-sources";

describe("두 원본의 제출 조정", () => {
  it("저장된 미완료 점검만 묶고 기록이 사라지거나 저장된 조정에 연결됐으면 제안하지 않는다", () => {
    const board = createEmptyFinalSubmissionBoard();
    expect(coordinationSuggestions(board, [])).toEqual([]);
    board.revision = 1;
    board.coordination = [createCoordinationItem("manual", "독립 기록")];
    for (const task of board.tasks) task.updatedAt = "2026-11-27T00:00:00Z";
    expect(coordinationSuggestions(board, [])).toEqual([]);
    board.documents.find(doc => doc.id === "report")!.fileName = "활동보고서.docx";
    board.documents.find(doc => doc.id === "business")!.fileName = "사업계획서.docx";
    const records = [createWorkspaceRecord("task-10", "coordination", "task"), createWorkspaceRecord("task-11", "business", "task")];
    records[0].title = "서버에서만 열람하는 이름"; records[0].sourceUrl = "https://private.example/record";
    const suggestions = coordinationSuggestions(board, records);
    const bundle = suggestions.find(item => item.sourceTaskId === "DOC-02")!;
    expect(bundle.operationId).toBe("task-10");
    expect(JSON.stringify(suggestions)).not.toMatch(/서버에서만|private.example/);
    expect(coordinationOperationOptions(records)).toEqual([{ id: "task-10", label: records[0].title }]);
    expect(suggestions.find(item => item.sourceTaskId === "MENTOR-01")?.operationId).toBe("");
    board.tasks = board.tasks.filter(task => task.id !== "MENTOR-01");
    expect(coordinationSuggestions(board, records, [bundle]).map(item => item.id)).toEqual(["source-join-receipt", "source-join-runtime"]);
  });
  it("원본의 사용자 정의 작업은 동일한 근거를 가리키는 운영 기록이 하나일 때 연결한다", () => {
    const board = createEmptyFinalSubmissionBoard(); board.revision = 1;
    const check = createFinalSubmissionTask("custom", "캡처 대조", "제작", "report");
    check.attachments = [{ label: "담당자 근거", url: "https://evidence.example/only" }];
    board.tasks.push(check);
    const ops = createWorkspaceRecord("op-1", "cloud", "operation"); ops.sourceUrl = check.attachments[0].url;
    expect(coordinationSuggestions(board, [ops]).find(item => item.sourceTaskId === check.id)?.operationId).toBe(ops.id);
    expect(coordinationSuggestions(board, [ops, {...ops, id: "op-2"}]).some(item => item.sourceTaskId === check.id)).toBe(false);
  });
  it("첨부 해시·운영 미병합·검증되지 않은 배포를 원본 조회에서만 대조한다", () => {
    const board = createEmptyFinalSubmissionBoard();
    const doc = board.documents[0];
    doc.fileHash = "a".repeat(64); doc.platform.hash = "b".repeat(64); doc.platform.fileName = "이전.docx";
    const record = createWorkspaceRecord("active", "cloud", "operation");
    record.operationalState = { workStatus: "todo", approvalStatus: "pending", ciStatus: "unknown", deploymentStatus: "applied", pullRequestStatus: "open" };
    const item = { ...createCoordinationItem("sample", "개발과 접수 대조"), sourceTaskId: "PLATFORM-01", operationId: record.id };
    const detail = coordinationSourceDetail(board, [record], item);
    expect(detail.warnings.join(" ")).toMatch(/플랫폼의 첨부본.*미병합/);
    expect(detail.gaps.join(" ")).toMatch(/스모크/);
    item.evidenceAt = "2026-11-24T12:00:00Z"; record.verifiedAt = "2026-11-25T12:00:00Z";
    expect(coordinationSourceDetail(board, [record], item).gaps).toContain("새 운영 원본 관측이 있어 최신 증빙 재대조가 필요합니다.");
    expect(coordinationSourceDetail(board, [], item).gaps.join(" ")).toMatch(/열람 권한/);
    expect(detail.facts.some(fact => fact.value.includes("이전.docx"))).toBe(true);
    expect(coordinationSourceDetail(board, [], item).warnings).toHaveLength(1);
  });
});
