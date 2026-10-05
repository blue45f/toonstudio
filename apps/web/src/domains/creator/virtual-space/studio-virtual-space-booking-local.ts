/**
 * 가상 스튜디오 예약·대기열·갤러리 좋아요의 로컬(IndexedDB) 영속 계층.
 *
 * 서버 정본 동기화(useStudioVirtualSpaceSocialSync)가 닿지 않는 경우 —
 * 게스트 세션, 서버 로드 실패 — 에도 예약과 좋아요가 새로고침 한 번에
 * 사라지지 않도록, 같은 scopeKey로 마지막 상태를 이 기기에 보관한다.
 * 서버 스냅샷이 도착하면 그 값이 정본이고 이 계층은 마지막으로 확정된
 * 상태의 캐시일 뿐이다. 게스트가 만든 로컬 예약을 로그인 계정으로 자동
 * 승격하지는 않는다(승격은 서버 계약·정책이 정해지면 그때 연결한다).
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
}

const LOCAL_KEY_PREFIX = "toonstudio:vs-social:v1:";

export function studioVirtualSpaceLocalSocialKey(scopeKey: string): string {
  return `${LOCAL_KEY_PREFIX}${scopeKey}`;
}

/** 저장된 로컬 상태를 읽어 서버 계약과 같은 기준으로 검증한다. 없거나 깨졌으면 null. */
export async function loadStudioVirtualSpaceLocalSocial(
  scopeKey: string,
): Promise<StudioVirtualSpaceLocalSocialState | null> {
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
  return { bookings: snapshot.bookings, waitlist: snapshot.waitlist, galleryLikes };
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
  });
  await idbKvSet(studioVirtualSpaceLocalSocialKey(scopeKey), payload);
}
