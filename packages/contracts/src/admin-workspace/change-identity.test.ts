import { describe, expect, it } from "vitest";

import { assessWorkspaceChange, workspaceChangeIdentityIssues, workspaceChangeKey, workspaceDuplicateGroups, workspaceOperationalStateIssues } from "./change-identity";

import type { WorkspaceChangeIdentity, WorkspaceChangeRelation, WorkspaceOperationalState } from "./change-identity";
import type { WorkspaceMainObservation } from "./evidence";

const now = new Date("2026-11-18T04:00:00Z"), sha = "a".repeat(40), head = "b".repeat(40);
const repository = "sample/toonstudio";
const main: WorkspaceMainObservation = { repository, sha, observedAt: "2026-11-18T03:55:00Z", url: `https://github.com/${repository}/commit/${sha}` };
const proof = { url: `https://github.com/${repository}/compare/${head}...${sha}`, observedAt: "2026-11-18T03:50:00Z", summary: "원본 변경과 현재 main의 해당 파일·동작을 비교함" };
function identity(): WorkspaceChangeIdentity { return { repository, pullRequest: 101, pullRequestState: "closed-unmerged", headSha: head, source: { provider: "sites", boardId: "opaque-Board-ID", recordId: "item-1" } }; }
function relation(kind: WorkspaceChangeRelation["kind"]): WorkspaceChangeRelation { return { kind, repository, pullRequest: 102, sourceSha: head, targetSha: sha, proof }; }

describe("작업·PR·원본의 중복 및 대체 관계", () => {
  it("제목·URL 대소문자와 무관하게 같은 저장소 PR을 하나의 참조로 식별한다", () => {
    expect(workspaceChangeKey(identity())).toBe(workspaceChangeKey({ repository: "https://github.com/Sample/ToonStudio.git", pullRequest: 101 }));
    const groups = workspaceDuplicateGroups([{ id: "one", changeIdentity: identity() }, { id: "two", changeIdentity: { repository, pullRequest: 101 } }]);
    expect(groups).toEqual([{ key: workspaceChangeKey(identity()), recordIds: ["one", "two"], reason: "same-pr", certainty: "same-reference" }]);
  });
  it("PR을 나중에 연결해도 Sites 원본 프로젝트·레코드 참조로 중복을 찾는다", () => {
    const groups = workspaceDuplicateGroups([{ id: "new", changeIdentity: identity() }, { id: "old", changeIdentity: { source: identity().source } }]);
    expect(groups).toMatchObject([{ recordIds: ["new", "old"], reason: "same-source" }]);
    expect(workspaceChangeKey({ source: { provider: "sites", boardId: "A:B", recordId: "C" } })).not.toBe(workspaceChangeKey({ source: { provider: "sites", boardId: "A", recordId: "B:C" } }));
    expect(workspaceChangeKey({ source: { provider: "sites", boardId: "Case", recordId: "x" } })).not.toBe(workspaceChangeKey({ source: { provider: "sites", boardId: "case", recordId: "x" } }));
  });
  it("수동 변경 그룹은 내용 동등성이 아닌 중복 후보로만 표시한다", () => {
    const groups = workspaceDuplicateGroups([{ id: "one", changeIdentity: { ...identity(), changeKey: "task-group" } }, { id: "two", changeIdentity: { repository, pullRequest: 102, changeKey: "task-group" } }]);
    expect(groups).toMatchObject([{ reason: "same-change", certainty: "candidate" }]);
  });
  it("대체 PR이 있어도 닫힌 미병합 원본을 병합·main 포함으로 승격하지 않는다", () => {
    expect(assessWorkspaceChange({ ...identity(), relations: [relation("superseded-by")] }, main, now)).toMatchObject({ pullRequestState: "closed-unmerged", historicalMerged: false, mainInclusion: "unverified", supersededBy: [102] });
  });
  it("명시적 동일 변경 대조 근거가 있을 때만 미병합 원본의 변경 포함을 확인한다", () => {
    const record = { ...identity(), relations: [relation("superseded-by"), relation("equivalent-in-main")] };
    const result = assessWorkspaceChange(record, main, now);
    expect(result).toMatchObject({ pullRequestState: "closed-unmerged", historicalMerged: false, mainInclusion: "equivalent-change-present", supersededBy: [102] });
    expect(record.pullRequestState).toBe("closed-unmerged");
    expect(assessWorkspaceChange(record, { ...main, sha: "c".repeat(40) }, now).mainInclusion).toBe("unverified");
  });
  it("대조 근거 없는 관계·다른 원본 SHA·미래 근거는 거부한다", () => {
    for (const changed of [{ ...relation("equivalent-in-main"), proof: { ...proof, summary: "" } }, { ...relation("equivalent-in-main"), sourceSha: sha }, { ...relation("equivalent-in-main"), proof: { ...proof, observedAt: "2026-11-19T04:00:00Z" } }]) {
      const record = { ...identity(), relations: [changed] };
      expect(workspaceChangeIdentityIssues(record, now).length).toBeGreaterThan(0);
      expect(assessWorkspaceChange(record, main, now).mainInclusion).toBe("unverified");
    }
  });
  it("과거 main 관측과 병합 이력만으로 현재 포함을 확정하지 않는다", () => {
    const record = { ...identity(), pullRequestState: "merged" as const, mergeSha: sha, mergeProof: proof };
    expect(assessWorkspaceChange(record, main, now).mainInclusion).toBe("merged-at-observed-main");
    expect(assessWorkspaceChange(record, { ...main, observedAt: "2026-11-17T03:55:00Z" }, now)).toMatchObject({ historicalMerged: true, mainInclusion: "unverified" });
    expect(assessWorkspaceChange({ ...record, mergeProof: undefined }, main, now)).toMatchObject({ historicalMerged: false, mainInclusion: "unverified" });
  });
  it("업무 완료·PR 미병합·CI 실패·미배포·승인 대기는 독립적으로 유지된다", () => {
    const state: WorkspaceOperationalState = { workStatus: "done", pullRequestStatus: "closed-unmerged", ciStatus: "failure", deploymentStatus: "not-deployed", approvalStatus: "pending" };
    expect(workspaceOperationalStateIssues(state, now)).toEqual([]);
    expect(workspaceOperationalStateIssues({ ...state, approvalStatus: "approved" }, now).length).toBeGreaterThan(0);
    expect(workspaceOperationalStateIssues({ ...state, approvalStatus: "approved", approvalEvidence: { actor: "검토 담당", at: "2026-11-18T03:50:00Z", scope: "지정한 문서만 제출", subjectRef: "document-v2", url: "https://example.test/approval/1" } }, now)).toEqual([]);
  });
});
