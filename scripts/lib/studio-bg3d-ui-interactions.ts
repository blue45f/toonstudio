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
