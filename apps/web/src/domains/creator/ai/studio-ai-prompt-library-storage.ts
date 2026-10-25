/**
 * studio-ai-prompt-library-storage.ts — 프롬프트 라이브러리 저장소 어댑터 (순수 모듈, fetch 없음).
 *
 * 라이브러리 목록 연산(studio-ai-prompt-library.ts)은 저장소 연결을 호출부의
 * 몫으로 두었다. 이 모듈은 그 빈틈을 메우는 Web Storage 형태 어댑터이다.
 * 저장소 객체를 주입받으므로 테스트에서는 메모리 저장소를 쓴다. 손상된
 * 저장값은 빈 목록으로 취급하고, 저장 실패는 호출부에서 처리하도록 false를
 * 돌려준다. 키 값은 다루지 않는다.
 */

import type { StudioAiPromptLibraryEntry } from "./studio-ai-prompt-library";
import { STUDIO_AI_PROMPT_LIBRARY_CAP } from "./studio-ai-prompt-library";

export interface StudioAiPromptLibraryStore {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

export const STUDIO_AI_PROMPT_LIBRARY_STORAGE_KEY =
  "toonstudio.ai.prompt-library.v1";

type StoredEntry = {
  readonly id: unknown;
  readonly text: unknown;
  readonly kind: unknown;
  readonly usedAt: unknown;
};

function isStoredEntry(value: unknown): value is StoredEntry {
  if (typeof value !== "object" || value === null) return false;
  return "id" in value && "text" in value && "kind" in value && "usedAt" in value;
}

function toLibraryEntry(value: StoredEntry): StudioAiPromptLibraryEntry | null {
  if (
    typeof value.id !== "string" ||
    typeof value.text !== "string" ||
    typeof value.usedAt !== "number" ||
    !Number.isFinite(value.usedAt) ||
    (value.kind !== "hint" && value.kind !== "prompt" && value.kind !== "palette")
  ) {
    return null;
  }
  if (!value.id || !value.text) return null;
  return {
    id: value.id,
    text: value.text,
    kind: value.kind,
    usedAt: value.usedAt,
  };
}

/** 저장된 JSON을 검증해 라이브러리 목록으로 복원한다. 손상 시 빈 목록이다. */
export function loadPromptLibraryEntries(
  store: StudioAiPromptLibraryStore,
  key: string = STUDIO_AI_PROMPT_LIBRARY_STORAGE_KEY,
): readonly StudioAiPromptLibraryEntry[] {
  const raw = store.getItem(key);
  if (!raw) return Object.freeze([]);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return Object.freeze([]);
    const entries: StudioAiPromptLibraryEntry[] = [];
    for (const item of parsed) {
      if (!isStoredEntry(item)) continue;
      const entry = toLibraryEntry(item);
      if (entry) entries.push(entry);
      if (entries.length >= STUDIO_AI_PROMPT_LIBRARY_CAP) break;
    }
    return Object.freeze(entries);
  } catch {
    return Object.freeze([]);
  }
}

/** 목록을 저장한다. 저장 실패 시 false를 돌려주고 예외를 던지지 않는다. */
export function savePromptLibraryEntries(
  store: StudioAiPromptLibraryStore,
  entries: readonly StudioAiPromptLibraryEntry[],
  key: string = STUDIO_AI_PROMPT_LIBRARY_STORAGE_KEY,
): boolean {
  try {
    store.setItem(
      key,
      JSON.stringify(entries.slice(0, STUDIO_AI_PROMPT_LIBRARY_CAP)),
    );
    return true;
  } catch {
    return false;
  }
}
