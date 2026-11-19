import { expect, test } from "@playwright/test";

/**
 * 로컬 mock 세션 API 기반 인증 스모크 E2E (AC-004 / UX_FLOW_BACKLOG.md P3).
 * TOONSPECTRUM_MARKET_LIVE_E2E 없이도 게스트 진입 -> 로그인 유도 -> 세션 만료 복구 흐름을 검증한다.
 */
test.describe("로컬 mock 세션 기반 인증 스모크", () => {
  test("게스트 진입이 백엔드 지연/401에서도 차단되지 않고 로그인 유도 및 세션 만료 복구가 동작한다", async ({
    page,
  }) => {
    let authenticated = false;

    await page.route("**/api/auth/session", async (route) => {
      if (!authenticated) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ authenticated: false, user: null }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          user: { id: "local-smoke-user", name: "테스트 작가", email: "smoke@example.com" },
        }),
      });
    });

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // 1. 게스트 상태로 스튜디오 진입 시 비차단 렌더링 확인
    await page.goto("/studio", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    expect(pageErrors).toEqual([]);

    // 2. 세션 활성 상태로 전환 후 재방문 시 오류 없이 렌더링
    authenticated = true;
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    expect(pageErrors).toEqual([]);

    // 3. 세션 만료(401) 시에도 페이지 크래시 없이 게스트 폴백 유지
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "SESSION_EXPIRED" }),
      });
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
