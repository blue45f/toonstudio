import { useCallback, useEffect, useRef, useState } from "react";

import type { StudioGalleryStats } from "./studio-virtual-space-gallery";
import type {
  StudioSpaceBooking,
  StudioSpaceWaitlistEntry,
} from "./studio-virtual-space-space-booking";
import {
  acceptBookingsSnapshot,
  acceptGalleryLikeToggle,
  acceptGalleryLikes,
  createDefaultStudioVirtualSpaceSocialTransport,
  diffBookings,
  diffGalleryLikeToggles,
  diffWaitlist,
  type StudioVirtualSpaceSocialTransport,
} from "./studio-virtual-space-booking-sync";
import {
  loadStudioVirtualSpaceLocalSocial,
  saveStudioVirtualSpaceLocalSocial,
} from "./studio-virtual-space-booking-local";

export interface StudioVirtualSpaceSocialSyncInput {
  /** 예약·좋아요 범위 키의 재료. (projectId, worldScope) 조합이 월드 단위 정본을 가른다. */
  readonly projectId: string;
  readonly worldScope: string;
  /** 세션 사용자 id. 없으면(게스트) 동기화하지 않는다. */
  readonly userId: string | null;
  readonly enabled: boolean;
  /** 테스트 주입용. 미지정 시 기본 전송을 만든다. */
  readonly transport?: StudioVirtualSpaceSocialTransport;
}

export interface StudioVirtualSpaceSocialSync {
  readonly bookings: readonly StudioSpaceBooking[];
  readonly setBookings: (
    next:
      | readonly StudioSpaceBooking[]
      | ((prev: readonly StudioSpaceBooking[]) => readonly StudioSpaceBooking[]),
  ) => void;
  readonly waitlist: readonly StudioSpaceWaitlistEntry[];
  readonly setWaitlist: (
    next:
      | readonly StudioSpaceWaitlistEntry[]
      | ((prev: readonly StudioSpaceWaitlistEntry[]) => readonly StudioSpaceWaitlistEntry[]),
  ) => void;
  readonly galleryStats: StudioGalleryStats;
  readonly setGalleryStats: (
    next: StudioGalleryStats | ((prev: StudioGalleryStats) => StudioGalleryStats),
  ) => void;
}

/**
 * 예약·대기열·갤러리 좋아요를 서버 정본과 동기화하는 훅.
 *
 * 패널 계약(다음 전체 배열을 넘기는 콜백)은 그대로 두고, 이 훅이 차이만 서버에
 * 반영한다. 서버 응답 스냅샷으로 교체해 승격·거절을 자동 반영하고, 실패하면
 * 스냅샷 재읽기로 맞춘 뒤에도 안 되면 이 범위를 세션 모드로 강등한다.
 * 게스트(enabled=false)면 로드도 동기화도 하지 않아 기존 동작과 동일하다.
 *
 * 여기에 로컬(IndexedDB) 영속을 겹친다: 마지막으로 확정된 상태를 scopeKey
 * 단위로 이 기기에 보관해, 게스트 세션이나 서버에 닿지 못한 방문에서도
 * 새로고침에 예약·좋아요가 사라지지 않게 한다. 서버 스냅샷이 도착하면
 * 언제나 그쪽이 정본이고 로컬 사본은 캐시로 강등된다. 게스트가 만든 로컬
 * 예약을 로그인 계정으로 자동 승격하지는 않는다.
 */
export function useStudioVirtualSpaceSocialSync(
  input: StudioVirtualSpaceSocialSyncInput,
): StudioVirtualSpaceSocialSync {
  const { userId, enabled } = input;
  // 장식 배치의 개인 scopeKey와 달리 모드를 섞지 않는다 — 같은 월드의 예약은 하나다.
  const scopeKey = JSON.stringify([input.projectId, input.worldScope]);
  const [transport] = useState<StudioVirtualSpaceSocialTransport>(
    () => input.transport ?? createDefaultStudioVirtualSpaceSocialTransport(),
  );
  const [bookings, setBookingsState] = useState<readonly StudioSpaceBooking[]>([]);
  const [waitlist, setWaitlistState] = useState<readonly StudioSpaceWaitlistEntry[]>([]);
  const [galleryStats, setGalleryStatsState] = useState<StudioGalleryStats>({});

  const bookingsRef = useRef(bookings);
  const waitlistRef = useRef(waitlist);
  const galleryStatsRef = useRef(galleryStats);
  const readyRef = useRef(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  // 로컬 영속 가드: 하이드레이트가 끝나기 전에는 쓰지 않고, 서버 스냅샷이
  // 먼저 닿았거나 사용자가 먼저 손댄 범위는 로컬 사본으로 덮지 않는다.
  // 서버 접촉 판정은 데이터 종류별로 나눈다 — 좋아요만 성공하고 예약
  // 로드가 실패한 경우에도 예약은 로컬 사본으로 시작해야 하기 때문이다.
  const localReadyRef = useRef(false);
  const localDirtyRef = useRef(false);
  const serverBookingsTouchedRef = useRef(false);
  const serverLikesTouchedRef = useRef(false);

  const applyBookingsSnapshot = useCallback((value: unknown): boolean => {
    const snapshot = acceptBookingsSnapshot(value, scopeRef.current);
    if (snapshot === null) return false;
    serverBookingsTouchedRef.current = true;
    bookingsRef.current = snapshot.bookings;
    waitlistRef.current = snapshot.waitlist;
    setBookingsState(snapshot.bookings);
    setWaitlistState(snapshot.waitlist);
    return true;
  }, []);

  const mergeGalleryLikes = useCallback((likes: StudioGalleryStats): void => {
    // 조회수(views)는 세션 통계라 서버 값으로 덮지 않고 현재 값을 이어 붙인다.
    const merged: Record<string, { views: number; likes: number; likedBy: readonly string[] }> = {
      ...galleryStatsRef.current,
    };
    for (const [frameId, frame] of Object.entries(likes)) {
      merged[frameId] = {
        views: merged[frameId]?.views ?? 0,
        likes: frame.likes,
        likedBy: frame.likedBy,
      };
    }
    galleryStatsRef.current = merged;
    setGalleryStatsState(merged);
  }, []);

  const applyGalleryLikes = useCallback((value: unknown): boolean => {
    const likes = acceptGalleryLikes(value, scopeRef.current);
    if (likes === null) return false;
    serverLikesTouchedRef.current = true;
    mergeGalleryLikes(likes);
    return true;
  }, [mergeGalleryLikes]);

  /** 동기화 실패 시 서버 스냅샷으로 한 번 맞추고, 그것도 실패하면 세션 모드로 강등한다. */
  const resync = useCallback(async (): Promise<void> => {
    try {
      const value = await transport.loadBookings(scopeRef.current);
      if (!applyBookingsSnapshot(value)) readyRef.current = false;
    } catch {
      readyRef.current = false;
    }
  }, [applyBookingsSnapshot, transport]);

  const enqueue = useCallback(
    (task: () => Promise<void>): void => {
      queueRef.current = queueRef.current.then(task, task);
    },
    [],
  );

  // 로컬(IndexedDB) 하이드레이트: 서버 도달 여부와 무관하게 직전 방문의
  // 마지막 확정 상태로 시작한다. 서버 스냅샷이 먼저 도착했거나 사용자가
  // 먼저 손댔으면 로컬 사본은 버리고, 사용자가 먼저 손댄 경우에는 그
  // 현재 상태를 곧바로 로컬에 남긴다.
  useEffect(() => {
    localReadyRef.current = false;
    localDirtyRef.current = false;
    serverBookingsTouchedRef.current = false;
    serverLikesTouchedRef.current = false;
    let cancelled = false;
    void loadStudioVirtualSpaceLocalSocial(scopeKey).then((local) => {
      localReadyRef.current = true;
      if (cancelled) return;
      if (localDirtyRef.current) {
        void saveStudioVirtualSpaceLocalSocial(scopeKey, {
          bookings: bookingsRef.current,
          waitlist: waitlistRef.current,
          galleryLikes: galleryStatsRef.current,
        });
        return;
      }
      if (local === null) return;
      if (!serverBookingsTouchedRef.current) {
        bookingsRef.current = local.bookings;
        waitlistRef.current = local.waitlist;
        setBookingsState(local.bookings);
        setWaitlistState(local.waitlist);
      }
      if (!serverLikesTouchedRef.current) mergeGalleryLikes(local.galleryLikes);
    });
    return () => {
      cancelled = true;
    };
  }, [mergeGalleryLikes, scopeKey]);

  // 상태가 바뀔 때마다 로컬 사본을 갱신한다(하이드레이트가 끝난 뒤에만).
  // 서버 스냅샷 적용 직후에도 발화하므로 로컬 사본은 마지막 확정 상태를
  // 따라가며, 서버에 닿지 못한 방문에서는 그 사본이 다음 방문의 시작점이다.
  useEffect(() => {
    if (!localReadyRef.current) return;
    void saveStudioVirtualSpaceLocalSocial(scopeRef.current, {
      bookings,
      waitlist,
      galleryLikes: galleryStats,
    });
  }, [bookings, waitlist, galleryStats]);

  // 범위·로그인 상태가 바뀌면 서버 정본을 읽어 교체한다. 외부 시스템 동기화 effect다.
  useEffect(() => {
    readyRef.current = false;
    if (!enabled || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const value = await transport.loadBookings(scopeKey);
        if (cancelled) return;
        if (applyBookingsSnapshot(value)) readyRef.current = true;
      } catch {
        // 서버에 닿지 않으면 세션 모드로 동작한다(기존 동작).
      }
      try {
        const likes = await transport.loadGalleryLikes(scopeKey);
        if (!cancelled) applyGalleryLikes(likes);
      } catch {
        // 좋아요 로드 실패는 예약 동기화를 막지 않는다.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyBookingsSnapshot, applyGalleryLikes, enabled, scopeKey, transport, userId]);

  const setBookings = useCallback<StudioVirtualSpaceSocialSync["setBookings"]>(
    (next) => {
      const prev = bookingsRef.current;
      const resolved = typeof next === "function" ? next(prev) : next;
      if (!localReadyRef.current) localDirtyRef.current = true;
      bookingsRef.current = resolved;
      setBookingsState(resolved);
      if (!readyRef.current) return;
      const diff = diffBookings(prev, resolved);
      if (diff.created.length === 0 && diff.cancelledIds.length === 0) return;
      const activeScope = scopeRef.current;
      enqueue(async () => {
        try {
          let last: unknown = null;
          // 취소를 먼저 보내야 서버 승격이 일어나고, 로컬 승격 예약의 생성은
          // 같은 id의 멱등 생성으로 수렴한다(순서가 반대면 슬롯 충돌로 거절된다).
          for (const bookingId of diff.cancelledIds) {
            last = await transport.cancelBooking(activeScope, bookingId);
          }
          for (const booking of diff.created) {
            last = await transport.createBooking(activeScope, booking);
          }
          if (last !== null && scopeRef.current === activeScope) applyBookingsSnapshot(last);
        } catch {
          if (scopeRef.current === activeScope) await resync();
        }
      });
    },
    [applyBookingsSnapshot, enqueue, resync, transport],
  );

  const setWaitlist = useCallback<StudioVirtualSpaceSocialSync["setWaitlist"]>(
    (next) => {
      const prev = waitlistRef.current;
      const resolved = typeof next === "function" ? next(prev) : next;
      if (!localReadyRef.current) localDirtyRef.current = true;
      waitlistRef.current = resolved;
      setWaitlistState(resolved);
      if (!readyRef.current) return;
      const diff = diffWaitlist(prev, resolved);
      if (diff.joined.length === 0 && diff.leftIds.length === 0) return;
      const activeScope = scopeRef.current;
      enqueue(async () => {
        try {
          let last: unknown = null;
          for (const entry of diff.joined) {
            last = await transport.joinWaitlist(activeScope, entry);
          }
          for (const entryId of diff.leftIds) {
            last = await transport.leaveWaitlist(activeScope, entryId);
          }
          if (last !== null && scopeRef.current === activeScope) applyBookingsSnapshot(last);
        } catch {
          if (scopeRef.current === activeScope) await resync();
        }
      });
    },
    [applyBookingsSnapshot, enqueue, resync, transport],
  );

  const setGalleryStats = useCallback<StudioVirtualSpaceSocialSync["setGalleryStats"]>(
    (next) => {
      const prev = galleryStatsRef.current;
      const resolved = typeof next === "function" ? next(prev) : next;
      if (!localReadyRef.current) localDirtyRef.current = true;
      galleryStatsRef.current = resolved;
      setGalleryStatsState(resolved);
      if (!readyRef.current || !userId) return;
      const toggled = diffGalleryLikeToggles(prev, resolved, userId);
      if (toggled.length === 0) return;
      const activeScope = scopeRef.current;
      enqueue(async () => {
        try {
          for (const frameId of toggled) {
            const value = await transport.toggleGalleryLike(activeScope, frameId);
            const accepted = acceptGalleryLikeToggle(value);
            if (accepted !== null && scopeRef.current === activeScope) {
              const current = galleryStatsRef.current;
              const merged = {
                ...current,
                [accepted.frameId]: {
                  views: current[accepted.frameId]?.views ?? 0,
                  likes: accepted.likes,
                  likedBy: accepted.likedBy,
                },
              };
              galleryStatsRef.current = merged;
              setGalleryStatsState(merged);
            }
          }
        } catch {
          try {
            const likes = await transport.loadGalleryLikes(activeScope);
            if (scopeRef.current === activeScope) applyGalleryLikes(likes);
          } catch {
            // 좋아요 재동기화 실패는 세션 통계를 유지한다.
          }
        }
      });
    },
    [applyGalleryLikes, enqueue, transport, userId],
  );

  return { bookings, setBookings, waitlist, setWaitlist, galleryStats, setGalleryStats };
}
