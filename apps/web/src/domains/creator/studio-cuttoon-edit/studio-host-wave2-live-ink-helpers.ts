import type { MutableRefObject } from "react";
import type Konva from "konva";

import { isDirectLiveDraftEl } from "../brush/studio-draw-rendering";
import { StudioStrokePostprocessWorkerClient } from "../brush/studio-stroke-postprocess-worker-client";
import { studioStrokeSurfaceRouteSuppressesDraft } from "../brush/studio-stroke-surface-route";
import type { StudioLivingInkOverlaySurfaceBinding } from "../canvas/StudioCanvasViewport";
import type { StudioCrdtDocument } from "../live/studio-crdt-document";
import type {
  StudioLiveInkOverlayRenderer,
  StudioLiveInkPredictionRenderer,
  StudioLiveInkStrokeStyle,
} from "../live/studio-live-ink-overlay";
import type { StudioLivingInkMaterialControls } from "../runtime-leaves/studio-living-ink-gpu-constants";
import {
  appendStudioCausalPostCorrection,
  sealStudioCausalPostCorrection,
  type StudioCausalPostCorrectionState,
  type StudioCausalPostCorrectionTransition,
} from "../studio-causal-post-correction";
import type {
  StudioCommittedInkAuthorityEvidence,
  StudioCommittedInkSurfaceHandoff,
} from "../studio-committed-ink-handoff-coordinator";
import type { PendingStrokeCommitBatch } from "../studio-cuttoon-editor/studio-deferred-stroke-commit";
import {
  replaceStudioPendingStrokePostprocess,
  STUDIO_DEFERRED_STROKE_POSTPROCESS_TIMEOUT_MS,
} from "../studio-deferred-stroke-postprocess";
import type { Tool } from "../studio-editor-tool-model";
import type { DrawEl, El } from "../studio-element-model";
import type { StudioLivingInkExecutionConfig } from "../studio-living-ink-execution-protocol";
import type { StudioLivingInkSelectionMask } from "../studio-living-ink-field";
import {
  StudioLivingInkOverlayRenderer,
  type StudioLivingInkOverlayPresentationReceipt,
} from "../studio-living-ink-overlay";
import {
  EMPTY_STUDIO_GPU_STROKES,
  type StudioLivingInkOverlaySurfaceState,
  type StudioLivingInkPinnedStroke,
} from "../studio-page-editor-types";
import { STUDIO_RAW_PEN_INK_PREVIEW_ENABLED } from "../studio-page-shell-runtime";
import type { PageState } from "../studio-page-state";
import { isStudioPixelPencilRenderMode } from "../studio-pixel-pencil";
import {
  endStudioPredictedInkTail,
  type StudioPredictedInkTailState,
} from "../studio-predicted-ink-tail";
import { selectionToMask } from "../studio-quick-mask";
import { QUICKSHAPE_STILL_RADIUS_PX } from "../studio-quickshape";
import {
  createStudioRawPenInkPreviewState,
  endStudioRawPenInkPreview,
  isStudioRawPenInkPreviewEligible,
  type StudioRawPenInkPreviewEligibility,
  type StudioRawPenInkPreviewState,
} from "../studio-raw-pen-ink-preview";
import { isSelectionUsable, type PixelSelection } from "../studio-selection-tools";

export function runStudioLivingInkOverlayPresented(input: {
  readonly state: StudioLivingInkPinnedStroke;
  readonly receipt: StudioLivingInkOverlayPresentationReceipt;
  readonly activeStroke: StudioLivingInkPinnedStroke | null;
  readonly canvas: HTMLCanvasElement | undefined;
  readonly overlayVisibleRef: MutableRefObject<boolean>;
  readonly clearRetainedDraftPixels: (state: Pick<StudioLivingInkPinnedStroke, "strokeId">) => void;
}): void {
  if (input.activeStroke !== input.state || input.state.failed) return;
  if (!studioStrokeSurfaceRouteSuppressesDraft(input.state.route, {
    routeKey: input.receipt.routeKey,
    kind: "living-ink",
    status: input.receipt.status,
  })) return;
  if (input.canvas) {
    input.canvas.setAttribute("data-studio-living-ink-active", "true");
    input.canvas.setAttribute("data-studio-living-ink-presentation", "presented");
    input.canvas.setAttribute("data-studio-living-ink-route-key", input.receipt.routeKey);
    input.canvas.setAttribute("data-studio-living-ink-display-sha256", input.receipt.displaySha256);
    input.canvas.setAttribute("data-studio-living-ink-presentation-revision", String(input.receipt.revision));
  }
  if (!input.state.overlayPresented) {
    input.state.overlayPresented = true;
    input.overlayVisibleRef.current = true;
    input.clearRetainedDraftPixels(input.state);
  }
}

export function runStudioSetLivingInkOverlaySurface(input: {
  readonly binding: StudioLivingInkOverlaySurfaceBinding | null;
  readonly surfaceRef: MutableRefObject<StudioLivingInkOverlaySurfaceState | null>;
  readonly activeStroke: StudioLivingInkPinnedStroke | null;
  readonly canonicalHandoffToken: string | undefined;
  readonly releasePresentation: (token: string | undefined) => void;
  readonly failStroke: (state: StudioLivingInkPinnedStroke, reason: string) => void;
}): void {
  const previous = input.surfaceRef.current;
  if (
    previous?.binding.canvas === input.binding?.canvas
    && previous?.binding.surfaceKey === input.binding?.surfaceKey
  ) return;
  previous?.renderer.dispose();
  input.surfaceRef.current = input.binding
    ? { binding: input.binding, renderer: new StudioLivingInkOverlayRenderer(input.binding.canvas) }
    : null;
  if (input.binding) input.binding.canvas.setAttribute("data-studio-living-ink-active", "false");
  const active = input.activeStroke;
  if (active && !active.failed && active.surfaceKey !== input.binding?.surfaceKey) {
    if (active.transactionCommitted) {
      input.releasePresentation(input.canonicalHandoffToken);
    } else {
      input.failStroke(active, "캔버스 보기 배율·스크롤 또는 물리 표면이 획 도중 변경되었습니다.");
    }
  }
}

export function deriveStudioLivingInkSelectionSnapshot(input: {
  readonly config: StudioLivingInkExecutionConfig;
  readonly pixelSelection: PixelSelection | null;
  readonly elements: readonly El[];
  readonly selectedId: string | null;
  readonly currentPageId: string;
}): StudioLivingInkSelectionMask | null {
  if (!isSelectionUsable(input.pixelSelection)) return null;
  const selectedElement = input.elements.find(({ id }) => id === input.selectedId);
  if (
    !selectedElement
    || selectedElement.type !== "image"
    || selectedElement.livingInkReceipt?.pageId !== input.currentPageId
    || selectedElement.x !== 0
    || selectedElement.y !== 0
  ) return null;
  const alpha = selectionToMask(input.pixelSelection, input.config.fieldWidth, input.config.fieldHeight, {
    featherScale: input.config.fieldWidth / Math.max(1, selectedElement.width),
  });
  if (alpha.length !== input.config.fieldWidth * input.config.fieldHeight) return null;
  return Object.freeze({
    kind: "studio-living-ink-selection-mask",
    version: 1,
    bounds: Object.freeze({ x: 0, y: 0, width: input.config.fieldWidth, height: input.config.fieldHeight }),
    coverage: Object.freeze(Array.from(alpha, (value) => value / 255)),
  });
}

export function runStudioRestoreCausalPostCorrectionTail(input: {
  readonly el: DrawEl;
  readonly state: StudioCausalPostCorrectionState | null;
  readonly predictionRenderer: StudioLiveInkPredictionRenderer;
  readonly style: StudioLiveInkStrokeStyle;
  readonly pressures: number[] | undefined;
}): void {
  if (!input.state || input.state.phase !== "active") return;
  input.predictionRenderer.applyPointTail(
    input.state.tailPoints.length > 0
      ? {
          kind: "replace",
          anchor: input.state.settledEndpoint,
          startSampleIndex: input.state.settledSampleCount,
          points: input.state.tailPoints,
        }
      : { kind: "clear" },
    input.style,
    input.pressures,
  );
}

export function runStudioAppendCausalPostCorrection(input: {
  readonly el: DrawEl;
  readonly startPointIndex: number;
  readonly stateRef: MutableRefObject<StudioCausalPostCorrectionState | null>;
  readonly overlayRenderer: StudioLiveInkOverlayRenderer;
  readonly predictionRenderer: StudioLiveInkPredictionRenderer;
  readonly style: StudioLiveInkStrokeStyle;
  readonly pressures: number[] | undefined;
}): void {
  const state = input.stateRef.current;
  if (!state || state.phase !== "active") return;
  const transition = appendStudioCausalPostCorrection(
    state,
    input.el.points.slice(input.startPointIndex * 2),
  );
  input.stateRef.current = transition.state;
  if (transition.settledSpan.points.length > 0) {
    input.overlayRenderer.appendSettledSpan(
      transition.settledSpan.points,
      input.pressures,
      transition.settledSpan.startSampleIndex,
    );
  }
  runStudioRestoreCausalPostCorrectionTail({
    el: input.el,
    state: transition.state,
    predictionRenderer: input.predictionRenderer,
    style: input.style,
    pressures: input.pressures,
  });
}

export function runStudioPreviewCausalPostCorrectionTail(input: {
  readonly el: DrawEl;
  readonly authoritativePointCount: number;
  readonly state: StudioCausalPostCorrectionState | null;
  readonly predictionRenderer: StudioLiveInkPredictionRenderer;
  readonly style: StudioLiveInkStrokeStyle;
  readonly pressures: number[] | undefined;
}): void {
  const state = input.state;
  if (!state || state.phase !== "active") return;
  const speculative = appendStudioCausalPostCorrection(
    state,
    input.el.points.slice(input.authoritativePointCount * 2),
  );
  if (speculative.state === state) {
    runStudioRestoreCausalPostCorrectionTail(input);
    return;
  }
  const speculativeTailPoints = [
    ...speculative.settledSpan.points,
    ...(speculative.tailSurface.kind === "replace" ? speculative.tailSurface.points : []),
  ];
  input.predictionRenderer.applyPointTail(
    speculativeTailPoints.length > 0
      ? {
          kind: "replace",
          anchor: state.settledEndpoint,
          startSampleIndex: state.settledSampleCount,
          points: speculativeTailPoints,
        }
      : { kind: "clear" },
    input.style,
    input.pressures,
  );
}

export function runStudioSealCausalPostCorrection(input: {
  readonly el: DrawEl;
  readonly stateRef: MutableRefObject<StudioCausalPostCorrectionState | null>;
  readonly overlayRenderer: StudioLiveInkOverlayRenderer;
  readonly predictionRenderer: StudioLiveInkPredictionRenderer;
  readonly style: StudioLiveInkStrokeStyle;
  readonly pressures: number[] | undefined;
}): DrawEl {
  const state = input.stateRef.current;
  if (!state) return input.el;
  const transition: StudioCausalPostCorrectionTransition = sealStudioCausalPostCorrection(state);
  input.stateRef.current = transition.state;
  if (transition.settledSpan.points.length > 0) {
    input.overlayRenderer.appendSettledSpan(
      transition.settledSpan.points,
      input.pressures,
      transition.settledSpan.startSampleIndex,
    );
  }
  input.predictionRenderer.applyPointTail(transition.tailSurface, input.style, input.pressures);
  return transition.finalPoints ? { ...input.el, points: [...transition.finalPoints] } : input.el;
}

export function deriveStudioRawPenInkPreviewEligibility(input: {
  readonly pointerEvent: PointerEvent;
  readonly drawing: DrawEl;
  readonly tool: Tool;
  readonly liveDraftDirect: boolean;
  readonly gpuActive: boolean;
  readonly stampActive: boolean;
  readonly fixedRateFilterActive: boolean;
  readonly immediateCausalInput: boolean;
  readonly stabilizerInstanceActive: boolean;
  readonly postCorrectionActive: boolean;
  readonly settings: {
    readonly stabilizer?: number;
    readonly useVelocityPressure?: boolean;
    readonly perspectiveActive?: boolean;
    readonly isometricActive?: boolean;
    readonly advancedRuler?: unknown;
  } | null;
}): StudioRawPenInkPreviewEligibility {
  return {
    enabled: STUDIO_RAW_PEN_INK_PREVIEW_ENABLED,
    pointerType: input.pointerEvent.pointerType,
    tool: input.tool,
    strokeMode: input.drawing.mode ?? "pen",
    strokeKind: input.drawing.kind ?? "freehand",
    directCanvas2d:
      input.liveDraftDirect
      && isDirectLiveDraftEl(input.drawing)
      && !isStudioPixelPencilRenderMode(input.drawing.brush),
    opacity: input.drawing.opacity ?? 1,
    fillActive: Boolean(input.drawing.fill),
    symmetryType: input.drawing.symmetry?.type ?? "none",
    gpuActive: input.gpuActive,
    stampActive: input.stampActive,
    stabilizerActive:
      input.fixedRateFilterActive
      || (!input.immediateCausalInput && input.stabilizerInstanceActive)
      || (input.settings?.stabilizer ?? 0) > 0
      || input.settings?.useVelocityPressure === true,
    postCorrectionActive: input.postCorrectionActive,
    rulerActive: Boolean(
      input.settings?.perspectiveActive
      || input.settings?.isometricActive
      || input.settings?.advancedRuler,
    ),
    shiftActive: input.pointerEvent.shiftKey,
  };
}

export function runStudioArmRawPenInkPreview(input: {
  readonly pointerEvent: PointerEvent;
  readonly eligibility: StudioRawPenInkPreviewEligibility;
  readonly authoritativeTail: StudioPredictedInkTailState | null;
  readonly rawStateRef: MutableRefObject<StudioRawPenInkPreviewState | null>;
  readonly generationRef: MutableRefObject<number>;
}): void {
  if (!input.authoritativeTail || !isStudioRawPenInkPreviewEligible(input.eligibility)) {
    input.rawStateRef.current = null;
    return;
  }
  const previousGeneration = input.generationRef.current;
  const generation = previousGeneration >= Number.MAX_SAFE_INTEGER ? 1 : previousGeneration + 1;
  input.generationRef.current = generation;
  input.rawStateRef.current = createStudioRawPenInkPreviewState({
    pointerId: input.pointerEvent.pointerId,
    generation,
    eligibility: input.eligibility,
    authoritativeTail: input.authoritativeTail,
  });
}

export function runStudioEndPredictedInkTail(input: {
  readonly causalPostCorrectionStateRef: MutableRefObject<StudioCausalPostCorrectionState | null>;
  readonly activeStroke: DrawEl | null;
  readonly rawStateRef: MutableRefObject<StudioRawPenInkPreviewState | null>;
  readonly predictedTailStateRef: MutableRefObject<StudioPredictedInkTailState | null>;
  readonly predictionRenderer: StudioLiveInkPredictionRenderer;
  readonly resolveStyle: (el: DrawEl) => StudioLiveInkStrokeStyle;
}): void {
  input.causalPostCorrectionStateRef.current = null;
  const rawState = input.rawStateRef.current;
  if (rawState) {
    const rawTransition = endStudioRawPenInkPreview(rawState, {
      pointerId: rawState.pointerId,
      generation: rawState.generation,
    });
    input.rawStateRef.current = rawTransition.state;
    if (input.activeStroke) {
      input.predictionRenderer.apply(
        rawTransition.predictionSurface,
        input.resolveStyle(input.activeStroke),
      );
    }
  }
  const state = input.predictedTailStateRef.current;
  if (!state) {
    input.predictionRenderer.clear();
    return;
  }
  const transition = endStudioPredictedInkTail(state);
  input.predictedTailStateRef.current = transition.state;
  if (input.activeStroke) {
    input.predictionRenderer.apply(
      transition.predictionSurface,
      input.resolveStyle(input.activeStroke),
    );
  } else {
    input.predictionRenderer.clear();
  }
}

export function runStudioExitDirectLiveDraft(input: {
  readonly admissionHasActive: boolean;
  readonly anyDirectFlagActive: boolean;
  readonly gpuPinned: boolean;
  readonly activeStrokeId: string;
  readonly failSelectedGpuLiveInk: (reason: "request-failed", strokeId: string) => void;
  readonly resetDirectFlags: () => void;
  readonly resetGpuSessionRefs: () => void;
  readonly cancelInkMeshPreview: () => void;
  readonly endPredictedInkTail: () => void;
  readonly flushPendingStrokeCommits: () => void;
  readonly clearPendingDraftAndRaf: () => void;
  readonly cancelGpuWatchdog: () => void;
  readonly bumpOverlayClearGen: () => void;
  readonly resetActiveOverlays: () => void;
  readonly batchDrawLayers: () => void;
}): void {
  if (input.admissionHasActive || !input.anyDirectFlagActive) return;
  if (input.gpuPinned) {
    input.failSelectedGpuLiveInk("request-failed", input.activeStrokeId);
    return;
  }
  input.resetDirectFlags();
  input.resetGpuSessionRefs();
  input.cancelInkMeshPreview();
  input.endPredictedInkTail();
  input.flushPendingStrokeCommits();
  input.clearPendingDraftAndRaf();
  input.cancelGpuWatchdog();
  input.bumpOverlayClearGen();
  input.resetActiveOverlays();
  input.batchDrawLayers();
}

export function runStudioQueueDeferredStrokePostprocess(input: {
  readonly finished: DrawEl;
  readonly strength: number;
  readonly preserveCornersForStroke: boolean;
  readonly activePageId: string;
  readonly controllersRef: MutableRefObject<Map<string, AbortController>>;
  readonly clientRef: MutableRefObject<StudioStrokePostprocessWorkerClient | null>;
  readonly pendingStrokeCommitsRef: MutableRefObject<PendingStrokeCommitBatch | null>;
}): void {
  const previous = input.controllersRef.current.get(input.finished.id);
  previous?.abort();
  const controller = new AbortController();
  input.controllersRef.current.set(input.finished.id, controller);
  const target = {
    pageId: input.activePageId,
    strokeId: input.finished.id,
    sourcePoints: input.finished.points,
  };
  const client = input.clientRef.current
    ?? (input.clientRef.current = new StudioStrokePostprocessWorkerClient({
      timeoutMs: STUDIO_DEFERRED_STROKE_POSTPROCESS_TIMEOUT_MS,
    }));
  void client.postprocess(input.finished.points, input.strength, {
    preserveCorners: input.preserveCornersForStroke,
    signal: controller.signal,
    timeoutMs: STUDIO_DEFERRED_STROKE_POSTPROCESS_TIMEOUT_MS,
  }).then((result) => {
    if (input.controllersRef.current.get(input.finished.id) !== controller) return;
    replaceStudioPendingStrokePostprocess(input.pendingStrokeCommitsRef.current, target, result.points);
  }).catch(() => {
    // Worker failure falls back safely: the unchanged authoritative stroke remains in the pending batch.
  }).finally(() => {
    if (input.controllersRef.current.get(input.finished.id) === controller) {
      input.controllersRef.current.delete(input.finished.id);
    }
  });
}

export function runStudioScheduleMarqueeRect(input: {
  readonly next: { x: number; y: number; w: number; h: number } | null;
  readonly pendingRef: MutableRefObject<{ x: number; y: number; w: number; h: number } | null>;
  readonly rafRef: MutableRefObject<number | null>;
  readonly rectNodeRef: MutableRefObject<Konva.Rect | null>;
  readonly setMarqueeActive: (active: boolean) => void;
}): void {
  input.pendingRef.current = input.next;
  input.setMarqueeActive(input.next !== null);
  if (input.rafRef.current !== null) return;
  input.rafRef.current = globalThis.requestAnimationFrame(() => {
    input.rafRef.current = null;
    const rect = input.pendingRef.current;
    const node = input.rectNodeRef.current;
    if (!node) return;
    if (!rect) {
      if (node.visible()) {
        node.visible(false);
        node.getLayer()?.batchDraw();
      }
      return;
    }
    node.setAttrs({ x: rect.x, y: rect.y, width: rect.w, height: rect.h, visible: true });
    node.getLayer()?.batchDraw();
  });
}

export function collectStudioCommittedInkAuthorityEvidence(input: {
  readonly handoff: StudioCommittedInkSurfaceHandoff;
  readonly revision: number;
  readonly pages: readonly PageState[];
  readonly activePageId: string;
  readonly activeElements: readonly El[];
  readonly crdtDocument: StudioCrdtDocument | null;
}): StudioCommittedInkAuthorityEvidence {
  const pageIds = new Set(input.pages.map((page) => page.id));
  const strokePageIds = new Map<string, string>();
  for (const page of input.pages) {
    const pageElements = page.id === input.activePageId ? input.activeElements : page.elements;
    for (const element of pageElements) {
      if (element.type === "draw") strokePageIds.set(element.id, page.id);
    }
  }
  const pageTombstoneIds = new Set<string>();
  const strokeTombstoneIds = new Set<string>();
  const strokeReparents = new Map<string, { fromPageId: string; toPageId: string }>();
  if (input.crdtDocument) {
    for (const page of input.crdtDocument.getPages(true)) {
      if (page.deleted) pageTombstoneIds.add(page.id);
    }
    for (const strokeId of input.handoff.strokeIds) {
      const record = input.crdtDocument.getStroke(strokeId, true);
      if (!record) continue;
      if (record.deleted) strokeTombstoneIds.add(strokeId);
      else if (record.pageId !== input.handoff.pageId) {
        strokeReparents.set(strokeId, { fromPageId: input.handoff.pageId, toPageId: record.pageId });
      }
    }
  } else if (input.revision > input.handoff.queuedRevision) {
    if (!pageIds.has(input.handoff.pageId)) pageTombstoneIds.add(input.handoff.pageId);
    for (const strokeId of input.handoff.strokeIds) {
      const projectedPageId = strokePageIds.get(strokeId);
      if (projectedPageId === undefined) strokeTombstoneIds.add(strokeId);
      else if (projectedPageId !== input.handoff.pageId) {
        strokeReparents.set(strokeId, { fromPageId: input.handoff.pageId, toPageId: projectedPageId });
      }
    }
  }
  return {
    revision: input.revision,
    visiblePageId: input.activePageId,
    pageIds,
    strokePageIds,
    pageTombstoneIds,
    strokeTombstoneIds,
    strokeReparents,
  };
}

export function runStudioResetTransientInkForHistoryTransition(input: {
  readonly clearLiveOverlays: () => void;
  readonly cancelAdmissionAndAudits: () => void;
  readonly resetGpuRefs: () => void;
  readonly clearCommittedHandoffs: () => void;
  readonly webGpuCanvasHandle: {
    setPinnedPresentationVisible: (visible: boolean) => void;
    syncPinnedStrokes: (strokes: typeof EMPTY_STUDIO_GPU_STROKES) => void;
    setPinnedVisible: (visible: boolean) => void;
  } | null;
  readonly batchDrawLayers: () => void;
}): void {
  input.clearLiveOverlays();
  input.cancelAdmissionAndAudits();
  input.resetGpuRefs();
  input.clearCommittedHandoffs();
  input.webGpuCanvasHandle?.setPinnedPresentationVisible(false);
  input.webGpuCanvasHandle?.syncPinnedStrokes(EMPTY_STUDIO_GPU_STROKES);
  input.webGpuCanvasHandle?.setPinnedVisible(false);
  input.batchDrawLayers();
}

export function advanceStudioQuickShapePointerMove(input: {
  readonly pos: { x: number; y: number };
  readonly effScale: number;
  readonly stillAnchorRef: MutableRefObject<{ x: number; y: number } | null>;
  readonly convertedRef: MutableRefObject<boolean>;
  readonly sourcePointsRef: MutableRefObject<number[]>;
  readonly stableSourceLengthRef: MutableRefObject<number>;
  readonly stillElapsedRef: MutableRefObject<number>;
}): void {
  const anchor = input.stillAnchorRef.current;
  if (!anchor) return;
  if (!input.convertedRef.current) {
    const source = input.sourcePointsRef.current;
    const lastX = source[source.length - 2];
    const lastY = source[source.length - 1];
    if (
      lastX === undefined
      || lastY === undefined
      || Math.hypot(input.pos.x - lastX, input.pos.y - lastY) > 1e-3
    ) {
      source.push(input.pos.x, input.pos.y);
    }
  }
  const radius = QUICKSHAPE_STILL_RADIUS_PX / input.effScale;
  if (Math.hypot(input.pos.x - anchor.x, input.pos.y - anchor.y) > radius) {
    input.stillAnchorRef.current = input.pos;
    input.stableSourceLengthRef.current = input.sourcePointsRef.current.length;
    input.stillElapsedRef.current = 0;
  }
}

export function runStudioPatchLivingInkMaterial(input: {
  readonly patch: Partial<StudioLivingInkMaterialControls>;
  readonly activeElements: readonly El[];
  readonly currentPageId: string;
  readonly setError: (message: string) => void;
  readonly updateMaterial: (
    updater: (current: StudioLivingInkMaterialControls) => StudioLivingInkMaterialControls,
  ) => void;
}): void {
  const hasPersistedLayer = input.activeElements.some(
    (element) => element.type === "image" && element.livingInkReceipt?.pageId === input.currentPageId,
  );
  if (hasPersistedLayer) {
    input.setError(
      "기존 수채 번짐 획의 물리 결과를 바꾸지 않도록 재질을 잠갔습니다. 레이어를 지운 뒤 새 재질로 시작해 주세요.",
    );
    return;
  }
  input.updateMaterial((current) => ({ ...current, ...input.patch }));
}
