import {
  mergePagePresence,
  type PagePresenceEntry,
} from "./page-edit-lock-model";
import {
  mergeLiveViews,
  type LiveViewState,
} from "./live-view-sync-model";
import type { ReviewSession } from "./review-session-model";

/**
 * 서버 프레즌스·세션 전송 계약 (클라이언트 측).
 *
 * 전송 방식은 하트비트 왕복 하나다: 내 프레즌스 항목·라이브 뷰·검수 세션을
 * POST로 올리면 서버가 범위(프로젝트·회차·페이지) 전체의 합류 스냅샷으로
 * 답한다. 응답은 반드시 로컬 모델의 merge 함수로 합친다 — 서버가 어떤
 * 항목을 돌려주든 만료·최신 판정은 로컬 모델 규칙(TTL·중복 정리)이 정본이라,
 * BroadcastChannel(같은 브라우저 탭)과 서버(기기 간)가 같은 상태로 모인다.
 *
 * 이 모듈은 네트워크를 모른다. poster를 주입받아 테스트할 수 있고,
 * 실제 바인딩은 use-server-presence-sync가 플랫폼 api로 만든다.
 */

export interface PresenceSyncRequest {
  readonly episodeId: string;
  readonly pageId: string;
  readonly presence: readonly PagePresenceEntry[];
  readonly liveView: LiveViewState | null;
  readonly session: ReviewSession | null;
  readonly leaving: boolean;
}

export interface PresenceSyncSnapshot {
  readonly presence: readonly PagePresenceEntry[];
  readonly liveViews: readonly LiveViewState[];
  readonly session: ReviewSession | null;
}

export interface PresenceTransport {
  sync(request: PresenceSyncRequest): Promise<PresenceSyncSnapshot>;
}

export function presenceSyncPath(projectId: string): string {
  return `/production/projects/${encodeURIComponent(projectId)}/presence/sync`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPresenceEntry(value: unknown): value is PagePresenceEntry {
  return isRecord(value)
    && typeof value.pageId === "string"
    && typeof value.actorId === "string"
    && typeof value.displayName === "string"
    && (value.mode === "editing" || value.mode === "viewing")
    && typeof value.heartbeatAt === "string";
}

function isLiveView(value: unknown): value is LiveViewState {
  return isRecord(value)
    && typeof value.actorId === "string"
    && typeof value.displayName === "string"
    && typeof value.pageId === "string"
    && (value.cursor === null || (isRecord(value.cursor)
      && typeof value.cursor.x === "number" && typeof value.cursor.y === "number"))
    && typeof value.scrollX === "number"
    && typeof value.scrollY === "number"
    && typeof value.zoom === "number"
    && typeof value.updatedAt === "string"
    && typeof value.interactedAt === "string";
}

function isReviewSession(value: unknown): value is ReviewSession {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.scopeId === "string"
    && typeof value.hostActorId === "string"
    && (value.state === "live" || value.state === "ended")
    && typeof value.startedAt === "string"
    && Array.isArray(value.participants)
    && Array.isArray(value.decisions);
}

/**
 * 서버 응답을 신뢰 경계에서 검증한다. 형식이 어긋난 항목은 버리고,
 * 전체가 깨졌으면 null을 돌려 호출측이 로컬 상태를 그대로 유지하게 한다.
 */
export function parsePresenceSyncSnapshot(raw: unknown): PresenceSyncSnapshot | null {
  if (!isRecord(raw) || !Array.isArray(raw.presence) || !Array.isArray(raw.liveViews)) return null;
  return {
    presence: raw.presence.filter(isPresenceEntry),
    liveViews: raw.liveViews.filter(isLiveView),
    session: isReviewSession(raw.session) ? raw.session : null,
  };
}

/** 세션 병합 규칙 — 회차 룸의 탭 간 병합과 동일(먼저 시작·같은 세션은 결정 많은 쪽·종료 우선). */
export function mergeReviewSession(
  current: ReviewSession | null,
  incoming: ReviewSession | null,
): ReviewSession | null {
  if (!incoming) return current;
  if (!current) return incoming;
  if (incoming.id !== current.id) return incoming.startedAt < current.startedAt ? incoming : current;
  if (incoming.state !== current.state) return incoming.state === "ended" ? incoming : current;
  return incoming.decisions.length >= current.decisions.length ? incoming : current;
}

/**
 * 스냅샷을 로컬 상태에 합친 결과. 순수 함수라 "두 기기" 시나리오를
 * 네트워크 없이 그대로 검증할 수 있다.
 */
export function applyPresenceSnapshot(input: {
  readonly localPresence: readonly PagePresenceEntry[];
  readonly localLiveViews: readonly LiveViewState[];
  readonly localSession: ReviewSession | null;
  readonly snapshot: PresenceSyncSnapshot;
  readonly pageId: string;
  readonly now: Date;
}): { presence: readonly PagePresenceEntry[]; liveViews: readonly LiveViewState[]; session: ReviewSession | null } {
  return {
    presence: mergePagePresence(
      input.localPresence,
      input.snapshot.presence.filter((entry) => entry.pageId === input.pageId),
      input.now,
    ),
    liveViews: mergeLiveViews(
      input.localLiveViews,
      input.snapshot.liveViews.filter((view) => view.pageId === input.pageId),
      input.now,
    ),
    session: mergeReviewSession(input.localSession, input.snapshot.session),
  };
}

/** poster 주입형 전송. 실패하면 throw — 호출측(훅)이 로컬 동작을 유지하며 삼킨다. */
export function createPresenceTransport(
  projectId: string,
  poster: (path: string, body: unknown) => Promise<unknown>,
): PresenceTransport {
  return {
    async sync(request) {
      const raw = await poster(presenceSyncPath(projectId), request);
      const snapshot = parsePresenceSyncSnapshot(raw);
      if (!snapshot) throw new Error("프레즌스 동기화 응답을 확인하지 못했습니다.");
      return snapshot;
    },
  };
}
