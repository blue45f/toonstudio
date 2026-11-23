import { describe, expect, it, vi } from "vitest";

import { createContextNote } from "../ai/studio-ai-context-note";
import type { DrawEl, El, FrameEl, ImageEl } from "../studio-element-model";
import { createStudioMacroSession } from "../studio-macro-recorder";
import type { PageState } from "../studio-page-state";
import {
  runStudioContextNoteChange,
  runStudioInsertAiBackgroundImage,
  runStudioOnGenerateAsset,
} from "./studio-host-wave6-ai-generation-helpers";
import {
  runStudioRasterOverlayUnmountCleanup,
  runStudioStartFixedRateStrokePump,
  runStudioWorkAssetObservationEffect,
} from "./studio-host-wave6-asset-and-authority-helpers";
import {
  runStudioDownloadAiPublicSummary,
  runStudioExecuteGenerateScenario,
  runStudioExecuteGenerateTranslations,
  runStudioFitSelectedToFrame,
  runStudioStopMacroRecord,
  runStudioUndoBrushDelete,
} from "./studio-host-wave6-async-actions";
import {
  runStudioAddFrame,
  runStudioCommitDrawingAssistDocument,
  runStudioEcosystemSampleImportEffect,
  runStudioInsertClip,
} from "./studio-host-wave6-content-insert-helpers";
import {
  buildStudioGpuLiveStrokePlan,
  resolveStudioLiveBrushPressureSamples,
  runStudioFailHokusaiLiveStroke,
  runStudioStartCausalPostCorrection,
} from "./studio-host-wave6-live-ink-and-gpu-helpers";
import {
  resolveStudioPixelToolTargetAvailability,
  runStudioCancelAdvancedFillColorDropPreview,
  runStudioClearMarqueePreview,
  runStudioClearPaintRetouchStrokePreview,
  runStudioDeselectForEdit,
  runStudioFinishPolyLassoSession,
  runStudioQueuedRasterRetouchReplayEffect,
  runStudioReleasePendingPixelGestureCapture,
  runStudioReleasePendingRetouchGestureCapture,
  runStudioSelectionOwnerResetEffect,
  runStudioToggleSelectedClippingMask,
} from "./studio-host-wave6-pixel-and-retouch-helpers";
import {
  runStudioDrawingUnmountCleanup,
  runStudioResetTransientInkForHistoryTransitionRefs,
} from "./studio-host-wave6-redo-and-history-helpers";
import {
  buildStudioBrushCatalogHandlers,
  buildStudioLeftToolRailHandlers,
  isStudioCanvasGestureOwned,
  runStudioLinked3dRecoveryNoticeCleanupEffect,
  runStudioSyncSelectedPageIdsEffect,
} from "./studio-host-wave6-surface-and-comment-helpers";
import {
  buildStudioCanvasViewportRestHandlers,
  buildStudioInspectorAsideRestHandlers,
  buildStudioLayerCompHandlers,
  buildStudioLazyPanelStackRestHandlers,
  buildStudioOptionsBarsRestHandlers,
} from "./studio-host-wave6-surface-handlers";
import {
  runStudioBrushR8GrainHydratorEffect,
  runStudioOpenFrameAnimationForSelected,
  runStudioPendingBrushDeleteTimerEffect,
  runStudioQuickAccessScopeResetEffect,
  runStudioSetGridAppSettingVisible,
  runStudioTimelapseRecordingEnd,
  runStudioTimelapseRecordingStart,
  runStudioZoomLockedCancelEffect,
} from "./studio-host-wave6-tool-memory-and-brush-helpers";
import {
  buildStudioWrapPanAndMinimapHandlers,
  runStudioCloseViewToolWithFocus,
  runStudioCompanionPanelCommand,
  runStudioMobileKeyboardInsetEffect,
  runStudioMutationScopeResetEffect,
  runStudioViewRestoreEffect,
} from "./studio-host-wave6-ui-effects-and-resize-helpers";

function makePage(id: string, elements: El[] = [], canvasH = 1080): PageState {
  return { id, name: id, elements, groups: [], canvasH, bg: "#ffffff", bgGrad: null };
}

function makeDrawEl(id: string, points = [0, 0, 10, 10]): DrawEl {
  return { id, type: "draw", points, stroke: "#111111", strokeWidth: 4, brush: "pen", mode: "pen" } as DrawEl;
}

describe("Wave 6 StudioCuttoonEditorHost 추출 헬퍼 단위 검증", () => {
  describe("ai-generation-helpers", () => {
    it("runStudioInsertAiBackgroundImage는 선택 프레임의 배경을 우선 교체한다", () => {
      const frame: FrameEl = { id: "f1", type: "frame", x: 0, y: 0, width: 400, height: 300 };
      const patchEl = vi.fn(() => true);
      const commit = vi.fn(() => true);
      const setTool = vi.fn();
      const ok = runStudioInsertAiBackgroundImage({
        dataUrl: "data:image/png;base64,AA",
        width: 512,
        height: 512,
        aiProvenance: { source: "ai-bg" } as never,
        selected: frame,
        elements: [frame],
        canvasH: 1080,
        patchEl,
        commit,
        setSelectedId: vi.fn(),
        setTool,
      });
      expect(ok).toBe(true);
      expect(patchEl).toHaveBeenCalledWith("f1", expect.objectContaining({ bg: "data:image/png;base64,AA" }));
      expect(commit).not.toHaveBeenCalled();
      expect(setTool).toHaveBeenCalledWith("select");
    });

    it("runStudioOnGenerateAsset는 미로그인·미설정 상태를 차단한다", () => {
      const setError = vi.fn();
      const executeGenerateAsset = vi.fn(async () => undefined);
      runStudioOnGenerateAsset({
        assetPrompt: "  구름 배경  ",
        assetGenerating: false,
        studioAuthUserId: null,
        aiSettings: { baseUrl: "", apiKey: "" } as never,
        setError,
        runWithAiNotice: (fn) => fn(),
        executeGenerateAsset,
        apiKeyRequiredMessage: "API 키 필요",
      });
      expect(setError).toHaveBeenCalledWith("생성한 에셋을 라이브러리에 저장하려면 로그인이 필요해요.");
      expect(executeGenerateAsset).not.toHaveBeenCalled();

      setError.mockClear();
      runStudioOnGenerateAsset({
        assetPrompt: "구름 배경",
        assetGenerating: false,
        studioAuthUserId: "user-1",
        aiSettings: { baseUrl: "", apiKey: "" } as never,
        setError,
        runWithAiNotice: (fn) => fn(),
        executeGenerateAsset,
        apiKeyRequiredMessage: "API 키 필요",
      });
      expect(setError).toHaveBeenCalledWith("API 키 필요");
    });

    it("runStudioContextNoteChange는 패치를 병합해 상태를 갱신한다", () => {
      const setAiContextNote = vi.fn();
      runStudioContextNoteChange({
        aiContextNote: createContextNote("work-1"),
        patch: { characterRules: ["파란 눈 유지"] },
        setAiContextNote,
      });
      expect(setAiContextNote).toHaveBeenCalledWith(expect.objectContaining({ characterRules: ["파란 눈 유지"] }));
    });
  });

  describe("asset-and-authority-helpers", () => {
    it("비승인 스코프 관찰 초기화·오버레이 언마운트·고정주기 펌프 가드가 동작한다", () => {
      const observe = vi.fn();
      const setLimit = vi.fn();
      const setRefs = vi.fn();
      runStudioWorkAssetObservationEffect({
        activePageId: "p1",
        pages: [makePage("p1")],
        authorizedWorkAssetScopeId: null,
        studioCrdtDocument: null,
        studioWorkAssetHydrator: { observe } as never,
        setStudioWorkAssetLimitExceeded: setLimit,
        setStudioWorkAssetReferences: setRefs,
      });
      expect(observe).toHaveBeenCalledWith([]);
      expect(setLimit).toHaveBeenCalledWith(false);

      const clear = vi.fn();
      const cleanup = runStudioRasterOverlayUnmountCleanup({
        liveInkOverlayRendererRef: { current: { clear } as never },
        liveInkPredictionRendererRef: { current: { clear } as never },
        liveStampOverlayRendererRef: { current: { clear } as never },
        liveDynamicBrushOverlayRendererRef: { current: { clear } as never },
        liveRetainedMediaOverlayRendererRef: { current: { clear } as never },
        liveWetInkOverlayRendererRef: { current: { clear } as never },
      });
      cleanup();
      expect(clear).toHaveBeenCalledTimes(6);

      const sampleClockRef = { current: {} as never };
      const startPump = vi.fn();
      runStudioStartFixedRateStrokePump({
        pointerEvent: { timeStamp: 10 } as PointerEvent,
        pointerDownFrameTimeStamp: 10,
        stopFixedRateStrokePump: vi.fn(),
        drawingFixedRateFilterRef: { current: null },
        drawingFixedRateSampleClockRef: sampleClockRef,
        drawingFixedRatePumpClockRef: { current: null },
        drawingLastAuthoritativePointerRef: { current: null },
        startPump,
      });
      expect(sampleClockRef.current).toBeNull();
      expect(startPump).not.toHaveBeenCalled();
    });
  });

  describe("async-actions (지연 로드 사용자 액션)", () => {
    it("runStudioExecuteGenerateScenario·runStudioExecuteGenerateTranslations가 잠금·빈 입력 가드를 준수한다", async () => {
      const setScenarioBusy = vi.fn();
      await runStudioExecuteGenerateScenario({
        collaborationAccessRef: { current: { locked: true } },
        scenarioAbortControllerRef: { current: null },
        captureStudioMutationTicket: () => 1,
        masterEditMode: false,
        scenarioStoryText: "테스트 스토리",
        scenarioBusy: false,
        scenarioCancelRef: { current: false },
        beginScenarioRequest: () => new AbortController(),
        finishScenarioRequest: vi.fn(),
        setScenarioBusy,
        setScenarioError: vi.fn(),
        setScenarioProgress: vi.fn(),
        setScenarioStageLabel: vi.fn(),
        characterBible: { entries: [] } as never,
        pendingTextAiProviderContext: () => ({ provider: "openai", model: "gpt", transport: "byok" } as never),
        beginTrackedStudioAiOperation: () => "op-1",
        settleTrackedTextAiOperation: vi.fn(),
        scenarioSceneCountHint: undefined,
        activePageId: "p1",
        requestScenarioScenes: vi.fn(),
        canApplyStudioMutation: () => true,
        scenarioApplyTarget: "current-page",
        elements: [],
        canvasH: 1080,
        setScenarioResult: vi.fn(),
        messages: { generating: "생성 중", empty: "없음" },
      });
      expect(setScenarioBusy).not.toHaveBeenCalled();

      const setTranslateError = vi.fn();
      await runStudioExecuteGenerateTranslations({
        collaborationAccessRef: { current: { locked: false } },
        captureStudioMutationTicket: () => 1,
        canApplyStudioMutation: () => true,
        editorMountedRef: { current: true },
        translateBusy: false,
        pages: [makePage("p1", [])],
        setTranslateError,
        nothingToTranslateMessage: "번역할 대사 없음",
        setTranslateBusy: vi.fn(),
        setTranslateProgress: vi.fn(),
        pendingTextAiProviderContext: () => ({ provider: "openai", model: "gpt", transport: "byok" } as never),
        beginTrackedStudioAiOperation: () => "op-2",
        settleTrackedTextAiOperation: vi.fn(),
        translateTargetLocale: "en",
        translateGlossary: "",
        requestTranslateBatch: vi.fn(),
        setTranslateDraft: vi.fn(),
      });
      expect(setTranslateError).toHaveBeenCalledWith("번역할 대사 없음");
    });

    it("runStudioFitSelectedToFrame·runStudioStopMacroRecord·runStudioUndoBrushDelete·runStudioDownloadAiPublicSummary가 가드를 준수한다", async () => {
      const patchEl = vi.fn(() => true);
      const img: ImageEl = { id: "i1", type: "image", src: "data:image/png;base64,AA", x: 10, y: 10, width: 100, height: 100, rotation: 0 };
      runStudioFitSelectedToFrame({
        selected: img,
        groups: [],
        elements: [img],
        canvasH: 1080,
        captureStudioMutationTicket: () => 1,
        canApplyStudioMutation: () => true,
        patchEl,
      });
      expect(patchEl).toHaveBeenCalledTimes(1);

      const setAutoActionSet = vi.fn();
      await runStudioStopMacroRecord({
        macroSession: createStudioMacroSession("테스트"),
        setMacroSession: vi.fn(),
        setAutoActionSet,
        setAutoActionPlan: vi.fn(),
        setAutoActionStatus: vi.fn(),
      });
      expect(setAutoActionSet).toHaveBeenCalledTimes(1);

      const announce = vi.fn();
      await runStudioUndoBrushDelete({
        pending: { id: "p1", deleted: { brush: { name: "G펜" } }, expiresAt: Date.now() + 1000 } as never,
        productBrushRepository: async () => { throw new Error("offline"); },
        refreshSavedBrushesFromRepository: vi.fn(async () => undefined),
        setPendingBrushDeletes: vi.fn(),
        setPausedBrushDeleteId: vi.fn(),
        announceDrawingShortcut: announce,
        failureMessage: "복구 실패",
      });
      expect(announce).toHaveBeenCalledWith("복구 실패");

      await runStudioDownloadAiPublicSummary({
        summary: { ok: true },
        title: "테스트",
        ensureSharedDocumentAvailableForExport: () => false,
      });
    });
  });

  describe("content-insert-helpers", () => {
    it("runStudioAddFrame·runStudioInsertClip·runStudioCommitDrawingAssistDocument·runStudioEcosystemSampleImportEffect가 동작한다", () => {
      const updateActivePage = vi.fn();
      const setSelectedId = vi.fn();
      const setTool = vi.fn();
      runStudioAddFrame({
        elements: [{ id: "f1", type: "frame", x: 24, y: 24, width: 752, height: 300 }],
        groups: [],
        canvasH: 1080,
        updateActivePage,
        setSelectedId,
        setTool,
      });
      expect(updateActivePage).toHaveBeenCalledTimes(1);
      expect(setTool).toHaveBeenCalledWith("select");

      const commit = vi.fn(() => true);
      runStudioInsertClip({
        clip: { id: "c1", name: "빈클립", els: [], createdAt: 0 } as never,
        setError: vi.fn(),
        spawnCenter: () => [400, 400],
        shiftEl: (el) => el,
        masterEditMode: false,
        groups: [],
        elements: [],
        commit,
        setMenu: vi.fn(),
        setTool: vi.fn(),
      });
      expect(commit).not.toHaveBeenCalled();

      expect(runStudioCommitDrawingAssistDocument({
        update: (doc) => doc,
        masterEditMode: true,
        currentStudioDrawingAssistDocument: () => null,
        setDrawingAssistPreview: vi.fn(),
        commitPages: vi.fn(() => true),
      })).toBe(false);

      const commitPages = vi.fn(() => true);
      runStudioEcosystemSampleImportEffect({
        params: new URLSearchParams(""),
        ecosystemSampleImportRef: { current: null },
        workId: null,
        remixId: null,
        workHydrated: true,
        autosaveChecked: true,
        hasAutosave: false,
        sourceHydrationPending: false,
        pagesLength: 1,
        elementsLength: 0,
        commitPages,
        setCurrentPageId: vi.fn(),
        setTitle: vi.fn(),
        setQuickStartOpen: vi.fn(),
        setTutorialInitialId: vi.fn(),
        setTutorialHubOpen: vi.fn(),
        setError: vi.fn(),
      });
      expect(commitPages).not.toHaveBeenCalled();
    });
  });

  describe("live-ink-and-gpu-helpers", () => {
    it("압력 캐시·GPU 플랜·Hokusai 실패 정리·인과 후처리가 동작한다", () => {
      const cacheRef = { current: null };
      const el = { ...makeDrawEl("s1", [0, 0, 10, 10, 20, 20]), pressures: [0.3, 0.6, 0.9] } as DrawEl;
      const first = resolveStudioLiveBrushPressureSamples(cacheRef, el, 2);
      const second = resolveStudioLiveBrushPressureSamples(cacheRef, el, 3);
      expect(first).toBe(second);
      expect(second).toHaveLength(3);

      expect(buildStudioGpuLiveStrokePlan({
        el,
        gpuLiveStrokePlannerRef: { current: null },
        gpuLiveOperationOrderKeyRef: { current: null },
      })).toBeNull();

      const abort = vi.fn();
      const clear = vi.fn();
      const setError = vi.fn();
      const state = { strokeId: "h1", failed: false, transactionCommitted: false, abortController: { abort } } as never;
      runStudioFailHokusaiLiveStroke({
        state,
        releaseStudioHokusaiLivePresentation: vi.fn(),
        hokusaiLiveOverlaySurfaceRef: { current: { renderer: { clear } } as never },
        hokusaiLiveOverlayVisibleRef: { current: true },
        clearStudioHokusaiRetainedDraftPixels: vi.fn(),
        setError,
        errorMessage: "엔진 오류",
      });
      expect(abort).toHaveBeenCalledTimes(1);
      expect(clear).toHaveBeenCalledTimes(1);
      expect(setError).toHaveBeenCalledWith("엔진 오류");

      const causalStateRef = { current: null };
      runStudioStartCausalPostCorrection({
        el,
        postCorrection: 0,
        preserveCorners: true,
        predictedInkTailStateRef: { current: null },
        rawPenInkPreviewStateRef: { current: null },
        causalPostCorrectionStateRef: causalStateRef,
        restoreCausalPostCorrectionTail: vi.fn(),
      });
      expect(causalStateRef.current).toMatchObject({ phase: "active", strength: 0 });
    });
  });

  describe("pixel-and-retouch-helpers", () => {
    it("픽셀 선택·마퀴·리터치·클리핑·해제 헬퍼가 안전하게 동작한다", () => {
      const setPixelSel = vi.fn();
      runStudioSelectionOwnerResetEffect({
        pixelSelectionAutoTargetRef: { current: null },
        selectedImageElementId: "img-2",
        cancelLiquifyPointerSession: vi.fn(),
        cancelPixelSelectionPointerSession: vi.fn(),
        clearPendingPixelSelectionRasterGesture: vi.fn(),
        clearPolyLassoDraft: vi.fn(),
        pixelSelectionDocumentHistoryOwnsLatestEditRef: { current: true },
        pixelSelectionHistoryRef: { current: { ownerId: "img-1", present: null, past: [], future: [], limits: { maxEntries: 20 } } as never },
        pixelSelRef: { current: null },
        setPixelSelectionHistory: vi.fn(),
        setPixelSel,
        setPixelBusy: vi.fn(),
        pixelWandRunIdRef: { current: 0 },
        pixelWandActiveRunIdRef: { current: null },
        quickSelectRunIdRef: { current: 0 },
        quickSelectActiveRunIdRef: { current: null },
        quickSelectDragRef: { current: null },
        colorRangeRunIdRef: { current: 0 },
        colorRangeAbortRef: { current: null },
        colorRangeActiveRunIdRef: { current: null },
        setColorRangeSamples: vi.fn(),
      });
      expect(setPixelSel).toHaveBeenCalledWith(null);

      const abort = vi.fn();
      const setPreview = vi.fn();
      runStudioCancelAdvancedFillColorDropPreview({
        advancedFillColorDropPreviewPendingRef: { current: {} },
        advancedFillColorDropPreviewBusyRef: { current: true },
        advancedFillColorDropPreviewToleranceRef: { current: 18 },
        advancedFillRunIdRef: { current: 1 },
        advancedFillAbortRef: { current: { abort } as never },
        setAdvancedFillBusy: vi.fn(),
        setAdvancedFillPreview: setPreview,
        setAdvancedFillStatus: vi.fn(),
      });
      expect(abort).toHaveBeenCalledTimes(1);
      expect(setPreview).toHaveBeenCalledWith(null);

      const setError = vi.fn();
      runStudioQueuedRasterRetouchReplayEffect({
        queuedRasterRetouchReplayRef: { current: { pageId: "p-old", targetId: "img-1", tool: "smudge", points: [], liquifyMode: "push" } },
        currentPageIdRef: { current: "p-new" },
        activeElementsRef: { current: [] },
        setError,
        applyQueuedRasterRetouchReplayRef: { current: vi.fn() },
      });
      expect(setError).toHaveBeenCalledTimes(1);

      const clearDraft = vi.fn();
      runStudioFinishPolyLassoSession({
        polyLassoSessionRef: { current: { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } as never },
        polyLassoOperationRef: { current: "replace" },
        clearPolyLassoDraft: clearDraft,
        commitPixelSelectionState: vi.fn(),
      });
      expect(clearDraft).toHaveBeenCalledTimes(1);

      const availability = resolveStudioPixelToolTargetAvailability({
        activeSurfaceReviewLocked: false,
        studioFilterPreparationBusy: false,
        selected: null,
        selectedImageMutationLocked: false,
        elements: [makeDrawEl("d-avail")],
        groups: [],
        localHiddenElementIds: new Set(),
      });
      expect(availability).toEqual({
        pixelToolTargetAvailable: false,
        rasterRetouchTargetAvailable: true,
      });

      const setMarqueeActive = vi.fn();
      runStudioClearMarqueePreview({
        pendingMarqueeRectRef: { current: { x: 0 } },
        marqueeRafRef: { current: null },
        setMarqueeActive,
        marqueeRectNodeRef: { current: null },
      });
      expect(setMarqueeActive).toHaveBeenCalledWith(false);

      runStudioClearPaintRetouchStrokePreview({
        pendingPaintRetouchStrokePreviewRef: { current: {} },
        paintRetouchStrokeRafRef: { current: null },
        paintRetouchStrokeLineRef: { current: null },
      });

      const releaseCapture = vi.fn();
      runStudioReleasePendingPixelGestureCapture({
        pointerId: 7,
        captureTarget: { hasPointerCapture: () => true, releasePointerCapture: releaseCapture } as never,
      } as never);
      expect(releaseCapture).toHaveBeenCalledWith(7);

      const retouchCaptureRef = { current: { hasPointerCapture: () => true, releasePointerCapture: releaseCapture } as unknown as Element | null };
      runStudioReleasePendingRetouchGestureCapture({ pointerId: 9 }, retouchCaptureRef);
      expect(releaseCapture).toHaveBeenCalledWith(9);

      const setSelectedId = vi.fn();
      runStudioDeselectForEdit({
        pixelTool: null,
        pixelSel: null,
        setPixelTool: vi.fn(),
        commitPixelSelectionState: vi.fn(),
        clearPolyLassoDraft: vi.fn(),
        setSelectedId,
        setMarqueeIds: vi.fn(),
        setEyedropperActive: vi.fn(),
        announceDrawingShortcut: vi.fn(),
      });
      expect(setSelectedId).toHaveBeenCalledWith(null);

      const patchEl = vi.fn(() => true);
      runStudioToggleSelectedClippingMask({
        selected: makeDrawEl("d1"),
        setError: vi.fn(),
        patchEl,
        lockedMessage: "잠김",
        announceDrawingShortcut: vi.fn(),
      });
      expect(patchEl).toHaveBeenCalledWith("d1", { clipBelow: true });
    });
  });

  describe("redo-and-history · tool-memory · surface-handlers · ui-effects", () => {
    it("언마운트 정리·히스토리 잉크 초기화가 ref를 비운다", () => {
      const deleteStroke = vi.fn();
      const drawingRef = { current: makeDrawEl("s-unmount") as DrawEl | null };
      runStudioDrawingUnmountCleanup({
        drawingRef,
        discardStudioLivingInkStroke: vi.fn(),
        discardStudioHokusaiLiveStroke: vi.fn(),
        inkMeshLivePreviewRuntimeRef: { current: { cancel: vi.fn() } as never },
        cancelAllLiveStrokeBackendAudits: vi.fn(),
        drawingCrdtPublisherRef: { current: { cancel: vi.fn() } as never },
        drawingGesturePreviewPublisherRef: { current: { cancel: vi.fn() } as never },
        studioCrdtDocumentRef: { current: { deleteStroke } as never },
        perspectiveRayRef: { current: {} },
        perspectiveGuideSnapRef: { current: {} },
        isometricAxisRayRef: { current: {} },
        advancedRulerSnapRef: { current: {} },
        stopQuickShapeTracking: vi.fn(),
        releaseDrawingPointerSession: vi.fn(),
        pendingDraftRef: { current: null },
        liveDraftPendingRef: { current: null },
        liveDraftVisualRef: { current: null },
        liveDraftRafRef: { current: null },
        cancelGpuPinnedRequestWatchdog: vi.fn(),
        gpuLingerRafRef: { current: 0 },
        resetLiveDraftDirectFlags: vi.fn(),
        gpuLiveInkPinnedRef: { current: true },
        gpuLiveSourceJournalRef: { current: null },
        gpuLiveSourceJournalFirstStrokeIndexRef: { current: 0 },
        gpuLiveOperationOrderKeyRef: { current: null },
        gpuLiveAcceptedRequestIdRef: { current: null },
        gpuFinalReceiptStrokeRef: { current: null },
        gpuFinalReceiptRequestIdRef: { current: null },
        gpuFinalReceiptRequestIdsRef: { current: new Map() },
        gpuFinalCrdtPublishedRequestIdsRef: { current: new Map() },
        liveInkOverlayRendererRef: { current: { resetActive: vi.fn() } as never },
        liveStampOverlayRendererRef: { current: { resetActive: vi.fn() } as never },
        liveDynamicBrushOverlayRendererRef: { current: { resetActive: vi.fn() } as never },
        liveRetainedMediaOverlayRendererRef: { current: { resetActive: vi.fn() } as never },
        liveWetInkOverlayRendererRef: { current: { resetActive: vi.fn() } as never },
        endPredictedInkTail: vi.fn(),
        liveDrawPressureRafRef: { current: 0 },
        liveDrawPressureRef: { current: null },
        liveDrawPressureStoreRef: { current: { value: null } as never },
        endLiveResourceEdit: vi.fn(),
      });
      expect(deleteStroke).toHaveBeenCalledWith("s-unmount");
      expect(drawingRef.current).toBeNull();

      const clear = vi.fn();
      const cancelAll = vi.fn();
      runStudioResetTransientInkForHistoryTransitionRefs({
        liveInkOverlayClearGenRef: { current: 0 },
        liveInkOverlayRendererRef: { current: { clear } as never },
        liveRetainedMediaOverlayRendererRef: { current: { clear } as never },
        liveDynamicBrushOverlayRendererRef: { current: { clear } as never },
        liveWetInkOverlayRendererRef: { current: { clear } as never },
        draftPreviewStoreRef: { current: { clearSettled: vi.fn() } as never },
        liveDraftPendingRef: { current: null },
        liveDraftVisualRef: { current: null },
        liveDraftDirectRef: { current: false },
        pendingStrokeAdmissionRef: { current: { cancelAll } as never },
        cancelAllLiveStrokeBackendAudits: vi.fn(),
        gpuLiveSourceJournalRef: { current: null },
        gpuLiveSourceJournalFirstStrokeIndexRef: { current: 0 },
        gpuLiveOperationOrderKeyRef: { current: null },
        pendingGpuStrokesRef: { current: [] },
        pendingGpuDrawAuthoritiesRef: { current: [] },
        gpuFinalReceiptRequestIdsRef: { current: new Map() },
        gpuFinalCrdtPublishedRequestIdsRef: { current: new Map() },
        gpuLiveInkPinnedRef: { current: false },
        gpuLiveAcceptedRequestIdRef: { current: null },
        gpuFinalReceiptStrokeRef: { current: null },
        gpuFinalReceiptRequestIdRef: { current: null },
        gpuPinReceiptWatchdogRef: { current: null },
        cancelGpuPinnedRequestWatchdog: vi.fn(),
        committedInkSurfaceHandoffsRef: { current: [] },
        committedInkRetainedRetryRef: { current: null },
        clearSkiaCommittedInkRuntime: vi.fn(),
        committedInkSurfaceHandoffRafRef: { current: 0 },
        webGpuCanvasHandleRef: { current: null },
        liveDraftLayerRef: { current: null },
        mainLayerRef: { current: null },
      });
      expect(clear).toHaveBeenCalled();
      expect(cancelAll).toHaveBeenCalledTimes(1);
    });

    it("tool-memory·surface-handlers·ui-effects 빌더들이 정상 동작한다", () => {
      const img: ImageEl = { id: "i1", type: "image", src: "data:image/png;base64,AA", x: 0, y: 0, width: 100, height: 100, rotation: 0 };
      const patchEl = vi.fn();
      runStudioOpenFrameAnimationForSelected({
        ensurePixelToolTarget: () => img,
        patchEl,
        elements: [img],
        capturedElementIdsRef: { current: new Set<string>() },
        frameAnimTargetId: null,
        setFrameAnimTargetId: vi.fn(),
        setFrameAnimOpen: vi.fn(),
      });
      expect(patchEl).toHaveBeenCalled();

      const observeGrain = vi.fn();
      runStudioBrushR8GrainHydratorEffect({
        studioBrushR8GrainHydrator: { observe: observeGrain },
        authorizedWorkAssetScopeId: "w1",
        pages: [makePage("p1")],
        pagesHistory: [[makePage("p1")]],
        pagesHi: 0,
        extraElements: [],
      });
      expect(observeGrain).toHaveBeenCalledTimes(1);

      const persistAppSettings = vi.fn();
      const appSettingsRef = { current: { grids: { showCanvasRulers: false, showAlignmentGuides: false } } as never };
      runStudioSetGridAppSettingVisible({
        field: "showCanvasRulers",
        next: true,
        setLocalVisible: vi.fn(),
        appSettingsRef,
        setAppSettings: vi.fn(),
        persistAppSettings,
      });
      expect(persistAppSettings).toHaveBeenCalledTimes(1);

      const resetKit = vi.fn();
      runStudioQuickAccessScopeResetEffect({
        quickAccessLoadedOwnerScopeRef: { current: "scope-a" },
        currentWorkspaceOwnerScope: "scope-b",
        quickAccessLoadEpochRef: { current: 1 },
        quickAccessPersistenceWarningRef: { current: true },
        setQuickAccessPaletteOpen: vi.fn(),
        setQuickAccessPaletteLoading: vi.fn(),
        setQuickAccessState: vi.fn(),
        resetStudioQuickAccessPersonalKit: resetKit,
      });
      expect(resetKit).toHaveBeenCalledTimes(1);

      expect(runStudioPendingBrushDeleteTimerEffect({
        pendingBrushDeletes: [],
        pausedBrushDeleteId: null,
        setPendingBrushDeletes: vi.fn(),
      })).toBeUndefined();

      const zoomGestureRef = { current: { raf: 0, settleTimer: null } as { raf?: number | null; settleTimer?: ReturnType<typeof globalThis.setTimeout> | null } | null };
      runStudioZoomLockedCancelEffect({ zoomLocked: true, zoomGestureRef, zoomHostRef: { current: null } });
      expect(zoomGestureRef.current).toBeNull();

      const setCapturing = vi.fn();
      const origHiRef = { current: 0 };
      const origPageRef = { current: null as string | null };
      const origMasterRef = { current: false };
      runStudioTimelapseRecordingStart({
        invalidateAdvancedFillWork: vi.fn(),
        clearAdvancedFillTapGesture: vi.fn(),
        setAdvancedFillActive: vi.fn(),
        timelapseOriginalHiRef: origHiRef,
        pagesHi: 2,
        timelapseOriginalPageIdRef: origPageRef,
        currentPageId: "p2",
        timelapseOriginalMasterEditModeRef: origMasterRef,
        masterEditMode: false,
        setMasterEditMode: vi.fn(),
        preserveStudioViewBeforeCapture: vi.fn(),
        setTimelapseCapturing: setCapturing,
      });
      expect(origHiRef.current).toBe(2);
      runStudioTimelapseRecordingEnd({
        setPagesHi: vi.fn(),
        timelapseOriginalHiRef: origHiRef,
        timelapseOriginalPageIdRef: origPageRef,
        setCurrentPageId: vi.fn(),
        setMasterEditMode: vi.fn(),
        timelapseOriginalMasterEditModeRef: origMasterRef,
        setTimelapseCapturing: setCapturing,
      });
      expect(setCapturing).toHaveBeenLastCalledWith(false);

      const rail = buildStudioLeftToolRailHandlers({
        activatePrimaryCanvasTool: vi.fn(),
        primaryToolActivatedRef: { current: false },
        setTool: vi.fn(),
        fitCanvasToWidth: vi.fn(),
        presentationPanelsHidden: false,
        visibleLeftPanelOpen: true,
        visibleRightPanelOpen: true,
        toggleCanvasWideMode: vi.fn(),
        openFrameAnimationForSelected: vi.fn(),
        openPixelSelectionTransform: vi.fn(),
        openSelectedLayerCrop: vi.fn(),
        bg3dOpen: false,
        setBg3dOpen: vi.fn(),
        setBg3dSeedTemplateId: vi.fn(),
        setBg3dSeedPrimitiveKind: vi.fn(),
        setBg3dInitialScene: vi.fn(),
        setBg3dInitialDataUrl: vi.fn(),
        setBg3dInitialElementId: vi.fn(),
        selectedId: null,
        selectedBg3dEditSource: null,
        addBubble: vi.fn(),
        addText: vi.fn(),
        announceDrawingShortcut: vi.fn(),
        clearPolyLassoDraft: vi.fn(),
        commitAppSettings: vi.fn(),
        disarmAllPixelTools: vi.fn(),
        activatePixelSelectionToolFromInspector: vi.fn(),
        setMenu: vi.fn(),
        onPickImage: vi.fn(),
        showQuickStart: false,
        yieldQuickStart: vi.fn(),
        openInspectorRoute: vi.fn(),
        isMobile: false,
        toggleAdvancedFill: vi.fn(),
        toggleDodgeBurnTool: vi.fn(),
        toggleWetMixTool: vi.fn(),
        toggleLiquifyTool: vi.fn(),
        togglePixelMarquee: vi.fn(),
        toggleSmudgeTool: vi.fn(),
        toggleStudioCommentPinPlacement: vi.fn(),
      });
      expect(typeof rail.activatePrimaryCanvasTool).toBe("function");

      const catalog = buildStudioBrushCatalogHandlers({
        selectionLifecycle: undefined,
        close: vi.fn(),
        applyBuiltInBrushPreset: vi.fn(),
        applyStudioBrushCatalogSelection: vi.fn(),
        announceDrawingShortcut: vi.fn(),
        brushLoadFailedMessage: "fail",
        toggle: vi.fn(),
        toggleFavorite: vi.fn(),
        rememberView: undefined,
      });
      expect(typeof catalog.toggle).toBe("function");

      expect(isStudioCanvasGestureOwned({
        drawingRef: { current: makeDrawEl("active") },
        drawingPointerTransportRef: { current: null },
        isPanningRef: { current: false },
        groupDragRef: { current: null },
        marqueeStartRef: { current: null },
        advancedFillTapGestureRef: { current: null },
        liquifyDragRef: { current: null },
        smudgeDragRef: { current: null },
        dodgeBurnDragRef: { current: null },
        wetMixDragRef: { current: null },
        pixelDragRef: { current: null },
        pendingPixelSelectionRasterGestureRef: { current: null },
        cropDragRef: { current: null },
        panelSplitDragRef: { current: null },
        nodeEditDragRef: { current: null },
        bubbleShapeDragRef: { current: null },
        healCloneDragRef: { current: null },
        historyBrushDragRef: { current: null },
        layerMaskDragRef: { current: null },
        quickMaskDragRef: { current: null },
      })).toBe(true);

      const layerComps = buildStudioLayerCompHandlers({
        pendingStrokeCommitsRef: { current: null },
        flushPendingStrokeCommitsRef: { current: () => true },
        pagesHistoryRef: { current: [[makePage("p1")]] },
        pagesHiRef: { current: 0 },
        pages: [makePage("p1")],
        currentPageIdRef: { current: "p1" },
        editorMountedRef: { current: true },
        masterEditModeRef: { current: false },
        documentSaveInFlightRef: { current: false },
        collaborationAccessRef: { current: { locked: false } },
        activeSurfaceReviewLockedRef: { current: false },
        commit: vi.fn(() => true),
        setError: vi.fn(),
        captureStudioMutationTicket: () => 1,
        canApplyStudioMutation: () => true,
        studioCrdtDocumentRef: { current: null },
        studioLiveRoomRef: { current: null },
        studioCrdtSceneRuntimeRef: { current: null },
        beginLiveResourceEditAsync: vi.fn(async () => true),
        studioLiveMutationGenerationRef: { current: 0 },
        studioLiveHeldResourcesRef: { current: [] },
        endLiveResourceEdit: vi.fn(),
      });
      expect(typeof layerComps.onCaptureLayerComp).toBe("function");

      const inspectorRest = buildStudioInspectorAsideRestHandlers({
        activePageId: "p1",
        masterEditModeRef: { current: false },
        collaborationDocumentLocked: true,
        activeSurfaceReviewLocked: false,
        elements: [],
        groups: [],
        commit: vi.fn(() => true),
        setSelectedId: vi.fn(),
        announceDrawingShortcut: vi.fn(),
        setTimelinePlaying: vi.fn(),
        forwarded: {} as never,
      });
      expect(inspectorRest.replaceDrawWithHokusaiNaturalMedia({} as never, "p1", false)).toBe(false);

      const lazyRest = buildStudioLazyPanelStackRestHandlers({
        mannequinMutationTicketRef: { current: null },
        canApplyStudioMutation: () => false,
        addRenderedImage: vi.fn(() => true),
        forwarded: {} as never,
      });
      expect(lazyRest.insertMannequinResult({ pngDataUrl: "x", width: 10, height: 10 } as never)).toBe(false);

      const setQuickShapeActive = vi.fn();
      const optionsHandlers = buildStudioOptionsBarsRestHandlers({
        setQuickAccessLaunchPoint: vi.fn(),
        openStudioQuickAccessPalette: vi.fn(async () => undefined),
        setStabilizer: vi.fn(),
        announceDrawingShortcut: vi.fn(),
        fitBubbleToText: vi.fn(async () => undefined),
        activatePrimaryCanvasTool: vi.fn(),
        reorder: vi.fn(),
        restoreBrushDefaults: vi.fn(async () => undefined),
        setLivingInkPhysicalBrushKey: vi.fn(),
        currentLivingInkExplicitBrushKey: null,
        setPressureCurve: vi.fn(),
        toggleDrawingBrushDock: vi.fn(),
        commitProDrawPrefsMutation: vi.fn(() => ({ prefs: { opacityLocked: true, sizeLocked: true } })),
        quickShapeActive: false,
        setEyedropperActive: vi.fn(),
        setQuickShapeActive,
        direct: {} as never,
      });
      optionsHandlers.toggleQuickShape();
      expect(setQuickShapeActive).toHaveBeenCalledWith(true);

      const persistSettings = vi.fn();
      const viewportRest = buildStudioCanvasViewportRestHandlers({
        appSettingsRef: { current: { v: 1 } },
        persistAppSettings: persistSettings,
        reanchorStudioCommentPin: vi.fn(async () => true),
        forwarded: {} as never,
      });
      viewportRest.retryAppSettingsPersistence();
      expect(persistSettings).toHaveBeenCalledWith({ v: 1 });

      const setIsPanning = vi.fn();
      const flushViewport = vi.fn();
      const panHandlers = buildStudioWrapPanAndMinimapHandlers({
        isSpacePressed: true,
        tool: "select",
        isPanning: false,
        setIsPanning,
        wrapRef: { current: null },
        panStartRef: { current: { scrollLeft: 0, scrollTop: 0, clientX: 0, clientY: 0 } },
        flushScrollViewportCommitRef: { current: flushViewport },
        canvasH: 1080,
        canvasFlipH: false,
        canvasRotation: 0,
        effScale: 1,
        updateScrollPos: vi.fn(),
      });
      panHandlers.onWrapMouseUp();
      expect(setIsPanning).toHaveBeenCalledWith(false);
      expect(flushViewport).toHaveBeenCalledTimes(1);

      const setMenu = vi.fn();
      runStudioCompanionPanelCommand({
        command: "bubble",
        setMenu,
        setTool: vi.fn(),
        companionPendingTextTimerRef: { current: null },
        setLeftPanelOpenWithOverride: vi.fn(),
        companionUiRef: { current: { uiDensityMode: "simple", canvasOnlyMode: false } },
        setStudioUiDensityFromCompanion: vi.fn(),
        setPoserVrmOpen: vi.fn(),
        setBg3dOpen: vi.fn(),
        setCanvasOnlyMode: vi.fn(),
      });
      expect(setMenu).toHaveBeenCalledWith("bubble");

      const navigate = vi.fn();
      runStudioLinked3dRecoveryNoticeCleanupEffect({
        linked3dCloudSaveRecoveryNotice: { message: "ok" },
        locationPathname: "/studio",
        locationSearch: "?work=1",
        locationState: { other: true },
        navigate,
      });
      expect(navigate).toHaveBeenCalledTimes(1);

      runStudioSyncSelectedPageIdsEffect({
        pages: [makePage("p1")],
        currentPageId: "p1",
        autoActionScope: { kind: "selected-pages", pageIds: ["missing"] },
        setAutoActionSelectedPageIds: vi.fn(),
        setAutoActionScope: vi.fn(),
      });

      const abortSave = vi.fn();
      runStudioMutationScopeResetEffect({
        previousMutationScopeRef: { current: "scope-1" },
        mutationScopeKey: "scope-2",
        sharedDocumentSaveAbortRef: { current: { abort: abortSave } as never },
        sharedDocumentRestoreAbortRef: { current: null },
        ownerDetailAbortRef: { current: null },
        documentRevalidateAbortRef: { current: null },
        serverRevisionAbortRef: { current: null },
        serverRevisionRequestRef: { current: 0 },
        documentSaveInFlightRef: { current: true },
        setSaving: vi.fn(),
        setIsExporting: vi.fn(),
        setServerRevisionLoading: vi.fn(),
        setFxPanelLoading: vi.fn(),
      });
      expect(abortSave).toHaveBeenCalledTimes(1);

      expect(runStudioMobileKeyboardInsetEffect(false, vi.fn())).toBeUndefined();
      runStudioViewRestoreEffect({
        viewTransformSuppressed: true,
        captureSuppressedViewRef: { current: null },
        wrapRef: { current: null },
        activePageId: "p1",
        canvasH: 1080,
        updateScrollPosRef: { current: vi.fn() },
      });
      if (typeof document !== "undefined") {
        const setViewTool = vi.fn();
        runStudioCloseViewToolWithFocus({
          wrapRef: { current: null },
          lastNonViewHudFocusRef: { current: null },
          viewTool: "zoom",
          setViewTool,
        });
        expect(setViewTool).toHaveBeenCalledWith(null);
      }
    });
  });
});
