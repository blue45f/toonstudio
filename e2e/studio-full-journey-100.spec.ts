import { expect, test } from "./fixtures/non-studio-test";

import type { Page } from "@playwright/test";

/**
 * ToonStudio 전체 제작 여정 E2E (AC-014 · 100% 완주 스펙).
 *
 * `vite preview` 프로덕션 번들 대상으로 아래 9단계 실작동 흐름을 검증한다:
 *   1) 프로덕션 프리뷰 번들 확인(/ @vite/client 부재) 및 게스트 진입(/studio)
 *   2) 새 프로젝트 생성(/studio/new 3단계 양식 -> 실프로젝트 저장)
 *   3) 2D 캔버스 드로잉 · Undo / Redo
 *   4) 3D 배경(/studio/bg3d) · 3D 캐릭터(/studio/assets/characters/new) 접근
 *   5) 소재 탐색 및 적용(/studio/assets?view=essentials)
 *   6) 오프라인 편집(setOffline(true)) -> 온라인 재연결 -> 리로드 복원
 *   7) 통합 프리플라이트 점검(/studio/projects/:id/export)
 *   8) 내보내기 경로 검증(PNG · PSD · ZIP/CBZ)
 */

async function installOfflineGuestRoutes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        "toonstudio-lang",
        JSON.stringify({ state: { lang: "ko" }, version: 0 }),
      );
      sessionStorage.setItem("toonstudio-compat-dismissed", "true");
      localStorage.setItem("toonstudio.canvas-start-dock.v1", "collapsed");
    } catch {
      // 초기 문서 컨텍스트에서 스토리지 접근이 제한되면 기본 설정으로 계속 진행한다.
    }
  });

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/api\/auth\/session$/u.test(pathname)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: false, user: null }),
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
    if (/\/api\/health\/capabilities$/u.test(pathname)) {
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
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "LOCAL_PREVIEW_MOCK_UNAVAILABLE" }),
    });
  });
}

async function waitForStudioEditorReady(page: Page): Promise<void> {
  const editor = page.locator('[data-studio-editor="true"]');
  await expect(editor).toBeVisible({ timeout: 60_000 });
  const viewport = editor.locator("[data-studio-canvas-viewport]").first();
  await expect(viewport).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(
      () => page.locator('[aria-busy="true"], [data-studio-lazy-surface]').count(),
      { timeout: 60_000 },
    )
    .toBe(0);
}

async function drawDiagonalStrokeOnCanvas(
  page: Page,
  offsetFactor = 0,
): Promise<void> {
  const penButton = page
    .locator('[data-studio-rail-tool-id="pen"]')
    .filter({ visible: true })
    .first();
  if ((await penButton.count()) > 0) {
    await penButton.click();
  }

  const viewport = page.locator("[data-studio-canvas-viewport]").first();
  const box = await viewport.boundingBox();
  if (!box) {
    throw new Error("2D 캔버스 뷰포트 영역을 찾지 못했습니다.");
  }

  const startX = box.x + box.width * (0.28 + offsetFactor * 0.08);
  const startY = box.y + box.height * (0.3 + offsetFactor * 0.06);
  const endX = box.x + box.width * (0.64 + offsetFactor * 0.05);
  const endY = box.y + box.height * (0.62 + offsetFactor * 0.05);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 6 });
  await page.mouse.move(endX, endY, { steps: 6 });
  await page.mouse.up();
}

async function openEditorExportMenu(page: Page): Promise<void> {
  const existingPanel = page.locator('[data-studio-export-menu-panel="true"]');
  if (await existingPanel.isVisible().catch(() => false)) {
    return;
  }

  const directExportBtn = page
    .locator('[data-studio-clarity-export-btn="true"], [data-studio-workflow-stage="export"]')
    .filter({ visible: true })
    .first();
  if ((await directExportBtn.count()) > 0) {
    await directExportBtn.click();
    await expect(existingPanel).toBeVisible({ timeout: 20_000 });
    return;
  }

  const clarityMore = page.locator('[data-studio-clarity-more-trigger="true"]').first();
  if (await clarityMore.isVisible().catch(() => false)) {
    await clarityMore.click();
    const exportAction = page
      .locator('[data-studio-clarity-action="export"]')
      .or(page.getByRole("button", { name: /원고 내보내기|내보내기|출력 설정/u }))
      .first();
    if (await exportAction.isVisible().catch(() => false)) {
      await exportAction.click();
    }
  }

  await expect(existingPanel).toBeVisible({ timeout: 20_000 });
}

test.describe("ToonStudio 전체 제작 여정 E2E (프로덕션 프리뷰)", () => {
  test("게스트 진입 → 프로젝트 생성 → 2D 드로잉·Undo/Redo → 3D 배경·캐릭터 → 소재 탐색 → 오프라인 편집·리로드 복원 → 통합 프리플라이트 → PNG/PSD/ZIP 내보내기", async ({
    context,
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await installOfflineGuestRoutes(page);

    // 1. 게스트 진입 (/studio) + 프로덕션 프리뷰 번들 확인
    await test.step("1) 게스트 진입 및 프로덕션 번들 확인", async () => {
      await page.goto("/studio", { waitUntil: "domcontentloaded" });
      await expect(page.locator("#main-content h1, main h1").first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.locator('button[data-auth-trigger="signed-out"]').first(),
      ).toBeVisible({ timeout: 15_000 });
      // 프로덕션 preview 실행 시 Vite dev 클라이언트 스크립트가 없어야 한다.
      if (process.env.TOONSTUDIO_E2E_PREVIEW === "1") {
        await expect(page.locator('script[src*="/@vite/client"]')).toHaveCount(0);
      }
    });

    // 2. 새 프로젝트 생성 (/studio/new 3단계 양식)
    const projectTitle = "전체여정 E2E 검증 원고";
    let createdProjectId = "";
    let editorUrl = "";

    await test.step("2) 새 프로젝트 생성 및 로컬 라이브러리 저장", async () => {
      await page.goto("/studio/new?kind=webtoon&template=webtoon-vertical", {
        waitUntil: "domcontentloaded",
      });
      const form = page.locator('[data-studio-create-form="true"]');
      await expect(form).toBeVisible({ timeout: 20_000 });

      const step1Next = form.locator('[data-studio-create-step-next="1"]');
      if (await step1Next.isVisible().catch(() => false)) {
        await step1Next.click();
      }

      const titleInput = form.getByLabel("프로젝트 이름");
      await expect(titleInput).toBeVisible({ timeout: 10_000 });
      await titleInput.fill(projectTitle);

      const step2Next = form.locator('[data-studio-create-step-next="2"]');
      if (await step2Next.isVisible().catch(() => false)) {
        await step2Next.click();
      }

      const submitButton = form.locator('button[type="submit"]').first();
      await expect(submitButton).toBeVisible({ timeout: 10_000 });
      await submitButton.click();

      await expect
        .poll(
          async () => {
            const raw = await page.evaluate(() =>
              localStorage.getItem("toonspectrum:studio-project-library:v1"),
            );
            if (!raw) return "";
            const parsed = JSON.parse(raw) as {
              projects?: Array<{ id?: string; title?: string }>;
            };
            const matched = parsed.projects?.find((entry) => entry.title === projectTitle);
            return matched?.id ?? "";
          },
          { timeout: 20_000 },
        )
        .not.toBe("");

      createdProjectId = await page.evaluate((targetTitle) => {
        const raw = localStorage.getItem("toonspectrum:studio-project-library:v1");
        if (!raw) return "";
        const parsed = JSON.parse(raw) as {
          projects?: Array<{ id?: string; title?: string }>;
        };
        return parsed.projects?.find((entry) => entry.title === targetTitle)?.id ?? "";
      }, projectTitle);

      expect(createdProjectId.length).toBeGreaterThan(0);

      // 프로젝트 생성 착지 화면이 개요 페이지이면 로컬 편집기로 진입한다.
      await page.waitForTimeout(400);
      const currentPath = new URL(page.url()).pathname;
      if (
        !currentPath.includes("/documents/") &&
        !currentPath.includes("/draft/") &&
        !currentPath.includes("/canvas")
      ) {
        await page.goto(`/studio/draft/${encodeURIComponent(createdProjectId)}`, {
          waitUntil: "domcontentloaded",
        });
      }
      await waitForStudioEditorReady(page);
      editorUrl = page.url();
    });

    // 3. 2D 캔버스 드로잉 및 Undo/Redo
    await test.step("3) 2D 캔버스 드로잉 및 Undo/Redo", async () => {
      await drawDiagonalStrokeOnCanvas(page, 0);
      const shortcutModifier = process.platform === "darwin" ? "Meta" : "Control";
      await page.keyboard.press(`${shortcutModifier}+z`);
      await page.waitForTimeout(150);
      await page.keyboard.press(`${shortcutModifier}+Shift+z`);
      await page.waitForTimeout(150);

      // 드로잉·Undo/Redo 이후에도 캔버스 뷰포트가 정상 유지된다.
      await expect(page.locator("[data-studio-canvas-viewport]").first()).toBeVisible();
    });

    // 4. 3D 배경(/studio/bg3d) 및 3D 캐릭터(/studio/assets/characters/new) 페이지 접근
    await test.step("4) 3D 배경 및 3D 캐릭터 페이지 접근", async () => {
      await page.goto("/studio/bg3d", { waitUntil: "domcontentloaded" });
      const bg3dMain = page.locator("#main-content, main").first();
      await expect(bg3dMain).toBeVisible({ timeout: 30_000 });
      await expect(
        bg3dMain.locator("h1, h2, canvas").filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await page.goto("/studio/assets/characters/new", { waitUntil: "domcontentloaded" });
      const shaperMain = page.locator("#main-content, main").first();
      await expect(shaperMain).toBeVisible({ timeout: 30_000 });
      await expect(
        shaperMain.locator("h1, h2, canvas").filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30_000 });
    });

    // 5. 소재 탐색 및 적용(/studio/assets?view=essentials)
    await test.step("5) 소재 허브 탐색 및 CC0 기본 소재 확인", async () => {
      await page.goto("/studio/assets", { waitUntil: "domcontentloaded" });
      await expect(page.locator("#main-content, main").first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText(/무료 제작 소재 48종|브러시|소재/u).first()).toBeVisible({
        timeout: 20_000,
      });

      await page.goto("/studio/assets?view=essentials", { waitUntil: "domcontentloaded" });
      await expect(page.locator("#main-content, main").first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.locator("article, button, a").first()).toBeVisible({
        timeout: 15_000,
      });
    });

    // 6. 오프라인 편집 → 재연결 → 리로드 복원
    await test.step("6) 오프라인 편집 → 재연결 → 리로드 복원", async () => {
      await page.goto(editorUrl, { waitUntil: "domcontentloaded" });
      await waitForStudioEditorReady(page);
      // 온라인 상태에서 펜 도구·지연 청크를 예열한 뒤 오프라인 전환한다.
      await drawDiagonalStrokeOnCanvas(page, 0);
      await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);

      await context.setOffline(true);
      await drawDiagonalStrokeOnCanvas(page, 1);
      await page.waitForTimeout(300);
      await expect(page.locator("[data-studio-canvas-viewport]").first()).toBeVisible();

      await context.setOffline(false);
      await page.evaluate(() => {
        window.dispatchEvent(new Event("online"));
      });
      await page.waitForTimeout(400);

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForStudioEditorReady(page);

      // 리로드 후에도 로컬 프로젝트 라이브러리에 방금 만든 프로젝트가 보존되어 있어야 한다.
      const restoredTitle = await page.evaluate((id) => {
        const raw = localStorage.getItem("toonspectrum:studio-project-library:v1");
        if (!raw) return "";
        const parsed = JSON.parse(raw) as {
          projects?: Array<{ id?: string; title?: string }>;
        };
        return parsed.projects?.find((entry) => entry.id === id)?.title ?? "";
      }, createdProjectId);
      expect(restoredTitle).toBe(projectTitle);
    });

    // 7. 통합 프리플라이트 점검 (/studio/p/:projectId/export)
    await test.step("7) 통합 프리플라이트 점검 실행", async () => {
      await page.goto(`/studio/p/${encodeURIComponent(createdProjectId)}/export`, {
        waitUntil: "domcontentloaded",
      });
      const exportPanel = page.getByTestId("studio-export-panel");
      await expect(exportPanel).toBeVisible({ timeout: 25_000 });

      const profileGroup = page.getByTestId("studio-export-publish-profiles");
      await expect(profileGroup).toBeVisible();

      const runPreflightButton = exportPanel.getByRole("button", {
        name: /현재 상태 검사/u,
      });
      await expect(runPreflightButton).toBeVisible();
      await runPreflightButton.click();

      await expect(page.getByTestId("studio-export-commercial-gate-summary")).toBeVisible();
      await expect(page.getByTestId("studio-export-psd-timelapse-spec")).toBeVisible();
      await expect(page.getByTestId("studio-export-finalize-link")).toBeVisible();
    });

    // 8. 내보내기 경로 (PNG / PSD / ZIP·CBZ)
    await test.step("8) 편집기 내보내기 패널 PNG · PSD · ZIP/CBZ 경로 검증", async () => {
      await page.goto(editorUrl, { waitUntil: "domcontentloaded" });
      await waitForStudioEditorReady(page);
      await openEditorExportMenu(page);

      const exportMenu = page.locator('[data-studio-export-menu-panel="true"]');
      await expect(exportMenu).toBeVisible();

      // 8-a. PNG 형식 선택 및 현재 페이지 PNG 다운로드 검증
      const pngButton = exportMenu.getByRole("button", { name: "PNG", exact: true });
      await expect(pngButton).toBeVisible();
      await pngButton.click();
      await expect(pngButton).toHaveAttribute("aria-pressed", "true");

      const pngDownloadButton = exportMenu.getByRole("button", {
        name: /현재 페이지 PNG 다운로드/u,
      });
      await expect(pngDownloadButton).toBeVisible();
      const [pngDownload] = await Promise.all([
        page.waitForEvent("download", { timeout: 30_000 }),
        pngDownloadButton.click(),
      ]);
      expect(pngDownload.suggestedFilename().toLowerCase()).toMatch(/\.png$/u);

      // 다운로드 후 팝오버가 자동으로 닫힐 수 있으므로 필요 시 출력 패널을 다시 연다.
      await openEditorExportMenu(page);

      // 8-b. 다른 편집기용 파일 섹션 열기 -> PSD(레이어별) 다운로드 경로 검증
      const exchangeDetails = exportMenu.locator('details[data-studio-export-section="exchange"]');
      await expect(exchangeDetails).toBeVisible({ timeout: 10_000 });
      const exchangeOpen = await exchangeDetails.evaluate((el) => el.hasAttribute("open"));
      if (!exchangeOpen) {
        await exchangeDetails.locator("summary").click();
      }

      const psdButton = exportMenu.getByRole("button", { name: /PSD \(레이어별\)/u });
      await expect(psdButton).toBeVisible({ timeout: 10_000 });
      const [psdDownload] = await Promise.all([
        page.waitForEvent("download", { timeout: 30_000 }),
        psdButton.click(),
      ]);
      expect(psdDownload.suggestedFilename().toLowerCase()).toMatch(/\.psd$/u);

      // 8-c. ZIP 기반 출력 경로 (정사각 낱장 ZIP 또는 CBZ 만화 ZIP 패키지) 검증
      await openEditorExportMenu(page);
      const exchangeDetailsForArchive = exportMenu.locator(
        'details[data-studio-export-section="exchange"]',
      );
      if (await exchangeDetailsForArchive.isVisible().catch(() => false)) {
        const stillOpen = await exchangeDetailsForArchive.evaluate((el) =>
          el.hasAttribute("open"),
        );
        if (!stillOpen) {
          await exchangeDetailsForArchive.locator("summary").click();
        }
      }
      const zipOrCbzButton = exportMenu
        .getByRole("button", { name: /정사각 낱장 ZIP|CBZ/u })
        .first();
      await expect(zipOrCbzButton).toBeVisible({ timeout: 10_000 });
      const [archiveDownload] = await Promise.all([
        page.waitForEvent("download", { timeout: 30_000 }),
        zipOrCbzButton.click(),
      ]);
      expect(archiveDownload.suggestedFilename().toLowerCase()).toMatch(/\.(zip|cbz)$/u);
    });

    expect(pageErrors).toEqual([]);
  });
});
