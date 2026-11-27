import { vi } from "vitest";

import { StudioDrawingPointerTransportController } from "../brush/studio-drawing-pointer-transport";
import { defaultStudioAppSettings } from "../studio-app-settings";
import type { DrawEl, El } from "../studio-element-model";
import { bindStudioCuttoonStagePointers } from "./studio-cuttoon-stage-pointers";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";

export function createTestStagePointerEvent(
  type: string,
  input: {
    pointerId: number;
    pointerType: "pen" | "touch" | "mouse";
    clientX: number;
    clientY: number;
    pressure: number;
    timeStamp: number;
    buttons?: number;
    isPrimary?: boolean;
    coalesced?: PointerEvent[];
  },
): PointerEvent {
  const base = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: input.buttons ?? (type === "pointerup" || type === "pointercancel" ? 0 : 1),
    clientX: input.clientX,
    clientY: input.clientY,
  });
  Object.defineProperty(base, "timeStamp", {
    value: input.timeStamp,
    configurable: true,
  });
  return Object.assign(base, {
    pointerId: input.pointerId,
    pointerType: input.pointerType,
    isPrimary: input.isPrimary ?? true,
    pressure: input.pressure,
    tangentialPressure: 0,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    altitudeAngle: Math.PI / 2,
    azimuthAngle: 0,
    width: 1,
    height: 1,
    getCoalescedEvents: () => input.coalesced ?? [],
    getPredictedEvents: () => [],
  }) as unknown as PointerEvent;
}

export function createLiveStageStabilityHarness(options: { palmRejectionSetting?: boolean } = {}) {
  const windowTarget = new EventTarget();
  let visibilityState: DocumentVisibilityState = "visible";
  const documentTarget = new EventTarget() as EventTarget & {
    readonly visibilityState: DocumentVisibilityState;
  };
  Object.defineProperty(documentTarget, "visibilityState", {
    get: () => visibilityState,
    configurable: true,
  });
  const transport = new StudioDrawingPointerTransportController({
    windowTarget,
    documentTarget,
  });

  let currentPos = { x: 0, y: 0 };
  const captureElement = Object.assign(document.createElement("div"), {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  });
  const stage = {
    content: captureElement,
    getContent: () => captureElement,
    container: () => captureElement,
    getAbsoluteTransform: () => ({
      copy: () => ({
        invert: () => ({ point: (pt: { x: number; y: number }) => ({ ...pt }) }),
      }),
    }),
    setPointersPositions: vi.fn((evt: PointerEvent) => {
      currentPos = { x: evt.clientX, y: evt.clientY };
    }),
    getRelativePointerPosition: () => ({ ...currentPos }),
  };

  const committedBatches: El[][] = [];
  const activePage = { id: "page-1", canvasH: 800, elements: [] as El[] };
  const pagesHistoryRef = { current: [[activePage]] };
  const pagesHiRef = { current: 0 };
  const drawingRef: { current: DrawEl | null } = { current: null };
  const cursorPosition = vi.fn();
  const cursorVisible = vi.fn(() => true);
  const hideCursorSpy = vi.fn();
  const cursorNode = {
    position: cursorPosition,
    visible: (next?: boolean) => {
      if (next === false) hideCursorSpy();
      return cursorVisible();
    },
    radius: vi.fn(),
    scale: vi.fn(),
    rotation: vi.fn(),
    stroke: vi.fn(),
    strokeWidth: vi.fn(),
    dash: vi.fn(),
    getLayer: () => ({ drawScene: vi.fn(), batchDraw: vi.fn() }),
  };

  const appSettings = defaultStudioAppSettings();
  if (options.palmRejectionSetting !== undefined) {
    appSettings.touch.palmRejection = options.palmRejectionSetting;
  }
  appSettings.touch.oneFingerDrag = "draw";

  const host: Record<string, unknown> = {
    tool: "draw",
    drawMode: "pen",
    brush: "pen",
    drawShape: "line",
    shapeFill: false,
    color: "#111827",
    strokeWidth: 4,
    brushOpacity: 1,
    activeCatalogBrush: { id: "pen", name: "Pen" },
    stampTuning: null,
    brushDynamics: {},
    brushEnginePrograms: undefined,
    stabilizer: 0,
    stabilizerMode: "standard",
    postCorrection: 0,
    preserveCorners: true,
    pressureCurve: 1,
    pressureMinSize: 0,
    useVelocityPressure: false,
    velocitySensitivity: 0,
    effScale: 1,
    canvasH: 800,
    tiltEnabled: false,
    tipAngle: 0,
    tipRoundness: 1,
    symmetryType: "none",
    symmetryCenterX: 0,
    symmetryCenterY: 0,
    symmetryRadialCount: 4,
    drawingPracticeTargetGroupId: null,
    vanishingPoints: [],
    perspectiveRulerActive: false,
    isometricGridActive: false,
    isometricAngleDeg: 30,
    snapEnabled: false,
    showAlignmentGuides: false,
    quickShapeActive: false,
    masterEditMode: true,
    DEFERRED_STROKE_COMMIT_IDLE_MS: 200,
    appSettingsRef: { current: appSettings },
    collaborationAccessRef: {
      current: { locked: false, documentGeneration: 1, accessGeneration: 1 },
    },
    activeSurfaceReviewLockedRef: { current: false },
    activePage,
    pages: [activePage],
    elements: activePage.elements,
    elementById: new Map(),
    groups: [],
    selected: null,
    pagesHistoryRef,
    pagesHiRef,
    currentPageIdRef: { current: "page-1" },
    stageRef: { current: stage },
    stagePointerFrameMapperCacheRef: {
      current: {
        mapperFor: () => ({
          pointFor: (sample: PointerEvent) => ({ x: sample.clientX, y: sample.clientY }),
        }),
      },
    },
    drawingRef,
    drawingPointerTransportRef: { current: transport },
    drawingInputSettingsRef: { current: null },
    drawingLastAuthoritativePointerRef: { current: null },
    drawingInkTimeOriginRef: { current: null },
    drawingImmediateCausalInputRef: { current: true },
    drawingImmediateBatchMutationRef: { current: false },
    drawingPredictionBatchMutationRef: { current: false },
    drawingPredictionPreviewRef: { current: false },
    drawingThinLineInkInputRef: { current: null },
    drawingFixedRateFilterRef: { current: null },
    drawingFixedRateOwnedPointsRef: { current: null },
    drawingFixedRatePumpClockRef: { current: null },
    drawingFixedRatePumpFrameRef: { current: null },
    drawingFixedRateSampleClockRef: { current: null },
    drawingStabilizerRef: { current: null },
    drawingPrecisionStabilizerBridgeRef: { current: null },
    drawingVelocityRef: { current: null },
    drawingVelocityPressureRef: { current: null },
    perspectiveRayRef: { current: null },
    perspectiveGuideSnapRef: { current: null },
    isometricAxisRayRef: { current: null },
    advancedRulerSnapRef: { current: null },
    freehandObjectSnapLatchRef: { current: null },
    strokeObjectSnapCacheRef: { current: null },
    causalPostCorrectionStateRef: { current: null },
    predictedInkTailStateRef: { current: null },
    rawPenInkPreviewStateRef: { current: null },
    zoomGestureRef: { current: null },
    settleZoomGestureRef: { current: vi.fn() },
    marqueeStartRef: { current: null },
    pendingMarqueeRectRef: { current: null },
    nodeEditDragRef: { current: null },
    liquifyDragRef: { current: null },
    liquifyHandledNativeEndEventsRef: { current: new Set() },
    pixelDragRef: { current: null },
    pixelSelectionHandledNativeEndEventsRef: { current: new Set() },
    pendingPixelSelectionRasterGestureRef: { current: null },
    pendingRasterRetouchGestureRef: { current: null },
    studioRasterRetouchPreparationRef: { current: null },
    pixelMarqueeRasterPreparationActivationRef: { current: null },
    bubbleShapeDragRef: { current: null },
    bubbleShapeRafRef: { current: null },
    pendingBubbleShapeDraftRef: { current: null },
    advancedFillTapGestureRef: { current: null },
    advancedFillColorDropRef: { current: null },
    advancedFillTapPayloadRef: { current: null },
    advancedFillLassoDragRef: { current: null },
    advancedFillTouchPanRef: { current: null },
    advancedFillAbortRef: { current: null },
    advancedFillColorDropPreviewBusyRef: { current: false },
    autoColorScribbleStrokeRef: { current: null },
    colorWheelPressRef: { current: null },
    colorWheelTimerRef: { current: null },
    cropDragRef: { current: null },
    panelSplitDragRef: { current: null },
    panelSplitLastLineRef: { current: null },
    groupResizeRef: { current: null },
    groupDragRef: { current: null },
    quickSelectDragRef: { current: null },
    smudgeDragRef: { current: null },
    dodgeBurnDragRef: { current: null },
    wetMixDragRef: { current: null },
    quickMaskDragRef: { current: null },
    layerMaskDragRef: { current: null },
    filterMaskDragRef: { current: null },
    healCloneDragRef: { current: null },
    historyBrushDragRef: { current: null },
    polyLassoSessionRef: { current: null },
    brushCursorRef: { current: cursorNode },
    brushCursorDrawRafRef: { current: null },
    strokeGuideRef: { current: null },
    strokeGuideMetricsNodeRef: { current: null },
    strokeGuideMetricsScaleRef: { current: 1 },
    smudgeCursorRef: { current: null },
    layerMaskCursorRef: { current: null },
    filterMaskCursorRef: { current: null },
    healCloneCursorRef: { current: null },
    healCloneSourceCursorRef: { current: null },
    healClonePreviewLineRef: { current: null },
    historyBrushCursorRef: { current: null },
    liveDraftDirectRef: { current: true },
    liveDraftLayerRef: { current: { drawScene: vi.fn() } },
    liveDraftPendingRef: { current: null },
    liveDraftVisualRef: { current: null },
    liveStampDraftDirectRef: { current: false },
    liveDynamicBrushDraftDirectRef: { current: false },
    liveRetainedMediaDraftDirectRef: { current: false },
    liveWetInkDraftDirectRef: { current: false },
    liveInkOverlayRendererRef: {
      current: {
        isActive: true,
        hasSettledStrokes: false,
        reauthorLastSettledFromDocumentPoints: vi.fn(),
      },
    },
    liveInkPredictionRendererRef: { current: { apply: vi.fn(), clear: vi.fn() } },
    liveStampOverlayRendererRef: { current: { isActive: false, hasSettledStrokes: false } },
    liveDynamicBrushOverlayRendererRef: { current: { isActive: false, hasSettledStrokes: false } },
    liveRetainedMediaOverlayRendererRef: { current: { isActive: false, hasSettledStrokes: false } },
    liveWetInkOverlayRendererRef: { current: { isActive: false, hasSettledStrokes: false } },
    gpuLiveInkPinnedRef: { current: false },
    gpuLiveSourceJournalRef: { current: null },
    pendingGpuStrokesRef: { current: [] },
    inkMeshLivePreviewModuleRef: { current: null },
    inkMeshLivePreviewRuntimeRef: { current: null },
    livingInkStrokeRef: { current: null },
    livingInkFinalizingRef: { current: false },
    livingInkWaterNoopStrokeIdsRef: { current: new Set() },
    hokusaiLiveStrokeRef: { current: null },
    hokusaiLiveFinalizingRef: { current: false },
    studioStrokeSurfaceRouteRef: { current: null },
    studioCrdtDocumentRef: { current: null },
    studioCrdtSceneRuntimeRef: { current: null },
    studioLiveRoomRef: { current: null },
    companionRuntimeRef: { current: null },
    drawingCrdtPublisherRef: {
      current: { begin: vi.fn(), append: vi.fn(), flush: vi.fn(), cancel: vi.fn() },
    },
    drawingCrdtStrokeActiveRef: { current: false },
    drawingCrdtPublishErrorRef: { current: vi.fn() },
    drawingGesturePreviewPublisherRef: {
      current: { begin: vi.fn(), append: vi.fn(), end: vi.fn(() => true), cancel: vi.fn() },
    },
    draftPreviewStoreRef: { current: { settle: vi.fn() } },
    pendingStrokeCommitsRef: { current: null },
    flushPendingStrokeCommitsRef: { current: vi.fn(() => true) },
    takePendingStrokeCommits: vi.fn(() => null),
    restorePendingStrokeCommits: vi.fn(),
    expandDeferredStrokeCommitHistory: vi.fn(),
    queueDeferredStrokeCommit: vi.fn(),
    queueDeferredStrokePostprocess: vi.fn(),
    queueCommittedStrokeSurfaceHandoff: vi.fn(),
    persistImmediateStrokeEmergencyAutosave: vi.fn(),
    prepareStrokeCommitPage: vi.fn(() => true),
    beginLiveResourceEdit: vi.fn(() => true),
    endLiveResourceEdit: vi.fn(),
    beginStudioDrawLiveSurfaces: vi.fn(() => true),
    appendStudioLivingInkAuthoritativeSuffix: vi.fn(),
    appendStudioHokusaiAuthoritativeSuffix: vi.fn(),
    flushDirectLiveDraftNow: vi.fn(),
    exitDirectLiveDraft: vi.fn(() => {
      (host.liveDraftDirectRef as { current: boolean }).current = false;
    }),
    clearDraftPreview: vi.fn(),
    clearMarqueePreview: vi.fn(),
    scheduleDraft: vi.fn(),
    scheduleLiveDrawPressure: vi.fn(),
    setSelectedId: vi.fn(),
    setMarqueeIds: vi.fn(),
    setActiveGroupId: vi.fn(),
    activeGroupIdRef: { current: null },
    setError: vi.fn(),
    announceDrawingShortcut: vi.fn(),
    startFixedRateStrokePump: vi.fn(),
    stopFixedRateStrokePump: vi.fn(),
    startQuickShapeTracking: vi.fn(),
    stopQuickShapeTracking: vi.fn(),
    noteQuickShapePointerMoved: vi.fn(),
    snapshotQuickShapeTracking: vi.fn(() => ({
      anchor: null,
      sourcePoints: [],
      stableSourceLength: 0,
      elapsed: 0,
      locked: false,
      converted: false,
    })),
    applySmartGuides: vi.fn(),
    finalizeLiveStrokeBackendAudit: vi.fn(),
    liveBrushPressureSamplesFor: (el: DrawEl) => el.pressures ?? [],
    liveInkStyleFor: () => ({}),
    salvageRejectedStroke: vi.fn(() => ({ action: "salvage" })),
    handleBubbleShapePointerDown: () => false,
    handleStudioPointCommentStageDown: () => false,
    drawingAssistDocument: { advanced: { rulers: [], activeSnapRulerId: null } },
    releaseDrawingPointerSession: () => {
      transport.release();
    },
    discardDrawingPointerSession: () => {
      transport.release();
      drawingRef.current = null;
    },
    commit: (nextElements: El[]) => {
      activePage.elements = nextElements;
      pagesHistoryRef.current = [[{ ...activePage, elements: nextElements }]];
      committedBatches.push(nextElements);
      return true;
    },
  };

  const pointers = bindStudioCuttoonStagePointers(
    host as unknown as StudioCuttoonStagePointersHost,
  );

  const stageEvent = (evt: PointerEvent) => ({
    target: {
      name: () => "bg",
      getParent: () => null,
      getStage: () => stage,
    },
    evt,
  });

  return {
    pointers,
    stage,
    stageEvent,
    windowTarget,
    documentTarget,
    setVisibilityState: (next: DocumentVisibilityState) => {
      visibilityState = next;
    },
    transport,
    drawingRef,
    committedBatches,
    cursorPosition,
    hideCursorSpy,
  };
}
