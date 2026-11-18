// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { bindStudioThreeKeyboardInput } from "./studio-virtual-space-three-keyboard-input";

describe("3D 무대 조작키", () => {
  it("C·Home은 시점 복귀를 한 번 실행하고 시스템 단축키·반복 E·패널 입력은 무시한다", () => {
    const stage = document.createElement("div");
    const canvas = document.createElement("canvas");
    canvas.tabIndex = 0;
    stage.appendChild(canvas);
    document.body.appendChild(stage);
    const keys = new Set<string>();
    const controls = { home: vi.fn(), interact: vi.fn(), stop: vi.fn(() => keys.clear()) };
    const unbind = bindStudioThreeKeyboardInput(stage, keys, controls);
    const key = (code: string, init?: KeyboardEventInit) => canvas.dispatchEvent(
      new KeyboardEvent("keydown", { code, key: code === "Home" ? "Home" : code.slice(3), bubbles: true, cancelable: true, ...init }),
    );
    try {
      canvas.focus();
      key("KeyC"); key("Home"); key("KeyC", { metaKey: true }); key("KeyC", { ctrlKey: true }); key("KeyC", { repeat: true });
      expect(controls.home).toHaveBeenCalledTimes(2);
      key("KeyE"); key("KeyE", { repeat: true }); key("KeyE", { isComposing: true }); key("KeyX", { ctrlKey: true });
      expect(controls.interact).toHaveBeenCalledTimes(1);
      key("KeyW", { metaKey: true });
      expect(keys.has("KeyW")).toBe(false);
      expect(key("ArrowUp")).toBe(false);
      expect(keys.has("ArrowUp")).toBe(true);
      const field = document.createElement("input");
      stage.appendChild(field);
      field.focus();
      key("KeyC");
      expect(controls.home).toHaveBeenCalledTimes(2);
      expect(keys.size).toBe(0);
    } finally {
      unbind();
      stage.remove();
    }
  });
});
