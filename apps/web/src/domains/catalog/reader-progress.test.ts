// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getReaderProgress,
  isResumable,
  setReaderProgress,
} from "./reader-progress";

const auth = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => auth.userId,
}));

beforeEach(() => {
  window.localStorage.clear();
  auth.userId = null;
});

describe("reader-progress — 읽던 위치 로컬 기록", () => {
  it("저장한 진도를 그대로 돌려준다", () => {
    setReaderProgress("some-title", 12, 0.42);
    const progress = getReaderProgress("some-title");
    expect(progress?.episode).toBe(12);
    expect(progress?.ratio).toBeCloseTo(0.42);
    expect(typeof progress?.updatedAt).toBe("number");
  });

  it("없는 작품은 null이다", () => {
    expect(getReaderProgress("never-read")).toBeNull();
  });

  it("비율은 0~1로 정규화하고 잘못된 회차는 저장하지 않는다", () => {
    setReaderProgress("clamp", 3, 1.7);
    expect(getReaderProgress("clamp")?.ratio).toBe(1);
    setReaderProgress("bad-episode", 0, 0.5);
    expect(getReaderProgress("bad-episode")).toBeNull();
    setReaderProgress("bad-ratio", 2, Number.NaN);
    expect(getReaderProgress("bad-ratio")).toBeNull();
  });

  it("계정이 바뀌면 이전 계정의 진도가 보이지 않는다 (소유자 파티션)", () => {
    auth.userId = "user-a";
    setReaderProgress("shared-title", 7, 0.5);
    auth.userId = "user-b";
    expect(getReaderProgress("shared-title")).toBeNull();
    auth.userId = "user-a";
    expect(getReaderProgress("shared-title")?.episode).toBe(7);
    auth.userId = null;
    expect(getReaderProgress("shared-title")).toBeNull();
  });

  it("저장값이 깨져 있어도 예외 없이 빈 기록으로 취급한다", () => {
    window.localStorage.setItem("toonstudio.reader-progress.v1.guest", "{broken");
    expect(getReaderProgress("any")).toBeNull();
    window.localStorage.setItem(
      "toonstudio.reader-progress.v1.guest",
      JSON.stringify({ any: { episode: "x", ratio: 0.5, updatedAt: 1 } }),
    );
    expect(getReaderProgress("any")).toBeNull();
  });

  it("이어보기 제안 범위는 시작 직후와 완독 직전을 제외한다", () => {
    const at = (ratio: number) => ({ episode: 1, ratio, updatedAt: 0 });
    expect(isResumable(null)).toBe(false);
    expect(isResumable(at(0.01))).toBe(false);
    expect(isResumable(at(0.5))).toBe(true);
    expect(isResumable(at(0.99))).toBe(false);
  });
});
