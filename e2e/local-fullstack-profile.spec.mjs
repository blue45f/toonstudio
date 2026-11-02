import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";
import { waitForAuditRouteReadiness } from "../scripts/lib/sitewide-visual-ux-audit.mjs";

// 실제 로컬 PostgreSQL/API에만 쓰며, 의도적인 장애 요청만 별도로 모의한다.
const enabled = process.env.TOONSTUDIO_LOCAL_FULLSTACK_E2E === "1";
function origin() {
  const url = new URL(process.env.TOONSTUDIO_LOCAL_WEB_ORIGIN ?? "http://invalid");
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || !url.port || url.username || url.password) {
    throw new Error("프로필 검증은 명시적 포트를 가진 격리 로컬 웹에서만 실행합니다.");
  }
  return url.origin;
}
const mutationHeaders = () => ({ Origin: origin(), "x-toonstudio-csrf": "1" });
// 첫 UI 로그인으로 받은 쿠키는 실행 메모리에만 재사용한다. 인증 제한을 낮추거나 파일에 저장하지 않는다.
let sharedCookies = [];
async function login(page) {
  if (sharedCookies.length) {
    await page.context().addCookies(sharedCookies);
    const response = await page.request.get(`${origin()}/api/auth/session`);
    if (response.ok() && (await response.json()).authenticated === true) return;
    sharedCookies = [];
  }
  const email = process.env.TOONSTUDIO_LOCAL_TEST_EMAIL;
  const password = process.env.TOONSTUDIO_LOCAL_TEST_PASSWORD;
  if (!email || !password) throw new Error("로컬 풀스택 CLI의 테스트 자격증명이 필요합니다.");
  await page.goto(`${origin()}/auth/login`, { waitUntil: "domcontentloaded" });
  const form = page.locator('[data-auth-form="true"]');
  await expect(form).toBeVisible();
  await form.locator('input[type="email"]').fill(email);
  await form.locator('input[autocomplete="current-password"]').fill(password);
  await form.locator('button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: /이미 로그인되어 있어요|already signed in/iu })).toBeVisible();
  const response = await page.request.get(`${origin()}/api/auth/session`);
  expect(response.ok()).toBe(true);
  expect((await response.json()).authenticated).toBe(true);
  sharedCookies = await page.context().cookies(origin());
}
async function readProfile(page) {
  const response = await page.request.get(`${origin()}/api/me`);
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(Boolean(body.profile?.id)).toBe(true);
  return body.profile;
}
async function restoreProfile(page, original) {
  const response = await page.request.patch(`${origin()}/api/me/profile`, {
    headers: mutationHeaders(), data: { name: original.name, bio: original.bio ?? "", image: original.image, creatorRoleProfile: original.creatorRoleProfile },
  });
  expect(response.ok(), "검증용 프로필 원상복구").toBe(true);
}
async function openProfile(page) {
  await page.goto(`${origin()}/me?tab=profile`, { waitUntil: "domcontentloaded" });
  const form = page.getByRole("form", { name: "공개 프로필 편집", exact: true });
  await expect(form).toBeVisible();
  // 페이드가 끝날 때까지 기다려 통과시키지 않고 첫 작업 가능 시점에 가림이 없는지 확인한다.
  expect(await page.locator('div[data-phase="show"], div[data-phase="fade"]').filter({
    has: page.locator('img[src*="hero-main-intro"]'),
  }).count()).toBe(0);
  await expect(form.locator("#profile-name")).toBeEnabled();
  return form;
}

test.describe("로컬 실계정 프로필 저장과 장애 복구", () => {
  test.skip(!enabled, "node scripts/local-fullstack/cli.mjs e2e 로 격리 DB에서 실행합니다.");
  test.describe.configure({ mode: "serial" });
  for (const width of [390, 1440]) {
    test(`${width}px: 탭 왕복·키보드 저장·새로고침 뒤 실제 서버 값 유지`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page);
      const original = await readProfile(page);
      try {
        const form = await openProfile(page);
        await form.locator("#profile-name").fill(`프로필 검증 ${width}`);
        await form.locator("#profile-bio").fill("탭을 이동해도 남아야 하는 작성 중 소개");
        await page.getByRole("tab", { name: "내 게시물", exact: true }).click();
        await expect(form).toBeHidden();
        await page.getByRole("tab", { name: "프로필", exact: true }).click();
        await expect(form.locator("#profile-bio")).toHaveValue("탭을 이동해도 남아야 하는 작성 중 소개");
        await form.locator("#profile-name").press("Enter");
        await expect(form.getByRole("status")).toHaveText("프로필을 저장했어요.");
        const stored = await readProfile(page);
        expect(stored.name).toBe(`프로필 검증 ${width}`);
        expect(stored.bio).toBe("탭을 이동해도 남아야 하는 작성 중 소개");
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(form.locator("#profile-name")).toHaveValue(`프로필 검증 ${width}`);
        await expect(form.locator("#profile-bio")).toHaveValue(stored.bio);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
        await form.screenshot({ path: info.outputPath(`profile-saved-${width}.png`), animations: "disabled" });
      } finally { await restoreProfile(page, original); }
    });

    test(`${width}px: 조회 장애 차단·재조회·저장 장애 후 입력 보존과 재시도`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page);
      const original = await readProfile(page);
      const getPattern = "**/api/me";
      const patchPattern = "**/api/me/profile";
      try {
        await page.route(getPattern, (route) => route.fulfill({ status: 503, json: { error: "프로필 조회 테스트 장애" } }));
        await page.goto(`${origin()}/me?tab=profile`, { waitUntil: "domcontentloaded" });
        const form = page.getByRole("form", { name: "공개 프로필 편집", exact: true });
        await expect(form.getByRole("button", { name: "다시 불러오기", exact: true })).toBeVisible();
        await expect(form.locator("#profile-name")).toBeDisabled();
        await expect(form.getByRole("button", { name: "프로필 저장", exact: true })).toBeDisabled();
        await page.unroute(getPattern);
        await form.getByRole("button", { name: "다시 불러오기", exact: true }).click();
        await expect(form.locator("#profile-name")).toBeEnabled();
        await expect(form.locator("#profile-bio")).toHaveValue(original.bio ?? "");
        await form.locator("#profile-bio").fill("저장 실패 뒤에도 보존할 소개");
        await page.route(patchPattern, (route) => route.fulfill({ status: 503, json: { error: "프로필 저장 테스트 장애" } }));
        await form.getByRole("button", { name: "프로필 저장", exact: true }).click();
        await expect(form.getByRole("alert")).toBeVisible();
        await expect(form.locator("#profile-bio")).toHaveValue("저장 실패 뒤에도 보존할 소개");
        expect((await readProfile(page)).bio ?? "").toBe(original.bio ?? "");
        await page.unroute(patchPattern);
        await form.getByRole("button", { name: "프로필 저장", exact: true }).click();
        await expect(form.getByRole("status")).toHaveText("프로필을 저장했어요.");
        expect((await readProfile(page)).bio).toBe("저장 실패 뒤에도 보존할 소개");
      } finally {
        await page.unroute(getPattern); await page.unroute(patchPattern); await restoreProfile(page, original);
      }
    });
  }
});


test.describe("로컬 실계정 화면 진입 범위 — 기능 완주와 구분", () => {
  test.skip(!enabled, "격리 로컬 DB 전용 진입 관측입니다.");
  for (const width of [390, 1440]) {
    test(`${width}px: 인증된 사용자로 12개 경로의 준비 상태를 기록한다`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page);
      const observations = [];
      const failures = [];
      for (const path of ["/my", "/me?tab=profile", "/settings", "/settings/role", "/settings/notifications", "/membership/usage", "/account/points", "/messages", "/market/library", "/team", "/production", "/studio"]) {
        const pageErrors = [];
        const observeError = (error) => pageErrors.push(error.message);
        page.on("pageerror", observeError);
        try {
          await page.goto(`${origin()}${path}`, { waitUntil: "domcontentloaded" });
          const readiness = await waitForAuditRouteReadiness(page, { timeoutMs: 20_000 });
          const introOverlays = await page.locator('div[data-phase="show"], div[data-phase="fade"]').filter({
            has: page.locator('img[src*="hero-main-intro"]'),
          }).count();
          const horizontalOverflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
          const observation = { path, width, outcome: readiness.outcome, timedOut: readiness.timedOut, finalPath: readiness.pathname, horizontalOverflow, introOverlays, pageErrors, functionalVerification: "entry-only" };
          observations.push(observation);
          if (readiness.timedOut || !["ready", "blocked", "degraded"].includes(readiness.outcome) || horizontalOverflow > 2 || introOverlays > 0 || pageErrors.length) failures.push(observation);
        } finally { page.off("pageerror", observeError); }
      }
      await writeFile(info.outputPath(`authenticated-entry-${width}.json`), JSON.stringify(observations, null, 2));
      expect(failures).toEqual([]);
    });
  }
});


test.describe("로컬 실계정의 다른 화면 변경 보존", () => {
  test.skip(!enabled, "격리 로컬 DB에서만 프로필을 변경합니다.");
  for (const width of [390, 1440]) {
    test(`${width}px: 소개 저장이 다른 화면의 이름·직무 변경을 되돌리지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 }); await login(page);
      const original = await readProfile(page);
      try {
        const form = await openProfile(page);
        const external = await page.request.patch(`${origin()}/api/me/profile`, {
          headers: mutationHeaders(), data: { name: "다른 화면에서 변경한 이름", creatorRoleProfile: { ...original.creatorRoleProfile, primaryRole: "story" } },
        });
        expect(external.ok()).toBe(true);
        await form.locator("#profile-bio").fill("이 화면에서 바꾼 소개만 저장");
        await form.getByRole("button", { name: "프로필 저장", exact: true }).click();
        await expect(form.getByRole("status")).toHaveText("프로필을 저장했어요.");
        const stored = await readProfile(page);
        expect(stored.name).toBe("다른 화면에서 변경한 이름");
        expect(stored.creatorRoleProfile.primaryRole).toBe("story");
        expect(stored.bio).toBe("이 화면에서 바꾼 소개만 저장");
        await expect(form.locator("#profile-name")).toHaveValue(stored.name);
      } finally { await restoreProfile(page, original); }
    });
  }
});

test.describe("로컬 실계정 프로필 접근성", () => {
  test.skip(!enabled, "격리 로컬 계정의 폼 검증입니다.");
  for (const width of [390, 1440]) {
    for (const theme of ["light", "dark", "contrast"]) {
      test(`${width}px ${theme}: 프로필 폼의 레이블·오류·대비`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript((theme) => {
          localStorage.setItem("toonstudio-theme", JSON.stringify({ state: { preference: theme, studioPreference: "inherit", theme }, version: 0 }));
        }, theme);
        await login(page); const form = await openProfile(page);
        await expect(page.locator("html")).toHaveAttribute("data-design-theme", theme);
        const originalName = await form.locator("#profile-name").inputValue();
        await form.locator("#profile-name").fill("   ");
        await expect(form.locator("#profile-name")).toHaveAttribute("aria-invalid", "true");
        await expect(form.getByRole("button", { name: "프로필 저장", exact: true })).toBeDisabled();
        await form.getByRole("link", { name: "설정 계정 탭 열기", exact: true }).click();
        await expect(page).toHaveURL(/\/settings\?view=account/u);
        // 주소 변경만으로는 React 경로 전환이 끝났다고 볼 수 없다.
        await expect(form).toHaveCount(0);
        await page.goBack();
        await expect(form.getByRole("button", { name: "초안 버리기", exact: true })).toBeVisible();
        await expect(form.locator("#profile-name")).toHaveValue("   ");
        const result = await new AxeBuilder({ page }).include('form[aria-label="공개 프로필 편집"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        await writeFile(info.outputPath(`profile-accessibility-${width}-${theme}.json`), JSON.stringify({ violations: result.violations, incomplete: result.incomplete, rulesPassed: result.passes.length }, null, 2));
        expect(result.violations).toEqual([]);
        await form.getByRole("button", { name: "초안 버리기", exact: true }).click();
        await expect(form.locator("#profile-name")).toHaveValue(originalName);
        await expect(form.locator("#profile-name")).toBeFocused();
        await form.screenshot({ path: info.outputPath(`profile-${width}-${theme}.png`), animations: "disabled" });
      });
    }
  }
});


test.describe("로컬 실계정의 선택형 직무 편집", () => {
  test.skip(!enabled, "격리 로컬 DB 전용입니다.");
  for (const width of [390, 1440]) {
    test(`${width}px: 접힌 직무 정보를 키보드로 열고 변경·저장한다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 }); await login(page);
      const original = await readProfile(page);
      try {
        const form = await openProfile(page);
        const summary = form.locator("summary").filter({ hasText: "직무·협업 정보 (선택)" });
        const select = form.getByRole("combobox", { name: "전체 직무에서 선택", exact: true });
        await expect(select).toBeHidden();
        const save = form.getByRole("button", { name: "프로필 저장", exact: true });
        const bioBox = await form.locator("#profile-bio").boundingBox();
        const saveBox = await save.boundingBox();
        expect(Boolean(bioBox && saveBox && saveBox.y - bioBox.y < 320)).toBe(true);
        await summary.focus(); await summary.press("Enter");
        await expect(select).toBeVisible(); await select.selectOption("story");
        await save.click(); await expect(form.getByRole("status")).toHaveText("프로필을 저장했어요.");
        expect((await readProfile(page)).creatorRoleProfile.primaryRole).toBe("story");
      } finally { await restoreProfile(page, original); }
    });
  }
});


// 경합 실패의 다음 진단에서 요청 순서만 남긴다. 쿠키·헤더·본문·사용자 값은 기록하지 않는다.
function observeProfileRequestOrder(page) {
  const records = [];
  const requestIds = new WeakMap();
  const startedAt = Date.now();
  let nextId = 0;
  const record = (phase, request, status = null) => {
    const url = new URL(request.url());
    if (url.origin !== origin() || !["/api/me", "/api/me/profile"].includes(url.pathname)) return;
    if (!requestIds.has(request)) requestIds.set(request, ++nextId);
    if (records.length < 128) records.push({
      phase, requestId: requestIds.get(request), elapsedMs: Date.now() - startedAt,
      method: request.method(), path: url.pathname, status,
    });
  };
  const onRequest = (request) => record("request", request);
  const onResponse = (response) => record("response", response.request(), response.status());
  const onFailed = (request) => record("request-failed", request);
  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("requestfailed", onFailed);
  return {
    records,
    stop() {
      page.off("request", onRequest);
      page.off("response", onResponse);
      page.off("requestfailed", onFailed);
    },
  };
}

test.describe("로컬 실계정 프로필의 경로 왕복 초안 복구", () => {
  test.skip(!enabled, "격리 로컬 DB 전용입니다.");
  test.beforeEach(async ({ context }) => {
    // 실제 로컬 API는 그대로 사용하고 운영·외부 서비스 요청은 보내지 않는다.
    await context.route("**/*", (route) => new URL(route.request().url()).origin === origin()
      ? route.continue()
      : route.abort("blockedbyclient"));
  });
  for (const width of [390, 1440]) {
    test(`${width}px: 설정 이동·뒤로가기 후 초안과 최신 서버 이름을 함께 보존한다`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 }); await login(page);
      const original = await readProfile(page);
      const diagnostic = observeProfileRequestOrder(page);
      try {
        const form = await openProfile(page);
        const marker = await page.evaluate(() => {
          window.__profileDraftDocumentProbe = crypto.randomUUID();
          return window.__profileDraftDocumentProbe;
        });
        await form.locator("#profile-bio").fill("다른 화면을 다녀와도 남길 프로필 초안");
        await form.getByRole("link", { name: "설정 계정 탭 열기", exact: true }).click();
        await expect(page).toHaveURL(/\/settings\?view=account/u);
        await expect(form).toHaveCount(0);
        const external = await page.request.patch(`${origin()}/api/me/profile`, {
          headers: mutationHeaders(), data: { name: "초안 작성 중 서버에서 바뀐 이름" },
        });
        expect(external.ok()).toBe(true);
        await page.goBack();
        await expect(form.locator("#profile-bio")).toHaveValue("다른 화면을 다녀와도 남길 프로필 초안");
        await expect(form.locator("#profile-name")).toHaveValue("초안 작성 중 서버에서 바뀐 이름");
        await expect(form.getByRole("button", { name: "초안 버리기", exact: true })).toBeVisible();
        expect(await page.evaluate(() => window.__profileDraftDocumentProbe)).toBe(marker);
        expect((await readProfile(page)).bio ?? "").toBe(original.bio ?? "");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
        await form.screenshot({ path: info.outputPath(`profile-draft-restored-${width}.png`), animations: "disabled" });
        await form.getByRole("button", { name: "프로필 저장", exact: true }).click();
        await expect(form.getByRole("status")).toHaveText("프로필을 저장했어요.");
        const stored = await readProfile(page);
        expect(stored.name).toBe("초안 작성 중 서버에서 바뀐 이름");
        expect(stored.bio).toBe("다른 화면을 다녀와도 남길 프로필 초안");
        await form.getByRole("link", { name: "설정 계정 탭 열기", exact: true }).click();
        await expect(page).toHaveURL(/\/settings\?view=account/u);
        // 주소 변경만으로는 React 경로 전환이 끝났다고 볼 수 없다.
        await expect(form).toHaveCount(0);
        await page.goBack();
        await expect(form.locator("#profile-bio")).toHaveValue(stored.bio);
        await expect(form.getByRole("button", { name: "초안 버리기", exact: true })).toHaveCount(0);
        await form.screenshot({ path: info.outputPath(`profile-draft-saved-${width}.png`), animations: "disabled" });
      } finally {
        diagnostic.stop();
        try {
          await writeFile(info.outputPath(`profile-request-order-${width}.json`), JSON.stringify(diagnostic.records, null, 2));
        } finally { await restoreProfile(page, original); }
      }
    });

    test(`${width}px: 복구한 초안을 키보드로 버리고 서버 값으로 돌아간다`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 }); await login(page);
      const original = await readProfile(page);
      const form = await openProfile(page);
      await form.locator("#profile-bio").fill("서버에 보내지 않고 버릴 초안");
      await form.getByRole("link", { name: "설정 계정 탭 열기", exact: true }).click();
      await expect(page).toHaveURL(/\/settings\?view=account/u);
      // 주소 변경만으로는 React 경로 전환이 끝났다고 볼 수 없다.
      await expect(form).toHaveCount(0);
      await page.goBack();
      const discard = form.getByRole("button", { name: "초안 버리기", exact: true });
      await expect(discard).toBeVisible();
      await form.screenshot({ path: info.outputPath(`profile-draft-to-discard-${width}.png`), animations: "disabled" });
      await discard.focus(); await discard.press("Enter");
      await expect(form.locator("#profile-name")).toBeFocused();
      await expect(form.locator("#profile-bio")).toHaveValue(original.bio ?? "");
      await expect(form.getByRole("button", { name: "프로필 저장", exact: true })).toBeDisabled();
      expect((await readProfile(page)).bio ?? "").toBe(original.bio ?? "");
      await form.getByRole("link", { name: "설정 계정 탭 열기", exact: true }).click();
      await expect(page).toHaveURL(/\/settings\?view=account/u);
      // 주소 변경만으로는 React 경로 전환이 끝났다고 볼 수 없다.
      await expect(form).toHaveCount(0);
      await page.goBack();
      await expect(form.locator("#profile-bio")).toHaveValue(original.bio ?? "");
      await expect(discard).toHaveCount(0);
      await form.screenshot({ path: info.outputPath(`profile-draft-discarded-${width}.png`), animations: "disabled" });
    });
  }
});

test.describe("로컬 실계정 로그아웃 무응답 복구", () => {
  test.skip(!enabled, "격리 로컬 DB 전용입니다.");
  for (const width of [390, 1440]) {
    test(`${width}px: 무응답을 성공으로 표시하지 않고 같은 메뉴에서 다시 로그아웃한다`, async ({ page }) => {
      await page.clock.install();
      await page.setViewportSize({ width, height: 900 });
      await login(page);
      await page.goto(`${origin()}/settings`, { waitUntil: "domcontentloaded" });
      const account = page.getByRole("button", { name: /계정 메뉴|account menu/iu });
      await expect(account).toBeVisible();
      let heldRoute;
      const pattern = "**/api/auth/logout";
      await page.route(pattern, (route) => { heldRoute = route; });
      try {
        await account.click();
        await page.getByRole("menuitem", { name: "로그아웃", exact: true }).click();
        await expect.poll(() => Boolean(heldRoute)).toBe(true);
        await page.clock.fastForward(75_001);
        const retry = page.getByRole("menuitem", { name: "로그아웃 다시 시도", exact: true });
        await expect(retry).toBeVisible();
        await expect(page.getByRole("status").filter({ hasText: "로그아웃 확인에 실패했어요" })).toBeVisible();
        const beforeRetry = await page.request.get(`${origin()}/api/auth/session`);
        expect((await beforeRetry.json()).authenticated).toBe(true);
        await heldRoute.abort();
        heldRoute = undefined;
        await page.unroute(pattern);
        await retry.click();
        await expect(account).toHaveCount(0);
        const afterRetry = await page.request.get(`${origin()}/api/auth/session`);
        expect(await afterRetry.json()).toEqual({ authenticated: false, user: null });
      } finally {
        await page.unroute(pattern);
        if (heldRoute) await heldRoute.abort();
        sharedCookies = [];
      }
    });
  }
});
