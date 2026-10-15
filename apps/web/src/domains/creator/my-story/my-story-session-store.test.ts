import { describe, expect, it } from "vitest";

import { myStoryHasProgress } from "./my-story-interview";
import {
  clearMyStorySession,
  MY_STORY_SESSION_STORAGE_KEY,
  parseMyStorySession,
  readMyStorySession,
  serializeMyStorySession,
  writeMyStorySession,
  type MyStorySessionStorage,
} from "./my-story-session-store";
import { createMemoryStorage, fullSession } from "./my-story-test-fixture";

describe("내 이야기 임시저장", () => {
  it("저장한 세션을 같은 값으로 복원한다", () => {
    const storage = createMemoryStorage();
    const session = fullSession("family", { cutCount: 4 });
    expect(writeMyStorySession(storage, session)).toBe(true);
    expect(storage.entries.has(MY_STORY_SESSION_STORAGE_KEY)).toBe(true);
    const restored = readMyStorySession(storage);
    expect(restored).toEqual(session);
    expect(restored && myStoryHasProgress(restored)).toBe(true);
  });

  it("아무것도 저장하지 않았으면 null이다", () => {
    expect(readMyStorySession(createMemoryStorage())).toBeNull();
    expect(readMyStorySession(null)).toBeNull();
  });

  it("깨진 JSON·구버전·알 수 없는 주제는 조용히 버린다", () => {
    expect(parseMyStorySession("{not json")).toBeNull();
    expect(parseMyStorySession("[]")).toBeNull();
    expect(parseMyStorySession(JSON.stringify({ schemaVersion: 2, templateId: "family" }))).toBeNull();
    expect(parseMyStorySession(JSON.stringify({ schemaVersion: 1, templateId: "mystery" }))).toBeNull();
    expect(parseMyStorySession(JSON.stringify({ schemaVersion: 1 }))).toBeNull();
    expect(parseMyStorySession("")).toBeNull();
    expect(parseMyStorySession(undefined)).toBeNull();
  });

  it("저장본을 믿지 않는다 — 알려진 칸·범위·길이로만 복원한다", () => {
    const parsed = parseMyStorySession(JSON.stringify({
      schemaVersion: 1,
      stage: "weird",
      templateId: "neighborhood",
      step: 999,
      cutCount: 8,
      toneId: "clear-guide",
      title: "t".repeat(500),
      answers: { where: "골목", who: 42, hacked: "<script>", when: "가".repeat(900) },
      narrationOverrides: { where: "골목 어귀", message: "답이 없는 칸" },
      updatedAt: "not-a-date",
    }));
    expect(parsed).not.toBeNull();
    expect(parsed?.stage).toBe("ask");
    expect(parsed?.step).toBe(6);
    expect(parsed?.cutCount).toBe(4);
    expect(parsed?.toneId).toBe("friendly-neighbor");
    expect(Array.from(parsed?.title ?? "")).toHaveLength(80);
    expect(Object.keys(parsed?.answers ?? {}).sort()).toEqual(["when", "where"]);
    expect(Array.from(parsed?.answers.when ?? "")).toHaveLength(300);
    expect(parsed?.narrationOverrides).toEqual({ where: "골목 어귀" });
    expect(Number.isFinite(Date.parse(parsed?.updatedAt ?? ""))).toBe(true);
  });

  it("직렬화는 같은 입력에 같은 문자열을 만든다", () => {
    const session = fullSession("career");
    expect(serializeMyStorySession(session)).toBe(serializeMyStorySession(session));
  });

  it("저장소가 막혀 있어도(용량 초과·접근 차단) 예외 없이 실패를 값으로 알린다", () => {
    const blocked: MyStorySessionStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(readMyStorySession(blocked)).toBeNull();
    expect(writeMyStorySession(blocked, fullSession("family"))).toBe(false);
    expect(clearMyStorySession(blocked)).toBe(false);
    expect(writeMyStorySession(null, fullSession("family"))).toBe(false);
    expect(clearMyStorySession(null)).toBe(false);
  });

  it("지우면 다시 읽히지 않는다", () => {
    const storage = createMemoryStorage();
    writeMyStorySession(storage, fullSession("safety"));
    expect(clearMyStorySession(storage)).toBe(true);
    expect(readMyStorySession(storage)).toBeNull();
  });
});
