import { join } from "node:path";

import type { Locator, Page } from "playwright";

export interface MobileSheetContractResult {
  id: "pages" | "props" | "brushes";
  ok: boolean;
  opened: boolean;
  initialFocusReady: boolean;
  initialFocusTargetReady: boolean;
  backgroundIsolated: boolean;
  tabTrapReady: boolean;
  handleTargetReady: boolean;
  insufficientDragStayed: boolean;
  backdropDismissed: boolean;
  keyboardSnapReady: boolean;
  tapSnapReady: boolean;
  escapeFocusRestored: boolean;
  thresholdDragDismissed: boolean;
  dragFocusRestored: boolean;
  noHorizontalOverflow: boolean;
  shot: string;
}

export interface VerifyMobileModalSheetOptions {
  dialog: Locator;
  dock: Locator;
  id: MobileSheetContractResult["id"];
  initialFocus: Locator;
  launcher: Locator;
  open: () => Promise<void>;
  page: Page;
  shot: string;
}


const PRIMARY_NAMES = ["펜", "지우개", "브러시", "브러시 색상", "레이어 열기", "더보기 · 도구와 도움말"] as const;

async function measurePrimaryTargets(dock: Locator) {
  return dock.locator('[data-studio-mobile-primary-actions="true"]').evaluate(toolbar => {
    const bounds = toolbar.getBoundingClientRect();
    const controls = [...toolbar.querySelectorAll<HTMLElement>("button, summary")].filter(control => control.getClientRects().length);
    const targets = controls.map(control => {
      const rect = control.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { name: control.getAttribute("aria-label") ?? control.innerText.trim(), width: rect.width, height: rect.height,
        left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, centerHit: Boolean(hit && control.contains(hit)) };
    });
    return { targets, toolbarLeft: bounds.left, toolbarRight: bounds.right, scrollWidth: toolbar.scrollWidth,
      clientWidth: toolbar.clientWidth, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
}

export function integratedPrimaryTargetsReady(geometry: Awaited<ReturnType<typeof measurePrimaryTargets>>): boolean {
  return geometry.targets.length === PRIMARY_NAMES.length && geometry.scrollWidth <= geometry.clientWidth + 1 &&
    geometry.targets.every((target, index) => target.name === PRIMARY_NAMES[index] && target.width >= 44 && target.height >= 44 &&
      target.centerHit && target.left >= Math.max(0, geometry.toolbarLeft) - 0.5 &&
      target.right <= Math.min(geometry.viewportWidth, geometry.toolbarRight) + 0.5 && target.top >= 0 &&
      target.bottom <= geometry.viewportHeight + 0.5 && (!index || geometry.targets[index - 1]!.right <= target.left + 0.5));
}

async function inspectTaskMenu(page: Page, dock: Locator) {
  const trigger = dock.locator("summary[data-studio-clarity-more-trigger]");
  await trigger.click();
  const menu = page.getByRole("dialog", { name: "원고 도구", exact: true });
  await menu.waitFor({ state: "visible" });
  const categoryNames = await menu.locator("[data-drawing-task-category]").evaluateAll(items =>
    items.map(item => item.getAttribute("data-drawing-task-category")));
  const geometry = await menu.evaluate(dialog => {
    const rect = dialog.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight,
      scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth, focusWithin: dialog.contains(document.activeElement) };
  });
  await menu.locator('[data-drawing-task-category="document"]').click();
  const pageAction = menu.locator('[data-studio-clarity-action="pages"]');
  const layersAction = menu.locator('[data-studio-clarity-action="layers"]');
  await pageAction.waitFor({ state: "visible" });
  const documentActionsReady = await layersAction.isVisible();
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  const triggerHandle = await trigger.elementHandle();
  const focusRestored = triggerHandle && await page.waitForFunction(element => element === document.activeElement,
    triggerHandle, { timeout: 3000 }).then(() => true, () => false);
  const ok = categoryNames.join(",") === "document,drawing,output,workspace" && documentActionsReady && geometry.focusWithin && focusRestored === true &&
    geometry.left >= -0.5 && geometry.right <= geometry.width + 0.5 && geometry.top >= -0.5 &&
    geometry.bottom <= geometry.height + 0.5 && geometry.scrollWidth <= geometry.clientWidth + 1;
  return { categoryNames, documentActionsReady, geometry, focusRestored, ok };
}

type IntegratedOptions = {
  page: Page; dock: Locator; width: number; shot: string; directory: string;
  verifyModalSheet: (options: VerifyMobileModalSheetOptions) => Promise<MobileSheetContractResult>;
  verifyBrushSheets: (page: Page, dock: Locator, width: number, sheets: MobileSheetContractResult[]) =>
    Promise<{ drawSheetCanvasInteractive: boolean; drawFocusRestored: boolean }>;
};

export type IntegratedMobileDockResult = Awaited<ReturnType<typeof verifyIntegratedMobileDock>>;

/** 통합 원고 화면의 기본 도구와 실제 상단 페이지·하단 레이어 진입점으로 시트 계약을 확인한다. */
export async function verifyIntegratedMobileDock({ page, dock, width, shot, directory, verifyModalSheet, verifyBrushSheets }: IntegratedOptions) {
  const tools = page.locator('[data-studio-drawing-project-tools="true"]');
  if (await tools.isVisible()) {
    await tools.getByRole("button", { name: "프로젝트 도구 닫기", exact: true }).click();
    await tools.waitFor({ state: "hidden" });
  }
  const primary = await measurePrimaryTargets(dock);
  const primaryReady = integratedPrimaryTargetsReady(primary);
  const noDocumentOverflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth + 1);
  await page.screenshot({ path: shot });
  const more = await inspectTaskMenu(page, dock);
  const editOptions = page.locator('button[aria-controls="studio-mobile-edit-options"]');
  if (await editOptions.getAttribute("aria-expanded") !== "true") await editOptions.click();
  const editToolbar = page.locator("#studio-mobile-edit-options");
  const positions = [
    { id: "pages", launcher: editToolbar.locator("button.studio-drawing-page-position"), closeLabel: "페이지 시트 닫기" },
    { id: "props", launcher: dock.getByRole("button", { name: "레이어 열기", exact: true }), closeLabel: "설정 닫기" },
  ] as const;
  const sheets: MobileSheetContractResult[] = [];
  for (const { id, launcher, closeLabel } of positions) {
    const dialog = page.locator(`[data-studio-sheet-id="${id}"]`);
    sheets.push(await verifyModalSheet({ id, page, dock, dialog, launcher, open: () => launcher.click(),
      initialFocus: dialog.getByRole("button", { name: closeLabel, exact: true }),
      shot: join(directory, `studio-launch-mobile-sheet-${id}-${width}.png`) }));
  }
  const brush = await verifyBrushSheets(page, dock, width, sheets);
  const ok = primaryReady && noDocumentOverflow && more.ok && sheets.every(sheet => sheet.ok) && brush.drawSheetCanvasInteractive && brush.drawFocusRestored;
  return { layout: "simple" as const, width, primary, primaryReady, noDocumentOverflow, more, ...brush, sheets, shot, ok };
}
