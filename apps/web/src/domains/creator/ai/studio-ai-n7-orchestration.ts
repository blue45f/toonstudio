/**
 * studio-ai-n7-orchestration.ts — 에이전트형 회차 초안 다단계 프롬프트 (순수 모듈, fetch 없음).
 *
 * N7은 줄거리 스크립트를 컷 분할 → 대사 배치 → 채색 지시로 다단계 생성하고
 * 작가가 각 단계를 검수한다. 이 모듈은 각 단계의 프롬프트와 결과 검증만
 * 담당한다. 실제 LLM 호출은 서버 게이트 + 크레딧 차감 경유(서버 어댑터
 * 전제) 또는 사용자 BYOK 경로로 호출부가 수행한다. 단계별 과금은 호출
 * 횟수만큼 발생하므로 상한·승인 장치가 호출부에 필요하다.
 */

export type StudioAiN7Step = "split" | "dialogue" | "coloring";

export const STUDIO_AI_N7_STEP_ORDER: readonly StudioAiN7Step[] = Object.freeze([
  "split",
  "dialogue",
  "coloring",
]);

export interface StudioAiN7CutDraft {
  readonly id: string;
  readonly summary: string;
}

export interface StudioAiN7DialogueDraft {
  readonly cutId: string;
  readonly lines: readonly string[];
}

export interface StudioAiN7ColoringDraft {
  readonly cutId: string;
  readonly instructions: string;
}

const MAX_SCRIPT_CHARS = 8000;

/** 1단계: 스크립트를 컷 초안 JSON으로 나누는 프롬프트를 만든다. */
export function buildN7SplitPrompt(script: string): string {
  const trimmed = script.trim().slice(0, MAX_SCRIPT_CHARS);
  return [
    "다음 줄거리 스크립트를 웹툰 컷으로 나누어 JSON으로만 답하라.",
    "형식: {\"cuts\": [{\"id\": \"cut-1\", \"summary\": \"한 문장 요약\"}]}",
    "컷 수는 4~12장, 요약은 한국어로 한 문장씩.",
    `스크립트:\n${trimmed}`,
  ].join("\n");
}

/** 2단계: 컷 초안에 대사를 배치하는 프롬프트를 만든다. */
export function buildN7DialoguePrompt(
  cuts: readonly StudioAiN7CutDraft[],
  characters: readonly string[],
): string {
  return [
    "다음 컷 초안에 대사(말풍선 문장)를 배치해 JSON으로만 답하라.",
    "형식: {\"dialogues\": [{\"cutId\": \"cut-1\", \"lines\": [\"대사\"]}]}",
    "대사는 각 컷 0~3줄, 등장인물 말투를 유지하라.",
    `등장인물: ${characters.join(", ") || "없음"}`,
    `컷: ${JSON.stringify(cuts)}`,
  ].join("\n");
}

/** 3단계: 컷 초안에 채색 지시를 붙이는 프롬프트를 만든다. */
export function buildN7ColoringPrompt(
  cuts: readonly StudioAiN7CutDraft[],
  styleNotes: string,
): string {
  return [
    "다음 컷 초안마다 채색 지시(주요 색·분위기·광원)를 JSON으로만 답하라.",
    "형식: {\"coloring\": [{\"cutId\": \"cut-1\", \"instructions\": \"지시 문장\"}]}",
    `화풍 메모: ${styleNotes.trim() || "없음"}`,
    `컷: ${JSON.stringify(cuts)}`,
  ].join("\n");
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text.trim());
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/** 1단계 결과를 검증한다. 형식이 아니면 null이다. */
export function parseN7SplitResult(
  text: string,
): readonly StudioAiN7CutDraft[] | null {
  const parsed = parseJsonObject(text);
  if (!parsed || !Array.isArray(parsed["cuts"])) return null;
  const cuts: StudioAiN7CutDraft[] = [];
  for (const item of parsed["cuts"] as unknown[]) {
    if (typeof item !== "object" || item === null) return null;
    const record = item as Record<string, unknown>;
    if (typeof record["id"] !== "string" || typeof record["summary"] !== "string") {
      return null;
    }
    cuts.push({ id: record["id"], summary: record["summary"] });
  }
  if (cuts.length < 1 || cuts.length > 24) return null;
  return Object.freeze(cuts);
}

/** 2단계 결과를 검증한다. 형식이 아니면 null이다. */
export function parseN7DialogueResult(
  text: string,
): readonly StudioAiN7DialogueDraft[] | null {
  const parsed = parseJsonObject(text);
  if (!parsed || !Array.isArray(parsed["dialogues"])) return null;
  const dialogues: StudioAiN7DialogueDraft[] = [];
  for (const item of parsed["dialogues"] as unknown[]) {
    if (typeof item !== "object" || item === null) return null;
    const record = item as Record<string, unknown>;
    if (
      typeof record["cutId"] !== "string" ||
      !Array.isArray(record["lines"]) ||
      (record["lines"] as unknown[]).some((line) => typeof line !== "string")
    ) {
      return null;
    }
    dialogues.push({
      cutId: record["cutId"],
      lines: Object.freeze([...(record["lines"] as string[])]),
    });
  }
  return Object.freeze(dialogues);
}

/** 3단계 결과를 검증한다. 형식이 아니면 null이다. */
export function parseN7ColoringResult(
  text: string,
): readonly StudioAiN7ColoringDraft[] | null {
  const parsed = parseJsonObject(text);
  if (!parsed || !Array.isArray(parsed["coloring"])) return null;
  const drafts: StudioAiN7ColoringDraft[] = [];
  for (const item of parsed["coloring"] as unknown[]) {
    if (typeof item !== "object" || item === null) return null;
    const record = item as Record<string, unknown>;
    if (
      typeof record["cutId"] !== "string" ||
      typeof record["instructions"] !== "string"
    ) {
      return null;
    }
    drafts.push({
      cutId: record["cutId"],
      instructions: record["instructions"],
    });
  }
  return Object.freeze(drafts);
}
