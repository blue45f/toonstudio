import { isStudioRasterHandoffViewNavigationTool } from "../render/studio-raster-handoff-authority";
import {
  describeStudioScene3dLinkedLayerReview,
  snapshotStudioScene3dLinkedLayerEditSource,
} from "../scene3d/studio-scene3d-linked-layer-source";
import type { studioBg3dLayerEditSource } from "../studio-cuttoon-editor/runtime/studio-bg3d-layer-resume";
import { elementLabel } from "../studio-element-label";
import type { El, FrameEl, ImageEl } from "../studio-element-model";
import type { Tool } from "../studio-editor-tool-model";
import {
  planSharedGutterSegments,
  type SharedGutterSegment,
} from "../studio-frame-folder";
import {
  isEffectivelyHidden,
  isEffectivelyLocked,
  type LayerGroup,
} from "../studio-layers";
import type {
  StudioMainMenuSurfaceState,
  StudioPixelSelectionToolId,
} from "../studio-main-menu-surface-contract";
import type { PageState } from "../studio-page-state";
import type { StudioQuickActionId } from "../studio-quick-actions";
import type { StudioQuickAccessCommandAvailability } from "../studio-quick-access-integration";
import {
  isSelectionUsable,
  type PixelSelection,
  type SelectionToolKind,
} from "../studio-selection-tools";
import type { StudioOptionsBarsSelectionModel } from "../StudioOptionsBars";

type StudioBg3dLayerEditSource = ReturnType<typeof studioBg3dLayerEditSource>;

export interface DeriveStudioOptionsBarsSelectionModelInput {
  readonly activeSurfaceReviewLocked: boolean;
  readonly elements: readonly El[];
  readonly groups: LayerGroup[];
  readonly marqueeIds: readonly string[];
  readonly selectionLaneMounted: boolean;
  readonly selectOptionsStripArmed: boolean;
  readonly selected: El | null;
  readonly selectedId: string | null;
}

export function deriveStudioOptionsBarsSelectionModel(
  input: DeriveStudioOptionsBarsSelectionModelInput,
): StudioOptionsBarsSelectionModel {
  const count = input.marqueeIds.length > 0 ? input.marqueeIds.length : input.selectedId ? 1 : 0;
  return {
    visible: input.selectOptionsStripArmed && count > 0 && input.selectionLaneMounted,
    count,
    label: input.selected ? elementLabel(input.selected) : null,
    locked: input.activeSurfaceReviewLocked || (
      input.marqueeIds.length > 0
        ? input.elements
            .filter((element) => input.marqueeIds.includes(element.id))
            .some((element) => isEffectivelyLocked(element, input.groups))
        : Boolean(input.selected && isEffectivelyLocked(input.selected, input.groups))
    ),
    canToggleLock: Boolean(input.selected),
    textEditLabel:
      input.selected
      && !input.activeSurfaceReviewLocked
      && !isEffectivelyLocked(input.selected, input.groups)
        ? input.selected.type === "bubble"
          ? "대사 편집"
          : input.selected.type === "text" || input.selected.type === "sticker"
            ? "글자 편집"
            : null
        : null,
    canFitBubble:
      input.selected?.type === "bubble"
      && !input.activeSurfaceReviewLocked
      && !isEffectivelyLocked(input.selected, input.groups),
  };
}

export function deriveStudioMobileSelectionLocked(input: {
  readonly elements: readonly El[];
  readonly groups: LayerGroup[];
  readonly marqueeIds: readonly string[];
  readonly selectedId: string | null;
}): boolean {
  const ids = input.marqueeIds.length > 0
    ? input.marqueeIds
    : input.selectedId
      ? [input.selectedId]
      : [];
  if (ids.length === 0) return false;
  const idSet = new Set(ids);
  const picked = input.elements.filter((element) => idSet.has(element.id));
  return picked.length > 0 && picked.every((element) => isEffectivelyLocked(element, input.groups));
}

export function deriveStudioSharedGutterSegments(
  elements: readonly El[],
  masterEditMode: boolean,
): readonly SharedGutterSegment[] {
  if (masterEditMode) return [];
  return planSharedGutterSegments(
    elements.filter((element): element is FrameEl => element.type === "frame" && !element.hidden),
  );
}

export function deriveStudioQuickActionsDisabledSet(input: {
  readonly hi: number;
  readonly historyLength: number;
  readonly masterEditMode: boolean;
  readonly collaborationDocumentLocked: boolean;
  readonly selected: El | null;
  readonly marqueeIdsLength: number;
  readonly activePageMutationLocked: boolean;
  readonly selectedImageMutationLocked: boolean;
}): Set<StudioQuickActionId> {
  const disabled = new Set<StudioQuickActionId>();
  if (input.hi === 0 || input.masterEditMode || input.collaborationDocumentLocked) {
    disabled.add("undo");
  }
  if (
    input.hi >= input.historyLength - 1
    || input.masterEditMode
    || input.collaborationDocumentLocked
  ) {
    disabled.add("redo");
  }
  if (!input.selected && input.marqueeIdsLength === 0) {
    disabled.add("duplicate");
    disabled.add("delete");
    disabled.add("bring-front");
  }
  if (input.activePageMutationLocked) {
    disabled.add("pen");
    disabled.add("eraser");
    disabled.add("duplicate");
    disabled.add("delete");
    disabled.add("bring-front");
    disabled.add("add-bubble");
  }
  if (input.selected?.type !== "image" || input.selectedImageMutationLocked) {
    disabled.add("quick-mask");
    disabled.add("wet-mix");
    disabled.add("dodge-burn");
  }
  return disabled;
}

export function deriveStudioQuickAccessCommandAvailability(input: {
  readonly disabledActions: ReadonlySet<StudioQuickActionId>;
  readonly saving: boolean;
  readonly collaborationDocumentLocked: boolean;
  readonly scopedDraftSaveAvailable: boolean;
  readonly advancedFillBusy: boolean;
  readonly advancedFillUnsupportedReason: string | null;
  readonly activePageMutationLocked: boolean;
  readonly selected: El | null;
  readonly pixelSel: PixelSelection | null;
  readonly pixelBusy: boolean;
  readonly selectedImageMutationLocked: boolean;
  readonly viewTransformSuppressed: boolean;
}): StudioQuickAccessCommandAvailability {
  return {
    undo: !input.disabledActions.has("undo"),
    redo: !input.disabledActions.has("redo"),
    save: !input.saving && (!input.collaborationDocumentLocked || input.scopedDraftSaveAvailable),
    pen: !input.disabledActions.has("pen"),
    eraser: !input.disabledActions.has("eraser"),
    fill:
      !input.advancedFillBusy
      && input.advancedFillUnsupportedReason === null
      && !input.activePageMutationLocked,
    eyedropper: true,
    select: true,
    transform:
      input.selected?.type === "image"
      && isSelectionUsable(input.pixelSel)
      && !input.pixelBusy
      && !input.selectedImageMutationLocked,
    "fit-canvas": !input.viewTransformSuppressed,
    properties: true,
    duplicate: !input.disabledActions.has("duplicate"),
    delete: !input.disabledActions.has("delete"),
    "bring-front": !input.disabledActions.has("bring-front"),
    "add-bubble": !input.disabledActions.has("add-bubble"),
    "quick-mask": !input.disabledActions.has("quick-mask"),
    "wet-mix": !input.disabledActions.has("wet-mix"),
    "dodge-burn": !input.disabledActions.has("dodge-burn"),
    "correct-current-stroke": !input.activePageMutationLocked,
  };
}

export function resolveStudioMenuPixelSelectionTool(
  colorRangePickActive: boolean,
  pixelTool: SelectionToolKind | "wand" | "quick-select" | null,
  pixelForceCircle: boolean,
): StudioPixelSelectionToolId | null {
  if (colorRangePickActive) return "color-range";
  if (pixelTool === "ellipse") return pixelForceCircle ? "circle" : "ellipse";
  return pixelTool;
}

export function deriveStudioMainMenuSurfaceState(input: {
  readonly pixelSelectionTool: StudioPixelSelectionToolId | null;
  readonly quickMaskActive: boolean;
  readonly animationTimelineOpen: boolean;
  readonly onionSkinEnabled: boolean;
  readonly documentCommentsOpen: boolean;
  readonly canvasGridVisible: boolean;
  readonly webtoonGuidesVisible: boolean;
  readonly vectorEraseToIntersection: boolean;
  readonly commandBarVisible: boolean;
  readonly masterEditMode: boolean;
  readonly pixelArtEnabled: boolean;
}): StudioMainMenuSurfaceState {
  return {
    pixelSelectionTool: input.pixelSelectionTool,
    quickMaskActive: input.quickMaskActive,
    animationTimelineOpen: input.animationTimelineOpen,
    onionSkinEnabled: input.onionSkinEnabled,
    documentCommentsOpen: input.documentCommentsOpen,
    canvasGridVisible: input.canvasGridVisible,
    webtoonGuidesVisible: input.webtoonGuidesVisible,
    vectorEraseToIntersection: input.vectorEraseToIntersection,
    commandBarVisible: input.commandBarVisible,
    masterEditMode: input.masterEditMode,
    pixelArtEnabled: input.pixelArtEnabled,
  };
}

export function deriveStudioRasterHandoffGates(input: {
  readonly isExporting: boolean;
  readonly saving: boolean;
  readonly timelapseCapturing: boolean;
  readonly masterEditMode: boolean;
  readonly selectedId: string | null;
  readonly marqueeIdsLength: number;
  readonly editingActive: boolean;
  readonly tool: Tool;
  readonly canvasRotation: number;
  readonly eyedropperActive: boolean;
  readonly timelinePlaying: boolean;
  readonly marqueeActive: boolean;
  readonly userGuidesLength: number;
  readonly armedToolActive: boolean;
  readonly pageGradeVignette: number;
  readonly elements: readonly El[];
  readonly groups: LayerGroup[];
  readonly localHiddenElementIds: ReadonlySet<string>;
}) {
  return {
    exportActive: input.isExporting || input.saving || input.timelapseCapturing,
    masterEditActive: input.masterEditMode,
    editActive: input.selectedId !== null || input.marqueeIdsLength > 0 || input.editingActive,
    specialDraftActive:
      !isStudioRasterHandoffViewNavigationTool(input.tool)
      || input.canvasRotation !== 0
      || input.eyedropperActive
      || input.timelinePlaying
      || input.marqueeActive
      || input.userGuidesLength > 0
      || input.armedToolActive,
    postProcessingActive:
      input.pageGradeVignette > 0
      || input.elements.some(
        (element) =>
          element.type === "image"
          && element.adjustmentLayer
          && !isEffectivelyHidden(element, input.groups)
          && !input.localHiddenElementIds.has(element.id)
          && (element.opacity ?? 1) > 0,
      ),
  } as const;
}

export function deriveStudioSelectedLinked3dReview(input: {
  readonly selected: El | null;
  readonly elements: readonly El[];
  readonly selectedBg3dEditSource: StudioBg3dLayerEditSource | null;
  readonly linked3dRender: PageState["linked3dRender"];
}) {
  const bundleId = input.selected?.type === "image"
    ? input.selected.bg3dLtBundleId
    : input.selected?.type === "draw"
      ? input.selected.linked3dCorrection?.bundleId
      : undefined;
  const linkedScene = bundleId
    ? input.elements.find(
        (element): element is ImageEl =>
          element.type === "image"
          && element.bg3dLtBundleId === bundleId
          && element.bg3dScene !== undefined,
      )?.bg3dScene
    : undefined;
  const scene = input.selectedBg3dEditSource?.scene
    ?? (linkedScene ? snapshotStudioScene3dLinkedLayerEditSource(linkedScene) : null);
  return scene
    ? describeStudioScene3dLinkedLayerReview({
        scene,
        bundleId,
        linked3dRender: input.linked3dRender,
      })
    : null;
}
