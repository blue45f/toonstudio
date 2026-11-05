import { clickStudioControlAfterReadiness } from "./studio-drawing-readiness";

import type { Locator, Page } from "playwright";

export async function openMobileBrushSettings(page: Page, dock: Locator): Promise<void> {
  const deadline = Date.now() + 60_000;
  const toggle = dock.locator('[data-studio-mobile-workspace-toggle="true"]');
  const tools = dock.locator('[data-studio-mobile-workspace-menu="true"]');
  await clickStudioControlAfterReadiness(
    page,
    tools.locator('button[aria-controls="studio-mobile-draw-settings"]:not([data-studio-primary-action])'),
    60_000,
    async (timeoutMs) => {
      const preparationDeadline = Date.now() + timeoutMs;
      const expanded = await toggle.getAttribute("aria-expanded", { timeout: timeoutMs });
      const remaining = preparationDeadline - Date.now();
      if (expanded !== "true" && remaining > 0) await toggle.click({ timeout: remaining });
    },
  );
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("모바일 브러시 설정 열기의 60000ms 예산을 초과했습니다.");
  await tools.waitFor({ state: "hidden", timeout: remaining });
}

