/**
 * studio-ai-context-note.ts — 작품별 맥락 노트 (순수 모듈, fetch 없음).
 *
 * 연재물 일관성(G8)의 비용 0 대응: 캐릭터 규칙·팔레트·배경 규칙·금지
 * 사항을 작품 단위로 적어두고 채색·컷 화면에서 컨텍스트로 보여준다.
 * 이후 유료 LLM 연동 시 이 노트가 프롬프트 컨텍스트가 되는 구조이며,
 * 이 모듈 자체는 어떤 모델 호출도 하지 않는다.
 */

export interface StudioAiContextNote {
  readonly workId: string;
  readonly characterRules: readonly string[];
  readonly palette: readonly string[];
  readonly backgroundRules: readonly string[];
  readonly prohibitions: readonly string[];
  readonly updatedAt: number;
}

const MAX_ITEMS_PER_LIST = 50;
const MAX_ITEM_LENGTH = 200;

export function createContextNote(
  workId: string,
  now: number = Date.now(),
): StudioAiContextNote {
  return {
    workId,
    characterRules: Object.freeze([]),
    palette: Object.freeze([]),
    backgroundRules: Object.freeze([]),
    prohibitions: Object.freeze([]),
    updatedAt: now,
  };
}

/** 앞뒤 공백 제거, 빈 항목 제거, 중복 제거, 개수·길이 상한 적용. */
export function sanitizeContextNoteItems(
  values: readonly string[],
): readonly string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed.slice(0, MAX_ITEM_LENGTH));
    if (cleaned.length >= MAX_ITEMS_PER_LIST) break;
  }
  return Object.freeze(cleaned);
}

export function mergeContextNote(
  prev: StudioAiContextNote,
  patch: Partial<
    Pick<
      StudioAiContextNote,
      "characterRules" | "palette" | "backgroundRules" | "prohibitions"
    >
  >,
  now: number = Date.now(),
): StudioAiContextNote {
  return {
    ...prev,
    characterRules:
      patch.characterRules !== undefined
        ? sanitizeContextNoteItems(patch.characterRules)
        : prev.characterRules,
    palette:
      patch.palette !== undefined
        ? sanitizeContextNoteItems(patch.palette)
        : prev.palette,
    backgroundRules:
      patch.backgroundRules !== undefined
        ? sanitizeContextNoteItems(patch.backgroundRules)
        : prev.backgroundRules,
    prohibitions:
      patch.prohibitions !== undefined
        ? sanitizeContextNoteItems(patch.prohibitions)
        : prev.prohibitions,
    updatedAt: now,
  };
}

/** 노트를 이후 LLM 프롬프트 컨텍스트로 쓸 수 있는 텍스트 블록으로 컴파일한다. */
export function contextNoteToPromptContext(note: StudioAiContextNote): string {
  const sections: string[] = [];
  if (note.characterRules.length > 0) {
    sections.push(`캐릭터 규칙: ${note.characterRules.join("; ")}`);
  }
  if (note.palette.length > 0) {
    sections.push(`팔레트: ${note.palette.join(", ")}`);
  }
  if (note.backgroundRules.length > 0) {
    sections.push(`배경 규칙: ${note.backgroundRules.join("; ")}`);
  }
  if (note.prohibitions.length > 0) {
    sections.push(`금지: ${note.prohibitions.join("; ")}`);
  }
  return sections.join("\n");
}
