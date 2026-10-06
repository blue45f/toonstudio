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
import {
  classifyPromotionFailure,
  EMPTY_STUDIO_GUEST_BOOKING_BUNDLE,
  extractGuestOnlyEntries,
  isStudioGuestBookingBundleEmpty,
  mergeGuestBookingBundles,
  removeGuestBookingBundleEntries,
  summarizePromotionOutcomes,
  type StudioGuestBookingBundle,
  type StudioPromotionItemOutcome,
  type StudioPromotionRunSummary,
} from "./studio-virtual-space-booking-promotion";

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
  /**
   * 로그인 전 로컬에만 있던 게스트 예약·대기 중 승격을 기다리는 묶음.
   * 서버 스냅샷 교체에서 분리해 별도로 들고, 로컬에도 따로 보관한다 —
   * 확인 전까지 본 상태에도, 버려지기 전까지 로컬 사본에서도 사라지지 않는다.
   */
  readonly guestBundle: StudioGuestBookingBundle;
  /** 확인한 게스트 항목을 서버 생성으로 이관한다. 진행 중 재호출은 무시된다. */
  readonly promoteGuestBundle: () => void;
  /** 보류 묶음을 버린다. 무엇을 버리는지는 호출부(UI)가 그 자리에서 고지한다. */
  readonly dismissGuestBundle: () => void;
  /** 마지막 승격 실행의 요약. 아직 실행한 적 없으면 null. */
  readonly promotionSummary: StudioPromotionRunSummary | null;
  readonly promotingGuestBundle: boolean;
  readonly clearPromotionSummary: () => void;
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
 * 언제나 그쪽이 정본이고 로컬 사본은 캐시로 강등된다.
 *
 * 게스트가 만든 로컬 예약은 자동 승격하지 않는다(확인 후 승격). 대신 서버
 * 스냅샷이 처음 닿는 순간, 스냅샷에 없는 로컬 전용 예약을 보류 묶음으로
 * 분리해 소실을 막는다. 보류 묶음은 로컬에도 별도 필드로 남아 앱을 닫았다
 * 다시 로그인해도 확인을 다시 띄울 수 있고, 사용자가 확인한 항목만 기존
 * 멱등 생성 경로로 서버에 이관한다.
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
  const [guestBundle, setGuestBundleState] = useState<StudioGuestBookingBundle>(
    EMPTY_STUDIO_GUEST_BOOKING_BUNDLE,
  );
  const [promotionSummary, setPromotionSummary] = useState<StudioPromotionRunSummary | null>(null);
  const [promotingGuestBundle, setPromotingGuestBundle] = useState(false);

  const bookingsRef = useRef(bookings);
  const waitlistRef = useRef(waitlist);
  const galleryStatsRef = useRef(galleryStats);
  const guestBundleRef = useRef(guestBundle);
  const readyRef = useRef(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  // 서버 정본에 처음 닿기 전, 현재 상태는 로컬 유래일 수 있다. 그 첫 접촉에서만
  // 게스트 항목을 분리한다 — 이후 스냅샷은 동기화 응답이라 분리 대상이 아니다.
  const guestSeparatedRef = useRef(false);
  const promotionRunningRef = useRef(false);
  const authedRef = useRef(false);
  authedRef.current = Boolean(enabled && userId);

  /** 로컬 전용 항목을 보류 묶음에 합친다. 빈 묶음이면 상태를 건드리지 않는다. */
  const holdGuestEntries = useCallback((extra: StudioGuestBookingBundle): void => {
    if (isStudioGuestBookingBundleEmpty(extra)) return;
    const merged = mergeGuestBookingBundles(guestBundleRef.current, extra);
    if (merged === guestBundleRef.current) return;
    guestBundleRef.current = merged;
    setGuestBundleState(merged);
  }, []);
  // 로컬 영속 가드: 하이드레이트가 끝나기 전에는 쓰지 않고, 서버 스냅샷이
  // 먼저 닿았거나 사용자가 먼저 손댄 범위는 로컬 사본으로 덮지 않는다.
  // 서버 접촉 판정은 데이터 종류별로 나눈다 — 좋아요만 성공하고 예약
  // 로드가 실패한 경우에도 예약은 로컬 사본으로 시작해야 하기 때문이다.
  const localReadyRef = useRef(false);
  const localDirtyRef = useRef(false);
  const serverBookingsTouchedRef = useRef(false);
  const serverLikesTouchedRef = useRef(false);

  const applyBookingsSnapshot = useCallback(
    (value: unknown): boolean => {
      const snapshot = acceptBookingsSnapshot(value, scopeRef.current);
      if (snapshot === null) return false;
      // 서버 정본과 처음 닿는 순간: 교체로 사라질 로컬 전용(게스트) 항목을
      // 먼저 보류 묶음으로 분리한다. 이후 스냅샷 적용은 이 분리를 반복하지
      // 않는다 — 동기화 응답에 없는 항목을 게스트로 오인하면 안 되기 때문이다.
      if (!guestSeparatedRef.current && authedRef.current) {
        guestSeparatedRef.current = true;
        holdGuestEntries(
          extractGuestOnlyEntries(
            { bookings: bookingsRef.current, waitlist: waitlistRef.current },
            snapshot,
          ),
        );
      }
      serverBookingsTouchedRef.current = true;
      bookingsRef.current = snapshot.bookings;
      waitlistRef.current = snapshot.waitlist;
      setBookingsState(snapshot.bookings);
      setWaitlistState(snapshot.waitlist);
      return true;
    },
    [holdGuestEntries],
  );

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

  /**
   * 확인된 보류 항목을 서버 생성으로 이관한다. 예약 id를 그대로 쓰는 멱등
   * 생성이라 재실행해도 정본은 하나만 남는다. 확정 거절(슬롯 충돌 등)은
   * 사유와 함께 결과에 남기고 보류에서 빼고, 일시 실패는 보류에 남긴다.
   * 예약자 이름은 본문 그대로 보내 서버가 보존하고 소유권만 계정에 붙는다.
   */
  const promoteGuestBundle = useCallback((): void => {
    if (promotionRunningRef.current || !readyRef.current) return;
    const bundle = guestBundleRef.current;
    if (isStudioGuestBookingBundleEmpty(bundle)) return;
    promotionRunningRef.current = true;
    setPromotingGuestBundle(true);
    const activeScope = scopeRef.current;
    enqueue(async () => {
      const outcomes: StudioPromotionItemOutcome[] = [];
      const resolvedBookingIds: string[] = [];
      const resolvedWaitlistIds: string[] = [];
      try {
        for (const booking of bundle.bookings) {
          try {
            const value = await transport.createBooking(activeScope, booking);
            if (scopeRef.current !== activeScope) return;
            if (applyBookingsSnapshot(value)) {
              outcomes.push({ kind: "booking", id: booking.id, status: "promoted" });
              resolvedBookingIds.push(booking.id);
            } else {
              outcomes.push({ kind: "booking", id: booking.id, status: "deferred" });
            }
          } catch (error) {
            if (scopeRef.current !== activeScope) return;
            const failure = classifyPromotionFailure(error);
            if (failure.kind === "rejected") {
              outcomes.push({ kind: "booking", id: booking.id, status: "rejected", code: failure.code });
              resolvedBookingIds.push(booking.id);
            } else {
              outcomes.push({ kind: "booking", id: booking.id, status: "deferred" });
            }
          }
        }
        for (const entry of bundle.waitlist) {
          try {
            const value = await transport.joinWaitlist(activeScope, entry);
            if (scopeRef.current !== activeScope) return;
            if (applyBookingsSnapshot(value)) {
              outcomes.push({ kind: "waitlist", id: entry.id, status: "promoted" });
              resolvedWaitlistIds.push(entry.id);
            } else {
              outcomes.push({ kind: "waitlist", id: entry.id, status: "deferred" });
            }
          } catch (error) {
            if (scopeRef.current !== activeScope) return;
            const failure = classifyPromotionFailure(error);
            if (failure.kind === "rejected") {
              outcomes.push({ kind: "waitlist", id: entry.id, status: "rejected", code: failure.code });
              resolvedWaitlistIds.push(entry.id);
            } else {
              outcomes.push({ kind: "waitlist", id: entry.id, status: "deferred" });
            }
          }
        }
        if (resolvedBookingIds.length > 0 || resolvedWaitlistIds.length > 0) {
          const next = removeGuestBookingBundleEntries(guestBundleRef.current, {
            bookingIds: resolvedBookingIds,
            waitlistIds: resolvedWaitlistIds,
          });
          guestBundleRef.current = next;
          setGuestBundleState(next);
        }
        setPromotionSummary(summarizePromotionOutcomes(outcomes));
      } finally {
        promotionRunningRef.current = false;
        setPromotingGuestBundle(false);
      }
    });
  }, [applyBookingsSnapshot, enqueue, transport]);

  const dismissGuestBundle = useCallback((): void => {
    guestBundleRef.current = EMPTY_STUDIO_GUEST_BOOKING_BUNDLE;
    setGuestBundleState(EMPTY_STUDIO_GUEST_BOOKING_BUNDLE);
  }, []);

  const clearPromotionSummary = useCallback((): void => {
    setPromotionSummary(null);
  }, []);

  // 로컬(IndexedDB) 하이드레이트: 서버 도달 여부와 무관하게 직전 방문의
  // 마지막 확정 상태로 시작한다. 서버 스냅샷이 먼저 도착했거나 사용자가
  // 먼저 손댔으면 로컬 사본은 버리고, 사용자가 먼저 손댄 경우에는 그
  // 현재 상태를 곧바로 로컬에 남긴다.
  useEffect(() => {
    localReadyRef.current = false;
    localDirtyRef.current = false;
    serverBookingsTouchedRef.current = false;
    serverLikesTouchedRef.current = false;
    guestSeparatedRef.current = false;
    guestBundleRef.current = EMPTY_STUDIO_GUEST_BOOKING_BUNDLE;
    setGuestBundleState(EMPTY_STUDIO_GUEST_BOOKING_BUNDLE);
    setPromotionSummary(null);
    let cancelled = false;
    void loadStudioVirtualSpaceLocalSocial(scopeKey).then((local) => {
      localReadyRef.current = true;
      if (cancelled) return;
      if (localDirtyRef.current) {
        void saveStudioVirtualSpaceLocalSocial(scopeKey, {
          bookings: bookingsRef.current,
          waitlist: waitlistRef.current,
          galleryLikes: galleryStatsRef.current,
          pendingBookings: guestBundleRef.current.bookings,
          pendingWaitlist: guestBundleRef.current.waitlist,
        });
        return;
      }
      if (local === null) return;
      // 이전 방문에서 확인을 미룬 보류 묶음은 그대로 복원한다 — 다음 로그인에서
      // 남은 항목으로 확인을 다시 띄우기 위한 것이다.
      holdGuestEntries({ bookings: local.pendingBookings, waitlist: local.pendingWaitlist });
      if (!serverBookingsTouchedRef.current) {
        bookingsRef.current = local.bookings;
        waitlistRef.current = local.waitlist;
        setBookingsState(local.bookings);
        setWaitlistState(local.waitlist);
      } else if (authedRef.current) {
        // 서버 정본이 먼저 닿아 로컬 사본이 상태에 오르지 못한 경우에도,
        // 정본에 없는 로컬 전용 항목은 버리지 않고 보류로 분리한다(소실 방지).
        holdGuestEntries(
          extractGuestOnlyEntries(local, {
            bookings: bookingsRef.current,
            waitlist: waitlistRef.current,
          }),
        );
      }
      if (!serverLikesTouchedRef.current) mergeGalleryLikes(local.galleryLikes);
    });
    return () => {
      cancelled = true;
    };
  }, [holdGuestEntries, mergeGalleryLikes, scopeKey]);

  // 상태가 바뀔 때마다 로컬 사본을 갱신한다(하이드레이트가 끝난 뒤에만).
  // 서버 스냅샷 적용 직후에도 발화하므로 로컬 사본은 마지막 확정 상태를
  // 따라가며, 서버에 닿지 못한 방문에서는 그 사본이 다음 방문의 시작점이다.
  // 보류 묶음은 본 상태와 섞지 않고 별도 필드로 함께 기록한다 — 그래야
  // 스냅샷 교체로 본 상태가 서버 정본으로 덮여도 보류분은 지워지지 않는다.
  useEffect(() => {
    if (!localReadyRef.current) return;
    void saveStudioVirtualSpaceLocalSocial(scopeRef.current, {
      bookings,
      waitlist,
      galleryLikes: galleryStats,
      pendingBookings: guestBundle.bookings,
      pendingWaitlist: guestBundle.waitlist,
    });
  }, [bookings, waitlist, galleryStats, guestBundle]);

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

  return {
    bookings,
    setBookings,
    waitlist,
    setWaitlist,
    galleryStats,
    setGalleryStats,
    guestBundle,
    promoteGuestBundle,
    dismissGuestBundle,
    promotionSummary,
    promotingGuestBundle,
    clearPromotionSummary,
  };
}
