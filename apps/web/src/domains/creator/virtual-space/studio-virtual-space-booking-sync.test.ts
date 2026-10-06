import { describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/platform/api";
import {
  acceptBookingsSnapshot,
  acceptGalleryLikes,
  createDefaultStudioVirtualSpaceSocialTransport,
  diffBookings,
  diffGalleryLikeToggles,
  diffWaitlist,
  StudioVirtualSpaceSocialRequestError,
} from "./studio-virtual-space-booking-sync";
import type { StudioGalleryStats } from "./studio-virtual-space-gallery";
import type {
  StudioSpaceBooking,
  StudioSpaceWaitlistEntry,
} from "./studio-virtual-space-space-booking";

// vitest hoists vi.mock above the imports, so declaring it after them keeps import-x/first happy.
vi.mock("@/platform/api", () => ({ apiFetch: vi.fn() }));

const SCOPE = '["proj-1","office"]';

function booking(overrides: Partial<StudioSpaceBooking> = {}): StudioSpaceBooking {
  return {
    id: "b1",
    spaceId: "booth",
    spaceName: "녹음부스",
    capacity: 2,
    equipmentTags: ["마이크"],
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

describe("acceptBookingsSnapshot", () => {
  it("서버 스냅샷을 클라이언트 형태로 거르고 createdByUserId는 버린다", () => {
    const snapshot = acceptBookingsSnapshot(
      {
        scopeKey: SCOPE,
        bookings: [{ ...booking(), createdByUserId: "user-1" }],
        waitlist: [{ ...waitlistEntry(), createdByUserId: "user-2" }],
      },
      SCOPE,
    );
    expect(snapshot?.bookings).toEqual([booking()]);
    expect(snapshot?.waitlist).toEqual([waitlistEntry()]);
  });

  it("범위 키가 다르거나 항목이 깨졌으면 null이다", () => {
    expect(acceptBookingsSnapshot({ scopeKey: "other", bookings: [], waitlist: [] }, SCOPE)).toBeNull();
    expect(
      acceptBookingsSnapshot(
        { scopeKey: SCOPE, bookings: [{ id: "x" }], waitlist: [] },
        SCOPE,
      ),
    ).toBeNull();
    expect(acceptBookingsSnapshot(null, SCOPE)).toBeNull();
  });
});

describe("acceptGalleryLikes", () => {
  it("프레임별 좋아요를 통계 형태로 바꾸고 조회수는 0에서 시작한다", () => {
    const stats = acceptGalleryLikes(
      { scopeKey: SCOPE, frames: { "frame-1": { likes: 2, likedBy: ["u1", "u2"] } } },
      SCOPE,
    );
    expect(stats).toEqual({ "frame-1": { views: 0, likes: 2, likedBy: ["u1", "u2"] } });
  });

  it("형식이 깨졌으면 null이다", () => {
    expect(acceptGalleryLikes({ scopeKey: SCOPE, frames: { f: { likes: "x" } } }, SCOPE)).toBeNull();
  });
});

describe("diffBookings", () => {
  it("새 확정 예약과 취소 전이를 잡는다", () => {
    const prev = [booking()];
    const created = booking({ id: "b2" });
    const next = [booking({ status: "cancelled" }), created];
    expect(diffBookings(prev, next)).toEqual({ created: [created], cancelledIds: ["b1"] });
  });

  it("처음부터 취소 상태로 나타난 예약은 생성으로 치지 않는다", () => {
    expect(diffBookings([], [booking({ status: "cancelled" })])).toEqual({
      created: [],
      cancelledIds: [],
    });
  });
});

describe("diffWaitlist", () => {
  it("추가와 이탈을 잡는다", () => {
    const prev = [waitlistEntry()];
    const joined = waitlistEntry({ id: "w2" });
    expect(diffWaitlist(prev, [joined])).toEqual({ joined: [joined], leftIds: ["b1"] });
  });
});

describe("기본 transport 오류", () => {
  it("거절 응답이면 상태 코드와 서버 문구를 실은 오류를 던진다", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 409, message: "선택한 시간대에 이미 예약이 있어요." }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const transport = createDefaultStudioVirtualSpaceSocialTransport();
    const failure = await transport.createBooking(SCOPE, booking()).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(StudioVirtualSpaceSocialRequestError);
    expect(failure).toMatchObject({ status: 409, serverMessage: "선택한 시간대에 이미 예약이 있어요." });
  });

  it("본문이 JSON이 아니면 서버 문구는 null이다", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response("upstream down", { status: 502 }));
    const transport = createDefaultStudioVirtualSpaceSocialTransport();
    const failure = await transport.loadBookings(SCOPE).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(StudioVirtualSpaceSocialRequestError);
    expect(failure).toMatchObject({ status: 502, serverMessage: null });
  });
});

describe("diffGalleryLikeToggles", () => {
  const base: StudioGalleryStats = { "frame-1": { views: 3, likes: 1, likedBy: ["user-1"] } };

  it("내 멤버십이 바뀐 프레임만 잡는다", () => {
    const unliked: StudioGalleryStats = { "frame-1": { views: 4, likes: 0, likedBy: [] } };
    expect(diffGalleryLikeToggles(base, unliked, "user-1")).toEqual(["frame-1"]);
    const liked: StudioGalleryStats = {
      "frame-1": { views: 3, likes: 1, likedBy: ["user-1"] },
      "frame-2": { views: 0, likes: 1, likedBy: ["user-1"] },
    };
    expect(diffGalleryLikeToggles(base, liked, "user-1")).toEqual(["frame-2"]);
  });

  it("조회수만 바뀌면 토글이 없다", () => {
    const viewed: StudioGalleryStats = { "frame-1": { views: 9, likes: 1, likedBy: ["user-1"] } };
    expect(diffGalleryLikeToggles(base, viewed, "user-1")).toEqual([]);
  });
});
