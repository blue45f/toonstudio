import { expect, test } from "./fixtures/non-studio-test";

import type { Page, Route } from "@playwright/test";

/**
 * 게스트 폴백 회복력 E2E — UX_FLOW_BACKLOG P1 고정용.
 *
 * 백엔드( /api/* )가 죽거나, 응답하지 않거나, 세션 확인보다 느릴 때도 공개 페이지는
 * "무한 로딩"에 빠지지 않고 게스트 상태로 렌더링돼야 한다. 이 계약의 근거는 셸 코드다.
 *
 * - 세션 확인: AbortSignal.timeout(5_000) 후 indeterminate → 게스트 폴백 + 백그라운드 재시도
 *   (domains/auth/public/session/auth-session-store.ts, auth-session.tsx)
 * - 능력 확인: timeout 5s / totalTimeout 10s / retry 0, 실패해도 배너 상태일 뿐 렌더링을 막지 않음
 *   (platform/service-capability-state.ts, app/AppShell.tsx의 Suspense fallback={null})
 * - 플랫폼 읽기: timeout 12s / totalTimeout 30s (platform/api.ts)
 * - apiFetch 기본 상한: 60s (platform/api.ts) — 그래서 "종단 상태" 데드라인은 75s로 둔다.
 *
 * 실행 레인: playwright.non-studio.config.ts (vite preview, 127.0.0.1:5209).
 * 실제 백엔드가 필요 없는 스펙이다 — 모든 /api/* 요청을 인터셉트해 장애를 재현한다.
 */

// 셸(헤더·본문)이 떠야 하는 상한. 세션 5s 타임아웃보다 넉넉하게 잡되, 과거 120s 행(hang)과는
// 비교가 안 되게 짧아야 한다.
const SHELL_DEADLINE_MS = 15_000;
// 페이지가 "콘텐츠 또는 오류/재시도 UI" 같은 종단 상태에 닿아야 하는 상한.
const TERMINAL_DEADLINE_MS = 75_000;

const PUBLIC_PATHS = ["/", "/market", "/market/browse", "/studio"] as const;

/** 모든 API 요청을 즉시 실패(연결 거부 상당)로 만든다. */
async function abortAllApi(page: Page): Promise<void> {
  await page.route("**/api/**", (route) => route.abort("connectionrefused"));
}

/** 모든 API 요청이 영원히 응답하지 않는 상태를 만든다(서버 행 재현). */
async function hangAllApi(page: Page): Promise<void> {
  await page.route("**/api/**", async () => {
    // 의도적으로 fulfill/abort 하지 않는다. 요청은 테스트 종료까지 매달린다.
    await new Promise<void>(() => {});
  });
}

/** 특정 경로만 느리게 응답시키고 나머지는 통과시킨다. */
async function delayApiPath(page: Page, pathFragment: string, delayMs: number): Promise<void> {
  await page.route("**/api/**", async (route: Route) => {
    const url = route.request().url();
    if (!url.includes(pathFragment)) {
      await route.continue();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    // 클라이언트가 이미 타임아웃으로 abort한 뒤에는 fulfill이 실패할 수 있다 — 장애 재현이 목적이라 무시한다.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: false, user: null }),
    }).catch(() => {});
  });
}

/** 앱 셸이 게스트로 떴는지: 헤더 크롬과 본문 랜드마크가 보이고, 건너뛰기 링크가 존재한다. */
async function expectGuestShell(page: Page): Promise<void> {
  await expect(page.locator('header[data-site-chrome="header"]')).toBeVisible({
    timeout: SHELL_DEADLINE_MS,
  });
  await expect(page.locator("#main-content")).toBeVisible({ timeout: SHELL_DEADLINE_MS });
  await expect(page.getByRole("link", { name: "본문으로 건너뛰기" })).toBeAttached();
}

/**
 * 페이지가 종단 상태에 닿았는지: 실제 콘텐츠가 있거나, 오류·재시도·지연 안내 중 하나가 보인다.
 * "아무것도 없는 스켈레톤이 영원히 도는 상태"만 실패로 본다.
 */
async function expectTerminalState(page: Page): Promise<void> {
  const main = page.locator("#main-content");
  await expect
    .poll(
      async () => {
        const text = (await main.innerText().catch(() => "")).trim();
        if (text.length >= 40) return "content";
        const signals = [
          /다시 시도/u,
          /연결을 기다리고 있어요/u,
          /화면을 불러오/u,
          /잠시 후 다시/u,
          /오프라인/u,
        ];
        return signals.some((pattern) => pattern.test(text)) ? "notice" : "";
      },
      { timeout: TERMINAL_DEADLINE_MS, intervals: [500, 1_000, 2_000, 5_000] },
    )
    .not.toBe("");
}

test.describe("백엔드 전면 장애 (모든 /api 즉시 실패)", () => {
  test.beforeEach(async ({ page }) => {
    await abortAllApi(page);
  });

  for (const path of PUBLIC_PATHS) {
    test(`${path} — 게스트 셸이 제한 시간 안에 렌더링된다`, async ({ page }) => {
      const startedAt = Date.now();
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expectGuestShell(page);
      expect(Date.now() - startedAt).toBeLessThan(SHELL_DEADLINE_MS + 5_000);
      await expectTerminalState(page);
    });
  }
});

test.describe("백엔드 무응답 (모든 /api 행)", () => {
  test.beforeEach(async ({ page }) => {
    await hangAllApi(page);
  });

  test("/market — 셸은 세션 타임아웃에 묶이지 않고 뜬다", async ({ page }) => {
    await page.goto("/market", { waitUntil: "domcontentloaded" });
    await expectGuestShell(page);
  });

  test("/ — 무한 로딩에 빠지지 않고 종단 상태에 닿는다", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expectGuestShell(page);
    await expectTerminalState(page);
  });
});

test.describe("세션 확인만 느린 경우 (20초 지연 > 클라이언트 5초 상한)", () => {
  test("게스트로 먼저 렌더링되고, 늦은 세션 응답이 화면을 되돌리지 않는다", async ({ page }) => {
    await delayApiPath(page, "/api/auth/session", 20_000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expectGuestShell(page);
    // 세션 확인이 indeterminate로 수렴한 뒤에도 셸이 유지되는지(깜빡임·차단 없음) 확인한다.
    await page.waitForTimeout(6_000);
    await expect(page.locator('header[data-site-chrome="header"]')).toBeVisible();
    await expectTerminalState(page);
  });
});
