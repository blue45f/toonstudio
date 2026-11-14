import { afterEach, describe, expect, it, vi } from "vitest";

import { prepareFilterMenuWorkspace } from "./studio-filter-menu-workspace";

import type { Page } from "playwright";

function fixture({ simple = true, moreCount = 1, workspaceCount = 1, dialogOpen = false, category = false, backCount = 1, backError, changedUrl, changedDensity, menuError, closeError, advanceMs = 0 }: {
  simple?: boolean; moreCount?: number; workspaceCount?: number; changedUrl?: string; changedDensity?: string;
  dialogOpen?: boolean; category?: boolean; backCount?: number; backError?: Error;
  menuError?: Error; closeError?: Error; advanceMs?: number;
} = {}) {
  const state = { simple, dialog: dialogOpen, category, workspace: false, menu: false,
    url: "http://127.0.0.1:5194/studio/draft/work-1?tag=a&tag=b&workspace=draw#canvas", density: "comfortable" };
  const calls: string[] = [], timeouts: number[] = [];
  let now = 0;
  if (advanceMs) vi.spyOn(Date, "now").mockImplementation(() => now);
  const step = ({ timeout }: { timeout: number }) => {
    expect(timeout).toBeGreaterThan(0); expect(timeout).toBeLessThanOrEqual(10_000);
    timeouts.push(timeout); now += advanceMs;
  };
  const clarity = { first() { return this; }, isVisible: async () => state.simple };
  const more = { count: async () => moreCount, click: vi.fn(async (options: { timeout: number }) => {
    if (state.dialog) throw new Error("열린 native 창 뒤의 더보기를 누를 수 없습니다.");
    step(options); calls.push("more"); state.dialog = true;
  }) };
  const workspace = { count: async () => state.category ? 0 : workspaceCount, click: vi.fn(async (options: { timeout: number }) => {
    step(options); expect(state.dialog).toBe(true); expect(state.category).toBe(false);
    state.category = true; state.workspace = true; calls.push("workspace");
  }) };
  const back = { count: async () => state.category ? backCount : 0, click: vi.fn(async (options: { timeout: number }) => {
    step(options); if (backError) throw backError;
    state.category = false; calls.push("back");
  }) };
  const project = { click: vi.fn(async (options: { timeout: number }) => {
    step(options);
    if (!state.workspace) throw new Error("화면과 도움말을 먼저 선택해야 합니다.");
    calls.push("project"); state.dialog = false; state.menu = true; state.simple = false;
    if (changedUrl) state.url = changedUrl;
    if (changedDensity) state.density = changedDensity;
  }) };
  const tools = {
    isVisible: async () => state.dialog,
    waitFor: vi.fn(async (options: { state: string; timeout: number }) => {
      step(options);
      if (options.state === "hidden" && closeError) throw closeError;
      expect(state.dialog).toBe(options.state === "visible"); calls.push("dialog-" + options.state);
    }),
    locator: (selector: string) => {
      expect(selector).toBe('[data-drawing-task-category="workspace"]');
      return workspace;
    },
    getByRole: (role: string, query: { name: string; exact: boolean }) => {
      expect(role).toBe("button"); expect(query.exact).toBe(true);
      if (query.name === "원고 도구 분류로 돌아가기") return back;
      expect(query.name).toBe("프로젝트·창 도구 보기");
      return project;
    },
  };
  const shell = { getAttribute: async (name: string, options: { timeout: number }) => {
    step(options); expect(name).toBe("data-studio-ui-density"); return state.density;
  } };
  const menu = { waitFor: vi.fn(async (options: { state: string; timeout: number }) => {
    step(options); expect(options.state).toBe("visible");
    if (menuError) throw menuError;
    expect(state.menu).toBe(true); calls.push("menu-visible");
  }) };
  const page = {
    url: () => state.url,
    locator: (selector: string) => {
      if (selector === '[data-studio-editor="true"][data-studio-drawing-clarity="true"]') return clarity;
      if (selector === "#studio-app-shell") return shell;
      if (selector === 'summary[data-studio-clarity-more-trigger="true"]:visible') return more;
      if (selector === '[data-studio-main-menu="true"]') return menu;
      throw new Error("현재 UI에 없는 메뉴 선택자입니다: " + selector);
    },
    getByRole: (role: string, query: { name: string; exact: boolean }) => {
      expect(role).toBe("dialog"); expect(query).toEqual({ name: "원고 도구", exact: true }); return tools;
    },
  } as unknown as Page;
  return { page, state, calls, timeouts, more, workspace, project, back };
}

afterEach(() => { vi.restoreAllMocks(); });

describe("실제 원고 도구 목적을 통한 필터 작업 배치 준비", () => {
  it("더보기와 화면과 도움말을 거쳐 같은 원고·화면 밀도로 실제 메뉴를 연다", async () => {
    const f = fixture(); const originalUrl = f.state.url, originalDensity = f.state.density;
    await expect(prepareFilterMenuWorkspace(f.page)).resolves.toBe(true);
    expect(f.calls).toEqual(["more", "dialog-visible", "workspace", "project", "dialog-hidden", "menu-visible"]);
    expect(f.state.url).toBe(originalUrl); expect(f.state.density).toBe(originalDensity);
    expect(f.more.click.mock.calls[0]?.[0]).not.toHaveProperty("force");
  });
  it("이미 기존 배치이면 메뉴를 건드리지 않는다", async () => {
    const f = fixture({ simple: false });
    await expect(prepareFilterMenuWorkspace(f.page)).resolves.toBe(false);
    expect(f.calls).toEqual([]); expect(f.timeouts).toEqual([]);
  });
  it("이미 열린 분류 정문에서는 배경 더보기를 다시 누르지 않는다", async () => {
    const f = fixture({ dialogOpen: true });
    await expect(prepareFilterMenuWorkspace(f.page)).resolves.toBe(true);
    expect(f.more.click).not.toHaveBeenCalled(); expect(f.back.click).not.toHaveBeenCalled();
    expect(f.calls).toEqual(["dialog-visible", "workspace", "project", "dialog-hidden", "menu-visible"]);
  });
  it("이미 열린 다른 목적에서는 실제 분류 복귀 뒤 같은 원고의 메뉴를 연다", async () => {
    const f = fixture({ dialogOpen: true, category: true });
    const originalUrl = f.state.url, originalDensity = f.state.density;
    await expect(prepareFilterMenuWorkspace(f.page)).resolves.toBe(true);
    expect(f.more.click).not.toHaveBeenCalled(); expect(f.back.click).toHaveBeenCalledOnce();
    expect(f.calls).toEqual(["dialog-visible", "back", "workspace", "project", "dialog-hidden", "menu-visible"]);
    expect(f.state.url).toBe(originalUrl); expect(f.state.density).toBe(originalDensity);
    expect(f.back.click.mock.calls[0]?.[0]).not.toHaveProperty("force");
  });
  it("분류 복귀의 실제 실패를 다른 메뉴 선택으로 숨기지 않는다", async () => {
    const failure = new Error("실제 분류 복귀 실패"), f = fixture({ dialogOpen: true, category: true, backError: failure });
    await expect(prepareFilterMenuWorkspace(f.page)).rejects.toBe(failure);
    expect(f.project.click).not.toHaveBeenCalled(); expect(f.workspace.click).not.toHaveBeenCalled();
  });
  it.each([0, 2])("분류 복귀가 %s개이면 임의의 버튼을 고르지 않는다", async (backCount) => {
    const f = fixture({ dialogOpen: true, category: true, backCount });
    await expect(prepareFilterMenuWorkspace(f.page)).rejects.toThrow("분류로 돌아가기");
    expect(f.back.click).not.toHaveBeenCalled(); expect(f.project.click).not.toHaveBeenCalled();
  });
  it.each([0, 2])("복귀 뒤 목적이 %s개이면 실제 배치를 바꾸지 않는다", async (workspaceCount) => {
    const f = fixture({ dialogOpen: true, category: true, workspaceCount });
    await expect(prepareFilterMenuWorkspace(f.page)).rejects.toThrow("화면과 도움말 목적은 하나");
    expect(f.back.click).toHaveBeenCalledOnce(); expect(f.project.click).not.toHaveBeenCalled();
  });
  it("분류 복귀가 추가돼도 최초 메뉴 준비 예산을 다시 시작하지 않는다", async () => {
    const f = fixture({ dialogOpen: true, category: true, advanceMs: 2_000 });
    await expect(prepareFilterMenuWorkspace(f.page, 10_000)).rejects.toThrow("10000ms 예산을 초과");
    expect(f.timeouts).toEqual([10_000, 8_000, 6_000, 4_000, 2_000]);
    expect(f.calls).toEqual(["dialog-visible", "back", "workspace", "project"]);
  });
  it.each([0, 2])("화면과 도움말 목적이 %s개이면 임의의 버튼을 누르지 않는다", async (workspaceCount) => {
    const f = fixture({ workspaceCount });
    await expect(prepareFilterMenuWorkspace(f.page)).rejects.toThrow("화면과 도움말 목적은 하나");
    expect(f.project.click).not.toHaveBeenCalled();
  });
  it("겹친 더보기 진입점을 임의로 선택하지 않는다", async () => {
    const f = fixture({ moreCount: 2 });
    await expect(prepareFilterMenuWorkspace(f.page)).rejects.toThrow("더보기 진입점은 하나");
    expect(f.more.click).not.toHaveBeenCalled();
  });
  it("원고의 중복 query와 hash 변경을 성공으로 판정하지 않는다", async () => {
    const f = fixture({ changedUrl: "http://127.0.0.1:5194/studio/draft/work-1?tag=a&workspace=draw#changed" });
    await expect(prepareFilterMenuWorkspace(f.page)).rejects.toThrow("원고 URL을 바꿨습니다");
  });
  it("사용자의 화면 밀도 변경을 성공으로 판정하지 않는다", async () => {
    const f = fixture({ changedDensity: "compact" });
    await expect(prepareFilterMenuWorkspace(f.page)).rejects.toThrow("화면 구성 설정을 바꿨습니다");
  });
  it.each(["menuError", "closeError"] as const)("%s를 준비 성공으로 숨기지 않는다", async (key) => {
    const failure = new Error("실제 메뉴 준비 실패"), f = fixture({ [key]: failure });
    await expect(prepareFilterMenuWorkspace(f.page)).rejects.toBe(failure);
  });
  it("메뉴 단계마다 전체 10초 예산을 재시작하지 않는다", async () => {
    const f = fixture({ advanceMs: 4_000 });
    await expect(prepareFilterMenuWorkspace(f.page, 10_000)).rejects.toThrow("10000ms 예산을 초과");
    expect(f.timeouts).toEqual([10_000, 6_000, 2_000]);
    expect(f.project.click).not.toHaveBeenCalled();
  });
});
