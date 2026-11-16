import { visibleStudioControl } from "./studio-shell-interactions";

import type { Locator, Page } from "playwright";

export function studioVisibleTool(page: Page, toolId: "pen" | "select"): Locator {
  return page.locator(`[data-studio-rail-tool-id="${toolId}"]`).filter({ visible: true });
}

/** 숨겨진 저장 배치와 현재 도구막대가 함께 마운트되어도 보이는 버튼 하나만 조작한다. */
export async function clickStudioToolThroughUi(page: Page, toolId: "pen" | "select"): Promise<void> {
  const button = await visibleStudioControl(studioVisibleTool(page, toolId), `그리기 도구 ${toolId}`);
  await button.click();
  await page.waitForFunction((id) => {
    let visibleCount = 0;
    for (const candidate of document.querySelectorAll<HTMLElement>(`[data-studio-rail-tool-id="${id}"]`)) {
      if (candidate.getClientRects().length === 0 || getComputedStyle(candidate).visibility === "hidden") continue;
      if (candidate.getAttribute("aria-pressed") !== "true") return false;
      visibleCount += 1;
    }
    return visibleCount === 1;
  }, toolId, { timeout: 15_000 });
}
