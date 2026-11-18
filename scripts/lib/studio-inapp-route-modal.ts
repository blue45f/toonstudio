import { visibleStudioControl } from "./studio-shell-interactions";

import type { Page } from "playwright";


/** 만화 라우트가 의도적으로 연 컨트롤 룸의 감사 후 실제 닫기 동선부터 검증한다. */
export async function closeStudioInAppRouteModal(page: Page, routeId: string, timeoutMs = 10_000): Promise<string | null> {
  if (routeId !== "comic") return null;
  const name = "스토리보드 컨트롤 룸";
  const dialog = page.getByRole("dialog", { name, exact: true }).filter({ visible: true });
  await dialog.waitFor({ state: "visible", timeout: timeoutMs });
  if (await dialog.count() !== 1 || await dialog.getAttribute("aria-modal") !== "true") {
    throw new Error("만화 라우트의 스토리보드 모달이 유일한 활성 대화상자가 아닙니다.");
  }
  const close = await visibleStudioControl(dialog.getByRole("button", { name: "닫기", exact: true }),
    "스토리보드 닫기", timeoutMs);
  await close.click({ timeout: timeoutMs });
  await dialog.waitFor({ state: "hidden", timeout: timeoutMs });
  return name;
}
