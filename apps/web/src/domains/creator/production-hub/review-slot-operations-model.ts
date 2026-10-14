/**
 * 검수 슬롯 운영 — 순수 모델 (실제 사례 흡수: 코미코 PD 집단 검수).
 *
 * 근거: NHN코미코 덩크스튜디오는 PD 10여 명이 작품당 1시간 이상을 확보해
 * 함께 검수했다(매일경제). 대면 슬롯은 작품마다 시간을 "먼저 잡아 두는"
 * 운영 개념인데, 비동기로 옮기면 그 슬롯이 사라지기 쉽다. 이 모델은
 * 검수 정책(ReviewPolicy)이 이미 선언하고 있던 두 값을 처음으로 화면
 * 개념으로 연결한다:
 *
 *  1) 응답 기한 — 검수 요청 시각(requestedAt)에 정책의 responseDueHours를
 *     더한 시각이 이 회차 검수 슬롯의 마감이다. 요청 전이면 슬롯은 아직
 *     시작되지 않은 것으로 정직하게 말한다(기한을 지어내지 않는다).
 *  2) 초과 시 조치 — 기한을 넘기고 필수 검수자의 판정이 없으면 정책의
 *     expiredReviewAction(상향 보고/검수자 교체/일정 재조정)을 에스컬레이션
 *     문구로 펼친다. 이 모델·패널은 조치를 실행하지 않는다 — 정책이 정한
 *     다음 조치를 사람에게 문장으로 보여 주고, 실행은 호스트 콜백이 맡는다.
 *
 * 검수자 집합·판정 범위 규칙은 다인 검수 합의 모델과 같다(정책 레인 적격자
 * 합집합, 판정은 회차 범위로 거른다). 합의 모델이 "누가 어떻게 판정했나"를
 * 본다면, 이 모델은 "언제까지 답해야 하고, 넘기면 무엇이 일어나나"를 본다.
 * React·저장소에 의존하지 않는다.
 */
import type {
  ReviewDecision,
  ReviewLane,
  ReviewPolicy,
} from "@toonstudio/core/production";

import {
  REVIEW_LANE_LABELS,
  type BilingualLabel,
} from "./production-labels";

/* ------------------------------------------------------------------ */
/* 정책 expiredReviewAction — 라벨과 에스컬레이션 문구                    */
/* ------------------------------------------------------------------ */

export type ExpiredReviewAction = ReviewPolicy["expiredReviewAction"];

export const EXPIRED_REVIEW_ACTION_LABELS: Readonly<Record<ExpiredReviewAction, BilingualLabel>> = Object.freeze({
  escalate: { ko: "리드에게 상향 보고", en: "Escalate to the lead" },
  "replace-reviewer": { ko: "대체 검수자 지정", en: "Assign a replacement reviewer" },
  reschedule: { ko: "검수 일정 다시 잡기", en: "Reschedule the review" },
});

export interface ReviewEscalationCopy {
  /** 기한 초과 배너 제목. */
  readonly headline: BilingualLabel;
  /** 정책상 다음 조치와, 검수 시간을 다시 확보하려면 무엇을 해야 하는지. */
  readonly guidance: BilingualLabel;
  /** 호스트가 실행 콜백을 붙일 때 쓰는 버튼 문구. */
  readonly cta: BilingualLabel;
}

export const EXPIRED_REVIEW_ESCALATIONS: Readonly<Record<ExpiredReviewAction, ReviewEscalationCopy>> = Object.freeze({
  escalate: {
    headline: { ko: "응답 기한이 지났어요 — 리드에게 올려야 해요", en: "The response deadline passed — escalate to the lead" },
    guidance: {
      ko: "이 검수 정책은 기한 초과 시 리드에게 상향 보고하도록 정해져 있어요. 아직 답하지 않은 검수자를 리드에게 알려, 이 작품의 검수 시간을 다시 확보하세요.",
      en: "This review policy escalates to the lead when the deadline passes. Tell the lead who hasn't responded yet, so this work gets its review time back.",
    },
    cta: { ko: "리드에게 알리기", en: "Notify the lead" },
  },
  "replace-reviewer": {
    headline: { ko: "응답 기한이 지났어요 — 대체 검수자가 필요해요", en: "The response deadline passed — a replacement reviewer is needed" },
    guidance: {
      ko: "이 검수 정책은 기한 초과 시 검수자를 교체하도록 정해져 있어요. 답하지 않은 검수자 대신 지금 볼 수 있는 검수자를 지정해 슬롯을 이어 가세요.",
      en: "This review policy replaces the reviewer when the deadline passes. Assign someone who can look now, in place of the reviewer who hasn't responded, and keep the slot going.",
    },
    cta: { ko: "대체 검수자 지정", en: "Assign a replacement" },
  },
  reschedule: {
    headline: { ko: "응답 기한이 지났어요 — 검수 일정을 다시 잡아야 해요", en: "The response deadline passed — reschedule the review" },
    guidance: {
      ko: "이 검수 정책은 기한 초과 시 일정을 다시 잡도록 정해져 있어요. 새 검수 슬롯을 요청해 작품당 검수 시간을 다시 확보하세요.",
      en: "This review policy reschedules when the deadline passes. Request a new review slot, so this work gets dedicated review time again.",
    },
    cta: { ko: "일정 다시 잡기", en: "Reschedule" },
  },
});

/* ------------------------------------------------------------------ */
/* 슬롯 상태                                                            */
/* ------------------------------------------------------------------ */

/** 기한 임박으로 보는 잔여 시간 상한(시간). 창이 이보다 짧으면 창 비율이 우선한다. */
export const REVIEW_SLOT_DUE_SOON_HOURS = 6;
/** 창 대비 잔여 비율이 이 값 이하면 기한 임박으로 본다. */
export const REVIEW_SLOT_DUE_SOON_RATIO = 0.25;

/**
 * 회차 검수 슬롯의 상태.
 * - no-policy: 검수 정책이 없거나 응답 기한이 유효하지 않다.
 * - not-started: 정책은 있지만 검수 요청이 아직 없어 슬롯이 시작 전이다.
 * - secured: 필수 검수자가 모두 판정해 검수 시간이 확보·소진 완료됐다.
 * - open: 기한 안이고 여유가 있다.
 * - due-soon: 기한 임박(잔여 6시간 이하 또는 창의 25% 이하).
 * - overdue: 기한을 넘겼고 필수 검수자의 판정이 아직 없다.
 */
export type ReviewSlotPhase =
  | "no-policy"
  | "not-started"
  | "secured"
  | "open"
  | "due-soon"
  | "overdue";

export const REVIEW_SLOT_PHASE_LABELS: Readonly<Record<ReviewSlotPhase, BilingualLabel>> = Object.freeze({
  "no-policy": { ko: "검수 정책 없음", en: "No review policy" },
  "not-started": { ko: "검수 요청 전 — 슬롯 시작 전", en: "Not requested yet — slot not started" },
  secured: { ko: "검수 완료 — 슬롯 확보됨", en: "Review done — slot secured" },
  open: { ko: "검수 슬롯 진행 중", en: "Review slot open" },
  "due-soon": { ko: "기한 임박", en: "Deadline approaching" },
  overdue: { ko: "응답 기한 초과", en: "Response deadline passed" },
});

export type ReviewerSlotState = "responded" | "awaiting" | "due-soon" | "overdue";

export interface ReviewerSlotRow {
  readonly assignmentId: string;
  readonly displayName: string;
  readonly lane: ReviewLane;
  readonly laneLabel: BilingualLabel;
  readonly required: boolean;
  readonly state: ReviewerSlotState;
  /** 최신 판정 시각. 판정이 없으면 null이다(지어내지 않는다). */
  readonly decidedAt: string | null;
  /** 판정은 했지만 기한을 넘겨 답한 경우 true. */
  readonly respondedLate: boolean;
}

export interface ReviewEscalation {
  readonly action: ExpiredReviewAction;
  readonly actionLabel: BilingualLabel;
  readonly headline: BilingualLabel;
  readonly guidance: BilingualLabel;
  readonly cta: BilingualLabel;
  /** 기한을 넘기고 아직 답하지 않은 필수 검수자 이름들. 문구의 근거다. */
  readonly pendingRequiredNames: readonly string[];
}

export interface ReviewSlot {
  readonly policyId: string | null;
  readonly episodeId: string;
  readonly phase: ReviewSlotPhase;
  readonly phaseLabel: BilingualLabel;
  /** 정책이 선언한 작품당 응답 창(시간). 정책이 없으면 null. */
  readonly responseDueHours: number | null;
  /** 검수 요청 시각. 요청 전이면 null. */
  readonly requestedAt: string | null;
  /** requestedAt + responseDueHours. 슬롯이 시작 전이면 null. */
  readonly dueAt: string | null;
  /** 기한 문구("10월 16일 오전 9:00까지"). 슬롯이 시작 전이면 null. */
  readonly dueLabel: BilingualLabel | null;
  /** 남은 시간(시간, 소수 1자리). 초과면 음수, 시작 전이면 null. */
  readonly remainingHours: number | null;
  /** 초과 시간(시간, 소수 1자리). 초과가 아니면 0, 시작 전이면 null. */
  readonly overdueHours: number | null;
  /** 창 안에서 지난 비율(0~1). 시작 전이면 null. */
  readonly elapsedRatio: number | null;
  readonly rows: readonly ReviewerSlotRow[];
  /** 기한을 넘겨 답한 검수자 수. */
  readonly lateResponseCount: number;
  /** phase가 overdue일 때만 채워진다. 그 외에는 null — 조치를 지어내지 않는다. */
  readonly escalation: ReviewEscalation | null;
}

/* ------------------------------------------------------------------ */
/* 시각·문구 도우미                                                      */
/* ------------------------------------------------------------------ */

const HOUR_MS = 3_600_000;

const DUE_FORMAT_KO = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
const DUE_FORMAT_EN = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatHours(hours: number): { readonly ko: string; readonly en: string } {
  const absolute = Math.abs(hours);
  if (absolute >= 48) {
    const days = round1(absolute / 24);
    return { ko: `${days}일`, en: `${days}d` };
  }
  if (absolute >= 1) {
    const whole = Number.isInteger(absolute) ? absolute : round1(absolute);
    return { ko: `${whole}시간`, en: `${whole}h` };
  }
  const minutes = Math.max(1, Math.round(absolute * 60));
  return { ko: `${minutes}분`, en: `${minutes} min` };
}

/** 슬롯의 잔여/초과를 한 문구로. 시작 전·정책 없음이면 null. */
export function reviewSlotRemainingLabel(slot: ReviewSlot): BilingualLabel | null {
  if (slot.remainingHours === null) return null;
  if (slot.phase === "secured") {
    return slot.lateResponseCount > 0
      ? { ko: "기한을 넘겨 답한 검수자가 있어요", en: "Some reviewers answered after the deadline" }
      : { ko: "기한 안에 모두 답했어요", en: "Everyone answered in time" };
  }
  if (slot.remainingHours < 0) {
    const span = formatHours(slot.remainingHours);
    return { ko: `${span.ko} 지났어요`, en: `${span.en} overdue` };
  }
  const span = formatHours(slot.remainingHours);
  return { ko: `${span.ko} 남았어요`, en: `${span.en} left` };
}

/* ------------------------------------------------------------------ */
/* 슬롯 도출                                                            */
/* ------------------------------------------------------------------ */

export interface SlotReviewerInfo {
  readonly assignmentId: string;
  readonly displayName: string;
}

export interface BuildReviewSlotInput {
  readonly policy: ReviewPolicy | null;
  readonly episodeId: string;
  /**
   * 검수 요청 시각(ISO). 제출·검수 작업 등 호스트가 아는 요청 기점이다.
   * null이면 슬롯은 시작 전이다 — 기한을 임의로 잡지 않는다.
   */
  readonly requestedAt: string | null;
  readonly decisions: readonly ReviewDecision[];
  readonly reviewers: readonly SlotReviewerInfo[];
  /** 판정 기준 시각(밀리초). 테스트·서버 렌더에서 고정할 수 있다. */
  readonly now: number;
}

function episodeScopedDecisions(
  decisions: readonly ReviewDecision[],
  episodeId: string,
): ReviewDecision[] {
  return decisions.filter((decision) =>
    decision.evidenceScopeRefs.some(
      (scope) => scope.id === episodeId || scope.ancestors.some((ancestor) => ancestor.id === episodeId),
    ));
}

function latestDecisionFor(
  decisions: readonly ReviewDecision[],
  assignmentId: string,
  lane: ReviewLane,
): ReviewDecision | null {
  const mine = decisions
    .filter((decision) => decision.assignmentId === assignmentId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const inLane = mine.filter((decision) => decision.lane === lane);
  const pool = inLane.length > 0 ? inLane : mine;
  return pool[pool.length - 1] ?? null;
}

export function buildReviewSlot(input: BuildReviewSlotInput): ReviewSlot {
  const base: ReviewSlot = {
    policyId: null,
    episodeId: input.episodeId,
    phase: "no-policy",
    phaseLabel: REVIEW_SLOT_PHASE_LABELS["no-policy"],
    responseDueHours: null,
    requestedAt: null,
    dueAt: null,
    dueLabel: null,
    remainingHours: null,
    overdueHours: null,
    elapsedRatio: null,
    rows: [],
    lateResponseCount: 0,
    escalation: null,
  };
  const policy = input.policy;
  if (!policy || policy.lanes.length === 0 || !Number.isFinite(policy.responseDueHours) || policy.responseDueHours <= 0) {
    return base;
  }

  const nameById = new Map(input.reviewers.map((reviewer) => [reviewer.assignmentId, reviewer.displayName]));
  const laneByReviewer = new Map<string, ReviewLane>();
  const requiredIds = new Set<string>();
  for (const lane of policy.lanes) {
    for (const assignmentId of lane.eligibleAssignmentIds) {
      if (!laneByReviewer.has(assignmentId)) laneByReviewer.set(assignmentId, lane.lane);
    }
    for (const assignmentId of lane.requiredAssignmentIds) requiredIds.add(assignmentId);
  }
  if (laneByReviewer.size === 0) return { ...base, policyId: policy.id };

  const requestedMs = input.requestedAt ? Date.parse(input.requestedAt) : NaN;
  if (!Number.isFinite(requestedMs)) {
    return {
      ...base,
      policyId: policy.id,
      phase: "not-started",
      phaseLabel: REVIEW_SLOT_PHASE_LABELS["not-started"],
      responseDueHours: policy.responseDueHours,
    };
  }

  const dueMs = requestedMs + policy.responseDueHours * HOUR_MS;
  const dueAt = new Date(dueMs).toISOString();
  const dueDate = new Date(dueMs);
  const dueLabel: BilingualLabel = {
    ko: `${DUE_FORMAT_KO.format(dueDate)}까지`,
    en: `Due ${DUE_FORMAT_EN.format(dueDate)}`,
  };
  const remainingHours = round1((dueMs - input.now) / HOUR_MS);
  const overdueHours = remainingHours < 0 ? round1(-remainingHours) : 0;
  const elapsedRatio = Math.min(1, Math.max(0, (input.now - requestedMs) / (policy.responseDueHours * HOUR_MS)));

  const decisions = episodeScopedDecisions(input.decisions, input.episodeId);
  // 임박 기준: 잔여 6시간 이하이면서 창의 25% 이하로 남은 경우(둘 중 더 엄격한 쪽).
  const dueSoonThreshold = Math.min(REVIEW_SLOT_DUE_SOON_HOURS, policy.responseDueHours * REVIEW_SLOT_DUE_SOON_RATIO);
  const isOverdue = remainingHours < 0;
  const isDueSoon = !isOverdue && remainingHours <= dueSoonThreshold;

  const rows: ReviewerSlotRow[] = [...laneByReviewer.entries()].map(([assignmentId, lane]) => {
    const decision = latestDecisionFor(decisions, assignmentId, lane);
    const decidedAt = decision?.createdAt ?? null;
    const respondedLate = decidedAt !== null && Date.parse(decidedAt) > dueMs;
    const state: ReviewerSlotState = decision
      ? "responded"
      : isOverdue
        ? "overdue"
        : isDueSoon
          ? "due-soon"
          : "awaiting";
    return {
      assignmentId,
      displayName: nameById.get(assignmentId) ?? assignmentId,
      lane,
      laneLabel: REVIEW_LANE_LABELS[lane],
      required: requiredIds.has(assignmentId),
      state,
      decidedAt,
      respondedLate,
    };
  });

  const pendingRequired = rows.filter((row) => row.required && row.state !== "responded");
  const lateResponseCount = rows.filter((row) => row.respondedLate).length;

  let phase: ReviewSlotPhase;
  if (pendingRequired.length === 0) phase = "secured";
  else if (isOverdue) phase = "overdue";
  else if (isDueSoon) phase = "due-soon";
  else phase = "open";

  const escalation: ReviewEscalation | null = phase === "overdue"
    ? {
        action: policy.expiredReviewAction,
        actionLabel: EXPIRED_REVIEW_ACTION_LABELS[policy.expiredReviewAction],
        ...EXPIRED_REVIEW_ESCALATIONS[policy.expiredReviewAction],
        pendingRequiredNames: pendingRequired.map((row) => row.displayName),
      }
    : null;

  return {
    policyId: policy.id,
    episodeId: input.episodeId,
    phase,
    phaseLabel: REVIEW_SLOT_PHASE_LABELS[phase],
    responseDueHours: policy.responseDueHours,
    requestedAt: new Date(requestedMs).toISOString(),
    dueAt,
    dueLabel,
    remainingHours,
    overdueHours,
    elapsedRatio,
    rows,
    lateResponseCount,
    escalation,
  };
}

/* ------------------------------------------------------------------ */
/* 운영 보드 — 여러 회차 슬롯을 긴급도 순으로                          */
/* ------------------------------------------------------------------ */

const PHASE_ORDER: Readonly<Record<ReviewSlotPhase, number>> = Object.freeze({
  overdue: 0,
  "due-soon": 1,
  open: 2,
  secured: 3,
  "not-started": 4,
  "no-policy": 5,
});

/** 초과(오래된 순) → 임박(남은 시간 적은 순) → 진행 중 → 완료 → 시작 전 순으로 정렬한 새 배열. */
export function sortReviewSlotsByUrgency(slots: readonly ReviewSlot[]): ReviewSlot[] {
  return [...slots].sort((a, b) => {
    const order = PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase];
    if (order !== 0) return order;
    if (a.phase === "overdue") return (b.overdueHours ?? 0) - (a.overdueHours ?? 0);
    return (a.remainingHours ?? Number.POSITIVE_INFINITY) - (b.remainingHours ?? Number.POSITIVE_INFINITY);
  });
}

export interface ReviewSlotBoardSummary {
  readonly total: number;
  readonly overdue: number;
  readonly dueSoon: number;
  readonly open: number;
  readonly secured: number;
  readonly notStarted: number;
  /** 가장 먼저 도래하는(또는 가장 오래 넘긴) 기한. 시작된 슬롯이 없으면 null. */
  readonly nextDueAt: string | null;
}

export function summarizeReviewSlots(slots: readonly ReviewSlot[]): ReviewSlotBoardSummary {
  const started = slots.filter((slot) => slot.dueAt !== null);
  const nextDueAt = started.length > 0
    ? [...started].sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))[0]?.dueAt ?? null
    : null;
  return {
    total: slots.length,
    overdue: slots.filter((slot) => slot.phase === "overdue").length,
    dueSoon: slots.filter((slot) => slot.phase === "due-soon").length,
    open: slots.filter((slot) => slot.phase === "open").length,
    secured: slots.filter((slot) => slot.phase === "secured").length,
    notStarted: slots.filter((slot) => slot.phase === "not-started" || slot.phase === "no-policy").length,
    nextDueAt,
  };
}
