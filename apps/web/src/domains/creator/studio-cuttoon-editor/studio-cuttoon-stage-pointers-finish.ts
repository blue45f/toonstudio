/* Extracted stage pointer handlers from StudioCuttoonEditor.
 * Closures keep the original editor typing envelope via an `any` host bag. */
"use no memo";
// React Compiler 옵트아웃: 가변 호스트 백(h) 을 렌더마다 재대입해 공유하는 추출 패턴이라,
// 컴파일러가 h 참조 동일성만 보고 JSX/계산을 캐시하면 첫 렌더에서 UI 가 영구 동결된다
// (탭 전환 등 커밋된 상태 변경이 화면에 반영되지 않음).

import {
  cancelStudioNodeEditPointer,
  ownsStudioNodeEditPointer,
} from "../vector/studio-node-edit-pointer-session";
import { requireStudioDrawingPointerTransport } from "../brush/studio-drawing-pointer-transport";
import { endStudioAdvancedFillTap } from "../studio-advanced-fill-tap";
import { colorDropGestureView, endColorDropSession } from "../studio-colordrop-gesture";
import { isStudioLiquifyPointerOwner } from "../studio-liquify-pointer";
import { shouldCommitStudioStrokeOnPointerCancel } from "../canvas/studio-pointer-input";
import type { StudioKonvaEventLike } from "../canvas/studio-stage-handle-types";
import { planStudioStrokeCancelOrAbortRecovery } from "./studio-cuttoon-stroke-interruption-guard";
import { createStudioCuttoonStagePointerFinishHandler } from "./studio-cuttoon-stage-pointers-finish-handler";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";
import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";

export function bindStudioCuttoonStagePointersFinish(
  h: StudioCuttoonStagePointersHost,
  api: StudioCuttoonStagePointersApi,
) {
  const {
    advancedFillTapGestureRef,
    advancedFillColorDropRef,
    setAdvancedFillColorDropView,
    cancelAdvancedFillColorDropPreview,
    advancedFillTapPayloadRef,
    advancedFillTouchPanRef,
    bubbleShapeDragRef,
    bubbleShapeRafRef,
    cancelCanvasSelectionResize,
    discardDrawingPointerSession,
    drawingLastAuthoritativePointerRef,
    drawingPointerTransportRef,
    drawingRef,
    finishLiquifyPointerSession,
    finishPendingRasterRetouchGesture,
    finishPixelSelectionPointerSession,
    groupResizeRef,
    liquifyDragRef,
    liquifyHandledNativeEndEventsRef,
    pendingBubbleShapeDraftRef,
    pendingRasterRetouchGestureRef,
    pixelDragRef,
    pixelSelectionHandledNativeEndEventsRef,
    releaseBubbleShapePointerCapture,
    setBubbleShapeDraft,
  } = h;
  const cancelCanvasGroupDrag: StudioCuttoonStagePointersApi["cancelCanvasGroupDrag"] = () =>
    api.cancelCanvasGroupDrag();
  const hideBrushCursor: StudioCuttoonStagePointersApi["hideBrushCursor"] = (deferToFrame) =>
    api.hideBrushCursor(deferToFrame);
  const finishDrawingPointer = createStudioCuttoonStagePointerFinishHandler(h, api);

  function onStagePointerCancel(e: StudioKonvaEventLike<MouseEvent | TouchEvent>) {
    const pointerEvent = e.evt as PointerEvent;
    if (h.nodeEditDragRef.current) {
      if (ownsStudioNodeEditPointer(h.nodeEditDragRef.current, pointerEvent)) {
        cancelStudioNodeEditPointer(h);
      }
      return;
    }

    // 펜 드로잉 진행 중 보조 손바닥 터치(palm touch)나 외래 포인터가 취소될 때는
    // 현재 그리는 펜의 브러시 커서를 숨기거나 획을 중단시키지 않고 즉시 격리한다.
    const drawingPointerSession =
      requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession();
    if (drawingRef.current || drawingPointerSession) {
      const recovery = planStudioStrokeCancelOrAbortRecovery({
        activeSession: drawingPointerSession,
        activeDrawing: drawingRef.current,
        cancelPointer: pointerEvent,
        lastAuthoritativePointer: drawingLastAuthoritativePointerRef?.current,
      });
      if (
        recovery.action === "ignore-palm-touch"
        || recovery.action === "ignore-foreign-pointer"
      ) {
        return;
      }
      hideBrushCursor();
      if (requireStudioDrawingPointerTransport(drawingPointerTransportRef).consumeHandledNativeEnd(pointerEvent)) {
        return;
      }
      if (
        recovery.action === "salvage-commit"
        || (
          drawingPointerSession
          && shouldCommitStudioStrokeOnPointerCancel(drawingPointerSession, pointerEvent)
        )
      ) {
        const releasePointer =
          recovery.action === "salvage-commit" ? recovery.fallbackPointer : pointerEvent;
        finishDrawingPointer(e.target.getStage(), releasePointer, { consumeReleaseSample: false });
      } else {
        discardDrawingPointerSession();
      }
      return;
    }

    hideBrushCursor();
    if (groupResizeRef.current) {
      cancelCanvasSelectionResize();
      return;
    }
    if (liquifyHandledNativeEndEventsRef.current.delete(pointerEvent)) return;
    if (pixelSelectionHandledNativeEndEventsRef.current.delete(pointerEvent)) return;
    if (requireStudioDrawingPointerTransport(drawingPointerTransportRef).consumeHandledNativeEnd(pointerEvent)) return;
    if (pendingRasterRetouchGestureRef.current) {
      if (!finishPendingRasterRetouchGesture(pointerEvent, true, e.target.getStage())) return;
      return;
    }
    const pointerId = Number.isFinite(pointerEvent.pointerId) ? pointerEvent.pointerId : 1;
    if (liquifyDragRef.current) {
      if (!isStudioLiquifyPointerOwner(liquifyDragRef.current, pointerEvent)) return;
      finishLiquifyPointerSession(pointerEvent, true, e.target.getStage());
      return;
    }
    if (pixelDragRef.current) {
      if (!finishPixelSelectionPointerSession(pointerEvent, true)) return;
      return;
    }
    if (bubbleShapeDragRef.current) {
      if (bubbleShapeDragRef.current.pointerId !== pointerId) return;
      releaseBubbleShapePointerCapture(bubbleShapeDragRef.current);
      bubbleShapeDragRef.current = null;
      pendingBubbleShapeDraftRef.current = null;
      if (bubbleShapeRafRef.current !== null) {
        globalThis.cancelAnimationFrame(bubbleShapeRafRef.current);
        bubbleShapeRafRef.current = null;
      }
      setBubbleShapeDraft(null);
      return;
    }
    const current = advancedFillTapGestureRef.current;
    if (current) {
      const outcome = endStudioAdvancedFillTap(current, pointerId, true);
      advancedFillTapGestureRef.current = outcome.gesture;
      if (advancedFillTouchPanRef.current?.pointerId === pointerId) {
        advancedFillTouchPanRef.current = null;
      }
      if (!outcome.gesture) advancedFillTapPayloadRef.current = null;
      if (advancedFillColorDropRef.current) {
        const dropEnd = endColorDropSession(advancedFillColorDropRef.current, pointerId, true);
        advancedFillColorDropRef.current = dropEnd.session;
        setAdvancedFillColorDropView(colorDropGestureView(dropEnd.session));
        if (dropEnd.outcome.type === "restore") {
          cancelAdvancedFillColorDropPreview();
        }
      }
      return;
    }
    if (cancelCanvasGroupDrag()) return;
  }
  api.finishDrawingPointer = finishDrawingPointer;
  api.onStagePointerCancel = onStagePointerCancel;
}
