import type { Page } from "playwright";

/** 새 원고의 기본 팝업에서 주 색을 고르고, 적용된 도구 색까지 확인한다. */
export async function setStudioPrimaryColorThroughUi(page: Page, color: string): Promise<void> {
  if (!/^#[\da-f]{6}$/iu.test(color)) throw new Error("주 색은 #RRGGBB 형식이어야 합니다.");
  const well = page.locator('[data-studio-draw-options="true"] [data-studio-dual-color-well="true"]');
  await well.getByRole("button", { name: "주 색", exact: true }).click();
  const popover = page.getByRole("dialog", { name: "주 색 선택", exact: true });
  await popover.waitFor({ state: "visible" });
  await popover.getByRole("textbox", { name: "헥스 색상 코드", exact: true }).fill(color);
  await popover.getByRole("button", { name: "색상 적용", exact: true }).click();
  await popover.waitFor({ state: "detached" });
  await page.waitForFunction((expected) => document.querySelector(
    '[data-studio-draw-options="true"] [data-studio-dual-color-well="true"]',
  )?.getAttribute("data-studio-primary-color") === expected, color.toLowerCase());
}
