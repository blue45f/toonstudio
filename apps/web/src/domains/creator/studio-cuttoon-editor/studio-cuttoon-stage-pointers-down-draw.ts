/* Extracted stage pointer handlers from StudioCuttoonEditor.
 * Closures keep the original editor typing envelope via an `any` host bag. */
"use no memo";
// React Compiler 옵트아웃: 가변 호스트 백(h) 을 렌더마다 재대입해 공유하는 추출 패턴이라,
// 컴파일러가 h 참조 동일성만 보고 JSX/계산을 캐시하면 첫 렌더에서 UI 가 영구 동결된다
// (탭 전환 등 커밋된 상태 변경이 화면에 반영되지 않음).
import { flushSync } from "react-dom";
import {
  admitStudioScopedDrawStart,
  assertStudioScopedDrawContinuation,
} from "../studio-collab/studio-scoped-write-mutation";
import {
  executeStudioDraftPreviewBackdropBoundary,
  planStudioDraftPreviewBackdropBoundary,
} from "../brush/studio-draw-rendering";
import { planStudioDrawPointerStart } from "../brush/studio-draw-pointer-start-plan";
import {
  resolveStudioPenContactDrawMode,
  resolveStudioPenContactStrokeWidth,
} from "../brush/studio-pen-button-policy";
import { getStudioPenButtonPolicySnapshot } from "../brush/studio-pen-button-policy-store";
import { beginStudioStrokePointerSession } from "../brush/studio-pen-pointer-session";
import { getStudioStylusPressureProfileSnapshot } from "../brush/studio-stylus-pressure-profile-store";
import { requireStudioDrawingPointerTransport } from "../brush/studio-drawing-pointer-transport";
import { studioDrawElementToCrdtStroke } from "../live/studio-crdt-draw-bridge";
import { resolveActiveStudioAdvancedRuler } from "../studio-advanced-ruler-document";
import {
  setStudioStrokeFocusActivity,
  shouldActivateStudioStrokeFocusForPointer,
} from "../studio-stroke-focus-activity";
import { routeStudioDrawingPracticeStroke } from "../studio-drawing-practice-runtime";
import { uid } from "../studio-id";
import { studioInkGestureTimeOrigin } from "../studio-legacy-editor-runtime-helpers";
import { createStudioLinked3dCorrectionProvenance } from "../studio-linked-3d-render-document";
import type { DrawEl } from "../studio-element-model";
import type { StudioKonvaEventLike } from "../canvas/studio-stage-handle-types";
import { planStudioStageDownStrokeInterruption } from "./studio-cuttoon-stroke-interruption-guard";
import {
  buildStudioDownDrawBackdropBoundaryInput,
  initializeStudioDownDrawStrokeFilters,
  snapStudioDownDrawInitialShapeOrigin,
} from "./studio-cuttoon-stage-pointers-down-draw-helpers";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";
import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";
import type { StudioLiveStrokeFoleyBridgeRuntime } from "./studio-live-stroke-foley-bridge";

export function bindStudioCuttoonStagePointersDownDraw(
  h: StudioCuttoonStagePointersHost,
  api: StudioCuttoonStagePointersApi,
) {
  const {
    activeCatalogBrush, activeGroupIdRef, activePage, advancedRulerSnapRef, appSettingsRef,
    beginLiveResourceEdit, beginStudioDrawLiveSurfaces, brush, brushDynamics, brushEnginePrograms,
    brushOpacity, clearMarqueePreview, collaborationAccessRef, color, discardDrawingPointerSession,
    drawMode, drawShape, drawingAssistDocument, drawingCrdtPublishErrorRef, drawingCrdtPublisherRef,
    drawingCrdtStrokeActiveRef, drawingGesturePreviewPublisherRef, drawingImmediateCausalInputRef,
    drawingInkTimeOriginRef, drawingInputSettingsRef, drawingLastAuthoritativePointerRef,
    drawingPointerTransportRef, drawingPracticeTargetGroupId, drawingRef, effScale,
    endLiveResourceEdit, flushPendingStrokeCommitsRef, isRealtimeTeamSession, isSpacePressed,
    isometricAngleDeg, isometricAxisRayRef, isometricGridActive, marqueeStartRef,
    perspectiveGuideSnapRef, perspectiveRayRef, perspectiveRulerActive, postCorrection,
    preserveCorners, pressureCurve, pressureMinSize, quickShapeActive, scheduleLiveDrawPressure,
    selected, setActiveGroupId, setError, setMarqueeIds, setSelectedId, settleZoomGestureRef,
    shapeFill, stabilizer, stabilizerMode, stageRef, stampTuning, startFixedRateStrokePump,
    startQuickShapeTracking, stopQuickShapeTracking, strokeWidth, studioCrdtDocumentRef,
    symmetryCenterX, symmetryCenterY, symmetryRadialCount, symmetryType, tiltEnabled, tipAngle,
    tipRoundness, tool, useVelocityPressure, vanishingPoints, velocitySensitivity, zoomGestureRef,
  } = h;
  const updateBrushCursor: StudioCuttoonStagePointersApi["updateBrushCursor"] = (
    ...args
  ) => api.updateBrushCursor(...args);

  function tryStageDownDraw(
    e: StudioKonvaEventLike<MouseEvent | TouchEvent>,
    _stagePointerEvent: PointerEvent,
    replayPosition?: { x: number; y: number },
  ) {
    if (collaborationAccessRef?.current.locked && !h.scopedDrawAllowed?.()) return;
    if (tool === "draw") {
      const pointerSample = e.evt as PointerEvent;
      const penButtonPolicy = getStudioPenButtonPolicySnapshot();
      const strokeDrawMode = resolveStudioPenContactDrawMode(
        drawMode,
        pointerSample,
        penButtonPolicy,
      );
      const momentaryPenEraser = drawMode === "pen" && strokeDrawMode === "eraser";
      const strokeInputWidth = resolveStudioPenContactStrokeWidth(
        strokeWidth,
        drawMode,
        pointerSample,
        penButtonPolicy,
      );
      const strokeInputOpacity = momentaryPenEraser ? 1 : brushOpacity;
      const stylusPressureProfile = getStudioStylusPressureProfileSnapshot();
      if (momentaryPenEraser) pointerSample.preventDefault();
      // Capture the frame-clock anchor alongside pointerdown, before CRDT/render setup can add
      // device-dependent latency. The pump later maps this elapsed time back to the event clock.
      const pointerDownFrameTimeStamp =
        globalThis.performance?.now?.() ?? pointerSample.timeStamp;

      const activePointerSession =
        requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession();
      const interruptionPlan = planStudioStageDownStrokeInterruption({
        activeSession: activePointerSession,
        activeDrawing: drawingRef.current,
        incomingPointer: pointerSample,
        lastAuthoritativePointer: drawingLastAuthoritativePointerRef.current,
      });
      if (
        interruptionPlan.action === "ignore-palm-touch"
        || interruptionPlan.action === "ignore-foreign-or-duplicate"
      ) {
        return;
      }

      // 터치 정책: one-finger drag = draw | pan | none. Palm rejection ignores touch while pen preferred.
      const touchPrefs = appSettingsRef.current.touch;
      if (pointerSample.pointerType === "touch") {
        if (touchPrefs.oneFingerDrag !== "draw") return;
        if (touchPrefs.palmRejection && activePointerSession?.pointerType === "pen") return;
      }

      if (interruptionPlan.action === "discard-finger-for-multitouch") {
        discardDrawingPointerSession();
        return;
      }
      if (interruptionPlan.action === "salvage-stuck-and-proceed") {
        // 포인터 캡처 유실·OS 알림 등으로 고착된 직전 획을 새 주 접촉 직전에 무손실 확정한다.
        if (typeof api.finishDrawingPointer === "function") {
          api.finishDrawingPointer(e.target.getStage(), interruptionPlan.fallbackPointer, {
            consumeReleaseSample: false,
          });
        }
        if (drawingRef.current) discardDrawingPointerSession();
      } else if (interruptionPlan.action === "discard-stale-and-proceed") {
        discardDrawingPointerSession();
      }

      if (zoomGestureRef.current) {
        flushSync(() => settleZoomGestureRef.current());
        stageRef.current?.setPointersPositions(pointerSample);
      }
      if (!h.prepareStrokeCommitPage()) {
        setError(
          "이전 페이지의 마지막 획을 확정하지 못해 새 획을 시작하지 않았어요. 잠금·동기화 상태를 확인한 뒤 다시 시도해 주세요.",
        );
        return;
      }
      const backdropBoundary = planStudioDraftPreviewBackdropBoundary({
        ...buildStudioDownDrawBackdropBoundaryInput(h, strokeDrawMode),
      });
      const backdropBoundaryExecution = executeStudioDraftPreviewBackdropBoundary({
        plan: backdropBoundary,
        flushSynchronously: flushSync,
        flushPending: () => flushPendingStrokeCommitsRef.current(),
        restorePointerPosition: () => stageRef.current?.setPointersPositions(pointerSample),
      });
      // A CRDT stroke has its own conflict-free operation stream, so it must not claim the old
      // page-wide lease that prevented two artists from drawing at once. Keep the lease fallback
      // only while the durable document is not connected.
      const leaseIntent =
        strokeDrawMode === "pen" || strokeDrawMode === "shape" || strokeDrawMode === "eraser"
          ? "append-stroke"
          : "page-edit";
      if (!studioCrdtDocumentRef.current && !beginLiveResourceEdit(undefined, leaseIntent)) return;
      const pointerSession = beginStudioStrokePointerSession(pointerSample, penButtonPolicy);
      if (!pointerSession) {
        endLiveResourceEdit();
        return;
      }
      const pos =
        replayPosition
        ?? stageRef.current?.getRelativePointerPosition()
        ?? e.target.getStage()?.getRelativePointerPosition();
      if (!pos) {
        endLiveResourceEdit();
        return;
      }
      const cursorStage = e.target.getStage();
      const cursorPoint =
        replayPosition === undefined && (!stageRef.current || stageRef.current === cursorStage)
          ? pos
          : undefined;
      updateBrushCursor(cursorStage, pointerSample, cursorPoint);

      const strokeAdvancedRuler = resolveActiveStudioAdvancedRuler(
        drawingAssistDocument.advanced,
        selected?.groupId ?? null,
      );
      const liveFoleyBridge = (globalThis as Record<PropertyKey, unknown>)[
        Symbol.for("toonstudio.liveStrokeFoleyBridge")
      ] as StudioLiveStrokeFoleyBridgeRuntime | undefined;
      const strokePressureCurve =
        pressureCurve * (liveFoleyBridge?.getStudioPressureCurveGamma() ?? 1);
      drawingInputSettingsRef.current = {
        version: 1,
        stabilizer,
        stabilizerMode,
        postCorrection,
        preserveCorners,
        pressureCurve: strokePressureCurve,
        pressureMinSize,
        stylusPressureProfile,
        drawMode: strokeDrawMode,
        useVelocityPressure,
        velocitySensitivity,
        coordinateScale: effScale,
        perspectiveActive: !strokeAdvancedRuler && perspectiveRulerActive,
        vanishingPoints: vanishingPoints.map((point: { x: number; y: number }) => ({ ...point })),
        isometricActive: !strokeAdvancedRuler && isometricGridActive,
        isometricAngleDeg,
        advancedRuler: strokeAdvancedRuler ? structuredClone(strokeAdvancedRuler) : null,
      };
      setSelectedId(null);

      const drawStartPlan = planStudioDrawPointerStart({
        id: uid(),
        position: pos,
        pointer: pointerSample,
        drawMode: strokeDrawMode,
        drawShape,
        shapeFill,
        color,
        strokeWidth: strokeInputWidth,
        brushOpacity: strokeInputOpacity,
        brush,
        brushCatalogId: activeCatalogBrush.id,
        brushCatalogName: activeCatalogBrush.name,
        stampTuning,
        brushDynamics,
        brushEnginePrograms,
        stabilizer,
        stabilizerMode,
        velocitySensitivity,
        pressureCurve: strokePressureCurve,
        pressureMinSize,
        stylusPressureProfile,
        positionScale: effScale,
        brushTip: { tiltEnabled, angleDeg: tipAngle, roundness: tipRoundness },
        symmetry: {
          type: symmetryType,
          centerX: symmetryCenterX,
          centerY: symmetryCenterY,
          radialCount: symmetryRadialCount,
        },
      });
      const { causalInitialSample, causalInputPlan, pressure, stylus } = drawStartPlan;
      let next = drawStartPlan.element;
      next = routeStudioDrawingPracticeStroke(next, drawingPracticeTargetGroupId);
      const linked3dCorrection =
        !isRealtimeTeamSession && strokeDrawMode === "pen"
          ? createStudioLinked3dCorrectionProvenance(activePage.linked3dRender, selected?.id)
          : null;
      if (linked3dCorrection) next = { ...next, linked3dCorrection };
      const snappedOriginResult = snapStudioDownDrawInitialShapeOrigin(
        h,
        api,
        next,
        drawStartPlan.strokeOrigin,
        strokeAdvancedRuler,
      );
      next = snappedOriginResult.element;
      const strokeOrigin = snappedOriginResult.strokeOrigin;

      if (strokeDrawMode === "pen") scheduleLiveDrawPressure(pressure);
      drawingLastAuthoritativePointerRef.current = pointerSample;
      const pointerTransportStart = requireStudioDrawingPointerTransport(drawingPointerTransportRef).start({
        pointerEvent: pointerSample,
        session: pointerSession,
        stage: e.target.getStage(),
      });
      if (!pointerTransportStart.started) {
        drawingLastAuthoritativePointerRef.current = null;
        drawingInkTimeOriginRef.current = null;
        drawingInputSettingsRef.current = null;
        scheduleLiveDrawPressure(null);
        endLiveResourceEdit();
        return;
      }
      try {
        next = admitStudioScopedDrawStart(
          collaborationAccessRef,
          activePage.id,
          activePage.elements,
          next,
        );
      } catch (cause) {
        discardDrawingPointerSession();
        endLiveResourceEdit();
        setError(cause instanceof Error ? cause.message : "담당 범위의 획을 시작하지 못했습니다.");
        return;
      }
      drawingImmediateCausalInputRef.current = causalInputPlan.quantizeImmediately;
      initializeStudioDownDrawStrokeFilters(h, {
        next,
        strokeDrawMode,
        strokeOrigin,
        pointerSample,
        causalInputPlan,
        causalInitialSample,
        pressure,
        stylus,
      });
      drawingInkTimeOriginRef.current = studioInkGestureTimeOrigin(next.inkInput, pointerSample.timeStamp);
      drawingRef.current = next;
      if (shouldActivateStudioStrokeFocusForPointer(pointerSample.pointerType)) {
        setStudioStrokeFocusActivity("canvas-stroke", true);
      }
      perspectiveRayRef.current = null;
      perspectiveGuideSnapRef.current = null;
      isometricAxisRayRef.current = null;
      advancedRulerSnapRef.current = null;
      const beginAdmittedCollaboration = (admittedStroke: DrawEl): void => {
        assertStudioScopedDrawContinuation(collaborationAccessRef, admittedStroke.id);
        drawingGesturePreviewPublisherRef.current.begin({
          pageId: activePage.id,
          documentGeneration: collaborationAccessRef.current.documentGeneration,
          element: admittedStroke,
        });
        drawingCrdtPublisherRef.current.cancel();
        drawingCrdtStrokeActiveRef.current = false;
        const crdtDocument = studioCrdtDocumentRef.current;
        if (crdtDocument) {
          try {
            const crdtStroke = studioDrawElementToCrdtStroke(activePage.id, admittedStroke);
            drawingCrdtStrokeActiveRef.current = true;
            drawingCrdtPublisherRef.current.begin(admittedStroke.id, () => {
              if (
                !drawingCrdtStrokeActiveRef.current
                || studioCrdtDocumentRef.current !== crdtDocument
              ) {
                throw new Error("실시간 협업 문서가 획 시작 전에 변경되었습니다.");
              }
              assertStudioScopedDrawContinuation(collaborationAccessRef, admittedStroke.id);
              crdtDocument.beginStroke(crdtStroke);
            });
          } catch (cause) {
            drawingCrdtPublisherRef.current.cancel(admittedStroke.id);
            drawingCrdtPublishErrorRef.current(cause);
          }
        }
      };
      if (!beginStudioDrawLiveSurfaces(next, pointerSample, strokeOrigin, {
        pendingBackdrop: !backdropBoundaryExecution.ready,
        onAdmitted: beginAdmittedCollaboration,
      })) {
        discardDrawingPointerSession();
        return;
      }
      const foleyStart = {
        x: strokeOrigin.x,
        y: strokeOrigin.y,
        pressure,
        tiltX: stylus.tiltX,
        tiltY: stylus.tiltY,
        timestampMs: pointerSample.timeStamp,
        brushId: activeCatalogBrush.id || brush,
        drawMode: strokeDrawMode,
      };
      if (liveFoleyBridge) {
        liveFoleyBridge.studioLiveStrokeFoley.onStrokeStart(foleyStart);
      } else {
        void import("./studio-live-stroke-foley-bridge")
          .then((mod) => {
            if (drawingRef.current?.id === next.id && requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession()) {
              mod.studioLiveStrokeFoley.onStrokeStart(foleyStart);
            }
          })
          .catch(() => {});
      }
      if (strokeDrawMode === "pen" && quickShapeActive) startQuickShapeTracking(strokeOrigin);
      else stopQuickShapeTracking();
      if (h.pendingStrokeAdmissionRef?.current?.has(next.id)) {
        startFixedRateStrokePump(pointerSample, pointerDownFrameTimeStamp);
        return;
      }
      beginAdmittedCollaboration(next);
      startFixedRateStrokePump(pointerSample, pointerDownFrameTimeStamp);
      return;
    }
    if (e.target === e.target.getStage() || e.target.name() === "bg") {
      setSelectedId(null);
      setMarqueeIds([]);
      activeGroupIdRef.current = null;
      setActiveGroupId(null);
      if (!isSpacePressed) {
        const pos = e.target.getStage()?.getRelativePointerPosition();
        if (pos) {
          marqueeStartRef.current = { x: pos.x, y: pos.y };
          clearMarqueePreview();
        }
      }
    }
  }
  api.tryStageDownDraw = tryStageDownDraw;
}
