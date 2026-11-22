import type Konva from "konva";
import type { MutableRefObject } from "react";

import type { El } from "../studio-element-model";
import { createStudioPixelEditCanvas } from "../studio-legacy-editor-runtime-helpers";
import type { StudioLiquifyMode } from "../studio-liquify-contract";
import {
  mapLiquifyRoiToDocumentFrame,
  planStudioLiquifyLivePreview,
} from "../studio-liquify-live-preview";
import {
  endStudioLiquifyPointerSession,
  isStudioLiquifyPointerOwner,
  type StudioLiquifyPointerSession,
} from "../studio-liquify-pointer";
import {
  loadStudioLiquifyBrowserRuntime,
  loadStudioPixelEditBrushRuntime,
} from "../studio-page-editor-runtime-loaders";
import type { PixelSelectionHistoryOperation } from "../studio-pixel-selection-session-history";
import {
  endStudioPendingRasterRetouchGesture,
  type StudioPendingRasterRetouchGesture,
  type StudioRasterRetouchNormalizedPoint,
} from "../studio-retouch-raster-gesture";
import {
  canvasPointToNormalized,
  commitSelectionDrag,
  commitSelectionDragAtPoint,
  isSelectionUsable,
  resolveSelectionCombineOverride,
  selectionOperationBase,
  translateSelection,
  type PixelSelection,
  type SelectionDragState,
  type SelectionFrame,
  type SelectionLuminanceField,
  type SelectionOperationMode,
  type SelectionToolKind,
  type SelPoint,
} from "../studio-selection-tools";

export interface StudioLiquifyPreviewSource {
  elId: string;
  src: string;
  image: CanvasImageSource;
}

export interface StudioPendingPixelSelectionRasterGesture {
  runId: number;
  pointerId: number;
  tool: SelectionToolKind | "wand" | "quick-select";
  forceCircle: boolean;
  combine: SelectionOperationMode;
  start: { x: number; y: number };
  current: { x: number; y: number };
  shift: boolean;
  alt: boolean;
  released: boolean;
  cancelled: boolean;
  captureTarget: Element | null;
}

export interface StudioPixelDragSession {
  elId: string;
  frame: SelectionFrame;
  drag: SelectionDragState;
  operation: SelectionOperationMode;
  pointerId: number;
  magneticField: SelectionLuminanceField | null;
  marqueeMove?: {
    startNorm: { x: number; y: number };
    baseSelection: PixelSelection;
  };
}

export type StudioPixelSelectionStateUpdate =
  | PixelSelection
  | null
  | ((current: PixelSelection | null) => PixelSelection | null);

export interface RunStudioLiquifyLivePreviewPumpInput {
  readonly liquifyPreviewBusyRef: MutableRefObject<boolean>;
  readonly liquifyPreviewPendingRef: MutableRefObject<boolean>;
  readonly liquifyDragRef: MutableRefObject<StudioLiquifyPointerSession | null>;
  readonly activeElementsRef: MutableRefObject<El[]>;
  readonly liquifyPreviewTokenRef: MutableRefObject<number>;
  readonly liquifyPreviewSourceRef: MutableRefObject<StudioLiquifyPreviewSource | null>;
  readonly liquifyPreviewImageRef: MutableRefObject<Konva.Image | null>;
  readonly liquifyRadius: number;
  readonly liquifyStrength: number;
}

export async function runStudioLiquifyLivePreviewPump(
  input: RunStudioLiquifyLivePreviewPumpInput,
): Promise<void> {
  if (input.liquifyPreviewBusyRef.current) return;
  input.liquifyPreviewBusyRef.current = true;
  try {
    while (input.liquifyPreviewPendingRef.current && input.liquifyDragRef.current) {
      input.liquifyPreviewPendingRef.current = false;
      const session = input.liquifyDragRef.current;
      if (!session) break;
      const target = input.activeElementsRef.current.find((element) => element.id === session.elId);
      if (!target || target.type !== "image") break;
      const token = input.liquifyPreviewTokenRef.current + 1;
      input.liquifyPreviewTokenRef.current = token;
      try {
        const [
          { bakeLiquifyStrokeToCanvas, bakeLiquifyStrokeRoiPreview },
          { loadStudioRetouchSourceImage, studioRetouchSourceDimensions },
        ] = await Promise.all([
          loadStudioLiquifyBrowserRuntime(),
          loadStudioPixelEditBrushRuntime(),
        ]);
        if (token !== input.liquifyPreviewTokenRef.current || !input.liquifyDragRef.current) break;
        let source = input.liquifyPreviewSourceRef.current;
        if (!source || source.elId !== target.id || source.src !== target.src) {
          const image = await loadStudioRetouchSourceImage(target.src);
          if (token !== input.liquifyPreviewTokenRef.current || !input.liquifyDragRef.current) break;
          source = { elId: target.id, src: target.src, image };
          input.liquifyPreviewSourceRef.current = source;
        }
        const { width: w, height: h } = studioRetouchSourceDimensions(
          source.image as HTMLImageElement,
        );
        const plan = planStudioLiquifyLivePreview({
          points: session.points,
          sourceWidth: w,
          sourceHeight: h,
          elementWidth: target.width,
          radiusCanvasPx: input.liquifyRadius,
        });
        if (!plan) continue;
        const dynamics = {
          flipX: target.flipped ?? false,
          flipY: target.flippedY ?? false,
          mode: session.mode,
          stabilizer: 0.12,
          spacingRatio: 0.45,
        } as const;
        const node = input.liquifyPreviewImageRef.current;
        if (!node) continue;
        const frame = session.frame;

        if (plan.mode === "roi-full-res") {
          const roi = await bakeLiquifyStrokeRoiPreview(
            source.image as never,
            plan.width,
            plan.height,
            plan.points,
            plan.radiusDevice,
            input.liquifyStrength / 100,
            createStudioPixelEditCanvas,
            dynamics,
          );
          if (token !== input.liquifyPreviewTokenRef.current || !input.liquifyDragRef.current || !roi) {
            continue;
          }
          const place = mapLiquifyRoiToDocumentFrame(
            roi.region,
            roi.sourceWidth,
            roi.sourceHeight,
            {
              x: frame.x,
              y: frame.y,
              width: frame.width,
              height: frame.height,
              rotation: frame.rotation ?? 0,
            },
            Boolean(target.flipped),
            Boolean(target.flippedY),
          );
          node.image(roi.canvas as HTMLCanvasElement);
          node.x(place.x);
          node.y(place.y);
          node.width(place.width);
          node.height(place.height);
          node.scaleX(place.scaleX);
          node.scaleY(place.scaleY);
          node.rotation(place.rotation);
          node.visible(true);
          node.getLayer()?.batchDraw();
        } else {
          const out = await bakeLiquifyStrokeToCanvas(
            source.image as never,
            plan.width,
            plan.height,
            plan.points,
            plan.radiusDevice,
            input.liquifyStrength / 100,
            createStudioPixelEditCanvas,
            dynamics,
          );
          if (token !== input.liquifyPreviewTokenRef.current || !input.liquifyDragRef.current || !out) {
            continue;
          }
          const flipX = target.flipped ? -1 : 1;
          const flipY = target.flippedY ? -1 : 1;
          node.image(out as HTMLCanvasElement);
          node.x(frame.x + (flipX < 0 ? frame.width : 0));
          node.y(frame.y + (flipY < 0 ? frame.height : 0));
          node.width(frame.width);
          node.height(frame.height);
          node.scaleX(flipX);
          node.scaleY(flipY);
          node.rotation(frame.rotation);
          node.visible(true);
          node.getLayer()?.batchDraw();
        }
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") continue;
      }
    }
  } finally {
    input.liquifyPreviewBusyRef.current = false;
    if (input.liquifyPreviewPendingRef.current && input.liquifyDragRef.current) {
      void runStudioLiquifyLivePreviewPump(input);
    }
  }
}

export function runStudioLiquifyPointerSessionFinish(input: {
  readonly pointerEvent: PointerEvent;
  readonly cancelled: boolean;
  readonly stage: Konva.Stage | null;
  readonly liquifyDragRef: MutableRefObject<StudioLiquifyPointerSession | null>;
  readonly releaseCapture: (session: StudioLiquifyPointerSession) => void;
  readonly clearStrokePreview: () => void;
  readonly clearLivePreview: () => void;
  readonly applyStroke: (
    elId: string,
    points: readonly StudioRasterRetouchNormalizedPoint[],
    mode: StudioLiquifyMode,
  ) => Promise<void>;
}): boolean {
  const session = input.liquifyDragRef.current;
  if (!session || !isStudioLiquifyPointerOwner(session, input.pointerEvent)) return false;
  let releasePoint: SelPoint | undefined;
  if (!input.cancelled && input.stage) {
    try {
      input.stage.setPointersPositions(input.pointerEvent);
      const position = input.stage.getRelativePointerPosition();
      if (position) {
        releasePoint = canvasPointToNormalized(position.x, position.y, session.frame);
      }
    } catch {
      // An outside release can race Stage teardown; the accumulated prefix remains usable.
    }
  }
  const outcome = endStudioLiquifyPointerSession(session, input.pointerEvent, {
    cancelled: input.cancelled,
    releasePoint,
  });
  if (outcome.kind === "ignored") return false;
  input.liquifyDragRef.current = null;
  input.releaseCapture(session);
  input.clearStrokePreview();
  input.clearLivePreview();
  if (outcome.kind === "apply") {
    void input.applyStroke(outcome.elId, outcome.points, session.mode);
  }
  return true;
}

export function runStudioPendingPixelSelectionRasterGestureFinish(input: {
  readonly pointerEvent: PointerEvent;
  readonly cancelled: boolean;
  readonly stage: Konva.Stage | null;
  readonly pendingRef: MutableRefObject<StudioPendingPixelSelectionRasterGesture | null>;
  readonly releaseGesture: (pending: StudioPendingPixelSelectionRasterGesture) => void;
}): boolean {
  const pending = input.pendingRef.current;
  const pointerId = Number.isFinite(input.pointerEvent.pointerId) ? input.pointerEvent.pointerId : 1;
  if (!pending || pending.pointerId !== pointerId) return false;
  if (pending.released) return true;
  if (!input.cancelled && input.stage) {
    try {
      input.stage.setPointersPositions(input.pointerEvent);
      const position = input.stage.getRelativePointerPosition();
      if (position) {
        pending.current = { x: position.x, y: position.y };
        pending.shift = input.pointerEvent.shiftKey;
        pending.alt = input.pointerEvent.altKey;
      }
    } catch {
      // The latest captured move remains an exact bounded fallback after Stage teardown.
    }
  }
  pending.released = true;
  pending.cancelled = input.cancelled;
  input.releaseGesture(pending);
  if (input.cancelled) input.pendingRef.current = null;
  return true;
}

export function runStudioPendingRasterRetouchGestureFinish(input: {
  readonly pointerEvent: PointerEvent;
  readonly cancelled: boolean;
  readonly stage: Konva.Stage | null;
  readonly pendingRef: MutableRefObject<StudioPendingRasterRetouchGesture | null>;
  readonly targetRef: MutableRefObject<{ frame: SelectionFrame; id: string } | null>;
  readonly releaseCapture: (gesture: StudioPendingRasterRetouchGesture) => void;
  readonly clearPending: () => void;
  readonly queueGesture: (
    gesture: StudioPendingRasterRetouchGesture,
    target: { frame: SelectionFrame; id: string },
  ) => void;
}): boolean {
  const pending = input.pendingRef.current;
  const pointerId = Number.isFinite(input.pointerEvent.pointerId) ? input.pointerEvent.pointerId : 1;
  if (!pending || pending.pointerId !== pointerId) return false;
  if (pending.released) return true;
  let releasePoint: { x: number; y: number } | undefined;
  if (!input.cancelled && input.stage) {
    try {
      input.stage.setPointersPositions(input.pointerEvent);
      const position = input.stage.getRelativePointerPosition();
      if (position) releasePoint = { x: position.x, y: position.y };
    } catch {
      // Preserve the last captured sample if Stage teardown races the outside pointer release.
    }
  }
  const finished = endStudioPendingRasterRetouchGesture(
    pending,
    input.pointerEvent,
    { cancelled: input.cancelled, ...(releasePoint ? { releasePoint } : {}) },
  );
  input.pendingRef.current = finished;
  input.releaseCapture(finished);
  if (input.cancelled) {
    input.clearPending();
    return true;
  }
  const target = input.targetRef.current;
  if (target) input.queueGesture(finished, target);
  return true;
}

export function runStudioPixelSelectionPointerSessionFinish(input: {
  readonly pointerEvent: PointerEvent;
  readonly cancelled: boolean;
  readonly stage: Konva.Stage | null;
  readonly pixelDragRef: MutableRefObject<StudioPixelDragSession | null>;
  readonly pixelSelRef: MutableRefObject<PixelSelection | null>;
  readonly setPixelSel: (selection: PixelSelection | null) => void;
  readonly releaseCapture: (session: StudioPixelDragSession) => void;
  readonly clearPreview: () => void;
  readonly commitSelectionState: (
    update: StudioPixelSelectionStateUpdate,
    operation: PixelSelectionHistoryOperation,
  ) => boolean;
}): boolean {
  const session = input.pixelDragRef.current;
  const pointerId = Number.isFinite(input.pointerEvent.pointerId) ? input.pointerEvent.pointerId : 1;
  if (!session || session.pointerId !== pointerId) return false;
  let releasePoint: SelPoint | null = null;
  if (!input.cancelled && input.stage) {
    try {
      input.stage.setPointersPositions(input.pointerEvent);
      const position = input.stage.getRelativePointerPosition();
      if (position) {
        releasePoint = canvasPointToNormalized(position.x, position.y, session.frame);
      }
    } catch {
      // An outside release can race Stage teardown; commit the accumulated prefix in that case.
    }
  }
  input.pixelDragRef.current = null;
  input.releaseCapture(session);
  input.clearPreview();
  if (session.marqueeMove) {
    if (input.cancelled) {
      input.pixelSelRef.current = session.marqueeMove.baseSelection;
      input.setPixelSel(session.marqueeMove.baseSelection);
      return true;
    }
    const end = releasePoint ?? session.marqueeMove.startNorm;
    const dx = end.x - session.marqueeMove.startNorm.x;
    const dy = end.y - session.marqueeMove.startNorm.y;
    input.commitSelectionState(
      (previous) => translateSelection(
        previous ?? session.marqueeMove!.baseSelection,
        dx,
        dy,
      ) ?? previous,
      "move",
    );
    return true;
  }
  if (!input.cancelled) {
    input.commitSelectionState(
      (previous) => (
        releasePoint
          ? commitSelectionDragAtPoint(
              selectionOperationBase(previous, session.operation),
              session.drag,
              releasePoint,
              {
                shift: input.pointerEvent.shiftKey,
                alt: input.pointerEvent.altKey,
                aspect: session.frame.height / Math.max(1, session.frame.width),
                magneticField: session.magneticField,
              },
            )
          : commitSelectionDrag(
              selectionOperationBase(previous, session.operation),
              session.drag,
            )
      ) ?? previous,
      session.drag.tool === "lasso"
        ? "free-lasso"
        : session.drag.tool === "brush"
          ? "brush"
          : "marquee",
    );
  }
  return true;
}

export function createStudioPendingPixelSelectionRasterGesture(input: {
  readonly runId: number;
  readonly event: PointerEvent;
  readonly position: { readonly x: number; readonly y: number };
  readonly tool: SelectionToolKind | "wand" | "quick-select";
  readonly forceCircle: boolean;
  readonly captureFallback: Element | null;
  readonly pixelCombine: SelectionOperationMode;
  readonly currentSelection: PixelSelection | null;
}): StudioPendingPixelSelectionRasterGesture {
  const pointerId = Number.isFinite(input.event.pointerId) ? input.event.pointerId : 1;
  const captureTarget =
    typeof Element !== "undefined" && input.event.target instanceof Element
      ? input.event.target
      : input.captureFallback;
  return {
    runId: input.runId,
    pointerId,
    tool: input.tool,
    forceCircle: input.forceCircle,
    combine: resolveSelectionCombineOverride(
      input.pixelCombine,
      { shift: input.event.shiftKey, alt: input.event.altKey },
      isSelectionUsable(input.currentSelection),
    ),
    start: { x: input.position.x, y: input.position.y },
    current: { x: input.position.x, y: input.position.y },
    shift: input.event.shiftKey,
    alt: input.event.altKey,
    released: false,
    cancelled: false,
    captureTarget,
  };
}
