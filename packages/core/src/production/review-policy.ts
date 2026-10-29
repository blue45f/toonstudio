import { activeAssignments } from "./collaboration";
import { isProductionIdentity, projectScope, scopeContains } from "./scope";
import { REVIEW_LANES, type ProductionProjectAggregate, type ReviewDecision, type ReviewPolicy, type RoleAssignment, type ScopeRef } from "./types";

type ReviewAggregate = Pick<ProductionProjectAggregate, "projectId" | "parties" | "assignments">;

function contains(container: ScopeRef, candidate: ScopeRef): boolean {
  try { return scopeContains(container, candidate); }
  catch { return false; }
}

/** 새 정책의 범위 전체를 현재 계정으로 검수할 수 있는 정확한 역할만 반환한다. */
export function eligibleProductionReviewAssignments(aggregate: ReviewAggregate, scope: ScopeRef, at: string): readonly RoleAssignment[] {
  if (!contains(projectScope(aggregate.projectId), scope)) return [];
  const parties = new Map(aggregate.parties.map((party) => [party.id, party]));
  const partyCounts = new Map<string, number>(), assignmentCounts = new Map<string, number>();
  for (const party of aggregate.parties) partyCounts.set(party.id, (partyCounts.get(party.id) ?? 0) + 1);
  for (const assignment of aggregate.assignments) assignmentCounts.set(assignment.id, (assignmentCounts.get(assignment.id) ?? 0) + 1);
  return Object.freeze(activeAssignments(aggregate.assignments, at).filter((assignment) => {
    const party = parties.get(assignment.partyId);
    return assignment.status === "active" && assignment.projectId === aggregate.projectId && assignmentCounts.get(assignment.id) === 1
      && partyCounts.get(assignment.partyId) === 1 && party?.status === "active" && isProductionIdentity(party.accountUserId)
      && contains(projectScope(aggregate.projectId), assignment.scope) && contains(assignment.scope, scope);
  }));
}

/** 계정 기준의 새 승인에는 현재 역할 연결과 일치하는 stamp만 쓰고 과거 원문은 보존한다. */
export function currentProductionReviewDecisions(aggregate: ReviewAggregate, policy: ReviewPolicy, scope: ScopeRef,
  decisions: readonly ReviewDecision[], at: string): readonly ReviewDecision[] {
  if (policy.quorumBasis !== "accounts") return decisions;
  const parties = new Map(aggregate.parties.map((party) => [party.id, party.accountUserId]));
  const accounts = new Map(eligibleProductionReviewAssignments(aggregate, scope, at)
    .map((assignment) => [assignment.id, parties.get(assignment.partyId)]));
  const latest = new Map<string, ReviewDecision>();
  for (const decision of decisions) {
    const key = `${decision.lane}:${decision.assignmentId}`, previous = latest.get(key);
    if (!previous || Date.parse(decision.createdAt) >= Date.parse(previous.createdAt)) latest.set(key, decision);
  }
  return Object.freeze([...latest.values()].filter((decision) => !["approve", "approve-with-conditions"].includes(decision.value)
    || (decision.reviewerAccountUserId !== undefined && accounts.get(decision.assignmentId) === decision.reviewerAccountUserId)));
}

/** 새로 등록하거나 바꾸는 정책만 검증하고 기존 승인 이력과 미연결 과거 표를 보존한다. */
export function validateProductionReviewPolicy(aggregate: ReviewAggregate, policy: ReviewPolicy, at: string): readonly string[] {
  const issues: string[] = [];
  if (!isProductionIdentity(policy.id) || policy.projectId !== aggregate.projectId
    || !contains(projectScope(aggregate.projectId), policy.scope)) issues.push("검수 정책의 프로젝트와 범위를 다시 확인하세요.");
  if (policy.quorumBasis !== undefined && !["assignments", "accounts"].includes(policy.quorumBasis)) issues.push("검수 정족수 기준이 올바르지 않습니다.");
  if (!Number.isSafeInteger(policy.responseDueHours) || policy.responseDueHours < 1 || policy.responseDueHours > 8_760
    || !["escalate", "replace-reviewer", "reschedule"].includes(policy.expiredReviewAction)) issues.push("검수 응답 기한과 만료 후 처리 방법을 확인하세요.");
  if (!policy.lanes.length || policy.lanes.length > 20 || new Set(policy.lanes.map((lane) => lane.lane)).size !== policy.lanes.length) {
    issues.push("검수 영역은 중복 없이 1~20개로 구성하세요.");
  }
  const available = new Map(eligibleProductionReviewAssignments(aggregate, policy.scope, at).map((assignment) => [assignment.id, assignment]));
  const parties = new Map(aggregate.parties.map((party) => [party.id, party]));
  for (const lane of policy.lanes) {
    if (!(REVIEW_LANES as readonly string[]).includes(lane.lane)) issues.push("지원하지 않는 검수 영역입니다.");
    const eligible = new Set(lane.eligibleAssignmentIds);
    for (const ids of [lane.eligibleAssignmentIds, lane.requiredAssignmentIds, lane.vetoAssignmentIds]) {
      if (ids.length > 100 || new Set(ids).size !== ids.length || ids.some((id) => !isProductionIdentity(id))) {
        issues.push(`${lane.lane}: 검수 역할을 중복 없이 선택하세요.`);
      }
    }
    if (!eligible.size || [...eligible].some((id) => !available.has(id))) issues.push(`${lane.lane}: 현재 계정이 연결되고 활동 기간·정책 범위를 담당하는 역할을 선택하세요.`);
    if ([...lane.requiredAssignmentIds, ...lane.vetoAssignmentIds].some((id) => !eligible.has(id))) issues.push(`${lane.lane}: 필수·거부권 역할은 검수 가능 역할 안에서 선택하세요.`);
    const capacity = policy.quorumBasis === "accounts"
      ? new Set([...eligible].flatMap((id) => {
        const assignment = available.get(id), userId = assignment && parties.get(assignment.partyId)?.accountUserId;
        return isProductionIdentity(userId) ? [userId] : [];
      })).size
      : eligible.size;
    if (!Number.isSafeInteger(lane.quorum) || lane.quorum < 1 || lane.quorum > 100 || lane.quorum > capacity) {
      issues.push(`${lane.lane}: 정족수는 검수 가능한 ${policy.quorumBasis === "accounts" ? "서로 다른 계정 인원" : "역할 수"} 안에서 정하세요.`);
    }
  }
  return Object.freeze([...new Set(issues)]);
}
