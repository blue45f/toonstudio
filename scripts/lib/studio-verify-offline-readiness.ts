import { visibleStudioControl } from "./studio-shell-interactions";

import type { Page } from "playwright";

/** 작가가 저장 상태에서 현재 빌드의 도구 준비 완료를 확인한 뒤 네트워크를 끊는다. */
export async function prepareOfflineLifecycle(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 20_000 });
  const center = page.getByRole("button", { name: /^저장 상태 열기:/u });
  const standalone = page.locator('details[data-studio-offline-panel="true"] > summary');
  const entry = await visibleStudioControl(center.or(standalone), "오프라인 준비가 있는 저장 상태");
  await entry.click();
  const panel = page.locator('[data-studio-offline-panel="true"]:visible');
  await panel.getByRole("button", { name: /^오프라인 준비 다시 (확인|시도)$/u }).click();
  await panel.getByText(/^(?:오프라인 전환 준비가 완료됐습니다\. 편집 도구|오프라인 앱 준비가 완료됐습니다\. 필수 리소스) [1-9]\d*개를 이 기기에서 확인했습니다\.$/u)
    .waitFor({ state: "visible", timeout: 50_000 });
  if (await center.isVisible()) await page.keyboard.press("Escape");
  else await standalone.click();
}
