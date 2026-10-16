import { describe, expect, it } from "vitest";

import {
  READER_FEEDBACK_HIDDEN_KEY,
  READER_FEEDBACK_HIDDEN_MAX,
  loadHiddenResponseIds,
  saveHiddenResponseIds,
  toggleHiddenResponseId,
} from "./reader-feedback-hidden";

function memory(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
  };
}

describe("숨긴 의견 표시(이 브라우저에만)", () => {
  it("저장소가 없거나 비었거나 읽을 수 없으면 숨김 없이 시작한다", () => {
    expect(loadHiddenResponseIds(null).size).toBe(0);
    expect(loadHiddenResponseIds(undefined).size).toBe(0);
    expect(loadHiddenResponseIds(memory()).size).toBe(0);
    expect(loadHiddenResponseIds({ getItem: () => { throw new Error("SecurityError"); } }).size).toBe(0);
  });

  it("깨졌거나 형식이 다르거나 너무 큰 값은 무시한다", () => {
    const load = (raw: string) => loadHiddenResponseIds(memory({ [READER_FEEDBACK_HIDDEN_KEY]: raw })).size;
    expect(load("{ 깨짐")).toBe(0);
    expect(load(JSON.stringify({ version: 2, ids: ["a"] }))).toBe(0);
    expect(load(JSON.stringify({ version: 1, ids: ["a b"] }))).toBe(0);
    expect(load(JSON.stringify({ version: 1, ids: [1] }))).toBe(0);
    expect(load(JSON.stringify({ version: 1, ids: ["a"], extra: 1 }))).toBe(0);
    expect(load(JSON.stringify({ version: 1, ids: Array.from({ length: READER_FEEDBACK_HIDDEN_MAX + 1 }, (_, index) => `id-${index}`) }))).toBe(0);
    expect(load(`{"version":1,"ids":["${"a".repeat(130_000)}"]}`)).toBe(0);
    expect(load(JSON.stringify({ version: 1, ids: ["__proto__"] }))).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("저장한 값을 그대로 다시 읽는다", () => {
    const storage = memory();
    expect(saveHiddenResponseIds(storage, new Set(["a", "b"]))).toBe(true);
    expect(JSON.parse(storage.store.get(READER_FEEDBACK_HIDDEN_KEY) ?? "null")).toEqual({ version: 1, ids: ["a", "b"] });
    expect([...loadHiddenResponseIds(storage)]).toEqual(["a", "b"]);
  });

  it("저장하지 못하면 false 를 돌려주고 예외를 던지지 않는다", () => {
    expect(saveHiddenResponseIds(null, new Set(["a"]))).toBe(false);
    expect(saveHiddenResponseIds({ setItem: () => { throw new Error("QuotaExceededError"); } }, new Set(["a"]))).toBe(false);
  });

  it("상한을 넘으면 오래 전에 숨긴 것부터 잊는다", () => {
    const storage = memory();
    const ids = new Set(Array.from({ length: READER_FEEDBACK_HIDDEN_MAX + 5 }, (_, index) => `id-${index}`));
    expect(saveHiddenResponseIds(storage, ids)).toBe(true);
    const loaded = [...loadHiddenResponseIds(storage)];
    expect(loaded).toHaveLength(READER_FEEDBACK_HIDDEN_MAX);
    expect(loaded[0]).toBe("id-5");
    expect(loaded.at(-1)).toBe(`id-${READER_FEEDBACK_HIDDEN_MAX + 4}`);
  });

  it("켜고 끄기는 새 집합을 돌려주고 원래 집합을 바꾸지 않는다", () => {
    const original = new Set(["a"]);
    const added = toggleHiddenResponseId(original, "b");
    expect([...added]).toEqual(["a", "b"]);
    expect([...original]).toEqual(["a"]);
    expect([...toggleHiddenResponseId(added, "a")]).toEqual(["b"]);
  });
});
