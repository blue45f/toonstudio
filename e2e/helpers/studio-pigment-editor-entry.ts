import { waitForEditorSettled } from "./studio-editor-a11y";

import type { Page } from "@playwright/test";

/** 원고 배치를 바꾸지 않고 현재 주소의 캔버스와 저장·연결 상태가 준비될 때까지 기다린다. */
export async function waitForPigmentEditorSettled(page: Page): Promise<void> {
  const requested = new URL(page.url());
  await waitForEditorSettled(page);
  await page.locator('[data-studio-canvas-viewport]:visible').waitFor({ state: "visible", timeout: 60_000 });

  const current = new URL(page.url());
  if (current.origin !== requested.origin || current.pathname !== requested.pathname || current.hash !== requested.hash) {
    throw new Error("안료 원고가 준비되는 동안 다른 문서로 이동했습니다.");
  }
  for (const key of new Set(requested.searchParams.keys())) {
    if (JSON.stringify(current.searchParams.getAll(key)) !== JSON.stringify(requested.searchParams.getAll(key))) {
      throw new Error(`안료 원고가 준비되는 동안 주소의 ${key} 값이 바뀌었습니다.`);
    }
  }
}
