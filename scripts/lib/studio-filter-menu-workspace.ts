import type { Page } from "playwright";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** 세부 도구가 필요한 검증에서 원본 픽셀을 재기 전에 실제 메뉴 배치를 연다. */
export async function prepareFilterMenuWorkspace(page: Page, timeoutMs = 10_000): Promise<boolean> {
  const clarity = page.locator('[data-studio-editor="true"][data-studio-drawing-clarity="true"]').first();
  if (!await clarity.isVisible()) return false;
  const deadline = Date.now() + timeoutMs;
  const remaining = () => {
    const value = deadline - Date.now();
    if (value <= 0) throw new Error(`메뉴 작업 배치 진입 ${timeoutMs}ms 예산을 초과했습니다.`);
    return value;
  };
  const originalUrl = page.url();
  const shell = page.locator("#studio-app-shell");
  const originalDensity = await shell.getAttribute("data-studio-ui-density", { timeout: remaining() });
  const more = page.locator('summary[data-studio-clarity-more-trigger="true"]:visible');
  invariant(await more.count() === 1, "필터 검증의 실제 더보기 진입점은 하나여야 합니다");
  const tools = page.getByRole("dialog", { name: "원고 도구", exact: true });
  if (!await tools.isVisible()) await more.click({ timeout: remaining() });
  await tools.waitFor({ state: "visible", timeout: remaining() });
  const workspace = tools.locator('[data-drawing-task-category="workspace"]');
  if (await workspace.count() === 0) {
    const back = tools.getByRole("button", { name: "원고 도구 분류로 돌아가기", exact: true });
    invariant(await back.count() === 1, "필터 검증의 화면과 도움말 목적은 하나여야 합니다: 분류로 돌아가기 버튼을 확인하세요");
    await back.click({ timeout: remaining() });
  }
  invariant(await workspace.count() === 1, "필터 검증의 화면과 도움말 목적은 하나여야 합니다");
  await workspace.click({ timeout: remaining() });
  await tools.getByRole("button", { name: "프로젝트·창 도구 보기", exact: true }).click({ timeout: remaining() });
  await tools.waitFor({ state: "hidden", timeout: remaining() });
  await page.locator('[data-studio-main-menu="true"]').waitFor({ state: "visible", timeout: remaining() });
  invariant(page.url() === originalUrl, "메뉴 배치 진입이 필터 대상 원고 URL을 바꿨습니다");
  invariant(await shell.getAttribute("data-studio-ui-density", { timeout: remaining() }) === originalDensity,
    "메뉴 배치 진입이 사용자의 화면 구성 설정을 바꿨습니다");
  return true;
}
