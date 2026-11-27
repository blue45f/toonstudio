/* Extracted stage pointer handlers from StudioCuttoonEditor.
 * Closures keep the original editor typing envelope via an `any` host bag. */
"use no memo";
// React Compiler 옵트아웃: 가변 호스트 백(h) 을 렌더마다 재대입해 공유하는 추출 패턴이라,
// 컴파일러가 h 참조 동일성만 보고 JSX/계산을 캐시하면 첫 렌더에서 UI 가 영구 동결된다
// (탭 전환 등 커밋된 상태 변경이 화면에 반영되지 않음).

import { assertStudioScopedDrawContinuation } from "../studio-collab/studio-scoped-write-mutation";
import { studioLiveBrushPressureSamples } from "../brush/studio-draw-rendering";
import { requireStudioDrawingPointerTransport } from "../brush/studio-drawing-pointer-transport";
import { studioInkFallbackPressure } from "../brush/studio-ink-pressure-model";
import { shouldOwnStudioCoalescedBatchDraft } from "../studio-coalesced-batch-mutation";
import { studioDrawElementSampleSlice } from "../live/studio-crdt-draw-bridge";
import { normalizeFixedRateStrokeSampleTimeStamps } from "../studio-fixed-rate-stroke-frame-pump";
import { isStudioPixelPencilRenderMode } from "../studio-pixel-pencil";
import {
  collectStudioStrokePointerBatch,
  isStudioStrokePointerEvent,
} from "../canvas/studio-pointer-input";
import { planStudioPredictedInkSuffixDraft } from "../studio-predicted-ink-tail";
import { syncStudioRawPenInkPreviewAuthority } from "../studio-raw-pen-ink-preview";
import {
  shouldSynchronizeStudioStagePointerPosition,
  snapshotStudioStagePointerBatchMapper,
  type StudioStagePointerBatchMapper,
} from "../canvas/studio-stage-pointer-coordinate";
import type { DrawEl } from "../studio-element-model";
import type { StudioStageLike } from "../canvas/studio-stage-handle-types";
import {
  createStudioCoalescedFrameBudgetTracker,
  decimateStudioCoalescedPointerBatch,
} from "./studio-cuttoon-coalesced-decimator";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";
import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";

export function bindStudioCuttoonStagePointersBatch(
  h: StudioCuttoonStagePointersHost,
  api: StudioCuttoonStagePointersApi,
) {
  const {
    advancedRulerSnapRef,
    causalPostCorrectionStateRef,
    drawingCrdtPublisherRef,
    drawingCrdtStrokeActiveRef,
    drawingFixedRateFilterRef,
    drawingFixedRateOwnedPointsRef,
    drawingFixedRateSampleClockRef,
    drawingImmediateBatchMutationRef,
    drawingImmediateCausalInputRef,
    drawingLastAuthoritativePointerRef,
    drawingPointerTransportRef,
    drawingPredictionBatchMutationRef,
    drawingPredictionPreviewRef,
    drawingRef,
    drawingStabilizerRef,
    drawingVelocityPressureRef,
    drawingVelocityRef,
    gpuLiveInkPinnedRef,
    gpuLiveSourceJournalRef,
    inkMeshLivePreviewModuleRef,
    inkMeshLivePreviewRuntimeRef,
    isometricAxisRayRef,
    liveDraftDirectRef,
    liveDynamicBrushDraftDirectRef,
    liveDynamicBrushOverlayRendererRef,
    liveRetainedMediaDraftDirectRef,
    liveRetainedMediaOverlayRendererRef,
    liveInkOverlayRendererRef,
    liveInkPredictionRendererRef,
    liveStampDraftDirectRef,
    liveStampOverlayRendererRef,
    liveWetInkDraftDirectRef,
    liveWetInkOverlayRendererRef,
    perspectiveRayRef,
    predictedInkTailStateRef,
    rawPenInkPreviewStateRef,
    stagePointerFrameMapperCacheRef,
    studioCrdtDocumentRef,
    liveInkStyleFor,
    previewCausalPostCorrectionTail,
    replacePredictedInkTail,
    scheduleDraft,
  } = h;
  const appendFreehandStrokePoint: StudioCuttoonStagePointersApi["appendFreehandStrokePoint"] = (
    ...args
  ) => api.appendFreehandStrokePoint(...args);
  const publishAuthoritativeFreehandSuffix: StudioCuttoonStagePointersApi["publishAuthoritativeFreehandSuffix"] = (
    startSample,
  ) => api.publishAuthoritativeFreehandSuffix(startSample);
  const coalescedBudgetTracker = createStudioCoalescedFrameBudgetTracker();

  function appendDrawingCrdtSampleSuffix(drawing: DrawEl, startSample: number): void {
    const crdtDocument = studioCrdtDocumentRef.current;
    if (!crdtDocument || !drawingCrdtStrokeActiveRef.current) return;
    drawingCrdtPublisherRef.current.append(drawing.id, {
      snapshot: drawing,
      startSample,
      publish: (latestDrawing: DrawEl, earliestSample: number) => {
        if (
          !drawingCrdtStrokeActiveRef.current
          || studioCrdtDocumentRef.current !== crdtDocument
        ) {
          throw new Error("실시간 협업 문서가 획 전송 전에 변경되었습니다.");
        }
        assertStudioScopedDrawContinuation(h.collaborationAccessRef, latestDrawing.id);
        const samples = studioDrawElementSampleSlice(latestDrawing, earliestSample);
        if (samples) crdtDocument.appendStrokeSamples(latestDrawing.id, samples);
      },
    });
  }

  function consumeFreehandPointerBatch(
    stage: StudioStageLike,
    pointerEvent: PointerEvent,
    includePredicted: boolean,
    options: {
      dispatchedPressureOverride?: number;
      authoritativeSource?: "coalesced-or-parent" | "parent-only";
      coordinateMapper?: StudioStagePointerBatchMapper;
    } = {},
  ): boolean {
    const session = requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession();
    if (!session || !isStudioStrokePointerEvent(session, pointerEvent)) return false;

    const predictionIsReplaceable = includePredicted && !pointerEvent.shiftKey;
    const batch = collectStudioStrokePointerBatch(session, pointerEvent, {
      includePredicted: predictionIsReplaceable,
      authoritativeSource: options.authoritativeSource,
    });
    requireStudioDrawingPointerTransport(drawingPointerTransportRef).replaceSession(batch.session);
    // Exact duplicate hardware deliveries have no document or preview work.
    if (batch.authoritative.length === 0 && batch.predicted.length === 0) return false;
    const batchStartNowMs = globalThis.performance?.now?.() ?? pointerEvent.timeStamp;
    const sampleClock = drawingFixedRateSampleClockRef.current;
    const sampleClockTransition = sampleClock && batch.authoritative.length > 0
      ? normalizeFixedRateStrokeSampleTimeStamps(
          sampleClock,
          batch.authoritative.map((sample) => (
            typeof sample.timeStamp === "number" ? sample.timeStamp : pointerEvent.timeStamp
          )),
          batchStartNowMs,
        )
      : null;
    if (sampleClockTransition) {
      drawingFixedRateSampleClockRef.current = sampleClockTransition.state;
    }
    const coordinateMapper = options.coordinateMapper
      ?? stagePointerFrameMapperCacheRef.current?.mapperFor(stage)
      ?? snapshotStudioStagePointerBatchMapper(stage);
    const crdtSampleStart = Math.floor((drawingRef.current?.points.length ?? 0) / 2);
    const activeDrawing = drawingRef.current;
    const budgetDecision = coalescedBudgetTracker.observeDelivery({
      nowMs: batchStartNowMs,
      sampleCount: batch.authoritative.length,
    });
    const decimationBypass =
      options.authoritativeSource === "parent-only"
      || Boolean(pointerEvent.shiftKey)
      || (activeDrawing !== null && isStudioPixelPencilRenderMode(activeDrawing.brush))
      || (activeDrawing?.mode === "pen" && Boolean(activeDrawing.brushEnginePrograms?.material));
    const decimatedAuthoritative = decimateStudioCoalescedPointerBatch(
      batch.authoritative,
      coordinateMapper,
      {
        tightBudget: budgetDecision.tightBudget,
        severeBudget: budgetDecision.severeBudget,
        coordinateScale: h.drawingInputSettingsRef?.current?.coordinateScale ?? h.effScale,
        bypass: decimationBypass,
      },
    );
    const mutableDirectSurfaceActive = (
      (
        liveDraftDirectRef.current
        && (
          liveInkOverlayRendererRef.current.isActive
          || (activeDrawing !== null && isStudioPixelPencilRenderMode(activeDrawing.brush))
        )
      )
      || (
        liveStampDraftDirectRef.current
        && liveStampOverlayRendererRef.current.isActive
      )
      || (
        liveDynamicBrushDraftDirectRef.current
        && liveDynamicBrushOverlayRendererRef.current.isActive
      )
      || (
        liveRetainedMediaDraftDirectRef.current
        && liveRetainedMediaOverlayRendererRef.current.isActive
      )
      || (
        liveWetInkDraftDirectRef.current
        && liveWetInkOverlayRendererRef.current.isActive
      )
    );
    const compactGpuSourceJournalActive = gpuLiveInkPinnedRef.current
      && gpuLiveSourceJournalRef.current !== null;
    const immediateBatchMutation = !compactGpuSourceJournalActive
      && shouldOwnStudioCoalescedBatchDraft({
        authoritativeSampleCount: decimatedAuthoritative.entries.length,
        gpuPinned: gpuLiveInkPinnedRef.current,
        fixedRateFilterActive: drawingFixedRateFilterRef.current !== null,
        immediateCausalInput: drawingImmediateCausalInputRef.current,
        mutableDirectSurfaceActive,
      });
    if (immediateBatchMutation && drawingRef.current) {
      const current = drawingRef.current;
      const ownsBatchArrays = current.points === drawingFixedRateOwnedPointsRef.current;
      const reuseOrCloneBatch = <T,>(values: T[] | undefined): T[] | undefined => {
        if (!values) return values;
        return ownsBatchArrays ? values : [...values];
      };
      const batchDraft: DrawEl = {
        ...current,
        points: ownsBatchArrays ? current.points : [...current.points],
        pressures: reuseOrCloneBatch(current.pressures),
        tiltXs: reuseOrCloneBatch(current.tiltXs),
        tiltYs: reuseOrCloneBatch(current.tiltYs),
        twists: reuseOrCloneBatch(current.twists),
        speeds: reuseOrCloneBatch(current.speeds),
        tangentialPressures: reuseOrCloneBatch(current.tangentialPressures),
        altitudeAngles: reuseOrCloneBatch(current.altitudeAngles),
        azimuthAngles: reuseOrCloneBatch(current.azimuthAngles),
        contactWidths: reuseOrCloneBatch(current.contactWidths),
        contactHeights: reuseOrCloneBatch(current.contactHeights),
        sampleTimeOffsets: reuseOrCloneBatch(current.sampleTimeOffsets),
      };
      drawingRef.current = batchDraft;
      drawingFixedRateOwnedPointsRef.current = batchDraft.points;
      drawingImmediateBatchMutationRef.current = true;
    }
    try {
      for (const [sampleIndex, sample] of batch.authoritative.entries()) {
        if (!decimatedAuthoritative.keptIndices.has(sampleIndex)) continue;
        const point =
          decimatedAuthoritative.pointsByIndex.get(sampleIndex)
          ?? coordinateMapper.pointFor(sample);
        if (point) {
          drawingLastAuthoritativePointerRef.current = sample;
          appendFreehandStrokePoint(
            point,
            sample,
            sample === pointerEvent ? options.dispatchedPressureOverride : undefined,
            sampleClockTransition?.timeStamps[sampleIndex],
          );
        }
      }
      drawingImmediateBatchMutationRef.current = false;
      coalescedBudgetTracker.recordBatchCost(
        (globalThis.performance?.now?.() ?? batchStartNowMs) - batchStartNowMs,
      );

      const authoritativeDrawing = batch.authoritative.length > 0
        ? publishAuthoritativeFreehandSuffix(crdtSampleStart)
        : drawingRef.current;
      if (authoritativeDrawing && h.pendingStrokeAdmissionRef?.current?.has(authoritativeDrawing.id)) return false;
      const authoritativePointCount = Math.floor((authoritativeDrawing?.points.length ?? 0) / 2);
      const rawPreviewState = rawPenInkPreviewStateRef.current;
      const canonicalPredictionTail = predictedInkTailStateRef.current;
      if (
        authoritativeDrawing
        && rawPreviewState
        && canonicalPredictionTail
        && session.pointerId === rawPreviewState.pointerId
      ) {
        const rawSync = syncStudioRawPenInkPreviewAuthority(rawPreviewState, {
          pointerId: rawPreviewState.pointerId,
          generation: rawPreviewState.generation,
          authoritativeTail: canonicalPredictionTail,
        });
        rawPenInkPreviewStateRef.current = rawSync.state;
        liveInkPredictionRendererRef.current.apply(
          rawSync.predictionSurface,
          liveInkStyleFor(authoritativeDrawing),
        );
      }
      if (
        immediateBatchMutation
        && authoritativePointCount > crdtSampleStart
        && !liveDraftDirectRef.current
        && !liveStampDraftDirectRef.current
      ) {
        scheduleDraft(authoritativeDrawing);
      }
      if (
        authoritativeDrawing
        && batch.predicted.length > 0
        && !liveStampDraftDirectRef.current
      ) {
        const authoritativePerspectiveRay = perspectiveRayRef.current;
        const authoritativeIsometricRay = isometricAxisRayRef.current;
        const authoritativeAdvancedRulerSnap = advancedRulerSnapRef.current;
        const authoritativeFixedRateFilter = drawingFixedRateFilterRef.current;
        const authoritativeStabilizer = drawingStabilizerRef.current;
        const authoritativeVelocity = drawingVelocityRef.current;
        const authoritativeVelocityPressure = drawingVelocityPressureRef.current;
        try {
          drawingPredictionPreviewRef.current = true;
          const suffixDraftCandidate = liveDraftDirectRef.current && predictedInkTailStateRef.current
            ? planStudioPredictedInkSuffixDraft({
                points: authoritativeDrawing.points,
                pressures: authoritativeDrawing.pressures,
                tiltXs: authoritativeDrawing.tiltXs,
                tiltYs: authoritativeDrawing.tiltYs,
                twists: authoritativeDrawing.twists,
                speeds: authoritativeDrawing.speeds,
                tangentialPressures: authoritativeDrawing.tangentialPressures,
                altitudeAngles: authoritativeDrawing.altitudeAngles,
                azimuthAngles: authoritativeDrawing.azimuthAngles,
                contactWidths: authoritativeDrawing.contactWidths,
                contactHeights: authoritativeDrawing.contactHeights,
                sampleTimeOffsets: authoritativeDrawing.sampleTimeOffsets,
                fallbackPressure: studioInkFallbackPressure(authoritativeDrawing.pressureModel),
              })
            : null;
          const suffixDraft = suffixDraftCandidate?.authoritativeSampleCount === authoritativePointCount
            ? suffixDraftCandidate
            : null;
          const predictionStartSampleIndex = suffixDraft?.draftPredictionStartSampleIndex
            ?? authoritativePointCount;
          drawingRef.current = {
            ...authoritativeDrawing,
            points: suffixDraft?.points ?? [...authoritativeDrawing.points],
            pressures: suffixDraft
              ? suffixDraft.pressures
              : authoritativeDrawing.pressures ? [...authoritativeDrawing.pressures] : undefined,
            tiltXs: suffixDraft
              ? suffixDraft.tiltXs
              : authoritativeDrawing.tiltXs ? [...authoritativeDrawing.tiltXs] : undefined,
            tiltYs: suffixDraft
              ? suffixDraft.tiltYs
              : authoritativeDrawing.tiltYs ? [...authoritativeDrawing.tiltYs] : undefined,
            twists: suffixDraft
              ? suffixDraft.twists
              : authoritativeDrawing.twists ? [...authoritativeDrawing.twists] : undefined,
            speeds: suffixDraft
              ? suffixDraft.speeds
              : authoritativeDrawing.speeds ? [...authoritativeDrawing.speeds] : undefined,
            tangentialPressures: suffixDraft
              ? suffixDraft.tangentialPressures
              : authoritativeDrawing.tangentialPressures
                ? [...authoritativeDrawing.tangentialPressures]
                : undefined,
            altitudeAngles: suffixDraft
              ? suffixDraft.altitudeAngles
              : authoritativeDrawing.altitudeAngles ? [...authoritativeDrawing.altitudeAngles] : undefined,
            azimuthAngles: suffixDraft
              ? suffixDraft.azimuthAngles
              : authoritativeDrawing.azimuthAngles ? [...authoritativeDrawing.azimuthAngles] : undefined,
            contactWidths: suffixDraft
              ? suffixDraft.contactWidths
              : authoritativeDrawing.contactWidths ? [...authoritativeDrawing.contactWidths] : undefined,
            contactHeights: suffixDraft
              ? suffixDraft.contactHeights
              : authoritativeDrawing.contactHeights ? [...authoritativeDrawing.contactHeights] : undefined,
            sampleTimeOffsets: suffixDraft
              ? suffixDraft.sampleTimeOffsets
              : authoritativeDrawing.sampleTimeOffsets ? [...authoritativeDrawing.sampleTimeOffsets] : undefined,
          };
          drawingPredictionBatchMutationRef.current = true;
          for (const sample of batch.predicted) {
            const point = coordinateMapper.pointFor(sample);
            if (point) appendFreehandStrokePoint(point, sample);
          }
          const predictedPreview = drawingRef.current;
          drawingRef.current = authoritativeDrawing;
          if (predictedPreview && predictedPreview !== authoritativeDrawing) {
            if (liveDraftDirectRef.current && causalPostCorrectionStateRef.current) {
              previewCausalPostCorrectionTail(predictedPreview, authoritativePointCount);
            } else if (liveDraftDirectRef.current && predictedInkTailStateRef.current) {
              replacePredictedInkTail(predictedPreview, predictionStartSampleIndex);
            } else {
              scheduleDraft(predictedPreview);
            }
            const inkMeshModule = inkMeshLivePreviewModuleRef.current;
            const inkMeshRuntime = inkMeshLivePreviewRuntimeRef.current;
            if (inkMeshModule && inkMeshRuntime) {
              try {
                const meshPreview = suffixDraft
                  ? inkMeshModule.expandStudioInkMeshPredictedSuffix(
                      authoritativeDrawing,
                      predictedPreview,
                      predictionStartSampleIndex,
                    )
                  : predictedPreview;
                const meshReceipt = inkMeshRuntime.previewPredicted(
                  meshPreview,
                  authoritativePointCount,
                  studioLiveBrushPressureSamples(meshPreview),
                );
                if (inkMeshModule.isStudioInkMeshRenderedReceipt(meshReceipt)) {
                  liveInkPredictionRendererRef.current.clear();
                }
              } catch {
                inkMeshRuntime.cancel();
              }
            }
          }
        } finally {
          drawingPredictionBatchMutationRef.current = false;
          drawingPredictionPreviewRef.current = false;
          drawingRef.current = authoritativeDrawing;
          perspectiveRayRef.current = authoritativePerspectiveRay;
          isometricAxisRayRef.current = authoritativeIsometricRay;
          advancedRulerSnapRef.current = authoritativeAdvancedRulerSnap;
          drawingFixedRateFilterRef.current = authoritativeFixedRateFilter;
          drawingStabilizerRef.current = authoritativeStabilizer;
          drawingVelocityRef.current = authoritativeVelocity;
          drawingVelocityPressureRef.current = authoritativeVelocityPressure;
        }
      }
    } finally {
      drawingImmediateBatchMutationRef.current = false;
      drawingPredictionBatchMutationRef.current = false;
      if (
        shouldSynchronizeStudioStagePointerPosition(
          stage.getContent(),
          pointerEvent.target,
        )
      ) {
        stage.setPointersPositions(pointerEvent);
      }
    }
    return true;
  }
  api.appendDrawingCrdtSampleSuffix = appendDrawingCrdtSampleSuffix;
  api.consumeFreehandPointerBatch = consumeFreehandPointerBatch;
}
