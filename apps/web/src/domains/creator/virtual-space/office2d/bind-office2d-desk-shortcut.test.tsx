// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSpaceShortcuts } from "../hud/use-space-shortcuts";
import { bindOffice2dDeskShortcut } from "./bind-office2d-desk-shortcut";

const disposers: Array<() => void> = [];

afterEach(() => {
  cleanup();
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

function createCanvas() {
  const canvas = document.createElement("canvas");
  canvas.tabIndex = 0;
  document.body.append(canvas);
  return canvas;
}

function mountHud() {
  const handlers = {
    onEmote: vi.fn(), onToggleMap: vi.fn(), onTogglePeople: vi.fn(), onHelp: vi.fn(),
    onEscape: () => false, onDesk: vi.fn(),
  };
  renderHook(() => useSpaceShortcuts(handlers));
  return handlers;
}

function press(target: EventTarget, overrides: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "h", code: "KeyH", bubbles: true, cancelable: true, ...overrides,
  });
  target.dispatchEvent(event);
  return event;
}

describe("기본 2D 지정석 단축키 소유권", () => {
  for (const hudFirst of [true, false]) {
    it(`HUD를 ${hudFirst ? "먼저" : "나중에"} 등록해도 캔버스의 H는 월드만 한 번 실행한다`, () => {
      const canvas = createCanvas();
      const worldDesk = vi.fn();
      const hud = hudFirst ? mountHud() : null;
      disposers.push(bindOffice2dDeskShortcut(canvas, worldDesk));
      const actualHud = hud ?? mountHud();
      canvas.focus();
      const event = press(canvas, { key: "ㅗ" });
      expect(worldDesk).toHaveBeenCalledOnce();
      expect(actualHud.onDesk).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    });
  }

  it("입력창의 H는 입력에 남기고 캔버스 밖 HUD의 H는 기존 HUD 동작을 따른다", () => {
    const canvas = createCanvas();
    const worldDesk = vi.fn();
    disposers.push(bindOffice2dDeskShortcut(canvas, worldDesk));
    const hud = mountHud();
    const input = document.createElement("input");
    const button = document.createElement("button");
    document.body.append(input, button);
    input.focus();
    expect(press(input).defaultPrevented).toBe(false);
    expect(worldDesk).not.toHaveBeenCalled();
    expect(hud.onDesk).not.toHaveBeenCalled();
    button.focus();
    expect(press(button).defaultPrevented).toBe(true);
    expect(hud.onDesk).toHaveBeenCalledOnce();
    expect(worldDesk).not.toHaveBeenCalled();
  });

  it.each([
    { repeat: true }, { isComposing: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true },
  ])("반복·IME·보조키는 처리하지 않는다: %j", (overrides) => {
    const canvas = createCanvas();
    const worldDesk = vi.fn();
    disposers.push(bindOffice2dDeskShortcut(canvas, worldDesk));
    const hud = mountHud();
    canvas.focus();
    expect(press(canvas, overrides).defaultPrevented).toBe(false);
    expect(worldDesk).not.toHaveBeenCalled();
    expect(hud.onDesk).not.toHaveBeenCalled();
  });

  it("앞서 처리된 H와 포커스를 잃은 캔버스는 지정석을 실행하지 않는다", () => {
    const canvas = createCanvas();
    const worldDesk = vi.fn();
    disposers.push(bindOffice2dDeskShortcut(canvas, worldDesk));
    const hud = mountHud();
    canvas.focus();
    const handled = new KeyboardEvent("keydown", { key: "h", code: "KeyH", bubbles: true, cancelable: true });
    handled.preventDefault();
    canvas.dispatchEvent(handled);
    expect(worldDesk).not.toHaveBeenCalled();
    expect(hud.onDesk).not.toHaveBeenCalled();
    canvas.blur();
    press(canvas);
    expect(worldDesk).not.toHaveBeenCalled();
  });

  it("다른 단축키를 가로채지 않고 해제 뒤에는 HUD의 H를 보존한다", () => {
    const canvas = createCanvas();
    const worldDesk = vi.fn();
    const dispose = bindOffice2dDeskShortcut(canvas, worldDesk);
    disposers.push(dispose);
    const hud = mountHud();
    canvas.focus();
    press(canvas, { key: "m", code: "KeyM" });
    expect(worldDesk).not.toHaveBeenCalled();
    expect(hud.onToggleMap).toHaveBeenCalledOnce();
    dispose(); dispose();
    press(canvas);
    expect(worldDesk).not.toHaveBeenCalled();
    expect(hud.onDesk).toHaveBeenCalledOnce();
  });
});
