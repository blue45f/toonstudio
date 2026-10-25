/**
 * studio-ai-context-note-storage.ts — 맥락 노트 Web Storage 어댑터 (fetch 없음).
 *
 * 맥락 노트(studio-ai-context-note.ts)는 저장소가 없었다. 이 어댑터는
 * 작품 메타데이터 전용 서버 경로가 정해지기 전까지, 프롬프트 라이브러리
 * 저장소와 같은 Web Storage 패턴으로 작품별 노트를 로컬에 보관한다.
 * 저장값은 작품 id → 노트 맵 1개이며, 손상 시 빈 맵으로 취급한다.
 * 서버 작품 메타데이터 경로가 정해지면 이 어댑터만 교체하면 된다.
 */

import type { StudioAiContextNote } from "./studio-ai-context-note";
import { createContextNote } from "./studio-ai-context-note";

export interface StudioAiContextNoteStore {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

export const STUDIO_AI_CONTEXT_NOTE_STORAGE_KEY =
  "toonstudio.ai.context-note.v1";

function isNoteRecord(value: unknown): value is StudioAiContextNote {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.workId === "string" &&
    Array.isArray(record.characterRules) &&
    Array.isArray(record.palette) &&
    Array.isArray(record.backgroundRules) &&
    Array.isArray(record.prohibitions) &&
    typeof record.updatedAt === "number"
  );
}

function loadNoteMap(
  store: StudioAiContextNoteStore,
): Record<string, StudioAiContextNote> {
  try {
    const raw = store.getItem(STUDIO_AI_CONTEXT_NOTE_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const map: Record<string, StudioAiContextNote> = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (isNoteRecord(value)) map[key] = value;
    }
    return map;
  } catch {
    return {};
  }
}

/** 저장된 노트를 읽는다. 없으면 빈 노트를 돌려준다 (저장은 하지 않는다). */
export function loadContextNote(
  store: StudioAiContextNoteStore,
  workId: string,
): StudioAiContextNote {
  return loadNoteMap(store)[workId] ?? createContextNote(workId);
}

/** 노트 1건을 저장한다. 실패 시 false를 돌려주고 예외를 던지지 않는다. */
export function saveContextNote(
  store: StudioAiContextNoteStore,
  note: StudioAiContextNote,
): boolean {
  try {
    const map = loadNoteMap(store);
    map[note.workId] = note;
    store.setItem(
      STUDIO_AI_CONTEXT_NOTE_STORAGE_KEY,
      JSON.stringify(map),
    );
    return true;
  } catch {
    return false;
  }
}
