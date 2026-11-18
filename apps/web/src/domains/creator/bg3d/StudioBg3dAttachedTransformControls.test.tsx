// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { Group, Scene } from "three";
import { describe, expect, it, vi } from "vitest";

import { StudioBg3dAttachedTransformControls } from "./StudioBg3dAttachedTransformControls";

const { readControls } = vi.hoisted(() => ({ readControls: vi.fn() }));
vi.mock("@react-three/drei", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  return {
    TransformControls: forwardRef((_props, ref) => {
      const controls = readControls();
      useImperativeHandle(ref, () => controls, [controls]);
      return null;
    }),
  };
});

function makeControls() {
  return {
    domElement: document.createElement("canvas"),
    dragging: false,
    axis: null as string | null,
    reset: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
  };
}

describe("3D 배경 기즈모의 드래그 수명", () => {
  it("도형 값이 다시 그려져도 누른 드래그를 유지하고 실제 컨트롤 교체·언마운트에서는 취소한다", () => {
    const object = new Group();
    new Scene().add(object);
    const first = makeControls();
    readControls.mockReturnValue(first);
    const cancel = vi.fn();
    const view = render(<StudioBg3dAttachedTransformControls object={object} onDragCancel={cancel} />);
    first.dragging = true;
    first.axis = "Y";
    view.rerender(<StudioBg3dAttachedTransformControls object={object} mode="rotate" onDragCancel={cancel} />);
    expect(first.dragging).toBe(true);
    expect(first.reset).not.toHaveBeenCalled();

    const next = makeControls();
    readControls.mockReturnValue(next);
    view.rerender(<StudioBg3dAttachedTransformControls object={object} mode="rotate" onDragCancel={cancel} />);
    expect(first.reset).toHaveBeenCalledOnce();
    expect(first.dragging).toBe(false);
    next.axis = "Y";
    next.dragging = true;
    view.unmount();
    expect(next.reset).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledTimes(2);
  });
});
