// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { useState, type RefObject } from "react";
import { Group, PerspectiveCamera, Scene } from "three";
import { TransformControls as ThreeTransformControls } from "three-stdlib";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dAttachedTransformControls } from "./StudioBg3dAttachedTransformControls";

import type { Object3D } from "three";

const renderer = vi.hoisted(() => ({ controls: null as ThreeTransformControls | null }));

// R3F의 렌더러만 대체한다. 드래그·picker·reset·DOM 이벤트는 배포된 Three controls를 쓴다.
vi.mock("@react-three/drei", async () => {
  const { forwardRef, useImperativeHandle, useLayoutEffect } = await import("react");
  const { Object3D } = await import("three");
  return {
    TransformControls: forwardRef<ThreeTransformControls, {
      object: Object3D | RefObject<Object3D>;
      onMouseDown?: (event: { type: string }) => void;
    }>(function Controls({ object, onMouseDown }, ref) {
      const controls = renderer.controls;
      if (!controls) throw new Error("Three controls fixture가 없습니다.");
      useImperativeHandle(ref, () => controls, [controls]);
      useLayoutEffect(() => {
        controls.attach(object instanceof Object3D ? object : object.current);
        return () => { controls.detach(); };
      }, [controls, object]);
      useLayoutEffect(() => {
        const listener = () => onMouseDown?.({ type: "mouseDown" });
        // three-stdlib의 선언은 런타임 custom event를 Object3DEventMap에 추가하지 않는다.
        const events = controls as unknown as {
          addEventListener: (type: "mouseDown", listener: () => void) => void;
          removeEventListener: (type: "mouseDown", listener: () => void) => void;
        };
        events.addEventListener("mouseDown", listener);
        return () => { events.removeEventListener("mouseDown", listener); };
      }, [controls, onMouseDown]);
      return null;
    }),
  };
});

const disposals: (() => void)[] = [];
afterEach(() => {
  cleanup();
  disposals.splice(0).reverse().forEach((dispose) => dispose());
  renderer.controls = null;
  vi.restoreAllMocks();
});

function fixture() {
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(316, 221, 698, 743));
  const camera = new PerspectiveCamera(50, 698 / 743, 0.1, 100);
  camera.position.set(4, 3, 6);
  camera.lookAt(0, 0.6, 0);
  camera.updateMatrixWorld();
  const scene = new Scene();
  const target = new Group();
  target.position.set(0, 0.5, 0);
  scene.add(target);
  const controls = new ThreeTransformControls(camera, canvas);
  controls.setMode("rotate");
  controls.setSpace("local");
  scene.add(controls);
  renderer.controls = controls;
  const state = controls as unknown as { dragging: boolean; axis: string | null };
  const reset = vi.spyOn(controls, "reset");
  disposals.push(() => { controls.dispose(); canvas.remove(); });
  const start = () => {
    scene.updateMatrixWorld(true);
    act(() => {
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        pointerId: 71, pointerType: "mouse", button: 0, buttons: 1,
        clientX: 316 + 431, clientY: 221 + 404, bubbles: true,
      }));
    });
  };
  const move = () => {
    act(() => {
      document.dispatchEvent(new PointerEvent("pointermove", {
        pointerId: 71, pointerType: "mouse", button: -1, buttons: 1,
        clientX: 316 + 349, clientY: 221 + 418, bubbles: true,
      }));
    });
  };
  return { canvas, scene, target, controls, state, reset, start, move };
}

describe("BG3D controls의 React 구독 수명", () => {
  it("실제 Y 링 pointer-down의 부모 상태 갱신과 다음 재렌더가 드래그를 취소하지 않는다", () => {
    const f = fixture();
    const cancelled = vi.fn();
    function Host({ label }: { label: string }) {
      const [revision, setRevision] = useState(0);
      return <>
        <output>{label}:{revision}</output>
        <StudioBg3dAttachedTransformControls object={f.target}
          onMouseDown={() => setRevision((value) => value + 1)} onDragCancel={cancelled} />
      </>;
    }
    const view = render(<Host label="before" />);
    f.start();
    expect(view.getByText("before:1")).toBeTruthy();
    expect(f.state.axis).toBe("Y");
    expect(f.state.dragging).toBe(true);
    view.rerender(<Host label="after" />);
    expect(f.state.dragging).toBe(true);
    f.move();
    expect(Math.abs(f.target.rotation.y * 180 / Math.PI)).toBeGreaterThan(10);
    expect(f.reset).not.toHaveBeenCalled();
    expect(cancelled).not.toHaveBeenCalled();
  });

  it.each(["pointercancel", "lostpointercapture", "blur", "hidden"] as const)(
    "%s는 정상 재렌더 뒤에도 원래 자세로 취소하고 최신 콜백을 사용한다", (eventType) => {
      const f = fixture();
      const previous = vi.fn();
      const latest = vi.fn();
      const before = vi.fn();
      const view = render(<StudioBg3dAttachedTransformControls object={f.target}
        onDragCancel={previous} />);
      f.start();
      f.move();
      expect(Math.abs(f.target.rotation.y)).toBeGreaterThan(0.1);
      view.rerender(<StudioBg3dAttachedTransformControls object={f.target}
        onBeforeDragCancel={before} onDragCancel={latest} />);
      expect(f.state.dragging).toBe(true);
      act(() => {
        if (eventType === "blur") window.dispatchEvent(new Event("blur"));
        else if (eventType === "hidden") {
          const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
          document.dispatchEvent(new Event("visibilitychange"));
          visibility.mockRestore();
        } else {
          (eventType === "pointercancel" ? document : f.canvas)
            .dispatchEvent(new PointerEvent(eventType, { pointerId: 71, bubbles: true }));
        }
      });
      expect(f.state.dragging).toBe(false);
      expect(f.state.axis).toBeNull();
      expect(f.target.rotation.toArray().slice(0, 3).map((value) => Math.abs(Number(value))))
        .toEqual([0, 0, 0]);
      expect(f.reset).toHaveBeenCalledTimes(1);
      expect(before).toHaveBeenCalledTimes(1);
      expect(latest).toHaveBeenCalledTimes(1);
      expect(previous).not.toHaveBeenCalled();
    },
  );

  it("controls 교체는 이전 드래그만 취소하고 새 인스턴스에 이벤트를 연결한다", () => {
    const old = fixture();
    const cancelled = vi.fn();
    const view = render(<StudioBg3dAttachedTransformControls object={old.target} onDragCancel={cancelled} />);
    old.start();
    old.move();
    const next = fixture();
    view.rerender(<StudioBg3dAttachedTransformControls object={next.target} onDragCancel={cancelled} />);
    expect(old.state.dragging).toBe(false);
    expect(old.target.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(old.reset).toHaveBeenCalledTimes(1);
    expect(cancelled).toHaveBeenCalledTimes(1);
    next.start();
    expect(next.state.dragging).toBe(true);
    act(() => { next.canvas.dispatchEvent(new PointerEvent("lostpointercapture", { pointerId: 71 })); });
    expect(next.state.dragging).toBe(false);
    expect(next.reset).toHaveBeenCalledTimes(1);
    expect(cancelled).toHaveBeenCalledTimes(2);
  });

  it("같은 controls의 object 교체는 이전 대상부터 복원하고 새 대상에 drag/reset을 넘기지 않는다", () => {
    const f = fixture();
    const cancelled = vi.fn();
    const view = render(<StudioBg3dAttachedTransformControls object={f.target} onDragCancel={cancelled} />);
    f.start();
    f.move();
    expect(Math.abs(f.target.rotation.y)).toBeGreaterThan(0.1);
    const next = new Group();
    next.position.set(2, 1, -1);
    next.rotation.set(0.2, 0.3, 0.4);
    f.scene.add(next);
    const nextPose = { position: next.position.toArray(), quaternion: next.quaternion.toArray() };
    view.rerender(<StudioBg3dAttachedTransformControls object={next} onDragCancel={cancelled} />);
    expect(f.state.dragging).toBe(false);
    expect(f.target.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(f.reset).toHaveBeenCalledTimes(1);
    expect(cancelled).toHaveBeenCalledTimes(1);
    f.move();
    expect({ position: next.position.toArray(), quaternion: next.quaternion.toArray() }).toEqual(nextPose);
  });

  it("unmount는 활성 드래그를 취소하고 이후 전역 이벤트 구독을 남기지 않는다", () => {
    const f = fixture();
    const cancelled = vi.fn();
    const view = render(<StudioBg3dAttachedTransformControls object={f.target} onDragCancel={cancelled} />);
    f.start();
    f.move();
    view.unmount();
    expect(f.state.dragging).toBe(false);
    expect(f.target.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(f.reset).toHaveBeenCalledTimes(1);
    expect(cancelled).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new Event("blur")); });
    expect(cancelled).toHaveBeenCalledTimes(1);
  });
});
