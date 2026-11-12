// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { bindStudioThreePointerInput } from "./studio-virtual-space-three-pointer-input";

const disposers: (() => void)[] = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); vi.restoreAllMocks(); });

function setup() {
  const surface = document.createElement("canvas");
  const captured = new Set<number>();
  const capture = vi.fn((id: number) => { captured.add(id); });
  const release = vi.fn((id: number) => { captured.delete(id); });
  Object.defineProperties(surface, {
    setPointerCapture: { value: capture }, hasPointerCapture: { value: (id: number) => captured.has(id) }, releasePointerCapture: { value: release },
  });
  const onOrbitDelta = vi.fn(), onTap = vi.fn();
  const input = bindStudioThreePointerInput(surface, { onOrbitDelta, onTap });
  disposers.push(input.dispose);
  const pointer = (type: string, values: Partial<Record<"pointerId" | "button" | "buttons" | "clientX" | "clientY", number>> = {}) => {
    const event = new Event(type);
    for (const [key, value] of Object.entries({ pointerId: 7, button: 0, buttons: 1, clientX: 100, clientY: 100, ...values })) {
      Object.defineProperty(event, key, { value });
    }
    surface.dispatchEvent(event);
  };
  return { input, pointer, onOrbitDelta, onTap, capture, release };
}

describe("3D 카메라·바닥 클릭의 포인터 수명", () => {
  it("hover는 회전하지 않고 정상 우클릭 drag만 회전하며 해제 뒤 추가 yaw나 바닥 이동을 만들지 않는다", () => {
    const { pointer, onOrbitDelta, onTap, capture, release } = setup();
    pointer("pointermove", { button: -1, buttons: 0, clientX: 80 });
    expect(onOrbitDelta).not.toHaveBeenCalled();
    pointer("pointerdown", { button: 2, buttons: 2 });
    pointer("pointermove", { button: -1, buttons: 2, clientX: 140 });
    expect(onOrbitDelta).toHaveBeenCalledExactlyOnceWith(-0.28);
    pointer("pointerup", { button: 2, buttons: 0, clientX: 140 });
    pointer("pointermove", { button: -1, buttons: 0, clientX: 200 });
    expect(onOrbitDelta).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledExactlyOnceWith(7);
    expect(release).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("왼쪽 바닥 클릭은 한 번 전달하고 drag를 시작했다 돌아온 입력은 이동 요청으로 바꾸지 않는다", () => {
    const { pointer, onOrbitDelta, onTap } = setup();
    pointer("pointerdown");
    pointer("pointerup", { buttons: 0, clientX: 102, clientY: 103 });
    expect(onTap).toHaveBeenCalledExactlyOnceWith({ clientX: 102, clientY: 103 });
    pointer("pointerdown");
    pointer("pointermove", { clientX: 130 });
    pointer("pointerup", { buttons: 0 });
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onOrbitDelta).not.toHaveBeenCalled();
  });

  it.each(["pointercancel", "lostpointercapture", "blur", "hidden", "buttons"])("%s 뒤에는 추가 회전·바닥 이동을 만들지 않는다", (reason) => {
    const { pointer, onOrbitDelta, onTap } = setup();
    const cancel = () => {
      if (reason === "blur") window.dispatchEvent(new Event("blur"));
      else if (reason === "hidden") {
        vi.spyOn(document, "hidden", "get").mockReturnValue(true);
        document.dispatchEvent(new Event("visibilitychange"));
      } else if (reason === "buttons") pointer("pointermove", { button: -1, buttons: 0 });
      else pointer(reason);
    };
    pointer("pointerdown", { button: 2, buttons: 2 });
    cancel();
    pointer("pointermove", { button: -1, buttons: 0, clientX: 180 });
    pointer("pointerup", { button: 2, buttons: 0 });
    expect(onOrbitDelta).not.toHaveBeenCalled();
    pointer("pointerdown");
    cancel();
    pointer("pointerup", { buttons: 0 });
    expect(onTap).not.toHaveBeenCalled();
  });

  it("다른 포인터는 진행 중인 drag를 바꾸거나 끝낼 수 없고 해제 후에는 새 바닥 클릭이 가능하다", () => {
    const { pointer, onOrbitDelta, onTap } = setup();
    pointer("pointerdown", { button: 2, buttons: 2 });
    pointer("pointermove", { pointerId: 8, button: -1, buttons: 2, clientX: 180 });
    pointer("pointerup", { pointerId: 8, button: 2, buttons: 0 });
    expect(onOrbitDelta).not.toHaveBeenCalled();
    pointer("pointermove", { button: -1, buttons: 2, clientX: 120 });
    expect(onOrbitDelta).toHaveBeenCalledExactlyOnceWith(-0.14);
    pointer("pointerup", { button: 2, buttons: 0, clientX: 120 });
    pointer("pointerdown");
    pointer("pointerup", { buttons: 0 });
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("dispose는 캡처와 이벤트 수명을 끝내 이후 입력을 처리하지 않는다", () => {
    const { input, pointer, onOrbitDelta, onTap, release } = setup();
    pointer("pointerdown", { button: 2, buttons: 2 });
    input.dispose();
    expect(release).toHaveBeenCalledExactlyOnceWith(7);
    pointer("pointermove", { buttons: 2, clientX: 150 });
    pointer("pointerdown");
    pointer("pointerup", { buttons: 0 });
    expect(onOrbitDelta).not.toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();
  });
});
