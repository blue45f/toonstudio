import type { Locator, Page } from "playwright";

/** 숨은 이전 셸과 현재 셸이 함께 마운트되어도 실제 조작 대상은 하나여야 한다. */
export async function visibleStudioControl(locator: Locator, description: string, timeoutMs?: number): Promise<Locator> {
  const visible = locator.filter({ visible: true });
  await visible.waitFor({ state: "visible", ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }) });
  const count = await visible.count();
  if (count !== 1) throw new Error(`${description}: 표시된 조작 대상이 ${count}개입니다 (기대: 1개).`);
  return visible;
}

/** 실제로 마운트된 셸의 사용자 조작 진입점을 기다린다. 로딩 표지만으로 준비를 선언하지 않는다. */
export async function waitForStudioShellHydration(page: Page, timeoutMs = 60_000): Promise<void> {
  const editor = '[data-studio-editor="true"]:visible';
  const hydrated = page.locator([
    `${editor}[data-studio-drawing-clarity="true"] [data-studio-clarity-more-trigger="true"]:visible`,
    `${editor}:not([data-studio-drawing-clarity="true"]) [data-studio-command-bar-settings-trigger="true"]`,
  ].join(", "));
  await hydrated.waitFor({ state: "attached", timeout: timeoutMs });
  if (await hydrated.count() !== 1) throw new Error("Studio 셸 준비 진입점은 정확히 하나여야 합니다.");
}

export interface StudioWorkspaceDormancy {
  gateCount: number;
  heavyMenuCount: number;
  dialogCount: number;
  triggerCount: number;
  triggerVisible: boolean;
}

export function studioWorkspaceDormancyMatches(snapshot: StudioWorkspaceDormancy, clarity: boolean): boolean {
  const expectedGateCount = clarity ? 0 : 1;
  return snapshot.gateCount === expectedGateCount && snapshot.triggerCount === expectedGateCount
    && snapshot.heavyMenuCount === 0 && snapshot.dialogCount === 0 && !snapshot.triggerVisible;
}

async function workspaceDormancy(page: Page): Promise<StudioWorkspaceDormancy> {
  const trigger = page.locator('button[aria-haspopup="dialog"][aria-label^="작업공간:"]');
  const triggerCount = await trigger.count();
  return {
    gateCount: await page.getByTestId("studio-workspace-menu-gate").count(),
    heavyMenuCount: await page.getByTestId("studio-workspace-menu").count(),
    dialogCount: await page.getByTestId("studio-workspace-dialog").count(),
    triggerCount,
    triggerVisible: triggerCount > 0 && await trigger.isVisible(),
  };
}

/** 기본 그리기에는 관리자도 게이트도 없고, 실제 창 배치를 요청한 뒤에만 경량 게이트가 생긴다. */
export async function inspectStudioMobileWorkspaceMenuDormancy(page: Page) {
  await waitForStudioShellHydration(page, 5_000);
  const editor = await visibleStudioControl(page.locator('[data-studio-editor="true"]'), "Studio 편집기");
  const clarity = await editor.getAttribute("data-studio-drawing-clarity") === "true";
  const beforeIntent = await workspaceDormancy(page);
  if (!studioWorkspaceDormancyMatches(beforeIntent, clarity)) {
    throw new Error(`요청 전 작업공간 관리자가 휴면 상태가 아닙니다: ${JSON.stringify(beforeIntent)}`);
  }
  await showStudioProjectWindowTools(page);
  await page.getByTestId("studio-workspace-menu-gate").waitFor({ state: "attached", timeout: 5_000 });
  const afterIntent = await workspaceDormancy(page);
  return { ...afterIntent, beforeIntent, ok: studioWorkspaceDormancyMatches(afterIntent, false) };
}

const CLARITY_ACTION_CATEGORIES: Readonly<Record<string, string>> = {
  pages: "document", layers: "document", assets: "document",
  brush: "drawing", character3d: "drawing", all: "drawing", search: "drawing",
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

/** 원고 위의 프로젝트 도구를 열고, 이미 열린 패널과 독립 작업 화면은 그대로 둔다. */
export async function showStudioProjectWindowTools(page: Page): Promise<void> {
  const editor = await visibleStudioControl(page.locator('[data-studio-editor="true"]'), "Studio 편집기");
  if (await editor.getAttribute("data-studio-drawing-clarity") !== "true") return;
  const panel = page.locator('[data-studio-drawing-project-tools="true"]').filter({ visible: true });
  if (await panel.count() === 0) await runStudioClarityAction(page, "windows");
  await visibleStudioControl(panel, "프로젝트 도구 패널");
}

export async function openStudioMainMenu(page: Page, groupId: string): Promise<Locator> {
  await showStudioProjectWindowTools(page);
  if (await page.locator('[data-studio-main-menu-panel="true"]').filter({ visible: true }).count() > 0) {
    await page.keyboard.press("Escape");
  }
  const triggers = page.locator('[data-studio-main-menu="true"] [data-studio-main-menu-trigger]').filter({ visible: true });
  await triggers.first().waitFor({ state: "visible" });
  const ids = await triggers.evaluateAll(buttons => buttons.map(button => button.getAttribute("data-studio-main-menu-trigger")));
  const index = ids.indexOf(groupId);
  if (index === -1 || ids.lastIndexOf(groupId) !== index) throw new Error(`등록된 Studio 메뉴가 하나여야 합니다: ${groupId}`);
  const trigger = triggers.nth(index);
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

/** 닫힌 인스펙터는 사용자 명령으로 열고, 분할 레이어와 기존 탭 배치를 모두 확인한다. */
export async function openStudioLayerNavigator(page: Page, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const remaining = () => {
    const milliseconds = deadline - Date.now();
    if (milliseconds <= 0) throw new Error(`레이어 탐색기 준비 기한 ${timeoutMs}ms를 넘었습니다.`);
    return milliseconds;
  };
  const splitPane = page.locator('[data-studio-inspector-layers-split="true"]').filter({ visible: true });
  const layers = page.getByTestId("studio-inspector-navigator")
    .locator('[data-studio-inspector-primary-tab="layers"]').filter({ visible: true });
  if (await splitPane.count() === 0 && await layers.count() === 0) {
    const mobileLayers = page.locator('[data-studio-mobile-editing-dock="true"]')
      .getByRole("button", { name: /^(레이어 열기|Open layers)$/u }).filter({ visible: true });
    if (await mobileLayers.count() > 0) await (await visibleStudioControl(mobileLayers, "모바일 레이어", remaining())).click({ timeout: remaining() });
    else await runStudioClarityAction(page, "layers");
  }
  const selectedTab = page.getByTestId("studio-inspector-navigator")
    .locator('[data-studio-inspector-primary-tab="layers"][aria-selected="true"]').filter({ visible: true });
  const openLayers = splitPane.or(selectedTab).first();
  if (await openLayers.isVisible()) return;
  await splitPane.or(layers).first().waitFor({ state: "visible", timeout: remaining() });
  if (await openLayers.isVisible()) return;
  // 배치 복원이 클릭 직전에 끝나면 탭이 분할 패널로 교체된다. 실제 열린 목록을 확인한다.
  try {
    await layers.click({ timeout: remaining() });
  } catch (error) {
    if (await openLayers.isVisible()) return;
    throw error;
  }
  await openLayers.waitFor({ state: "visible", timeout: remaining() });
}
