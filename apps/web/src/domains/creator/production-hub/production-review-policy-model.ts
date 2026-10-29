import { canonicalJson } from "@toonstudio/studio-project-model";
import { eligibleProductionReviewAssignments, episodeScope, projectScope, validateProductionReviewPolicy,
  type ProductionProjectAggregate, type ReviewPolicy, type ScopeRef } from "@toonstudio/core/production";

export interface ProductionReviewPolicyScope { readonly key: string; readonly scope: ScopeRef; readonly label: string }
export function productionReviewPolicyScopes(aggregate: ProductionProjectAggregate): readonly ProductionReviewPolicyScope[] {
  const values: ProductionReviewPolicyScope[] = [];
  const keys = new Set<string>();
  const add = (scope: ScopeRef, label: string) => { const key = canonicalJson(scope); if (!keys.has(key)) { keys.add(key); values.push({ key, scope, label }); } };
  add(projectScope(aggregate.projectId), aggregate.title);
  for (const episode of aggregate.episodes.filter((entry) => entry.projectId === aggregate.projectId && entry.state !== "cancelled")) {
    const plan = aggregate.episodePlans.filter((entry) => entry.episodeId === episode.episodeId).sort((left, right) => right.revision - left.revision)[0];
    add(episodeScope(aggregate.projectId, episode.episodeId), plan ? `${plan.episodeNumber}화 · ${plan.title}` : episode.episodeId);
  }
  for (const deliverable of aggregate.deliverables.filter((entry) => entry.projectId === aggregate.projectId)) {
    add(deliverable.scope, `${deliverable.type} · ${deliverable.expectedFormat}`);
  }
  return values;
}
export interface ProductionReviewPolicyDraft {
  readonly scopeKey: string;
  readonly quorumBasis: "accounts" | "assignments";
  readonly lanes: ReviewPolicy["lanes"];
  readonly responseDueHours: number;
  readonly expiredReviewAction: ReviewPolicy["expiredReviewAction"];
  readonly acknowledgeAccountMigration: boolean;
}
export function productionReviewPolicyDraft(aggregate: ProductionProjectAggregate, policy: ReviewPolicy | null): ProductionReviewPolicyDraft {
  return { scopeKey: canonicalJson(policy?.scope ?? projectScope(aggregate.projectId)), quorumBasis: policy?.quorumBasis ?? (policy ? "assignments" : "accounts"),
    lanes: structuredClone(policy?.lanes ?? []), responseDueHours: policy?.responseDueHours ?? 48,
    expiredReviewAction: policy?.expiredReviewAction ?? "escalate", acknowledgeAccountMigration: false };
}
/** 현재 서버 계약을 재사용하고, 기존 역할표 승인을 계정 인원 승인으로 추정하지 않는다. */
export function buildProductionReviewPolicy(aggregate: ProductionProjectAggregate, draft: ProductionReviewPolicyDraft,
  original: ReviewPolicy | null, newId: string, at: string): ReviewPolicy {
  const scope = productionReviewPolicyScopes(aggregate).find((entry) => entry.key === draft.scopeKey)?.scope;
  if (!scope) throw new Error("현재 프로젝트에 존재하는 회차 또는 산출물 범위를 선택하세요.");
  if (aggregate.reviewPolicies.some((policy) => policy.id !== (original?.id ?? newId) && canonicalJson(policy.scope) === canonicalJson(scope))) throw new Error("이 범위의 검수 기준이 이미 있습니다. 기존 정책을 선택해 수정하세요.");
  if (original && (original.quorumBasis ?? "assignments") !== "accounts" && draft.quorumBasis === "accounts" && !draft.acknowledgeAccountMigration) {
    throw new Error("계정 인원 기준으로 전환하면 계정 증명이 없는 기존 승인을 다시 확인해야 합니다. 전환 안내를 확인하세요.");
  }
  const policy: ReviewPolicy = { id: original?.id ?? newId, projectId: aggregate.projectId, scope,
    ...(original && original.quorumBasis === undefined && draft.quorumBasis === "assignments" ? {} : { quorumBasis: draft.quorumBasis }),
    lanes: structuredClone(draft.lanes), responseDueHours: draft.responseDueHours, expiredReviewAction: draft.expiredReviewAction };
  if (validateProductionReviewPolicy(aggregate, policy, at).length) {
    throw new Error("검수 범위를 포함하는 현재 연결 역할을 선택하고, 중복 없는 항목·필수 역할·거부권·정족수와 응답 기한을 확인하세요.");
  }
  return policy;
}
export function productionReviewPolicyVoterCount(aggregate: ProductionProjectAggregate, scope: ScopeRef, ids: readonly string[], basis: "accounts" | "assignments", at: string): number {
  const assignments = eligibleProductionReviewAssignments(aggregate, scope, at).filter((entry) => ids.includes(entry.id));
  return basis === "assignments" ? assignments.length : new Set(assignments.map((entry) => aggregate.parties.find((party) => party.id === entry.partyId)?.accountUserId)).size;
}
