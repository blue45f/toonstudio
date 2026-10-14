/**
 * 검수 요청 왕복의 순수 모델.
 *
 * 지금까지 내부 검수는 "핀에 담당자를 지정하고 승인 게이트를 바꾸는 것"으로 흩어져 있어
 * 대상·마감·체크포인트를 한 번에 정하는 명시적인 요청이 없었다(협업 흐름 전수 진단 마찰 #6).
 * 이 모델은 한 화면 폼(ProductionReviewRequestForm)의 초안·검증·전송물 변환과,
 * 받는 쪽 통합 작업함에서 비교 검수로 바로 들어가는 경로를 한곳에서 제공한다.
 *
 * 전송물은 새 서버 계약을 만들지 않는다: 기존 검수 작업과 같은 모양의 ProductionTask
 * (status "internal-review" + reviewerAssignmentIds + completionCriteria)를
 * 기존 `upsert-task` 명령으로 저장한다. 받는 사람의 작업함·보드 "내 검수" 규칙
 * (productionTaskIsMine)이 그대로 잡아낸다 — reviewerAssignmentIds에 검수자가 들어간다.
 */
import {
  episodeScope,
  type ProductionProjectAggregate,
  type ProductionTask,
  type ReviewLane,
} from "@toonstudio/core/production";

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
    reviewerAssignmentId: "",
    lane: "",
    dueDate: toLocalDateInputValue(addLocalDays(now, REVIEW_REQUEST_DEFAULT_DUE_DAYS)),
    checkpointIds: REVIEW_REQUEST_DEFAULT_CHECKPOINTS,
    note: "",
  };
}

export type ReviewRequestIssue =
  | "episode-required"
  | "reviewer-required"
  | "lane-required"
  | "due-required"
  | "due-past"
  | "checkpoint-required";

const REVIEW_REQUEST_ISSUE_LABELS: Readonly<Record<ReviewRequestIssue, BilingualLabel>> = Object.freeze({
  "episode-required": { ko: "검수할 회차를 골라 주세요.", en: "Pick an episode to review." },
  "reviewer-required": { ko: "검수자를 골라 주세요.", en: "Pick a reviewer." },
  "lane-required": { ko: "검수 항목을 골라 주세요.", en: "Pick a review lane." },
  "due-required": { ko: "마감을 정해 주세요.", en: "Set a due date." },
  "due-past": { ko: "마감은 오늘 이후로 정해 주세요.", en: "Set the due date to today or later." },
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
  if (!draft.reviewerAssignmentId) issues.push("reviewer-required");
  if (!draft.lane) issues.push("lane-required");
  if (!draft.dueDate) issues.push("due-required");
  else if (draft.dueDate < toLocalDateInputValue(now)) issues.push("due-past");
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
  const policyEpisodeIds = new Set(
    aggregate.reviewPolicies.filter((policy) => policy.scope.kind === "episode").map((policy) => policy.scope.id),
  );
  return aggregate.episodes
    .filter((episode) => policyEpisodeIds.has(episode.episodeId) && episode.state !== "published")
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
): readonly ReviewRequestReviewerOption[] {
  const policy = aggregate.reviewPolicies.find((entry) => entry.scope.id === episodeId) ?? null;
  if (!policy) return [];
  return aggregate.assignments
    .filter((assignment) => assignment.status === "active")
    .map((assignment) => ({
      assignmentId: assignment.id,
      displayName: aggregate.parties.find((party) => party.id === assignment.partyId)?.publicDisplayName ?? assignment.id,
      lanes: policy.lanes
        .filter((lane) => lane.eligibleAssignmentIds.includes(assignment.id))
        .map((lane) => lane.lane),
    }))
    .filter((option) => option.lanes.length > 0);
}

export function reviewRequestCheckpointLabel(id: ReviewRequestCheckpointId, localize: ProductionLocalize): string {
  const checkpoint = REVIEW_REQUEST_CHECKPOINTS.find((entry) => entry.id === id);
  return checkpoint ? localize(checkpoint.label.ko, checkpoint.label.en) : id;
}

/**
 * 검증이 끝난 초안을 전송용 검수 작업으로 바꾼다.
 * - status "internal-review" + reviewerAssignmentIds: 받는 쪽 작업함·보드의 "내 검수" 규칙과 그대로 맞물린다.
 * - completionCriteria: 고른 체크포인트가 검수 완료 조건으로 남는다.
 * - note: briefBlocks 문단으로 남겨 받는 쪽이 요청 맥락을 작업에서 바로 읽는다.
 */
export function buildReviewRequestTask(
  aggregate: ProductionProjectAggregate,
  draft: ReviewRequestDraft,
  input: { readonly id: string; readonly localize: ProductionLocalize },
): ProductionTask {
  const episode = deriveReviewRequestEpisodes(aggregate).find((entry) => entry.episodeId === draft.episodeId);
  const episodeLabel = episode ? input.localize(episode.label.ko, episode.label.en) : draft.episodeId;
  const laneLabel = draft.lane ? input.localize(REVIEW_LANE_LABELS[draft.lane].ko, REVIEW_LANE_LABELS[draft.lane].en) : "";
  const note = draft.note.trim();
  return {
    id: input.id,
    projectId: aggregate.projectId,
    scope: episodeScope(aggregate.projectId, draft.episodeId),
    processKey: REVIEW_REQUEST_PROCESS_KEY,
    title: input.localize(
      `검수 요청 · ${episodeLabel} · ${laneLabel}`,
      `Review request · ${episodeLabel} · ${laneLabel}`,
    ),
    status: "internal-review",
    assignmentIds: [draft.reviewerAssignmentId],
    reviewerAssignmentIds: [draft.reviewerAssignmentId],
    inputRevisionRefs: [],
    outputDeliverableIds: [],
    dependencyTaskIds: [],
    dueAt: new Date(`${draft.dueDate}T23:59:00`).toISOString(),
    estimateHours: null,
    completionCriteria: draft.checkpointIds.map((id) => reviewRequestCheckpointLabel(id, input.localize)),
    sourceAgreementMilestoneId: null,
    ...(note
      ? {
          briefBlocks: [
            {
              id: `${input.id}-note`,
              kind: "paragraph" as const,
              text: note,
            },
          ],
        }
      : {}),
  };
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
  if (item.bucket === "review" && item.episodeId) {
    return buildCompareReviewPath(item.projectId, item.episodeId);
  }
  return `/production/projects/${encodeURIComponent(item.projectId)}/production?task=${encodeURIComponent(item.taskId)}`;
}
