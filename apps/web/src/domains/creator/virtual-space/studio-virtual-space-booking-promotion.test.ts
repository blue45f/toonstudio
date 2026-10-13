import { describe, expect, it } from "vitest";

import {
  classifyPromotionFailure,
  extractGuestOnlyEntries,
  isStudioGuestBookingBundleEmpty,
  mergeGuestBookingBundles,
  removeGuestBookingBundleEntries,
  summarizePromotionOutcomes,
  type StudioPromotionItemOutcome,
} from "./studio-virtual-space-booking-promotion";
import { StudioVirtualSpaceSocialRequestError } from "./studio-virtual-space-booking-sync";
import type {
  StudioSpaceBooking,
  StudioSpaceWaitlistEntry,
} from "./studio-virtual-space-space-booking";

function booking(overrides: Partial<StudioSpaceBooking> = {}): StudioSpaceBooking {
  return {
    id: "b1",
    spaceId: "booth",
    spaceName: "녹음부스",
    capacity: 2,
    equipmentTags: [],
    startsAt: 1_000,
    endsAt: 2_000,
    bookerNames: ["김작가"],
    note: "",
    status: "confirmed",
    ...overrides,
  };
}

function waitlistEntry(overrides: Partial<StudioSpaceWaitlistEntry> = {}): StudioSpaceWaitlistEntry {
  const { status: _unused, ...base } = booking();
  return { ...base, requestedAt: 500, ...overrides };
}

describe("extractGuestOnlyEntries", () => {
  it("스냅샷에 없는 확정 예약과 대기만 분리한다", () => {
    const bundle = extractGuestOnlyEntries(
      {
        bookings: [booking(), booking({ id: "b2" }), booking({ id: "b3", status: "cancelled" })],
        waitlist: [waitlistEntry(), waitlistEntry({ id: "w2" })],
      },
      { bookings: [booking({ id: "b2" })], waitlist: [waitlistEntry({ id: "w2" })] },
    );
    expect(bundle.bookings.map((entry) => entry.id)).toEqual(["b1"]);
    expect(bundle.waitlist.map((entry) => entry.id)).toEqual(["b1"]);
  });

  it("전부 스냅샷에 있으면 빈 묶음이다", () => {
    const bundle = extractGuestOnlyEntries(
      { bookings: [booking()], waitlist: [] },
      { bookings: [booking()], waitlist: [] },
    );
    expect(isStudioGuestBookingBundleEmpty(bundle)).toBe(true);
  });
});

describe("mergeGuestBookingBundles / removeGuestBookingBundleEntries", () => {
  it("병합은 id 중복 없이 먼저 온 순서를 지킨다", () => {
    const merged = mergeGuestBookingBundles(
      { bookings: [booking()], waitlist: [] },
      { bookings: [booking({ note: "다른 사본" }), booking({ id: "b2" })], waitlist: [waitlistEntry()] },
    );
    expect(merged.bookings.map((entry) => entry.id)).toEqual(["b1", "b2"]);
    expect(merged.bookings[0]?.note).toBe("");
    expect(merged.waitlist).toHaveLength(1);
  });

  it("해결된 항목만 빠지고 나머지는 남는다", () => {
    const next = removeGuestBookingBundleEntries(
      { bookings: [booking(), booking({ id: "b2" })], waitlist: [waitlistEntry()] },
      { bookingIds: ["b1"], waitlistIds: [] },
    );
    expect(next.bookings.map((entry) => entry.id)).toEqual(["b2"]);
    expect(next.waitlist).toHaveLength(1);
  });
});

describe("classifyPromotionFailure", () => {
  it("슬롯 충돌 409는 slot-taken이다", () => {
    expect(
      classifyPromotionFailure(
        new StudioVirtualSpaceSocialRequestError(409, "선택한 시간대에 이미 예약이 있어요."),
      ),
    ).toEqual({ kind: "rejected", code: "slot-taken" });
  });

  it("다른 소유자가 같은 id를 처리한 409는 already-processed다", () => {
    expect(
      classifyPromotionFailure(new StudioVirtualSpaceSocialRequestError(409, "이미 처리된 예약이에요.")),
    ).toEqual({ kind: "rejected", code: "already-processed" });
  });

  it("낯선 409는 슬롯 충돌로 단정하지 않는다", () => {
    expect(classifyPromotionFailure(new StudioVirtualSpaceSocialRequestError(409, null))).toEqual({
      kind: "rejected",
      code: "invalid",
    });
  });

  it("과거 시간 400은 past-start, 그 외 400·인증 거절은 invalid다", () => {
    expect(
      classifyPromotionFailure(new StudioVirtualSpaceSocialRequestError(400, "과거 시간에는 예약할 수 없어요.")),
    ).toEqual({ kind: "rejected", code: "past-start" });
    expect(classifyPromotionFailure(new StudioVirtualSpaceSocialRequestError(400, "예약 정보가 올바르지 않습니다."))).toEqual({
      kind: "rejected",
      code: "invalid",
    });
    expect(classifyPromotionFailure(new StudioVirtualSpaceSocialRequestError(403, "로그인이 필요합니다."))).toEqual({
      kind: "rejected",
      code: "invalid",
    });
  });

  it("네트워크 오류와 5xx는 재시도 가능으로 남긴다", () => {
    expect(classifyPromotionFailure(new Error("network down"))).toEqual({ kind: "retryable" });
    expect(classifyPromotionFailure(new StudioVirtualSpaceSocialRequestError(502, null))).toEqual({
      kind: "retryable",
    });
  });
});

describe("summarizePromotionOutcomes", () => {
  it("승격·거절·보류를 집계한다", () => {
    const outcomes: StudioPromotionItemOutcome[] = [
      { kind: "booking", id: "b1", status: "promoted" },
      { kind: "booking", id: "b2", status: "rejected", code: "slot-taken" },
      { kind: "waitlist", id: "w1", status: "deferred" },
    ];
    const summary = summarizePromotionOutcomes(outcomes);
    expect(summary.promotedCount).toBe(1);
    expect(summary.rejected).toEqual([outcomes[1]]);
    expect(summary.deferredCount).toBe(1);
  });
});
