import { describe, expect, it } from "vitest";

import { createProductionProjectAggregate } from "./aggregate";
import { evaluateReviewApproval } from "./review";
import { currentProductionReviewDecisions, eligibleProductionReviewAssignments, validateProductionReviewPolicy } from "./review-policy";
import { episodeScope, projectScope } from "./scope";

import type { ProductionProjectAggregate, ReviewDecision, ReviewPolicy } from "./types";

const at = "2026-10-29T09:00:00.000Z", scope = episodeScope("project", "episode-one");
function fixture(): ProductionProjectAggregate {
  const base = createProductionProjectAggregate({ projectId: "project", workId: "work", title: "계정 기준 검수",
    collaborationModel: "co-creator", ownerPartyId: "owner", ownerUserId: "owner-user", ownerDisplayName: "제작자", at });
  const assignment = base.assignments[0], party = base.parties[0];
  if (!assignment || !party) throw new Error("검수 역할 fixture가 없습니다.");
  return { ...base, parties: [...base.parties, ...["a", "b", "c"].map((id) => ({ ...party, id: `party-${id}`,
    accountUserId: id === "c" ? "reviewer-two" : "reviewer-one" }))],
    assignments: [...base.assignments, ...["a", "b", "c"].map((id) => ({ ...assignment, id, partyId: `party-${id}` }))] };
}
const policy: ReviewPolicy = { id: "policy", projectId: "project", scope, quorumBasis: "accounts", responseDueHours: 24,
  expiredReviewAction: "escalate", lanes: [{ lane: "production", eligibleAssignmentIds: ["a", "b", "c"],
    requiredAssignmentIds: ["a"], vetoAssignmentIds: ["b"], quorum: 2, blocksPublication: true }] };
function vote(assignmentId: string, account?: string, patch: Partial<ReviewDecision> = {}): ReviewDecision {
  return { id: `vote-${assignmentId}`, reviewRoundId: "submission", lane: "production", assignmentId,
    ...(account ? { reviewerAccountUserId: account } : {}), value: "approve", reasonCode: null,
    evidenceScopeRefs: [scope], conditions: [], createdAt: at, ...patch };
}

describe("계정과 역할 기준 검수 정족수", () => {
  it("한 계정의 여러 역할은 인원 한 명이고 두 번째 실제 계정이 승인해야 정족수를 채운다", () => {
    const same = [vote("a", "reviewer-one"), vote("b", "reviewer-one")];
    expect(evaluateReviewApproval(policy, same)).toMatchObject({ approved: false, laneResults: [{ approvals: 1 }] });
    expect(evaluateReviewApproval(policy, [...same, vote("c", "reviewer-two")])).toMatchObject({ approved: true,
      laneResults: [{ approvals: 2 }] });
  });

  it("기준이 없거나 assignments이면 같은 계정의 서로 다른 역할표라는 기존 의미를 유지한다", () => {
    const { quorumBasis, ...legacy } = policy;
    expect(quorumBasis).toBe("accounts");
    for (const value of [legacy, { ...policy, quorumBasis: "assignments" as const }]) {
      expect(evaluateReviewApproval(value, [vote("a"), vote("b")]).approved).toBe(true);
      expect(evaluateReviewApproval(value, [vote("a", "reviewer-one"), vote("b", "reviewer-one")]).laneResults[0]?.approvals).toBe(2);
    }
  });

  it("과거 무계정 표는 인원이나 필수 역할의 승인으로 추정하지 않고 원문을 보존한다", () => {
    const decisions = [vote("a"), vote("b", "reviewer-one"), vote("c", "reviewer-two")];
    const before = structuredClone(decisions);
    expect(evaluateReviewApproval(policy, decisions)).toMatchObject({ approved: false,
      laneResults: [{ approvals: 2, missingRequiredAssignmentIds: ["a"] }] });
    expect(decisions).toEqual(before); expect(decisions[0]?.reviewerAccountUserId).toBeUndefined();
  });

  it("필수 역할은 각각 승인해야 하며 같은 인원이 맡았다고 다른 필수 역할의 표를 만들지 않는다", () => {
    const required = { ...policy, lanes: policy.lanes.map((lane) => ({ ...lane, requiredAssignmentIds: ["a", "b"] })) };
    expect(evaluateReviewApproval(required, [vote("a", "reviewer-one"), vote("c", "reviewer-two")])).toMatchObject({
      approved: false, laneResults: [{ approvals: 2, missingRequiredAssignmentIds: ["b"] }] });
  });

  it.each(["veto", "request-changes"] as const)("%s는 계정 stamp가 없는 과거 표라도 기존 역할별 차단 의미를 유지한다", (value) => {
    const decision = vote("b", undefined, { value, reasonCode: "fix" });
    expect(evaluateReviewApproval(policy, [vote("a", "reviewer-one"), vote("c", "reviewer-two"), decision]).approved).toBe(false);
  });

  it("같은 역할은 최신 표만 쓰고 영역마다 인원 수를 따로 계산한다", () => {
    const decisions = [vote("a", "reviewer-one"), vote("c", "reviewer-two"),
      vote("a", "reviewer-one", { id: "new-a", createdAt: "2026-10-29T09:01:00.000Z", value: "abstain" })];
    expect(evaluateReviewApproval(policy, decisions).laneResults[0]?.approvals).toBe(1);
    const multiple: ReviewPolicy = { ...policy, lanes: [
      { ...policy.lanes[0]!, lane: "narrative", quorum: 1, requiredAssignmentIds: [], vetoAssignmentIds: [] },
      { ...policy.lanes[0]!, quorum: 1, requiredAssignmentIds: [], vetoAssignmentIds: [] },
    ] };
    expect(evaluateReviewApproval(multiple, [vote("a", "reviewer-one", { lane: "narrative" }), vote("b", "reviewer-one")]))
      .toMatchObject({ approved: true, laneResults: [{ approvals: 1 }, { approvals: 1 }] });
  });
});

describe("새 검수 정책의 현재 역할·범위·인원 검증", () => {
  it("넓은 역할과 같은 계정의 여러 역할을 보존하며 실제 인원 상한을 적용한다", () => {
    const aggregate = fixture();
    expect(eligibleProductionReviewAssignments(aggregate, scope, at).map((entry) => entry.id)).toEqual([
      aggregate.assignments[0]?.id, "a", "b", "c",
    ]);
    expect(validateProductionReviewPolicy(aggregate, policy, at)).toEqual([]);
    const sameAccount = { ...policy, lanes: policy.lanes.map((lane) => ({ ...lane, eligibleAssignmentIds: ["a", "b"] })) };
    expect(validateProductionReviewPolicy(aggregate, sameAccount, at).join()).toContain("서로 다른 계정 인원");
    expect(validateProductionReviewPolicy(aggregate, { ...sameAccount, quorumBasis: "assignments" }, at)).toEqual([]);
  });

  it.each(["future", "expired", "onboarding", "other-project", "other-episode", "unlinked", "inactive-party", "duplicate-role", "duplicate-party"])(
    "%s 역할은 신규 정책에 등록하지 않는다", (kind) => {
      const original = fixture(), a = original.assignments.find((entry) => entry.id === "a"), pa = original.parties.find((entry) => entry.id === "party-a");
      if (!a || !pa) throw new Error("검수자 fixture가 없습니다.");
      const aggregate = { ...original,
        assignments: kind === "duplicate-role" ? [...original.assignments, a] : original.assignments.map((entry) => entry.id !== "a" ? entry : {
          ...entry, ...(kind === "future" ? { startsAt: "2026-10-30T00:00:00.000Z" } : {}),
          ...(kind === "expired" ? { endsAt: "2026-10-28T00:00:00.000Z" } : {}),
          ...(kind === "onboarding" ? { status: "onboarding" as const } : {}),
          ...(kind === "other-project" ? { projectId: "other" } : {}),
          ...(kind === "other-episode" ? { scope: episodeScope("project", "other") } : {}),
        }), parties: kind === "duplicate-party" ? [...original.parties, pa] : original.parties.map((entry) => entry.id !== pa.id ? entry : {
          ...entry, ...(kind === "unlinked" ? { accountUserId: null } : {}),
          ...(kind === "inactive-party" ? { status: "paused" as const } : {}),
        }) };
      expect(eligibleProductionReviewAssignments(aggregate, scope, at).some((entry) => entry.id === "a")).toBe(false);
      expect(validateProductionReviewPolicy(aggregate, policy, at).length).toBeGreaterThan(0);
    });

  it("기간 종료 경계는 기존 활동 함수와 동일하게 포함하고 회차 역할을 프로젝트 전체 검수자로 승격하지 않는다", () => {
    const original = fixture();
    const aggregate = { ...original, assignments: original.assignments.map((entry) => ({ ...entry, scope, endsAt: at })) };
    expect(eligibleProductionReviewAssignments(aggregate, scope, at)).toHaveLength(4);
    expect(eligibleProductionReviewAssignments(aggregate, projectScope("project"), at)).toEqual([]);
  });

  it("계정 재연결과 미확인 최신 표를 걸러도 예전 승인표를 부활시키거나 기존 거부권을 지우지 않는다", () => {
    const original = fixture();
    const rebound = { ...original, parties: original.parties.map((party) => party.id === "party-a" ? { ...party, accountUserId: "new-account" } : party) };
    const votes = [vote("a", "reviewer-one"), vote("b", undefined, { value: "veto", reasonCode: "fix" }), vote("c", "reviewer-two")];
    expect(currentProductionReviewDecisions(rebound, policy, scope, votes, at).map((entry) => entry.assignmentId)).toEqual(["b", "c"]);
    const latest = [...votes, vote("c", undefined, { id: "unverified-c", createdAt: "2026-10-29T09:01:00.000Z" })];
    expect(currentProductionReviewDecisions(original, policy, scope, latest, at).map((entry) => entry.assignmentId)).toEqual(["a", "b"]);
    expect(currentProductionReviewDecisions(rebound, { ...policy, quorumBasis: "assignments" }, scope, votes, at)).toBe(votes);
  });

  it("역할 중복·비적격 필수나 거부권·빈 목록·기한·과다 정족수를 거절한다", () => {
    const aggregate = fixture(), lane = policy.lanes[0];
    if (!lane) throw new Error("검수 영역 fixture가 없습니다.");
    for (const lanes of [[lane, lane], [{ ...lane, eligibleAssignmentIds: [] }], [{ ...lane, eligibleAssignmentIds: ["a", "a"] }],
      [{ ...lane, requiredAssignmentIds: ["c", "c"] }], [{ ...lane, requiredAssignmentIds: ["missing"] }],
      [{ ...lane, vetoAssignmentIds: ["missing"] }], [{ ...lane, quorum: 3 }]]) {
      expect(validateProductionReviewPolicy(aggregate, { ...policy, lanes }, at).length).toBeGreaterThan(0);
    }
    for (const responseDueHours of [0, 8_761, 1.5]) {
      expect(validateProductionReviewPolicy(aggregate, { ...policy, responseDueHours }, at).length).toBeGreaterThan(0);
    }
  });
});
