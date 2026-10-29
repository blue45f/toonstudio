import { activeAssignments, eligibleProductionReviewAssignments, scopeContains, type ProductionProjectAggregate, type RoleAssignment, type ScopeRef } from "@toonstudio/core/production";

/** 실제 계정에 연결된 현재 역할만 사용한다. 예시 프로젝트만 명시적인 역할 체험을 허용한다. */
export function productionReviewActorAssignments(aggregate: ProductionProjectAggregate, scope: ScopeRef, actorId: string | null | undefined,
  viewerAssignmentIds: readonly string[] | undefined, at: string): readonly RoleAssignment[] {
  const demo = aggregate.projectId === "sample-project" && actorId === undefined && viewerAssignmentIds === undefined;
  if (demo) return activeAssignments(aggregate.assignments, at).filter((entry) => entry.status === "active" && entry.projectId === aggregate.projectId && scopeContains(entry.scope, scope));
  if (!actorId?.trim()) return [];
  const parties = new Set(aggregate.parties.filter((party) => party.status === "active" && party.accountUserId === actorId).map((party) => party.id));
  return eligibleProductionReviewAssignments(aggregate, scope, at).filter((entry) => parties.has(entry.partyId)
    && (viewerAssignmentIds === undefined || viewerAssignmentIds.includes(entry.id)));
}
