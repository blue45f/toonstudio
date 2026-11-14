// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  bindStudioSpaceTextEntryMovementStop,
  isStudioSpaceJoystickActive,
  isStudioSpaceTextEntryTarget,
} from "./studio-virtual-space-input-guard";
import { bindStudioThreePointerInput } from "./three/studio-virtual-space-three-pointer-input";

describe("가상 스튜디오 이동 입력·채팅 포커스·카메라 회전 충돌 방지", () => {
  it("채팅 입력·검색창·contenteditable 포커스 진입 시 이동 정지 콜백을 즉시 호출한다", () => {
    const halt = vi.fn();
    const unbind = bindStudioSpaceTextEntryMovementStop(halt, window);
    const chatInput = document.createElement("input");
    chatInput.type = "text";
    chatInput.setAttribute("aria-label", "채팅 입력");
    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    document.body.append(chatInput, actionBtn);

    expect(isStudioSpaceTextEntryTarget(chatInput)).toBe(true);
    expect(isStudioSpaceTextEntryTarget(actionBtn)).toBe(false);

    actionBtn.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(halt).not.toHaveBeenCalled();

    chatInput.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(halt).toHaveBeenCalledTimes(1);

    unbind();
    chatInput.remove();
    actionBtn.remove();
  });

  it("조이스틱 미세 노이즈는 무시하고 실제 이동 벡터일 때만 활성으로 판정한다", () => {
    expect(isStudioSpaceJoystickActive({ x: 0, y: 0 })).toBe(false);
    expect(isStudioSpaceJoystickActive({ x: 0.01, y: -0.01 })).toBe(false);
    expect(isStudioSpaceJoystickActive({ x: 0.35, y: 0 })).toBe(true);
  });

  it("3D 포인터 입력은 이동 조이스틱·키보드가 활성일 때 카메라 오빗 회전을 막아 충돌을 방지한다", () => {
    const canvas = document.createElement("canvas");
    let joystickMoving = true;
    const onOrbitDelta = vi.fn();
    const onTap = vi.fn();
    const binding = bindStudioThreePointerInput(canvas, {
      onOrbitDelta,
      onTap,
      canOrbit: () => !joystickMoving,
    });

    canvas.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, button: 0, pointerType: "touch", clientX: 100, clientY: 100 }));
    canvas.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, button: 0, pointerType: "touch", clientX: 145, clientY: 100 }));
    canvas.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, button: 0, pointerType: "touch", clientX: 145, clientY: 100 }));
    expect(onOrbitDelta).not.toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();

    joystickMoving = false;
    canvas.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 2, button: 0, pointerType: "touch", clientX: 100, clientY: 100 }));
    canvas.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, button: 0, pointerType: "touch", clientX: 140, clientY: 100 }));
    canvas.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2, button: 0, pointerType: "touch", clientX: 140, clientY: 100 }));
    expect(onOrbitDelta).toHaveBeenCalled();

    binding.dispose();
  });
});
