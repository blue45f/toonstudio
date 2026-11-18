import { describe, expect, it } from "vitest";

import { workspaceDuplicateGroups } from "./change-identity";
import { createAdminWorkspace, createWorkspaceRecord, updateWorkspaceRecord, workspaceFreshness } from "./domain";
import { assessWorkspaceEvidenceSet } from "./evidence";
import { importAdminWorkspace } from "./import";
import { reviewWorkspaceImport, workspaceOriginKey, workspaceSnapshotDigest } from "./import-review";
import { projectWorkspaceScope } from "./projection";
import { parseAdminWorkspace } from "./validation";

import type { WorkspaceCiEvidence, WorkspaceCiEvidenceTarget } from "./evidence";
import type { WorkspaceJson, WorkspaceRecord, WorkspaceResult } from "./types";

const now = new Date("2026-11-18T04:00:00Z"), sha = "a".repeat(40), repository = "sample/toonstudio";
function valueOf<T>(result: WorkspaceResult<T>): T {
  expect(result.ok, result.errors.join(" / ")).toBe(true);
  if (!result.ok) throw new Error(result.errors.join(" / "));
  return result.value;
}
function legacyFixture() {
  const state = createAdminWorkspace();
  return {
    kind: "toonstudio-admin-integration", schemaVersion: 1, savedAt: now.toISOString(),
    business: {
      schemaVersion: 1,
      tasks: state.records.filter(record => record.recordType === "task").map(record => ({ ...record, evidenceUrl: record.sourceUrl, source: record.sourceTitle, priority: "보통", updatedAt: "" })),
      claims: state.records.filter(record => record.recordType === "claim").map(record => ({ ...record, updatedAt: "" })),
      documents: state.documents, mentor: state.mentor, checklist: state.checklist, approvals: state.approvals, settings: state.settings, activity: [],
    },
    operations: {
      schemaVersion: 1, activity: [], savedAt: "", records: [{
        ...createWorkspaceRecord("ops-original", "cloud", "operation"), title: "가상 원본 작업", notes: "원본 메모",
        sourceId: "source-cloud", sourceRecordId: "work-1", sourceProjectId: "test-sites-board-A", raw: { label: "가상 원본" }, evidence: [],
      }],
    },
  };
}
function reorder(value: WorkspaceJson): WorkspaceJson {
  if (Array.isArray(value)) return value.map(reorder);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reorder(entry)]));
  return value;
}
const json = (value: unknown): WorkspaceJson => JSON.parse(JSON.stringify(value)) as WorkspaceJson;
function metadataRecord(): WorkspaceRecord {
  const evidence: WorkspaceCiEvidence = {
    kind: "ci", id: "fixture-run", repository, runId: "123", runAttempt: 1, event: "push", workflow: "core.yml", job: "contract", shard: "", scope: "contract-scope",
    testedSha: sha, headSha: "", baseSha: "", conclusion: "success", completedAt: "2026-11-16T03:00:00Z", collectedAt: "2026-11-18T03:50:00Z",
    availability: "available", url: `https://github.com/${repository}/actions/runs/123`,
  };
  const target: WorkspaceCiEvidenceTarget = {
    kind: "ci", repository, targetSha: sha, scope: "contract-scope", reference: "main", workflow: "core.yml", job: "contract", shard: "",
    main: { repository, sha, observedAt: "2026-11-18T03:55:00Z", url: `https://github.com/${repository}/commit/${sha}` },
  };
  return { ...createWorkspaceRecord("metadata-operation", "coordination", "operation"), evidence: [evidence], evidenceTarget: target,
    changeIdentity: { repository, pullRequest: 123, pullRequestState: "closed-unmerged", headSha: sha, source: { provider: "sites", boardId: "test-sites-board-A", recordId: "work-1" } },
    operationalState: { workStatus: "blocked", pullRequestStatus: "closed-unmerged", ciStatus: "success", deploymentStatus: "not-deployed", approvalStatus: "pending" },
  };
}

describe("관리자 가져오기 검토와 원본 식별", () => {
  it("같은 JSON의 속성 순서만 바뀌면 원문 digest와 가져오기 이력이 증가하지 않는다", () => {
    const fixture = json(legacyFixture()), reordered = reorder(fixture);
    expect(JSON.stringify(fixture)).not.toBe(JSON.stringify(reordered));
    expect(workspaceSnapshotDigest(fixture)).toBe(workspaceSnapshotDigest(reordered));
    const first = valueOf(importAdminWorkspace(fixture, undefined, now));
    const second = valueOf(importAdminWorkspace(reordered, first, new Date("2026-11-18T04:05:00Z")));
    expect(second).toBe(first);
    expect(second.imports).toHaveLength(1);
    expect(reviewWorkspaceImport(first, second)).toMatchObject({ added: 0, newArchives: 0, unchanged: true, changedSources: [] });
  });
  it("같은 원본의 화면 ID가 바뀌어도 현재 편집을 보존하고 두 원문 버전을 남긴다", () => {
    const original = legacyFixture();
    const first = valueOf(importAdminWorkspace(original, undefined, now));
    const edited = valueOf(updateWorkspaceRecord(first, { id: "ops-original", owner: "현재 담당자", notes: "관리자 편집은 보존" }, now));
    const nextSource = legacyFixture();
    nextSource.operations.records[0].id = "ops-renamed";
    nextSource.operations.records[0].title = "원본에서 갱신한 제목";
    const next = valueOf(importAdminWorkspace(nextSource, edited, now));
    expect(next.records).toHaveLength(edited.records.length);
    expect(next.records.find(record => record.id === "ops-original")).toEqual(edited.records.find(record => record.id === "ops-original"));
    expect(next.records.some(record => record.id === "ops-renamed")).toBe(false);
    expect(next.imports.map(item => item.archive)).toEqual([original, nextSource]);
    expect(reviewWorkspaceImport(edited, next)).toMatchObject({ added: 0, newArchives: 1, changedSources: [{ id: "ops-original", title: "가상 원본 작업" }] });
  });
  it("원본 이름이 같아도 서로 다른 실제 Sites 프로젝트의 기록을 합치지 않는다", () => {
    const first = valueOf(importAdminWorkspace(legacyFixture(), undefined, now));
    const other = legacyFixture(); other.operations.records[0].id = "other-project-record"; other.operations.records[0].sourceProjectId = "test-sites-board-B";
    const next = valueOf(importAdminWorkspace(other, first, now));
    expect(next.records.filter(record => record.module === "cloud")).toHaveLength(2);
    expect(reviewWorkspaceImport(first, next)).toMatchObject({ added: 1, changedSources: [] });
  });
  it("원문이 제거된 운영 export에도 stable source가 남아 이후 가져오기에서 중복되지 않는다", () => {
    const first = valueOf(importAdminWorkspace(legacyFixture(), undefined, now));
    const sourceRecord = first.records.find(record => record.id === "ops-original")!;
    const exported = projectWorkspaceScope(first, "operations");
    expect(exported.imports).toEqual([]);
    expect(exported.records[0].origin).toBeNull();
    expect(exported.records[0].changeIdentity?.source).toEqual(sourceRecord.changeIdentity?.source);
    expect(workspaceOriginKey(exported.records[0])).toBe(workspaceOriginKey(sourceRecord));
    const restored = valueOf(importAdminWorkspace(json(exported), undefined, now));
    const renamedSource = legacyFixture(); renamedSource.operations.records[0].id = "renamed-after-export";
    const updated = valueOf(importAdminWorkspace(renamedSource, restored, now));
    expect(updated.records.filter(record => record.module === "cloud")).toHaveLength(1);
    expect(updated.records.find(record => record.id === "ops-original")?.changeIdentity?.source).toEqual(sourceRecord.changeIdentity?.source);
    const again = valueOf(importAdminWorkspace(json(projectWorkspaceScope(updated, "operations")), undefined, now));
    expect(workspaceDuplicateGroups(again.records)).toEqual([]);
  });
  it("같은 PR 번호라도 저장소가 다르면 중복 참조로 묶지 않는다", () => {
    const one = metadataRecord(), two = { ...metadataRecord(), id: "other-repo", changeIdentity: { repository: "sample/other", pullRequest: 123 } };
    expect(workspaceDuplicateGroups([one, two])).toEqual([]);
  });
  it("native Reader와 백업 이관은 typed 증거·대상·식별자·독립 운영 상태를 보존한다", () => {
    const state = projectWorkspaceScope(createAdminWorkspace(), "operations");
    state.records.push(metadataRecord());
    const parsed = valueOf(parseAdminWorkspace(state, now));
    const imported = valueOf(importAdminWorkspace(json(parsed), undefined, now));
    expect(imported.records[0]).toEqual(state.records[0]);
    expect(imported.records[0].evidenceTarget).toEqual(state.records[0].evidenceTarget);
    expect(imported.records[0].changeIdentity?.pullRequestState).toBe("closed-unmerged");
    expect(imported.records[0].operationalState?.approvalStatus).toBe("pending");
  });
  it("잘못된 typed 증거·대상·식별자는 조용히 제거하지 않고 가져오기를 거부한다", () => {
    const state = projectWorkspaceScope(createAdminWorkspace(), "operations"); state.records.push(metadataRecord());
    const invalid: unknown[] = [
      { ...state, records: [{ ...state.records[0], evidenceTarget: { ...state.records[0].evidenceTarget, targetSha: "short" } }] },
      { ...state, records: [{ ...state.records[0], changeIdentity: { repository, pullRequest: -1 } }] },
      { ...state, records: [{ ...state.records[0], evidence: [{ ...state.records[0].evidence![0], runAttempt: 0 }] }] },
      { ...state, records: [{ ...state.records[0], operationalState: { ...state.records[0].operationalState, approvalStatus: "approved" } }] },
    ];
    for (const input of invalid) {
      expect(parseAdminWorkspace(input, now).ok).toBe(false);
      expect(importAdminWorkspace(input, undefined, now).ok).toBe(false);
    }
  });
  it("이관 시각은 과거 CI와 현재 검증일을 새로 만들지 않는다", () => {
    const state = projectWorkspaceScope(createAdminWorkspace(), "operations");
    state.records.push({ ...metadataRecord(), factStatus: "확인", verifiedAt: "2026-11-17T03:00:00Z", reviewer: "이전 검토자", sourceTitle: "가상 CI 원문", sourceUrl: `https://github.com/${repository}/actions/runs/123`, verificationNote: "이전 실행 결과를 대조함" });
    const imported = valueOf(importAdminWorkspace(state, undefined, now));
    const record = imported.records[0];
    expect(record).toMatchObject({ factStatus: "미확인", verifiedAt: "", reviewer: "" });
    expect(imported.imports[0].importedAt).toBe(now.toISOString());
    expect(workspaceFreshness(record, now).tone).toBe("neutral");
    expect(assessWorkspaceEvidenceSet(record.evidence!, record.evidenceTarget!, now)).toMatchObject({ current: false, status: "stale", historicalSuccess: true });
    expect((record.evidence![0] as WorkspaceCiEvidence).completedAt).toBe("2026-11-16T03:00:00Z");
  });
});
