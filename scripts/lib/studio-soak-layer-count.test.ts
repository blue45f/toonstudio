import { errors } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";

import { activateDesktopPen } from "./studio-desktop-brush-activation";
import { readStudioSoakLayerCount, waitForStudioSoakLayerCount, withStudioSoakLayerNavigator } from "./studio-soak-layer-count";

import type { Page } from "playwright";

vi.mock("./studio-desktop-brush-activation", () => ({ activateDesktopPen: vi.fn() }));

function fixture({ mobile = true, mounted = false, sheet = false, count = 0, legacy = false, panelOnly = false, closedSheetPresent = false } = {}) {
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const state = { mounted, sheet, count, menu: false, layers: !panelOnly, opens: 0, closes: 0, reads: 0, closeFails: false, attachDelay: 0 };
  const timeouts: Array<{ operation: string; timeout: number }> = [];
  const record = (operation: string, options: { timeout: number }) => {
    expect(options.timeout).toBeGreaterThan(0); timeouts.push({ operation, timeout: options.timeout });
  };
  const counter = {
    first() { return this; }, count: async () => state.mounted ? 1 : 0,
    getAttribute: async (name: string, options: { timeout: number }) => {
      expect(name).toBe("data-studio-layer-available-count"); record("count", options);
      if (mobile) expect(state.sheet).toBe(true);
      expect(state.mounted).toBe(true); state.reads++; return String(state.count);
    },
    waitFor: async (options: { state: string; timeout: number }) => {
      expect(options.state).toBe("attached"); record("attached", options);
      now += state.attachDelay;
      if (state.attachDelay >= options.timeout) throw new errors.TimeoutError("count 마운트 지연");
      expect(state.mounted).toBe(true);
    },
  };
  const open = async (options: { timeout: number }) => {
    record("open", options); state.sheet = true; state.mounted = true; state.opens++;
  };
  const layersButton = { isVisible: async () => mobile && !panelOnly && (!legacy || state.menu), click: open };
  const panelButton = { isVisible: async () => mobile && panelOnly && (!legacy || state.menu), click: open };
  const toggle = {
    isVisible: async () => legacy,
    getAttribute: async (_name: string, options: { timeout: number }) => { record("expanded", options); return state.menu ? "true" : "false"; },
    click: async (options: { timeout: number }) => { record("toggle", options); state.menu = true; },
  };
  const dock = {
    isVisible: async () => mobile,
    getByRole: (_role: string, options: { name: string }) => options.name === "레이어 열기" ? layersButton : panelButton,
    locator: () => toggle,
  };
  const props = {
    isVisible: async () => state.sheet,
    waitFor: async (options: { state: string; timeout: number }) => {
      record(options.state === "hidden" ? "closed" : "sheet", options);
      expect(state.sheet).toBe(options.state !== "hidden");
    },
    locator: (selector: string) => {
      expect(selector).toBe('button[data-inspector-control-id="panel.chrome.close"]');
      return { click: async (options: { timeout: number }) => {
        record("close", options); if (state.closeFails) throw new Error("설정 닫기 실패");
        state.sheet = false; state.mounted = false; state.closes++;
      } };
    },
  };
  const layers = {
    first() { return this; },
    waitFor: async (options: { timeout: number }) => { record("layers", options); expect(!mobile || state.sheet).toBe(true); },
    getAttribute: async (_name: string, options: { timeout: number }) => { record("selected", options); return state.layers ? "true" : "false"; },
    click: async (options: { timeout: number }) => { record("select-layers", options); state.layers = true; },
  };
  const page = {
    locator: (selector: string) => {
      if (selector === "[data-studio-layer-available-count]") return counter;
      if (selector.includes("data-studio-mobile-editing-dock")) return dock;
      if (selector.includes('data-studio-sheet-id="props"')) {
        // 화면 밖의 닫힌 section은 CSS상 visible일 수 있다. 실제 열린 상태의 선택자만 구분한다.
        return closedSheetPresent && !selector.includes('[data-studio-mobile-sheet="true"]')
          ? { ...props, isVisible: async () => true } : props;
      }
      if (selector.includes("data-studio-inspector-primary-tab")) return layers;
      throw new Error(`예상하지 않은 선택자: ${selector}`);
    },
    waitForTimeout: async (ms: number) => { now += ms; },
  } as unknown as Page;
  vi.mocked(activateDesktopPen).mockImplementation(async (_page, timeout) => {
    expect(timeout).toBeGreaterThan(0); state.mounted = true;
  });
  return { page, state, counter, timeouts, advance: (ms: number) => { now += ms; }, now: () => now };
}

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("소크 레이어 관측은 실제 UI를 잠깐 열고 닫는다", () => {
  it("빈 baseline 0도 읽고 닫은 뒤 count가 unmount돼도 되열지 않는다", async () => {
    const f = fixture();
    await expect(readStudioSoakLayerCount(f.page)).resolves.toBe(0);
    expect(f.state).toMatchObject({ sheet: false, mounted: false, opens: 1, closes: 1 });
    expect(f.timeouts.filter((x) => x.operation === "count")).toHaveLength(1);
  });

  it("다음 관측에서도 실제 시트를 다시 읽으며 과거 count를 재사용하지 않는다", async () => {
    const f = fixture();
    expect(await readStudioSoakLayerCount(f.page)).toBe(0);
    f.state.count = 10;
    expect(await readStudioSoakLayerCount(f.page)).toBe(10);
    expect(f.state).toMatchObject({ opens: 2, closes: 2, sheet: false });
  });

  it("count가 이미 있어도 열려 있던 모바일 시트를 닫은 뒤 반환한다", async () => {
    const f = fixture({ mounted: true, sheet: true, count: 3 });
    expect(await readStudioSoakLayerCount(f.page)).toBe(3);
    expect(f.state).toMatchObject({ opens: 0, closes: 1, sheet: false });
  });

  it("닫힌 section과 count가 DOM에 남아도 실제 시트를 열어 읽고 닫는다", async () => {
    const f = fixture({ mounted: true, closedSheetPresent: true, count: 4 });
    expect(await readStudioSoakLayerCount(f.page)).toBe(4);
    expect(f.state).toMatchObject({ opens: 1, closes: 1, sheet: false, reads: 1 });
  });

  it("legacy 작업 패널 진입은 실제 레이어 탭을 선택한다", async () => {
    const f = fixture({ legacy: true, panelOnly: true });
    expect(await readStudioSoakLayerCount(f.page)).toBe(0);
    expect(f.timeouts.map((x) => x.operation)).toContain("toggle");
    expect(f.timeouts.map((x) => x.operation)).toContain("select-layers");
    expect(f.state.sheet).toBe(false);
  });

  it("PC에서 이미 관측되는 count는 메뉴나 모바일 시트를 바꾸지 않는다", async () => {
    const f = fixture({ mobile: false, mounted: true, count: 2 });
    expect(await readStudioSoakLayerCount(f.page)).toBe(2);
    expect(activateDesktopPen).not.toHaveBeenCalled();
    expect(f.state).toMatchObject({ opens: 0, closes: 0 });
  });

  it("predicate 대기 동안 한 번만 열고 현재 count를 계속 읽는다", async () => {
    const f = fixture({ count: 1 });
    const original = f.counter.getAttribute;
    vi.spyOn(f.counter, "getAttribute").mockImplementation(async (...args) => {
      if (f.state.reads === 2) f.state.count = 0;
      return original(...args);
    });
    expect(await waitForStudioSoakLayerCount(f.page, (count) => count === 0)).toBe(0);
    expect(f.state).toMatchObject({ opens: 1, closes: 1, sheet: false, reads: 3 });
  });

  it("Undo와 Redo는 닫힌 시트에서 하고 baseline은 매번 실제 UI에서 읽는다", async () => {
    const f = fixture({ count: 10 });
    expect(await readStudioSoakLayerCount(f.page)).toBe(10);
    expect(f.state.sheet).toBe(false); f.state.count = 0;
    expect(await waitForStudioSoakLayerCount(f.page, (count) => count === 0)).toBe(0);
    expect(f.state.sheet).toBe(false); f.state.count = 3;
    expect(await readStudioSoakLayerCount(f.page)).toBe(3);
    expect(f.state.sheet).toBe(false); f.state.count = 0;
    expect(await waitForStudioSoakLayerCount(f.page, (count) => count === 0)).toBe(0);
    expect(f.state).toMatchObject({ sheet: false, opens: 4, closes: 4 });
  });

  it("관측 callback이 실패해도 finally에서 실제 닫기를 수행한다", async () => {
    const f = fixture(), failure = new Error("관측 실패");
    await expect(withStudioSoakLayerNavigator(f.page, 1_000, async () => { throw failure; })).rejects.toBe(failure);
    expect(f.state).toMatchObject({ sheet: false, closes: 1 });
  });

  it("기존 count가 있어도 닫기가 실패하면 숫자를 성공으로 반환하지 않는다", async () => {
    const f = fixture({ mounted: true, sheet: true }); f.state.closeFails = true;
    await expect(readStudioSoakLayerCount(f.page)).rejects.toThrow("설정 닫기 실패");
  });

  it("관측과 닫기가 모두 실패하면 두 원래 오류를 보존한다", async () => {
    const f = fixture(), failure = new Error("관측 실패"); f.state.closeFails = true;
    const result = withStudioSoakLayerNavigator(f.page, 1_000, async () => { throw failure; });
    await expect(result).rejects.toMatchObject({ errors: [failure, expect.objectContaining({ message: "설정 닫기 실패" })] });
  });

  it("count가 예산 뒤에 반환되면 성공으로 인정하지 않고 시트를 닫는다", async () => {
    const f = fixture(), original = f.counter.getAttribute;
    vi.spyOn(f.counter, "getAttribute").mockImplementation(async (...args) => {
      const count = await original(...args); f.advance(1_001); return count;
    });
    await expect(readStudioSoakLayerCount(f.page, 1_000)).rejects.toBeInstanceOf(errors.TimeoutError);
    expect(f.state).toMatchObject({ sheet: false, closes: 1 });
  });

  it("기본 30초 기다림 없이 명시 판정 예산을 지키고 timeout 뒤에도 닫는다", async () => {
    const f = fixture(); f.state.attachDelay = 1_001;
    await expect(readStudioSoakLayerCount(f.page, 1_000)).rejects.toBeInstanceOf(errors.TimeoutError);
    expect(f.state).toMatchObject({ sheet: false, closes: 1, reads: 0 });
    expect(f.timeouts.filter((x) => !["close", "closed"].includes(x.operation)).every((x) => x.timeout <= 1_000)).toBe(true);
    expect(f.timeouts).toContainEqual({ operation: "close", timeout: 3_000 });
    expect(f.now()).toBe(1_001);
  });
});
