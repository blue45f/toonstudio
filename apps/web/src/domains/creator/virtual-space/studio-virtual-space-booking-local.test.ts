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
import type { StudioSpaceBooking } from "./studio-virtual-space-space-booking";

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
