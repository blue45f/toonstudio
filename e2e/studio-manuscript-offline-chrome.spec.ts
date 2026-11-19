import { expect, test, type Page } from "@playwright/test";

import { STUDIO_OFFLINE_AUTOMATION_EVENT } from "../apps/web/src/domains/creator/offline/studio-offline-automation";

import { installGuestOfflineEnvironment } from "./helpers/studio-editor-a11y";

test.beforeEach(async ({ page }) => {
  // 실제 원고 화면을 게스트로 열고, 각 검사의 연결 상태 응답은 뒤에서 구체적으로 등록한다.
  await installGuestOfflineEnvironment(page, { dismissStartDock: true });
});

async function openManuscriptHeader(page: Page) {
  await page.goto("/studio/draft/compact-header-offline-status?language=ko", { waitUntil: "domcontentloaded" });
  const header = page.locator("[data-studio-drawing-clarity-header=true]");
  const canvas = page.locator("[data-studio-canvas-viewport]").first();
  const summary = header.getByRole("button", { name: /^저장 상태 열기/ });
  const notice = summary.locator("[data-studio-offline-important=true]");
  await page.locator("[data-studio-offline-panel][data-studio-offline-presentation=status-center]").waitFor({ state: "attached", timeout: 60_000 });
  await expect(canvas).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return { header, canvas, summary, notice };
}

async function offlinePhase(page: Page, phase: "partial" | "ready") {
  await page.evaluate(({ event, phase }) => {
    window.dispatchEvent(new CustomEvent(event, { detail: { phase, message: phase } }));
  }, { event: STUDIO_OFFLINE_AUTOMATION_EVENT, phase });
}

test("1280 원고에서 일곱 빠른 메뉴와 오프라인 안내가 캔버스 원점을 유지한다", async ({ page }) => {
  // 실제 상태 패널에 단일 도구 준비 안내만 발생하도록 연결 확인 응답을 고정한다.
  await page.route("**/api/health/capabilities*", route => route.fulfill({
    json: { status: "ready", capabilities: { studioProjectRead: "available", studioCloudSave: "available" } },
  }));
  await page.setViewportSize({ width: 1280, height: 900 });
  const { header, canvas, summary, notice } = await openManuscriptHeader(page);
  await offlinePhase(page, "ready");
  await expect(notice).toHaveCount(0);
  const before = await canvas.boundingBox();
  expect(before).not.toBeNull();
  await offlinePhase(page, "partial");
  const message = "일부 오프라인 도구 준비 필요";
  await expect(notice).toHaveText(message);
  await expect(summary).toHaveAccessibleDescription(message);
  expect(await canvas.boundingBox()).toEqual(before);
  const noticeLines = await notice.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getClientRects().length;
  });
  expect(noticeLines).toBe(1);
  const menu = header.getByRole("navigation", { name: "원고 빠른 메뉴" });
  for (const name of ["파일", "편집", "컷·원고", "레이어", "필터", "3D·캐릭터", "협업·검수"]) {
    const button = menu.getByRole("menuitem", { name, exact: true }).or(menu.getByRole("button", { name, exact: true }));
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await button.focus();
    await expect(button).toBeFocused();
  }
  await offlinePhase(page, "ready");
  await expect(notice).toHaveCount(0);
  expect(await canvas.boundingBox()).toEqual(before);
});

test("1280·390 원고에서 연결 복구와 오프라인 도구 준비를 함께 읽어도 캔버스 원점을 유지한다", async ({ page }) => {
  await page.route("**/api/health/capabilities*", route => route.fulfill({ status: 503, json: { status: "unavailable" } }));
  const retryMessage = "연결 복구 후 재시도";
  const message = "일부 오프라인 도구 준비 필요";
  for (const size of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await test.step(`${size.width}px에서 두 안내를 추가하고 해제한다`, async () => {
      await page.setViewportSize(size);
      const { header, canvas, summary, notice } = await openManuscriptHeader(page);
      const title = header.locator(".studio-drawing-clarity-title");
      const retry = summary.locator("[data-studio-draft-save-attention]");
      await expect(retry).toHaveText(retryMessage);
      await offlinePhase(page, "ready");
      await expect(summary).toHaveAccessibleDescription(retryMessage);
      const origin = await canvas.boundingBox();
      const titleBox = await title.boundingBox();
      expect(origin).not.toBeNull();
      expect(titleBox).not.toBeNull();

      await offlinePhase(page, "partial");
      await expect(summary).toHaveAccessibleDescription(`${retryMessage} ${message}`);
      const hit = await summary.boundingBox();
      if (!hit) throw new Error("저장 상태 버튼의 터치 영역이 없습니다.");
      expect(hit.width).toBeGreaterThanOrEqual(44);
      expect(hit.height).toBeGreaterThanOrEqual(44);
      for (const [label, expected] of [[retry, retryMessage], [notice, message]] as const) {
        await expect(label).toHaveText(expected);
        await expect(label).toBeVisible();
        const lines = await label.evaluate(node => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return Array.from(range.getClientRects(), rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }));
        });
        expect(lines).toHaveLength(1);
        expect(lines[0].left).toBeGreaterThanOrEqual(hit.x - 1);
        expect(lines[0].right).toBeLessThanOrEqual(hit.x + hit.width + 1);
        expect(lines[0].top).toBeGreaterThanOrEqual(hit.y - 1);
        expect(lines[0].bottom).toBeLessThanOrEqual(hit.y + hit.height + 1);
      }
      expect(await title.boundingBox()).toEqual(titleBox);
      expect(await canvas.boundingBox()).toEqual(origin);
      await offlinePhase(page, "ready");
      await expect(notice).toHaveCount(0);
      await expect(summary).toHaveAccessibleDescription(retryMessage);
      expect(await title.boundingBox()).toEqual(titleBox);
      expect(await canvas.boundingBox()).toEqual(origin);
    });
  }
});
