// @vitest-environment jsdom

import { Group, PerspectiveCamera, Scene } from "three";
import { TransformControls } from "three-stdlib";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  watchStudioBg3dTransformControlsAttachment,
  watchStudioBg3dTransformControlsInterruption,
  type StudioBg3dInterruptibleTransformControls,
} from "./studio-bg3d-transform-controls-attachment";

const disposals: (() => void)[] = [];
afterEach(() => {
  disposals.splice(0).reverse().forEach((dispose) => dispose());
  vi.restoreAllMocks();
});

function createControls(scene: Scene, target: Group) {
  const camera = new PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(3, 3, 3);
  const controls = new TransformControls(camera, document.createElement("canvas"));
  scene.add(controls);
  controls.attach(target);
  disposals.push(() => controls.dispose());
  return controls;
}

describe("BG3D gizmo의 실제 Three 객체 연결 수명", () => {
  it("같은 선택 ID의 primitive→model→Undo→Redo에서 passive ref 갱신 전에도 제거 대상을 읽지 않는다", () => {
    const scene = new Scene();
    const primitive = new Group();
    const model = new Group();
    primitive.userData.studioBg3dEntityId = model.userData.studioBg3dEntityId = "same-id";
    scene.add(primitive);
    const controls = createControls(scene, primitive);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let stop = watchStudioBg3dTransformControlsAttachment(controls, primitive);
    for (const [before, after] of [[primitive, model], [model, primitive], [primitive, model]] as const) {
      scene.remove(before);
      expect(controls.visible).toBe(false);
      controls.updateMatrixWorld();
      scene.add(after);
      stop();
      controls.attach(after);
      stop = watchStudioBg3dTransformControlsAttachment(controls, after);
      controls.updateMatrixWorld();
      expect(controls.visible).toBe(true);
    }
    stop();
    expect(error).not.toHaveBeenCalled();
  });

  it("선택 객체의 부모 subtree가 빠져도 즉시 분리하고 같은 객체가 재부착되면 복구한다", () => {
    const scene = new Scene();
    const parent = new Group();
    const target = new Group();
    parent.add(target);
    scene.add(parent);
    const controls = createControls(scene, target);
    const stop = watchStudioBg3dTransformControlsAttachment(controls, target);
    disposals.push(stop);
    scene.remove(parent);
    expect(target.parent).toBe(parent);
    expect(controls.visible).toBe(false);
    const nextParent = new Group();
    nextParent.add(parent);
    expect(controls.visible).toBe(false);
    scene.add(nextParent);
    expect(controls.visible).toBe(true);
    scene.remove(nextParent);
    expect(controls.visible).toBe(false);
  });

  it("이미 제거된 이전 ref가 attach된 초기 layout에도 오류 없이 분리한다", () => {
    const scene = new Scene();
    const target = new Group();
    const controls = createControls(scene, target);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const stop = watchStudioBg3dTransformControlsAttachment(controls, target);
    disposals.push(stop);
    controls.updateMatrixWorld();
    expect(controls.visible).toBe(false);
    expect(error).not.toHaveBeenCalled();
    scene.add(target);
    expect(controls.visible).toBe(true);
  });

  it("이전 감시 정리 뒤 늦게 오는 제거 이벤트가 새 target의 gizmo를 끊지 않는다", () => {
    const scene = new Scene();
    const before = new Group();
    const after = new Group();
    scene.add(before, after);
    const controls = createControls(scene, before);
    const stopBefore = watchStudioBg3dTransformControlsAttachment(controls, before);
    stopBefore();
    controls.attach(after);
    const stopAfter = watchStudioBg3dTransformControlsAttachment(controls, after);
    disposals.push(stopAfter);
    scene.remove(before);
    expect(controls.visible).toBe(true);
    scene.remove(after);
    expect(controls.visible).toBe(false);
    stopAfter();
    scene.add(after);
    expect(controls.visible).toBe(false);
  });

  it("gizmo 드래그 중 pointercancel·탭 비활성화·버튼 해제 이동이 오면 시작 위치로 reset하고 고착을 해제한다", () => {
    const scene = new Scene();
    const target = new Group();
    target.position.set(2, 0.5, -1);
    scene.add(target);
    const controls = createControls(scene, target);
    const onBeforeCancel = vi.fn();
    const onDragCancel = vi.fn();
    const stop = watchStudioBg3dTransformControlsInterruption(
      controls as unknown as StudioBg3dInterruptibleTransformControls,
      { onBeforeCancel, onDragCancel },
    );
    disposals.push(stop);

    const internal = controls as unknown as {
      dragging: boolean;
      axis: string | null;
      positionStart: typeof target.position;
      quaternionStart: typeof target.quaternion;
      scaleStart: typeof target.scale;
      domElement: HTMLElement;
      onPointerMove: (event: PointerEvent) => void;
    };

    const simulateActiveGizmoDrag = (pointerId: number) => {
      internal.domElement.dispatchEvent(
        new PointerEvent("pointerdown", { pointerId, button: 0, buttons: 1, bubbles: true }),
      );
      internal.positionStart.copy(target.position);
      internal.quaternionStart.copy(target.quaternion);
      internal.scaleStart.copy(target.scale);
      internal.axis = "X";
      internal.dragging = true;
      internal.domElement.ownerDocument.addEventListener("pointermove", internal.onPointerMove);
      target.position.set(9, 0.5, -1);
    };

    // 1) pointercancel → 시작 위치(2, 0.5, -1) 복원 및 dragging=false
    simulateActiveGizmoDrag(31);
    expect(target.position.x).toBe(9);
    document.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 31, bubbles: true }));
    expect(internal.dragging).toBe(false);
    expect(internal.axis).toBeNull();
    expect(target.position.x).toBe(2);
    expect(onBeforeCancel).toHaveBeenCalledTimes(1);
    expect(onDragCancel).toHaveBeenCalledTimes(1);

    // 2) 탭 비활성화(visibilitychange -> hidden) → 시작 위치 복원 및 dragging=false
    simulateActiveGizmoDrag(32);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(internal.dragging).toBe(false);
    expect(target.position.x).toBe(2);
    expect(onDragCancel).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    // 3) 버튼 해제 상태(buttons === 0) pointermove 유입 시 즉시 취소 및 고착 방지
    simulateActiveGizmoDrag(33);
    document.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 33, buttons: 0, clientX: 220, clientY: 140, bubbles: true }),
    );
    expect(internal.dragging).toBe(false);
    expect(target.position.x).toBe(2);
    expect(onDragCancel).toHaveBeenCalledTimes(3);
  });
});
