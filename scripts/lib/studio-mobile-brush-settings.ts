import { errors } from "playwright";

import { clickStudioControlAfterReadiness } from "./studio-drawing-readiness";

import type { Locator, Page } from "playwright";

export async function openMobileBrushSettings(page: Page, dock: Locator): Promise<void> {
  const deadline = Date.now() + 60_000;
  const remaining = () => {
    const value = deadline - Date.now();
    if (value <= 0) throw new Error("모바일 브러시 설정 열기의 60000ms 예산을 초과했습니다.");
    return value;
  };
  const sheet = page.locator('[data-studio-sheet-id="draw"][data-studio-mobile-sheet="draw"][role="dialog"]:not([aria-hidden="true"]):not([inert])');
  if (await sheet.isVisible()) return;
  const clarity = page.locator('[data-studio-editor="true"][data-studio-drawing-clarity="true"][data-studio-drawing-clarity-mobile="true"]');
  const toggle = dock.locator('[data-studio-mobile-workspace-toggle="true"]');
  const tools = dock.locator('[data-studio-mobile-workspace-menu="true"]');
  // Clarity는 현재 펜·지우개를 다시 누른다. 지우개를 펜으로 바꾸거나 기존 배치 전체를 켜지 않는다.
  // 두 경로를 매 클릭 때 다시 판정하므로 준비 도중 Clarity가 늦게 나타나도 숨겨진 옛 메뉴에 묶이지 않는다.
  const control = dock.locator([
    '[data-studio-mobile-primary-layout="simple"] [data-studio-mobile-primary-actions="true"] button[aria-controls="studio-mobile-draw-settings"][aria-pressed="true"]',
    '[data-studio-mobile-workspace-menu="true"] button[aria-controls="studio-mobile-draw-settings"]:not([data-studio-primary-action]):not([data-studio-mobile-tool])',
  ].join(", ")).filter({ visible: true });
  await clickStudioControlAfterReadiness(
    page,
    control,
    remaining(),
    async (timeoutMs) => {
      if (await clarity.isVisible()) {
        if (await dock.getAttribute("data-studio-mobile-primary-layout", { timeout: timeoutMs }) !== "simple") {
          throw new errors.TimeoutError("모바일 Clarity 도구막대가 준비되지 않았습니다.");
        }
        return;
      }
      const preparationDeadline = Date.now() + timeoutMs;
      const expanded = await toggle.getAttribute("aria-expanded", { timeout: timeoutMs });
      const clickBudget = Math.min(preparationDeadline - Date.now(), remaining());
      if (expanded !== "true" && clickBudget > 0) await toggle.click({ timeout: clickBudget });
    },
  );
  await sheet.waitFor({ state: "visible", timeout: remaining() });
  await tools.waitFor({ state: "hidden", timeout: remaining() });
}
