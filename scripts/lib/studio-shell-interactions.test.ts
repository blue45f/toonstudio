// @vitest-environment jsdom
import { errors, type Locator, type Page } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";

import { openStudioLayerNavigator, openStudioMainMenu, runStudioClarityAction } from "./studio-shell-interactions";

/** 브라우저 설치 없이 실제 DOM 범위·숨김·키 입력 계약을 검증하는 최소 Locator 어댑터다. */
function domLocator(resolve: () => HTMLElement[], timings: { operation: string; timeout: number }[]): Locator {
  const next = (read: () => HTMLElement[]) => domLocator(read, timings);
  const single = () => {
    const elements = resolve();
    if (elements.length !== 1) throw new Error(`조작 대상 ${elements.length}개`);
    return elements[0]!;
  };
  return {
    filter: ({ visible }: { visible: boolean }) => next(() => resolve().filter(
      (element) => (element.closest("[hidden]") === null) === visible)),
    locator: (selector: string) => next(() => resolve().flatMap(
      (element) => [...element.querySelectorAll<HTMLElement>(selector)])),
    first: () => next(() => resolve().slice(0, 1)),
    nth: (index: number) => next(() => resolve().slice(index, index + 1)),
    count: async () => resolve().length,
    waitFor: async (options: { timeout?: number }) => {
      if (options.timeout !== undefined) timings.push({ operation: "wait", timeout: options.timeout });
      if (resolve().length === 0) throw new Error("표시할 대상이 없습니다");
    },
    getAttribute: async (name: string) => single().getAttribute(name),
    evaluateAll: async <T>(read: (elements: HTMLElement[]) => T) => read(resolve()),
    focus: async () => single().focus(),
    press: async (key: string) => single().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })),
    click: async (options?: { timeout?: number }) => {
      if (options?.timeout !== undefined) timings.push({ operation: "click", timeout: options.timeout });
      single().click();
    },
  } as unknown as Locator;
}

function fixture({ clarity = true, duplicate = false }: { clarity?: boolean; duplicate?: boolean } = {}) {
  const buttons = (owner: string) => ["file", "filter", "layer", ...(duplicate && owner === "project" ? ["filter"] : [])]
    .map((id) => `<button data-studio-main-menu-trigger="${id}" data-owner="${owner}">${id}</button>`).join("");
  document.body.innerHTML = `
    <section data-studio-editor="true" data-studio-drawing-clarity="${clarity}">
      ${clarity ? `<nav data-studio-main-menu="true">${buttons("quick")}</nav>
        <summary data-studio-clarity-more-trigger="true">더보기</summary>
        <div data-studio-drawing-task-browser="true" hidden>
          <button data-drawing-task-category="workspace">화면과 도움말</button>
          <button data-studio-clarity-action="windows" hidden>프로젝트·창 도구</button>
        </div>
        <section data-studio-drawing-project-tools="true" hidden>
          <nav data-studio-main-menu="true">${buttons("project")}</nav>
        </section>` : `<nav data-studio-main-menu="true">${buttons("standalone")}</nav>`}
    </section>
    <section data-studio-editor="true" hidden><nav data-studio-main-menu="true">${buttons("hidden")}</nav></section>`;
  const state = { selectedImage: true, escapes: 0, projectOpens: 0, selected: [] as string[] };
  const timings: { operation: string; timeout: number }[] = [];
  const project = document.querySelector<HTMLElement>('[data-studio-drawing-project-tools="true"]');
  const tasks = document.querySelector<HTMLElement>('[data-studio-drawing-task-browser="true"]');
  const windows = document.querySelector<HTMLElement>('[data-studio-clarity-action="windows"]');
  const more = document.querySelector<HTMLElement>('[data-studio-clarity-more-trigger="true"]');
  if (more && tasks && windows && project) {
    more.onclick = () => { tasks.hidden = false; };
    tasks.querySelector<HTMLElement>("[data-drawing-task-category]")!.onclick = () => { windows.hidden = false; };
    windows.onclick = () => { tasks.hidden = true; project.hidden = false; state.projectOpens += 1; };
  }
  document.querySelectorAll<HTMLElement>("[data-studio-main-menu-trigger]").forEach((trigger) => {
    trigger.onkeydown = (event) => {
      if (event.key !== "ArrowDown") return;
      const panel = document.createElement("section");
      panel.dataset.studioMainMenuPanel = "true";
      const owner = trigger.dataset.owner!;
      panel.innerHTML = `<div role="menu" data-owner="${owner}"><button role="menuitem">적용</button></div>`;
      panel.querySelector<HTMLElement>("button")!.onclick = () => {
        state.selected.push(owner);
        panel.remove();
        if (project) project.hidden = true;
      };
      document.body.append(panel);
    };
  });
  document.onkeydown = (event) => {
    if (event.key !== "Escape") return;
    state.escapes += 1;
    const panel = document.querySelector('[data-studio-main-menu-panel="true"]');
    if (panel) panel.remove();
    else state.selectedImage = false;
  };
  const page = {
    locator: (selector: string) => domLocator(() => [...document.querySelectorAll<HTMLElement>(selector)], timings),
    keyboard: { press: async (key: string) => document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })) },
  } as unknown as Page;
  return { page, state, timings };
}

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); document.onkeydown = null; });

describe("실제 셸의 프로젝트 메뉴 범위와 명령별 준비", () => {
  it("빠른 메뉴와 같은 그룹이 있어도 프로젝트 메뉴를 열고 닫힌 패널을 다음 명령에서 다시 준비한다", async () => {
    const { page, state } = fixture();
    for (const group of ["filter", "layer", "filter"]) {
      const menu = await openStudioMainMenu(page, group);
      expect(await menu.getAttribute("data-owner")).toBe("project");
      await menu.locator('[role="menuitem"]').click();
    }
    expect(state.projectOpens).toBe(3);
    expect(state.selected).toEqual(["project", "project", "project"]);
    expect(state.escapes).toBe(0);
    expect(state.selectedImage).toBe(true);
  });

  it("실제 열린 메뉴만 Escape로 닫아 필터 대상 이미지 선택을 보존한다", async () => {
    const { page, state } = fixture();
    await openStudioMainMenu(page, "layer");
    await openStudioMainMenu(page, "filter");
    expect(state.escapes).toBe(1);
    expect(state.projectOpens).toBe(1);
    expect(state.selectedImage).toBe(true);
  });

  it("독립 셸에서도 숨은 이전 셸과 혼동하지 않고 기존 메뉴를 연다", async () => {
    const { page, state } = fixture({ clarity: false });
    expect(await (await openStudioMainMenu(page, "filter")).getAttribute("data-owner")).toBe("standalone");
    expect(state.projectOpens).toBe(0);
    expect(state.escapes).toBe(0);
  });

  it("프로젝트 범위 안의 중복 그룹은 첫 항목을 골라 숨기지 않는다", async () => {
    const { page } = fixture({ duplicate: true });
    await expect(openStudioMainMenu(page, "filter")).rejects.toThrow("등록된 Studio 메뉴가 하나여야 합니다: filter");
  });

  it.each([true, false])("존재하지 않는 그룹은 셸 종류(%s)와 무관하게 실패한다", async (clarity) => {
    const { page } = fixture({ clarity });
    await expect(openStudioMainMenu(page, "missing")).rejects.toThrow("등록된 Studio 메뉴가 하나여야 합니다: missing");
  });

  it("명시한 준비 예산은 각 메뉴 단계에서 실제 남은 시간으로 줄어든다", async () => {
    const { page, state, timings } = fixture(); let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    document.querySelector<HTMLElement>('[data-studio-clarity-more-trigger="true"]')!
      .addEventListener("click", () => { now += 300; });
    document.querySelector<HTMLElement>('[data-drawing-task-category="workspace"]')!
      .addEventListener("click", () => { now += 250; });
    await runStudioClarityAction(page, "windows", 1_000);
    expect(state.projectOpens).toBe(1);
    expect(timings.filter(({ operation }) => operation === "click").map(({ timeout }) => timeout)).toEqual([1_000, 700, 450]);
    expect(timings.every(({ timeout }) => timeout > 0 && timeout <= 1_000)).toBe(true);
  });

  it("이전 메뉴 단계에서 기한이 소진되면 다음 명령을 실행하지 않는다", async () => {
    const { page, state } = fixture(); let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    document.querySelector<HTMLElement>('[data-drawing-task-category="workspace"]')!
      .addEventListener("click", () => { now = 1_001; });
    await expect(runStudioClarityAction(page, "windows", 1_000)).rejects.toThrow("기한");
    expect(state.projectOpens).toBe(0);
    expect(state.selectedImage).toBe(true);
  });

  it.each([
    { label: "명시한 1초", timeoutMs: 1_000, elapsed: 1_001, failureType: errors.TimeoutError },
    { label: "생략한 기본 10초", timeoutMs: undefined, elapsed: 10_001, failureType: Error },
  ])("레이어 탐색기의 $label 기한은 호출자가 기대하는 오류 유형을 유지한다", async ({ timeoutMs, elapsed, failureType }) => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    // 표시 상태를 읽는 동안 예산이 소진되어도 후속 대기나 클릭을 시작하지 않는다.
    const panel = {
      filter() { return this; }, locator() { return this; }, or() { return this; }, first() { return this; },
      count: async () => 1,
      isVisible: async () => { now = elapsed; return false; },
      waitFor: vi.fn(), click: vi.fn(),
    };
    const page = { locator: () => panel, getByTestId: () => panel } as unknown as Page;
    const failure: unknown = await openStudioLayerNavigator(page, timeoutMs).catch(error => error);
    expect(failure).toBeInstanceOf(failureType);
    expect((failure as Error).constructor).toBe(failureType);
    expect((failure as Error).message).toBe(`레이어 탐색기 준비 기한 ${timeoutMs ?? 10_000}ms를 넘었습니다.`);
    expect(panel.waitFor).not.toHaveBeenCalled();
    expect(panel.click).not.toHaveBeenCalled();
  });
});
