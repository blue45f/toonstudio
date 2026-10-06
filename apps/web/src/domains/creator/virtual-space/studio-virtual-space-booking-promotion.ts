/**
 * 게스트 로컬 예약의 계정 승격(확인 후 승격) 순수 로직.
 *
 * 로그인하면 서버 스냅샷이 정본으로 상태를 교체하는데, 게스트가 로컬에만
 * 만든 예약은 스냅샷에 없어 그대로 사라졌다. 이 모듈은 스냅샷 교체 직전에
 * "서버에 없는 로컬 전용 항목"을 보류 묶음으로 분리하고, 승격 결과를
 * 항목별로 분류하는 규칙을 담는다. 실제 전송·상태 관리는 동기화 훅이 맡고
 * 여기는 판정만 한다.
 *
 * 서버 계약(실측): 생성은 로컬 예약 id를 그대로 쓰는 멱등 생성이라 같은
 * id·같은 소유자로 다시 보내도 정본은 하나만 남는다. 슬롯이 겹치거나
 * 다른 소유자가 같은 id를 이미 처리했으면 서버가 409로 거절하고, 지난
 * 시간 등 입력이 무효하면 400으로 거절한다. 예약자 이름(bookerNames)은
 * 본문 그대로 보존되고 소유권(createdByUserId)만 계정에 붙는다.
 */
import { StudioVirtualSpaceSocialRequestError } from "./studio-virtual-space-booking-sync";
import type {
  StudioSpaceBooking,
  StudioSpaceWaitlistEntry,
} from "./studio-virtual-space-space-booking";

/** 승격을 기다리는 로컬 전용 예약·대기 묶음. */
export interface StudioGuestBookingBundle {
  readonly bookings: readonly StudioSpaceBooking[];
  readonly waitlist: readonly StudioSpaceWaitlistEntry[];
}

export const EMPTY_STUDIO_GUEST_BOOKING_BUNDLE: StudioGuestBookingBundle = {
  bookings: [],
  waitlist: [],
};

export function isStudioGuestBookingBundleEmpty(bundle: StudioGuestBookingBundle): boolean {
  return bundle.bookings.length === 0 && bundle.waitlist.length === 0;
}

interface BookingCollections {
  readonly bookings: readonly StudioSpaceBooking[];
  readonly waitlist: readonly StudioSpaceWaitlistEntry[];
}

/**
 * 로컬 항목 중 서버 스냅샷에 없는 것만 보류 후보로 분리한다.
 * 취소된 로컬 예약은 서버에 만들 이유가 없어 제외하고, 확정 예약과
 * 대기 신청만 승격 대상으로 삼는다.
 */
export function extractGuestOnlyEntries(
  local: BookingCollections,
  snapshot: BookingCollections,
): StudioGuestBookingBundle {
  const snapshotBookingIds = new Set(snapshot.bookings.map((booking) => booking.id));
  const snapshotWaitlistIds = new Set(snapshot.waitlist.map((entry) => entry.id));
  return {
    bookings: local.bookings.filter(
      (booking) => booking.status === "confirmed" && !snapshotBookingIds.has(booking.id),
    ),
    waitlist: local.waitlist.filter((entry) => !snapshotWaitlistIds.has(entry.id)),
  };
}

/** 두 보류 묶음을 id 기준으로 합친다. 먼저 온 묶음의 순서와 내용을 우선한다. */
export function mergeGuestBookingBundles(
  base: StudioGuestBookingBundle,
  extra: StudioGuestBookingBundle,
): StudioGuestBookingBundle {
  if (isStudioGuestBookingBundleEmpty(extra)) return base;
  if (isStudioGuestBookingBundleEmpty(base)) return extra;
  const bookingIds = new Set(base.bookings.map((booking) => booking.id));
  const waitlistIds = new Set(base.waitlist.map((entry) => entry.id));
  return {
    bookings: [...base.bookings, ...extra.bookings.filter((booking) => !bookingIds.has(booking.id))],
    waitlist: [...base.waitlist, ...extra.waitlist.filter((entry) => !waitlistIds.has(entry.id))],
  };
}

/** 해결된(승격됐거나 확정 거절된) 항목을 보류 묶음에서 뺀다. */
export function removeGuestBookingBundleEntries(
  bundle: StudioGuestBookingBundle,
  resolved: { readonly bookingIds: readonly string[]; readonly waitlistIds: readonly string[] },
): StudioGuestBookingBundle {
  const bookingIds = new Set(resolved.bookingIds);
  const waitlistIds = new Set(resolved.waitlistIds);
  if (bookingIds.size === 0 && waitlistIds.size === 0) return bundle;
  return {
    bookings: bundle.bookings.filter((booking) => !bookingIds.has(booking.id)),
    waitlist: bundle.waitlist.filter((entry) => !waitlistIds.has(entry.id)),
  };
}

// ---------------------------------------------------------------------------
// 승격 실패 분류
// ---------------------------------------------------------------------------

/** 다시 보내도 결과가 바뀌지 않는 거절 사유. 사용자에게 그대로 표시한다. */
export type StudioPromotionRejectCode =
  | "slot-taken"
  | "already-processed"
  | "past-start"
  | "invalid";

export type StudioPromotionFailure =
  | { readonly kind: "rejected"; readonly code: StudioPromotionRejectCode }
  | { readonly kind: "retryable" };

/**
 * 승격 전송 실패를 "확정 거절"과 "일시 실패"로 가른다.
 * 확정 거절은 보류에서 빼고 사유를 표시하고, 일시 실패(네트워크·5xx)는
 * 보류에 남겨 다음 기회(다음 로그인·재시도)에 다시 승격할 수 있게 한다.
 * 서버 문구는 실측한 문구를 기준으로 하되, 낯선 409는 슬롯 충돌로
 * 단정하지 않고 already-processed와 구분되는 기본 거절로 둔다.
 */
export function classifyPromotionFailure(error: unknown): StudioPromotionFailure {
  if (!(error instanceof StudioVirtualSpaceSocialRequestError)) return { kind: "retryable" };
  const message = error.serverMessage ?? "";
  if (error.status === 409) {
    if (message.includes("시간대")) return { kind: "rejected", code: "slot-taken" };
    if (message.includes("이미 처리된")) return { kind: "rejected", code: "already-processed" };
    return { kind: "rejected", code: "invalid" };
  }
  if (error.status === 400) {
    if (message.includes("과거")) return { kind: "rejected", code: "past-start" };
    return { kind: "rejected", code: "invalid" };
  }
  if (error.status === 401 || error.status === 403) return { kind: "rejected", code: "invalid" };
  return { kind: "retryable" };
}

// ---------------------------------------------------------------------------
// 승격 결과
// ---------------------------------------------------------------------------

export type StudioPromotionItemKind = "booking" | "waitlist";

export interface StudioPromotionItemOutcome {
  readonly kind: StudioPromotionItemKind;
  readonly id: string;
  readonly status: "promoted" | "rejected" | "deferred";
  /** status가 rejected일 때만 있다. */
  readonly code?: StudioPromotionRejectCode;
}

export interface StudioPromotionRunSummary {
  readonly outcomes: readonly StudioPromotionItemOutcome[];
  readonly promotedCount: number;
  /** 확정 거절 — 사유와 함께 사용자에게 표시한다. */
  readonly rejected: readonly StudioPromotionItemOutcome[];
  /** 일시 실패로 보류에 남은 수 — 다음에 다시 시도한다. */
  readonly deferredCount: number;
}

export function summarizePromotionOutcomes(
  outcomes: readonly StudioPromotionItemOutcome[],
): StudioPromotionRunSummary {
  return {
    outcomes,
    promotedCount: outcomes.filter((outcome) => outcome.status === "promoted").length,
    rejected: outcomes.filter((outcome) => outcome.status === "rejected"),
    deferredCount: outcomes.filter((outcome) => outcome.status === "deferred").length,
  };
}
