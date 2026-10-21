import { expect, test, type Page } from "@playwright/test";

// 모바일·터치 제작 동선 (inclusion 발견 7 + A7):
// - 보드·검수 룸의 "보기·승인"처럼 모바일에서 되는 동선은 이 스펙으로 고정한다.
// - 풀 편집 표면은 진입 시 안내가 되는 작업과 안 되는 작업을 함께 알린다.
//   표면별 경계의 정본은 studio-mobile-touch-flow 계획이다(등급이 data 속성으로 노출된다).
// - 태블릿 가로(데스크톱 폭 + 터치)에서도 안내가 나와 경계를 먼저 알린다.
// 데모 프로젝트(sample-project)는 서버 없이 브라우저에서 동작하므로 API를 막지 않는다.

const BOARD_URL = "/production/projects/sample-project/production";
const EPISODE_ROOM_URL = "/production/projects/sample-project/episodes/episode-12";
const DEMO_TASK_TITLE = "13화 대본 2차 초안";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function expectNoDocumentHorizontalOverflow(page: Page) {
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(geometry.scroll, "문서 전체의 가로 넘침").toBeLessThanOrEqual(geometry.width + 1);
}

async function mockGuestSession(page: Page) {
  // 인증 경계만 게스트로 고정한다 (studio-3d-mobile-authoring 패턴).
  await page.route("**/api/auth/session", (route) => route.request().method() === "GET"
    ? route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: false, user: null }),
    })
    : route.fallback());
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "toonstudio-lang",
      JSON.stringify({ state: { lang: "ko" }, version: 0 }),
    );
    sessionStorage.setItem("toonstudio-compat-dismissed", "true");
    localStorage.setItem(
      "toonstudio-studio-beta-notice-acknowledged",
      "2026-09-24-data-and-policy-v1",
    );
  });
});

test("모바일 보드: 작업 카드를 열어 보고 닫을 수 있고 상태 이동도 닿는다", async ({ page }) => {
  await page.goto(BOARD_URL, { waitUntil: "domcontentloaded" });
  const board = page.getByTestId("production-work-board");
  await expect(board).toBeVisible({ timeout: 90_000 });
  await expectNoDocumentHorizontalOverflow(page);

  // 보기: 카드 버튼을 누르면 작업 대화상자가 열린다.
  await board.getByRole("button", { name: DEMO_TASK_TITLE, exact: true }).tap();
  const dialog = page.getByRole("dialog", { name: DEMO_TASK_TITLE, exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "대화상자 닫기", exact: true }).tap();
  await expect(dialog).toBeHidden();

  // 가벼운 작업(상태 이동)은 모바일에서도 그대로 닿는 범위다.
  const statusSelect = board.getByRole("combobox", {
    name: `${DEMO_TASK_TITLE} 상태 이동`,
    exact: true,
  });
  await expect(statusSelect).toBeVisible();
  const box = await statusSelect.boundingBox();
  // 보드 테마 E2E가 고정하는 기존 하한(43px)과 같은 기준으로 본다.
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(43);
});

test("모바일 검수 룸: 버전 비교로 오갈 수 있고 승인 가능 여부와 이유가 진입 즉시 읽힌다", async ({ page }) => {
  await page.goto(EPISODE_ROOM_URL, { waitUntil: "domcontentloaded" });
  const room = page.locator('[data-production-episode-review-room="true"]');
  await expect(room).toBeVisible({ timeout: 90_000 });
  await expectNoDocumentHorizontalOverflow(page);

  // 보기 동선: 원고 뷰어 ↔ 버전 비교 탭 전환이 주소(roomView)에 남는다.
  await room.getByRole("tab", { name: /버전 비교/u }).tap();
  await expect(page).toHaveURL(/roomView=compare/u);
  await room.getByRole("tab", { name: /원고 뷰어/u }).tap();
  await expect(page).not.toHaveURL(/roomView=compare/u);

  // 승인 동선: 게이트와 승인 버튼(44px)이 보이고, 잠겨 있으면 이유가 함께 읽혀야 한다.
  const gate = page.locator('aside[aria-labelledby="episode-approval-gate-title"]');
  await expect(gate).toBeVisible();
  await gate.scrollIntoViewIfNeeded();
  const approveButton = gate.getByRole("button", { name: /승인/u });
  await expect(approveButton).toBeVisible();
  const approveBox = await approveButton.boundingBox();
  expect(approveBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  const lockReason = page.locator("#episode-approval-lock-reason");
  if (await approveButton.isDisabled()) {
    // 데모 기본 상태: 필수 수정 핀이 남아 승인이 잠기고, 그 이유가 버튼 아래에 명시된다.
    await expect(lockReason).toContainText(/필수 수정|승인 항목이 없습니다|편집 권한|이미 기록/u);
  } else {
    await approveButton.tap();
    await expect(page.getByText("승인을 기록했습니다.")).toBeVisible();
  }
});

test("모바일 풀 편집 진입: 캔버스 편집기는 되는·안 되는 작업을 함께 알리고 닫으면 같은 세션에서 다시 띄우지 않는다", async ({ page }) => {
  await mockGuestSession(page);

  await page.goto("/studio/canvas", { waitUntil: "domcontentloaded" });
  const notice = page.getByTestId("mobile-full-edit-notice");
  await expect(notice).toBeVisible({ timeout: 90_000 });
  await expect(notice).toContainText("데스크톱에서 가장 편해요");
  // 되는 작업: 터치 최소 동선(컷 목록·도크 간단 수정)이 실제로 배선된 범위만 약속한다.
  await expect(notice).toContainText("카드 버튼으로 순서 바꾸기");
  await expect(notice).toContainText("모바일 도크 펜·지우개·도형");
  // 안 되는 작업: 진입 시점에 이유·대체 경로와 함께 먼저 알린다(눌러 보고 알게 하지 않는다).
  await expect(notice).toContainText("이 기기에서는 안 돼요");
  await expect(notice).toContainText("끌어 옮기는 재배열은 데스크톱에서");
  await expect(notice).toHaveAttribute("data-studio-mobile-touch-tier", "touch-edit");
  await expectNoDocumentHorizontalOverflow(page);

  await notice.getByRole("button", { name: "이해했어요", exact: true }).tap();
  await expect(notice).toBeHidden();
  await expect.poll(() => page.evaluate(() =>
    sessionStorage.getItem("toonstudio-mobile-full-edit-notice-dismissed:studio-editor-canvas"),
  )).toBe("true");

  // 같은 세션 재진입에서는 안내가 다시 나오지 않는다.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('.route-stage[data-route-state="ready"]')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("mobile-full-edit-notice")).toHaveCount(0);
});

test("모바일 3D 배경 진입: 편집 자체가 안 됨을 진입 시점에 알리고 도크 그리기를 약속하지 않는다", async ({ page }) => {
  await mockGuestSession(page);

  await page.goto("/studio/bg3d", { waitUntil: "domcontentloaded" });
  const notice = page.getByTestId("mobile-full-edit-notice");
  await expect(notice).toBeVisible({ timeout: 90_000 });
  await expect(notice).toHaveAttribute("data-studio-mobile-touch-tier", "desktop-required");
  await expect(notice).toContainText("이 기기에서는 안 돼요");
  await expect(notice).toContainText("3D 배치·변형·장면 편집 자체는 이 기기에서 안 돼요");
  // 도크는 캔버스 편집기의 부품이다 — 3D 표면의 가능 목록에 도크 그리기가 있으면 거짓 안내다.
  await expect(notice).not.toContainText("모바일 도크 펜·지우개·도형·굵기 조절로 간단히 그리기·지우기");
  await expect(notice).toContainText("캔버스 표면으로 이동해 컷 편집·간단한 그리기");
});

test("태블릿 가로(1180px·터치)에서도 캔버스 안내가 나와 경계를 먼저 알린다", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await mockGuestSession(page);

  await page.goto("/studio/canvas", { waitUntil: "domcontentloaded" });
  const notice = page.getByTestId("mobile-full-edit-notice");
  await expect(notice).toBeVisible({ timeout: 90_000 });
  await expect(notice).toHaveAttribute("data-studio-mobile-touch-tier", "touch-edit");
});

test.describe("데스크톱(마우스·터치 없음)", () => {
  // 1280px라도 터치 기기로 에뮬레이션하면 태블릿 가로로 분류되므로, 데스크톱 단언은
  // 터치 없는 컨텍스트에서 분리한다 — 분류 정본(studio-mobile-touch-flow)과 같은 경계다.
  test.use({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });

  test("데스크톱 폭에서는 풀 편집 안내가 나오지 않는다", async ({ page }) => {
    await mockGuestSession(page);

    await page.goto("/studio/canvas", { waitUntil: "domcontentloaded" });
    await expect(page.locator('.route-stage[data-route-state="ready"]')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("mobile-full-edit-notice")).toHaveCount(0);
  });
});
