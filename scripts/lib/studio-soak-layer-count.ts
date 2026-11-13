import { errors, type Page } from "playwright";

import { activateDesktopPen } from "./studio-desktop-brush-activation";

type ReadCount = () => Promise<number>;

/** 필요한 count 관측 동안만 실제 레이어 UI를 열고, 모바일 시트는 항상 닫은 뒤 반환한다. */
export async function withStudioSoakLayerNavigator<T>(
  page: Page,
  timeoutMs: number,
  inspect: (read: ReadCount, deadline: number) => Promise<T>,
): Promise<T> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  const remaining = () => {
    const value = deadline - Date.now();
    if (value <= 0) throw new errors.TimeoutError("소크 레이어 관측의 준비·판정 예산을 초과했습니다.");
    return value;
  };
  const counter = page.locator("[data-studio-layer-available-count]").first();
  const readMounted = async (): Promise<number | null> => {
    if (await counter.count() === 0) return null;
    const raw = await counter.getAttribute("data-studio-layer-available-count", { timeout: remaining() });
    if (raw === null) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error("실제 레이어 count가 유효하지 않습니다.");
    return value;
  };
  const read = async () => {
    const value = await readMounted();
    if (value === null) throw new Error("열린 레이어 UI에서 실제 count를 읽을 수 없습니다.");
    return value;
  };
  const dock = page.locator('[data-studio-mobile-editing-dock="true"]');
  const mobile = await dock.isVisible();
  const sheet = page.locator('[data-studio-sheet-id="props"][data-studio-mobile-sheet="true"]:not([inert])');
  let result: { value: T } | { error: unknown };
  let cleanupFailure: { error: unknown } | undefined;
  try {
    // 모바일은 숨겨진 count DOM이 남는 상태에서도 실제 열린 시트에서 관측한다.
    if (mobile || await readMounted() === null) {
      if (mobile) {
        if (!await sheet.isVisible()) {
          const layers = dock.getByRole("button", { name: "레이어 열기", exact: true });
          const panel = dock.getByRole("button", { name: "작업 패널", exact: true });
          if (!await layers.isVisible() && !await panel.isVisible()) {
            const toggle = dock.locator('[data-studio-mobile-workspace-toggle="true"]');
            if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded", { timeout: remaining() }) !== "true") {
              await toggle.click({ timeout: remaining() });
            }
          }
          if (await layers.isVisible()) await layers.click({ timeout: remaining() });
          else if (await panel.isVisible()) await panel.click({ timeout: remaining() });
          else throw new Error("모바일의 실제 레이어 진입점을 찾을 수 없습니다.");
          await sheet.waitFor({ state: "visible", timeout: remaining() });
        }
      } else await activateDesktopPen(page, remaining());
      const layers = page.locator('[data-studio-inspector-primary-tab="layers"]:visible').first();
      await layers.waitFor({ state: "visible", timeout: remaining() });
      if (await layers.getAttribute("aria-selected", { timeout: remaining() }) !== "true") {
        await layers.click({ timeout: remaining() });
      }
      await counter.waitFor({ state: "attached", timeout: remaining() });
    }
    result = { value: await inspect(read, deadline) };
  } catch (error) {
    result = { error };
  } finally {
    try {
      if (mobile && await sheet.isVisible()) {
        // 판정 deadline은 늘리지 않는다. timeout 뒤에도 닫기는 별도 3초 cleanup 예산으로 수행한다.
        const closeDeadline = Date.now() + 3_000;
        const closeRemaining = () => {
          const value = closeDeadline - Date.now();
          if (value <= 0) throw new errors.TimeoutError("소크 레이어 시트를 닫는 3000ms 예산을 초과했습니다.");
          return value;
        };
        await sheet.locator('button[data-inspector-control-id="panel.chrome.close"]').click({ timeout: closeRemaining() });
        await sheet.waitFor({ state: "hidden", timeout: closeRemaining() });
      }
    } catch (error) {
      cleanupFailure = { error };
    }
  }
  if (cleanupFailure) {
    if ("error" in result) {
      throw new AggregateError([result.error, cleanupFailure.error], "레이어 관측과 모바일 시트 닫기가 모두 실패했습니다.", { cause: result.error });
    }
    throw cleanupFailure.error;
  }
  if ("error" in result) throw result.error;
  return result.value;
}

export async function readStudioSoakLayerCount(page: Page, timeoutMs = 8_000): Promise<number> {
  return withStudioSoakLayerNavigator(page, timeoutMs, async (read, deadline) => {
    const count = await read();
    if (Date.now() >= deadline) throw new errors.TimeoutError("레이어 count가 관측 예산 뒤에 준비됐습니다.");
    return count;
  });
}

export async function waitForStudioSoakLayerCount(page: Page, predicate: (count: number) => boolean, timeoutMs = 5_000): Promise<number> {
  return withStudioSoakLayerNavigator(page, timeoutMs, async (read, deadline) => {
    let count = await read();
    while (!predicate(count) && Date.now() < deadline) {
      await page.waitForTimeout(Math.min(50, deadline - Date.now()));
      if (Date.now() >= deadline) break;
      count = await read();
    }
    if (predicate(count) && Date.now() >= deadline) throw new errors.TimeoutError("레이어 판정이 관측 예산 뒤에 완료됐습니다.");
    return count;
  });
}
