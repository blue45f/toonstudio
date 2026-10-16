import { describe, expect, it } from "vitest";

import { ENGINEERING_PAGES, engineeringPageForPath } from "./engineering-tech-pages";

/**
 * 기술 소개 페이지 찾기는 주소 경로를 읽는다. 경로 끝 슬래시를 `/\/+$/u` 로 떼면 슬래시가 길게 이어진 주소에서
 * 입력 길이의 제곱 시간이 든다(CodeQL js/polynomial-redos). 수정 전 구현에서 6만 칸 경로 하나가 1초 안팎이 걸렸다.
 */
const SLASH_RUN = "/".repeat(60_000);

describe("기술 소개 페이지 찾기의 경로 처리", () => {
  it("슬래시가 길게 이어진 경로에서도 제곱 시간이 되지 않는다", () => {
    const page = ENGINEERING_PAGES[0];
    expect(page).toBeDefined();
    const startedAt = performance.now();
    engineeringPageForPath(`${page?.href ?? "/technology"}${SLASH_RUN}x`);
    expect(performance.now() - startedAt, "소요(ms)").toBeLessThan(300);
  });

  it("끝 슬래시가 있어도 같은 페이지를 찾는다", () => {
    for (const page of ENGINEERING_PAGES.slice(0, 5)) {
      expect(engineeringPageForPath(page.href)?.href).toBe(page.href);
      expect(engineeringPageForPath(`${page.href}/`)?.href).toBe(page.href);
      expect(engineeringPageForPath(`${page.href}///`)?.href).toBe(page.href);
    }
  });
});
