interface StudioThreePointerGesture {
  readonly id: number;
  readonly button: 0 | 2;
  readonly x: number;
  readonly y: number;
  lastX: number;
  dragged: boolean;
}

/** 카메라 회전과 바닥 클릭을 한 포인터의 수명 안에서만 처리하고 취소 뒤 이동 요청을 만들지 않는다. */
export function bindStudioThreePointerInput(surface: HTMLCanvasElement, callbacks: {
  readonly onOrbitDelta: (radians: number) => void;
  readonly onTap: (point: Pick<PointerEvent, "clientX" | "clientY">) => void;
}): { readonly dispose: () => void } {
  let gesture: StudioThreePointerGesture | null = null;
  const reset = () => {
    const previous = gesture;
    gesture = null;
    if (previous && surface.hasPointerCapture?.(previous.id)) {
      try { surface.releasePointerCapture(previous.id); } catch { /* 이미 끝난 포인터 캡처는 해제할 수 없다. */ }
    }
  };
  const down = (event: PointerEvent) => {
    if (gesture || (event.button !== 0 && event.button !== 2)) return;
    gesture = { id: event.pointerId, button: event.button, x: event.clientX, y: event.clientY, lastX: event.clientX, dragged: false };
    try { surface.setPointerCapture?.(event.pointerId); } catch { /* 캡처 불가 환경도 buttons·취소 경계로 보호한다. */ }
  };
  const move = (event: PointerEvent) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const heldButton = gesture.button === 2 ? 2 : 1;
    if ((event.buttons & heldButton) === 0) { reset(); return; }
    if (gesture.button === 2) callbacks.onOrbitDelta(-(event.clientX - gesture.lastX) * 0.007);
    gesture.lastX = event.clientX;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) gesture.dragged = true;
  };
  const up = (event: PointerEvent) => {
    if (!gesture || gesture.id !== event.pointerId || gesture.button !== event.button) return;
    const tap = gesture.button === 0 && !gesture.dragged && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= 8;
    reset();
    if (tap) callbacks.onTap({ clientX: event.clientX, clientY: event.clientY });
  };
  const cancel = (event: PointerEvent) => { if (gesture?.id === event.pointerId) reset(); };
  const hidden = () => { if (document.hidden) reset(); };
  surface.addEventListener("pointerdown", down);
  surface.addEventListener("pointermove", move);
  surface.addEventListener("pointerup", up);
  surface.addEventListener("pointercancel", cancel);
  surface.addEventListener("lostpointercapture", cancel);
  window.addEventListener("blur", reset);
  document.addEventListener("visibilitychange", hidden);
  return { dispose() {
    reset();
    surface.removeEventListener("pointerdown", down);
    surface.removeEventListener("pointermove", move);
    surface.removeEventListener("pointerup", up);
    surface.removeEventListener("pointercancel", cancel);
    surface.removeEventListener("lostpointercapture", cancel);
    window.removeEventListener("blur", reset);
    document.removeEventListener("visibilitychange", hidden);
  } };
}
