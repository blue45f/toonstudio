import type { Locator, Page } from "@playwright/test";

/** 기존 획의 내보내기 차단을 현재 보이는 실제 진입점으로 요청한다. */
export async function clickPigmentBlockedPngExport(page: Page, blocked: Locator): Promise<void> {
  // 선행 화면 판정 뒤 배치가 바뀌어도 클릭은 현재 보이는 진입점을 다시 찾는다.
  await page.locator('button[data-studio-primary-action="export"]:visible, [data-studio-clarity-more-trigger="true"]:visible')
    .first().click();
  const task = page.locator('dialog[data-studio-drawing-task="tools"]');
  // 기존 버튼은 차단 결과로, 단순 화면은 실제 도구 선택 화면으로 도착해야 한다.
  await task.or(blocked).filter({ visible: true }).first().waitFor({ state: "visible" });
  if (!(await task.isVisible())) return;
  await task.locator('[data-drawing-task-category="output"]').click();
  await task.getByRole("button", { name: "원고 내보내기", exact: true }).click();
  await task.waitFor({ state: "detached" });
  const panel = page.locator('[data-studio-export-menu-panel="true"]');
  await panel.waitFor({ state: "visible" });
  await panel.getByRole("button", { name: "현재 페이지 PNG 다운로드", exact: true }).click();
  await panel.waitFor({ state: "hidden" });
}
