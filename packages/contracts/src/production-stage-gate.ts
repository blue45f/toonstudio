/**
 * 단계 합의 게이트 — 서버 저장 계약 정본 (1차 클라이언트 모델의 서버 승격).
 *
 * 1차 장착(stage-consensus-gate)은 게이트 레코드를 클라이언트에만 두었다.
 * 이 계약은 그 레코드(라운드·판정·리드 지정)를 프로젝트 aggregate 옆의
 * 전용 테이블에 영속하고, 여러 기기가 같은 게이트를 보게 하는 동기화
 * 계약을 정한다. 형태는 클라이언트 모델(StageConsensusGate)과 1:1이다 —
 * 서버 레코드에서 projectId·revision(동기화 메타)을 빼면 클라이언트
 * 모델과 구조가 같아야 하며, 그 정합은 stage-gate-sync.test.ts가 고정한다.
 *
 * 동기화 규칙 (다기기):
 * - 진실의 원천은 서버다. 게이트마다 revision이 있고, 커맨드는
 *   expectedRevision이 서버와 같을 때만 적용된다. 어긋나면 409와 함께
 *   현재 revision이 돌아가며, 클라이언트는 번들을 다시 읽어 병합한다.
 * - 커맨드는 mutationId로 멱등하다. 같은 mutationId·같은 내용은 재생 시
 *   저장된 결과를 그대로 돌려주고, 내용이 다르면 거부한다(팀·조직 계약과 동일).
 * - 제출·판정의 시각(submittedAt·decidedAt)과 제출자·판정자 이름은 서버가
 *   확정한다. 클라이언트가 보낸 행위자·역할·이름은 받지 않는다 — 역할은
 *   서버가 리드 지정과 대조해 도출한다(리드 본인 = lead, 그 외 = participant).
 *
 * 판정 어휘는 코어 검수 판정(ReviewDecisionValue)과 같은 5값이다.
 * 검증 규칙도 클라이언트 validateStageGateDecision과 같은 뜻이어야 하며,
 * 서버가 최종 강제한다(사유 없는 반려·조건 없는 조건부 승인은 저장 불가).
 */

/** 합의 게이트가 걸리는 앞단 단계 — 클라이언트 STAGE_GATE_STAGE_IDS와 동일. */
export const STAGE_GATE_STAGE_IDS_CONTRACT = ["plan", "storyboard", "art"] as const;
export type StageGateStageIdContract = (typeof STAGE_GATE_STAGE_IDS_CONTRACT)[number];

/** 코어 ReviewDecisionValue와 같은 5값. */
export type StageGateDecisionValue =
  | "approve"
  | "approve-with-conditions"
  | "request-changes"
  | "veto"
  | "abstain";

export type StageGateDecisionRole = "lead" | "participant";

/** 게이트 ID — 클라이언트 stageGateId와 같은 결정적 형식. */
export function stageGateRecordId(episodeId: string, stageId: StageGateStageIdContract): string {
  return `stage-gate:${episodeId}:${stageId}`;
}

export interface StageGateDecisionRecord {
  readonly reviewerId: string;
  readonly reviewerName: string;
  readonly role: StageGateDecisionRole;
  readonly value: StageGateDecisionValue;
  readonly reason: string;
  readonly conditions: readonly string[];
  readonly pinThreadIds: readonly string[];
  readonly decidedAt: string;
}

export interface StageGateRoundRecord {
  readonly round: number;
  readonly submittedById: string;
  readonly submittedByName: string;
  readonly revisionRef: string | null;
  readonly submittedAt: string;
  readonly decisions: readonly StageGateDecisionRecord[];
}

/**
 * 서버에 영속되는 게이트 레코드. 클라이언트 StageConsensusGate의 모든
 * 필드를 포함하고, 동기화 메타(projectId·revision)만 더한다.
 * leadReviewerId가 null이면 아직 리드가 지정되지 않은 게이트다 —
 * 클라이언트 모델은 리드가 있는 게이트만 표현하므로, 동기화 어댑터는
 * 리드 미지정 게이트를 패널에 넘기지 않는다(빈 상태 안내가 맡는다).
 */
export interface StageConsensusGateRecord {
  readonly id: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly stageId: StageGateStageIdContract;
  readonly leadReviewerId: string | null;
  readonly leadReviewerName: string;
  readonly rounds: readonly StageGateRoundRecord[];
  readonly revision: number;
}

/** 한 회차의 게이트 번들 — 목록 조회와 동기화 응답의 단위. */
export interface StageGateBundle {
  readonly projectId: string;
  readonly episodeId: string;
  readonly gates: readonly StageConsensusGateRecord[];
  /** 서버 시각. 클라이언트 시계와 비교하지 않고 순서 판단에만 쓴다. */
  readonly serverTime: string;
}

export interface StageGateMutationResult {
  readonly gateId: string;
  readonly revision: number;
}

/**
 * 게이트 커맨드 입력. 행위자·역할·이름 필드가 아예 없다 —
 * 서버가 세션 행위자와 리드 지정으로 확정하므로 위조할 자리가 없다.
 */
export type StageGateCommandInput =
  | { readonly type: "assign-lead"; readonly leadReviewerId: string }
  | { readonly type: "submit-round"; readonly revisionRef: string | null }
  | {
      readonly type: "record-decision";
      readonly round: number;
      readonly value: StageGateDecisionValue;
      readonly reason: string;
      readonly conditions: readonly string[];
      readonly pinThreadIds: readonly string[];
    };

/** 무료 정책 v1 — 게이트 저장 한도. 운영 정책 연동은 별도 항목. */
export const STAGE_GATE_FREE_POLICY = Object.freeze({
  version: "stage-gate-free-v1",
  roundsPerGate: 50,
  decisionsPerRound: 50,
  conditionsPerDecision: 20,
  reasonMaxLength: 2000,
  conditionMaxLength: 300,
  pinThreadsPerDecision: 50,
});

/* ------------------------------------------------------------------ */
/* 판정 검증 — 클라이언트 validateStageGateDecision의 서버 강제판        */
/* ------------------------------------------------------------------ */

export type StageGateDecisionIssueCode = "reason-required" | "conditions-required";

/**
 * 저장 전에 서버가 강제하는 검증. 클라이언트의 경고성 검사
 * (reason-recommended-pins)는 저장과 무관하므로 여기 없다.
 * 빈 문자열만 있는 조건은 조건이 없는 것으로 본다(클라이언트와 동일).
 */
export function validateStageGateDecisionForStorage(input: {
  readonly value: StageGateDecisionValue;
  readonly reason: string;
  readonly conditions: readonly string[];
}): readonly StageGateDecisionIssueCode[] {
  const issues: StageGateDecisionIssueCode[] = [];
  if ((input.value === "request-changes" || input.value === "veto") && input.reason.trim().length === 0) {
    issues.push("reason-required");
  }
  if (
    input.value === "approve-with-conditions"
    && input.conditions.every((condition) => condition.trim().length === 0)
  ) {
    issues.push("conditions-required");
  }
  return issues;
}

/** 저장되는 조건 목록 — 앞뒤 공백을 정리하고 빈 조건은 버린다. */
export function normalizeStageGateConditions(conditions: readonly string[]): readonly string[] {
  return conditions.map((condition) => condition.trim()).filter((condition) => condition.length > 0);
}
