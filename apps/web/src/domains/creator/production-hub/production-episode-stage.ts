/**
 * 회차 단계 상태 도출 (BLUEPRINT S2-1 파일럿 → S2-3 완성).
 *
 * 단계 상태는 새 저장소를 만들지 않고 기존 데이터에서만 도출한다.
 * - 기획·콘티·작화·게시(S2-1 파일럿): 회차 협업 상태 기계
 *   (`EpisodeCollaboration.state`, @toonstudio/core/production)와 잠금 승인 플래그.
 * - 식자(S2-3): 협업 상태 `lettering-and-integration`/`joint-proof`와 식자 통합본
 *   고정 여부(`integratedRevisionRef` — QC `integrated-art` 항목과 같은 근거),
 *   대사 맞춤법 검사 오류(QC `dialogue-spellcheck`와 같은 주입 계약).
 * - 검수(S2-3): 통합 교정 승인(`jointProofApproved` — QC `joint-proof`), 검수
 *   게이트(QC `review-gate`, `deriveEpisodeApprovalGate` 결과의 체크리스트 표현),
 *   필수 수정 핀 잔여(회차 룸 `countOpenUrgentPins`의 합산값 주입).
 * - 운영(S2-3): 게시 완료(`published`) 뒤에만 current, 그 전에는 todo.
 * 근거가 없거나 진척을 말할 수 없는 상태(cancelled 등)에서는 지어내지 않고
 * 반드시 "unknown(확인 불가)"을 돌려준다. 7단계 전부가 판정 또는 명시적
 * unknown 중 하나가 되는 것이 S2-3의 판정 기준이다.
 * 상태 어휘는 전 표면 공통 4개로 고정한다: done/current/todo/unknown.
 *
 * 단계 합의 게이트 합류 (stage-gate-qc-stage-derivation-join): 게이트 요약의
 * `completionByStage`를 extras로 받는다. 게이트는 완료를 "확정"만 막을 수
 * 있고 완료를 지어내지는 못한다 — `false`인 단계는 done으로 말하지 않고,
 * `true`·키 없음·요약 없음은 기존 판정을 그대로 둔다. QC
 * (`EpisodeQcExtras.stageGate`)와 같은 요약 객체를 공유한다.
 */
import type { EpisodeCollaboration, EpisodePlan } from "@toonstudio/core/production";

import type { EpisodeQcChecklist, EpisodeQcItemId, EpisodeQcItemStatus } from "./production-episode-qc";
import type { StageGateSummary } from "./stage-consensus-gate-model";
import {
  EPISODE_STAGES,
  type EpisodeStageId,
} from "./production-project-surfaces";
import type { BilingualLabel } from "./production-labels";

export type EpisodeStageStatus = "done" | "current" | "todo" | "unknown";

/**
 * 도출 근거로 쓰는 협업 레코드의 최소 부분. 회차 자체가 없으면 undefined를 넘긴다.
 * S2-3에서 `jointProofApproved`·`integratedRevisionRef`·`visualRevisionRef`가
 * 근거에 합류했다(식자·검수 판정용). 전부 `EpisodeCollaboration`의 실제 필드다.
 */
export type EpisodeStageEvidence = Pick<
  EpisodeCollaboration,
  | "state"
  | "storyLockApproved"
  | "thumbnailLockApproved"
  | "jointProofApproved"
  | "integratedRevisionRef"
  | "visualRevisionRef"
>;

/**
 * aggregate 밖에 있는 판정 재료의 주입 지점 (QC의 `EpisodeQcExtras`와 같은 방식).
 * 전부 optional이며 undefined/null은 "그 재료를 읽지 못했다"는 뜻이다 —
 * 그 경우에도 단계 판정은 협업 상태만으로 내리되, 재료가 있어야만 확정할 수
 * 있는 승격(예: 통합본 고정만으로 식자 done)은 적용하지 않는다.
 */
export interface EpisodeStageExtras {
  /**
   * `deriveEpisodeQcChecklist` 결과. items만으로 충분하므로 그 부분만 받는다.
   * null이면 QC를 계산하지 못한 표면이다.
   */
  readonly qc?: Pick<EpisodeQcChecklist, "items"> | null;
  /**
   * 필수 수정(긴급)으로 남은 미해결 검수 핀 수. 핀은 aggregate가 아니라
   * 페이지별 Studio 댓글 문서에 살므로, 회차 룸의 `countOpenUrgentPins`를
   * 페이지 합산해 넘긴다. 핀 문서를 읽지 못한 표면은 undefined로 둔다.
   */
  readonly openUrgentPins?: number;
  /**
   * 대사 맞춤법 검사 오류 의심 건수. QC extras와 같은 의미다.
   * `qc`가 있으면 QC 항목(`dialogue-spellcheck`)이 우선하고 이 값은 보지 않는다.
   * null/미제공이면 검사 결과가 없는 것이다.
   */
  readonly dialogueSpellcheckErrorCount?: number | null;
  /**
   * 단계 합의 게이트 요약 (`summarizeStageGates` 결과의 `completionByStage` 부분).
   * 키가 있는 단계(기획·콘티·스케치)만 게이트가 말하고, 키가 없는 단계는
   * 기존 판정을 유지한다. null/미제공이면 게이트를 적용하지 않는다.
   * QC extras(`EpisodeQcExtras.stageGate`)와 같은 요약 객체를 공유한다.
   */
  readonly stageGate?: Pick<StageGateSummary, "completionByStage"> | null;
}

export interface EpisodeStageState {
  readonly id: EpisodeStageId;
  readonly label: BilingualLabel;
  readonly status: EpisodeStageStatus;
}

/** 파일럿에서 판정하던 단계(순서 고정). S2-3에서도 판정 방식을 바꾸지 않는다. */
const PILOT_STAGES: readonly EpisodeStageId[] = ["plan", "storyboard", "art", "publish"];

/**
 * 협업 상태 → 파일럿 단계 진척.
 * - `current`: 그 상태가 실제로 머무는 파일럿 단계. 식자·합동 교정처럼 파일럿 밖
 *   단계에 머무는 상태는 current가 없고(null), publish-ready만 게시가 current다.
 * - `doneThrough`: 이 단계까지(포함) 끝난 것으로 판정한다.
 * 상태값 전수(19개)는 production-episode-stage.test.ts의 대조 표가 고정한다.
 */
const PROGRESS_BY_STATE: Readonly<
  Partial<Record<EpisodeCollaboration["state"], { readonly doneThrough: EpisodeStageId | null; readonly current: EpisodeStageId | null }>>
> = {
  "episode-planning": { doneThrough: null, current: "plan" },
  "story-drafting": { doneThrough: null, current: "plan" },
  "story-review": { doneThrough: null, current: "plan" },
  "story-ready-for-art": { doneThrough: "plan", current: "storyboard" },
  "art-clarification": { doneThrough: "plan", current: "storyboard" },
  thumbnailing: { doneThrough: "plan", current: "storyboard" },
  "thumbnail-joint-review": { doneThrough: "plan", current: "storyboard" },
  "thumbnail-locked": { doneThrough: "storyboard", current: "art" },
  "final-art-production": { doneThrough: "storyboard", current: "art" },
  // 식자·검수는 S2-3 판정(letteringStatus·reviewStatus)이 따로 맡는다.
  // 여기서는 작화까지 끝난 것만 말하고, 게시는 남음으로 둔다.
  "lettering-and-integration": { doneThrough: "art", current: null },
  "joint-proof": { doneThrough: "art", current: null },
  "publish-ready": { doneThrough: "art", current: "publish" },
  published: { doneThrough: "publish", current: null },
};

/** 진행이 멈춘 상태들. 지금 단계는 말할 수 없고, 승인·고정 플래그만 근거가 된다. */
const PAUSED_STATES: ReadonlySet<EpisodeCollaboration["state"]> = new Set([
  "blocked",
  "paused-health",
  "paused-contract",
  "change-request-open",
  "creator-replacement",
]);

function pilotStatus(
  stage: EpisodeStageId,
  evidence: EpisodeStageEvidence,
): EpisodeStageStatus {
  if (PAUSED_STATES.has(evidence.state)) {
    // 멈춘 회차에서는 승인된 잠금만 사실이다. 그 외 파일럿 단계는 지어내지 않는다.
    if (stage === "plan") return evidence.storyLockApproved ? "done" : "unknown";
    if (stage === "storyboard") return evidence.thumbnailLockApproved ? "done" : "unknown";
    return "unknown";
  }
  const progress = PROGRESS_BY_STATE[evidence.state];
  if (!progress) return "unknown"; // cancelled 등 진척을 말할 수 없는 상태
  const stageIndex = PILOT_STAGES.indexOf(stage);
  const doneIndex = progress.doneThrough ? PILOT_STAGES.indexOf(progress.doneThrough) : -1;
  if (stageIndex <= doneIndex) return "done";
  if (progress.current === stage) return "current";
  return "todo";
}

function qcItemStatus(
  extras: EpisodeStageExtras | undefined,
  id: EpisodeQcItemId,
): EpisodeQcItemStatus | undefined {
  return extras?.qc?.items.find((item) => item.id === id)?.status;
}

/** 대사 맞춤법 검사에서 오류 의심이 남아 있는가. QC 항목이 있으면 그쪽이 정본이다. */
function spellcheckBlocked(extras: EpisodeStageExtras | undefined): boolean {
  const fromQc = qcItemStatus(extras, "dialogue-spellcheck");
  if (fromQc !== undefined) return fromQc === "blocked";
  return (extras?.dialogueSpellcheckErrorCount ?? null) !== null
    && (extras?.dialogueSpellcheckErrorCount ?? 0) > 0;
}

/** 필수 수정 핀이 남아 검수를 막고 있는가. 핀을 읽지 못했으면 막지 않는 것으로 두지 않고 판정에만 반영한다. */
function urgentPinsBlock(extras: EpisodeStageExtras | undefined): boolean {
  return extras?.openUrgentPins !== undefined && extras.openUrgentPins > 0;
}

/**
 * 검수 완료 신호가 전부 모였는가 (멈춘 상태의 done 판정에도 같은 기준을 쓴다).
 * - 통합 교정 승인: 협업 레코드 플래그 또는 QC `joint-proof` pass.
 * - 검수 게이트: QC `review-gate`가 blocked면 완료가 아니다. 정책이 없어
 *   skipped인 경우는 QC 스스로 "통합 교정 승인이 대신한다"고 판정하므로 통과로 본다.
 * - 필수 수정 핀: 읽을 수 있었고 0개가 아니면 완료가 아니다.
 */
function reviewCompletionMet(
  evidence: EpisodeStageEvidence,
  extras: EpisodeStageExtras | undefined,
): boolean {
  const jointProofDone = evidence.jointProofApproved || qcItemStatus(extras, "joint-proof") === "pass";
  if (!jointProofDone) return false;
  if (qcItemStatus(extras, "review-gate") === "blocked") return false;
  if (urgentPinsBlock(extras)) return false;
  return true;
}

/**
 * 식자·연출 판정 (S2-3).
 * - `lettering-and-integration`에 머물면 current다. 통합본이 먼저 고정돼 있어도
 *   상태 기계가 식자 중이라고 말하는 동안은 current가 우선한다.
 * - 합동 교정 이후 단계(joint-proof·publish-ready·published)는 식자를 지난 것이다.
 * - 그보다 앞 단계라도 식자 통합본이 고정돼 있으면(QC `integrated-art` pass와
 *   같은 근거) done이다. 단, 맞춤법 오류 의심이 남아 있으면 승격하지 않는다 —
 *   BLUEPRINT §2.1의 식자 완료 조건이 "대사 배치·맞춤법 검사 통과"이기 때문이다.
 */
function letteringStatus(
  evidence: EpisodeStageEvidence,
  extras: EpisodeStageExtras | undefined,
): EpisodeStageStatus {
  if (PAUSED_STATES.has(evidence.state)) {
    return evidence.integratedRevisionRef ? "done" : "unknown";
  }
  if (!PROGRESS_BY_STATE[evidence.state]) return "unknown"; // cancelled 등
  switch (evidence.state) {
    case "lettering-and-integration":
      return "current";
    case "joint-proof":
    case "publish-ready":
    case "published":
      return "done";
    default:
      break;
  }
  if (evidence.integratedRevisionRef && !spellcheckBlocked(extras)) return "done";
  return "todo";
}

/**
 * 검수 판정 (S2-3).
 * - 게시된 회차의 검수는 끝난 것이다. publish-ready인데 필수 수정 핀이 남아
 *   있으면 검수가 다시 지금 단계가 된다(핀은 승인 게이트의 잠금 조건이다).
 * - 상태가 합동 교정에 머물면 current가 기본값이지만, 완료 신호가 전부
 *   모였으면 done으로 앞당겨 말한다(다음 행동은 게시 준비다).
 * - 그 외 알려진 상태에서는 아직 끝나지 않은 단계이므로 todo다.
 */
function reviewStatus(
  evidence: EpisodeStageEvidence,
  extras: EpisodeStageExtras | undefined,
): EpisodeStageStatus {
  if (PAUSED_STATES.has(evidence.state)) {
    return reviewCompletionMet(evidence, extras) ? "done" : "unknown";
  }
  if (!PROGRESS_BY_STATE[evidence.state]) return "unknown"; // cancelled 등
  if (evidence.state === "published") return "done";
  if (evidence.state === "publish-ready") {
    return urgentPinsBlock(extras) ? "current" : "done";
  }
  if (reviewCompletionMet(evidence, extras)) return "done";
  if (evidence.state === "joint-proof") return "current";
  return "todo";
}

/**
 * 운영 판정 (S2-3). 운영은 끝나는 단계가 아니라 게시 뒤에 이어지는 단계다:
 * 게시 완료면 current, 알려진 진행 중 상태면 todo, 멈춤·취소는 unknown.
 */
function operateStatus(evidence: EpisodeStageEvidence): EpisodeStageStatus {
  if (PAUSED_STATES.has(evidence.state)) return "unknown";
  if (!PROGRESS_BY_STATE[evidence.state]) return "unknown"; // cancelled 등
  return evidence.state === "published" ? "current" : "todo";
}

/**
 * 단계 합의 게이트의 완료 상한을 기본 도출 결과에 얹는다.
 *
 * 규칙 (게이트 모델의 "완료 확정만 참조한다"는 계약 그대로):
 * - `completionByStage[단계] === false`이고 기본 판정이 done이면 그 단계는
 *   완료로 확정할 수 없다. 막힌 단계가 여럿이면 가장 이른 단계가 current가
 *   되고(합의를 기다리는 지점이 지금 할 일이다), 나머지는 todo로 내린다.
 *   기본 판정의 current였던 뒤 단계도 todo로 내린다 — publish-ready에서
 *   필수 핀이 남아 검수가 current로 돌아가고 게시가 todo가 되는 기존
 *   패턴과 같은 "전선이 차단 지점으로 되돌아가는" 규칙이며, current는
 *   항상 최대 하나다.
 * - `true`인 단계는 승격하지 않는다. 게이트 합의만으로 상태 기계가 아직
 *   지나지 않은 단계를 done이라 말하면 진척을 지어내는 것이 된다.
 * - 게시 완료(published) 회차와 멈춤·취소 상태에서는 적용하지 않는다.
 *   이미 게시된 회차의 진척은 사실이고, 멈춘 회차에서는 기존 규칙대로
 *   승인·고정만 근거가 된다(게이트는 그 경우 QC 게시 판정으로만 작용한다).
 */
function applyStageGateCompletion(
  states: readonly EpisodeStageState[],
  evidence: EpisodeStageEvidence,
  extras: EpisodeStageExtras | undefined,
): readonly EpisodeStageState[] {
  const completion = extras?.stageGate?.completionByStage;
  if (!completion) return states;
  if (evidence.state === "published") return states;
  if (PAUSED_STATES.has(evidence.state)) return states;
  if (!PROGRESS_BY_STATE[evidence.state]) return states; // cancelled 등
  const blockedDone = states.filter(
    (state) => state.status === "done" && completion[state.id as keyof typeof completion] === false,
  );
  if (blockedDone.length === 0) return states;
  const frontierId = blockedDone[0]?.id;
  return states.map((state) => {
    if (state.id === frontierId) return { ...state, status: "current" as const };
    if (blockedDone.some((entry) => entry.id === state.id)) return { ...state, status: "todo" as const };
    if (state.status === "current") return { ...state, status: "todo" as const };
    return state;
  });
}

/**
 * 회차 1개의 단계 상태 목록을 7단계 순서대로 돌려준다.
 * 근거 회차가 없으면(undefined) 전 단계 unknown — 빈 프로젝트의 중립 표시.
 * S2-3부터는 7단계 전부가 판정(done/current/todo) 또는 명시적 unknown이다.
 * 게시 판정은 파일럿 규칙을 유지하되, publish-ready에서 필수 수정 핀이 남아
 * 검수가 current로 되돌아간 경우만 게시를 todo로 내린다(동시에 current가
 * 두 개가 되는 것을 막고, QC의 "게시 가능 = 막힌 항목 없음"과 어긋나지 않게).
 * 단계 합의 게이트 요약이 extras로 오면 `applyStageGateCompletion`이
 * 완료 확정의 상한을 얹는다.
 */
export function deriveEpisodeStageStates(
  evidence: EpisodeStageEvidence | null | undefined,
  extras?: EpisodeStageExtras,
): readonly EpisodeStageState[] {
  const base = EPISODE_STAGES.map((stage) => {
    if (!evidence) return { id: stage.id, label: stage.label, status: "unknown" as const };
    switch (stage.id) {
      case "lettering":
        return { id: stage.id, label: stage.label, status: letteringStatus(evidence, extras) };
      case "review":
        return { id: stage.id, label: stage.label, status: reviewStatus(evidence, extras) };
      case "operate":
        return { id: stage.id, label: stage.label, status: operateStatus(evidence) };
      case "publish": {
        const status = pilotStatus(stage.id, evidence);
        const demoted = status === "current"
          && evidence.state === "publish-ready"
          && urgentPinsBlock(extras);
        return { id: stage.id, label: stage.label, status: demoted ? "todo" as const : status };
      }
      default:
        return { id: stage.id, label: stage.label, status: pilotStatus(stage.id, evidence) };
    }
  });
  if (!evidence) return base;
  return applyStageGateCompletion(base, evidence, extras);
}

/** compact 칩이 보여줄 현재 단계. current가 없으면 null(칩을 그리지 않는다). */
export function currentEpisodeStage(states: readonly EpisodeStageState[]): EpisodeStageState | null {
  return states.find((state) => state.status === "current") ?? null;
}

export interface StepperEpisodeSelection {
  readonly episode: EpisodeCollaboration;
  readonly episodeNumber: number | null;
  readonly title: string | null;
}

/**
 * 개요 스텝퍼가 대표로 보여줄 회차 1개를 고른다.
 * 대시보드의 "공개 전 회차" 관습과 같게 cancelled·published를 우선 제외하고,
 * 회차 번호(회차 기획 기준)가 가장 이른 진행 중 회차를 고른다. 전부 게시됐으면
 * 가장 최근 회차를 골라 게시 완료 상태가 보이게 한다.
 */
export function selectStepperEpisode(
  episodes: readonly EpisodeCollaboration[],
  episodePlans: readonly EpisodePlan[],
): StepperEpisodeSelection | null {
  const planByEpisodeId = new Map(episodePlans.map((plan) => [plan.episodeId, plan] as const));
  const decorated = episodes
    .filter((episode) => episode.state !== "cancelled")
    .map((episode) => {
      const plan = planByEpisodeId.get(episode.episodeId);
      return {
        episode,
        episodeNumber: plan?.episodeNumber ?? null,
        title: plan?.title ?? null,
      };
    })
    .sort((left, right) =>
      (left.episodeNumber ?? Number.MAX_SAFE_INTEGER) - (right.episodeNumber ?? Number.MAX_SAFE_INTEGER));
  if (!decorated.length) return null;
  const active = decorated.find((entry) => entry.episode.state !== "published");
  if (active) return active;
  return decorated[decorated.length - 1] ?? null;
}
