// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { idbKvGet, idbKvSet } from "@/shared/lib/idb-kv";

import {
  loadStudioVirtualSpaceLocalSocial,
  saveStudioVirtualSpaceLocalSocial,
  studioVirtualSpaceLocalSocialKey,
} from "./studio-virtual-space-booking-local";
import type {
  StudioSpaceBooking,
  StudioSpaceWaitlistEntry,
} from "./studio-virtual-space-space-booking";

const SCOPE = '["proj-1","office"]';

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

describe("studio-virtual-space-booking-local", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory());
  });

  it("저장한 예약·대기열·좋아요를 같은 scopeKey로 다시 읽는다", async () => {
    await saveStudioVirtualSpaceLocalSocial(SCOPE, {
      bookings: [booking()],
      waitlist: [],
      galleryLikes: { "frame-1": { views: 7, likes: 3, likedBy: ["guest-a"] } },
    });
    const loaded = await loadStudioVirtualSpaceLocalSocial(SCOPE);
    expect(loaded?.bookings).toHaveLength(1);
    expect(loaded?.bookings[0]?.id).toBe("b1");
    // 조회수는 세션 통계라 저장·복원 대상이 아니다.
    expect(loaded?.galleryLikes["frame-1"]).toEqual({ views: 0, likes: 3, likedBy: ["guest-a"] });
  });

  it("승격 보류 묶음도 함께 저장·복원된다", async () => {
    const entry: StudioSpaceWaitlistEntry = {
      id: "w1",
      spaceId: "booth",
      spaceName: "녹음부스",
      capacity: 2,
      equipmentTags: [],
      startsAt: 3_000,
      endsAt: 4_000,
      bookerNames: ["이작가"],
      note: "",
      requestedAt: 500,
    };
    await saveStudioVirtualSpaceLocalSocial(SCOPE, {
      bookings: [],
      waitlist: [],
      galleryLikes: {},
      pendingBookings: [booking({ id: "guest-1" })],
      pendingWaitlist: [entry],
    });
    const loaded = await loadStudioVirtualSpaceLocalSocial(SCOPE);
    expect(loaded?.pendingBookings.map((item) => item.id)).toEqual(["guest-1"]);
    expect(loaded?.pendingWaitlist).toEqual([entry]);
  });

  it("보류 필드가 없는 옛 저장본은 빈 묶음으로 읽힌다", async () => {
    await saveStudioVirtualSpaceLocalSocial(SCOPE, {
      bookings: [booking()],
      waitlist: [],
      galleryLikes: {},
    });
    const loaded = await loadStudioVirtualSpaceLocalSocial(SCOPE);
    expect(loaded?.pendingBookings).toEqual([]);
    expect(loaded?.pendingWaitlist).toEqual([]);
  });

  it("보류 묶음만 깨졌으면 본 상태는 살리고 보류만 비운다", async () => {
    await idbKvSet(
      studioVirtualSpaceLocalSocialKey(SCOPE),
      JSON.stringify({
        scopeKey: SCOPE,
        bookings: [booking()],
        waitlist: [],
        frames: {},
        pendingBookings: [{ id: 42 }],
        pendingWaitlist: [],
      }),
    );
    const loaded = await loadStudioVirtualSpaceLocalSocial(SCOPE);
    expect(loaded?.bookings).toHaveLength(1);
    expect(loaded?.pendingBookings).toEqual([]);
  });

  it("다른 scopeKey의 데이터는 읽지 않는다", async () => {
    await saveStudioVirtualSpaceLocalSocial(SCOPE, {
      bookings: [booking()],
      waitlist: [],
      galleryLikes: {},
    });
    expect(await loadStudioVirtualSpaceLocalSocial('["proj-2","office"]')).toBeNull();
  });

  it("저장된 값이 깨졌으면 null을 돌려준다", async () => {
    await idbKvSet(studioVirtualSpaceLocalSocialKey(SCOPE), "{not-json");
    expect(await loadStudioVirtualSpaceLocalSocial(SCOPE)).toBeNull();
    await idbKvSet(
      studioVirtualSpaceLocalSocialKey(SCOPE),
      JSON.stringify({ scopeKey: SCOPE, bookings: [{ id: 42 }], waitlist: [], frames: {} }),
    );
    expect(await loadStudioVirtualSpaceLocalSocial(SCOPE)).toBeNull();
  });

  it("IndexedDB가 없으면 저장·읽기 모두 조용히 무력화된다", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(
      saveStudioVirtualSpaceLocalSocial(SCOPE, { bookings: [], waitlist: [], galleryLikes: {} }),
    ).resolves.toBeUndefined();
    expect(await loadStudioVirtualSpaceLocalSocial(SCOPE)).toBeNull();
    expect(await idbKvGet(studioVirtualSpaceLocalSocialKey(SCOPE))).toBeNull();
  });
});
