/**
 * studio-ai-review-llm.ts — 검수 코멘트 LLM 해석 프롬프트 (순수 모듈, fetch 없음).
 *
 * 검수 코멘트 → 체크리스트는 규칙 기반 변환만 있었고 자유 문장 해석은
 * 유료 전제로 분리돼 있었다. 이 모듈은 자유 문장을 구조화 항목으로
 * 바꾸는 프롬프트와 결과 검증을 담당한다. 파싱에 실패하면 null을
 * 돌려주고 호출부는 규칙 기반 변환으로 폴백한다. 실제 호출은 서버
 * 게이트 + 크레딧 차감 경유로 호출부가 수행한다.
 */

export interface StudioAiReviewInterpretedItem {
  readonly targetCut: string | null;
  readonly area: string | null;
  readonly task: string;
}

/** 자유 문장 검수 코멘트를 구조화 항목 JSON 프롬프트로 만든다. */
export function buildReviewInterpretPrompt(comment: string): string {
  return [
    "다음 검수 코멘트를 수정 항목으로 나누어 JSON으로만 답하라.",
    "형식: {\"items\": [{\"targetCut\": \"cut-3\" 또는 null, \"area\": \"배경\" 또는 null, \"task\": \"수정 내용\"}]}",
    "컷 번호가 없으면 targetCut은 null, 영역이 없으면 area는 null로 한다.",
    `코멘트: ${comment.trim().slice(0, 2000)}`,
  ].join("\n");
}

/** 모델이 JSON을 코드 펜스나 짧은 안내 문구로 감싸는 경우를 대비해 본문 JSON만 추출한다. */
function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      // 원문 JSON 파싱 실패 시 외부 코드 펜스·중괄호 추출로 폴백한다.
    }
  }
  const openIdx = trimmed.indexOf("```");
  const firstBrace = trimmed.indexOf("{");
  if (openIdx >= 0 && (firstBrace < 0 || openIdx < firstBrace)) {
    const afterOpen = trimmed.slice(openIdx + 3);
    const langMatch = /^(?:json)?[\t ]*\r?\n?/iu.exec(afterOpen);
    const contentStart = openIdx + 3 + (langMatch ? langMatch[0].length : 0);
    const closeIdx = trimmed.lastIndexOf("```");
    if (closeIdx > contentStart) return trimmed.slice(contentStart, closeIdx).trim();
  }
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }
  return trimmed;
}

/** 해석 결과를 검증한다. 형식이 아니면 null이다(호출부는 규칙 변환으로 폴백). */
export function parseReviewInterpretation(
  text: string,
): readonly StudioAiReviewInterpretedItem[] | null {
  try {
    const parsed: unknown = JSON.parse(stripJsonFences(text));
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record["items"])) return null;
    const items: StudioAiReviewInterpretedItem[] = [];
    for (const item of record["items"] as unknown[]) {
      if (typeof item !== "object" || item === null) return null;
      const entry = item as Record<string, unknown>;
      if (
        (entry["targetCut"] !== null && typeof entry["targetCut"] !== "string") ||
        (entry["area"] !== null && typeof entry["area"] !== "string") ||
        typeof entry["task"] !== "string" ||
        !entry["task"]
      ) {
        return null;
      }
      items.push({
        targetCut: entry["targetCut"] as string | null,
        area: entry["area"] as string | null,
        task: entry["task"] as string,
      });
    }
    return Object.freeze(items);
  } catch {
    return null;
  }
}
