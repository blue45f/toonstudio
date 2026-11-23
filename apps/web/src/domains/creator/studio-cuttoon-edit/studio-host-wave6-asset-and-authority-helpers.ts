import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import { STUDIO_WORK_ASSET_MAX_ASSETS_PER_WORK } from "@/shared/lib/studio-work-asset-contract";
import {
  loadStudioInkMeshLivePreviewModule,
  type StudioInkMeshLivePreviewModule,
  type StudioInkMeshLivePreviewRuntime,
} from "../brush/studio-ink-mesh-live-preview-loader";
import type { StudioCrdtDocument } from "../live/studio-crdt-document";
import type { StudioLiveDynamicBrushOverlayRenderer } from "../live/studio-live-dynamic-brush-overlay";
import type {
  StudioLiveInkOverlayRenderer,
  StudioLiveInkPredictionRenderer,
} from "../live/studio-live-ink-overlay";
import type { StudioLiveRetainedMediaOverlayRenderer } from "../live/studio-live-retained-media-overlay";
import type { StudioLiveStampOverlayRenderer } from "../live/studio-live-stamp-overlay";
import type { StudioLiveWetInkOverlayRenderer } from "../live/studio-live-wet-ink-overlay";
import { clearStudioRasterEditSurfaces } from "../render/studio-raster-edit-surface-cache";
import type { StudioRasterHandoffCandidate } from "../render/studio-raster-handoff-authority";
import { STUDIO_AUTOMATIC_RASTER_PUBLICATION_ENABLED } from "../render/studio-raster-publication-feature";
import type { StudioRasterServerAuthoritySnapshot } from "../render/studio-raster-server-authority";
import type { El } from "../studio-element-model";
import {
  createFixedRateStrokeFrameClock,
  createFixedRateStrokeSampleClock,
  type FixedRateStrokeFrameClockState,
  type FixedRateStrokeSampleClockState,
} from "../studio-fixed-rate-stroke-frame-pump";
import type { FixedRateStrokeFilterState } from "../studio-fixed-rate-stroke-filter";
import { readyStudioWorkAssetImageSources } from "../studio-legacy-editor-runtime-helpers";
import type { PageState } from "../studio-page-state";
import type { StudioWorkAssetHydratorRuntime } from "../studio-work-asset-hydrator";
import {
  areStudioWorkAssetSceneReferencesEqual,
  collectStudioWorkAssetSceneReferences,
  type StudioWorkAssetSceneReference,
} from "../studio-work-asset-render-projection";

export function runStudioWorkAssetObservationEffect({
  activePageId, pages, authorizedWorkAssetScopeId, studioCrdtDocument,
  studioWorkAssetHydrator, setStudioWorkAssetLimitExceeded, setStudioWorkAssetReferences,
}: {
  readonly activePageId: string;
  readonly pages: readonly PageState[];
  readonly authorizedWorkAssetScopeId: string | null | undefined;
  readonly studioCrdtDocument: StudioCrdtDocument | null;
  readonly studioWorkAssetHydrator: StudioWorkAssetHydratorRuntime;
  readonly setStudioWorkAssetLimitExceeded: Dispatch<SetStateAction<boolean>>;
  readonly setStudioWorkAssetReferences: Dispatch<SetStateAction<StudioWorkAssetSceneReference[]>>;
}): (() => void) | undefined {
  const observeSceneElements = (
    sceneElements: ReturnType<StudioCrdtDocument["getSceneElements"]>,
  ) => {
    const references = collectStudioWorkAssetSceneReferences(sceneElements, pages);
    const limitExceeded = references.length > STUDIO_WORK_ASSET_MAX_ASSETS_PER_WORK;
    setStudioWorkAssetLimitExceeded((current) =>
      current === limitExceeded ? current : limitExceeded,
    );
    if (limitExceeded) {
      studioWorkAssetHydrator.observe([]);
      setStudioWorkAssetReferences((current) => (current.length === 0 ? current : []));
      return;
    }
    const activePageReferences = references
      .filter((candidate) => candidate.pageId === activePageId)
      .map((candidate) => candidate.reference);
    const backgroundReferences = references
      .filter((candidate) => candidate.pageId !== activePageId)
      .map((candidate) => candidate.reference);
    studioWorkAssetHydrator.observe(
      [...activePageReferences, ...backgroundReferences],
      { priorityReferences: activePageReferences },
    );
    setStudioWorkAssetReferences((current) =>
      areStudioWorkAssetSceneReferencesEqual(current, references) ? current : references,
    );
  };
  if (!authorizedWorkAssetScopeId) {
    studioWorkAssetHydrator.observe([]);
    setStudioWorkAssetReferences((current) => (current.length === 0 ? current : []));
    setStudioWorkAssetLimitExceeded(false);
    return undefined;
  }
  observeSceneElements(studioCrdtDocument?.getSceneElements({ includeDeleted: true }) ?? []);
  return studioCrdtDocument?.subscribeChanges(
    (change) => observeSceneElements(change.snapshot.sceneElements),
    {
      includeOrigin: () => true,
      includeChange: ({ changedSceneElementIds }) => changedSceneElementIds.size > 0,
      snapshotFields: ["sceneElements"] as const,
    },
  );
}

export function runStudioWorkAssetHydrationReconcileEffect({
  studioCrdtDocument, sourceHydrationPending, studioWorkAssetHydrator,
  studioWorkAssetReferences, studioCrdtSceneRuntimeRef, pagesHistoryRef,
  pagesHiRef, rebaseStudioHistoryJournal, setPagesHistoryState,
}: {
  readonly studioCrdtDocument: StudioCrdtDocument | null;
  readonly sourceHydrationPending: boolean;
  readonly studioWorkAssetHydrator: StudioWorkAssetHydratorRuntime;
  readonly studioWorkAssetReferences: readonly StudioWorkAssetSceneReference[];
  readonly studioCrdtSceneRuntimeRef: MutableRefObject<{
    reconcileHistory: (
      history: PageState[][],
      index: number,
      frontier: {
        strokes: ReturnType<StudioCrdtDocument["getStrokes"]>;
        sceneElements: ReturnType<StudioCrdtDocument["getSceneElements"]>;
        pages: ReturnType<StudioCrdtDocument["getPages"]>;
        layerGroups: ReturnType<StudioCrdtDocument["getLayerGroups"]>;
      },
      delta: {
        strokeIds: Set<string>;
        sceneElementIds: Set<string>;
        pageIds: Set<string>;
        layerGroupIds: Set<string>;
      },
      referenceSources: ReadonlyMap<string, El>,
    ) => { changed: boolean; history: PageState[][] };
  } | null>;
  readonly pagesHistoryRef: MutableRefObject<PageState[][]>;
  readonly pagesHiRef: MutableRefObject<number>;
  readonly rebaseStudioHistoryJournal: (pages: PageState[], index: number, reason: string) => void;
  readonly setPagesHistoryState: Dispatch<SetStateAction<PageState[][]>>;
}): void {
  if (!studioCrdtDocument || sourceHydrationPending) return;
  const referenceSources = readyStudioWorkAssetImageSources(studioWorkAssetHydrator);
  if (referenceSources.size === 0) return;
  const readyReferenceIds = new Set(
    studioWorkAssetReferences
      .filter((candidate) =>
        candidate.reference.elementType === "image"
        && referenceSources.has(candidate.reference.assetId),
      )
      .map((candidate) => candidate.reference.assetId),
  );
  if (readyReferenceIds.size === 0) return;
  const runtime = studioCrdtSceneRuntimeRef.current;
  if (!runtime) return;
  const frontier = {
    strokes: studioCrdtDocument.getStrokes({ includeDeleted: true }),
    sceneElements: studioCrdtDocument.getSceneElements({ includeDeleted: true }),
    pages: studioCrdtDocument.getPages(true),
    layerGroups: studioCrdtDocument.getLayerGroups({ includeDeleted: true }),
  };
  const currentHistory = pagesHistoryRef.current;
  const currentIndex = Math.max(
    0,
    Math.min(pagesHiRef.current, Math.max(0, currentHistory.length - 1)),
  );
  const reconciled = runtime.reconcileHistory(
    currentHistory,
    currentIndex,
    frontier,
    {
      strokeIds: new Set<string>(),
      sceneElementIds: readyReferenceIds,
      pageIds: new Set<string>(),
      layerGroupIds: new Set<string>(),
    },
    referenceSources,
  );
  if (!reconciled.changed) return;
  pagesHistoryRef.current = reconciled.history;
  pagesHiRef.current = currentIndex;
  rebaseStudioHistoryJournal(
    reconciled.history[currentIndex] ?? [],
    currentIndex,
    "work asset hydration reconciliation",
  );
  setPagesHistoryState(reconciled.history);
}

export function runStudioRasterServerAuthorityEffect({
  authorizedWorkAssetScopeId, studioAuthUserId, studioCrdtDocument,
  studioCrdtOperationSyncReady, collaborationDocumentLocked,
  collaborationAccessRef, studioCrdtAuthoritativeSaveBarrierRef,
  studioCrdtDocumentRef, setStudioRasterServerAuthority, setStudioRasterHandoffCandidate,
  scopeChangedMessage,
}: {
  readonly authorizedWorkAssetScopeId: string | null | undefined;
  readonly studioAuthUserId: string | null | undefined;
  readonly studioCrdtDocument: StudioCrdtDocument | null;
  readonly studioCrdtOperationSyncReady: boolean;
  readonly collaborationDocumentLocked: boolean;
  readonly collaborationAccessRef: MutableRefObject<{
    locked: boolean;
    workId: string | null;
    authScopeKey: string | null;
  }>;
  readonly studioCrdtAuthoritativeSaveBarrierRef: {
    readonly current: ((timeoutMs?: number) => Promise<unknown>) | null;
  };
  readonly studioCrdtDocumentRef: MutableRefObject<StudioCrdtDocument | null>;
  readonly setStudioRasterServerAuthority: Dispatch<SetStateAction<StudioRasterServerAuthoritySnapshot>>;
  readonly setStudioRasterHandoffCandidate: Dispatch<SetStateAction<StudioRasterHandoffCandidate | null>>;
  readonly scopeChangedMessage?: () => string;
}): (() => void) | undefined {
  if (
    !STUDIO_AUTOMATIC_RASTER_PUBLICATION_ENABLED ||
    !authorizedWorkAssetScopeId || !studioAuthUserId || !studioCrdtDocument ||
    !studioCrdtOperationSyncReady || collaborationDocumentLocked
  ) {
    setStudioRasterServerAuthority((current) => (current.length === 0 ? current : Object.freeze([])));
    setStudioRasterHandoffCandidate(null);
    return undefined;
  }
  setStudioRasterServerAuthority((current) => (current.length === 0 ? current : Object.freeze([])));
  setStudioRasterHandoffCandidate(null);
  let active = true;
  let coordinator: import("../render/studio-raster-server-authority")
    .StudioRasterServerAuthorityCoordinator | null = null;
  const document = studioCrdtDocument;
  const workScope = authorizedWorkAssetScopeId;
  const authScope = studioAuthUserId;
  let unsubscribe: (() => void) | null = null;

  void import("../render/studio-raster-server-authority").then(({ StudioRasterServerAuthorityCoordinator }) => {
    if (!active) return;
    coordinator = new StudioRasterServerAuthorityCoordinator({
      readLogs: () => document.getRasterOperationLogs(),
      waitForAuthoritativeAck: async () => {
        const access = collaborationAccessRef.current;
        const barrier = studioCrdtAuthoritativeSaveBarrierRef.current;
        if (
          !active || !barrier || access.locked || access.workId !== workScope ||
          access.authScopeKey !== authScope || studioCrdtDocumentRef.current !== document
        ) {
          throw new DOMException(
            scopeChangedMessage?.() ?? "래스터 서버 승인 범위가 변경되었습니다.",
            "AbortError",
          );
        }
        return barrier(10_000);
      },
      onAuthorityChange: (snapshot) => {
        if (
          !active || studioCrdtDocumentRef.current !== document ||
          collaborationAccessRef.current.workId !== workScope ||
          collaborationAccessRef.current.authScopeKey !== authScope
        ) {
          return;
        }
        setStudioRasterServerAuthority(snapshot);
        if (snapshot.length === 0) setStudioRasterHandoffCandidate(null);
      },
      debounceMs: 80,
    });
    unsubscribe = document.subscribeChanges(() => coordinator?.invalidate(), {
      includeOrigin: () => true,
      includeChange: ({
        changedRasterSurfaceIds,
        changedRasterOperationIds,
        changedRasterUndoOperationIds,
        changedRasterUndoAcknowledgementIds,
        changedRasterCheckpointIds,
      }) =>
        changedRasterSurfaceIds.size > 0
        || changedRasterOperationIds.size > 0
        || changedRasterUndoOperationIds.size > 0
        || changedRasterUndoAcknowledgementIds.size > 0
        || changedRasterCheckpointIds.size > 0,
      snapshotFields: [] as const,
    });
    coordinator.start();
  }).catch(() => {
    if (!active) return;
    setStudioRasterServerAuthority((current) => (current.length === 0 ? current : Object.freeze([])));
    setStudioRasterHandoffCandidate(null);
  });

  return () => {
    active = false;
    unsubscribe?.();
    coordinator?.close();
  };
}

export function runStudioRasterOverlayUnmountCleanup({
  liveDynamicBrushOverlayRendererRef, liveRetainedMediaOverlayRendererRef,
  liveStampOverlayRendererRef, liveWetInkOverlayRendererRef,
  liveInkOverlayRendererRef, liveInkPredictionRendererRef,
}: {
  readonly liveDynamicBrushOverlayRendererRef: MutableRefObject<StudioLiveDynamicBrushOverlayRenderer>;
  readonly liveRetainedMediaOverlayRendererRef: MutableRefObject<StudioLiveRetainedMediaOverlayRenderer>;
  readonly liveStampOverlayRendererRef: MutableRefObject<StudioLiveStampOverlayRenderer>;
  readonly liveWetInkOverlayRendererRef: MutableRefObject<StudioLiveWetInkOverlayRenderer>;
  readonly liveInkOverlayRendererRef: MutableRefObject<StudioLiveInkOverlayRenderer>;
  readonly liveInkPredictionRendererRef: MutableRefObject<StudioLiveInkPredictionRenderer>;
}): () => void {
  return () => {
    try {
      clearStudioRasterEditSurfaces();
    } catch {
      // 언마운트 중 정리 예외는 무시한다.
    }
    try {
      liveDynamicBrushOverlayRendererRef.current?.clear?.();
      liveRetainedMediaOverlayRendererRef.current?.clear?.();
      liveStampOverlayRendererRef.current?.clear?.();
      liveWetInkOverlayRendererRef.current?.clear?.();
      liveInkOverlayRendererRef.current?.clear?.();
      liveInkPredictionRendererRef.current?.clear?.();
    } catch {
      // 스테이지와 함께 오버레이가 이미 정리됐을 수 있다.
    }
  };
}

export function runStudioInkMeshPreviewEffect({
  inkMeshLivePreviewModuleRef, inkMeshLivePreviewRuntimeRef, setInkMeshLivePreviewRuntime,
}: {
  readonly inkMeshLivePreviewModuleRef: MutableRefObject<StudioInkMeshLivePreviewModule | null>;
  readonly inkMeshLivePreviewRuntimeRef: MutableRefObject<StudioInkMeshLivePreviewRuntime | null>;
  readonly setInkMeshLivePreviewRuntime: Dispatch<SetStateAction<StudioInkMeshLivePreviewRuntime | null>>;
}): () => void {
  let mounted = true;
  void loadStudioInkMeshLivePreviewModule()
    .then((module) => {
      if (!mounted) return;
      const runtime = new module.StudioInkMeshLivePreviewRuntime();
      inkMeshLivePreviewModuleRef.current = module;
      inkMeshLivePreviewRuntimeRef.current = runtime;
      setInkMeshLivePreviewRuntime(runtime);
    })
    .catch((cause: unknown) => {
      if (import.meta.env.DEV) {
        console.warn("Studio Ink Mesh preview is unavailable; Canvas ink remains active.", cause);
      }
    });
  return () => {
    mounted = false;
    const runtime = inkMeshLivePreviewRuntimeRef.current;
    inkMeshLivePreviewRuntimeRef.current = null;
    inkMeshLivePreviewModuleRef.current = null;
    runtime?.dispose();
  };
}

export function runStudioStartFixedRateStrokePump({
  pointerEvent, pointerDownFrameTimeStamp, stopFixedRateStrokePump,
  drawingFixedRateFilterRef, drawingFixedRateSampleClockRef,
  drawingFixedRatePumpClockRef, drawingLastAuthoritativePointerRef, startPump,
}: {
  readonly pointerEvent: PointerEvent;
  readonly pointerDownFrameTimeStamp: number;
  readonly stopFixedRateStrokePump: () => void;
  readonly drawingFixedRateFilterRef: MutableRefObject<FixedRateStrokeFilterState | null>;
  readonly drawingFixedRateSampleClockRef: MutableRefObject<FixedRateStrokeSampleClockState | null>;
  readonly drawingFixedRatePumpClockRef: MutableRefObject<FixedRateStrokeFrameClockState | null>;
  readonly drawingLastAuthoritativePointerRef: MutableRefObject<PointerEvent | null>;
  readonly startPump: () => void;
}): void {
  stopFixedRateStrokePump();
  if (!drawingFixedRateFilterRef.current) {
    drawingFixedRateSampleClockRef.current = null;
    return;
  }
  const frameOrigin = pointerDownFrameTimeStamp;
  drawingFixedRatePumpClockRef.current = createFixedRateStrokeFrameClock(
    pointerEvent.timeStamp,
    frameOrigin,
  );
  drawingFixedRateSampleClockRef.current = createFixedRateStrokeSampleClock(
    pointerEvent.timeStamp,
    frameOrigin,
  );
  drawingLastAuthoritativePointerRef.current = pointerEvent;
  startPump();
}
