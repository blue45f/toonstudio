import { expect, test } from "@playwright/test";

/**
 * 로컬 풀스택 인증 브라우저 스모크: 로그인 UI → 로그인 상태 표시 → 로그아웃.
 *
 * 기본 CI 에서는 실행되지 않는다. TOONSTUDIO_LOCAL_FULLSTACK_E2E=1 이 아니면 전체가 skip 된다.
 * 실행: `node scripts/local-fullstack/cli.mjs e2e` (로컬 스택이 떠 있어야 하며, 자격증명은 이 명령이
 * .env.infrastructure.local 에서 읽어 환경변수로만 주입한다).
 *
 * 로그인 자격증명을 입력하는 스펙이므로 웹 origin 이 loopback 이 아니면 입력 전에 즉시 실패한다.
 * 이메일·비밀번호 값은 단언 메시지에 싣지 않는다(불리언만 비교).
 */

const LOCAL_STACK_ENABLED = process.env.TOONSTUDIO_LOCAL_FULLSTACK_E2E === "1";
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다. 'node scripts/local-fullstack/cli.mjs e2e' 로 실행하세요.`);
  }
  return value;
}

function assertLoopbackOrigin(rawOrigin) {
  const url = new URL(rawOrigin);
  if (url.protocol !== "http:" || !LOOPBACK_HOSTNAMES.has(url.hostname)) {
    throw new Error(`로컬 하네스 전용 스펙입니다. 웹 origin 이 loopback 이 아닙니다(${url.hostname}).`);
  }
  return url.origin;
}

test.describe("로컬 풀스택 인증 브라우저 스모크", () => {
  test.skip(
    !LOCAL_STACK_ENABLED,
    "로컬 풀스택 전용입니다. 'node scripts/local-fullstack/cli.mjs e2e' 로만 실행합니다(기본 CI 에서는 실행하지 않음).",
  );

  test("로그인 UI → 로그인 상태 표시 → 로그아웃", async ({ page }) => {
    const webOrigin = assertLoopbackOrigin(requiredEnvironment("TOONSTUDIO_LOCAL_WEB_ORIGIN"));
    const email = requiredEnvironment("TOONSTUDIO_LOCAL_TEST_EMAIL");
    const password = requiredEnvironment("TOONSTUDIO_LOCAL_TEST_PASSWORD");

    // 1) 로그인 화면(이메일 가입은 꺼져 있어도 기존 계정 로그인 폼은 보인다).
    await page.goto(`${webOrigin}/auth/login`, { waitUntil: "domcontentloaded" });
    const form = page.locator('[data-auth-form="true"]');
    await expect(form).toBeVisible({ timeout: 180_000 });

    // 2) 시드 계정으로 로그인.
    await form.locator('input[type="email"]').fill(email);
    await form.locator('input[autocomplete="current-password"]').fill(password);
    await form.locator('button[type="submit"]').click();

    // 3) 로그인 상태 표시: 로그인 페이지가 "이미 로그인되어 있어요" 상태로 바뀐다.
    await expect(
      page.getByRole("heading", { name: /이미 로그인되어 있어요|already signed in/iu }),
    ).toBeVisible({ timeout: 120_000 });

    // 4) 브라우저 쿠키로 서버 세션이 시드 사용자임을 확인(프록시 경유).
    const signedIn = await page.request.get(`${webOrigin}/api/auth/session`);
    expect(signedIn.ok()).toBe(true);
    const signedInBody = await signedIn.json();
    expect(signedInBody.authenticated).toBe(true);
    expect(signedInBody.user?.email === email).toBe(true);
    expect(signedInBody.user?.role).toBe("user");

    // 5) 다른 화면의 헤더에도 로그인 상태가 유지되어 계정 메뉴가 보인다.
    await page.goto(`${webOrigin}/help`, { waitUntil: "domcontentloaded" });
    const accountMenu = page.getByRole("button", { name: /계정 메뉴|account menu/iu });
    await expect(accountMenu).toBeVisible({ timeout: 120_000 });

    // 6) 로그아웃.
    await accountMenu.click();
    const signOut = page.getByRole("menuitem", { name: /로그아웃|sign out|log out/iu });
    await expect(signOut).toBeVisible();
    await signOut.click();

    // 7) 로그아웃 상태 표시와 서버 측 세션 폐기.
    await expect(page.getByRole("button", { name: /^(로그인|log ?in|sign ?in)$/iu }).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(accountMenu).toHaveCount(0);
    const signedOut = await page.request.get(`${webOrigin}/api/auth/session`);
    expect(signedOut.ok()).toBe(true);
    expect(await signedOut.json()).toEqual({ authenticated: false, user: null });
  });
});
