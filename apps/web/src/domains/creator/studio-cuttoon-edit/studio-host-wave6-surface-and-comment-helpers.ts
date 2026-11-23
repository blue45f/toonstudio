import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import { isStudioBrushPackCatalogId } from "../brush/studio-brush-pack-id";
import type { StudioBrushCatalogSelection } from "../brush/studio-brush-selection";
import {
  requireStudioDrawingPointerTransport,
  type StudioDrawingPointerTransport,
} from "../brush/studio-drawing-pointer-transport";
import { studioKonvaRuntime as KonvaRuntime } from "../render/studio-konva-runtime";
import type { StudioAutoActionScope } from "../studio-auto-actions";
import { BRUSH_PRESETS, type BrushPreset } from "../studio-brush";
import type { StudioMenu } from "../studio-editor-tool-model";
import { STUDIO_LINKED_3D_CLOUD_SAVE_RECOVERY_STATE_KEY } from "../studio-page-shell-runtime";
import type { PageState } from "../studio-page-state";
import { shouldSuppressStudioQuickStartAutoOpen } from "../studio-quick-start-auto-open";
import type { StudioLeftToolRailHandlers } from "../StudioLeftToolRail";
import type { StudioBrushCatalogHandlers } from "../StudioMobileEditingDock";

export function buildStudioLeftToolRailHandlers<Bg3dScene>({
  activatePrimaryCanvasTool, primaryToolActivatedRef, setTool,
  fitCanvasToWidth, presentationPanelsHidden, visibleLeftPanelOpen,
  visibleRightPanelOpen, toggleCanvasWideMode, openFrameAnimationForSelected,
  openPixelSelectionTransform, openSelectedLayerCrop, bg3dOpen, setBg3dOpen,
  setBg3dSeedTemplateId, setBg3dSeedPrimitiveKind, setBg3dInitialScene,
  setBg3dInitialDataUrl, setBg3dInitialElementId, selectedId, selectedBg3dEditSource,
  addBubble, addText, announceDrawingShortcut, clearPolyLassoDraft,
  commitAppSettings, disarmAllPixelTools, activatePixelSelectionToolFromInspector,
  setMenu, onPickImage, showQuickStart, yieldQuickStart, openInspectorRoute,
  isMobile, toggleAdvancedFill, toggleDodgeBurnTool, toggleWetMixTool,
  toggleLiquifyTool, togglePixelMarquee, toggleSmudgeTool, toggleStudioCommentPinPlacement,
}: {
  readonly activatePrimaryCanvasTool: StudioLeftToolRailHandlers["activatePrimaryCanvasTool"];
  readonly primaryToolActivatedRef: MutableRefObject<boolean>;
  readonly setTool: Dispatch<SetStateAction<"select" | "draw" | "hand">>;
  readonly fitCanvasToWidth: StudioLeftToolRailHandlers["fitCanvasToWidth"];
  readonly presentationPanelsHidden: boolean;
  readonly visibleLeftPanelOpen: boolean;
  readonly visibleRightPanelOpen: boolean;
  readonly toggleCanvasWideMode: () => void;
  readonly openFrameAnimationForSelected: StudioLeftToolRailHandlers["openFrameAnimationForSelected"];
  readonly openPixelSelectionTransform: StudioLeftToolRailHandlers["openPixelSelectionTransform"];
  readonly openSelectedLayerCrop: StudioLeftToolRailHandlers["openSelectedLayerCrop"];
  readonly bg3dOpen: boolean;
  readonly setBg3dOpen: Dispatch<SetStateAction<boolean>>;
  readonly setBg3dSeedTemplateId: Dispatch<SetStateAction<string | null>>;
  readonly setBg3dSeedPrimitiveKind: Dispatch<SetStateAction<string | null>>;
  readonly setBg3dInitialScene: Dispatch<SetStateAction<Bg3dScene | undefined>>;
  readonly setBg3dInitialDataUrl: Dispatch<SetStateAction<string | undefined>>;
  readonly setBg3dInitialElementId: Dispatch<SetStateAction<string | undefined>>;
  readonly selectedId: string | null;
  readonly selectedBg3dEditSource: { scene?: Bg3dScene; legacyDataUrl?: string } | null;
  readonly addBubble: StudioLeftToolRailHandlers["addBubble"];
  readonly addText: StudioLeftToolRailHandlers["addText"];
  readonly announceDrawingShortcut: StudioLeftToolRailHandlers["announceDrawingShortcut"];
  readonly clearPolyLassoDraft: StudioLeftToolRailHandlers["clearPolyLassoDraft"];
  readonly commitAppSettings: StudioLeftToolRailHandlers["commitAppSettings"];
  readonly disarmAllPixelTools: StudioLeftToolRailHandlers["disarmAllPixelTools"];
  readonly activatePixelSelectionToolFromInspector: (kind: "rect") => void;
  readonly setMenu: (update: SetStateAction<StudioMenu | null>) => void;
  readonly onPickImage: StudioLeftToolRailHandlers["onPickImage"];
  readonly showQuickStart: boolean;
  readonly yieldQuickStart: () => void;
  readonly openInspectorRoute: (route: { primary: "properties" }, mobileTarget: "draw" | null) => void;
  readonly isMobile: boolean;
  readonly toggleAdvancedFill: StudioLeftToolRailHandlers["toggleAdvancedFill"];
  readonly toggleDodgeBurnTool: StudioLeftToolRailHandlers["toggleDodgeBurnTool"];
  readonly toggleWetMixTool: StudioLeftToolRailHandlers["toggleWetMixTool"];
  readonly toggleLiquifyTool: StudioLeftToolRailHandlers["toggleLiquifyTool"];
  readonly togglePixelMarquee: StudioLeftToolRailHandlers["togglePixelMarquee"];
  readonly toggleSmudgeTool: StudioLeftToolRailHandlers["toggleSmudgeTool"];
  readonly toggleStudioCommentPinPlacement: StudioLeftToolRailHandlers["toggleStudioCommentPinPlacement"];
}): StudioLeftToolRailHandlers {
  return {
    activatePrimaryCanvasTool,
    toggleHandTool: () => {
      primaryToolActivatedRef.current = true;
      setTool((current) => (current === "hand" ? "select" : "hand"));
    },
    returnToSelectTool: () => {
      setTool("select");
    },
    fitCanvasToWidthWithFocus: () => {
      fitCanvasToWidth();
      if (!presentationPanelsHidden) {
        const isWorkspaceWideMode = !visibleLeftPanelOpen && !visibleRightPanelOpen;
        if (!isWorkspaceWideMode) {
          toggleCanvasWideMode();
        }
      }
    },
    fitCanvasToWidth,
    openFrameAnimationForSelected,
    openPixelSelectionTransform,
    openSelectedLayerCrop,
    toggleBg3dEditor: () => {
      if (bg3dOpen) {
        setBg3dOpen(false);
        return;
      }
      setBg3dSeedTemplateId(null);
      setBg3dSeedPrimitiveKind(null);
      setBg3dInitialScene(selectedBg3dEditSource?.scene);
      setBg3dInitialDataUrl(selectedBg3dEditSource?.legacyDataUrl);
      setBg3dInitialElementId(selectedId && selectedBg3dEditSource ? selectedId : undefined);
      setBg3dOpen(true);
    },
    addBubble,
    addText,
    announceDrawingShortcut,
    clearPolyLassoDraft,
    commitAppSettings,
    disarmAllPixelTools,
    onRequestPixelSelection: () => {
      activatePixelSelectionToolFromInspector("rect");
      announceDrawingShortcut("변형할 픽셀 영역을 드래그해 선택하세요 · Esc로 취소");
    },
    onRequestSelectImage: () => {
      disarmAllPixelTools();
      setTool("select");
      setMenu(null);
      announceDrawingShortcut("프레임 애니메이션으로 편집할 이미지를 선택하세요 · Esc로 취소");
    },
    onPickImage,
    revealDrawToolProperties: () => {
      if (showQuickStart) yieldQuickStart();
      openInspectorRoute({ primary: "properties" }, isMobile ? "draw" : null);
    },
    toggleAdvancedFill,
    toggleDodgeBurnTool,
    toggleWetMixTool,
    toggleLiquifyTool,
    togglePixelMarquee,
    toggleSmudgeTool,
    toggleStudioCommentPinPlacement,
  };
}

export function buildStudioBrushCatalogHandlers({
  selectionLifecycle, close, applyBuiltInBrushPreset, applyStudioBrushCatalogSelection,
  announceDrawingShortcut, brushLoadFailedMessage, toggle, toggleFavorite, rememberView,
}: {
  readonly selectionLifecycle: StudioBrushCatalogHandlers["selectionLifecycle"];
  readonly close: StudioBrushCatalogHandlers["close"];
  readonly applyBuiltInBrushPreset: (preset: BrushPreset) => void;
  readonly applyStudioBrushCatalogSelection: (selection: StudioBrushCatalogSelection) => void;
  readonly announceDrawingShortcut: (message: string) => void;
  readonly brushLoadFailedMessage: string;
  readonly toggle: StudioBrushCatalogHandlers["toggle"];
  readonly toggleFavorite: StudioBrushCatalogHandlers["toggleFavorite"];
  readonly rememberView: StudioBrushCatalogHandlers["rememberView"];
}): StudioBrushCatalogHandlers {
  return {
    selectionLifecycle,
    close,
    selectBrushId: (brushId) => {
      const preset = BRUSH_PRESETS.find((candidate) => candidate.id === brushId);
      if (preset) {
        applyBuiltInBrushPreset(preset);
        return;
      }
      if (!isStudioBrushPackCatalogId(brushId)) return;
      void import("../brush/studio-brush-pack-runtime")
        .then(({ materializeStudioBrushPackSelection }) => {
          const selection = materializeStudioBrushPackSelection(brushId);
          if (selection) applyStudioBrushCatalogSelection(selection);
        })
        .catch(() => {
          announceDrawingShortcut(brushLoadFailedMessage);
        });
    },
    toggle,
    toggleFavorite,
    rememberView,
  };
}

export function isStudioCanvasGestureOwned({
  drawingRef, drawingPointerTransportRef, isPanningRef, touchViewPanActiveRef,
  groupDragRef, marqueeStartRef, advancedFillTapGestureRef, liquifyDragRef,
  smudgeDragRef, dodgeBurnDragRef, wetMixDragRef, pixelDragRef,
  pendingPixelSelectionRasterGestureRef, cropDragRef, panelSplitDragRef,
  nodeEditDragRef, bubbleShapeDragRef, healCloneDragRef, historyBrushDragRef,
  layerMaskDragRef, quickMaskDragRef,
}: {
  readonly drawingRef: MutableRefObject<unknown>;
  readonly drawingPointerTransportRef: MutableRefObject<StudioDrawingPointerTransport | null>;
  readonly isPanningRef: MutableRefObject<boolean>;
  readonly touchViewPanActiveRef?: MutableRefObject<boolean>;
  readonly groupDragRef: MutableRefObject<unknown>;
  readonly marqueeStartRef: MutableRefObject<unknown>;
  readonly advancedFillTapGestureRef: MutableRefObject<unknown>;
  readonly liquifyDragRef: MutableRefObject<unknown>;
  readonly smudgeDragRef: MutableRefObject<unknown>;
  readonly dodgeBurnDragRef: MutableRefObject<unknown>;
  readonly wetMixDragRef: MutableRefObject<unknown>;
  readonly pixelDragRef: MutableRefObject<unknown>;
  readonly pendingPixelSelectionRasterGestureRef: MutableRefObject<unknown>;
  readonly cropDragRef: MutableRefObject<unknown>;
  readonly panelSplitDragRef: MutableRefObject<unknown>;
  readonly nodeEditDragRef: MutableRefObject<unknown>;
  readonly bubbleShapeDragRef: MutableRefObject<unknown>;
  readonly healCloneDragRef: MutableRefObject<unknown>;
  readonly historyBrushDragRef: MutableRefObject<unknown>;
  readonly layerMaskDragRef: MutableRefObject<unknown>;
  readonly quickMaskDragRef: MutableRefObject<unknown>;
}): boolean {
  return Boolean(
    drawingRef.current
    || requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession()
    || isPanningRef.current
    || touchViewPanActiveRef?.current
    || KonvaRuntime.isDragging()
    || KonvaRuntime.isTransforming()
    || groupDragRef.current
    || marqueeStartRef.current
    || advancedFillTapGestureRef.current
    || liquifyDragRef.current
    || smudgeDragRef.current
    || dodgeBurnDragRef.current
    || wetMixDragRef.current
    || pixelDragRef.current
    || pendingPixelSelectionRasterGestureRef.current
    || cropDragRef.current
    || panelSplitDragRef.current
    || nodeEditDragRef.current
    || bubbleShapeDragRef.current
    || healCloneDragRef.current
    || historyBrushDragRef.current
    || layerMaskDragRef.current
    || quickMaskDragRef.current,
  );
}

export function runStudioQuickStartEarlyInteractionEffect(
  quickStartDismissed: boolean,
  onSuppress: () => void,
): (() => void) | undefined {
  if (quickStartDismissed || typeof globalThis.document === "undefined") return undefined;
  const ownerDocument = globalThis.document;
  const suppressLateAutomaticCoach = (event: Event) => {
    if (!shouldSuppressStudioQuickStartAutoOpen({
      isTrusted: event.isTrusted,
      ownerDocument,
      target: event.target,
    })) {
      return;
    }
    onSuppress();
  };
  ownerDocument.addEventListener("pointerdown", suppressLateAutomaticCoach, true);
  ownerDocument.addEventListener("keydown", suppressLateAutomaticCoach, true);
  ownerDocument.addEventListener("click", suppressLateAutomaticCoach, true);
  return () => {
    ownerDocument.removeEventListener("pointerdown", suppressLateAutomaticCoach, true);
    ownerDocument.removeEventListener("keydown", suppressLateAutomaticCoach, true);
    ownerDocument.removeEventListener("click", suppressLateAutomaticCoach, true);
  };
}

export function runStudioLinked3dRecoveryNoticeCleanupEffect({
  linked3dCloudSaveRecoveryNotice, locationPathname, locationSearch, locationState, navigate,
}: {
  readonly linked3dCloudSaveRecoveryNotice: unknown;
  readonly locationPathname: string;
  readonly locationSearch: string;
  readonly locationState: unknown;
  readonly navigate: (to: string, options: { replace: boolean; state: Record<string, unknown> | null }) => void;
}): void {
  if (!linked3dCloudSaveRecoveryNotice) return;
  const currentState = typeof locationState === "object"
    && locationState !== null
    && !Array.isArray(locationState)
    ? (locationState as Record<string, unknown>)
    : {};
  const nextState = { ...currentState };
  delete nextState[STUDIO_LINKED_3D_CLOUD_SAVE_RECOVERY_STATE_KEY];
  navigate(`${locationPathname}${locationSearch}`, {
    replace: true,
    state: Object.keys(nextState).length > 0 ? nextState : null,
  });
}

export function runStudioSyncSelectedPageIdsEffect({
  pages, currentPageId, autoActionScope, setAutoActionSelectedPageIds, setAutoActionScope,
}: {
  readonly pages: readonly PageState[];
  readonly currentPageId: string;
  readonly autoActionScope: StudioAutoActionScope;
  readonly setAutoActionSelectedPageIds: Dispatch<SetStateAction<string[]>>;
  readonly setAutoActionScope: Dispatch<SetStateAction<StudioAutoActionScope>>;
}): void {
  const availableIds = new Set(pages.map((page) => page.id));
  const fallbackId = availableIds.has(currentPageId) ? currentPageId : pages[0]?.id;
  setAutoActionSelectedPageIds((current) => {
    const next = current.filter((id) => availableIds.has(id));
    if (next.length === 0 && fallbackId) next.push(fallbackId);
    if (
      autoActionScope.kind === "selected-pages"
      && (next.length !== autoActionScope.pageIds.length || next.some((id, index) => id !== autoActionScope.pageIds[index]))
    ) {
      setAutoActionScope({ kind: "selected-pages", pageIds: next });
    }
    return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
  });
}
