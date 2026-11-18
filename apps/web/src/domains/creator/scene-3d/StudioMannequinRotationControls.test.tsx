// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioMannequinJointSection } from "./StudioMannequinProSections";
import { StudioMannequinRotationControls } from "./StudioMannequinRotationControls";

afterEach(cleanup);

describe("선택 관절 네이티브 회전 조작", () => {
  it("네 방향 클릭이 기존 회전 명령과 수정키를 전달한다", () => {
    const onRotate = vi.fn();
    render(<StudioMannequinRotationControls disabled={false} onRotate={onRotate} />);
    for (const [label, key] of [["위", "ArrowUp"], ["아래", "ArrowDown"], ["왼쪽", "ArrowLeft"], ["오른쪽", "ArrowRight"]]) {
      fireEvent.click(screen.getByRole("button", { name: `선택 관절 ${label} 회전` }), { shiftKey: true, altKey: true });
      expect(onRotate).toHaveBeenLastCalledWith({ key, shiftKey: true, altKey: true, repeat: false });
    }
    expect(onRotate).toHaveBeenCalledTimes(4);
  });

  it("방향키·Shift·Alt와 반복 키 상태를 전달하고 스크롤을 막는다", () => {
    const onRotate = vi.fn();
    render(<StudioMannequinRotationControls disabled={false} onRotate={onRotate} />);
    const button = screen.getByRole("button", { name: "선택 관절 위 회전" });
    const event = new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, altKey: true, repeat: true, bubbles: true, cancelable: true });
    fireEvent(button, event);
    expect(onRotate).toHaveBeenCalledWith(expect.objectContaining({ key: "ArrowLeft", shiftKey: true, altKey: true, repeat: true }));
    expect(event.defaultPrevented).toBe(true);
    fireEvent.keyDown(button, { key: "Tab" });
    expect(onRotate).toHaveBeenCalledTimes(1);
  });

  it("잠근 관절의 세 축 슬라이더는 키보드 포커스를 받지 않고 잠금을 풀면 회전할 수 있다", () => {
    const props = { selectedJointId: "leftUpperArm", rotation: [0, 0, 0],
      onSelectJoint: vi.fn(), onRotate: vi.fn(), onResetJoint: vi.fn() } as const;
    const view = render(<StudioMannequinJointSection {...props} jointLocks={{ leftUpperArm: true }} />);
    const sliders = screen.getAllByRole("slider", { name: /^[XYZ] 회전/ });
    expect(sliders).toHaveLength(3);
    for (const slider of sliders) {
      expect(slider.matches(":disabled")).toBe(true);
      slider.focus();
      expect(document.activeElement).not.toBe(slider);
    }
    view.rerender(<StudioMannequinJointSection {...props} />);
    fireEvent.change(sliders[0], { target: { value: "15" } });
    expect(props.onRotate).toHaveBeenCalledOnce();
  });

  it.each(["관절 미선택", "관절 잠금"])("%s 상태에서는 클릭·방향키 모두 포즈를 바꾸지 않는다", () => {
    const onRotate = vi.fn();
    render(<StudioMannequinRotationControls disabled onRotate={onRotate} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button.hasAttribute("disabled")).toBe(true);
      fireEvent.click(button);
      fireEvent.keyDown(button, { key: "ArrowDown" });
    }
    expect(onRotate).not.toHaveBeenCalled();
  });
});
