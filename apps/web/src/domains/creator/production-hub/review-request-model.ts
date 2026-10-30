/**
 * 검수 요청 왕복의 순수 모델.
 *
 * 지금까지 내부 검수는 "핀에 담당자를 지정하고 승인 게이트를 바꾸는 것"으로 흩어져 있어
 * 대상·마감·체크포인트를 한 번에 정하는 명시적인 요청이 없었다(협업 흐름 전수 진단 마찰 #6).
 * 이 모델은 한 화면 폼(ProductionReviewRequestForm)의 초안·검증·전송물 변환과,
 * 받는 쪽 통합 작업함에서 비교 검수로 바로 들어가는 경로를 한곳에서 제공한다.
 *
 * 실제 제작 작업의 현재 제출본과 고정 입력을 유지하고 검수자·기한·체크포인트를 추가한다.
 * 새 빈 작업을 검수 상태로 만들지 않고 합법적인 검수 전환을 expectedTasks와 함께 저장한다.
 */
import {
  eligibleAssignmentsForTask, eligibleProductionReviewAssignments, episodeScope, scopeContains, productionTaskHasCurrentReviewOutputs,
  type ProductionProjectAggregate,
  type ProductionTask,
  type ReviewLane,
} from "@toonstudio/core/production";
import { previewProductionBoardMove } from "./production-board-move-preview";
import { policyForProductionSubmission } from "./production-review-submission";
import type { ProductionClientCommand } from "./production-api";
import { canonicalJson } from "@toonstudio/studio-project-model";

import type { ProductionPersonalInboxItem } from "./production-dashboard-api";
import { REVIEW_LANE_LABELS, type BilingualLabel, type ProductionLocalize } from "./production-labels";
import { productionEpisodeRoomPath } from "./production-project-surfaces";

/** 검수자가 반드시 확인할 체크포인트. 작업의 completionCriteria로 그대로 남는다. */
export type ReviewRequestCheckpointId =
  | "story-flow"
  | "art-consistency"
  | "lettering-readability"
  | "canon-continuity"
  | "rights-credit";

export const REVIEW_REQUEST_CHECKPOINTS: readonly {
  readonly id: ReviewRequestCheckpointId;
  readonly label: BilingualLabel;
}[] = Object.freeze([
  { id: "story-flow", label: { ko: "이야기 흐름·대사", en: "Story flow & dialogue" } },
  { id: "art-consistency", label: { ko: "그림·캐릭터 일관성", en: "Art & character consistency" } },
  { id: "lettering-readability", label: { ko: "식자·말풍선 가독성", en: "Lettering & balloon readability" } },
  { id: "canon-continuity", label: { ko: "설정·연속성", en: "Canon & continuity" } },
  { id: "rights-credit", label: { ko: "권리·크레딧 표기", en: "Rights & credits" } },
]);

export const REVIEW_REQUEST_DEFAULT_CHECKPOINTS: readonly ReviewRequestCheckpointId[] = Object.freeze([
  "story-flow",
  "art-consistency",
]);

/** 기본 마감: 요청일 +3일. */
export const REVIEW_REQUEST_DEFAULT_DUE_DAYS = 3;

/** 검수 요청 작업이 속하는 공정. 모든 규모(개인·팀·스튜디오) 기본 워크플로에 있는 최종 교정 단계. */
export const REVIEW_REQUEST_PROCESS_KEY = "joint-proof";

/** `yyyy-mm-dd` (로컬 날짜 입력값). */
export function toLocalDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export interface ReviewRequestDraft {
  readonly episodeId: string;
  readonly taskId: string;
  readonly reviewerAssignmentId: string;
  /** 검수 항목(레인). 검수자 선택 전에는 빈 문자열. */
  readonly lane: ReviewLane | "";
  /** `yyyy-mm-dd`. */
  readonly dueDate: string;
  readonly checkpointIds: readonly ReviewRequestCheckpointId[];
  readonly note: string;
}

export function createReviewRequestDraft(episodeId: string, now: Date): ReviewRequestDraft {
  return {
    episodeId,
    taskId: "",
    reviewerAssignmentId: "",
    lane: "",
    dueDate: toLocalDateInputValue(addLocalDays(now, REVIEW_REQUEST_DEFAULT_DUE_DAYS)),
    checkpointIds: REVIEW_REQUEST_DEFAULT_CHECKPOINTS,
    note: "",
  };
}

export type ReviewRequestIssue =
  | "episode-required"
  | "task-required"
  | "reviewer-required"
  | "lane-required"
  | "due-required"
  | "due-past"
  | "due-invalid"
  | "checkpoint-required";

const REVIEW_REQUEST_ISSUE_LABELS: Readonly<Record<ReviewRequestIssue, BilingualLabel>> = Object.freeze({
  "episode-required": { ko: "검수할 회차를 골라 주세요.", en: "Pick an episode to review." },
  "task-required": { ko: "현재 제출본이 있는 실제 작업을 골라 주세요.", en: "Pick an existing task with current submissions." },
  "reviewer-required": { ko: "검수자를 골라 주세요.", en: "Pick a reviewer." },
  "lane-required": { ko: "검수 항목을 골라 주세요.", en: "Pick a review lane." },
  "due-required": { ko: "마감을 정해 주세요.", en: "Set a due date." },
  "due-past": { ko: "마감은 오늘 이후로 정해 주세요.", en: "Set the due date to today or later." },
  "due-invalid": { ko: "실제로 존재하는 마감 날짜를 선택하세요.", en: "Select a valid calendar date." },
  "checkpoint-required": { ko: "체크포인트를 하나 이상 골라 주세요.", en: "Pick at least one checkpoint." },
});

export function reviewRequestIssueLabel(issue: ReviewRequestIssue, localize: ProductionLocalize): string {
  const label = REVIEW_REQUEST_ISSUE_LABELS[issue];
  return localize(label.ko, label.en);
}

/** 폼 검증. 한 화면에서 전부 끝나므로, 막는 이유를 코드로 돌려 폼이 문장으로 보여 준다. */
export function validateReviewRequestDraft(draft: ReviewRequestDraft, now: Date): readonly ReviewRequestIssue[] {
  const issues: ReviewRequestIssue[] = [];
  if (!draft.episodeId) issues.push("episode-required");
  if (!draft.taskId) issues.push("task-required");
  if (!draft.reviewerAssignmentId) issues.push("reviewer-required");
  if (!draft.lane) issues.push("lane-required");
  if (!draft.dueDate) issues.push("due-required");
  else {
    const date = new Date(`${draft.dueDate}T12:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(draft.dueDate) || !Number.isFinite(date.getTime()) || toLocalDateInputValue(date) !== draft.dueDate) issues.push("due-invalid");
    else if (draft.dueDate < toLocalDateInputValue(now)) issues.push("due-past");
  }
  if (draft.checkpointIds.length === 0) issues.push("checkpoint-required");
  return issues;
}

export interface ReviewRequestEpisodeOption {
  readonly episodeId: string;
  readonly label: BilingualLabel;
}

/** 요청 대상 회차: 검수 정책이 있고 아직 게시되지 않은 회차 (검수 표면 큐와 같은 기준). */
export function deriveReviewRequestEpisodes(
  aggregate: ProductionProjectAggregate,
): readonly ReviewRequestEpisodeOption[] {
  return aggregate.episodes
    .filter((episode) => episode.projectId === aggregate.projectId && episode.state !== "published" && episode.state !== "cancelled" && aggregate.reviewPolicies.some((policy) => policy.projectId === aggregate.projectId
      && (scopeContains(policy.scope, episodeScope(aggregate.projectId, episode.episodeId)) || scopeContains(episodeScope(aggregate.projectId, episode.episodeId), policy.scope))))
    .map((episode) => {
      const plan = aggregate.episodePlans
        .filter((entry) => entry.episodeId === episode.episodeId)
        .sort((left, right) => right.revision - left.revision)[0];
      return {
        episodeId: episode.episodeId,
        label: plan
          ? { ko: `${plan.episodeNumber}화 · ${plan.title}`, en: `Ep. ${plan.episodeNumber} · ${plan.title}` }
          : { ko: episode.episodeId, en: episode.episodeId },
      };
    });
}

export interface ReviewRequestReviewerOption {
  readonly assignmentId: string;
  readonly displayName: string;
  /** 이 회차 정책에서 이 검수자가 결정할 수 있는 항목. */
  readonly lanes: readonly ReviewLane[];
}

/** 검수자 후보: 선택 회차의 검수 정책에서 하나 이상의 항목에 자격이 있는 활성 참여자. */
export function deriveReviewRequestReviewers(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
  taskId?: string,
  at = new Date().toISOString(),
): readonly ReviewRequestReviewerOption[] {
  const task = taskId ? deriveReviewRequestTasks(aggregate, episodeId).find((entry) => entry.id === taskId) : null;
  const policies = task ? task.outputDeliverableIds.flatMap((id) => {
    const deliverable = aggregate.deliverables.find((entry) => entry.id === id), submission = aggregate.submissions.find((entry) => entry.id === deliverable?.currentSubmissionId);
    const policy = policyForProductionSubmission(aggregate, submission ?? null); return policy ? [policy] : [];
  }) : aggregate.reviewPolicies.filter((entry) => entry.scope.kind === "episode" && entry.scope.id === episodeId);
  if (!policies.length) return [];
  const eligibleIds = new Set(task ? eligibleAssignmentsForTask({ task, assignments: aggregate.assignments, kind: "reviewer", at }).map((entry) => entry.id) : aggregate.assignments.map((entry) => entry.id));
  return aggregate.assignments.filter((assignment) => eligibleIds.has(assignment.id))
    .map((assignment) => ({
      assignmentId: assignment.id,
      displayName: aggregate.parties.find((party) => party.id === assignment.partyId)?.publicDisplayName ?? assignment.id,
      lanes: [...new Set(policies.flatMap((policy) => eligibleProductionReviewAssignments(aggregate, policy.scope, at).some((entry) => entry.id === assignment.id)
        ? policy.lanes.filter((lane) => lane.eligibleAssignmentIds.includes(assignment.id)).map((lane) => lane.lane) : []))],
    }))
    .filter((option) => option.lanes.length > 0);
}

export function reviewRequestCheckpointLabel(id: ReviewRequestCheckpointId, localize: ProductionLocalize): string {
  const checkpoint = REVIEW_REQUEST_CHECKPOINTS.find((entry) => entry.id === id);
  return checkpoint ? localize(checkpoint.label.ko, checkpoint.label.en) : id;
}

export function deriveReviewRequestTasks(aggregate: ProductionProjectAggregate, episodeId: string): readonly ProductionTask[] {
  return aggregate.tasks.filter((task) => task.projectId === aggregate.projectId
    && (task.scope.kind === "episode" && task.scope.id === episodeId || task.scope.ancestors.some((entry) => entry.kind === "episode" && entry.id === episodeId)));
}
export interface ProductionReviewRequestPlan { readonly task: ProductionTask; readonly command: ProductionClientCommand; readonly outputSubmissionIds: readonly string[]; readonly expectedRevision: number }
/** 원고·담당자·기존 조건을 유지한 실제 작업에만 검수를 요청한다. */
export function buildReviewRequestPlan(
  aggregate: ProductionProjectAggregate,
  draft: ReviewRequestDraft,
  input: { readonly id: string; readonly localize: ProductionLocalize; readonly at: string },
): ProductionReviewRequestPlan {
  if (!Number.isFinite(Date.parse(input.at)) || validateReviewRequestDraft(draft, new Date(input.at)).length) throw new Error("검수할 작업·검수자·항목·마감과 체크포인트를 확인하세요.");
  const task = deriveReviewRequestTasks(aggregate, draft.episodeId).find((entry) => entry.id === draft.taskId);
  if (!task) throw new Error("현재 회차의 실제 작업을 선택하세요.");
  if (!["in-progress", "internal-review"].includes(task.status)) throw new Error("작업 보드에서 입력을 준비하고 작업을 시작한 뒤 검수를 요청하세요. 상태를 자동으로 건너뛰지 않습니다.");
  if (!productionTaskHasCurrentReviewOutputs(task, aggregate)) throw new Error("모든 산출물에 작업의 고정 입력과 일치하는 현재 제출본이 있어야 합니다. 먼저 원고를 제출하세요.");
  if (task.outputDeliverableIds.some((id) => { const output = aggregate.deliverables.find((entry) => entry.id === id), submission = aggregate.submissions.find((entry) => entry.id === output?.currentSubmissionId); return !policyForProductionSubmission(aggregate, submission ?? null); })) throw new Error("현재 산출물마다 적용할 제작 검수 기준을 먼저 설정하세요.");
  const reviewer = deriveReviewRequestReviewers(aggregate, draft.episodeId, task.id, input.at).find((entry) => entry.assignmentId === draft.reviewerAssignmentId && draft.lane && entry.lanes.includes(draft.lane));
  if (!reviewer) throw new Error("현재 작업 범위·기간과 검수 정책에 맞는 연결 검수자와 항목을 선택하세요.");
  const laneLabel = draft.lane ? input.localize(REVIEW_LANE_LABELS[draft.lane].ko, REVIEW_LANE_LABELS[draft.lane].en) : "";
  const note = draft.note.trim();
  const prepared: ProductionTask = {
    ...task,
    reviewerAssignmentIds: [...new Set([...task.reviewerAssignmentIds, draft.reviewerAssignmentId])],
    dueAt: new Date(`${draft.dueDate}T23:59:00`).toISOString(),
    completionCriteria: [...new Set([...task.completionCriteria, ...draft.checkpointIds.map((id) => reviewRequestCheckpointLabel(id, input.localize))])],
    briefBlocks: [...(task.briefBlocks ?? []).filter((entry) => entry.id !== `${input.id}-note`), { id: `${input.id}-note`, kind: "paragraph",
      text: input.localize(`검수 요청 · ${laneLabel}${note ? ` · ${note}` : ""}`, `Review request · ${laneLabel}${note ? ` · ${note}` : ""}`) }],
  };
  const candidate = { ...aggregate, tasks: aggregate.tasks.map((entry) => entry.id === task.id ? prepared : entry) };
  const preview = task.status === "in-progress" ? previewProductionBoardMove(candidate, [task.id], "internal-review", input.at) : null;
  if (preview && !preview.allowed) throw new Error(preview.reason);
  const updated = preview?.changed[0] ?? prepared;
  const outputSubmissionIds = task.outputDeliverableIds.map((id) => aggregate.deliverables.find((entry) => entry.id === id)?.currentSubmissionId).filter((id): id is string => Boolean(id));
  return { task: updated, command: { type: "upsert-task-batch", tasks: [updated], expectedTasks: [task] }, outputSubmissionIds, expectedRevision: aggregate.revision };
}
export function confirmsReviewRequest(aggregate: ProductionProjectAggregate, plan: ProductionReviewRequestPlan): boolean {
  if (aggregate.revision <= plan.expectedRevision) return false;
  const task = aggregate.tasks.find((entry) => entry.id === plan.task.id && entry.projectId === plan.task.projectId);
  if (!task || canonicalJson(task) !== canonicalJson(plan.task)) return false;
  const current = task.outputDeliverableIds.map((id) => aggregate.deliverables.find((entry) => entry.id === id)?.currentSubmissionId);
  return plan.outputSubmissionIds.length === current.length && plan.outputSubmissionIds.every((id, index) => current[index] === id);
}
export function buildTaskReviewPath(projectId: string, taskId: string, episodeId?: string | null): string {
  const query = new URLSearchParams({ task: taskId }); if (episodeId) query.set("episode", episodeId);
  return `/production/projects/${encodeURIComponent(projectId)}/review?${query.toString()}`;
}

/** 회차 룸 비교 검수 탭으로 바로 들어가는 경로. 룸은 `roomView=compare`를 읽어 비교 탭으로 연다. */
export function buildCompareReviewPath(projectId: string, episodeId: string): string {
  return `${productionEpisodeRoomPath(projectId, episodeId)}?roomView=compare`;
}

/**
 * 받은 검수함 항목의 목적지.
 * 검수 버킷이고 회차가 있으면 공정 보드가 아니라 회차 룸 비교 검수로 바로 진입한다.
 * 그 외 항목은 기존 목적지(보드 작업)를 유지한다.
 */
export function reviewInboxItemHref(
  item: Pick<ProductionPersonalInboxItem, "bucket" | "projectId" | "taskId" | "episodeId">,
): string {
  if (item.bucket === "review") {
    return buildTaskReviewPath(item.projectId, item.taskId, item.episodeId);
  }
  return `/production/projects/${encodeURIComponent(item.projectId)}/production?task=${encodeURIComponent(item.taskId)}`;
}
