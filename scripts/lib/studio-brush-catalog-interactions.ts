import { visibleStudioControl } from "./studio-shell-interactions";

import type { Locator, Page } from "playwright";

const CATALOG_SELECTOR = '[data-studio-brush-catalog-session="true"]:not([data-studio-brush-workbench="true"])';
const DOCK_SELECTOR = '[data-studio-brush-workbench-dock="true"]';

/** 간단한 UI의 바로 열기와 저장된 배치의 도킹→확장 경로를 모두 실제 조작한다. */
export async function openStudioBrushCatalogThroughUi(page: Page, trigger: Locator): Promise<Locator> {
  const catalog = page.locator(CATALOG_SELECTOR).filter({ visible: true });
  const dock = page.locator(DOCK_SELECTOR).filter({ visible: true });
  if (await catalog.count() === 0) {
    if (await dock.count() === 0) {
      await (await visibleStudioControl(trigger, "브러시 라이브러리 열기")).click();
      await page.waitForFunction((selectors) => {
        for (const selector of selectors) {
          for (const element of document.querySelectorAll<HTMLElement>(selector)) {
            if (element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden") return true;
          }
        }
        return false;
      }, [CATALOG_SELECTOR, DOCK_SELECTOR]);
    }
    if (await catalog.count() === 0) {
      const workbench = await visibleStudioControl(dock, "브러시 작업 패널");
      await workbench.getByRole("button", { name: "확장 보기", exact: true }).click();
    }
  }
  return visibleStudioControl(catalog, "전체 브러시 카탈로그");
}
