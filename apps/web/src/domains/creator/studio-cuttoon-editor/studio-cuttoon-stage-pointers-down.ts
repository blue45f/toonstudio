/* Extracted stage pointer handlers from StudioCuttoonEditor.
 * Closures keep the original editor typing envelope via an `any` host bag. */
"use no memo";
// React Compiler 옵트아웃: 가변 호스트 백(h) 을 렌더마다 재대입해 공유하는 추출 패턴이라,
// 컴파일러가 h 참조 동일성만 보고 JSX/계산을 캐시하면 첫 렌더에서 UI 가 영구 동결된다
// (탭 전환 등 커밋된 상태 변경이 화면에 반영되지 않음).

import { COLOR_WHEEL_LONG_PRESS_MS } from "../studio-color-wheel";
import { studioKonvaRuntime as KonvaRuntime } from "../render/studio-konva-runtime";
import type { StudioKonvaEventLike } from "../canvas/studio-stage-handle-types";
import { isolateStudioPalmTouchIfNeeded } from "./studio-cuttoon-stroke-interruption-guard";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";
import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";

export function bindStudioCuttoonStagePointersDown(
  h: StudioCuttoonStagePointersHost,
  api: StudioCuttoonStagePointersApi,
) {
  const {
    advancedFillActive,
    applyStudioDrawingColor,
    applyVectorEraseToIntersectionAt,
    bubbleAnchorPickActive,
    bubbleShapeDragRef,
    colorWheelOpen,
    colorWheelPressRef,
    colorWheelTimerRef,
    cropRect,
    dodgeBurnActive,
    drawMode,
    eraseToIntersection,
    eyedropperActive,
    getClientPointFromKonvaEvent,
    handleStudioPointCommentStageDown,
    healCloneTool,
    isSpacePressed,
    journalPendingPixelSelectionRasterGesture,
    journalPendingRasterRetouchGesture,
    liquifyDragRef,
    nodeEditDragRef,
    nodeEditTool,
    openColorWheelAt,
    panelSplitActive,
    pendingPixelSelectionRasterGestureRef,
    pendingRasterRetouchGestureRef,
    pickCanvasColorAt,
    pixelDragRef,
    pixelMarqueeRasterPreparationActivationRef,
    pixelTool,
    quickShapeActive,
    recentColors,
    setEyedropperActive,
    smudgeActive,
    studioRasterRetouchPreparationRef,
    tool,
    wetMixActive,
    canvasInteractionBlocked,
    commentPinArmed,
    healCloneArmed,
  } = h;

  function onStageDown(e: StudioKonvaEventLike<MouseEvent | TouchEvent>) {
    if (
      e.target.name() === "symmetry-handle"
      || e.target.name() === "guide-line-handle"
      || e.target.name() === "vp-handle"
      || e.target.name() === "isometric-origin-handle"
    ) {
      return;
    }
    const stagePointerEvent = e.evt as PointerEvent;
    const activePenSession = h.drawingPointerTransportRef?.current?.getSession?.() ?? null;
    if (isolateStudioPalmTouchIfNeeded(activePenSession, h.drawingRef?.current, stagePointerEvent)) {
      return;
    }
    // Keep the first node-edit contact authoritative until its own up/cancel.
    if (nodeEditDragRef.current) return;
    // One contact owns a liquify gesture. A second finger is ignored and cannot cancel or replace it.
    if (liquifyDragRef.current) return;
    // One contact also owns a pixel-selection drag; a palm/second finger cannot replace it.
    if (pixelDragRef.current) return;
    // Raster preparation journals the first vector-only selection contact with the same ownership
    // rule; a second touch/palm cannot replace its start point or release owner.
    if (pendingPixelSelectionRasterGestureRef.current) return;
    // The same one-contact rule protects the first smudge/dodge/wet-mix/liquify gesture while a
    // vector-only page is being rendered into its non-destructive editable raster copy.
    if (pendingRasterRetouchGestureRef.current) return;
    // The first contact owns a bubble point drag. A palm/second finger cannot replace its owner.
    if (bubbleShapeDragRef.current) return;
    if (handleStudioPointCommentStageDown(e, stagePointerEvent)) return;
    if (canvasInteractionBlocked && !commentPinArmed) {
      if (h.scopedDrawAllowed?.() && !h.capturePendingCatalogInput?.(stagePointerEvent, e.target.getStage())) {
        api.tryStageDownDraw(e, stagePointerEvent);
      }
      return;
    }
    if (!isSpacePressed && h.capturePendingCatalogInput?.(stagePointerEvent, e.target.getStage())) return;
    const pendingRetouchPreparation = studioRasterRetouchPreparationRef.current;
    const pendingSelectionPreparation = pixelMarqueeRasterPreparationActivationRef.current;
    if (pendingSelectionPreparation && !isSpacePressed) {
      const position = e.target.getStage()?.getRelativePointerPosition();
      if (position) {
        journalPendingPixelSelectionRasterGesture({
          captureFallback: e.target.getStage()?.container() ?? null,
          event: stagePointerEvent,
          forceCircle: pendingSelectionPreparation.forceCircle,
          position,
          tool: pendingSelectionPreparation.tool,
        });
      }
      // The requested pixel tool may not have reached this render's closure yet. Preparation owns
      // the contact through its synchronous ref so the first fast drag cannot move a source vector.
      return;
    }
    if (pendingRetouchPreparation && !isSpacePressed) {
      const position = e.target.getStage()?.getRelativePointerPosition();
      if (position) {
        journalPendingRasterRetouchGesture({
          captureFallback: e.target.getStage()?.container() ?? null,
          event: stagePointerEvent,
          position,
        });
      }
      // During preparation, never let the same contact select/move the source vectors behind the
      // pending editable copy, even when a secondary contact was deliberately rejected.
      return;
    }
    // 색상 휠 롱프레스 무장 — 조건을 전부 만족할 때만 타이머를 건다. 이 블록은 return하지
    // 않는다(관찰만 함) — 아래 기존 분기들(스포이드/크롭/드로잉/마퀴 등)은 오늘과 동일하게
    // 그대로 실행된다. 타이머가 실제로 발화(450ms 정지 유지)했을 때만 openColorWheelAt 이
    // disarmAllPixelTools 로 그 사이 진행된 제스처(마퀴 시작 등)를 되돌린다.
    if (
      tool === "select" &&
      !isSpacePressed &&
      !cropRect &&
      !panelSplitActive &&
      !nodeEditTool &&
      !smudgeActive &&
      !dodgeBurnActive &&
      !wetMixActive &&
      !healCloneTool &&
      !advancedFillActive &&
      !eyedropperActive &&
      !bubbleAnchorPickActive &&
      !pixelTool &&
      !quickShapeActive &&
      !colorWheelOpen &&
      recentColors.length > 0 &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const clientPoint = getClientPointFromKonvaEvent(e.evt);
      if (clientPoint) {
        colorWheelPressRef.current = clientPoint;
        colorWheelTimerRef.current = setTimeout(() => {
          colorWheelTimerRef.current = null;
          openColorWheelAt(clientPoint.x, clientPoint.y);
        }, COLOR_WHEEL_LONG_PRESS_MS);
      }
    }
    // 스포이드: 토글 버튼으로 무장했거나(한 번 뽑으면 자동 해제), 펜 도구 중 Alt 를 누른 momentary
    // 방식(CSP/Photoshop 관례) — 다른 어떤 캔버스 제스처보다 항상 최우선으로 가로챈다.
    if (eyedropperActive || (tool === "draw" && e.evt.altKey && !healCloneArmed)) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const hex = pickCanvasColorAt(pos);
        if (hex) applyStudioDrawingColor(hex);
      }
      if (eyedropperActive) setEyedropperActive(false);
      return;
    }
    // CSP 교점까지 지우기 — 지우개 + 토글 시 자유선 클릭 한 번으로 교차 구간을 정리한다.
    if (tool === "draw" && drawMode === "eraser" && eraseToIntersection) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos && applyVectorEraseToIntersectionAt(pos.x, pos.y)) return;
    }
    if (api.tryStageDownArmedTools(e, stagePointerEvent)) return;
    if (api.tryStageDownPixel(e, stagePointerEvent)) return;
    api.tryStageDownDraw(e, stagePointerEvent);
  }
  api.onStageDown = onStageDown;
}
