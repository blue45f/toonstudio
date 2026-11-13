import { afterEach, describe, expect, it, vi } from "vitest";

import { waitForEditorSettled } from "../../e2e/helpers/studio-editor-a11y";
import { waitForPigmentEditorSettled } from "../../e2e/helpers/studio-pigment-editor-entry";

import type { Page } from "@playwright/test";

vi.mock("../../e2e/helpers/studio-editor-a11y", () => ({ waitForEditorSettled: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); });

function entry({ simple = true, expanded = false, actionError, detachError, changedUrl, lateSimple = false, commonError, afterSettledSimple = false, recursive = false, repeatAfterHandler = false, cleanupError, repeatAfterSettled = false, recheckError }: {
  simple?: boolean; expanded?: boolean; actionError?: Error; detachError?: Error; changedUrl?: string; lateSimple?: boolean;
  commonError?: Error; afterSettledSimple?: boolean; recursive?: boolean; repeatAfterHandler?: boolean; cleanupError?: Error; repeatAfterSettled?: boolean; recheckError?: Error;
} = {}) {
  const state = { simple, expanded, modal: false, legacyMenuVisible: !simple, reconnectVisible: !simple,
    url: "http://127.0.0.1:4173/studio/draft/work-1?workspace=draw&materialBrush=brush-1" };
  const calls: string[] = [];
  let settledCount = 0;
  let registered: (() => Promise<void>) | null = null;
  const eventErrors: unknown[] = [];
  const blockedMenuError = new Error("원래 메뉴 준비가 단순 화면에서 끝나지 않았습니다.");
  const fireHandler = async () => {
    if (!registered) throw new Error("원래 menuitem 대기가 단순 화면에 막혔습니다.");
    // 실제 EventEmitter의 callback 오류가 원래 assertion을 직접 거부하지 않는 경계를 재현한다.
    try { await registered(); } catch (error) { eventErrors.push(error); }
  };
  const showSavedLayout = vi.fn(async ({ timeout }: { timeout: number }) => {
    expect(timeout).toBeGreaterThan(0); expect(timeout).toBeLessThanOrEqual(60_000);
    calls.push("choose-saved-layout");
    if (actionError) throw actionError;
    state.modal = false; state.simple = false; state.legacyMenuVisible = true; state.reconnectVisible = true;
    if (changedUrl) state.url = changedUrl;
  });
  const advanced = {
    getAttribute: async (name: string) => { expect(name).toBe("open"); return state.expanded ? "" : null; },
    locator: (selector: string) => {
      expect(selector).toBe("summary");
      return { click: vi.fn(async () => { state.expanded = true; calls.push("expand-advanced"); }) };
    },
    getByRole: (role: string, query: { name: string; exact: boolean }) => {
      expect(role).toBe("button"); expect(query).toEqual({ name: "프로젝트·창 도구 보기", exact: true });
      if (!state.expanded) throw new Error("접힌 메뉴의 숨긴 버튼은 선택할 수 없습니다.");
      return { click: showSavedLayout };
    },
  };
  const task = {
    isVisible: async () => state.modal,
    waitFor: vi.fn(async ({ state: expected, timeout }: { state: string; timeout: number }) => {
      expect(timeout).toBeGreaterThan(0); expect(timeout).toBeLessThanOrEqual(60_000);
      calls.push("task-" + expected);
      if (expected === "detached" && detachError) throw detachError;
      expect(state.modal).toBe(expected === "visible");
    }),
    locator: (selector: string) => { expect(selector).toBe("details.studio-drawing-task-advanced"); return advanced; },
  };
  const clarity = {
    first() { return this; },
    isVisible: async () => state.simple,
    waitFor: vi.fn(async ({ state: expected }: { state: string }) => {
      expect(expected).toBe("detached"); expect(state.simple).toBe(false); calls.push("clarity-detached");
    }),
  };
  const trigger = { first() { return this; }, click: vi.fn(async () => {
    state.modal = true; calls.push("open-more");
    if (recursive && registered) await fireHandler();
  }) };
  const page = {
    locator: (selector: string) => {
      if (selector === '[data-studio-editor="true"][data-studio-drawing-clarity="true"]') return clarity;
      if (selector === 'dialog[data-studio-drawing-task="tools"]') return task;
      if (selector === '[data-studio-clarity-more-trigger="true"]') return trigger;
      throw new Error("허용하지 않은 UI 조작: " + selector);
    },
    addLocatorHandler: vi.fn(async (target: unknown, handler: () => Promise<void>) => {
      expect(target).toBe(clarity); registered = handler; calls.push("register-handler");
    }),
    removeLocatorHandler: vi.fn(async (target: unknown) => {
      expect(target).toBe(clarity); registered = null; calls.push("remove-handler");
      if (cleanupError) throw cleanupError;
    }),
    url: () => state.url,
  } as unknown as Page;
  vi.mocked(waitForEditorSettled).mockImplementation(async (target) => {
    expect(target).toBe(page); calls.push("original-settled-start"); settledCount += 1;
    if (settledCount === 2 && recheckError) throw recheckError;
    if (commonError) throw commonError;
    if (lateSimple) {
      expect(state.legacyMenuVisible).toBe(true); expect(state.reconnectVisible).toBe(true);
      calls.push("legacy-first-visible"); await Promise.resolve();
      state.simple = true; state.legacyMenuVisible = false; state.reconnectVisible = false; calls.push("late-clarity");
    }
    if (state.simple) {
      await fireHandler();
      if (repeatAfterHandler) await fireHandler();
    }
    if (state.simple) throw blockedMenuError;
    expect(state.simple).toBe(false); expect(state.legacyMenuVisible).toBe(true); expect(state.reconnectVisible).toBe(true);
    calls.push("original-settled-end");
    if (afterSettledSimple && (settledCount === 1 || repeatAfterSettled)) state.simple = true;
  });
  return { page, state, calls, showSavedLayout, trigger, eventErrors, blockedMenuError };
}

describe("안료 준비의 지연 Clarity handler 수명", () => {
  it("실제 More와 고급 펼침 뒤 기존 배치를 고르고 원래 준비 검사를 마친 뒤 handler를 해제한다", async () => {
    const f = entry(); await waitForPigmentEditorSettled(f.page);
    expect(f.calls).toEqual(["register-handler", "original-settled-start", "open-more", "task-visible", "expand-advanced", "choose-saved-layout", "task-detached", "clarity-detached", "original-settled-end", "remove-handler"]);
    expect(waitForEditorSettled).toHaveBeenCalledExactlyOnceWith(f.page);
  });

  it("기존 메뉴와 재연결이 모두 보였다가 늦게 Clarity로 바뀌어도 원래 assertion 재시도 안에서 전환한다", async () => {
    const f = entry({ simple: false, lateSimple: true }); await waitForPigmentEditorSettled(f.page);
    expect(f.calls.indexOf("legacy-first-visible")).toBeLessThan(f.calls.indexOf("late-clarity"));
    expect(f.calls.indexOf("late-clarity")).toBeLessThan(f.calls.indexOf("open-more"));
    expect(f.showSavedLayout).toHaveBeenCalledOnce();
    expect(waitForEditorSettled).toHaveBeenCalledExactlyOnceWith(f.page);
    expect(f.calls.at(-1)).toBe("remove-handler");
  });

  it("기존 배치에서는 설정을 고르지 않고 원래 준비 조건만 유지한다", async () => {
    const f = entry({ simple: false }); await waitForPigmentEditorSettled(f.page);
    expect(f.trigger.click).not.toHaveBeenCalled(); expect(f.showSavedLayout).not.toHaveBeenCalled();
    expect(f.calls).toEqual(["register-handler", "original-settled-start", "original-settled-end", "remove-handler"]);
  });

  it("재열기마다 handler를 새로 등록하고 해당 준비가 끝나면 제거한다", async () => {
    const f = entry(); await waitForPigmentEditorSettled(f.page);
    f.state.simple = true; f.state.expanded = false;
    await waitForPigmentEditorSettled(f.page);
    expect(f.page.addLocatorHandler).toHaveBeenCalledTimes(2); expect(f.page.removeLocatorHandler).toHaveBeenCalledTimes(2);
    expect(f.showSavedLayout).toHaveBeenCalledTimes(2); expect(waitForEditorSettled).toHaveBeenCalledTimes(2);
  });

  it("UI 선택 실패도 숨기지 않고 handler를 반드시 제거한다", async () => {
    const error = new Error("원래 동작 실패"); const f = entry({ actionError: error });
    await expect(waitForPigmentEditorSettled(f.page)).rejects.toMatchObject({
      errors: [error, f.blockedMenuError], cause: f.blockedMenuError,
    });
    expect(f.eventErrors).toEqual([]);
    expect(f.calls.at(-1)).toBe("remove-handler");
  });

  it("기존 공통 준비의 다른 실패도 그대로 전파하고 handler를 제거한다", async () => {
    const error = new Error("지연 로딩 실패"); const f = entry({ simple: false, commonError: error });
    await expect(waitForPigmentEditorSettled(f.page)).rejects.toBe(error);
    expect(f.calls.at(-1)).toBe("remove-handler");
  });

  it("native More가 사라지지 않으면 성공으로 바꾸지 않는다", async () => {
    const error = new Error("More가 남아 있습니다."); const f = entry({ detachError: error });
    await expect(waitForPigmentEditorSettled(f.page)).rejects.toBe(error);
    expect(f.calls.at(-1)).toBe("remove-handler");
  });

  it.each([
    ["http://127.0.0.1:4173/studio/draft/another?workspace=draw&materialBrush=brush-1", "원고의 주소"],
    ["http://127.0.0.1:4173/studio/draft/work-1?workspace=draw&materialBrush=another", "기존 연결 문맥"],
  ])("원고·연결 identity 변경을 유지된 실패로 판정한다: %s", async (changedUrl, message) => {
    const f = entry({ changedUrl }); await expect(waitForPigmentEditorSettled(f.page)).rejects.toThrow(message);
    expect(f.calls).toContain("original-settled-end"); expect(f.eventErrors).toEqual([]);
    expect(f.calls.at(-1)).toBe("remove-handler");
  });

  it("같은 handler의 중첩 호출을 조용히 통과시키지 않는다", async () => {
    const f = entry({ recursive: true });
    await expect(waitForPigmentEditorSettled(f.page)).rejects.toThrow("중첩 호출");
    expect(f.calls.at(-1)).toBe("remove-handler");
  });

  it("callback 첫 실패 이후 재평가돼도 UI를 다시 조작하지 않고 원래 실패와 준비 실패를 보존한다", async () => {
    const error = new Error("실제 선택 실패"); const f = entry({ actionError: error, repeatAfterHandler: true });
    await expect(waitForPigmentEditorSettled(f.page)).rejects.toMatchObject({ errors: [error, f.blockedMenuError], cause: f.blockedMenuError });
    expect(f.showSavedLayout).toHaveBeenCalledOnce(); expect(f.trigger.click).toHaveBeenCalledOnce();
    expect(f.eventErrors).toEqual([]); expect(f.calls.at(-1)).toBe("remove-handler");
  });

  it("준비가 성공해도 handler 해제 실패를 원문으로 전달한다", async () => {
    const error = new Error("handler 해제 실패"); const f = entry({ simple: false, cleanupError: error });
    await expect(waitForPigmentEditorSettled(f.page)).rejects.toBe(error);
    expect(f.calls).toContain("original-settled-end");
    expect(f.page.removeLocatorHandler).toHaveBeenCalledOnce();
  });

  it("준비와 handler 해제 동시 실패를 해제 오류 cause와 두 원인으로 보존한다", async () => {
    const prepare = new Error("공통 준비 실패"), cleanup = new Error("handler 해제 실패");
    const f = entry({ simple: false, commonError: prepare, cleanupError: cleanup });
    const result = waitForPigmentEditorSettled(f.page);
    await expect(result).rejects.toBeInstanceOf(AggregateError);
    await expect(result).rejects.toMatchObject({ errors: [prepare, cleanup], cause: cleanup });
    expect(f.page.removeLocatorHandler).toHaveBeenCalledOnce();
  });

  it("공통 준비 뒤 늦은 Clarity는 handler를 해제한 실제 UI 선택 한 번과 준비 재검사로 마친다", async () => {
    const f = entry({ simple: false, afterSettledSimple: true, recursive: true });
    await waitForPigmentEditorSettled(f.page);
    expect(f.calls.indexOf("remove-handler")).toBeLessThan(f.calls.indexOf("open-more"));
    expect(f.showSavedLayout).toHaveBeenCalledOnce(); expect(waitForEditorSettled).toHaveBeenCalledTimes(2);
    expect(f.page.addLocatorHandler).toHaveBeenCalledOnce(); expect(f.page.removeLocatorHandler).toHaveBeenCalledOnce();
    expect(f.state.simple).toBe(false); expect(f.eventErrors).toEqual([]);
  });

  it("한 번 명시 선택한 뒤에도 단순 화면이 재등장하면 다시 복구하지 않고 실패한다", async () => {
    const f = entry({ simple: false, afterSettledSimple: true, repeatAfterSettled: true });
    await expect(waitForPigmentEditorSettled(f.page)).rejects.toThrow("준비가 끝난 직후");
    expect(f.showSavedLayout).toHaveBeenCalledOnce(); expect(waitForEditorSettled).toHaveBeenCalledTimes(2);
    expect(f.page.removeLocatorHandler).toHaveBeenCalledOnce();
  });

  it("늦은 화면의 실제 UI 선택 실패도 원문으로 전달하며 재검사나 복구를 반복하지 않는다", async () => {
    const error = new Error("늦은 실제 선택 실패");
    const f = entry({ simple: false, afterSettledSimple: true, actionError: error });
    await expect(waitForPigmentEditorSettled(f.page)).rejects.toBe(error);
    expect(f.showSavedLayout).toHaveBeenCalledOnce(); expect(waitForEditorSettled).toHaveBeenCalledOnce();
    expect(f.page.removeLocatorHandler).toHaveBeenCalledOnce();
  });

  it("명시 선택 후 원래 준비 재검사가 실패하면 원래 실패를 유지한다", async () => {
    const error = new Error("재검사의 실제 준비 실패");
    const f = entry({ simple: false, afterSettledSimple: true, recheckError: error });
    await expect(waitForPigmentEditorSettled(f.page)).rejects.toBe(error);
    expect(f.showSavedLayout).toHaveBeenCalledOnce(); expect(waitForEditorSettled).toHaveBeenCalledTimes(2);
    expect(f.page.removeLocatorHandler).toHaveBeenCalledOnce();
  });

  it("명시 UI 선택 전 handler 해제 실패는 UI를 조작하지 않고 한 번의 실패로 남긴다", async () => {
    const error = new Error("늦은 handler 해제 실패");
    const f = entry({ simple: false, afterSettledSimple: true, cleanupError: error });
    await expect(waitForPigmentEditorSettled(f.page)).rejects.toBe(error);
    expect(f.showSavedLayout).not.toHaveBeenCalled(); expect(waitForEditorSettled).toHaveBeenCalledOnce();
    expect(f.page.removeLocatorHandler).toHaveBeenCalledOnce();
  });
});
