import type { ChangeEvent, Dispatch, MutableRefObject, SetStateAction } from "react";

import { studioBrushPackFormatOf } from "../brush/studio-brush-pack-format";
import type { StudioLetteringEditTarget } from "../lettering/studio-pending-text-insert";
import { CANVAS_W } from "../studio-assets";
import type { DrawMode } from "../studio-editor-tool-model";
import type { El } from "../studio-element-model";
import type { OnionSkinSettings } from "../studio-frame-animation";
import type { StudioMainMenuSurfaceHandlerBundle } from "../studio-main-menu-surface-bindings";
import {
  projectStudioDocumentRectToClient,
  type StudioSurfaceRect,
} from "../studio-oncanvas-command-surfaces";
import type { ProductBrushLibraryRepository } from "../studio-page-editor-runtime-loaders";
import type { StudioQuickAccessIntegrationModule } from "../studio-page-editor-types";
import {
  enableStudioPixelArtMode,
  type StudioPixelArtModeState,
} from "../studio-pixel-art-mode";
import type { StudioQuickAccessState } from "../studio-quick-access";
import type { StudioQuickActionId } from "../studio-quick-actions";
import { elBounds } from "../studio-element-geometry";
import {
  DEFAULT_STUDIO_SILK_GENERATIVE_SPEC,
  type StudioSilkGenerativeSpec,
} from "../studio-silk-generative";
import type { StudioWebtoonCanvasPresetId } from "../studio-webtoon-canvas-presets";
import { createStudioWhiteboardEphemeralSession } from "../studio-whiteboard-ephemeral";
import {
  normalizeStudioCommandBarPreferences,
  setStudioCommandBarVisible,
  updateStudioWorkspaceLiveLayout,
  type StudioWorkspaceState,
} from "../studio-workspaces";
import type { StudioSelectionAlignMode } from "../StudioSelectionContextBar";
import { measureStudioBubbleCommitHeight } from "./studio-host-canvas-element-helpers";

export async function runStudioOpenQuickAccessPalette({
  currentWorkspaceOwnerScope, quickAccessIntegration, quickAccessState,
  quickAccessLoadedOwnerScopeRef, quickAccessLoadEpochRef, quickAccessOwnerScopeRef,
  quickAccessIntegrationRef, quickAccessPersistenceWarningRef,
  loadStudioQuickAccessIntegration, showLoadedStudioQuickAccessPalette,
  setQuickAccessPaletteLoading, setQuickAccessIntegration, setQuickAccessState,
  announceDrawingShortcut, loadFailedMessage,
}: {
  readonly currentWorkspaceOwnerScope: string;
  readonly quickAccessIntegration: StudioQuickAccessIntegrationModule | null;
  readonly quickAccessState: StudioQuickAccessState | null;
  readonly quickAccessLoadedOwnerScopeRef: MutableRefObject<string | null>;
  readonly quickAccessLoadEpochRef: MutableRefObject<number>;
  readonly quickAccessOwnerScopeRef: MutableRefObject<string>;
  readonly quickAccessIntegrationRef: MutableRefObject<StudioQuickAccessIntegrationModule | null>;
  readonly quickAccessPersistenceWarningRef: MutableRefObject<boolean>;
  readonly loadStudioQuickAccessIntegration: () => Promise<StudioQuickAccessIntegrationModule>;
  readonly showLoadedStudioQuickAccessPalette: () => void;
  readonly setQuickAccessPaletteLoading: Dispatch<SetStateAction<boolean>>;
  readonly setQuickAccessIntegration: Dispatch<SetStateAction<StudioQuickAccessIntegrationModule | null>>;
  readonly setQuickAccessState: Dispatch<SetStateAction<StudioQuickAccessState | null>>;
  readonly announceDrawingShortcut: (message: string) => void;
  readonly loadFailedMessage: string;
}): Promise<void> {
  const ownerScope = currentWorkspaceOwnerScope;
  if (
    quickAccessIntegration
    && quickAccessState
    && quickAccessLoadedOwnerScopeRef.current === ownerScope
  ) {
    showLoadedStudioQuickAccessPalette();
    return;
  }
  const requestEpoch = ++quickAccessLoadEpochRef.current;
  setQuickAccessPaletteLoading(true);
  try {
    const runtime = await loadStudioQuickAccessIntegration();
    if (requestEpoch !== quickAccessLoadEpochRef.current || quickAccessOwnerScopeRef.current !== ownerScope) {
      return;
    }
    const loadResult = await runtime.loadStudioQuickAccessState(ownerScope);
    if (requestEpoch !== quickAccessLoadEpochRef.current || quickAccessOwnerScopeRef.current !== ownerScope) {
      return;
    }
    quickAccessLoadedOwnerScopeRef.current = ownerScope;
    quickAccessIntegrationRef.current = runtime;
    setQuickAccessIntegration(runtime);
    setQuickAccessState(loadResult.state);
    if (loadResult.authority === "memory-only") {
      quickAccessPersistenceWarningRef.current = true;
      announceDrawingShortcut("SQLite/OPFS를 열지 못해 빠른 액세스 변경은 현재 세션에만 유지돼요");
    }
    showLoadedStudioQuickAccessPalette();
  } catch (error) {
    console.error("Failed to load Studio Quick Access:", error);
    announceDrawingShortcut(loadFailedMessage);
  } finally {
    if (requestEpoch === quickAccessLoadEpochRef.current) {
      setQuickAccessPaletteLoading(false);
    }
  }
}

export async function runStudioHandleBrushPackImportFromMenu({
  event, openBrushLibraryFromMenu, announceDrawingShortcut, setError,
  setBrushPackImporting, productBrushRepository, refreshSavedBrushesFromRepository,
  loadBrushPackImporter, messages,
}: {
  readonly event: ChangeEvent<HTMLInputElement>;
  readonly openBrushLibraryFromMenu: () => void;
  readonly announceDrawingShortcut: (message: string) => void;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly setBrushPackImporting: Dispatch<SetStateAction<boolean>>;
  readonly productBrushRepository: () => Promise<ProductBrushLibraryRepository>;
  readonly refreshSavedBrushesFromRepository: (product: ProductBrushLibraryRepository) => Promise<unknown>;
  readonly loadBrushPackImporter: () => Promise<typeof import("../brush/studio-brush-pack-import")>;
  readonly messages: {
    readonly formatUnknown: string;
    readonly abrRedirect: string;
    readonly jsonRedirect: string;
    readonly noNewItems: string;
    readonly importFailed: string;
  };
}): Promise<void> {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const format = studioBrushPackFormatOf(file.name, file.type);
  if (format === null) {
    setError(messages.formatUnknown);
    return;
  }
  if (format === "abr" || format === "json") {
    openBrushLibraryFromMenu();
    announceDrawingShortcut(format === "abr" ? messages.abrRedirect : messages.jsonRedirect);
    return;
  }
  setBrushPackImporting(true);
  try {
    const importer = await loadBrushPackImporter();
    const product = await productBrushRepository();
    let committed: Awaited<ReturnType<typeof importer.importAndCommitStudioBrushProgramFile>>;
    switch (format) {
      case "myb": committed = await importer.importAndCommitStudioBrushProgramFile(file, "myb", product.repository); break;
      case "kpp": committed = await importer.importAndCommitStudioBrushProgramFile(file, "kpp", product.repository); break;
      case "sut": committed = await importer.importAndCommitStudioBrushProgramFile(file, "sut", product.repository); break;
      case "sutg": committed = await importer.importAndCommitStudioBrushProgramFile(file, "sutg", product.repository); break;
      case "bundle": case "brushset": committed = await importer.importAndCommitStudioBrushProgramFile(file, format, product.repository); break;
    }
    if (committed.saved.savedCount === 0) {
      setError(messages.noNewItems);
      return;
    }
    await refreshSavedBrushesFromRepository(product);
    const label = importer.studioBrushPackFormatLabel(format);
    const notes = importer.studioBrushPackImportNotes(committed.result);
    announceDrawingShortcut(
      `${label} 브러시 ${committed.saved.savedCount}개를 SQLite 내 브러시에 추가했어요.${notes.length > 0 ? ` ${notes.join(" ")}` : ""}`,
    );
    openBrushLibraryFromMenu();
  } catch (caught) {
    const { resolveStudioBrushPackErrorFromCause } = await import(
      "../status-i18n/studio-producer-error-i18n-brush"
    );
    setError(
      resolveStudioBrushPackErrorFromCause(caught)
      ?? (caught instanceof Error ? caught.message : messages.importFailed),
    );
  } finally {
    setBrushPackImporting(false);
  }
}

export function runStudioFilterPreflightEffect<
  TContext extends {
    readonly input: Parameters<typeof import("../render/studio-raster-edit-preparation")["planStudioEditableRasterCopy"]>[0];
  },
>({
  studioDirectImageFilterTarget, viewTransformSuppressed, timelinePlaying,
  drawingRef, studioFilterPreflightContextRef, studioSelectedFilterLayerId,
  setStudioFilterDocumentPreflightReason,
}: {
  readonly studioDirectImageFilterTarget: boolean;
  readonly viewTransformSuppressed: boolean;
  readonly timelinePlaying: boolean;
  readonly drawingRef: MutableRefObject<unknown>;
  readonly studioFilterPreflightContextRef: MutableRefObject<((
    label: string,
    runtime: typeof import("../render/studio-raster-edit-preparation"),
    selectedLayerId?: string,
  ) => TContext) | null>;
  readonly studioSelectedFilterLayerId?: string | null;
  readonly setStudioFilterDocumentPreflightReason: Dispatch<SetStateAction<string | null>>;
}): (() => void) | undefined {
  if (studioDirectImageFilterTarget) {
    setStudioFilterDocumentPreflightReason(null);
    return undefined;
  }
  if (viewTransformSuppressed || timelinePlaying) return undefined;
  let cancelled = false;
  const handle = globalThis.setTimeout(() => {
    if (cancelled || drawingRef.current) return;
    void Promise.all([
      import("../render/studio-raster-edit-preparation"),
      import("../status-i18n/studio-producer-error-i18n-exports-raster"),
    ])
      .then(([rasterRuntime, rasterI18n]) => {
        if (cancelled) return;
        const buildContext = studioFilterPreflightContextRef.current;
        if (!buildContext) return;
        const context = buildContext("필터 사전점검", rasterRuntime, studioSelectedFilterLayerId ?? undefined);
        const planned = rasterRuntime.planStudioEditableRasterCopy(context.input);
        setStudioFilterDocumentPreflightReason(
          planned.ok ? null : rasterI18n.resolveStudioRasterEditReason(planned.reason),
        );
      })
      .catch(() => {
        if (!cancelled) setStudioFilterDocumentPreflightReason(null);
      });
  }, 260);
  return () => {
    cancelled = true;
    globalThis.clearTimeout(handle);
  };
}

export function buildStudioMainMenuSurfaceActions({
  activatePixelSelectionToolFromInspector, setRightPanelOpenWithOverride,
  workspacePersistenceRef, persistStudioWorkspaceState, enterQuickMask, commitQuickMask,
  setTimelineOpen, openFrameAnimationForSelected, setOnionSkin, setAnimaticTimelineOpen,
  setCommentsOpen, setTeamPanelOpen, setPageReviewOpen, setCheckpointPanelOpen,
  setWriterRoomOpen, setStoryboardGridOpen, setScrollPreviewOpen, setContinuityOpen,
  setProductionBibleOpen, setWebtoonAssistantOpen, setAiSuperSuiteOpen,
  sendCurrentPageToCompareReview, setQuickStartOpen, setPublishPackageOpen,
  setPublishPreflightOpen, setAssetRightsAuditOpen, openAutoActions,
  openInspectorRoute, applyWebtoonCanvasPreset, setShowGrid, setShowWebtoonGuides,
  toggleEraseToIntersectionMode, setDialogueBatchOpen, setDialogueTranslateOpen,
  setPixelArtMode, insertStudioStickyNote, setSilkGenerativeSpec,
  changeStudioSymmetryType, openHybridDccWorkspace, announceDrawingShortcut,
  openVrmPoserFromMenu, openCharacterShaperFromMenu, openBackground3dFromMenu,
}: {
  readonly activatePixelSelectionToolFromInspector: StudioMainMenuSurfaceHandlerBundle["activatePixelSelectionToolFromInspector"];
  readonly setRightPanelOpenWithOverride: (open: boolean) => void;
  readonly workspacePersistenceRef: MutableRefObject<{ readonly state: StudioWorkspaceState }>;
  readonly persistStudioWorkspaceState: (next: StudioWorkspaceState) => void;
  readonly enterQuickMask: () => void;
  readonly commitQuickMask: () => void;
  readonly setTimelineOpen: Dispatch<SetStateAction<boolean>>;
  readonly openFrameAnimationForSelected: () => void;
  readonly setOnionSkin: Dispatch<SetStateAction<OnionSkinSettings>>;
  readonly setAnimaticTimelineOpen: Dispatch<SetStateAction<boolean>>;
  readonly setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  readonly setTeamPanelOpen: Dispatch<SetStateAction<boolean>>;
  readonly setPageReviewOpen: Dispatch<SetStateAction<boolean>>;
  readonly setCheckpointPanelOpen: (open: boolean) => void;
  readonly setWriterRoomOpen: Dispatch<SetStateAction<boolean>>;
  readonly setStoryboardGridOpen: Dispatch<SetStateAction<boolean>>;
  readonly setScrollPreviewOpen: Dispatch<SetStateAction<boolean>>;
  readonly setContinuityOpen: Dispatch<SetStateAction<boolean>>;
  readonly setProductionBibleOpen: Dispatch<SetStateAction<boolean>>;
  readonly setWebtoonAssistantOpen: Dispatch<SetStateAction<boolean>>;
  readonly setAiSuperSuiteOpen: (open: boolean) => void;
  readonly sendCurrentPageToCompareReview: () => Promise<void>;
  readonly setQuickStartOpen: (open: boolean) => void;
  readonly setPublishPackageOpen: Dispatch<SetStateAction<boolean>>;
  readonly setPublishPreflightOpen: Dispatch<SetStateAction<boolean>>;
  readonly setAssetRightsAuditOpen: Dispatch<SetStateAction<boolean>>;
  readonly openAutoActions: () => unknown;
  readonly openInspectorRoute: (route: { readonly primary: "document"; readonly document: "navigator" | "canvas" }) => void;
  readonly applyWebtoonCanvasPreset: (presetId: StudioWebtoonCanvasPresetId) => void;
  readonly setShowGrid: Dispatch<SetStateAction<boolean>>;
  readonly setShowWebtoonGuides: Dispatch<SetStateAction<boolean>>;
  readonly toggleEraseToIntersectionMode: () => void;
  readonly setDialogueBatchOpen: Dispatch<SetStateAction<boolean>>;
  readonly setDialogueTranslateOpen: (mode: "translate" | "qa") => void;
  readonly setPixelArtMode: Dispatch<SetStateAction<StudioPixelArtModeState>>;
  readonly insertStudioStickyNote: (color: "lemon") => void;
  readonly setSilkGenerativeSpec: Dispatch<SetStateAction<StudioSilkGenerativeSpec>>;
  readonly changeStudioSymmetryType: (type: "silk") => void;
  readonly openHybridDccWorkspace: (mode: "sculpt") => void;
  readonly announceDrawingShortcut: (message: string) => void;
  readonly openVrmPoserFromMenu: () => void;
  readonly openCharacterShaperFromMenu: () => void;
  readonly openBackground3dFromMenu: () => void;
}): StudioMainMenuSurfaceHandlerBundle {
  return {
    activatePixelSelectionToolFromInspector,
    openLayerPanelForBorderEffect: () => setRightPanelOpenWithOverride(true),
    toggleStudioCommandBar: () => {
      const state = workspacePersistenceRef.current.state;
      const layout = state.liveLayout;
      const prefs = normalizeStudioCommandBarPreferences(layout.commandBar);
      persistStudioWorkspaceState(
        updateStudioWorkspaceLiveLayout(state, {
          ...layout,
          commandBar: setStudioCommandBarVisible(prefs, !prefs.visible),
        }),
      );
    },
    enterQuickMask,
    commitQuickMask,
    toggleAnimationTimeline: () => setTimelineOpen((open) => !open),
    openFrameAnimationForSelected,
    toggleOnionSkin: () => setOnionSkin((current) => ({ ...current, enabled: !current.enabled })),
    openAnimaticTimeline: () => setAnimaticTimelineOpen(true),
    openTeamPanel: () => { setCommentsOpen(false); setTeamPanelOpen(true); },
    toggleDocumentComments: () => { setTeamPanelOpen(false); setCommentsOpen((open) => !open); },
    openPageReview: () => setPageReviewOpen(true),
    openCheckpointPanel: () => setCheckpointPanelOpen(true),
    openWriterRoom: () => setWriterRoomOpen(true),
    openStoryboardGrid: () => setStoryboardGridOpen(true),
    openScrollPreview: () => setScrollPreviewOpen(true),
    openContinuityCheck: () => setContinuityOpen(true),
    openProductionBible: () => setProductionBibleOpen(true),
    openWebtoonAssistant: () => setWebtoonAssistantOpen(true),
    openAiSuperSuite: () => setAiSuperSuiteOpen(true),
    sendCurrentPageToCompareReview,
    openQuickStart: () => setQuickStartOpen(true),
    openPublishPackage: () => setPublishPackageOpen(true),
    openPublishPreflight: () => setPublishPreflightOpen(true),
    openAssetRightsAudit: () => setAssetRightsAuditOpen(true),
    openAutoActions: () => void openAutoActions(),
    openCanvasNavigatorRoute: () => openInspectorRoute({ primary: "document", document: "navigator" }),
    openCanvasSettingsRoute: () => openInspectorRoute({ primary: "document", document: "canvas" }),
    applyWebtoonCanvasPreset,
    toggleCanvasGrid: () => setShowGrid((visible) => !visible),
    toggleWebtoonGuides: () => setShowWebtoonGuides((visible) => !visible),
    toggleEraseToIntersection: toggleEraseToIntersectionMode,
    openDialogueBatch: () => setDialogueBatchOpen(true),
    openDialogueTranslate: () => setDialogueTranslateOpen("translate"),
    openLocalizationQa: () => setDialogueTranslateOpen("qa"),
    togglePixelArtMode: () => {
      setPixelArtMode((current) =>
        current.enabled
          ? { ...current, enabled: false }
          : enableStudioPixelArtMode(current.palette?.id ?? "lospec-pico8"),
      );
    },
    insertDefaultStickyNote: () => insertStudioStickyNote("lemon"),
    enableSilkSymmetry: () => {
      setSilkGenerativeSpec((current) => ({
        ...DEFAULT_STUDIO_SILK_GENERATIVE_SPEC,
        arms: current.arms,
        mirror: true,
      }));
      changeStudioSymmetryType("silk");
    },
    openSculptWorkbench: () => openHybridDccWorkspace("sculpt"),
    startEphemeralWhiteboard: () => {
      const session = createStudioWhiteboardEphemeralSession({ title: "빠른 화이트보드" });
      announceDrawingShortcut(`${session.title} · ${session.roomCode}`);
    },
    openVrmPoserFromMenu,
    openCharacterShaperFromMenu,
    openBackground3dFromMenu,
  };
}

export function buildStudioOnCanvasSurfaceHandlers({
  setStrokeWidth, setBrushOpacity, openColorWheelAt, drawMode, executeQuickAction,
  reorder, alignSelected, wrapRef, zoomHostRef, canvasH, currentCanvasSelectionIds,
  elementById, canvasFlipH, canvasRotation,
}: {
  readonly setStrokeWidth: Dispatch<SetStateAction<number>>;
  readonly setBrushOpacity: Dispatch<SetStateAction<number>>;
  readonly openColorWheelAt: (clientX: number, clientY: number) => void;
  readonly drawMode: DrawMode;
  readonly executeQuickAction: (action: StudioQuickActionId) => void;
  readonly reorder: (direction: "front" | "back" | "forward" | "backward") => void;
  readonly alignSelected: (mode: StudioSelectionAlignMode) => void;
  readonly wrapRef: MutableRefObject<HTMLDivElement | null>;
  readonly zoomHostRef: MutableRefObject<HTMLDivElement | null>;
  readonly canvasH: number;
  readonly currentCanvasSelectionIds: () => readonly string[];
  readonly elementById: ReadonlyMap<string, El>;
  readonly canvasFlipH: boolean;
  readonly canvasRotation: Parameters<typeof projectStudioDocumentRectToClient>[0]["canvasRotation"];
}) {
  return {
    onStrokeWidthChange: (next: number) => setStrokeWidth(next),
    onOpacityChange: (next: number) => setBrushOpacity(next),
    onOpenColorWheel: (clientX: number, clientY: number) => openColorWheelAt(clientX, clientY),
    onToggleEraser: () => executeQuickAction(drawMode === "eraser" ? "pen" : "eraser"),
    onQuickAction: (action: StudioQuickActionId) => executeQuickAction(action),
    onReorder: (direction: "front" | "back" | "forward" | "backward") => reorder(direction),
    onAlign: (mode: StudioSelectionAlignMode) => alignSelected(mode),
    getCanvasRect: (): StudioSurfaceRect | null => {
      const wrap = wrapRef.current;
      if (!wrap?.isConnected) return null;
      const rect = wrap.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0
        ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        : null;
    },
    getSelectionRect: (): StudioSurfaceRect | null => {
      const host = zoomHostRef.current;
      if (!host?.isConnected || canvasH <= 0) return null;
      const ids = currentCanvasSelectionIds();
      if (ids.length === 0) return null;
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const id of ids) {
        const element = elementById.get(id);
        if (!element) continue;
        const bounds = elBounds(element);
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.w);
        maxY = Math.max(maxY, bounds.y + bounds.h);
      }
      if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
      const hostRect = host.getBoundingClientRect();
      if (!(hostRect.width > 0) || !(hostRect.height > 0)) return null;
      return projectStudioDocumentRectToClient({
        documentWidth: CANVAS_W,
        documentHeight: canvasH,
        canvasFlipH,
        canvasRotation,
        rect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
        hostRect: { left: hostRect.left, top: hostRect.top, width: hostRect.width, height: hostRect.height },
      });
    },
  };
}

export function runStudioCommitEditText({
  finalValue, editing, elementById, webtoonTheme, addEl, patchEl, setEditing,
  endLiveResourceEdit, authorityChangedMessage, insertFailedMessage,
}: {
  readonly finalValue: string;
  readonly editing: (StudioLetteringEditTarget & { canInsert?: () => boolean }) | null;
  readonly elementById: ReadonlyMap<string, El>;
  readonly webtoonTheme: "classic" | "soft" | "vivid";
  readonly addEl: (el: El) => boolean;
  readonly patchEl: (id: string, patch: Partial<El>) => boolean;
  readonly setEditing: Dispatch<SetStateAction<(StudioLetteringEditTarget & { canInsert?: () => boolean }) | null>>;
  readonly endLiveResourceEdit: () => void;
  readonly authorityChangedMessage: string;
  readonly insertFailedMessage: string;
}): string | undefined {
  if (editing?.pendingText) {
    if (!editing.canInsert?.()) return authorityChangedMessage;
    if (!finalValue.trim()) return undefined;
    if (!addEl({ ...editing.pendingText, text: finalValue })) return insertFailedMessage;
    setEditing(null);
    return undefined;
  }
  try {
    if (editing) {
      const el = elementById.get(editing.id);
      const height = el && el.type === "bubble"
        ? measureStudioBubbleCommitHeight(el, finalValue, webtoonTheme)
        : undefined;
      patchEl(editing.id, { text: finalValue, ...(height !== undefined ? { height } : {}) } as Partial<El>);
    }
    setEditing(null);
  } finally {
    endLiveResourceEdit();
  }
  return undefined;
}
