import { events, type RootStore } from "@react-three/fiber";

import { createStudioHybridDccClickPrecisionTracker } from "./studio-hybrid-dcc-pointer-precision";

/** Root마다 추적기를 분리하며, 기존 R3F 선택·전파·capture·Orbit 처리는 그대로 사용한다. */
export function createStudioHybridDccViewportPointerEvents(store: RootStore): ReturnType<typeof events> {
  const original = events(store);
  const tracker = createStudioHybridDccClickPrecisionTracker();
  let replayDepth = 0;
  const handlers: typeof original.handlers = original.handlers ? {
    ...original.handlers,
    onPointerCancel(event) { tracker.reset(); original.handlers?.onPointerCancel(event); },
    onPointerLeave(event) { tracker.reset(); original.handlers?.onPointerLeave(event); },
  } : undefined;
  return {
    ...original,
    handlers,
    compute(event, state, previous) {
      if (replayDepth > 0) { original.compute?.(event, state, previous); return; }
      const precise = tracker.sample({
        type: event.type, trusted: event.isTrusted, target: event.target,
        pointerId: "pointerId" in event && typeof event.pointerId === "number" ? event.pointerId : null,
        pointerType: "pointerType" in event && typeof event.pointerType === "string" ? event.pointerType : null,
        primary: "isPrimary" in event && event.isPrimary === true,
        button: event.button, buttons: event.buttons, detail: event.detail, timeStamp: event.timeStamp,
        offsetX: event.offsetX, offsetY: event.offsetY, clientX: event.clientX, clientY: event.clientY,
      }, { canvas: state.gl.domElement, camera: state.camera, ...state.size,
        cameraWorld: state.camera.matrixWorld.elements, cameraProjection: state.camera.projectionMatrix.elements });
      if (precise) {
        state.pointer.set(precise.offsetX / state.size.width * 2 - 1, -(precise.offsetY / state.size.height) * 2 + 1);
        state.raycaster.setFromCamera(state.pointer, state.camera);
      } else original.compute?.(event, state, previous);
    },
    // update는 마지막 native event를 pointermove로 재생하므로 새 gesture로 수집하지 않는다.
    update() {
      replayDepth++;
      try { original.update?.(); }
      finally { replayDepth--; }
    },
    disconnect() { tracker.reset(); original.disconnect?.(); },
  };
}
