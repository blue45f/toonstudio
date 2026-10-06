// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { act, renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadStudioVirtualSpaceLocalSocial,
  saveStudioVirtualSpaceLocalSocial,
} from "./studio-virtual-space-booking-local";
import {
  StudioVirtualSpaceSocialRequestError,
  type StudioVirtualSpaceSocialTransport,
} from "./studio-virtual-space-booking-sync";
import type {
  StudioSpaceBooking,
  StudioSpaceWaitlistEntry,
} from "./studio-virtual-space-space-booking";
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

function waitlistEntry(overrides: Partial<StudioSpaceWaitlistEntry> = {}): StudioSpaceWaitlistEntry {
  const { status: _unused, ...base } = booking();
  return { ...base, requestedAt: 500, ...overrides };
}

function snapshotJson(
  bookings: readonly StudioSpaceBooking[],
  waitlist: readonly StudioSpaceWaitlistEntry[] = [],
) {
  return { scopeKey: SCOPE, bookings, waitlist };
}

function fakeTransport(overrides: Partial<StudioVirtualSpaceSocialTransport> = {}) {
  return {
    loadBookings: vi.fn(async () => snapshotJson([])),
    createBooking: vi.fn(async (_scope: string, created: StudioSpaceBooking) =>
      snapshotJson([created]),
    ),
    cancelBooking: vi.fn(async () => snapshotJson([])),
    joinWaitlist: vi.fn(async (_scope: string, entry: StudioSpaceWaitlistEntry) =>
      snapshotJson([], [entry]),
    ),
    leaveWaitlist: vi.fn(async () => snapshotJson([])),
    loadGalleryLikes: vi.fn(async () => ({ scopeKey: SCOPE, frames: {} })),
    toggleGalleryLike: vi.fn(async () => ({ frameId: "frame-1", likes: 1, likedBy: ["user-1"] })),
    ...overrides,
  } satisfies StudioVirtualSpaceSocialTransport;
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

async function seedGuestLocal(): Promise<void> {
  await saveStudioVirtualSpaceLocalSocial(SCOPE, {
    bookings: [booking({ id: "guest-1" }), booking({ id: "guest-2", bookerNames: ["이작가", "박작가"] })],
    waitlist: [],
    galleryLikes: {},
  });
}

describe("게스트 예약 확인 후 승격", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory());
  });

  it("로그인하면 게스트 예약이 사라지지 않고 보류 묶음으로 분리된다", async () => {
    await seedGuestLocal();
    const transport = fakeTransport({
      loadBookings: vi.fn(async () => snapshotJson([booking({ id: "server-1" })])),
    });
    const view = renderUser(transport);
    await waitFor(() => expect(view.result.current.bookings.map((entry) => entry.id)).toEqual(["server-1"]));
    await waitFor(() =>
      expect(view.result.current.guestBundle.bookings.map((entry) => entry.id)).toEqual(["guest-1", "guest-2"]),
    );
    // 로컬 사본에서도 본 상태는 서버 정본을 따르고 보류분은 별도로 남는다.
    await waitFor(async () => {
      const local = await loadStudioVirtualSpaceLocalSocial(SCOPE);
      expect(local?.bookings.map((entry) => entry.id)).toEqual(["server-1"]);
      expect(local?.pendingBookings.map((entry) => entry.id)).toEqual(["guest-1", "guest-2"]);
    });
  });

  it("게스트로 만든 직후 같은 화면에서 로그인해도 예약이 보류로 분리된다", async () => {
    const transport = fakeTransport({
      loadBookings: vi.fn(async () => snapshotJson([booking({ id: "server-1" })])),
    });
    const session: { userId: string | null; enabled: boolean } = { userId: null, enabled: false };
    const view = renderHook(() =>
      useStudioVirtualSpaceSocialSync({
        projectId: "proj-1",
        worldScope: "office",
        userId: session.userId,
        enabled: session.enabled,
        transport,
      }),
    );
    await waitFor(() => expect(view.result.current.bookings).toEqual([]));
    act(() => view.result.current.setBookings([booking({ id: "guest-live" })]));
    expect(transport.loadBookings).not.toHaveBeenCalled();

    // 같은 화면이 마운트된 채로 로그인 상태로 바뀐다.
    session.userId = "user-1";
    session.enabled = true;
    view.rerender();
    await waitFor(() =>
      expect(view.result.current.guestBundle.bookings.map((entry) => entry.id)).toEqual(["guest-live"]),
    );
    expect(view.result.current.bookings.map((entry) => entry.id)).toEqual(["server-1"]);
  });

  it("확인하면 보류 항목만 서버로 이관하고, 충돌은 사유와 함께 남긴다", async () => {
    await seedGuestLocal();
    const serverBooking = booking({ id: "server-1" });
    const transport = fakeTransport({
      loadBookings: vi.fn(async () => snapshotJson([serverBooking])),
      createBooking: vi.fn(async (_scope: string, created: StudioSpaceBooking) => {
        if (created.id === "guest-2") {
          throw new StudioVirtualSpaceSocialRequestError(409, "선택한 시간대에 이미 예약이 있어요.");
        }
        return snapshotJson([serverBooking, created]);
      }),
    });
    const view = renderUser(transport);
    await waitFor(() => expect(view.result.current.guestBundle.bookings).toHaveLength(2));

    act(() => view.result.current.promoteGuestBundle());
    await waitFor(() => expect(view.result.current.promotionSummary).not.toBeNull());

    const summary = view.result.current.promotionSummary;
    expect(summary?.promotedCount).toBe(1);
    expect(summary?.rejected).toEqual([
      { kind: "booking", id: "guest-2", status: "rejected", code: "slot-taken" },
    ]);
    expect(summary?.deferredCount).toBe(0);
    expect(view.result.current.guestBundle.bookings).toEqual([]);
    expect(view.result.current.bookings.map((entry) => entry.id)).toEqual(["server-1", "guest-1"]);
    // 예약자 이름은 치환하지 않고 본문 그대로 서버에 보낸다.
    expect(transport.createBooking).toHaveBeenCalledWith(
      SCOPE,
      expect.objectContaining({ id: "guest-2", bookerNames: ["이작가", "박작가"] }),
    );
    // 해결된 보류는 로컬에서도 비워진다.
    await waitFor(async () => {
      expect((await loadStudioVirtualSpaceLocalSocial(SCOPE))?.pendingBookings).toEqual([]);
    });
  });

  it("확인하지 않은 보류는 앱을 다시 열어도(재마운트) 그대로 남는다", async () => {
    await seedGuestLocal();
    const transport = fakeTransport({
      loadBookings: vi.fn(async () => snapshotJson([booking({ id: "server-1" })])),
    });
    const first = renderUser(transport);
    await waitFor(() => expect(first.result.current.guestBundle.bookings).toHaveLength(2));
    first.unmount();

    const second = renderUser(transport);
    await waitFor(() =>
      expect(second.result.current.guestBundle.bookings.map((entry) => entry.id)).toEqual(["guest-1", "guest-2"]),
    );
    expect(transport.createBooking).not.toHaveBeenCalled();
  });

  it("승격을 두 번 눌러도 항목당 한 번만 보내고, 다 끝난 뒤에는 다시 보내지 않는다", async () => {
    await seedGuestLocal();
    const transport = fakeTransport({
      loadBookings: vi.fn(async () => snapshotJson([booking({ id: "server-1" })])),
      createBooking: vi.fn(async (_scope: string, created: StudioSpaceBooking) =>
        snapshotJson([booking({ id: "server-1" }), created]),
      ),
    });
    const view = renderUser(transport);
    await waitFor(() => expect(view.result.current.guestBundle.bookings).toHaveLength(2));

    act(() => {
      view.result.current.promoteGuestBundle();
      view.result.current.promoteGuestBundle();
    });
    await waitFor(() => expect(view.result.current.promotionSummary?.promotedCount).toBe(2));
    expect(transport.createBooking).toHaveBeenCalledTimes(2);

    act(() => view.result.current.promoteGuestBundle());
    expect(transport.createBooking).toHaveBeenCalledTimes(2);
  });

  it("일시 실패는 보류에 남기고, 다시 시도하면 승격된다", async () => {
    await saveStudioVirtualSpaceLocalSocial(SCOPE, {
      bookings: [booking({ id: "guest-1" })],
      waitlist: [],
      galleryLikes: {},
    });
    const createBooking = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockImplementation(async (_scope: string, created: StudioSpaceBooking) => snapshotJson([created]));
    const transport = fakeTransport({ createBooking });
    const view = renderUser(transport);
    await waitFor(() => expect(view.result.current.guestBundle.bookings).toHaveLength(1));

    act(() => view.result.current.promoteGuestBundle());
    await waitFor(() => expect(view.result.current.promotionSummary?.deferredCount).toBe(1));
    expect(view.result.current.guestBundle.bookings).toHaveLength(1);

    act(() => view.result.current.promoteGuestBundle());
    await waitFor(() => expect(view.result.current.promotionSummary?.promotedCount).toBe(1));
    expect(view.result.current.guestBundle.bookings).toEqual([]);
    expect(view.result.current.bookings.map((entry) => entry.id)).toEqual(["guest-1"]);
  });

  it("게스트 대기 신청도 보류로 분리되고 확인 시 대기열로 이관된다", async () => {
    await saveStudioVirtualSpaceLocalSocial(SCOPE, {
      bookings: [],
      waitlist: [waitlistEntry({ id: "guest-w1" })],
      galleryLikes: {},
    });
    const transport = fakeTransport();
    const view = renderUser(transport);
    await waitFor(() => expect(view.result.current.guestBundle.waitlist).toHaveLength(1));

    act(() => view.result.current.promoteGuestBundle());
    await waitFor(() => expect(view.result.current.promotionSummary?.promotedCount).toBe(1));
    expect(transport.joinWaitlist).toHaveBeenCalledWith(
      SCOPE,
      expect.objectContaining({ id: "guest-w1", bookerNames: ["김작가"] }),
    );
    expect(view.result.current.waitlist.map((entry) => entry.id)).toEqual(["guest-w1"]);
    expect(view.result.current.guestBundle.waitlist).toEqual([]);
  });

  it("버리면 보류가 비워지고 로컬에서도 지워진다", async () => {
    await seedGuestLocal();
    const transport = fakeTransport({
      loadBookings: vi.fn(async () => snapshotJson([booking({ id: "server-1" })])),
    });
    const view = renderUser(transport);
    await waitFor(() => expect(view.result.current.guestBundle.bookings).toHaveLength(2));

    act(() => view.result.current.dismissGuestBundle());
    expect(view.result.current.guestBundle.bookings).toEqual([]);
    await waitFor(async () => {
      expect((await loadStudioVirtualSpaceLocalSocial(SCOPE))?.pendingBookings).toEqual([]);
    });
    expect(transport.createBooking).not.toHaveBeenCalled();
  });
});
