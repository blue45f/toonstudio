// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { openStudioMainMenu } from "./studio-shell-interactions";
import {
  openStudioMobileDrawSettings,
  openStudioProjectCenter,
  showStudioMobileEditOptions,
  studioDocumentHistoryButtons,
  studioPinnedToolButton,
} from "./studio-verifier-entry-points";

import type { Locator, Page } from "playwright";

vi.mock("./studio-shell-interactions", async (original) => ({
  ...await original<typeof import("./studio-shell-interactions")>(),
  openStudioMainMenu: vi.fn(),
  showStudioProjectWindowTools: vi.fn(),
}));

/** 실제 portal 위치와 accessible name을 사용하는 DOM fixture. 브라우저/제품 상태 주입은 없다. */
function fixture(html: string) {
  document.body.innerHTML = html;
  const events: string[] = [];
  const visible = (node: HTMLElement) => !node.closest("[hidden]");
  const locate = (read: () => HTMLElement[]): Locator => {
    const one = () => {
      const nodes = read();
      if (nodes.length !== 1) throw new Error(`조작할 컨트롤이 ${nodes.length}개입니다`);
      return nodes[0]!;
    };
    const query = (roots: HTMLElement[], selector: string) => {
      const nodes = roots.flatMap(root => [...root.querySelectorAll<HTMLElement>(selector.replaceAll(":visible", ""))]);
      return selector.includes(":visible") ? nodes.filter(visible) : nodes;
    };
    const role = (roots: HTMLElement[], value: string, options: { name?: string | RegExp; exact?: boolean } = {}) => {
      const tag = value === "button" ? "button" : value === "searchbox" ? 'input[type="search"]' : value === "slider" ? 'input[type="range"]' : `[role="${value}"]`;
      return query(roots, tag).filter(node => {
        const name = node.getAttribute("aria-label") ?? node.textContent?.trim() ?? "";
        return !options.name || (typeof options.name === "string"
          ? options.exact ? name === options.name : name.includes(options.name)
          : options.name.test(name));
      });
    };
    const self = {
      locator: (selector: string) => locate(() => selector === ".." ? [...new Set(read().map(node => node.parentElement!))] : query(read(), selector)),
      getByRole: (value: string, options?: { name?: string | RegExp; exact?: boolean }) => locate(() => role(read(), value, options)),
      filter: ({ visible: expected }: { visible: boolean }) => locate(() => read().filter(node => visible(node) === expected)),
      or: (other: Locator) => locate(() => [...new Set([...read(), ...(other as unknown as { nodes: () => HTMLElement[] }).nodes()])]),
      and: (other: Locator) => locate(() => read().filter(node => (other as unknown as { nodes: () => HTMLElement[] }).nodes().includes(node))),
      first: () => locate(() => read().slice(0, 1)),
      nth: (index: number) => locate(() => read().slice(index, index + 1)),
      count: async () => read().length,
      isVisible: async () => read().some(visible),
      isEnabled: async () => !(one() as HTMLButtonElement).disabled,
      getAttribute: async (name: string) => one().getAttribute(name),
      click: async (options?: { force?: boolean }) => {
        expect(options?.force).not.toBe(true);
        const node = one();
        if (!visible(node) || (node as HTMLButtonElement).disabled) throw new Error("사용자가 누를 수 없는 컨트롤입니다");
        events.push(node.id || node.textContent || "click"); node.click();
      },
      fill: async (value: string) => { (one() as HTMLInputElement).value = value; events.push(`search:${value}`); },
      waitFor: async ({ state = "visible" }: { state?: string } = {}) => {
        const present = read().some(visible);
        if ((state === "hidden" || state === "detached") ? present : !present) throw new Error(`요청한 ${state} 컨트롤이 없습니다`);
      },
      page: () => page,
      nodes: read,
    };
    return self as unknown as Locator;
  };
  const root = locate(() => [document.body]);
  const page = {
    locator: (selector: string) => root.locator(selector),
    getByRole: (role: Parameters<Locator["getByRole"]>[0], options: { name?: string | RegExp; exact?: boolean }) => root.getByRole(role, options),
    evaluate: async () => ({ toolId: "fixture", states: [] }),
  } as unknown as Page;
  return { page, events };
}

afterEach(() => { vi.clearAllMocks(); document.body.replaceChildren(); });

describe("이동한 실제 Studio 진입점의 회귀", () => {
  it("예전 rail 밖으로 portal된 유일한 도구를 찾고 숨겨진 복사본은 누르지 않는다", async () => {
    const f = fixture('<nav data-studio-tool-rail="true" hidden><button data-studio-rail-tool-id="fill">옛 도구</button></nav><div role="toolbar"><button id="current" data-studio-rail-tool-id="fill" aria-pressed="false">채우기</button></div>');
    const target = await studioPinnedToolButton(f.page, "fill");
    expect(await target.getAttribute("id")).toBe("current");
    expect(f.events).toEqual([]);
  });

  it("현재 전체 도구 문으로 검색·고정하고 같은 ID의 portal 도구를 반환한다", async () => {
    const f = fixture('<button id="catalog-open" data-studio-rail-all-tools="true">전체 도구</button><section role="dialog" aria-label="전체 도구" hidden><input type="search" aria-label="전체 도구 검색"><div><button data-studio-catalog-tool-id="liquify">왜곡</button><button id="pin" aria-pressed="false">고정</button></div><button id="catalog-close">전체 도구 닫기</button></section><div id="pinned"></div>');
    const catalog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    document.getElementById("catalog-open")!.onclick = () => { catalog.hidden = false; };
    document.getElementById("catalog-close")!.onclick = () => { catalog.hidden = true; };
    document.getElementById("pin")!.onclick = () => {
      document.getElementById("pin")!.setAttribute("aria-pressed", "true");
      document.getElementById("pinned")!.innerHTML = '<button id="live-liquify" data-studio-rail-tool-id="liquify" aria-pressed="false">왜곡</button>';
    };
    const target = await studioPinnedToolButton(f.page, "liquify");
    expect(await target.getAttribute("id")).toBe("live-liquify");
    expect(f.events).toEqual(["catalog-open", "search:liquify", "pin", "catalog-close"]);
    expect(catalog.hidden).toBe(true);
  });

  it("같은 도구의 두 visible 인스턴스를 임의로 선택하지 않는다", async () => {
    const f = fixture('<button data-studio-rail-tool-id="fill">첫째</button><button data-studio-rail-tool-id="fill">둘째</button>');
    await expect(studioPinnedToolButton(f.page, "fill")).rejects.toThrow(/하나|2개/u);
    expect(f.events).toEqual([]);
  });

  it("현재 파일 메뉴로 기존 프로젝트 portal을 열고 이미 열린 창은 재실행하지 않는다", async () => {
    const f = fixture('<div role="menu"><button id="project" role="menuitem" data-studio-menu-item-id="project">프로젝트 센터…</button></div><section data-studio-project-actions-menu="true" hidden><button data-studio-hybrid-dcc-open="true">Hybrid DCC</button></section>');
    const portal = document.querySelector<HTMLElement>('[data-studio-project-actions-menu="true"]')!;
    document.getElementById("project")!.onclick = () => { portal.hidden = false; };
    vi.mocked(openStudioMainMenu).mockResolvedValue(f.page.locator('[role="menu"]'));
    const first = await openStudioProjectCenter(f.page);
    expect(await first.isVisible()).toBe(true);
    await openStudioProjectCenter(f.page);
    expect(openStudioMainMenu).toHaveBeenCalledExactlyOnceWith(f.page, "file");
    expect(f.events).toEqual(["project"]);
  });

  it.each([
    ["실행취소", "되돌리기 · 실행취소"],
    ["다시실행", "다시 · 다시실행"],
  ] as const)("현재 문서 기록의 %s 이름을 찾으며 활성 상태를 위조하지 않는다", async (label, currentName) => {
    const f = fixture(`<div role="toolbar" aria-label="편집 기록"><button id="history" aria-label="${currentName}" disabled></button></div>`);
    const target = await studioDocumentHistoryButtons(f.page, label);
    expect(await target.count()).toBe(1);
    expect(await target.isEnabled()).toBe(false);
    document.getElementById("history")!.removeAttribute("disabled");
    expect(await target.isEnabled()).toBe(true);
  });

  it("기존 문서 기록 이름도 유지한다", async () => {
    const f = fixture('<button aria-label="실행취소" id="legacy"></button>');
    const target = await studioDocumentHistoryButtons(f.page, "실행취소");
    expect(await target.getAttribute("id")).toBe("legacy");
  });

  it.each([false, true])("펜의 기존 선택 상태(%s)를 따라 재클릭해 같은 모바일 설정 시트를 연다", async (active) => {
    const f = fixture(`<nav data-studio-mobile-editing-dock="true"><button id="pen" data-studio-primary-action="draw" aria-pressed="${active}" aria-expanded="false">펜</button></nav><section id="studio-mobile-draw-settings" hidden><input type="range" aria-label="브러시 굵기 슬라이더"></section>`);
    const pen = document.getElementById("pen")!;
    const sheet = document.getElementById("studio-mobile-draw-settings")!;
    pen.onclick = () => {
      if (pen.getAttribute("aria-pressed") !== "true") pen.setAttribute("aria-pressed", "true");
      else { pen.setAttribute("aria-expanded", "true"); sheet.hidden = false; }
    };
    const target = await openStudioMobileDrawSettings(f.page);
    expect(await target.isVisible()).toBe(true);
    expect(f.events).toEqual(active ? ["pen"] : ["pen", "pen"]);
    await openStudioMobileDrawSettings(f.page);
    expect(f.events).toHaveLength(active ? 1 : 2);
  });

  it("작은 화면의 편집 행을 실제 버튼으로 펼친 뒤 같은 행을 다시 접지 않는다", async () => {
    const f = fixture('<button id="edit" aria-controls="studio-mobile-edit-options" aria-expanded="false">편집</button><div id="studio-mobile-edit-options" hidden><button data-studio-primary-action="undo">되돌리기</button></div>');
    document.getElementById("edit")!.onclick = () => {
      document.getElementById("edit")!.setAttribute("aria-expanded", "true");
      document.getElementById("studio-mobile-edit-options")!.hidden = false;
    };
    expect(await (await showStudioMobileEditOptions(f.page)).isVisible()).toBe(true);
    await showStudioMobileEditOptions(f.page);
    expect(f.events).toEqual(["edit"]);
  });

  it("이미 보이는 큰 화면의 편집 행은 숨겨진 펼침 버튼 없이 사용한다", async () => {
    const f = fixture('<button aria-controls="studio-mobile-edit-options" aria-expanded="false" hidden>편집</button><div id="studio-mobile-edit-options"><button>되돌리기</button></div>');
    expect(await (await showStudioMobileEditOptions(f.page)).isVisible()).toBe(true);
    expect(f.events).toEqual([]);
  });

  it("펼치기 클릭 뒤 실제 행이 계속 숨겨져 있으면 성공으로 처리하지 않는다", async () => {
    const f = fixture('<button id="broken" aria-controls="studio-mobile-edit-options" aria-expanded="false">편집</button><div id="studio-mobile-edit-options" hidden></div>');
    await expect(showStudioMobileEditOptions(f.page)).rejects.toThrow("visible");
    expect(f.events).toEqual(["broken"]);
  });
});
