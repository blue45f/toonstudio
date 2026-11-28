/* Extracted stage pointer down-draw helpers from studio-cuttoon-stage-pointers-down-draw.ts. */
"use no memo";

import { initializeStudioBrushVelocityPressure } from "../brush/studio-brush-velocity-pressure";
import type { planStudioDraftPreviewBackdropBoundary } from "../brush/studio-draw-rendering";
import type { planStudioDrawPointerStart } from "../brush/studio-draw-pointer-start-plan";
import {
  createStudioPointerVelocityState,
  createStudioStrokeStabilizerBridge,
  createStudioStrokeStabilizerState,
} from "../brush/studio-stroke-stabilizer";
import { studioLiveRetainedMediaOverlaySupportsElement } from "../live/studio-live-retained-media-overlay";
import { createFixedRateStrokeFilter } from "../studio-fixed-rate-stroke-filter";
import { shouldSnapStrokeToIsometricAxis } from "../studio-isometric-grid";
import { shouldApplyStrokeObjectSnap } from "../studio-smart-guides";
import {
  createStudioThinLineInkInputState,
  shouldFilterStudioThinLineInkInput,
} from "../studio-thin-line-ink-input-v1";
import type { DrawEl } from "../studio-element-model";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";
import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";

type BackdropBoundaryInput = Parameters<typeof planStudioDraftPreviewBackdropBoundary>[0];
type DrawStartPlanResult = ReturnType<typeof planStudioDrawPointerStart>;

export function buildStudioDownDrawBackdropBoundaryInput(
  h: StudioCuttoonStagePointersHost,
  strokeDrawMode: "pen" | "eraser" | "shape" | "lasso-fill" | "pixel",
): BackdropBoundaryInput {
  const {
    activePage,
    brush,
    color,
    drawShape,
    liveDynamicBrushOverlayRendererRef,
    liveInkOverlayRendererRef,
    liveRetainedMediaOverlayRendererRef,
    liveStampOverlayRendererRef,
    liveWetInkOverlayRendererRef,
    pendingGpuStrokesRef,
    pendingStrokeCommitsRef,
    shapeFill,
  } = h;
  const backdropPendingBatch = pendingStrokeCommitsRef.current;
  return {
    incoming: {
      brush: strokeDrawMode === "pen" ? brush : undefined,
      fill:
        strokeDrawMode === "lasso-fill"
          ? color
          : strokeDrawMode === "shape" && shapeFill && drawShape !== "line"
            ? color
            : undefined,
      kind: strokeDrawMode === "shape" ? drawShape : "freehand",
      mode: strokeDrawMode === "eraser" ? "eraser" : "pen",
    },
    pending:
      backdropPendingBatch?.pageId === activePage.id
        ? backdropPendingBatch.strokes
        : [],
    hasRetainedDomBackdrop:
      backdropPendingBatch !== null
      && (
        liveInkOverlayRendererRef.current.hasSettledStrokes
        || liveStampOverlayRendererRef.current.hasSettledStrokes
        || liveDynamicBrushOverlayRendererRef.current.hasSettledStrokes
        || liveRetainedMediaOverlayRendererRef.current.hasSettledStrokes
        || liveWetInkOverlayRendererRef.current.hasSettledStrokes
        || pendingGpuStrokesRef.current.length > 0
      ),
    overlayOwnsPendingAndIncoming: Boolean(
      backdropPendingBatch
      && backdropPendingBatch.pageId === activePage.id
      && liveRetainedMediaOverlayRendererRef.current.hasSettledStrokes
      && (
        strokeDrawMode === "eraser"
        || studioLiveRetainedMediaOverlaySupportsElement({
          id: "incoming-retained-probe",
          type: "draw",
          kind: strokeDrawMode === "shape" ? drawShape : "freehand",
          mode: "pen",
          brush: strokeDrawMode === "pen" ? brush : undefined,
          points: [0, 0],
          stroke: color,
          strokeWidth: 1,
          opacity: 1,
        })
      )
      && backdropPendingBatch.strokes.every((stroke: DrawEl) =>
        studioLiveRetainedMediaOverlaySupportsElement(stroke),
      ),
    ),
  };
}

export function snapStudioDownDrawInitialShapeOrigin(
  h: StudioCuttoonStagePointersHost,
  api: StudioCuttoonStagePointersApi,
  next: DrawEl,
  strokeOrigin: { x: number; y: number },
  strokeAdvancedRuler: unknown,
): { element: DrawEl; strokeOrigin: { x: number; y: number } } {
  const {
    isometricGridActive,
    perspectiveRulerActive,
    showAlignmentGuides,
    snapEnabled,
    vanishingPoints,
  } = h;
  const directionalRulerActive = Boolean(
    strokeAdvancedRuler
    || (!strokeAdvancedRuler && perspectiveRulerActive && vanishingPoints.length > 0)
    || (
      !strokeAdvancedRuler
      && shouldSnapStrokeToIsometricAxis({
        active: isometricGridActive,
        mode: next.mode,
        kind: next.kind ?? "freehand",
      })
    ),
  );
  if (
    !shouldApplyStrokeObjectSnap({
      snapEnabled,
      showAlignmentGuides,
      mode: next.mode,
      kind: next.kind ?? "freehand",
      sampleIndex: 0,
      directionalRulerActive,
    })
  ) {
    return { element: next, strokeOrigin };
  }
  const snapped = api.applyStrokeObjectSnapToPoint(strokeOrigin.x, strokeOrigin.y, {
    mode: next.mode,
    kind: next.kind ?? "freehand",
    sampleIndex: 0,
    directionalRulerActive,
    excludeId: next.id,
  });
  if (snapped.x === strokeOrigin.x && snapped.y === strokeOrigin.y) {
    return { element: next, strokeOrigin };
  }
  const nextOrigin = { x: snapped.x, y: snapped.y };
  const points = next.points.slice();
  if (points.length >= 2) {
    points[0] = snapped.x;
    points[1] = snapped.y;
  }
  // Shape origin is duplicated as the initial endpoint until the drag moves.
  if ((next.kind ?? "freehand") !== "freehand" && points.length >= 4) {
    points[2] = snapped.x;
    points[3] = snapped.y;
  }
  return { element: { ...next, points }, strokeOrigin: nextOrigin };
}

export function initializeStudioDownDrawStrokeFilters(
  h: StudioCuttoonStagePointersHost,
  input: {
    readonly next: DrawEl;
    readonly strokeDrawMode: "pen" | "eraser" | "shape" | "lasso-fill" | "pixel";
    readonly strokeOrigin: { x: number; y: number };
    readonly pointerSample: PointerEvent;
    readonly causalInputPlan: DrawStartPlanResult["causalInputPlan"];
    readonly causalInitialSample: DrawStartPlanResult["causalInitialSample"];
    readonly pressure: number;
    readonly stylus: DrawStartPlanResult["stylus"];
  },
): void {
  const {
    drawingFixedRateFilterRef,
    drawingInputSettingsRef,
    drawingPrecisionStabilizerBridgeRef,
    drawingStabilizerRef,
    drawingThinLineInkInputRef,
    drawingVelocityPressureRef,
    drawingVelocityRef,
    effScale,
    stabilizer,
    stabilizerMode,
  } = h;
  const {
    causalInitialSample,
    causalInputPlan,
    next,
    pointerSample,
    pressure,
    strokeDrawMode,
    strokeOrigin,
    stylus,
  } = input;

  drawingThinLineInkInputRef.current = shouldFilterStudioThinLineInkInput({
    brushId: next.brush,
    immediateCausalInput: causalInputPlan.quantizeImmediately,
  })
    ? createStudioThinLineInkInputState({
        x: strokeOrigin.x,
        y: strokeOrigin.y,
        timeStamp: pointerSample.timeStamp,
      })
    : null;
  drawingFixedRateFilterRef.current = causalInputPlan.usesFixedRateClock
    ? createFixedRateStrokeFilter(
        {
          x: strokeOrigin.x,
          y: strokeOrigin.y,
          positionScale: effScale,
          pressure,
          tiltX: causalInitialSample?.tiltX ?? stylus.tiltX,
          tiltY: causalInitialSample?.tiltY ?? stylus.tiltY,
          timeStamp: pointerSample.timeStamp,
        },
        stabilizer,
      ).state
    : null;
  drawingStabilizerRef.current =
    strokeDrawMode === "shape" || strokeDrawMode === "pixel" || causalInputPlan.sampleSpacing === 0
      ? null
      : createStudioStrokeStabilizerState({
          x: strokeOrigin.x,
          y: strokeOrigin.y,
          timeStamp: pointerSample.timeStamp,
        });
  drawingPrecisionStabilizerBridgeRef.current?.reset();
  drawingPrecisionStabilizerBridgeRef.current = null;
  if (
    drawingStabilizerRef.current
    && drawingFixedRateFilterRef.current === null
    && stabilizerMode === "precision"
    && stabilizer > 0
  ) {
    const bridge = createStudioStrokeStabilizerBridge();
    const first = bridge.commit(
      {
        x: strokeOrigin.x,
        y: strokeOrigin.y,
        timeStamp: pointerSample.timeStamp,
        pointerType:
          pointerSample.pointerType === "mouse"
          || pointerSample.pointerType === "pen"
          || pointerSample.pointerType === "touch"
            ? pointerSample.pointerType
            : "unknown",
        pointerId: pointerSample.pointerId,
      },
      {
        strength: stabilizer,
        mode: "precision",
        coordinateScale: effScale,
        useLazyPrecision: true,
        lazyPointerPolicy: "all",
      },
    );
    drawingStabilizerRef.current = first.state;
    drawingPrecisionStabilizerBridgeRef.current = bridge;
  }
  drawingVelocityRef.current =
    strokeDrawMode === "shape" || strokeDrawMode === "pixel"
      ? null
      : createStudioPointerVelocityState(pointerSample);
  drawingVelocityPressureRef.current = initializeStudioBrushVelocityPressure(
    strokeDrawMode,
    pointerSample,
    next,
    drawingInputSettingsRef.current,
  );
}
