/**
 * 서버 프레즌스 저장소 — 휘발성 인메모리 상태.
 *
 * 프레즌스·라이브 뷰는 하트비트가 끊기면 사라지는 정보다(웹 모델 TTL: 프레즌스
 * 90초, 라이브 뷰 12초). 이관 대상이 아닌 값을 DB에 쓰지 않기 위해 프로세스
 * 메모리에만 둔다. 서버가 재시작되면 전원 프레즌스가 사라지지만, 클라이언트는
 * 다음 하트비트(프레즌스 30초·라이브 5초)에 자기 항목을 다시 올리므로 잠금은
 * 최대 한 하트비트 주기 안에 복원되고, 그 사이 잠금 판단은 "비어 있음" 쪽으로
 * 기운다(웹 모델도 만료를 같은 방향으로 해석한다).
 *
 * 합류 규칙은 웹 모델과 1:1로 맞춘다:
 * - 프레즌스: (페이지, 사람)당 하트비트가 가장 최근인 항목 하나.
 *   (`page-edit-lock-model.prunePagePresence`/`mergePagePresence`와 동일)
 * - 라이브 뷰: 사람당 updatedAt이 가장 최근인 항목 하나.
 *   (`live-view-sync-model.pruneLiveViews`/`mergeLiveViews`와 동일)
 * - 검수 세션: 범위당 하나. 먼저 시작된 세션이 이기고, 시작 시각이 같으면
 *   결정이 더 많이 쌓인 쪽이 이긴다. (회차 룸 탭 간 병합 규칙과 동일)
 *
 * 소유권: 항목을 처음 올린 로그인 사용자만 그 항목을 갱신·삭제할 수 있다.
 * 클라이언트가 보낸 actorId는 참여 배정 ID라 로그인 ID와 다르므로, 서버는
 * 제출자(세션에서 검증된 사용자 ID)를 따로 기록해 남의 프레즌스 위조를 막는다.
 */

export type PresenceMode = "editing" | "viewing";

export interface ServerPagePresenceEntry {
  readonly pageId: string;
  readonly actorId: string;
  readonly displayName: string;
  readonly mode: PresenceMode;
  readonly heartbeatAt: string;
}

export interface ServerLiveViewState {
  readonly actorId: string;
  readonly displayName: string;
  readonly pageId: string;
  readonly cursor: { readonly x: number; readonly y: number } | null;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly zoom: number;
  readonly updatedAt: string;
  readonly interactedAt: string;
}

/** 세션은 웹 모델(ReviewSession)을 그대로 운반한다. 서버는 구조만 검증하고 내용은 해석하지 않는다. */
export type ServerReviewSession = Readonly<Record<string, unknown>> & {
  readonly id: string;
  readonly scopeId: string;
  readonly startedAt: string;
  readonly state: string;
  readonly decisions: readonly unknown[];
};

export interface PresenceScopeSnapshot {
  readonly presence: readonly ServerPagePresenceEntry[];
  readonly liveViews: readonly ServerLiveViewState[];
  readonly session: ServerReviewSession | null;
}

export interface PresenceSyncInput {
  readonly presence: readonly ServerPagePresenceEntry[];
  readonly liveView: ServerLiveViewState | null;
  readonly session: ServerReviewSession | null;
  /** true면 내 항목을 지우고 병합한다(페이지 이탈). */
  readonly leaving: boolean;
}

/** 웹 모델 상수와 동일하게 유지한다. 한쪽만 바꾸면 기기 간 만료 판단이 어긋난다. */
export const SERVER_PAGE_PRESENCE_TTL_MS = 90_000;
export const SERVER_LIVE_VIEW_TTL_MS = 12_000;
const CLOCK_SKEW_MS = 5_000;
/** 끝난 세션을 요약 확인용으로 이 시간까지 보관한 뒤 버린다. */
const ENDED_SESSION_RETENTION_MS = 60 * 60 * 1000;

function timeOf(iso: string): number {
  return Date.parse(iso);
}

function isFresh(atIso: string, ttlMs: number, now: Date): boolean {
  const at = timeOf(atIso);
  if (!Number.isFinite(at)) return false;
  const age = now.getTime() - at;
  return age >= -CLOCK_SKEW_MS && age <= ttlMs;
}

interface Owned<T> {
  readonly value: T;
  readonly ownerUserId: string;
}

export class PresenceStore {
  /** scopeKey(projectId) → pageId::actorId → 항목 */
  private readonly presence = new Map<string, Map<string, Owned<ServerPagePresenceEntry>>>();
  /** scopeKey(projectId) → actorId → 항목 */
  private readonly liveViews = new Map<string, Map<string, Owned<ServerLiveViewState>>>();
  /** scopeKey(projectId + episodeId) → 세션 */
  private readonly sessions = new Map<string, Owned<ServerReviewSession>>();

  private scopeMap<T>(root: Map<string, Map<string, Owned<T>>>, projectId: string): Map<string, Owned<T>> {
    let map = root.get(projectId);
    if (!map) {
      map = new Map();
      root.set(projectId, map);
    }
    return map;
  }

  /**
   * 한 기기의 하트비트를 합치고, 그 범위의 최신 스냅샷을 돌려준다.
   * 클라이언트는 응답을 자기 모델의 merge 함수로 합치므로 이 왕복만으로
   * 기기 간 프레즌스·잠금·라이브 뷰·세션이 전파된다.
   */
  sync(
    projectId: string,
    episodeId: string,
    pageId: string,
    ownerUserId: string,
    input: PresenceSyncInput,
    now: Date,
  ): PresenceScopeSnapshot {
    const presenceMap = this.scopeMap(this.presence, projectId);
    const liveMap = this.scopeMap(this.liveViews, projectId);

    if (input.leaving) {
      for (const [key, owned] of presenceMap) {
        if (owned.ownerUserId === ownerUserId && owned.value.pageId === pageId) presenceMap.delete(key);
      }
      for (const [actorId, owned] of liveMap) {
        if (owned.ownerUserId === ownerUserId) liveMap.delete(actorId);
      }
    } else {
      for (const entry of input.presence) {
        if (entry.pageId !== pageId) continue;
        const key = `${entry.pageId}::${entry.actorId}`;
        const existing = presenceMap.get(key);
        if (existing && existing.ownerUserId !== ownerUserId
          && isFresh(existing.value.heartbeatAt, SERVER_PAGE_PRESENCE_TTL_MS, now)) continue;
        if (!existing || timeOf(entry.heartbeatAt) >= timeOf(existing.value.heartbeatAt)) {
          presenceMap.set(key, { value: entry, ownerUserId });
        }
      }
      if (input.liveView && input.liveView.pageId === pageId) {
        const existing = liveMap.get(input.liveView.actorId);
        if (!(existing && existing.ownerUserId !== ownerUserId
          && isFresh(existing.value.updatedAt, SERVER_LIVE_VIEW_TTL_MS, now))
          && (!existing || timeOf(input.liveView.updatedAt) >= timeOf(existing.value.updatedAt))) {
          liveMap.set(input.liveView.actorId, { value: input.liveView, ownerUserId });
        }
      }
      if (input.session && input.session.scopeId === episodeId) {
        const key = `${projectId}::${episodeId}`;
        const existing = this.sessions.get(key);
        if (!existing || sessionWins(input.session, existing.value)) {
          this.sessions.set(key, { value: input.session, ownerUserId });
        }
      }
    }

    this.prune(projectId, now);
    return this.snapshot(projectId, episodeId, pageId, now);
  }

  snapshot(projectId: string, episodeId: string, pageId: string, now: Date): PresenceScopeSnapshot {
    this.prune(projectId, now);
    const presence = [...(this.presence.get(projectId)?.values() ?? [])]
      .map((owned) => owned.value)
      .filter((entry) => entry.pageId === pageId)
      .sort((a, b) => `${a.pageId}::${a.actorId}`.localeCompare(`${b.pageId}::${b.actorId}`));
    const liveViews = [...(this.liveViews.get(projectId)?.values() ?? [])]
      .map((owned) => owned.value)
      .filter((view) => view.pageId === pageId)
      .sort((a, b) => a.actorId.localeCompare(b.actorId));
    const session = this.sessions.get(`${projectId}::${episodeId}`)?.value ?? null;
    return { presence, liveViews, session };
  }

  private prune(projectId: string, now: Date): void {
    const presenceMap = this.presence.get(projectId);
    if (presenceMap) {
      for (const [key, owned] of presenceMap) {
        if (!isFresh(owned.value.heartbeatAt, SERVER_PAGE_PRESENCE_TTL_MS, now)) presenceMap.delete(key);
      }
      if (presenceMap.size === 0) this.presence.delete(projectId);
    }
    const liveMap = this.liveViews.get(projectId);
    if (liveMap) {
      for (const [actorId, owned] of liveMap) {
        if (!isFresh(owned.value.updatedAt, SERVER_LIVE_VIEW_TTL_MS, now)) liveMap.delete(actorId);
      }
      if (liveMap.size === 0) this.liveViews.delete(projectId);
    }
    for (const [key, owned] of this.sessions) {
      const session = owned.value;
      if (!key.startsWith(`${projectId}::`)) continue;
      const endedAt = typeof session.endedAt === "string" ? session.endedAt : null;
      if (session.state === "ended" && endedAt && now.getTime() - timeOf(endedAt) > ENDED_SESSION_RETENTION_MS) {
        this.sessions.delete(key);
      }
    }
  }
}

/** 회차 룸 탭 간 병합과 같은 규칙: 먼저 시작된 쪽, 동률이면 결정이 많은 쪽. */
export function sessionWins(incoming: ServerReviewSession, current: ServerReviewSession): boolean {
  if (incoming.id !== current.id) return incoming.startedAt < current.startedAt;
  if (incoming.state !== current.state) return incoming.state === "ended";
  return incoming.decisions.length >= current.decisions.length;
}
