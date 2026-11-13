import { waitForEditorSettled } from "./studio-editor-a11y";

import type { Page } from "@playwright/test";

/** 안료 고급 작업의 준비 대기 중 나타나는 단순 화면을 실제 세션 배치 선택으로 전환한다. */
export async function waitForPigmentEditorSettled(page: Page): Promise<void> {
  const clarity = page.locator('[data-studio-editor="true"][data-studio-drawing-clarity="true"]').first();
  let handling = false;
  const handlerState: { failure: { error: unknown } | null } = { failure: null };
  const revealSavedLayout = async () => {
    if (handlerState.failure !== null) return;
    if (handling) {
      handlerState.failure = { error: new Error("안료 배치 선택 handler가 중첩 호출됐습니다.") };
      return;
    }
    handling = true;
    try {
      const deadline = Date.now() + 60_000;
      const remaining = () => {
        const value = deadline - Date.now();
        if (value <= 0) throw new Error("안료 고급 작업의 명시적 배치 선택 시간이 초과됐습니다.");
        return value;
      };
      const before = new URL(page.url());
    const task = page.locator('dialog[data-studio-drawing-task="tools"]');
    if (!(await task.isVisible())) await page.locator('[data-studio-clarity-more-trigger="true"]').first()
      .click({ timeout: remaining() });
    await task.waitFor({ state: "visible", timeout: remaining() });
    const workspace = task.locator('[data-drawing-task-category="workspace"]');
    if (await workspace.count() === 0) {
      const back = task.getByRole("button", { name: "원고 도구 분류로 돌아가기", exact: true });
      if (await back.count() !== 1) throw new Error("안료 준비의 분류로 돌아가기 버튼은 하나여야 합니다.");
      await back.click({ timeout: remaining() });
    }
    if (await workspace.count() !== 1) throw new Error("안료 준비의 화면과 도움말 목적은 하나여야 합니다.");
    await workspace.click({ timeout: remaining() });
    await task.getByRole("button", { name: "프로젝트·창 도구 보기", exact: true })
      .click({ timeout: remaining() });
    await task.waitFor({ state: "detached", timeout: remaining() });
    await clarity.waitFor({ state: "detached", timeout: remaining() });
    const after = new URL(page.url());
    if (after.origin !== before.origin || after.pathname !== before.pathname || after.hash !== before.hash) {
      throw new Error("배치 선택이 원고의 주소를 변경했습니다.");
    }
    for (const key of new Set(before.searchParams.keys())) {
      if (JSON.stringify(after.searchParams.getAll(key)) !== JSON.stringify(before.searchParams.getAll(key))) {
        throw new Error(`배치 선택이 원고의 기존 연결 문맥을 변경했습니다: ${key}`);
      }
    }

    } catch (error) {
      // 이벤트 callback의 오류는 원래 assertion과 별도이므로 준비 결과까지 직접 전달한다.
      if (handlerState.failure === null) handlerState.failure = { error };
    } finally {
      handling = false;
    }
  };
  await page.addLocatorHandler(clarity, revealSavedLayout);
  let removalAttempted = false;
  const removeHandler = async () => {
    removalAttempted = true;
    await page.removeLocatorHandler(clarity);
  };
  let failure: { error: unknown } | null = null;
  try {
    // 원래 120/60/45초 조건과 재시도는 그대로 쓰며 handler 시간도 그 대기 예산에 포함된다.
    try {
      await waitForEditorSettled(page);
      if (handlerState.failure !== null) throw handlerState.failure.error;
      if (await clarity.isVisible()) {
        // 명시 복구 클릭이 같은 handler를 재호출하지 않게 먼저 해제한다.
        await removeHandler();
        await revealSavedLayout();
        if (handlerState.failure !== null) throw handlerState.failure.error;
        // 한 번만 기존 준비 조건을 다시 확인한다. 재등장은 추가 복구로 넘기지 않는다.
        await waitForEditorSettled(page);
        if (await clarity.isVisible()) throw new Error("안료 준비가 끝난 직후 단순 화면이 다시 나타났습니다.");
      }
    } catch (error) {
      if (handlerState.failure !== null && handlerState.failure.error !== error) {
        throw new AggregateError([handlerState.failure.error, error], "안료 배치 선택과 원래 준비 검사에 실패했습니다.", { cause: error });
      }
      throw error;
    }
    if (handlerState.failure !== null) throw handlerState.failure.error;
  } catch (error) {
    failure = { error };
  }
  // 실제 획·캡처 도중 포커스나 포인터를 가로채지 않도록 준비 구간에서만 등록한다.
  if (!removalAttempted) {
    try { await removeHandler(); }
    catch (cleanupError) {
      if (failure !== null) {
        throw new AggregateError([failure.error, cleanupError], "안료 준비와 handler 해제에 실패했습니다.", { cause: cleanupError });
      }
      throw cleanupError;
    }
  }
  if (failure !== null) throw failure.error;
}
