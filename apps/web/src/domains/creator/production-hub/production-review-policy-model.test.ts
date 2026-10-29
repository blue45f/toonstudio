import { describe, expect, it } from "vitest";
import { canonicalJson } from "@toonstudio/studio-project-model";
import { buildProductionReviewPolicy, productionReviewPolicyDraft, productionReviewPolicyScopes } from "./production-review-policy-model";
import { productionReviewFlowFixture, REVIEW_FLOW_AT } from "./production-review-flow.test-fixture";

describe("실제 제작 검수 정책 구성", () => {
  it("빈 프로젝트의 새 정책은 계정 인원 기준을 기본값으로 저장한다", () => {
    const f = productionReviewFlowFixture(), producer = f.base.assignments[0]; if (!producer) throw new Error("제작 역할이 없습니다.");
    const draft = { ...productionReviewPolicyDraft(f.base, null), lanes: [{ lane: "production" as const, eligibleAssignmentIds: [producer.id], requiredAssignmentIds: [producer.id], vetoAssignmentIds: [], quorum: 1, blocksPublication: true }] };
    expect(buildProductionReviewPolicy(f.base, draft, null, "new-policy", REVIEW_FLOW_AT)).toMatchObject({ projectId: f.base.projectId, quorumBasis: "accounts", lanes: draft.lanes });
    expect(f.base.reviewPolicies).toEqual([]); expect(f.base.tasks).toEqual([]);
  });
  it("현재 프로젝트·회차·실제 산출물의 scope만 선택하고 같은 범위의 중복 정책은 만들지 않는다", () => {
    const f = productionReviewFlowFixture(); expect(productionReviewPolicyScopes(f.aggregate).some((entry) => entry.key === canonicalJson(f.scope))).toBe(true);
    const draft = { ...productionReviewPolicyDraft(f.aggregate, null), scopeKey: canonicalJson(f.scope), lanes: f.policy.lanes };
    expect(() => buildProductionReviewPolicy(f.aggregate, draft, null, "duplicate-policy", REVIEW_FLOW_AT)).toThrow("기존 정책");
    expect(() => buildProductionReviewPolicy(f.base, { ...draft, scopeKey: "가짜-회차" }, null, "new-policy", REVIEW_FLOW_AT)).toThrow("존재하는");
  });
  it("같은 계정의 두 역할을 두 명으로 계산하지 않고 legacy 전환은 명시 확인한다", () => {
    const f = productionReviewFlowFixture(), producer = f.base.assignments[0]; if (!producer) throw new Error("제작 역할이 없습니다.");
    const aggregate = { ...f.aggregate, reviewPolicies: [], parties: f.aggregate.parties.map((party) => party.id === f.editorParty.id ? { ...party, accountUserId: "review-flow-owner" } : party) };
    const draft = { ...productionReviewPolicyDraft(aggregate, null), lanes: [{ ...f.policy.lanes[0]!, eligibleAssignmentIds: [producer.id, f.editor.id], requiredAssignmentIds: [], quorum: 2 }] };
    expect(() => buildProductionReviewPolicy(aggregate, draft, null, "account-policy", REVIEW_FLOW_AT)).toThrow("정족수");
    expect(buildProductionReviewPolicy(aggregate, { ...draft, quorumBasis: "assignments" }, null, "assignment-policy", REVIEW_FLOW_AT).quorumBasis).toBe("assignments");
    const { quorumBasis: _basis, ...legacy } = f.policy;
    const migration = { ...productionReviewPolicyDraft(f.aggregate, legacy), quorumBasis: "accounts" as const };
    expect(() => buildProductionReviewPolicy(f.aggregate, migration, legacy, "unused", REVIEW_FLOW_AT)).toThrow("전환 안내");
    expect(buildProductionReviewPolicy(f.aggregate, { ...migration, acknowledgeAccountMigration: true }, legacy, "unused", REVIEW_FLOW_AT).quorumBasis).toBe("accounts");
  });
  it("실제 연결 계정이나 현재 기간이 없는 역할은 새 검수 정책에 넣지 않는다", () => {
    const f = productionReviewFlowFixture(), draft = productionReviewPolicyDraft(f.aggregate, f.policy);
    const aggregate = { ...f.aggregate, parties: f.aggregate.parties.map((party) => party.id === f.editorParty.id ? { ...party, accountUserId: null } : party) };
    expect(() => buildProductionReviewPolicy(aggregate, draft, f.policy, "unused", REVIEW_FLOW_AT)).toThrow("연결 역할");
    expect(() => buildProductionReviewPolicy(f.aggregate, { ...draft, responseDueHours: 0 }, f.policy, "unused", REVIEW_FLOW_AT)).toThrow("응답 기한");
  });
});
