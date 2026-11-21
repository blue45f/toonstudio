interface StudioThreePointerGesture {
  readonly id: number;
  readonly button: 0 | 2;
  readonly pointerType: string;
  readonly x: number;
  readonly y: number;
  lastX: number;
  lastY: number;
  dragged: boolean;
}

interface TouchPoint {
  x: number;
  y: number;
}

/**
 * 카메라 회전(우클릭·터치 단일 손가락 드래그), 바닥 클릭 이동(탭), 모바일 2손가락 핀치 줌을
 * 포인터 수명 경계 안에서 안전하게 처리한다.
 */
export function bindStudioThreePointerInput(surface: HTMLCanvasElement, callbacks: {
  readonly onOrbitDelta: (radians: number) => void;
  readonly onPitchDelta?: (radians: number) => void;
  readonly onPinchZoomDelta?: (zoomDelta: number) => void;
  readonly onTap: (point: Pick<PointerEvent, "clientX" | "clientY">) => void;
  readonly canOrbit?: () => boolean;
}): { readonly dispose: () => void } {
  let gesture: StudioThreePointerGesture | null = null;
  const activeTouches = new Map<number, TouchPoint>();
  let lastPinchDistance: number | null = null;
  let hadPinchGesture = false;

  const currentPinchDistance = (): number | null => {
    if (activeTouches.size < 2) return null;
    const points = [...activeTouches.values()];
    const a = points[0];
    const b = points[1];
    if (!a || !b) return null;
    return Math.hypot(b.x - a.x, b.y - a.y);
  };

  const reset = () => {
    const previous = gesture;
    gesture = null;
    activeTouches.clear();
    lastPinchDistance = null;
    hadPinchGesture = false;
    if (previous && surface.hasPointerCapture?.(previous.id)) {
      try { surface.releasePointerCapture(previous.id); } catch { /* 이미 끝난 포인터 캡처는 해제할 수 없다. */ }
    }
  };

  const down = (event: PointerEvent) => {
    const pointerType = event.pointerType || "mouse";
    if (pointerType === "touch") {
      activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activeTouches.size >= 2) {
        hadPinchGesture = true;
        if (gesture) gesture.dragged = true;
        lastPinchDistance = currentPinchDistance();
        return;
      }
    }
    if (gesture || (event.button !== 0 && event.button !== 2)) return;
    gesture = {
      id: event.pointerId,
      button: event.button,
      pointerType,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      dragged: false,
    };
    try { surface.setPointerCapture?.(event.pointerId); } catch { /* 캡처 불가 환경도 buttons·취소 경계로 보호한다. */ }
  };

  const move = (event: PointerEvent) => {
    const pointerType = event.pointerType || "mouse";
    if (pointerType === "touch" && activeTouches.has(event.pointerId)) {
      activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activeTouches.size >= 2) {
        const nextDist = currentPinchDistance();
        if (nextDist !== null && lastPinchDistance !== null && Math.abs(nextDist - lastPinchDistance) >= 2) {
          callbacks.onPinchZoomDelta?.((nextDist - lastPinchDistance) * 0.004);
          lastPinchDistance = nextDist;
        }
        return;
      }
    }

    if (!gesture || gesture.id !== event.pointerId) return;
    if (gesture.pointerType !== "touch") {
      const heldButton = gesture.button === 2 ? 2 : 1;
      if ((event.buttons & heldButton) === 0) { reset(); return; }
    }
    const movedTotal = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
    if (movedTotal > 8) gesture.dragged = true;
    const orbitAllowed = callbacks.canOrbit ? callbacks.canOrbit() : true;
    if (orbitAllowed && !hadPinchGesture && (gesture.button === 2 || (gesture.pointerType === "touch" && gesture.dragged))) {
      callbacks.onOrbitDelta(-(event.clientX - gesture.lastX) * 0.007);
      const dy = event.clientY - gesture.lastY;
      if (dy !== 0) callbacks.onPitchDelta?.(dy * 0.005);
    }
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
  };

  const up = (event: PointerEvent) => {
    if ((event.pointerType || "mouse") === "touch") {
      activeTouches.delete(event.pointerId);
      if (activeTouches.size < 2) lastPinchDistance = null;
      if (activeTouches.size > 0 && gesture?.id !== event.pointerId) return;
    }
    if (!gesture || gesture.id !== event.pointerId || gesture.button !== event.button) return;
    const tap = !hadPinchGesture && gesture.button === 0 && !gesture.dragged
      && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= 8;
    reset();
    if (tap) callbacks.onTap({ clientX: event.clientX, clientY: event.clientY });
  };

  const cancel = (event: PointerEvent) => {
    if (activeTouches.has(event.pointerId)) {
      activeTouches.delete(event.pointerId);
      lastPinchDistance = null;
    }
    if (gesture?.id === event.pointerId) reset();
  };
  const hidden = () => { if (document.hidden) reset(); };

  surface.addEventListener("pointerdown", down);
  surface.addEventListener("pointermove", move);
  surface.addEventListener("pointerup", up);
  surface.addEventListener("pointercancel", cancel);
  surface.addEventListener("lostpointercapture", cancel);
  window.addEventListener("blur", reset);
  document.addEventListener("visibilitychange", hidden);

  return {
    dispose() {
      reset();
      surface.removeEventListener("pointerdown", down);
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerup", up);
      surface.removeEventListener("pointercancel", cancel);
      surface.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", hidden);
    },
  };
}
