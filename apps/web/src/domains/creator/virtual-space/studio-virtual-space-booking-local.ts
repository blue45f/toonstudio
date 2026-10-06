/**
 * 가상 스튜디오 예약·대기열·갤러리 좋아요의 로컬(IndexedDB) 영속 계층.
 *
 * 서버 정본 동기화(useStudioVirtualSpaceSocialSync)가 닿지 않는 경우 —
 * 게스트 세션, 서버 로드 실패 — 에도 예약과 좋아요가 새로고침 한 번에
 * 사라지지 않도록, 같은 scopeKey로 마지막 상태를 이 기기에 보관한다.
 * 서버 스냅샷이 도착하면 그 값이 정본이고 이 계층은 마지막으로 확정된
 * 상태의 캐시일 뿐이다. 게스트가 만든 로컬 예약은 자동 승격하지 않고,
 * 로그인 시 분리된 승격 보류 묶음(pending*)을 별도 필드로 함께 보관해
 * 스냅샷 교체와 로컬 덮어쓰기에도 사라지지 않게 한다(확인 후 승격).
 *
 * 저장 포맷 검증은 서버 동기화 계층(studio-virtual-space-booking-sync)의
 * accept* 함수를 그대로 재사용해 서버 계약과 같은 기준으로 거른다.
 * IndexedDB를 쓸 수 없는 환경에서는 idb-kv가 null/false를 돌려주므로
 * 이 계층은 조용히 무력화되고 기존 세션 동작으로 돌아간다.
 */
import { idbKvGet, idbKvSet } from "@/shared/lib/idb-kv";

import {
  acceptBookingsSnapshot,
  acceptGalleryLikes,
} from "./studio-virtual-space-booking-sync";
import type { StudioGalleryStats } from "./studio-virtual-space-gallery";
import type {
  StudioSpaceBooking,
  StudioSpaceWaitlistEntry,
} from "./studio-virtual-space-space-booking";

export interface StudioVirtualSpaceLocalSocialState {
  readonly bookings: readonly StudioSpaceBooking[];
  readonly waitlist: readonly StudioSpaceWaitlistEntry[];
  /** 조회수(views)는 세션 통계라 저장하지 않는다 — 좋아요 수와 누른 사람만. */
  readonly galleryLikes: StudioGalleryStats;
  /**
   * 승격 확인을 기다리는 게스트 로컬 예약·대기. 본 상태(bookings)와 섞으면
   * 서버 스냅샷 교체 때 함께 사라지므로 별도로 들고 다닌다. 저장 측이
   * 넘기지 않으면 빈 묶음으로 취급한다(기존 호출부 호환).
   */
  readonly pendingBookings?: readonly StudioSpaceBooking[];
  readonly pendingWaitlist?: readonly StudioSpaceWaitlistEntry[];
}

/** 로드 결과는 보류 묶음이 항상 정규화돼 있다. */
export interface StudioVirtualSpaceLoadedLocalSocial extends StudioVirtualSpaceLocalSocialState {
  readonly pendingBookings: readonly StudioSpaceBooking[];
  readonly pendingWaitlist: readonly StudioSpaceWaitlistEntry[];
}

const LOCAL_KEY_PREFIX = "toonstudio:vs-social:v1:";

export function studioVirtualSpaceLocalSocialKey(scopeKey: string): string {
  return `${LOCAL_KEY_PREFIX}${scopeKey}`;
}

/** 저장된 로컬 상태를 읽어 서버 계약과 같은 기준으로 검증한다. 없거나 깨졌으면 null. */
export async function loadStudioVirtualSpaceLocalSocial(
  scopeKey: string,
): Promise<StudioVirtualSpaceLoadedLocalSocial | null> {
  const raw = await idbKvGet(studioVirtualSpaceLocalSocialKey(scopeKey));
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const snapshot = acceptBookingsSnapshot(
    { scopeKey, bookings: record.bookings, waitlist: record.waitlist },
    scopeKey,
  );
  if (snapshot === null) return null;
  const galleryLikes = acceptGalleryLikes({ scopeKey, frames: record.frames }, scopeKey);
  if (galleryLikes === null) return null;
  // 보류 묶음은 본 상태와 같은 기준으로 검증하되, 여기가 깨졌다고 본 상태까지
  // 버리지는 않는다 — 보류만 빈 묶음으로 떨어뜨린다.
  const pending = acceptBookingsSnapshot(
    { scopeKey, bookings: record.pendingBookings ?? [], waitlist: record.pendingWaitlist ?? [] },
    scopeKey,
  );
  return {
    bookings: snapshot.bookings,
    waitlist: snapshot.waitlist,
    galleryLikes,
    pendingBookings: pending?.bookings ?? [],
    pendingWaitlist: pending?.waitlist ?? [],
  };
}

/** 현재 상태를 로컬에 쓴다. 실패해도 throw 하지 않는다(세션 동작이 폴백이다). */
export async function saveStudioVirtualSpaceLocalSocial(
  scopeKey: string,
  state: StudioVirtualSpaceLocalSocialState,
): Promise<void> {
  const frames: Record<string, { likes: number; likedBy: readonly string[] }> = {};
  for (const [frameId, frame] of Object.entries(state.galleryLikes)) {
    frames[frameId] = { likes: frame.likes, likedBy: frame.likedBy };
  }
  const payload = JSON.stringify({
    scopeKey,
    bookings: state.bookings,
    waitlist: state.waitlist,
    frames,
    pendingBookings: state.pendingBookings ?? [],
    pendingWaitlist: state.pendingWaitlist ?? [],
  });
  await idbKvSet(studioVirtualSpaceLocalSocialKey(scopeKey), payload);
}
