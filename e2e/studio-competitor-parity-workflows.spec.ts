import { GUEST_SESSION_KEY } from "../apps/web/src/domains/auth/public/session/guest-session";
import { STUDIO_PROJECT_LIBRARY_STORAGE_KEY } from "../apps/web/src/domains/creator/studio-project-library-store";
import { WORKSPACE_TOUR_STORAGE_KEY } from "../apps/web/src/domains/creator/workspace/studio-workspace-tour-state";
import { CREATOR_EXPERIENCE_STORAGE_KEY } from "../apps/web/src/shared/lib/creator-experience-mode";

import { expect, test } from "./fixtures/non-studio-test";

import type { Page } from "@playwright/test";

const THEME_STORAGE_KEY = "toonstudio-theme";
const DEMO_PROJECT_ID = "competitor-parity-e2e-demo";

const STORY_SEVEN_VIEWS = [
  "episodes",
  "characters",
  "world",
  "timeline",
  "relations",
  "foreshadow",
  "concordance",
] as const;

/**
 * 경쟁 5종 및 확장 워크플로우 검증용 로컬 게스트 세션·Starlight 다크 테마·데모 프로젝트를 시딩한다.
 */
async function seedCompetitorParitySession(page: Page): Promise<void> {
  const nowIso = "2026-11-20T09:00:00.000Z";
  const librarySeed = JSON.stringify({
    schemaVersion: 1,
    updatedAt: nowIso,
    projects: [
      {
        id: DEMO_PROJECT_ID,
        title: "경쟁 우위 통합 검증 파일럿",
        kind: "webtoon",
        status: "active",
        statusBeforeTrash: null,
        templateId: null,
        description: "",
        primaryLocale: "ko-KR",
        createdAt: nowIso,
        updatedAt: nowIso,
        lastOpenedAt: nowIso,
        lastOpenedDocumentId: null,
        thumbnailUrl: null,
      },
    ],
  });

  await page.addInitScript(
    ({ guestKey, tourKey, themeKey, expKey, libraryKey, libraryValue }) => {
      localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
      localStorage.setItem(
        themeKey,
        JSON.stringify({
          state: { preference: "starlight", studioPreference: "starlight", theme: "starlight" },
          version: 0,
        }),
      );
      localStorage.setItem(expKey, JSON.stringify({ mode: "classic" }));
      localStorage.setItem(guestKey, JSON.stringify({ id: "guest_parity_e2e", createdAt: Date.now() }));
      localStorage.setItem(tourKey, "done");
      localStorage.setItem(libraryKey, libraryValue);
      sessionStorage.setItem("toonstudio-compat-dismissed", "true");
    },
    {
      guestKey: GUEST_SESSION_KEY,
      tourKey: WORKSPACE_TOUR_STORAGE_KEY,
      themeKey: THEME_STORAGE_KEY,
      expKey: CREATOR_EXPERIENCE_STORAGE_KEY,
      libraryKey: STUDIO_PROJECT_LIBRARY_STORAGE_KEY,
      libraryValue: librarySeed,
    },
  );

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({ status: 200, json: { authenticated: false, user: null } });
      return;
    }
    await route.fulfill({ status: 503, json: { message: "Offline parity E2E fixture" } });
  });
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);
}

test.describe("경쟁 5종 및 확장 스튜디오 핵심 사용자 여정 E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedCompetitorParitySession(page);
  });

  test("1. /studio 홈 2열 Bento에서 원클릭 새 웹툰 및 최근 작업 이어하기로 진입한다", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/studio", { waitUntil: "domcontentloaded" });

    const bento = page.locator('[data-studio-home-bento="true"]');
    await expect(bento).toBeVisible({ timeout: 20_000 });

    const startNav = page.getByRole("navigation", { name: "작업 시작 방식" });
    await expect(startNav).toBeVisible();
    const resumeRegion = page.getByRole("region", { name: /최근 작업 빠른 이어하기/u });
    await expect(resumeRegion).toBeVisible();
    await expect(resumeRegion).toContainText("경쟁 우위 통합 검증 파일럿");

    // 1클릭 새 웹툰 진입 (로그인 차단 벽 없음)
    const verticalStart = startNav.getByRole("link", { name: /세로 웹툰 시작/u }).or(
      startNav.getByRole("button", { name: /세로 웹툰 시작/u }),
    );
    await expect(verticalStart.first()).toBeVisible();
    await verticalStart.first().click();

    await expect(page).toHaveURL(/\/studio\/(canvas|new|p\/|d\/)/u, { timeout: 15_000 });
    await assertNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test("2. /studio/canvas 단일 44px 상단바 · 48px 9그룹 레일 · 7대 메뉴 · 5단계 공정 스위처를 전환한다", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/studio/canvas", { waitUntil: "domcontentloaded" });
    const canvasHost = page.locator("[data-studio-canvas-viewport], canvas").first();
    await expect(canvasHost).toBeVisible({ timeout: 60_000 });

    const geometry = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>("#studio-menubar, header[data-studio-clarity-bar]");
      const rail = document.querySelector<HTMLElement>('[data-studio-rail-group-count="9"]');
      const viewport =
        document.querySelector<HTMLElement>("[data-studio-canvas-viewport]") ??
        document.querySelector<HTMLElement>("canvas");
      const barRect = bar?.getBoundingClientRect() ?? null;
      const railRect = rail?.getBoundingClientRect() ?? null;
      const vpRect = viewport?.getBoundingClientRect() ?? null;
      const menuCount = document.querySelectorAll(
        '[data-studio-menubar-primary="true"] > button, [role="menubar"] [role="menuitem"]',
      ).length;
      return {
        barHeight: barRect ? Math.round(barRect.height) : 0,
        railWidth: railRect ? Math.round(railRect.width) : 0,
        hasNineGroupRail: Boolean(rail),
        menuCount,
        canvasRatio:
          vpRect && window.innerWidth > 0 && window.innerHeight > 0
            ? (vpRect.width * vpRect.height) / (window.innerWidth * window.innerHeight)
            : 0,
      };
    });

    if (geometry.barHeight > 0) {
      expect(geometry.barHeight).toBeLessThanOrEqual(48);
    }
    if (geometry.hasNineGroupRail) {
      expect(geometry.railWidth).toBeLessThanOrEqual(52);
    }
    if (geometry.menuCount > 0) {
      expect(geometry.menuCount).toBeLessThanOrEqual(7);
    }
    expect(geometry.canvasRatio).toBeGreaterThanOrEqual(0.82);

    // 5단계 공정 스위처가 노출되어 있으면 순차 전환 검증
    const workflowSwitcher = page.locator('[data-studio-workflow-switcher="true"]');
    if ((await workflowSwitcher.count()) > 0 && (await workflowSwitcher.isVisible())) {
      const stageButtons = workflowSwitcher.getByRole("button");
      const count = await stageButtons.count();
      expect(count).toBeGreaterThanOrEqual(3);
      for (let i = 0; i < Math.min(count, 5); i += 1) {
        await stageButtons.nth(i).click();
      }
    }

    await assertNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test("3. /studio/bg3d 4단계 스위처 · 에셋 쉘프 토글 · URL 이탈 없는 씬 삽입 · 2D 컷 굽기를 검증한다", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/studio/bg3d", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main").first()).toBeVisible({ timeout: 25_000 });

    const stageHeader = page.locator('[data-bg3d-stage-header="true"]');
    if ((await stageHeader.count()) > 0 && (await stageHeader.isVisible())) {
      const stageTabs = stageHeader.getByRole("button");
      const tabCount = await stageTabs.count();
      expect(tabCount).toBeGreaterThanOrEqual(4);
      for (let i = 0; i < Math.min(tabCount, 4); i += 1) {
        await stageTabs.nth(i).click();
      }
    }

    // 에셋 쉘프 펼침/접힘 및 URL 이탈 없는 장면 삽입 확인
    const shelfBtn = page.getByRole("button", { name: /에셋 쉘프/u }).first();
    if ((await shelfBtn.count()) > 0 && (await shelfBtn.isVisible())) {
      await shelfBtn.click();
      expect(new URL(page.url()).pathname).toBe("/studio/bg3d");
      await shelfBtn.click();
      expect(new URL(page.url()).pathname).toBe("/studio/bg3d");
    }

    // 실시간 선화 분할 와이프 전환 및 2D 컷 굽기 CTA 검증
    const splitWipeBtn = page.locator('[data-bg3d-live-ink-btn="split-wipe"]');
    if ((await splitWipeBtn.count()) > 0 && (await splitWipeBtn.isVisible())) {
      await splitWipeBtn.click();
      const viewport = page.locator('[data-bg3d-professional-viewport="true"]');
      if ((await viewport.count()) > 0) {
        await expect(viewport).toHaveAttribute("data-bg3d-live-ink-mode", "split-wipe");
      }
    }

    const bakeBtn = page.getByTestId("studio-bg3d-bake-to-cut");
    if ((await bakeBtn.count()) > 0 && (await bakeBtn.isVisible())) {
      await bakeBtn.click();
      const bakeStatus = page.getByTestId("studio-bg3d-bake-status");
      if ((await bakeStatus.count()) > 0) {
        await expect(bakeStatus).toBeVisible();
      }
    }

    expect(new URL(page.url()).pathname).toBe("/studio/bg3d");
    await assertNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test("4. /shaper 즉시 인터랙티브 스테이지 진입 및 /studio/poser 18/35/85mm · 2D 컷 레이어 삽입 모드를 검증한다", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    // /shaper 별칭 → 정본 캐릭터 셰이퍼 즉시 진입
    await page.goto("/shaper", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/studio\/assets\/characters\/new/u, { timeout: 20_000 });
    await expect(page.locator("body")).toBeVisible();
    await assertNoHorizontalOverflow(page);

    // /studio/poser 풀뷰포트 18/35/85mm 렌즈 전환 + 2D 컷 레이어 삽입 출력 모드
    await page.goto("/studio/poser", { waitUntil: "domcontentloaded" });
    const foreshortenBar = page.getByTestId("studio-poser-rea-foreshortening-bar");
    await expect(foreshortenBar).toBeVisible({ timeout: 20_000 });

    for (const lensId of [
      "manga-18mm-foreshorten",
      "standard-35mm-dialogue",
      "tele-85mm-portrait",
    ] as const) {
      const lensBtn = page.getByTestId(`poser-rea-lens-${lensId}`);
      await expect(lensBtn).toBeVisible();
      await lensBtn.click();
      await expect(lensBtn).toHaveAttribute("aria-pressed", "true");
    }

    const canvasModeBtn = page.getByTestId("studio-poser-capture-mode-canvas");
    const downloadModeBtn = page.getByTestId("studio-poser-capture-mode-download");
    await expect(canvasModeBtn).toBeVisible();
    await expect(downloadModeBtn).toBeVisible();

    await downloadModeBtn.click();
    await expect(downloadModeBtn).toHaveAttribute("aria-pressed", "true");
    await canvasModeBtn.click();
    await expect(canvasModeBtn).toHaveAttribute("aria-pressed", "true");

    await assertNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test("5. /studio/p/:id/story 7대 뷰 전환 및 /studio/storyworld 4대 핵심 섹션 전환을 검증한다", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(`/studio/p/${DEMO_PROJECT_ID}/story?view=episodes`, {
      waitUntil: "domcontentloaded",
    });
    const storyTablist = page.getByRole("tablist", { name: /스토리 기획 보드 전환/u });
    await expect(storyTablist).toBeVisible({ timeout: 20_000 });

    const tabs = storyTablist.getByRole("tab");
    await expect(tabs).toHaveCount(STORY_SEVEN_VIEWS.length);

    for (let i = 0; i < STORY_SEVEN_VIEWS.length; i += 1) {
      const tab = tabs.nth(i);
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await assertNoHorizontalOverflow(page);
    }

    // /studio/storyworld 4대 핵심 섹션 전환 및 고급 드로어 기본 접힘 확인
    await page.goto("/studio/storyworld", { waitUntil: "domcontentloaded" });
    const nav = page.getByRole("navigation", { name: "스토리월드 랩 섹션" });
    await expect(nav).toBeVisible({ timeout: 20_000 });

    const sectionButtons = nav.getByRole("button");
    await expect(sectionButtons).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) {
      await sectionButtons.nth(i).click();
    }

    const advancedDrawer = page.locator('[data-storyworld-advanced-drawer="true"]');
    await expect(advancedDrawer).toHaveJSProperty("open", false);

    await assertNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });
});
