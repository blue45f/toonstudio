import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import {
  studioLiveBrushEffectiveDiameter,
  studioLiveBrushPressure,
  studioLiveBrushPressureSamples,
} from "../brush/studio-draw-rendering";
import { claimStudioStrokeSurfaceLifecycle } from "../brush/studio-stroke-surface-route";
import type {
  StudioLiveInkPredictionRenderer,
  StudioLiveInkStrokeStyle,
} from "../live/studio-live-ink-overlay";
import type {
  StudioGpuLiveStrokePlan,
  StudioGpuLiveStrokePlanner,
} from "../render/studio-webgpu-live-stroke-plan";
import { CANVAS_W } from "../studio-assets";
import { selectStudioCausalInkSamples } from "../studio-causal-ink";
import {
  appendStudioCausalPostCorrection,
  createStudioCausalPostCorrectionState,
  type StudioCausalPostCorrectionState,
} from "../studio-causal-post-correction";
import type { DrawEl } from "../studio-element-model";
import {
  studioHokusaiSamplesFromDrawElement,
  studioLivingInkSamplesFromDrawElement,
} from "../studio-legacy-editor-runtime-helpers";
import type { StudioLivingInkExecutionConfig } from "../studio-living-ink-execution-protocol";
import type { StudioLivingInkAcceptedAuthority } from "../studio-living-ink-product-admission";
import type { StudioLivingInkStudioCoordinator } from "../studio-living-ink-studio-coordinator";
import type {
  StudioHokusaiLiveOverlaySurfaceState,
  StudioHokusaiPinnedLiveStroke,
  StudioLivingInkOverlaySurfaceState,
  StudioLivingInkPinnedStroke,
} from "../studio-page-editor-types";
import {
  appendStudioAuthoritativeInk,
  createStudioPredictedInkTailState,
  replaceStudioPredictedInkTail,
  type StudioPredictedInkTailState,
} from "../studio-predicted-ink-tail";
import {
  isStudioRawPenInkPreviewEligible,
  type StudioRawPenInkPreviewEligibility,
  type StudioRawPenInkPreviewState,
} from "../studio-raw-pen-ink-preview";

export function buildStudioGpuLiveStrokePlan({
  el, options, gpuLiveStrokePlannerRef, gpuLiveOperationOrderKeyRef,
}: {
  readonly el: DrawEl;
  readonly options?: { sealEndpoint?: boolean; correctedEl?: DrawEl | null };
  readonly gpuLiveStrokePlannerRef: MutableRefObject<StudioGpuLiveStrokePlanner | null>;
  readonly gpuLiveOperationOrderKeyRef: MutableRefObject<string | null>;
}): StudioGpuLiveStrokePlan | null {
  const planner = gpuLiveStrokePlannerRef.current;
  if (!planner) return null;
  const opts = options ?? {};
  const samples = selectStudioCausalInkSamples({
    points: el.points,
    pressures: el.pressures,
    pressureModel: el.pressureModel,
    minDistance: el.sampleSpacing ?? 0,
    sealEndpoint: opts.sealEndpoint ?? false,
  });
  const correctedSamples = opts.correctedEl
    ? selectStudioCausalInkSamples({
        points: opts.correctedEl.points,
        pressures: opts.correctedEl.pressures,
        pressureModel: opts.correctedEl.pressureModel,
        minDistance: opts.correctedEl.sampleSpacing ?? 0,
        sealEndpoint: true,
      })
    : null;
  return planner({
    id: el.id,
    points: samples.flatMap(({ x, y }) => [x, y]),
    pressures: samples.map(({ pressure }) => studioLiveBrushPressure(el, pressure)),
    ...(correctedSamples
      ? {
          correctedPoints: correctedSamples.flatMap(({ x, y }) => [x, y]),
          correctedPressures: correctedSamples.map(({ pressure }) =>
            studioLiveBrushPressure(opts.correctedEl ?? el, pressure),
          ),
        }
      : {}),
    color: el.stroke,
    size: studioLiveBrushEffectiveDiameter(el),
    pressureModel: el.pressureModel,
    paintModel: el.paintModel,
    opacity: el.opacity ?? 1,
    composite: el.mode === "eraser" ? "erase" : "normal",
    orderKey: gpuLiveOperationOrderKeyRef.current ?? el.id,
    symmetry: el.symmetry,
    destination: "transparent-overlay",
  });
}

export function runStudioStartCausalPostCorrection({
  el, postCorrection, preserveCorners, predictedInkTailStateRef, rawPenInkPreviewStateRef,
  causalPostCorrectionStateRef, restoreCausalPostCorrectionTail,
}: {
  readonly el: DrawEl;
  readonly postCorrection: number;
  readonly preserveCorners: boolean;
  readonly predictedInkTailStateRef: MutableRefObject<StudioPredictedInkTailState | null>;
  readonly rawPenInkPreviewStateRef: MutableRefObject<StudioRawPenInkPreviewState | null>;
  readonly causalPostCorrectionStateRef: MutableRefObject<StudioCausalPostCorrectionState | null>;
  readonly restoreCausalPostCorrectionTail: (el: DrawEl) => void;
}): void {
  predictedInkTailStateRef.current = null;
  rawPenInkPreviewStateRef.current = null;
  const transition = appendStudioCausalPostCorrection(
    createStudioCausalPostCorrectionState({
      strength: postCorrection,
      preserveCorners,
    }),
    el.points,
  );
  causalPostCorrectionStateRef.current = transition.state;
  restoreCausalPostCorrectionTail(el);
}

export function runStudioStartPredictedInkTail({
  el, causalPostCorrectionStateRef, predictedInkTailStateRef, liveInkPredictionRendererRef,
  liveBrushPressureSamplesFor, liveInkStyleFor,
}: {
  readonly el: DrawEl;
  readonly causalPostCorrectionStateRef: MutableRefObject<StudioCausalPostCorrectionState | null>;
  readonly predictedInkTailStateRef: MutableRefObject<StudioPredictedInkTailState | null>;
  readonly liveInkPredictionRendererRef: MutableRefObject<StudioLiveInkPredictionRenderer>;
  readonly liveBrushPressureSamplesFor: (el: DrawEl, count?: number) => number[];
  readonly liveInkStyleFor: (el: DrawEl) => StudioLiveInkStrokeStyle;
}): void {
  causalPostCorrectionStateRef.current = null;
  const initial = appendStudioAuthoritativeInk(createStudioPredictedInkTailState(), {
    points: el.points.slice(0, 2),
    pressures: liveBrushPressureSamplesFor(el, 1),
  });
  predictedInkTailStateRef.current = initial.state;
  liveInkPredictionRendererRef.current.apply(initial.predictionSurface, liveInkStyleFor(el));
}

export function runStudioArmTransientPenInkSurfaces({
  input, currentRawPenInkPreviewEligibility, startCausalPostCorrection,
  startPredictedInkTail, armRawPenInkPreview, causalPostCorrectionStateRef,
  predictedInkTailStateRef, rawPenInkPreviewStateRef, liveInkPredictionRendererRef,
}: {
  readonly input: {
    pointerEvent: PointerEvent;
    drawing: DrawEl;
    causalPostCorrectionEligible: boolean;
    nativePredictionEligible: boolean;
  };
  readonly currentRawPenInkPreviewEligibility: (
    pointerEvent: PointerEvent,
    drawing: DrawEl,
  ) => StudioRawPenInkPreviewEligibility;
  readonly startCausalPostCorrection: (el: DrawEl) => void;
  readonly startPredictedInkTail: (el: DrawEl) => void;
  readonly armRawPenInkPreview: (
    pointerEvent: PointerEvent,
    eligibility: StudioRawPenInkPreviewEligibility,
  ) => void;
  readonly causalPostCorrectionStateRef: MutableRefObject<StudioCausalPostCorrectionState | null>;
  readonly predictedInkTailStateRef: MutableRefObject<StudioPredictedInkTailState | null>;
  readonly rawPenInkPreviewStateRef: MutableRefObject<StudioRawPenInkPreviewState | null>;
  readonly liveInkPredictionRendererRef: MutableRefObject<StudioLiveInkPredictionRenderer>;
}): void {
  const rawEligibility = currentRawPenInkPreviewEligibility(
    input.pointerEvent,
    input.drawing,
  );
  const rawEligible = isStudioRawPenInkPreviewEligible(rawEligibility);
  if (input.causalPostCorrectionEligible) {
    startCausalPostCorrection(input.drawing);
    return;
  }
  if (input.nativePredictionEligible || rawEligible) {
    startPredictedInkTail(input.drawing);
    armRawPenInkPreview(input.pointerEvent, rawEligibility);
    return;
  }
  causalPostCorrectionStateRef.current = null;
  predictedInkTailStateRef.current = null;
  rawPenInkPreviewStateRef.current = null;
  liveInkPredictionRendererRef.current.clear();
}

export function runStudioAppendAuthoritativePredictedInkState({
  el, startPointIndex, predictedInkTailStateRef, liveInkPredictionRendererRef,
  liveBrushPressureSamplesFor, liveInkStyleFor,
}: {
  readonly el: DrawEl;
  readonly startPointIndex: number;
  readonly predictedInkTailStateRef: MutableRefObject<StudioPredictedInkTailState | null>;
  readonly liveInkPredictionRendererRef: MutableRefObject<StudioLiveInkPredictionRenderer>;
  readonly liveBrushPressureSamplesFor: (el: DrawEl, count?: number) => number[];
  readonly liveInkStyleFor: (el: DrawEl) => StudioLiveInkStrokeStyle;
}): void {
  const state = predictedInkTailStateRef.current;
  if (!state) return;
  const transition = appendStudioAuthoritativeInk(state, {
    points: el.points.slice(startPointIndex * 2),
    pressures: liveBrushPressureSamplesFor(el).slice(startPointIndex),
  });
  predictedInkTailStateRef.current = transition.state;
  liveInkPredictionRendererRef.current.apply(
    transition.predictionSurface,
    liveInkStyleFor(el),
  );
}

export function runStudioReplacePredictedInkTail({
  el, authoritativePointCount, predictedInkTailStateRef, liveInkPredictionRendererRef,
  liveInkStyleFor,
}: {
  readonly el: DrawEl;
  readonly authoritativePointCount: number;
  readonly predictedInkTailStateRef: MutableRefObject<StudioPredictedInkTailState | null>;
  readonly liveInkPredictionRendererRef: MutableRefObject<StudioLiveInkPredictionRenderer>;
  readonly liveInkStyleFor: (el: DrawEl) => StudioLiveInkStrokeStyle;
}): void {
  const state = predictedInkTailStateRef.current;
  if (!state) return;
  const predictedPointCount = Math.floor(el.points.length / 2);
  const predictedPressures: number[] = [];
  for (let index = authoritativePointCount; index < predictedPointCount; index += 1) {
    predictedPressures.push(studioLiveBrushPressure(el, el.pressures?.[index]));
  }
  const transition = replaceStudioPredictedInkTail(state, {
    points: el.points.slice(authoritativePointCount * 2),
    pressures: predictedPressures,
  });
  predictedInkTailStateRef.current = transition.state;
  liveInkPredictionRendererRef.current.apply(
    transition.predictionSurface,
    liveInkStyleFor(el),
  );
}

export interface StudioLiveBrushPressureCacheEntry {
  strokeId: string;
  brush: DrawEl["brush"];
  mode: DrawEl["mode"];
  pressureModel: DrawEl["pressureModel"];
  source: readonly number[] | undefined;
  sourceLength: number;
  pointCount: number;
  mapped: number[];
}

export function resolveStudioLiveBrushPressureSamples(
  cacheRef: MutableRefObject<StudioLiveBrushPressureCacheEntry | null>,
  el: DrawEl,
  sourcePointCount = Math.floor(el.points.length / 2),
): number[] {
  const cache = cacheRef.current;
  const sourceLength = el.pressures?.length ?? 0;
  if (
    cache
    && cache.strokeId === el.id
    && cache.brush === el.brush
    && cache.mode === el.mode
    && cache.pressureModel === el.pressureModel
    && cache.source === el.pressures
    && sourcePointCount >= cache.pointCount
    && sourceLength >= cache.sourceLength
  ) {
    const mapped = cache.mapped;
    for (let index = cache.pointCount; index < sourcePointCount; index += 1) {
      mapped.push(studioLiveBrushPressure(el, el.pressures?.[index]));
    }
    cache.sourceLength = sourceLength;
    cache.pointCount = sourcePointCount;
    return mapped;
  }
  const mapped = studioLiveBrushPressureSamples(el, sourcePointCount);
  cacheRef.current = {
    strokeId: el.id,
    brush: el.brush,
    mode: el.mode,
    pressureModel: el.pressureModel,
    source: el.pressures,
    sourceLength,
    pointCount: sourcePointCount,
    mapped,
  };
  return mapped;
}

export function runStudioLivingInkUnmountCleanup({
  livingInkOverlaySurfaceRef, livingInkStrokeRef, livingInkOverlayVisibleRef,
  livingInkAcceptedAuthorityRef, livingInkRejectedAuthorityRef,
  livingInkAuthorityVerificationEpochRef, livingInkAuthorityVerificationAbortRef,
  livingInkWaterNoopStrokeIdsRef, livingInkCanonicalHandoffTimerRef, livingInkCoordinatorRef,
}: {
  readonly livingInkOverlaySurfaceRef: MutableRefObject<StudioLivingInkOverlaySurfaceState | null>;
  readonly livingInkStrokeRef: MutableRefObject<StudioLivingInkPinnedStroke | null>;
  readonly livingInkOverlayVisibleRef: MutableRefObject<boolean>;
  readonly livingInkAcceptedAuthorityRef: MutableRefObject<StudioLivingInkAcceptedAuthority | null>;
  readonly livingInkRejectedAuthorityRef: MutableRefObject<StudioLivingInkAcceptedAuthority | null>;
  readonly livingInkAuthorityVerificationEpochRef: MutableRefObject<number>;
  readonly livingInkAuthorityVerificationAbortRef: MutableRefObject<AbortController | null>;
  readonly livingInkWaterNoopStrokeIdsRef: MutableRefObject<Set<string>>;
  readonly livingInkCanonicalHandoffTimerRef: MutableRefObject<ReturnType<typeof globalThis.setTimeout> | null>;
  readonly livingInkCoordinatorRef: MutableRefObject<StudioLivingInkStudioCoordinator>;
}): () => void {
  return () => {
    livingInkOverlaySurfaceRef.current?.renderer.dispose();
    livingInkOverlaySurfaceRef.current = null;
    livingInkStrokeRef.current = null;
    livingInkOverlayVisibleRef.current = false;
    livingInkAcceptedAuthorityRef.current = null;
    livingInkRejectedAuthorityRef.current = null;
    livingInkAuthorityVerificationEpochRef.current += 1;
    livingInkAuthorityVerificationAbortRef.current?.abort();
    livingInkAuthorityVerificationAbortRef.current = null;
    livingInkWaterNoopStrokeIdsRef.current.clear();
    if (livingInkCanonicalHandoffTimerRef.current !== null) {
      globalThis.clearTimeout(livingInkCanonicalHandoffTimerRef.current);
      livingInkCanonicalHandoffTimerRef.current = null;
    }
    void livingInkCoordinatorRef.current.dispose();
  };
}

export function runStudioFailHokusaiLiveStroke({
  state, errorMessage, releaseStudioHokusaiLivePresentation,
  hokusaiLiveOverlaySurfaceRef, hokusaiLiveOverlayVisibleRef,
  clearStudioHokusaiRetainedDraftPixels, setError,
}: {
  readonly state: StudioHokusaiPinnedLiveStroke;
  readonly errorMessage: string;
  readonly releaseStudioHokusaiLivePresentation: (state: StudioHokusaiPinnedLiveStroke) => void;
  readonly hokusaiLiveOverlaySurfaceRef: MutableRefObject<StudioHokusaiLiveOverlaySurfaceState | null>;
  readonly hokusaiLiveOverlayVisibleRef: MutableRefObject<boolean>;
  readonly clearStudioHokusaiRetainedDraftPixels: (state: StudioHokusaiPinnedLiveStroke) => void;
  readonly setError: Dispatch<SetStateAction<string | null>>;
}): void {
  if (state.failed) return;
  if (state.transactionCommitted) {
    releaseStudioHokusaiLivePresentation(state);
    return;
  }
  state.failed = true;
  state.abortController.abort();
  hokusaiLiveOverlaySurfaceRef.current?.renderer.clear();
  hokusaiLiveOverlayVisibleRef.current = false;
  clearStudioHokusaiRetainedDraftPixels(state);
  setError(errorMessage);
}

export function runStudioAppendHokusaiAuthoritativeSuffix({
  element, requestedStartSampleIndex, hokusaiLiveStrokeRef,
  failStudioHokusaiLiveStroke, fallbackErrorMessage,
}: {
  readonly element: DrawEl;
  readonly requestedStartSampleIndex: number;
  readonly hokusaiLiveStrokeRef: MutableRefObject<StudioHokusaiPinnedLiveStroke | null>;
  readonly failStudioHokusaiLiveStroke: (state: StudioHokusaiPinnedLiveStroke, reason: string) => void;
  readonly fallbackErrorMessage: string;
}): void {
  const state = hokusaiLiveStrokeRef.current;
  if (!state || state.failed || state.finishing || state.strokeId !== element.id) return;
  const sampleCount = Math.floor(element.points.length / 2);
  const start = Math.max(
    state.forwardedSampleCount,
    Math.max(0, Math.floor(requestedStartSampleIndex)),
  );
  if (sampleCount <= start) return;
  const samples = studioHokusaiSamplesFromDrawElement(element, start);
  state.forwardedSampleCount = sampleCount;
  if (samples.length === 0) return;
  if (!state.session) {
    state.queuedSamples.push(...samples);
    return;
  }
  try {
    state.lastAppendedSequence = state.session.append(samples);
  } catch (cause) {
    failStudioHokusaiLiveStroke(
      state,
      cause instanceof Error ? cause.message : fallbackErrorMessage,
    );
  }
}

export function runStudioAppendLivingInkAuthoritativeSuffix({
  element, requestedStartSampleIndex, livingInkStrokeRef, livingInkConfigRef,
  livingInkCoordinatorRef, failStudioLivingInkStroke, fallbackErrorMessage,
}: {
  readonly element: DrawEl;
  readonly requestedStartSampleIndex: number;
  readonly livingInkStrokeRef: MutableRefObject<StudioLivingInkPinnedStroke | null>;
  readonly livingInkConfigRef: MutableRefObject<StudioLivingInkExecutionConfig | null>;
  readonly livingInkCoordinatorRef: MutableRefObject<StudioLivingInkStudioCoordinator>;
  readonly failStudioLivingInkStroke: (state: StudioLivingInkPinnedStroke, reason: string) => void;
  readonly fallbackErrorMessage: string;
}): void {
  const state = livingInkStrokeRef.current;
  const config = livingInkConfigRef.current;
  if (!state || !config || state.failed || state.finishing || state.strokeId !== element.id) return;
  const claim = claimStudioStrokeSurfaceLifecycle(state.route, {
    phase: "append",
    routeKey: state.route.routeKey,
    strokeId: state.strokeId,
    kind: "living-ink",
  });
  if (claim.status !== "owned") {
    failStudioLivingInkStroke(state, "추가 샘플의 route가 pointer-down 영수증과 다릅니다.");
    return;
  }
  const sampleCount = Math.floor(element.points.length / 2);
  const start = Math.max(state.forwardedSampleCount, Math.max(0, requestedStartSampleIndex));
  if (sampleCount <= start) return;
  const samples = studioLivingInkSamplesFromDrawElement(
    element,
    start,
    config.fieldWidth / CANVAS_W,
  );
  state.forwardedSampleCount = sampleCount;
  if (
    samples.length > 0
    && !livingInkCoordinatorRef.current.append(state.strokeId, state.route.routeKey, samples)
  ) {
    failStudioLivingInkStroke(
      state,
      livingInkCoordinatorRef.current.capacityDiagnostic ?? fallbackErrorMessage,
    );
  }
}
