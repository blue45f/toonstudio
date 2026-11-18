import { visibleStudioControl } from "./studio-shell-interactions";

import type { Locator, Page } from "playwright";

const CATALOG_SELECTOR = '[data-studio-brush-catalog-session="true"]:not([data-studio-brush-workbench="true"])';
const DOCK_SELECTOR = '[data-studio-brush-workbench-dock="true"]';

interface StudioBrushUiIdentity {
  readonly id: string;
  readonly name: string;
}

/** 넓은 재료 ID 검색으로 가상 목록 바깥에 남지 않게 이름으로 좁힌 뒤 정확한 ID를 클릭한다. */
export async function selectStudioBrushCatalogItemThroughUi(
  catalog: Locator,
  brush: StudioBrushUiIdentity,
  operation: "paint" | "erase" = "paint",
): Promise<void> {
  await catalog.getByRole("searchbox", {
    name: operation === "erase" ? "전체 지우개 검색" : "전체 브러시 검색",
  }).fill(brush.name);
  const item = catalog.locator(`[data-studio-brush-select=${JSON.stringify(brush.id)}]`);
  await item.waitFor({ state: "visible" });
  await (await visibleStudioControl(item, `${brush.name} 선택`)).click();
}

/** 선택을 보여 주는 현재 표면만 읽는다. 모바일에는 데스크톱 active-pill이 없다. */
export async function waitForStudioSelectedBrushThroughUi(
  surface: Locator,
  brush: StudioBrushUiIdentity,
  mobile: boolean,
): Promise<Locator> {
  const visible = surface.locator(mobile
    ? '[data-studio-brush-tray="true"]'
    : '[data-studio-brush-active-pill="true"]').filter({ visible: true });
  await visible.waitFor({ state: "visible" });
  const current = await visibleStudioControl(visible, "현재 브러시 표시");
  const selected = mobile
    ? current.and(surface.locator(`[data-studio-active-brush-id=${JSON.stringify(brush.id)}]`))
    : current.and(surface.getByRole("button", {
        name: new RegExp(`^현재 도구 ${brush.name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")},`, "u"),
      }));
  await selected.waitFor({ state: "visible" });
  return selected;
}

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
