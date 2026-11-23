import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import type { StudioBrushCatalogPlacement } from "../brush/StudioBrushLibrarySheet";
import type { StudioSavedBrush } from "../brush/studio-brush-library";
import { collectStudioBrushR8GrainSources } from "../brush/studio-brush-r8-grain-hydrator";
import { collectStudioFilterMaskSurfaceIds } from "../filter/studio-filter-mask-surface-projection";
import type { StudioCrdtDocument } from "../live/studio-crdt-document";
import {
  globalFrameIndexAtElapsed,
  type AnimationTimelineDoc,
} from "../studio-anim-tracks";
import type { StudioAppSettings } from "../studio-app-settings";
import type { El, ImageEl } from "../studio-element-model";
import { DEFAULT_FRAME_FPS } from "../studio-frame-animation";
import { uid } from "../studio-id";
import type { DocumentMaster } from "../studio-master-page";
import {
  readAllProductBrushes,
  type ProductBrushLibraryRepository,
} from "../studio-page-editor-runtime-loaders";
import type { PendingBrushDelete } from "../studio-page-editor-ui-contracts";
import { studioTimelineClockMs } from "../studio-page-shell-runtime";
import type { PageState } from "../studio-page-state";

export interface StudioBrushCatalogSessionState {
  placement: StudioBrushCatalogPlacement;
  trigger: HTMLButtonElement;
}

export function runStudioSavedBrushesHydrationEffect({
  brushProjectionGenerationRef, productBrushRepository, setSavedBrushes, setError, openFailedMessage,
}: {
  readonly brushProjectionGenerationRef: MutableRefObject<number>;
  readonly productBrushRepository: () => Promise<ProductBrushLibraryRepository>;
  readonly setSavedBrushes: Dispatch<SetStateAction<StudioSavedBrush[]>>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly openFailedMessage?: string;
}): () => void {
  let active = true;
  const generation = brushProjectionGenerationRef.current + 1;
  brushProjectionGenerationRef.current = generation;
  void productBrushRepository()
    .then(async (product) => {
      const next = await readAllProductBrushes(product);
      if (active && brushProjectionGenerationRef.current === generation) {
        setSavedBrushes(next);
      }
    })
    .catch(() => {
      if (active) {
        setError(openFailedMessage ?? "브러시 라이브러리를 열지 못했어요. 저장소 권한과 여유 공간을 확인해주세요.");
      }
    });
  return () => {
    active = false;
  };
}

export function runStudioOpenFrameAnimationForSelected({
  ensurePixelToolTarget, patchEl, elements, capturedElementIdsRef,
  frameAnimTargetId, setFrameAnimTargetId, setFrameAnimOpen,
}: {
  readonly ensurePixelToolTarget: (label: string) => ImageEl | null;
  readonly patchEl: (id: string, patch: Partial<El>) => void;
  readonly elements: readonly El[];
  readonly capturedElementIdsRef: MutableRefObject<Set<string>>;
  readonly frameAnimTargetId: string | null;
  readonly setFrameAnimTargetId: Dispatch<SetStateAction<string | null>>;
  readonly setFrameAnimOpen: Dispatch<SetStateAction<boolean>>;
}): void {
  const target = ensurePixelToolTarget("프레임 애니메이션");
  if (!target) return;
  if (!target.frames || target.frames.length === 0) {
    const firstId = uid();
    patchEl(target.id, {
      frames: [{ id: firstId, src: target.src }],
      frameFps: DEFAULT_FRAME_FPS,
      frameLoop: true,
      activeFrameId: firstId,
    });
  }
  capturedElementIdsRef.current = new Set(elements.map((e) => e.id));
  setFrameAnimTargetId(target.id);
  setFrameAnimOpen((v) => (frameAnimTargetId === target.id ? !v : true));
}

export function runStudioBrushR8GrainHydratorEffect({
  studioBrushR8GrainHydrator, authorizedWorkAssetScopeId, pages, pagesHistory,
  pagesHi, extraElements,
}: {
  readonly studioBrushR8GrainHydrator: {
    observe: (scopeId: string | null, sources: ReturnType<typeof collectStudioBrushR8GrainSources>) => void;
  };
  readonly authorizedWorkAssetScopeId: string | null;
  readonly pages: readonly PageState[];
  readonly pagesHistory: readonly (readonly PageState[])[];
  readonly pagesHi: number;
  readonly extraElements: readonly El[];
}): void {
  studioBrushR8GrainHydrator.observe(
    authorizedWorkAssetScopeId,
    collectStudioBrushR8GrainSources({
      currentPages: pages,
      history: pagesHistory,
      historyIndex: pagesHi,
      extraElements,
    }),
  );
}

export function runStudioFilterMaskSurfaceHydratorEffect({
  studioFilterMaskSurfaceHydrator, authorizedWorkAssetScopeId, studioCrdtDocument,
  pages, master, activePageElements,
}: {
  readonly studioFilterMaskSurfaceHydrator: {
    setScope: (scopeId: string | null, doc: StudioCrdtDocument | null) => void;
    observe: (surfaceIds: readonly string[], options: { prioritySurfaceIds: readonly string[] }) => void;
  };
  readonly authorizedWorkAssetScopeId: string | null;
  readonly studioCrdtDocument: StudioCrdtDocument | null;
  readonly pages: readonly PageState[];
  readonly master: DocumentMaster<El>;
  readonly activePageElements: readonly El[];
}): void {
  studioFilterMaskSurfaceHydrator.setScope(
    authorizedWorkAssetScopeId,
    studioCrdtDocument,
  );
  const allSurfaceIds = collectStudioFilterMaskSurfaceIds([
    ...pages.flatMap((page) => page.elements),
    ...master.elements,
  ]);
  const prioritySurfaceIds = collectStudioFilterMaskSurfaceIds(activePageElements);
  studioFilterMaskSurfaceHydrator.observe(allSurfaceIds, { prioritySurfaceIds });
}

export function runStudioTimelinePlaybackEffect({
  timelinePlaying, animTimeline, setTimelinePreviewFrame,
}: {
  readonly timelinePlaying: boolean;
  readonly animTimeline: AnimationTimelineDoc;
  readonly setTimelinePreviewFrame: Dispatch<SetStateAction<number>>;
}): (() => void) | undefined {
  if (!timelinePlaying) return undefined;
  const start = studioTimelineClockMs();
  let raf = 0;
  let lastIdx = -1;
  const tick = () => {
    const elapsed = studioTimelineClockMs() - start;
    const idx = globalFrameIndexAtElapsed(animTimeline, elapsed, true);
    if (idx !== lastIdx) {
      lastIdx = idx;
      setTimelinePreviewFrame(idx);
    }
    raf = globalThis.requestAnimationFrame(tick);
  };
  raf = globalThis.requestAnimationFrame(tick);
  return () => globalThis.cancelAnimationFrame(raf);
}

export function runStudioSetGridAppSettingVisible({
  field, next, setLocalVisible, appSettingsRef, setAppSettings, persistAppSettings,
}: {
  readonly field: "showCanvasRulers" | "showAlignmentGuides";
  readonly next: boolean;
  readonly setLocalVisible: Dispatch<SetStateAction<boolean>>;
  readonly appSettingsRef: MutableRefObject<StudioAppSettings>;
  readonly setAppSettings: Dispatch<SetStateAction<StudioAppSettings>>;
  readonly persistAppSettings: (settings: StudioAppSettings) => void;
}): void {
  setLocalVisible(next);
  const current = appSettingsRef.current;
  if (current.grids[field] === next) return;
  const settings: StudioAppSettings = {
    ...current,
    grids: { ...current.grids, [field]: next },
  };
  appSettingsRef.current = settings;
  setAppSettings(settings);
  persistAppSettings(settings);
}

export function runStudioQuickAccessScopeResetEffect({
  quickAccessLoadedOwnerScopeRef, currentWorkspaceOwnerScope, quickAccessLoadEpochRef,
  quickAccessPersistenceWarningRef, setQuickAccessPaletteOpen, setQuickAccessPaletteLoading,
  setQuickAccessState, resetStudioQuickAccessPersonalKit,
}: {
  readonly quickAccessLoadedOwnerScopeRef: MutableRefObject<string | null>;
  readonly currentWorkspaceOwnerScope: string;
  readonly quickAccessLoadEpochRef: MutableRefObject<number>;
  readonly quickAccessPersistenceWarningRef: MutableRefObject<boolean>;
  readonly setQuickAccessPaletteOpen: Dispatch<SetStateAction<boolean>>;
  readonly setQuickAccessPaletteLoading: Dispatch<SetStateAction<boolean>>;
  readonly setQuickAccessState: (next: null) => void;
  readonly resetStudioQuickAccessPersonalKit: () => void;
}): void {
  if (
    quickAccessLoadedOwnerScopeRef.current === null
    || quickAccessLoadedOwnerScopeRef.current === currentWorkspaceOwnerScope
  ) {
    return;
  }
  quickAccessLoadEpochRef.current += 1;
  quickAccessLoadedOwnerScopeRef.current = null;
  quickAccessPersistenceWarningRef.current = false;
  setQuickAccessPaletteOpen(false);
  setQuickAccessPaletteLoading(false);
  setQuickAccessState(null);
  resetStudioQuickAccessPersonalKit();
}

export function runStudioMobileInspectorReturnFocusEffect({
  previousModalMobileSheetForReturnFocusRef, modalMobileSheet,
  mobileInspectorSelectionReturnFocusRef, isMobile, mobileSheet, studioRootRef,
  mobileWorkspaceToggleSelector = '[data-studio-mobile-workspace-toggle="true"]',
}: {
  readonly previousModalMobileSheetForReturnFocusRef: MutableRefObject<string | null>;
  readonly modalMobileSheet: string | null;
  readonly mobileInspectorSelectionReturnFocusRef: MutableRefObject<boolean>;
  readonly isMobile: boolean;
  readonly mobileSheet: string | null;
  readonly studioRootRef: RefObject<HTMLDivElement | null>;
  readonly mobileWorkspaceToggleSelector?: string;
}): void {
  const previousModalMobileSheet = previousModalMobileSheetForReturnFocusRef.current;
  previousModalMobileSheetForReturnFocusRef.current = modalMobileSheet;
  if (previousModalMobileSheet !== "props" || modalMobileSheet !== null) return;
  const restoreSelectionProperties = mobileInspectorSelectionReturnFocusRef.current;
  mobileInspectorSelectionReturnFocusRef.current = false;
  if (!restoreSelectionProperties || !isMobile || mobileSheet !== null) return;
  const focusTarget =
    studioRootRef.current?.querySelector<HTMLElement>('[data-studio-selection-properties-trigger="true"]')
    ?? studioRootRef.current?.querySelector<HTMLElement>(mobileWorkspaceToggleSelector);
  if (!focusTarget || focusTarget.closest("[hidden], [inert], [aria-hidden='true']")) return;
  focusTarget.focus({ preventScroll: true });
}

export function runStudioPendingBrushDeleteTimerEffect({
  pendingBrushDeletes, pausedBrushDeleteId, setPendingBrushDeletes,
}: {
  readonly pendingBrushDeletes: readonly PendingBrushDelete[];
  readonly pausedBrushDeleteId: string | null;
  readonly setPendingBrushDeletes: Dispatch<SetStateAction<PendingBrushDelete[]>>;
}): (() => void) | undefined {
  const active = pendingBrushDeletes.filter((pending) => pending.id !== pausedBrushDeleteId);
  if (active.length === 0) return undefined;
  const nextExpiry = Math.min(...active.map((pending) => pending.expiresAt));
  const timer = globalThis.setTimeout(() => {
    const now = Date.now();
    setPendingBrushDeletes((current) =>
      current.filter((pending) => pending.id === pausedBrushDeleteId || pending.expiresAt > now),
    );
  }, Math.max(0, nextExpiry - Date.now()));
  return () => globalThis.clearTimeout(timer);
}

export function runStudioZoomLockedCancelEffect({
  zoomLocked, zoomGestureRef, zoomHostRef,
}: {
  readonly zoomLocked: boolean;
  readonly zoomGestureRef: MutableRefObject<{ raf?: number | null; settleTimer?: ReturnType<typeof globalThis.setTimeout> | null } | null>;
  readonly zoomHostRef: RefObject<HTMLDivElement | null>;
}): void {
  if (!zoomLocked) return;
  const gesture = zoomGestureRef.current;
  zoomGestureRef.current = null;
  if (gesture?.raf) globalThis.cancelAnimationFrame(gesture.raf);
  if (gesture?.settleTimer) globalThis.clearTimeout(gesture.settleTimer);
  const host = zoomHostRef.current;
  if (host) {
    host.style.transform = "";
    host.style.willChange = "";
  }
}

export function runStudioTimelapseRecordingStart({
  invalidateAdvancedFillWork, clearAdvancedFillTapGesture, setAdvancedFillActive,
  timelapseOriginalHiRef, pagesHi, timelapseOriginalPageIdRef, currentPageId,
  timelapseOriginalMasterEditModeRef, masterEditMode, setMasterEditMode,
  preserveStudioViewBeforeCapture, setTimelapseCapturing,
}: {
  readonly invalidateAdvancedFillWork: (reason: string) => void;
  readonly clearAdvancedFillTapGesture: () => void;
  readonly setAdvancedFillActive: Dispatch<SetStateAction<boolean>>;
  readonly timelapseOriginalHiRef: MutableRefObject<number>;
  readonly pagesHi: number;
  readonly timelapseOriginalPageIdRef: MutableRefObject<string | null>;
  readonly currentPageId: string;
  readonly timelapseOriginalMasterEditModeRef: MutableRefObject<boolean>;
  readonly masterEditMode: boolean;
  readonly setMasterEditMode: Dispatch<SetStateAction<boolean>>;
  readonly preserveStudioViewBeforeCapture: () => void;
  readonly setTimelapseCapturing: Dispatch<SetStateAction<boolean>>;
}): void {
  invalidateAdvancedFillWork("타임랩스 캡처를 시작해 미적용 채우기 미리보기를 취소했습니다.");
  clearAdvancedFillTapGesture();
  setAdvancedFillActive(false);
  timelapseOriginalHiRef.current = pagesHi;
  timelapseOriginalPageIdRef.current = currentPageId;
  timelapseOriginalMasterEditModeRef.current = masterEditMode;
  setMasterEditMode(false);
  preserveStudioViewBeforeCapture();
  setTimelapseCapturing(true);
}

export function runStudioTimelapseRecordingEnd({
  setPagesHi, timelapseOriginalHiRef, timelapseOriginalPageIdRef,
  setCurrentPageId, setMasterEditMode, timelapseOriginalMasterEditModeRef,
  setTimelapseCapturing,
}: {
  readonly setPagesHi: Dispatch<SetStateAction<number>>;
  readonly timelapseOriginalHiRef: MutableRefObject<number>;
  readonly timelapseOriginalPageIdRef: MutableRefObject<string | null>;
  readonly setCurrentPageId: (pageId: string) => void;
  readonly setMasterEditMode: Dispatch<SetStateAction<boolean>>;
  readonly timelapseOriginalMasterEditModeRef: MutableRefObject<boolean>;
  readonly setTimelapseCapturing: Dispatch<SetStateAction<boolean>>;
}): void {
  setPagesHi(timelapseOriginalHiRef.current);
  if (timelapseOriginalPageIdRef.current) {
    setCurrentPageId(timelapseOriginalPageIdRef.current);
  }
  setMasterEditMode(timelapseOriginalMasterEditModeRef.current);
  setTimelapseCapturing(false);
}
