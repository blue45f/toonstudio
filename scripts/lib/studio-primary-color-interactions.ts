import { visibleStudioControl } from "./studio-shell-interactions";

import type { Page } from "playwright";

/** 현재 표시된 그리기 UI로 주 색을 고르고, 적용된 도구 색까지 확인한다. */
export async function setStudioPrimaryColorThroughUi(page: Page, color: string): Promise<void> {
  if (!/^#[\da-f]{6}$/iu.test(color)) throw new Error("주 색은 #RRGGBB 형식이어야 합니다.");
  const expected = color.toLowerCase();
  const nativeSelector = '[data-studio-draw-options="true"] input[type="color"][aria-label="주 색 선택"]';
  const native = page.locator(nativeSelector).filter({ visible: true });
  const wellSelector = '[data-studio-draw-options="true"] [data-studio-dual-color-well="true"]';
  const well = page.locator(wellSelector).filter({ visible: true });
  await visibleStudioControl(native.or(well), "주 색 입력");
  if (await native.count() > 0) {
    await native.fill(expected);
    await page.waitForFunction(({ selector, value }) => {
      const inputs = document.querySelectorAll<HTMLInputElement>(selector);
      let matched = 0;
      for (const input of inputs) {
        if (input.getClientRects().length === 0 || getComputedStyle(input).visibility === "hidden") continue;
        if (input.value.toLowerCase() !== value) return false;
        matched += 1;
      }
      return matched === 1;
    }, { selector: nativeSelector, value: expected });
    return;
  }
  await well.getByRole("button", { name: "주 색", exact: true }).click();
  const popover = await visibleStudioControl(
    page.getByRole("dialog", { name: "주 색 선택", exact: true }), "주 색 선택 팝업",
  );
  await popover.getByRole("textbox", { name: "헥스 색상 코드", exact: true }).fill(expected);
  await popover.getByRole("button", { name: "색상 적용", exact: true }).click();
  await popover.waitFor({ state: "hidden" });
  await page.waitForFunction(({ selector, value }) => {
    const wells = document.querySelectorAll<HTMLElement>(selector);
    let matched = 0;
    for (const candidate of wells) {
      if (candidate.getClientRects().length === 0 || getComputedStyle(candidate).visibility === "hidden") continue;
      if (candidate.getAttribute("data-studio-primary-color") !== value) return false;
      matched += 1;
    }
    return matched === 1;
  }, { selector: wellSelector, value: expected });
}
