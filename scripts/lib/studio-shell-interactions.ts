import type { Locator, Page } from "playwright";

/** 숨은 이전 셸과 현재 셸이 함께 마운트되어도 실제 조작 대상은 하나여야 한다. */
export async function visibleStudioControl(locator: Locator, description: string, timeoutMs?: number): Promise<Locator> {
  const visible = locator.filter({ visible: true });
  await visible.waitFor({ state: "visible", ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }) });
  const count = await visible.count();
  if (count !== 1) throw new Error(`${description}: 표시된 조작 대상이 ${count}개입니다 (기대: 1개).`);
  return visible;
}

const CLARITY_ACTION_CATEGORIES: Readonly<Record<string, string>> = {
  pages: "document", layers: "document", assets: "document",
  brush: "drawing", all: "drawing", search: "drawing",
  export: "output", team: "output",
  windows: "workspace", view: "workspace", help: "workspace", device: "workspace", status: "workspace",
};

/** 기본 그리기 셸의 실제 더보기 → 작업 분류 → 명령 경로를 사용한다. */
export async function runStudioClarityAction(page: Page, actionId: string): Promise<void> {
  const categoryId = CLARITY_ACTION_CATEGORIES[actionId];
  if (!categoryId) throw new Error(`알 수 없는 Studio 더보기 명령: ${actionId}`);
  const action = page.locator(`[data-studio-clarity-action="${actionId}"]`);
  if (await action.filter({ visible: true }).count() === 0) {
    const taskBrowser = page.locator('[data-studio-drawing-task-browser="true"]').filter({ visible: true });
    if (await taskBrowser.count() === 0) {
      const trigger = await visibleStudioControl(page.locator('[data-studio-clarity-more-trigger="true"]'), "Studio 더보기");
      await trigger.click();
      await page.locator('[data-studio-drawing-task-browser="true"], [data-studio-clarity-action]').filter({ visible: true }).first().waitFor({ state: "visible" });
    }
    if (await action.filter({ visible: true }).count() === 0) {
      const category = page.locator(`[data-drawing-task-category="${categoryId}"]`);
      if (await category.filter({ visible: true }).count() === 0) {
        await (await visibleStudioControl(page.getByRole("button", { name: /^(원고 도구 분류로 돌아가기|Back to draft tool categories)$/u }), "원고 도구 분류 복귀")).click();
      }
      await (await visibleStudioControl(category, `Studio 작업 분류 ${categoryId}`)).click();
    }
  }
  await (await visibleStudioControl(action, `Studio 명령 ${actionId}`)).click();
}

/** 프로젝트·창 기능을 검증할 때만 사용자가 선택할 수 있는 상세 작업 배치를 연다. */
export async function showStudioProjectWindowTools(page: Page): Promise<void> {
  const editor = await visibleStudioControl(page.locator('[data-studio-editor="true"]'), "Studio 편집기");
  if (await editor.getAttribute("data-studio-drawing-clarity") === "true") {
    await runStudioClarityAction(page, "windows");
  }
  await page.locator('[data-studio-editor="true"]:not([data-studio-drawing-clarity="true"])').filter({ visible: true }).waitFor({ state: "visible" });
}

export async function openStudioMainMenu(page: Page, groupId: string): Promise<Locator> {
  if (!/^[a-z][a-z0-9-]*$/u.test(groupId)) throw new Error(`잘못된 Studio 메뉴 식별자: ${groupId}`);
  await showStudioProjectWindowTools(page);
  if (await page.locator('[data-studio-main-menu-panel="true"]').filter({ visible: true }).count() > 0) {
    await page.keyboard.press("Escape");
  }
  const trigger = await visibleStudioControl(page.locator(`[data-studio-main-menu="true"] [data-studio-main-menu-trigger="${groupId}"]`), `Studio ${groupId} 메뉴`);
  // 빈 캔버스에서 Escape를 누르면 활성 선택 영역이 해제된다. 메뉴가 열려 있을 때만 닫는다.
  // focus + ArrowDown은 hover로 이미 열리는 메뉴를 click으로 다시 닫는 경쟁도 피한다.
  await trigger.focus();
  await trigger.press("ArrowDown");
  return visibleStudioControl(page.locator('[data-studio-main-menu-panel="true"] [role="menu"]'), `Studio ${groupId} 메뉴 항목`);
}

export async function openStudioExportPanel(page: Page): Promise<Locator> {
  const panel = page.locator('[data-studio-export-menu-panel="true"]');
  if (await panel.filter({ visible: true }).count() === 0) {
    const clarityExport = page.locator('[data-studio-clarity-export-btn="true"]').filter({ visible: true });
    if (await clarityExport.count() > 0) await (await visibleStudioControl(clarityExport, "Studio 출고")).click();
    else if (await page.locator('[data-studio-clarity-more-trigger="true"]').filter({ visible: true }).count() > 0) await runStudioClarityAction(page, "export");
    else {
      const menu = await openStudioMainMenu(page, "file");
      await (await visibleStudioControl(menu.getByRole("menuitem", { name: /^내보내기/u }), "Studio 내보내기")).click();
    }
  }
  return visibleStudioControl(panel, "Studio 출력 설정");
}
