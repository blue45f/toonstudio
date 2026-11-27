/* Extracted stage pointer handlers from StudioCuttoonEditor — move 핸들러 본체.
 * bind 진입점(studio-cuttoon-stage-pointers-move.ts)에서 분리했다.
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
import { moveStudioSmartShapePoint } from "../studio-smart-shape-geometry";
import { requireStudioDrawingPointerTransport } from "../brush/studio-drawing-pointer-transport";
import { bubbleShapeCanvasPointToLocal, hasCustomBubbleShape } from "../lettering/studio-bubble-custom-shape";
import { moveStudioAdvancedFillTap } from "../studio-advanced-fill-tap";
import { colorDropGestureView, moveColorDropSession } from "../studio-colordrop-gesture";
import { moveStudioLassoFillDrag } from "../studio-lasso-fill-gesture";
import { CANVAS_W } from "../studio-assets";
import {
  shouldKeepStudioAutoColorStrokeSample,
  STUDIO_AUTO_COLOR_STROKE_MIN_DISTANCE_DOC_DEFAULT,
} from "../studio-auto-color-hints-canvas-seed";
import { shouldCancelLongPress } from "../studio-color-wheel";
import { cropAspectRatio, updateCropDrag } from "../studio-crop";
import {
  NODE_SMOOTH_DRAG_RANGE_PX,
  smoothPointsAroundIndex,
  updateSmoothStrengthDrag,
} from "../studio-curve-smoothing";
import { isEffectivelyLocked } from "../studio-layers";
import { resolveStudioLivePublishedCursorTool } from "../live/studio-live-canvas-overlay-model";
import {
  NODE_EDIT_WIDTH_DRAG_RANGE_PX,
  updateNodeDragMove,
  updateNodeDragWidth,
  withPointMoved,
  withPressureEdited,
} from "../studio-node-edit";
import { previewPanelSplit, type PanelSplitLine } from "../studio-panel-split";
import {
  isStudioStrokePointerEvent,
  shouldEndStudioStrokeForReleasedContact,
} from "../canvas/studio-pointer-input";
import { appendStudioPendingRasterRetouchGesturePoint } from "../studio-retouch-raster-gesture";
import { canvasPointToNormalized } from "../studio-selection-tools";
import type { StudioKonvaEventLike } from "../canvas/studio-stage-handle-types";
import type { El } from "../studio-element-model";
import { isolateStudioPalmTouchIfNeeded } from "./studio-cuttoon-stroke-interruption-guard";
import { handleStudioStagePointerRetouchAndCursorMove } from "./studio-cuttoon-stage-pointers-move-retouch";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";
import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";
import type { StudioLiveStrokeFoleyBridgeRuntime } from "./studio-live-stroke-foley-bridge";

export function createStudioCuttoonStagePointerMoveHandler(
  h: StudioCuttoonStagePointersHost,
  api: StudioCuttoonStagePointersApi,
) {
  const {
    advancedFillTapGestureRef,
    advancedFillColorDropRef,
    setAdvancedFillColorDropView,
    previewAdvancedFillColorDrop,
    advancedFillTapPayloadRef,
    advancedFillLassoDragRef,
    advancedFillTouchPanRef,
    autoColorScribbleCanvasArmed,
    autoColorScribbleStrokeRef,
    bubbleShapeDragRef,
    color,
    colorWheelPressRef,
    colorWheelTimerRef,
    cropAspect,
    cropDragRef,
    drawMode,
    drawingPointerTransportRef,
    drawingRef,
    getClientPointFromKonvaEvent,
    isExporting,
    nodeEditDragRef,
    nodeSmoothStrengthAtDragStartRef,
    noteQuickShapePointerMoved,
    panelGutter,
    panelSplitDragRef,
    panelSplitLastLineRef,
    pendingPixelSelectionRasterGestureRef,
    pendingRasterRetouchGestureRef,
    setNodeSmoothStrength,
    strokeWidth,
    studioLiveRoomRef,
    tool,
    wrapRef,
    activePage,
    advancedFillArmed,
    canvasH,
    effScale,
    elementById,
    elements,
    scheduleBubbleShapeDraft,
    scheduleCropRect,
    scheduleNodeEditDraft,
    schedulePanelSplitPreview,
    updateScrollPos,
  } = h;
  const finishDrawingPointer: StudioCuttoonStagePointersApi["finishDrawingPointer"] = (...args) =>
    api.finishDrawingPointer(...args);
  const updateActiveShapeEndpoint: StudioCuttoonStagePointersApi["updateActiveShapeEndpoint"] = (
    ...args
  ) => api.updateActiveShapeEndpoint(...args);

  function onStageMove(e: StudioKonvaEventLike<MouseEvent | TouchEvent>) {
    const stagePointerEvent = e.evt as PointerEvent;
    const stageActiveDrawing = drawingRef.current;
    const activeSession = drawingPointerTransportRef?.current?.getSession?.() ?? null;
    if (isolateStudioPalmTouchIfNeeded(activeSession, stageActiveDrawing, stagePointerEvent)) {
      return;
    }
    const nativeFreehandMoveOwnsStage = Boolean(
      stageActiveDrawing
      && (stageActiveDrawing.kind ?? "freehand") === "freehand"
      && isStudioStrokePointerEvent(
        requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession(),
        stagePointerEvent,
      ),
    );
    // Figma-style multiplayer cursor publication must run before every tool-specific early return.
    // Throttle before reading Stage coordinates or copying the recent stroke tail.
    if (!isExporting && canvasH > 0) {
      studioLiveRoomRef.current?.publishCursorWhenDue(() => {
        const pointer = e.target.getStage()?.getRelativePointerPosition();
        if (!pointer) return null;
        const activeDrawing = stageActiveDrawing;
        const isDrawing = Boolean(activeDrawing && (activeDrawing.kind ?? "freehand") === "freehand");
        const publishedTool = resolveStudioLivePublishedCursorTool({
          tool,
          drawMode,
          drawingMode: activeDrawing?.mode,
        });
        const isEraserPreview = publishedTool === "eraser";
        const strokeColor = activeDrawing?.stroke ?? color;
        const strokeWidthVal = activeDrawing?.strokeWidth ?? strokeWidth;
        const strokeOpacity = activeDrawing?.opacity ?? 1;
        const pts = activeDrawing?.points;

        return {
          x: Math.max(0, Math.min(1, pointer.x / CANVAS_W)),
          y: Math.max(0, Math.min(1, pointer.y / canvasH)),
          pageId: activePage.id,
          tool: publishedTool,
          drawing: isDrawing,
          strokeColor: isEraserPreview ? undefined : strokeColor,
          strokeWidth: strokeWidthVal,
          strokeOpacity,
          points: isDrawing && pts && pts.length >= 2 ? pts.slice(-64) : undefined,
        };
      });
    }
    // Auto-color freehand scribble stroke — append document points while armed.
    const scribbleStroke = autoColorScribbleStrokeRef.current;
    if (scribbleStroke && autoColorScribbleCanvasArmed) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        if (
          shouldKeepStudioAutoColorStrokeSample({
            lastDocX: scribbleStroke.lastDocX,
            lastDocY: scribbleStroke.lastDocY,
            nextDocX: pos.x,
            nextDocY: pos.y,
            minDistanceDoc: STUDIO_AUTO_COLOR_STROKE_MIN_DISTANCE_DOC_DEFAULT,
          })
        ) {
          scribbleStroke.points.push(pos.x, pos.y);
          scribbleStroke.lastDocX = pos.x;
          scribbleStroke.lastDocY = pos.y;
        }
      }
      return;
    }
    if (colorWheelTimerRef.current && colorWheelPressRef.current) {
      const clientPoint = getClientPointFromKonvaEvent(e.evt);
      if (clientPoint) {
        const dx = clientPoint.x - colorWheelPressRef.current.x;
        const dy = clientPoint.y - colorWheelPressRef.current.y;
        if (shouldCancelLongPress(dx, dy)) {
          clearTimeout(colorWheelTimerRef.current);
          colorWheelTimerRef.current = null;
        }
      }
    }
    // Window capture already consumed and previewed this active freehand delivery.
    if (nativeFreehandMoveOwnsStage) return;
    const pendingRasterGesture = pendingPixelSelectionRasterGestureRef.current;
    if (pendingRasterGesture) {
      const pointerId = Number.isFinite(stagePointerEvent.pointerId)
        ? stagePointerEvent.pointerId
        : 1;
      if (pendingRasterGesture.pointerId !== pointerId) return;
      const position = e.target.getStage()?.getRelativePointerPosition();
      if (position) {
        pendingRasterGesture.current = { x: position.x, y: position.y };
        pendingRasterGesture.shift = stagePointerEvent.shiftKey;
        pendingRasterGesture.alt = stagePointerEvent.altKey;
      }
      return;
    }
    const pendingRetouchGesture = pendingRasterRetouchGestureRef.current;
    if (pendingRetouchGesture) {
      const pointerId = Number.isFinite(stagePointerEvent.pointerId)
        ? stagePointerEvent.pointerId
        : 1;
      if (pendingRetouchGesture.pointerId !== pointerId) return;
      const position = e.target.getStage()?.getRelativePointerPosition();
      if (position) {
        pendingRasterRetouchGestureRef.current =
          appendStudioPendingRasterRetouchGesturePoint(
            pendingRetouchGesture,
            stagePointerEvent,
            position,
          );
      }
      return;
    }
    if (advancedFillLassoDragRef.current) {
      const pointerEvent = e.evt as PointerEvent;
      const pointerId = Number.isFinite(pointerEvent.pointerId) ? pointerEvent.pointerId : 1;
      const position = e.target.getStage()?.getRelativePointerPosition();
      if (position) {
        const session = advancedFillLassoDragRef.current;
        advancedFillLassoDragRef.current = {
          ...session,
          gesture: moveStudioLassoFillDrag(session.gesture, pointerId, position),
        };
      }
      return;
    }
    if (advancedFillTapGestureRef.current) {
      const clientPoint = getClientPointFromKonvaEvent(e.evt);
      const pointerEvent = e.evt as PointerEvent;
      const pointerId = Number.isFinite(pointerEvent.pointerId) ? pointerEvent.pointerId : 1;
      if (clientPoint) {
        const gesture = moveStudioAdvancedFillTap(
          advancedFillTapGestureRef.current,
          pointerId,
          clientPoint,
        );
        advancedFillTapGestureRef.current = gesture;
        if (advancedFillColorDropRef.current) {
          const dropMove = moveColorDropSession(
            advancedFillColorDropRef.current,
            pointerId,
            clientPoint,
          );
          advancedFillColorDropRef.current = dropMove.session;
          if (dropMove.previewTolerance !== null) {
            setAdvancedFillColorDropView(colorDropGestureView(dropMove.session));
            const payload = advancedFillTapPayloadRef.current;
            if (payload) previewAdvancedFillColorDrop(payload, dropMove.previewTolerance);
          }
        }
        const pan = advancedFillTouchPanRef.current;
        if (
          pointerEvent.pointerType === "touch" &&
          pan?.pointerId === pointerId &&
          gesture.blocked &&
          gesture.activePointerIds.length === 1
        ) {
          const wrap = wrapRef.current;
          if (wrap) {
            wrap.scrollLeft -= clientPoint.x - pan.last.x;
            wrap.scrollTop -= clientPoint.y - pan.last.y;
            updateScrollPos();
          }
        }
        if (pan?.pointerId === pointerId) pan.last = clientPoint;
      }
      return;
    }
    if (advancedFillArmed) return;
    if (cropDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = cropDragRef.current;
        const next = updateCropDrag(
          session.session,
          canvasPointToNormalized(pos.x, pos.y, session.frame),
          {
            ratio: cropAspectRatio(cropAspect),
            frameAspect: session.frame.height > 0 ? session.frame.width / session.frame.height : 1,
          },
        );
        scheduleCropRect(next);
      }
      return;
    }
    if (panelSplitDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      const session = panelSplitDragRef.current;
      const frame = elements.find((el: El) => el.id === session.targetFrameId);
      if (pos && frame && frame.type === "frame") {
        const line: PanelSplitLine = { a: session.start, b: { x: pos.x, y: pos.y } };
        panelSplitLastLineRef.current = line;
        const preview = previewPanelSplit({ frame, line, gutterPx: panelGutter });
        schedulePanelSplitPreview(preview);
      }
      return;
    }
    if (nodeEditDragRef.current) {
      if (!ownsStudioNodeEditPointer(nodeEditDragRef.current, stagePointerEvent)) return;
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const { elId, session } = nodeEditDragRef.current;
        const el = elementById.get(elId);
        if (
          !el
          || el.type !== "draw"
          || !studioNodeEditSourceMatches(nodeEditDragRef.current, el)
          || h.activeSurfaceReviewLocked
          || isEffectivelyLocked(el, h.groups)
        ) {
          cancelStudioNodeEditPointer(h);
          return;
        }
        if (session.tool === "move") {
          const { x, y } = updateNodeDragMove(session, pos);
          scheduleNodeEditDraft({
            elId,
            points: el.smartShape
              ? moveStudioSmartShapePoint(el.points, session.pointIndex, x, y, Boolean(e.evt.shiftKey))
              : withPointMoved(el.points, session.pointIndex, x, y),
            pressures: el.pressures ?? [],
          });
        } else if (session.tool === "width") {
          const pressure = updateNodeDragWidth(session, pos, NODE_EDIT_WIDTH_DRAG_RANGE_PX / effScale);
          scheduleNodeEditDraft({
            elId,
            points: el.points,
            pressures: withPressureEdited(
              el.pressures,
              Math.floor(el.points.length / 2),
              session.pointIndex,
              pressure,
            ),
          });
        } else {
          const strength = updateSmoothStrengthDrag(
            nodeSmoothStrengthAtDragStartRef.current,
            session.startPointerY,
            pos.y,
            NODE_SMOOTH_DRAG_RANGE_PX / effScale,
          );
          setNodeSmoothStrength(strength);
          scheduleNodeEditDraft({
            elId,
            points: smoothPointsAroundIndex(el.points, session.pointIndex, strength),
            pressures: el.pressures ?? [],
          });
        }
      }
      return;
    }
    if (bubbleShapeDragRef.current) {
      const pointerEvent = e.evt as PointerEvent;
      const pointerId = Number.isFinite(pointerEvent.pointerId) ? pointerEvent.pointerId : 1;
      if (bubbleShapeDragRef.current.pointerId !== pointerId) return;
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const { elId, session } = bubbleShapeDragRef.current;
        const el = elementById.get(elId);
        if (el && el.type === "bubble" && hasCustomBubbleShape(el.customShapePoints)) {
          const local = bubbleShapeCanvasPointToLocal(pos.x, pos.y, {
            x: el.x,
            y: el.y,
            rotation: el.rotation,
          });
          const { x, y } = updateNodeDragMove(session, local);
          scheduleBubbleShapeDraft({
            elId,
            points: withPointMoved(el.customShapePoints, session.pointIndex, x, y),
          });
        }
      }
      return;
    }
    if (handleStudioStagePointerRetouchAndCursorMove(h, api, e)) return;
    if (tool !== "draw" || !drawingRef.current) return;
    const pointerEvent = e.evt as PointerEvent;
    if (
      !isStudioStrokePointerEvent(
        requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession(),
        pointerEvent,
      )
    ) {
      return;
    }
    if (
      shouldEndStudioStrokeForReleasedContact(
        requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession(),
        pointerEvent,
      )
    ) {
      if (colorWheelTimerRef.current) {
        clearTimeout(colorWheelTimerRef.current);
        colorWheelTimerRef.current = null;
      }
      finishDrawingPointer(e.target.getStage(), pointerEvent, { consumeReleaseSample: false });
      return;
    }
    const kind = drawingRef.current.kind ?? "freehand";
    if (drawMode === "pen") {
      const qsPos = e.target.getStage()?.getRelativePointerPosition();
      if (qsPos) noteQuickShapePointerMoved(qsPos);
    }
    if (kind === "freehand") return;
    const stage = e.target.getStage();
    const foleyPos = stage?.getRelativePointerPosition();
    if (foleyPos && drawingRef.current) {
      (
        (globalThis as Record<PropertyKey, unknown>)[
          Symbol.for("toonstudio.liveStrokeFoleyBridge")
        ] as StudioLiveStrokeFoleyBridgeRuntime | undefined
      )?.studioLiveStrokeFoley.onStrokeMove({
        x: foleyPos.x,
        y: foleyPos.y,
        pressure: pointerEvent.pressure,
        tiltX: pointerEvent.tiltX,
        tiltY: pointerEvent.tiltY,
        timestampMs: pointerEvent.timeStamp,
        brushId: drawingRef.current.brushCatalogId ?? drawingRef.current.brush,
        drawMode: drawingRef.current.mode,
      });
    }
    if (stage) updateActiveShapeEndpoint(stage, pointerEvent, true);
  }
  return onStageMove;
}
