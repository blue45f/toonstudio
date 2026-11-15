import type { StudioReviewSession } from "./studio-review-workflow";

export interface StudioReviewHistoryDocument {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly sessions: readonly StudioReviewSession[];
  readonly updatedAt: string;
}

export interface StudioReviewHistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function keyFor(projectId: string): string {
  const normalized = projectId.trim();
  if (!normalized || normalized === "." || normalized === ".." || normalized.includes("\\")) {
    throw new Error("A valid project id is required.");
  }
  return `toonstudio:review-history:v1:${encodeURIComponent(normalized)}`;
}

function isSession(value: unknown): value is StudioReviewSession {
  if (typeof value !== "object" || value === null) return false;
  const session = value as Partial<StudioReviewSession>;
  return typeof session.documentId === "string"
    && typeof session.versionId === "string"
    && typeof session.status === "string"
    && Array.isArray(session.requiredReviewerIds)
    && Array.isArray(session.threads)
    && Array.isArray(session.decisions)
    && typeof session.updatedAt === "string"
    && Number.isFinite(Date.parse(session.updatedAt));
}

export function readStudioReviewHistory(
  storage: StudioReviewHistoryStorage,
  projectId: string,
): StudioReviewHistoryDocument {
  const raw = storage.getItem(keyFor(projectId));
  if (raw) {
    try {
      const value = JSON.parse(raw) as Partial<StudioReviewHistoryDocument>;
      if (value.schemaVersion === 1
        && value.projectId === projectId
        && Array.isArray(value.sessions)
        && value.sessions.every(isSession)
        && typeof value.updatedAt === "string") {
        return Object.freeze({
          schemaVersion: 1,
          projectId,
          sessions: Object.freeze([...value.sessions]),
          updatedAt: value.updatedAt,
        });
      }
    } catch {
      // Corrupt review archives never replace the active project review session.
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    projectId,
    sessions: Object.freeze([]),
    updatedAt: new Date(0).toISOString(),
  });
}

const REVIEW_HISTORY_SYNC_CHANNEL = "toonstudio-review-history-sync-v1";

function notifyStudioReviewHistorySync(projectId: string, updatedAt: string): void {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(REVIEW_HISTORY_SYNC_CHANNEL);
      channel.postMessage({ projectId, updatedAt });
      channel.close();
    }
  } catch {
    // 교차 탭 채널 미지원 환경에서도 동일 저장소 읽기 일관성은 유지된다.
  }
}

export function subscribeStudioReviewHistorySync(
  projectId: string,
  onSync: () => void,
): () => void {
  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(REVIEW_HISTORY_SYNC_CHANNEL);
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const data = event.data;
        if (data && typeof data === "object" && "projectId" in data && data.projectId === projectId) {
          onSync();
        }
      };
    }
  } catch {
    channel = null;
  }
  return () => {
    channel?.close();
  };
}

function isCanonicalRevisionVersionId(versionId: string): boolean {
  return !versionId.includes("-snap-") && !versionId.includes("-backup-");
}

export function findLatestActiveStudioReviewSession(
  history: StudioReviewHistoryDocument,
  documentId?: string,
): StudioReviewSession | null {
  for (let index = history.sessions.length - 1; index >= 0; index -= 1) {
    const candidate = history.sessions[index]!;
    if (documentId && candidate.documentId !== documentId) continue;
    if (!isCanonicalRevisionVersionId(candidate.versionId)) continue;
    if (candidate.status === "superseded") continue;
    return candidate;
  }
  return null;
}

/** Store an immutable review version once, keyed by document and version identity. */
export function archiveStudioReviewSession(
  storage: StudioReviewHistoryStorage,
  projectId: string,
  session: StudioReviewSession,
): StudioReviewHistoryDocument {
  const current = readStudioReviewHistory(storage, projectId);
  const existing = current.sessions.find(
    (candidate) => candidate.documentId === session.documentId && candidate.versionId === session.versionId,
  ) ?? null;
  const newerHead = findLatestActiveStudioReviewSession(current, session.documentId);
  const wasAlreadySuperseded =
    session.status !== "superseded"
    && isCanonicalRevisionVersionId(session.versionId)
    && Boolean(
      existing?.status === "superseded"
      || (newerHead
        && newerHead.versionId !== session.versionId
        && (newerHead.basedOnVersionId === session.versionId
          || (existing && Date.parse(newerHead.updatedAt) > Date.parse(existing.updatedAt)))),
    );

  const normalizedSession: StudioReviewSession = wasAlreadySuperseded
    ? Object.freeze({
        ...session,
        status: "superseded",
        approvedAt: null,
        updatedAt: existing?.updatedAt ?? session.updatedAt,
      })
    : session;

  const existingIndex = current.sessions.findIndex(
    (candidate) =>
      candidate.documentId === normalizedSession.documentId
      && candidate.versionId === normalizedSession.versionId,
  );
  const rawSessions =
    wasAlreadySuperseded && existingIndex >= 0
      ? current.sessions.map((candidate, idx) => (idx === existingIndex ? normalizedSession : candidate))
      : [
          ...current.sessions.filter((candidate) => !(
            candidate.documentId === normalizedSession.documentId
            && candidate.versionId === normalizedSession.versionId
          )),
          normalizedSession,
        ];
  const sessions = [...rawSessions].sort((a, b) => {
    const byTime = a.updatedAt.localeCompare(b.updatedAt);
    if (byTime !== 0) return byTime;
    if (b.basedOnVersionId === a.versionId) return -1;
    if (a.basedOnVersionId === b.versionId) return 1;
    if (a.status === "superseded" && b.status !== "superseded") return -1;
    if (a.status !== "superseded" && b.status === "superseded") return 1;
    return 0;
  });
  const updatedAt = new Date().toISOString();
  const next = Object.freeze({
    schemaVersion: 1 as const,
    projectId,
    sessions: Object.freeze(sessions),
    updatedAt,
  });
  storage.setItem(keyFor(projectId), JSON.stringify(next));
  notifyStudioReviewHistorySync(projectId, updatedAt);
  return next;
}

export interface ConcurrentStudioReviewMutationResult {
  readonly outcome: "applied-latest" | "stale-superseded";
  readonly latestHead: StudioReviewSession;
  readonly archivedStaleSession: StudioReviewSession | null;
  readonly history: StudioReviewHistoryDocument;
}

/**
 * 서로 다른 리비전에서 동시에 검수 상태가 바뀔 때, 이미 대체(superseded)된 구버전 응답이
 * 최신 리비전의 상태·승인 수를 덮어쓰지 않도록 방어하고 구버전 이력으로만 남긴다.
 */
export function reconcileConcurrentStudioReviewMutation(
  storage: StudioReviewHistoryStorage,
  projectId: string,
  candidateSession: StudioReviewSession,
): ConcurrentStudioReviewMutationResult {
  const before = readStudioReviewHistory(storage, projectId);
  const existing = before.sessions.find(
    (item) => item.documentId === candidateSession.documentId && item.versionId === candidateSession.versionId,
  ) ?? null;
  const priorLatestHead = findLatestActiveStudioReviewSession(before, candidateSession.documentId);
  const isStale =
    candidateSession.status !== "superseded"
    && isCanonicalRevisionVersionId(candidateSession.versionId)
    && Boolean(
      existing?.status === "superseded"
      || (priorLatestHead
        && priorLatestHead.versionId !== candidateSession.versionId
        && (priorLatestHead.basedOnVersionId === candidateSession.versionId
          || (existing && Date.parse(priorLatestHead.updatedAt) > Date.parse(existing.updatedAt)))),
    );

  const history = archiveStudioReviewSession(storage, projectId, candidateSession);
  if (isStale && priorLatestHead) {
    const latestHead =
      history.sessions.find((item) => item.versionId === priorLatestHead.versionId) ?? priorLatestHead;
    const archivedStaleSession =
      history.sessions.find((item) => item.versionId === candidateSession.versionId) ?? candidateSession;
    return Object.freeze({
      outcome: "stale-superseded",
      latestHead,
      archivedStaleSession,
      history,
    });
  }

  return Object.freeze({
    outcome: "applied-latest",
    latestHead: candidateSession,
    archivedStaleSession: null,
    history,
  });
}

/** Save a non-destructive checkpoint snapshot of the current review session into history. */
export function saveStudioReviewCheckpoint(
  storage: StudioReviewHistoryStorage,
  projectId: string,
  session: StudioReviewSession,
  checkpointIdSuffix: string,
  savedAt: string,
): StudioReviewHistoryDocument {
  const cleanSuffix = checkpointIdSuffix.trim().replace(/[^a-zA-Z0-9_-]/gu, "-").slice(0, 36) || "ckpt";
  const snapshot: StudioReviewSession = Object.freeze({
    ...session,
    versionId: `${session.versionId}-${cleanSuffix}`,
    basedOnVersionId: session.versionId,
    updatedAt: savedAt,
  });
  return archiveStudioReviewSession(storage, projectId, snapshot);
}

/** Restore a previously archived or checkpointed review session while backing up the current state. */
export function restoreStudioReviewHistoryVersion(
  storage: StudioReviewHistoryStorage,
  projectId: string,
  currentSession: StudioReviewSession,
  targetVersionId: string,
  restoredAt: string,
): { readonly history: StudioReviewHistoryDocument; readonly restored: StudioReviewSession } {
  const currentHistory = readStudioReviewHistory(storage, projectId);
  const target = currentHistory.sessions.find((item) => item.versionId === targetVersionId);
  if (!target) {
    throw new Error("Target review version was not found in history.");
  }
  const historyAfterBackup = saveStudioReviewCheckpoint(
    storage,
    projectId,
    currentSession,
    `backup-${Date.parse(restoredAt) || Date.now()}`,
    restoredAt,
  );
  const hasOpenChangeRequest = target.threads.some(
    (thread) => thread.kind === "change-request" && thread.status === "open",
  );
  const restoredStatus =
    target.status === "approved" || target.status === "superseded"
      ? (hasOpenChangeRequest ? "changes-requested" : "in-review")
      : target.status;
  const restored: StudioReviewSession = Object.freeze({
    ...target,
    basedOnVersionId: target.versionId,
    status: restoredStatus,
    approvedAt: null,
    updatedAt: restoredAt,
  });
  return Object.freeze({
    history: historyAfterBackup,
    restored,
  });
}
