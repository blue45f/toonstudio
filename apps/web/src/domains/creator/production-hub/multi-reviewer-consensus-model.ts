/**
 * 다인 검수 합의 패널 — 순수 모델 (실제 사례 흡수: 코미코 PD 집단 검수).
 *
 * 근거: NHN코미코 덩크스튜디오는 PD 10여 명이 작품당 1시간 이상 모여
 * 기술·스토리 피드백을 함께 냈다(매일경제). 원본은 대면 회의라 의견이
 * 회의실 밖으로 남지 않는다. 이 모델은 집단 검수를 비동기 합의로 옮기되,
 * 원본보다 좋게 두 가지를 바꾼다:
 *
 *  1) 의견이 흩어지지 않는다 — 검수자 각자의 판정(코어 ReviewDecision)과
 *     그 검수자가 비교·원고 화면에 단 핀(댓글 문서의 point 앵커)을
 *     한 행으로 묶는다. 판정만 있고 핀이 없는 의견, 핀만 있고 판정이
 *     없는 의견이 한눈에 드러난다.
 *  2) 합의 상태가 한 단어로 선다 — 전원 승인 / 조건부 존재 / 수정 요청
 *     존재 / 거부 존재 / 판정 대기를 우선순위대로 판정하고, 아직 합의가
 *     아닌 이유를 문장 목록으로 돌려준다. 레인 단위 평가
 *     (deriveEpisodeApprovalGate)와 별개로, "사람 단위" 합의를 보여 주는
 *     것이 이 모델의 몫이다(게이트 판정을 대체하지 않는다).
 *
 * 검수자 집합은 검수 정책(ReviewPolicy)의 레인 적격자 합집합이다.
 * 판정은 회차 범위로 거른다 — deriveEpisodeApprovalGate와 같은 규칙
 * (evidenceScopeRefs에 회차 id가 있거나 조상에 있는 판정만).
 * React·저장소에 의존하지 않는다.
 */
import type {
  ReviewDecision,
  ReviewDecisionValue,
  ReviewLane,
  ReviewPolicy,
} from "@toonstudio/core/production";

import type { StudioCommentsDocument } from "../studio-comments";
import {
  commentsDocumentToManuscriptPins,
  type ManuscriptPin,
  type ManuscriptPinStatus,
} from "./manuscript-pin-feedback-model";
import {
  REVIEW_DECISION_LABELS,
  REVIEW_LANE_LABELS,
  type BilingualLabel,
} from "./production-labels";

/* ------------------------------------------------------------------ */
/* 입력                                                                 */
/* ------------------------------------------------------------------ */

export interface ConsensusReviewerInfo {
  readonly assignmentId: string;
  readonly displayName: string;
}

export interface ConsensusPinRef {
  readonly threadId: string;
  readonly pageId: string;
  /** 페이지 안 표시 순번 (뷰어·사이드바와 같은 번호) */
  readonly number: number;
  readonly status: ManuscriptPinStatus;
}

/* ------------------------------------------------------------------ */
/* 검수자 행                                                            */
/* ------------------------------------------------------------------ */

export interface ReviewerConsensusRow {
  readonly assignmentId: string;
  readonly displayName: string;
  /** 이 검수자가 적격인 첫 번째 레인. 판정·핀의 귀속 기준이다. */
  readonly lane: ReviewLane;
  readonly laneLabel: BilingualLabel;
  /** 정책이 이 검수자의 판정을 필수로 요구하는가. */
  readonly required: boolean;
  /** 거부권을 가진 검수자인가. 이 사람의 거부는 합의 상태를 거부로 만든다. */
  readonly hasVetoPower: boolean;
  /** 최신 판정. 아직 판정이 없으면 null이다 (지어내지 않는다). */
  readonly decision: ReviewDecisionValue | null;
  readonly decisionLabel: BilingualLabel | null;
  readonly decidedAt: string | null;
  /** 조건부 승인일 때의 조건들. 그 외에는 빈 배열. */
  readonly conditions: readonly string[];
  /** 판정에 붙은 사유 코드. 없으면 null — 자유 서술 사유는 판정에 없다. */
  readonly reasonCode: string | null;
  /** 이 검수자가 단 그림 위 핀들. */
  readonly pins: readonly ConsensusPinRef[];
  readonly openPinCount: number;
  readonly urgentPinCount: number;
}

/* ------------------------------------------------------------------ */
/* 합의 요약                                                            */
/* ------------------------------------------------------------------ */

/**
 * 합의 상태. 우선순위는 거부 > 수정 요청 > 대기 > 조건부 승인 > 전원 승인.
 * no-reviewers는 정책이 없거나 검수자가 지정되지 않은 별도 상태다.
 */
export type ConsensusState =
  | "approved"
  | "approved-with-conditions"
  | "changes-requested"
  | "vetoed"
  | "awaiting"
  | "no-reviewers";

export const CONSENSUS_STATE_LABELS: Readonly<Record<ConsensusState, BilingualLabel>> = Object.freeze({
  approved: { ko: "전원 승인 — 합의 완료", en: "Everyone approved — consensus reached" },
  "approved-with-conditions": { ko: "조건부 합의 — 조건 확인 중", en: "Agreed with conditions" },
  "changes-requested": { ko: "수정 요청 있음 — 합의 전", en: "Changes requested — no consensus yet" },
  vetoed: { ko: "거부 있음 — 합의 불가", en: "Vetoed — consensus blocked" },
  awaiting: { ko: "판정 대기 — 합의 전", en: "Waiting for verdicts" },
  "no-reviewers": { ko: "검수자 미지정", en: "No reviewers assigned" },
});

export interface ReviewerConsensusSummary {
  readonly state: ConsensusState;
  readonly stateLabel: BilingualLabel;
  readonly rows: readonly ReviewerConsensusRow[];
  readonly counts: {
    readonly approved: number;
    readonly conditional: number;
    readonly changesRequested: number;
    readonly vetoed: number;
    readonly abstained: number;
    readonly awaiting: number;
  };
  readonly pins: {
    readonly total: number;
    readonly open: number;
    readonly urgent: number;
  };
  /** 아직 합의가 아닌 이유들. 합의 완료면 빈 배열이다. */
  readonly blockingReasons: readonly BilingualLabel[];
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

function pinsByReviewer(
  comments: StudioCommentsDocument | null | undefined,
  resolveReviewerId: ((pin: ManuscriptPin) => string | null) | undefined,
): ReadonlyMap<string, ConsensusPinRef[]> {
  const byReviewer = new Map<string, ConsensusPinRef[]>();
  if (!comments) return byReviewer;
  const pageIds: string[] = [];
  const seen = new Set<string>();
  for (const thread of comments.threads) {
    if (thread.anchor.type !== "point") continue;
    if (seen.has(thread.anchor.pageId)) continue;
    seen.add(thread.anchor.pageId);
    pageIds.push(thread.anchor.pageId);
  }
  for (const pageId of pageIds) {
    for (const pin of commentsDocumentToManuscriptPins(comments, pageId)) {
      if (!pin.threadId) continue;
      const reviewerId = resolveReviewerId ? resolveReviewerId(pin) : pin.authorId;
      if (!reviewerId) continue;
      const list = byReviewer.get(reviewerId) ?? [];
      list.push({ threadId: pin.threadId, pageId, number: pin.number, status: pin.status });
      byReviewer.set(reviewerId, list);
    }
  }
  return byReviewer;
}

export interface BuildReviewerConsensusInput {
  readonly policy: ReviewPolicy | null;
  readonly episodeId: string;
  readonly decisions: readonly ReviewDecision[];
  readonly reviewers: readonly ConsensusReviewerInfo[];
  /** 핀 귀속용 댓글 문서. 없으면 핀은 전부 0으로 정직하게 비운다. */
  readonly comments?: StudioCommentsDocument | null;
  /**
   * 핀 작성자 ID가 검수 배정 ID와 다른 호스트에서 변환한다.
   * 지정하지 않으면 핀 작성자 ID를 배정 ID로 그대로 본다.
   */
  readonly resolveReviewerId?: (pin: ManuscriptPin) => string | null;
}

export function buildReviewerConsensus(input: BuildReviewerConsensusInput): ReviewerConsensusSummary {
  const empty: ReviewerConsensusSummary = {
    state: "no-reviewers",
    stateLabel: CONSENSUS_STATE_LABELS["no-reviewers"],
    rows: [],
    counts: { approved: 0, conditional: 0, changesRequested: 0, vetoed: 0, abstained: 0, awaiting: 0 },
    pins: { total: 0, open: 0, urgent: 0 },
    blockingReasons: [],
  };
  if (!input.policy || input.policy.lanes.length === 0) return empty;

  const nameById = new Map(input.reviewers.map((reviewer) => [reviewer.assignmentId, reviewer.displayName]));
  const laneByReviewer = new Map<string, ReviewLane>();
  const requiredIds = new Set<string>();
  const vetoIds = new Set<string>();
  for (const lane of input.policy.lanes) {
    for (const assignmentId of lane.eligibleAssignmentIds) {
      if (!laneByReviewer.has(assignmentId)) laneByReviewer.set(assignmentId, lane.lane);
    }
    for (const assignmentId of lane.requiredAssignmentIds) requiredIds.add(assignmentId);
    for (const assignmentId of lane.vetoAssignmentIds) vetoIds.add(assignmentId);
  }
  if (laneByReviewer.size === 0) return empty;

  const decisions = episodeScopedDecisions(input.decisions, input.episodeId);
  const pins = pinsByReviewer(input.comments, input.resolveReviewerId);

  const rows: ReviewerConsensusRow[] = [...laneByReviewer.entries()].map(([assignmentId, lane]) => {
    const decision = latestDecisionFor(decisions, assignmentId, lane);
    const myPins = pins.get(assignmentId) ?? [];
    return {
      assignmentId,
      displayName: nameById.get(assignmentId) ?? assignmentId,
      lane,
      laneLabel: REVIEW_LANE_LABELS[lane],
      required: requiredIds.has(assignmentId),
      hasVetoPower: vetoIds.has(assignmentId),
      decision: decision?.value ?? null,
      decisionLabel: decision ? REVIEW_DECISION_LABELS[decision.value] : null,
      decidedAt: decision?.createdAt ?? null,
      conditions: decision?.value === "approve-with-conditions" ? decision.conditions : [],
      reasonCode: decision?.reasonCode ?? null,
      pins: myPins,
      openPinCount: myPins.filter((pin) => pin.status !== "resolved").length,
      urgentPinCount: myPins.filter((pin) => pin.status === "urgent").length,
    };
  });

  const counts = {
    approved: rows.filter((row) => row.decision === "approve").length,
    conditional: rows.filter((row) => row.decision === "approve-with-conditions").length,
    changesRequested: rows.filter((row) => row.decision === "request-changes").length,
    vetoed: rows.filter((row) => row.decision === "veto").length,
    abstained: rows.filter((row) => row.decision === "abstain").length,
    awaiting: rows.filter((row) => row.decision === null).length,
  };
  const allPins = rows.flatMap((row) => row.pins);
  const pinTotals = {
    total: allPins.length,
    open: allPins.filter((pin) => pin.status !== "resolved").length,
    urgent: allPins.filter((pin) => pin.status === "urgent").length,
  };

  // 합의 상태 판정. 거부는 거부권자의 것만 상태를 거부로 만든다 —
  // 자문 검수자의 거부는 강한 이의로 집계해 수정 요청 상태로 말한다.
  const privilegedVeto = rows.some((row) => row.decision === "veto" && (row.required || row.hasVetoPower));
  const anyObjection = rows.some((row) => row.decision === "request-changes" || row.decision === "veto");
  const requiredAwaiting = rows.filter((row) => row.required && row.decision === null);
  // 레인 정족수: 레인별 승인(조건부 포함) 수가 quorum에 닿았는가.
  const quorumUnmetLanes = input.policy.lanes.filter((lane) => {
    const approvals = rows.filter(
      (row) => row.lane === lane.lane && (row.decision === "approve" || row.decision === "approve-with-conditions"),
    ).length;
    return approvals < lane.quorum;
  });

  let state: ConsensusState;
  if (privilegedVeto) state = "vetoed";
  else if (anyObjection) state = "changes-requested";
  else if (requiredAwaiting.length > 0 || quorumUnmetLanes.length > 0) state = "awaiting";
  else if (counts.conditional > 0) state = "approved-with-conditions";
  else state = "approved";

  const blockingReasons: BilingualLabel[] = [];
  if (state !== "approved" && state !== "approved-with-conditions") {
    for (const row of rows) {
      if (row.decision === "veto" && (row.required || row.hasVetoPower)) {
        blockingReasons.push({
          ko: `${row.displayName} 님이 거부했어요. 사유를 확인하고 방향을 다시 합의해야 해요.`,
          en: `${row.displayName} vetoed this. Check the reason and re-agree on direction.`,
        });
      } else if (row.decision === "request-changes" || row.decision === "veto") {
        blockingReasons.push({
          ko: `${row.displayName} 님이 수정을 요청했어요. 핀 ${row.openPinCount}개가 아직 열려 있어요.`,
          en: `${row.displayName} requested changes. ${row.openPinCount} of their pins are still open.`,
        });
      }
    }
    for (const row of requiredAwaiting) {
      blockingReasons.push({
        ko: `${row.displayName} 님의 판정이 아직 없어요.`,
        en: `${row.displayName} hasn't given a verdict yet.`,
      });
    }
    if (requiredAwaiting.length === 0) {
      for (const lane of quorumUnmetLanes) {
        const approvals = rows.filter(
          (row) => row.lane === lane.lane && (row.decision === "approve" || row.decision === "approve-with-conditions"),
        ).length;
        blockingReasons.push({
          ko: `${REVIEW_LANE_LABELS[lane.lane].ko} 검수 승인이 정족수까지 ${lane.quorum - approvals}개 모자라요.`,
          en: `${REVIEW_LANE_LABELS[lane.lane].en} review is ${lane.quorum - approvals} approval(s) short of its quorum.`,
        });
      }
    }
  }

  return {
    state,
    stateLabel: CONSENSUS_STATE_LABELS[state],
    rows,
    counts,
    pins: pinTotals,
    blockingReasons,
  };
}
