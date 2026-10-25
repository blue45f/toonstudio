/**
 * studio-ai-handover-summary.ts — 작가 인수인계 요약 프롬프트 (순수 모듈, fetch 없음).
 *
 * 작가 교체 전용 인계 플로우는 없었으나 권한·체크리스트·공유 설정 기반은
 * 있었다. 이 모듈은 인계 패키지 정보를 신규 작가용 요약 문장 프롬프트로
 * 바꾸는 부분만 담당한다. 실제 호출은 서버 게이트 + 크레딧 차감 경유로
 * 호출부가 수행하며, 호출하지 않으면 패키지 자체로 인계가 동작한다.
 */

/** 인계 패키지 정보를 요약 프롬프트로 만든다. */
export function buildHandoverSummaryPrompt(input: {
  readonly workTitle: string;
  readonly outgoingAuthor: string;
  readonly incomingAuthor: string;
  readonly bibleSummary: string;
  readonly styleSummary: string;
  readonly pendingCount: number;
  readonly inProgressCutCount: number;
}): string {
  return [
    "다음 작가 인수인계 정보를 신규 작가용 요약 문장으로 한국어로 작성하라.",
    "구성: 작품 개요 1문장, 캐릭터·설정 핵심 2문장, 화풍·팔레트 핵심 1문장, 미결 항목 안내 1문장.",
    `작품: ${input.workTitle.trim() || "없음"}`,
    `인계: ${input.outgoingAuthor.trim() || "없음"} → ${input.incomingAuthor.trim() || "없음"}`,
    `캐릭터·설정: ${input.bibleSummary.trim().slice(0, 2000) || "없음"}`,
    `화풍: ${input.styleSummary.trim().slice(0, 2000) || "없음"}`,
    `미결 검수 항목: ${Math.max(0, Math.floor(input.pendingCount))}건`,
    `진행 중 컷: ${Math.max(0, Math.floor(input.inProgressCutCount))}장`,
  ].join("\n");
}
