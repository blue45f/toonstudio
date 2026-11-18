import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { buildStudioReactFixture } from "./helpers/studio-react-fixture.mjs";

const styles = [
  "../apps/web/src/app/styles/sitewide-visual-ux.css",
  "../apps/web/src/app/styles/mobile-first-shell.css",
  "../apps/web/src/shared/styles/studio-route.css",
  "../apps/web/src/domains/creator/studio-shell/studio-visual-identity-v2.css",
  "../apps/web/src/domains/creator/studio-shell/studio-document-chrome.css",
  "../apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarity.css",
].map(path => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");

async function mountProductSaveCenter(page: Page) {
  // 저장 버튼·native dialog·slot 등록·포커스 복귀는 제품 코드다. 외부 상태 생산자만 문구 fixture로 공급한다.
  const source = await buildStudioReactFixture(`
      import { useEffect, useState } from "react";
      import { createRoot } from "react-dom/client";
      import { createPortal } from "react-dom";
      import { StudioSaveSyncStatusCenter } from "./domains/creator/StudioSaveSyncStatusCenter";
      import { createEmptyOperationJournal } from "./domains/creator/studio-operation-recovery-coordinator";
      import { useEditorStatusSlot } from "./shared/lib/modal-status-slot";
      function Notices() {
        const slot = useEditorStatusSlot(), [messages, setMessages] = useState<string[]>([]);
        useEffect(() => {
          if (!slot) return;
          const change = (event: Event) => {
            if (event instanceof CustomEvent && Array.isArray(event.detail) && event.detail.every(value => typeof value === "string")) setMessages(event.detail);
          };
          window.addEventListener("studio-fixture-notices", change);
          slot.summary.dataset.fixtureNoticesReady = "true";
          return () => {
            window.removeEventListener("studio-fixture-notices", change);
            delete slot.summary.dataset.fixtureNoticesReady;
          };
        }, [slot]);
        if (!slot) return null;
        return <>
          {createPortal(messages.map(message => <span key={message} role="status" data-studio-offline-important="true">{message}</span>), slot.summary)}
          {createPortal(<section aria-label="전체 작업 안내">{messages.map(message =>
            <p key={message} data-fixture-full-notice="true" style={{fontSize:24,lineHeight:1.5,whiteSpace:"normal"}}>{message}</p>
          )}</section>, slot.element)}
        </>;
      }
      const root = document.querySelector("[data-studio-save-status-chrome-mount]");
      if (!root) throw new Error("저장 상태 fixture 자리가 없습니다.");
      createRoot(root).render(<><StudioSaveSyncStatusCenter presentation="drawing" journal={createEmptyOperationJournal("chrome-layout-fixture")}/><Notices/></>);
    `);
  await page.addScriptTag({ content: source });
  await expect(page.locator('button[data-studio-drawing-save-summary="true"]')).toHaveAttribute("aria-describedby", /.+/u);
  await expect(page.locator('[data-fixture-notices-ready="true"]')).toHaveCount(1);
}

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
      expect(before.title.height).toBeGreaterThanOrEqual(64);
      const message = "일부 오프라인 도구 준비 필요";
      await setNotices(page, [message]);
      await expect(page.getByRole("status")).toHaveText(message);
      await expect(page.getByRole("status")).toBeVisible();
      const summary = page.getByRole("button", { name: "저장 상태 열기", exact: true });
      await expect(summary).toHaveAccessibleDescription(message);
      const after = await geometry(page);
      expect(after).toEqual(before);
      await summary.focus();
      await expect(summary).toBeFocused();
      await summary.click({ trial: true });
      await setNotices(page, []);
      expect(await geometry(page)).toEqual(before);
    });
  }
}

test("좁은320 화면과 두 배 글꼴의 긴 안내를 실제 저장 상세에서 모두 읽고 복귀한다", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await mountHeader(page, true);
  await page.locator("html").evaluate(node => { node.setAttribute("lang", "en"); });
  await mountProductSaveCenter(page);
  const summary = page.locator('button[data-studio-drawing-save-summary="true"]');
  await summary.evaluate(node => { node.style.fontSize = "24px"; });
  const before = await geometry(page);
  const messages = ["Offline tools could not be prepared · Check again", "Storage about 95% full · Back up your work"];
  await page.evaluate(texts => window.dispatchEvent(new CustomEvent("studio-fixture-notices", { detail: texts })), messages);
  await expect(page.getByRole("status")).toHaveText(messages);
  await expect(summary).toHaveAccessibleDescription(messages.join(" "));
  expect(await geometry(page)).toEqual(before);
  await summary.focus();
  await expect(summary).toBeFocused();
  await summary.click();
  const dialog = page.locator('dialog[data-studio-drawing-save-dialog="true"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(await dialog.evaluate(node => node.matches(":modal"))).toBe(true);
  const close = dialog.getByRole("button", { name: "저장 상태 닫기", exact: true });
  await expect(close).toBeFocused();
  const notices = dialog.locator("[data-fixture-full-notice]");
  await expect(notices).toHaveText(messages);
  for (const notice of await notices.all()) {
    await notice.scrollIntoViewIfNeeded();
    await expect(notice).toBeVisible();
    const bounds = await notice.evaluate(node => {
      const viewport = node.closest(".studio-drawing-dialog-content")?.getBoundingClientRect();
      if (!viewport) throw new Error("저장 상세 스크롤 영역이 없습니다.");
      const range = document.createRange();
      range.selectNodeContents(node);
      return { clip: { left: viewport.left, right: viewport.right, top: viewport.top, bottom: viewport.bottom },
        text: [...range.getClientRects()].map(rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })) };
    });
    expect(bounds.text.length).toBeGreaterThan(1);
    for (const rect of bounds.text) {
      expect(rect.left).toBeGreaterThanOrEqual(bounds.clip.left - 1);
      expect(rect.right).toBeLessThanOrEqual(bounds.clip.right + 1);
      expect(rect.top).toBeGreaterThanOrEqual(bounds.clip.top - 1);
      expect(rect.bottom).toBeLessThanOrEqual(bounds.clip.bottom + 1);
    }
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(summary).toBeFocused();
  await expect(summary).toHaveAttribute("aria-expanded", "false");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("studio-fixture-notices", { detail: [] })));
  await expect(summary).toHaveAccessibleDescription("");
  expect(await geometry(page)).toEqual(before);
});
