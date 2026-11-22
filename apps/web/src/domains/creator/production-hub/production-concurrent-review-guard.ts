import type {
  CutPlan,
  ProductionProjectAggregate,
  ReviewDecisionValue,
  RoleAssignment,
  ScopeRef,
  Submission,
} from "@toonstudio/core/production";

export type ProductionRoleLens = "story" | "art" | "producer";

export interface RecordedSubmissionDecisionMeta {
  readonly submissionId: string;
  readonly revisionNumber: number;
  readonly deliverableId: string;
  readonly value: ReviewDecisionValue;
}

export interface StaleSubmissionDecisionNotice {
  readonly staleSubmissionId: string;
  readonly staleRevisionNumber: number;
  readonly latestSubmission: Submission | null;
  readonly value: ReviewDecisionValue;
}

export function isConcurrentStaleSubmissionError(cause: unknown): boolean {
  const text = cause instanceof Error ? cause.message : String(cause ?? "");
  return (
    text.includes("submission-not-current")
    || text.includes("illegal-submission-transition:superseded:")
    || text.includes("현재 산출물의 고정 제출본")
  );
}

export function isSubmissionSupersededInAggregate(
  aggregate: ProductionProjectAggregate | null | undefined,
  submission: Submission,
): boolean {
  if (!aggregate || aggregate.projectId !== submission.projectId) return false;
  const current = aggregate.submissions.find((entry) => entry.id === submission.id);
  const deliverable = aggregate.deliverables.find((entry) => entry.id === submission.deliverableId);
  if (!current || !deliverable) return false;
  return current.status === "superseded" || deliverable.currentSubmissionId !== submission.id;
}

export function deriveStaleSubmissionDecisionNotice(
  aggregate: ProductionProjectAggregate,
  meta: RecordedSubmissionDecisionMeta | null,
): StaleSubmissionDecisionNotice | null {
  if (!meta) return null;
  const deliverable = aggregate.deliverables.find((entry) => entry.id === meta.deliverableId) ?? null;
  const targetSub = aggregate.submissions.find((entry) => entry.id === meta.submissionId) ?? null;
  if (!deliverable) return null;
  const isSuperseded =
    targetSub?.status === "superseded" || deliverable.currentSubmissionId !== meta.submissionId;
  if (!isSuperseded) return null;
  const latestSubmission = deliverable.currentSubmissionId
    ? aggregate.submissions.find((entry) => entry.id === deliverable.currentSubmissionId) ?? null
    : null;
  return Object.freeze({
    staleSubmissionId: meta.submissionId,
    staleRevisionNumber: meta.revisionNumber,
    latestSubmission,
    value: meta.value,
  });
}

/** 회차 선택지 이름. 최신 회차 기획의 번호·제목을 쓰고, 기획이 없으면 식별자를 그대로 보여 준다. */
export function episodeOptionLabel(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
  localize: (ko: string, en: string) => string,
): string {
  const plan = [...aggregate.episodePlans]
    .filter((entry) => entry.episodeId === episodeId)
    .sort((left, right) => right.revision - left.revision)[0];
  return plan ? localize(`${plan.episodeNumber}화 · ${plan.title}`, `Ep. ${plan.episodeNumber} · ${plan.title}`) : episodeId;
}

export function uniqueId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

export { latestProductionCuts as latestCuts } from "@toonstudio/core/production";

export function partyLabel(aggregate: ProductionProjectAggregate, assignmentId: string): string {
  const assignment = aggregate.assignments.find((entry) => entry.id === assignmentId);
  const party = assignment ? aggregate.parties.find((entry) => entry.id === assignment.partyId) : null;
  return party?.publicDisplayName ?? assignmentId;
}

/** "이름 · 담당 역할". 이름에 이미 역할이 붙어 있으면(예: "이서진 PD") 역할을 다시 붙이지 않는다. */
export function assignmentBadge(name: string, role: string): string {
  return name.endsWith(role) ? name : `${name} · ${role}`;
}

export function lensAssignment(
  aggregate: ProductionProjectAggregate,
  roleLens: ProductionRoleLens,
): RoleAssignment | null {
  const priorities: Readonly<Record<ProductionRoleLens, readonly RoleAssignment["roleType"][]>> = {
    story: ["story-lead", "writer", "adaptation-writer"],
    art: ["art-lead", "storyboard-artist", "line-artist"],
    producer: ["producer", "editor"],
  };
  return priorities[roleLens]
    .map((role) => aggregate.assignments.find((entry) => entry.status === "active" && entry.roleType === role))
    .find((entry): entry is RoleAssignment => Boolean(entry)) ?? null;
}

export function oppositeAnswerOwner(
  aggregate: ProductionProjectAggregate,
  roleLens: ProductionRoleLens,
): RoleAssignment | null {
  if (roleLens === "art") return lensAssignment(aggregate, "story");
  return lensAssignment(aggregate, "art") ?? lensAssignment(aggregate, "story");
}

export function cutScope(aggregate: ProductionProjectAggregate, cut: CutPlan): ScopeRef {
  return {
    kind: "cut",
    id: cut.cutId,
    ancestors: [
      { kind: "project", id: aggregate.projectId },
      { kind: "episode", id: cut.episodeId },
      { kind: "scene", id: cut.sceneId },
    ],
  };
}
