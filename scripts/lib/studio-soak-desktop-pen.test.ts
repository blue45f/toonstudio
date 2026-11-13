import { errors, type Page } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";

import { activateDesktopPen } from "./studio-desktop-brush-activation";
import { ensureStudioSoakDesktopPen } from "./studio-soak-desktop-pen";

vi.mock("./studio-desktop-brush-activation", () => ({ activateDesktopPen: vi.fn() }));

function fixture({ clarity = false, rail = true, active = true, clickMs = 0, toolbarMs = 0 } = {}) {
  let now = 0;
  const timeouts: Array<{ operation: string; timeout: number }> = [];
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const clarityLocator = { first() { return this; }, isVisible: async () => clarity };
  const pen = {
    first() { return this; }, isVisible: async () => rail,
    getAttribute: async (_name: string, options: { timeout: number }) => {
      timeouts.push({ operation: "active", timeout: options.timeout }); return active ? "true" : "false";
    },
    click: vi.fn(async (options: { timeout: number }) => {
      timeouts.push({ operation: "click", timeout: options.timeout }); now += clickMs; active = true;
    }),
  };
  const toolbar = { waitFor: vi.fn(async (options: { timeout: number }) => {
    timeouts.push({ operation: "toolbar", timeout: options.timeout }); now += toolbarMs;
  }) };
  const keyboard = { press: vi.fn(async () => undefined) };
  const page = {
    locator: (selector: string) => {
      if (selector.includes("data-studio-drawing-clarity")) return clarityLocator;
      if (selector.includes("data-studio-rail-tool-id")) return pen;
      if (selector === '[data-studio-draw-options="true"]') return toolbar;
      throw new Error(`예상하지 않은 선택자: ${selector}`);
    },
    keyboard, evaluate: vi.fn(async () => undefined),
    waitForTimeout: async (ms: number) => { now += ms; },
  } as unknown as Page;
  return { page, pen, toolbar, keyboard, timeouts, advance: (ms: number) => { now += ms; } };
}

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("PC 소크 준비의 실제 진입과 시간 예산", () => {
  it("간결한 화면만 공통 메뉴 진입으로 준비하고 기본 60초를 사용하지 않는다", async () => {
    const f = fixture({ clarity: true });
    vi.mocked(activateDesktopPen).mockImplementation(async (_page, timeoutMs) => {
      expect(timeoutMs).toBe(1_000); f.advance(300);
    });
    await expect(ensureStudioSoakDesktopPen(f.page, 1_000)).resolves.toBe(true);
    expect(activateDesktopPen).toHaveBeenCalledExactlyOnceWith(f.page, 1_000);
    expect(f.pen.click).not.toHaveBeenCalled();
  });

  it("공통 진입이 남은 1초를 넘겨 끝나면 준비 성공으로 기록하지 않는다", async () => {
    const f = fixture({ clarity: true });
    vi.mocked(activateDesktopPen).mockImplementation(async () => { f.advance(1_001); });
    await expect(ensureStudioSoakDesktopPen(f.page, 1_000)).resolves.toBe(false);
  });

  it("반복 획의 기존 화면에서는 공통 속성 탭 진입을 반복하지 않는다", async () => {
    const f = fixture();
    await expect(ensureStudioSoakDesktopPen(f.page, 1_000)).resolves.toBe(true);
    expect(activateDesktopPen).not.toHaveBeenCalled();
    expect(f.pen.click).not.toHaveBeenCalled();
    expect(f.keyboard.press).not.toHaveBeenCalled();
    expect(f.timeouts).toContainEqual({ operation: "toolbar", timeout: 920 });
  });

  it("실제 펜 클릭 뒤 옵션 대기에는 최초 예산의 남은 시간만 사용한다", async () => {
    const f = fixture({ active: false, clickMs: 700 });
    await expect(ensureStudioSoakDesktopPen(f.page, 1_000)).resolves.toBe(true);
    expect(f.pen.click).toHaveBeenCalledExactlyOnceWith({ timeout: 1_000 });
    expect(f.timeouts).toContainEqual({ operation: "toolbar", timeout: 220 });
  });

  it("기존 옵션바가 마지막 남은 예산을 넘겨 나타나도 실패한다", async () => {
    const f = fixture({ active: false, clickMs: 700, toolbarMs: 221 });
    await expect(ensureStudioSoakDesktopPen(f.page, 1_000)).resolves.toBe(false);
  });

  it("실제 펜 버튼이 없으면 초점을 해제하고 기존 단축키로 준비한다", async () => {
    const f = fixture({ rail: false });
    await expect(ensureStudioSoakDesktopPen(f.page, 1_000)).resolves.toBe(true);
    expect(f.page.evaluate).toHaveBeenCalledOnce();
    expect(f.keyboard.press).toHaveBeenCalledExactlyOnceWith("b");
  });

  it("시간 초과는 준비 실패로 반환하고 제품 불변조건 오류는 보존한다", async () => {
    const f = fixture({ clarity: true });
    vi.mocked(activateDesktopPen).mockRejectedValueOnce(new errors.TimeoutError("준비 시간 초과"));
    await expect(ensureStudioSoakDesktopPen(f.page, 1_000)).resolves.toBe(false);
    const failure = new Error("실제 더보기 진입점이 두 개입니다.");
    vi.mocked(activateDesktopPen).mockRejectedValueOnce(failure);
    await expect(ensureStudioSoakDesktopPen(f.page, 1_000)).rejects.toBe(failure);
  });
});
