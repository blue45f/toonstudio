import { beforeEach, describe, expect, it, vi } from "vitest";

import { openMobileBrushSettings } from "./studio-mobile-brush-settings";

import type { Locator, Page } from "playwright";

const readiness = vi.hoisted(() => ({ click: vi.fn() }));
vi.mock("./studio-drawing-readiness", () => ({ clickStudioControlAfterReadiness: readiness.click }));
beforeEach(() => { readiness.click.mockReset(); });

function fixture(mode: "pen" | "eraser" | "shape" | "pixel", clarity = true) {
  const state = { mode, clarity, menu: false, sheet: false, opens: 0, lateClarity: false };
  const waits: string[] = [];
  const primaryClick = vi.fn(async () => {
    expect(state.clarity).toBe(true);
    if (state.mode !== "pen" && state.mode !== "eraser") throw new Error("현재 Clarity에는 이 도구의 직접 설정 진입이 없습니다.");
    state.sheet = true; state.opens++;
  });
  const legacyClick = vi.fn(async () => { expect(state.clarity).toBe(false); expect(state.menu).toBe(true); state.menu = false; state.sheet = true; state.opens++; });
  const toggleClick = vi.fn(async () => { state.menu = true; if (state.lateClarity) { state.clarity = true; state.menu = false; } });
  const control = {
    click: async () => state.clarity ? primaryClick() : legacyClick(),
    filter: (options: unknown) => { expect(options).toEqual({ visible: true }); return control; },
  };
  const page = { locator: (selector: string) => {
    if (selector.includes('[data-studio-sheet-id="draw"]')) {
      expect(selector).toContain('[data-studio-mobile-sheet="draw"][role="dialog"]:not([aria-hidden="true"]):not([inert])');
      return { isVisible: async () => state.sheet, waitFor: async () => { expect(state.sheet).toBe(true); waits.push("sheet"); } };
    }
    expect(selector).toContain('[data-studio-drawing-clarity-mobile="true"]');
    return { isVisible: async () => state.clarity };
  } } as unknown as Page;
  const dock = {
    getAttribute: async (name: string) => { expect(name).toBe("data-studio-mobile-primary-layout"); return state.clarity ? "simple" : null; },
    locator: (selector: string) => {
      if (selector === '[data-studio-mobile-workspace-toggle="true"]') return {
        getAttribute: async () => state.menu ? "true" : "false", click: toggleClick,
      };
      if (selector === '[data-studio-mobile-workspace-menu="true"]') return {
        waitFor: async () => { expect(state.menu).toBe(false); waits.push("menu"); },
      };
      expect(selector).toContain('[data-studio-mobile-primary-layout="simple"]');
      expect(selector).toContain('[aria-pressed="true"]');
      expect(selector).toContain(':not([data-studio-mobile-tool])');
      return control;
    },
  } as unknown as Locator;
  readiness.click.mockImplementation(async (_page, target, timeout, prepare) => {
    expect(_page).toBe(page); expect(timeout).toBeGreaterThan(0); expect(timeout).toBeLessThanOrEqual(60_000);
    await prepare(Math.min(1_000, timeout)); await target.click({ timeout: Math.min(1_000, timeout) });
  });
  return { page, dock, state, waits, primaryClick, legacyClick, toggleClick };
}

describe("mobile brush settings through current controls", () => {
  it.each(["pen", "eraser"] as const)("opens the Clarity %s settings without changing its active mode", async (mode) => {
    const f = fixture(mode);
    await openMobileBrushSettings(f.page, f.dock);
    expect(f.state.mode).toBe(mode); expect(f.state.sheet).toBe(true); expect(f.state.opens).toBe(1);
    expect(f.primaryClick).toHaveBeenCalledOnce(); expect(f.toggleClick).not.toHaveBeenCalled(); expect(f.legacyClick).not.toHaveBeenCalled();
    expect(f.waits).toEqual(["sheet", "menu"]);
  });
  it.each(["pen", "eraser", "shape", "pixel"] as const)("retains the existing %s settings route outside Clarity", async (mode) => {
    const f = fixture(mode, false);
    await openMobileBrushSettings(f.page, f.dock);
    expect(f.state.mode).toBe(mode); expect(f.state.sheet).toBe(true);
    expect(f.toggleClick).toHaveBeenCalledOnce(); expect(f.legacyClick).toHaveBeenCalledOnce(); expect(f.primaryClick).not.toHaveBeenCalled();
  });
  it("does not bind to a stale legacy target if Clarity appears during preparation", async () => {
    const f = fixture("eraser", false); f.state.lateClarity = true;
    await openMobileBrushSettings(f.page, f.dock);
    expect(f.state.mode).toBe("eraser"); expect(f.state.sheet).toBe(true);
    expect(f.primaryClick).toHaveBeenCalledOnce(); expect(f.legacyClick).not.toHaveBeenCalled();
  });
  it("keeps an already open settings sheet open without toggling the active tool", async () => {
    const f = fixture("eraser"); f.state.sheet = true;
    await openMobileBrushSettings(f.page, f.dock);
    expect(f.state.sheet).toBe(true); expect(readiness.click).not.toHaveBeenCalled(); expect(f.state.opens).toBe(0);
  });
  it.each(["shape", "pixel"] as const)("does not silently replace an unsupported Clarity %s tool with pen", async (mode) => {
    const f = fixture(mode);
    await expect(openMobileBrushSettings(f.page, f.dock)).rejects.toThrow("직접 설정 진입이 없습니다");
    expect(f.state.mode).toBe(mode); expect(f.state.sheet).toBe(false); expect(f.legacyClick).not.toHaveBeenCalled();
  });
});
