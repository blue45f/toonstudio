import { errors, type Page } from "playwright";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { selectStudioCollaborationPen, waitForStudioCollaborationDocumentLane } from "./studio-collaboration-readiness";

const readyPhases = new Set(["synced", "read-only-follower", "syncing", "offline-queued"]);

function createPage() {
  const state = { welcome: false, dock: false, phase: "starting", blocked: false };
  const pause = (timeout: number) => new Promise<void>((resolve) => setTimeout(resolve, timeout));
  const click = vi.fn(async ({ timeout }: { timeout: number }) => {
    if (state.blocked) {
      await pause(timeout);
      throw new errors.TimeoutError("닫기 버튼이 비활성 상태입니다.");
    }
    state.welcome = false;
  });
  const getByRole = vi.fn(() => ({ click }));
  const welcome = { isVisible: async () => state.welcome, getByRole };
  const dock = {
    // 실제 CSS guard와 같은 조건: welcome이 있으면 synced dock도 보이지 않는다.
    isVisible: async () => state.dock && !state.welcome,
    getAttribute: async () => state.phase,
    first: () => dock,
  };
  const page = {
    locator: (selector: string) => {
      if (selector === '[data-studio-presence-dock="true"]') return dock;
      if (selector === '[data-studio-cinematic-canvas-welcome="true"]') return welcome;
      throw new Error(`예상하지 않은 locator: ${selector}`);
    },
    waitForTimeout: pause,
    url: () => "http://127.0.0.1:4173/studio/canvas",
  } as unknown as Page;
  return { page, state, click, getByRole };
}

describe("협업 검증기 시작 안내 readiness", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it.each([false, true])("대기 시작 뒤 나타난 안내를 닫는다 (초기 dock=%s)", async (initialDock) => {
    const { page, state, click, getByRole } = createPage();
    state.dock = initialDock;
    const started = Date.now();
    const result = waitForStudioCollaborationDocumentLane(page, readyPhases);
    // 최초 dismissOverlays와 readiness 시작 때는 안내가 없다.
    await vi.advanceTimersByTimeAsync(150);
    expect(click).not.toHaveBeenCalled();
    state.welcome = true;
    state.dock = true;
    state.phase = "synced";
    await vi.advanceTimersByTimeAsync(50);

    await expect(result).resolves.toBe("synced");
    expect(Date.now() - started).toBe(200);
    expect(getByRole).toHaveBeenCalledWith("button", { name: "시작 안내 닫기", exact: true });
    expect(click).toHaveBeenCalledExactlyOnceWith({ timeout: 1_000 });
    expect(state.welcome).toBe(false);
  });

  it("초기 2초 동안 조작이 막혀도 동일 deadline 안에서 실제 닫기 완료를 확인한다", async () => {
    const { page, state, click } = createPage();
    state.welcome = true; state.blocked = true; state.dock = true; state.phase = "synced";
    const result = waitForStudioCollaborationDocumentLane(page, readyPhases, 5_000);
    await vi.advanceTimersByTimeAsync(2_100);
    state.blocked = false;
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toBe("synced");
    expect(click).toHaveBeenCalledTimes(3);
    expect(state.welcome).toBe(false);
  });

  it("synced여도 계속 숨겨진 dock은 통과시키지 않는다", async () => {
    const { page, state } = createPage();
    state.phase = "synced";
    const result = expect(waitForStudioCollaborationDocumentLane(page, readyPhases, 300))
      .rejects.toThrow("협업 문서 준비 시간 300ms 초과");
    await vi.advanceTimersByTimeAsync(300);
    await result;
  });

  it("보이는 dock도 허용되지 않은 phase이면 통과시키지 않는다", async () => {
    const { page, state } = createPage();
    state.dock = true;
    state.phase = "disconnected";
    const result = expect(waitForStudioCollaborationDocumentLane(page, readyPhases, 300))
      .rejects.toThrow("phase=disconnected");
    await vi.advanceTimersByTimeAsync(300);
    await result;
  });

  it("늦은 안내의 클릭 재시도도 남은 제한 시간만 사용한다", async () => {
    const { page, state, click } = createPage();
    const started = Date.now();
    const result = expect(waitForStudioCollaborationDocumentLane(page, readyPhases, 300))
      .rejects.toThrow("협업 문서 준비 시간 300ms 초과");
    await vi.advanceTimersByTimeAsync(150);
    state.welcome = true;
    state.dock = true;
    state.phase = "synced";
    state.blocked = true;
    await vi.advanceTimersByTimeAsync(150);
    await result;
    expect(Date.now() - started).toBe(300);
    expect(click).toHaveBeenCalledExactlyOnceWith({ timeout: 100 });
    expect(state.welcome).toBe(true);
  });

  it("타임아웃 이외의 브라우저 오류를 삼키지 않는다", async () => {
    const { page, state, click } = createPage();
    state.welcome = true;
    click.mockRejectedValueOnce(new Error("브라우저가 닫혔습니다."));
    await expect(waitForStudioCollaborationDocumentLane(page, readyPhases))
      .rejects.toThrow("브라우저가 닫혔습니다.");
  });

  it("닫기 클릭이 반복 실패해도 최초 deadline을 연장하지 않는다", async () => {
    const { page, state, click } = createPage();
    state.welcome = true;
    state.blocked = true;
    const started = Date.now();
    const result = expect(waitForStudioCollaborationDocumentLane(page, readyPhases, 2_500))
      .rejects.toThrow("협업 문서 준비 시간 2500ms 초과");
    await vi.advanceTimersByTimeAsync(2_500);
    await result;
    expect(Date.now() - started).toBe(2_500);
    expect(click.mock.calls).toEqual([[{ timeout: 1_000 }], [{ timeout: 1_000 }], [{ timeout: 300 }]]);
  });
});


function penUi({ clarity = true, mobile = false, selected = false, clickError, remainsUnselected = false, toolbarMode = "pen", connected = true, mobileToolbarName = "드로잉 도구" }: {
  clarity?: boolean; mobile?: boolean; selected?: boolean; clickError?: Error; remainsUnselected?: boolean; toolbarMode?: string; connected?: boolean; mobileToolbarName?: string;
} = {}) {
  const calls: string[] = [];
  const state = { selected };
  const buttonElement = { isConnected: connected, getAttribute: (name: string) => name === "aria-pressed" ? String(state.selected) : null };
  const toolbarElement = { isConnected: connected, getAttribute: (name: string) => name === "data-studio-active-draw-mode" ? toolbarMode : null };
  const pen = {
    first() { return this; },
    isVisible: async () => true,
    getAttribute: async (name: string) => buttonElement.getAttribute(name),
    elementHandle: async () => buttonElement,
    waitFor: async () => { calls.push("pen-visible"); },
    click: vi.fn(async () => {
      calls.push("pen-click");
      if (clickError) throw clickError;
      if (!remainsUnselected) state.selected = true;
    }),
  };
  const desktopPen = { ...pen, isVisible: async () => !mobile };
  const drawOptions = {
    first() { return this; },
    elementHandle: async () => toolbarElement,
    waitFor: vi.fn(async () => { calls.push("legacy-options-visible"); }),
  };
  const desktopRail = {
    getByRole: (_role: string, { name }: { name: RegExp }) => {
      expect(name.test("그리기 도구")).toBe(true);
      expect(name.test("Drawing tools")).toBe(true);
      return { getByRole: (_button: string, query: { name: RegExp }) => {
        expect(query.name.test("펜")).toBe(true); expect(query.name.test("Pen")).toBe(true);
        return desktopPen;
      } };
    },
  };
  const unscopedToolbar = vi.fn((_role: string, { name }: { name: RegExp }) => ({
    getByRole: () => mobile && name.test(mobileToolbarName) ? pen : desktopPen,
  }));
  const shell = {
    first() { return this; },
    isVisible: async () => clarity,
    getByRole: unscopedToolbar,
    locator: (selector: string) => {
      if (selector === ".studio-drawing-clarity-rail") return desktopRail;
      expect(selector).toContain('[data-studio-primary-action="draw"]:visible');
      return pen;
    },
  };
  const page = {
    locator: (selector: string) => {
      if (selector === '[data-studio-editor="true"][data-studio-drawing-clarity="true"]') return shell;
      if (selector === '[data-studio-draw-options="true"]') return drawOptions;
      expect(selector).toContain('[data-studio-rail-tool-id="pen"]:visible');
      expect(selector).not.toContain('[data-studio-rail-tool-id="draw"]');
      return pen;
    },
    waitForFunction: vi.fn(async (predicate: (node: typeof buttonElement) => boolean, node: typeof buttonElement, options: { timeout: number }) => {
      expect(options.timeout).toBeGreaterThan(0); expect(options.timeout).toBeLessThanOrEqual(10_000);
      if (!predicate(node)) throw new errors.TimeoutError("실제 펜 선택 상태를 확인하지 못했습니다.");
      calls.push(node === buttonElement ? "pen-selected" : "legacy-pen-mode");
    }),
    url: () => "http://127.0.0.1:4173/studio/canvas",
  } as unknown as Page;
  return { page, state, calls, pen, drawOptions, unscopedToolbar };
}

describe("협업 검증기의 실제 화면별 펜 선택", () => {
  it("새 PC 화면의 이름 있는 펜을 누르고 실제 선택 상태를 확인한다", async () => {
    const f = penUi(); await selectStudioCollaborationPen(f.page);
    expect(f.calls).toEqual(["pen-visible", "pen-click", "pen-selected"]);
    expect(f.pen.click).toHaveBeenCalledOnce();
    expect(f.drawOptions.waitFor).not.toHaveBeenCalled();
  });

  it("새 모바일 화면의 미선택 펜도 실제 버튼으로 선택한다", async () => {
    const f = penUi({ mobile: true }); await selectStudioCollaborationPen(f.page);
    expect(f.calls).toEqual(["pen-visible", "pen-click", "pen-selected"]);
  });

  it("PC의 선택 표시가 이미 켜져 있어도 실제 펜 버튼을 눌러 정확한 펜 모드로 맞춘다", async () => {
    const f = penUi({ selected: true }); await selectStudioCollaborationPen(f.page);
    expect(f.pen.click).toHaveBeenCalledOnce();
    expect(f.calls).toEqual(["pen-visible", "pen-click", "pen-selected"]);
  });

  it("이미 선택한 모바일 펜의 설정 시트를 다시 열지 않는다", async () => {
    const f = penUi({ mobile: true, selected: true }); await selectStudioCollaborationPen(f.page);
    expect(f.pen.click).not.toHaveBeenCalled();
    expect(f.calls).toEqual(["pen-visible", "pen-selected"]);
  });

  it("영어 모바일의 같은 Drawing tools 이름을 PC 레일로 오인하지 않는다", async () => {
    const f = penUi({ mobile: true, selected: true, mobileToolbarName: "Drawing tools" });
    await selectStudioCollaborationPen(f.page);
    expect(f.pen.click).not.toHaveBeenCalled();
    expect(f.unscopedToolbar).not.toHaveBeenCalled();
    expect(f.calls).toEqual(["pen-visible", "pen-selected"]);
  });

  it("기존 화면은 명시적 펜 선택과 보이는 기존 옵션의 pen 상태를 모두 요구한다", async () => {
    const f = penUi({ clarity: false }); await selectStudioCollaborationPen(f.page);
    expect(f.calls).toEqual(["pen-visible", "pen-click", "pen-selected", "legacy-options-visible", "legacy-pen-mode"]);
  });

  it("클릭 실패를 숨기거나 다른 입력으로 우회하지 않는다", async () => {
    const error = new Error("편집 잠금"); const f = penUi({ clickError: error });
    await expect(selectStudioCollaborationPen(f.page)).rejects.toBe(error);
    expect(f.calls).toEqual(["pen-visible", "pen-click"]);
  });

  it("버튼을 눌러도 실제 선택되지 않으면 잉크 검증으로 진행하지 않는다", async () => {
    const f = penUi({ remainsUnselected: true });
    await expect(selectStudioCollaborationPen(f.page)).rejects.toThrow("실제 펜 선택 상태");
  });

  it("기존 옵션이 보여도 지우개 모드이면 통과시키지 않는다", async () => {
    const f = penUi({ clarity: false, selected: true, toolbarMode: "eraser" });
    await expect(selectStudioCollaborationPen(f.page)).rejects.toThrow("실제 펜 선택 상태");
    expect(f.drawOptions.waitFor).toHaveBeenCalledOnce();
  });

  it("분리된 예전 버튼의 선택 표시를 현재 UI 성공으로 사용하지 않는다", async () => {
    const f = penUi({ selected: true, connected: false });
    await expect(selectStudioCollaborationPen(f.page)).rejects.toThrow("실제 펜 선택 상태");
  });
});
