import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { STUDIO_OFFLINE_AUTOMATION_EVENT } from "../apps/web/src/domains/creator/offline/studio-offline-automation";

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
  // 데스크톱의 제목 폭과 주변 도구 높이는 실패 실행의 실측값이다. 모바일 더보기는 실제 dock으로 이동한 구조다.
  await page.setContent(`<html lang="ko"${mobile ? ' data-studio-mobile-immersive="true"' : ""}><head><style>
    @layer theme,base,components,utilities;
    *,::before,::after{box-sizing:border-box;border:0 solid}
    body,h1{margin:0}body{font-family:Arial,sans-serif;line-height:1.5}
    button{font:inherit;color:inherit;background:transparent;padding:0}
    :root{--color-panel:#fff;--color-raised:#eee;--color-card:#fff;--color-fg:#111;--color-fg-2:#333;--color-line:#aaa;--color-accent:#1464c0;--color-accent-soft:#e8efff;--color-line-strong:#777;--color-on-accent:#fff}
    @media(prefers-color-scheme:dark){:root{--color-panel:#181818;--color-raised:#222;--color-card:#181818;--color-fg:#fff;--color-fg-2:#ddd}}
    @layer utilities{.flex{display:flex}.flex-wrap{flex-wrap:wrap}.items-center{align-items:center}.gap-x-2{column-gap:8px}.min-w-0{min-width:0}.text-left{text-align:left}}
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
        ${mobile ? "" : '<nav aria-label="주변 도구 자리" style="flex:1;min-height:52px"></nav>'}
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
    return { header: box("#studio-menubar"), title: box(".studio-drawing-clarity-title"), workspace: box("#studio-workspace") };
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
      expect(before.title.height).toBeGreaterThanOrEqual(55);
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

test("좁은320 화면과 두 배 글꼴에서도 긴 영문·복수 안내를 자르지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await mountHeader(page, true);
  await page.locator("html").evaluate(node => { node.setAttribute("lang", "en"); });
  const summary = page.getByRole("button", { name: "저장 상태 열기", exact: true });
  await summary.evaluate(node => { node.style.fontSize = "24px"; });
  const before = await geometry(page);
  const messages = ["Offline tools could not be prepared · Check again", "Storage about 95% full · Back up your work"];
  await setNotices(page, messages);
  await expect(page.getByRole("status")).toHaveText(messages);
  await expect(summary).toHaveAccessibleDescription(messages.join(" "));
  const bounds = await page.locator("#notice").evaluate(slot => {
    const button = slot.closest("button");
    if (!button) throw new Error("저장 버튼이 없습니다.");
    const rect = button.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(slot);
    return {
      overflow: button.scrollHeight - button.clientHeight,
      text: [...range.getClientRects()].map(part => ({ left: part.left, right: part.right, top: part.top, bottom: part.bottom })),
      button: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
    };
  });
  expect(bounds.overflow).toBeLessThanOrEqual(1);
  expect(bounds.text.length).toBeGreaterThan(2);
  for (const rect of bounds.text) {
    expect(rect.left).toBeGreaterThanOrEqual(bounds.button.left - 1);
    expect(rect.right).toBeLessThanOrEqual(bounds.button.right + 1);
    expect(rect.top).toBeGreaterThanOrEqual(bounds.button.top - 1);
    expect(rect.bottom).toBeLessThanOrEqual(bounds.button.bottom + 1);
  }
  const after = await geometry(page);
  expect(after.title.height).toBeGreaterThan(before.title.height);
  expect(after.workspace.y).toBeGreaterThanOrEqual(after.header.y + after.header.height);
  await summary.focus();
  await expect(summary).toBeFocused();
  await summary.click({ trial: true });
  await setNotices(page, []);
  expect(await geometry(page)).toEqual(before);
});
