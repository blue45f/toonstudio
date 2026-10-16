import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  STUDIO_VIRTUAL_SPACE_BOOKING_REPOSITORY,
  type StudioVirtualSpaceBookingRepository,
  type StudioVirtualSpaceBookingRow,
  type StudioVirtualSpaceWaitlistRow,
} from "./studio-virtual-space-booking.repository";

/**
 * 가상 스튜디오 스페이스 예약·대기열·갤러리 좋아요의 서버 정본 서비스.
 *
 * 검증 상한은 클라이언트 순수 함수(studio-virtual-space-space-booking.ts)와 같은
 * 값을 쓴다 — 서버가 더 느슨하면 우회 입력이 정본을 오염시키고, 더 엄격하면
 * 정상 패널 조작이 동기화 단계에서 거절당한다.
 *
 * 범위(scopeKey) 접근 규칙: 범위 키는 JSON 배열 `[작품 id, 월드 범위]` 이고, 같은 범위는 그 작품의
 * 소유자와 활성 협업자만 공유한다. 서버에 없는 작품, 개인 스튜디오의 공용 상수 id, 해석할 수 없는
 * 키는 공유할 상대가 없으므로 계정 전용 키로 분리해 저장한다. 서버에 있는 작품의 외부인은 거절한다.
 */
const SCOPE_KEY_MAX_LENGTH = 512;
const ID_MAX_LENGTH = 128;
const SPACE_NAME_MAX_LENGTH = 80;
const CAPACITY_MAX = 1_000;
const MAX_BOOKERS = 30;
const BOOKER_NAME_MAX_LENGTH = 80;
const MAX_EQUIPMENT_TAGS = 10;
const EQUIPMENT_TAG_MAX_LENGTH = 30;
const NOTE_MAX_LENGTH = 200;
const MAX_BOOKING_DURATION_MS = 31 * 24 * 60 * 60 * 1_000;
/** 기기 시계 오차와 처리 지연을 감안해 시작 시각 과거 유예를 둔다. */
const PAST_START_GRACE_MS = 10 * 60 * 1_000;
/** 프레임당 likedBy 응답 상한. 좋아요 수 자체는 전체 행 수로 따로 센다. */
const LIKED_BY_RESPONSE_CAP = 500;
/**
 * 웹 클라이언트가 개인 스튜디오(작품 없이 쓰는 내 작업실)에서 projectId 로 보내는 공용 상수다.
 * 모든 계정이 같은 값을 쓰므로 이 작품 id 의 범위는 절대 공유하지 않는다.
 */
const PERSONAL_HOME_WORK_ID = "virtual-demo:personal-home";

export interface StudioVirtualSpaceBookingDto {
  readonly id: string;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly capacity: number;
  readonly equipmentTags: readonly string[];
  readonly startsAt: number;
  readonly endsAt: number;
  readonly bookerNames: readonly string[];
  readonly note: string;
  readonly status: "confirmed" | "cancelled";
  readonly createdByUserId: string;
}

export interface StudioVirtualSpaceWaitlistDto {
  readonly id: string;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly capacity: number;
  readonly equipmentTags: readonly string[];
  readonly startsAt: number;
  readonly endsAt: number;
  readonly bookerNames: readonly string[];
  readonly note: string;
  readonly requestedAt: number;
  readonly createdByUserId: string;
}

export interface StudioVirtualSpaceBookingSnapshot {
  readonly scopeKey: string;
  readonly bookings: readonly StudioVirtualSpaceBookingDto[];
  readonly waitlist: readonly StudioVirtualSpaceWaitlistDto[];
}

export interface StudioVirtualSpaceGalleryFrameLikes {
  readonly likes: number;
  readonly likedBy: readonly string[];
}

export interface StudioVirtualSpaceGalleryLikesSnapshot {
  readonly scopeKey: string;
  readonly frames: Readonly<Record<string, StudioVirtualSpaceGalleryFrameLikes>>;
}

interface BookingInput {
  readonly id: string;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly capacity: number;
  readonly equipmentTags: readonly string[];
  readonly startsAt: number;
  readonly endsAt: number;
  readonly bookerNames: readonly string[];
  readonly note: string;
}

function readScopeKey(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // 이미 디코딩된 값이 들어온 경우 그대로 쓴다.
  }
  const scope = decoded.trim();
  if (!scope || scope.length > SCOPE_KEY_MAX_LENGTH) {
    throw new NotFoundException("알 수 없는 공간 범위입니다.");
  }
  return scope;
}

/** 범위 키(JSON 배열)의 첫 요소인 작품 id 를 읽는다. 배열이 아니거나 문자열이 아니면 null 이다. */
function readScopeWorkId(scopeKey: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(scopeKey);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const first: unknown = parsed[0];
  return typeof first === "string" && first.length > 0 && first.length <= ID_MAX_LENGTH ? first : null;
}

/** 계정 전용 범위의 저장 키. 공유 범위 키는 항상 `[` 로 시작하므로 이 키와 겹치지 않는다. */
function privateScopeStorageKey(actorId: string, requestedScopeKey: string): string {
  return `private:${actorId}|${requestedScopeKey}`;
}

/** 요청 범위 키와 저장소에 쓰는 키. 응답에는 항상 요청 키를 돌려줘야 클라이언트 스냅샷 검증을 통과한다. */
interface ResolvedScope {
  readonly requestedKey: string;
  readonly storageKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > maxLength) return null;
  return text;
}

function readStringList(value: unknown, maxCount: number, maxItemLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxCount) return null;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const text = item.trim().slice(0, maxItemLength);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function readEpochMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.floor(value);
}

/** 클라이언트 순수 함수와 같은 겹침 판정: 닿기만 하는(끝=시작) 예약은 충돌이 아니다. */
function overlaps(
  a: { readonly startsAt: number; readonly endsAt: number },
  b: { readonly startsAt: number; readonly endsAt: number },
): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

function toBookingDto(row: StudioVirtualSpaceBookingRow): StudioVirtualSpaceBookingDto {
  return {
    id: row.id,
    spaceId: row.spaceId,
    spaceName: row.spaceName,
    capacity: row.capacity,
    equipmentTags: row.equipmentTags,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    bookerNames: row.bookerNames,
    note: row.note,
    status: row.status,
    createdByUserId: row.createdByUserId,
  };
}

function toWaitlistDto(row: StudioVirtualSpaceWaitlistRow): StudioVirtualSpaceWaitlistDto {
  return {
    id: row.id,
    spaceId: row.spaceId,
    spaceName: row.spaceName,
    capacity: row.capacity,
    equipmentTags: row.equipmentTags,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    bookerNames: row.bookerNames,
    note: row.note,
    requestedAt: row.requestedAt,
    createdByUserId: row.createdByUserId,
  };
}

@Injectable()
export class StudioVirtualSpaceBookingService {
  constructor(
    @Inject(STUDIO_VIRTUAL_SPACE_BOOKING_REPOSITORY)
    private readonly repository: StudioVirtualSpaceBookingRepository,
  ) {}

  /** decoration 서비스와 같은 규칙: 활성 계정만 정본을 읽고 쓸 수 있다. */
  private async requireActiveUser(userId: string | undefined): Promise<string> {
    const id = userId?.trim();
    if (!id) throw new ForbiddenException("로그인이 필요합니다.");
    const status = await this.repository.findUserStatus(id);
    if (status === null) throw new ForbiddenException("로그인이 필요합니다.");
    if (status !== "active") throw new ForbiddenException("사용할 수 없는 계정입니다.");
    return id;
  }

  /**
   * 요청 범위 키를 접근 판정과 저장 키로 풀어낸다. 작품 구성원이 아니면 서버에 있는 작품의 범위에
   * 접근할 수 없고(403), 공유할 상대가 없는 범위는 계정 전용 키로 분리한다.
   */
  private async resolveScope(actorId: string, scopeKeyValue: string): Promise<ResolvedScope> {
    const requestedKey = readScopeKey(scopeKeyValue);
    const privateScope: ResolvedScope = {
      requestedKey,
      storageKey: privateScopeStorageKey(actorId, requestedKey),
    };
    const workId = readScopeWorkId(requestedKey);
    if (workId === null || workId === PERSONAL_HOME_WORK_ID) return privateScope;
    const access = await this.repository.resolveWorkAccess(actorId, workId);
    if (access === "outsider") {
      throw new ForbiddenException("이 공간의 예약과 좋아요를 볼 권한이 없어요.");
    }
    return access === "member" ? { requestedKey, storageKey: requestedKey } : privateScope;
  }

  private readBookingInput(body: unknown, nowMs: number): BookingInput {
    if (!isRecord(body)) throw new BadRequestException("예약 정보가 올바르지 않습니다.");
    const id = readText(body.id, ID_MAX_LENGTH);
    const spaceId = readText(body.spaceId, ID_MAX_LENGTH);
    const spaceName = readText(body.spaceName, SPACE_NAME_MAX_LENGTH);
    const capacity =
      typeof body.capacity === "number" && Number.isInteger(body.capacity) ? body.capacity : null;
    const equipmentTags = readStringList(
      body.equipmentTags ?? [],
      MAX_EQUIPMENT_TAGS,
      EQUIPMENT_TAG_MAX_LENGTH,
    );
    const bookerNames = readStringList(body.bookerNames, MAX_BOOKERS, BOOKER_NAME_MAX_LENGTH);
    const startsAt = readEpochMs(body.startsAt);
    const endsAt = readEpochMs(body.endsAt);
    const note = body.note === undefined || body.note === null ? "" : body.note;
    if (
      id === null ||
      spaceId === null ||
      spaceName === null ||
      capacity === null ||
      capacity < 1 ||
      capacity > CAPACITY_MAX ||
      equipmentTags === null ||
      bookerNames === null ||
      bookerNames.length === 0 ||
      startsAt === null ||
      endsAt === null ||
      typeof note !== "string" ||
      note.length > NOTE_MAX_LENGTH
    ) {
      throw new BadRequestException("예약 정보가 올바르지 않습니다.");
    }
    if (bookerNames.length > capacity) {
      throw new BadRequestException("예약자 수가 수용 인원을 초과했습니다.");
    }
    if (endsAt <= startsAt || endsAt - startsAt > MAX_BOOKING_DURATION_MS) {
      throw new BadRequestException("예약 시간 범위가 올바르지 않습니다.");
    }
    if (startsAt < nowMs - PAST_START_GRACE_MS) {
      throw new BadRequestException("과거 시간에는 예약할 수 없어요.");
    }
    return {
      id,
      spaceId,
      spaceName,
      capacity,
      equipmentTags,
      startsAt,
      endsAt,
      bookerNames,
      note: note.trim(),
    };
  }

  private async snapshot(scope: ResolvedScope): Promise<StudioVirtualSpaceBookingSnapshot> {
    const [bookings, waitlist] = await Promise.all([
      this.repository.listBookings(scope.storageKey),
      this.repository.listWaitlist(scope.storageKey),
    ]);
    return {
      scopeKey: scope.requestedKey,
      bookings: bookings.map(toBookingDto),
      waitlist: waitlist.map(toWaitlistDto),
    };
  }

  async getSnapshot(
    userId: string | undefined,
    scopeKeyValue: string,
  ): Promise<StudioVirtualSpaceBookingSnapshot> {
    const actorId = await this.requireActiveUser(userId);
    return this.snapshot(await this.resolveScope(actorId, scopeKeyValue));
  }

  async createBooking(
    userId: string | undefined,
    scopeKeyValue: string,
    body: unknown,
  ): Promise<StudioVirtualSpaceBookingSnapshot> {
    const authorId = await this.requireActiveUser(userId);
    const scope = await this.resolveScope(authorId, scopeKeyValue);
    const input = this.readBookingInput(body, Date.now());

    const existing = await this.repository.findBookingById(input.id);
    if (existing) {
      // 동기화 재전송·승격 경쟁으로 같은 id가 다시 와도 정본은 하나만 남는다.
      if (existing.scopeKey === scope.storageKey && existing.createdByUserId === authorId) {
        return this.snapshot(scope);
      }
      throw new ConflictException("이미 처리된 예약이에요.");
    }

    const bookings = await this.repository.listBookings(scope.storageKey);
    const conflict = bookings.some(
      (booking) =>
        booking.status === "confirmed" &&
        booking.spaceId === input.spaceId &&
        overlaps(booking, input),
    );
    if (conflict) {
      throw new ConflictException("선택한 시간대에 이미 예약이 있어요.");
    }

    await this.repository.insertBooking({
      ...input,
      scopeKey: scope.storageKey,
      status: "confirmed",
      createdByUserId: authorId,
    });
    return this.snapshot(scope);
  }

  async cancelBooking(
    userId: string | undefined,
    scopeKeyValue: string,
    bookingIdValue: string,
  ): Promise<StudioVirtualSpaceBookingSnapshot> {
    const authorId = await this.requireActiveUser(userId);
    const scope = await this.resolveScope(authorId, scopeKeyValue);
    const bookingId = readText(bookingIdValue, ID_MAX_LENGTH);
    if (bookingId === null) throw new NotFoundException("예약을 찾을 수 없어요.");
    const booking = await this.repository.findBookingById(bookingId);
    if (!booking || booking.scopeKey !== scope.storageKey) {
      throw new NotFoundException("예약을 찾을 수 없어요.");
    }
    if (booking.createdByUserId !== authorId) {
      throw new ForbiddenException("다른 사용자의 예약은 취소할 수 없어요.");
    }
    if (booking.status === "cancelled") return this.snapshot(scope);

    await this.repository.updateBookingStatus(booking.id, "cancelled");
    await this.promoteWaitlist(scope.storageKey, booking.spaceId);
    return this.snapshot(scope);
  }

  /**
   * 클라이언트 promoteSpaceWaitlist와 같은 규칙: 요청 순서대로 훑어 확정 예약과
   * 겹치지 않는 첫 항목 하나만 승격한다. 승격 예약은 대기 항목의 id를 그대로
   * 써서, 클라이언트가 로컬 승격을 뒤늦게 동기화해도 멱등 생성으로 수렴한다.
   */
  private async promoteWaitlist(scopeKey: string, spaceId: string): Promise<void> {
    const [bookings, waitlist] = await Promise.all([
      this.repository.listBookings(scopeKey),
      this.repository.listWaitlist(scopeKey),
    ]);
    const confirmed = bookings.filter((entry) => entry.status === "confirmed");
    const candidate = waitlist
      .filter((entry) => entry.spaceId === spaceId)
      .find((entry) => !confirmed.some((booking) => overlaps(booking, entry)));
    if (!candidate) return;
    await this.repository.insertBooking({
      id: candidate.id,
      scopeKey,
      spaceId: candidate.spaceId,
      spaceName: candidate.spaceName,
      capacity: candidate.capacity,
      equipmentTags: candidate.equipmentTags,
      startsAt: candidate.startsAt,
      endsAt: candidate.endsAt,
      bookerNames: candidate.bookerNames,
      note: candidate.note,
      status: "confirmed",
      createdByUserId: candidate.createdByUserId,
    });
    await this.repository.deleteWaitlistEntry(candidate.id);
  }

  async joinWaitlist(
    userId: string | undefined,
    scopeKeyValue: string,
    body: unknown,
  ): Promise<StudioVirtualSpaceBookingSnapshot> {
    const authorId = await this.requireActiveUser(userId);
    const scope = await this.resolveScope(authorId, scopeKeyValue);
    const input = this.readBookingInput(body, Date.now());
    const requestedAt =
      isRecord(body) && readEpochMs(body.requestedAt) !== null
        ? (readEpochMs(body.requestedAt) as number)
        : Date.now();

    const existing = await this.repository.findWaitlistById(input.id);
    if (existing) {
      if (existing.scopeKey === scope.storageKey && existing.createdByUserId === authorId) {
        return this.snapshot(scope);
      }
      throw new ConflictException("이미 처리된 대기 신청이에요.");
    }
    // 이미 확정 예약으로 승격된 id면 대기열에 다시 넣지 않는다.
    const promoted = await this.repository.findBookingById(input.id);
    if (promoted && promoted.scopeKey === scope.storageKey) return this.snapshot(scope);

    await this.repository.insertWaitlistEntry({
      ...input,
      scopeKey: scope.storageKey,
      requestedAt,
      createdByUserId: authorId,
    });
    return this.snapshot(scope);
  }

  async leaveWaitlist(
    userId: string | undefined,
    scopeKeyValue: string,
    entryIdValue: string,
  ): Promise<StudioVirtualSpaceBookingSnapshot> {
    const authorId = await this.requireActiveUser(userId);
    const scope = await this.resolveScope(authorId, scopeKeyValue);
    const entryId = readText(entryIdValue, ID_MAX_LENGTH);
    if (entryId === null) throw new NotFoundException("대기 신청을 찾을 수 없어요.");
    const entry = await this.repository.findWaitlistById(entryId);
    if (!entry || entry.scopeKey !== scope.storageKey) {
      throw new NotFoundException("대기 신청을 찾을 수 없어요.");
    }
    if (entry.createdByUserId !== authorId) {
      throw new ForbiddenException("다른 사용자의 대기 신청은 취소할 수 없어요.");
    }
    await this.repository.deleteWaitlistEntry(entry.id);
    return this.snapshot(scope);
  }

  async getGalleryLikes(
    userId: string | undefined,
    scopeKeyValue: string,
  ): Promise<StudioVirtualSpaceGalleryLikesSnapshot> {
    const actorId = await this.requireActiveUser(userId);
    const scope = await this.resolveScope(actorId, scopeKeyValue);
    const rows = await this.repository.listGalleryLikes(scope.storageKey);
    const frames: Record<string, { likes: number; likedBy: string[] }> = {};
    for (const row of rows) {
      const frame = (frames[row.frameId] ??= { likes: 0, likedBy: [] });
      frame.likes += 1;
      if (frame.likedBy.length < LIKED_BY_RESPONSE_CAP) frame.likedBy.push(row.userId);
    }
    return { scopeKey: scope.requestedKey, frames };
  }

  async toggleGalleryLike(
    userId: string | undefined,
    scopeKeyValue: string,
    body: unknown,
  ): Promise<{ readonly frameId: string } & StudioVirtualSpaceGalleryFrameLikes> {
    const authorId = await this.requireActiveUser(userId);
    const scope = await this.resolveScope(authorId, scopeKeyValue);
    if (!isRecord(body)) throw new BadRequestException("프레임 정보가 올바르지 않습니다.");
    const frameId = readText(body.frameId, ID_MAX_LENGTH);
    if (frameId === null) throw new BadRequestException("프레임 정보가 올바르지 않습니다.");

    const rows = await this.repository.listGalleryLikes(scope.storageKey);
    const frameRows = rows.filter((row) => row.frameId === frameId);
    const alreadyLiked = frameRows.some((row) => row.userId === authorId);
    if (alreadyLiked) {
      await this.repository.deleteGalleryLike(scope.storageKey, frameId, authorId);
    } else {
      await this.repository.insertGalleryLike({ scopeKey: scope.storageKey, frameId, userId: authorId });
    }
    const likedBy = frameRows
      .map((row) => row.userId)
      .filter((id) => id !== authorId)
      .slice(0, LIKED_BY_RESPONSE_CAP - (alreadyLiked ? 0 : 1));
    if (!alreadyLiked) likedBy.push(authorId);
    return {
      frameId,
      likes: frameRows.length + (alreadyLiked ? -1 : 1),
      likedBy,
    };
  }
}
