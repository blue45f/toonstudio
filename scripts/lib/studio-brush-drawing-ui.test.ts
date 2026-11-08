import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prepareStudioBrushDrawingUi } from "./studio-brush-drawing-ui";
import { waitForStudioDrawingReady } from "./studio-drawing-readiness";

import type { Page } from "playwright";

vi.mock("./studio-drawing-readiness", () => ({ waitForStudioDrawingReady: vi.fn() }));

function fakePage({ welcomeVisible = true, drawNowVisible = true, hideError }: {
  welcomeVisible?: boolean;
  drawNowVisible?: boolean;
  hideError?: Error;
} = {}) {
  const calls: string[] = [];
  const drawNowClick = vi.fn(async () => { calls.push("draw-now"); });
  const closeClick = vi.fn(async () => { calls.push("close-guide"); });
  const waitForHidden = vi.fn(async (options: unknown) => {
    expect(options).toEqual({ state: "hidden", timeout: 10_000 });
    calls.push("guide-hidden");
    if (hideError) throw hideError;
  });
  const press = vi.fn(async (key: string) => {
    expect(key).toBe("b");
    calls.push("pen-shortcut");
  });
  const welcome = {
    isVisible: vi.fn(async () => welcomeVisible),
    waitFor: waitForHidden,
    getByRole(role: string, { name }: { name: RegExp }) {
      expect(role).toBe("button");
      if (name.test("바로 그리기")) {
        expect(name.test("Draw now")).toBe(true);
        return { isVisible: async () => drawNowVisible, click: drawNowClick };
      }
      expect(name.test("시작 안내 닫기")).toBe(true);
      expect(name.test("Close start guide")).toBe(true);
      return { click: closeClick };
    },
  };
  const stage = {
    waitFor: vi.fn(async (options: unknown) => {
      expect(options).toEqual({ state: "visible", timeout: 15_000 });
      calls.push("stage-visible");
    }),
  };
  const toolbar = {
    waitFor: vi.fn(async (options: unknown) => {
      expect(options).toEqual({ state: "visible", timeout: 10_000 });
      calls.push("toolbar-visible");
    }),
    getByRole(role: string, { name }: { name: RegExp }) {
      expect(role).toBe("button");
      expect(name.test("현재 도구 · 브러시 선택 열기")).toBe(true);
      return {
        waitFor: vi.fn(async (options: unknown) => {
          expect(options).toEqual({ state: "visible" });
          calls.push("brush-control-visible");
        }),
      };
    },
  };
  const page = {
    locator(selector: string) {
      if (selector === ".konvajs-content") return { first: () => stage };
      expect(selector).toBe("[data-studio-cinematic-canvas-welcome]");
      return welcome;
    },
    keyboard: { press },
    getByRole(role: string, { name }: { name: RegExp }) {
      expect(role).toBe("toolbar");
      expect(name.test("그리기 옵션")).toBe(true);
      return toolbar;
    },
    waitForFunction: vi.fn(async (predicate: () => boolean) => {
      const getAttribute = vi.fn(() => "pen");
      const querySelector = vi.fn(() => ({ getAttribute }));
      vi.stubGlobal("document", { querySelector });
      expect(predicate()).toBe(true);
      expect(querySelector).toHaveBeenCalledExactlyOnceWith('[data-studio-draw-options="true"]');
      expect(getAttribute).toHaveBeenCalledExactlyOnceWith("data-studio-active-draw-mode");
      calls.push("pen-mode-ready");
    }),
  } as unknown as Page;
  vi.mocked(waitForStudioDrawingReady).mockImplementation(async (target, options) => {
    expect(target).toBe(page);
    expect(options).toEqual({ requireWelcome: true });
    calls.push("drawing-ready");
    return { welcomeDismissed: true };
  });
  return { page, calls, drawNowClick, closeClick, waitForHidden, press };
}

const readyCalls = ["pen-shortcut", "toolbar-visible", "pen-mode-ready", "brush-control-visible"];

describe("브러시 픽셀 검증의 실제 그리기 UI 준비", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("스테이지와 안내 준비 뒤 바로 그리기를 누르고 실제 숨김 후 펜을 준비한다", async () => {
    const f = fakePage();
    await prepareStudioBrushDrawingUi(f.page);
    expect(f.calls).toEqual(["stage-visible", "drawing-ready", "draw-now", "guide-hidden", ...readyCalls]);
    expect(f.drawNowClick).toHaveBeenCalledExactlyOnceWith();
    expect(f.closeClick).not.toHaveBeenCalled();
  });

  it("바로 그리기가 없는 접힌 안내는 정상 닫기 버튼을 사용한다", async () => {
    const f = fakePage({ drawNowVisible: false });
    await prepareStudioBrushDrawingUi(f.page);
    expect(f.calls).toEqual(["stage-visible", "drawing-ready", "close-guide", "guide-hidden", ...readyCalls]);
    expect(f.closeClick).toHaveBeenCalledExactlyOnceWith();
    expect(f.drawNowClick).not.toHaveBeenCalled();
  });

  it("이미 사라진 안내에는 클릭하지 않고 기존 펜 준비 검사를 유지한다", async () => {
    const f = fakePage({ welcomeVisible: false });
    await prepareStudioBrushDrawingUi(f.page);
    expect(f.calls).toEqual(["stage-visible", "drawing-ready", ...readyCalls]);
    expect(f.drawNowClick).not.toHaveBeenCalled();
    expect(f.closeClick).not.toHaveBeenCalled();
    expect(f.waitForHidden).not.toHaveBeenCalled();
  });

  it("안내 숨김 확인이 실패하면 오류를 전파하고 펜 준비로 넘어가지 않는다", async () => {
    const error = new Error("안내가 남아 있습니다");
    const f = fakePage({ hideError: error });
    await expect(prepareStudioBrushDrawingUi(f.page)).rejects.toBe(error);
    expect(f.press).not.toHaveBeenCalled();
  });

  it("공통 readiness 실패를 숨기지 않고 후속 클릭을 실행하지 않는다", async () => {
    const f = fakePage();
    const error = new Error("그리기 준비 실패");
    vi.mocked(waitForStudioDrawingReady).mockRejectedValueOnce(error);
    await expect(prepareStudioBrushDrawingUi(f.page)).rejects.toBe(error);
    expect(f.calls).toEqual(["stage-visible"]);
    expect(f.drawNowClick).not.toHaveBeenCalled();
    expect(f.closeClick).not.toHaveBeenCalled();
    expect(f.press).not.toHaveBeenCalled();
  });
});
