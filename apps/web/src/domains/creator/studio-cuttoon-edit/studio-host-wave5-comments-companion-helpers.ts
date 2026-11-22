import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";

import type { StudioTextAiProvenance } from "../ai/studio-ai-response-parsing";
import { CANVAS_W } from "../studio-assets";
import {
  BRUSH_PRESETS,
  resolveStudioBrushPresetDrawMode,
  type BrushPreset,
} from "../studio-brush";
import {
  selectStudioEditorCommentTarget,
  type StudioEditorCommentTarget,
} from "../studio-comment-editor-selection";
import {
  studioCommentThreadSessionCloseDiscardsDraft,
  type StudioCommentThreadSessionCloseReason,
  type StudioCommentThreadSessionEvent,
  type StudioCommentThreadSessionView,
} from "../studio-comment-thread-session";
import {
  createEmptyStudioCommentsDocument,
  normalizeStudioCommentsDocument,
  partitionStudioTeamCommentMutableDocument,
  type StudioCommentThread,
  type StudioCommentsDocument,
} from "../studio-comments";
import type { StudioCompanionReviewControl } from "../studio-companion-review-projection";
import { loadStudioWriterRoomRuntime } from "../studio-cuttoon-editor/runtime/loadStudioWriterRoomRuntime";
import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { DrawMode, Tool } from "../studio-editor-tool-model";
import { elementLabel } from "../studio-element-label";
import type { El } from "../studio-element-model";
import type { GroupSelectionState } from "../studio-group-selection";
import type { StudioInspectorRoute } from "../studio-inspector-layout";
import {
  loadStudioTeamCommentClient,
  loadStudioTeamCommentMutationPlanner,
} from "../studio-page-lazy-ui";
import { pageDisplayName } from "../studio-page-meta";
import type { PageState } from "../studio-page-state";
import type { StudioProjectSnapshot } from "../studio-project-snapshot";
import type { StudioTeamCommentCapabilities } from "../studio-team-comment-client";
import type { StudioTeamCommentMutationPlan } from "../studio-team-comment-mutation-plan";
import type { StudioTeamCommentOperationScopeRegistry } from "../studio-team-comment-operation-scope";
import {
  createStudioTeamCommentRefreshSession,
  type StudioTeamCommentRefreshSession,
} from "../studio-team-comment-refresh-session";
import type { StudioToolsCompanionReviewProjectionInput } from "../studio-tools-companion-runtime";
import type { StudioWriterRoomDocument, StudioWriterRoomStage } from "../studio-writer-room";
import type { StudioWriterRoomCanvasProjectionResult } from "../studio-writer-room-canvas-projection";
import {
  resolveStudioCommentPinClusterNavigation,
  type StudioCommentThreadPopoverTarget,
} from "./studio-host-comment-projection-helpers";

export function runStudioTeamCommentsRefreshEffect({
  studioTeamCommentsWorkId, studioTeamCommentOperationScopeRegistryRef,
  studioTeamCommentMutationFlightRef, studioTeamCommentReadFlightRef,
  studioTeamCommentReanchorFlightRef, studioTeamCommentReanchorQueueRef,
  studioTeamCommentLiveTargetSequenceRef, studioTeamCommentLiveRefreshFlightRef,
  studioTeamCommentsLoadGenerationRef, studioTeamCommentRefreshSessionRef,
  studioTeamCommentsScopeRef, studioTeamCommentActivitySequenceRef,
  studioTeamCommentReadSequenceRef, setStudioTeamCommentsState,
  setStudioTeamUnreadCommentIds, setStudioTeamCommentCapabilities,
  setStudioCommentSyncError, setStudioTeamCommentsSyncing,
  projectFailedMessage, loadFailedMessage,
}: {
  readonly studioTeamCommentsWorkId: string | null;
  readonly studioTeamCommentOperationScopeRegistryRef: MutableRefObject<StudioTeamCommentOperationScopeRegistry>;
  readonly studioTeamCommentMutationFlightRef: { readonly current: { clear(): void } };
  readonly studioTeamCommentReadFlightRef: { readonly current: { clear(): void } };
  readonly studioTeamCommentReanchorFlightRef: { readonly current: { clear(): void } };
  readonly studioTeamCommentReanchorQueueRef: { readonly current: { clear(): void } };
  readonly studioTeamCommentLiveTargetSequenceRef: MutableRefObject<Map<string, bigint>>;
  readonly studioTeamCommentLiveRefreshFlightRef: { readonly current: { clear(): void } };
  readonly studioTeamCommentsLoadGenerationRef: MutableRefObject<number>;
  readonly studioTeamCommentRefreshSessionRef: MutableRefObject<StudioTeamCommentRefreshSession | null>;
  readonly studioTeamCommentsScopeRef: MutableRefObject<string | null>;
  readonly studioTeamCommentActivitySequenceRef: MutableRefObject<Map<string, bigint>>;
  readonly studioTeamCommentReadSequenceRef: MutableRefObject<Map<string, bigint>>;
  readonly setStudioTeamCommentsState: Dispatch<SetStateAction<StudioCommentsDocument>>;
  readonly setStudioTeamUnreadCommentIds: Dispatch<SetStateAction<string[]>>;
  readonly setStudioTeamCommentCapabilities: Dispatch<SetStateAction<StudioTeamCommentCapabilities | null>>;
  readonly setStudioCommentSyncError: Dispatch<SetStateAction<string | null>>;
  readonly setStudioTeamCommentsSyncing: Dispatch<SetStateAction<boolean>>;
  readonly projectFailedMessage: () => string;
  readonly loadFailedMessage: () => string;
}): (() => void) | undefined {
  const operationRegistry = studioTeamCommentOperationScopeRegistryRef.current;
  const mutationFlights = studioTeamCommentMutationFlightRef.current;
  const readFlights = studioTeamCommentReadFlightRef.current;
  operationRegistry.abortAll();
  mutationFlights.clear();
  readFlights.clear();
  studioTeamCommentReanchorFlightRef.current.clear();
  studioTeamCommentReanchorQueueRef.current.clear();
  studioTeamCommentLiveTargetSequenceRef.current.clear();
  studioTeamCommentLiveRefreshFlightRef.current.clear();
  const generation = studioTeamCommentsLoadGenerationRef.current + 1;
  studioTeamCommentsLoadGenerationRef.current = generation;
  studioTeamCommentRefreshSessionRef.current = null;
  if (!studioTeamCommentsWorkId) {
    studioTeamCommentsScopeRef.current = null;
    studioTeamCommentActivitySequenceRef.current.clear();
    studioTeamCommentReadSequenceRef.current.clear();
    setStudioTeamCommentsState((current) =>
      current.threads.length === 0 ? current : createEmptyStudioCommentsDocument(),
    );
    setStudioTeamUnreadCommentIds((current) => (current.length === 0 ? current : []));
    setStudioTeamCommentCapabilities(null);
    setStudioCommentSyncError(null);
    setStudioTeamCommentsSyncing(false);
    return undefined;
  }
  if (studioTeamCommentsScopeRef.current !== studioTeamCommentsWorkId) {
    studioTeamCommentsScopeRef.current = studioTeamCommentsWorkId;
    studioTeamCommentActivitySequenceRef.current.clear();
    studioTeamCommentReadSequenceRef.current.clear();
    setStudioTeamCommentsState(createEmptyStudioCommentsDocument());
    setStudioTeamUnreadCommentIds([]);
    setStudioTeamCommentCapabilities(null);
    setStudioCommentSyncError(null);
  }
  const load = async (signal: AbortSignal) => {
    try {
      const commentClient = await loadStudioTeamCommentClient();
      const snapshot = await commentClient.listAllStudioTeamComments(studioTeamCommentsWorkId, signal);
      const projected = commentClient.studioTeamCommentsToLocalDocument(snapshot, {
        unfilteredSnapshotComplete: true,
      });
      if (!projected) throw new Error(projectFailedMessage());
      if (signal.aborted || studioTeamCommentsLoadGenerationRef.current !== generation) return;
      const acceptedSnapshotThreadIds = new Set<string>();
      const acceptedUnreadThreadIds: string[] = [];
      for (const thread of snapshot.items) {
        const incomingSequence = BigInt(thread.latestActivitySequence);
        const currentSequence = studioTeamCommentActivitySequenceRef.current.get(thread.id);
        if (currentSequence !== undefined && incomingSequence < currentSequence) continue;
        acceptedSnapshotThreadIds.add(thread.id);
        studioTeamCommentActivitySequenceRef.current.set(thread.id, incomingSequence);
        const currentReadSequence = studioTeamCommentReadSequenceRef.current.get(thread.id) ?? BigInt(-1);
        if (!thread.unread) {
          studioTeamCommentReadSequenceRef.current.set(
            thread.id,
            incomingSequence > currentReadSequence ? incomingSequence : currentReadSequence,
          );
        } else if (currentReadSequence < incomingSequence) {
          acceptedUnreadThreadIds.push(thread.id);
        }
      }
      setStudioTeamCommentsState((current) => {
        const currentById = new Map(current.threads.map((thread) => [thread.id, thread]));
        const projectedIds = new Set(projected.threads.map((thread) => thread.id));
        return normalizeStudioCommentsDocument({
          version: 1,
          threads: [
            ...projected.threads.map((thread) =>
              acceptedSnapshotThreadIds.has(thread.id) ? thread : currentById.get(thread.id) ?? thread,
            ),
            ...current.threads.filter((thread) => !projectedIds.has(thread.id)),
          ],
        });
      });
      setStudioTeamUnreadCommentIds((current) => [...new Set([
        ...current.filter((threadId) => !acceptedSnapshotThreadIds.has(threadId)),
        ...acceptedUnreadThreadIds,
      ])].sort());
      setStudioTeamCommentCapabilities((current) =>
        current?.view === snapshot.capabilities.view
        && current.comment === snapshot.capabilities.comment
        && current.resolve === snapshot.capabilities.resolve
        && (current.reanchor ?? false) === (snapshot.capabilities.reanchor ?? false)
          ? current
          : snapshot.capabilities,
      );
      setStudioCommentSyncError(null);
    } catch (cause) {
      if (signal.aborted) return;
      setStudioTeamCommentCapabilities(null);
      setStudioCommentSyncError(cause instanceof Error ? cause.message : loadFailedMessage());
    }
  };
  const refreshSession = createStudioTeamCommentRefreshSession({
    load,
    visibilityTarget: globalThis.document,
    onlineTarget: globalThis,
    isOnline: () => globalThis.navigator.onLine !== false,
    onBusyChange: (busy) => {
      if (studioTeamCommentsLoadGenerationRef.current === generation) {
        setStudioTeamCommentsSyncing(busy);
      }
    },
  });
  studioTeamCommentRefreshSessionRef.current = refreshSession;
  return () => {
    operationRegistry.abortAll();
    mutationFlights.clear();
    readFlights.clear();
    if (studioTeamCommentRefreshSessionRef.current === refreshSession) {
      studioTeamCommentRefreshSessionRef.current = null;
    }
    refreshSession.dispose();
  };
}

export async function runStudioApplyCommentsPanelChange({
  value, studioTeamCommentsWorkId, collaborationDocumentLocked,
  studioTeamCommentsLoadGenerationRef, studioTeamCommentsScopeRef, editorMountedRef,
  studioCommentViewDocumentRef, studioLegacyCommentThreadIdSet,
  setStudioComments, setStudioCommentSyncError, executeStudioTeamCommentMutationPlan,
  unsupportedChangeMessage,
}: {
  readonly value: StudioCommentsDocument;
  readonly studioTeamCommentsWorkId: string | null;
  readonly collaborationDocumentLocked: boolean;
  readonly studioTeamCommentsLoadGenerationRef: MutableRefObject<number>;
  readonly studioTeamCommentsScopeRef: MutableRefObject<string | null>;
  readonly editorMountedRef: MutableRefObject<boolean>;
  readonly studioCommentViewDocumentRef: MutableRefObject<StudioCommentsDocument>;
  readonly studioLegacyCommentThreadIdSet: ReadonlySet<string>;
  readonly setStudioComments: (next: StudioCommentsDocument) => boolean;
  readonly setStudioCommentSyncError: Dispatch<SetStateAction<string | null>>;
  readonly executeStudioTeamCommentMutationPlan: (
    plan: StudioTeamCommentMutationPlan,
    scope: { readonly workId: string; readonly generation: number },
  ) => Promise<boolean>;
  readonly unsupportedChangeMessage: string;
}): Promise<boolean> {
  const nextDocument = normalizeStudioCommentsDocument(value);
  if (!studioTeamCommentsWorkId) {
    if (collaborationDocumentLocked) return false;
    if (!setStudioComments(nextDocument)) return false;
    setStudioCommentSyncError(null);
    return true;
  }
  const requestedScope = {
    workId: studioTeamCommentsWorkId,
    generation: studioTeamCommentsLoadGenerationRef.current,
  };
  const { planStudioTeamCommentMutation } = await loadStudioTeamCommentMutationPlanner();
  if (
    studioTeamCommentsScopeRef.current !== requestedScope.workId
    || studioTeamCommentsLoadGenerationRef.current !== requestedScope.generation
    || !editorMountedRef.current
  ) return false;
  const previousMutableDocument = partitionStudioTeamCommentMutableDocument(
    studioCommentViewDocumentRef.current,
    studioLegacyCommentThreadIdSet,
  ).mutableDocument;
  const nextMutableDocument = partitionStudioTeamCommentMutableDocument(
    nextDocument,
    studioLegacyCommentThreadIdSet,
  ).mutableDocument;
  const plan = planStudioTeamCommentMutation(previousMutableDocument, nextMutableDocument);
  if (!plan) throw new Error(unsupportedChangeMessage);
  return executeStudioTeamCommentMutationPlan(plan, requestedScope);
}

export function runStudioCloseCommentThreadPopover({
  reason, setStudioCommentThreadPopoverTarget, setStudioCommentInteractionNotice,
  dispatchStudioCommentThreadSession,
}: {
  readonly reason: Exclude<StudioCommentThreadSessionCloseReason, "thread-disappeared">;
  readonly setStudioCommentThreadPopoverTarget: Dispatch<SetStateAction<StudioCommentThreadPopoverTarget | null>>;
  readonly setStudioCommentInteractionNotice: Dispatch<SetStateAction<string | null>>;
  readonly dispatchStudioCommentThreadSession: Dispatch<StudioCommentThreadSessionEvent>;
}): void {
  setStudioCommentThreadPopoverTarget(null);
  setStudioCommentInteractionNotice(null);
  dispatchStudioCommentThreadSession({
    type: "session.close",
    reason,
    discardDraft: studioCommentThreadSessionCloseDiscardsDraft(reason),
  });
}

export function runStudioNavigateCommentPinCluster({
  direction, studioCommentThreadSessionView, studioCommentThreadSessionThreads,
  setStudioCommentInteractionNotice, dispatchStudioCommentThreadSession,
  markStudioCommentThreadRead,
}: {
  readonly direction: -1 | 1;
  readonly studioCommentThreadSessionView: StudioCommentThreadSessionView;
  readonly studioCommentThreadSessionThreads: readonly StudioCommentThread[];
  readonly setStudioCommentInteractionNotice: Dispatch<SetStateAction<string | null>>;
  readonly dispatchStudioCommentThreadSession: Dispatch<StudioCommentThreadSessionEvent>;
  readonly markStudioCommentThreadRead: (threadId: string) => Promise<boolean>;
}): void {
  const outcome = resolveStudioCommentPinClusterNavigation(studioCommentThreadSessionView, direction);
  if (outcome.kind === "noop") return;
  if (outcome.kind === "blocked-by-draft") {
    setStudioCommentInteractionNotice(outcome.notice);
    return;
  }
  const { nextThread } = outcome;
  dispatchStudioCommentThreadSession({
    type: "thread.select",
    threadId: nextThread.id,
    threads: studioCommentThreadSessionThreads,
    reason: "canvas-pin",
    clusterThreadIds: [...outcome.clusterThreadIds],
  });
  setStudioCommentInteractionNotice(null);
  void markStudioCommentThreadRead(nextThread.id).catch(() => false);
}

export function runStudioSelectCommentEditorTarget({
  target, current, currentStudioProjectSnapshot, currentPageIdRef, setCurrentPageId,
  setMasterEditMode, setPointCommentAnchor, applyGroupSelectionState, setTool, setError,
  pageNotFoundMessage, targetNotFoundMessage,
}: {
  readonly target: StudioEditorCommentTarget;
  readonly current?: () => boolean;
  readonly currentStudioProjectSnapshot: () => StudioProjectSnapshot;
  readonly currentPageIdRef: MutableRefObject<string>;
  readonly setCurrentPageId: (next: string) => boolean;
  readonly setMasterEditMode: Dispatch<SetStateAction<boolean>>;
  readonly setPointCommentAnchor: Dispatch<SetStateAction<{ pageId: string; x: number; y: number } | null>>;
  readonly applyGroupSelectionState: (next: GroupSelectionState) => void;
  readonly setTool: Dispatch<SetStateAction<Tool>>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly pageNotFoundMessage: string;
  readonly targetNotFoundMessage: string;
}): boolean {
  return selectStudioEditorCommentTarget(target, {
    getPages: () => currentStudioProjectSnapshot().pagesList,
    getMasterElements: () => currentStudioProjectSnapshot().master?.elements ?? [],
    getCurrentPageId: () => currentPageIdRef.current,
    changePage: setCurrentPageId,
    applySelection: (selection) => {
      setMasterEditMode(selection.master);
      setPointCommentAnchor(selection.point);
      applyGroupSelectionState({ activeGroupId: null, selectedId: selection.elementId, marqueeIds: [] });
      setTool("select");
      setError(null);
    },
    onMissing: (kind) => setError(kind === "page" ? pageNotFoundMessage : targetNotFoundMessage),
  }, current);
}

export function buildStudioCompanionReviewProjectionInput({
  companionProjectionRevisionRef, studioRevisionProjectGenerationRef, wrapRef,
  effScale, canvasH, selectedId, elementById, studioCommentViewDocument, activePage,
  activePageIndex, masterEditMode, collaborationDocumentLocked, canScopedUndo,
  canScopedRedo, studioHistoryCanUndo, studioHistoryCanRedo, drawingRef,
  hasActivePointerSession, elements, pagesHistoryLength, pagesHi,
  studioTeamUnreadCommentIds, brush, activeCatalogBrushName, strokeWidth,
  brushOpacity, color,
}: {
  readonly companionProjectionRevisionRef: MutableRefObject<number>;
  readonly studioRevisionProjectGenerationRef: MutableRefObject<number>;
  readonly wrapRef: MutableRefObject<HTMLDivElement | null>;
  readonly effScale: number;
  readonly canvasH: number;
  readonly selectedId: string | null;
  readonly elementById: ReadonlyMap<string, El>;
  readonly studioCommentViewDocument: StudioCommentsDocument;
  readonly activePage: PageState;
  readonly activePageIndex: number;
  readonly masterEditMode: boolean;
  readonly collaborationDocumentLocked: boolean;
  readonly canScopedUndo: boolean;
  readonly canScopedRedo: boolean;
  readonly studioHistoryCanUndo: boolean;
  readonly studioHistoryCanRedo: boolean;
  readonly drawingRef: MutableRefObject<unknown>;
  readonly hasActivePointerSession: boolean;
  readonly elements: El[];
  readonly pagesHistoryLength: number;
  readonly pagesHi: number;
  readonly studioTeamUnreadCommentIds: readonly string[];
  readonly brush: string;
  readonly activeCatalogBrushName: string;
  readonly strokeWidth: number;
  readonly brushOpacity: number;
  readonly color: string;
}): StudioToolsCompanionReviewProjectionInput {
  companionProjectionRevisionRef.current = companionProjectionRevisionRef.current >= Number.MAX_SAFE_INTEGER
    ? 0
    : companionProjectionRevisionRef.current + 1;
  const wrap = wrapRef.current;
  const scrollWidth = Math.max(1, wrap?.scrollWidth ?? CANVAS_W * effScale);
  const scrollHeight = Math.max(1, wrap?.scrollHeight ?? canvasH * effScale);
  const selectedElement = selectedId ? elementById.get(selectedId) ?? null : null;
  const companionReviewComments = studioCommentViewDocument.threads;
  return {
    revision: companionProjectionRevisionRef.current,
    documentRevision: studioRevisionProjectGenerationRef.current,
    pageLabel: pageDisplayName(activePage, activePageIndex),
    selectionLabel: selectedElement ? elementLabel(selectedElement) : null,
    canUndo: !masterEditMode && (collaborationDocumentLocked ? canScopedUndo : studioHistoryCanUndo),
    canRedo: !masterEditMode && (collaborationDocumentLocked ? canScopedRedo : studioHistoryCanRedo),
    captureAllowed: drawingRef.current === null && !hasActivePointerSession,
    viewport: {
      x: Math.max(0, Math.min(1, (wrap?.scrollLeft ?? 0) / scrollWidth)),
      y: Math.max(0, Math.min(1, (wrap?.scrollTop ?? 0) / scrollHeight)),
      width: Math.max(0.01, Math.min(1, (wrap?.clientWidth ?? scrollWidth) / scrollWidth)),
      height: Math.max(0.01, Math.min(1, (wrap?.clientHeight ?? scrollHeight) / scrollHeight)),
    },
    selectedLayerId: selectedId,
    layers: elements,
    layerLabel: (layerId: string) => {
      const element = elementById.get(layerId);
      return element ? elementLabel(element) : "이름 없는 레이어";
    },
    historyLength: pagesHistoryLength,
    historyIndex: pagesHi,
    comments: companionReviewComments,
    unreadCommentIds: studioTeamUnreadCommentIds,
    brush: {
      id: brush,
      label: activeCatalogBrushName,
      size: strokeWidth,
      opacity: brushOpacity,
      color,
      choices: BRUSH_PRESETS,
    },
  };
}

export function runStudioCompanionControl({
  control, drawingRef, hasActivePointerSession, wrapRef, activeElementsRef,
  studioCommentViewDocumentRef, companionHistoryHandlerRef, brush,
  setSelectedId, setTool, openStudioCommentThreadInReview, applyBuiltInBrushPreset,
  setStrokeWidth, setBrushOpacity, setColor, activatePrimaryCanvasTool,
}: {
  readonly control: StudioCompanionReviewControl;
  readonly drawingRef: MutableRefObject<unknown>;
  readonly hasActivePointerSession: boolean;
  readonly wrapRef: MutableRefObject<HTMLDivElement | null>;
  readonly activeElementsRef: MutableRefObject<El[]>;
  readonly studioCommentViewDocumentRef: MutableRefObject<StudioCommentsDocument>;
  readonly companionHistoryHandlerRef: MutableRefObject<(action: "undo" | "redo") => void>;
  readonly brush: string;
  readonly setSelectedId: Dispatch<SetStateAction<string | null>>;
  readonly setTool: Dispatch<SetStateAction<Tool>>;
  readonly openStudioCommentThreadInReview: (threadId: string) => void;
  readonly applyBuiltInBrushPreset: (preset: BrushPreset) => void;
  readonly setStrokeWidth: Dispatch<SetStateAction<number>>;
  readonly setBrushOpacity: Dispatch<SetStateAction<number>>;
  readonly setColor: Dispatch<SetStateAction<string>>;
  readonly activatePrimaryCanvasTool: (tool: "select" | "draw", mode?: DrawMode, showToast?: boolean) => void;
}): void {
  switch (control.kind) {
    case "navigate": {
      if (drawingRef.current || hasActivePointerSession) return;
      const wrap = wrapRef.current;
      if (!wrap) return;
      const maximumLeft = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
      const maximumTop = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
      const nextLeft = control.point.x * wrap.scrollWidth - wrap.clientWidth / 2;
      const nextTop = control.point.y * wrap.scrollHeight - wrap.clientHeight / 2;
      wrap.scrollLeft = Math.max(0, Math.min(maximumLeft, nextLeft));
      wrap.scrollTop = Math.max(0, Math.min(maximumTop, nextTop));
      return;
    }
    case "select-layer":
      if (!activeElementsRef.current.some((element) => element.id === control.layerId)) return;
      setSelectedId(control.layerId);
      setTool("select");
      return;
    case "history":
      companionHistoryHandlerRef.current(control.action);
      return;
    case "comment-focus":
      if (!studioCommentViewDocumentRef.current.threads.some((thread) => thread.id === control.threadId)) return;
      openStudioCommentThreadInReview(control.threadId);
      return;
    case "brush": {
      let applied = false;
      let presetApplied = false;
      if (control.patch.id !== undefined) {
        const preset = BRUSH_PRESETS.find((candidate) => candidate.id === control.patch.id);
        if (preset) {
          applyBuiltInBrushPreset(preset);
          applied = true;
          presetApplied = true;
        }
      }
      if (control.patch.size !== undefined) { setStrokeWidth(control.patch.size); applied = true; }
      if (control.patch.opacity !== undefined) { setBrushOpacity(control.patch.opacity); applied = true; }
      if (control.patch.color !== undefined) { setColor(control.patch.color.toLowerCase()); applied = true; }
      if (applied && !presetApplied) {
        activatePrimaryCanvasTool("draw", resolveStudioBrushPresetDrawMode(brush), true);
      }
      return;
    }
    default:
      return;
  }
}

export async function runStudioApplyWriterRoomAiReview({
  writerRoomAiReview, collaborationDocumentLocked, writerRoomAiBusy,
  captureStudioMutationTicket, canApplyStudioMutation,
  setWriterRoomAiBusy, setWriterRoom, setSharedDocumentNotice,
  setWriterRoomAiReview, setWriterRoomAiError, toolsLoadFailedMessage,
}: {
  readonly writerRoomAiReview: {
    readonly stage: StudioWriterRoomStage;
    readonly rationale: string;
    readonly draft: unknown;
    readonly textProvenance: StudioTextAiProvenance;
  } | null;
  readonly collaborationDocumentLocked: boolean;
  readonly writerRoomAiBusy: boolean;
  readonly captureStudioMutationTicket: () => StudioEditorMutationTicket;
  readonly canApplyStudioMutation: (ticket: StudioEditorMutationTicket) => boolean;
  readonly setWriterRoomAiBusy: Dispatch<SetStateAction<boolean>>;
  readonly setWriterRoom: (next: SetStateAction<StudioWriterRoomDocument>) => unknown;
  readonly setSharedDocumentNotice: Dispatch<SetStateAction<string | null>>;
  readonly setWriterRoomAiReview: Dispatch<SetStateAction<{
    stage: StudioWriterRoomStage;
    rationale: string;
    draft: unknown;
    textProvenance: StudioTextAiProvenance;
  } | null>>;
  readonly setWriterRoomAiError: Dispatch<SetStateAction<string | null>>;
  readonly toolsLoadFailedMessage: string;
}): Promise<void> {
  const review = writerRoomAiReview;
  if (!review || collaborationDocumentLocked || writerRoomAiBusy) return;
  const mutationTicket = captureStudioMutationTicket();
  setWriterRoomAiBusy(true);
  try {
    const { replaceStudioWriterRoomStage } = await loadStudioWriterRoomRuntime();
    if (!canApplyStudioMutation(mutationTicket)) return;
    setWriterRoom((current) => replaceStudioWriterRoomStage(current, review.stage, review.draft));
    setSharedDocumentNotice(null);
    setWriterRoomAiReview(null);
    setWriterRoomAiError(null);
  } catch {
    if (canApplyStudioMutation(mutationTicket)) {
      setWriterRoomAiError(toolsLoadFailedMessage);
    }
  } finally {
    if (canApplyStudioMutation(mutationTicket)) setWriterRoomAiBusy(false);
  }
}

export function runStudioApplyWriterRoomCanvasPlan({
  writerRoomCanvasPlan, pages, activePageId, buildAndInsertWriterRoomPages,
  commitPages, setCurrentPageId, setSelectedId, setMarqueeIds,
  setMasterEditMode, setTool, setError, setWriterRoomOpen,
  connectionErrorMessage, safetyCheckFailedMessage,
}: {
  readonly writerRoomCanvasPlan: StudioWriterRoomCanvasProjectionResult | null;
  readonly pages: PageState[];
  readonly activePageId: string;
  readonly buildAndInsertWriterRoomPages: (input: {
    readonly plan: StudioWriterRoomCanvasProjectionResult;
    readonly pages: PageState[];
    readonly activePageId: string;
  }) => { readonly createdPages: PageState[]; readonly nextPages: PageState[] } | null;
  readonly commitPages: (nextPages: PageState[]) => boolean;
  readonly setCurrentPageId: (next: string) => boolean;
  readonly setSelectedId: Dispatch<SetStateAction<string | null>>;
  readonly setMarqueeIds: Dispatch<SetStateAction<string[]>>;
  readonly setMasterEditMode: Dispatch<SetStateAction<boolean>>;
  readonly setTool: Dispatch<SetStateAction<Tool>>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly setWriterRoomOpen: Dispatch<SetStateAction<boolean>>;
  readonly connectionErrorMessage: string;
  readonly safetyCheckFailedMessage: string;
}): void {
  const plan = writerRoomCanvasPlan;
  if (!plan || !plan.applyReadiness.canApply || plan.pageGrouping.pages.length === 0) {
    setError(connectionErrorMessage);
    return;
  }
  try {
    const built = buildAndInsertWriterRoomPages({ plan, pages, activePageId });
    if (!built) return;
    const { createdPages, nextPages } = built;
    if (!commitPages(nextPages)) return;
    const firstCreatedPage = createdPages[0];
    if (!firstCreatedPage) return;
    setCurrentPageId(firstCreatedPage.id);
    setSelectedId(null);
    setMarqueeIds([]);
    setMasterEditMode(false);
    setTool("select");
    setError(null);
    setWriterRoomOpen(false);
  } catch {
    setError(safetyCheckFailedMessage);
  }
}

export function runStudioOpenWorkMetadataStep({
  status, isMobile, mobileSheetAutofocusTargetRef, propsSheetRef, titleInputRef,
  setPendingSaveIntent, setMenu, openInspectorRoute, dismissQuickStart,
}: {
  readonly status: "published" | "draft";
  readonly isMobile: boolean;
  readonly mobileSheetAutofocusTargetRef: MutableRefObject<"default" | "publish-title">;
  readonly propsSheetRef: RefObject<HTMLElement | null>;
  readonly titleInputRef: RefObject<HTMLInputElement | null>;
  readonly setPendingSaveIntent: Dispatch<SetStateAction<"published" | "draft" | null>>;
  readonly setMenu: (next: null) => void;
  readonly openInspectorRoute: (route: StudioInspectorRoute, mobileTarget: "props" | null) => void;
  readonly dismissQuickStart: () => void;
}): void {
  setPendingSaveIntent(status);
  setMenu(null);
  if (isMobile) {
    mobileSheetAutofocusTargetRef.current = "publish-title";
  }
  openInspectorRoute({ primary: "publish" }, isMobile ? "props" : null);
  dismissQuickStart();
  globalThis.requestAnimationFrame(() => {
    propsSheetRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    titleInputRef.current?.focus({ preventScroll: true });
  });
}
