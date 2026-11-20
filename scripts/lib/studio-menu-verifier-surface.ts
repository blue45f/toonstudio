import { showStudioProjectWindowTools, visibleStudioControl } from "./studio-shell-interactions";

import type { Locator, Page } from "playwright";

export interface StudioMenuVerifierSurface {
  readonly project: boolean;
  readonly scope: Locator;
  readonly primary: Locator;
}

/** 메뉴 검증기의 진입과 실제 표시 범위를 한 곳에서 결정한다. */
export async function prepareStudioMenuVerifierSurface(page: Page, timeoutMs = 20_000): Promise<StudioMenuVerifierSurface> {
  await showStudioProjectWindowTools(page);
  const editor = await visibleStudioControl(page.locator('[data-studio-editor="true"]'), "Studio 편집기", timeoutMs);
  const project = await editor.getAttribute("data-studio-drawing-clarity") === "true";
  const scope = project
    ? await visibleStudioControl(page.locator('[data-studio-drawing-project-tools="true"]'), "프로젝트 도구 패널", timeoutMs)
    : editor;
  const primary = await visibleStudioControl(scope.locator('[data-studio-main-menu="true"]'), "Studio 메인 메뉴", timeoutMs);
  return { project, scope, primary };
}

export async function closeStudioMenuVerifierDropdown(page: Page): Promise<void> {
  if (await page.locator('[data-studio-main-menu-panel="true"]').filter({ visible: true }).count() > 0) {
    await page.keyboard.press("Escape");
  }
}

/** 현재 프로젝트 도구를 정상 닫기 동작으로 정리한 뒤 헤더의 출고 동작을 누른다. */
export async function closeStudioMenuVerifierProject(page: Page): Promise<void> {
  await closeStudioMenuVerifierDropdown(page);
  const panel = page.locator('[data-studio-drawing-project-tools="true"]').filter({ visible: true });
  if (await panel.count() === 0) return;
  await (await visibleStudioControl(panel, "프로젝트 도구 패널"))
    .getByRole("button", { name: "프로젝트 도구 닫기", exact: true }).click();
  await panel.waitFor({ state: "hidden", timeout: 5_000 });
}

export async function studioMenuVerifierRail(page: Page): Promise<Locator> {
  const editor = await visibleStudioControl(page.locator('[data-studio-editor="true"]'), "Studio 편집기");
  const project = await editor.getAttribute("data-studio-drawing-clarity") === "true";
  return visibleStudioControl(project
    ? editor.getByRole("toolbar", { name: "그리기 도구", exact: true })
    : editor.locator('[data-studio-tool-rail="true"]'), "Studio 그리기 도구", 5_000);
}
