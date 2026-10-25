/**
 * studio-ai-support-answer.ts — AI 고객센터 근거 기반 답변 프롬프트 (순수 모듈, fetch 없음).
 *
 * 고객센터 챗봇 본체는 화면 코드에서 확인되지 않았다. 이 모듈은
 * 제공된 FAQ 항목만을 근거로 답하는 프롬프트와 거부 판정을 담당한다.
 * 근거가 없으면 모델이 고정된 거부 문장으로 답하도록 지시하고,
 * 호출부는 그 문장을 감지해 "담당자 연결" 안내로 연결한다. 실제 호출은
 * 서버 게이트 + 크레딧 차감 경유로 호출부가 수행한다.
 */

export interface StudioAiFaqEntry {
  readonly question: string;
  readonly answer: string;
}

export const STUDIO_AI_SUPPORT_REFUSAL =
  "제공된 자료에서 찾을 수 없습니다. 담당자에게 문의해 주세요.";

/** 질문과 FAQ 항목을 근거 기반 답변 프롬프트로 만든다. */
export function buildSupportAnswerPrompt(input: {
  readonly question: string;
  readonly faqEntries: readonly StudioAiFaqEntry[];
}): string {
  const faq = input.faqEntries
    .map((entry) => `Q: ${entry.question}\nA: ${entry.answer}`)
    .join("\n---\n")
    .slice(0, 8000);
  return [
    "다음 FAQ 항목만을 근거로 질문에 한국어로 답하라. 근거에 없는 내용은 만들지 말고",
    `정확히 다음 문장으로만 답하라: "${STUDIO_AI_SUPPORT_REFUSAL}"`,
    `FAQ:\n${faq || "없음"}`,
    `질문: ${input.question.trim().slice(0, 2000)}`,
  ].join("\n");
}

/** 답변이 거부 문장인지 판정한다. */
export function isSupportRefusal(answer: string): boolean {
  return answer.trim().startsWith(STUDIO_AI_SUPPORT_REFUSAL);
}
