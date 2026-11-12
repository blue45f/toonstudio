import { errors, type Page } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";

import { activateDesktopPen } from "./studio-desktop-brush-activation";
import { prepareFilterMenuWorkspace } from "./studio-filter-menu-workspace";

vi.mock("./studio-filter-menu-workspace", () => ({ prepareFilterMenuWorkspace: vi.fn() }));

function fixture({ visibleRail = true, propertiesSelected = false, lateClarity = false } = {}) {
  const calls: string[] = [];
  const timeouts: number[] = [];
  let legacyVisible = !lateClarity;
  let attempts = 0;
  const timeout = ({ timeout }: { timeout: number }) => {
    timeouts.push(timeout);
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThanOrEqual(1_000);
  };
  const properties = {
    getAttribute: async (name: string, options: { timeout: number }) => {
      expect(name).toBe("aria-selected"); timeout(options); return propertiesSelected ? "true" : "false";
    },
    click: vi.fn(async (options: { timeout: number }) => { timeout(options); calls.push("properties"); }),
  };
  const pill = { waitFor: async (options: { state: string; timeout: number }) => {
    expect(options.state).toBe("visible"); timeout(options); calls.push("pill");
  } };
  const toolbar = {
    waitFor: async (options: { state: string; timeout: number }) => {
      expect(options.state).toBe("visible"); timeout(options); calls.push("toolbar");
      if (!legacyVisible) throw new errors.TimeoutError("지연된 간결한 화면이 기존 옵션을 숨겼습니다.");
    },
    locator: (selector: string) => { expect(selector).toBe('[data-studio-brush-active-pill="true"]'); return pill; },
  };
  const pen = {
    first() { return this; }, count: async () => visibleRail ? 1 : 0,
    click: vi.fn(async (options: { timeout: number }) => { timeout(options); calls.push("visible-pen"); }),
  };
  const inspector = {
    waitFor: async (options: { state: string; timeout: number }) => {
      expect(options.state).toBe("visible"); timeout(options); calls.push("inspector");
    },
    locator: (selector: string) => { expect(selector).toBe('[data-studio-inspector-primary-tab="properties"]'); return properties; },
  };
  const press = vi.fn(async (key: string) => { expect(key).toBe("b"); calls.push("keyboard-pen"); });
  const page = {
    locator: (selector: string) => {
      if (selector === 'button[data-studio-rail-tool-id="pen"]:visible') return pen;
      if (selector === '[data-studio-draw-options="true"]') return toolbar;
      throw new Error(`예상하지 않은 PC 도구 선택자: ${selector}`);
    },
    keyboard: { press },
    getByTestId: (id: string) => { expect(id).toBe("studio-inspector-navigator"); return inspector; },
    waitForFunction: async (check: () => boolean, argument: undefined, options: { timeout: number }) => {
      expect(check.toString()).toContain('"data-studio-active-draw-mode"');
      expect(check.toString()).toContain('"pen"'); expect(argument).toBeUndefined();
      timeout(options); calls.push("pen-mode");
    },
    waitForTimeout: async (ms: number) => { expect(ms).toBeLessThanOrEqual(100); calls.push("retry"); },
  } as unknown as Page;
  vi.mocked(prepareFilterMenuWorkspace).mockImplementation(async (actualPage, budget) => {
    expect(actualPage).toBe(page); expect(budget).toBeGreaterThan(0); expect(budget).toBeLessThanOrEqual(10_000);
    calls.push("actual-menu"); attempts += 1;
    if (attempts > 1) legacyVisible = true;
    return attempts > 1;
  });
  return { page, calls, timeouts, pen, properties, press };
}

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("PC 정밀 브러시 검증의 실제 도구 진입", () => {
  it("실제 메뉴 배치 후 보이는 펜과 기존 모드·설정·속성 준비를 확인한다", async () => {
    const f = fixture(); await activateDesktopPen(f.page);
    expect(f.calls).toEqual(["actual-menu", "visible-pen", "toolbar", "pen-mode", "pill", "inspector", "properties"]);
    expect(f.press).not.toHaveBeenCalled();
    expect(f.pen.click.mock.calls[0]?.[0]).not.toHaveProperty("force");
  });
  it("보이는 rail이 없으면 기존 키보드 동작을 사용하고 이미 선택한 속성은 보존한다", async () => {
    const f = fixture({ visibleRail: false, propertiesSelected: true }); await activateDesktopPen(f.page);
    expect(f.press).toHaveBeenCalledWith("b"); expect(f.pen.click).not.toHaveBeenCalled();
    expect(f.properties.click).not.toHaveBeenCalled(); expect(f.calls).toContain("pen-mode");
  });
  it("늦게 나타난 간결한 화면은 실제 메뉴로 다시 진입한 뒤 같은 검사를 마친다", async () => {
    const f = fixture({ lateClarity: true }); await activateDesktopPen(f.page);
    expect(f.calls.filter(call => call === "actual-menu")).toHaveLength(2);
    expect(f.calls).toContain("retry"); expect(f.calls.at(-1)).toBe("properties");
  });
  it("UI 준비 실패가 반복돼도 최초 60초 예산을 재시작하지 않는다", async () => {
    const f = fixture(); let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.mocked(prepareFilterMenuWorkspace).mockImplementation(async () => {
      now += 20_000; throw new errors.TimeoutError("가려진 실제 메뉴");
    });
    await expect(activateDesktopPen(f.page)).rejects.toThrow("60000ms 초과");
    expect(now).toBe(60_000); expect(prepareFilterMenuWorkspace).toHaveBeenCalledTimes(3);
  });
  it("제품 불변조건 실패는 Timeout으로 취급해 재시도하지 않는다", async () => {
    const f = fixture(); const failure = new Error("실제 메뉴 진입점이 두 개입니다.");
    vi.mocked(prepareFilterMenuWorkspace).mockRejectedValue(failure);
    await expect(activateDesktopPen(f.page)).rejects.toBe(failure);
    expect(prepareFilterMenuWorkspace).toHaveBeenCalledTimes(1); expect(f.pen.click).not.toHaveBeenCalled();
  });
});
