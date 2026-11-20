import { visibleStudioControl } from "./studio-shell-interactions";
import { showStudioMobileEditOptions, studioDocumentHistoryButtons } from "./studio-verifier-entry-points";

import type { Locator, Page } from "playwright";

export const STUDIO_SWEEP_TOOLS = Object.freeze({
  선택: "select", 펜: "pen", 픽셀: "pixel-pencil", 지우개: "eraser", 채우기: "fill", 도형: "shape-rect",
});
export type StudioSweepTool = keyof typeof STUDIO_SWEEP_TOOLS;

export function studioSweepToolState(page: Page, name: StudioSweepTool): Locator {
  const dock = page.locator('[data-studio-mobile-editing-dock="true"]');
  if (name === "펜") return dock.locator('button[data-studio-primary-action="draw"]');
  if (name === "지우개") return dock.locator('button[data-studio-mobile-tool="eraser"]');
  // 접힌 기존 도크도 같은 편집 상태를 표시한다. 숨은 버튼은 읽기만 하고 누르지 않는다.
  return dock.locator('[data-studio-mobile-workspace-menu="true"]')
    .getByRole("button", { name, exact: true, includeHidden: true });
}

export async function assertStudioSweepTool(page: Page, name: StudioSweepTool): Promise<void> {
  const state = studioSweepToolState(page, name);
  if (await state.count() !== 1) throw new Error(`${name}: 도구 상태가 하나여야 합니다.`);
  await state.and(page.locator('[aria-pressed="true"]')).waitFor({ state: "attached", timeout: 5_000 });
  if (await state.getAttribute("aria-pressed") !== "true") throw new Error(`${name}: 도구가 활성화되지 않았습니다.`);
}

async function historyCounter(page: Page, attribute: string, description: string): Promise<number> {
  const raw = await page.locator('[data-studio-editor="true"]').getAttribute(attribute);
  const value = Number(raw);
  if (raw === null || !/^\d+$/u.test(raw) || !Number.isSafeInteger(value)) throw new Error(`${description}가 유효하지 않습니다.`);
  return value;
}

export function studioSweepHistoryDepth(page: Page): Promise<number> {
  return historyCounter(page, "data-studio-history-undo-depth", "편집 기록 깊이");
}

export function studioSweepHistoryAppends(page: Page): Promise<number> {
  return historyCounter(page, "data-studio-history-total-appends", "편집 기록 추가 횟수");
}

export async function waitForStudioSweepDrawingCommit(page: Page, before: number): Promise<void> {
  await page.waitForFunction((previous) => {
    const raw = document.querySelector('[data-studio-editor="true"]')?.getAttribute("data-studio-history-total-appends");
    return raw !== null && raw !== undefined && /^\d+$/u.test(raw) && Number.isSafeInteger(Number(raw)) && Number(raw) > previous;
  }, before, { timeout: 5_000 });
}

/** 현재 문서 기록 버튼을 눌러 undo 깊이가 줄고 redo로 복구되는지 확인한다. */
export async function verifyStudioSweepUndoRedo(page: Page): Promise<"ok"> {
  await showStudioMobileEditOptions(page);
  const depth = await studioSweepHistoryDepth(page);
  if (depth === 0) throw new Error("undo/redo 검사에는 실제 편집 기록이 필요합니다.");
  for (const [label, expected] of [["실행취소", depth - 1], ["다시실행", depth]] as const) {
    const button = await visibleStudioControl(await studioDocumentHistoryButtons(page, label), `문서 ${label}`);
    await button.click({ timeout: 5_000 });
    await page.waitForFunction((next) => document.querySelector('[data-studio-editor="true"]')
      ?.getAttribute("data-studio-history-undo-depth") === String(next), expected, { timeout: 5_000 });
  }
  return "ok";
}

/** 현재 보기 메뉴를 그대로 쓰고 정본 도크의 확대율 표시로 결과를 관측한다. */
export async function verifyStudioSweepZoom(
  page: Page,
  selectViewCommand: (id: "zoom-in" | "zoom-out" | "fit") => Promise<void>,
): Promise<"ok"> {
  const value = page.locator('[data-studio-mobile-editing-dock="true"]')
    .getByRole("button", { name: "화면 폭에 맞춤", exact: true, includeHidden: true });
  if (await value.count() !== 1) throw new Error("캔버스 확대율 표시가 하나여야 합니다.");
  const read = async () => {
    const raw = (await value.textContent())?.trim() ?? "";
    const percent = Number(raw.replace(/%$/u, ""));
    if (!/^\d+(?:\.\d+)?%$/u.test(raw) || !Number.isFinite(percent) || percent <= 0) throw new Error("캔버스 확대율이 유효하지 않습니다.");
    return percent;
  };
  await selectViewCommand("fit");
  const fitted = await read();
  await selectViewCommand("zoom-in");
  const larger = await read();
  if (!(larger > fitted)) throw new Error("캔버스 확대율이 증가하지 않았습니다.");
  await selectViewCommand("zoom-out");
  if (!(await read() < larger)) throw new Error("캔버스 확대율이 감소하지 않았습니다.");
  await selectViewCommand("zoom-in");
  if (await read() === fitted) throw new Error("화면 맞춤 검사용 확대율이 기준과 같습니다.");
  await selectViewCommand("fit");
  if (await read() !== fitted) throw new Error("화면 맞춤이 기준 확대율을 복원하지 않았습니다.");
  return "ok";
}
