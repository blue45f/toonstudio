/**
 * studio-ai-prompt-library.ts — 힌트·프롬프트 재사용 라이브러리 (순수 모듈, fetch 없음).
 *
 * 작가가 자주 쓰는 힌트 세트 문장·프롬프트·팔레트 문장을 개인
 * 라이브러리로 저장·재사용한다. 저장소 연결(로컬·서버)은 호출부의
 * 몫이며, 이 모듈은 목록 연산만 한다. id는 텍스트 해시에서
 * 결정적으로 만들므로 저장·불러오기 왕복에도 안정적이다.
 */

export type StudioAiPromptLibraryKind = "hint" | "prompt" | "palette";

export interface StudioAiPromptLibraryEntry {
  readonly id: string;
  readonly text: string;
  readonly kind: StudioAiPromptLibraryKind;
  readonly usedAt: number;
}

export const STUDIO_AI_PROMPT_LIBRARY_CAP = 100;

function hashLibraryText(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function promptLibraryEntryId(
  kind: StudioAiPromptLibraryKind,
  text: string,
): string {
  return `lib-${kind}-${hashLibraryText(`${kind}:${text}`)}`;
}

function sortLibraryRecentFirst(
  entries: readonly StudioAiPromptLibraryEntry[],
): readonly StudioAiPromptLibraryEntry[] {
  return Object.freeze(
    [...entries].sort((a, b) => b.usedAt - a.usedAt),
  );
}

export function listPromptLibraryEntries(
  entries: readonly StudioAiPromptLibraryEntry[],
): readonly StudioAiPromptLibraryEntry[] {
  return sortLibraryRecentFirst(entries);
}

/** 중복(같은 종류+같은 문장)은 새로 추가하지 않고 사용 시각만 갱신한다. */
export function addPromptLibraryEntry(
  entries: readonly StudioAiPromptLibraryEntry[],
  input: { readonly text: string; readonly kind: StudioAiPromptLibraryKind },
  now: number = Date.now(),
): { readonly entries: readonly StudioAiPromptLibraryEntry[]; readonly added: boolean } {
  const text = input.text.trim();
  if (!text) return { entries, added: false };
  const id = promptLibraryEntryId(input.kind, text);
  const existing = entries.find((entry) => entry.id === id);
  if (existing) {
    return {
      entries: sortLibraryRecentFirst(
        entries.map((entry) =>
          entry.id === id ? { ...entry, usedAt: now } : entry,
        ),
      ),
      added: false,
    };
  }
  const next = sortLibraryRecentFirst([
    ...entries,
    { id, text, kind: input.kind, usedAt: now },
  ]);
  return {
    entries: Object.freeze(next.slice(0, STUDIO_AI_PROMPT_LIBRARY_CAP)),
    added: true,
  };
}

export function removePromptLibraryEntry(
  entries: readonly StudioAiPromptLibraryEntry[],
  entryId: string,
): readonly StudioAiPromptLibraryEntry[] {
  return Object.freeze(entries.filter((entry) => entry.id !== entryId));
}

export function touchPromptLibraryEntry(
  entries: readonly StudioAiPromptLibraryEntry[],
  entryId: string,
  now: number = Date.now(),
): readonly StudioAiPromptLibraryEntry[] {
  return sortLibraryRecentFirst(
    entries.map((entry) =>
      entry.id === entryId ? { ...entry, usedAt: now } : entry,
    ),
  );
}
