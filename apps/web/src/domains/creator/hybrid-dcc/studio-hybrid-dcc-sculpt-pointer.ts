/** DOM/Three 없는 포인터 소유권. 정상 종료를 먼저 표시한 뒤 자신의 capture만 해제한다. */
import type { StudioMeshVec3 } from "../studio-editable-half-edge-mesh";
import type { StudioSculptCancelReason, StudioSculptGestureController, StudioSculptGestureToken } from "./studio-hybrid-dcc-sculpt-gesture";

export interface StudioSculptPointerCapture {
  setPointerCapture(pointerId: number): void;
  releasePointerCapture(pointerId: number): void;
  hasPointerCapture(pointerId: number): boolean;
}
interface ActivePointer {
  readonly token: StudioSculptGestureToken;
  readonly controller: StudioSculptGestureController;
  readonly pointerId: number;
  readonly startedAt: number;
  readonly capture: StudioSculptPointerCapture;
}
export function createStudioSculptPointerAdapter(onActiveChange: (active: boolean) => void) {
  let active: ActivePointer | null = null;
  let terminalInProgress = false;
  function release(pointer: ActivePointer) {
    try { if (pointer.capture.hasPointerCapture(pointer.pointerId)) pointer.capture.releasePointerCapture(pointer.pointerId); }
    catch (error) {
      // 브라우저가 이미 잃은 capture만 정상 종료로 처리한다. 다른 API 실패는 숨기지 않는다.
      if (typeof DOMException === "undefined" || !(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
    }
  }
  function terminal(pointer: ActivePointer, reason?: StudioSculptCancelReason) {
    if (active !== pointer) return false;
    active = null;
    terminalInProgress = true;
    try {
      try { if (reason) pointer.controller.cancel(pointer.token, reason); else pointer.controller.end(pointer.token); }
      finally { try { release(pointer); } finally { onActiveChange(false); } }
    } finally { terminalInProgress = false; }
    return true;
  }
  const matches = (pointerId: number, timeStamp: number) => active?.pointerId === pointerId
    && Number.isFinite(timeStamp) && timeStamp >= active.startedAt;
  function reconcile() {
    if (active && !active.controller.isCurrent(active.token)) terminal(active, "scope-changed");
  }
  return {
    begin(controller: StudioSculptGestureController, input: { readonly assetId: string; readonly pointerId: number; readonly localPoint: StudioMeshVec3 }, capture: StudioSculptPointerCapture, timeStamp: number): boolean {
      // 종료 콜백·capture 해제·상태 통지의 재진입이 다음 소유자를 만들지 않는다.
      if (active || terminalInProgress || !Number.isFinite(timeStamp)) return false;
      const token = controller.begin(input);
      if (!token) return false;
      const pointer: ActivePointer = { token, controller, pointerId: input.pointerId, capture, startedAt: timeStamp };
      active = pointer;
      try { capture.setPointerCapture(input.pointerId); }
      catch { terminal(pointer, "capture-failed"); return false; }
      if (active === pointer) onActiveChange(true);
      return active === pointer;
    },
    sample(pointerId: number, timeStamp: number, point: StudioMeshVec3): boolean {
      reconcile();
      const pointer = active;
      if (!pointer || !matches(pointerId, timeStamp)) return false;
      pointer.controller.sample(pointer.token, point); return true;
    },
    end(pointerId: number, timeStamp: number): boolean {
      reconcile();
      return active && matches(pointerId, timeStamp) ? terminal(active) : false;
    },
    cancel(reason: StudioSculptCancelReason, pointerId?: number, timeStamp?: number): boolean {
      if (!active || (pointerId !== undefined && !matches(pointerId, timeStamp ?? active.startedAt))) return false;
      return terminal(active, reason);
    },
    lostCapture(pointerId: number, timeStamp: number): boolean {
      // 정상 release의 늦은 lost 이벤트가 새 capture를 취소하지 않는다.
      if (!active || !matches(pointerId, timeStamp) || active.capture.hasPointerCapture(pointerId)) return false;
      return terminal(active, "lostpointercapture");
    },
    deferLostCapture(pointerId: number, timeStamp: number, hasNativeCapture: () => boolean): (() => void) | null {
      if (!active || !matches(pointerId, timeStamp)) return null;
      const pointer = active;
      // R3F는 native lost를 up보다 먼저 받을 수 있다. 뒤 frame에도 같은 소유자인 경우만 취소한다.
      return () => { if (active === pointer && !hasNativeCapture()) terminal(pointer, "lostpointercapture"); };
    },
    currentToken: () => active?.token ?? null,
    isActive: () => active !== null,
    reconcile,
  };
}
