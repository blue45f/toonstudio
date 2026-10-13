import { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type {
  StudioGuestBookingBundle,
  StudioPromotionRejectCode,
  StudioPromotionRunSummary,
} from "./studio-virtual-space-booking-promotion";
import {
  addSpaceBooking,
  addSpaceWaitlistEntry,
  cancelSpaceBooking,
  checkSpaceBookingAt,
  createSpaceBooking,
  expandSpaceRecurringBooking,
  formatKstDate,
  formatKstTime,
  kstWallToEpochMs,
  parseSpaceBookerRoster,
  promoteSpaceWaitlist,
  spaceBookingsForDay,
  STUDIO_SPACE_BOOKING_MAX_RECURRENCE,
  type StudioSpaceBooking,
  type StudioSpaceBookingInput,
  type StudioSpaceBookingRejection,
  type StudioSpaceWaitlistEntry,
  type StudioVirtualSpace,
} from "./studio-virtual-space-space-booking";

/** 게스트 예약 승격 확인 표면. 동기화 훅이 들고 있는 보류 묶음과 실행 상태를 그대로 보여 준다. */
export interface StudioVirtualSpaceGuestPromotionView {
  readonly bundle: StudioGuestBookingBundle;
  readonly summary: StudioPromotionRunSummary | null;
  readonly busy: boolean;
  readonly onPromote: () => void;
  readonly onDismiss: () => void;
  readonly onClearSummary: () => void;
}

export interface StudioVirtualSpaceSpaceBookingPanelProps {
  readonly spaces: readonly StudioVirtualSpace[];
  readonly nowMs?: number;
  /** 제어 모드: 예약 목록을 바깥(페이지)에서 들고 있을 때만 넘긴다. */
  readonly bookings?: readonly StudioSpaceBooking[];
  readonly waitlist?: readonly StudioSpaceWaitlistEntry[];
  readonly onBookingsChange?: (bookings: readonly StudioSpaceBooking[]) => void;
  readonly onWaitlistChange?: (waitlist: readonly StudioSpaceWaitlistEntry[]) => void;
  /** 로그인 전 로컬 예약의 승격 확인. 없거나 묶음이 비면 아무것도 그리지 않는다. */
  readonly guestPromotion?: StudioVirtualSpaceGuestPromotionView;
}

function todayText(nowMs: number): string {
  const date = new Date(nowMs + 9 * 3_600_000);
  return date.toISOString().slice(0, 10);
}

export function StudioVirtualSpaceSpaceBookingPanel({
  spaces,
  nowMs,
  bookings: controlledBookings,
  waitlist: controlledWaitlist,
  onBookingsChange,
  onWaitlistChange,
  guestPromotion,
}: StudioVirtualSpaceSpaceBookingPanelProps) {
  const bt = useBilingual("StudioVirtualSpaceSpaceBookingPanel");
  const [now] = useState(() => nowMs ?? Date.now());
  const [internalBookings, setInternalBookings] = useState<readonly StudioSpaceBooking[]>([]);
  const [internalWaitlist, setInternalWaitlist] = useState<readonly StudioSpaceWaitlistEntry[]>([]);
  // 제어 모드에서는 바깥 상태를 읽고 변경만 콜백으로 알린다(입장 게이트와 공유).
  const bookings = controlledBookings ?? internalBookings;
  const waitlist = controlledWaitlist ?? internalWaitlist;
  const setBookings = (next: readonly StudioSpaceBooking[]) => {
    onBookingsChange?.(next);
    if (controlledBookings === undefined) setInternalBookings(next);
  };
  const setWaitlist = (next: readonly StudioSpaceWaitlistEntry[]) => {
    onWaitlistChange?.(next);
    if (controlledWaitlist === undefined) setInternalWaitlist(next);
  };
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? "");
  const [date, setDate] = useState(() => todayText(now));
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [roster, setRoster] = useState("");
  const [note, setNote] = useState("");
  const [recurring, setRecurring] = useState<"none" | "daily" | "weekly">("none");
  const [occurrences, setOccurrences] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dayOffset, setDayOffset] = useState(0);

  // 거절 코드 원문을 그대로 보여 주지 않고 예약자가 고칠 수 있는 말로 바꾼다.
  const reasonText = (code: StudioSpaceBookingRejection["code"]): string => {
    switch (code) {
      case "missing-booker": return bt("예약자 이름을 한 명 이상 입력해 주세요.", "Enter at least one booker name.");
      case "past-start": return bt("이미 지난 시간에는 예약할 수 없어요.", "That start time has already passed.");
      case "invalid-range": return bt("종료 시간이 시작 시간보다 빠르거나 같아요.", "The end time must be after the start time.");
      case "over-capacity": return bt("예약 인원이 스페이스 정원을 넘어요.", "The party is larger than the space capacity.");
      case "invalid-capacity": return bt("인원 입력이 올바르지 않아요.", "Check the capacity value.");
      case "conflict": return bt("겹치는 예약이 있어요.", "There's a conflicting booking.");
      case "duplicate-id": return bt("같은 예약이 이미 있어요.", "That booking already exists.");
      case "already-cancelled": return bt("이미 취소된 예약이에요.", "That booking is already cancelled.");
      case "not-found": return bt("예약을 찾을 수 없어요.", "That booking could not be found.");
      default: return bt("예약 정보를 확인해 주세요.", "Check the booking details.");
    }
  };

  const space = spaces.find((entry) => entry.id === spaceId) ?? spaces[0] ?? null;
  const idSeed = useMemo(() => Math.floor(now % 1_000_000), [now]);

  const dayStart = useMemo(() => {
    const base = kstWallToEpochMs(date, "00:00") ?? now;
    return base + dayOffset * 24 * 3_600_000;
  }, [date, dayOffset, now]);
  const dayBookings = useMemo(() => spaceBookingsForDay(bookings, dayStart), [bookings, dayStart]);
  const liveNow = space ? checkSpaceBookingAt(bookings, space.id, now) : null;

  const buildInput = (): StudioSpaceBookingInput | null => {
    if (!space) return null;
    const startsAt = kstWallToEpochMs(date, startTime);
    const endsAt = kstWallToEpochMs(date, endTime);
    if (startsAt === null || endsAt === null) return null;
    return {
      spaceId: space.id,
      spaceName: space.name,
      capacity: space.capacity,
      equipmentTags: space.equipmentTags,
      startsAt,
      endsAt,
      bookerNames: parseSpaceBookerRoster(roster),
      note,
    };
  };

  const handleBook = () => {
    setError(null);
    setNotice(null);
    const bookingInput = buildInput();
    if (!bookingInput) {
      setError(bt("날짜·시간 형식을 확인해 주세요.", "Check the date and time format."));
      return;
    }
    if (recurring === "none") {
      const created = createSpaceBooking(bookingInput, now, `sb-${idSeed}-${bookings.length}`);
      if (!created.ok) {
        setError(`${bt("예약을 만들 수 없어요.", "Couldn't create the booking.")} ${reasonText(created.reason.code)}`);
        return;
      }
      const added = addSpaceBooking(bookings, created.booking);
      if (added.ok) {
        setBookings(added.bookings);
        setNotice(bt("예약했어요.", "Booked."));
      } else if (added.reason.code === "conflict") {
        setError(bt("겹치는 예약이 있어요. 대기열에 등록할 수 있어요.", "There's a conflicting booking. You can join the waitlist."));
      } else {
        setError(`${bt("예약을 만들 수 없어요.", "Couldn't create the booking.")} ${reasonText(added.reason.code)}`);
      }
      return;
    }
    const expansion = expandSpaceRecurringBooking(
      bookingInput,
      { frequency: recurring, occurrences: Math.min(occurrences, STUDIO_SPACE_BOOKING_MAX_RECURRENCE) },
      { nowMs: now, newId: (index) => `sb-${idSeed}-r${index}` },
    );
    let next = bookings;
    let addedCount = 0;
    let failedCount = 0;
    for (const booking of expansion.bookings) {
      const added = addSpaceBooking(next, booking);
      if (added.ok) {
        next = added.bookings;
        addedCount += 1;
      } else {
        failedCount += 1;
      }
    }
    setBookings(next);
    if (addedCount > 0) {
      setNotice(bt(`${addedCount}개 회차를 예약했어요.`, `Booked ${addedCount} occurrence(s).`));
    }
    // 확장 단계에서 빠진 회차와 겹쳐서 못 넣은 회차를 합쳐서 알린다.
    const skippedTotal = expansion.skipped.length + failedCount;
    if (skippedTotal > 0) {
      setError(bt(`${skippedTotal}개 회차는 겹침이나 시간 조건 때문에 건너뛰었어요.`, `${skippedTotal} occurrence(s) were skipped because of conflicts or timing.`));
    }
  };

  const handleWaitlist = () => {
    setError(null);
    setNotice(null);
    const bookingInput = buildInput();
    if (!bookingInput) {
      setError(bt("날짜·시간 형식을 확인해 주세요.", "Check the date and time format."));
      return;
    }
    const result = addSpaceWaitlistEntry(waitlist, bookingInput, { nowMs: now, id: `sw-${idSeed}-${waitlist.length}` });
    if (result.ok) {
      setWaitlist(result.waitlist);
      setNotice(bt("대기열에 등록했어요.", "Added to the waitlist."));
    } else {
      setError(`${bt("대기열에 올릴 수 없어요.", "Couldn't join the waitlist.")} ${reasonText(result.reason.code)}`);
    }
  };

  const handleCancel = (bookingId: string) => {
    setError(null);
    setNotice(null);
    const cancelled = cancelSpaceBooking(bookings, bookingId);
    if (!cancelled.ok) return;
    const booking = bookings.find((entry) => entry.id === bookingId);
    const promoted = booking ? promoteSpaceWaitlist(waitlist, cancelled.bookings, booking.spaceId) : null;
    if (promoted?.promoted) {
      const added = addSpaceBooking(cancelled.bookings, promoted.promoted);
      if (added.ok) {
        // 승격된 예약을 실제 예약 목록에 넣어야 대기 1순위가 사라지지 않는다.
        setBookings(added.bookings);
        setWaitlist(promoted.waitlist);
        setNotice(bt("예약을 취소했어요. 대기 중이던 예약이 대신 확정됐어요.", "Booking cancelled. The waitlisted booking took its place."));
        return;
      }
      // 승격 예약이 검증에서 걸리면 대기열을 그대로 둬서 어느 쪽도 잃지 않는다.
    }
    setBookings(cancelled.bookings);
    setNotice(bt("예약을 취소했어요.", "Booking cancelled."));
  };

  const rejectReasonText = (code: StudioPromotionRejectCode | undefined): string => {
    switch (code) {
      case "slot-taken": return bt("이미 예약됨", "already booked");
      case "already-processed": return bt("이미 처리된 예약이에요", "already processed");
      case "past-start": return bt("시간이 지나 승격할 수 없어요", "the time has passed");
      default: return bt("승격할 수 없어요", "could not be moved");
    }
  };

  const guestBundle = guestPromotion?.bundle;
  const guestItemCount = (guestBundle?.bookings.length ?? 0) + (guestBundle?.waitlist.length ?? 0);
  const promotionSummary = guestPromotion?.summary ?? null;

  return (
    <section aria-label={bt("스페이스 예약", "Space booking")}>
      <h2>{bt("스페이스 예약", "Space booking")}</h2>
      <p><small>{bt("콘티룸·녹음부스 등 스페이스를 시간대로 예약해요. 모든 시간은 한국 시간(KST) 기준이에요.", "Reserve spaces like the conti room or recording booth by time slot. All times are KST.")}</small></p>

      {guestPromotion && guestItemCount > 0 ? (
        <fieldset data-testid="guest-promotion">
          <legend>{bt("로그인 전에 만든 예약", "Bookings made before sign-in")}</legend>
          <p>{bt(
            `이 기기에만 있던 예약 ${guestItemCount}건이 있어요. 계정 예약으로 가져오면 어느 기기에서든 볼 수 있어요.`,
            `You have ${guestItemCount} booking(s) stored only on this device. Move them to your account to see them on any device.`,
          )}</p>
          <ul>
            {guestBundle?.bookings.map((booking) => (
              <li key={booking.id}>
                {booking.spaceName} · {formatKstDate(booking.startsAt)} {formatKstTime(booking.startsAt)}–{formatKstTime(booking.endsAt)} · {booking.bookerNames.join(", ")}
              </li>
            ))}
            {guestBundle?.waitlist.map((entry) => (
              <li key={entry.id}>
                {entry.spaceName} · {formatKstDate(entry.startsAt)} {formatKstTime(entry.startsAt)}–{formatKstTime(entry.endsAt)} · {entry.bookerNames.join(", ")} ({bt("대기 신청", "waitlist")})
              </li>
            ))}
          </ul>
          <div>
            <button type="button" onClick={guestPromotion.onPromote} disabled={guestPromotion.busy}>
              {guestPromotion.busy ? bt("가져오는 중…", "Moving…") : bt("계정으로 가져오기", "Move to my account")}
            </button>
            <button type="button" onClick={guestPromotion.onDismiss} disabled={guestPromotion.busy}>
              {bt("버리기", "Discard")}
            </button>
          </div>
          <p><small>{bt("버리면 위 예약은 이 기기에서도 사라져요.", "Discarding removes these bookings from this device too.")}</small></p>
        </fieldset>
      ) : null}

      {guestPromotion && promotionSummary ? (
        <div data-testid="guest-promotion-result" role="status">
          <p>{bt(
            `가져오기 결과: 승격 ${promotionSummary.promotedCount}건 · 충돌 ${promotionSummary.rejected.length}건${promotionSummary.deferredCount > 0 ? ` · 보류 ${promotionSummary.deferredCount}건` : ""}`,
            `Move result: ${promotionSummary.promotedCount} moved · ${promotionSummary.rejected.length} conflict(s)${promotionSummary.deferredCount > 0 ? ` · ${promotionSummary.deferredCount} kept for later` : ""}`,
          )}</p>
          {promotionSummary.rejected.length > 0 ? (
            <ul>
              {promotionSummary.rejected.map((outcome) => (
                <li key={outcome.id}>
                  {bt("승격 실패", "Could not move")} — {outcome.spaceName ?? ""}{" "}
                  {outcome.startsAt !== undefined ? `${formatKstDate(outcome.startsAt)} ${formatKstTime(outcome.startsAt)}` : ""}{" "}
                  · {rejectReasonText(outcome.code)}. {bt("다른 시간으로 다시 예약해 보세요.", "Please pick another time.")}
                </li>
              ))}
            </ul>
          ) : null}
          {promotionSummary.deferredCount > 0 ? (
            <p>{bt("연결 문제로 일부는 지금 가져오지 못했어요. 남겨 뒀으니 다음에 다시 시도할 수 있어요.", "Some bookings could not be moved due to a connection problem. They are kept so you can retry later.")}</p>
          ) : null}
          <button type="button" onClick={guestPromotion.onClearSummary}>{bt("확인", "OK")}</button>
        </div>
      ) : null}

      {liveNow ? <p role="status">{bt(`지금 "${liveNow.spaceName}" 예약이 진행 중이에요.`, `A booking for "${liveNow.spaceName}" is live now.`)}</p> : null}

      <fieldset>
        <legend>{bt("새 예약", "New booking")}</legend>
        <label>{bt("스페이스", "Space")}
          <select value={spaceId} onChange={(event) => setSpaceId(event.target.value)}>
            {spaces.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} ({bt("최대", "up to")} {entry.capacity}{bt("명", "")})</option>)}
          </select>
        </label>
        <label>{bt("날짜", "Date")}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>{bt("시작", "Start")}<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
        <label>{bt("종료", "End")}<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
        <label>{bt("예약자 (쉼표·줄바꿈 구분)", "Bookers (comma/newline separated)")}
          <textarea value={roster} onChange={(event) => setRoster(event.target.value)} rows={2} />
        </label>
        <label>{bt("메모", "Note")}<input type="text" value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <label>{bt("반복", "Repeat")}
          <select value={recurring} onChange={(event) => setRecurring(event.target.value as "none" | "daily" | "weekly")}>
            <option value="none">{bt("반복 없음", "No repeat")}</option>
            <option value="daily">{bt("매일", "Daily")}</option>
            <option value="weekly">{bt("매주", "Weekly")}</option>
          </select>
        </label>
        {recurring !== "none" ? <label>{bt("횟수", "Occurrences")}
          <input type="number" min={1} max={STUDIO_SPACE_BOOKING_MAX_RECURRENCE} value={occurrences} onChange={(event) => setOccurrences(Number(event.target.value))} />
        </label> : null}
        <div>
          <button type="button" onClick={handleBook}>{bt("예약하기", "Book")}</button>
          <button type="button" onClick={handleWaitlist}>{bt("대기열 등록", "Join waitlist")}</button>
        </div>
        {error ? <p role="alert">{error}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
      </fieldset>

      <div>
        <button type="button" onClick={() => setDayOffset((value) => value - 1)}>{bt("이전 날", "Previous day")}</button>
        <button type="button" onClick={() => { setDate(todayText(now)); setDayOffset(0); }}>{bt("오늘", "Today")}</button>
        <button type="button" onClick={() => setDayOffset((value) => value + 1)}>{bt("다음 날", "Next day")}</button>
      </div>
      <h3>{bt("하루 일정", "Day schedule")}</h3>
      {dayBookings.length === 0
        ? <p>{bt("예약이 없어요.", "No bookings.")}</p>
        : <ul>{dayBookings.map((booking) => (
          <li key={booking.id}>
            {booking.spaceName} · {new Date(booking.startsAt).toLocaleTimeString()}–{new Date(booking.endsAt).toLocaleTimeString()} · {booking.bookerNames.join(", ")}
            <button type="button" onClick={() => handleCancel(booking.id)}>{bt("취소", "Cancel")}</button>
          </li>
        ))}</ul>}
      {waitlist.length > 0 ? <>
        <h3>{bt("대기열", "Waitlist")}</h3>
        <ul>{waitlist.map((entry) => <li key={entry.id}>{entry.spaceName} · {entry.bookerNames.join(", ")}</li>)}</ul>
      </> : null}
    </section>
  );
}
