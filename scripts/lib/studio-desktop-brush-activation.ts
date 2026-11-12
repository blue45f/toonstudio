import { errors, type Page } from "playwright";

import { prepareFilterMenuWorkspace } from "./studio-filter-menu-workspace";

/** 정밀 브러시 검사에 필요한 배치는 실제 메뉴로 열고, 늦은 기본 화면 전환도 같은 예산 안에서 복구한다. */
export async function activateDesktopPen(page: Page, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastTimeout: Error | undefined;
  const expired = () => new Error(`PC 브러시 도구 준비 시간 ${timeoutMs}ms 초과: 실제 메뉴 배치와 펜·속성 표시를 확인하세요.`, { cause: lastTimeout });
  const remaining = () => {
    const value = deadline - Date.now();
    if (value <= 0) throw expired();
    return value;
  };
  while (Date.now() < deadline) {
    try {
      await prepareFilterMenuWorkspace(page, Math.min(10_000, remaining()));
      const pen = page.locator('button[data-studio-rail-tool-id="pen"]:visible').first();
      if (await pen.count() > 0) await pen.click({ timeout: Math.min(1_000, remaining()) });
      else await page.keyboard.press("b");
      const toolbar = page.locator('[data-studio-draw-options="true"]');
      await toolbar.waitFor({ state: "visible", timeout: Math.min(1_000, remaining()) });
      await page.waitForFunction(() =>
        document.querySelector('[data-studio-draw-options="true"]')
          ?.getAttribute("data-studio-active-draw-mode") === "pen",
      undefined, { timeout: Math.min(1_000, remaining()) });
      await toolbar.locator('[data-studio-brush-active-pill="true"]')
        .waitFor({ state: "visible", timeout: Math.min(1_000, remaining()) });
      const inspector = page.getByTestId("studio-inspector-navigator");
      await inspector.waitFor({ state: "visible", timeout: Math.min(1_000, remaining()) });
      const properties = inspector.locator('[data-studio-inspector-primary-tab="properties"]');
      if (await properties.getAttribute("aria-selected", { timeout: Math.min(1_000, remaining()) }) !== "true") {
        await properties.click({ timeout: Math.min(1_000, remaining()) });
      }
      remaining();
      return;
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) throw error;
      lastTimeout = error;
    }
    if (Date.now() < deadline) await page.waitForTimeout(Math.min(100, remaining()));
  }
  throw expired();
}
