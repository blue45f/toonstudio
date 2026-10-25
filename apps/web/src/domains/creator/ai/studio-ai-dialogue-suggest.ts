/**
 * studio-ai-dialogue-suggest.ts — 대사 추천 프롬프트 (순수 모듈, fetch 없음).
 *
 * 대사 추천 패널은 존재하나 생성 경로 상세는 미확인이었다. 이 모듈은
 * 컷 맥락·인물 말투 메모·기존 대사를 대사 후보 JSON으로 바꾸는
 * 프롬프트와 결과 검증을 담당한다. 실제 호출은 서버 게이트 + 크레딧
 * 차감 경유로 호출부가 수행한다.
 */

/** 컷 맥락으로 대사 후보를 만드는 프롬프트를 만든다. */
export function buildDialogueSuggestPrompt(input: {
  readonly cutSummary: string;
  readonly character: string;
  readonly voiceNotes: string;
  readonly existingLines: readonly string[];
}): string {
  return [
    "다음 컷에 어울리는 대사 후보 3개를 JSON으로만 답하라.",
    "형식: {\"lines\": [\"대사1\", \"대사2\", \"대사3\"]}",
    "대사는 자연스러운 구어체, 각 30자 이내로 한다.",
    `컷 요약: ${input.cutSummary.trim().slice(0, 2000)}`,
    `인물: ${input.character.trim() || "없음"}`,
    `말투 메모: ${input.voiceNotes.trim() || "없음"}`,
    `기존 대사: ${input.existingLines.join(" / ") || "없음"}`,
  ].join("\n");
}

/** 모델이 JSON을 코드 펜스로 감싸는 경우를 대비해 펜스를 제거한다. */
function stripJsonFences(text: string): string {
  let trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  trimmed = trimmed.replace(/^```[a-zA-Z]*\n?/, "");
  if (trimmed.endsWith("```")) trimmed = trimmed.slice(0, -3).trim();
  return trimmed;
}

/** 대사 후보 결과를 검증한다. 형식이 아니면 null이다. */
export function parseDialogueSuggestions(
  text: string,
): readonly string[] | null {
  try {
    const parsed: unknown = JSON.parse(stripJsonFences(text));
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record["lines"])) return null;
    const lines = record["lines"] as unknown[];
    if (lines.some((line) => typeof line !== "string" || !line)) return null;
    return Object.freeze([...(lines as string[])]);
  } catch {
    return null;
  }
}
