/**
 * 작가 공지 스토어 — 공지 초안/게시 상태의 로컬 정본(IndexedDB).
 *
 * 게스트-퍼스트 정책(뉴스레터와 동일):
 * - 공지 열람은 로그인 없이 된다. 독자 표면은 게시된 공지만 본다.
 * - 작성·수정·삭제·게시는 소유권이 필요해 로그인 계정(actorId)이 없으면
 *   상태를 바꾸지 않고 실패를 반환한다.
 * - 남의 공지는 수정·삭제·게시할 수 없다(미귀속 레거시만 귀속 전 허용).
 *
 * 알림 센터 연동 경계: 공지 게시 시 구독자 알림을 만드는 경로는 서버 동기화
 * 알림(engagement)뿐이라 로컬에서는 만들 수 없다. 서버 공지 계약이 생기면
 * 게시 지점에서 팬아웃을 연결한다 — 지금은 공지 자체가 독자 표면에 닿는 것까지가 범위다.
 */

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { idbJsonStorage } from "@/shared/lib/idb-json-storage";
import type { SeriesStatus } from "@/platform/creator-client";

import { buildStatusTransitionNoticeDraft, validateAuthorNoticeDraft } from "./author-notice-model";
import type {
  AuthorNotice,
  AuthorNoticeKind,
  AuthorNoticeScope,
  AuthorNoticeStatus,
} from "./author-notice-types";

const STORAGE_KEY = "toonstudio-author-notices-v1";
const MAX_NOTICES = 200;

export interface CreateAuthorNoticeInput {
  readonly scope: AuthorNoticeScope;
  readonly kind: AuthorNoticeKind;
  readonly title: string;
  readonly body: string;
}

export interface UpdateAuthorNoticePatch {
  readonly kind?: AuthorNoticeKind;
  readonly title?: string;
  readonly body?: string;
}

interface AuthorNoticeState {
  readonly notices: readonly AuthorNotice[];

  createNotice: (
    authorName: string,
    input: CreateAuthorNoticeInput,
    actorId: string | null,
  ) => AuthorNotice | null;
  updateNotice: (
    noticeId: string,
    patch: UpdateAuthorNoticePatch,
    actorId: string | null,
  ) => AuthorNotice | null;
  deleteNotice: (noticeId: string, actorId: string | null) => boolean;
  setNoticeStatus: (
    noticeId: string,
    status: AuthorNoticeStatus,
    actorId: string | null,
  ) => boolean;
  resetForTests: () => void;
}

let fallbackIdCounter = 0;

function nextAuthorNoticeId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `author-notice-${uuid}`;
  fallbackIdCounter += 1;
  return `author-notice-${Date.now().toString(36)}-${fallbackIdCounter}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** 소유 검사 — 미귀속(레거시) 레코드는 허용하고, 귀속된 레코드는 소유 계정만 통과시킨다. */
function ownsRecord(ownerId: string | null, actorId: string | null | undefined): boolean {
  if (ownerId == null) return true;
  return actorId != null && ownerId === actorId;
}

const initialState = {
  notices: [] as readonly AuthorNotice[],
};

export const useAuthorNoticeStore = create<AuthorNoticeState>()(
  persist(
    (set, get) => ({
      ...initialState,

      createNotice: (authorName, input, actorId) => {
        // 공지는 독자에게 공개되는 글이라 익명 작성은 허용하지 않는다.
        if (!actorId) return null;
        const timestamp = nowIso();
        const notice: AuthorNotice = {
          id: nextAuthorNoticeId(),
          ownerId: actorId,
          authorName: authorName.trim(),
          scope: input.scope,
          kind: input.kind,
          title: input.title,
          body: input.body,
          status: "draft",
          createdAt: timestamp,
          updatedAt: timestamp,
          publishedAt: null,
        };
        set((state) => ({ notices: [notice, ...state.notices].slice(0, MAX_NOTICES) }));
        return notice;
      },

      updateNotice: (noticeId, patch, actorId) => {
        const current = get().notices.find((notice) => notice.id === noticeId);
        if (!current || !ownsRecord(current.ownerId, actorId)) return null;
        const updated: AuthorNotice = {
          ...current,
          kind: patch.kind ?? current.kind,
          title: patch.title ?? current.title,
          body: patch.body ?? current.body,
          updatedAt: nowIso(),
        };
        set((state) => ({
          notices: state.notices.map((notice) => (notice.id === noticeId ? updated : notice)),
        }));
        return updated;
      },

      deleteNotice: (noticeId, actorId) => {
        const current = get().notices.find((notice) => notice.id === noticeId);
        if (!current || !ownsRecord(current.ownerId, actorId)) return false;
        set((state) => ({
          notices: state.notices.filter((notice) => notice.id !== noticeId),
        }));
        return true;
      },

      setNoticeStatus: (noticeId, status, actorId) => {
        const current = get().notices.find((notice) => notice.id === noticeId);
        if (!current || !ownsRecord(current.ownerId, actorId)) return false;
        if (current.status === status) return true;
        // 게시는 검증 통과가 전제다 — 빈 제목/본문 공지가 독자에게 나가지 않게.
        if (status === "published" && !validateAuthorNoticeDraft(current).ok) return false;
        const timestamp = nowIso();
        set((state) => ({
          notices: state.notices.map((notice) =>
            notice.id === noticeId
              ? {
                  ...notice,
                  status,
                  updatedAt: timestamp,
                  publishedAt: status === "published" ? timestamp : notice.publishedAt,
                }
              : notice,
          ),
        }));
        return true;
      },

      resetForTests: () => set({ ...initialState }),
    }),
    {
      name: STORAGE_KEY,
      storage: idbJsonStorage,
      partialize: (state) => ({ notices: state.notices }),
    },
  ),
);

/**
 * 연재 상태 전환 시 공지 초안을 자동 생성한다(시리즈 편집 화면의 연결 지점).
 *
 * 제안 대상 전이가 아니거나, 로그인 계정이 없으면 아무것도 만들지 않고 null을
 * 돌려준다 — 상태만 바뀌고 공지는 조용히 생략되는 쪽이 잘못된 공지보다 낫다.
 */
export function createStatusTransitionNoticeDraft(input: {
  actorId: string | null;
  authorName: string;
  workId: string;
  workTitle: string;
  from: SeriesStatus;
  to: SeriesStatus;
}): AuthorNotice | null {
  if (!input.actorId) return null;
  const seed = buildStatusTransitionNoticeDraft(input);
  if (!seed) return null;
  return useAuthorNoticeStore.getState().createNotice(
    input.authorName,
    {
      scope: { kind: "work", workId: input.workId, workTitle: input.workTitle },
      kind: seed.kind,
      title: seed.title,
      body: seed.body,
    },
    input.actorId,
  );
}

/**
 * 공지 스토어의 IndexedDB 복원 완료를 구독한다.
 * 복원 전에 렌더하면 공지가 없는 것처럼 보여 독자·작가 모두 잘못 판단한다 —
 * 공지를 표시·변경하는 화면은 이 게이트를 통과한 뒤에만 그린다(뉴스레터와 동일).
 */
export function useAuthorNoticesHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useAuthorNoticeStore.persist.onFinishHydration(cb),
    () => useAuthorNoticeStore.persist.hasHydrated(),
    () => false,
  );
}
