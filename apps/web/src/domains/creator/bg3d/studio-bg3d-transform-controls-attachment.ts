import { Scene, type Object3D } from "three";

import type { TransformControls } from "three-stdlib";

/** ref 등록을 기다리는 동안 장면에서 제거된 객체를 gizmo가 계속 읽지 않게 한다. */
export function watchStudioBg3dTransformControlsAttachment(
  controls: Pick<TransformControls, "attach" | "detach">,
  target: Object3D,
): () => void {
  let observed: Object3D[] = [];
  let detached = false;
  let active = true;

  const stopObserving = () => {
    for (const object of observed) {
      object.removeEventListener("removed", onRemoved);
      object.removeEventListener("added", onAdded);
    }
    observed = [];
  };
  const observeAncestors = () => {
    stopObserving();
    let object: Object3D | null = target;
    let inScene = false;
    while (object) {
      observed.push(object);
      if (object instanceof Scene) { inScene = true; break; }
      object = object.parent;
    }
    for (const ancestor of observed) {
      ancestor.addEventListener("removed", onRemoved);
      ancestor.addEventListener("added", onAdded);
    }
    return inScene;
  };
  function onRemoved() {
    if (!active) return;
    controls.detach();
    detached = true;
  }
  function onAdded() {
    if (!active) return;
    if (observeAncestors() && detached) {
      controls.attach(target);
      detached = false;
    }
  }

  // Drei의 child layout effect가 먼저 attach한 뒤, 이미 제거된 초기 대상도 거부한다.
  if (!observeAncestors()) onRemoved();
  return () => {
    active = false;
    stopObserving();
  };
}

export interface StudioBg3dInterruptibleTransformControls {
  dragging: boolean;
  axis: string | null;
  domElement?: HTMLElement;
  reset: () => unknown;
  onPointerMove?: (event: PointerEvent) => void;
}

export interface StudioBg3dTransformControlsInterruptionHandlers {
  readonly onBeforeCancel?: () => void;
  readonly onDragCancel?: () => void;
}

/**
 * three-stdlib TransformControls는 ownerDocument에 pointerup만 등록하고 pointercancel,
 * lostpointercapture, 탭 비활성화(visibilitychange), 창 blur를 처리하지 않는다.
 * 조작 중 인터럽트가 발생하면 커밋 전 시작 위치로 reset한 뒤 드래그 고착을 즉시 해제한다.
 */
export function watchStudioBg3dTransformControlsInterruption(
  controls: StudioBg3dInterruptibleTransformControls,
  handlers: StudioBg3dTransformControlsInterruptionHandlers = {},
): () => void {
  const domElement = controls.domElement;
  const ownerDocument = domElement?.ownerDocument ?? (typeof document !== "undefined" ? document : null);
  const ownerWindow = ownerDocument?.defaultView ?? (typeof window !== "undefined" ? window : null);
  let activePointerId: number | null = null;
  let requireButtons = false;

  const cancelActiveDrag = (): boolean => {
    if (!controls.dragging) {
      activePointerId = null;
      requireButtons = false;
      return false;
    }
    handlers.onBeforeCancel?.();
    controls.reset();
    if (domElement) {
      domElement.style.touchAction = "";
      if (controls.onPointerMove && ownerDocument) {
        ownerDocument.removeEventListener("pointermove", controls.onPointerMove);
      }
    }
    controls.dragging = false;
    controls.axis = null;
    activePointerId = null;
    requireButtons = false;
    handlers.onDragCancel?.();
    return true;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    activePointerId = event.pointerId;
    requireButtons = event.buttons > 0;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (activePointerId === null || event.pointerId === activePointerId) {
      activePointerId = null;
      requireButtons = false;
    }
  };
  const onPointerCancel = (event: PointerEvent) => {
    if (activePointerId === null || event.pointerId === activePointerId) {
      cancelActiveDrag();
    }
  };
  const onPointerMoveGuard = (event: PointerEvent) => {
    if (!controls.dragging) return;
    if (activePointerId !== null && event.pointerId !== activePointerId) return;
    if (requireButtons && event.buttons === 0) {
      cancelActiveDrag();
    }
  };
  const onWindowBlur = () => {
    cancelActiveDrag();
  };
  const onVisibilityChange = () => {
    if (ownerDocument?.visibilityState === "hidden") {
      cancelActiveDrag();
    }
  };

  domElement?.addEventListener("pointerdown", onPointerDown, true);
  domElement?.addEventListener("lostpointercapture", onPointerCancel);
  ownerDocument?.addEventListener("pointerup", onPointerUp);
  ownerDocument?.addEventListener("pointercancel", onPointerCancel);
  ownerDocument?.addEventListener("pointermove", onPointerMoveGuard, true);
  ownerDocument?.addEventListener("visibilitychange", onVisibilityChange);
  ownerWindow?.addEventListener("blur", onWindowBlur);

  return () => {
    domElement?.removeEventListener("pointerdown", onPointerDown, true);
    domElement?.removeEventListener("lostpointercapture", onPointerCancel);
    ownerDocument?.removeEventListener("pointerup", onPointerUp);
    ownerDocument?.removeEventListener("pointercancel", onPointerCancel);
    ownerDocument?.removeEventListener("pointermove", onPointerMoveGuard, true);
    ownerDocument?.removeEventListener("visibilitychange", onVisibilityChange);
    ownerWindow?.removeEventListener("blur", onWindowBlur);
    cancelActiveDrag();
  };
}
