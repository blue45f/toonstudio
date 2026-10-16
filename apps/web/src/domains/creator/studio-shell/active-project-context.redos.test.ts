import { describe, expect, it } from "vitest";

import { activeProjectIdFromLocation } from "./active-project-context";

/**
 * 활성 원고 식별은 주소 경로에서 원고 ID 를 읽는다. 경로 끝 슬래시를 `/\/+$/u` 로 떼면 슬래시가 길게 이어진 주소에서
 * 입력 길이의 제곱 시간이 든다(CodeQL js/polynomial-redos). 수정 전 구현에서 6만 칸 경로 하나가 1초 안팎이 걸렸다.
 */
const SLASH_RUN = "/".repeat(60_000);

describe("활성 원고 식별의 경로 처리", () => {
  it("슬래시가 길게 이어진 경로에서도 제곱 시간이 되지 않는다", () => {
    const startedAt = performance.now();
    // 슬래시 열 앞의 첫 구간이 원고 ID 이므로 판정 결과는 수정 전과 같다.
    expect(activeProjectIdFromLocation(`/studio/p/project-1${SLASH_RUN}x`)).toBe("project-1");
    expect(performance.now() - startedAt, "소요(ms)").toBeLessThan(300);
  });

  it("끝 슬래시가 있어도 같은 원고를 찾는다", () => {
    expect(activeProjectIdFromLocation("/studio/p/project-1")).toBe("project-1");
    expect(activeProjectIdFromLocation("/studio/p/project-1///")).toBe("project-1");
    expect(activeProjectIdFromLocation("/production/projects/p-9/")).toBe("p-9");
    expect(activeProjectIdFromLocation("/about/", "?project=query-1")).toBe("query-1");
  });
});
