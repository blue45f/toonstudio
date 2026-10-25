/**
 * studio-ai-summary-prompts.ts — 줄거리 요약·시노시스 초안 프롬프트 (순수 모듈, fetch 없음).
 *
 * 회차 줄거리·시놉시스는 작성·저장이 배선돼 있으나 완성 원고·대본으로부터의
 * 자동 요약 생성은 없었다. 이 모듈은 그 생성용 프롬프트만 담당한다.
 * 실제 호출은 서버 게이트 + 크레딧 차감 경유로 호출부가 수행한다.
 * 입력 길이 상한을 두어 과금 폭주를 막는다.
 */

const MAX_SOURCE_CHARS = 12000;

export const STUDIO_AI_SUMMARY_MAX_SENTENCES = 5;

/** 회차 원고·대본 텍스트를 줄거리 요약 프롬프트로 만든다. */
export function buildPlotSummaryPrompt(
  sourceTexts: readonly string[],
  maxSentences: number = STUDIO_AI_SUMMARY_MAX_SENTENCES,
): string {
  const joined = sourceTexts
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n---\n")
    .slice(0, MAX_SOURCE_CHARS);
  const sentences = Math.min(10, Math.max(1, Math.floor(maxSentences)));
  return [
    "다음 회차 원고·대본을 줄거리로 요약해 한국어로 답하라.",
    `문장 수: ${sentences}문장 이내, 스포일러 없이 핵심 전개만.`,
    `원고:\n${joined}`,
  ].join("\n");
}

/** 전제·인물·톤으로 작품 시놉시스 초안 프롬프트를 만든다. */
export function buildSynopsisDraftPrompt(input: {
  readonly premise: string;
  readonly characters: readonly string[];
  readonly tone: string;
}): string {
  return [
    "다음 전제로 웹툰 작품 시놉시스 초안을 한국어로 작성하라.",
    "구성: 로그라인 1문장, 전체 줄거리 3~5문장, 기획 의도 1문장.",
    `전제: ${input.premise.trim().slice(0, MAX_SOURCE_CHARS)}`,
    `등장인물: ${input.characters.join(", ") || "없음"}`,
    `톤: ${input.tone.trim() || "없음"}`,
  ].join("\n");
}
