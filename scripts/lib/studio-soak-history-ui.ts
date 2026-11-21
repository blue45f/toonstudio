import { visibleStudioControl } from "./studio-shell-interactions";
import { studioHistoryControlSelector, type StudioHistoryControlKind } from "./studio-verify-history-controls.mjs";

import type { Page } from "playwright";

/** 현재 기록 막대의 사용자 버튼을 우선하며 기존 메뉴·모바일 도크의 동일 명령도 유지한다. */
export async function clickStudioSoakHistoryAction(page: Page, action: StudioHistoryControlKind): Promise<boolean> {
  const selector = studioHistoryControlSelector(action);
  const current = page.locator(selector).and(page.locator(".studio-drawing-clarity-history button")).filter({ visible: true });
  const candidates = await current.count() > 0 ? current : page.locator(selector).filter({ visible: true });
  if (await candidates.count() === 0) return false;
  const button = await visibleStudioControl(candidates, "소크 " + action + " 기록 명령", 1_000);
  if (await button.isDisabled()) return false;
  await button.click({ timeout: 5_000 });
  return true;
}
