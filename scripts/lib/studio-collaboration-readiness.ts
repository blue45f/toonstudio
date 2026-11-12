import { errors, type Page } from "playwright";

/** 지연 마운트된 시작 안내를 실제로 닫고, 보이는 dock의 문서 phase를 확인한다. */
export async function waitForStudioCollaborationDocumentLane(
  page: Page,
  readyPhases: ReadonlySet<string>,
  timeoutMs = 30_000,
): Promise<string> {
  const dock = page.locator('[data-studio-presence-dock="true"]').first();
  const welcome = page.locator('[data-studio-cinematic-canvas-welcome="true"]');
  const deadline = Date.now() + timeoutMs;
  let lastPhase: string | null = null;
  let lastTimeout: string | null = null;

  while (Date.now() < deadline) {
    try {
      if (await welcome.isVisible()) {
        // 클릭이 가로막혀도 전체 readiness 제한 시간을 새로 시작하지 않는다.
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await welcome.getByRole("button", { name: "시작 안내 닫기", exact: true }).click({
          timeout: Math.min(1_000, remaining),
        });
      }

      if (!(await welcome.isVisible()) && await dock.isVisible()) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        lastPhase = await dock.getAttribute("data-studio-sync-phase", { timeout: remaining });
        if (
          lastPhase !== null && readyPhases.has(lastPhase)
          && await dock.isVisible() && !(await welcome.isVisible())
          && Date.now() < deadline
        ) return lastPhase;
      }
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) throw error;
      lastTimeout = error.message;
    }

    const remaining = deadline - Date.now();
    if (remaining > 0) await page.waitForTimeout(Math.min(100, remaining));
  }

  throw new Error(
    `협업 문서 준비 시간 ${timeoutMs}ms 초과: 시작 안내 닫기와 dock 표시/phase를 확인하세요. `
    + `url=${page.url()}, phase=${lastPhase ?? "unavailable"}`
    + (lastTimeout ? `, 마지막 UI 대기 오류: ${lastTimeout}` : "")
    + "\n복구 후 pnpm exec tsx scripts/verify-studio-collaboration-sync.mts로 다시 검증하세요.",
  );
}


/** 현재 화면의 실제 펜 버튼을 선택한다. 새 기본 화면에 숨겨진 기존 옵션 도크를 강요하지 않는다. */
export async function selectStudioCollaborationPen(page: Page, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const remaining = () => {
    const value = deadline - Date.now();
    if (value <= 0) throw new Error(`협업 펜 선택 시간 ${timeoutMs}ms 초과: ${page.url()}`);
    return value;
  };
  const clarity = page.locator('[data-studio-editor="true"][data-studio-drawing-clarity="true"]').first();
  if (await clarity.isVisible()) {
    const desktopPen = clarity.locator(".studio-drawing-clarity-rail").getByRole("toolbar", { name: /^(그리기 도구|Drawing tools)$/u })
      .getByRole("button", { name: /^(펜|Pen)$/u }).first();
    const desktop = await desktopPen.isVisible();
    const pen = desktop ? desktopPen
      : clarity.locator('[data-studio-mobile-editing-dock="true"] [data-studio-primary-action="draw"]:visible').first();
    await pen.waitFor({ state: "visible", timeout: remaining() });
    // PC의 선택 표시는 다른 그리기 모드도 포함한다. 모바일만 이미 선택됐을 때 시트를 다시 열지 않는다.
    if (desktop || await pen.getAttribute("aria-pressed", { timeout: remaining() }) !== "true") await pen.click({ timeout: remaining() });
    await page.waitForFunction((button) => button?.isConnected === true && button.getAttribute("aria-pressed") === "true",
      await pen.elementHandle({ timeout: remaining() }), { timeout: remaining() });
    return;
  }

  const pen = page.locator('[data-studio-rail-tool-id="pen"]:visible, [data-studio-current-tool-id="pen"]:visible, [data-studio-mobile-editing-dock="true"] [data-studio-primary-action="draw"]:visible').first();
  await pen.waitFor({ state: "visible", timeout: remaining() });
  if (await pen.getAttribute("aria-pressed", { timeout: remaining() }) !== "true") await pen.click({ timeout: remaining() });
  await page.waitForFunction((button) => button?.isConnected === true && button.getAttribute("aria-pressed") === "true",
    await pen.elementHandle({ timeout: remaining() }), { timeout: remaining() });
  const drawOptions = page.locator('[data-studio-draw-options="true"]').first();
  await drawOptions.waitFor({ state: "visible", timeout: remaining() });
  await page.waitForFunction((toolbar) => toolbar?.isConnected === true && toolbar.getAttribute("data-studio-active-draw-mode") === "pen",
    await drawOptions.elementHandle({ timeout: remaining() }), { timeout: remaining() });
}
