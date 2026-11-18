import {
  normalizeWorkspaceRepository, workspaceEvidenceInstant, workspaceEvidenceObject, workspaceEvidenceSha,
  workspaceEvidenceText, workspaceEvidenceUrl, workspaceMainObservationIssues,
} from "./evidence";

import type { WorkspaceMainObservation } from "./evidence";

export interface WorkspaceSourceReference { provider: "sites" | "admin"; boardId: string; recordId: string }
export interface WorkspaceChangeProof { url: string; observedAt: string; summary: string }
export interface WorkspaceChangeRelation {
  kind: "superseded-by" | "equivalent-in-main"; repository: string; pullRequest?: number;
  sourceSha: string; targetSha: string; proof: WorkspaceChangeProof;
}
export type WorkspacePullRequestState = "unknown" | "open" | "closed-unmerged" | "merged";
export interface WorkspaceChangeIdentity {
  repository?: string; pullRequest?: number; source?: WorkspaceSourceReference; changeKey?: string;
  pullRequestState?: WorkspacePullRequestState; headSha?: string; mergeSha?: string;
  mergeProof?: WorkspaceChangeProof; relations?: WorkspaceChangeRelation[];
}
/** 업무 완료, PR 병합, CI·배포 이력과 승인 기록은 서로의 상태를 변경하지 않는다. */
export interface WorkspaceOperationalState {
  workStatus: "todo" | "in_progress" | "blocked" | "done";
  pullRequestStatus: WorkspacePullRequestState;
  ciStatus: "unknown" | "pending" | "success" | "failure" | "cancelled" | "skipped";
  deploymentStatus: "unknown" | "not-deployed" | "image-built" | "applied" | "smoke-passed" | "failed";
  approvalStatus: "not-requested" | "pending" | "approved" | "rejected";
  approvalEvidence?: { actor: string; at: string; scope: string; subjectRef: string; url: string };
}
export interface WorkspaceDuplicateGroup {
  key: string; recordIds: string[]; reason: "same-pr" | "same-source" | "same-change"; certainty: "same-reference" | "candidate";
}
export interface WorkspaceChangeAssessment {
  key: string | null; pullRequestState: WorkspacePullRequestState; historicalMerged: boolean;
  mainInclusion: "unverified" | "merged-at-observed-main" | "equivalent-change-present";
  supersededBy: number[]; reasons: string[];
}

const prNumber = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const sameSha = (left: unknown, right: unknown) => workspaceEvidenceSha(left) && workspaceEvidenceSha(right) && left.toLowerCase() === right.toLowerCase();
function keys(identity: WorkspaceChangeIdentity): { key: string; reason: WorkspaceDuplicateGroup["reason"] }[] {
  const result: { key: string; reason: WorkspaceDuplicateGroup["reason"] }[] = [];
  const repository = normalizeWorkspaceRepository(identity.repository ?? "");
  if (repository && prNumber(identity.pullRequest)) result.push({ key: JSON.stringify(["github-pr", repository, identity.pullRequest]), reason: "same-pr" });
  const source = identity.source;
  if (source && ["sites", "admin"].includes(source.provider) && workspaceEvidenceText(source.boardId, 500) && workspaceEvidenceText(source.recordId, 500)) {
    // Sites의 불투명 식별자는 변형하지 않는다. 구분자를 포함한 원본 ID도 JSON 배열로 충돌 없이 보존한다.
    result.push({ key: JSON.stringify(["source-record", source.provider, source.boardId, source.recordId]), reason: "same-source" });
  }
  if (repository && workspaceEvidenceText(identity.changeKey, 500)) result.push({ key: JSON.stringify(["change-candidate", repository, identity.changeKey]), reason: "same-change" });
  return result;
}
export function workspaceChangeKey(identity: WorkspaceChangeIdentity): string | null {
  return keys(identity).find(item => item.reason !== "same-change")?.key ?? null;
}
export function workspaceDuplicateGroups(records: readonly { id: string; changeIdentity?: WorkspaceChangeIdentity }[]): WorkspaceDuplicateGroup[] {
  const groups = new Map<string, WorkspaceDuplicateGroup>();
  for (const record of records) {
    if (!record.changeIdentity) continue;
    for (const entry of keys(record.changeIdentity)) {
      const group = groups.get(entry.key) ?? { key: entry.key, recordIds: [], reason: entry.reason, certainty: entry.reason === "same-change" ? "candidate" : "same-reference" };
      if (!group.recordIds.includes(record.id)) group.recordIds.push(record.id);
      groups.set(entry.key, group);
    }
  }
  return [...groups.values()].filter(group => group.recordIds.length > 1);
}
function proofIssues(value: unknown, now: Date): string[] {
  if (!workspaceEvidenceObject(value)) return ["변경 관계의 대조 근거가 필요합니다."];
  const at = workspaceEvidenceInstant(value.observedAt);
  return workspaceEvidenceUrl(value.url) && workspaceEvidenceText(value.summary, 8000) && at !== null && at <= now.getTime()
    ? [] : ["변경 관계에는 HTTPS 근거·실제 대조 내용·유효한 관측 시각이 필요합니다."];
}
export function workspaceChangeIdentityIssues(value: unknown, now = new Date()): string[] {
  if (!workspaceEvidenceObject(value)) return ["변경 식별자는 일반 객체여야 합니다."];
  const issues: string[] = [];
  const repository = typeof value.repository === "string" ? normalizeWorkspaceRepository(value.repository) : null;
  if (value.repository !== undefined && !repository) issues.push("변경의 저장소 식별자가 올바르지 않습니다.");
  if (value.pullRequest !== undefined && (!prNumber(value.pullRequest) || !repository)) issues.push("PR 식별에는 저장소와 양의 PR 번호가 필요합니다.");
  if (value.source !== undefined) {
    if (!workspaceEvidenceObject(value.source) || !["sites", "admin"].includes(String(value.source.provider))
      || !workspaceEvidenceText(value.source.boardId, 500) || !workspaceEvidenceText(value.source.recordId, 500)) issues.push("원본 참조에는 provider·boardId·recordId가 필요합니다.");
  }
  if (value.pullRequest === undefined && value.source === undefined) issues.push("PR 또는 원본 보드·레코드의 안정적인 식별자가 필요합니다.");
  if (value.changeKey !== undefined && (!repository || !workspaceEvidenceText(value.changeKey, 500))) issues.push("변경 그룹에는 저장소와 changeKey가 필요합니다.");
  if (value.pullRequestState !== undefined && !["unknown", "open", "closed-unmerged", "merged"].includes(String(value.pullRequestState))) issues.push("PR 상태가 올바르지 않습니다.");
  for (const name of ["headSha", "mergeSha"]) if (value[name] !== undefined && value[name] !== "" && !workspaceEvidenceSha(value[name])) issues.push(`${name}: 전체 40자리 SHA가 필요합니다.`);
  if (value.mergeProof !== undefined) issues.push(...proofIssues(value.mergeProof, now));
  if (value.relations !== undefined) {
    if (!Array.isArray(value.relations) || value.relations.length > 30) issues.push("변경 관계는 최대 30개 배열이어야 합니다.");
    else for (const relation of value.relations) {
      if (!workspaceEvidenceObject(relation)) { issues.push("변경 관계는 일반 객체여야 합니다."); continue; }
      if (!["superseded-by", "equivalent-in-main"].includes(String(relation.kind))) issues.push("변경 관계 유형이 올바르지 않습니다.");
      if (!repository || typeof relation.repository !== "string" || normalizeWorkspaceRepository(relation.repository) !== repository) issues.push("변경 관계의 저장소가 원본과 일치해야 합니다.");
      if (!workspaceEvidenceSha(relation.sourceSha) || !workspaceEvidenceSha(relation.targetSha) || !sameSha(relation.sourceSha, value.headSha)) issues.push("변경 관계는 원본 head SHA와 대조한 대상 SHA에 연결되어야 합니다.");
      if (relation.pullRequest !== undefined && !prNumber(relation.pullRequest)) issues.push("대체 PR 번호가 올바르지 않습니다.");
      if (relation.kind === "superseded-by" && (!prNumber(relation.pullRequest) || relation.pullRequest === value.pullRequest)) issues.push("대체 관계에는 원본과 다른 PR 번호가 필요합니다.");
      issues.push(...proofIssues(relation.proof, now));
    }
  }
  return [...new Set(issues)];
}
export function workspaceOperationalStateIssues(value: unknown, now = new Date()): string[] {
  if (!workspaceEvidenceObject(value)) return ["운영 상태는 일반 객체여야 합니다."];
  const issues: string[] = [];
  const choices = {
    workStatus: ["todo", "in_progress", "blocked", "done"], pullRequestStatus: ["unknown", "open", "closed-unmerged", "merged"],
    ciStatus: ["unknown", "pending", "success", "failure", "cancelled", "skipped"], deploymentStatus: ["unknown", "not-deployed", "image-built", "applied", "smoke-passed", "failed"],
    approvalStatus: ["not-requested", "pending", "approved", "rejected"],
  };
  for (const [key, values] of Object.entries(choices)) if (!values.includes(String(value[key]))) issues.push(`${key}: 지원하지 않는 상태입니다.`);
  if (value.approvalStatus === "approved" || value.approvalEvidence !== undefined) {
    const proof = value.approvalEvidence;
    if (!workspaceEvidenceObject(proof)) issues.push("승인 기록에는 승인자·범위·대상·시각·근거가 필요합니다.");
    else {
      const at = workspaceEvidenceInstant(proof.at);
      if (!["actor", "scope", "subjectRef"].every(key => workspaceEvidenceText(proof[key], 4000)) || !workspaceEvidenceUrl(proof.url) || at === null || at > now.getTime()) issues.push("승인 기록에는 승인자·범위·대상·시각·근거가 필요합니다.");
    }
  }
  return issues;
}

export function assessWorkspaceChange(identity: WorkspaceChangeIdentity, main?: WorkspaceMainObservation, now = new Date()): WorkspaceChangeAssessment {
  const invalid = workspaceChangeIdentityIssues(identity, now);
  const result: WorkspaceChangeAssessment = {
    key: workspaceChangeKey(identity), pullRequestState: identity.pullRequestState ?? "unknown",
    historicalMerged: invalid.length === 0 && identity.pullRequestState === "merged" && workspaceEvidenceSha(identity.mergeSha) && Boolean(identity.mergeProof), mainInclusion: "unverified", supersededBy: [], reasons: [...invalid],
  };
  if (invalid.length) return result;
  const relations = identity.relations ?? [];
  result.supersededBy = [...new Set(relations.filter(relation => relation.kind === "superseded-by").map(relation => relation.pullRequest!))];
  const mainIssues = workspaceMainObservationIssues(main, now);
  if (mainIssues.length) { result.reasons.push(...mainIssues); return result; }
  if (normalizeWorkspaceRepository(identity.repository ?? "") !== normalizeWorkspaceRepository(main!.repository)) { result.reasons.push("현재 main 관측의 저장소가 변경과 다릅니다."); return result; }
  if (identity.pullRequestState === "merged" && identity.mergeProof && sameSha(identity.mergeSha, main!.sha)) {
    result.mainInclusion = "merged-at-observed-main";
  } else if (relations.some(relation => relation.kind === "equivalent-in-main" && sameSha(relation.targetSha, main!.sha))) {
    result.mainInclusion = "equivalent-change-present";
  }
  if (result.mainInclusion === "unverified") result.reasons.push("대체 PR 링크나 과거 병합 이력만으로 현재 main의 변경 포함을 확정할 수 없습니다.");
  else result.reasons.push("기록된 SHA의 변경 포함만 확인합니다. 원본 PR 상태·CI·배포·승인은 별도입니다.");
  return result;
}
