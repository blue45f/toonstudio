/* Extracted stage pointer handlers from StudioCuttoonEditor.
 * Closures keep the original editor typing envelope via an `any` host bag. */
"use no memo";
// React Compiler 옵트아웃: 가변 호스트 백(h) 을 렌더마다 재대입해 공유하는 추출 패턴이라,
// 컴파일러가 h 참조 동일성만 보고 JSX/계산을 캐시하면 첫 렌더에서 UI 가 영구 동결된다
// (탭 전환 등 커밋된 상태 변경이 화면에 반영되지 않음).

import { advanceStudioBrushVelocityPressure } from "../brush/studio-brush-velocity-pressure";
import { studioLiveBrushPressure } from "../brush/studio-draw-rendering";
import { requireStudioDrawingPointerTransport } from "../brush/studio-drawing-pointer-transport";
import { studioInkFallbackPressure } from "../brush/studio-ink-pressure-model";
import { isStudioBrushCursorMode } from "../canvas/studio-canvas-cursor";
import { transitionFixedRateStrokeFilter } from "../studio-fixed-rate-stroke-filter";
import {
  advanceFixedRateStrokeFrameClock,
  advanceFixedRateStrokeSampleClockFloor,
} from "../studio-fixed-rate-stroke-frame-pump";
import type { StudioLowLatencyPredictor as StudioLowLatencyPredictorInstance } from "../studio-lowlatency-predictor";
import { STUDIO_POINTER_PREDICTION_ENABLED } from "../studio-page-shell-runtime";
import { isStudioStrokePointerEvent } from "../canvas/studio-pointer-input";
import { canCollectStudioPointerPredictionsForActiveTail } from "../canvas/studio-pointer-prediction-capability";
import { replaceStudioRawPenInkPreview } from "../studio-raw-pen-ink-preview";
import type { DrawEl } from "../studio-element-model";
import { recordStudioDrawingStabilityCounts } from "./studio-cuttoon-drawing-stability-telemetry";
import { planStudioStrokeCancelOrAbortRecovery } from "./studio-cuttoon-stroke-interruption-guard";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";
import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";
import type { StudioLiveStrokeFoleyBridgeRuntime } from "./studio-live-stroke-foley-bridge";

export function bindStudioCuttoonStagePointersPublish(
  h: StudioCuttoonStagePointersHost,
  api: StudioCuttoonStagePointersApi,
) {
  const {
    appSettingsRef,
    appendStudioHokusaiAuthoritativeSuffix,
    appendStudioLivingInkAuthoritativeSuffix,
    brushCursorRef,
    causalPostCorrectionStateRef,
    colorWheelTimerRef,
    currentRawPenInkPreviewEligibility,
    discardDrawingPointerSession,
    drawMode,
    drawingFixedRateFilterRef,
    drawingFixedRatePumpClockRef,
    drawingFixedRatePumpFrameRef,
    drawingFixedRateSampleClockRef,
    drawingGesturePreviewPublisherRef,
    drawingInputSettingsRef,
    drawingLastAuthoritativePointerRef,
    drawingPointerTransportRef,
    drawingRef,
    drawingVelocityPressureRef,
    inkMeshLivePreviewRuntimeRef,
    liveDraftDirectRef,
    liveInkPredictionRendererRef,
    liveStampDraftDirectRef,
    noteQuickShapePointerMoved,
    predictedInkTailStateRef,
    pressureCurve,
    pressureMinSize,
    rawPenInkPreviewStateRef,
    stabilizer,
    stagePointerFrameMapperCacheRef,
    stageRef,
    strokeGuideRef,
    tool,
    useVelocityPressure,
    velocitySensitivity,
    appendAuthoritativePredictedInkState,
    appendCausalPostCorrectionState,
    flushDirectLiveDraftNow,
    liveBrushPressureSamplesFor,
    liveInkStyleFor,
  } = h;
  const appendDrawingCrdtSampleSuffix: StudioCuttoonStagePointersApi["appendDrawingCrdtSampleSuffix"] = (
    ...args
  ) => api.appendDrawingCrdtSampleSuffix(...args);
  const appendFixedRateStrokeSamples: StudioCuttoonStagePointersApi["appendFixedRateStrokeSamples"] = (
    ...args
  ) => api.appendFixedRateStrokeSamples(...args);
  const consumeFreehandPointerBatch: StudioCuttoonStagePointersApi["consumeFreehandPointerBatch"] = (
    ...args
  ) => api.consumeFreehandPointerBatch(...args);
  const finishDrawingPointer: StudioCuttoonStagePointersApi["finishDrawingPointer"] = (
    ...args
  ) => api.finishDrawingPointer(...args);
  const updateBrushCursor: StudioCuttoonStagePointersApi["updateBrushCursor"] = (
    ...args
  ) => api.updateBrushCursor(...args);
  const updateStrokeGuide: StudioCuttoonStagePointersApi["updateStrokeGuide"] = (
    ...args
  ) => api.updateStrokeGuide(...args);

  function publishAuthoritativeFreehandSuffix(startSample: number): DrawEl | null {
    const authoritativeDrawing = drawingRef.current;
    if (!authoritativeDrawing) return null;
    if (h.pendingStrokeAdmissionRef?.current?.has(authoritativeDrawing.id)) {
      h.pendingStrokeAdmissionRef.current.update(authoritativeDrawing);
      return authoritativeDrawing;
    }
    inkMeshLivePreviewRuntimeRef.current?.synchronizeAuthoritative(
      authoritativeDrawing,
      liveBrushPressureSamplesFor(authoritativeDrawing),
    );
    appendStudioLivingInkAuthoritativeSuffix(authoritativeDrawing, startSample);
    appendStudioHokusaiAuthoritativeSuffix(authoritativeDrawing, startSample);
    drawingGesturePreviewPublisherRef.current.append(authoritativeDrawing, startSample);
    if (liveDraftDirectRef.current || liveStampDraftDirectRef.current) {
      if (causalPostCorrectionStateRef.current) {
        appendCausalPostCorrectionState(authoritativeDrawing, startSample);
      } else if (predictedInkTailStateRef.current) {
        appendAuthoritativePredictedInkState(authoritativeDrawing, startSample);
      }
      flushDirectLiveDraftNow(authoritativeDrawing);
    }
    appendDrawingCrdtSampleSuffix(authoritativeDrawing, startSample);
    return authoritativeDrawing;
  }

  drawingFixedRatePumpFrameRef.current = (frameTimeStamp: number) => {
    const drawing = drawingRef.current;
    const session = requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession();
    const filter = drawingFixedRateFilterRef.current;
    const clock = drawingFixedRatePumpClockRef.current;
    const pointerSample = drawingLastAuthoritativePointerRef.current;
    if (
      !drawing
      || !session
      || !filter
      || !clock
      || !pointerSample
      || (drawing.kind ?? "freehand") !== "freehand"
      || !isStudioStrokePointerEvent(session, pointerSample)
    ) {
      return false;
    }

    const frameClock = advanceFixedRateStrokeFrameClock(clock, frameTimeStamp);
    drawingFixedRatePumpClockRef.current = frameClock.state;
    const sampleClock = drawingFixedRateSampleClockRef.current;
    if (sampleClock) {
      drawingFixedRateSampleClockRef.current = advanceFixedRateStrokeSampleClockFloor(
        sampleClock,
        frameClock.watermark,
      );
    }
    const crdtSampleStart = Math.floor(drawing.points.length / 2);
    const transition = transitionFixedRateStrokeFilter(filter, {
      type: "advance",
      timeStamp: frameClock.watermark,
    });
    drawingFixedRateFilterRef.current = transition.state;
    appendFixedRateStrokeSamples(transition.emitted, pointerSample, 0);
    const nextSampleCount = Math.floor((drawingRef.current?.points.length ?? 0) / 2);
    if (nextSampleCount > crdtSampleStart) {
      publishAuthoritativeFreehandSuffix(crdtSampleStart);
    }
    const stage = stageRef.current;
    const pointerMapperCache = stagePointerFrameMapperCacheRef.current;
    const strokeGuidePointer = stage && pointerMapperCache
      ? pointerMapperCache.mapperFor(stage).pointFor(pointerSample)
      : null;
    updateStrokeGuide(
      strokeGuidePointer?.x ?? Number.NaN,
      strokeGuidePointer?.y ?? Number.NaN,
      true,
    );
    return true;
  };

  let lowLatencyPredictor: StudioLowLatencyPredictorInstance | null = null;
  let lowLatencyPredictorLoadStarted = false;
  const ensureLowLatencyPredictor = (): StudioLowLatencyPredictorInstance | null => {
    if (lowLatencyPredictor) return lowLatencyPredictor;
    if (!lowLatencyPredictorLoadStarted) {
      lowLatencyPredictorLoadStarted = true;
      void import("../studio-lowlatency-predictor")
        .then((mod) => {
          lowLatencyPredictor = new mod.StudioLowLatencyPredictor({
            maxHorizonMs: 16,
            maxLeadStepMultiple: 1.5,
            accelerationTrust: 0.5,
          });
        })
        .catch(() => {});
    }
    return null;
  };

  requireStudioDrawingPointerTransport(drawingPointerTransportRef).updatePorts({
    getLastAuthoritativePointer: () => drawingLastAuthoritativePointerRef.current,
    onAuthoritativeMove: (pointerEvent) => {
      const session = requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession();
      const drawing = drawingRef.current;
      if (
        tool !== "draw"
        || !session
        || !drawing
        || (drawing.kind ?? "freehand") !== "freehand"
        || !isStudioStrokePointerEvent(session, pointerEvent)
      ) {
        return;
      }
      const stage = stageRef.current;
      if (!stage) return;
      if (!consumeFreehandPointerBatch(
        stage,
        pointerEvent,
        canCollectStudioPointerPredictionsForActiveTail(
          STUDIO_POINTER_PREDICTION_ENABLED,
          session,
          predictedInkTailStateRef.current !== null,
        ),
      )) return;
      const pointerMapperCache = stagePointerFrameMapperCacheRef.current;
      if (!pointerMapperCache) return;
      const contactPoint = pointerMapperCache.mapperFor(stage).pointFor(pointerEvent);
      if (contactPoint) {
        ensureLowLatencyPredictor()?.push({
          x: contactPoint.x,
          y: contactPoint.y,
          timeStamp: pointerEvent.timeStamp,
          pressure: pointerEvent.pressure,
        });
      }
      updateBrushCursor(stage, pointerEvent, contactPoint, true);
      updateStrokeGuide(
        contactPoint?.x ?? Number.NaN,
        contactPoint?.y ?? Number.NaN,
        true,
      );
      if (drawMode === "pen" && contactPoint) noteQuickShapePointerMoved(contactPoint);
      if (contactPoint) {
        const foleyBridge = (globalThis as Record<PropertyKey, unknown>)[
          Symbol.for("toonstudio.liveStrokeFoleyBridge")
        ] as StudioLiveStrokeFoleyBridgeRuntime | undefined;
        foleyBridge?.studioLiveStrokeFoley.onStrokeMove({
          x: contactPoint.x,
          y: contactPoint.y,
          pressure: pointerEvent.pressure,
          tiltX: pointerEvent.tiltX,
          tiltY: pointerEvent.tiltY,
          timestampMs: pointerEvent.timeStamp,
          brushId: drawing.brushCatalogId ?? drawing.brush,
          drawMode: drawing.mode,
        });
      }
    },
    onRawPreviewMove: (pointerEvent) => {
      const session = requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession();
      const drawing = drawingRef.current;
      if (
        tool !== "draw"
        || !session
        || session.pointerType !== "pen"
        || !drawing
        || (drawing.kind ?? "freehand") !== "freehand"
        || !isStudioStrokePointerEvent(session, pointerEvent)
      ) {
        return;
      }
      const rawState = rawPenInkPreviewStateRef.current;
      const rawCursorWanted = (
        brushCursorRef.current !== null
        && isStudioBrushCursorMode(drawMode)
        && appSettingsRef.current.general.brushCursorStyle !== "none"
      );
      const rawGuideWanted = (
        strokeGuideRef.current !== null
        && appSettingsRef.current.general.showStrokeGuide
        && (drawingInputSettingsRef.current?.stabilizer ?? stabilizer) > 0
      );
      if (!rawState && !rawCursorWanted && !rawGuideWanted) return;
      const stage = stageRef.current;
      if (!stage) return;
      const pointerMapperCache = stagePointerFrameMapperCacheRef.current;
      if (!pointerMapperCache) return;
      const coordinateMapper = pointerMapperCache.mapperFor(stage);
      const contactPoint = coordinateMapper.pointFor(pointerEvent);
      if (rawState && contactPoint) {
        const settings = drawingInputSettingsRef.current;
        const previewPressure = advanceStudioBrushVelocityPressure(
          drawingVelocityPressureRef.current,
          {
            x: pointerEvent.clientX,
            y: pointerEvent.clientY,
            timeMs: pointerEvent.timeStamp,
            pointerType: pointerEvent.pointerType,
            pressure: pointerEvent.pressure,
          },
          {
            brushId: drawing.brush,
            rawMaterialPressure: drawing.mode === "pen" && Boolean(drawing.brushEnginePrograms?.material),
            pressureCurve: settings?.pressureCurve ?? pressureCurve,
            pressureMinSize: settings?.pressureMinSize ?? pressureMinSize,
            useVelocityPressure: settings?.useVelocityPressure ?? useVelocityPressure,
            velocitySensitivity: settings?.velocitySensitivity ?? velocitySensitivity,
            fallbackPressure: studioInkFallbackPressure(drawing.pressureModel),
          },
        ).pressure;
        const predictedLead = STUDIO_POINTER_PREDICTION_ENABLED
          ? ensureLowLatencyPredictor()?.predict(16) ?? null
          : null;
        const previewX = predictedLead ? predictedLead.x : contactPoint.x;
        const previewY = predictedLead ? predictedLead.y : contactPoint.y;
        const rawTransition = replaceStudioRawPenInkPreview(rawState, {
          pointerId: pointerEvent.pointerId,
          generation: rawState.generation,
          eligibility: currentRawPenInkPreviewEligibility(pointerEvent, drawing),
          point: {
            x: previewX,
            y: previewY,
            pressure: studioLiveBrushPressure(drawing, previewPressure),
          },
        });
        rawPenInkPreviewStateRef.current = rawTransition.state;
        liveInkPredictionRendererRef.current.apply(
          rawTransition.predictionSurface,
          liveInkStyleFor(drawing),
        );
      }
      updateBrushCursor(stage, pointerEvent, contactPoint, true);
      updateStrokeGuide(
        contactPoint?.x ?? Number.NaN,
        contactPoint?.y ?? Number.NaN,
        true,
      );
    },
    onDiscard: () => {
      lowLatencyPredictor?.reset();
      (
        (globalThis as Record<PropertyKey, unknown>)[
          Symbol.for("toonstudio.liveStrokeFoleyBridge")
        ] as StudioLiveStrokeFoleyBridgeRuntime | undefined
      )?.studioLiveStrokeFoley.onStrokeEnd();
      const activeSession = requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession();
      if (!drawingRef.current && !activeSession) return;
      const recovery = planStudioStrokeCancelOrAbortRecovery({
        activeSession,
        activeDrawing: drawingRef.current,
        lastAuthoritativePointer: drawingLastAuthoritativePointerRef.current,
      });
      if (recovery.action === "salvage-commit") {
        const strokeBackup = drawingRef.current;
        try {
          finishDrawingPointer(stageRef.current, recovery.fallbackPointer, {
            consumeReleaseSample: false,
          });
          return;
        } catch {
          if (strokeBackup && typeof h.salvageRejectedStroke === "function") {
            h.salvageRejectedStroke(strokeBackup, "포인터 세션 복구", "transport-interrupted");
          }
        }
      }
      discardDrawingPointerSession();
    },
    onFinish: (pointerEvent, request) => {
      lowLatencyPredictor?.reset();
      if (
        request.reason === "transport-abort"
        || request.reason === "lost-capture"
        || request.reason === "pointercancel-prefix"
        || request.reason === "stale-takeover"
      ) {
        recordStudioDrawingStabilityCounts({ interruptedStrokesSalvaged: 1 });
      }
      if (!request.cancelled && colorWheelTimerRef.current) {
        clearTimeout(colorWheelTimerRef.current);
        colorWheelTimerRef.current = null;
      }
      const strokeBackup = drawingRef.current;
      try {
        finishDrawingPointer(stageRef.current, pointerEvent, {
          consumeReleaseSample: request.consumeReleaseSample,
        });
      } catch (cause) {
        if (strokeBackup && typeof h.salvageRejectedStroke === "function") {
          h.salvageRejectedStroke(strokeBackup, "포인터 세션 복구", request.reason);
        }
        throw cause;
      }
    },
  });
  api.publishAuthoritativeFreehandSuffix = publishAuthoritativeFreehandSuffix;
}
