/* Extracted stage pointer handlers from StudioCuttoonEditor.
 * Closures keep the original editor typing envelope via an `any` host bag. */
"use no memo";
// React Compiler 옵트아웃: 가변 호스트 백(h) 을 렌더마다 재대입해 공유하는 추출 패턴이라,
// 컴파일러가 h 참조 동일성만 보고 JSX/계산을 캐시하면 첫 렌더에서 UI 가 영구 동결된다
// (탭 전환 등 커밋된 상태 변경이 화면에 반영되지 않음).

import { resolveStudioBrushReleasePressure } from "../brush/studio-brush-velocity-pressure";
import { studioInkFallbackPressure } from "../brush/studio-ink-pressure-model";
import { transitionFixedRateStrokeFilter } from "../studio-fixed-rate-stroke-filter";
import { normalizeStudioPersistedPointerChannels } from "../studio-persisted-pointer-channels";
import {
  planStudioPointerReleaseEndpoint,
  type StudioPointerReleaseEndpointSample,
} from "../canvas/studio-pointer-release-endpoint-plan";
import type { StudioStagePointerBatchMapper } from "../canvas/studio-stage-pointer-coordinate";
import { flushStudioStrokeStabilizerEndpoint } from "../brush/studio-stroke-stabilizer";
import { flushStudioThinLineInkInput } from "../studio-thin-line-ink-input-v1";
import { frozenStatus6Text } from "../status-i18n/studio-frozen6-status-i18n";
import type { DrawEl } from "../studio-element-model";
import type { StudioStageLike } from "../canvas/studio-stage-handle-types";
import {
  sanitizeStudioLiftReleaseRawPressure,
  stabilizeStudioStrokeLiftTail,
} from "./studio-cuttoon-stroke-tail-stabilizer";
import { bindStudioCuttoonStagePointersReleaseSpecialist } from "./studio-cuttoon-stage-pointers-release-specialist";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";
import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";

export function bindStudioCuttoonStagePointersRelease(
  h: StudioCuttoonStagePointersHost,
  api: StudioCuttoonStagePointersApi,
) {
  bindStudioCuttoonStagePointersReleaseSpecialist(h, api, {
    physicsFrameUnverified: () =>
      frozenStatus6Text(
        "studio.frozenStatus6.pointersRelease.physicsFrameUnverified",
        "최종 물리 프레임을 검증하지 못했습니다.",
      ),
    textureResultUnverified: () =>
      frozenStatus6Text(
        "studio.frozenStatus6.pointersRelease.textureResultUnverified",
        "최종 질감 결과를 검증하지 못했습니다.",
      ),
  });

  const {
    appendStudioHokusaiAuthoritativeSuffix,
    appendStudioLivingInkAuthoritativeSuffix,
    causalPostCorrectionStateRef,
    drawingCrdtPublisherRef,
    drawingFixedRateFilterRef,
    drawingInkTimeOriginRef,
    drawingInputSettingsRef,
    drawingPrecisionStabilizerBridgeRef,
    drawingRef,
    drawingStabilizerRef,
    drawingThinLineInkInputRef,
    hokusaiLiveFinalizingRef,
    hokusaiLiveStrokeRef,
    livingInkFinalizingRef,
    livingInkStrokeRef,
    pressureCurve,
    pressureMinSize,
    setLivingInkBusy,
    appendCausalPostCorrectionState,
    flushDirectLiveDraftNow,
    gpuLiveInkPinnedRef,
    sealCausalPostCorrectionState,
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
  const updateActiveShapeEndpoint: StudioCuttoonStagePointersApi["updateActiveShapeEndpoint"] = (
    ...args
  ) => api.updateActiveShapeEndpoint(...args);
  const finishStudioLivingInkStroke: StudioCuttoonStagePointersApi["finishStudioLivingInkStroke"] = (
    ...args
  ) => api.finishStudioLivingInkStroke(...args);
  const rejectStudioLivingInkFailedStroke: StudioCuttoonStagePointersApi["rejectStudioLivingInkFailedStroke"] = (
    ...args
  ) => api.rejectStudioLivingInkFailedStroke(...args);
  const finishStudioHokusaiLiveStroke: StudioCuttoonStagePointersApi["finishStudioHokusaiLiveStroke"] = (
    ...args
  ) => api.finishStudioHokusaiLiveStroke(...args);
  const rejectStudioHokusaiFailedStroke: StudioCuttoonStagePointersApi["rejectStudioHokusaiFailedStroke"] = (
    ...args
  ) => api.rejectStudioHokusaiFailedStroke(...args);

  function releaseEndpointPointerSample(
    pointerEvent: PointerEvent,
    current: DrawEl,
  ): StudioPointerReleaseEndpointSample {
    const channels = normalizeStudioPersistedPointerChannels(pointerEvent, {
      timeOriginMilliseconds:
        drawingInkTimeOriginRef.current ?? pointerEvent.timeStamp,
      previousTimeOffsetMilliseconds:
        current.sampleTimeOffsets?.at(-1) ?? 0,
      sourceTimeMilliseconds: pointerEvent.timeStamp,
    });
    return {
      pointerType: pointerEvent.pointerType,
      pressure: pointerEvent.pressure,
      tiltX: pointerEvent.tiltX,
      tiltY: pointerEvent.tiltY,
      twist: pointerEvent.twist,
      tangentialPressure: pointerEvent.tangentialPressure,
      altitudeAngle: pointerEvent.altitudeAngle,
      azimuthAngle: pointerEvent.azimuthAngle,
      width: pointerEvent.width,
      height: pointerEvent.height,
      sampleTimeOffset: channels.timeOffsetMilliseconds,
    };
  }

  function sealStudioDrawReleaseInput(
    stage: StudioStageLike | null,
    pointerEvent: PointerEvent,
    consumeReleaseSample: boolean,
    coordinateMapper?: StudioStagePointerBatchMapper,
  ): DrawEl | null {
    const inputSettings = drawingInputSettingsRef.current;
    let authoritativeLiveStroke: DrawEl | null = null;
    let selectedGpuFinalCrdtFlushDeferred = false;
    if (
      consumeReleaseSample
      && drawingRef.current
      && (drawingRef.current.kind ?? "freehand") !== "freehand"
      && stage
    ) {
      updateActiveShapeEndpoint(stage, pointerEvent, false);
    }
    const releaseLastContactPressure = drawingRef.current?.pressures?.at(-1)
      ?? studioInkFallbackPressure(drawingRef.current?.pressureModel);
    if (
      consumeReleaseSample
      && drawingRef.current
      && (drawingRef.current.kind ?? "freehand") === "freehand"
      && stage
    ) {
      const rawMaterialPressure =
        drawingRef.current.mode === "pen"
        && Boolean(drawingRef.current.brushEnginePrograms?.material);
      const guardedRawPressure = sanitizeStudioLiftReleaseRawPressure({
        pointerType: pointerEvent.pointerType,
        rawPressure: pointerEvent.pressure,
        lastContactPressure: releaseLastContactPressure,
        rawMaterialPressure,
      });
      consumeFreehandPointerBatch(stage, pointerEvent, false, {
        // 마우스 릴리스도 마지막 접촉 필압을 보존하며, 스타일러스 리프트 스파이크는 사전에 차단한다.
        dispatchedPressureOverride: resolveStudioBrushReleasePressure({
          brushId: drawingRef.current.brush,
          rawMaterialPressure,
          pointerType: pointerEvent.pointerType,
          rawPressure: guardedRawPressure,
          lastContactPressure: releaseLastContactPressure,
          pressureCurve: inputSettings?.pressureCurve ?? pressureCurve,
          pressureMinSize: inputSettings?.pressureMinSize ?? pressureMinSize,
          fallbackPressure: releaseLastContactPressure,
        }),
        authoritativeSource: "parent-only",
        coordinateMapper,
      });
    }
    if (drawingRef.current && (drawingRef.current.kind ?? "freehand") === "freehand") {
      let crdtReleaseSampleStart = Math.floor(drawingRef.current.points.length / 2);
      const fixedRateState = drawingFixedRateFilterRef.current;
      if (fixedRateState) {
        const released = transitionFixedRateStrokeFilter(fixedRateState, { type: "release" });
        drawingFixedRateFilterRef.current = released.state;
        appendFixedRateStrokeSamples(released.emitted, pointerEvent, 0);
      } else {
        const liveState = drawingStabilizerRef.current;
        const flushed =
          drawingPrecisionStabilizerBridgeRef.current?.flush()
          ?? (liveState ? flushStudioStrokeStabilizerEndpoint(liveState) : null);
        if (flushed) {
          drawingStabilizerRef.current = flushed.state;
          const current = drawingRef.current;
          const endpointPlan = planStudioPointerReleaseEndpoint({
            stroke: current,
            endpoint: { x: flushed.point[0], y: flushed.point[1] },
            pointer: releaseEndpointPointerSample(pointerEvent, current),
            pressureCurve: inputSettings?.pressureCurve ?? pressureCurve,
            pressureMinSize: inputSettings?.pressureMinSize ?? pressureMinSize,
          });
          if (endpointPlan.appended) drawingRef.current = endpointPlan.stroke;
        } else if (drawingThinLineInkInputRef.current) {
          const thinLineFlush = flushStudioThinLineInkInput(drawingThinLineInkInputRef.current);
          drawingThinLineInkInputRef.current = thinLineFlush.state;
          const current = drawingRef.current;
          const endpointPlan = planStudioPointerReleaseEndpoint({
            stroke: current,
            endpoint: { x: thinLineFlush.x, y: thinLineFlush.y },
            pointer: releaseEndpointPointerSample(pointerEvent, current),
            pressureCurve: inputSettings?.pressureCurve ?? pressureCurve,
            pressureMinSize: inputSettings?.pressureMinSize ?? pressureMinSize,
          });
          if (endpointPlan.appended) drawingRef.current = endpointPlan.stroke;
        }
      }
      if (consumeReleaseSample && drawingRef.current) {
        const tailStabilized = stabilizeStudioStrokeLiftTail(drawingRef.current, {
          pointerType: pointerEvent.pointerType,
          releaseRawPressure:
            typeof pointerEvent.pressure === "number" ? pointerEvent.pressure : 0,
          coordinateScale: inputSettings?.coordinateScale ?? h.effScale,
        });
        if (tailStabilized.changed) {
          drawingRef.current = tailStabilized.stroke;
          crdtReleaseSampleStart = Math.min(
            crdtReleaseSampleStart,
            Math.floor(drawingRef.current.points.length / 2),
          );
          if (
            (tailStabilized.removedTailSampleCount > 0 || tailStabilized.clampedTailEndpoint)
            && (h.liveDraftDirectRef?.current || h.liveStampDraftDirectRef?.current)
            && typeof h.exitDirectLiveDraft === "function"
          ) {
            h.exitDirectLiveDraft();
          }
        }
      }
      if (drawingRef.current && h.pendingStrokeAdmissionRef?.current?.has(drawingRef.current.id)) {
        h.pendingStrokeAdmissionRef.current.update(drawingRef.current);
        return drawingRef.current;
      }
      if (drawingRef.current) {
        appendDrawingCrdtSampleSuffix(drawingRef.current, crdtReleaseSampleStart);
        appendStudioLivingInkAuthoritativeSuffix(
          drawingRef.current,
          crdtReleaseSampleStart,
        );
        appendStudioHokusaiAuthoritativeSuffix(
          drawingRef.current,
          crdtReleaseSampleStart,
        );
      }
      const causalPostCorrection = causalPostCorrectionStateRef.current;
      if (drawingRef.current && causalPostCorrection?.phase === "active") {
        const sourceSampleCount = Math.floor(drawingRef.current.points.length / 2);
        if (sourceSampleCount > causalPostCorrection.sourceSampleCount) {
          appendCausalPostCorrectionState(
            drawingRef.current,
            causalPostCorrection.sourceSampleCount,
          );
        }
        drawingRef.current = sealCausalPostCorrectionState(drawingRef.current);
      }
      authoritativeLiveStroke = drawingRef.current as DrawEl;
      flushDirectLiveDraftNow(authoritativeLiveStroke);
      if (gpuLiveInkPinnedRef.current) {
        drawingCrdtPublisherRef.current.cancel(authoritativeLiveStroke.id);
        selectedGpuFinalCrdtFlushDeferred = true;
      } else {
        drawingCrdtPublisherRef.current.flush(authoritativeLiveStroke.id);
      }
    }
    if (drawingRef.current && !selectedGpuFinalCrdtFlushDeferred) {
      drawingCrdtPublisherRef.current.flush(drawingRef.current.id);
    }
    return authoritativeLiveStroke;
  }

  function finishStudioSpecialistStroke(
    finished: DrawEl,
  ): "ordinary" | "handled" | "handled-preserve-ink" {
    const livingInkStroke = livingInkStrokeRef?.current;
    if (livingInkStroke?.strokeId === finished.id) {
      if (!livingInkStroke.failed) {
        appendStudioLivingInkAuthoritativeSuffix(
          finished,
          livingInkStroke.forwardedSampleCount,
        );
        livingInkStroke.finalDrawing = finished;
        livingInkStroke.finishing = true;
        livingInkFinalizingRef.current = true;
        setLivingInkBusy(true);
        void finishStudioLivingInkStroke(livingInkStroke, finished);
        return "handled-preserve-ink";
      }
      rejectStudioLivingInkFailedStroke(
        livingInkStroke,
        "물리 계산 또는 표시 영수증이 중단되었습니다.",
      );
      return "handled";
    }
    const hokusaiStroke = hokusaiLiveStrokeRef?.current;
    if (hokusaiStroke?.strokeId === finished.id) {
      if (!hokusaiStroke.failed) {
        appendStudioHokusaiAuthoritativeSuffix(
          finished,
          hokusaiStroke.forwardedSampleCount,
        );
        hokusaiStroke.finalDrawing = finished;
        hokusaiStroke.finishing = true;
        hokusaiLiveFinalizingRef.current = true;
        // session.finish() waits for the latest appended sequence to be presented and acknowledged
        // before it posts the canonical finish. The bounded vector tail remains fail-visible during
        // that async handshake, including a stabilizer endpoint appended on pointer-up.
        void finishStudioHokusaiLiveStroke(hokusaiStroke, finished);
        return "handled-preserve-ink";
      }
      rejectStudioHokusaiFailedStroke(
        hokusaiStroke,
        "Worker 또는 표면 영수증이 중단되었습니다.",
      );
      return "handled";
    }
    return "ordinary";
  }

  api.releaseEndpointPointerSample = releaseEndpointPointerSample;
  api.sealStudioDrawReleaseInput = sealStudioDrawReleaseInput;
  api.finishStudioSpecialistStroke = finishStudioSpecialistStroke;
}
