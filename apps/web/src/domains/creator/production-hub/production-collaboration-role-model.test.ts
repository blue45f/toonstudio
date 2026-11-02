import { describe, expect, it } from "vitest";
import { canonicalJson } from "@toonstudio/studio-project-model";
import { evaluateRoleAssignmentPermissionGuardrails, productionRolePermissionProfile, projectScope, type ProductionProjectAggregate, type RoleAssignment } from "@toonstudio/core/production";
import type { StudioTeamMember } from "../studio-team-client";
import { productionReviewFlowFixture, REVIEW_FLOW_AT } from "./production-review-flow.test-fixture";
import { buildProductionRoleSetupRequest, productionRoleLocalDateTime, productionRoleSetupConfirmed, productionRoleSetupDraft,
  productionRoleSetupSelectMember, productionRoleSetupSelectParty, type ProductionRoleSetupDraft } from "./production-collaboration-role-model";

const member = (userId: string, name: string, isOwner = false): StudioTeamMember => ({ userId, name, image: "", role: isOwner ? "owner" : "viewer", status: "active", isOwner });
const members = [member("review-flow-owner", "제작 책임자", true), member("review-flow-artist", "선화 담당"), member("new-colorist", "신규 채색 담당")];
function prepared(aggregate = productionReviewFlowFixture().base, original: RoleAssignment | null = null) {
  return productionRoleSetupDraft(aggregate, original, members, REVIEW_FLOW_AT);
}
function build(aggregate: ProductionProjectAggregate, draft: ProductionRoleSetupDraft, original: RoleAssignment | null = null, roster = members) {
  return buildProductionRoleSetupRequest({ aggregate, draft, original, members: roster, newPartyId: "new-party", newAssignmentId: "new-assignment" });
}

describe("실제 계정의 제작 역할 설정", () => {
  it("미리보기는 신규 배정의 실제 저장 capability 빈 배열을 평가한다", () => {
    const aggregate = productionReviewFlowFixture().base;
    const draft = { ...prepared(aggregate), roleType: "line-assistant" as const };
    const result = build(aggregate, draft);
    const saved = result.command.assignments.find((entry) => entry.id === result.assignmentId);
    expect(saved?.capabilities).toEqual(draft.capabilities);
    expect(evaluateRoleAssignmentPermissionGuardrails({ ...draft, scope: projectScope(aggregate.projectId) }).missingDefaultCapabilities)
      .toEqual(productionRolePermissionProfile(draft.roleType).defaultCapabilities);
  });
  it("명시적으로 선택한 직군 기본 capability만 저장하고 기존 승인권·계약·원본은 보존한다", () => {
    const f = productionReviewFlowFixture();
    const original = { ...f.artist, capabilities: ["review.approve", "workflow.configure"], agreementRevisionRef: "agreement:7", publicCreditRole: "원래 크레딧" };
    const aggregate = { ...f.aggregate, assignments: f.aggregate.assignments.map((entry) => entry.id === original.id ? original : entry) };
    const before = structuredClone(aggregate);
    const capabilities = [...productionRolePermissionProfile("line-assistant").defaultCapabilities];
    const draft = { ...prepared(aggregate, original), roleType: "line-assistant" as const, capabilities, lead: false };
    const request = build(aggregate, draft, original);
    expect(request.command.assignments.find((entry) => entry.id === original.id)).toMatchObject({ capabilities, lead: false, agreementRevisionRef: "agreement:7", publicCreditRole: "원래 크레딧" });
    expect(request.command.authorityRules).toEqual(aggregate.authorityRules);
    capabilities.push("tampered-after-save");
    expect(request.command.assignments.find((entry) => entry.id === original.id)?.capabilities).not.toContain("tampered-after-save");
    expect(aggregate).toEqual(before);
  });

  it("실제 참여자와 역할을 함께 추가하고 기존 권한·헌장·입력 객체를 보존한다", () => {
    const aggregate = productionReviewFlowFixture().base, before = structuredClone(aggregate);
    const result = build(aggregate, prepared(aggregate));
    expect(result.command.type).toBe("configure-collaboration");
    expect(result.command.parties).toHaveLength(2); expect(result.command.assignments).toHaveLength(2);
    expect(result.command.parties.find((party) => party.id === result.partyId)?.accountUserId).toBe("review-flow-artist");
    expect(result.command.assignments.find((assignment) => assignment.id === result.assignmentId)).toMatchObject({ capabilities: [], agreementRevisionRef: null, publicCreditRole: null });
    expect(result.command.authorityRules).toEqual(aggregate.authorityRules); expect(result.command).not.toHaveProperty("charter");
    expect(result.command.parties[0]).toEqual(aggregate.parties[0]); expect(result.command.assignments[0]).toEqual(aggregate.assignments[0]);
    expect(aggregate).toEqual(before);
  });
  it("같은 계정의 기존 당사자는 재사용하고 새 역할에 관리 capability를 복사하지 않는다", () => {
    const aggregate = productionReviewFlowFixture().base;
    const draft = productionRoleSetupSelectMember(aggregate, prepared(aggregate), "review-flow-owner");
    const result = build(aggregate, { ...draft, roleType: "writer" });
    expect(result.command.parties).toHaveLength(1); expect(result.partyId).toBe(aggregate.parties[0]?.id);
    expect(result.command.assignments.find((entry) => entry.id === result.assignmentId)?.capabilities).toEqual([]);
    expect(result.command.assignments[0]?.capabilities).toEqual(aggregate.assignments[0]?.capabilities);
  });
  it("기존 역할의 ID·계약·크레딧·capability와 수정하지 않은 원래 시각을 보존한다", () => {
    const f = productionReviewFlowFixture(), original = { ...f.artist, startsAt: "2026-10-29T00:00:13.125Z", endsAt: "2026-11-29T04:05:43.250Z",
      agreementRevisionRef: "agreement:7", publicCreditRole: "원래 크레딧", capabilities: ["existing-capability"] };
    const aggregate = { ...f.aggregate, assignments: f.aggregate.assignments.map((entry) => entry.id === original.id ? original : entry) };
    const result = build(aggregate, { ...prepared(aggregate, original), assignmentStatus: "paused" }, original);
    expect(result.command.assignments.find((entry) => entry.id === original.id)).toEqual({ ...original, status: "paused" });
  });
  it("미연결 당사자는 실제 계정을 명시해 연결하고 기존 당사자 ID를 유지한다", () => {
    const f = productionReviewFlowFixture(), unlinked = { ...f.artistParty, accountUserId: null };
    const aggregate = { ...f.aggregate, parties: f.aggregate.parties.map((party) => party.id === unlinked.id ? unlinked : party) };
    const initial = prepared(aggregate, f.artist); expect(initial.memberId).toBe("");
    expect(() => build(aggregate, initial, f.artist)).toThrow(expect.objectContaining({ code: "member" }));
    const linked = productionRoleSetupSelectMember(aggregate, initial, "new-colorist"), result = build(aggregate, linked, f.artist);
    expect(result.partyId).toBe(unlinked.id); expect(result.command.parties).toHaveLength(aggregate.parties.length);
    expect(result.command.parties.find((party) => party.id === unlinked.id)?.accountUserId).toBe("new-colorist");
  });
  it("기존에 연결한 당사자를 다른 계정으로 바꾸거나 기존 역할의 당사자를 바꾸지 않는다", () => {
    const f = productionReviewFlowFixture(), draft = prepared(f.aggregate, f.artist);
    expect(() => productionRoleSetupSelectMember(f.aggregate, draft, "new-colorist")).toThrow(expect.objectContaining({ code: "party" }));
    expect(() => productionRoleSetupSelectParty(f.aggregate, draft, f.editorParty.id)).toThrow(expect.objectContaining({ code: "party" }));
    expect(() => build(f.aggregate, { ...draft, memberId: "new-colorist" }, f.artist)).toThrow(expect.objectContaining({ code: "party" }));
  });
  it("초대 대기·거절된 계정에는 새 활동 역할을 만들지 않는다", () => {
    const aggregate = productionReviewFlowFixture().base, draft = prepared(aggregate);
    for (const status of ["pending", "declined"] as const) {
      expect(() => build(aggregate, draft, null, members.map((entry) => entry.userId === draft.memberId ? { ...entry, status } : entry)))
        .toThrow(expect.objectContaining({ code: "member" }));
    }
  });
  it("작품에서 떠난 기존 연결 역할은 새 계정을 강제하지 않고 끝내되 재활성화하지 않는다", () => {
    const f = productionReviewFlowFixture(), original = { ...f.artist, status: "paused" as const };
    const aggregate = { ...f.aggregate, assignments: f.aggregate.assignments.map((entry) => entry.id === original.id ? original : entry) };
    const roster = members.filter((entry) => entry.userId !== f.artistParty.accountUserId), draft = prepared(aggregate, original);
    expect(build(aggregate, { ...draft, assignmentStatus: "ended" }, original, roster).command.assignments.find((entry) => entry.id === original.id)?.status).toBe("ended");
    expect(() => build(aggregate, { ...draft, assignmentStatus: "active" }, original, roster)).toThrow(expect.objectContaining({ code: "member" }));
  });
  it("미연결 과거 역할 종료에 첫 활성 계정을 자동 연결하지 않는다", () => {
    const f = productionReviewFlowFixture(), party = { ...f.artistParty, accountUserId: null };
    const aggregate = { ...f.aggregate, parties: f.aggregate.parties.map((entry) => entry.id === party.id ? party : entry) };
    const draft = prepared(aggregate, f.artist), result = build(aggregate, { ...draft, assignmentStatus: "ended" }, f.artist);
    expect(draft.memberId).toBe(""); expect(result.command.parties.find((entry) => entry.id === party.id)?.accountUserId).toBeNull();
  });
  it("다른 곳에서 선택 역할·당사자가 바뀌면 보존된 이전 폼으로 덮지 않는다", () => {
    const f = productionReviewFlowFixture(), draft = prepared(f.aggregate, f.artist);
    const roleChanged = { ...f.aggregate, assignments: f.aggregate.assignments.map((entry) => entry.id === f.artist.id ? { ...entry, lead: !entry.lead } : entry) };
    expect(() => build(roleChanged, draft, f.artist)).toThrow(expect.objectContaining({ code: "stale" }));
    const partyChanged = { ...f.aggregate, parties: f.aggregate.parties.map((entry) => entry.id === f.artistParty.id ? { ...entry, status: "paused" as const } : entry) };
    expect(() => build(partyChanged, draft, f.artist)).toThrow(expect.objectContaining({ code: "stale" }));
  });
  it("최신 aggregate의 무관한 새 역할을 보존하고 위조 범위는 거절한다", () => {
    const f = productionReviewFlowFixture(), draft = prepared(f.aggregate, f.artist), extra = { ...f.editor, id: "another-actual-role" };
    const aggregate = { ...f.aggregate, assignments: [...f.aggregate.assignments, extra] };
    expect(build(aggregate, { ...draft, assignmentStatus: "paused" }, f.artist).command.assignments).toContainEqual(extra);
    expect(() => build(aggregate, { ...draft, scopeKey: canonicalJson(projectScope("other-project")) }, f.artist)).toThrow(expect.objectContaining({ code: "scope" }));
  });
  it("잘못된 날짜·역전 기간·새 역할 ID 충돌을 거절한다", () => {
    const aggregate = productionReviewFlowFixture().base, draft = prepared(aggregate);
    expect(() => build(aggregate, { ...draft, startsAtLocal: "2026-02-30T12:00" })).toThrow(expect.objectContaining({ code: "period" }));
    expect(() => build(aggregate, { ...draft, endsAtLocal: productionRoleLocalDateTime(new Date(Date.parse(REVIEW_FLOW_AT) - 60_000).toISOString()) }))
      .toThrow(expect.objectContaining({ code: "period" }));
    expect(() => buildProductionRoleSetupRequest({ aggregate, draft, members, original: null, newPartyId: "new-party", newAssignmentId: aggregate.assignments[0]?.id ?? "" }))
      .toThrow(expect.objectContaining({ code: "identity" }));
  });
  it("서버 계약이 허용한 같은 시작·종료 시각의 과거 역할도 그대로 상태를 바꿀 수 있다", () => {
    const f = productionReviewFlowFixture(), original = { ...f.artist, startsAt: "2026-10-29T00:00:13.125Z", endsAt: "2026-10-29T00:00:13.125Z" };
    const aggregate = { ...f.aggregate, assignments: f.aggregate.assignments.map((entry) => entry.id === original.id ? original : entry) };
    const result = build(aggregate, { ...prepared(aggregate, original), assignmentStatus: "ended" }, original);
    expect(result.command.assignments.find((entry) => entry.id === original.id)).toEqual({ ...original, status: "ended" });
  });
  it("응답 불명확 뒤 동일 역할·당사자와 전진한 revision이 모두 있어야 저장을 확인한다", () => {
    const aggregate = productionReviewFlowFixture().base, request = build(aggregate, prepared(aggregate));
    expect(productionRoleSetupConfirmed(aggregate, request)).toBe(false);
    const applied = { ...aggregate, revision: aggregate.revision + 1, parties: request.command.parties, assignments: request.command.assignments };
    expect(productionRoleSetupConfirmed(applied, request)).toBe(true);
    expect(productionRoleSetupConfirmed({ ...applied, revision: aggregate.revision }, request)).toBe(false);
    expect(productionRoleSetupConfirmed({ ...applied, assignments: applied.assignments.map((entry) => entry.id === request.assignmentId ? { ...entry, lead: !entry.lead } : entry) }, request)).toBe(false);
    expect(productionRoleSetupConfirmed({ ...applied, parties: aggregate.parties }, request)).toBe(false);
    expect(productionRoleLocalDateTime("2026-10-29T00:00:13.125Z")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u);
  });
});
