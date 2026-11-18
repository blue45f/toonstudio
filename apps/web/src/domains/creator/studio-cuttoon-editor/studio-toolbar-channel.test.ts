// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cancelPendingStudioAllTools, requestStudioAllTools, subscribeStudioAllTools } from "../studio-toolbar-channel";

function editor(parent: HTMLElement = document.body) {
  const scope = parent.appendChild(document.createElement("section"));
  scope.dataset.studioEditor = "true";
  const button = scope.appendChild(document.createElement("button"));
  return { scope, button };
}

afterEach(() => {
  document.querySelectorAll<HTMLElement>("[data-studio-editor]").forEach(cancelPendingStudioAllTools);
  document.body.replaceChildren();
});

it("느린 레일은 가장 최근에 누른 전체 도구를 한 번 열고 재구독으로 다시 열지 않는다", () => {
  const { scope, button } = editor();
  const second = scope.appendChild(document.createElement("button"));
  requestStudioAllTools(button);
  requestStudioAllTools(second);
  requestStudioAllTools(second);
  const open = vi.fn(), stop = subscribeStudioAllTools(scope, open);
  expect(open).toHaveBeenCalledExactlyOnceWith(second);
  stop();
  subscribeStudioAllTools(scope, open);
  expect(open).toHaveBeenCalledTimes(1);
});

it("준비된 레일은 즉시 열고 같은 원고에 겹친 구독이나 상위 원고에는 요청을 넘기지 않는다", () => {
  const outer = editor(), inner = editor(outer.scope);
  const parent = vi.fn(), first = vi.fn(), second = vi.fn();
  subscribeStudioAllTools(outer.scope, parent);
  subscribeStudioAllTools(inner.scope, first);
  subscribeStudioAllTools(inner.scope, second);
  requestStudioAllTools(inner.button);
  expect(first).toHaveBeenCalledExactlyOnceWith(inner.button);
  expect(second).not.toHaveBeenCalled();
  expect(parent).not.toHaveBeenCalled();
});

it.each(["Escape", "다른 버튼", "원고 변경", "트리거 제거", "원고 닫기"])(
  "%s 뒤 옛 레일이 준비되어도 도구창을 열지 않는다", (change) => {
    const previous = editor(), next = editor();
    requestStudioAllTools(previous.button);
    if (change === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    if (change === "다른 버튼") next.button.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    if (change === "원고 변경") cancelPendingStudioAllTools(previous.scope);
    if (change === "트리거 제거") previous.button.remove();
    if (change === "원고 닫기") previous.scope.remove();
    const open = vi.fn();
    subscribeStudioAllTools(next.scope, open);
    subscribeStudioAllTools(previous.scope, open);
    expect(open).not.toHaveBeenCalled();
  },
);

it("다른 원고의 레일이 먼저 준비되어도 최초 요청은 같은 원고에만 전달한다", () => {
  const previous = editor(), next = editor();
  requestStudioAllTools(previous.button);
  const openPrevious = vi.fn(), openNext = vi.fn();
  subscribeStudioAllTools(next.scope, openNext);
  expect(openNext).not.toHaveBeenCalled();
  subscribeStudioAllTools(previous.scope, openPrevious);
  expect(openPrevious).toHaveBeenCalledExactlyOnceWith(previous.button);
});
