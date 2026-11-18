import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  STUDIO_BETA_NOTICE_REVISION,
  STUDIO_BETA_NOTICE_STORAGE_KEY,
} from "../apps/web/src/domains/creator/studio-beta-notice-storage";
import {
  openStudioBg3dProfessionalMode,
  selectStudioBg3dTaskTab,
} from "../scripts/lib/studio-bg3d-ui-interactions";

const TEST_CREATOR_SESSION = {
  user: {
    id: "11111111-2222-4333-8444-555555555555",
    name: "테스트 크리에이터",
    email: "creator-test@toonstudio.dev",
    image: null,
    role: "creator",
  },
  expires: new Date(Date.now() + 86_400_000).toISOString(),
};

function attachCleanBrowserDiagnostics(page: Page): string[] {
  const fatalErrors: string[] = [];
  page.on("pageerror", (error) => {
    fatalErrors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (text.includes("Failed to load resource") || text.includes("/api/")) {
      return;
    }
    fatalErrors.push(`console.error: ${text.slice(0, 240)}`);
  });
  return fatalErrors;
}

async function prepareStudioStorage(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(
    ({ session, betaKey, betaRev }) => {
      localStorage.setItem("toonstudio-auth-session-v1", JSON.stringify(session));
      localStorage.setItem("toonstudio-studio-quick-start-dismissed", "1");
      localStorage.setItem("toonstudio-studio-mobile-hint-dismissed", "1");
      localStorage.setItem(betaKey, betaRev);
      sessionStorage.setItem("toonstudio-compat-dismissed", "true");
    },
    {
      session: TEST_CREATOR_SESSION,
      betaKey: STUDIO_BETA_NOTICE_STORAGE_KEY,
      betaRev: STUDIO_BETA_NOTICE_REVISION,
    },
  );
}

test.describe("Studio 3D V30~V31 장르 확장 · 세부 히어로 소품 · 초성 검색 실브라우저 UX 검증", () => {
  test("모델링 작업대(/studio/3d/dcc/model) 19개 서랍 초성 검색·V31 실파일 임포트·GLB 손상 차단·반응형·접근성을 통과한다", async ({
    page,
  }) => {
    const fatalErrors = attachCleanBrowserDiagnostics(page);
    await prepareStudioStorage(page);
    await page.setViewportSize({ width: 1440, height: 960 });

    await page.goto("/studio/3d/dcc/model", { waitUntil: "domcontentloaded" });
    const panel = page.locator('[data-studio-hybrid-dcc-panel="true"]');
    await expect(panel).toBeVisible({ timeout: 90_000 });

    await page.getByRole("button", { name: "큐브로 시작" }).click();
    const stats = panel.locator('[data-studio-hybrid-dcc-stats="true"]');
    await expect(stats).toHaveAttribute("data-assets", "1");

    const searchInput = page.getByLabel("CC0 에셋 서랍 초성·키워드 통합 검색");
    await expect(searchInput).toBeVisible();

    // 1. V31 학원물 사물함 초성("ㅅㅁㅎ") 검색 및 실제 수밀 GLB 네트워크 로드·임포트 검증
    await searchInput.fill("ㅅㅁㅎ");
    const lockerBtn = page.locator(
      '[data-studio-hybrid-dcc-kit-item="webtoon-prop-academy-locker-shoebox-bank-v31"]',
    );
    await expect(lockerBtn).toBeVisible();
    const lockerBox = await lockerBtn.boundingBox();
    expect(lockerBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    await lockerBtn.click();
    await expect
      .poll(async () => Number(await stats.getAttribute("data-assets")))
      .toBeGreaterThan(1);

    // 2. 손상된 GLB 헤더 응답 시 뷰포트 진입 전 사전 차단 알림 검증
    await page.route(
      "**/studio-assets/blender-genre-expansion-v30/webtoon-genre-noir-venetian-detective-v30.glb",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "model/gltf-binary",
          body: Buffer.from([0x00, 0x01, 0x02, 0x03]),
        });
      },
    );
    await searchInput.fill("ㄴㅇㄹ");
    const noirBtn = page.locator(
      '[data-studio-hybrid-dcc-kit-item="webtoon-genre-noir-venetian-detective-v30"]',
    );
    await expect(noirBtn).toBeVisible();
    await noirBtn.click();
    await expect(
      panel.getByRole("alert").filter({ hasText: "GLB 2.0 바이너리 무결성 검증 실패" }),
    ).toBeVisible();

    await page.getByTestId("studio-hybrid-dcc-kit-search-clear").click();
    await expect(searchInput).toHaveValue("");

    // 3. WCAG AA 접근성(색상 대비·이름·라벨) 검증
    const a11y = await new AxeBuilder({ page })
      .include('[data-studio-hybrid-dcc-primitive-bar="true"]')
      .withRules(["color-contrast", "button-name", "label"])
      .analyze();
    expect(a11y.violations).toEqual([]);

    // 4. 모바일(390×844) 뷰포트 가로 오버플로 무결성 검증
    await page.setViewportSize({ width: 390, height: 844 });
    const overflowPx = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflowPx).toBeLessThanOrEqual(1);
    expect(fatalErrors).toEqual([]);
  });

  test("배경 3D 작업대(/studio/bg3d)에서 V30 8대 장르 시나리오 러너와 V31 세부 히어로 소품 바가 무오류로 연동된다", async ({
    page,
  }) => {
    const fatalErrors = attachCleanBrowserDiagnostics(page);
    await prepareStudioStorage(page);
    await page.setViewportSize({ width: 1440, height: 960 });

    await page.goto("/studio/bg3d", { waitUntil: "domcontentloaded" });
    const dialog = page.getByTestId("studio-bg3d-dialog");
    await expect(dialog).toBeVisible({ timeout: 90_000 });

    await openStudioBg3dProfessionalMode(dialog, 30_000);
    await selectStudioBg3dTaskTab(dialog, "view", 30_000);

    const workbenchToggle = dialog.getByTestId(
      "bg3d-advanced-workbench-launcher-toggle",
    );
    await workbenchToggle.scrollIntoViewIfNeeded();
    await workbenchToggle.click();

    const fantasyTab = dialog.getByTestId(
      "bg3d-workbench-tab-blender-fantasy-webtoon",
    );
    await expect(fantasyTab).toBeVisible({ timeout: 30_000 });
    await fantasyTab.click();

    const macroBar = dialog.getByTestId("bg3d-blender-v30-macro-scenario-bar");
    const heroPropsBar = dialog.getByTestId("bg3d-blender-v31-hero-props-bar");
    await macroBar.scrollIntoViewIfNeeded();
    await expect(macroBar).toBeVisible();
    await expect(heroPropsBar).toBeVisible();
    await expect(
      dialog.getByTestId("bg3d-blender-v31-drawer-count-badge"),
    ).toContainText("19종");

    await dialog
      .getByTestId("bg3d-blender-v30-scenario-noir-blind-interrogation")
      .click();
    await expect(
      dialog.getByTestId("bg3d-blender-v31-prop-readout"),
    ).toContainText("ㅅㅅㅂㄷ");

    await dialog.getByTestId("bg3d-blender-v30-run-macro-btn").click();
    await expect(
      dialog.getByTestId("bg3d-blender-v30-genre-count-badge"),
    ).toContainText("실행 1회");
    await expect(
      dialog.getByTestId("bg3d-blender-v29-duo-readout"),
    ).toContainText("182×168cm");

    await dialog
      .getByTestId("bg3d-blender-v31-prop-hunter-srank-obelisk")
      .click();
    await expect(
      dialog.getByTestId("bg3d-blender-v31-prop-readout"),
    ).toContainText("ㄱㅅㅂㅅ");
    await expect(
      dialog.getByTestId("bg3d-blender-v31-prop-roi-readout"),
    ).toContainText("41.6h");

    const macroA11y = await new AxeBuilder({ page })
      .include('[data-testid="bg3d-blender-v30-macro-scenario-bar"]')
      .withRules(["color-contrast", "button-name"])
      .analyze();
    expect(macroA11y.violations).toEqual([]);
    expect(fatalErrors).toEqual([]);
  });
});
