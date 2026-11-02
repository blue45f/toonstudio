import { canonicalJson } from "@toonstudio/studio-project-model";
import { isProductionIdentity, PRODUCTION_ROLE_TYPES, projectScope, scopeContains, validateCollaborationGraph,
  type CollaborationParty, type ProductionProjectAggregate, type ProductionRoleType, type RoleAssignment, type ScopeRef } from "@toonstudio/core/production";
import type { StudioTeamMember } from "../studio-team-client";
import type { ProductionClientCommand } from "./production-api";
import { productionReviewPolicyScopes } from "./production-review-policy-model";

export type ProductionRoleSetupCommand = Extract<ProductionClientCommand, { readonly type: "configure-collaboration" }>;
export type ProductionRoleSetupFailure = "member" | "party" | "role" | "scope" | "period" | "identity" | "stale" | "graph";
export class ProductionRoleSetupError extends Error {
  constructor(readonly code: ProductionRoleSetupFailure) { super(`제작 역할 입력을 확인하세요: ${code}`); this.name = "ProductionRoleSetupError"; }
}
const fail = (code: ProductionRoleSetupFailure): never => { throw new ProductionRoleSetupError(code); };
type PartyBaseline = Pick<CollaborationParty, "id" | "accountUserId" | "status">;
const partyBaseline = (party: CollaborationParty | undefined): PartyBaseline | null => party
  ? { id: party.id, accountUserId: party.accountUserId, status: party.status } : null;
const ASSIGNMENT_STATUSES: readonly RoleAssignment["status"][] = ["invited", "onboarding", "active", "paused", "ending", "ended"];
const PARTY_STATUSES: readonly CollaborationParty["status"][] = ["invited", "active", "paused", "ended"];

export interface ProductionRoleSetupDraft {
  readonly assignmentId: string | null;
  readonly memberId: string;
  readonly partyId: string | null;
  readonly partyBaseline: PartyBaseline | null;
  readonly roleType: ProductionRoleType;
  readonly scopeKey: string;
  readonly startsAtLocal: string;
  readonly endsAtLocal: string;
  readonly assignmentStatus: RoleAssignment["status"];
  readonly partyStatus: CollaborationParty["status"];
  readonly lead: boolean;
  readonly capabilities: readonly string[];
}
export interface ProductionRoleSetupRequest {
  readonly command: ProductionRoleSetupCommand;
  readonly projectId: string;
  readonly assignmentId: string;
  readonly partyId: string;
  readonly baselineRevision: number;
}

/** 입력창은 지역 시각을 표시하되 수정하지 않은 원래 ISO의 초·밀리초를 보존한다. */
export function productionRoleLocalDateTime(value: string): string {
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return fail("period");
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function isoDateTime(value: string, original: string | null): string {
  if (original && value === productionRoleLocalDateTime(original)) return original;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) return fail("period");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || productionRoleLocalDateTime(date.toISOString()) !== value) return fail("period");
  return date.toISOString();
}

/** 실제 프로젝트·회차·산출물·작업·기존 배정의 범위만 선택한다. Canvas ID를 업무 범위로 추정하지 않는다. */
export function productionRoleSetupScopes(aggregate: ProductionProjectAggregate): readonly { readonly key: string; readonly scope: ScopeRef; readonly label: string }[] {
  const values = new Map(productionReviewPolicyScopes(aggregate).map((entry) => [entry.key, entry]));
  const add = (scope: ScopeRef, label: string) => {
    if (!scopeContains(projectScope(aggregate.projectId), scope)) return;
    const key = canonicalJson(scope); if (!values.has(key)) values.set(key, { key, scope, label });
  };
  for (const task of aggregate.tasks) if (task.projectId === aggregate.projectId) add(task.scope, task.title);
  for (const assignment of aggregate.assignments) if (assignment.projectId === aggregate.projectId) add(assignment.scope, assignment.scope.id);
  return [...values.values()];
}
export function productionRoleSetupDraft(aggregate: ProductionProjectAggregate, original: RoleAssignment | null,
  members: readonly StudioTeamMember[], at: string): ProductionRoleSetupDraft {
  const party = original ? aggregate.parties.find((entry) => entry.id === original.partyId) : undefined;
  if (original && (!party || !aggregate.assignments.some((entry) => entry.id === original.id))) return fail("stale");
  const memberId = party ? party.accountUserId ?? "" : members.find((member) => member.status === "active" && !member.isOwner)?.userId
    ?? members.find((member) => member.status === "active")?.userId ?? "";
  const selectedParty = party ?? aggregate.parties.find((entry) => entry.accountUserId === memberId);
  return { assignmentId: original?.id ?? null, memberId, partyId: selectedParty?.id ?? null, partyBaseline: partyBaseline(selectedParty),
    roleType: original?.roleType ?? "line-artist", scopeKey: canonicalJson(original?.scope ?? projectScope(aggregate.projectId)),
    startsAtLocal: productionRoleLocalDateTime(original?.startsAt ?? at), endsAtLocal: original?.endsAt ? productionRoleLocalDateTime(original.endsAt) : "",
    assignmentStatus: original?.status ?? "active", partyStatus: selectedParty?.status ?? "active", lead: original?.lead ?? false, capabilities: [...(original?.capabilities ?? [])] };
}
export function productionRoleSetupSelectMember(aggregate: ProductionProjectAggregate, draft: ProductionRoleSetupDraft,
  memberId: string): ProductionRoleSetupDraft {
  const original = draft.assignmentId ? aggregate.assignments.find((entry) => entry.id === draft.assignmentId) : undefined;
  const originalParty = original ? aggregate.parties.find((entry) => entry.id === original.partyId) : undefined;
  if (originalParty?.accountUserId && originalParty.accountUserId !== memberId) return fail("party");
  const party = originalParty ?? aggregate.parties.find((entry) => entry.accountUserId === memberId);
  return { ...draft, memberId, partyId: party?.id ?? null, partyBaseline: partyBaseline(party), partyStatus: party?.status ?? "active" };
}
export function productionRoleSetupSelectParty(aggregate: ProductionProjectAggregate, draft: ProductionRoleSetupDraft,
  partyId: string | null): ProductionRoleSetupDraft {
  if (draft.assignmentId) {
    const original = aggregate.assignments.find((entry) => entry.id === draft.assignmentId);
    if (!original || original.partyId !== partyId) return fail("party");
  }
  const party = partyId ? aggregate.parties.find((entry) => entry.id === partyId) : undefined;
  if (partyId && (!party || (party.accountUserId !== null && party.accountUserId !== draft.memberId))) return fail("party");
  return { ...draft, partyId, partyBaseline: partyBaseline(party), partyStatus: party?.status ?? "active" };
}

/** 기존 배열을 보존하고 선택한 당사자·역할만 명시적으로 변경한다. */
export function buildProductionRoleSetupRequest(input: { readonly aggregate: ProductionProjectAggregate; readonly draft: ProductionRoleSetupDraft;
  readonly members: readonly StudioTeamMember[]; readonly original: RoleAssignment | null; readonly newPartyId: string; readonly newAssignmentId: string }): ProductionRoleSetupRequest {
  const { aggregate, draft, members, original } = input;
  const currentOriginal = original ? aggregate.assignments.find((entry) => entry.id === original.id) : null;
  if (draft.assignmentId !== (original?.id ?? null) || (original && (!currentOriginal || canonicalJson(currentOriginal) !== canonicalJson(original)))) return fail("stale");
  if (!(PRODUCTION_ROLE_TYPES as readonly string[]).includes(draft.roleType) || !ASSIGNMENT_STATUSES.includes(draft.assignmentStatus)
    || !PARTY_STATUSES.includes(draft.partyStatus)) return fail("role");
  const scope = productionRoleSetupScopes(aggregate).find((entry) => entry.key === draft.scopeKey)?.scope;
  if (!scope) return fail("scope");
  const selectedParty = draft.partyId ? aggregate.parties.find((party) => party.id === draft.partyId) : undefined;
  if (draft.partyId && !selectedParty) return fail("party");
  if (canonicalJson(partyBaseline(selectedParty)) !== canonicalJson(draft.partyBaseline)) return fail("stale");
  if (selectedParty?.accountUserId !== null && selectedParty?.accountUserId !== undefined && selectedParty.accountUserId !== draft.memberId) return fail("party");
  if (original && selectedParty?.id !== original.partyId) return fail("party");
  const activeMember = members.find((member) => member.userId === draft.memberId && member.status === "active");
  const stoppingDepartedRole = Boolean(original && selectedParty && selectedParty.accountUserId === draft.memberId
    && ["paused", "ending", "ended"].includes(draft.assignmentStatus)
    && (selectedParty.status === draft.partyStatus || draft.partyStatus === "paused" || draft.partyStatus === "ended"));
  const stoppingUnlinkedRole = Boolean(original && selectedParty && selectedParty.accountUserId === null && !draft.memberId
    && ["paused", "ending", "ended"].includes(draft.assignmentStatus)
    && (selectedParty.status === draft.partyStatus || draft.partyStatus === "paused" || draft.partyStatus === "ended"));
  if ((!draft.memberId || !activeMember) && !stoppingDepartedRole && !stoppingUnlinkedRole) return fail("member");
  const partyId = selectedParty?.id ?? input.newPartyId, assignmentId = original?.id ?? input.newAssignmentId;
  if (!isProductionIdentity(partyId) || !isProductionIdentity(assignmentId)
    || (!selectedParty && aggregate.parties.some((party) => party.id === partyId))
    || (!original && aggregate.assignments.some((assignment) => assignment.id === assignmentId))) return fail("identity");
  const startsAt = isoDateTime(draft.startsAtLocal, original?.startsAt ?? null);
  const endsAt = draft.endsAtLocal ? isoDateTime(draft.endsAtLocal, original?.endsAt ?? null) : null;
  if (endsAt !== null && Date.parse(endsAt) < Date.parse(startsAt)) return fail("period");
  const name = activeMember?.name.trim() || selectedParty?.publicDisplayName || draft.memberId;
  const party: CollaborationParty = selectedParty ? { ...selectedParty, accountUserId: draft.memberId || null, status: draft.partyStatus }
    : { id: partyId, accountUserId: draft.memberId, legalIdentityRef: null, publicDisplayName: name, internalDisplayName: name,
      contactPartyId: null, agencyPartyId: null, status: draft.partyStatus };
  const assignment: RoleAssignment = { ...(original ?? { capabilities: [], agreementRevisionRef: null, publicCreditRole: null }),
    id: assignmentId, projectId: aggregate.projectId, partyId, roleType: draft.roleType, scope, startsAt, endsAt,
    status: draft.assignmentStatus, lead: draft.lead, capabilities: [...draft.capabilities] };
  const command: ProductionRoleSetupCommand = { type: "configure-collaboration",
    parties: selectedParty ? aggregate.parties.map((entry) => entry.id === partyId ? party : entry) : [...aggregate.parties, party],
    assignments: original ? aggregate.assignments.map((entry) => entry.id === assignmentId ? assignment : entry) : [...aggregate.assignments, assignment],
    authorityRules: aggregate.authorityRules };
  if (validateCollaborationGraph(command).length) return fail("graph");
  // charter를 보내지 않으면 서버가 기존 charters를 유지한다. 재동의나 권한 확대를 추정하지 않는다.
  return { command: structuredClone(command), projectId: aggregate.projectId, partyId, assignmentId, baselineRevision: aggregate.revision };
}
export function productionRoleSetupConfirmed(aggregate: ProductionProjectAggregate, request: ProductionRoleSetupRequest): boolean {
  const actualAssignment = aggregate.assignments.find((entry) => entry.id === request.assignmentId);
  const expectedAssignment = request.command.assignments.find((entry) => entry.id === request.assignmentId);
  const actualParty = aggregate.parties.find((entry) => entry.id === request.partyId);
  const expectedParty = request.command.parties.find((entry) => entry.id === request.partyId);
  if (!actualAssignment || !expectedAssignment || !actualParty || !expectedParty) return false;
  return aggregate.projectId === request.projectId && aggregate.revision > request.baselineRevision
    && canonicalJson(actualAssignment) === canonicalJson(expectedAssignment)
    && canonicalJson(actualParty) === canonicalJson(expectedParty);
}
