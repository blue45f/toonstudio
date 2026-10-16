import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it } from "vitest";

import type {
  StudioVirtualSpaceBookingRepository,
  StudioVirtualSpaceBookingRow,
  StudioVirtualSpaceGalleryLikeRow,
  StudioVirtualSpaceWaitlistRow,
  StudioVirtualSpaceWorkAccess,
} from "./studio-virtual-space-booking.repository";
import { StudioVirtualSpaceBookingService } from "./studio-virtual-space-booking.service";

const SCOPE = '["proj-1","office"]';
// 소유자 user-1 만 있고 협업자가 없는 다른 작품의 범위. user-2 는 이 작품의 외부인이다.
const PRIVATE_WORK_SCOPE = '["proj-9","office"]';
// 웹 클라이언트가 개인 스튜디오(내 작업실)에서 쓰는 공용 상수 작품 id 로 만든 범위 키.
const PERSONAL_SCOPE = '["virtual-demo:personal-home","office"]';
// 서버에 작품 행이 없는(브라우저에만 있는) 프로젝트 id 의 범위 키.
const LOCAL_ONLY_SCOPE = '["local-only-project","office"]';
// 서비스가 실제 Date.now()와 대조하므로 기준 시각도 실행 시점이어야 한다.
const NOW = Date.now();
const HOUR = 60 * 60 * 1_000;

class FakeRepository implements StudioVirtualSpaceBookingRepository {
  readonly users = new Map<string, string>([
    ["user-1", "active"],
    ["user-2", "active"],
    ["user-off", "suspended"],
  ]);
  /** 작품 접근 픽스처: 소유자와 활성 협업자만 구성원이다. 목록에 없는 작품은 서버에 없는 작품이다. */
  readonly works = new Map<string, { ownerId: string; memberIds: readonly string[] }>([
    ["proj-1", { ownerId: "user-1", memberIds: ["user-2"] }],
    ["proj-9", { ownerId: "user-1", memberIds: [] }],
  ]);
  readonly bookings: StudioVirtualSpaceBookingRow[] = [];
  readonly waitlist: StudioVirtualSpaceWaitlistRow[] = [];
  readonly likes: StudioVirtualSpaceGalleryLikeRow[] = [];

  async findUserStatus(userId: string): Promise<string | null> {
    return this.users.get(userId) ?? null;
  }
  async resolveWorkAccess(userId: string, workId: string): Promise<StudioVirtualSpaceWorkAccess> {
    const work = this.works.get(workId);
    if (!work) return "unknown";
    return work.ownerId === userId || work.memberIds.includes(userId) ? "member" : "outsider";
  }
  async listBookings(scopeKey: string) {
    return this.bookings.filter((row) => row.scopeKey === scopeKey);
  }
  async findBookingById(id: string) {
    return this.bookings.find((row) => row.id === id) ?? null;
  }
  async insertBooking(row: StudioVirtualSpaceBookingRow) {
    this.bookings.push(row);
  }
  async updateBookingStatus(id: string, status: "confirmed" | "cancelled") {
    const index = this.bookings.findIndex((row) => row.id === id);
    if (index >= 0) this.bookings[index] = { ...this.bookings[index], status };
  }
  async listWaitlist(scopeKey: string) {
    return [...this.waitlist.filter((row) => row.scopeKey === scopeKey)].sort(
      (a, b) => a.requestedAt - b.requestedAt || (a.id < b.id ? -1 : 1),
    );
  }
  async findWaitlistById(id: string) {
    return this.waitlist.find((row) => row.id === id) ?? null;
  }
  async insertWaitlistEntry(row: StudioVirtualSpaceWaitlistRow) {
    this.waitlist.push(row);
  }
  async deleteWaitlistEntry(id: string) {
    const index = this.waitlist.findIndex((row) => row.id === id);
    if (index >= 0) this.waitlist.splice(index, 1);
  }
  async listGalleryLikes(scopeKey: string) {
    return this.likes.filter((row) => row.scopeKey === scopeKey);
  }
  async insertGalleryLike(row: StudioVirtualSpaceGalleryLikeRow) {
    if (
      !this.likes.some(
        (like) =>
          like.scopeKey === row.scopeKey && like.frameId === row.frameId && like.userId === row.userId,
      )
    ) {
      this.likes.push(row);
    }
  }
  async deleteGalleryLike(scopeKey: string, frameId: string, userId: string) {
    const index = this.likes.findIndex(
      (like) => like.scopeKey === scopeKey && like.frameId === frameId && like.userId === userId,
    );
    if (index >= 0) this.likes.splice(index, 1);
  }
}

function bookingBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "booking-1",
    spaceId: "booth",
    spaceName: "녹음부스",
    capacity: 2,
    equipmentTags: ["마이크"],
    startsAt: NOW + HOUR,
    endsAt: NOW + 2 * HOUR,
    bookerNames: ["김작가"],
    note: "",
    ...overrides,
  };
}

function setup() {
  const repository = new FakeRepository();
  const service = new StudioVirtualSpaceBookingService(repository);
  return { repository, service };
}

describe("StudioVirtualSpaceBookingService 인증", () => {
  it("x-user-id가 없으면 스냅샷 조회도 거절한다", async () => {
    const { service } = setup();
    await expect(service.getSnapshot(undefined, SCOPE)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("없는 계정과 정지 계정을 거절한다", async () => {
    const { service } = setup();
    await expect(service.getSnapshot("ghost", SCOPE)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getSnapshot("user-off", SCOPE)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("범위 키가 비거나 너무 길면 NotFound로 거절한다", async () => {
    const { service } = setup();
    await expect(service.getSnapshot("user-1", " ")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getSnapshot("user-1", "x".repeat(513))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("StudioVirtualSpaceBookingService 예약", () => {
  it("예약을 만들면 스냅샷에 작성자가 스탬프되어 돌아온다", async () => {
    const { service } = setup();
    const snapshot = await service.createBooking("user-1", SCOPE, bookingBody());
    expect(snapshot.bookings).toHaveLength(1);
    expect(snapshot.bookings[0]).toMatchObject({
      id: "booking-1",
      status: "confirmed",
      createdByUserId: "user-1",
    });
  });

  it("같은 시간대에 겹치는 예약은 409로 거절하고, 닿는 예약은 허용한다", async () => {
    const { service } = setup();
    await service.createBooking("user-1", SCOPE, bookingBody());
    await expect(
      service.createBooking("user-2", SCOPE, bookingBody({ id: "booking-2" })),
    ).rejects.toBeInstanceOf(ConflictException);
    const touching = await service.createBooking(
      "user-2",
      SCOPE,
      bookingBody({ id: "booking-3", startsAt: NOW + 2 * HOUR, endsAt: NOW + 3 * HOUR }),
    );
    expect(touching.bookings).toHaveLength(2);
  });

  it("같은 id 재전송은 멱등하고, 다른 사용자의 id 재사용은 거절한다", async () => {
    const { service, repository } = setup();
    await service.createBooking("user-1", SCOPE, bookingBody());
    const again = await service.createBooking("user-1", SCOPE, bookingBody());
    expect(again.bookings).toHaveLength(1);
    expect(repository.bookings).toHaveLength(1);
    await expect(service.createBooking("user-2", SCOPE, bookingBody())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("잘못된 입력(범위 역전·정원 초과·예약자 없음·과거 시작)을 거절한다", async () => {
    const { service } = setup();
    await expect(
      service.createBooking(
        "user-1",
        SCOPE,
        bookingBody({ startsAt: NOW + 2 * HOUR, endsAt: NOW + HOUR }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createBooking("user-1", SCOPE, bookingBody({ bookerNames: ["a", "b", "c"] })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createBooking("user-1", SCOPE, bookingBody({ bookerNames: [] })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createBooking(
        "user-1",
        SCOPE,
        bookingBody({ startsAt: NOW - 11 * 60 * 1_000, endsAt: NOW + HOUR }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("취소는 작성자만 할 수 있고, 이미 취소된 예약의 재취소는 멱등하다", async () => {
    const { service } = setup();
    await service.createBooking("user-1", SCOPE, bookingBody());
    await expect(service.cancelBooking("user-2", SCOPE, "booking-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const cancelled = await service.cancelBooking("user-1", SCOPE, "booking-1");
    expect(cancelled.bookings[0].status).toBe("cancelled");
    const again = await service.cancelBooking("user-1", SCOPE, "booking-1");
    expect(again.bookings[0].status).toBe("cancelled");
    await expect(service.cancelBooking("user-1", SCOPE, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("StudioVirtualSpaceBookingService 대기열 승격", () => {
  it("취소하면 겹치지 않는 첫 대기 항목이 같은 id로 승격된다", async () => {
    const { service, repository } = setup();
    await service.createBooking("user-1", SCOPE, bookingBody());
    // 겹치는 대기: 같은 시간대라 승격 불가여야 하지만 취소 후에는 자리가 빈다.
    await service.joinWaitlist("user-2", SCOPE, bookingBody({ id: "wait-1" }));
    // 다른 스페이스 대기는 승격 대상이 아니다.
    await service.joinWaitlist(
      "user-2",
      SCOPE,
      bookingBody({ id: "wait-2", spaceId: "room-a", spaceName: "회의실" }),
    );
    const snapshot = await service.cancelBooking("user-1", SCOPE, "booking-1");
    const promoted = snapshot.bookings.find((booking) => booking.id === "wait-1");
    expect(promoted).toMatchObject({ status: "confirmed", createdByUserId: "user-2" });
    expect(snapshot.waitlist.map((entry) => entry.id)).toEqual(["wait-2"]);
    expect(repository.bookings.filter((row) => row.status === "confirmed")).toHaveLength(1);
  });

  it("대기 등록은 멱등하고, 나가기는 작성자만 할 수 있다", async () => {
    const { service } = setup();
    await service.joinWaitlist("user-2", SCOPE, bookingBody({ id: "wait-1" }));
    const again = await service.joinWaitlist("user-2", SCOPE, bookingBody({ id: "wait-1" }));
    expect(again.waitlist).toHaveLength(1);
    await expect(service.leaveWaitlist("user-1", SCOPE, "wait-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const left = await service.leaveWaitlist("user-2", SCOPE, "wait-1");
    expect(left.waitlist).toHaveLength(0);
  });
});

describe("StudioVirtualSpaceBookingService 갤러리 좋아요", () => {
  it("토글이 켜고 끄며, 스냅샷은 프레임별로 묶어 돌려준다", async () => {
    const { service } = setup();
    const liked = await service.toggleGalleryLike("user-1", SCOPE, { frameId: "frame-1" });
    expect(liked).toMatchObject({ frameId: "frame-1", likes: 1, likedBy: ["user-1"] });
    await service.toggleGalleryLike("user-2", SCOPE, { frameId: "frame-1" });
    await service.toggleGalleryLike("user-2", SCOPE, { frameId: "frame-2" });
    const snapshot = await service.getGalleryLikes("user-1", SCOPE);
    expect(snapshot.frames["frame-1"]).toMatchObject({ likes: 2 });
    expect(snapshot.frames["frame-1"].likedBy).toEqual(
      expect.arrayContaining(["user-1", "user-2"]),
    );
    expect(snapshot.frames["frame-2"].likes).toBe(1);
    const unliked = await service.toggleGalleryLike("user-1", SCOPE, { frameId: "frame-1" });
    expect(unliked.likes).toBe(1);
    expect(unliked.likedBy).toEqual(["user-2"]);
  });

  it("frameId가 없으면 거절한다", async () => {
    const { service } = setup();
    await expect(service.toggleGalleryLike("user-1", SCOPE, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("StudioVirtualSpaceBookingService 범위 접근 판정(작품 구성원만)", () => {
  it("작품 구성원이 아닌 계정은 그 작품 범위를 읽지도 쓰지도 못하고 저장소는 그대로다", async () => {
    const { service, repository } = setup();
    // 소유자가 만든 예약·대기·좋아요가 이미 있는 작품이다.
    await service.createBooking("user-1", PRIVATE_WORK_SCOPE, bookingBody({ id: "owner-booking" }));
    await service.joinWaitlist(
      "user-1",
      PRIVATE_WORK_SCOPE,
      bookingBody({ id: "owner-wait", startsAt: NOW + 3 * HOUR, endsAt: NOW + 4 * HOUR }),
    );
    await service.toggleGalleryLike("user-1", PRIVATE_WORK_SCOPE, { frameId: "frame-1" });
    const before = {
      bookings: structuredClone(repository.bookings),
      waitlist: structuredClone(repository.waitlist),
      likes: structuredClone(repository.likes),
    };

    const forbidden = [
      () => service.getSnapshot("user-2", PRIVATE_WORK_SCOPE),
      () =>
        service.createBooking(
          "user-2",
          PRIVATE_WORK_SCOPE,
          bookingBody({ id: "intruder-booking", startsAt: NOW + 5 * HOUR, endsAt: NOW + 6 * HOUR }),
        ),
      () => service.cancelBooking("user-2", PRIVATE_WORK_SCOPE, "owner-booking"),
      () =>
        service.joinWaitlist(
          "user-2",
          PRIVATE_WORK_SCOPE,
          bookingBody({ id: "intruder-wait", startsAt: NOW + 5 * HOUR, endsAt: NOW + 6 * HOUR }),
        ),
      () => service.leaveWaitlist("user-2", PRIVATE_WORK_SCOPE, "owner-wait"),
      () => service.getGalleryLikes("user-2", PRIVATE_WORK_SCOPE),
      () => service.toggleGalleryLike("user-2", PRIVATE_WORK_SCOPE, { frameId: "frame-1" }),
    ];
    for (const call of forbidden) {
      await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(repository.bookings).toEqual(before.bookings);
    expect(repository.waitlist).toEqual(before.waitlist);
    expect(repository.likes).toEqual(before.likes);
  });

  it("소유자와 활성 협업자는 같은 작품 범위의 예약과 좋아요를 공유한다", async () => {
    const { service } = setup();
    await service.createBooking("user-1", SCOPE, bookingBody({ id: "owner-booking" }));
    const seenByMember = await service.getSnapshot("user-2", SCOPE);
    expect(seenByMember.scopeKey).toBe(SCOPE);
    expect(seenByMember.bookings.map((booking) => booking.id)).toEqual(["owner-booking"]);
    await service.toggleGalleryLike("user-2", SCOPE, { frameId: "frame-1" });
    const likes = await service.getGalleryLikes("user-1", SCOPE);
    expect(likes.frames["frame-1"]?.likedBy).toEqual(["user-2"]);
  });

  it.each([
    ["개인 스튜디오 공용 작품 id", PERSONAL_SCOPE],
    ["서버에 작품 행이 없는 프로젝트 id", LOCAL_ONLY_SCOPE],
    ["작품 id 를 읽을 수 없는 범위 키", "opaque-scope-key"],
  ])("%s 범위는 계정별로 분리되어 다른 계정의 예약과 좋아요가 보이지 않는다", async (_label, scope) => {
    const { service, repository } = setup();
    await service.createBooking("user-1", scope, bookingBody({ id: "mine-1", note: "비공개 메모" }));
    await service.toggleGalleryLike("user-1", scope, { frameId: "frame-1" });

    // 두 번째 계정은 같은 범위 키를 보내도 첫 번째 계정의 데이터를 볼 수 없다.
    const other = await service.getSnapshot("user-2", scope);
    expect(other.bookings).toEqual([]);
    expect(other.waitlist).toEqual([]);
    expect((await service.getGalleryLikes("user-2", scope)).frames).toEqual({});

    // 같은 시간대·같은 스페이스를 다른 계정이 잡아도 서로의 예약과 충돌하지 않는다.
    const second = await service.createBooking("user-2", scope, bookingBody({ id: "mine-2" }));
    expect(second.bookings.map((booking) => booking.id)).toEqual(["mine-2"]);

    // 응답은 클라이언트가 보낸 범위 키를 그대로 돌려줘야 웹 클라이언트의 스냅샷 검증을 통과한다.
    expect(second.scopeKey).toBe(scope);
    expect((await service.getSnapshot("user-1", scope)).scopeKey).toBe(scope);

    // 저장소에는 계정별로 다른 키가 쓰이고, 클라이언트가 보낸 원본 키는 공용 키로 쓰이지 않는다.
    const storedKeys = new Set(repository.bookings.map((row) => row.scopeKey));
    expect(storedKeys.size).toBe(2);
    expect(storedKeys.has(scope)).toBe(false);

    // 계정 간 좋아요도 섞이지 않는다: user-2 의 토글은 자기 하나만 센다.
    const liked = await service.toggleGalleryLike("user-2", scope, { frameId: "frame-1" });
    expect(liked).toMatchObject({ likes: 1, likedBy: ["user-2"] });
  });

  it("개인 범위에서 다른 계정의 예약 id 는 취소할 수 없다", async () => {
    const { service } = setup();
    await service.createBooking("user-1", PERSONAL_SCOPE, bookingBody({ id: "mine-1" }));
    await expect(service.cancelBooking("user-2", PERSONAL_SCOPE, "mine-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect((await service.getSnapshot("user-1", PERSONAL_SCOPE)).bookings[0]?.status).toBe(
      "confirmed",
    );
  });
});
