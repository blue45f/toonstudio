/**
 * 학습 진도·노트 소유자 스코프 회귀 테스트.
 *
 * 진도·노트 스토어가 모듈 전역 싱글턴이라 계정 구분 없이 한 키를 공유해,
 * 계정을 바꾸면 이전 계정의 진도와 메모가 그대로 보이던 혼선을 막는다.
 * 소유자 키잉·세션 bind 계약은 engagement 스토어와 같은 패턴이다.
 */

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { EMPTY_LESSON, STORAGE_KEY, type LearningProgress, type Lesson } from "./learning-model";
import { createLearningProgressStore, learningProgressStorageKey, observeLearningStorage } from "./learning-storage";

const lessons: Lesson[] = ["first", "second"].map((id) => ({
  id, title: id, summary: "fixture", track: "foundation", minutes: 1, lab: "layers", sections: [], task: "fixture",
  checks: ["첫 번째", "두 번째"], mistake: "fixture", quiz: { question: "fixture", options: ["a", "b", "c"], answer: 1, explanation: "fixture" }, terms: [], sources: [],
}));
const termIds = ["panel", "layer"];
const entry = (notes: string) => ({ ...EMPTY_LESSON, checks: [], notes });
const progressWith = (notes: string): LearningProgress => ({ version: 1, lessons: { first: entry(notes) }, bookmarks: [] });

function memory() {
  const values = new Map<string, string>();
  let denyWrite = false;
  const storage = {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { if (denyWrite) throw new Error("full"); values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
  return { storage, values, denyWrite: (value: boolean) => { denyWrite = value; } };
}

describe("학습 진도 소유자 스코프", () => {
  it("계정마다 진도·노트가 갈라져 저장된다", () => {
    const env = memory();
    const store = createLearningProgressStore(() => env.storage, lessons, termIds, "user-a");
    store.update(() => progressWith("a의 메모"));

    // 기록은 소유자 키에만 쌓이고, 레거시 키는 건드리지 않는다.
    assert.equal(JSON.parse(env.values.get(learningProgressStorageKey("user-a"))!).lessons.first.notes, "a의 메모");
    assert.equal(env.values.has(STORAGE_KEY), false);

    store.bindOwner("user-b");
    assert.deepEqual(store.getSnapshot().data.lessons, {});
    store.update(() => progressWith("b의 메모"));
    assert.equal(JSON.parse(env.values.get(learningProgressStorageKey("user-b"))!).lessons.first.notes, "b의 메모");
    assert.equal(JSON.parse(env.values.get(learningProgressStorageKey("user-a"))!).lessons.first.notes, "a의 메모");
  });

  it("소유자를 되돌리면 그 계정의 저장된 기록이 다시 보인다", () => {
    const env = memory();
    const store = createLearningProgressStore(() => env.storage, lessons, termIds, "user-a");
    store.update(() => progressWith("a의 메모"));

    store.bindOwner("user-b");
    assert.deepEqual(store.getSnapshot().data.lessons, {});
    store.bindOwner("user-a");
    assert.equal(store.getSnapshot().data.lessons.first.notes, "a의 메모");
    // 같은 소유자로의 bind는 기록을 흔들지 않는다.
    const revision = store.getSnapshot().revision;
    store.bindOwner("user-a");
    assert.equal(store.getSnapshot().revision, revision);
  });

  it("로그아웃하면 게스트 파티션으로 돌아가고 계정 기록과 섞이지 않는다", () => {
    const env = memory();
    const store = createLearningProgressStore(() => env.storage, lessons, termIds, "user-a");
    store.update(() => progressWith("a의 메모"));

    store.bindOwner(null);
    assert.equal(store.getOwnerKey(), "guest");
    assert.deepEqual(store.getSnapshot().data.lessons, {});
    store.update(() => progressWith("게스트 메모"));
    assert.equal(JSON.parse(env.values.get(learningProgressStorageKey("guest"))!).lessons.first.notes, "게스트 메모");

    store.bindOwner("user-a");
    assert.equal(store.getSnapshot().data.lessons.first.notes, "a의 메모");
  });

  it("레거시(무스코프) 기록은 첫 계정이 claim 하고 게스트에게는 보이지 않는다", () => {
    const env = memory();
    env.values.set(STORAGE_KEY, JSON.stringify(progressWith("레거시 메모")));

    // 게스트는 claim 하지 않는다 — 레거시는 그대로 남고 게스트 파티션은 비어 있다.
    const guest = createLearningProgressStore(() => env.storage, lessons, termIds, "guest");
    assert.deepEqual(guest.getSnapshot().data.lessons, {});
    assert.equal(env.values.has(STORAGE_KEY), true);

    // 첫 로그인 계정이 읽는 자리에서 claim 한다: 스코프 키로 옮기고 레거시를 지운다.
    const store = createLearningProgressStore(() => env.storage, lessons, termIds, "user-a");
    assert.equal(store.getSnapshot().data.lessons.first.notes, "레거시 메모");
    assert.equal(JSON.parse(env.values.get(learningProgressStorageKey("user-a"))!).lessons.first.notes, "레거시 메모");
    assert.equal(env.values.has(STORAGE_KEY), false);

    // claim은 레거시를 소비한다 — 다른 계정이 같은 기록을 또 가져가지 않는다.
    store.bindOwner("user-b");
    assert.deepEqual(store.getSnapshot().data.lessons, {});
  });

  it("소유자 전환 시 저장되지 못한 변경은 다음 소유자에게 넘어가지 않는다", () => {
    const env = memory();
    const store = createLearningProgressStore(() => env.storage, lessons, termIds, "user-a");
    env.denyWrite(true);
    assert.equal(store.update(() => progressWith("저장 실패한 메모")), false);
    assert.equal(store.getSnapshot().dirty, true);
    env.denyWrite(false);

    store.bindOwner("user-b");
    assert.equal(store.getSnapshot().dirty, false);
    assert.deepEqual(store.getSnapshot().data.lessons, {});
    // 실패한 기록은 어느 키에도 쓰이지 않았다.
    assert.equal(env.values.has(learningProgressStorageKey("user-b")), false);
  });

  it("스토리지 이벤트는 활성 소유자 키만 통과시킨다", () => {
    const env = memory();
    const store = createLearningProgressStore(() => env.storage, lessons, termIds, "user-a");
    let listener: ((event: Pick<StorageEvent, "key" | "storageArea">) => void) | undefined;
    const local = env.storage as unknown as Storage;
    const target = {
      addEventListener: (_: string, callback: typeof listener) => { listener = callback; },
      removeEventListener: (_: string, callback: typeof listener) => { assert.equal(callback, listener); listener = undefined; },
    } as unknown as Window;
    const stop = observeLearningStorage(target, () => env.storage, store.refresh, store.getStorageKey);

    // 다른 소유자 키·레거시 키의 변경은 이 스토어를 깨우지 않는다.
    env.values.set(learningProgressStorageKey("user-b"), JSON.stringify(progressWith("b")));
    listener!({ key: learningProgressStorageKey("user-b"), storageArea: local });
    listener!({ key: STORAGE_KEY, storageArea: local });
    assert.deepEqual(store.getSnapshot().data.lessons, {});

    env.values.set(learningProgressStorageKey("user-a"), JSON.stringify(progressWith("a 원격")));
    listener!({ key: learningProgressStorageKey("user-a"), storageArea: local });
    assert.equal(store.getSnapshot().data.lessons.first.notes, "a 원격");
    stop();
    assert.equal(listener, undefined);
  });
});
