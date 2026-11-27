/* Extracted stage pointer retouch/mask/cursor move branches from studio-cuttoon-stage-pointers-move-handler.ts. */
"use no memo";

import { isStudioBrushCursorMode } from "../canvas/studio-canvas-cursor";
import {
  appendStudioLiquifyPointerPoint,
  isStudioLiquifyPointerOwner,
} from "../studio-liquify-pointer";
import { studioLiquifyDragMinDistance } from "../studio-liquify-stroke-sampling";
import { appendStudioRasterRetouchDragPoint } from "../render/studio-raster-retouch-stroke-sampling";
import { normalizeMarqueeRect } from "../studio-selection";
import {
  appendBrushPointInPlace,
  canvasPointToNormalized,
  translateSelection,
  updateSelectionDrag,
  type SelectionFrame,
} from "../studio-selection-tools";
import type { StudioKonvaEventLike } from "../canvas/studio-stage-handle-types";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";
import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";

/**
 * 픽셀 선택·리터치·마스크 드래그 및 호버 브러시 커서 갱신 분기를 처리한다.
 * 드래그/마퀴가 이벤트를 소비해 상위 `onStageMove`가 즉시 반환해야 하면 `true`를 반환한다.
 */
export function handleStudioStagePointerRetouchAndCursorMove(
  h: StudioCuttoonStagePointersHost,
  api: StudioCuttoonStagePointersApi,
  e: StudioKonvaEventLike<MouseEvent | TouchEvent>,
): boolean {
  const {
    dodgeBurnArmed,
    dodgeBurnDragRef,
    drawMode,
    filterMaskCursorRef,
    filterMaskDragRef,
    filterMaskPaintArmed,
    filterMaskRadius,
    healCloneArmed,
    healCloneDragRef,
    historyBrushArmed,
    historyBrushDragRef,
    layerMaskCursorRef,
    layerMaskDragRef,
    layerMaskPaintArmed,
    layerMaskRadius,
    liquifyArmed,
    liquifyDragRef,
    liquifyRadius,
    marqueeStartRef,
    pixelDragRef,
    pixelSelRef,
    pixelTool,
    polyLassoSessionRef,
    quickMaskArmed,
    quickMaskDragRef,
    quickMaskRadius,
    quickSelectDragRef,
    scheduleFilterMaskDragPreview,
    scheduleHealCloneDragPreview,
    scheduleHistoryBrushDragPreview,
    scheduleLayerMaskDragPreview,
    scheduleLiquifyLivePreview,
    scheduleMarqueeRect,
    schedulePaintRetouchStrokePreview,
    schedulePixelDragPreview,
    scheduleQuickMaskDragPreview,
    scheduleQuickSelectionStrokeScan,
    selected,
    setPixelSel,
    setPolyLassoHover,
    smudgeArmed,
    smudgeCursorRef,
    smudgeDragRef,
    tool,
    wetMixArmed,
    wetMixDragRef,
  } = h;

  if (pixelDragRef.current) {
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (pos) {
      const session = pixelDragRef.current;
      const norm = canvasPointToNormalized(pos.x, pos.y, session.frame);
      if (session.marqueeMove) {
        const dx = norm.x - session.marqueeMove.startNorm.x;
        const dy = norm.y - session.marqueeMove.startNorm.y;
        const moved =
          translateSelection(session.marqueeMove.baseSelection, dx, dy)
          ?? session.marqueeMove.baseSelection;
        pixelSelRef.current = moved;
        setPixelSel(moved);
      } else {
        const aspect = session.frame.height / Math.max(1, session.frame.width);
        const next = updateSelectionDrag(session.drag, norm, {
          shift: e.evt.shiftKey,
          alt: e.evt.altKey,
          aspect,
          magneticField: session.magneticField,
        });
        if (next !== session.drag) {
          session.drag = next;
          schedulePixelDragPreview(next);
        }
      }
    }
    return true;
  }

  if (polyLassoSessionRef.current && selected?.type === "image" && pixelTool === "poly-lasso") {
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (pos) {
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      setPolyLassoHover(canvasPointToNormalized(pos.x, pos.y, frame));
    }
    return true;
  }

  if (quickSelectDragRef.current) {
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (pos) {
      const session = quickSelectDragRef.current;
      const next = canvasPointToNormalized(pos.x, pos.y, session.frame);
      if (appendStudioRasterRetouchDragPoint(session.points, next, session.radiusNorm)) {
        scheduleQuickSelectionStrokeScan(session);
      }
    }
    return true;
  }

  if (smudgeDragRef.current) {
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (pos) {
      const session = smudgeDragRef.current;
      const next = canvasPointToNormalized(pos.x, pos.y, session.frame);
      if (appendStudioRasterRetouchDragPoint(session.points, next, session.radiusNorm)) {
        schedulePaintRetouchStrokePreview(session);
      }
    }
    return true;
  }

  if (dodgeBurnDragRef.current) {
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (pos) {
      const session = dodgeBurnDragRef.current;
      const next = canvasPointToNormalized(pos.x, pos.y, session.frame);
      if (appendStudioRasterRetouchDragPoint(session.points, next, session.radiusNorm)) {
        schedulePaintRetouchStrokePreview(session);
      }
    }
    return true;
  }

  if (wetMixDragRef.current) {
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (pos) {
      const session = wetMixDragRef.current;
      const next = canvasPointToNormalized(pos.x, pos.y, session.frame);
      if (appendStudioRasterRetouchDragPoint(session.points, next, session.radiusNorm)) {
        schedulePaintRetouchStrokePreview(session);
      }
    }
    return true;
  }

  if (liquifyDragRef.current) {
    const pointerEvent = e.evt as PointerEvent;
    if (!isStudioLiquifyPointerOwner(liquifyDragRef.current, pointerEvent)) return true;
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (pos) {
      const session = liquifyDragRef.current;
      const next = canvasPointToNormalized(pos.x, pos.y, session.frame);
      const radiusNorm = liquifyRadius / Math.max(1, session.frame.width);
      liquifyDragRef.current = appendStudioLiquifyPointerPoint(
        session,
        pointerEvent,
        next,
        studioLiquifyDragMinDistance(radiusNorm),
      );
      schedulePaintRetouchStrokePreview({
        frame: session.frame,
        radiusNorm,
        points: liquifyDragRef.current.points,
      });
      scheduleLiquifyLivePreview();
    }
    return true;
  }

  if (quickMaskDragRef.current) {
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (pos) {
      const session = quickMaskDragRef.current;
      const p = canvasPointToNormalized(pos.x, pos.y, session.frame);
      const radiusNorm = quickMaskRadius / Math.max(1, session.frame.width);
      if (appendBrushPointInPlace(session.points, p, radiusNorm)) {
        scheduleQuickMaskDragPreview({ points: session.points });
      }
    }
    return true;
  }

  if (layerMaskDragRef.current) {
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (pos) {
      const session = layerMaskDragRef.current;
      const p = canvasPointToNormalized(pos.x, pos.y, session.frame);
      const radiusNorm = layerMaskRadius / Math.max(1, session.frame.width);
      if (appendBrushPointInPlace(session.points, p, radiusNorm)) {
        scheduleLayerMaskDragPreview({ points: session.points });
      }
    }
    return true;
  }

  if (filterMaskDragRef.current) {
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (pos) {
      const session = filterMaskDragRef.current;
      const p = canvasPointToNormalized(pos.x, pos.y, session.frame);
      const radiusNorm = filterMaskRadius / Math.max(1, session.frame.width);
      if (appendBrushPointInPlace(session.points, p, radiusNorm)) {
        scheduleFilterMaskDragPreview({ points: session.points });
      }
    }
    return true;
  }

  if (healCloneDragRef.current) {
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (pos) {
      const session = healCloneDragRef.current;
      const p = canvasPointToNormalized(pos.x, pos.y, session.frame);
      api.updateHealCloneCursorNodes(p, session.frame);
      if (appendBrushPointInPlace(session.points, p, session.radiusNorm)) {
        scheduleHealCloneDragPreview(session);
      }
    }
    return true;
  }

  if (historyBrushDragRef.current) {
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (pos) {
      const session = historyBrushDragRef.current;
      const p = canvasPointToNormalized(pos.x, pos.y, session.frame);
      api.updateHistoryBrushCursorNode(p, session.frame);
      if (appendBrushPointInPlace(session.points, p, session.radiusNorm)) {
        scheduleHistoryBrushDragPreview({ points: session.points });
      }
    }
    return true;
  }

  if (marqueeStartRef.current) {
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (pos) {
      const s = marqueeStartRef.current;
      scheduleMarqueeRect(normalizeMarqueeRect(s.x, s.y, pos.x, pos.y));
    }
    return true;
  }

  if (smudgeArmed || liquifyArmed || dodgeBurnArmed || wetMixArmed) {
    const cursorPos = e.target.getStage()?.getRelativePointerPosition();
    const cursorNode = smudgeCursorRef.current;
    if (cursorPos && cursorNode) {
      cursorNode.position(cursorPos);
      if (!cursorNode.visible()) cursorNode.visible(true);
      cursorNode.getLayer()?.batchDraw();
    }
  } else if (layerMaskPaintArmed || quickMaskArmed) {
    const cursorPos = e.target.getStage()?.getRelativePointerPosition();
    const cursorNode = layerMaskCursorRef.current;
    if (cursorPos && cursorNode) {
      cursorNode.position(cursorPos);
      if (!cursorNode.visible()) cursorNode.visible(true);
      cursorNode.getLayer()?.batchDraw();
    }
  } else if (filterMaskPaintArmed) {
    const cursorPos = e.target.getStage()?.getRelativePointerPosition();
    const cursorNode = filterMaskCursorRef.current;
    if (cursorPos && cursorNode) {
      cursorNode.position(cursorPos);
      if (!cursorNode.visible()) cursorNode.visible(true);
      cursorNode.getLayer()?.batchDraw();
    }
  } else if (healCloneArmed && selected?.type === "image") {
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (pos) {
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      api.updateHealCloneCursorNodes(canvasPointToNormalized(pos.x, pos.y, frame), frame);
    }
  } else if (historyBrushArmed && selected?.type === "image") {
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (pos) {
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      api.updateHistoryBrushCursorNode(canvasPointToNormalized(pos.x, pos.y, frame), frame);
    }
  } else if (tool === "draw" && isStudioBrushCursorMode(drawMode)) {
    const brushPointerEvent = e.evt as PointerEvent;
    api.updateBrushCursor(e.target.getStage(), brushPointerEvent);
  }

  return false;
}
