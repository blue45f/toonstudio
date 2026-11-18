import { runStudioClarityAction, visibleStudioControl } from "./studio-shell-interactions";

import type { Locator, Page } from "playwright";

const TASK_GROUPS: Readonly<Record<string, RegExp>> = {
  templates: /^(장면 만들기|Build scene)$/u,
  shapes: /^(장면 만들기|Build scene)$/u,
  models: /^(장면 만들기|Build scene)$/u,
  view: /^(구도·작화|Frame and render)$/u,
  lt: /^(구도·작화|Frame and render)$/u,
  layers: /^(장면 레이어|Scene layers)$/u,
};

/** 새 편집기는 장면 도우미로 열리므로 작업 탭을 찾기 전에 실제 정밀 편집 모드로 전환한다. */
export async function openStudioBg3dProfessionalMode(dialog: Locator, timeoutMs = 15_000): Promise<void> {
  const professional = await visibleStudioControl(dialog.getByRole("group", { name: "3D 편집 모드", exact: true })
    .getByRole("button", { name: /^정밀(?: 편집)?$/u }), "3D 정밀 편집 모드", timeoutMs);
  if (await professional.getAttribute("aria-pressed") !== "true") await professional.click();
  await dialog.and(dialog.page().locator('[data-studio-bg3d-experience="pro"]'))
    .waitFor({ state: "visible", timeout: timeoutMs });
}

/** 다른 작업 그룹의 탭은 마운트되지 않으므로 먼저 실제 그룹 버튼으로 이동한다. */
export async function selectStudioBg3dTaskTab(dialog: Locator, tabId: string, timeoutMs = 15_000): Promise<void> {
  const groupName = TASK_GROUPS[tabId];
  if (!Object.hasOwn(TASK_GROUPS, tabId) || !groupName) throw new Error(`알 수 없는 3D 작업 탭: ${tabId}`);
  const tab = dialog.locator(`#bg3d-tab-${tabId}`).filter({ visible: true });
  if (await tab.count() === 0) {
    const group = dialog.getByRole("group", { name: /^(3D 작업 선택|Choose a 3D task)$/u });
    await (await visibleStudioControl(group.getByRole("button", { name: groupName }), `3D 작업 그룹 ${tabId}`, timeoutMs)).click();
  }
  const control = await visibleStudioControl(tab, `3D 작업 탭 ${tabId}`, timeoutMs);
  if (await control.getAttribute("aria-selected") !== "true") await control.click();
  await dialog.locator(`#bg3d-tab-${tabId}[aria-selected="true"]`).waitFor({ state: "visible", timeout: timeoutMs });
}

export async function openStudioBg3dEnginePanel(dialog: Locator, timeoutMs = 15_000): Promise<void> {
  await selectStudioBg3dTaskTab(dialog, "view", timeoutMs);
  const camera = await visibleStudioControl(dialog.locator("#bg3d-view-tab-camera"), "3D 보기의 카메라·엔진 설정", timeoutMs);
  if (await camera.getAttribute("aria-selected") !== "true") await camera.click();
}

/** 컷 프로젝트의 별도 기록과 구별해 실제 장면 뷰포트의 Undo/Redo를 선택한다. */
export async function studioBg3dSceneHistoryControl(
  dialog: Locator, action: "undo" | "redo", timeoutMs = 15_000,
): Promise<Locator> {
  const name = action === "undo" ? "실행 취소" : "다시 실행";
  return visibleStudioControl(dialog.getByTestId("studio-bg3d-viewport")
    .getByRole("button", { name, exact: true }), `3D 장면 ${name}`, timeoutMs);
}

/** 픽셀 검사는 사용자가 접을 수 있는 컷·에셋 패널을 먼저 접고 같은 온전한 캔버스를 측정한다. */
export async function prepareStudioBg3dViewportCapture(dialog: Locator): Promise<void> {
  const cuts = dialog.getByTestId("scene3d-cut-panel").filter({ visible: true });
  if (await cuts.count() > 0) {
    const panel = await visibleStudioControl(cuts, "3D 컷 버전 패널");
    if (await panel.getAttribute("open") !== null) {
      await panel.locator(":scope > summary").click();
      await panel.and(dialog.page().locator("details:not([open])")).waitFor({ state: "visible" });
    }
  }
  const shelf = dialog.getByTestId("studio-bg3d-asset-shelf").filter({ visible: true });
  if (await shelf.count() > 0) {
    await (await visibleStudioControl(shelf.getByRole("button", { name: /^(쉘프 접기|Collapse shelf)$/u }), "3D 에셋 쉘프 접기")).click();
    await shelf.waitFor({ state: "hidden" });
  }
  await dialog.getByTestId("studio-bg3d-viewport").scrollIntoViewIfNeeded();
}

/** 데스크톱의 전체 도구와 모바일 더보기는 같은 출시 카탈로그로 연결된다. */
export async function openStudioAllTools(page: Page): Promise<Locator> {
  const catalog = page.getByRole("dialog", { name: "전체 도구", exact: true }).filter({ visible: true });
  if (await catalog.count() === 0) {
    const trigger = page.locator('[data-studio-rail-all-tools="true"]')
      .or(page.locator('[data-studio-tool-rail-settings="true"]').getByRole("button", { name: "전체 도구", exact: true }))
      .filter({ visible: true });
    if (await trigger.count() > 0) await (await visibleStudioControl(trigger, "전체 도구 열기")).click();
    else await runStudioClarityAction(page, "all");
  }
  return visibleStudioControl(catalog, "전체 도구 카탈로그");
}
