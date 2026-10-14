/**
 * 다인 검수 합의 패널 — 판정 등록 모델 (순수).
 *
 * 합의 패널(multi-reviewer-consensus-model)은 표시 전용이었고, 판정을
 * 남기려면 회차 룸까지 들어가야 했다. 이 모델은 패널 자리에서 바로
 * 판정을 등록하기 위한 초안·검증·제출 변환을 맡는다:
 *
 *  1) 검증은 단계 합의 게이트와 글자 그대로 같다 — validateConsensusDecision은
 *     초안을 StageGateDecision 모양으로 바꿔 validateStageGateDecision에
 *     그대로 위임한다. 사유 없는 수정 요청·거부 차단, 조건 없는 조건부
 *     승인 차단, 핀 없는 반려의 비차단 경고까지 코드·문구·차단 여부가
 *     게이트와 어긋날 수 없다(한쪽만 고치면 테스트가 깨진다).
 *  2) 제출은 코어 ReviewDecision으로 변환할 수 있는 형태로 정규화한다 —
 *     조건은 조건부 승인일 때만 남기고(그 외 판정의 조건은 합의 모델이
 *     읽지 않는다), 핀은 중복을 제거한다. consensusSubmissionToReviewDecision은
 *     회차 룸 approveLane과 같은 모양(id·라운드·범위는 호스트가 주입,
 *     evidenceScopeRefs는 정책 범위, reasonCode는 null)으로 만든다.
 *
 * 코어 ReviewDecision에는 자유 서술 사유 필드가 없다. 그래서 사유 원문은
 * 제출(submission.reason)에 실어 보내고, 호스트가 판정 기록과 함께 보관한다
 * (게이트 레코드의 reason과 같은 자리). reasonCode는 값을 지어내지 않고
 * null로 둔다 — 패널 행의 "사유 코드" 표시는 기존과 같은 의미다.
 * React·저장소에 의존하지 않는다.
 */
import type {
  ReviewDecision,
  ReviewDecisionValue,
  ReviewLane,
  ReviewPolicy,
} from "@toonstudio/core/production";

import {
  validateStageGateDecision,
  type StageGateDecision,
  type StageGateDecisionIssue,
} from "./stage-consensus-gate-model";

export type { StageGateDecisionIssue };

/* ------------------------------------------------------------------ */
/* 초안                                                                 */
/* ------------------------------------------------------------------ */

/** 패널 입력 UI가 제공하는 판정 4종. 기권은 합의 등록 동선에서 제공하지 않는다. */
export const CONSENSUS_REGISTERABLE_DECISIONS = [
  "approve",
  "approve-with-conditions",
  "request-changes",
  "veto",
] as const;
export type ConsensusRegisterableDecision = (typeof CONSENSUS_REGISTERABLE_DECISIONS)[number];

export interface ConsensusDecisionDraft {
  /** 판정을 내리는 검수자의 배정 ID. 다른 사람 이름으로는 등록할 수 없다. */
  readonly assignmentId: string;
  /** 그 검수자의 합의 행 레인 (요약 행의 lane과 같다). */
  readonly lane: ReviewLane;
  readonly value: ReviewDecisionValue;
  /** 자유 서술 사유. 수정 요청·거부에서는 필수다 (게이트와 같은 규칙). */
  readonly reason: string;
  /** 조건들. 조건부 승인에서는 하나 이상 필수다. UI는 한 줄에 하나씩 받는다. */
  readonly conditions: readonly string[];
  /** 사유를 뒷받침하는, 이 검수자가 이미 단 핀의 스레드 ID들. */
  readonly pinThreadIds: readonly string[];
}

/** 조건 입력(한 줄에 하나씩)을 초안의 조건 목록으로 바꾼다. 빈 줄은 버린다. */
export function parseConsensusConditions(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** 조건 목록 정규화 — 앞뒤 공백을 지우고 빈 항목을 버린다. 순서는 원문 그대로다. */
export function normalizeConsensusConditions(conditions: readonly string[]): string[] {
  return conditions.map((condition) => condition.trim()).filter((condition) => condition.length > 0);
}

/* ------------------------------------------------------------------ */
/* 검증 — validateStageGateDecision 위임 (같은 사유 검증)                 */
/* ------------------------------------------------------------------ */

/**
 * 판정 초안 검증. 단계 합의 게이트의 validateStageGateDecision에 위임하므로
 * 반환되는 이슈 코드(reason-required·conditions-required·
 * reason-recommended-pins)·문구·blocking 여부가 게이트와 항상 같다.
 * 게이트 검증은 reviewerId·reviewerName·role·decidedAt를 보지 않으므로
 * 그 필드는 초안 값으로 채우는 어댑터 변환일 뿐이다.
 */
export function validateConsensusDecision(draft: ConsensusDecisionDraft): readonly StageGateDecisionIssue[] {
  const gateDecision: StageGateDecision = {
    reviewerId: draft.assignmentId,
    reviewerName: draft.assignmentId,
    role: "participant",
    value: draft.value,
    reason: draft.reason,
    conditions: normalizeConsensusConditions(draft.conditions),
    pinThreadIds: draft.pinThreadIds,
    decidedAt: "",
  };
  return validateStageGateDecision(gateDecision);
}

/* ------------------------------------------------------------------ */
/* 제출 — 검증 통과분만 정규화해 호스트로 보낸다                          */
/* ------------------------------------------------------------------ */

export interface ConsensusDecisionSubmission {
  readonly assignmentId: string;
  readonly lane: ReviewLane;
  readonly value: ReviewDecisionValue;
  /** 다듬어진 사유 원문. 코어 판정에 자리가 없어 호스트가 판정과 함께 보관한다. */
  readonly reason: string;
  /** 조건부 승인일 때만 값이 있다. 그 외 판정에서는 빈 배열이다. */
  readonly conditions: readonly string[];
  /** 중복을 제거한 근거 핀 스레드 ID들. */
  readonly pinThreadIds: readonly string[];
  /** 제출 시점에 남아 있던 비차단 경고 (핀 권장 등). 호스트가 화면에 남길 수 있다. */
  readonly warnings: readonly StageGateDecisionIssue[];
}

export type BuildConsensusDecisionSubmissionResult =
  | { readonly ok: true; readonly submission: ConsensusDecisionSubmission }
  | { readonly ok: false; readonly issues: readonly StageGateDecisionIssue[] };

/**
 * 초안을 제출 형태로 만든다. 차단 이슈가 하나라도 있으면 제출을 만들지
 * 않고 이슈 전체를 돌려준다 — UI는 같은 목록으로 이유를 보여 준다.
 */
export function buildConsensusDecisionSubmission(
  draft: ConsensusDecisionDraft,
): BuildConsensusDecisionSubmissionResult {
  const issues = validateConsensusDecision(draft);
  if (issues.some((issue) => issue.blocking)) return { ok: false, issues };
  return {
    ok: true,
    submission: {
      assignmentId: draft.assignmentId,
      lane: draft.lane,
      value: draft.value,
      reason: draft.reason.trim(),
      conditions:
        draft.value === "approve-with-conditions" ? normalizeConsensusConditions(draft.conditions) : [],
      pinThreadIds: [...new Set(draft.pinThreadIds)],
      warnings: issues.filter((issue) => !issue.blocking),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 제출 → 코어 판정 (호스트가 aggregate에 append 하는 모양)               */
/* ------------------------------------------------------------------ */

export interface ConsensusSubmissionContext {
  readonly policy: ReviewPolicy;
  /** 회차 룸과 같은 규칙: 기존 판정의 라운드, 없으면 호스트가 만든 라운드 ID. */
  readonly reviewRoundId: string;
  readonly decisionId: string;
  readonly createdAt: string;
}

/**
 * 제출을 코어 ReviewDecision으로 바꾼다. 모양은 회차 룸 approveLane이
 * 만드는 판정과 같다 — evidenceScopeRefs는 정책 범위 하나, reasonCode는
 * null(사유 원문은 submission.reason으로 별도 보관), 조건은 제출이 가진
 * 만큼만. 호스트는 이 판정을 기존 record-review-decision 커맨드로 append
 * 하고, 합의 요약은 buildReviewerConsensus 재도출로 바로 갱신된다.
 */
export function consensusSubmissionToReviewDecision(
  submission: ConsensusDecisionSubmission,
  context: ConsensusSubmissionContext,
): ReviewDecision {
  return {
    id: context.decisionId,
    reviewRoundId: context.reviewRoundId,
    lane: submission.lane,
    assignmentId: submission.assignmentId,
    value: submission.value,
    reasonCode: null,
    evidenceScopeRefs: [context.policy.scope],
    conditions: submission.conditions,
    createdAt: context.createdAt,
  };
}
