/* Extracted stage pointer handlers from StudioCuttoonEditor.
 * Closures keep the original editor typing envelope via an `any` host bag. */
"use no memo";
// React Compiler 옵트아웃: 가변 호스트 백(h) 을 렌더마다 재대입해 공유하는 추출 패턴이라,
// 컴파일러가 h 참조 동일성만 보고 JSX/계산을 캐시하면 첫 렌더에서 UI 가 영구 동결된다
// (탭 전환 등 커밋된 상태 변경이 화면에 반영되지 않음).

import {
  cancelStudioNodeEditPointer,
  ownsStudioNodeEditPointer,
  studioNodeEditSourceMatches,
} from "../vector/studio-node-edit-pointer-session";
import { requireStudioDrawingPointerTransport } from "../brush/studio-drawing-pointer-transport";
import { moveBubbleShapePoint } from "../lettering/studio-bubble-custom-shape";
import {
  endStudioAdvancedFillTap,
  moveStudioAdvancedFillTap,
} from "../studio-advanced-fill-tap";
import { colorDropGestureView, endColorDropSession } from "../studio-colordrop-gesture";
import { endStudioLassoFillDrag } from "../studio-lasso-fill-gesture";
import { sampleStudioAutoColorStrokeSeeds } from "../studio-auto-color-hints-canvas-seed";
import { elBounds } from "../studio-element-geometry";
import {
  expandSelectionIdsToGroupUnits,
  selectionShapeForIds,
} from "../studio-group-selection";
import { uid } from "../studio-id";
import { isEffectivelyHidden, isEffectivelyLocked } from "../studio-layers";
import { isStudioLiquifyPointerOwner } from "../studio-liquify-pointer";
import { planPanelSplit } from "../studio-panel-split";
import { isStudioStrokePointerEvent } from "../canvas/studio-pointer-input";
import { selectIdsByMarquee } from "../studio-selection";
import type { El } from "../studio-element-model";
import type { StudioKonvaEventLike } from "../canvas/studio-stage-handle-types";
import { recordStudioDrawingStabilityCounts } from "./studio-cuttoon-drawing-stability-telemetry";
import {
  isolateStudioPalmTouchIfNeeded,
  shouldSalvageStudioInterruptedStroke,
} from "./studio-cuttoon-stroke-interruption-guard";
import { handleStudioStagePointerRetouchAndMaskUp } from "./studio-cuttoon-stage-pointers-up-retouch";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";
import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";

export function bindStudioCuttoonStagePointersUp(
  h: StudioCuttoonStagePointersHost,
  api: StudioCuttoonStagePointersApi,
) {
  const {
    activeGroupIdRef,
    advancedFillAbortRef,
    advancedFillTapGestureRef,
    advancedFillColorDropRef,
    setAdvancedFillColorDropView,
    runAdvancedFillColorDropCommit,
    cancelAdvancedFillColorDropPreview,
    advancedFillColorDropPreviewBusyRef,
    advancedFillLassoDragRef,
    runAdvancedFillLassoPath,
    advancedFillTapPayloadRef,
    advancedFillTouchPanRef,
    applyGroupSelectionState,
    autoColorCanvasSeedNonceRef,
    autoColorPlanImageSizeRef,
    autoColorScribbleStrokeRef,
    bubbleShapeDragRef,
    bubbleShapeRafRef,
    colorWheelTimerRef,
    commit,
    cropDragRef,
    discardDrawingPointerSession,
    drawingPointerTransportRef,
    drawingRef,
    finishLiquifyPointerSession,
    finishPendingRasterRetouchGesture,
    finishPixelSelectionPointerSession,
    getClientPointFromKonvaEvent,
    liquifyDragRef,
    liquifyHandledNativeEndEventsRef,
    marqueeStartRef,
    nodeEditDragRef,
    panelGutter,
    panelSplitDragRef,
    panelSplitLastLineRef,
    panelSplitPreview,
    patchEl,
    pendingBubbleShapeDraftRef,
    pendingMarqueeRectRef,
    pendingNodeEditDraftRef,
    pendingRasterRetouchGestureRef,
    pixelDragRef,
    pixelSelectionHandledNativeEndEventsRef,
    releaseBubbleShapePointerCapture,
    runAdvancedFillAt,
    setAutoColorCanvasSeedHit,
    setAutoColorCanvasSeedHits,
    setBubbleShapeDraft,
    setBubbleShapeSelectedPointIndex,
    setPanelSplitHint,
    setPanelSplitPreview,
    setSelectedId,
    stopQuickShapeTracking,
    activeSurfaceReviewLocked,
    advancedFillArmed,
    clearMarqueePreview,
    elementById,
    elements,
    flushCropRect,
    flushPanelSplitPreview,
    groups,
    selected,
  } = h;
  const finishDrawingPointer: StudioCuttoonStagePointersApi["finishDrawingPointer"] = (
    ...args
  ) => api.finishDrawingPointer(...args);
  const updateBrushCursor: StudioCuttoonStagePointersApi["updateBrushCursor"] = (
    ...args
  ) => api.updateBrushCursor(...args);

  function onStageUp(e: StudioKonvaEventLike<MouseEvent | TouchEvent>) {
    const pointerEvent = e.evt as PointerEvent;
    const activeDrawingSession =
      requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession();
    if (isolateStudioPalmTouchIfNeeded(activeDrawingSession, drawingRef.current, pointerEvent)) {
      return;
    }

    const scribbleStroke = autoColorScribbleStrokeRef.current;
    if (scribbleStroke) {
      autoColorScribbleStrokeRef.current = null;
      const planSize = autoColorPlanImageSizeRef.current;
      const image = selected?.type === "image" ? selected : null;
      if (planSize && image && scribbleStroke.points.length >= 4) {
        const samples = sampleStudioAutoColorStrokeSeeds({
          documentPoints: scribbleStroke.points,
          image: {
            x: image.x,
            y: image.y,
            width: image.width,
            height: image.height,
            rotation: image.rotation,
            flipped: image.flipped,
            flippedY: image.flippedY,
          },
          pixelWidth: planSize.width,
          pixelHeight: planSize.height,
        });
        const rest = samples.slice(1);
        if (rest.length > 0) {
          const hits = rest.map((sample) => {
            autoColorCanvasSeedNonceRef.current += 1;
            return {
              x: sample.x,
              y: sample.y,
              nonce: autoColorCanvasSeedNonceRef.current,
            };
          });
          setAutoColorCanvasSeedHit(null);
          setAutoColorCanvasSeedHits(hits);
        }
      }
      return;
    }
    if (liquifyHandledNativeEndEventsRef.current.delete(pointerEvent)) return;
    if (pixelSelectionHandledNativeEndEventsRef.current.delete(pointerEvent)) return;
    if (requireStudioDrawingPointerTransport(drawingPointerTransportRef).consumeHandledNativeEnd(pointerEvent)) return;
    if (pendingRasterRetouchGestureRef.current) {
      if (!finishPendingRasterRetouchGesture(pointerEvent, false, e.target.getStage())) return;
      return;
    }
    const drawingPointerSession =
      requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession();
    if (drawingRef.current || drawingPointerSession) {
      if (!drawingPointerSession) {
        if (
          pointerEvent.pointerType !== "touch"
          && shouldSalvageStudioInterruptedStroke(drawingRef.current)
        ) {
          recordStudioDrawingStabilityCounts({ interruptedStrokesSalvaged: 1 });
          finishDrawingPointer(e.target.getStage(), pointerEvent, { consumeReleaseSample: false });
          return;
        }
        discardDrawingPointerSession();
        return;
      }
      if (!isStudioStrokePointerEvent(drawingPointerSession, pointerEvent)) {
        return;
      }
      if (colorWheelTimerRef.current) {
        clearTimeout(colorWheelTimerRef.current);
        colorWheelTimerRef.current = null;
      }
      finishDrawingPointer(e.target.getStage(), pointerEvent);
      updateBrushCursor(e.target.getStage(), pointerEvent);
      return;
    }
    if (liquifyDragRef.current) {
      if (!isStudioLiquifyPointerOwner(liquifyDragRef.current, pointerEvent)) return;
      finishLiquifyPointerSession(pointerEvent, false, e.target.getStage());
      return;
    }
    if (pixelDragRef.current) {
      if (!finishPixelSelectionPointerSession(pointerEvent, false)) return;
      return;
    }
    stopQuickShapeTracking();
    if (colorWheelTimerRef.current) {
      clearTimeout(colorWheelTimerRef.current);
      colorWheelTimerRef.current = null;
    }
    if (advancedFillLassoDragRef.current) {
      const lassoPointerEvent = e.evt as PointerEvent;
      const pointerId = Number.isFinite(lassoPointerEvent.pointerId)
        ? lassoPointerEvent.pointerId
        : 1;
      const position = e.target.getStage()?.getRelativePointerPosition() ?? undefined;
      const session = advancedFillLassoDragRef.current;
      const outcome = endStudioLassoFillDrag(session.gesture, pointerId, position);
      advancedFillLassoDragRef.current = outcome.gesture
        ? { ...session, gesture: outcome.gesture }
        : null;
      if (outcome.path && !advancedFillAbortRef.current) {
        void runAdvancedFillLassoPath(outcome.path, session.frame);
      }
      return;
    }
    if (advancedFillTapGestureRef.current) {
      const tapPointerEvent = e.evt as PointerEvent;
      const pointerId = Number.isFinite(tapPointerEvent.pointerId) ? tapPointerEvent.pointerId : 1;
      const clientPoint = getClientPointFromKonvaEvent(e.evt);
      const moved = clientPoint
        ? moveStudioAdvancedFillTap(advancedFillTapGestureRef.current, pointerId, clientPoint)
        : advancedFillTapGestureRef.current;
      const outcome = endStudioAdvancedFillTap(moved, pointerId);
      advancedFillTapGestureRef.current = outcome.gesture;
      if (advancedFillTouchPanRef.current?.pointerId === pointerId) {
        advancedFillTouchPanRef.current = null;
      }
      const payload = advancedFillTapPayloadRef.current;
      if (!outcome.gesture) advancedFillTapPayloadRef.current = null;
      if (advancedFillColorDropRef.current) {
        const dropEnd = endColorDropSession(advancedFillColorDropRef.current, pointerId);
        advancedFillColorDropRef.current = dropEnd.session;
        setAdvancedFillColorDropView(colorDropGestureView(dropEnd.session));
        if (
          dropEnd.outcome.type === "commit" &&
          payload &&
          (!advancedFillAbortRef.current || advancedFillColorDropPreviewBusyRef.current)
        ) {
          void runAdvancedFillColorDropCommit(payload, dropEnd.outcome.tolerance);
          return;
        }
        if (dropEnd.outcome.type === "restore") {
          cancelAdvancedFillColorDropPreview();
        }
      }
      if (outcome.execute && payload && !advancedFillAbortRef.current) {
        void runAdvancedFillAt(payload.position, payload.frame);
      }
      return;
    }
    if (advancedFillArmed) return;
    if (cropDragRef.current) {
      cropDragRef.current = null;
      flushCropRect();
      return;
    }
    if (panelSplitDragRef.current) {
      const session = panelSplitDragRef.current;
      panelSplitDragRef.current = null;
      flushPanelSplitPreview();
      const line = panelSplitLastLineRef.current;
      const frame = elements.find((el: El) => el.id === session.targetFrameId);
      if (
        line &&
        frame &&
        frame.type === "frame" &&
        !activeSurfaceReviewLocked &&
        !isEffectivelyLocked(frame, groups)
      ) {
        const plan = planPanelSplit({ frame, line, gutterPx: panelGutter });
        if (plan) {
          const shapeA = { ...frame, ...plan.shapeA, id: uid() };
          const shapeB = { ...frame, ...plan.shapeB, id: uid() };
          commit([...elements.filter((elItem: El) => elItem.id !== frame.id), shapeA, shapeB]);
          setSelectedId(shapeA.id);
        } else {
          setPanelSplitHint(
            panelSplitPreview
              ? "여백을 적용하면 한쪽 칸이 너무 작아져요. 여백을 줄이거나 더 넓게 갈라보세요."
              : "선이 패널을 가로지르지 않았어요. 패널 양쪽 변을 관통하도록 다시 그어보세요.",
          );
        }
      }
      panelSplitLastLineRef.current = null;
      setPanelSplitPreview(null);
      return;
    }
    if (nodeEditDragRef.current) {
      const drag = nodeEditDragRef.current;
      if (!ownsStudioNodeEditPointer(drag, pointerEvent)) return;
      const { elId } = drag;
      const finalDraft = pendingNodeEditDraftRef.current;
      cancelStudioNodeEditPointer(h);
      const current = elementById.get(elId);
      if (
        finalDraft &&
        finalDraft.elId === elId &&
        current?.type === "draw" &&
        studioNodeEditSourceMatches(drag, current) &&
        !activeSurfaceReviewLocked &&
        !isEffectivelyLocked(current, groups)
      ) {
        patchEl(elId, { points: finalDraft.points, pressures: finalDraft.pressures } as Partial<El>);
      }
      return;
    }
    if (bubbleShapeDragRef.current) {
      const pointerId = Number.isFinite(pointerEvent.pointerId) ? pointerEvent.pointerId : 1;
      if (bubbleShapeDragRef.current.pointerId !== pointerId) return;
      const { elId, session } = bubbleShapeDragRef.current;
      releaseBubbleShapePointerCapture(bubbleShapeDragRef.current);
      bubbleShapeDragRef.current = null;
      if (bubbleShapeRafRef.current !== null) {
        globalThis.cancelAnimationFrame(bubbleShapeRafRef.current);
        bubbleShapeRafRef.current = null;
      }
      const finalDraft = pendingBubbleShapeDraftRef.current;
      pendingBubbleShapeDraftRef.current = null;
      setBubbleShapeDraft(null);
      const current = elementById.get(elId);
      if (
        finalDraft &&
        finalDraft.elId === elId &&
        current?.type === "bubble" &&
        !activeSurfaceReviewLocked &&
        !isEffectivelyLocked(current, groups)
      ) {
        const pointOffset = session.pointIndex * 2;
        const moved = moveBubbleShapePoint(
          current.customShapePoints ?? [],
          session.pointIndex,
          finalDraft.points[pointOffset],
          finalDraft.points[pointOffset + 1],
        );
        if (moved.changed) {
          patchEl(elId, { customShapePoints: moved.points } as Partial<El>);
          setBubbleShapeSelectedPointIndex(session.pointIndex);
        }
      }
      return;
    }
    if (handleStudioStagePointerRetouchAndMaskUp(h)) return;
    if (marqueeStartRef.current) {
      const rect = pendingMarqueeRectRef.current;
      marqueeStartRef.current = null;
      clearMarqueePreview();
      if (rect && rect.w > 3 && rect.h > 3) {
        const hitIds = selectIdsByMarquee<El>(
          elements,
          (el) => elBounds(el),
          rect,
          { include: (el) => !isEffectivelyHidden(el, groups) },
        );
        const ids = expandSelectionIdsToGroupUnits(
          elements,
          groups,
          hitIds,
          activeGroupIdRef.current,
        );
        applyGroupSelectionState({
          ...selectionShapeForIds(ids),
          activeGroupId: activeGroupIdRef.current,
        });
      }
      return;
    }
  }
  api.onStageUp = onStageUp;
}
