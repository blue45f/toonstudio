import type { MutableRefObject } from "react";

import { compareStudioCommentThreadActivity } from "../studio-cuttoon-editor-host-helpers";
import type { StudioCommentPinClickPayload } from "../live/StudioLiveCanvasOverlay";
import { projectStudioCanvasCommentPins } from "../live/studio-live-canvas-overlay-model";
import { hostErrorText } from "../status-i18n/studio-host-reason-i18n";
import {
  studioCommentThreadSessionDraftBlocksResolutionChange,
  studioCommentThreadSessionMutationId,
  type StudioCommentThreadSessionCloseReason,
  type StudioCommentThreadSessionEvent,
  type StudioCommentThreadSessionMutationPlan,
  type StudioCommentThreadSessionState,
  type StudioCommentThreadSessionView,
} from "../studio-comment-thread-session";
import {
  addStudioCommentReply,
  addStudioCommentThread,
  createStudioCommentMessageId,
  reopenStudioCommentThread,
  resolveStudioCommentThread,
  studioCommentAnchorsEqual,
  type StudioCommentActor,
  type StudioCommentAnchor,
  type StudioCommentThread,
  type StudioCommentsDocument,
} from "../studio-comments";
import type { El } from "../studio-element-model";
import { elBounds } from "../studio-element-geometry";
import { elementLabel } from "../studio-element-label";
import { loadStudioTeamCommentMutationPlanner } from "../studio-page-lazy-ui";
import { pageDisplayName } from "../studio-page-meta";
import type { PageState } from "../studio-page-state";
import type { StudioTeamCommentCapabilities } from "../studio-team-comment-client";
import type { StudioTeamCommentMutationPlan } from "../studio-team-comment-mutation-plan";

export interface StudioCommentAnchorOption {
  readonly anchor: StudioCommentAnchor;
  readonly label: string;
}

export interface StudioPointCommentAnchorInput {
  readonly pageId: string;
  readonly x: number;
  readonly y: number;
}

export interface StudioCommentThreadPopoverTarget {
  readonly pinKey: string;
  readonly anchor: StudioCommentAnchor;
  readonly screenPoint: { readonly x: number; readonly y: number };
  readonly anchorElement: HTMLButtonElement;
}

export interface StudioCommentBoundsRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function applyLocalStudioCommentMutationPlan(
  current: StudioCommentsDocument,
  plan: StudioTeamCommentMutationPlan,
  actor: StudioCommentActor,
  now = new Date(),
): StudioCommentsDocument {
  if (plan.kind === "create") {
    return addStudioCommentThread(
      current,
      {
        id: plan.mutationId,
        anchor: plan.anchor,
        author: actor,
        body: plan.body,
        mentions: plan.mentions,
      },
      now,
    );
  }
  if (plan.kind === "reply") {
    return addStudioCommentReply(
      current,
      plan.threadId,
      {
        id: plan.mutationId,
        author: actor,
        body: plan.body,
        mentions: plan.mentions,
      },
      now,
    );
  }
  if (plan.kind === "resolve") {
    return resolveStudioCommentThread(current, plan.threadId, actor, now);
  }
  return reopenStudioCommentThread(current, plan.threadId, now);
}

export function deriveStudioActiveCommentAnchor(input: {
  readonly masterEditMode: boolean;
  readonly selected: El | null;
  readonly activePageId: string;
  readonly pointCommentAnchor: StudioPointCommentAnchorInput | null;
}): StudioCommentAnchor {
  if (!input.masterEditMode && input.selected?.type === "frame") {
    return { type: "frame", pageId: input.activePageId, frameId: input.selected.id };
  }
  if (!input.masterEditMode && input.selected) {
    return { type: "element", pageId: input.activePageId, elementId: input.selected.id };
  }
  if (
    input.pointCommentAnchor
    && input.pointCommentAnchor.pageId === input.activePageId
    && !input.masterEditMode
  ) {
    return { type: "point", ...input.pointCommentAnchor };
  }
  return { type: "page", pageId: input.activePageId };
}

export function deriveStudioCommentAnchorOptions(input: {
  readonly pages: readonly PageState[];
  readonly masterEditMode: boolean;
  readonly selected: El | null;
  readonly pointCommentAnchor: StudioPointCommentAnchorInput | null;
  readonly activePage: PageState;
  readonly activePageIndex: number;
}): StudioCommentAnchorOption[] {
  const all = input.pages.flatMap((page, pageIndex) => {
    const options: StudioCommentAnchorOption[] = [
      { anchor: { type: "page", pageId: page.id }, label: pageDisplayName(page, pageIndex) },
    ];
    let frameIndex = 0;
    for (const element of page.elements) {
      if (element.type !== "frame") continue;
      frameIndex += 1;
      options.push({
        anchor: { type: "frame", pageId: page.id, frameId: element.id },
        label: `${pageDisplayName(page, pageIndex)} · 컷 ${frameIndex}${
          element.storyBeat?.summary ? ` — ${element.storyBeat.summary.slice(0, 32)}` : ""
        }`,
      });
    }
    return options;
  });
  if (!input.masterEditMode && input.selected && input.selected.type !== "frame") {
    all.push({
      anchor: { type: "element", pageId: input.activePage.id, elementId: input.selected.id },
      label: `${pageDisplayName(input.activePage, input.activePageIndex)} · ${elementLabel(input.selected)}`,
    });
  }
  if (
    input.pointCommentAnchor
    && input.pointCommentAnchor.pageId === input.activePage.id
    && !input.masterEditMode
  ) {
    all.push({
      anchor: { type: "point", ...input.pointCommentAnchor },
      label: `${pageDisplayName(input.activePage, input.activePageIndex)} · 위치 ${Math.round(input.pointCommentAnchor.x * 100)}%, ${Math.round(input.pointCommentAnchor.y * 100)}%`,
    });
  }
  return all;
}

export function deriveStudioOpenCanvasCommentThreads(input: {
  readonly studioCommentPinsHidden: boolean;
  readonly studioTeamCommentsWorkId: string | null;
  readonly teamCanView: boolean | undefined;
  readonly expectsSharedDocument: boolean;
  readonly sharedCanView: boolean | undefined;
  readonly masterEditMode: boolean;
  readonly threads: readonly StudioCommentThread[];
  readonly activePageId: string;
}): StudioCommentThread[] {
  if (
    input.studioCommentPinsHidden
    || (input.studioTeamCommentsWorkId
      ? input.teamCanView !== true
      : input.expectsSharedDocument && !input.sharedCanView)
    || input.masterEditMode
  ) {
    return [];
  }
  return input.threads.filter(
    (thread) =>
      !thread.resolved
      && thread.anchor.type !== "pdf-page"
      && thread.anchor.type !== "compare-image"
      && thread.anchor.pageId === input.activePageId,
  );
}

export function deriveStudioCanvasCommentBounds(
  openThreads: readonly StudioCommentThread[],
  pageElements: readonly El[],
): Map<string, StudioCommentBoundsRect> {
  const targetIds = new Set(
    openThreads.flatMap((thread) =>
      thread.anchor.type === "frame"
        ? [thread.anchor.frameId]
        : thread.anchor.type === "element"
          ? [thread.anchor.elementId]
          : [],
    ),
  );
  const bounds = new Map<string, StudioCommentBoundsRect>();
  if (targetIds.size > 0) {
    for (const element of pageElements) {
      if (!targetIds.has(element.id)) continue;
      const b = elBounds(element);
      bounds.set(element.id, { x: b.x, y: b.y, width: b.w, height: b.h });
    }
  }
  return bounds;
}

export function fallbackLabelForStudioCommentAnchor(anchor: StudioCommentAnchor): string {
  if (anchor.type === "page") return "페이지 댓글";
  if (anchor.type === "frame") return "컷 댓글";
  if (anchor.type === "point") return "위치 댓글";
  if (anchor.type === "pdf-page") return "PDF 페이지 댓글";
  return "요소 댓글";
}

export function deriveStudioCanvasCommentPins(input: {
  readonly openThreads: readonly StudioCommentThread[];
  readonly pageId: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly boundsByElementId: ReadonlyMap<string, StudioCommentBoundsRect>;
  readonly unreadThreadIds: ReadonlySet<string>;
  readonly anchorOptions: readonly StudioCommentAnchorOption[];
}) {
  if (input.openThreads.length === 0) return [];
  return projectStudioCanvasCommentPins({
    threads: input.openThreads,
    pageId: input.pageId,
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight,
    boundsByElementId: input.boundsByElementId,
    unreadThreadIds: input.unreadThreadIds,
    labelForAnchor: (anchor) =>
      input.anchorOptions.find((option) =>
        studioCommentAnchorsEqual(option.anchor, anchor),
      )?.label ?? fallbackLabelForStudioCommentAnchor(anchor),
  });
}

export function deriveStudioCommentPinReanchorableIds(input: {
  readonly openThreads: readonly StudioCommentThread[];
  readonly studioTeamCommentsWorkId: string | null;
  readonly collaborationDocumentLocked: boolean;
  readonly legacyThreadIds: ReadonlySet<string>;
  readonly teamCanReanchor: boolean | undefined;
  readonly authUserId: string | null | undefined;
}): Set<string> {
  const threadIds = new Set<string>();
  for (const thread of input.openThreads) {
    if (thread.anchor.type !== "point") continue;
    if (!input.studioTeamCommentsWorkId) {
      if (!input.collaborationDocumentLocked) threadIds.add(thread.id);
      continue;
    }
    if (input.legacyThreadIds.has(thread.id)) continue;
    if (
      input.teamCanReanchor === true
      || (input.authUserId && thread.author.id === input.authUserId)
    ) {
      threadIds.add(thread.id);
    }
  }
  return threadIds;
}

export function deriveStudioCommentPinReanchorDisabledReason(input: {
  readonly studioTeamCommentsWorkId: string | null;
  readonly capabilities: StudioTeamCommentCapabilities | null;
  readonly collaborationDocumentLocked: boolean;
  readonly translate: (key: string, fallback: string) => string;
}): string | undefined {
  if (input.studioTeamCommentsWorkId) {
    return input.capabilities === null
      ? input.translate("studio.hostReason.commentPinCheckingPermission", "팀 댓글 권한을 확인하고 있어요.")
      : input.translate("studio.hostReason.commentPinOwnOnly", "자신이 작성한 핀만 옮길 수 있어요.");
  }
  if (input.collaborationDocumentLocked) {
    return input.translate("studio.hostReason.commentPinReadOnly", "읽기 전용 원고에서는 위치를 변경할 수 없어요.");
  }
  return undefined;
}

export function selectStudioCommentPinThreadFromDocument(input: {
  readonly payload: StudioCommentPinClickPayload;
  readonly threads: readonly StudioCommentThread[];
  readonly teamScopeWorkId: string | null;
  readonly legacyThreadIds: ReadonlySet<string>;
  readonly unreadThreadIds: ReadonlySet<string>;
  readonly currentDraft: StudioCommentThreadSessionState["draft"];
}): { selected: StudioCommentThread; cluster: StudioCommentThread[] } | null {
  const payloadThreadIds = new Set(input.payload.threadIds);
  const candidates = input.threads.filter((thread) =>
    payloadThreadIds.has(thread.id)
    && !thread.resolved
    && studioCommentAnchorsEqual(thread.anchor, input.payload.anchor),
  );
  if (candidates.length === 0) return null;
  const mutableCandidates = input.teamScopeWorkId
    ? candidates.filter((thread) => !input.legacyThreadIds.has(thread.id))
    : candidates;
  const cluster = (mutableCandidates.length > 0 ? mutableCandidates : candidates)
    .sort((left, right) => {
      const unreadDifference = Number(input.unreadThreadIds.has(right.id))
        - Number(input.unreadThreadIds.has(left.id));
      return unreadDifference || compareStudioCommentThreadActivity(left, right);
    });
  const selected = input.currentDraft?.body.trim()
    ? cluster.find((thread) => thread.id === input.currentDraft?.threadId) ?? cluster[0]
    : cluster[0];
  return selected ? { selected, cluster } : null;
}

export interface SubmitStudioCommentThreadReplyInput {
  readonly threadId: string;
  readonly body: string;
  readonly sessionRef: MutableRefObject<StudioCommentThreadSessionState>;
  readonly documentRef: MutableRefObject<StudioCommentsDocument>;
  readonly actor: StudioCommentActor;
  readonly dispatch: (event: StudioCommentThreadSessionEvent) => void;
  readonly executeMutationPlan: (plan: StudioTeamCommentMutationPlan) => Promise<boolean>;
}

export async function runSubmitStudioCommentThreadReply(
  input: SubmitStudioCommentThreadReplyInput,
): Promise<boolean> {
  const session = input.sessionRef.current;
  if (session.selectedThreadId !== input.threadId) return false;
  const mutationId = session.draft?.threadId === input.threadId
    && session.draft.body.trim() === input.body.trim()
    && session.draft.mutationId
    ? session.draft.mutationId
    : createStudioCommentMessageId("reply");
  const trimmedBody = input.body.trim();
  const { planStudioTeamCommentReplyMentions } = await loadStudioTeamCommentMutationPlanner();
  if (input.sessionRef.current.selectedThreadId !== input.threadId) return false;
  const plan: StudioCommentThreadSessionMutationPlan = {
    kind: "reply",
    mutationId,
    threadId: input.threadId,
    body: trimmedBody,
    mentions: planStudioTeamCommentReplyMentions(
      trimmedBody,
      input.documentRef.current,
      input.actor,
    ),
  };
  input.dispatch({ type: "mutation.start", plan });
  try {
    const accepted = await input.executeMutationPlan(plan);
    if (!accepted) {
      input.dispatch({ type: "mutation.failure", mutationId });
      return false;
    }
    input.dispatch({ type: "mutation.receipt", plan });
    return true;
  } catch (cause) {
    input.dispatch({ type: "mutation.failure", mutationId });
    throw cause;
  }
}

export interface ChangeStudioCommentThreadResolutionInput {
  readonly threadId: string;
  readonly resolved: boolean;
  readonly sessionRef: MutableRefObject<StudioCommentThreadSessionState>;
  readonly dispatch: (event: StudioCommentThreadSessionEvent) => void;
  readonly executeMutationPlan: (plan: StudioTeamCommentMutationPlan) => Promise<boolean>;
  readonly closePopover: (reason: Exclude<StudioCommentThreadSessionCloseReason, "thread-disappeared">) => void;
}

export async function runChangeStudioCommentThreadResolution(
  input: ChangeStudioCommentThreadResolutionInput,
): Promise<boolean> {
  const session = input.sessionRef.current;
  if (session.selectedThreadId !== input.threadId) return false;
  if (studioCommentThreadSessionDraftBlocksResolutionChange(session, input.threadId, input.resolved)) {
    throw new Error(
      hostErrorText(
        "studio.hostError.commentReplyDraftBlocksResolution",
        "작성 중인 답글을 등록하거나 내용을 비운 뒤 해결 상태를 변경해 주세요.",
      ),
    );
  }
  const plan = input.resolved
    ? { kind: "resolve" as const, threadId: input.threadId }
    : { kind: "reopen" as const, threadId: input.threadId };
  const operationId = createStudioCommentMessageId("reply");
  const mutationId = studioCommentThreadSessionMutationId(plan, operationId);
  input.dispatch({ type: "mutation.start", plan, operationId });
  try {
    const accepted = await input.executeMutationPlan(plan);
    if (!accepted) {
      input.dispatch({ type: "mutation.failure", mutationId });
      return false;
    }
    input.dispatch({ type: "mutation.receipt", plan, operationId });
    if (input.resolved) input.closePopover("explicit");
    return true;
  } catch (cause) {
    input.dispatch({ type: "mutation.failure", mutationId });
    throw cause;
  }
}

export type StudioCommentClusterNavigationOutcome =
  | { readonly kind: "noop" }
  | { readonly kind: "blocked-by-draft"; readonly notice: string }
  | {
      readonly kind: "select";
      readonly nextThread: StudioCommentThread;
      readonly clusterThreadIds: readonly string[];
    };

export function resolveStudioCommentPinClusterNavigation(
  view: StudioCommentThreadSessionView,
  direction: -1 | 1,
): StudioCommentClusterNavigationOutcome {
  if (view.clusterThreads.length < 2 || view.selectedClusterIndex < 0) {
    return { kind: "noop" };
  }
  if (view.selectedDraft?.body.trim()) {
    return {
      kind: "blocked-by-draft",
      notice: "작성 중인 답글을 등록하거나 내용을 비운 뒤 다른 댓글로 이동해 주세요.",
    };
  }
  const nextIndex =
    (view.selectedClusterIndex + direction + view.clusterThreads.length)
    % view.clusterThreads.length;
  const nextThread = view.clusterThreads[nextIndex];
  if (!nextThread) return { kind: "noop" };
  return {
    kind: "select",
    nextThread,
    clusterThreadIds: view.clusterThreads.map((thread) => thread.id),
  };
}
