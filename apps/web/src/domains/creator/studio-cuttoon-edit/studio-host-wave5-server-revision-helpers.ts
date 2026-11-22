import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { WorkDetail, WorkRevisionSummary } from "@/platform/creator-client";

import {
  isStudioEditorAsyncScopeCurrent,
  type StudioEditorAsyncScope,
} from "../studio-editor-scope";
import type { PublishContext } from "../StudioPublishContextBanner";

export function runStudioLoadServerRevisionsEffect({
  checkpointPanelOpen, workId, studioAuthUserId, serverCurrentRevision, sharedDocumentRole,
  loggedIn, serverRevisionRequestRef, currentStudioDocumentScopeRef, editorMountedRef,
  setServerRevisions, setServerRevisionError, setServerRevisionLoading, loadFailedMessage,
}: {
  readonly checkpointPanelOpen: boolean;
  readonly workId: string | null;
  readonly studioAuthUserId: string | null;
  readonly serverCurrentRevision: number | null | undefined;
  readonly sharedDocumentRole: string | undefined;
  readonly loggedIn: boolean;
  readonly serverRevisionRequestRef: MutableRefObject<number>;
  readonly currentStudioDocumentScopeRef: MutableRefObject<StudioEditorAsyncScope>;
  readonly editorMountedRef: MutableRefObject<boolean>;
  readonly setServerRevisions: Dispatch<SetStateAction<WorkRevisionSummary[]>>;
  readonly setServerRevisionError: Dispatch<SetStateAction<string | null>>;
  readonly setServerRevisionLoading: Dispatch<SetStateAction<boolean>>;
  readonly loadFailedMessage: () => string;
}): (() => void) | undefined {
  if (!checkpointPanelOpen) return undefined;
  if (!workId || !studioAuthUserId || !serverCurrentRevision || sharedDocumentRole !== "owner" || !loggedIn) {
    setServerRevisions([]);
    setServerRevisionError(null);
    setServerRevisionLoading(false);
    return undefined;
  }
  const controller = new AbortController();
  const requestId = serverRevisionRequestRef.current + 1;
  serverRevisionRequestRef.current = requestId;
  const requestScope = { authScopeKey: studioAuthUserId, workId };
  const requestIsCurrent = () =>
    requestId === serverRevisionRequestRef.current
    && isStudioEditorAsyncScopeCurrent(requestScope, {
      ...currentStudioDocumentScopeRef.current,
      mounted: editorMountedRef.current,
      aborted: controller.signal.aborted,
    });
  setServerRevisionLoading(true);
  setServerRevisionError(null);
  void import("@/platform/creator-client")
    .then(({ listWorkRevisions }) => {
      if (!requestIsCurrent()) return null;
      return listWorkRevisions(workId, 20, controller.signal);
    })
    .then((revisions) => {
      if (revisions && requestIsCurrent()) setServerRevisions(revisions);
    })
    .catch((cause) => {
      if (!requestIsCurrent()) return;
      setServerRevisionError(cause instanceof Error ? cause.message : loadFailedMessage());
    })
    .finally(() => {
      if (editorMountedRef.current && requestId === serverRevisionRequestRef.current) {
        setServerRevisionLoading(false);
      }
    });
  return () => {
    controller.abort();
  };
}

export async function runStudioOpenOwnerFxPanel({
  loadedWork, sharedDocument, workId, studioAuthUserId, fxPanelLoading, ownerDetailAbortRef,
  currentStudioDocumentScopeRef, editorMountedRef, setFxPanelOpen, setFxPanelLoading,
  setLoadedWork, setError, loadFailedMessage,
}: {
  readonly loadedWork: WorkDetail | null;
  readonly sharedDocument: { readonly role: string; readonly revision: number } | null;
  readonly workId: string | null;
  readonly studioAuthUserId: string | null;
  readonly fxPanelLoading: boolean;
  readonly ownerDetailAbortRef: MutableRefObject<AbortController | null>;
  readonly currentStudioDocumentScopeRef: MutableRefObject<StudioEditorAsyncScope>;
  readonly editorMountedRef: MutableRefObject<boolean>;
  readonly setFxPanelOpen: Dispatch<SetStateAction<boolean>>;
  readonly setFxPanelLoading: Dispatch<SetStateAction<boolean>>;
  readonly setLoadedWork: Dispatch<SetStateAction<WorkDetail | null>>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly loadFailedMessage: string;
}): Promise<void> {
  if (loadedWork && !sharedDocument) {
    setFxPanelOpen(true);
    return;
  }
  if (!workId || sharedDocument?.role !== "owner" || !studioAuthUserId || fxPanelLoading) return;
  if (loadedWork?.revision === sharedDocument.revision) {
    setFxPanelOpen(true);
    return;
  }
  ownerDetailAbortRef.current?.abort();
  const controller = new AbortController();
  ownerDetailAbortRef.current = controller;
  const request = { authScopeKey: studioAuthUserId, workId };
  const requestIsCurrent = () =>
    isStudioEditorAsyncScopeCurrent(request, {
      ...currentStudioDocumentScopeRef.current,
      mounted: editorMountedRef.current,
      aborted: controller.signal.aborted,
    });
  setFxPanelLoading(true);
  try {
    const { getWork } = await import("@/platform/creator-client");
    if (!requestIsCurrent()) return;
    const detail = await getWork(workId, controller.signal);
    if (!requestIsCurrent()) return;
    if (detail.revision !== sharedDocument.revision) {
      setError("최신 공동 문서와 애니메이션 연출 데이터의 revision이 달라 다시 불러와야 해요.");
      return;
    }
    setLoadedWork(detail);
    setFxPanelOpen(true);
  } catch (cause) {
    if (requestIsCurrent()) {
      setError(cause instanceof Error ? cause.message : loadFailedMessage);
    }
  } finally {
    if (ownerDetailAbortRef.current === controller) ownerDetailAbortRef.current = null;
    if (requestIsCurrent()) setFxPanelLoading(false);
  }
}

export async function runStudioReloadServerRevisions({
  workId, studioAuthUserId, serverCurrentRevision, sharedDocumentRole, loggedIn,
  serverRevisionRequestRef, serverRevisionAbortRef, currentStudioDocumentScopeRef,
  editorMountedRef, setServerRevisions, setServerRevisionError, setServerRevisionLoading,
  loadFailedMessage,
}: {
  readonly workId: string | null;
  readonly studioAuthUserId: string | null;
  readonly serverCurrentRevision: number | null | undefined;
  readonly sharedDocumentRole: string | undefined;
  readonly loggedIn: boolean;
  readonly serverRevisionRequestRef: MutableRefObject<number>;
  readonly serverRevisionAbortRef: MutableRefObject<AbortController | null>;
  readonly currentStudioDocumentScopeRef: MutableRefObject<StudioEditorAsyncScope>;
  readonly editorMountedRef: MutableRefObject<boolean>;
  readonly setServerRevisions: Dispatch<SetStateAction<WorkRevisionSummary[]>>;
  readonly setServerRevisionError: Dispatch<SetStateAction<string | null>>;
  readonly setServerRevisionLoading: Dispatch<SetStateAction<boolean>>;
  readonly loadFailedMessage: string;
}): Promise<void> {
  if (!workId || !studioAuthUserId || !serverCurrentRevision || sharedDocumentRole !== "owner" || !loggedIn) {
    serverRevisionAbortRef.current?.abort();
    setServerRevisions([]);
    setServerRevisionError(null);
    return;
  }
  const requestId = serverRevisionRequestRef.current + 1;
  serverRevisionRequestRef.current = requestId;
  serverRevisionAbortRef.current?.abort();
  const controller = new AbortController();
  serverRevisionAbortRef.current = controller;
  const requestScope = { authScopeKey: studioAuthUserId, workId };
  const requestIsCurrent = () =>
    requestId === serverRevisionRequestRef.current
    && isStudioEditorAsyncScopeCurrent(requestScope, {
      ...currentStudioDocumentScopeRef.current,
      mounted: editorMountedRef.current,
      aborted: controller.signal.aborted,
    });
  setServerRevisionLoading(true);
  setServerRevisionError(null);
  try {
    const { listWorkRevisions } = await import("@/platform/creator-client");
    if (!requestIsCurrent()) return;
    const revisions = await listWorkRevisions(workId, 20, controller.signal);
    if (requestIsCurrent()) setServerRevisions(revisions);
  } catch (cause) {
    if (!requestIsCurrent()) return;
    setServerRevisionError(cause instanceof Error ? cause.message : loadFailedMessage);
  } finally {
    if (serverRevisionAbortRef.current === controller) serverRevisionAbortRef.current = null;
    if (editorMountedRef.current && requestId === serverRevisionRequestRef.current) {
      setServerRevisionLoading(false);
    }
  }
}

export function runStudioLoadPublishContextEffect({
  publishContextSeriesId, publishContextChallengeId, setPublishContext,
}: {
  readonly publishContextSeriesId?: string | null;
  readonly publishContextChallengeId?: string | null;
  readonly setPublishContext: Dispatch<SetStateAction<PublishContext>>;
}): (() => void) | undefined {
  if (!publishContextSeriesId && !publishContextChallengeId) {
    setPublishContext({});
    return undefined;
  }
  let alive = true;
  const controller = new AbortController();
  async function loadPublishContext() {
    const next: PublishContext = {};
    if (publishContextSeriesId) {
      try {
        const { getSeries } = await import("@/platform/creator-client");
        const series = await getSeries(publishContextSeriesId, controller.signal);
        if (!alive) return;
        const maxEpisode = series.episodeList.reduce(
          (max, episode) => Math.max(max, episode.episodeNo ?? 0),
          0,
        );
        next.series = { id: series.id, title: series.title, nextEpisodeNo: maxEpisode + 1 };
      } catch {
        // 맥락 로드 실패 시 배너만 생략.
      }
    }
    if (publishContextChallengeId) {
      try {
        const { getChallenge } = await import("@/platform/creator-client");
        const challenge = await getChallenge(publishContextChallengeId, controller.signal);
        if (!alive) return;
        next.challenge = { id: challenge.id, title: challenge.title, theme: challenge.theme };
      } catch {
        // 맥락 로드 실패 시 배너만 생략.
      }
    }
    if (alive) setPublishContext(next);
  }
  void loadPublishContext();
  return () => {
    alive = false;
    controller.abort();
  };
}
