// @vitest-environment jsdom
import { render, act } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { StudioMobileBackStackHost } from "./StudioMobileBackStackHost";
import {
  createStudioMobileHistorySyncController,
  resolveStudioMobileBackLayers,
  type BrowserHistoryAdapter,
  type StudioMobileSheetKind,
} from "./studio-mobile-back-stack";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

function createFakeHistory(initialPath = "/studio/p/proj-1/d/doc-1") {
  const entries: Array<{ state: unknown; url: string }> = [
    { state: { idx: 0 }, url: `http://127.0.0.1:4179${initialPath}` },
  ];
  let cursor = 0;
  const listeners = new Set<(event: PopStateEvent) => void>();

  const currentPathname = () => new URL(entries[cursor]!.url).pathname;

  const dispatchPopState = () => {
    let immediateStopped = false;
    const event = new PopStateEvent("popstate", { state: entries[cursor]!.state });
    const origStop = event.stopImmediatePropagation.bind(event);
    event.stopImmediatePropagation = () => {
      immediateStopped = true;
      origStop();
    };
    for (const listener of listeners) {
      listener(event);
      if (immediateStopped) break;
    }
    return { defaultPrevented: event.defaultPrevented, immediateStopped };
  };

  const adapter: BrowserHistoryAdapter = {
    getPathname: currentPathname,
    getHref: () => entries[cursor]!.url,
    getState: () => entries[cursor]!.state,
    pushState(state, url) {
      entries.splice(cursor + 1);
      entries.push({ state, url });
      cursor = entries.length - 1;
    },
    go(delta) {
      const next = Math.max(0, Math.min(entries.length - 1, cursor + delta));
      if (next === cursor) return;
      cursor = next;
      dispatchPopState();
    },
  };

  return {
    adapter,
    entries,
    getCursor: () => cursor,
    getPathname: currentPathname,
    navigateInApp(nextPath: string) {
      adapter.pushState({ idx: cursor + 1 }, `http://127.0.0.1:4179${nextPath}`);
    },
    subscribe(fn: (event: PopStateEvent) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    systemBack() {
      if (cursor === 0) return { defaultPrevented: false, immediateStopped: false };
      cursor -= 1;
      return dispatchPopState();
    },
  };
}

describe("resolveStudioMobileBackLayers", () => {
  it("데스크톱(isMobile=false)에서는 빈 스택을 반환한다", () => {
    const layers = resolveStudioMobileBackLayers({
      isMobile: false,
      mobileSheet: "brushes",
      dismissActiveMobileSheet: vi.fn(),
      menuOpen: true,
      dismissMenu: vi.fn(),
      quickActionsOpen: true,
      dismissQuickActions: vi.fn(),
      quickAccessPaletteOpen: true,
      dismissQuickAccessPalette: vi.fn(),
      shortcutsOpen: true,
      dismissShortcuts: vi.fn(),
    });
    expect(layers).toEqual([]);
  });

  it("모바일 시트(draw→brushes 2단)와 포털 모달을 바닥→최상단 LIFO 순서로 계산한다", () => {
    const root = document.createElement("div");

    const colorPopover = document.createElement("div");
    colorPopover.setAttribute("data-studio-mobile-color-controls", "true");
    const colorClose = document.createElement("button");
    colorClose.setAttribute("data-studio-mobile-sheet-close", "true");
    const onColorClose = vi.fn();
    colorClose.addEventListener("click", onColorClose);
    colorPopover.appendChild(colorClose);
    root.appendChild(colorPopover);

    // 모바일 시트 자체(`data-studio-mobile-sheet`)는 중복 산입하지 않아야 한다.
    const propsDialog = document.createElement("section");
    propsDialog.setAttribute("role", "dialog");
    propsDialog.setAttribute("aria-modal", "true");
    propsDialog.setAttribute("data-studio-mobile-sheet", "true");
    root.appendChild(propsDialog);

    // 포털 모달(예: 통합 검색)은 최상단 레이어로 잡혀야 한다.
    const searchDialog = document.createElement("div");
    searchDialog.setAttribute("role", "dialog");
    searchDialog.setAttribute("aria-modal", "true");
    searchDialog.setAttribute("aria-label", "기능·설정 찾기");
    let searchEscaped = false;
    searchDialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        searchEscaped = true;
        event.preventDefault();
      }
    });
    root.appendChild(searchDialog);

    const dismissSheet = vi.fn();
    const layers = resolveStudioMobileBackLayers({
      isMobile: true,
      mobileSheet: "brushes",
      dismissActiveMobileSheet: dismissSheet,
      menuOpen: false,
      dismissMenu: vi.fn(),
      quickActionsOpen: false,
      dismissQuickActions: vi.fn(),
      quickAccessPaletteOpen: false,
      dismissQuickAccessPalette: vi.fn(),
      shortcutsOpen: false,
      dismissShortcuts: vi.fn(),
      domRoot: root,
    });

    expect(layers.map((layer) => layer.id)).toEqual([
      "dock:colors",
      "sheet:draw",
      "sheet:brushes",
      "modal:0:기능·설정 찾기",
    ]);

    // 최상단 닫기 → 포털 모달 Escape 전달
    layers[layers.length - 1]!.dismiss();
    expect(searchEscaped).toBe(true);
    expect(dismissSheet).not.toHaveBeenCalled();

    // 바닥 도크 팝오버 닫기 → 닫기 버튼 클릭
    layers[0]!.dismiss();
    expect(onColorClose).toHaveBeenCalledTimes(1);
  });
});

describe("createStudioMobileHistorySyncController", () => {
  it("3단 중첩 패널에서 시스템 뒤로 가기를 누를 때마다 최상단부터 1개씩 닫고 경로를 유지한다", () => {
    const history = createFakeHistory("/studio/p/proj-1/d/doc-1");
    const controller = createStudioMobileHistorySyncController(history.adapter);
    const routerPopSpy = vi.fn();
    history.subscribe((event) => {
      controller.handlePopState(event);
    });
    history.subscribe(routerPopSpy);

    const closed: string[] = [];
    let stack = [
      { id: "sheet:draw", dismiss: () => closed.push("sheet:draw") },
      { id: "sheet:brushes", dismiss: () => closed.push("sheet:brushes") },
      { id: "modal:search", dismiss: () => closed.push("modal:search") },
    ];

    controller.syncLayers(stack);
    expect(controller.getPushedDepth()).toBe(3);
    expect(history.getCursor()).toBe(3);

    // 뒤로 가기 #1 → 최상단 modal:search 만 닫힘, 라우터 popstate 차단
    const back1 = history.systemBack();
    expect(back1.immediateStopped).toBe(true);
    expect(routerPopSpy).not.toHaveBeenCalled();
    expect(closed).toEqual(["modal:search"]);
    stack = stack.slice(0, 2);
    controller.syncLayers(stack);
    expect(controller.getPushedDepth()).toBe(2);

    // 뒤로 가기 #2 → sheet:brushes 만 닫힘
    history.systemBack();
    expect(routerPopSpy).not.toHaveBeenCalled();
    expect(closed).toEqual(["modal:search", "sheet:brushes"]);
    stack = stack.slice(0, 1);
    controller.syncLayers(stack);
    expect(controller.getPushedDepth()).toBe(1);

    // 뒤로 가기 #3 → sheet:draw 닫힘, 원고 경로 그대로 유지
    history.systemBack();
    expect(routerPopSpy).not.toHaveBeenCalled();
    expect(closed).toEqual(["modal:search", "sheet:brushes", "sheet:draw"]);
    stack = [];
    controller.syncLayers(stack);
    expect(controller.getPushedDepth()).toBe(0);
    expect(history.getPathname()).toBe("/studio/p/proj-1/d/doc-1");
  });

  it("패널을 닫기 버튼/Escape로 직접 닫으면 가드 엔트리를 되감되 라우터 이탈을 유발하지 않고, 링크 이동 시에는 되감지 않는다", () => {
    const history = createFakeHistory("/studio/p/proj-1/d/doc-1");
    const controller = createStudioMobileHistorySyncController(history.adapter);
    const routerPopSpy = vi.fn();
    history.subscribe((event) => {
      controller.handlePopState(event);
    });
    history.subscribe(routerPopSpy);

    controller.syncLayers([
      { id: "sheet:draw", dismiss: vi.fn() },
      { id: "sheet:brushes", dismiss: vi.fn() },
    ]);
    expect(history.getCursor()).toBe(2);

    // UI 닫기 버튼으로 한꺼번에 닫힘 → history.go(-2) 로 가드 정리 + 라우터 전파 차단
    controller.syncLayers([]);
    expect(history.getCursor()).toBe(0);
    expect(controller.getPushedDepth()).toBe(0);
    expect(routerPopSpy).not.toHaveBeenCalled();

    // 모달 내부에서 <Link>로 다른 경로로 이동한 경우 history.go(-delta) 로 새 경로를 되돌리지 않는다.
    const history2 = createFakeHistory("/studio/p/proj-1/d/doc-1");
    const controller2 = createStudioMobileHistorySyncController(history2.adapter);
    controller2.syncLayers([{ id: "modal:search", dismiss: vi.fn() }]);
    history2.navigateInApp("/studio/p/proj-1/story");
    controller2.syncLayers([]);
    expect(history2.getPathname()).toBe("/studio/p/proj-1/story");
  });
});

describe("StudioMobileBackStackHost (React StrictMode)", () => {
  it("StrictMode 이중 마운트 이후에도 popstate 리스너가 살아 있어 최상단 시트를 단계별로 닫는다", () => {
    function Harness() {
      const [mobileSheet, setMobileSheet] = useState<StudioMobileSheetKind>("brushes");
      const session = {
        isMobile: true,
        mobileSheet,
        dismissActiveMobileSheet: () => {
          setMobileSheet((prev) => (prev === "brushes" ? "draw" : null));
        },
        menu: null,
        setMenu: vi.fn(),
        quickActionsOpen: false,
        setQuickActionsOpen: vi.fn(),
        quickAccessPaletteOpen: false,
        setQuickAccessPaletteOpen: vi.fn(),
        shortcutsOpen: false,
        setShortcutsOpen: vi.fn(),
      } as unknown as StudioCuttoonEditorViewSession;

      return (
        <div data-active-sheet={mobileSheet ?? "none"}>
          <StudioMobileBackStackHost {...session} />
        </div>
      );
    }

    const { container, unmount } = render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );

    expect(container.firstElementChild?.getAttribute("data-active-sheet")).toBe("brushes");

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(container.firstElementChild?.getAttribute("data-active-sheet")).toBe("draw");

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(container.firstElementChild?.getAttribute("data-active-sheet")).toBe("none");

    unmount();
  });
});
