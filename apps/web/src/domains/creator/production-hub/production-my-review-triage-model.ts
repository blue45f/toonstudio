import {
  activeAssignments,
  scopeContains,
  type CutPlan,
  type ProductionProjectAggregate,
  type ScopeRef,
  type Submission,
} from "@toonstudio/core/production";

import { latestCuts, lensAssignment, partyLabel, type ProductionRoleLens } from "./production-concurrent-review-guard";
import { productionAssignmentName, roleTypeLabel, type ProductionLocalize } from "./production-labels";
import { buildProductionReviewDeepLinkSearch } from "./production-review-deep-link-model";
import { decisionsForProductionSubmission, policyForProductionSubmission } from "./production-review-submission";
import { deriveSubmissionResubmissionSummary } from "./production-submission-resubmit-model";

export type MyReviewTriageStatus = "changes-requested" | "resubmitted" | "awaiting-approval";
export type MyReviewTriageStatusFilter = "all" | MyReviewTriageStatus;

export const REVIEW_TRIAGE_STATUS_PARAM = "reviewStatus";
export const REVIEW_TRIAGE_ASSIGNEE_PARAM = "reviewAssignee";

const VALID_TRIAGE_STATUSES: readonly MyReviewTriageStatus[] = [
  "changes-requested",
  "resubmitted",
  "awaiting-approval",
];

export interface MyReviewTriageFilters {
  readonly status: MyReviewTriageStatusFilter;
  readonly assignee: string;
}

export interface MyReviewTriageAssigneeOption {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

export interface MyReviewTriageItem {
  readonly id: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly episodeId: string;
  readonly episodeLabel: string;
  readonly status: MyReviewTriageStatus;
  readonly title: string;
  readonly detail: string;
  readonly cutId: string;
  readonly cutLabel: string;
  readonly taskId: string | null;
  readonly submissionId: string | null;
  readonly revisionId: string | null;
  readonly revisionNumber: number | null;
  readonly primaryAssigneeId: string | null;
  readonly primaryAssigneeLabel: string;
  readonly assigneeIds: readonly string[];
  readonly dueAt: string | null;
  readonly dueDeltaHours: number | null;
}

export interface DerivedMyReviewTriageQueue {
  readonly allItems: readonly MyReviewTriageItem[];
  readonly filteredItems: readonly MyReviewTriageItem[];
  readonly countsByStatus: Readonly<Record<MyReviewTriageStatusFilter, number>>;
  readonly myAssignmentIds: readonly string[];
  readonly myCount: number;
  readonly assigneeOptions: readonly MyReviewTriageAssigneeOption[];
}

export function parseMyReviewTriageFilters(source: string | URLSearchParams): MyReviewTriageFilters {
  const params = typeof source === "string"
    ? new URLSearchParams(source.startsWith("?") ? source.slice(1) : source)
    : source;
  const rawStatus = params.get(REVIEW_TRIAGE_STATUS_PARAM)?.trim() ?? "";
  const status: MyReviewTriageStatusFilter = (VALID_TRIAGE_STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as MyReviewTriageStatus)
    : "all";
  const rawAssignee = params.get(REVIEW_TRIAGE_ASSIGNEE_PARAM)?.trim() ?? "";
  return {
    status,
    assignee: rawAssignee || "all",
  };
}

export function applyMyReviewTriageFiltersToSearch(
  existing: URLSearchParams,
  filters: MyReviewTriageFilters,
): URLSearchParams {
  const next = new URLSearchParams(existing);
  if (filters.status === "all") next.delete(REVIEW_TRIAGE_STATUS_PARAM);
  else next.set(REVIEW_TRIAGE_STATUS_PARAM, filters.status);

  if (!filters.assignee || filters.assignee === "all") next.delete(REVIEW_TRIAGE_ASSIGNEE_PARAM);
  else next.set(REVIEW_TRIAGE_ASSIGNEE_PARAM, filters.assignee);

  return next;
}

export function buildMyReviewTargetCutHref(
  item: Pick<MyReviewTriageItem, "projectId" | "taskId" | "episodeId" | "cutId" | "submissionId" | "revisionId">,
  filters: MyReviewTriageFilters,
): string {
  const filterParams = applyMyReviewTriageFiltersToSearch(new URLSearchParams(), filters);
  const search = buildProductionReviewDeepLinkSearch(
    {
      taskId: item.taskId,
      episodeId: item.episodeId,
      cutId: item.cutId,
      submissionId: item.submissionId,
      revisionId: item.revisionId,
    },
    filterParams,
  );
  const query = search.toString();
  const base = `/production/projects/${encodeURIComponent(item.projectId)}/review`;
  return query ? `${base}?${query}` : base;
}

function resolveEpisodeIdForScope(scope: ScopeRef): string | null {
  if (scope.kind === "episode") return scope.id;
  return scope.ancestors.find((ancestor) => ancestor.kind === "episode")?.id ?? null;
}

function pickCutForScopes(cuts: readonly CutPlan[], scopes: readonly ScopeRef[], preferDialogue = false): CutPlan | null {
  if (cuts.length === 0) return null;
  for (const scope of scopes) {
    if (scope.kind === "cut") {
      const exact = cuts.find((cut) => cut.cutId === scope.id);
      if (exact) return exact;
    }
    if (scope.kind === "scene") {
      const inScene = cuts.find((cut) => cut.sceneId === scope.id);
      if (inScene) return inScene;
    }
  }
  if (preferDialogue) {
    const withDialogue = [...cuts].reverse().find((cut) => cut.dialogueRefs.length > 0);
    if (withDialogue) return withDialogue;
    return cuts[cuts.length - 1] ?? cuts[0] ?? null;
  }
  return cuts[0] ?? null;
}

function pickCutForQuestion(cuts: readonly CutPlan[], scope: ScopeRef, question: string): CutPlan | null {
  if (cuts.length === 0) return null;
  if (scope.kind === "cut") {
    const exact = cuts.find((cut) => cut.cutId === scope.id);
    if (exact) return exact;
  }
  if (scope.kind === "scene") {
    const inScene = cuts.find((cut) => cut.sceneId === scope.id);
    if (inScene) return inScene;
  }
  const tokens = question
    .split(/[\s,?.!·()]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  if (tokens.length > 0) {
    const matched = cuts.find((cut) =>
      tokens.some(
        (token) =>
          cut.framing.includes(token)
          || cut.camera.includes(token)
          || cut.layerRequirements.some((layer) => layer.includes(token)),
      ),
    );
    if (matched) return matched;
  }
  return cuts[cuts.length - 1] ?? cuts[0] ?? null;
}

function formatAssigneeDisplay(
  aggregate: ProductionProjectAggregate,
  assignmentId: string | null,
  bt: ProductionLocalize,
): string {
  if (!assignmentId) return bt("미배정", "Unassigned");
  const assignment = aggregate.assignments.find((entry) => entry.id === assignmentId);
  const name = productionAssignmentName(aggregate, assignmentId);
  if (!assignment) return name;
  const role = assignment.publicCreditRole ?? roleTypeLabel(assignment.roleType, bt);
  return `${partyLabel(aggregate, assignmentId)} · ${role}`;
}

function uniqueStrings(values: readonly (string | null | undefined)[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function computeDueDeltaHours(dueAt: string | null, nowMs: number): number | null {
  if (!dueAt) return null;
  const parsed = Date.parse(dueAt);
  if (!Number.isFinite(parsed)) return null;
  return Math.round((parsed - nowMs) / 3_600_000);
}

function statusSortRank(status: MyReviewTriageStatus): number {
  switch (status) {
    case "changes-requested":
      return 0;
    case "resubmitted":
      return 1;
    case "awaiting-approval":
      return 2;
  }
}

function extractAggregateTriageItems(
  aggregate: ProductionProjectAggregate,
  nowIso: string,
  nowMs: number,
  bt: ProductionLocalize,
): readonly MyReviewTriageItem[] {
  const items: MyReviewTriageItem[] = [];
  const allLatestCuts = latestCuts(aggregate.cutPlans);
  const activeAssignIds = new Set(activeAssignments(aggregate.assignments, nowIso).map((entry) => entry.id));

  for (const episode of aggregate.episodes) {
    if (episode.state === "cancelled" || episode.state === "published") continue;
    const episodeCuts = allLatestCuts.filter((cut) => cut.episodeId === episode.episodeId);
    if (episodeCuts.length === 0) continue;

    const plan = [...aggregate.episodePlans]
      .filter((entry) => entry.episodeId === episode.episodeId)
      .sort((left, right) => right.revision - left.revision)[0] ?? null;
    const episodeLabel = plan
      ? bt(`${plan.episodeNumber}화`, `Ep. ${plan.episodeNumber}`)
      : episode.episodeId;

    const episodeDeliverables = aggregate.deliverables.filter(
      (deliverable) =>
        deliverable.projectId === aggregate.projectId
        && resolveEpisodeIdForScope(deliverable.scope) === episode.episodeId,
    );
    const deliverableById = new Map(episodeDeliverables.map((entry) => [entry.id, entry]));

    const activeSubmissions = aggregate.submissions.filter(
      (submission) =>
        submission.projectId === aggregate.projectId
        && deliverableById.has(submission.deliverableId)
        && submission.status !== "superseded"
        && submission.status !== "approved",
    );

    const primaryEpisodeSubmission: Submission | null =
      activeSubmissions.find((submission) => deliverableById.get(submission.deliverableId)?.currentSubmissionId === submission.id)
      ?? activeSubmissions[0]
      ?? null;

    for (const submission of activeSubmissions) {
      const deliverable = deliverableById.get(submission.deliverableId) ?? null;
      if (!deliverable) continue;
      const linkedTask = aggregate.tasks.find(
        (task) => task.projectId === aggregate.projectId && task.outputDeliverableIds.includes(deliverable.id),
      ) ?? null;
      const policy = policyForProductionSubmission(aggregate, submission);
      const currentDecisions = policy
        ? decisionsForProductionSubmission(aggregate, submission, policy, nowIso)
        : [];
      const resubSummary = deriveSubmissionResubmissionSummary({
        aggregate,
        submission,
        policy,
        currentDecisions,
        cuts: episodeCuts,
        episodeId: episode.episodeId,
        partyLabelForAssignment: (assignmentId) => partyLabel(aggregate, assignmentId),
        roleLabelForAssignment: (assignmentId) => {
          const entry = aggregate.assignments.find((candidate) => candidate.id === assignmentId);
          return entry ? entry.publicCreditRole ?? roleTypeLabel(entry.roleType, bt) : "";
        },
      });
      const hasNegativeDecision = currentDecisions.some(
        (decision) => decision.value === "request-changes" || decision.value === "veto",
      );

      let status: MyReviewTriageStatus;
      if (submission.status === "changes-requested" || hasNegativeDecision) {
        status = "changes-requested";
      } else if (resubSummary?.isResubmitted || submission.revisionRef.revision > 1) {
        status = "resubmitted";
      } else {
        status = "awaiting-approval";
      }

      const changedCut = resubSummary?.changedCutIds
        .map((cutId) => episodeCuts.find((cut) => cut.cutId === cutId) ?? null)
        .find((cut): cut is CutPlan => cut !== null) ?? null;
      const targetCut = changedCut ?? pickCutForScopes(episodeCuts, [deliverable.scope]) ?? episodeCuts[0]!;

      const pendingReviewerIds = resubSummary
        ? resubSummary.nextReviewers
            .filter((reviewer) => !reviewer.approvedInCurrentRevision)
            .map((reviewer) => reviewer.assignmentId)
        : policy
          ? policy.lanes.flatMap((lane) => lane.eligibleAssignmentIds)
          : linkedTask?.reviewerAssignmentIds ?? [];

      const assigneeIds = (
        status === "changes-requested"
          ? uniqueStrings([submission.submittedByAssignmentId, ...(linkedTask?.assignmentIds ?? []), ...pendingReviewerIds])
          : uniqueStrings([...pendingReviewerIds, ...(linkedTask?.reviewerAssignmentIds ?? []), submission.submittedByAssignmentId])
      ).filter((id) => activeAssignIds.has(id) || aggregate.assignments.some((entry) => entry.id === id));

      const primaryAssigneeId = assigneeIds[0] ?? submission.submittedByAssignmentId;
      const dueAt = linkedTask?.dueAt ?? null;
      const title = linkedTask
        ? status === "resubmitted"
          ? bt(
              `${linkedTask.title} · ${submission.revisionRef.revision}차 재검수`,
              `${linkedTask.title} · Rev. ${submission.revisionRef.revision} re-review`,
            )
          : status === "changes-requested"
            ? bt(
                `${linkedTask.title} · ${submission.revisionRef.revision}차 수정요청`,
                `${linkedTask.title} · Rev. ${submission.revisionRef.revision} changes requested`,
              )
            : bt(
                `${linkedTask.title} · ${submission.revisionRef.revision}차 승인 대기`,
                `${linkedTask.title} · Rev. ${submission.revisionRef.revision} awaiting approval`,
              )
        : bt(
            `${episodeLabel} · ${submission.revisionRef.revision}차 제출본`,
            `${episodeLabel} · Submission rev. ${submission.revisionRef.revision}`,
          );

      const detail = resubSummary?.note
        ? resubSummary.note
        : status === "resubmitted"
          ? bt(
              `이전 버전 대비 수정 제출된 ${submission.revisionRef.revision}차 본입니다. 대상 컷에서 바로 비교·판정하세요.`,
              `Resubmitted revision ${submission.revisionRef.revision}; inspect and decide directly on the target cut.`,
            )
          : status === "changes-requested"
            ? bt(
                "검수 수정요청이 기록된 제출본입니다. 대상 컷 수정 후 새 리비전을 재제출하세요.",
                "Changes were requested on this submission. Update the target cut and resubmit a new revision.",
              )
            : bt(
                "초안 제출본의 필수 검수 승인을 기다리고 있습니다.",
                "Waiting for required review sign-off on this submission.",
              );

      items.push({
        id: `submission:${submission.id}`,
        projectId: aggregate.projectId,
        projectTitle: aggregate.title,
        episodeId: episode.episodeId,
        episodeLabel,
        status,
        title,
        detail,
        cutId: targetCut.cutId,
        cutLabel: `${targetCut.cutId} · ${targetCut.framing}`,
        taskId: null,
        submissionId: submission.id,
        revisionId: submission.revisionRef.id,
        revisionNumber: submission.revisionRef.revision,
        primaryAssigneeId,
        primaryAssigneeLabel: formatAssigneeDisplay(aggregate, primaryAssigneeId, bt),
        assigneeIds,
        dueAt,
        dueDeltaHours: computeDueDeltaHours(dueAt, nowMs),
      });
    }

    const activeChangeRequests = aggregate.changeRequests.filter(
      (request) =>
        request.projectId === aggregate.projectId
        && request.episodeId === episode.episodeId
        && !["completed", "cancelled", "rejected"].includes(request.status),
    );

    for (const changeRequest of activeChangeRequests) {
      const targetCut = pickCutForScopes(episodeCuts, changeRequest.changedScopes, true) ?? episodeCuts[0]!;
      const dialogueAuthority = aggregate.authorityRules.find(
        (rule) => rule.projectId === aggregate.projectId && scopeContains(rule.scope, episodeDeliverables[0]?.scope ?? changeRequest.changedScopes[0] ?? { kind: "episode", id: episode.episodeId, ancestors: [{ kind: "project", id: aggregate.projectId }] }),
      );
      const assigneeIds = uniqueStrings([
        dialogueAuthority?.decisionAssignmentId ?? null,
        changeRequest.requestedByAssignmentId,
      ]);
      const primaryAssigneeId = assigneeIds[0] ?? changeRequest.requestedByAssignmentId;
      const handoff = aggregate.handoffs.find(
        (entry) => entry.episodeId === episode.episodeId && !["superseded", "cancelled"].includes(entry.status),
      ) ?? null;
      const dueAt = handoff?.dueAt ?? null;

      items.push({
        id: `change-request:${changeRequest.id}`,
        projectId: aggregate.projectId,
        projectTitle: aggregate.title,
        episodeId: episode.episodeId,
        episodeLabel,
        status: "changes-requested",
        title: bt(
          `${episodeLabel} · 마감 변경 수정요청`,
          `${episodeLabel} · Change request`,
        ),
        detail: changeRequest.reason,
        cutId: targetCut.cutId,
        cutLabel: `${targetCut.cutId} · ${targetCut.framing}`,
        taskId: null,
        submissionId: primaryEpisodeSubmission?.id ?? null,
        revisionId: primaryEpisodeSubmission?.revisionRef.id ?? null,
        revisionNumber: primaryEpisodeSubmission?.revisionRef.revision ?? null,
        primaryAssigneeId,
        primaryAssigneeLabel: formatAssigneeDisplay(aggregate, primaryAssigneeId, bt),
        assigneeIds,
        dueAt,
        dueDeltaHours: computeDueDeltaHours(dueAt, nowMs),
      });
    }

    const activeHandoff = aggregate.handoffs.find(
      (entry) => entry.episodeId === episode.episodeId && !["superseded", "cancelled"].includes(entry.status),
    ) ?? null;
    const blockingClarifications = activeHandoff
      ? aggregate.clarifications.filter(
          (thread) => thread.handoffId === activeHandoff.id && thread.status === "open" && thread.blocking,
        )
      : [];

    for (const thread of blockingClarifications) {
      const targetCut = pickCutForQuestion(episodeCuts, thread.scope, thread.question) ?? episodeCuts[0]!;
      const assigneeIds = uniqueStrings([thread.answerOwnerAssignmentId, thread.askedByAssignmentId]);
      const primaryAssigneeId = thread.answerOwnerAssignmentId;
      const dueAt = thread.dueAt ?? activeHandoff?.dueAt ?? null;

      items.push({
        id: `approval-blocker:${thread.id}`,
        projectId: aggregate.projectId,
        projectTitle: aggregate.title,
        episodeId: episode.episodeId,
        episodeLabel,
        status: "awaiting-approval",
        title: bt(
          `${episodeLabel} · 승인 전 차단 확인 대기`,
          `${episodeLabel} · Blocking check awaiting approval`,
        ),
        detail: thread.question,
        cutId: targetCut.cutId,
        cutLabel: `${targetCut.cutId} · ${targetCut.framing}`,
        taskId: null,
        submissionId: primaryEpisodeSubmission?.id ?? null,
        revisionId: primaryEpisodeSubmission?.revisionRef.id ?? null,
        revisionNumber: primaryEpisodeSubmission?.revisionRef.revision ?? null,
        primaryAssigneeId,
        primaryAssigneeLabel: formatAssigneeDisplay(aggregate, primaryAssigneeId, bt),
        assigneeIds,
        dueAt,
        dueDeltaHours: computeDueDeltaHours(dueAt, nowMs),
      });
    }
  }

  return items;
}

export function deriveMyReviewTriageQueue(input: {
  readonly aggregates: readonly ProductionProjectAggregate[];
  readonly filters: MyReviewTriageFilters;
  readonly roleLens: ProductionRoleLens;
  readonly viewerAssignmentIds?: readonly string[];
  readonly now?: Date;
  readonly bt: ProductionLocalize;
}): DerivedMyReviewTriageQueue {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const myAssignmentIdSet = new Set<string>();
  if (input.viewerAssignmentIds && input.viewerAssignmentIds.length > 0) {
    for (const id of input.viewerAssignmentIds) myAssignmentIdSet.add(id);
  } else {
    for (const aggregate of input.aggregates) {
      const preferred = lensAssignment(aggregate, input.roleLens);
      if (preferred) myAssignmentIdSet.add(preferred.id);
    }
  }
  const myAssignmentIds = [...myAssignmentIdSet];

  const allItems = input.aggregates
    .flatMap((aggregate) => extractAggregateTriageItems(aggregate, nowIso, nowMs, input.bt))
    .sort((left, right) => {
      const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY;
      const rightDue = right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY;
      if (leftDue !== rightDue) return leftDue - rightDue;
      const statusDiff = statusSortRank(left.status) - statusSortRank(right.status);
      if (statusDiff !== 0) return statusDiff;
      return left.id.localeCompare(right.id);
    });

  const countsByStatus: Record<MyReviewTriageStatusFilter, number> = {
    all: allItems.length,
    "changes-requested": 0,
    resubmitted: 0,
    "awaiting-approval": 0,
  };
  for (const item of allItems) {
    countsByStatus[item.status] += 1;
  }

  const myCount = allItems.filter((item) =>
    item.assigneeIds.some((assigneeId) => myAssignmentIdSet.has(assigneeId)),
  ).length;

  const optionMap = new Map<string, { label: string; count: number }>();
  for (const aggregate of input.aggregates) {
    for (const item of allItems) {
      if (item.projectId !== aggregate.projectId) continue;
      for (const assigneeId of item.assigneeIds) {
        const existing = optionMap.get(assigneeId);
        if (existing) {
          existing.count += 1;
        } else {
          optionMap.set(assigneeId, {
            label: formatAssigneeDisplay(aggregate, assigneeId, input.bt),
            count: 1,
          });
        }
      }
    }
  }
  const assigneeOptions: MyReviewTriageAssigneeOption[] = [...optionMap.entries()]
    .map(([id, value]) => ({ id, label: value.label, count: value.count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ko"));

  const filteredItems = allItems.filter((item) => {
    if (input.filters.status !== "all" && item.status !== input.filters.status) {
      return false;
    }
    if (!input.filters.assignee || input.filters.assignee === "all") {
      return true;
    }
    if (input.filters.assignee === "me") {
      return item.assigneeIds.some((assigneeId) => myAssignmentIdSet.has(assigneeId));
    }
    return item.assigneeIds.includes(input.filters.assignee);
  });

  return {
    allItems,
    filteredItems,
    countsByStatus,
    myAssignmentIds,
    myCount,
    assigneeOptions,
  };
}
