/**
 * studio-ai-prompt-library-storage.ts — 프롬프트 라이브러리 저장소 (Studio 로컬 DB, SQLite/OPFS).
 *
 * 작가가 "현재 프롬프트 저장"으로 직접 고른 문장만 담는다. 생성 기록을 자동으로 쌓지 않으며, 자동으로
 * 남는 최근 프롬프트는 세션 한정이다(StudioCuttoonEditorHost 의 STUDIO_AI_RECENT_PROMPTS_KEY 정리).
 * 정본은 Studio 로컬 DB 의 행 하나다. 앱이 DB 를 소유하므로 이 어댑터는 파일을 따로 열지 않고, DB 를
 * 열지 못하면 예외를 그대로 돌려줘 호출부가 화면 안에서만 유지하게 한다(브라우저 KV 로 몰래 대체하지 않는다).
 *
 * 첫 출시 때 쓰던 localStorage 키는 한 번만 옮긴다. DB 에 쓸 만한 목록이 없을 때만 검증한 목록을 DB 에
 * 쓰고, 그 쓰기가 끝난 뒤에 브라우저 사본을 지운다. DB 목록이 이미 있으면 브라우저 사본만 지운다.
 * 손상된 저장값은 빈 목록으로 취급한다.
 */

import { STUDIO_AI_PROMPT_LIBRARY_CAP, type StudioAiPromptLibraryEntry } from "./studio-ai-prompt-library";

import type { StudioAsyncKeyValueStore } from "../studio-local-database";

export const STUDIO_AI_PROMPT_LIBRARY_SQLITE_NAMESPACE = "studio-ai-prompt-library-v1";
export const STUDIO_AI_PROMPT_LIBRARY_SQLITE_KEY = "entries";
/** 첫 출시(c6b6d869) 때 쓰던 브라우저 키. 옮긴 뒤 지우기만 하고 다시 쓰지 않는다. */
export const STUDIO_AI_PROMPT_LIBRARY_LEGACY_STORAGE_KEY = "toonstudio.ai.prompt-library.v1";
/** 100개 목록이 넉넉히 들어가는 길이. 이보다 긴 값은 손상으로 보고 읽지 않는다. */
const MAX_SERIALIZED_LENGTH = 500_000;

/** 예전 브라우저 사본을 옮길 때만 쓰는 최소 Web Storage 면. 쓰기(setItem)는 없다. */
export interface StudioAiPromptLibraryLegacyStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

export interface StudioAiPromptLibraryRepository {
  load(): Promise<readonly StudioAiPromptLibraryEntry[]>;
  save(entries: readonly StudioAiPromptLibraryEntry[]): Promise<void>;
}

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

/** 저장된 JSON 을 검증해 라이브러리 목록으로 복원한다. 손상 시 빈 목록이다. */
export function parsePromptLibraryEntries(raw: string | null): readonly StudioAiPromptLibraryEntry[] {
  if (!raw || raw.length > MAX_SERIALIZED_LENGTH) return Object.freeze([]);
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

export function serializePromptLibraryEntries(entries: readonly StudioAiPromptLibraryEntry[]): string {
  return JSON.stringify(entries.slice(0, STUDIO_AI_PROMPT_LIBRARY_CAP));
}

/**
 * DB 저장소 위의 라이브러리. 읽기·쓰기를 한 줄로 세워 앞선 쓰기가 나중 쓰기를 덮지 않게 한다.
 * legacyStorage 를 넘기면 첫 읽기(또는 첫 쓰기) 때 예전 브라우저 사본을 한 번 정리한다.
 */
export function createStudioAiPromptLibraryRepository(
  store: StudioAsyncKeyValueStore,
  legacyStorage: StudioAiPromptLibraryLegacyStorage | null = null,
): StudioAiPromptLibraryRepository {
  let tail: Promise<unknown> = Promise.resolve();
  let legacySettled = legacyStorage === null;

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work, work);
    tail = result.catch(() => undefined);
    return result;
  }

  async function readSettled(): Promise<readonly StudioAiPromptLibraryEntry[]> {
    const current = parsePromptLibraryEntries(await store.get(STUDIO_AI_PROMPT_LIBRARY_SQLITE_KEY));
    if (legacySettled || !legacyStorage) return current;
    let legacyRaw: string | null;
    try {
      legacyRaw = legacyStorage.getItem(STUDIO_AI_PROMPT_LIBRARY_LEGACY_STORAGE_KEY);
    } catch {
      legacySettled = true;
      return current;
    }
    let entries = current;
    if (legacyRaw !== null && current.length === 0) {
      const imported = parsePromptLibraryEntries(legacyRaw);
      if (imported.length > 0) {
        // 이 쓰기가 실패하면 브라우저 사본을 남겨 다음 읽기에서 다시 옮긴다.
        await store.set(STUDIO_AI_PROMPT_LIBRARY_SQLITE_KEY, serializePromptLibraryEntries(imported));
        entries = imported;
      }
    }
    if (legacyRaw !== null) {
      try {
        legacyStorage.removeItem(STUDIO_AI_PROMPT_LIBRARY_LEGACY_STORAGE_KEY);
      } catch {
        // 지우지 못해도 DB 가 정본이다. 다음 세션에서 다시 지운다.
      }
    }
    legacySettled = true;
    return entries;
  }

  return {
    load: () => enqueue(readSettled),
    save(entries) {
      const serialized = serializePromptLibraryEntries(entries);
      return enqueue(async () => {
        if (!legacySettled) await readSettled();
        await store.set(STUDIO_AI_PROMPT_LIBRARY_SQLITE_KEY, serialized);
      });
    },
  };
}

function browserLegacyStorage(): StudioAiPromptLibraryLegacyStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

let product: Promise<StudioAiPromptLibraryRepository> | null = null;

/** 앱이 소유한 Studio 로컬 DB 위의 라이브러리를 연다. 실패는 캐시하지 않아 다음에 다시 시도한다. */
export function acquireStudioAiPromptLibraryRepository(): Promise<StudioAiPromptLibraryRepository> {
  if (!product) {
    product = import("../studio-local-database-runtime")
      .then(async ({ acquireStudioLocalDatabase }) => {
        const database = await acquireStudioLocalDatabase();
        return createStudioAiPromptLibraryRepository(
          database.asAsyncKeyValueStore(STUDIO_AI_PROMPT_LIBRARY_SQLITE_NAMESPACE),
          browserLegacyStorage(),
        );
      })
      .catch((error: unknown) => {
        product = null;
        throw error;
      });
  }
  return product;
}
