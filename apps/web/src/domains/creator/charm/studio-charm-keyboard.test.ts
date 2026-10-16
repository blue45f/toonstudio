import { describe, expect, it } from "vitest";

import { resolveStudioCharmKeyIntent, type StudioCharmKeyEvent } from "./studio-charm-keyboard";

function key(name: string, extra: Partial<StudioCharmKeyEvent> = {}): StudioCharmKeyEvent {
  return { key: name, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...extra };
}

const middle = { index: 2, count: 5, editing: false } as const;

describe("참 바 키보드 의도", () => {
  it("네 방향 화살표는 이전/다음 칩으로 이동하고 양 끝에서 순환한다", () => {
    expect(resolveStudioCharmKeyIntent(key("ArrowRight"), middle)).toEqual({ type: "focus", index: 3 });
    expect(resolveStudioCharmKeyIntent(key("ArrowDown"), middle)).toEqual({ type: "focus", index: 3 });
    expect(resolveStudioCharmKeyIntent(key("ArrowLeft"), middle)).toEqual({ type: "focus", index: 1 });
    expect(resolveStudioCharmKeyIntent(key("ArrowUp"), middle)).toEqual({ type: "focus", index: 1 });
    expect(resolveStudioCharmKeyIntent(key("ArrowRight"), { index: 4, count: 5, editing: false })).toEqual({ type: "focus", index: 0 });
    expect(resolveStudioCharmKeyIntent(key("ArrowLeft"), { index: 0, count: 5, editing: false })).toEqual({ type: "focus", index: 4 });
  });

  it("Home/End 는 처음과 마지막 칩이다", () => {
    expect(resolveStudioCharmKeyIntent(key("Home"), middle)).toEqual({ type: "focus", index: 0 });
    expect(resolveStudioCharmKeyIntent(key("End"), middle)).toEqual({ type: "focus", index: 4 });
  });

  it("Enter 와 Space 는 한 번만 붙이고, 키를 누르고 있으면 삼킨다", () => {
    expect(resolveStudioCharmKeyIntent(key("Enter"), middle)).toEqual({ type: "activate" });
    expect(resolveStudioCharmKeyIntent(key(" "), middle)).toEqual({ type: "activate" });
    expect(resolveStudioCharmKeyIntent(key("Enter", { repeat: true }), middle)).toEqual({ type: "swallow" });
    expect(resolveStudioCharmKeyIntent(key(" ", { repeat: true }), middle)).toEqual({ type: "swallow" });
  });

  it("Alt+방향키는 순서를 바꾸고 양 끝에서는 기본 동작만 막는다", () => {
    expect(resolveStudioCharmKeyIntent(key("ArrowRight", { altKey: true }), middle)).toEqual({ type: "reorder", delta: 1 });
    expect(resolveStudioCharmKeyIntent(key("ArrowUp", { altKey: true }), middle)).toEqual({ type: "reorder", delta: -1 });
    expect(resolveStudioCharmKeyIntent(key("ArrowLeft", { altKey: true }), { index: 0, count: 5, editing: false })).toEqual({ type: "swallow" });
    expect(resolveStudioCharmKeyIntent(key("ArrowDown", { altKey: true }), { index: 4, count: 5, editing: false })).toEqual({ type: "swallow" });
  });

  it("Delete 는 빼기, Esc 는 편집 모드에서만 편집 끝내기다", () => {
    expect(resolveStudioCharmKeyIntent(key("Delete"), middle)).toEqual({ type: "unpin" });
    expect(resolveStudioCharmKeyIntent(key("Delete", { repeat: true }), middle)).toEqual({ type: "swallow" });
    expect(resolveStudioCharmKeyIntent(key("Escape"), middle)).toEqual({ type: "ignore" });
    expect(resolveStudioCharmKeyIntent(key("Escape"), { ...middle, editing: true })).toEqual({ type: "exit-edit" });
  });

  it("Ctrl/Meta 조합, IME 조합 중, 칩이 없을 때, 관계없는 키는 무시한다", () => {
    expect(resolveStudioCharmKeyIntent(key("ArrowRight", { ctrlKey: true }), middle)).toEqual({ type: "ignore" });
    expect(resolveStudioCharmKeyIntent(key("Enter", { metaKey: true }), middle)).toEqual({ type: "ignore" });
    expect(resolveStudioCharmKeyIntent(key("Enter", { isComposing: true }), middle)).toEqual({ type: "ignore" });
    expect(resolveStudioCharmKeyIntent(key("ArrowRight"), { index: 0, count: 0, editing: false })).toEqual({ type: "ignore" });
    expect(resolveStudioCharmKeyIntent(key("a"), middle)).toEqual({ type: "ignore" });
    expect(resolveStudioCharmKeyIntent(key("ArrowRight", { shiftKey: true }), middle)).toEqual({ type: "ignore" });
    expect(resolveStudioCharmKeyIntent(key("Home", { altKey: true }), middle)).toEqual({ type: "ignore" });
  });
});
