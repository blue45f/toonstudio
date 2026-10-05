// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { act, renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadStudioVirtualSpaceLocalSocial,
} from "./studio-virtual-space-booking-local";
import type { StudioSpaceBooking } from "./studio-virtual-space-space-booking";
import type { StudioVirtualSpaceSocialTransport } from "./studio-virtual-space-booking-sync";
import { useStudioVirtualSpaceSocialSync } from "./use-studio-virtual-space-social-sync";

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

function snapshotJson(bookings: readonly StudioSpaceBooking[]) {
  return { scopeKey: SCOPE, bookings, waitlist: [] };
}

function fakeTransport(overrides: Partial<StudioVirtualSpaceSocialTransport> = {}) {
  return {
    loadBookings: vi.fn(async () => snapshotJson([])),
    createBooking: vi.fn(async (_scope: string, created: StudioSpaceBooking) =>
      snapshotJson([created]),
    ),
    cancelBooking: vi.fn(async () => snapshotJson([])),
    joinWaitlist: vi.fn(async () => snapshotJson([])),
    leaveWaitlist: vi.fn(async () => snapshotJson([])),
    loadGalleryLikes: vi.fn(async () => ({ scopeKey: SCOPE, frames: {} })),
    toggleGalleryLike: vi.fn(async () => ({ frameId: "frame-1", likes: 1, likedBy: ["user-1"] })),
    ...overrides,
  } satisfies StudioVirtualSpaceSocialTransport;
}

function renderGuest(transport: StudioVirtualSpaceSocialTransport) {
  return renderHook(() =>
    useStudioVirtualSpaceSocialSync({
      projectId: "proj-1",
      worldScope: "office",
      userId: null,
      enabled: false,
      transport,
    }),
  );
}

function renderUser(transport: StudioVirtualSpaceSocialTransport) {
  return renderHook(() =>
    useStudioVirtualSpaceSocialSync({
      projectId: "proj-1",
      worldScope: "office",
      userId: "user-1",
      enabled: true,
      transport,
    }),
  );
}

describe("useStudioVirtualSpaceSocialSync 로컬 영속", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory());
  });

  it("게스트가 만든 예약은 새로고침(재마운트)해도 로컬에서 복원된다", async () => {
    const transport = fakeTransport();
    const first = renderGuest(transport);
    await waitFor(() => expect(first.result.current.bookings).toEqual([]));
    act(() => first.result.current.setBookings([booking()]));
    await waitFor(async () => {
      expect((await loadStudioVirtualSpaceLocalSocial(SCOPE))?.bookings).toHaveLength(1);
    });
    first.unmount();

    const second = renderGuest(transport);
    await waitFor(() => expect(second.result.current.bookings).toHaveLength(1));
    expect(second.result.current.bookings[0]?.id).toBe("b1");
    expect(transport.loadBookings).not.toHaveBeenCalled();
  });

  it("게스트가 누른 갤러리 좋아요도 로컬에 남아 복원된다", async () => {
    const transport = fakeTransport();
    const first = renderGuest(transport);
    act(() =>
      first.result.current.setGalleryStats({
        "frame-1": { views: 2, likes: 1, likedBy: ["guest"] },
      }),
    );
    await waitFor(async () => {
      expect((await loadStudioVirtualSpaceLocalSocial(SCOPE))?.galleryLikes["frame-1"]?.likes).toBe(1);
    });
    first.unmount();

    const second = renderGuest(transport);
    await waitFor(() => expect(second.result.current.galleryStats["frame-1"]?.likes).toBe(1));
    expect(second.result.current.galleryStats["frame-1"]?.likedBy).toEqual(["guest"]);
  });

  it("서버 스냅샷이 도착하면 낡은 로컬 사본보다 서버 정본이 이긴다", async () => {
    const { saveStudioVirtualSpaceLocalSocial } = await import("./studio-virtual-space-booking-local");
    await saveStudioVirtualSpaceLocalSocial(SCOPE, {
      bookings: [booking({ id: "local-only" })],
      waitlist: [],
      galleryLikes: {},
    });
    const transport = fakeTransport({
      loadBookings: vi.fn(async () => snapshotJson([booking({ id: "server-1" })])),
    });
    const view = renderUser(transport);
    await waitFor(() => expect(view.result.current.bookings.map((entry) => entry.id)).toEqual(["server-1"]));
    // 로컬 사본도 서버 정본으로 따라간다.
    await waitFor(async () => {
      expect((await loadStudioVirtualSpaceLocalSocial(SCOPE))?.bookings.map((entry) => entry.id)).toEqual(["server-1"]);
    });
  });

  it("서버에 닿지 못하면 로컬 사본으로 시작한다", async () => {
    const { saveStudioVirtualSpaceLocalSocial } = await import("./studio-virtual-space-booking-local");
    await saveStudioVirtualSpaceLocalSocial(SCOPE, {
      bookings: [booking({ id: "offline-1" })],
      waitlist: [],
      galleryLikes: {},
    });
    const transport = fakeTransport({
      loadBookings: vi.fn(async () => {
        throw new Error("network down");
      }),
    });
    const view = renderUser(transport);
    await waitFor(() => expect(view.result.current.bookings.map((entry) => entry.id)).toEqual(["offline-1"]));
  });
});
