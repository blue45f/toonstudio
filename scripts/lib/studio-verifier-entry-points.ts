import { openStudioAllTools } from "./studio-bg3d-ui-interactions";
import { pinStudioRailToolInCatalog, studioRailToolDiagnosticError } from "./studio-rail-tool-catalog-pin";
import { openStudioMainMenu, visibleStudioControl } from "./studio-shell-interactions";

import type { Locator, Page } from "playwright";

/** 검사기에서 공유하는 출시 UI 진입점. 문서·설정 상태를 직접 쓰지 않는다. */
export async function openStudioProjectCenter(page: Page): Promise<Locator> {
  const menu = page.locator('[data-studio-project-actions-menu="true"]');
  if (!await menu.isVisible()) {
    const fileMenu = await openStudioMainMenu(page, "file");
    const entry = await visibleStudioControl(fileMenu.locator('[data-studio-menu-item-id="project"]'), "파일 메뉴의 프로젝트 센터", 4_000);
    await entry.click({ timeout: 4_000 });
  }
  await menu.waitFor({ state: "visible", timeout: 4_000 });
  return menu;
}

export async function studioPinnedToolButton(page: Page, id: string): Promise<Locator> {
  let catalogPinConfirmed = false;
  try {
    // 고정 도구는 현재 Clarity rail의 portal로 이동한다. 오래된 부모 DOM에 묶지 않는다.
    const target = page.locator(`button[data-studio-rail-tool-id="${id}"]`);
    if (await target.filter({ visible: true }).count() > 0) return await visibleStudioControl(target, `Studio 도구 ${id}`);
    const catalog = await openStudioAllTools(page);
    await catalog.waitFor({ state: "visible", timeout: 16_000 });
    await pinStudioRailToolInCatalog(catalog, id, 16_000);
    catalogPinConfirmed = true;
    await catalog.getByRole("button", { name: "전체 도구 닫기", exact: true }).click();
    await catalog.waitFor({ state: "hidden", timeout: 16_000 });
    return await visibleStudioControl(target, `Studio 도구 ${id}`);
  } catch (error) {
    throw await studioRailToolDiagnosticError(page, id, error, catalogPinConfirmed);
  }
}

export async function studioDocumentHistoryButtons(page: Page, label: "실행취소" | "다시실행"): Promise<Locator> {
  const name = label === "실행취소" ? /^(되돌리기 · 실행취소|실행취소|Undo)$/u : /^(다시 · 다시실행|다시실행|Redo)$/u;
  const current = page.getByRole("toolbar", { name: /^(편집 기록|Edit history)$/u })
    .getByRole("button", { name }).filter({ visible: true });
  // 이 영역은 PC 정본 handler와 모바일에서 옮긴 원래 도크 버튼을 함께 소유한다.
  if (await current.count() > 0) return current;
  return page.locator(`button[aria-label="${label}"]`).filter({ visible: true });
}

export async function openStudioMobileDrawSettings(page: Page): Promise<Locator> {
  const dock = page.locator('[data-studio-mobile-editing-dock="true"]');
  const pen = await visibleStudioControl(dock.locator('button[data-studio-primary-action="draw"]'), "모바일 펜");
  if (await pen.getAttribute("aria-pressed") !== "true") await pen.click();
  await dock.locator('button[data-studio-primary-action="draw"][aria-pressed="true"]').waitFor({ state: "visible" });
  // 선택한 펜을 다시 누르는 현재 사용자 동선이 기존 굵기·색·모드 시트를 연다.
  if (await pen.getAttribute("aria-expanded") !== "true") await pen.click();
  const sheet = page.locator("#studio-mobile-draw-settings");
  await sheet.getByRole("slider", { name: "브러시 굵기 슬라이더", exact: true }).waitFor();
  return sheet;
}

/** 작은 화면에서 접힌 현재 편집 행만 펼친다. 큰 화면의 숨은 토글은 누르지 않는다. */
export async function showStudioMobileEditOptions(page: Page): Promise<Locator> {
  const row = page.locator("#studio-mobile-edit-options");
  if (!await row.isVisible()) {
    const toggle = await visibleStudioControl(page.locator('button[aria-controls="studio-mobile-edit-options"]'), "모바일 편집 행 펼치기");
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click({ timeout: 5_000 });
  }
  return visibleStudioControl(row, "모바일 편집 행");
}
