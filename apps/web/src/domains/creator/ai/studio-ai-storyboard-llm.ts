/**
 * studio-ai-storyboard-llm.ts — 콘티 보조 LLM 프롬프트 (순수 모듈, fetch 없음).
 *
 * 콘티 디렉터 섹션은 스토리라인 아크·대사 추천·화풍 DNA를 이미 갖추고
 * 있으나 LLM 기반 컷 계획 생성은 서버 어댑터 전제였다. 이 모듈은
 * 전제·요약을 컷 계획 JSON으로 바꾸는 프롬프트와 결과 검증만 담당한다.
 * 실제 호출은 서버 게이트 + 크레딧 차감 경유로 호출부가 수행한다.
 */

export interface StudioAiStoryboardCutPlan {
  readonly id: string;
  readonly summary: string;
  readonly camera: string;
  readonly dialogues: readonly string[];
}

const MAX_PREMISE_CHARS = 4000;

/** 전제·인물·화풍 메모를 컷 계획 JSON 프롬프트로 만든다. */
export function buildStoryboardPlanPrompt(input: {
  readonly premise: string;
  readonly characters: readonly string[];
  readonly styleNotes: string;
  readonly cutCount: number;
}): string {
  const count = Math.min(24, Math.max(1, Math.floor(input.cutCount)));
  return [
    "다음 전제를 웹툰 콘티 컷 계획으로 만들어 JSON으로만 답하라.",
    "형식: {\"cuts\": [{\"id\": \"cut-1\", \"summary\": \"요약\", \"camera\": \"카메라 지시\", \"dialogues\": [\"대사\"]}]}",
    "요약과 카메라 지시는 각각 40자 이내로 간결하게 쓴다(출력 토큰 절단 방지).",
    `컷 수: ${count}장`,
    `전제: ${input.premise.trim().slice(0, MAX_PREMISE_CHARS)}`,
    `등장인물: ${input.characters.join(", ") || "없음"}`,
    `화풍 메모: ${input.styleNotes.trim() || "없음"}`,
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

/** 컷 계획 결과를 검증한다. 형식이 아니면 null이다. */
export function parseStoryboardPlan(
  text: string,
): readonly StudioAiStoryboardCutPlan[] | null {
  try {
    const parsed: unknown = JSON.parse(stripJsonFences(text));
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record["cuts"])) return null;
    const cuts: StudioAiStoryboardCutPlan[] = [];
    for (const item of record["cuts"] as unknown[]) {
      if (typeof item !== "object" || item === null) return null;
      const cut = item as Record<string, unknown>;
      if (
        typeof cut["id"] !== "string" ||
        typeof cut["summary"] !== "string" ||
        typeof cut["camera"] !== "string" ||
        !Array.isArray(cut["dialogues"]) ||
        (cut["dialogues"] as unknown[]).some((line) => typeof line !== "string")
      ) {
        return null;
      }
      cuts.push({
        id: cut["id"],
        summary: cut["summary"],
        camera: cut["camera"],
        dialogues: Object.freeze([...(cut["dialogues"] as string[])]),
      });
    }
    return Object.freeze(cuts);
  } catch {
    return null;
  }
}
