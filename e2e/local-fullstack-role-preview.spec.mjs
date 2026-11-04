import { expect, test } from "@playwright/test";

// 실제 로컬 인증·프로필을 사용한다. 편집 권한의 서버 강제는 scoped producer HTTP 회귀에서 검증한다.
const enabled = process.env.TOONSTUDIO_LOCAL_FULLSTACK_E2E === "1";
function origin() {
  const url = new URL(process.env.TOONSTUDIO_LOCAL_WEB_ORIGIN ?? "http://invalid");
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)
    || !url.port || url.username || url.password) {
    throw new Error("분업 계획 검증은 명시적 포트를 가진 격리 로컬 웹에서만 실행합니다.");
  }
  return url.origin;
}
async function login(page) {
  const email = process.env.TOONSTUDIO_LOCAL_TEST_EMAIL;
  const password = process.env.TOONSTUDIO_LOCAL_TEST_PASSWORD;
  if (!email || !password) throw new Error("로컬 풀스택 CLI의 테스트 자격증명이 필요합니다.");
  await page.goto(`${origin()}/auth/login`, { waitUntil: "domcontentloaded" });
  const form = page.locator('[data-auth-form="true"]');
  await expect(form).toBeVisible({ timeout: 180_000 });
  await form.locator('input[type="email"]').fill(email);
  await form.locator('input[autocomplete="current-password"]').fill(password);
  await form.locator('button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: /이미 로그인되어 있어요|already signed in/iu })).toBeVisible();
  const response = await page.request.get(`${origin()}/api/auth/session`);
  expect(response.ok()).toBe(true);
  expect((await response.json()).authenticated).toBe(true);
}
async function openPlan(page) {
  await page.goto(`${origin()}/settings/role?tab=workspace`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "분업 계획·만화 프리셋 펼치기", exact: true }).click();
  const panel = page.getByTestId("webtoon-role-pipeline-section");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("role-pipeline-scope-notice")).toContainText("실제 원고·서버 권한·담당자·작업공간은 변경하지 않습니다");
  return panel;
}
async function roleProfile(page) {
  const response = await page.request.get(`${origin()}/api/me`);
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(Boolean(body.profile?.id)).toBe(true);
  return { id: body.profile.id, creatorRoleProfile: body.profile.creatorRoleProfile };
}

test.describe("로컬 실계정의 분업 계획과 실제 권한 경계", () => {
  test.skip(!enabled, "node scripts/local-fullstack/cli.mjs e2e 로 격리 DB에서 실행합니다.");
  test("직군·8단계 동결 계획은 서버를 변경하지 않고 새로고침·재로그인 시 초기화한다", async ({ page }, info) => {
    await login(page);
    const originalProfile = JSON.stringify(await roleProfile(page));
    const writes = [];
    let observingPlan = false;
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (observingPlan && !/^(GET|HEAD|OPTIONS)$/u.test(request.method())
        && /^\/api\/(creator(?:\/|$)|production(?:\/|$)|me(?:\/|$)|studio-project-graph(?:\/|$))/u.test(path)) {
        writes.push(`${request.method()} ${path}`);
      }
    });
    let panel = await openPlan(page);
    observingPlan = true;
    await panel.getByTestId("role-pipeline-select-flat-color-assistant").click();
    await panel.getByTestId("role-layer-chip-main-lineart").click();
    await expect(panel.getByTestId("role-layer-guard-status")).toContainText("계획상 편집 제외");
    await expect(panel.getByTestId("role-pipeline-handoff-btn")).toBeDisabled();
    await panel.getByTestId("role-pipeline-select-story").click();
    await panel.getByTestId("role-pipeline-handoff-btn").click();
    await panel.getByTestId("role-pipeline-select-story").click();
    await panel.getByTestId("role-layer-chip-story-notes").click();
    await expect(panel.getByTestId("role-layer-guard-reason")).toContainText("이전 공정 동결");
    await panel.getByTestId("role-pipeline-select-creator").click();
    for (let step = 0; step < 7; step += 1) await panel.getByTestId("role-pipeline-handoff-btn").click();
    await expect(panel.getByTestId("role-pipeline-handoff-btn")).toBeDisabled();
    await expect(panel.getByTestId("role-pipeline-handoff-btn")).toHaveText("최종 동결 계획 완료");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await panel.screenshot({ path: info.outputPath("role-preview-final-freeze.png"), animations: "disabled" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "분업 계획·만화 프리셋 펼치기", exact: true }).click();
    panel = page.getByTestId("webtoon-role-pipeline-section");
    await expect(panel.getByTestId("role-pipeline-select-story")).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByTestId("role-pipeline-active-stage-label")).toContainText("1단계");
    await expect(panel.getByTestId("role-pipeline-handoff-btn")).toBeEnabled();
    expect(JSON.stringify(await roleProfile(page)) === originalProfile).toBe(true);
    expect(writes).toEqual([]);
    // 로그인 직후의 정상 /api/me/merge는 계획 동작이 아니므로 관찰 구간에서 분리한다.
    observingPlan = false;
    await page.goto(`${origin()}/help`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /계정 메뉴|account menu/iu }).click();
    await page.getByRole("menuitem", { name: /로그아웃|sign out|log out/iu }).click();
    await expect.poll(async () => (await (await page.request.get(`${origin()}/api/auth/session`)).json()).authenticated).toBe(false);
    await login(page);
    panel = await openPlan(page);
    await expect(panel.getByTestId("role-pipeline-select-story")).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByTestId("role-pipeline-active-stage-label")).toContainText("1단계");
    observingPlan = true;
    await panel.getByTestId("role-pipeline-select-line-assistant").click();
    await panel.getByTestId("role-pipeline-select-story").click();
    await expect(panel.getByTestId("role-pipeline-select-story")).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByTestId("role-pipeline-handoff-btn")).toBeEnabled();
    expect(JSON.stringify(await roleProfile(page)) === originalProfile).toBe(true);
    expect(writes).toEqual([]);
    await page.setViewportSize({ width: 390, height: 900 });
    await panel.screenshot({ path: info.outputPath("role-preview-relogin-mobile.png"), animations: "disabled" });
  });
});
