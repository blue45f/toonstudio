import { describe, expect, it, vi } from "vitest";

import { STUDIO_AI_PROMPT_LIBRARY_CAP, type StudioAiPromptLibraryEntry } from "./studio-ai-prompt-library";
import {
  createStudioAiPromptLibraryRepository,
  parsePromptLibraryEntries,
  STUDIO_AI_PROMPT_LIBRARY_LEGACY_STORAGE_KEY,
  STUDIO_AI_PROMPT_LIBRARY_SQLITE_KEY,
} from "./studio-ai-prompt-library-storage";

import type { StudioAsyncKeyValueStore } from "../studio-local-database";

function memoryKv(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store: StudioAsyncKeyValueStore & { readonly data: Map<string, string> } = {
    data,
    get: vi.fn(async (key: string) => data.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      data.delete(key);
    }),
  };
  return store;
}

function memoryLegacy(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { resolve, promise };
}

const entry = (id: string, usedAt = 10): StudioAiPromptLibraryEntry => ({
  id,
  text: `프롬프트 ${id}`,
  kind: "prompt",
  usedAt,
});

describe("studio-ai-prompt-library-storage", () => {
  it("저장한 목록을 DB 행 하나로 저장하고 그대로 불러온다", async () => {
    const store = memoryKv();
    const repository = createStudioAiPromptLibraryRepository(store);
    await repository.save([entry("a"), entry("b")]);
    expect(store.set).toHaveBeenCalledTimes(1);
    expect(vi.mocked(store.set).mock.calls[0]?.[0]).toBe(STUDIO_AI_PROMPT_LIBRARY_SQLITE_KEY);
    expect(await repository.load()).toEqual([entry("a"), entry("b")]);
  });

  it("손상되거나 너무 긴 저장값은 빈 목록으로 취급한다", async () => {
    expect(parsePromptLibraryEntries(null)).toEqual([]);
    expect(parsePromptLibraryEntries("깨진{")).toEqual([]);
    expect(parsePromptLibraryEntries(JSON.stringify({ id: "a" }))).toEqual([]);
    expect(parsePromptLibraryEntries(JSON.stringify([{ id: 1 }, { ...entry("b"), kind: "mystery" }]))).toEqual([]);
    // 형식은 맞지만 상한보다 긴 값: 길이 검사가 없으면 한 항목으로 읽혔을 값이다.
    expect(parsePromptLibraryEntries(JSON.stringify([{ ...entry("big"), text: "가".repeat(500_000) }]))).toEqual([]);
    const repository = createStudioAiPromptLibraryRepository(memoryKv({ [STUDIO_AI_PROMPT_LIBRARY_SQLITE_KEY]: "깨진{" }));
    expect(await repository.load()).toEqual([]);
  });

  it(`${STUDIO_AI_PROMPT_LIBRARY_CAP}개 상한으로 잘라 저장하고 읽는다`, async () => {
    const store = memoryKv();
    const repository = createStudioAiPromptLibraryRepository(store);
    const many = Array.from({ length: STUDIO_AI_PROMPT_LIBRARY_CAP + 5 }, (_, index) => entry(`e${index}`));
    await repository.save(many);
    expect(JSON.parse(store.data.get(STUDIO_AI_PROMPT_LIBRARY_SQLITE_KEY) ?? "[]")).toHaveLength(STUDIO_AI_PROMPT_LIBRARY_CAP);
    expect(await repository.load()).toHaveLength(STUDIO_AI_PROMPT_LIBRARY_CAP);
  });

  it("첫 출시 때의 브라우저 사본을 DB 로 한 번 옮기고 지운다", async () => {
    const store = memoryKv();
    const legacy = memoryLegacy({ [STUDIO_AI_PROMPT_LIBRARY_LEGACY_STORAGE_KEY]: JSON.stringify([entry("old")]) });
    const repository = createStudioAiPromptLibraryRepository(store, legacy);
    expect(await repository.load()).toEqual([entry("old")]);
    expect(JSON.parse(store.data.get(STUDIO_AI_PROMPT_LIBRARY_SQLITE_KEY) ?? "[]")).toEqual([entry("old")]);
    expect(legacy.data.has(STUDIO_AI_PROMPT_LIBRARY_LEGACY_STORAGE_KEY)).toBe(false);
    await repository.load();
    expect(legacy.getItem).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledTimes(1);
  });

  it("DB 목록이 이미 있으면 브라우저 사본을 덮어쓰지 않고 지우기만 한다", async () => {
    const store = memoryKv({ [STUDIO_AI_PROMPT_LIBRARY_SQLITE_KEY]: JSON.stringify([entry("db")]) });
    const legacy = memoryLegacy({ [STUDIO_AI_PROMPT_LIBRARY_LEGACY_STORAGE_KEY]: JSON.stringify([entry("old")]) });
    const repository = createStudioAiPromptLibraryRepository(store, legacy);
    expect(await repository.load()).toEqual([entry("db")]);
    expect(store.set).not.toHaveBeenCalled();
    expect(legacy.removeItem).toHaveBeenCalledWith(STUDIO_AI_PROMPT_LIBRARY_LEGACY_STORAGE_KEY);
  });

  it("DB 쓰기가 실패하면 브라우저 사본을 남겨 다음 읽기에서 다시 옮긴다", async () => {
    const store = memoryKv();
    vi.mocked(store.set).mockRejectedValueOnce(new Error("quota"));
    const legacy = memoryLegacy({ [STUDIO_AI_PROMPT_LIBRARY_LEGACY_STORAGE_KEY]: JSON.stringify([entry("old")]) });
    const repository = createStudioAiPromptLibraryRepository(store, legacy);
    await expect(repository.load()).rejects.toThrow("quota");
    expect(legacy.data.has(STUDIO_AI_PROMPT_LIBRARY_LEGACY_STORAGE_KEY)).toBe(true);
    expect(await repository.load()).toEqual([entry("old")]);
    expect(legacy.data.has(STUDIO_AI_PROMPT_LIBRARY_LEGACY_STORAGE_KEY)).toBe(false);
  });

  it("읽기 전 저장도 브라우저 사본을 먼저 정리한 뒤 새 목록을 쓴다", async () => {
    const store = memoryKv();
    const legacy = memoryLegacy({ [STUDIO_AI_PROMPT_LIBRARY_LEGACY_STORAGE_KEY]: JSON.stringify([entry("old")]) });
    const repository = createStudioAiPromptLibraryRepository(store, legacy);
    await repository.save([entry("new")]);
    expect(legacy.data.has(STUDIO_AI_PROMPT_LIBRARY_LEGACY_STORAGE_KEY)).toBe(false);
    expect(await repository.load()).toEqual([entry("new")]);
  });

  it("저장을 순서대로 처리해 앞선 쓰기가 나중 쓰기를 덮지 않는다", async () => {
    const store = memoryKv();
    const firstWrite = deferred<void>();
    vi.mocked(store.set).mockImplementationOnce(async (key, value) => {
      await firstWrite.promise;
      store.data.set(key, value);
    });
    const repository = createStudioAiPromptLibraryRepository(store);
    const first = repository.save([entry("first")]);
    const second = repository.save([entry("second")]);
    firstWrite.resolve();
    await Promise.all([first, second]);
    expect(await repository.load()).toEqual([entry("second")]);
  });
});
