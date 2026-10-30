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
