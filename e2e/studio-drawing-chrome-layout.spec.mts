import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { buildStudioSaveNoticeFixture, STUDIO_SAVE_NOTICE_FIXTURE_EVENT } from "./helpers/studio-save-notice-fixture.mjs";

let saveNoticeBundle = "";
test.beforeAll(async () => { saveNoticeBundle = await buildStudioSaveNoticeFixture(); });

const styles = [
  "../apps/web/src/app/styles/sitewide-visual-ux.css",
  "../apps/web/src/app/styles/mobile-first-shell.css",
  "../apps/web/src/shared/styles/studio-route.css",
  "../apps/web/src/domains/creator/studio-shell/studio-visual-identity-v2.css",
  "../apps/web/src/domains/creator/studio-shell/studio-document-chrome.css",
  "../apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarity.css",
  "../apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingMobileWorkspace.css",
].map(path => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");

/** 제품 CSS와 저장 요약의 실제 중첩 구조를 사용한다. 앱의 획·저장 검증은 별도 production 검사에서 한다. */
async function mountHeader(page: Page, mobile: boolean) {
  // 데스크톱 제목 폭은 실패 실행의 실측값이며 주변 도구는 제품의 44px 타깃을 따른다. 모바일 더보기는 실제 dock에 둔다.
  await page.setContent(`<html lang="ko"${mobile ? ' data-studio-mobile-immersive="true"' : ""}><head><style>
    @layer theme,base,components,utilities;
    *,::before,::after{box-sizing:border-box;border:0 solid}
    body,h1,p{margin:0}body{font-family:Arial,sans-serif;line-height:1.5}
    button{font:inherit;color:inherit;background:transparent;padding:0}
    :root{--color-panel:#fff;--color-raised:#eee;--color-card:#fff;--color-fg:#111;--color-fg-2:#333;--color-line:#aaa;--color-accent:#1464c0;--color-accent-soft:#e8efff;--color-line-strong:#777;--color-on-accent:#fff}
    @media(prefers-color-scheme:dark){:root{--color-panel:#181818;--color-raised:#222;--color-card:#181818;--color-fg:#fff;--color-fg-2:#ddd}}
    @layer utilities{.flex{display:flex}.flex-wrap{flex-wrap:wrap}.items-center{align-items:center}.items-start{align-items:flex-start}.justify-end{justify-content:flex-end}.gap-x-2{column-gap:8px}.gap-2{gap:8px}.min-w-0{min-width:0}.flex-1{flex:1}.text-left{text-align:left}.grid{display:grid}.place-items-center{place-items:center}.size-3\\.5{width:14px;height:14px}.size-4{width:16px;height:16px}.mt-2{margin-top:8px}.mt-3{margin-top:12px}.font-semibold{font-weight:600}.space-y-3>:not([hidden])~:not([hidden]){margin-top:12px}}
  </style></head><body><main id="main-content">
    <div id="studio-app-shell" style="display:flex;flex-direction:column;min-width:0;height:100dvh" data-studio-editor="true" data-studio-drawing-clarity="true"
      ${mobile ? 'data-studio-mobile-immersive="true" data-studio-drawing-clarity-mobile="true"' : ""}>
      <header id="studio-menubar" data-studio-app-menubar="true" data-studio-drawing-clarity-header="true"
        class="studio-drawing-clarity-header${mobile ? " studio-drawing-clarity-mobile-header" : ""}">
        <button type="button" class="studio-drawing-clarity-button" aria-label="Studio로 돌아가기">←</button>
        <div class="studio-drawing-clarity-title"${mobile ? "" : ' style="flex:0 1 292.765625px"'}><h1>나의 원고</h1>
          <div id="studio-document-chrome-slot" data-studio-document-chrome-slot="true">
            <div data-studio-save-status-chrome-mount><div data-studio-save-sync-status-center class="studio-drawing-save-center">
              <button type="button" class="studio-drawing-save-summary" data-studio-drawing-save-summary="true"
                data-studio-local-save-state="empty" aria-label="저장 상태 열기" aria-describedby="notice" aria-haspopup="dialog" aria-expanded="false">
                <svg width="14" height="14" aria-hidden="true"></svg><span class="min-w-0 text-left">
                  <span data-studio-clarity-receipt="true">저장 전</span><span id="notice" class="flex flex-wrap items-center gap-x-2"
                    data-studio-connection-notice-summary="true" data-studio-drawing-save-summary="true"></span>
                </span>
              </button>
            </div></div>
          </div>
        </div>
        ${mobile ? "" : '<nav aria-label="주변 도구 자리" style="flex:1;min-height:44px"></nav>'}
        <button type="button" class="studio-drawing-clarity-button studio-drawing-clarity-save">저장</button>
      </header>
      <div id="studio-workspace" style="min-height:300px">캔버스 작업 영역</div>
      ${mobile ? '<div id="studio-drawing-clarity-mobile-more-slot"><button type="button">더보기</button></div>' : ""}
    </div>
  </main></body></html>`);
  await page.addStyleTag({ content: styles });
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) throw new Error(`필수 크롬 누락: ${selector}`);
      const rect = node.getBoundingClientRect();
      return { y: rect.y, height: rect.height };
    };
    return {
      header: box("#studio-menubar"), title: box(".studio-drawing-clarity-title"), workspace: box("#studio-workspace"),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

async function setNotices(page: Page, messages: string[]) {
  await page.locator("#notice").evaluate((slot, texts) => {
    slot.replaceChildren(...texts.map(text => {
      const notice = document.createElement("span");
      notice.dataset.studioOfflineImportant = "true";
      notice.setAttribute("role", "status");
      notice.textContent = text;
      return notice;
    }));
  }, messages);
}

for (const mobile of [false, true]) {
  for (const mode of ["light", "dark", "contrast"] as const) {
    test(`${mobile ? "모바일360" : "데스크톱1440"} ${mode}: 한 줄 안내의 삽입·해제가 캔버스 시작점을 이동하지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: mobile ? 360 : 1440, height: mobile ? 592 : 1100 });
      await page.emulateMedia({ colorScheme: mode === "dark" ? "dark" : "light", forcedColors: mode === "contrast" ? "active" : "none" });
      await mountHeader(page, mobile);
      if (mode === "contrast") await page.locator("html").evaluate(node => { node.dataset.designTheme = "contrast"; });
      const before = await geometry(page);
      expect(before.header.height).toBe(44);
      expect(before.title.height).toBe(44);
      expect(before.horizontalOverflow).toBe(0);
      const message = "일부 오프라인 도구 준비 필요";
      await setNotices(page, [message]);
      await expect(page.getByRole("status")).toHaveText(message);
      await expect(page.getByRole("status")).toBeVisible();
      const summary = page.getByRole("button", { name: "저장 상태 열기", exact: true });
      await expect(summary).toHaveAccessibleDescription(message);
      const after = await geometry(page);
      expect(after).toEqual(before);
      const noticeBox = await page.getByRole("status").boundingBox();
      expect(noticeBox).not.toBeNull();
      expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(after.title.y + after.title.height + 1);
      await summary.focus();
      await expect(summary).toBeFocused();
      await summary.click({ trial: true });
      await setNotices(page, []);
      expect(await geometry(page)).toEqual(before);
    });
  }
}

test("좁은320 화면과 두 배 글꼴에서도 경고 전문과 복구 동작에 접근하고 캔버스 시작점을 유지한다", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await mountHeader(page, true);
  await page.locator("html").evaluate(node => { node.setAttribute("lang", "en"); });
  await page.locator("[data-studio-save-status-chrome-mount]").evaluate(node => {
    node.id = "studio-save-fixture";
    node.replaceChildren();
  });
  await page.addScriptTag({ content: saveNoticeBundle });
  await expect(page.locator("[data-studio-fixture-notice-count]")).toHaveAttribute("data-studio-fixture-notice-count", "0");
  const summary = page.locator("button[data-studio-drawing-save-summary=true]");
  await summary.evaluate(node => { node.style.fontSize = "24px"; });
  const before = await geometry(page);
  expect(before.header.height).toBe(44);
  expect(before.title.height).toBe(44);
  expect(before.horizontalOverflow).toBe(0);
  const messages = ["Offline tools could not be prepared · Check again", "Storage about 95% full · Back up your work"];
  const updateNotices = async (texts: string[]) => {
    await page.evaluate(({ event, messages }) => {
      window.dispatchEvent(new CustomEvent(event, { detail: messages }));
    }, { event: STUDIO_SAVE_NOTICE_FIXTURE_EVENT, messages: texts });
    await expect(page.locator("[data-studio-fixture-notice-count]")).toHaveAttribute("data-studio-fixture-notice-count", String(texts.length));
  };
  await updateNotices(messages);
  await expect(page.getByRole("status")).toHaveText(messages);
  await expect(summary).toHaveAccessibleDescription(messages.join(" "));
  expect(await geometry(page)).toEqual(before);
  const summaryBounds = await summary.evaluate(button => {
    const notice = button.querySelector("[data-studio-offline-important]");
    if (!notice?.firstChild) throw new Error("첫 번째 중요한 안내가 없습니다.");
    const text = notice.firstChild, rect = button.getBoundingClientRect();
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, "Offline".length);
    const firstWord = range.getBoundingClientRect(), style = getComputedStyle(notice);
    return {
      firstWord: { left: firstWord.left, right: firstWord.right, top: firstWord.top, bottom: firstWord.bottom },
      button: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height },
      fontSize: Number.parseFloat(style.fontSize), lineHeight: Number.parseFloat(style.lineHeight),
    };
  });
  expect(summaryBounds.button.height).toBe(44);
  expect(summaryBounds.fontSize).toBe(24);
  expect(summaryBounds.lineHeight).toBeGreaterThanOrEqual(summaryBounds.fontSize);
  expect(summaryBounds.firstWord.left).toBeGreaterThanOrEqual(summaryBounds.button.left);
  expect(summaryBounds.firstWord.right).toBeLessThanOrEqual(summaryBounds.button.right);
  expect(summaryBounds.firstWord.top).toBeGreaterThanOrEqual(summaryBounds.button.top);
  expect(summaryBounds.firstWord.bottom).toBeLessThanOrEqual(summaryBounds.button.bottom + 1);
  await summary.focus();
  await expect(summary).toBeFocused();
  await testInfo.attach("320px-large-font-summary", { body: await page.screenshot(), contentType: "image/png" });
  await summary.press("Enter");
  const dialog = page.getByRole("dialog", { name: /저장과 복구|Save and recovery/u });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(summary).toHaveAttribute("aria-expanded", "true");
  await expect(dialog.getByRole("button", { name: /닫기|Close/u })).toBeFocused();
  await dialog.locator("[data-studio-connection-notice-details]").evaluate(node => { node.style.fontSize = "24px"; });
  const fullNotices = dialog.locator("[data-studio-fixture-notice-full]");
  await expect(fullNotices).toHaveText(messages);
  for (const notice of await fullNotices.all()) {
    await notice.scrollIntoViewIfNeeded();
    await expect(notice).toBeVisible();
    const bounds = await notice.evaluate(node => {
      const content = node.closest(".studio-drawing-dialog-content");
      if (!(content instanceof HTMLElement)) throw new Error("스크롤 가능한 저장 상세가 없습니다.");
      const container = content.getBoundingClientRect(), range = document.createRange();
      range.selectNodeContents(node);
      return {
        overflow: content.scrollWidth - content.clientWidth,
        text: [...range.getClientRects()].map(rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })),
        container: { left: container.left, right: container.right, top: container.top, bottom: container.bottom },
      };
    });
    expect(bounds.overflow).toBeLessThanOrEqual(1);
    expect(bounds.text.length).toBeGreaterThan(1);
    for (const rect of bounds.text) {
      expect(rect.left).toBeGreaterThanOrEqual(bounds.container.left);
      expect(rect.right).toBeLessThanOrEqual(bounds.container.right);
      expect(rect.top).toBeGreaterThanOrEqual(bounds.container.top - 1);
      expect(rect.bottom).toBeLessThanOrEqual(bounds.container.bottom + 1);
    }
  }
  await testInfo.attach("320px-large-font-warning-details", { body: await page.screenshot(), contentType: "image/png" });
  expect(await geometry(page)).toEqual(before);
  await dialog.getByRole("button", { name: /지금 다시 시도|Retry now|Try again now/u }).click();
  await expect(page.locator("[data-studio-fixture-retries]")).toHaveAttribute("data-studio-fixture-retries", "1");
  await dialog.locator("[data-studio-download-local-backup=true]").click();
  await expect(page.locator("[data-studio-fixture-backups]")).toHaveAttribute("data-studio-fixture-backups", "1");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(summary).toBeFocused();
  await expect(summary).toHaveAccessibleDescription(messages.join(" "));
  await summary.getByRole("status").first().click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /닫기|Close/u }).click();
  await expect(summary).toBeFocused();
  await updateNotices([]);
  expect(await geometry(page)).toEqual(before);
});
