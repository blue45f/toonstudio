import { errors, type Page } from "playwright";

import { activateDesktopPen } from "./studio-desktop-brush-activation";

/** 실제 PC 도구를 같은 준비 예산으로 확인하고 반복 획에서는 인스펙터 탭을 보존한다. */
export async function ensureStudioSoakDesktopPen(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  const remaining = () => {
    const value = deadline - Date.now();
    if (value <= 0) throw new errors.TimeoutError("PC 소크의 펜 준비 예산을 초과했습니다.");
    return value;
  };
  try {
    const clarity = page.locator('[data-studio-editor="true"][data-studio-drawing-clarity="true"]').first();
    if (await clarity.isVisible()) {
      await activateDesktopPen(page, remaining());
      return Date.now() < deadline;
    }
    // 라이브러리 검색에 초점이 남아도 실제 펜 버튼을 우선 사용한다.
    const railPen = page.locator('[data-studio-rail-tool-id="pen"], [data-studio-current-tool-id="pen"]').first();
    if (await railPen.isVisible()) {
      if (await railPen.getAttribute("aria-pressed", { timeout: remaining() }) !== "true") {
        await railPen.click({ timeout: Math.min(5_000, remaining()) });
      }
      await page.waitForTimeout(Math.min(80, remaining()));
      if (await railPen.getAttribute("aria-pressed", { timeout: remaining() }) !== "true") return false;
    } else {
      await page.evaluate(() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
      }).catch(() => undefined);
      await page.keyboard.press("b");
    }
    await page.locator('[data-studio-draw-options="true"]')
      .waitFor({ state: "visible", timeout: Math.min(4_000, remaining()) });
    return Date.now() < deadline;
  } catch (error) {
    if (error instanceof errors.TimeoutError) return false;
    throw error;
  }
}
