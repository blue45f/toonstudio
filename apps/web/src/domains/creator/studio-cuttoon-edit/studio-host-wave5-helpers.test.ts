import { describe, expect, it, vi } from "vitest";

import { remapStudioBg3dLtCopiedBundles } from "../contracts/studio-bg3d-lt-copy-remap";
import {
  STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
  StudioBg3dSceneDocumentBudgetError,
} from "../contracts/studio-bg3d-scene-document-constants";
import { DEFAULT_STUDIO_BG3D_RAW_DOCUMENT } from "../contracts/studio-bg3d-scene-document-defaults";
import {
  countStudioBg3dTexturePaintPoints,
  createEmptyStudioBg3dTexturePaint,
} from "../contracts/studio-bg3d-texture-paint-contract";
import type { El } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import { createStudioWorkspaceDefaultState } from "../studio-workspaces";
import {
  buildStudioMenuAssetLoaderEntries,
  runStudioApplyTranslationDraft,
  runStudioReportSharedAsset,
  runStudioShareAsset,
} from "./studio-host-wave5-assets-catalog-helpers";
import {
  runStudioApplyWriterRoomCanvasPlan,
  runStudioCloseCommentThreadPopover,
  runStudioCompanionControl,
  runStudioOpenWorkMetadataStep,
} from "./studio-host-wave5-comments-companion-helpers";
import {
  runStudioDesignateHistoryBrushSource,
  runStudioMagicWandSelectOnTarget,
  runStudioMagneticLassoFieldEffect,
} from "./studio-host-wave5-pixel-selection-helpers";
import {
  runStudioCaptureTimelapseStep,
  runStudioExportCurrentPageToInkMl,
  runStudioExportCurrentPageToSvg,
  runStudioOpenLocalFormalSave,
} from "./studio-host-wave5-project-save-export-helpers";
import {
  runStudioLoadPublishContextEffect,
  runStudioLoadServerRevisionsEffect,
  runStudioOpenOwnerFxPanel,
} from "./studio-host-wave5-server-revision-helpers";
import {
  runStudioEnterCanvasOnlyMode,
  runStudioServerAutosaveIdleEffect,
} from "./studio-host-wave5-viewport-lifecycle-helpers";
import {
  buildStudioMainMenuSurfaceActions,
  buildStudioOnCanvasSurfaceHandlers,
  runStudioCommitEditText,
} from "./studio-host-wave5-workspace-surface-helpers";

const passthroughBi = (ko: string, _en: string) => ko;

function createPage(id: string, elements: El[] = []): PageState {
  return {
    id,
    name: id,
    canvasH: 1200,
    bg: "#ffffff",
    bgGrad: null,
    elements,
    groups: [],
  };
}

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("studio-host-wave5 helpers & lightweight contracts", () => {
  it("commits pending and existing text edits while enforcing authority and resource unlock", () => {
    const addEl = vi.fn(() => true);
    const patchEl = vi.fn(() => true);
    const setEditing = vi.fn();
    const endLiveResourceEdit = vi.fn();
    const pendingText = {
      id: "txt-1",
      type: "text" as const,
      x: 10,
      y: 20,
      width: 120,
      text: "",
      fontSize: 20,
      fill: "#111111",
      rotation: 0,
    };

    const blocked = runStudioCommitEditText({
      finalValue: "안녕",
      editing: { id: "txt-1", pendingText, canInsert: () => false },
      elementById: new Map(),
      webtoonTheme: "classic",
      addEl,
      patchEl,
      setEditing,
      endLiveResourceEdit,
      authorityChangedMessage: "권한이 바뀌어 글자를 추가할 수 없습니다.",
      insertFailedMessage: "지금은 원고에 글자를 추가할 수 없습니다.",
    });
    expect(blocked).toContain("권한이 바뀌어");
    expect(addEl).not.toHaveBeenCalled();

    const inserted = runStudioCommitEditText({
      finalValue: "새 대사",
      editing: { id: "txt-1", pendingText, canInsert: () => true },
      elementById: new Map(),
      webtoonTheme: "classic",
      addEl,
      patchEl,
      setEditing,
      endLiveResourceEdit,
      authorityChangedMessage: "권한이 바뀌어 글자를 추가할 수 없습니다.",
      insertFailedMessage: "지금은 원고에 글자를 추가할 수 없습니다.",
    });
    expect(inserted).toBeUndefined();
    expect(addEl).toHaveBeenCalledWith(expect.objectContaining({ id: "txt-1", text: "새 대사" }));
    expect(setEditing).toHaveBeenCalledWith(null);

    const textEl: El = { ...pendingText, text: "기존" };
    runStudioCommitEditText({
      finalValue: "수정됨",
      editing: { id: "txt-1" },
      elementById: new Map([["txt-1", textEl]]),
      webtoonTheme: "classic",
      addEl,
      patchEl,
      setEditing,
      endLiveResourceEdit,
      authorityChangedMessage: "권한이 바뀌어 글자를 추가할 수 없습니다.",
      insertFailedMessage: "지금은 원고에 글자를 추가할 수 없습니다.",
    });
    expect(patchEl).toHaveBeenCalledWith("txt-1", { text: "수정됨" });
    expect(endLiveResourceEdit).toHaveBeenCalledTimes(1);
  });

  it("wires main menu surface actions and on-canvas surface handlers cleanly", () => {
    const defaultWorkspace = createStudioWorkspaceDefaultState("owner-1");
    const persistStudioWorkspaceState = vi.fn();
    const setCommentsOpen = vi.fn();
    const setTeamPanelOpen = vi.fn();
    const announceDrawingShortcut = vi.fn();
    const changeStudioSymmetryType = vi.fn();
    const setSilkGenerativeSpec = vi.fn();
    const executeQuickAction = vi.fn();
    const applyWebtoonCanvasPreset = vi.fn();

    const surfaceActions = buildStudioMainMenuSurfaceActions({
      activatePixelSelectionToolFromInspector: vi.fn(),
      setRightPanelOpenWithOverride: vi.fn(),
      workspacePersistenceRef: { current: { state: defaultWorkspace } },
      persistStudioWorkspaceState,
      enterQuickMask: vi.fn(),
      commitQuickMask: vi.fn(),
      setTimelineOpen: vi.fn(),
      openFrameAnimationForSelected: vi.fn(),
      setOnionSkin: vi.fn(),
      setAnimaticTimelineOpen: vi.fn(),
      setCommentsOpen,
      setTeamPanelOpen,
      setPageReviewOpen: vi.fn(),
      setCheckpointPanelOpen: vi.fn(),
      setWriterRoomOpen: vi.fn(),
      setStoryboardGridOpen: vi.fn(),
      setScrollPreviewOpen: vi.fn(),
      setContinuityOpen: vi.fn(),
      setProductionBibleOpen: vi.fn(),
      setWebtoonAssistantOpen: vi.fn(),
      setAiSuperSuiteOpen: vi.fn(),
      sendCurrentPageToCompareReview: vi.fn(async () => undefined),
      setQuickStartOpen: vi.fn(),
      setPublishPackageOpen: vi.fn(),
      setPublishPreflightOpen: vi.fn(),
      setAssetRightsAuditOpen: vi.fn(),
      openAutoActions: vi.fn(),
      openInspectorRoute: vi.fn(),
      applyWebtoonCanvasPreset,
      setShowGrid: vi.fn(),
      setShowWebtoonGuides: vi.fn(),
      toggleEraseToIntersectionMode: vi.fn(),
      setDialogueBatchOpen: vi.fn(),
      setDialogueTranslateOpen: vi.fn(),
      setPixelArtMode: vi.fn(),
      insertStudioStickyNote: vi.fn(),
      setSilkGenerativeSpec,
      changeStudioSymmetryType,
      openHybridDccWorkspace: vi.fn(),
      announceDrawingShortcut,
      openVrmPoserFromMenu: vi.fn(),
      openCharacterShaperFromMenu: vi.fn(),
      openBackground3dFromMenu: vi.fn(),
    });

    surfaceActions.toggleStudioCommandBar();
    expect(persistStudioWorkspaceState).toHaveBeenCalledTimes(1);

    surfaceActions.openTeamPanel();
    expect(setCommentsOpen).toHaveBeenCalledWith(false);
    expect(setTeamPanelOpen).toHaveBeenCalledWith(true);

    surfaceActions.enableSilkSymmetry();
    expect(changeStudioSymmetryType).toHaveBeenCalledWith("silk");
    expect(setSilkGenerativeSpec).toHaveBeenCalledTimes(1);

    surfaceActions.startEphemeralWhiteboard();
    expect(announceDrawingShortcut).toHaveBeenCalledWith(expect.stringContaining("빠른 화이트보드"));

    const onCanvas = buildStudioOnCanvasSurfaceHandlers({
      setStrokeWidth: vi.fn(),
      setBrushOpacity: vi.fn(),
      openColorWheelAt: vi.fn(),
      drawMode: "eraser",
      executeQuickAction,
      reorder: vi.fn(),
      alignSelected: vi.fn(),
      wrapRef: { current: null },
      zoomHostRef: { current: null },
      canvasH: 1200,
      currentCanvasSelectionIds: () => [],
      elementById: new Map(),
      canvasFlipH: false,
      canvasRotation: 0,
    });
    onCanvas.onToggleEraser();
    expect(executeQuickAction).toHaveBeenCalledWith("pen");
    expect(onCanvas.getCanvasRect()).toBeNull();
    expect(onCanvas.getSelectionRect()).toBeNull();
  });

  it("handles comment popover close, companion controls, writer room plan, and metadata step", () => {
    const dispatchSession = vi.fn();
    runStudioCloseCommentThreadPopover({
      reason: "escape",
      setStudioCommentThreadPopoverTarget: vi.fn(),
      setStudioCommentInteractionNotice: vi.fn(),
      dispatchStudioCommentThreadSession: dispatchSession,
    });
    expect(dispatchSession).toHaveBeenCalledWith({
      type: "session.close",
      reason: "escape",
      discardDraft: true,
    });

    const setSelectedId = vi.fn();
    const setTool = vi.fn();
    const historyHandler = vi.fn();
    const setColor = vi.fn();
    const activatePrimaryCanvasTool = vi.fn();
    const existingEl: El = {
      id: "layer-1",
      type: "text",
      x: 0,
      y: 0,
      width: 100,
      text: "hi",
      fontSize: 16,
      fill: "#000000",
      rotation: 0,
    };

    runStudioCompanionControl({
      control: { kind: "select-layer", layerId: "layer-1" },
      drawingRef: { current: null },
      hasActivePointerSession: false,
      wrapRef: { current: null },
      activeElementsRef: { current: [existingEl] },
      studioCommentViewDocumentRef: { current: { version: 1, threads: [] } },
      companionHistoryHandlerRef: { current: historyHandler },
      brush: "pen",
      setSelectedId,
      setTool,
      openStudioCommentThreadInReview: vi.fn(),
      applyBuiltInBrushPreset: vi.fn(),
      setStrokeWidth: vi.fn(),
      setBrushOpacity: vi.fn(),
      setColor,
      activatePrimaryCanvasTool,
    });
    expect(setSelectedId).toHaveBeenCalledWith("layer-1");
    expect(setTool).toHaveBeenCalledWith("select");

    runStudioCompanionControl({
      control: { kind: "history", action: "undo" },
      drawingRef: { current: null },
      hasActivePointerSession: false,
      wrapRef: { current: null },
      activeElementsRef: { current: [] },
      studioCommentViewDocumentRef: { current: { version: 1, threads: [] } },
      companionHistoryHandlerRef: { current: historyHandler },
      brush: "pen",
      setSelectedId,
      setTool,
      openStudioCommentThreadInReview: vi.fn(),
      applyBuiltInBrushPreset: vi.fn(),
      setStrokeWidth: vi.fn(),
      setBrushOpacity: vi.fn(),
      setColor,
      activatePrimaryCanvasTool,
    });
    expect(historyHandler).toHaveBeenCalledWith("undo");

    runStudioCompanionControl({
      control: { kind: "brush", patch: { color: "#FF00AA" } },
      drawingRef: { current: null },
      hasActivePointerSession: false,
      wrapRef: { current: null },
      activeElementsRef: { current: [] },
      studioCommentViewDocumentRef: { current: { version: 1, threads: [] } },
      companionHistoryHandlerRef: { current: historyHandler },
      brush: "pen",
      setSelectedId,
      setTool,
      openStudioCommentThreadInReview: vi.fn(),
      applyBuiltInBrushPreset: vi.fn(),
      setStrokeWidth: vi.fn(),
      setBrushOpacity: vi.fn(),
      setColor,
      activatePrimaryCanvasTool,
    });
    expect(setColor).toHaveBeenCalledWith("#ff00aa");
    expect(activatePrimaryCanvasTool).toHaveBeenCalledWith("draw", expect.any(String), true);

    const setPlanError = vi.fn();
    runStudioApplyWriterRoomCanvasPlan({
      writerRoomCanvasPlan: null,
      pages: [createPage("p1")],
      activePageId: "p1",
      buildAndInsertWriterRoomPages: vi.fn(),
      commitPages: vi.fn(() => true),
      setCurrentPageId: vi.fn(() => true),
      setSelectedId: vi.fn(),
      setMarqueeIds: vi.fn(),
      setMasterEditMode: vi.fn(),
      setTool: vi.fn(),
      setError: setPlanError,
      setWriterRoomOpen: vi.fn(),
      connectionErrorMessage: "컷 플랜의 연결 오류를 먼저 해결해 주세요.",
      safetyCheckFailedMessage: "안전 검증에 실패했어요.",
    });
    expect(setPlanError).toHaveBeenCalledWith(expect.stringContaining("컷 플랜"));

    const mobileFocusRef: { current: "default" | "publish-title" } = { current: "default" };
    const openInspectorRoute = vi.fn();
    const rafSpy = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("requestAnimationFrame", rafSpy);
    try {
      runStudioOpenWorkMetadataStep({
        status: "published",
        isMobile: true,
        mobileSheetAutofocusTargetRef: mobileFocusRef,
        propsSheetRef: { current: null },
        titleInputRef: { current: null },
        setPendingSaveIntent: vi.fn(),
        setMenu: vi.fn(),
        openInspectorRoute,
        dismissQuickStart: vi.fn(),
      });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(mobileFocusRef.current).toBe("publish-title");
    expect(openInspectorRoute).toHaveBeenCalledWith({ primary: "publish" }, "props");
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  it("handles canvas-only mode, autosave idle guards, pixel selection guards, and history brush source", async () => {
    const setCanvasOnlyMode = vi.fn();
    const setMaximized = vi.fn();
    runStudioEnterCanvasOnlyMode({
      setIsFullscreen: vi.fn(),
      setMaximized,
      setMenu: vi.fn(),
      setMobileSheet: vi.fn(),
      setQuickActionsOpen: vi.fn(),
      setCanvasOnlyMode,
    });
    expect(setMaximized).toHaveBeenCalledWith(false);
    expect(setCanvasOnlyMode).toHaveBeenCalledWith(true);

    expect(runStudioServerAutosaveIdleEffect({
      workId: null,
      hasSharedDocument: false,
      loggedIn: true,
      collaborationDocumentLocked: false,
      workHydrated: true,
      title: "테스트",
      pages: [createPage("p1")],
      master: { elements: [] },
      characterBible: { version: 1, characters: [] },
      documentSaveInFlightRef: { current: false },
      drawingRef: { current: null },
      drawingPointerTransportRef: { current: null },
      handleSaveRef: { current: vi.fn(async () => undefined) },
    })).toBeUndefined();

    const imgEl = {
      id: "img-1",
      type: "image" as const,
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      rotation: 0,
      src: "data:image/png;base64,AAA",
    };
    const setHistoryIndex = vi.fn();
    const setHistorySrc = vi.fn();
    const setError = vi.fn();

    runStudioDesignateHistoryBrushSource({
      index: 0,
      masterEditMode: false,
      activeSurfaceReviewLocked: false,
      selected: imgEl,
      groups: [],
      pagesHistory: [[createPage("p1", [imgEl])]],
      activePageId: "p1",
      setHistoryBrushSourceIndex: setHistoryIndex,
      setHistoryBrushSourceSrc: setHistorySrc,
      setError,
      sourceMissingMessage: "이 시점엔 같은 레이어가 없습니다.",
    });
    expect(setHistoryIndex).toHaveBeenCalledWith(0);
    expect(setHistorySrc).toHaveBeenCalledWith("data:image/png;base64,AAA");
    expect(setError).toHaveBeenCalledWith(null);

    const setWandError = vi.fn();
    await runStudioMagicWandSelectOnTarget({
      target: imgEl,
      pos: { x: 10, y: 10 },
      frame: { x: 0, y: 0, width: 200, height: 200 },
      activeSurfaceReviewLockedRef: { current: true },
      groups: [],
      wandTolerance: 16,
      pixelCombine: "replace",
      pixelWandRunIdRef: { current: 0 },
      pixelWandActiveRunIdRef: { current: null },
      captureStudioMutationTicket: vi.fn(),
      canApplyStudioMutation: () => true,
      activePixelSelectionElementId: () => "img-1",
      commitPixelSelectionState: vi.fn(),
      setPixelBusy: vi.fn(),
      setError: setWandError,
      pointNotFoundMessage: "선택할 영역을 찾지 못했어요.",
    });
    expect(setWandError).toHaveBeenCalledWith(expect.stringContaining("매직완드"));

    const fieldRunIdRef = { current: 2 };
    const fieldStateRef: { current: { status: "disabled" } | { status: "loading"; key: string } } = {
      current: { status: "loading", key: "k" },
    };
    runStudioMagneticLassoFieldEffect({
      magneticLassoFieldKey: null,
      magneticLassoFieldSrc: null,
      selectedImageElementId: null,
      magneticLassoFieldFlipX: false,
      magneticLassoFieldFlipY: false,
      pixelMagneticFieldRunIdRef: fieldRunIdRef,
      pixelMagneticFieldStateRef: fieldStateRef,
      fieldLoadFailedMessage: () => "휘도장을 불러오지 못했습니다.",
    });
    expect(fieldRunIdRef.current).toBe(3);
    expect(fieldStateRef.current).toEqual({ status: "disabled" });
  });

  it("handles local formal save, export guards, server revisions, and asset catalog actions", async () => {
    const storage = createMemoryStorage();
    const setFormalSaveOpen = vi.fn();
    const setFormalSaveProjectTitle = vi.fn();
    const opened = runStudioOpenLocalFormalSave({
      context: {
        project: {
          id: "proj-1",
          title: "1화 원고",
          kind: "webtoon",
          status: "active",
          statusBeforeTrash: null,
          templateId: null,
          description: "",
          primaryLocale: "ko",
          createdAt: "2026-11-23T00:00:00Z",
          updatedAt: "2026-11-23T00:00:00Z",
          lastOpenedAt: "2026-11-23T00:00:00Z",
          lastOpenedDocumentId: "doc-1",
          thumbnailUrl: null,
        },
        documentId: "doc-1",
      },
      storage,
      setError: vi.fn(),
      setFormalSaveProjectTitle,
      setFormalSaveFirstSave: vi.fn(),
      setFormalSaveError: vi.fn(),
      setFormalSaveOpen,
      bi: passthroughBi,
    });
    expect(opened).toBe(true);
    expect(setFormalSaveProjectTitle).toHaveBeenCalledWith("1화 원고");
    expect(setFormalSaveOpen).toHaveBeenCalledWith(true);

    await expect(runStudioExportCurrentPageToSvg({
      ensureSharedDocumentAvailableForExport: () => false,
      sharedDocRequiredError: "공동 문서를 불러온 뒤 SVG로 내보낼 수 있어요.",
      elements: [],
      canvasH: 1200,
      bg: "#ffffff",
      bgGrad: null,
      exportTransparent: false,
      groups: [],
      webtoonTheme: "classic",
    })).rejects.toThrow("SVG");

    await expect(runStudioExportCurrentPageToInkMl({
      ensureSharedDocumentAvailableForExport: () => false,
      sharedDocRequiredError: "공동 문서를 불러온 뒤 InkML로 내보낼 수 있어요.",
      activePage: createPage("p1"),
    })).rejects.toThrow("InkML");

    await expect(runStudioCaptureTimelapseStep({
      historyIndex: 99,
      targetWidth: 800,
      pagesHistory: [],
      currentPageId: "p1",
      effScale: 1,
      setPagesHi: vi.fn(),
      setCurrentPageId: vi.fn(() => true),
      captureReadyStageForHistoryPage: vi.fn(),
      pageNotFoundMessage: "타임랩스로 캡처할 페이지를 찾을 수 없어요.",
    })).rejects.toThrow("타임랩스");

    const setServerRevisions = vi.fn();
    const cleanup = runStudioLoadServerRevisionsEffect({
      checkpointPanelOpen: true,
      workId: "w1",
      studioAuthUserId: "u1",
      serverCurrentRevision: 2,
      sharedDocumentRole: "editor",
      loggedIn: true,
      serverRevisionRequestRef: { current: 0 },
      currentStudioDocumentScopeRef: { current: { authScopeKey: "u1", workId: "w1" } },
      editorMountedRef: { current: true },
      setServerRevisions,
      setServerRevisionError: vi.fn(),
      setServerRevisionLoading: vi.fn(),
      loadFailedMessage: () => "서버 버전 목록을 불러오지 못했어요.",
    });
    expect(cleanup).toBeUndefined();
    expect(setServerRevisions).toHaveBeenCalledWith([]);

    const setFxPanelOpen = vi.fn();
    await runStudioOpenOwnerFxPanel({
      loadedWork: { id: "w1", revision: 1 } as never,
      sharedDocument: null,
      workId: "w1",
      studioAuthUserId: "u1",
      fxPanelLoading: false,
      ownerDetailAbortRef: { current: null },
      currentStudioDocumentScopeRef: { current: { authScopeKey: "u1", workId: "w1" } },
      editorMountedRef: { current: true },
      setFxPanelOpen,
      setFxPanelLoading: vi.fn(),
      setLoadedWork: vi.fn(),
      setError: vi.fn(),
      loadFailedMessage: "애니메이션 연출을 불러오지 못했어요.",
    });
    expect(setFxPanelOpen).toHaveBeenCalledWith(true);

    const setPublishContext = vi.fn();
    runStudioLoadPublishContextEffect({
      publishContextSeriesId: null,
      publishContextChallengeId: null,
      setPublishContext,
    });
    expect(setPublishContext).toHaveBeenCalledWith({});

    const setShareError = vi.fn();
    await runStudioShareAsset({
      asset: { id: "a1", name: "배경", dataUrl: "data:image/png;base64,AA", width: 10, height: 10, createdAt: 0 },
      options: { description: "", license: "cc0-1.0", tags: [], containsAi: false, rightsConfirmed: true },
      studioAuthUserId: null,
      setPublishingId: vi.fn(),
      setAssetTab: vi.fn(),
      loadSharedAssets: vi.fn(async () => undefined),
      setError: setShareError,
      shareFailedMessage: "에셋을 공유하지 못했어요.",
    });
    expect(setShareError).toHaveBeenCalledWith(expect.stringContaining("로그인"));

    const setReportError = vi.fn();
    await runStudioReportSharedAsset({
      asset: { id: "s1" } as never,
      reason: "copyright",
      details: "test",
      studioAuthUserId: null,
      announceDrawingShortcut: vi.fn(),
      loadSharedAssets: vi.fn(async () => undefined),
      setError: setReportError,
      reportFailedMessage: "에셋을 신고하지 못했어요.",
    });
    expect(setReportError).toHaveBeenCalledWith(expect.stringContaining("로그인"));

    const commitPages = vi.fn(() => true);
    const setActiveLocale = vi.fn();
    const setDraft = vi.fn();
    const bubbleEl: El = {
      id: "b1",
      type: "bubble",
      x: 10,
      y: 10,
      width: 140,
      height: 70,
      text: "안녕",
      variant: "speech",
      fill: "#ffffff",
      textFill: "#111111",
      rotation: 0,
    };
    runStudioApplyTranslationDraft({
      translateDraft: new Map([["b1", "Hello"]]),
      pages: [createPage("p1", [bubbleEl])],
      translateTargetLocale: "en",
      commitPages,
      setActiveDialogueLocale: setActiveLocale,
      setTranslateDraft: setDraft,
    });
    expect(commitPages).toHaveBeenCalledTimes(1);
    expect(setActiveLocale).toHaveBeenCalledWith("en");
    expect(setDraft).toHaveBeenCalledWith(null);

    const menuEntries = buildStudioMenuAssetLoaderEntries({
      menu: "scene",
      panelLayoutPresetsLength: 0,
      sceneTemplatePacksLoaded: false,
      sfxPacksLoaded: false,
      studioBgSceneAssetsLoaded: false,
      studioStickerAssetsLoaded: false,
      studioEmeresAssetsLoaded: false,
      setPanelLayoutsLoading: vi.fn(),
      setPanelLayoutsError: vi.fn(),
      setPanelLayoutPresets: vi.fn(),
      setSceneTemplatesLoading: vi.fn(),
      setSceneTemplatesError: vi.fn(),
      setSceneTemplatePacks: vi.fn(),
      setSfxLoading: vi.fn(),
      setSfxError: vi.fn(),
      setSfxPacks: vi.fn(),
      setStudioBgSceneAssetsLoading: vi.fn(),
      setStudioBgSceneAssetsError: vi.fn(),
      setStudioBgSceneAssetsLoaded: vi.fn(),
      setStudioStickerAssetsLoading: vi.fn(),
      setStudioStickerAssetsError: vi.fn(),
      setStudioStickerAssetsLoaded: vi.fn(),
      setStudioEmeresAssetsLoading: vi.fn(),
      setStudioEmeresAssetsError: vi.fn(),
      setStudioEmeresAssetsLoaded: vi.fn(),
      setStudioOptionalAssets: vi.fn(),
      loadBgScenes: vi.fn(),
      loadStickerAssets: vi.fn(),
      errorMessages: {
        panelLayouts: "err-1",
        sceneTemplates: "err-2",
        sfxPresets: "err-3",
        bgScenes: "err-4",
        stickerAssets: "err-5",
        emeresFrames: "err-6",
      },
    });
    expect(menuEntries).toHaveLength(6);
    expect(menuEntries.filter((entry) => entry.active)).toHaveLength(1);
  });

  it("preserves lightweight contracts extracted from bg3d", () => {
    expect(DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.version).toBe(STUDIO_BG3D_SCENE_DOCUMENT_VERSION);
    expect(new StudioBg3dSceneDocumentBudgetError("node-count-budget-exceeded")).toBeInstanceOf(Error);

    const paint = createEmptyStudioBg3dTexturePaint();
    expect(countStudioBg3dTexturePaintPoints(paint)).toBe(0);

    const remapped = remapStudioBg3dLtCopiedBundles([], true);
    expect(remapped).toEqual([]);
  });
});
