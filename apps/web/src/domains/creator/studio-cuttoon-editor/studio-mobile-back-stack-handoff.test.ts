import { describe, expect, it, vi } from "vitest";

import {
  createStudioMobileHistorySyncController,
  type BrowserHistoryAdapter,
} from "./studio-mobile-back-stack";

const outside = "http://localhost/discover";
const studio = "http://localhost/studio/p/project/d/draft?workspace=draw";
const baseState = { idx: 1, key: "studio", usr: { navigation: "kept" } };

function setupHistory() {
  const entries: { href: string; state: object }[] = [
    { href: outside, state: { idx: 0, key: "outside" } },
    { href: studio, state: baseState },
  ];
  let cursor = 1;
  const queued: number[] = [];
  const routerPop = vi.fn();
  let controller: ReturnType<typeof createStudioMobileHistorySyncController>;
  const scope = {};
  const currentEntry = () => {
    const entry = entries[cursor];
    if (!entry) throw new Error("Expected a browser history entry");
    return entry;
  };
  const adapter: BrowserHistoryAdapter = {
    getPathname: () => new URL(currentEntry().href).pathname,
    getHref: () => currentEntry().href,
    getState: () => currentEntry().state,
    pushState(state, href) {
      if (!state || typeof state !== "object") throw new Error("Expected history state");
      entries.splice(++cursor, Infinity, { href, state });
    },
    go: (delta) => { queued.push(delta); },
  };

  function pop(delta: number) {
    cursor += delta;
    const { href, state } = currentEntry();
    const event = Object.assign(new Event("popstate"), { state }) as PopStateEvent;
    const stopped = vi.spyOn(event, "stopImmediatePropagation");
    if (!controller.handlePopState(event)) routerPop(href, state);
    return stopped.mock.calls.length;
  }

  function landQueued() {
    const delta = queued.shift();
    if (delta === undefined) throw new Error("Expected queued history traversal");
    cursor += delta;
  }

  return {
    adapter,
    queued,
    routerPop,
    entries,
    mount(owner = {}) {
      controller = createStudioMobileHistorySyncController(adapter, { handoffScope: scope, handoffOwner: owner });
      return controller;
    },
    replace(href: string, updates: object = {}) {
      entries[cursor] = { href, state: { ...currentEntry().state, ...updates } };
    },
    landQueued,
    dispatchLanded: () => pop(0),
    flush() {
      landQueued();
      return pop(0);
    },
    back: () => pop(-1),
  };
}

describe("모바일 뒤로 가기 항목의 편집기 소유자 전환", () => {
  it("같은 원고에서 계정 전환 시 이전 가드만 되감고 첫 실제 뒤로 가기로 원래 위치를 연다", () => {
    const history = setupHistory();
    const oldDismiss = vi.fn();
    const old = history.mount();
    old.syncLayers([
      { id: "sheet:props", dismiss: oldDismiss },
      { id: "modal:drawing-task:expanded-tools", dismiss: oldDismiss },
    ]);
    old.dispose();
    expect(history.queued).toEqual([]);

    const current = history.mount();
    current.syncLayers([]);
    current.syncLayers([]);
    expect(history.queued).toEqual([-2]);
    expect(history.flush()).toBe(1);
    expect(history.adapter.getState()).toEqual(baseState);
    expect(history.routerPop).not.toHaveBeenCalled();
    expect(oldDismiss).not.toHaveBeenCalled();
    expect(history.back()).toBe(0);
    expect(history.routerPop).toHaveBeenCalledOnce();
    expect(history.routerPop).toHaveBeenCalledWith(outside, { idx: 0, key: "outside" });
  });

  it.each([
    { href: studio.replace("draw", "3d"), updates: {} },
    { href: studio + "#later", updates: {} },
    { href: studio, updates: { key: "next-router-entry" } },
    { href: studio, updates: { __studioMobileBackSession: "unowned" } },
    { href: studio, updates: { __studioMobileBackDepth: 2 } },
  ])("주소·라우터 키·세션·깊이가 다르면 가드 되감기를 요청하지 않는다 ($href $updates)", ({ href, updates }) => {
    const history = setupHistory();
    const old = history.mount();
    old.syncLayers([{ id: "sheet:props", dismiss: vi.fn() }]);
    old.dispose();
    history.replace(href, updates);
    const current = history.mount();
    current.syncLayers([]);
    expect(history.queued).toEqual([]);
    expect(history.back()).toBe(0);
    expect(history.routerPop).toHaveBeenCalledWith(studio, baseState);
  });

  it("StrictMode 재설정처럼 동일한 소유자는 깊이를 유지하고 최신 닫기 함수만 사용한다", () => {
    const history = setupHistory();
    const owner = {};
    const oldDismiss = vi.fn();
    const currentDismiss = vi.fn();
    const old = history.mount(owner);
    old.syncLayers([{ id: "sheet:props", dismiss: oldDismiss }]);
    old.dispose();

    const current = history.mount(owner);
    current.syncLayers([{ id: "sheet:props", dismiss: currentDismiss }]);
    expect(history.queued).toEqual([]);
    expect(history.entries).toHaveLength(3);
    expect(history.back()).toBe(1);
    current.syncLayers([]);
    expect(currentDismiss).toHaveBeenCalledOnce();
    expect(oldDismiss).not.toHaveBeenCalled();
    expect(history.back()).toBe(0);
    expect(history.routerPop).toHaveBeenCalledWith(outside, { idx: 0, key: "outside" });
  });

  it("이전 소유자의 비동기 부분 되감기가 끝나면 남은 가드만 정리하고 새 가드를 한 번 추가한다", () => {
    const history = setupHistory();
    const oldDismiss = vi.fn();
    const currentDismiss = vi.fn();
    const old = history.mount();
    const oldBottom = { id: "sheet:props", dismiss: oldDismiss };
    old.syncLayers([oldBottom, { id: "modal:drawing-task:expanded-tools", dismiss: oldDismiss }]);
    old.syncLayers([oldBottom]);
    expect(history.queued).toEqual([-1]);
    old.dispose();

    const current = history.mount();
    current.syncLayers([{ id: "sheet:draw", dismiss: currentDismiss }]);
    expect(history.queued).toEqual([-1]);
    expect(history.flush()).toBe(1);
    expect(history.queued).toEqual([-1]);
    expect(history.flush()).toBe(1);
    expect(history.queued).toEqual([]);
    expect(history.entries).toHaveLength(3);
    expect(history.adapter.getState()).toMatchObject({ __studioMobileBackDepth: 1, __studioMobileBackLayer: "sheet:draw" });
    expect(oldDismiss).not.toHaveBeenCalled();
    expect(history.routerPop).not.toHaveBeenCalled();

    expect(history.back()).toBe(1);
    current.syncLayers([]);
    expect(currentDismiss).toHaveBeenCalledOnce();
    expect(history.back()).toBe(0);
    expect(history.routerPop).toHaveBeenCalledWith(outside, { idx: 0, key: "outside" });
  });

  it("예정된 가드보다 먼저 도착한 실제 라우터 pop을 통과시킨다", () => {
    const history = setupHistory();
    const old = history.mount();
    old.syncLayers([{ id: "sheet:props", dismiss: vi.fn() }]);
    old.syncLayers([]);
    old.dispose();
    history.entries[1] = { href: outside, state: { idx: 0, key: "new-router-entry" } };

    const current = history.mount();
    current.syncLayers([]);
    expect(history.flush()).toBe(0);
    expect(history.queued).toEqual([]);
    expect(history.routerPop).toHaveBeenCalledWith(outside, { idx: 0, key: "new-router-entry" });
  });
  it("이전 계정의 가드 정리 도중 새 소유자가 재설정되어도 이전 콜백이나 깊이를 가져오지 않는다", () => {
    const history = setupHistory();
    const old = history.mount();
    const oldLayer = { id: "sheet:props", dismiss: vi.fn() };
    old.syncLayers([oldLayer, { id: "modal:drawing-task:expanded-tools", dismiss: oldLayer.dismiss }]);
    old.syncLayers([oldLayer]);
    old.dispose();

    const owner = {};
    const interim = history.mount(owner);
    interim.syncLayers([]);
    interim.dispose();
    const current = history.mount(owner);
    const currentLayer = { id: "sheet:draw", dismiss: vi.fn() };
    current.syncLayers([currentLayer]);
    old.syncLayers([oldLayer]);
    expect(history.queued).toEqual([-1]);
    expect(history.flush()).toBe(1);
    expect(history.flush()).toBe(1);
    expect(history.adapter.getState()).toMatchObject({ __studioMobileBackDepth: 1, __studioMobileBackLayer: "sheet:draw" });
    expect(history.back()).toBe(1);
    current.syncLayers([]);
    expect(currentLayer.dismiss).toHaveBeenCalledOnce();
    expect(oldLayer.dismiss).not.toHaveBeenCalled();
    expect(history.back()).toBe(0);
  });

  it("브라우저가 원고 항목에 먼저 도착한 뒤에 소유자가 바뀌면 예정된 pop만 처리한다", () => {
    const history = setupHistory();
    const old = history.mount();
    const dismiss = vi.fn();
    old.syncLayers([{ id: "modal:drawing-task:expanded-tools", dismiss }]);
    old.syncLayers([]);
    history.landQueued();
    expect(history.adapter.getState()).toEqual(baseState);
    old.dispose();

    const current = history.mount();
    current.syncLayers([]);
    expect(history.queued).toEqual([]);
    expect(history.dispatchLanded()).toBe(1);
    expect(history.routerPop).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
    expect(history.back()).toBe(0);
  });

});
