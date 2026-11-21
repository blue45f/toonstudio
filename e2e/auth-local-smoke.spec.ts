import { expect, test } from "./fixtures/non-studio-test";

import type { Page } from "@playwright/test";

/**
 * 로컬 mock 세션 API 기반 인증 스모크 E2E (AC-014 · UX_FLOW_BACKLOG.md P3 · #227 §4).
 *
 * TOONSPECTRUM_MARKET_LIVE_E2E 없이 로컬 프로덕션 프리뷰(`vite preview`)에서 100% 실행·통과한다.
 * 검증 7대 시나리오:
 *   1) 게스트 3초 비차단(P1): /api/auth/session 5초+ 지연 및 503에서도 <= 3.5s 내 <main> 헤딩·게스트 CTA 노출
 *   2) 로그인 유도: 게스트 상태에서 로그인 트리거 클릭 시 인증 다이얼로그 열림·접근성 이름·포커스 이동
 *   3) 가입 입력 검증: mock POST /api/auth/signup 400 시 한글 인라인 오류(role="alert") 및 비인증 유지
 *   4) 로그인 성공·반영: mock POST /api/auth/login 200 + GET /api/auth/session authenticated 전환 및 reload() 유지
 *   5) 로그아웃·복귀: mock POST /api/auth/logout 200 후 인증 UI 해제 및 게스트/로그인 버튼 복귀
 *   6) 세션 만료(401) 안전 폴백: 401 SESSION_EXPIRED 수신 시 pageerror 0건 + 안전 복구 및 로컬 스튜디오 접근 유지
 *   7) 오프라인→온라인 재연결: setOffline(true) 중 무한 폴링 폭주 0건 및 온라인 복귀 재동기화
 */

interface MockAuthUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly image: null;
  readonly role: "creator";
}

const MOCK_USER: MockAuthUser = {
  id: "11111111-2222-4333-8444-555555555555",
  name: "테스트 작가",
  email: "smoke@example.com",
  image: null,
  role: "creator",
};

interface MockAuthController {
  authenticated: boolean;
  sessionMode: "normal" | "delay" | "503" | "expired-401";
  capabilitiesMode: "ready" | "503";
  sessionDelayMs: number;
  signupStatus: number;
  signupErrorMessage: string;
  sessionRequestCount: number;
  signupRequestCount: number;
  loginRequestCount: number;
  logoutRequestCount: number;
}

function createAuthController(
  overrides: Partial<MockAuthController> = {},
): MockAuthController {
  return {
    authenticated: false,
    sessionMode: "normal",
    capabilitiesMode: "ready",
    sessionDelayMs: 6_000,
    signupStatus: 400,
    signupErrorMessage: "이미 가입된 이메일이거나 비밀번호 조건을 확인해 주세요.",
    sessionRequestCount: 0,
    signupRequestCount: 0,
    loginRequestCount: 0,
    logoutRequestCount: 0,
    ...overrides,
  };
}

async function seedKoreanLocalEnvironment(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        "toonstudio-lang",
        JSON.stringify({ state: { lang: "ko" }, version: 0 }),
      );
      sessionStorage.setItem("toonstudio-compat-dismissed", "true");
    } catch {
      // 일부 초기 로드 문맥에서는 저장소 접근이 제한될 수 있다.
    }
  });
}

async function installMockAuthApi(
  page: Page,
  controller: MockAuthController,
): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;

    if (/\/api\/auth\/session$/u.test(pathname)) {
      controller.sessionRequestCount += 1;
      if (controller.sessionMode === "delay") {
        await new Promise((resolve) => setTimeout(resolve, controller.sessionDelayMs));
        await route
          .fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ authenticated: false, user: null }),
          })
          .catch(() => undefined);
        return;
      }
      if (controller.sessionMode === "503") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "AUTH_BACKEND_UNAVAILABLE" }),
        });
        return;
      }
      if (controller.sessionMode === "expired-401") {
        controller.authenticated = false;
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "SESSION_EXPIRED" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          controller.authenticated
            ? { authenticated: true, user: MOCK_USER }
            : { authenticated: false, user: null },
        ),
      });
      return;
    }

    if (/\/api\/auth\/providers$/u.test(pathname)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          email: { available: true, reason: "configured" },
        }),
      });
      return;
    }

    if (/\/api\/auth\/signup$/u.test(pathname) && req.method() === "POST") {
      controller.signupRequestCount += 1;
      await route.fulfill({
        status: controller.signupStatus,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: controller.signupErrorMessage,
        }),
      });
      return;
    }

    if (/\/api\/auth\/login$/u.test(pathname) && req.method() === "POST") {
      controller.loginRequestCount += 1;
      controller.authenticated = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          user: MOCK_USER,
        }),
      });
      return;
    }

    if (/\/api\/auth\/logout$/u.test(pathname) && req.method() === "POST") {
      controller.logoutRequestCount += 1;
      controller.authenticated = false;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (/\/api\/health\/capabilities$/u.test(pathname)) {
      if (controller.capabilitiesMode === "503") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ status: "unavailable" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "available",
          incidentId: null,
          retryAfterSeconds: null,
          checkedAt: new Date().toISOString(),
          capabilities: {
            publicCatalog: "available",
            authSession: "available",
            communityRead: "available",
            communityWrite: "available",
            marketplaceRead: "available",
            studioLocalEditing: "available",
            studioProjectRead: "available",
            studioCloudSave: "available",
            realtimeCollaboration: "available",
            publishing: "available",
            serverAi: "available",
          },
        }),
      });
      return;
    }

    if (/\/api\/messages\/unread-count$/u.test(pathname)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ total: 0 }),
      });
      return;
    }

    if (/\/api\/admin\/me$/u.test(pathname)) {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "FORBIDDEN" }),
      });
      return;
    }

    // 백엔드 미기동 로컬 환경과 동일하게 기타 API는 503으로 폴백시킨다.
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "LOCAL_MOCK_UNAVAILABLE" }),
    });
  });
}

function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("로컬 mock 세션 기반 인증 스모크 (7대 수락 기준)", () => {
  test.beforeEach(async ({ page }) => {
    await seedKoreanLocalEnvironment(page);
  });

  test("1) 게스트 3초 비차단(P1): /api/auth/session 5초+ 지연 및 503에서도 3.5초 내 <main> 헤딩과 게스트 CTA가 노출된다", async ({
    page,
  }) => {
    const pageErrors = trackPageErrors(page);
    const controller = createAuthController({
      sessionMode: "delay",
      capabilitiesMode: "503",
      sessionDelayMs: 6_000,
    });
    await installMockAuthApi(page, controller);

    // 1-a. /studio — 세션 6초 지연 상태에서 <= 3.5s 내 실제 본문 헤딩 + 게스트 CTA 노출
    const studioStart = Date.now();
    await page.goto("/studio", { waitUntil: "domcontentloaded" });
    const studioHeading = page.locator("#main-content h1, main h1").first();
    await expect(studioHeading).toBeVisible({ timeout: 3_500 });
    const studioHeadingText = (await studioHeading.innerText()).trim();
    expect(studioHeadingText.length).toBeGreaterThan(0);

    const studioGuestCta = page
      .locator('a[href*="/studio/new"], button[data-auth-trigger="signed-out"]')
      .first();
    await expect(studioGuestCta).toBeVisible({ timeout: 3_500 });
    expect(Date.now() - studioStart).toBeLessThanOrEqual(3_500);

    // 스켈레톤에 고착되지 않았음을 확인
    await expect(page.locator("#main-content")).not.toHaveAttribute("aria-busy", "true");

    // 1-b. /market — 세션 503 장애 상태에서도 <= 3.5s 내 실제 본문 헤딩 + 게스트 CTA 노출
    controller.sessionMode = "503";
    const marketStart = Date.now();
    await page.goto("/market", { waitUntil: "domcontentloaded" });
    const marketHeading = page.locator("#main-content h1, main h1").first();
    await expect(marketHeading).toBeVisible({ timeout: 3_500 });
    expect((await marketHeading.innerText()).trim().length).toBeGreaterThan(0);

    const marketGuestCta = page
      .locator('a[href*="/market/browse"], button[data-auth-trigger="signed-out"]')
      .first();
    await expect(marketGuestCta).toBeVisible({ timeout: 3_500 });
    expect(Date.now() - marketStart).toBeLessThanOrEqual(3_500);

    expect(pageErrors).toEqual([]);
  });

  test("2) 로그인 유도: 게스트 상태에서 로그인 트리거 클릭 시 인증 다이얼로그 열림·접근성 이름·포커스 이동이 동작한다", async ({
    page,
  }) => {
    const pageErrors = trackPageErrors(page);
    const controller = createAuthController();
    await installMockAuthApi(page, controller);

    await page.goto("/studio", { waitUntil: "domcontentloaded" });
    const loginTrigger = page.locator('button[data-auth-trigger="signed-out"]').first();
    await expect(loginTrigger).toBeVisible({ timeout: 15_000 });
    await expect(loginTrigger).toHaveAccessibleName(/로그인/u);

    await loginTrigger.click();

    const dialog = page.locator('[data-auth-modal="true"][role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAccessibleName(/다시 만나 반가워요|새 창작 여정을 시작해요/u);

    const emailInput = dialog.locator('input[name="email"]');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toBeFocused();

    // Escape로 닫으면 트리거로 포커스 복귀
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(loginTrigger).toBeFocused();
    expect(pageErrors).toEqual([]);
  });

  test("3) 가입 입력 검증: mock POST /api/auth/signup 400 시 한글 인라인 오류(role='alert')를 표시하고 비인증 상태를 유지한다", async ({
    page,
  }) => {
    const pageErrors = trackPageErrors(page);
    const controller = createAuthController({
      signupStatus: 400,
      signupErrorMessage: "이미 사용 중인 이메일이거나 가입 조건에 맞지 않아요.",
    });
    await installMockAuthApi(page, controller);

    await page.goto("/studio", { waitUntil: "domcontentloaded" });
    const loginTrigger = page.locator('button[data-auth-trigger="signed-out"]').first();
    await expect(loginTrigger).toBeVisible({ timeout: 15_000 });
    await loginTrigger.click();

    const dialog = page.locator('[data-auth-modal="true"][role="dialog"]');
    await expect(dialog).toBeVisible();

    await dialog.getByRole("tab", { name: "회원가입" }).click();
    await expect(dialog.locator('[data-auth-form="true"]')).toHaveAttribute(
      "data-auth-mode",
      "signup",
    );

    // 3-a. 클라이언트 1차 입력 검증: 짧은 비밀번호 -> role="alert" 한글 오류
    await dialog.locator('input[name="name"]').fill("검증작가");
    await dialog.locator('input[name="email"]').fill("smoke-invalid@example.com");
    await dialog.locator('input[name="password"]').fill("short123");
    await dialog.getByRole("button", { name: "가입하고 시작" }).click();

    const shortPasswordAlert = dialog.locator('[role="alert"]').filter({
      hasText: /15자 이상/u,
    });
    await expect(shortPasswordAlert).toBeVisible();
    expect(controller.signupRequestCount).toBe(0);

    // 3-b. 서버 mock POST /api/auth/signup 400 응답 -> 한글 인라인 role="alert" 노출 및 비인증 유지
    await dialog.locator('input[name="password"]').fill("ValidLengthPassword!2026");
    await dialog.getByRole("button", { name: "가입하고 시작" }).click();

    await expect.poll(() => controller.signupRequestCount).toBe(1);
    const serverAlert = dialog.locator('[role="alert"]').filter({
      hasText: "이미 사용 중인 이메일이거나 가입 조건에 맞지 않아요.",
    });
    await expect(serverAlert).toBeVisible();

    // 비인증 상태 유지 확인
    await expect(page.locator('button[data-auth-trigger="signed-in"]')).toHaveCount(0);
    const storedSession = await page.evaluate(() =>
      sessionStorage.getItem("toonstudio-auth-session"),
    );
    expect(storedSession).toBeNull();
    expect(pageErrors).toEqual([]);
  });

  test("4) 로그인 성공·반영: mock POST /api/auth/login 200 + GET /api/auth/session authenticated 전환 시 사용자 표시 및 reload() 유지", async ({
    page,
  }) => {
    const pageErrors = trackPageErrors(page);
    const controller = createAuthController();
    await installMockAuthApi(page, controller);

    await page.goto("/studio", { waitUntil: "domcontentloaded" });
    const loginTrigger = page.locator('button[data-auth-trigger="signed-out"]').first();
    await expect(loginTrigger).toBeVisible({ timeout: 15_000 });
    await loginTrigger.click();

    const dialog = page.locator('[data-auth-modal="true"][role="dialog"]');
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="email"]').fill(MOCK_USER.email);
    await dialog.locator('input[name="password"]').fill("SmokeLoginPassword!2026");
    await dialog.locator('form button[type="submit"]').click();

    await expect.poll(() => controller.loginRequestCount).toBe(1);
    await expect(dialog).toHaveCount(0);

    const accountTrigger = page.locator('button[data-auth-trigger="signed-in"]').first();
    await expect(accountTrigger).toBeVisible({ timeout: 10_000 });
    await accountTrigger.click();

    const accountMenu = page.getByRole("menu", { name: "계정 메뉴" });
    await expect(accountMenu).toBeVisible();
    await expect(accountMenu).toContainText(MOCK_USER.name);
    await expect(accountMenu).toContainText(MOCK_USER.email);

    // 페이지 새로고침 후에도 GET /api/auth/session(authenticated: true) 기반으로 인증 UI가 유지된다.
    await page.reload({ waitUntil: "domcontentloaded" });
    const accountTriggerAfterReload = page
      .locator('button[data-auth-trigger="signed-in"]')
      .first();
    await expect(accountTriggerAfterReload).toBeVisible({ timeout: 15_000 });
    await accountTriggerAfterReload.click();

    const menuAfterReload = page.getByRole("menu", { name: "계정 메뉴" });
    await expect(menuAfterReload).toBeVisible();
    await expect(menuAfterReload).toContainText(MOCK_USER.name);
    await expect(menuAfterReload).toContainText(MOCK_USER.email);
    expect(pageErrors).toEqual([]);
  });

  test("5) 로그아웃·복귀: mock POST /api/auth/logout 200 후 인증 UI 해제 및 게스트/로그인 버튼 복귀", async ({
    page,
  }) => {
    const pageErrors = trackPageErrors(page);
    const controller = createAuthController({ authenticated: true });
    await installMockAuthApi(page, controller);

    await page.goto("/studio", { waitUntil: "domcontentloaded" });
    const accountTrigger = page.locator('button[data-auth-trigger="signed-in"]').first();
    await expect(accountTrigger).toBeVisible({ timeout: 15_000 });

    await accountTrigger.click();
    const accountMenu = page.getByRole("menu", { name: "계정 메뉴" });
    await expect(accountMenu).toBeVisible();
    await expect(accountMenu).toContainText(MOCK_USER.name);

    await accountMenu.getByRole("menuitem", { name: /로그아웃/u }).click();

    await expect.poll(() => controller.logoutRequestCount).toBe(1);
    await expect(page.locator('button[data-auth-trigger="signed-in"]')).toHaveCount(0);
    await expect(
      page.locator('button[data-auth-trigger="signed-out"]').first(),
    ).toBeVisible({ timeout: 10_000 });

    // 새로고침 후에도 비인증(게스트) 상태 유지
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.locator('button[data-auth-trigger="signed-out"]').first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('button[data-auth-trigger="signed-in"]')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("6) 세션 만료(401) 안전 폴백: 401 SESSION_EXPIRED 수신 시 pageerror 0건 + 안전 복구 및 로컬 스튜디오 접근 유지", async ({
    page,
  }) => {
    const pageErrors = trackPageErrors(page);
    const controller = createAuthController({ authenticated: true });
    await installMockAuthApi(page, controller);

    await page.goto("/studio", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('button[data-auth-trigger="signed-in"]').first(),
    ).toBeVisible({ timeout: 15_000 });

    // 서버 세션이 만료되어 401 SESSION_EXPIRED를 반환하는 상황 재현
    controller.sessionMode = "expired-401";
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await expect(
      page.locator('button[data-auth-trigger="signed-out"]').first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('button[data-auth-trigger="signed-in"]')).toHaveCount(0);

    // 새로고침 이후에도 401 응답으로 크래시하지 않고 로컬 스튜디오 작업공간에 안전하게 접근 가능해야 한다.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.locator('button[data-auth-trigger="signed-out"]').first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#main-content h1, main h1").first()).toBeVisible();
    await expect(page.locator('a[href*="/studio/new"]').first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("7) 오프라인→온라인 재연결: setOffline(true) 중 무한 폴링 폭주 0건 및 온라인 복귀 재동기화가 동작한다", async ({
    context,
    page,
  }) => {
    const pageErrors = trackPageErrors(page);
    const controller = createAuthController({ authenticated: true });
    await installMockAuthApi(page, controller);

    await page.goto("/studio", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('button[data-auth-trigger="signed-in"]').first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#main-content h1, main h1").first()).toBeVisible({
      timeout: 15_000,
    });
    // 지연 로드 청크가 모두 도착한 뒤 오프라인 전환해야 lazyRetry 자동 reload와 경합하지 않는다.
    await page.waitForLoadState("networkidle");

    // 초기 동기화 완료 후 카운트 고정
    await expect.poll(() => controller.sessionRequestCount).toBeGreaterThanOrEqual(1);
    const countBeforeOffline = controller.sessionRequestCount;

    // 오프라인 전환 후 focus 이벤트를 발생시켜도 세션 요청 폭주가 0건이어야 한다.
    await context.setOffline(true);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await page.waitForTimeout(2_000);
    expect(controller.sessionRequestCount).toBe(countBeforeOffline);

    // 오프라인 중에도 마지막 확인 프로필 UI가 유지되고 오류가 발생하지 않는다.
    await expect(
      page.locator('button[data-auth-trigger="signed-in"]').first(),
    ).toBeVisible();

    // 온라인 복귀 시 유한 횟수(1~3회)로 재동기화된다.
    await context.setOffline(false);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("online"));
    });

    await expect
      .poll(() => controller.sessionRequestCount, { timeout: 10_000 })
      .toBeGreaterThan(countBeforeOffline);
    await page.waitForTimeout(1_000);
    expect(controller.sessionRequestCount - countBeforeOffline).toBeLessThanOrEqual(3);
    await expect(
      page.locator('button[data-auth-trigger="signed-in"]').first(),
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("회귀) /api/health/capabilities 503(warming) 상태에서도 /studio 헤더 인증 버튼이 데스크톱·태블릿·모바일에서 겹침 없이 클릭된다", async ({
    page,
  }) => {
    const pageErrors = trackPageErrors(page);
    const controller = createAuthController({
      authenticated: true,
      capabilitiesMode: "503",
    });
    await installMockAuthApi(page, controller);

    await page.goto("/studio", { waitUntil: "domcontentloaded" });
    const warmingBanner = page.locator(
      '[data-service-degraded-banner="warming"][data-service-status-placement="page-inline"]',
    );
    await expect(warmingBanner).toBeVisible({ timeout: 15_000 });
    await expect(warmingBanner.locator("button, a")).toHaveCount(0);

    for (const viewport of [
      { width: 1280, height: 720, label: "desktop" },
      { width: 768, height: 1024, label: "tablet" },
      { width: 390, height: 844, label: "mobile" },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const accountTrigger = page.locator('button[data-auth-trigger="signed-in"]:visible').first();
      await expect(accountTrigger, `${viewport.label} auth trigger visible`).toBeVisible({
        timeout: 10_000,
      });

      const geometry = await page.evaluate(() => {
        const notice = document.querySelector<HTMLElement>(
          '[data-service-degraded-banner="warming"][data-service-status-placement="page-inline"]',
        );
        const triggers = Array.from(
          document.querySelectorAll<HTMLButtonElement>('button[data-auth-trigger="signed-in"]'),
        ).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
        });
        const trigger = triggers[0];
        if (!notice || !trigger) return { ok: false };
        const nr = notice.getBoundingClientRect();
        const tr = trigger.getBoundingClientRect();
        const overlaps = !(
          nr.right <= tr.left ||
          tr.right <= nr.left ||
          nr.bottom <= tr.top ||
          tr.bottom <= nr.top
        );
        const cx = tr.left + tr.width / 2;
        const cy = tr.top + tr.height / 2;
        const topEl = document.elementFromPoint(cx, cy);
        const hitTrigger = Boolean(topEl && trigger.contains(topEl));
        return {
          ok: true,
          overlaps,
          hitTrigger,
          noticeHeight: nr.height,
          noticeBottom: nr.bottom,
          triggerTop: tr.top,
        };
      });

      expect(geometry.ok, `${viewport.label} elements present`).toBe(true);
      expect(geometry.noticeHeight, `${viewport.label} notice in-flow height > 0`).toBeGreaterThan(0);
      expect(geometry.overlaps, `${viewport.label} zero bounding-box overlap`).toBe(false);
      expect(geometry.hitTrigger, `${viewport.label} pointer hits auth trigger`).toBe(true);

      await accountTrigger.click();
      const accountMenu = page.getByRole("menu", { name: "계정 메뉴" });
      await expect(accountMenu, `${viewport.label} menu opens on click`).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(accountMenu).toHaveCount(0);
    }

    expect(pageErrors).toEqual([]);
  });
});
