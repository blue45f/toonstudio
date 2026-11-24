import AxeBuilder from "@axe-core/playwright";

import {
  expect,
  installBetaEventDismissal,
  installStudioBetaNoticeDismissal,
  test,
} from "./fixtures/non-studio-test";

import type { ConsoleMessage, Page } from "@playwright/test";

const HERO_BG_THEME_IDS = [
  "hero-bg-kr-modern-apartment-living",
  "hero-bg-kr-atelier-cafe-interior",
  "hero-bg-kr-highschool-classroom-corridor",
  "hero-bg-kr-school-rooftop-hero",
  "hero-bg-kr-seoul-alley-street-hero",
  "hero-bg-rofan-imperial-palace-hall-balcony",
] as const;

const HERO_VRM_OPTION_IDS = [
  "hero-v1-romance-female",
  "hero-v1-romance-male",
  "hero-v1-academy-female",
  "hero-v1-academy-male",
  "hero-v1-rofan-empress",
  "hero-v1-rofan-duke",
  "hero-v1-action-hunter",
  "hero-v1-chibi-mascot",
] as const;

interface ErrorCollector {
  readonly pageErrors: string[];
  readonly consoleErrors: string[];
}

function attachRuntimeErrorCollector(page: Page): ErrorCollector {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // 오프라인 E2E 픽스처가 의도적으로 반환한 503 네트워크 로그는 런타임 결함으로 보지 않는다.
    if (/status of 503|Failed to load resource/u.test(text)) return;
    consoleErrors.push(text);
  });
  return { pageErrors, consoleErrors };
}

/**
 * 첫 방문 비차단 게스트 환경을 구성한다.
 * 입장 로비 확인 상태(entry preference)는 의도적으로 심지 않아
 * 첫 방문자가 차단 모달 없이 즉시 무대에 진입하는지 검증한다.
 */
async function ensureWorkToolsDrawerOpen(page: Page): Promise<void> {
  const toggle = page.getByTestId("space-work-tools-toggle");
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
}

async function installVirtualSpaceEnvironment(page: Page): Promise<void> {
  await installBetaEventDismissal(page);
  await installStudioBetaNoticeDismissal(page);
  await page.addInitScript(() => {
    localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
    localStorage.setItem(
      "toonstudio-theme",
      JSON.stringify({
        state: { preference: "starlight", studioPreference: "starlight", theme: "starlight" },
        version: 0,
      }),
    );
    sessionStorage.setItem("toonstudio-compat-dismissed", "true");
  });

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({ status: 200, json: { authenticated: false, user: null } });
      return;
    }
    if (/\/studio\/space\/access\/(?:entry-codes|invite)\/verify$/u.test(pathname)) {
      await route.fulfill({
        status: 200,
        json: { valid: true, expiresAt: "2099-01-01T00:00:00.000Z" },
      });
      return;
    }
    await route.fulfill({ status: 503, json: { message: "Offline virtual-space E2E fixture" } });
  });
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);
}

async function expectNoBlockingWcagViolations(page: Page, contextLabel: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .exclude("canvas")
    .analyze();
  const blocking = results.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        target: node.target.join(" "),
        summary: node.failureSummary ?? "",
      })),
    }));
  expect(blocking, `${contextLabel} WCAG 2.1 AA serious/critical 위반`).toEqual([]);
}

test.describe("가상 스튜디오 (/studio/space) 풀 E2E 검증", () => {
  test("1. 비차단 게스트 솔로 진입: 즉시 무대 렌더링, 인스페이스 프로필 닉네임 변경, 마감 카운트다운 표시", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installVirtualSpaceEnvironment(page);
    const errors = attachRuntimeErrorCollector(page);

    await page.goto("/studio/space", { waitUntil: "domcontentloaded" });

    // 차단 모달·로그인 벽 없이 즉시 무대 루트가 노출되어야 한다.
    const stageRoot = page.getByTestId("virtual-space-stage-root");
    await expect(stageRoot).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("dialog", { name: /로그인|입장 로비/u })).toHaveCount(0);

    // 마감 카운트다운 위젯 확인
    const countdown = page.getByTestId("space-deadline-countdown");
    await expect(countdown).toBeVisible();
    await expect(countdown).toContainText(/D-(?:DAY|\d+)|D\+\d+/u);
    await expect(countdown).toContainText(/\d{2}:\d{2}:\d{2}/u);

    // 2D 7단계 공정 바와 좌상단 도구 행이 겹치지 않아야 한다.
    const railToolsOverlap = await page.evaluate(() => {
      const rail = document.querySelector(".studio-office2d-pipeline")?.getBoundingClientRect();
      const tools = document.querySelector(".space-top-tools-row")?.getBoundingClientRect();
      if (!rail || !tools) return 0;
      const ox = Math.max(0, Math.min(rail.right, tools.right) - Math.max(rail.left, tools.left));
      const oy = Math.max(0, Math.min(rail.bottom, tools.bottom) - Math.max(rail.top, tools.top));
      return Math.round(ox * oy);
    });
    expect(railToolsOverlap).toBe(0);

    // 인스페이스 프로필 팝오버에서 닉네임 즉시 변경 후 Escape 닫기
    const profileBtn = page.getByTestId("space-inline-profile-btn");
    await expect(profileBtn).toBeVisible();
    await profileBtn.click();

    const profilePopover = page.getByTestId("space-inline-profile-popover");
    await expect(profilePopover).toBeVisible();
    const nicknameInput = profilePopover.locator("#space-inline-nickname");
    await nicknameInput.fill("아틀리에작가");
    await profilePopover.getByRole("button", { name: "저장" }).click();
    await expect(profileBtn).toContainText("아틀리에작가");
    await page.keyboard.press("Escape");
    await expect(profilePopover).toHaveCount(0);

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });

  test("2. 3D 무대: Hero 3D BG 6씬 전환, 3모드 카메라, 자동 컷어웨이 상태, 포토부스 버튼 (WebGL/Console Error 0건)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installVirtualSpaceEnvironment(page);
    const errors = attachRuntimeErrorCollector(page);

    await page.goto("/studio/space?stage=3d", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("virtual-space-stage-root")).toBeVisible({ timeout: 45_000 });
    const threeStage = page.locator('[data-three-stage="active"]');
    await expect(threeStage).toBeVisible({ timeout: 60_000 });

    // 3모드 카메라 전환 (quarter -> third-person -> first-person -> quarter)
    const quarterBtn = page.getByTestId("three-camera-mode-quarter");
    const thirdPersonBtn = page.getByTestId("three-camera-mode-third-person");
    const firstPersonBtn = page.getByTestId("three-camera-mode-first-person");
    await expect(quarterBtn).toBeVisible();
    await expect(thirdPersonBtn).toBeVisible();
    await expect(firstPersonBtn).toBeVisible();

    await thirdPersonBtn.click();
    await expect(thirdPersonBtn).toHaveAttribute("aria-pressed", "true");
    await expect(threeStage).toHaveAttribute("data-three-camera-mode", "third-person");

    await firstPersonBtn.click();
    await expect(firstPersonBtn).toHaveAttribute("aria-pressed", "true");
    await expect(threeStage).toHaveAttribute("data-three-camera-mode", "first-person");

    await quarterBtn.click();
    await expect(quarterBtn).toHaveAttribute("aria-pressed", "true");
    await expect(threeStage).toHaveAttribute("data-three-camera-mode", "quarter");

    // 컷어웨이 상태 배지 노출 및 수치 속성 확인
    const cutawayState = page.getByTestId("three-hud-cutaway-state");
    await expect(cutawayState).toBeVisible();
    const hiddenCountAttr = await cutawayState.getAttribute("data-cutaway-hidden-count");
    expect(hiddenCountAttr).not.toBeNull();
    expect(Number(hiddenCountAttr)).toBeGreaterThanOrEqual(0);

    // 포토부스 2D 컷 촬영 버튼 확인 및 클릭 무오류
    const photoBtn = page.getByTestId("three-photo-capture-cut-btn");
    await expect(photoBtn).toBeVisible();
    await photoBtn.click();

    // 3D HUD 원클릭 '3D 룸·아바타' 버튼으로 꾸미기 패널 열어 Hero 3D BG 6씬 노출 및 아틀리에 카페 전환·자동 컷어웨이 검증
    const openCustomizeBtn = page.getByTestId("three-open-customize-btn");
    await expect(openCustomizeBtn).toBeVisible();
    await openCustomizeBtn.click();
    await expect(page.getByTestId("three-theme-group-hero")).toBeVisible({ timeout: 20_000 });
    for (const themeId of HERO_BG_THEME_IDS) {
      await expect(page.getByTestId(`three-theme-option-${themeId}`)).toBeVisible();
    }
    const cafeThemeBtn = page.getByTestId("three-theme-option-hero-bg-kr-atelier-cafe-interior");
    await cafeThemeBtn.click();
    await expect(cafeThemeBtn).toHaveAttribute("aria-pressed", "true");
    // Hero 룸 진입 후 쿼터뷰에서 자동 컷어웨이가 활성화되고 1인칭에서는 전체 벽 표시로 복원되어야 한다.
    await expect(cutawayState).toHaveAttribute("data-cutaway-hidden-count", /^[1-9]\d*$/u, { timeout: 25_000 });
    await firstPersonBtn.click();
    await expect(cutawayState).toHaveAttribute("data-cutaway-hidden-count", "0", { timeout: 10_000 });
    await quarterBtn.click();

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });

  test("3. Hero VRM 1.0 8종 아바타 노출 및 전환 무오류", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installVirtualSpaceEnvironment(page);
    const errors = attachRuntimeErrorCollector(page);

    await page.goto("/studio/space?stage=3d", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-three-stage="active"]')).toBeVisible({ timeout: 45_000 });

    await page.getByRole("button", { name: "꾸미기" }).click();
    const heroGroup = page.getByTestId("three-avatar-group-hero");
    await expect(heroGroup).toBeVisible({ timeout: 25_000 });

    for (const optionId of HERO_VRM_OPTION_IDS) {
      await expect(page.getByTestId(`three-avatar-option-${optionId}`)).toBeVisible();
    }

    for (const targetOption of [
      "hero-v1-romance-female",
      "hero-v1-rofan-empress",
      "hero-v1-chibi-mascot",
    ] as const) {
      const btn = page.getByTestId(`three-avatar-option-${targetOption}`);
      await btn.click();
      await expect(btn).toHaveAttribute("aria-pressed", "true");
    }

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });

  test("4. 멀티컨텍스트 협업, 오펀 승격 도구(화이트보드·포스트잇·공유커서·'/'커서챗·초대시트), BroadcastChannel 동기화 & guest-voice 경계", async ({ browser, context }) => {
    // 4-A. 동일 오리진 2탭 간 Yjs BroadcastChannel 동기화 + 오펀 승격 도구 검증
    const pageA = await context.newPage();
    const pageB = await context.newPage();
    await pageA.setViewportSize({ width: 1440, height: 900 });
    await pageB.setViewportSize({ width: 1440, height: 900 });
    await installVirtualSpaceEnvironment(pageA);
    await installVirtualSpaceEnvironment(pageB);
    const errorsA = attachRuntimeErrorCollector(pageA);
    const errorsB = attachRuntimeErrorCollector(pageB);

    await pageA.goto("/studio/space", { waitUntil: "domcontentloaded" });
    await pageB.goto("/studio/space", { waitUntil: "domcontentloaded" });
    await expect(pageA.getByTestId("virtual-space-stage-root")).toBeVisible({ timeout: 30_000 });
    await expect(pageB.getByTestId("virtual-space-stage-root")).toBeVisible({ timeout: 30_000 });

    // 공유 커서 레이어 마운트 확인
    await expect(pageA.getByTestId("space-shared-cursors-layer")).toBeAttached();

    // '/' 즉석 커서 챗 입력 및 전송
    await pageA.keyboard.press("/");
    const cursorChatInput = pageA.getByTestId("space-cursor-chat-input");
    await expect(cursorChatInput).toBeVisible();
    await cursorChatInput.fill("컷 검수 같이 봐요");
    await cursorChatInput.press("Enter");
    await expect(cursorChatInput).toBeHidden();

    // 초대 시트 노출 확인
    await pageA.getByTestId("space-inline-profile-btn").click();
    await pageA.getByTestId("space-inline-open-invite-btn").click();
    const inviteSheet = pageA.getByTestId("space-invite-sheet");
    await expect(inviteSheet).toBeVisible();
    await inviteSheet.getByRole("tab", { name: "입장코드" }).click();
    await expect(inviteSheet.getByRole("button", { name: "코드 복사" })).toBeVisible();
    await pageA.keyboard.press("Escape");

    // 화이트보드 모달 노출, 헤더 탭으로 포스트잇 즉시 전환, Escape 닫기 확인
    await ensureWorkToolsDrawerOpen(pageA);
    await pageA.getByTestId("space-quick-whiteboard-btn").click();
    await expect(pageA.getByTestId("space-whiteboard-panel")).toBeVisible();
    const boardDialog = pageA.getByRole("dialog", { name: "공유 화이트보드" });
    await boardDialog.getByRole("tab", { name: "포스트잇" }).click();
    await expect(pageA.getByTestId("space-sticky-notes-panel")).toBeVisible();
    await pageA.keyboard.press("Escape");
    await expect(pageA.getByTestId("space-sticky-notes-panel")).toHaveCount(0);

    // 포스트잇 패널을 두 탭에 열고 BroadcastChannel 실시간 Yjs 동기화 확인
    await ensureWorkToolsDrawerOpen(pageA);
    await pageA.getByTestId("space-quick-stickies-btn").click();
    await expect(pageA.getByTestId("space-sticky-notes-panel")).toBeVisible();
    await ensureWorkToolsDrawerOpen(pageB);
    await pageB.getByTestId("space-quick-stickies-btn").click();
    const stickiesB = pageB.getByTestId("space-sticky-notes-panel");
    await expect(stickiesB).toBeVisible();

    await pageA.locator('[data-work-template="review"]').click();
    await expect(stickiesB).toContainText("[검수 피드백]", { timeout: 10_000 });

    // 4-B. 독립 브라우저 컨텍스트에서 초대 코드로 guest-voice 입장 및 방장 제어 비노출(fail-closed) 확인
    const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const guestPage = await guestContext.newPage();
    await installVirtualSpaceEnvironment(guestPage);
    await guestPage.goto("/studio/p/virtual-demo:preview/space#code=ABC234", {
      waitUntil: "domcontentloaded",
    });

    // 초대 코드 검증 통과 후 입장 버튼 클릭
    const enterButton = guestPage.getByRole("button", { name: /게스트로 입장|입장|시작/u }).first();
    await expect(enterButton).toBeEnabled({ timeout: 25_000 });
    await enterButton.click();

    await expect(guestPage.getByTestId("virtual-space-stage-root")).toBeVisible({ timeout: 30_000 });
    const guestProfileBtn = guestPage.getByTestId("space-inline-profile-btn");
    await expect(guestProfileBtn).toContainText("초대 게스트");
    await guestProfileBtn.click();
    await expect(guestPage.getByTestId("space-inline-profile-popover")).toBeVisible();
    await expect(guestPage.getByTestId("space-host-controls")).toHaveCount(0);

    await guestContext.close();
    await pageA.close();
    await pageB.close();

    expect(errorsA.pageErrors).toEqual([]);
    expect(errorsA.consoleErrors).toEqual([]);
    expect(errorsB.pageErrors).toEqual([]);
    expect(errorsB.consoleErrors).toEqual([]);
  });

  test("5. 데스크톱 1440×900 & 모바일 390×844 반응형·44px 터치 타깃·오버플로 0·WCAG 2.1 AA 접근성", async ({ browser }) => {
    // 5-A. 데스크톱 1440×900 레이아웃 + 랜드마크 + WCAG 2.1 AA (등장 애니메이션 중간 투명도 플레이크 방지를 위해 reducedMotion 고정)
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    const desktopPage = await desktopContext.newPage();
    await installVirtualSpaceEnvironment(desktopPage);
    await desktopPage.goto("/studio/space", { waitUntil: "domcontentloaded" });
    await expect(desktopPage.getByTestId("virtual-space-stage-root")).toBeVisible({ timeout: 45_000 });
    await expect(desktopPage.getByRole("toolbar", { name: "가상 스튜디오 도구" })).toBeVisible();
    await assertNoHorizontalOverflow(desktopPage);
    await expectNoBlockingWcagViolations(desktopPage, "데스크톱 1440×900 /studio/space");
    await desktopContext.close();

    // 5-B. 모바일 390×844 도크·조이스틱 >= 44px 터치 타깃 + 가로 오버플로 0 + WCAG 2.1 AA
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      reducedMotion: "reduce",
    });
    const mobilePage = await mobileContext.newPage();
    await installVirtualSpaceEnvironment(mobilePage);
    const mobileErrors = attachRuntimeErrorCollector(mobilePage);

    await mobilePage.goto("/studio/space", { waitUntil: "domcontentloaded" });
    await expect(mobilePage.getByTestId("virtual-space-stage-root")).toBeVisible({ timeout: 30_000 });

    const mobileDock = mobilePage.getByTestId("space-mobile-dock");
    const joystickPad = mobilePage.getByTestId("space-joystick-pad");
    await expect(mobileDock).toBeVisible();
    await expect(joystickPad).toBeVisible();

    const dockButtons = mobileDock.locator("button:visible");
    const dockButtonCount = await dockButtons.count();
    expect(dockButtonCount).toBeGreaterThanOrEqual(4);
    for (let index = 0; index < dockButtonCount; index += 1) {
      const box = await dockButtons.nth(index).boundingBox();
      expect(box, `모바일 도크 버튼 #${index} boundingBox`).not.toBeNull();
      expect(box!.height, `모바일 도크 버튼 #${index} 높이 >= 44px`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `모바일 도크 버튼 #${index} 너비 >= 44px`).toBeGreaterThanOrEqual(44);
    }

    const joystickBox = await joystickPad.boundingBox();
    expect(joystickBox).not.toBeNull();
    expect(joystickBox!.width).toBeGreaterThanOrEqual(44);
    expect(joystickBox!.height).toBeGreaterThanOrEqual(44);

    // 모바일 2D에서 7단계 공정 바와 도구 행·미니 투어 카드가 겹치지 않아야 한다.
    const mobileOverlap = await mobilePage.evaluate(() => {
      const rectOverlap = (a?: DOMRect, b?: DOMRect) => {
        if (!a || !b) return 0;
        const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        return Math.round(ox * oy);
      };
      const rail = document.querySelector(".studio-office2d-pipeline")?.getBoundingClientRect();
      const tools = document.querySelector(".space-top-tools-row")?.getBoundingClientRect();
      const coach = document.querySelector(".space-coach")?.getBoundingClientRect();
      return {
        railTools: rectOverlap(rail, tools),
        toolsCoach: rectOverlap(tools, coach),
      };
    });
    expect(mobileOverlap.railTools).toBe(0);
    expect(mobileOverlap.toolsCoach).toBe(0);

    await assertNoHorizontalOverflow(mobilePage);
    await expectNoBlockingWcagViolations(mobilePage, "모바일 390×844 /studio/space");

    // 5-C. 모바일 390×844 3D 무대 진입, HUD 노출, 가로 오버플로 0 확인
    await mobilePage.goto("/studio/space?stage=3d", { waitUntil: "domcontentloaded" });
    await expect(mobilePage.locator('[data-three-stage="active"]')).toBeVisible({ timeout: 45_000 });
    await expect(mobilePage.getByTestId("three-open-customize-btn")).toBeVisible({ timeout: 20_000 });
    await assertNoHorizontalOverflow(mobilePage);

    expect(mobileErrors.pageErrors).toEqual([]);
    expect(mobileErrors.consoleErrors).toEqual([]);
    await mobileContext.close();
  });

  test("6. 전 기능 1건씩 실동작 검증: 12종 프리셋, 5종 업무 상태+새로고침, 집중 완료 축하, 모션/발소리 음소거, 화이트보드 그리기·포스트잇·P2P 주석 보드, 룸/미니맵·고스트·2D↔3D 동기화", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installVirtualSpaceEnvironment(page);
    const errors = attachRuntimeErrorCollector(page);

    await page.goto("/studio/space", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("virtual-space-stage-root")).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('[data-office2d-stage="ready"]')).toBeVisible({ timeout: 45_000 });

    // 6-A. 웹툰 업무 상태 5종 1탭 전환 · 새로고침 유지 · 참가자 로스터 반영
    await ensureWorkToolsDrawerOpen(page);
    const workBar = page.getByTestId("space-work-status-bar");
    await expect(workBar).toBeVisible();
    for (const statusId of [
      "storyboard",
      "inking",
      "coloring-bg",
      "review-request",
      "short-break",
    ] as const) {
      const btn = page.getByTestId(`work-status-btn-${statusId}`);
      await expect(btn).toBeVisible();
      await btn.click();
      await expect(btn).toHaveAttribute("aria-pressed", "true");
    }
    await page.getByTestId("work-status-btn-inking").click();
    await expect(workBar).toHaveAttribute("data-active-work-status", "inking");

    // 참가자 로스터 내 카드에 업무 상태 반영 확인 후 Escape로 닫기
    await page.getByRole("button", { name: "참가자" }).click();
    await expect(page.getByTestId("space-self-card-work-status")).toContainText("선화 집중");
    await page.keyboard.press("Escape");

    // 새로고침 후에도 업무 상태가 localStorage에서 그대로 복원되어야 한다.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-office2d-stage="ready"]')).toBeVisible({ timeout: 45_000 });
    await ensureWorkToolsDrawerOpen(page);
    await expect(page.getByTestId("work-status-btn-inking")).toHaveAttribute("aria-pressed", "true");

    // 6-B. 원클릭 25분 집중 스프린트 시작 -> 완료 체크 축하 리본 노출 및 닫기
    await page.getByTestId("space-focus-sprint-btn").click();
    await expect(page.getByTestId("space-focus-chip-complete-btn")).toBeVisible();
    await page.getByTestId("space-focus-chip-complete-btn").click();
    const celebration = page.getByTestId("space-celebration-ribbon");
    await expect(celebration).toBeVisible();
    await expect(celebration).toContainText("집중 스프린트 완료");
    await celebration.getByRole("button", { name: "축하 안내 닫기" }).click();
    await expect(celebration).toHaveCount(0);

    // 6-C. 12종 오피스 직군 캐릭터 프리셋 전부 노출 + 선택 반영 + Escape 닫기
    await page.getByRole("button", { name: "꾸미기" }).click();
    const presetGroup = page.locator('[data-office-role-presets="true"]');
    await expect(presetGroup).toBeVisible({ timeout: 20_000 });
    await expect(presetGroup.locator("[data-office-preset-id]")).toHaveCount(12);
    const mvpPreset = presetGroup.locator('[data-office-preset-id="deadline-mvp"]');
    await mvpPreset.click();
    await expect(mvpPreset).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");

    // 6-D. 리액션(모션/감정표현) 실행 & 2D 공간음(발소리·효과음) 토글
    await page.getByRole("button", { name: "리액션" }).click();
    const emoteDialog = page.getByRole("dialog", { name: "리액션 보내기" });
    await expect(emoteDialog).toBeVisible();
    await emoteDialog.getByRole("button").first().click();
    await expect(emoteDialog).toHaveCount(0);

    const office2dSoundBtn = page.getByTestId("office2d-toggle-sound-btn");
    await expect(office2dSoundBtn).toBeVisible();
    await expect(office2dSoundBtn).toHaveAttribute("aria-pressed", "true");
    await office2dSoundBtn.click();
    await expect(office2dSoundBtn).toHaveAttribute("aria-pressed", "false");

    // 6-E. 화이트보드 직접 그리기 -> 포스트잇 추가 -> 실시간 주석 보드 메모 입력 -> Escape 닫기
    await ensureWorkToolsDrawerOpen(page);
    await page.getByTestId("space-quick-whiteboard-btn").click();
    const whiteboardPanel = page.getByTestId("space-whiteboard-panel");
    await expect(whiteboardPanel).toBeVisible();
    const drawSvg = whiteboardPanel.locator("svg[role='img']");
    const svgBox = await drawSvg.boundingBox();
    expect(svgBox).not.toBeNull();
    await page.mouse.move(svgBox!.x + 40, svgBox!.y + 40);
    await page.mouse.down();
    await page.mouse.move(svgBox!.x + 140, svgBox!.y + 110, { steps: 5 });
    await page.mouse.up();
    await expect(drawSvg.locator("polyline")).toHaveCount(1);

    await page.getByTestId("solo-board-tab-stickies").click();
    const stickiesPanel = page.getByTestId("space-sticky-notes-panel");
    await expect(stickiesPanel).toBeVisible();
    await stickiesPanel.locator('[data-work-template="review"]').click();
    await expect(stickiesPanel).toContainText("[검수 피드백]");

    await page.getByTestId("solo-board-tab-annotation").click();
    const annotationDialog = page.getByRole("dialog", { name: "실시간 주석 보드" });
    await expect(annotationDialog).toBeVisible();
    await annotationDialog.getByRole("button", { name: "메모", exact: true }).click();
    await annotationDialog.getByPlaceholder("공유 메모").fill("3컷 배경 명암 체크 완료");
    await annotationDialog.getByRole("button", { name: "메모 놓기" }).click();
    await expect(annotationDialog).toContainText("3컷 배경 명암 체크 완료");
    await page.keyboard.press("Escape");
    await expect(annotationDialog).toHaveCount(0);

    // 6-F. 7단계 공정 바 이동 & 전체 지도 열기/닫기 & 고스트 모드(G) 끄기 버튼 실동작
    const pipelineNav = page.getByRole("navigation", { name: "웹툰 제작 공정 바로 가기" });
    await pipelineNav.getByRole("button").nth(1).click();
    await page.getByRole("button", { name: "지도", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /지도/u })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /지도/u })).toHaveCount(0);

    // 고스트 모드 토글 후 '끄기' 버튼으로 실제 해제 확인
    await page.locator("canvas.studio-office2d__canvas").click({ position: { x: 420, y: 360 } });
    await page.keyboard.press("g");
    const ghostOffBtn = page.getByTestId("space-ghost-mode-off-btn");
    await expect(ghostOffBtn).toBeVisible();
    await ghostOffBtn.click();
    await expect(ghostOffBtn).toHaveCount(0);

    // 6-G. 2D -> 3D -> 2D 왕복 전환 시 업무 상태 & 음소거 상태 동기화 유지
    await page.getByRole("button", { name: /3D 스튜디오 공간으로 전환/u }).click();
    await expect(page.locator('[data-three-stage="active"]')).toBeVisible({ timeout: 60_000 });
    await ensureWorkToolsDrawerOpen(page);
    await expect(page.getByTestId("work-status-btn-inking")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("three-toggle-sound-btn")).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("button", { name: /2D 캠퍼스로 전환/u }).click();
    await expect(page.locator('[data-office2d-stage="ready"]')).toBeVisible({ timeout: 45_000 });
    await ensureWorkToolsDrawerOpen(page);
    await expect(page.getByTestId("work-status-btn-inking")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("office2d-toggle-sound-btn")).toHaveAttribute("aria-pressed", "false");

    // 2D 7단계 공정 바·도구 행·업무 상태 바 겹침 0 확인
    const workBarOverlaps = await page.evaluate(() => {
      const rectOverlap = (a?: DOMRect, b?: DOMRect) => {
        if (!a || !b) return 0;
        const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        return Math.round(ox * oy);
      };
      const rail = document.querySelector(".studio-office2d-pipeline")?.getBoundingClientRect();
      const tools = document.querySelector(".space-top-tools-row")?.getBoundingClientRect();
      const work = document.querySelector(".space-work-status-bar")?.getBoundingClientRect();
      return {
        railWork: rectOverlap(rail, work),
        toolsWork: rectOverlap(tools, work),
      };
    });
    expect(workBarOverlaps.railWork).toBe(0);
    expect(workBarOverlaps.toolsWork).toBe(0);

    await assertNoHorizontalOverflow(page);
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
});
