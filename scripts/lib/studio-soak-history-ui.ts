import { visibleStudioControl } from "./studio-shell-interactions";
import { studioHistoryControlSelector, type StudioHistoryControlKind } from "./studio-verify-history-controls.mjs";

import type { Locator, Page } from "playwright";

async function clickVisibleHistoryAction(page: Page, action: StudioHistoryControlKind): Promise<boolean> {
  const selector = studioHistoryControlSelector(action);
  const current = page.locator(selector).and(page.locator(".studio-drawing-clarity-history button")).filter({ visible: true });
  const candidates = await current.count() > 0 ? current : page.locator(selector).filter({ visible: true });
  if (await candidates.count() === 0) return false;
  const button = await visibleStudioControl(candidates, "소크 " + action + " 기록 명령", 1_000);
  if (await button.isDisabled()) return false;
  await button.click({ timeout: 5_000 });
  return true;
}

async function collapseMobileEditOptions(page: Page, toggles: Locator, row: Locator): Promise<void> {
  const deadline = Date.now() + 3_000;
  const remaining = () => {
    const milliseconds = deadline - Date.now();
    if (milliseconds <= 0) throw new Error("소크 모바일 편집 행을 접는 3000ms 예산을 초과했습니다.");
    return milliseconds;
  };
  const close = await visibleStudioControl(toggles, "소크 모바일 편집 행 접기", remaining());
  const current = await close.getAttribute("aria-expanded", { timeout: remaining() });
  if (current === "true") await close.click({ timeout: remaining() });
  else if (current !== "false") throw new Error("모바일 편집 행을 접기 전 펼침 상태를 확인할 수 없습니다.");
  await toggles.and(page.locator('[aria-expanded="false"]')).waitFor({ state: "visible", timeout: remaining() });
  await row.waitFor({ state: "hidden", timeout: remaining() });
}

/** 접힌 모바일 편집 행은 실제 버튼으로 잠시 열고, 현재 기록 막대의 명령을 실행한 뒤 원상복구한다. */
export async function clickStudioSoakHistoryAction(page: Page, action: StudioHistoryControlKind): Promise<boolean> {
  const toggles = page.locator('button[aria-controls="studio-mobile-edit-options"]').filter({ visible: true });
  // PC와 이전 셸은 모바일 행을 요구하지 않고 기존에 보이는 기록 명령을 사용한다.
  if (await toggles.count() === 0) return clickVisibleHistoryAction(page, action);
  const toggle = await visibleStudioControl(toggles, "소크 모바일 편집 행", 5_000);
  const row = page.locator("#studio-mobile-edit-options");
  if (await row.isVisible()) return clickVisibleHistoryAction(page, action);
  const expanded = await toggle.getAttribute("aria-expanded", { timeout: 5_000 });
  if (expanded !== "false" && expanded !== "true") throw new Error("모바일 편집 버튼의 펼침 상태를 확인할 수 없습니다.");

  let restoreCollapsed = false;
  let result: { value: boolean } | { error: unknown };
  let cleanupFailure: { error: unknown } | undefined;
  try {
    if (expanded === "false") {
      // 클릭 뒤 대기가 실패해도 이미 펼쳐졌을 수 있으므로 정리는 클릭 전부터 책임진다.
      restoreCollapsed = true;
      await toggle.click({ timeout: 5_000 });
      await toggles.and(page.locator('[aria-expanded="true"]')).waitFor({ state: "visible", timeout: 5_000 });
    }
    await visibleStudioControl(row, "소크 모바일 편집 행의 기록 영역", 5_000);
    result = { value: await clickVisibleHistoryAction(page, action) };
  } catch (error) {
    result = { error };
  } finally {
    if (restoreCollapsed) {
      try {
        await collapseMobileEditOptions(page, toggles, row);
      } catch (error) {
        cleanupFailure = { error };
      }
    }
  }
  if (cleanupFailure) {
    if ("error" in result) throw new AggregateError([result.error, cleanupFailure.error], "기록 명령과 모바일 편집 행 접기가 모두 실패했습니다.", { cause: result.error });
    throw cleanupFailure.error;
  }
  if ("error" in result) throw result.error;
  return result.value;
}
