import { describe, expect, it } from "vitest";

import { shouldShowEntryIntro } from "./entry-intro-policy";

/**
 * 진입 인트로 판정은 앱을 처음 그릴 때 주소 경로를 읽는다. 경로 끝 슬래시를 `/\/+$/u` 로 떼면 슬래시가 길게 이어진
 * 주소(누구나 만들어 보낼 수 있다)에서 시작점마다 그 열을 다시 읽어 입력 길이의 제곱 시간이 든다(CodeQL js/polynomial-redos).
 * 수정 전 구현에서 6만 칸 경로 하나가 1초 안팎이 걸렸고, 선형 시간이면 수 ms 안에 끝난다.
 */
const SLASH_RUN = "/".repeat(60_000);

describe("진입 인트로 판정의 경로 처리", () => {
  it("슬래시가 길게 이어진 경로에서도 제곱 시간이 되지 않는다", () => {
    const startedAt = performance.now();
    shouldShowEntryIntro(`/about${SLASH_RUN}x`);
    expect(performance.now() - startedAt, "소요(ms)").toBeLessThan(300);
  });

  it("끝 슬래시가 있어도 같은 판정을 한다", () => {
    expect(shouldShowEntryIntro("/team/")).toBe(false);
    expect(shouldShowEntryIntro("/home////")).toBe(false);
    expect(shouldShowEntryIntro("/onboarding/character//")).toBe(false);
    expect(shouldShowEntryIntro("/admin/users/")).toBe(false);
    expect(shouldShowEntryIntro("/about/")).toBe(true);
  });
});
