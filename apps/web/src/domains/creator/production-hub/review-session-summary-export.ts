/**
 * 검수 세션 요약 내보내기 — 끝난 세션의 결정 이력을 회차 검수 기록과
 * 인계 패키지가 그대로 실어 나를 수 있는 "요약 레코드"로 굳힌다.
 *
 * 배경 (마그마 벤치마크 축 5): 마그마의 캔버스 댓글·채팅은 세션이 끝나면
 * 시간순으로 흘러가 버려 "무엇이 결정됐는가"가 남지 않는다. 우리는 반대로
 * 간다 — 세션 판정은 결정 이력(review-session-model)이 자산이고, 이 모듈은
 * 그 이력을 두 군데에 자동으로 붙인다.
 *
 * 1. 회차 검수 기록: 세션이 끝나는 순간 요약을 만들어 검수 기록 장부
 *    (SessionSummaryLedger)에 붙인다. 같은 세션을 다시 붙여도 중복되지
 *    않고(세션 id 기준 최신본 교체), 회차별로 골라 읽을 수 있다.
 * 2. 인계 패키지: stage-handoff-model 이 이 요약을 "검수 세션 결정"
 *    섹션으로 인용한다. 다음 단계·다음 담당자가 앞 세션의 판정을 그
 *    자리에서 다시 읽는다.
 *
 * 원칙:
 * - 살아 있는 세션은 내보내지 않는다. 판정이 진행 중인데 요약이 먼저
 *   굳으면 기록이 어긋난다. 실효 상태(전원 이탈·최대 시간 초과 포함)가
 *   ended 일 때만 요약을 만든다.
 * - 없는 내용을 지어내지 않는다. 참여자·판정은 세션 레코드에 있는 것만
 *   옮기고, 판정이 없는 세션은 "판정 없음"으로 정직하게 남긴다.
 * - 결과(outcome)는 판정에서만 도출한다: 수정 요청이 하나라도 있으면
 *   changes-requested, 없고 승인만 있으면 approved, 둘 다 없으면
 *   discussion-only. 승인 게이트 판정을 대신하지 않는다 — 이건 기록이다.
 */
import {
  deriveEffectiveSession,
  summarizeReviewSession,
  type ReviewSession,
  type ReviewSessionDecision,
  type SessionDecisionKind,
} from "./review-session-model";
import type { BilingualLabel } from "./production-labels";

export const REVIEW_SESSION_SUMMARY_EXPORT_TITLE: BilingualLabel = Object.freeze({
  ko: "검수 세션 결정",
  en: "Review session decisions",
});

/** 세션 결과 — 판정 구성에서만 도출하는 기록용 분류. 승인 게이트와 무관하다. */
export type ReviewSessionOutcome = "approved" | "changes-requested" | "discussion-only";

export const REVIEW_SESSION_OUTCOME_LABELS: Readonly<Record<ReviewSessionOutcome, BilingualLabel>> =
  Object.freeze({
    approved: { ko: "승인으로 마무리", en: "Closed with approvals" },
    "changes-requested": { ko: "수정 요청 남음", en: "Changes requested" },
    "discussion-only": { ko: "논의만 진행", en: "Discussion only" },
  });

export const SESSION_DECISION_KIND_LABELS: Readonly<Record<SessionDecisionKind, BilingualLabel>> =
  Object.freeze({
    approve: { ko: "승인", en: "Approved" },
    "request-changes": { ko: "수정 요청", en: "Changes requested" },
    note: { ko: "메모", en: "Note" },
  });

/**
 * 내보낸 세션 요약 레코드. 회차 검수 기록의 한 항목이자 인계 패키지의
 * 인용 재료다. 세션 원본을 통째로 싣지 않고, 기록·인계에 필요한 것만
 * 굳힌다 (참여자 이름·판정 전문·집계·결과).
 */
export interface ReviewSessionSummaryExport {
  readonly sessionId: string;
  /** 세션이 열린 범위 = 회차 ID (ReviewSession.scopeId). */
  readonly episodeId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  /** 참여한 사람 이름 (참여 순서, 호스트 포함). */
  readonly participantNames: readonly string[];
  readonly hostName: string | null;
  readonly decisions: readonly ReviewSessionDecision[];
  readonly approvals: number;
  readonly changeRequests: number;
  readonly notes: number;
  readonly outcome: ReviewSessionOutcome;
  /** 한 줄 요약 — 검수 기록 목록·인계 섹션 첫 줄에 그대로 쓴다. */
  readonly headline: string;
  /** 이 요약을 만든 시각. 같은 세션 재내보내기 때 최신본 판정에 쓴다. */
  readonly exportedAt: string;
}

function outcomeOf(approvals: number, changeRequests: number): ReviewSessionOutcome {
  if (changeRequests > 0) return "changes-requested";
  if (approvals > 0) return "approved";
  return "discussion-only";
}

function headlineOf(input: {
  readonly participantCount: number;
  readonly approvals: number;
  readonly changeRequests: number;
  readonly notes: number;
  readonly outcome: ReviewSessionOutcome;
}): string {
  const counts = [
    `승인 ${input.approvals}건`,
    `수정 요청 ${input.changeRequests}건`,
    ...(input.notes > 0 ? [`메모 ${input.notes}건`] : []),
  ].join(" · ");
  const outcome = REVIEW_SESSION_OUTCOME_LABELS[input.outcome].ko;
  return `참여 ${input.participantCount}명 · ${counts} — ${outcome}`;
}

/**
 * 끝난 세션 → 요약 레코드. 아직 살아 있는 세션(실효 상태 포함)이면 null —
 * 진행 중인 판정을 기록으로 굳히지 않는다.
 */
export function buildReviewSessionSummaryExport(
  session: ReviewSession,
  now: Date,
): ReviewSessionSummaryExport | null {
  const effective = deriveEffectiveSession(session, now);
  if (effective.state !== "ended" || !effective.endedAt) return null;
  const summary = summarizeReviewSession(effective, now);
  const notes = effective.decisions.filter((d) => d.kind === "note").length;
  const outcome = outcomeOf(summary.approvals, summary.changeRequests);
  const host = effective.participants.find((p) => p.actorId === effective.hostActorId);
  return Object.freeze({
    sessionId: effective.id,
    episodeId: effective.scopeId,
    startedAt: effective.startedAt,
    endedAt: effective.endedAt,
    durationMs: summary.durationMs,
    participantNames: Object.freeze(effective.participants.map((p) => p.displayName)),
    hostName: host?.displayName ?? null,
    decisions: effective.decisions,
    approvals: summary.approvals,
    changeRequests: summary.changeRequests,
    notes,
    outcome,
    headline: headlineOf({
      participantCount: summary.participantCount,
      approvals: summary.approvals,
      changeRequests: summary.changeRequests,
      notes,
      outcome,
    }),
    exportedAt: now.toISOString(),
  });
}

/** 판정 한 건을 인계·기록 표시 한 줄로. "승인 · 이름 — 요약". */
export function formatSessionDecisionLine(decision: ReviewSessionDecision): string {
  const label = SESSION_DECISION_KIND_LABELS[decision.kind].ko;
  const summary = decision.summary.trim();
  return summary ? `${label} · ${decision.displayName} — ${summary}` : `${label} · ${decision.displayName}`;
}

/**
 * 인계 패키지·외부 전달에 붙이는 평문 블록. 구조화 레코드를 잃는 경로
 * (복사해 붙이기, 외부 협업자 전달)에서도 결정 이력이 그대로 남게 한다.
 */
export function formatSessionSummaryExportText(summaryExport: ReviewSessionSummaryExport): string {
  const lines: string[] = [
    `[${REVIEW_SESSION_SUMMARY_EXPORT_TITLE.ko}] ${summaryExport.headline}`,
    `참여자: ${summaryExport.participantNames.join(", ") || "없음"}`,
  ];
  if (summaryExport.decisions.length === 0) {
    lines.push("이 세션에서 남긴 판정은 없습니다.");
  } else {
    for (const decision of summaryExport.decisions) lines.push(`- ${formatSessionDecisionLine(decision)}`);
  }
  return lines.join("\n");
}

/* ------------------------- 회차 검수 기록 장부 ------------------------- */

/**
 * 회차 검수 기록 장부 — 내보낸 세션 요약들의 집합. 새 저장소가 아니라
 * "어떤 회차에 어떤 세션 요약이 붙어 있는가"를 다루는 순수 구조다.
 * 호스트는 이 장부를 회차 검수 기록 상태에 들고 있다가, 인계 카드에는
 * 회차별로 골라 넘긴다.
 */
export type SessionSummaryLedger = readonly ReviewSessionSummaryExport[];

/**
 * 장부에 요약을 붙인다. 같은 세션(sessionId)이 이미 있으면 exportedAt이
 * 더 최신인 쪽으로 교체한다 — 세션이 끝난 뒤 재내보내도 기록이 중복되지
 * 않는다. 순서는 종료 시각 오름차순으로 고정한다.
 */
export function attachSessionSummaryToLedger(
  ledger: SessionSummaryLedger,
  summaryExport: ReviewSessionSummaryExport,
): SessionSummaryLedger {
  const existing = ledger.find((entry) => entry.sessionId === summaryExport.sessionId);
  if (existing && existing.exportedAt >= summaryExport.exportedAt) return ledger;
  const rest = ledger.filter((entry) => entry.sessionId !== summaryExport.sessionId);
  return Object.freeze(
    [...rest, summaryExport].sort((a, b) => a.endedAt.localeCompare(b.endedAt)),
  );
}

/** 회차에 붙은 세션 요약들 (종료 시각 순). */
export function sessionSummariesForEpisode(
  ledger: SessionSummaryLedger,
  episodeId: string,
): readonly ReviewSessionSummaryExport[] {
  return Object.freeze(ledger.filter((entry) => entry.episodeId === episodeId));
}

/** 회차의 가장 최근 세션 요약. 인계 섹션이 대표로 인용하는 한 건. */
export function latestSessionSummaryForEpisode(
  ledger: SessionSummaryLedger,
  episodeId: string,
): ReviewSessionSummaryExport | null {
  const entries = sessionSummariesForEpisode(ledger, episodeId);
  return entries.at(-1) ?? null;
}
