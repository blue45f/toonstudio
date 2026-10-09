// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bindStudioCanvasInput, type StudioCanvasInputOptions } from "./studio-virtual-space-phaser-canvas-input";

interface Harness {
  readonly canvas: HTMLCanvasElement;
  readonly keyboard: { enabled: boolean };
  readonly heldKeys: Set<string>;
  readonly options: StudioCanvasInputOptions;
  readonly reducedMotion: { addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
  readonly state: { ready: boolean; blocked: boolean };
  readonly dispose: () => void;
}

const harnesses: Harness[] = [];

function bind(): Harness {
  const canvas = document.createElement("canvas");
  canvas.tabIndex = 0;
  document.body.append(canvas);
  const keyboard = { enabled: false };
  const heldKeys = new Set<string>();
  const reducedMotion = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const state = { ready: true, blocked: false };
  const options: StudioCanvasInputOptions = {
    canvas,
    keyboard: () => keyboard,
    heldKeys,
    reducedMotion,
    isSceneReady: () => state.ready,
    isInputBlocked: () => state.blocked,
    focusCanvas: vi.fn(() => canvas.focus()),
    stopMovement: vi.fn(),
    onEscape: vi.fn(),
    onInteractKey: vi.fn(),
    onGhostToggle: vi.fn(),
    onHidden: vi.fn(),
    onReducedMotionChange: vi.fn(),
    onModalBlockerChange: vi.fn(),
  };
  const harness: Harness = { canvas, keyboard, heldKeys, options, reducedMotion, state, dispose: bindStudioCanvasInput(options) };
  harnesses.push(harness);
  return harness;
}

function press(target: EventTarget, code: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { code, key: init.key ?? code, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  (document.activeElement as HTMLElement | null)?.blur();
});

afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.dispose();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("월드 캔버스의 키 입력", () => {
  it("이동 키는 눌린 키 집합에 들어가고 브라우저 스크롤이 막히며, 떼면 빠진다", () => {
    const { canvas, heldKeys } = bind();
    const event = press(canvas, "KeyD");
    expect(heldKeys.has("KeyD")).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    globalThis.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD" }));
    expect(heldKeys.has("KeyD")).toBe(false);
  });

  it("월드 키가 아니면 건드리지 않는다", () => {
    const { canvas, heldKeys } = bind();
    const event = press(canvas, "KeyQ");
    expect(heldKeys.size).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it("입력이 막혔거나 조합 입력·수정 키가 눌렸으면 무시한다", () => {
    const { canvas, heldKeys, state } = bind();
    state.blocked = true;
    expect(press(canvas, "KeyD").defaultPrevented).toBe(false);
    state.blocked = false;
    expect(press(canvas, "KeyD", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press(canvas, "KeyD", { metaKey: true }).defaultPrevented).toBe(false);
    expect(press(canvas, "KeyD", { altKey: true }).defaultPrevented).toBe(false);
    expect(press(canvas, "KeyD", { isComposing: true }).defaultPrevented).toBe(false);
    expect(heldKeys.size).toBe(0);
  });

  it("Escape는 입력이 막힌 상태에서도 onEscape를 부른다", () => {
    const { canvas, state, options } = bind();
    state.blocked = true;
    press(canvas, "Escape", { key: "Escape" });
    expect(options.onEscape).toHaveBeenCalledOnce();
  });

  it("상호작용 키와 고스트 키는 처음 누를 때만 콜백을 부르고 자동 반복은 무시한다", () => {
    const { canvas, heldKeys, options } = bind();
    press(canvas, "KeyX");
    press(canvas, "KeyX", { repeat: true });
    press(canvas, "KeyG");
    press(canvas, "KeyG", { repeat: true });
    expect(options.onInteractKey).toHaveBeenCalledOnce();
    expect(options.onGhostToggle).toHaveBeenCalledOnce();
    expect([...heldKeys].sort()).toEqual(["KeyG", "KeyX"]);
  });

  it("캔버스가 아닌 요소에서 온 키는 캔버스 처리기가 받지 않는다", () => {
    const { heldKeys } = bind();
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    const event = press(button, "KeyD");
    expect(heldKeys.size).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("초점을 잃은 월드의 이동 키 복구", () => {
  it("아무 요소에도 초점이 없을 때 이동 키를 누르면 초점을 되찾고 그 키를 바로 받는다", () => {
    const { canvas, heldKeys, options } = bind();
    expect(document.activeElement).toBe(document.body);
    const event = press(document.body, "KeyD");
    expect(options.focusCanvas).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(canvas);
    expect(heldKeys.has("KeyD")).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it("방향키도 같은 방식으로 되찾는다", () => {
    const { heldKeys, options } = bind();
    press(document.body, "ArrowLeft");
    expect(options.focusCanvas).toHaveBeenCalledOnce();
    expect(heldKeys.has("ArrowLeft")).toBe(true);
  });

  it("입력 칸에 초점이 있거나 이동 키가 아니거나 장면이 준비되지 않았거나 입력이 막혔으면 되찾지 않는다", () => {
    const { heldKeys, options, state } = bind();
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    press(input, "KeyD");
    input.blur();
    press(document.body, "KeyX");
    state.ready = false;
    press(document.body, "KeyD");
    state.ready = true;
    state.blocked = true;
    press(document.body, "KeyD");
    expect(options.focusCanvas).not.toHaveBeenCalled();
    expect(heldKeys.size).toBe(0);
  });

  it("다른 처리기가 이미 막은 키(기본 동작이 취소된 키)는 다시 받지 않는다", () => {
    const consume = (event: KeyboardEvent) => event.preventDefault();
    globalThis.addEventListener("keydown", consume, true);
    const { heldKeys, options } = bind();
    press(document.body, "KeyD");
    globalThis.removeEventListener("keydown", consume, true);
    expect(options.focusCanvas).not.toHaveBeenCalled();
    expect(heldKeys.size).toBe(0);
  });
});

describe("월드 캔버스의 초점·가시성·모달 감시", () => {
  it("초점이 캔버스에 있으면 Phaser 키보드를 켜고, 다른 요소로 가면 끄고 이동을 멈춘다", () => {
    const { canvas, keyboard, options } = bind();
    // jsdom은 focus()가 실제로 초점을 옮길 때 focusin을 스스로 낸다.
    canvas.focus();
    expect(keyboard.enabled).toBe(true);
    expect(options.stopMovement).not.toHaveBeenCalled();
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    expect(keyboard.enabled).toBe(false);
    expect(options.stopMovement).toHaveBeenCalledOnce();
  });

  it("상호작용 안내 버튼으로 초점이 가도 이동은 멈추지 않는다", () => {
    const { options } = bind();
    const prompt = document.createElement("button");
    prompt.dataset.interactPrompt = "true";
    document.body.append(prompt);
    prompt.focus();
    expect(document.activeElement).toBe(prompt);
    expect(options.stopMovement).not.toHaveBeenCalled();
  });

  it("탭이 숨겨지면 onHidden을, 창이 초점을 잃으면 이동 정지를 부른다", () => {
    const { options } = bind();
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(options.onHidden).not.toHaveBeenCalled();
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(options.onHidden).toHaveBeenCalledOnce();
    globalThis.dispatchEvent(new Event("blur"));
    expect(options.stopMovement).toHaveBeenCalledOnce();
  });

  it("모션 줄이기 변경 감시를 등록하고 해제 때 같은 함수로 뗀다", () => {
    const { reducedMotion, options, dispose } = bind();
    expect(reducedMotion.addEventListener).toHaveBeenCalledWith("change", options.onReducedMotionChange);
    dispose();
    expect(reducedMotion.removeEventListener).toHaveBeenCalledWith("change", options.onReducedMotionChange);
  });

  it("모달이 열리고 닫히면 입력 차단 여부를 다시 읽어 알린다", async () => {
    const { options } = bind();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.append(dialog);
    await vi.waitFor(() => expect(options.onModalBlockerChange).toHaveBeenLastCalledWith(true));
    dialog.remove();
    await vi.waitFor(() => expect(options.onModalBlockerChange).toHaveBeenLastCalledWith(false));
  });

  it("해제하면 모든 연결이 끊긴다", async () => {
    const { canvas, heldKeys, options, dispose } = bind();
    dispose();
    expect(press(canvas, "KeyD").defaultPrevented).toBe(false);
    press(document.body, "KeyD");
    globalThis.dispatchEvent(new Event("blur"));
    document.body.append(document.createElement("button"));
    document.querySelector("button")?.focus();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.append(dialog);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(heldKeys.size).toBe(0);
    expect(options.focusCanvas).not.toHaveBeenCalled();
    expect(options.stopMovement).not.toHaveBeenCalled();
    expect(options.onModalBlockerChange).not.toHaveBeenCalled();
  });
});
