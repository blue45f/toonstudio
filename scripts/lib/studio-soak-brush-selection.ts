import { visibleStudioControl } from "./studio-shell-interactions";

import type { Page } from "playwright";

const FLOATING_LIBRARY = '[role="dialog"][data-studio-brush-floating] [data-studio-brush-library="true"]';
const DOCKED_LIBRARY = '[data-studio-brush-workbench-dock="true"] [data-studio-brush-library="true"]';

/** 떠 있는 창은 실제 닫기 버튼으로 닫고 도킹 라이브러리는 기존 작업 배치에 남긴다. */
export async function closeStudioSoakBrushSurfaces(page: Page): Promise<boolean> {
  const floating = page.locator('[role="dialog"][data-studio-brush-floating]').filter({ visible: true });
  if (await floating.count() > 0) {
    const surface = await visibleStudioControl(floating, "소크 브러시 선택 창", 3_000);
    const close = await visibleStudioControl(surface.getByRole("button", { name: / 닫기$/u }), "소크 브러시 선택 창 닫기", 3_000);
    await close.click({ timeout: 3_000 });
    await surface.waitFor({ state: "hidden", timeout: 3_000 });
  }
  for (const selector of [
    '[data-studio-brush-catalog-session="true"]',
    '[data-studio-brush-library="true"]',
    '[data-studio-mobile-sheet="draw"]',
  ]) {
    const candidates = page.locator(selector).filter({ visible: true });
    if (await candidates.count() === 0) continue;
    const surface = await visibleStudioControl(candidates, "소크 브러시 표면", 3_000);
    const docked = await surface.evaluate((element) => Boolean(element.closest('[data-studio-brush-workbench-dock="true"]')));
    if (docked) continue;
    await page.keyboard.press("Escape");
    await surface.waitFor({ state: "hidden", timeout: 3_000 });
  }
  return true;
}

/** 현재 pill이 여는 floating 창과 이미 열린 dock 중 실제 보이는 단일 라이브러리를 조작한다. */
export async function selectStudioSoakDesktopBrush(
  page: Page,
  brush: { readonly id: string; readonly name: string },
): Promise<boolean> {
  const candidates = page.locator(FLOATING_LIBRARY + ", " + DOCKED_LIBRARY).filter({ visible: true });
  if (await candidates.count() === 0) {
    const pill = await visibleStudioControl(page.locator('[data-studio-draw-options="true"] [data-studio-brush-active-pill="true"]'),
      "소크 브러시 라이브러리 열기", 5_000);
    await pill.click({ timeout: 5_000 });
  }
  await visibleStudioControl(candidates, "소크 브러시 라이브러리", 5_000);
  const floating = page.locator(FLOATING_LIBRARY).filter({ visible: true });
  // 선택 도중 표면이 바뀌면 다른 라이브러리의 기존 활성 상태로 성공을 대신하지 않는다.
  const library = await visibleStudioControl(await floating.count() > 0
    ? floating : page.locator(DOCKED_LIBRARY).filter({ visible: true }), "소크 브러시 선택 표면", 5_000);
  await library.getByRole("searchbox").fill(brush.name, { timeout: 5_000 });
  const option = await visibleStudioControl(library.locator('button[data-studio-brush-select=' + JSON.stringify(brush.id) + ']'),
    brush.name + " 선택", 5_000);
  await option.scrollIntoViewIfNeeded({ timeout: 5_000 });
  await option.click({ timeout: 5_000 });
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const active = await option.getAttribute("aria-pressed", { timeout: Math.max(1, deadline - Date.now()) }) === "true";
    const pending = await library.getAttribute("data-studio-brush-selection-pending", { timeout: Math.max(1, deadline - Date.now()) }) === "true";
    if (active && !pending && Date.now() < deadline) return closeStudioSoakBrushSurfaces(page);
    const remaining = deadline - Date.now();
    if (remaining > 0) await page.waitForTimeout(Math.min(50, remaining));
  }
  return false;
}
