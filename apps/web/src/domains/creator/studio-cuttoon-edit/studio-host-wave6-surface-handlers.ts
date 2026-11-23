import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { StudioCanvasViewportHandlers } from "../canvas/StudioCanvasViewport";
import { createStudioLayerCompHandlers } from "../layer/createStudioLayerCompHandlers";
import {
  captureStudioLayerCompLeaseRelease,
  captureStudioLayerCompSynchronization,
} from "../layer/studio-layer-comp-synchronization";
import { planStudioHokusaiNaturalMediaReplacement } from "../render/studio-hokusai-natural-media-replacement";
import { pressureCurveValueForPreset } from "../studio-brush";
import type { DrawMode } from "../studio-editor-tool-model";
import type { El } from "../studio-element-model";
import type { LayerGroup } from "../studio-layers";
import { STUDIO_LIVING_INK_NEW_PHYSICAL_STROKES_ENABLED } from "../studio-living-ink-brush-admission";
import type { PageState } from "../studio-page-state";
import { cycleStudioStabilizerStrength } from "../studio-pro-draw-prefs";
import type { StudioInspectorAsideHandlers } from "../StudioInspectorAside";
import type { StudioLazyPanelStackHandlers } from "../StudioLazyPanelStack";
import type { StudioOptionsBarsHandlers } from "../StudioOptionsBars";

type StudioLayerCompDeps = Parameters<typeof createStudioLayerCompHandlers>[0];
type StudioLayerCompSyncInput = ReturnType<Parameters<typeof captureStudioLayerCompSynchronization>[0]>;
type StudioLayerCompLeaseInput = ReturnType<Parameters<typeof captureStudioLayerCompLeaseRelease>[0]>;

export function buildStudioLayerCompHandlers<Ticket>({
  pendingStrokeCommitsRef, flushPendingStrokeCommitsRef, pagesHistoryRef, pagesHiRef, pages,
  currentPageIdRef, editorMountedRef, masterEditModeRef, documentSaveInFlightRef,
  collaborationAccessRef, activeSurfaceReviewLockedRef, commit, setError,
  captureStudioMutationTicket, canApplyStudioMutation, studioCrdtDocumentRef,
  studioLiveRoomRef, studioCrdtSceneRuntimeRef, beginLiveResourceEditAsync,
  studioLiveMutationGenerationRef, studioLiveHeldResourcesRef, endLiveResourceEdit,
}: {
  readonly pendingStrokeCommitsRef: MutableRefObject<unknown>;
  readonly flushPendingStrokeCommitsRef: MutableRefObject<() => boolean>;
  readonly pagesHistoryRef: MutableRefObject<PageState[][]>;
  readonly pagesHiRef: MutableRefObject<number>;
  readonly pages: PageState[];
  readonly currentPageIdRef: MutableRefObject<string>;
  readonly editorMountedRef: MutableRefObject<boolean>;
  readonly masterEditModeRef: MutableRefObject<boolean>;
  readonly documentSaveInFlightRef: MutableRefObject<boolean>;
  readonly collaborationAccessRef: MutableRefObject<{ locked: boolean }>;
  readonly activeSurfaceReviewLockedRef: MutableRefObject<boolean>;
  readonly commit: StudioLayerCompDeps["commit"];
  readonly setError: StudioLayerCompDeps["reportError"];
  readonly captureStudioMutationTicket: () => Ticket;
  readonly canApplyStudioMutation: (ticket: Ticket) => boolean;
  readonly studioCrdtDocumentRef: MutableRefObject<StudioLayerCompSyncInput["document"]>;
  readonly studioLiveRoomRef: MutableRefObject<StudioLayerCompSyncInput["room"]>;
  readonly studioCrdtSceneRuntimeRef: MutableRefObject<StudioLayerCompSyncInput["runtime"]>;
  readonly beginLiveResourceEditAsync: StudioLayerCompDeps["acquire"];
  readonly studioLiveMutationGenerationRef: MutableRefObject<StudioLayerCompLeaseInput["generation"]>;
  readonly studioLiveHeldResourcesRef: MutableRefObject<StudioLayerCompLeaseInput["resources"]>;
  readonly endLiveResourceEdit: Parameters<typeof captureStudioLayerCompLeaseRelease>[1];
}) {
  return createStudioLayerCompHandlers<Ticket>({
    prepare: () => !pendingStrokeCommitsRef.current || flushPendingStrokeCommitsRef.current(),
    getPage: () => (pagesHistoryRef.current[pagesHiRef.current] ?? pages)
      .find((page) => page.id === currentPageIdRef.current) ?? null,
    canMutate: () => editorMountedRef.current
      && !masterEditModeRef.current
      && !documentSaveInFlightRef.current
      && !collaborationAccessRef.current.locked
      && !activeSurfaceReviewLockedRef.current,
    commit,
    reportError: setError,
    captureMutationTicket: captureStudioMutationTicket,
    canApplyMutation: canApplyStudioMutation,
    createSynchronizationBarrier: () => captureStudioLayerCompSynchronization(() => ({
      document: studioCrdtDocumentRef.current,
      room: studioLiveRoomRef.current,
      runtime: studioCrdtSceneRuntimeRef.current,
    })),
    acquire: beginLiveResourceEditAsync,
    captureLeaseRelease: () => captureStudioLayerCompLeaseRelease(() => ({
      document: studioCrdtDocumentRef.current,
      room: studioLiveRoomRef.current,
      pageId: currentPageIdRef.current,
      generation: studioLiveMutationGenerationRef.current,
      resources: studioLiveHeldResourcesRef.current,
    }), endLiveResourceEdit),
  });
}

type InspectorInlineKeys =
  | "addProceduralArtisticBrushRaster"
  | "prepareNativeBrushDocumentConversion"
  | "applyBrushDefaultRestoreTransaction"
  | "changeDrawingPaletteLayout"
  | "setDrawingPaletteDragging"
  | "openBrushCatalog";

type InspectorComputedKeys =
  | "replaceDrawWithHokusaiNaturalMedia"
  | "stopTimeline";

export function buildStudioInspectorAsideRestHandlers({
  activePageId, masterEditModeRef, collaborationDocumentLocked, activeSurfaceReviewLocked,
  elements, groups, commit, setSelectedId, announceDrawingShortcut, setTimelinePlaying, forwarded,
}: {
  readonly activePageId: string;
  readonly masterEditModeRef: MutableRefObject<boolean>;
  readonly collaborationDocumentLocked: boolean;
  readonly activeSurfaceReviewLocked: boolean;
  readonly elements: El[];
  readonly groups: LayerGroup[];
  readonly commit: (next: El[]) => boolean;
  readonly setSelectedId: Dispatch<SetStateAction<string | null>>;
  readonly announceDrawingShortcut: (message: string) => void;
  readonly setTimelinePlaying: Dispatch<SetStateAction<boolean>>;
  readonly forwarded: Omit<StudioInspectorAsideHandlers, InspectorInlineKeys | InspectorComputedKeys>;
}): Omit<StudioInspectorAsideHandlers, InspectorInlineKeys> {
  return {
    ...forwarded,
    replaceDrawWithHokusaiNaturalMedia: (
      result, targetPageId, targetMasterEditMode,
    ) => {
      if (
        targetPageId !== activePageId
        || targetMasterEditMode !== masterEditModeRef.current
        || collaborationDocumentLocked
        || activeSurfaceReviewLocked
      ) {
        return false;
      }
      const plan = planStudioHokusaiNaturalMediaReplacement(elements, groups, result);
      if (!plan) return false;
      if (!commit(plan.nextElements)) return false;
      setSelectedId(plan.rasterId);
      announceDrawingShortcut("Hokusai 자연매체 변환 완료 · 원본 벡터는 숨김 보존");
      return true;
    },
    stopTimeline: () => {
      setTimelinePlaying(false);
      announceDrawingShortcut("타임라인을 멈췄어요");
    },
  };
}

type LazyPanelInlineKeys =
  | "setCurrentPageId"
  | "useBg3dFrameAsAiMethodReference"
  | "insertBg3dResult"
  | "insertVrmResult";

export function buildStudioLazyPanelStackRestHandlers<Ticket>({
  mannequinMutationTicketRef, canApplyStudioMutation, addRenderedImage, forwarded,
}: {
  readonly mannequinMutationTicketRef: MutableRefObject<Ticket | null>;
  readonly canApplyStudioMutation: (ticket: Ticket) => boolean;
  readonly addRenderedImage: (
    dataUrl: string,
    width: number,
    height: number,
    aiProvenance: undefined,
    preferFrameBg: false,
    meta: { name: string },
  ) => boolean;
  readonly forwarded: Omit<StudioLazyPanelStackHandlers, LazyPanelInlineKeys | "insertMannequinResult">;
}): Omit<StudioLazyPanelStackHandlers, LazyPanelInlineKeys> {
  return {
    ...forwarded,
    insertMannequinResult: (result) => {
      if (
        !mannequinMutationTicketRef.current
        || !canApplyStudioMutation(mannequinMutationTicketRef.current)
      ) return false;
      return addRenderedImage(
        result.pngDataUrl,
        result.displayWidth ?? result.width,
        result.displayHeight ?? result.height,
        undefined,
        false,
        { name: "3D 데생 인형(마네킹)" },
      );
    },
  };
}

type OptionsBarsInlineKeys =
  | "assignBrushSlot"
  | "openBrushStudio"
  | "recallBrushSlot"
  | "setDrawMode"
  | "swapColors"
  | "toggleSelectedLock";

type OptionsBarsDirectKeys =
  | "toggleBrushDock"
  | "restoreDrawingLayout"
  | "undoDrawingLayoutRestore"
  | "transformSelection"
  | "deleteSelection"
  | "duplicateSelection"
  | "editSelectionText"
  | "selectBrushId"
  | "setBrushOpacity"
  | "setColor"
  | "setDrawShape"
  | "setLivingInkMode"
  | "setLivingInkScope"
  | "setPostCorrection"
  | "setSecondaryColor"
  | "setShapeFill"
  | "setStabilizerMode"
  | "setStampTuning"
  | "setStrokeWidth"
  | "setSymmetryType"
  | "applyLivingInkFix"
  | "applyLivingInkClear"
  | "patchLivingInkMaterial"
  | "toggleCanvasFlip"
  | "toggleFavoriteBrush"
  | "toggleEraseToIntersection";

export function buildStudioOptionsBarsRestHandlers<
  ProDrawPrefs extends { opacityLocked: boolean; sizeLocked: boolean },
>({
  setQuickAccessLaunchPoint, openStudioQuickAccessPalette, setStabilizer, announceDrawingShortcut,
  fitBubbleToText, activatePrimaryCanvasTool, reorder, restoreBrushDefaults,
  setLivingInkPhysicalBrushKey, currentLivingInkExplicitBrushKey, setPressureCurve,
  toggleDrawingBrushDock, commitProDrawPrefsMutation, quickShapeActive,
  setEyedropperActive, setQuickShapeActive, direct,
}: {
  readonly setQuickAccessLaunchPoint: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  readonly openStudioQuickAccessPalette: () => Promise<void>;
  readonly setStabilizer: Dispatch<SetStateAction<number>>;
  readonly announceDrawingShortcut: (message: string) => void;
  readonly fitBubbleToText: () => Promise<void>;
  readonly activatePrimaryCanvasTool: (tool: "select" | "draw", drawMode?: DrawMode) => void;
  readonly reorder: StudioOptionsBarsHandlers["reorderSelection"];
  readonly restoreBrushDefaults: () => Promise<unknown>;
  readonly setLivingInkPhysicalBrushKey: Dispatch<SetStateAction<string | null>>;
  readonly currentLivingInkExplicitBrushKey: string | null;
  readonly setPressureCurve: (value: ReturnType<typeof pressureCurveValueForPreset>) => void;
  readonly toggleDrawingBrushDock: () => void;
  readonly commitProDrawPrefsMutation: (
    updater: (latest: ProDrawPrefs) => ProDrawPrefs,
  ) => { prefs: ProDrawPrefs };
  readonly quickShapeActive: boolean;
  readonly setEyedropperActive: Dispatch<SetStateAction<boolean>>;
  readonly setQuickShapeActive: Dispatch<SetStateAction<boolean>>;
  readonly direct: Pick<StudioOptionsBarsHandlers, OptionsBarsDirectKeys>;
}): Omit<StudioOptionsBarsHandlers, OptionsBarsInlineKeys> {
  return {
    ...direct,
    setStabilizer,
    openQuickAccess: (point) => {
      setQuickAccessLaunchPoint(point ?? null);
      void openStudioQuickAccessPalette();
    },
    cycleStabilizer: () => {
      setStabilizer((prev) => {
        const next = cycleStudioStabilizerStrength(prev);
        announceDrawingShortcut(`보정 ${next}`);
        return next;
      });
    },
    fitSelectionBubble: () => {
      void fitBubbleToText();
    },
    reorderSelection: (direction) => reorder(direction),
    restoreBrushDefaults: () => {
      void restoreBrushDefaults();
    },
    setLivingInkPhysicalModeEnabled: (enabled) => {
      setLivingInkPhysicalBrushKey(
        enabled && STUDIO_LIVING_INK_NEW_PHYSICAL_STROKES_ENABLED
          ? currentLivingInkExplicitBrushKey
          : null,
      );
    },
    setPressureCurvePreset: (id) => setPressureCurve(pressureCurveValueForPreset(id)),
    toggleBrushCatalog: () => toggleDrawingBrushDock(),
    toggleOpacityLock: () => {
      const { prefs: next } = commitProDrawPrefsMutation(
        (latest) => ({ ...latest, opacityLocked: !latest.opacityLocked }),
      );
      announceDrawingShortcut(next.opacityLocked ? "불투명 잠금" : "불투명 잠금 해제");
    },
    toggleQuickShape: () => {
      const next = !quickShapeActive;
      if (next) {
        activatePrimaryCanvasTool("draw", "pen");
        setEyedropperActive(false);
        announceDrawingShortcut("스마트 도형 켜짐 · 그려서 손을 떼면 다듬어요");
      } else {
        announceDrawingShortcut("스마트 도형 꺼짐");
      }
      setQuickShapeActive(next);
    },
    toggleSizeLock: () => {
      const { prefs: next } = commitProDrawPrefsMutation(
        (latest) => ({ ...latest, sizeLocked: !latest.sizeLocked }),
      );
      announceDrawingShortcut(next.sizeLocked ? "크기 잠금" : "크기 잠금 해제");
    },
  };
}

type CanvasViewportInlineKeys =
  | "activateCanvasTool"
  | "addPage"
  | "reorderPage"
  | "closeViewToolWithFocus"
  | "beginCanvasSelectionResize"
  | "cancelCanvasSelectionResize"
  | "finalizeCanvasSelectionResize"
  | "commitCanvasSelectionResize"
  | "fitCanvasToViewport"
  | "fitCanvasToWidth"
  | "onWebGpuFrameInvalid"
  | "onWebGpuFrameRequest"
  | "onWebGpuFrameReady"
  | "onWebGpuDeviceLost"
  | "onWebGpuBackendChange"
  | "canSkiaDocumentPublishOverSettledInk"
  | "onSkiaDocumentAuthorityChange"
  | "onSkiaDocumentVisiblePresentation"
  | "setWebGpuCanvasHandle"
  | "setHokusaiLiveOverlaySurface"
  | "onHokusaiCanonicalImageReady"
  | "setLivingInkOverlaySurface"
  | "onLivingInkCanonicalImageReady"
  | "setElementNodeRef"
  | "isCanvasGroupDragActive"
  | "selectElementFromCanvas"
  | "commitTextTransformEnd";

export function buildStudioCanvasViewportRestHandlers<AppSettings>({
  appSettingsRef, persistAppSettings, reanchorStudioCommentPin, forwarded,
}: {
  readonly appSettingsRef: MutableRefObject<AppSettings>;
  readonly persistAppSettings: (next: AppSettings) => void;
  readonly reanchorStudioCommentPin: (
    payload: Parameters<StudioCanvasViewportHandlers["reanchorStudioCommentPin"]>[0],
  ) => Promise<unknown>;
  readonly forwarded: Omit<
    StudioCanvasViewportHandlers,
    CanvasViewportInlineKeys | "retryAppSettingsPersistence" | "reanchorStudioCommentPin"
  >;
}): Omit<StudioCanvasViewportHandlers, CanvasViewportInlineKeys> {
  return {
    ...forwarded,
    retryAppSettingsPersistence: () => {
      persistAppSettings(appSettingsRef.current);
    },
    reanchorStudioCommentPin: (payload) => {
      void reanchorStudioCommentPin(payload);
    },
  };
}
