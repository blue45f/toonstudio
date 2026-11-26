import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { StudioKonvaEventLike } from "../canvas/studio-stage-handle-types";

import { STUDIO_WORK_ASSET_MAX_ASSETS_PER_WORK } from "@/shared/lib/studio-work-asset-contract";

import { projectStudioFilterMaskSurfacesForRender } from "../filter/studio-filter-mask-surface-projection";
import {
  clearStudioLayerSolo,
  toggleStudioLayerSolo,
  type StudioLayerSoloState,
} from "../layer/studio-layer-solo";
import type { StudioCommentPinClickPayload } from "../live/StudioLiveCanvasOverlay";
import { CANVAS_W } from "../studio-assets";
import type {
  StudioCommentThreadSessionEvent,
  StudioCommentThreadSessionState,
} from "../studio-comment-thread-session";
import type {
  StudioCommentAnchor,
  StudioCommentThread,
  StudioCommentsDocument,
} from "../studio-comments";
import type { DrawEl, El } from "../studio-element-model";
import {
  planGroupClickSelection,
  planGroupEnter,
  type GroupSelectionState,
} from "../studio-group-selection";
import { seekStudioHistoryJournalToPagesDepth } from "../studio-history-journal";
import type { LayerGroup } from "../studio-layers";
import { composeThumbPage, type DocumentMaster } from "../studio-master-page";
import type { StudioPageHistoryJournal } from "../studio-page-editor-types";
import type { PageState } from "../studio-page-state";
import {
  resolveStudioDurableProjectPages,
  type StudioProjectSnapshot,
} from "../studio-project-snapshot";
import {
  projectStudioWorkAssetPageForReadOnlyPreview,
  type StudioWorkAssetRenderPlaceholder,
} from "../studio-work-asset-render-projection";
import { resolveStudioWorkspaceWidePanelToggle } from "../studio-workspace-wide-mode";
import type { StudioCommentThreadPopoverTarget } from "./studio-host-comment-projection-helpers";

export function projectStudioWorkAssetPreviewPage(input: {
  readonly page: PageState;
  readonly master: DocumentMaster<El>;
  readonly workAssetHydrationRevision: number;
  readonly resolveWorkAssetState: Parameters<typeof projectStudioWorkAssetPageForReadOnlyPreview>[0]["resolveState"];
  readonly filterMaskHydrationRevision: number;
  readonly resolveFilterMaskState: Parameters<typeof projectStudioFilterMaskSurfacesForRender<El>>[0]["resolveState"];
}): PageState {
  const projectedPage = projectStudioWorkAssetPageForReadOnlyPreview({
    page: composeThumbPage(input.master, input.page),
    hydrationRevision: input.workAssetHydrationRevision,
    resolveState: input.resolveWorkAssetState,
  });
  const maskProjection = projectStudioFilterMaskSurfacesForRender<El>({
    elements: projectedPage.elements,
    hydrationRevision: input.filterMaskHydrationRevision,
    resolveState: input.resolveFilterMaskState,
  });
  return maskProjection.elements === projectedPage.elements
    ? projectedPage
    : { ...projectedPage, elements: maskProjection.elements };
}

export function deriveStudioWorkAssetRenderPlaceholders(
  limitExceeded: boolean,
  placeholders: StudioWorkAssetRenderPlaceholder[],
): StudioWorkAssetRenderPlaceholder[] {
  return limitExceeded
    ? [{
        assetId: "reference-limit",
        elementType: "image",
        status: "error",
        x: 36,
        y: 36,
        width: CANVAS_W - 72,
        height: 120,
        rotation: 0,
        label: "공동 작업 에셋 참조가 너무 많습니다",
        message: `한 작품에서 동시에 복원할 수 있는 에셋은 ${STUDIO_WORK_ASSET_MAX_ASSETS_PER_WORK}개입니다.`,
      }]
    : placeholders;
}

export function runStudioToggleCanvasWideMode(input: {
  readonly presentationPanelsHiddenRef: MutableRefObject<boolean>;
  readonly leftPanelOpenRef: MutableRefObject<boolean>;
  readonly rightPanelOpenRef: MutableRefObject<boolean>;
  readonly visibleLeftPanelOpenRef: MutableRefObject<boolean>;
  readonly visibleRightPanelOpenRef: MutableRefObject<boolean>;
  readonly canvasWidePanelRestoreRef: MutableRefObject<{ left: boolean; right: boolean }>;
  readonly setLeftPanelOpenWithOverride: (open: boolean, options?: { preserveWideRestore?: boolean }) => void;
  readonly setRightPanelOpenWithOverride: (open: boolean, options?: { preserveWideRestore?: boolean }) => void;
}): void {
  if (input.presentationPanelsHiddenRef.current) return;
  const isWorkspaceWideMode =
    !input.visibleLeftPanelOpenRef.current && !input.visibleRightPanelOpenRef.current;
  const next = resolveStudioWorkspaceWidePanelToggle({
    leftPanelOpen: input.leftPanelOpenRef.current,
    rightPanelOpen: input.rightPanelOpenRef.current,
    visibleLeftPanelOpen: input.visibleLeftPanelOpenRef.current,
    visibleRightPanelOpen: input.visibleRightPanelOpenRef.current,
    presentationPanelsHidden: input.presentationPanelsHiddenRef.current,
  });
  if (isWorkspaceWideMode) {
    const { left: restoreLeft, right: restoreRight } = input.canvasWidePanelRestoreRef.current;
    input.setLeftPanelOpenWithOverride(restoreLeft);
    input.setRightPanelOpenWithOverride(restoreRight);
    return;
  }
  input.canvasWidePanelRestoreRef.current = {
    left: input.leftPanelOpenRef.current,
    right: input.rightPanelOpenRef.current,
  };
  input.setLeftPanelOpenWithOverride(next.leftPanelOpen, { preserveWideRestore: true });
  input.setRightPanelOpenWithOverride(next.rightPanelOpen, { preserveWideRestore: true });
}

export function runStudioSelectElementFromCanvas(input: {
  readonly elementId: string;
  readonly evt?: StudioKonvaEventLike<MouseEvent | TouchEvent>;
  readonly forceGroupEnter: boolean;
  readonly elements: El[];
  readonly groups: LayerGroup[];
  readonly selectedIdRef: MutableRefObject<string | null>;
  readonly marqueeIdsRef: MutableRefObject<string[]>;
  readonly activeGroupIdRef: MutableRefObject<string | null>;
  readonly applyGroupSelectionState: (next: GroupSelectionState) => void;
  readonly announceDrawingShortcut: (message: string) => void;
}): void {
  const nativeEvent = input.evt?.evt as (MouseEvent & Partial<TouchEvent>) | undefined;
  const additive = nativeEvent?.shiftKey === true;
  const current: GroupSelectionState = {
    selectedId: input.selectedIdRef.current,
    marqueeIds: input.marqueeIdsRef.current,
    activeGroupId: input.activeGroupIdRef.current,
  };
  const next =
    input.forceGroupEnter && !additive
      ? planGroupEnter({ items: input.elements, groups: input.groups, clickedId: input.elementId })
      : planGroupClickSelection({
          items: input.elements,
          groups: input.groups,
          clickedId: input.elementId,
          current,
          additive,
        });
  input.applyGroupSelectionState(next);
  if (
    input.forceGroupEnter
    && next.activeGroupId
    && next.activeGroupId !== current.activeGroupId
  ) {
    input.announceDrawingShortcut("그룹 내부 편집 · Esc로 그룹 전체 선택");
  }
}

export function runStudioToggleLocalHidden(input: {
  readonly id: string;
  readonly layerSoloState: StudioLayerSoloState;
  readonly setLayerSoloState: Dispatch<SetStateAction<StudioLayerSoloState>>;
  readonly setLocalHiddenElementIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
}): void {
  if (input.layerSoloState.soloId !== null) {
    const cleared = clearStudioLayerSolo(input.layerSoloState);
    input.setLayerSoloState(cleared.state);
    input.setLocalHiddenElementIds(() => {
      const next = new Set(cleared.localHiddenIds);
      if (next.has(input.id)) next.delete(input.id);
      else next.add(input.id);
      return next;
    });
    return;
  }
  input.setLocalHiddenElementIds((prev) => {
    const next = new Set(prev);
    if (next.has(input.id)) next.delete(input.id);
    else next.add(input.id);
    return next;
  });
}

export function runStudioToggleLayerSolo(input: {
  readonly id: string;
  readonly elements: readonly El[];
  readonly layerSoloState: StudioLayerSoloState;
  readonly localHiddenElementIds: ReadonlySet<string>;
  readonly setLayerSoloState: Dispatch<SetStateAction<StudioLayerSoloState>>;
  readonly setLocalHiddenElementIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
  readonly announceDrawingShortcut: (message: string) => void;
}): void {
  const result = toggleStudioLayerSolo({
    state: input.layerSoloState,
    targetId: input.id,
    allItemIds: input.elements.map((element) => element.id),
    currentLocalHidden: input.localHiddenElementIds,
  });
  input.setLayerSoloState(result.state);
  input.setLocalHiddenElementIds(result.localHiddenIds);
  input.announceDrawingShortcut(
    result.state.soloId ? "레이어 솔로 · 이 레이어만 표시" : "레이어 솔로 해제",
  );
}

export function runStudioOpenCommentThreadPopover(input: {
  readonly payload: StudioCommentPinClickPayload;
  readonly selection: { readonly selected: StudioCommentThread; readonly cluster: readonly StudioCommentThread[] } | null;
  readonly sessionRef: MutableRefObject<StudioCommentThreadSessionState>;
  readonly documentRef: MutableRefObject<StudioCommentsDocument>;
  readonly unreadThreadIds: ReadonlySet<string>;
  readonly refreshComments: () => void;
  readonly announceDrawingShortcut: (message: string) => void;
  readonly setInteractionNotice: (notice: string | null) => void;
  readonly preloadPopover: () => void;
  readonly stopPlacementSession: () => void;
  readonly clearPointComposer: () => void;
  readonly closeSidePanels: () => void;
  readonly selectAnchor: (anchor: StudioCommentAnchor) => void;
  readonly setPopoverTarget: (target: StudioCommentThreadPopoverTarget | null) => void;
  readonly dispatchSession: (event: StudioCommentThreadSessionEvent) => void;
  readonly markRead: (threadId: string) => Promise<boolean>;
}): void {
  if (!input.selection) {
    input.refreshComments();
    input.announceDrawingShortcut("댓글 위치가 변경되어 목록을 다시 확인합니다");
    return;
  }
  const currentDraft = input.sessionRef.current.draft;
  if (
    currentDraft?.body.trim()
    && !input.selection.cluster.some((thread) => thread.id === currentDraft.threadId)
  ) {
    input.setInteractionNotice("작성 중인 빠른 답글이 있어요. 기존 핀에서 등록하거나 내용을 비운 뒤 다른 핀을 열어 주세요.");
    input.announceDrawingShortcut("작성 중인 답글을 먼저 확인하세요");
    return;
  }
  const triggerBounds = input.payload.trigger.getBoundingClientRect();
  const screenPoint = {
    x: triggerBounds.left + triggerBounds.width / 2,
    y: triggerBounds.top + triggerBounds.height / 2,
  };
  input.preloadPopover();
  input.setInteractionNotice(null);
  input.stopPlacementSession();
  input.clearPointComposer();
  input.closeSidePanels();
  input.selectAnchor(input.payload.anchor);
  input.setPopoverTarget({
    pinKey: input.payload.pinKey,
    anchor: input.payload.anchor,
    screenPoint,
    anchorElement: input.payload.trigger,
  });
  input.dispatchSession({
    type: "session.open",
    surface: "pin-quick-reply",
    reason: "canvas-pin",
    threads: input.documentRef.current.threads.filter((thread) => !thread.resolved),
    preferredThreadId: input.selection.selected.id,
    unreadThreadIds: input.unreadThreadIds,
    clusterThreadIds: input.selection.cluster.map((thread) => thread.id),
  });
  void input.markRead(input.selection.selected.id).catch(() => false);
}

export function runStudioOpenCommentThreadInReview(input: {
  readonly threadId: string;
  readonly documentRef: MutableRefObject<StudioCommentsDocument>;
  readonly unreadThreadIds: ReadonlySet<string>;
  readonly setPopoverTarget: (target: StudioCommentThreadPopoverTarget | null) => void;
  readonly setInteractionNotice: (notice: string | null) => void;
  readonly dispatchSession: (event: StudioCommentThreadSessionEvent) => void;
  readonly requestFocus: (threadId: string) => void;
  readonly openInbox: () => void;
  readonly markRead: (threadId: string) => Promise<boolean>;
}): void {
  input.setPopoverTarget(null);
  input.setInteractionNotice(null);
  input.dispatchSession({
    type: "session.open",
    surface: "review-panel",
    reason: "review-panel",
    threads: input.documentRef.current.threads,
    preferredThreadId: input.threadId,
    unreadThreadIds: input.unreadThreadIds,
  });
  input.requestFocus(input.threadId);
  input.openInbox();
  void input.markRead(input.threadId).catch(() => false);
}

export function runStudioSelectCommentSharedReplyThread(input: {
  readonly threadId: string;
  readonly sessionRef: MutableRefObject<StudioCommentThreadSessionState>;
  readonly documentRef: MutableRefObject<StudioCommentsDocument>;
  readonly unreadThreadIds: ReadonlySet<string>;
  readonly setInteractionNotice: (notice: string | null) => void;
  readonly requestFocus: (threadId: string) => void;
  readonly dispatchSession: (event: StudioCommentThreadSessionEvent) => void;
  readonly markRead: (threadId: string) => Promise<boolean>;
}): void {
  const currentDraft = input.sessionRef.current.draft;
  if (currentDraft?.body.trim() && currentDraft.threadId !== input.threadId) {
    input.setInteractionNotice("다른 댓글에 작성 중인 답글이 있어요. 기존 초안을 등록하거나 내용을 비운 뒤 이동해 주세요.");
    input.requestFocus(currentDraft.threadId);
    return;
  }
  input.setInteractionNotice(null);
  input.dispatchSession({
    type: "session.open",
    surface: "review-panel",
    reason: "focus-request",
    threads: input.documentRef.current.threads,
    preferredThreadId: input.threadId,
    unreadThreadIds: input.unreadThreadIds,
  });
  void input.markRead(input.threadId).catch(() => false);
}

export function runStudioJumpToHistoryIndex(input: {
  readonly index: number;
  readonly masterEditMode: boolean;
  readonly collaborationDocumentLocked: boolean;
  readonly advancedFillRunIdRef: MutableRefObject<number>;
  readonly advancedFillAbortRef: MutableRefObject<AbortController | null>;
  readonly clearAdvancedFillState: () => void;
  readonly pages: PageState[];
  readonly pagesHistory: PageState[][];
  readonly pagesHi: number;
  readonly publishCrdtHistoryTransition: (fromPages: PageState[], toPages: PageState[]) => boolean;
  readonly rebaseHistoryJournal: (pages: PageState[], historyIndex: number) => void;
  readonly historyJournalRef: MutableRefObject<StudioPageHistoryJournal>;
  readonly commitHistoryJournal: (journal: StudioPageHistoryJournal) => void;
  readonly setPagesHi: (index: number) => void;
}): void {
  if (input.masterEditMode || input.collaborationDocumentLocked) return;
  input.advancedFillRunIdRef.current += 1;
  input.advancedFillAbortRef.current?.abort();
  input.advancedFillAbortRef.current = null;
  input.clearAdvancedFillState();
  const nextIndex = Math.max(0, Math.min(input.pagesHistory.length - 1, input.index));
  const nextSnapshot = input.pagesHistory[nextIndex];
  if (nextSnapshot && !input.publishCrdtHistoryTransition(input.pages, nextSnapshot)) return;
  if (nextIndex !== input.pagesHi && nextSnapshot) {
    input.rebaseHistoryJournal(nextSnapshot, nextIndex);
  }
  input.commitHistoryJournal(
    seekStudioHistoryJournalToPagesDepth(input.historyJournalRef.current, nextIndex),
  );
  input.setPagesHi(nextIndex);
}

export function buildStudioCurrentProjectSnapshot(input: {
  readonly pendingStrokeCommits?: { readonly pageId: string; readonly strokes: readonly DrawEl[] } | null;
  readonly recoveredMasterStroke?: DrawEl | null;
  readonly defaultPendingStrokeCommits: { readonly pageId: string; readonly strokes: readonly DrawEl[] } | null;
  readonly pagesHistory: PageState[][];
  readonly historyIndex: number;
  readonly fallbackPages: PageState[];
  readonly isPendingStrokeDurable: (stroke: DrawEl) => boolean;
  readonly buildSnapshot: (
    pages: PageState[],
    savedAt: string,
    recoveredMasterStroke?: DrawEl | null,
  ) => StudioProjectSnapshot;
}): StudioProjectSnapshot {
  const pendingBatch = input.pendingStrokeCommits === undefined
    ? input.defaultPendingStrokeCommits
    : input.pendingStrokeCommits;
  const durablePages = resolveStudioDurableProjectPages({
    pagesHistory: input.pagesHistory,
    historyIndex: input.historyIndex,
    fallbackPages: input.fallbackPages,
    pendingStrokeCommits: pendingBatch,
    isPendingStrokeDurable: input.isPendingStrokeDurable,
  }).pagesList as PageState[];
  return input.buildSnapshot(durablePages, new Date().toISOString(), input.recoveredMasterStroke);
}
