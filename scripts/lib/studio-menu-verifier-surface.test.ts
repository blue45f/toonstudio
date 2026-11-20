// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { closeStudioMenuVerifierDropdown, closeStudioMenuVerifierProject, prepareStudioMenuVerifierSurface, studioMenuVerifierRail } from "./studio-menu-verifier-surface";

import type { Locator, Page } from "playwright";

function domLocator(resolve: () => HTMLElement[]): Locator {
  const single = () => {
    const nodes = resolve();
    if (nodes.length !== 1) throw new Error(`표시 대상 ${nodes.length}개`);
    return nodes[0]!;
  };
  return {
    filter: ({ visible }: { visible: boolean }) => domLocator(() => resolve().filter(node => (node.closest("[hidden]") === null) === visible)),
    locator: (selector: string) => domLocator(() => resolve().flatMap(node => [...node.querySelectorAll<HTMLElement>(selector)])),
    getByRole: (role: string, { name }: { name: string }) => domLocator(() => resolve().flatMap(node =>
      [...node.querySelectorAll<HTMLElement>(role === "button" ? 'button, [role="button"]' : `[role="${role}"]`)]
        .filter(element => (element.getAttribute("aria-label") ?? element.textContent) === name))),
    first: () => domLocator(() => resolve().slice(0, 1)),
    count: async () => resolve().length,
    waitFor: async ({ state }: { state: string }) => {
      if (state === "hidden") { if (resolve().length > 0) throw new Error("아직 표시됨"); }
      else single();
    },
    getAttribute: async (name: string) => single().getAttribute(name),
    click: async () => single().click(),
  } as unknown as Locator;
}

function fixture({ clarity = true, duplicate = false }: { clarity?: boolean; duplicate?: boolean } = {}) {
  const menu = (owner: string) => `<nav data-studio-main-menu="true" data-owner="${owner}"></nav>`;
  document.body.innerHTML = `<section data-studio-editor="true" data-studio-drawing-clarity="${clarity}">
    ${clarity ? `<nav data-studio-drawing-quick-menu="true"></nav><summary data-studio-clarity-more-trigger="true">더보기</summary>
      <div data-studio-drawing-task-browser="true" hidden><button data-drawing-task-category="workspace">화면과 도움말</button>
        <button data-studio-clarity-action="windows" hidden>프로젝트·창 도구</button></div>
      <section data-studio-drawing-project-tools="true" hidden><button aria-label="프로젝트 도구 닫기">닫기</button>${menu("project")}${duplicate ? menu("duplicate") : ""}</section>
      <div role="toolbar" aria-label="그리기 도구" data-owner="current-rail"></div><div data-studio-tool-rail="true" hidden></div>`
      : `${menu("standalone")}<div data-studio-tool-rail="true" data-owner="legacy-rail"></div>`}
  </section><section data-studio-editor="true" hidden>${menu("hidden")}</section>`;
  const state = { opens: 0, escapes: 0, closes: 0 };
  const panel = document.querySelector<HTMLElement>('[data-studio-drawing-project-tools="true"]');
  const tasks = document.querySelector<HTMLElement>('[data-studio-drawing-task-browser="true"]');
  const windows = document.querySelector<HTMLElement>('[data-studio-clarity-action="windows"]');
  if (panel && tasks && windows) {
    document.querySelector<HTMLElement>('[data-studio-clarity-more-trigger="true"]')!.onclick = () => { tasks.hidden = false; };
    tasks.querySelector<HTMLElement>("[data-drawing-task-category]")!.onclick = () => { windows.hidden = false; };
    windows.onclick = () => { tasks.hidden = true; panel.hidden = false; state.opens += 1; };
    panel.querySelector<HTMLElement>('button[aria-label="프로젝트 도구 닫기"]')!.onclick = () => { panel.hidden = true; state.closes += 1; };
  }
  const page = {
    locator: (selector: string) => domLocator(() => [...document.querySelectorAll<HTMLElement>(selector)]),
    keyboard: { press: async () => {
      state.escapes += 1;
      const dropdown = document.querySelector('[data-studio-main-menu-panel="true"]');
      if (dropdown) dropdown.remove(); else if (panel) panel.hidden = true;
    } },
  } as unknown as Page;
  return { page, state, panel };
}

afterEach(() => { document.body.replaceChildren(); });

describe("메뉴 verifier의 실제 프로젝트 도구 진입", () => {
  it("더보기 의도 전에는 없는 전체 메뉴를 실제 사용자 경로로 열고 숨은 셸을 제외한다", async () => {
    const { page, state, panel } = fixture();
    const surface = await prepareStudioMenuVerifierSurface(page);
    expect(surface.project).toBe(true);
    expect(await surface.primary.getAttribute("data-owner")).toBe("project");
    expect(state.opens).toBe(1);
    await prepareStudioMenuVerifierSurface(page);
    expect(state.opens).toBe(1);
    panel!.hidden = true;
    await prepareStudioMenuVerifierSurface(page);
    expect(state.opens).toBe(2);
  });

  it("열린 dropdown만 Escape로 닫아 프로젝트 패널의 수명을 유지한다", async () => {
    const { page, state, panel } = fixture();
    panel!.hidden = false;
    await closeStudioMenuVerifierDropdown(page);
    expect(state.escapes).toBe(0);
    expect(panel!.hidden).toBe(false);
    const dropdown = document.createElement("div");
    dropdown.dataset.studioMainMenuPanel = "true";
    document.body.append(dropdown);
    await closeStudioMenuVerifierDropdown(page);
    expect(state.escapes).toBe(1);
    expect(dropdown.isConnected).toBe(false);
    expect(panel!.hidden).toBe(false);
  });

  it("독립 셸의 기존 전체 메뉴도 보이는 한 개만 검증한다", async () => {
    const { page, state } = fixture({ clarity: false });
    const surface = await prepareStudioMenuVerifierSurface(page);
    expect(surface.project).toBe(false);
    expect(await surface.primary.getAttribute("data-owner")).toBe("standalone");
    expect(state.opens).toBe(0);
  });

  it("프로젝트 패널 내부의 중복 메뉴는 첫 요소로 덮지 않고 실패한다", async () => {
    const { page, panel } = fixture({ duplicate: true });
    panel!.hidden = false;
    await expect(prepareStudioMenuVerifierSurface(page)).rejects.toThrow(/표시 대상 2개/u);
  });

  it("헤더를 가리는 프로젝트 패널은 실제 닫기 버튼으로 닫고 다음 명령에서 다시 연다", async () => {
    const { page, state, panel } = fixture();
    await prepareStudioMenuVerifierSurface(page);
    await closeStudioMenuVerifierProject(page);
    expect(panel!.hidden).toBe(true);
    expect(state.closes).toBe(1);
    expect(state.escapes).toBe(0);
    await prepareStudioMenuVerifierSurface(page);
    expect(state.opens).toBe(2);
  });

  it.each([true, false])("실제 셸(%s)의 보이는 도구 레일만 사용한다", async (clarity) => {
    const { page } = fixture({ clarity });
    expect(await (await studioMenuVerifierRail(page)).getAttribute("data-owner")).toBe(clarity ? "current-rail" : "legacy-rail");
  });
});
