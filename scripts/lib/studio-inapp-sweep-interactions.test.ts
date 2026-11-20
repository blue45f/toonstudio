import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertStudioSweepTool, studioSweepHistoryAppends, studioSweepHistoryDepth,
  verifyStudioSweepUndoRedo, verifyStudioSweepZoom, waitForStudioSweepDrawingCommit, type StudioSweepTool,
} from "./studio-inapp-sweep-interactions";
import { showStudioMobileEditOptions, studioDocumentHistoryButtons } from "./studio-verifier-entry-points";

import type { Locator, Page } from "playwright";

vi.mock("./studio-verifier-entry-points", () => ({
  showStudioMobileEditOptions: vi.fn(), studioDocumentHistoryButtons: vi.fn(),
}));

function fixture({ active = "펜", copies = 1 }: { active?: StudioSweepTool; copies?: number } = {}) {
  const state = { active, depth: "3" as string | null, appends: "7" as string | null };
  const attribute = (key: string) => key === "data-studio-history-undo-depth" ? state.depth : state.appends;
  const tool = (name: StudioSweepTool) => ({
    count: async () => copies,
    getAttribute: async () => String(state.active === name),
    and: () => ({ waitFor: async () => {
      if (state.active !== name) throw new Error(`${name}: 활성 도구 상태를 확인하지 못했습니다.`);
    } }),
  });
  const dock = { locator: (selector: string) => {
    if (selector === 'button[data-studio-primary-action="draw"]') return tool("펜");
    if (selector === 'button[data-studio-mobile-tool="eraser"]') return tool("지우개");
    expect(selector).toBe('[data-studio-mobile-workspace-menu="true"]');
    return { getByRole: (_role: string, options: { name: StudioSweepTool; includeHidden: boolean }) => {
      expect(options.includeHidden).toBe(true); return tool(options.name);
    } };
  } };
  const page = {
    locator: (selector: string) => {
      if (selector === '[data-studio-mobile-editing-dock="true"]') return dock;
      if (selector === '[data-studio-editor="true"]') return { getAttribute: async (key: string) => attribute(key) };
      if (selector === '[aria-pressed="true"]') return {};
      throw new Error(`지원하지 않는 조작 경로: ${selector}`);
    },
    waitForFunction: async (predicate: (expected: number) => boolean, expected: number, options: { timeout: number }) => {
      expect(options.timeout).toBe(5_000);
      if (!predicate(expected)) throw new Error("편집 기록 상태가 바뀌지 않았습니다.");
    },
  } as unknown as Page;
  vi.stubGlobal("document", { querySelector: () => ({ getAttribute: attribute }) });
  return { page, state };
}

function historyFixture({ undoChanges = true, redoChanges = true, enabled = true } = {}) {
  const f = fixture(), events: string[] = [];
  vi.mocked(studioDocumentHistoryButtons).mockImplementation(async (_page, label) => ({
    filter() { return this; }, count: async () => 1, waitFor: async () => undefined,
    click: async (options: { timeout: number }) => {
      expect(options.timeout).toBe(5_000);
      if (!enabled) throw new Error("기록 버튼이 비활성 상태입니다.");
      events.push(label);
      if (label === "실행취소" && undoChanges) f.state.depth = String(Number(f.state.depth) - 1);
      if (label === "다시실행" && redoChanges) f.state.depth = String(Number(f.state.depth) + 1);
    },
  }) as unknown as Locator);
  return { ...f, events };
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("인앱 sweep의 도구와 실제 편집 상태 검증", () => {
  it.each(["선택", "펜", "픽셀", "지우개", "채우기", "도형"] as const)("%s의 실제 활성 상태를 확인한다", async (active) => {
    const f = fixture({ active });
    await expect(assertStudioSweepTool(f.page, active)).resolves.toBeUndefined();
  });
  it("선행 선택이 실패해 펜이 유지되면 픽셀·도형 그리기로 통과하지 않는다", async () => {
    const f = fixture();
    await expect(assertStudioSweepTool(f.page, "픽셀")).rejects.toThrow("활성 도구 상태");
    await expect(assertStudioSweepTool(f.page, "도형")).rejects.toThrow("활성 도구 상태");
  });
  it.each([0, 2])("도구 상태가 %s개이면 임의의 후보로 통과하지 않는다", async (copies) => {
    const f = fixture({ copies });
    await expect(assertStudioSweepTool(f.page, "펜")).rejects.toThrow("하나여야 합니다");
  });
  it("포인터 완료만으로 통과하지 않고 기록 보존 한도와 무관한 실제 추가를 요구한다", async () => {
    const f = fixture(), before = await studioSweepHistoryAppends(f.page);
    await expect(waitForStudioSweepDrawingCommit(f.page, before)).rejects.toThrow("기록 상태");
    f.state.appends = "8";
    await expect(waitForStudioSweepDrawingCommit(f.page, before)).resolves.toBeUndefined();
    expect(await studioSweepHistoryDepth(f.page)).toBe(3);
  });
  it.each([null, "", "NaN", "-1", "1.5", "9007199254740992"])("잘못된 기록 값 %s를 정상 상태로 바꾸지 않는다", async (value) => {
    const f = fixture(); f.state.depth = value; f.state.appends = value;
    await expect(studioSweepHistoryDepth(f.page)).rejects.toThrow("기록 깊이");
    await expect(studioSweepHistoryAppends(f.page)).rejects.toThrow("기록 추가 횟수");
    await expect(waitForStudioSweepDrawingCommit(f.page, 0)).rejects.toThrow("기록 상태");
  });
  it("공용 편집 행과 문서 기록 버튼으로 undo 감소·redo 복귀를 증명한다", async () => {
    const f = historyFixture();
    await expect(verifyStudioSweepUndoRedo(f.page)).resolves.toBe("ok");
    expect(showStudioMobileEditOptions).toHaveBeenCalledExactlyOnceWith(f.page);
    expect(studioDocumentHistoryButtons).toHaveBeenNthCalledWith(1, f.page, "실행취소");
    expect(studioDocumentHistoryButtons).toHaveBeenNthCalledWith(2, f.page, "다시실행");
    expect(f.events).toEqual(["실행취소", "다시실행"]);
    expect(f.state.depth).toBe("3");
  });
  it("실제 편집 기록이 없으면 undo/redo 클릭부터 시작하지 않는다", async () => {
    const f = historyFixture(); f.state.depth = "0";
    await expect(verifyStudioSweepUndoRedo(f.page)).rejects.toThrow("실제 편집 기록");
    expect(studioDocumentHistoryButtons).not.toHaveBeenCalled();
  });
  it.each(["undo", "redo"] as const)("%s 클릭이 기록을 바꾸지 않으면 실패한다", async (action) => {
    const f = historyFixture({ undoChanges: action !== "undo", redoChanges: action !== "redo" });
    await expect(verifyStudioSweepUndoRedo(f.page)).rejects.toThrow("기록 상태");
    expect(f.events).toEqual(action === "undo" ? ["실행취소"] : ["실행취소", "다시실행"]);
  });
  it("비활성 기록 버튼을 강제 클릭하거나 성공으로 처리하지 않는다", async () => {
    const f = historyFixture({ enabled: false });
    await expect(verifyStudioSweepUndoRedo(f.page)).rejects.toThrow("비활성 상태");
    expect(f.events).toEqual([]);
  });
});

describe("인앱 sweep의 확대·축소·맞춤 결과", () => {
  it.each([
    [null, null], ["zoom-in", "증가하지"], ["zoom-out", "감소하지"], ["fit", "복원하지"],
  ] as const)("보기 명령의 무동작(%s)을 실제 확대율로 판별한다", async (noop, failure) => {
    let zoom = 150;
    const value = { count: async () => 1, textContent: async () => `${zoom}%` };
    const page = { locator: () => ({ getByRole: (_role: string, options: { name: string; includeHidden: boolean }) => {
      expect(options).toMatchObject({ name: "화면 폭에 맞춤", includeHidden: true });
      return value;
    } }) } as unknown as Page;
    const command = vi.fn(async (id: "zoom-in" | "zoom-out" | "fit") => {
      if (id === noop) return;
      if (id === "fit") zoom = 100;
      else zoom += id === "zoom-in" ? 25 : -25;
    });
    const result = verifyStudioSweepZoom(page, command);
    if (failure) await expect(result).rejects.toThrow(failure);
    else {
      await expect(result).resolves.toBe("ok");
      expect(command.mock.calls.map(([id]) => id)).toEqual(["fit", "zoom-in", "zoom-out", "zoom-in", "fit"]);
      expect(zoom).toBe(100);
    }
  });
});
