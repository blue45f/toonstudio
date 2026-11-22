import { describe, expect, it, vi } from "vitest";

import {
  isStudioBg3dHdriEnvironmentAssetId,
  normalizeStudioBg3dEnvironmentSettings,
  STUDIO_BG3D_DEFAULT_ENVIRONMENT_SETTINGS,
} from "../contracts/studio-bg3d-environment-settings";
import { studioBg3dFocalLengthToFovDegrees } from "../contracts/studio-bg3d-lens-math";
import {
  createStudioVrmRigProfileSelection,
  normalizeStudioVrmRigProfile,
  STUDIO_VRM_RIG_PROFILE_IDS,
} from "../contracts/studio-vrm-rig-profile-selection";
import { EMPTY_STUDIO_LAYER_SOLO_STATE } from "../layer/studio-layer-solo";
import { DEFAULT_STUDIO_LIVING_INK_MATERIAL_CONTROLS } from "../runtime-leaves/studio-living-ink-gpu-constants";
import { defaultStudioAppSettings } from "../studio-app-settings";
import { createStudioCausalPostCorrectionState } from "../studio-causal-post-correction";
import { createEmptyStudioCommentsDocument } from "../studio-comments";
import { createStudioCommittedInkSurfaceHandoff } from "../studio-committed-ink-handoff-coordinator";
import type { DrawEl, El, FrameEl } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import { createPixelSelectionHistory } from "../studio-pixel-selection-session-history";
import { createStudioPredictedInkTailState } from "../studio-predicted-ink-tail";
import {
  buildStudioTextAiSettlementOptions,
  planStudioScenarioProductionImport,
  resolveStudioAddReferenceAttachment,
  runStudioApplyAiAssistPresetPrompt,
} from "./studio-host-wave2-ai-assist-helpers";
import {
  applyStudioSnapEnabledVisible,
  deriveStudioOptionsBarsDrawModel,
  deriveStudioSelectedForInspector,
  hasStudioBg3dCurrentTarget,
  runStudioExecuteQuickAccessCommand,
  runStudioStartCanvasEditText,
} from "./studio-host-wave2-draw-options-helpers";
import {
  buildStudioFxOverlayImageElement,
  buildStudioInsertState,
  computeStudioBubbleFitHeight,
  planStudioLayerItemsPatch,
  runStudioImportDialogueInterchange,
} from "./studio-host-wave2-element-layout-helpers";
import {
  advanceStudioQuickShapePointerMove,
  collectStudioCommittedInkAuthorityEvidence,
  deriveStudioRawPenInkPreviewEligibility,
  runStudioArmRawPenInkPreview,
  runStudioPatchLivingInkMaterial,
  runStudioRestoreCausalPostCorrectionTail,
} from "./studio-host-wave2-live-ink-helpers";
import {
  countStudioEditableRasterTargets,
  resolveStudioEnsurePixelToolTarget,
  runStudioCommitPixelSelectionState,
  runStudioPreviewDrawingAssistDocument,
} from "./studio-host-wave2-pixel-retouch-helpers";
import {
  deriveStudioWorkAssetRenderPlaceholders,
  runStudioOpenCommentThreadInReview,
  runStudioToggleCanvasWideMode,
  runStudioToggleLayerSolo,
  runStudioToggleLocalHidden,
} from "./studio-host-wave2-workspace-helpers";

function makePage(overrides: Partial<PageState> = {}): PageState {
  return {
    id: "page-1",
    name: "1화",
    canvasH: 1200,
    bg: "#ffffff",
    bgGrad: null,
    elements: [],
    groups: [],
    ...overrides,
  };
}

function makeImage(
  id: string,
  overrides: Partial<Extract<El, { type: "image" }>> = {},
): Extract<El, { type: "image" }> {
  return {
    id,
    type: "image",
    src: "data:image/png;base64,iVBORw0KGgo=",
    x: 0,
    y: 0,
    width: 320,
    height: 240,
    rotation: 0,
    ...overrides,
  };
}

function makeFrame(id: string, overrides: Partial<FrameEl> = {}): FrameEl {
  return {
    id,
    type: "frame",
    x: 24,
    y: 24,
    width: 752,
    height: 360,
    ...overrides,
  };
}

function makeBubble(
  id: string,
  overrides: Partial<Extract<El, { type: "bubble" }>> = {},
): Extract<El, { type: "bubble" }> {
  return {
    id,
    type: "bubble",
    variant: "speech",
    text: "안녕, 오늘 날씨 참 좋네!",
    x: 40,
    y: 60,
    width: 240,
    height: 80,
    fill: "#ffffff",
    textFill: "#111111",
    rotation: 0,
    ...overrides,
  };
}

function makeDraw(id: string, overrides: Partial<DrawEl> = {}): DrawEl {
  return {
    id,
    type: "draw",
    points: [10, 10, 40, 50, 90, 80],
    stroke: "#111111",
    strokeWidth: 4,
    pressures: [0.5, 0.7, 0.4],
    tiltXs: [0.1, 0.2, 0.3],
    ...overrides,
  };
}

describe("studio-host Wave 2 extracted helpers & eager-graph contract leaves", () => {
  describe("lightweight eager-graph contract leaves", () => {
    it("validates and normalizes VRM rig profiles, BG3D HDRI settings, and lens focal-length math", () => {
      expect(STUDIO_VRM_RIG_PROFILE_IDS).toContain("neutral");
      expect(normalizeStudioVrmRigProfile("adult")?.id).toBe("adult");
      expect(normalizeStudioVrmRigProfile("unknown-rig")).toBeNull();
      expect(createStudioVrmRigProfileSelection("teen")?.id).toBe("teen");

      expect(isStudioBg3dHdriEnvironmentAssetId("combination-room")).toBe(true);
      expect(isStudioBg3dHdriEnvironmentAssetId("custom-unknown")).toBe(false);
      const normalizedEnv = normalizeStudioBg3dEnvironmentSettings({
        source: "hdri",
        assetId: "konigsallee",
        rotationDegrees: 405,
        intensity: 9,
      });
      expect(normalizedEnv.source).toBe("hdri");
      expect(normalizedEnv.assetId).toBe("konigsallee");
      expect(normalizedEnv.rotationDegrees).toBe(45);
      expect(normalizedEnv.intensity).toBe(4);
      expect(normalizeStudioBg3dEnvironmentSettings(null)).toEqual(
        STUDIO_BG3D_DEFAULT_ENVIRONMENT_SETTINGS,
      );

      const fov50 = studioBg3dFocalLengthToFovDegrees(50);
      const fov24 = studioBg3dFocalLengthToFovDegrees(24);
      expect(fov50).toBeGreaterThan(25);
      expect(fov50).toBeLessThan(28);
      expect(fov24).toBeGreaterThan(fov50);
    });
  });

  describe("workspace helpers", () => {
    it("toggles wide mode and restores saved left/right panel states", () => {
      const presentationPanelsHiddenRef = { current: false };
      const leftPanelOpenRef = { current: true };
      const rightPanelOpenRef = { current: false };
      const visibleLeftPanelOpenRef = { current: true };
      const visibleRightPanelOpenRef = { current: false };
      const canvasWidePanelRestoreRef = { current: { left: true, right: true } };
      const setLeft = vi.fn();
      const setRight = vi.fn();

      runStudioToggleCanvasWideMode({
        presentationPanelsHiddenRef,
        leftPanelOpenRef,
        rightPanelOpenRef,
        visibleLeftPanelOpenRef,
        visibleRightPanelOpenRef,
        canvasWidePanelRestoreRef,
        setLeftPanelOpenWithOverride: setLeft,
        setRightPanelOpenWithOverride: setRight,
      });
      expect(canvasWidePanelRestoreRef.current).toEqual({ left: true, right: false });
      expect(setLeft).toHaveBeenCalledWith(false, { preserveWideRestore: true });
      expect(setRight).toHaveBeenCalledWith(false, { preserveWideRestore: true });

      visibleLeftPanelOpenRef.current = false;
      visibleRightPanelOpenRef.current = false;
      runStudioToggleCanvasWideMode({
        presentationPanelsHiddenRef,
        leftPanelOpenRef,
        rightPanelOpenRef,
        visibleLeftPanelOpenRef,
        visibleRightPanelOpenRef,
        canvasWidePanelRestoreRef,
        setLeftPanelOpenWithOverride: setLeft,
        setRightPanelOpenWithOverride: setRight,
      });
      expect(setLeft).toHaveBeenLastCalledWith(true);
      expect(setRight).toHaveBeenLastCalledWith(false);
    });

    it("toggles local hidden and solo states cleanly and derives reference-limit placeholder", () => {
      let soloState = EMPTY_STUDIO_LAYER_SOLO_STATE;
      let localHidden: ReadonlySet<string> = new Set();
      const announce = vi.fn();
      const elements: El[] = [makeImage("img-1"), makeImage("img-2")];

      runStudioToggleLayerSolo({
        id: "img-1",
        elements,
        layerSoloState: soloState,
        localHiddenElementIds: localHidden,
        setLayerSoloState: (u) => { soloState = typeof u === "function" ? u(soloState) : u; },
        setLocalHiddenElementIds: (u) => { localHidden = typeof u === "function" ? u(localHidden) : u; },
        announceDrawingShortcut: announce,
      });
      expect(soloState.soloId).toBe("img-1");
      expect(localHidden.has("img-2")).toBe(true);
      expect(announce).toHaveBeenCalledWith("레이어 솔로 · 이 레이어만 표시");

      runStudioToggleLocalHidden({
        id: "img-2",
        layerSoloState: soloState,
        setLayerSoloState: (u) => { soloState = typeof u === "function" ? u(soloState) : u; },
        setLocalHiddenElementIds: (u) => { localHidden = typeof u === "function" ? u(localHidden) : u; },
      });
      expect(soloState.soloId).toBeNull();
      expect(localHidden.has("img-2")).toBe(true);

      const placeholders = deriveStudioWorkAssetRenderPlaceholders(true, []);
      expect(placeholders).toHaveLength(1);
      expect(placeholders[0]?.assetId).toBe("reference-limit");
    });

    it("opens a comment thread in the review panel and marks it read", () => {
      const dispatchSession = vi.fn();
      const requestFocus = vi.fn();
      const openInbox = vi.fn();
      const markRead = vi.fn(async () => true);
      const setPopoverTarget = vi.fn();
      const setInteractionNotice = vi.fn();

      runStudioOpenCommentThreadInReview({
        threadId: "thread-42",
        documentRef: { current: createEmptyStudioCommentsDocument() },
        unreadThreadIds: new Set(["thread-42"]),
        setPopoverTarget,
        setInteractionNotice,
        dispatchSession,
        requestFocus,
        openInbox,
        markRead,
      });

      expect(setPopoverTarget).toHaveBeenCalledWith(null);
      expect(dispatchSession).toHaveBeenCalledWith(expect.objectContaining({
        type: "session.open",
        surface: "review-panel",
        preferredThreadId: "thread-42",
      }));
      expect(requestFocus).toHaveBeenCalledWith("thread-42");
      expect(openInbox).toHaveBeenCalledOnce();
      expect(markRead).toHaveBeenCalledWith("thread-42");
    });
  });

  describe("draw & options helpers", () => {
    it("strips heavy stroke sample arrays for inspector projection and detects unique bg3d target", () => {
      const stroke = makeDraw("d-1");
      const projected = deriveStudioSelectedForInspector(stroke);
      expect(projected?.type).toBe("draw");
      if (projected?.type === "draw") {
        expect(projected.points).toEqual([]);
        expect(projected.pressures).toBeUndefined();
        expect(projected.tiltXs).toBeUndefined();
      }
      expect(deriveStudioSelectedForInspector(null)).toBeNull();

      const page = makePage({ elements: [makeImage("bg-1")] });
      expect(hasStudioBg3dCurrentTarget({
        bg3dInitialElementId: "bg-1",
        masterEditMode: false,
        currentPageId: "page-1",
        activePageId: "page-1",
        pages: [page],
      })).toBe(true);
      expect(hasStudioBg3dCurrentTarget({
        bg3dInitialElementId: "bg-1",
        masterEditMode: true,
        currentPageId: "page-1",
        activePageId: "page-1",
        pages: [page],
      })).toBe(false);
    });

    it("updates snap setting only when changed and derives draw options model with living-ink fixAvailable", () => {
      const appSettingsRef = { current: defaultStudioAppSettings() };
      const setSnapEnabled = vi.fn();
      const setAppSettings = vi.fn();
      const persistAppSettings = vi.fn();

      applyStudioSnapEnabledVisible({
        next: !appSettingsRef.current.grids.snapToPixelGrid,
        appSettingsRef,
        setSnapEnabled,
        setAppSettings,
        persistAppSettings,
      });
      expect(persistAppSettings).toHaveBeenCalledOnce();

      const model = deriveStudioOptionsBarsDrawModel({
        activeCatalogBrushId: "pen-basic",
        activeCatalogBrushName: "기본 펜",
        brush: "pen",
        brushCatalogPlacement: undefined,
        currentWorkspaceOwnerScope: "owner-1",
        drawingLayoutRestoreOwnerScope: "owner-1",
        libraryDockOpenPref: true,
        focusBrushDockOpen: false,
        brushDefaultRestore: { available: true, loading: false, modifiedCount: 1, sourceName: "펜", undoAvailable: false },
        brushOpacity: 1,
        materialBrush: false,
        brushSlots: [],
        canvasFlipH: false,
        canvasOnlyMode: false,
        color: "#000000",
        drawMode: "pen",
        drawShape: "line",
        eraseToIntersection: false,
        livingInkBrushSupported: true,
        livingInkBusy: false,
        livingInkMaterial: DEFAULT_STUDIO_LIVING_INK_MATERIAL_CONTROLS,
        livingInkMode: "ink",
        livingInkPhysicalModeEnabled: true,
        livingInkPersistedLayer: true,
        livingInkEffectiveScope: "all",
        livingInkSelectionReady: false,
        livingInkState: "ready",
        livingInkStateMessage: null,
        postCorrection: 0,
        pressureCurve: 1.0,
        favoriteBrushIds: [],
        opacityLocked: false,
        recentBrushIds: [],
        sizeLocked: false,
        quickShapeActive: false,
        secondaryColor: "#ffffff",
        shapeFill: false,
        stabilizer: 0,
        stabilizerMode: "weighted",
        stampTuning: null,
        strokeWidth: 4,
        symmetryType: "none",
        tool: "draw",
        uiDensityMode: "simple",
        compactCanvasDockLeft: 12,
        compactCanvasDockRight: 16,
      });
      expect(model.visible).toBe(true);
      expect(model.libraryDockOpen).toBe(true);
      expect(model.layoutRestoreAvailable).toBe(true);
      expect(model.livingInk.fixAvailable).toBe(true);
    });

    it("guards unavailable quick-access commands and enters a group before editing nested text", () => {
      const announce = vi.fn();
      runStudioExecuteQuickAccessCommand({
        commandId: "missing",
        catalog: [],
        integration: null,
        announceDrawingShortcut: announce,
        executeQuickAction: vi.fn(),
        saveDraft: vi.fn(),
        openSmartShapeEditor: vi.fn(),
        openPixelSelectionTransform: vi.fn(),
      });
      expect(announce).toHaveBeenCalledWith("현재 실행할 수 없는 빠른 액세스 명령이에요");

      const bubble = makeBubble("b-1", { groupId: "g-1" });
      const applyGroupSelectionState = vi.fn();
      const startEditText = vi.fn();
      runStudioStartCanvasEditText({
        id: "b-1",
        element: bubble,
        elements: [bubble],
        groups: [{ id: "g-1", name: "그룹" }],
        activeGroupIdRef: { current: null },
        applyGroupSelectionState,
        announceDrawingShortcut: announce,
        startEditText,
      });
      expect(applyGroupSelectionState).toHaveBeenCalledOnce();
      expect(startEditText).not.toHaveBeenCalled();
    });
  });

  describe("element-layout & AI assist helpers", () => {
    it("plans layer item patches, builds insert state / FX overlay / bubble fit height, and blocks locked dialogue import", async () => {
      const frame = makeFrame("f-1");
      const bubble = makeBubble("b-1");
      const patched = planStudioLayerItemsPatch([frame, bubble], ["b-1"], () => ({ opacity: 0.5 }));
      expect(patched?.[1]?.opacity).toBe(0.5);
      expect(planStudioLayerItemsPatch([frame], ["f-1"], () => ({ x: frame.x }))).toBeNull();

      const insertState = buildStudioInsertState({
        elements: [frame],
        canvasH: 1200,
        selected: frame,
        viewCenter: { x: 400, y: 600 },
      });
      expect(insertState.selected?.type).toBe("frame");

      const fit = computeStudioBubbleFitHeight({
        selected: bubble,
        groups: [],
        webtoonTheme: "soft",
      });
      expect(fit?.id).toBe("b-1");
      expect(fit?.height).toBeGreaterThan(0);

      const fx = buildStudioFxOverlayImageElement({
        id: "fx-1",
        svgMarkup: "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'></svg>",
        width: 100,
        height: 100,
        canvasH: 1200,
        placement: { anchor: { x: 400, y: 300 } },
      });
      expect(fx.type).toBe("image");
      expect(fx.src.startsWith("data:image/svg+xml")).toBe(true);

      const lockedImport = await runStudioImportDialogueInterchange({
        document: { cues: [{ page: 1, text: "테스트" }] },
        mode: "page-order",
        pages: [makePage()],
        locked: true,
        captureMutationTicket: () => 1,
        canApplyMutation: () => true,
        commitPages: vi.fn(),
      });
      expect(lockedImport.locked).toBe(1);
    });

    it("builds AI settlement options, switches preset prompts, validates reference attachments, and plans scenario handoff", () => {
      const settlement = buildStudioTextAiSettlementOptions({
        provider: "openai",
        model: "gpt-4o-mini",
        transport: "byok",
        promptVersion: 1,
        createdAt: "2026-11-23T00:00:00.000Z",
        requestId: "req-1",
      }, false);
      expect(settlement.provider).toBe("openai");
      expect(settlement.requestId).toBe("req-1");

      const setActiveTool = vi.fn();
      const setDialogueSituation = vi.fn();
      runStudioApplyAiAssistPresetPrompt({
        tool: "dialogue",
        prompt: "옥상 고백 장면",
        activeTool: "background",
        setActiveTool,
        setBgPrompt: vi.fn(),
        setCharacterPrompt: vi.fn(),
        setDialogueSituation,
        setPaletteMood: vi.fn(),
        setCompositionDraft: vi.fn(),
      });
      expect(setActiveTool).toHaveBeenCalledWith("dialogue");
      expect(setDialogueSituation).toHaveBeenCalledWith("옥상 고백 장면");

      const badImage = resolveStudioAddReferenceAttachment([], {
        kind: "image",
        label: "캐릭터",
        ref: "https://invalid.example/a.png",
      });
      expect(badImage.ok).toBe(false);
      const okText = resolveStudioAddReferenceAttachment([], {
        kind: "text",
        label: "톤",
        ref: "따뜻한 석양",
      });
      expect(okText.ok).toBe(true);

      const plan = planStudioScenarioProductionImport({
        handoff: {
          version: 1,
          source: "episode-production-director",
          episodeTitle: "1화",
          storyText: "1화 도입",
          characterDescription: "주인공",
          variants: 1,
          modeLabel: "표준",
          totalCuts: 2,
          projectedOutputCount: 2,
          generationWorkUnits: 2,
          scenes: [
            { sourceSceneNumber: 1, sourceCutNumber: 1, summary: "도입", imagePrompt: "학교 정문", dialogue: "안녕" },
            { sourceSceneNumber: 1, sourceCutNumber: 2, summary: "전개", imagePrompt: "교실", dialogue: "반가워" },
          ],
        },
        target: "new-page",
        elements: [],
        canvasH: 1200,
      });
      expect(plan.items).toHaveLength(2);
      expect(plan.sceneCountHint).toBe(2);
    });
  });

  describe("live-ink & pixel-retouch helpers", () => {
    it("collects committed ink authority evidence, advances quickshape dwell anchor, and guards living-ink material lock", () => {
      const stroke = makeDraw("s-1");
      const page = makePage({ id: "p-1", elements: [stroke] });
      const evidence = collectStudioCommittedInkAuthorityEvidence({
        handoff: createStudioCommittedInkSurfaceHandoff({
          pageId: "p-1",
          strokeIds: ["s-1", "s-deleted"],
          queuedRevision: 1,
          overlaySettledCount: 1,
          draftSettledCount: 0,
          gpuSettledCount: 0,
        }),
        revision: 2,
        pages: [page],
        activePageId: "p-1",
        activeElements: [stroke],
        crdtDocument: null,
      });
      expect(evidence.strokePageIds.get("s-1")).toBe("p-1");
      expect(evidence.strokeTombstoneIds.has("s-deleted")).toBe(true);

      const anchorRef = { current: { x: 10, y: 10 } as { x: number; y: number } | null };
      const sourceRef = { current: [10, 10] };
      const stableLenRef = { current: 2 };
      const elapsedRef = { current: 240 };
      advanceStudioQuickShapePointerMove({
        pos: { x: 100, y: 100 },
        effScale: 1,
        stillAnchorRef: anchorRef,
        convertedRef: { current: false },
        sourcePointsRef: sourceRef,
        stableSourceLengthRef: stableLenRef,
        stillElapsedRef: elapsedRef,
      });
      expect(anchorRef.current).toEqual({ x: 100, y: 100 });
      expect(elapsedRef.current).toBe(0);
      expect(sourceRef.current).toEqual([10, 10, 100, 100]);

      const setError = vi.fn();
      const updateMaterial = vi.fn();
      runStudioPatchLivingInkMaterial({
        patch: { flow: 0.8 },
        activeElements: [makeImage("li-1", { livingInkReceipt: { pageId: "p-1" } as Extract<El, { type: "image" }>["livingInkReceipt"] })],
        currentPageId: "p-1",
        setError,
        updateMaterial,
      });
      expect(setError).toHaveBeenCalledOnce();
      expect(updateMaterial).not.toHaveBeenCalled();

      const eligibility = deriveStudioRawPenInkPreviewEligibility({
        pointerEvent: { pointerType: "pen", shiftKey: false, pointerId: 1 } as PointerEvent,
        drawing: stroke,
        tool: "draw",
        liveDraftDirect: true,
        gpuActive: false,
        stampActive: false,
        fixedRateFilterActive: false,
        immediateCausalInput: true,
        stabilizerInstanceActive: false,
        postCorrectionActive: false,
        settings: { stabilizer: 0, useVelocityPressure: false },
      });
      expect(eligibility.pointerType).toBe("pen");
      expect(eligibility.stabilizerActive).toBe(false);

      const rawStateRef = { current: null };
      runStudioArmRawPenInkPreview({
        pointerEvent: { pointerId: 7 } as PointerEvent,
        eligibility,
        authoritativeTail: createStudioPredictedInkTailState(),
        rawStateRef,
        generationRef: { current: 0 },
      });
      expect(rawStateRef.current).toBeNull();

      const applyPointTail = vi.fn();
      runStudioRestoreCausalPostCorrectionTail({
        el: stroke,
        state: createStudioCausalPostCorrectionState({ strength: 5, preserveCorners: true }),
        predictionRenderer: { applyPointTail } as unknown as Parameters<typeof runStudioRestoreCausalPostCorrectionTail>[0]["predictionRenderer"],
        style: { color: "#000", strokeWidthDoc: 4, opacity: 1, minDistanceDoc: 1 },
        pressures: undefined,
      });
      expect(applyPointTail).toHaveBeenCalledOnce();
    });

    it("counts editable raster targets, auto-selects single pixel tool target, commits pixel selection history, and clears blocked assist preview", () => {
      const editableImg = makeImage("img-a");
      const hiddenImg = makeImage("img-b", { hidden: true });
      expect(countStudioEditableRasterTargets([editableImg, hiddenImg], [])).toBe(1);

      const setSelectedId = vi.fn();
      const setMarqueeIds = vi.fn();
      const setError = vi.fn();
      const chosen = resolveStudioEnsurePixelToolTarget({
        toolLabel: "자르기",
        activeSurfaceReviewLocked: false,
        selected: null,
        selectedImageMutationLocked: false,
        elements: [editableImg, hiddenImg],
        groups: [],
        setMarqueeIds,
        setSelectedId,
        setError,
      });
      expect(chosen?.id).toBe("img-a");
      expect(setSelectedId).toHaveBeenCalledWith("img-a");

      const historyRef = { current: createPixelSelectionHistory(null) };
      const selectionRef = { current: null };
      const publishHistory = vi.fn((history, selection) => {
        historyRef.current = history;
        selectionRef.current = selection;
      });
      const applied = runStudioCommitPixelSelectionState({
        update: {
          subpaths: [{ mode: "add", points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }] }],
          featherPx: 0,
          invert: false,
        },
        operation: "marquee",
        ownerElementId: "img-a",
        historyRef,
        selectionRef,
        publishHistory,
      });
      expect(applied).toBe(true);
      expect(publishHistory).toHaveBeenCalledOnce();

      const setPreview = vi.fn();
      runStudioPreviewDrawingAssistDocument({
        update: (doc) => doc,
        blocked: true,
        current: null,
        setPreview,
      });
      expect(setPreview).toHaveBeenCalledWith(null);
    });
  });
});
