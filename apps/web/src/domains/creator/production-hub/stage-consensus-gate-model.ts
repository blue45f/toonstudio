/**
 * 단계 합의 게이트 — 순수 모델 (실제 사례 흡수: 더그림 CP 체제).
 *
 * 근거: 더그림엔터테인먼트 『백XX』의 CP(총괄 프로듀서) 체제는 단계 담당자와
 * 분리된 톤·방향 총괄이 기획·콘티의 합의를 책임진다(매일경제 인터뷰). 원본은
 * 대면·구두 합의라 기록이 남지 않고 CP가 병목이 되기 쉽다. 이 모델은 그 체제를
 * 비동기 합의 게이트로 옮기되, 원본보다 좋게 세 가지를 바꾼다:
 *
 *  1) 작업을 멈추지 않는다 — 게이트는 어떤 단계의 작업 시작도 막지 않는다
 *     (blocksWork 같은 개념이 아예 없다). 게이트가 참조되는 곳은 둘뿐이다:
 *     그 단계의 "완료" 확정과 게시 가능 판정. 승인 대기 중에도 다음 단계
 *     작화는 계속 진행할 수 있고, 게이트 상태만 "승인 없이 진행 중"으로 남는다.
 *  2) 반려가 일이 된다 — 리드가 반려·조건부 승인을 하면 사유와 조건이
 *     결정적 ID의 후속 작업(follow-up)으로 자동 도출된다. 재제출하면
 *     리드에게 재검토 요청 follow-up이 생긴다. 호스트는 이 목록을 기존
 *     핀→할 일 동기화(pin-task-sync-model)와 같은 인박스에 흘려보내면 된다.
 *  3) 사유가 비면 반려할 수 없다 — request-changes·veto는 사유 필수,
 *     조건부 승인은 조건 필수다. We-toon 연구가 지목한 "모호한 텍스트
 *     피드백"을 구조적으로 막기 위해, 사유에는 그림 위 핀(thread)을
 *     함께 붙이는 것을 완성도 지표로 계산한다.
 *
 * 판정 어휘는 코어 검수 판정(ReviewDecisionValue)을 그대로 재사용한다.
 * 게이트의 권위는 리드 1인이다(CP 체제의 톤 총괄과 같다). 참여자 판정은
 * 기록·표시되고 이의(objection)로 집계되지만 게이트 상태를 바꾸지 않는다.
 * React·저장소에 의존하지 않는다 — 게이트 레코드는 호스트가 보관하고,
 * 이 모델은 도출·검증·후속 작업 생성만 맡는다.
 */
import type { ReviewDecisionValue } from "@toonstudio/core/production";

import type { BilingualLabel } from "./production-labels";
import type { EpisodeStageId } from "./production-project-surfaces";
import {
  buildToneHandoffAttachment,
  type ToneHandoffAttachment,
  type WorkToneSheet,
} from "./work-tone-sheet-model";

/* ------------------------------------------------------------------ */
/* 게이트 정의                                                          */
/* ------------------------------------------------------------------ */

/**
 * 합의 게이트가 걸리는 앞단 단계. 선화 이후는 수정 비용이 급증해 사실상
 * 동결이므로(We-toon), 합의는 기획·콘티·스케치(작화 진입 전 초안)에 건다.
 * 작화 단계의 게이트는 "스케치 합의"다 — 선화를 본격적으로 긋기 전에
 * 초안 그림으로 합의하는 지점이다.
 */
export const STAGE_GATE_STAGE_IDS = ["plan", "storyboard", "art"] as const;
export type StageGateStageId = (typeof STAGE_GATE_STAGE_IDS)[number];

// 게이트 단계는 회차 7단계의 부분집합이어야 한다 (컴파일 타임 단언).
type StageGateStageIsEpisodeStage = StageGateStageId extends EpisodeStageId ? true : never;
const STAGE_GATE_STAGE_ASSERT: StageGateStageIsEpisodeStage = true;
void STAGE_GATE_STAGE_ASSERT;

export interface StageGateDefinition {
  readonly stageId: StageGateStageId;
  /** 게이트 이름. 단계 이름이 아니라 "합의" 이름이다. */
  readonly label: BilingualLabel;
  /** 리드가 이 게이트에서 확인하는 것 (CP의 톤·방향 체크에 해당). */
  readonly checkFocus: BilingualLabel;
}

export const STAGE_GATE_DEFINITIONS: readonly StageGateDefinition[] = Object.freeze([
  {
    stageId: "plan",
    label: { ko: "기획 합의", en: "Planning consensus" },
    checkFocus: {
      ko: "작품의 무게감·전개 속도·금지 표현 같은 톤과 방향이 기획에 녹아 있는지",
      en: "Whether the tone and direction — weight, pacing, off-limits expressions — are in the plan",
    },
  },
  {
    stageId: "storyboard",
    label: { ko: "콘티 합의", en: "Storyboard consensus" },
    checkFocus: {
      ko: "콘티의 장면 흐름과 캐릭터 연기가 기획 의도와 같은 그림인지",
      en: "Whether the storyboard's flow and acting match the planned intent",
    },
  },
  {
    stageId: "art",
    label: { ko: "스케치 합의", en: "Sketch consensus" },
    checkFocus: {
      ko: "선화에 들어가기 전, 스케치 초안의 포즈·표정이 합의된 그림과 같은지",
      en: "Whether sketch poses and expressions match the agreed look before line art begins",
    },
  },
]);

export function stageGateDefinition(stageId: StageGateStageId): StageGateDefinition {
  const definition = STAGE_GATE_DEFINITIONS.find((entry) => entry.stageId === stageId);
  if (!definition) throw new Error(`unknown stage gate: ${stageId}`);
  return definition;
}

/* ------------------------------------------------------------------ */
/* 기획 게이트 × 작품 톤 시트 현재본 참조                                */
/* ------------------------------------------------------------------ */

/**
 * 기획 합의 게이트의 checkFocus는 "작품의 무게감·전개 속도·금지 표현 같은
 * 톤"을 확인하라고 말한다 — 그 기준의 정본이 작품 톤 시트다. 이 연결은
 * 톤 시트 현재본을 기획 게이트 뷰에 읽기 전용 첨부로 붙인다:
 *
 *  - 기획(plan) 게이트에만 붙는다. 콘티·스케치 게이트는 not-applicable —
 *    톤 시트를 모든 게이트에 복사해 붙이지 않는다.
 *  - 첨부는 buildToneHandoffAttachment 스냅샷 그대로다(인계 카드와 동일
 *    형태). 시트에 내용이 없으면 지어내지 않고 missing 으로 알린다.
 *  - 참조일 뿐 판정을 바꾸지 않는다. 게이트 상태·완료·게시는 여전히 리드
 *    판정만으로 정해지고, 톤 완료 조건은 톤 시트 모델의
 *    evaluateToneStageCompletion/applyToneCompletion 이 따로 맡는다 —
 *    이 연결이 게시를 이중으로 막지 않는다.
 */
export type PlanningGateToneReferenceState = "attached" | "missing" | "not-applicable";

export interface PlanningGateToneReference {
  readonly state: PlanningGateToneReferenceState;
  /** attached 일 때만 있는 톤 시트 현재본 스냅샷. 그 외에는 null. */
  readonly attachment: ToneHandoffAttachment | null;
  /** 참조한 시트 id. 시트 자체가 없으면 null. */
  readonly sheetId: string | null;
  /** 참조한 시트 리비전(결정 수). 시트가 없으면 null. stale 판정의 기준이다. */
  readonly revision: number | null;
}

export function buildPlanningGateToneReference(
  stageId: StageGateStageId,
  sheet: WorkToneSheet | null | undefined,
): PlanningGateToneReference {
  if (stageId !== "plan") {
    return Object.freeze({ state: "not-applicable", attachment: null, sheetId: null, revision: null });
  }
  const attachment = buildToneHandoffAttachment(sheet);
  if (!attachment) {
    return Object.freeze({
      state: "missing",
      attachment: null,
      sheetId: sheet?.id ?? null,
      revision: sheet?.revision ?? null,
    });
  }
  return Object.freeze({
    state: "attached",
    attachment,
    sheetId: attachment.sheetId,
    revision: attachment.revision,
  });
}

/* ------------------------------------------------------------------ */
/* 게이트 레코드                                                        */
/* ------------------------------------------------------------------ */

/** 게이트 ID — 회차·단계당 하나. 결정적이라 재동기화해도 중복이 없다. */
export function stageGateId(episodeId: string, stageId: StageGateStageId): string {
  return `stage-gate:${episodeId}:${stageId}`;
}

export interface StageGateDecision {
  readonly reviewerId: string;
  readonly reviewerName: string;
  /** lead = CP 역할의 검수 리드. participant = 함께 보는 검수자 (자문). */
  readonly role: "lead" | "participant";
  readonly value: ReviewDecisionValue;
  /** 반려·거부에서는 필수다 (validateStageGateDecision). 승인에서는 비어도 된다. */
  readonly reason: string;
  /** 조건부 승인에서 필수다. 각 조건은 후속 작업으로 추적된다. */
  readonly conditions: readonly string[];
  /**
   * 사유를 뒷받침하는 그림 위 핀의 스레드 ID들. 텍스트 사유만으로는
   * "어디를 고치라"는 것인지 모호하므로(We-toon), 핀 연결을 권장한다.
   */
  readonly pinThreadIds: readonly string[];
  readonly decidedAt: string;
}

export interface StageGateRound {
  readonly round: number;
  readonly submittedById: string;
  readonly submittedByName: string;
  /** 제출한 산출물의 리비전 참조. 없으면 null (지어내지 않는다). */
  readonly revisionRef: string | null;
  readonly submittedAt: string;
  readonly decisions: readonly StageGateDecision[];
}

export interface StageConsensusGate {
  readonly id: string;
  readonly episodeId: string;
  readonly stageId: StageGateStageId;
  /** 검수 리드 (CP 역할). 이 사람의 판정만이 게이트 상태를 정한다. */
  readonly leadReviewerId: string;
  readonly leadReviewerName: string;
  readonly rounds: readonly StageGateRound[];
}

/* ------------------------------------------------------------------ */
/* 게이트 상태 도출                                                     */
/* ------------------------------------------------------------------ */

export type StageGateStatus =
  | "not-submitted"
  | "awaiting-lead"
  | "approved"
  | "approved-with-conditions"
  | "changes-requested"
  | "vetoed";

export const STAGE_GATE_STATUS_LABELS: Readonly<Record<StageGateStatus, BilingualLabel>> = Object.freeze({
  "not-submitted": { ko: "아직 제출 전", en: "Not submitted yet" },
  "awaiting-lead": { ko: "리드 판정 대기", en: "Waiting for the lead" },
  approved: { ko: "합의 완료", en: "Agreed" },
  "approved-with-conditions": { ko: "조건부 합의", en: "Agreed with conditions" },
  "changes-requested": { ko: "수정 요청됨", en: "Changes requested" },
  vetoed: { ko: "리드 거부", en: "Vetoed by the lead" },
});

function latestLeadDecision(round: StageGateRound | undefined): StageGateDecision | null {
  if (!round) return null;
  let latest: StageGateDecision | null = null;
  for (const decision of round.decisions) {
    if (decision.role !== "lead") continue;
    if (!latest || decision.decidedAt >= latest.decidedAt) latest = decision;
  }
  return latest;
}

function statusFromLeadValue(value: ReviewDecisionValue): StageGateStatus {
  switch (value) {
    case "approve":
      return "approved";
    case "approve-with-conditions":
      return "approved-with-conditions";
    case "request-changes":
      return "changes-requested";
    case "veto":
      return "vetoed";
    case "abstain":
      // 리드가 기권하면 판정이 없는 것과 같다 — 대기로 남는다.
      return "awaiting-lead";
  }
}

export interface StageGateView {
  readonly gate: StageConsensusGate;
  readonly stageId: StageGateStageId;
  readonly definition: StageGateDefinition;
  readonly status: StageGateStatus;
  readonly statusLabel: BilingualLabel;
  /** 제출 라운드 수. 0이면 아직 제출이 없다. */
  readonly currentRound: number;
  readonly leadDecision: StageGateDecision | null;
  /** 현재 라운드에서 참여자가 낸 반대(수정 요청·거부) 수. 상태는 바꾸지 않고 표시만 한다. */
  readonly objectionCount: number;
  /** 합의가 끝나 이 단계를 "완료"로 확정할 수 있는가. */
  readonly allowsCompletion: boolean;
  /** 게시 가능 판정이 이 게이트 때문에 막히는가. */
  readonly blocksPublish: boolean;
  /**
   * 제출은 됐지만 리드 판정이 끝나지 않은 채 있는가. 작업 진행을 막지
   * 않으므로 UI는 "승인 없이 진행 중" 배지로만 알린다.
   */
  readonly pendingConsensus: boolean;
  /**
   * 기획 게이트에서만 채워지는 톤 시트 현재본 참조. checkFocus가 말하는
   * 톤 기준을 리드가 게이트 카드에서 바로 대조할 수 있게 한다.
   * 그 밖의 게이트에서는 state가 not-applicable 이다.
   */
  readonly toneReference: PlanningGateToneReference;
  /** toneReference.attachment 의 편의 별칭 — attached 가 아니면 null. */
  readonly toneAttachment: ToneHandoffAttachment | null;
}

export function buildStageGateView(
  gate: StageConsensusGate,
  toneSheet?: WorkToneSheet | null,
): StageGateView {
  const currentRound = gate.rounds.length;
  const round = gate.rounds[currentRound - 1];
  const leadDecision = latestLeadDecision(round);
  const status: StageGateStatus = !round
    ? "not-submitted"
    : leadDecision
      ? statusFromLeadValue(leadDecision.value)
      : "awaiting-lead";
  const objectionCount = round
    ? round.decisions.filter(
        (decision) => decision.role === "participant"
          && (decision.value === "request-changes" || decision.value === "veto"),
      ).length
    : 0;
  const allowsCompletion = status === "approved" || status === "approved-with-conditions";
  const toneReference = buildPlanningGateToneReference(gate.stageId, toneSheet);
  return {
    gate,
    stageId: gate.stageId,
    definition: stageGateDefinition(gate.stageId),
    status,
    statusLabel: STAGE_GATE_STATUS_LABELS[status],
    currentRound,
    leadDecision,
    objectionCount,
    allowsCompletion,
    blocksPublish: !allowsCompletion,
    pendingConsensus: status === "awaiting-lead",
    toneReference,
    toneAttachment: toneReference.attachment,
  };
}

/* ------------------------------------------------------------------ */
/* 후속 작업 (반려·조건 → 할 일, 재제출 → 재검토 요청)                   */
/* ------------------------------------------------------------------ */

export type StageGateFollowUpKind = "rejection-rework" | "condition" | "rereview-request";

export interface StageGateFollowUp {
  /** 결정적 ID — 같은 게이트·라운드·종류에서는 항상 같다. */
  readonly id: string;
  readonly gateId: string;
  readonly stageId: StageGateStageId;
  readonly kind: StageGateFollowUpKind;
  readonly title: BilingualLabel;
  /** 반려 사유 또는 조건 문장. 리드가 쓴 원문 그대로다. */
  readonly detail: string;
  /** 일을 받을 사람. 재작업·조건은 제출자, 재검토 요청은 리드다. */
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  /** 사유를 뒷받침하는 핀 스레드. 호스트가 핀으로 바로 이동시킬 때 쓴다. */
  readonly pinThreadIds: readonly string[];
  readonly createdAt: string;
  /**
   * 후속 작업이 해소된 라운드. 재작업은 다음 제출이 생기면, 재검토 요청은
   * 그 라운드에 리드 판정이 생기면 해소된다. 조건은 자동 해소되지 않는다
   * (사람이 조건 충족을 확인해 닫아야 한다) — 항상 null이다.
   */
  readonly resolvedByRound: number | null;
}

export function stageGateFollowUpId(gateId: string, round: number, kind: StageGateFollowUpKind, index = 0): string {
  return `gate-followup:${gateId}:r${round}:${kind}${kind === "condition" ? `:${index}` : ""}`;
}

const GATE_STAGE_SHORT: Readonly<Record<StageGateStageId, BilingualLabel>> = Object.freeze({
  plan: { ko: "기획", en: "Planning" },
  storyboard: { ko: "콘티", en: "Storyboard" },
  art: { ko: "스케치", en: "Sketch" },
});

function followUpTitle(stageId: StageGateStageId, kind: StageGateFollowUpKind): BilingualLabel {
  const stage = GATE_STAGE_SHORT[stageId];
  switch (kind) {
    case "rejection-rework":
      return { ko: `${stage.ko} 합의 반려 — 사유 확인 후 다시 제출`, en: `${stage.en} consensus rejected — review the reason and resubmit` };
    case "condition":
      return { ko: `${stage.ko} 합의 조건 — 충족 확인 필요`, en: `${stage.en} consensus condition — needs confirmation` };
    case "rereview-request":
      return { ko: `${stage.ko} 재제출 — 재검토 요청`, en: `${stage.en} resubmitted — re-review requested` };
  }
}

/**
 * 게이트의 전 라운드를 훑어 후속 작업을 도출한다 (멱등 — 같은 입력이면
 * 같은 ID·내용). 호스트는 이 목록을 할 일 인박스와 동기화하면 된다.
 */
export function buildStageGateFollowUps(gate: StageConsensusGate): readonly StageGateFollowUp[] {
  const followUps: StageGateFollowUp[] = [];
  gate.rounds.forEach((round, index) => {
    const lead = latestLeadDecision(round);
    const nextRound = gate.rounds[index + 1];
    if (lead && (lead.value === "request-changes" || lead.value === "veto")) {
      followUps.push({
        id: stageGateFollowUpId(gate.id, round.round, "rejection-rework"),
        gateId: gate.id,
        stageId: gate.stageId,
        kind: "rejection-rework",
        title: followUpTitle(gate.stageId, "rejection-rework"),
        detail: lead.reason,
        assigneeId: round.submittedById,
        assigneeName: round.submittedByName,
        pinThreadIds: lead.pinThreadIds,
        createdAt: lead.decidedAt,
        resolvedByRound: nextRound ? nextRound.round : null,
      });
      if (nextRound) {
        const nextLead = latestLeadDecision(nextRound);
        followUps.push({
          id: stageGateFollowUpId(gate.id, nextRound.round, "rereview-request"),
          gateId: gate.id,
          stageId: gate.stageId,
          kind: "rereview-request",
          title: followUpTitle(gate.stageId, "rereview-request"),
          detail: lead.reason,
          assigneeId: gate.leadReviewerId,
          assigneeName: gate.leadReviewerName,
          pinThreadIds: [],
          createdAt: nextRound.submittedAt,
          resolvedByRound: nextLead ? nextRound.round : null,
        });
      }
    }
    if (lead && lead.value === "approve-with-conditions") {
      lead.conditions.forEach((condition, conditionIndex) => {
        followUps.push({
          id: stageGateFollowUpId(gate.id, round.round, "condition", conditionIndex),
          gateId: gate.id,
          stageId: gate.stageId,
          kind: "condition",
          title: followUpTitle(gate.stageId, "condition"),
          detail: condition,
          assigneeId: round.submittedById,
          assigneeName: round.submittedByName,
          pinThreadIds: lead.pinThreadIds,
          createdAt: lead.decidedAt,
          resolvedByRound: null,
        });
      });
    }
  });
  return followUps;
}

/* ------------------------------------------------------------------ */
/* 요약 — 레일 배지·게시 판정이 참조하는 형태                            */
/* ------------------------------------------------------------------ */

export interface StageGateSummary {
  readonly views: readonly StageGateView[];
  readonly followUps: readonly StageGateFollowUp[];
  /** 아직 닫히지 않은 후속 작업 수 (조건은 사람이 닫기 전까지 계속 센다). */
  readonly openFollowUpCount: number;
  /** 게시를 막는 게이트 단계들. 게이트가 없는 단계는 여기에 넣지 않는다. */
  readonly publishBlockedBy: readonly StageGateStageId[];
  /**
   * 단계 완료 확정 가능 여부. 게이트가 걸린 단계만 키가 있다 —
   * 게이트가 없는 단계는 이 맵이 아무 말도 하지 않는다(기존 판정 유지).
   */
  readonly completionByStage: Readonly<Partial<Record<StageGateStageId, boolean>>>;
  /**
   * 기획 게이트의 톤 시트 참조. 기획 게이트가 없어도 톤 시트 자체의
   * 첨부 여부는 알 수 있게, 게이트 존재와 무관하게 시트에서 직접 도출한다.
   */
  readonly planningToneReference: PlanningGateToneReference;
}

/**
 * 회차의 게이트들을 모은다. gates에 없는 단계는 게이트 미지정으로 보고
 * 요약에 포함하지 않는다 — "게이트가 없다"와 "게이트가 막고 있다"를
 * 섞지 않기 위해서다. 미지정 단계 목록은 missingStageIds로 따로 알린다.
 * toneSheet를 넘기면 기획 게이트 뷰에 톤 시트 현재본이 참조로 붙는다.
 */
export function summarizeStageGates(
  gates: readonly StageConsensusGate[],
  toneSheet?: WorkToneSheet | null,
): StageGateSummary & { readonly missingStageIds: readonly StageGateStageId[] } {
  const views = STAGE_GATE_STAGE_IDS
    .map((stageId) => gates.find((gate) => gate.stageId === stageId))
    .filter((gate): gate is StageConsensusGate => gate !== undefined)
    .map((gate) => buildStageGateView(gate, toneSheet));
  const followUps = gates.flatMap((gate) => buildStageGateFollowUps(gate));
  const present = new Set(gates.map((gate) => gate.stageId));
  return {
    views,
    followUps,
    openFollowUpCount: followUps.filter((followUp) => followUp.resolvedByRound === null).length,
    publishBlockedBy: views.filter((view) => view.blocksPublish).map((view) => view.stageId),
    completionByStage: Object.fromEntries(views.map((view) => [view.stageId, view.allowsCompletion])),
    planningToneReference: buildPlanningGateToneReference("plan", toneSheet),
    missingStageIds: STAGE_GATE_STAGE_IDS.filter((stageId) => !present.has(stageId)),
  };
}

/** 진행 레일 구간 옆에 붙일 배지 데이터. 게이트 없는 단계는 null이다. */
export interface StageGateRailBadge {
  readonly stageId: StageGateStageId;
  readonly status: StageGateStatus;
  readonly label: BilingualLabel;
}

export function stageGateRailBadge(
  summary: Pick<StageGateSummary, "views">,
  stageId: EpisodeStageId,
): StageGateRailBadge | null {
  const view = summary.views.find((entry) => entry.stageId === stageId);
  if (!view) return null;
  return { stageId: view.stageId, status: view.status, label: view.statusLabel };
}

/* ------------------------------------------------------------------ */
/* 판정 검증 — 모호한 피드백을 구조적으로 막는다                          */
/* ------------------------------------------------------------------ */

export interface StageGateDecisionIssue {
  readonly code: "reason-required" | "conditions-required" | "reason-recommended-pins";
  readonly message: BilingualLabel;
  /** true면 판정을 등록할 수 없다. false는 경고(등록은 되지만 화면이 권한다). */
  readonly blocking: boolean;
}

/**
 * 판정 등록 전 검증.
 * - 수정 요청·거부는 사유가 비면 등록 불가다. 왜인지를 말하지 않는 반려는
 *   CP 체제에서도, We-toon 현장에서도 왕복만 늘렸다.
 * - 조건부 승인은 조건이 비면 등록 불가다.
 * - 반려 사유에 그림 위 핀이 하나도 없으면 경고한다(차단은 하지 않는다 —
 *   기획 단계처럼 그림이 아직 없는 반려도 있기 때문이다).
 */
export function validateStageGateDecision(decision: StageGateDecision): readonly StageGateDecisionIssue[] {
  const issues: StageGateDecisionIssue[] = [];
  const reason = decision.reason.trim();
  if ((decision.value === "request-changes" || decision.value === "veto") && reason.length === 0) {
    issues.push({
      code: "reason-required",
      message: {
        ko: "반려하려면 이유를 적어 주세요. 이유 없는 반려는 다시 묻는 왕복만 늘려요.",
        en: "A rejection needs a reason. A reasonless rejection only adds another round trip.",
      },
      blocking: true,
    });
  }
  if (decision.value === "approve-with-conditions" && decision.conditions.every((condition) => condition.trim().length === 0)) {
    issues.push({
      code: "conditions-required",
      message: {
        ko: "조건부 승인은 조건을 적어야 해요. 조건은 할 일로 남아 추적됩니다.",
        en: "Conditional approval needs its conditions written down — they stay tracked as tasks.",
      },
      blocking: true,
    });
  }
  if (
    (decision.value === "request-changes" || decision.value === "veto")
    && reason.length > 0
    && decision.pinThreadIds.length === 0
  ) {
    issues.push({
      code: "reason-recommended-pins",
      message: {
        ko: "고칠 곳을 그림 위에 핀으로 찍어 주면 훨씬 빨리 합의돼요.",
        en: "Pinning the spot on the artwork makes agreement much faster.",
      },
      blocking: false,
    });
  }
  return issues;
}

/** 판정의 피드백 완성도 — 무엇을(사유)·어디를(핀)이 갖춰졌는가. */
export interface StageGateFeedbackCompleteness {
  readonly hasReason: boolean;
  readonly pinCount: number;
  readonly complete: boolean;
}

export function stageGateFeedbackCompleteness(decision: StageGateDecision): StageGateFeedbackCompleteness {
  const hasReason = decision.reason.trim().length > 0;
  return {
    hasReason,
    pinCount: decision.pinThreadIds.length,
    complete: hasReason && decision.pinThreadIds.length > 0,
  };
}
